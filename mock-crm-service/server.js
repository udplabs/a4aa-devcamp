// =============================================================
// RetailZero Mock CRM Service
//
// Acts as both a custom OAuth2 authorization server (so Auth0 can
// register it as a social connection for Token Vault) and the
// downstream mock API (CRM activity log + Google Docs).
//
// OAuth2 flow (used by Auth0 Token Vault):
//   GET  /authorize  -- auto-approves; captures user email from
//                       login_hint; issues a code
//   POST /token      -- exchanges code for a signed JWT carrying
//                       the user's email claim
//
// API endpoints (called by the MCP server after token exchange):
//   POST /crm/activities          -- log deal activity, attributed
//                                    to the rep from the JWT email
//   GET  /crm/activities/:account -- view logged activities
//   POST /google/docs             -- create a mock Google Doc
//   GET  /api/health
//   GET  /.well-known/oauth-authorization-server
// =============================================================

import "dotenv/config";
import express from "express";
import { SignJWT, jwtVerify, createSecretKey } from "jose";
import crypto from "node:crypto";

const PORT        = parseInt(process.env.PORT || "3000");
const BASE_URL    = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const JWT_SECRET  = process.env.JWT_SECRET;
const OAUTH_CLIENT_ID     = process.env.OAUTH_CLIENT_ID     || "retailzero-crm";
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;

if (!JWT_SECRET)         throw new Error("JWT_SECRET env var is required");
if (!OAUTH_CLIENT_SECRET) throw new Error("OAUTH_CLIENT_SECRET env var is required");

const secretKey = createSecretKey(Buffer.from(JWT_SECRET, "utf-8"));

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory stores (acceptable for a demo service)
const pendingCodes = new Map(); // code → { email, redirectUri, expiresAt }
const crmActivities = new Map(); // accountId → activity[]

// ---- OAuth2 authorization server ----------------------------------

app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer:                BASE_URL,
    authorization_endpoint: `${BASE_URL}/authorize`,
    token_endpoint:         `${BASE_URL}/token`,
    scopes_supported:       ["crm:activity:write"],
    response_types_supported: ["code"],
    grant_types_supported:  ["authorization_code"],
  });
});

// Auto-approve: immediately redirect back with a code.
// Auth0 passes the linked user's email as login_hint during Token Vault
// connection linking, which is how the token carries the rep's identity.
app.get("/authorize", (req, res) => {
  const { redirect_uri, state, login_hint } = req.query;

  if (!redirect_uri) {
    return res.status(400).send("redirect_uri is required");
  }

  // Extract email from login_hint (Auth0 sends it as a URL-encoded JSON
  // object: {"email":"alice@...","name":"Alice"} or as a plain email string).
  let email = "unknown@retailzero.demo";
  if (login_hint) {
    try {
      const hint = JSON.parse(decodeURIComponent(login_hint));
      email = hint.email || hint.login || login_hint;
    } catch {
      email = login_hint;
    }
  }

  const code = crypto.randomUUID();
  pendingCodes.set(code, {
    email,
    redirectUri: redirect_uri,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  console.log(`[OAuth2] Authorized ${email} → code issued`);
  res.redirect(redirectUrl.toString());
});

app.post("/token", async (req, res) => {
  const { grant_type, code, client_id, client_secret } = req.body;

  if (grant_type !== "authorization_code") {
    return res.status(400).json({ error: "unsupported_grant_type" });
  }

  if (client_id !== OAUTH_CLIENT_ID || client_secret !== OAUTH_CLIENT_SECRET) {
    return res.status(401).json({ error: "invalid_client" });
  }

  const pending = pendingCodes.get(code);
  if (!pending || Date.now() > pending.expiresAt) {
    pendingCodes.delete(code);
    return res.status(400).json({ error: "invalid_grant" });
  }
  pendingCodes.delete(code);

  const { email } = pending;
  const expiresIn = 3600;

  const accessToken = await new SignJWT({ email, sub: `crm|${email}` })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(BASE_URL)
    .setAudience(BASE_URL)
    .setExpirationTime(`${expiresIn}s`)
    .sign(secretKey);

  console.log(`[OAuth2] Token issued for ${email}`);
  res.json({ access_token: accessToken, token_type: "bearer", expires_in: expiresIn });
});

// ---- JWT validation middleware ------------------------------------

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

// ---- CRM API ------------------------------------------------------

app.post("/crm/activities", requireJwt, (req, res) => {
  const { accountId, quoteId, summary, docUrl } = req.body;
  if (!accountId || !summary) {
    return res.status(400).json({ error: "accountId and summary are required" });
  }

  const activityId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const entry = {
    activityId,
    accountId,
    quoteId:    quoteId || null,
    summary,
    docUrl:     docUrl  || null,
    logged_by:  req.tokenEmail,
    created_at: new Date().toISOString(),
  };

  if (!crmActivities.has(accountId)) crmActivities.set(accountId, []);
  crmActivities.get(accountId).push(entry);

  const crmUrl = `https://crm.retailzero.demo/activities/${activityId}`;
  console.log(`[CRM] Activity logged for ${accountId} by ${req.tokenEmail}: "${summary.slice(0, 60)}"`);
  res.json({ activityId, crmUrl, logged_by: req.tokenEmail, created_at: entry.created_at });
});

app.get("/crm/activities/:accountId", requireJwt, (req, res) => {
  res.json(crmActivities.get(req.params.accountId) || []);
});

// ---- Google Docs mock ---------------------------------------------

app.post("/google/docs", requireJwt, (req, res) => {
  const { title, body } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });

  const documentId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const url = `https://docs.google.com/document/d/${documentId}/edit`;
  console.log(`[Google Docs] Created "${title}" for ${req.tokenEmail} → ${documentId}`);
  res.json({ documentId, title, url });
});

// ---- Health -------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "RetailZero Mock CRM Service" });
});

// ---- Start --------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[Mock CRM Service] Running on ${BASE_URL}`);
  console.log(`  OAuth2: ${BASE_URL}/authorize  ${BASE_URL}/token`);
  console.log(`  CRM:    POST/GET ${BASE_URL}/crm/activities`);
  console.log(`  Docs:   POST ${BASE_URL}/google/docs`);
});
