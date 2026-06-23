// =============================================================
// Nexus Mock CRM Service
//
// Acts as a custom OAuth2 authorization server so Auth0 can
// register it as a social connection for Token Vault, and as
// the downstream CRM API the MCP server calls after token
// exchange.
//
// Auth codes are stateless signed JWTs — no in-memory Map,
// no external state store. Works correctly on Vercel serverless.
//
// OAuth2 endpoints (registered in Auth0 as a custom connection):
//   GET  /authorize  -- auto-approves; encodes grant state into
//                       a signed code JWT; uses login_hint for
//                       the user's email
//   POST /token      -- verifies the code JWT; issues a CRM
//                       access token carrying the user's email
//
// CRM API (called by the MCP server with the vaulted token):
//   POST /crm/activities  -- log a document activity event
//   GET  /crm/activities  -- return the in-session activity log
//   GET  /crm/health      -- health check
//
// Discovery:
//   GET  /.well-known/oauth-authorization-server
// =============================================================

import "dotenv/config";
import express from "express";
import { SignJWT, jwtVerify, createSecretKey } from "jose";
import crypto from "node:crypto";

const PORT               = parseInt(process.env.PORT || "3000");
const BASE_URL           = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const JWT_SECRET         = process.env.JWT_SECRET;
const OAUTH_CLIENT_ID    = process.env.OAUTH_CLIENT_ID    || "nexus-crm";
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;

if (!JWT_SECRET)          throw new Error("JWT_SECRET env var is required");
if (!OAUTH_CLIENT_SECRET) throw new Error("OAUTH_CLIENT_SECRET env var is required");

const secretKey = createSecretKey(Buffer.from(JWT_SECRET, "utf-8"));

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-session activity log. Vercel function logs capture every
// console.log, so activities are always visible there. The GET
// endpoint returns what's accumulated in the current warm instance.
const activities = [];

// ---- OAuth2 discovery -------------------------------------------

app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer:                   BASE_URL,
    authorization_endpoint:   `${BASE_URL}/authorize`,
    token_endpoint:           `${BASE_URL}/token`,
    scopes_supported:         ["crm:activities:write"],
    response_types_supported: ["code"],
    grant_types_supported:    ["authorization_code"],
  });
});

// ---- OAuth2: /authorize -----------------------------------------
//
// Auto-approves and encodes the grant state directly into a signed
// JWT used as the auth code. No Map, no external state needed.
// Auth0 passes the linked user's email via login_hint during the
// Token Vault connection-linking flow.

app.get("/authorize", async (req, res) => {
  const { redirect_uri, state, login_hint, scope } = req.query;

  if (!redirect_uri) {
    return res.status(400).send("redirect_uri is required");
  }

  let email = "unknown@docagent.demo";
  if (login_hint) {
    try {
      const hint = JSON.parse(decodeURIComponent(login_hint));
      email = hint.email || hint.login || login_hint;
    } catch {
      email = login_hint;
    }
  }

  const code = await new SignJWT({
    email,
    redirect_uri,
    scope: scope || "crm:activities:write",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti(crypto.randomUUID())
    .sign(secretKey);

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  console.log(`[OAuth2] Authorized ${email}`);
  res.redirect(redirectUrl.toString());
});

// ---- OAuth2: /token ---------------------------------------------
//
// Verifies the signed code JWT and issues a CRM access token.
// The access token carries the user's email so the CRM API can
// attribute every activity to the right employee.

app.post("/token", async (req, res) => {
  const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;

  if (grant_type !== "authorization_code") {
    return res.status(400).json({ error: "unsupported_grant_type" });
  }

  if (client_id !== OAUTH_CLIENT_ID || client_secret !== OAUTH_CLIENT_SECRET) {
    return res.status(401).json({ error: "invalid_client" });
  }

  let grant;
  try {
    const { payload } = await jwtVerify(code, secretKey);
    grant = payload;
  } catch {
    return res.status(400).json({ error: "invalid_grant" });
  }

  if (redirect_uri && grant.redirect_uri !== redirect_uri) {
    return res.status(400).json({ error: "redirect_uri_mismatch" });
  }

  const expiresIn = 3600;
  const accessToken = await new SignJWT({
    sub:   `crm|${grant.email}`,
    email: grant.email,
    scope: grant.scope,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(BASE_URL)
    .setAudience(BASE_URL)
    .setExpirationTime(`${expiresIn}s`)
    .sign(secretKey);

  console.log(`[OAuth2] Token issued for ${grant.email}`);
  res.json({
    access_token: accessToken,
    token_type:   "bearer",
    expires_in:   expiresIn,
    scope:        grant.scope,
  });
});

// ---- JWT validation middleware -----------------------------------

async function requireJwt(req, res, next) {
  const raw = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!raw) return res.status(401).json({ error: "Missing authorization header" });

  try {
    const { payload } = await jwtVerify(raw, secretKey, {
      issuer:   BASE_URL,
      audience: BASE_URL,
    });
    req.tokenEmail = payload.email || payload.sub || "unknown";
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token", detail: err.message });
  }
}

// ---- CRM API: POST /crm/activities ------------------------------
//
// The MCP server calls this after exchanging for a vaulted token.
// userId in the body is the employee's Auth0 sub, passed through
// from the OBO-scoped MCP token so every record ties to a human.

app.post("/crm/activities", requireJwt, (req, res) => {
  const { action, documentId, documentTitle, notes, userId } = req.body;

  if (!action || !documentId) {
    return res.status(400).json({ error: "action and documentId are required" });
  }

  const record = {
    id:            `act_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    action,
    documentId,
    documentTitle: documentTitle || documentId,
    notes:         notes || "",
    userId:        userId || req.tokenEmail,
    loggedBy:      req.tokenEmail,
    createdAt:     new Date().toISOString(),
  };

  activities.unshift(record);
  if (activities.length > 200) activities.length = 200;

  console.log(`[CRM] ${action} on ${documentId} by ${record.userId}`);
  res.json({ success: true, activity: record });
});

// ---- CRM API: GET /crm/activities --------------------------------

app.get("/crm/activities", requireJwt, (_req, res) => {
  res.json({ activities });
});

// ---- Health ------------------------------------------------------

app.get("/crm/health", (_req, res) => {
  res.json({ status: "ok", service: "Nexus Mock CRM", activityCount: activities.length });
});

// ---- Start (local dev only) --------------------------------------
//
// Vercel handles HTTP binding in production. Only call app.listen()
// when running locally.

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[Mock CRM] Running on ${BASE_URL}`);
    console.log(`  OAuth2:  GET  ${BASE_URL}/authorize`);
    console.log(`  OAuth2:  POST ${BASE_URL}/token`);
    console.log(`  CRM API: POST ${BASE_URL}/crm/activities`);
  });
}

export default app;
