// =============================================================
// LAB 05, Parts C + D: Discovery metadata for Auth for MCP
// See: lab-guide/05-auth-for-mcp.md
//
// The MCP server advertises which Authorization Server (Auth0)
// protects it, which scopes it defines, and which audience it
// identifies as. Clients discover this at:
//   - /.well-known/oauth-protected-resource     (RFC 9728)
//   - /.well-known/oauth-authorization-server   (RFC 8414)
//
// PRM tells the client which AS to trust; AS metadata then
// publishes issuer, token endpoint, scopes, and grant types so a
// fresh MCP client can resolve everything from the server URL alone.
// =============================================================

import { Request, Response } from "express";

// TODO(lab-05, Part C): return the RFC 9728 Protected Resource Metadata
// JSON body. Required keys for Z-Merchant:
//   resource: process.env.MCP_AUTH0_AUDIENCE
//   authorization_servers: [`https://${process.env.AUTH0_DOMAIN}`]
//   scopes_supported: mcp:quote:read, mcp:docs:create, mcp:slack:post, mcp:quote:commit
//   bearer_methods_supported: ["header"]
//   client_registration_types_supported: ["metadata"]   // <- CIMD
export function protectedResourceMetadata(_req: Request, res: Response) {
  res.status(501).json({ error: "Not implemented - see Lab 05, Part C" });
}

// TODO(lab-05, Part D): return the RFC 8414 Authorization Server Metadata
// JSON body. Fetch Auth0's /.well-known/openid-configuration and republish
// the relevant fields, plus the four mcp:* scopes and the token-exchange
// + CIBA grant types. Required keys:
//   issuer, authorization_endpoint, token_endpoint, jwks_uri
//   scopes_supported: mcp:quote:read, mcp:docs:create, mcp:slack:post, mcp:quote:commit
//   grant_types_supported: authorization_code, client_credentials,
//     urn:ietf:params:oauth:grant-type:token-exchange,
//     urn:openid:params:grant-type:ciba
//   client_registration_types_supported: ["cimd"]
export async function authorizationServerMetadata(_req: Request, res: Response) {
  res.status(501).json({ error: "Not implemented - see Lab 05, Part D" });
}
