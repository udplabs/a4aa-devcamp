// =============================================================
// LAB 4: Build the MCP Server
// See: lab-guide/04-agent-authorization.md - Step 3
//
// This module creates a separate Express server that acts as
// an MCP (Model Context Protocol) server, protected by Auth0.
//
// Key endpoints:
// - GET  /.well-known/oauth-authorization-server  (OAuth metadata)
// - GET  /mcp/tools                                (list tools)
// - POST /mcp/tools/call                           (execute tool)
//
// All tool endpoints require a valid Auth0 access token.
// =============================================================

import express from "express";

const app = express();
app.use(express.json());

// TODO: Add OAuth 2.0 token validation middleware
// const validateMCPToken = auth({
//   issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
//   audience: process.env.MCP_AUTH0_AUDIENCE,
// });

// TODO: Add .well-known/oauth-authorization-server endpoint

// TODO: Add GET /mcp/tools endpoint (protected)

// TODO: Add POST /mcp/tools/call endpoint (protected + scope check)

export function startMCPServer() {
  const port = parseInt(process.env.MCP_SERVER_PORT || "3001");
  app.listen(port, () => {
    console.log(`MCP Server running on http://localhost:${port}`);
    console.log(
      `OAuth metadata: http://localhost:${port}/.well-known/oauth-authorization-server`
    );
  });
}

export default app;
