// =============================================================
// LAB 5: Build the MCP Server
// See: lab-guide/05-auth-for-mcp.md
//
// This module creates a separate Express server that acts as
// an MCP (Model Context Protocol) server, protected by Auth0.
//
// Key endpoints:
// - GET  /.well-known/oauth-protected-resource  (RFC 9728 PRM)
// - GET  /.well-known/oauth-authorization-server (OAuth metadata)
// - GET  /mcp/tools                              (list tools)
// - POST /mcp/tools/call                         (execute tool)
//
// All tool endpoints require a valid Auth0 access token.
// =============================================================

import express from "express";

const app = express();
app.use(express.json());

// TODO (Part B): Add Protected Resource Metadata endpoint
// TODO (Part A): Add OAuth 2.0 Authorization Server Metadata endpoint
// TODO (Part E): Add OAuth 2.0 token validation middleware
// TODO: Add GET /mcp/tools endpoint (protected)
// TODO: Add POST /mcp/tools/call endpoint (protected + scope check)

export function startMCPServer() {
  const port = parseInt(process.env.MCP_SERVER_PORT || "3001");
  app.listen(port, () => {
    console.log(`[MCP Server] Running on http://localhost:${port}`);
  });
}

export default app;
