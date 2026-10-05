// =============================================================
// Acme Partner Agent server -- a genuine third-party MCP client
//
// Acme behaves the way any spec-compliant third-party MCP client does:
//
//   1. Discover. Fetch the MCP server's Protected Resource Metadata
//      (RFC 9728) to learn its `resource` identifier and authorization
//      server, then fetch the authorization server's OWN metadata from
//      Auth0 and confirm it supports PKCE S256.
//   2. Authorize. Authorization Code + PKCE (RFC 7636) as a public
//      client, with client_id = Acme's CIMD URL and the RFC 8707
//      `resource` parameter naming the MCP server. Auth0 shows a consent
//      screen because Acme is a third-party client.
//   3. Call tools with that token -- and nothing else. No token
//      exchange, no client secret, no extra headers.
//
// The token Acme receives:
//   sub       = the employee who consented
//   client_id = Acme's CIMD URL
//   act.sub   = Acme's agent id (once the admin links the CIMD client to
//               the "Acme Partner Agent (DevCamp)" Agent record)
//   scope     = only what the admin's grant allows, not what Acme asked for
//
// One shared in-memory identity for the whole demo (no session store,
// no multi-user support) -- this is a lab tool, not production code.
// =============================================================

import express from "express";
import cors from "cors";
import {
  getClientMetadata,
  acmeClientId,
  acmeRedirectUri,
  ACME_REQUESTED_SCOPE,
} from "./cimd.js";
import { generatePkcePair } from "./pkce.js";
import { decodeUnverified } from "../platform/jwt.js";
import { wrongPortFallback } from "../utils/wrongPortPage.js";
import { acmePort, mcpPort } from "../utils/publicUrl.js";

const app = express();
// The SPA (a different origin/port) fetches /status directly from the
// browser to drive the "Connect Acme" prompt in ToolTester.jsx.
app.use(cors());
app.use(express.json());

// Acme reaches the MCP server the way any client would: by URL. In this
// lab it's co-located, so the default is the local port.
const MCP_SERVER_URL =
  process.env.ACME_MCP_SERVER_URL || `http://localhost:${mcpPort()}`;

// In-flight authorization requests, keyed by `state`.
const pendingAuth = new Map(); // state -> { verifier, issuer, tokenEndpoint, resource, clientId, redirectUri }

// Single shared in-memory connected identity.
let acmeToken = null; // { accessToken, sub, scope, clientId, act, expiresAt }

function isConnected() {
  return !!acmeToken && Date.now() < acmeToken.expiresAt;
}

// ---- Discovery ----------------------------------------------------

async function fetchJson(url) {
  const r = await fetch(url, { redirect: "error" });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}

// RFC 9728 -> RFC 8414 / OIDC discovery, as the MCP spec prescribes.
async function discover() {
  const prm = await fetchJson(`${MCP_SERVER_URL}/.well-known/oauth-protected-resource`);
  const resource = prm.resource;
  const issuer = prm.authorization_servers?.[0];
  if (!resource || !issuer) {
    throw new Error("MCP server's Protected Resource Metadata is missing resource or authorization_servers");
  }

  const base = issuer.replace(/\/$/, "");
  let as;
  try {
    as = await fetchJson(`${base}/.well-known/oauth-authorization-server`);
  } catch {
    as = await fetchJson(`${base}/.well-known/openid-configuration`);
  }
  // MCP clients MUST refuse to proceed without S256 PKCE support.
  if (!as.code_challenge_methods_supported?.includes("S256")) {
    throw new Error("Authorization server does not advertise PKCE S256 support; refusing to continue");
  }
  if (as.client_id_metadata_document_supported !== true) {
    console.warn(
      "[Acme] Authorization server does not advertise client_id_metadata_document_supported -- " +
      "turn on Client ID Metadata Document Registration in the tenant's Advanced settings."
    );
  }
  return {
    resource,
    issuer: as.issuer || issuer,
    authorizationEndpoint: as.authorization_endpoint,
    tokenEndpoint: as.token_endpoint,
  };
}

// ---- Routes -------------------------------------------------------

// CIMD -- Acme's own self-published client metadata document.
app.get("/.well-known/client-metadata", (req, res) => {
  res.json(getClientMetadata(req));
});

// Kick off Authorization Code + PKCE against the AS.
app.get("/login", async (req, res) => {
  let meta;
  try {
    meta = await discover();
  } catch (err) {
    return res.status(502).send(`Acme discovery failed: ${err.message}`);
  }

  const { verifier, challenge, state } = generatePkcePair();
  const clientId = acmeClientId(req);
  const redirectUri = acmeRedirectUri(req);
  pendingAuth.set(state, { verifier, ...meta, clientId, redirectUri });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: ACME_REQUESTED_SCOPE,
    // RFC 8707: name the MCP server the token is for. Auth0 honors this
    // when the tenant's Resource Parameter Compatibility Profile is on.
    resource: meta.resource,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  console.log(`[Acme] Authorizing as client_id=${clientId} for resource=${meta.resource}`);
  res.redirect(`${meta.authorizationEndpoint}?${params.toString()}`);
});

