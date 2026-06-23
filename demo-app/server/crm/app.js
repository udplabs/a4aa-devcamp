// =============================================================
// CRM OAuth2 Server + Activities API -- Lab 03 (Token Vault)
//
// Auth0 points a custom OAuth2 social connection at this server.
// When Token Vault is enabled on the connection, Auth0 stores the
// resulting CRM access token per-user and the MCP server exchanges
// for it on every log_crm_activity call.
//
// OAuth2 endpoints (for the Auth0 social connection):
//   GET  /crm/oauth/authorize  -- auto-approves (demo), redirects with code
//   POST /crm/oauth/token      -- exchanges auth code for access token
//
// CRM API (called by the MCP server using the vaulted token):
//   POST /crm/activities       -- log an activity event
//   GET  /crm/activities       -- return activity log (for the demo UI)
//   GET  /crm/health           -- health check
//
// Token validation: JWTs signed with CRM_JWT_SECRET (or a fallback
// for dev). Auth0 just stores the token; the CRM validates it here.
// =============================================================

import express from "express";
import { createHmac, randomBytes } from "crypto";
import { findAvailablePort } from "../utils/port.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory stores (demo only)
const authCodes = new Map();  // code -> { clientId, userId, scope, expiresAt }
const activities = [];         // activity log

const JWT_SECRET = process.env.CRM_JWT_SECRET || "crm-demo-jwt-secret-dev";
const TOKEN_TTL = 3600; // seconds

// ---- Minimal JWT implementation (HMAC-SHA256) -------------------

function base64url(str) {
  return Buffer.from(str).toString("base64url");
}

function signToken(payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const sig = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [header, body, sig] = token.split(".");
    const expected = createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---- Middleware: validate CRM bearer token ----------------------

function requireCRMToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
  }
  const token = auth.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired CRM access token" });
  }
  req.crmUser = payload;
  next();
}

// ---- OAuth2: /crm/oauth/authorize --------------------------------

app.get("/crm/oauth/authorize", (req, res) => {
  const { client_id, redirect_uri, state, scope } = req.query;
  if (!redirect_uri) {
    return res.status(400).send("redirect_uri is required");
  }

  // Auto-approve in demo mode — simulate the user clicking "Allow"
  const code = randomBytes(16).toString("hex");
  authCodes.set(code, {
    clientId: client_id,
    userId: `crm-user-${Date.now()}`,
    scope: scope || "crm:activities:write",
    expiresAt: Date.now() + 60_000,
  });

  const redirect = new URL(redirect_uri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  console.log(`[CRM OAuth] Authorize: code=${code} client=${client_id}`);
  res.redirect(redirect.toString());
});

// ---- OAuth2: /crm/oauth/token ------------------------------------

app.post("/crm/oauth/token", (req, res) => {
  const { grant_type, code, client_id, client_secret } = req.body;

  if (grant_type !== "authorization_code") {
    return res.status(400).json({ error: "unsupported_grant_type" });
  }

  const entry = authCodes.get(code);
  if (!entry || Date.now() > entry.expiresAt) {
    return res.status(400).json({ error: "invalid_grant" });
  }
  authCodes.delete(code);

  const now = Math.floor(Date.now() / 1000);
  const accessToken = signToken({
    sub: entry.userId,
    client_id: client_id || entry.clientId,
    scope: entry.scope,
    iat: now,
    exp: now + TOKEN_TTL,
  });

  console.log(`[CRM OAuth] Token issued for client=${client_id || entry.clientId}`);
  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_TTL,
    scope: entry.scope,
  });
});

// ---- CRM API: POST /crm/activities -------------------------------

app.post("/crm/activities", requireCRMToken, (req, res) => {
  const { action, documentId, documentTitle, notes, userId } = req.body;
  if (!action || !documentId) {
    return res.status(400).json({ error: "action and documentId are required" });
  }

  const record = {
    id: `act_${Date.now()}_${randomBytes(4).toString("hex")}`,
    action,
    documentId,
    documentTitle: documentTitle || documentId,
    notes: notes || "",
    userId: userId || req.crmUser.sub,
    createdAt: new Date().toISOString(),
  };

  activities.unshift(record);
  if (activities.length > 200) activities.length = 200;

  console.log(`[CRM] Activity logged: ${action} on ${documentId} by ${record.userId}`);
  res.json({ success: true, activity: record });
});

// ---- CRM API: GET /crm/activities --------------------------------

app.get("/crm/activities", requireCRMToken, (_req, res) => {
  res.json({ activities });
});

// ---- Health ------------------------------------------------------

app.get("/crm/health", (_req, res) => {
  res.json({ status: "ok", service: "Nexus CRM", activityCount: activities.length });
});

// ---- Start -------------------------------------------------------

export async function startCRMServer() {
  const preferredPort = parseInt(process.env.CRM_PORT || "3002");
  const port = await findAvailablePort(preferredPort, "CRM Server");
  app.listen(port, () => {
    console.log(`[CRM Server] Running on http://localhost:${port}`);
    console.log(`[CRM Server] OAuth: http://localhost:${port}/crm/oauth/authorize`);
    console.log(`[CRM Server] API:   http://localhost:${port}/crm/activities`);
  });
}

export default app;
