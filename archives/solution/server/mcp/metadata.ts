import { Request, Response } from "express";

// =============================================================
// RFC 9728 Protected Resource Metadata -- Lab 05
//
// The MCP server advertises which Authorization Server (Auth0)
// protects it, which scopes are defined, and the audience the
// resource identifies as. Clients discover this at
// /.well-known/oauth-protected-resource and use the audience
// value as the `resource=` parameter when requesting a token.
// =============================================================

export function protectedResourceMetadata(_req: Request, res: Response) {
  const authDomain = process.env.AUTH0_DOMAIN;

  res.json({
    resource: process.env.MCP_AUTH0_AUDIENCE,
    authorization_servers: [
      `https://${authDomain}`,
    ],
    scopes_supported: [
      "mcp:quote:read",
      "mcp:docs:create",
      "mcp:slack:post",
      "mcp:quote:commit",
    ],
    bearer_methods_supported: ["header"],
    client_registration_types_supported: ["metadata"],
    resource_documentation: "https://devcamp.example.com/mcp-api-docs",
  });
}
