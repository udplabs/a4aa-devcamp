// =============================================================
// Client ID Metadata Document (CIMD) -- generic MCP client discovery
//
// In true CIMD (per the MCP authorization spec), a client's
// client_id IS the URL of this metadata document. The authorization
// server fetches the URL at registration time to learn the client's
// name, description, and allowed scopes.
//
// This endpoint stays live so any third-party, CIMD-compliant MCP
// client can still discover and register against this server without
// custom onboarding. It is NOT what Nexus itself registers as its own
// identity, though -- Module 01 uses Agent as Principal for that: the
// Nexus agent is registered as an Auth0 agent record (agent_id) and
// linked to the docagent-mcp-obo M2M client, so agent_id shows up as
// act.sub in every OBO-issued token and in tenant logs/Actions
// (event.agent), independent of this metadata document.
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
  const clientId = `${proto}://${host}/.well-known/client-metadata`;

  // Derive the frontend redirect URI from the MCP server host by
  // swapping port 3001 → 5173 (Codespace) or 3001 → 3000 (local built).
  const frontendOrigin = host.includes(".app.github.dev")
    ? `${proto}://${host.replace(/-3001(\.app\.github\.dev)/, "-5173$1")}`
    : `${proto}://${host.replace(/:3001$/, ":5173")}`;

  return {
    client_id:   clientId,
    client_name: "Nexus Agent (DevCamp)",
    grant_types: ["authorization_code"],
    redirect_uris: [frontendOrigin, `${frontendOrigin}/`],
    token_endpoint_auth_method: "none",
    scope: "mcp:docs:search mcp:docs:read mcp:crm:log mcp:docs:share",
  };
}
