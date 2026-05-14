// =============================================================
// LAB 05, Part C: Protected Resource Metadata (RFC 9728)
// See: lab-guide/05-auth-for-mcp.md
//
// The MCP server advertises which Authorization Server (Auth0)
// protects it, which scopes it defines, and which audience it
// identifies as. Clients discover this at
// /.well-known/oauth-protected-resource and use the audience
// value as the `resource=` parameter during OBO token exchange.
// =============================================================

import { Request, Response } from "express";

// TODO(lab-05): return the RFC 9728 Protected Resource Metadata
// JSON body. Required keys for Z-Merchant:
//   resource: process.env.MCP_AUTH0_AUDIENCE
//   authorization_servers: [`https://${process.env.AUTH0_DOMAIN}`]
//   scopes_supported: mcp:quote:read, mcp:docs:create, mcp:slack:post, mcp:quote:commit
//   bearer_methods_supported: ["header"]
//   client_registration_types_supported: ["metadata"]   // <- CIMD
export function protectedResourceMetadata(_req: Request, res: Response) {
  res.status(501).json({ error: "Not implemented - see Lab 05, Part C" });
}
