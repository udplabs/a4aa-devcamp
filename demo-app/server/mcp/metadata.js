// =============================================================
// RFC 9728 Protected Resource Metadata -- Lab 04
//
// Any compliant MCP client that only knows the server URL can
// call GET /.well-known/oauth-protected-resource to discover:
//   - which Authorization Server issues tokens for this resource
//   - which scopes are defined
//   - which token delivery method is expected (header)
//
// The client then follows the `authorization_servers` pointer to
// /.well-known/oauth-authorization-server (RFC 8414) to find the
// token endpoint, JWKS, and supported grant types -- including
// urn:ietf:params:oauth:grant-type:token-exchange for the OBO flow.
//
// This two-document discovery chain is what makes Auth for MCP
// zero-config on the client side: point the client at the server
// URL and it figures out the rest without hardcoded tenant values.
//
// Lab 04 orientation:
//   - resource: the audience value the OBO exchange must use.
//     The client.js `audience` + `resource` fields must match this.
//   - authorization_servers: points back to the Auth0 tenant.
//   - scopes_supported: the four per-tool scopes that the MCP
//     server enforces. Removing one here signals clients not to
//     request it.
// =============================================================

export function protectedResourceMetadata(_req, res) {
  const authDomain = process.env.AUTH0_DOMAIN;

  res.json({
    // The MCP server validates OBO-issued tokens for AUTH0_TOOL_AUDIENCE
    // (the backend/tool API). The `resource` here advertises that audience
    // so compliant clients know what to request via OBO.
    resource: process.env.AUTH0_TOOL_AUDIENCE,
    // Lab 04 -- points to the Auth0 tenant AS metadata document.
    authorization_servers: [
      `https://${authDomain}`,
    ],
    scopes_supported: [
      "mcp:docs:search", // search_documents (FGA-filtered)
      "mcp:docs:read",   // get_document (per-doc FGA check)
      "mcp:crm:log",     // log_crm_activity (Token Vault — CRM)
      "mcp:docs:share",  // share_document (CIBA-gated)
    ],
    bearer_methods_supported: ["header"],
    // CIMD: clients pre-register instead of using Dynamic Client Registration.
    client_registration_types_supported: ["metadata"],
    resource_documentation: "https://auth0.com/ai",
  });
}
