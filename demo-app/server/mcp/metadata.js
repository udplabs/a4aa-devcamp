// =============================================================
// RFC 9728 Protected Resource Metadata -- Module 02
//
// The single discovery document every MCP client reads first,
// first-party or third-party. A client that only knows this
// server's URL calls GET /.well-known/oauth-protected-resource
// (or follows the `resource_metadata` pointer in a 401's
// WWW-Authenticate header) to learn:
//   - resource: this server's canonical identifier. It is ALSO the
//     Auth0 API identifier, the RFC 8707 `resource` parameter the
//     client must send, and the `aud` every token presented here
//     must carry. One value, four places.
//   - authorization_servers: the Auth0 issuer. The client then
//     fetches the authorization server's OWN metadata from Auth0
//     (https://{tenant}/.well-known/oauth-authorization-server or
//     /.well-known/openid-configuration). This server deliberately
//     does not serve AS metadata itself -- only the AS can describe
//     its grant types, PKCE support, and CIMD support truthfully.
//   - scopes_supported: the per-tool scopes enforced in server.js.
//
// Client registration (pre-registered client, CIMD, or DCR) is a
// property of the authorization server, advertised in Auth0's AS
// metadata (client_id_metadata_document_supported), not here.
// =============================================================

import { requestOrigin } from "../utils/publicUrl.js";

export const MCP_SCOPES_SUPPORTED = [
  "mcp:docs:search", // search_documents (FGA-filtered)
  "mcp:docs:read",   // get_document (per-doc FGA check)
  "mcp:crm:log",     // log_crm_activity (Token Vault — CRM)
  "mcp:docs:share",  // share_document (CIBA-gated)
  "mcp:github:read", // check_github_identity (Token Vault — GitHub)
];

// The MCP server's resource identifier (= Auth0 API identifier).
export function mcpResource() {
  return (process.env.AUTH0_TOOL_AUDIENCE || "").replace(/\/$/, "");
}

export function authorizationServerIssuer() {
  return `https://${process.env.AUTH0_DOMAIN}/`;
}

// Where this server's PRM lives, as seen by whoever is calling --
// the public Codespace URL for external clients, localhost for the
// co-located Nexus backend and Acme server.
export function resourceMetadataUrl(req) {
  return `${requestOrigin(req)}/.well-known/oauth-protected-resource`;
}

export function protectedResourceMetadata(_req, res) {
  res.json({
    resource: mcpResource(),
    authorization_servers: [authorizationServerIssuer()],
    scopes_supported: MCP_SCOPES_SUPPORTED,
    bearer_methods_supported: ["header"],
    resource_name: "Nexus MCP Server",
    resource_documentation: "https://auth0.com/ai/docs/mcp/overview",
  });
}