// Redeem the authorization code -- the PKCE verifier replaces a client secret.
app.get("/callback", async (req, res) => {
  const { code, state, iss, error, error_description } = req.query;
  const pending = state ? pendingAuth.get(state) : null;
  if (state) pendingAuth.delete(state);

  if (error) {
    return res.status(400).send(`Authorization failed: ${error} ${error_description || ""}`);
  }
  if (!pending) {
    return res.status(400).send("Invalid or expired state parameter.");
  }
  // RFC 9207 mix-up defense: the response must come from the AS we used.
  if (iss && iss.replace(/\/$/, "") !== pending.issuer.replace(/\/$/, "")) {
    return res.status(400).send(`Unexpected issuer in authorization response: ${iss}`);
  }

  const response = await fetch(pending.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: pending.clientId,
      code_verifier: pending.verifier,
      code,
      redirect_uri: pending.redirectUri,
      resource: pending.resource,
    }),
  });

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
    clientId: payload.client_id || payload.azp,
    aud: payload.aud,
    act: payload.act || null,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  console.log(
    `[Acme] Connected as sub=${acmeToken.sub} client_id=${acmeToken.clientId} act.sub=${acmeToken.act?.sub || "(none)"} scope=${acmeToken.scope}`
  );
  res.type("html").send(renderConnectedPage(acmeToken));
});

// Themed callback landing page, shown once Acme has exchanged the code
// for a token. Styled to match the rest of the lab's dark-purple theme
// (see server/utils/wrongPortPage.js) instead of a bare browser default.
function renderConnectedPage(token) {
  const scopes = (token.scope || "").split(" ").filter(Boolean);
  const scopeChips = scopes.length
    ? scopes.map((s) => `<span class="chip">${s}</span>`).join("")
    : `<span class="chip chip-empty">(none)</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Acme connected -- Nexus</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #14091E;
    font-family: "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif;
    color: #EDE6F5;
    padding: 24px;
  }
  .card {
    background: #241733;
    border: 1px solid #3A2856;
    border-radius: 16px;
    padding: 40px;
    max-width: 480px;
    text-align: center;
  }
  .badge {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, #9921FE, #BC6DFF);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    font-size: 22px;
  }
  h1 {
    font-size: 20px;
    margin: 0 0 8px;
    color: #fff;
  }
  .sub {
    font-size: 14px;
    color: #B8A8CC;
    margin: 0 0 24px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid #3A2856;
    text-align: left;
  }
  .row:first-of-type { border-top: none; }
  .label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #8C78A3;
    white-space: nowrap;
  }
  .value {
    font-size: 13px;
    color: #EDE6F5;
    text-align: right;
    word-break: break-all;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }
  .chip {
    background: #2D1D40;
    border: 1px solid #3A2856;
    color: #D6C6EC;
    font-size: 12px;
    padding: 3px 9px;
    border-radius: 999px;
  }
  .chip-empty { color: #8C78A3; }
  .hint {
    margin: 28px 0 0;
    font-size: 13px;
    color: #8C78A3;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="badge">&#10003;</div>
    <h1>Acme is connected</h1>
    <p class="sub">The third-party agent exchanged its code for a token.</p>
    <div class="row">
      <span class="label">Granted scope</span>
      <span class="value chips">${scopeChips}</span>
    </div>
    <div class="row">
      <span class="label">Subject</span>
      <span class="value">${token.sub || "(none)"}</span>
    </div>
    <div class="row">
      <span class="label">Agent (act.sub)</span>
      <span class="value">${token.act?.sub || "(none)"}</span>
    </div>
    <p class="hint">You can close this tab.</p>
  </div>
</body>
</html>`;
}

// Connection status for the demo UI and the Module 03 checkpoint.
app.get("/status", (_req, res) => {
  const connected = isConnected();
  res.json({
    connected,
    sub: connected ? acmeToken.sub : null,
    scope: connected ? acmeToken.scope : null,
    client_id: connected ? acmeToken.clientId : null,
    aud: connected ? acmeToken.aud : null,
    act: connected ? acmeToken.act : null,
  });
});

// Call a tool on the Nexus MCP server with Acme's own token.
app.post("/api/call-tool", async (req, res) => {
  const { name, arguments: args } = req.body;

  if (!isConnected()) {
    return res.status(400).json({ error: "Acme is not connected. Visit /login to connect as Acme first." });
  }

  const response = await fetch(`${MCP_SERVER_URL}/mcp/tools/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${acmeToken.accessToken}`,
    },
    body: JSON.stringify({ name, arguments: args }),
  });

  if (response.status === 403) {
    // The MCP server's WWW-Authenticate challenge names the missing scope.
    const challenge = response.headers.get("www-authenticate") || "";
    const required = /scope="([^"]+)"/.exec(challenge)?.[1];
    const error = await response.json().catch(() => ({}));
    return res.status(403).json({
      error: `insufficient_scope: Acme's grant does not include ${required || error.required}`,
      required: required || error.required,
      challenge,
    });
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
  const port = acmePort();
  app.listen(port, () => {
    console.log(`Acme Agent server running on http://localhost:${port}`);
  });
}

export default app;
