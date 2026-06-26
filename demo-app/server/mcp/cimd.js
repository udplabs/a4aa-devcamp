// =============================================================
// Client ID Metadata Document (CIMD) -- Module 01 (Auth for MCP)
//
// In true CIMD (per the MCP authorization spec), the agent's
// client_id IS the URL of this metadata document. The authorization
// server fetches the URL at registration time to learn the agent's
// name, description, and allowed scopes. After that, the URL is
// the stable, pre-registered identity used in every OBO exchange
// and audit log entry.
//
// Why this matters:
//   - The URL is self-describing: anyone can fetch it and learn
//     what the agent is and what it is authorized to do.
//   - The identity survives redeploys: the URL doesn't change
//     even if the underlying M2M client secret rotates.
//   - Audit trail: every token exchange carries the URL as
//     client_id, so logs name the agent, not an opaque UUID.
//
// Contrast with Dynamic Client Registration (DCR, RFC 7591):
//   - DCR mints a new ephemeral client_id on every install.
//   - Audit logs become meaningless (different UUID each time).
//   - Admin consent cannot be pre-approved.
//
// In this lab, participants register the Nexus agent in Auth0 by
// providing the URL of this endpoint. Auth0 creates the application
// with the URL as the client_id and issues a client_secret.
// The participant adds both to .env so the OBO exchange works.
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
