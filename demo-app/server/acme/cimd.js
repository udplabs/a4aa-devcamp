// =============================================================
// Client ID Metadata Document (CIMD) -- third-party agent discovery
//
// In true CIMD (per the MCP authorization spec), a client's
// client_id IS the URL of this metadata document. The authorization
// server fetches the URL at registration time to learn the client's
// name, description, and allowed scopes.
//
// Acme Partner Agent is a genuine standalone third party: it runs
// its own server, at its own origin, and serves its own CIMD here.
// An admin discovers this document, reviews the requested scopes,
// and -- in the Auth0 Dashboard -- creates a public, native-type
// Auth0 application for Acme (no client secret; "first party"
// toggled OFF so a real consent screen is shown to the user), then
// links an Agent as Principal record ("Acme Partner Agent (DevCamp)")
// to that public client. From there, Acme completes a standard
// Authorization Code + PKCE flow (RFC 7636) directly with the user
// to obtain its own delegated access token -- see ./app.js. There
// is no M2M client, no shared secret, and no RFC 8693 token-exchange
// step anywhere in this path.
//
// Contrast with the first-party Nexus agent (docagent-mcp-obo),
// which legitimately uses On-Behalf-Of token exchange because it is
// acting for a backend the operator owns. A third party should never
// be minted an M2M/OBO exchanger just to get access -- that forces a
// confidential-client pattern onto a public client, equivalent to
// handing a desktop app a client secret.
//
// Contrast with Dynamic Client Registration (DCR, RFC 7591):
//   - DCR mints a new ephemeral client_id on every install.
//   - Audit logs become meaningless (different UUID each time).
//   - Admin consent cannot be pre-approved.
// =============================================================

export function getClientMetadata(req) {
  // Derive the canonical URL from the request so the client_id is
  // always self-referential regardless of the host (Codespace, local,
  // or production). x-forwarded-* headers are set by Codespace's
  // reverse proxy; fall back to the direct host for local runs.
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host  = req.headers["x-forwarded-host"]  || req.headers.host;
  const origin = `${proto}://${host}`;
  const clientId = `${origin}/.well-known/client-metadata`;

  return {
    client_id:   clientId,
    client_name: "Acme Partner Agent",
    grant_types: ["authorization_code"],
    redirect_uris: [`${origin}/callback`],
    token_endpoint_auth_method: "none",
    scope: "mcp:docs:search mcp:docs:read mcp:crm:log mcp:docs:share mcp:github:read",
  };
}
