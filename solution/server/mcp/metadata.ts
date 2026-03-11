import { Request, Response } from "express";

export function protectedResourceMetadata(req: Request, res: Response) {
  const authDomain = process.env.AUTH0_DOMAIN;

  res.json({
    resource: process.env.MCP_AUTH0_AUDIENCE,
    authorization_servers: [
      `https://${authDomain}`
    ],
    scopes_supported: [
      "mcp:weather:read",
      "mcp:calendar:read",
      "mcp:email:send",
      "mcp:documents:read",
    ],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://devcamp.example.com/mcp-api-docs",
  });
}
