// =============================================================
// Acme Partner Agent server -- genuine third-party OAuth client
//
// Acme is a real standalone public client: Authorization Code +
// PKCE (RFC 7636), no client secret, nothing confidential. There
// is one shared in-memory identity for the whole demo session (no
// session store, no multi-user support -- this is a lab tool, not
// production code). Once connected, Acme proxies tool calls to the
// Nexus MCP server using its own user-delegated access token --
// there is no RFC 8693 token-exchange step anywhere in this path.
// =============================================================

import express from "express";
import cors from "cors";
import { getClientMetadata } from "./cimd.js";
import { generatePkcePair } from "./pkce.js";
import { decodeUnverified } from "../platform/jwt.js";
import { wrongPortFallback } from "../utils/wrongPortPage.js";

const app = express();
// The SPA (a different origin/port) fetches /status directly from the
// browser to drive the "Connect Acme" prompt in ToolTester.jsx.
app.use(cors());
app.use(express.json());

const SCOPE = "mcp:docs:search mcp:docs:read mcp:crm:log mcp:docs:share mcp:github:read";

// Single shared in-memory PKCE attempt (set on /login, consumed on /callback).
let pendingAuth = null; // { verifier, state }

// Single shared in-memory connected identity.
let acmeToken = null; // { accessToken, sub, scope, expiresAt }

function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host  = req.headers["x-forwarded-host"]  || req.headers.host;
  return `${proto}://${host}`;
}

function isConnected() {
  return !!acmeToken && Date.now() < acmeToken.expiresAt;
}

// CIMD -- Acme's own self-published client metadata document.
app.get("/.well-known/client-metadata", (req, res) => {
  res.json(getClientMetadata(req));
});

// Kick off Authorization Code + PKCE against the AS.
app.get("/login", (req, res) => {
  const { verifier, challenge, state } = generatePkcePair();
  pendingAuth = { verifier, state };

  const redirectUri = `${getOrigin(req)}/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.AUTH0_ACME_CLIENT_ID,
    redirect_uri: redirectUri,
    audience: process.env.AUTH0_TOOL_AUDIENCE,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  res.redirect(`https://${process.env.AUTH0_DOMAIN}/authorize?${params.toString()}`);
});

// Redeem the authorization code -- PKCE verifier replaces the client secret.
app.get("/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!pendingAuth || state !== pendingAuth.state) {
    return res.status(400).send("Invalid or expired state parameter.");
  }

  const { verifier } = pendingAuth;
  const redirectUri = `${getOrigin(req)}/callback`;

  const response = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: process.env.AUTH0_ACME_CLIENT_ID,
      code_verifier: verifier,
      code,
      redirect_uri: redirectUri,
    }),
  });

  pendingAuth = null;

  if (!response.ok) {
    const errorBody = await response.text();
    return res.status(response.status).send(`Token exchange failed: ${errorBody}`);
  }

  const data = await response.json();
  const payload = decodeUnverified(data.access_token) || {};

  acmeToken = {
    accessToken: data.access_token,
    sub: payload.sub,
    scope: payload.scope || data.scope,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  console.log(`[Acme] Connected as sub=${acmeToken.sub} scope=${acmeToken.scope}`);
  res.send("<h2>Acme connected. You can close this tab.</h2>");
});

// Connection status for the demo UI.
app.get("/status", (_req, res) => {
  res.json({
    connected: isConnected(),
    sub: isConnected() ? acmeToken.sub : null,
    scope: isConnected() ? acmeToken.scope : null,
  });
});

// Proxy a tool call to the Nexus MCP server using Acme's own
// user-delegated token -- no OBO/token-exchange step on this path.
app.post("/api/call-tool", async (req, res) => {
  const { name, arguments: args } = req.body;

  if (!isConnected()) {
    return res.status(400).json({ error: "Acme is not connected. Visit /login to connect as Acme first." });
  }

  const mcpServerUrl = `http://localhost:${process.env.MCP_SERVER_PORT || 3001}`;
  const response = await fetch(`${mcpServerUrl}/mcp/tools/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${acmeToken.accessToken}`,
      "X-User-Token": acmeToken.accessToken,
    },
    body: JSON.stringify({ name, arguments: args }),
  });

  if (response.status === 403) {
    const error = await response.json();
    return res.status(403).json({ error: error.error, required: error.required });
  }

  if (!response.ok) {
    const errorText = await response.text();
    return res.status(response.status).json({ error: errorText || response.statusText });
  }

  const data = await response.json();
  res.json({ success: true, result: JSON.parse(data.content[0].text) });
});

// Anyone hitting this port directly in a browser (e.g. a mis-clicked
// Codespaces port-forward toast) gets a themed notice instead of a bare
// 404 -- the real app is Vite on 5173. Placed after the real OAuth/API
// routes above so it never shadows the actual Acme login/callback flow.
app.get(
  "*",
  wrongPortFallback(
    "Acme Partner Agent server",
    "This is the third-party agent's own standalone OAuth client and tool-call proxy."
  )
);

export function startAcmeServer() {
  const port = process.env.ACME_SERVER_PORT || 3002;
  app.listen(port, () => {
    console.log(`Acme Agent server running on http://localhost:${port}`);
  });
}

export default app;
