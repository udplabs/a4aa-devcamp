// =============================================================
// Public URL helpers
//
// Every process in this lab (API, MCP server, CRM mock, Acme) runs
// on its own port. In GitHub Codespaces each port gets its own
// forwarded HTTPS origin (https://<codespace>-<port>.app.github.dev);
// locally they're just http://localhost:<port>.
//
// Auth0 needs the *public* origin in several places:
//   - the MCP server's API identifier, which must equal the `resource`
//     its Protected Resource Metadata advertises (RFC 9728 / RFC 8707)
//   - the CRM mock's OAuth2 endpoints (Token Vault connection)
//   - Acme's CIMD URL, which Auth0 fetches over HTTPS when an admin
//     imports it (localhost is rejected by Auth0's CIMD URL rules)
// =============================================================

export function requestOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

// Given any origin served from this Codespace (or localhost), return
// the origin for the same deployment on a different port.
export function originForPort(anyOrigin, port) {
  const origin = (anyOrigin || "").replace(/\/$/, "");
  if (/-\d+\.app\.github\.dev$/.test(origin)) {
    return origin.replace(/-\d+(\.app\.github\.dev)$/, `-${port}$1`);
  }
  return `http://localhost:${port}`;
}

export function mcpPort() {
  return Number(process.env.MCP_SERVER_PORT || 3001);
}

export function acmePort() {
  return Number(process.env.ACME_SERVER_PORT || 3003);
}

// Acme's CIMD URL doubles as its OAuth client_id. ACME_CIMD_URL lets a
// participant point at a different host (e.g. a tunnel) when they
// aren't running in Codespaces.
export function acmeCimdUrl(anyOrigin) {
  if (process.env.ACME_CIMD_URL) return process.env.ACME_CIMD_URL;
  return `${originForPort(anyOrigin, acmePort())}/.well-known/client-metadata`;
}
