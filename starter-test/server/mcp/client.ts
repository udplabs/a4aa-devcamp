// =============================================================
// LAB 4: Build the MCP Client
// See: lab-guide/04-agent-authorization.md - Step 4
//
// This module connects the agent (Express API) to the MCP server.
// It handles:
// 1. Getting M2M tokens from Auth0 (client credentials flow)
// 2. Listing available tools from the MCP server
// 3. Calling tools with proper authorization
// =============================================================

interface MCPClientConfig {
  serverUrl: string;
  auth0Domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
}

export class MCPClient {
  private config: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    this.config = config;
  }

  // TODO: Implement getToken() - client credentials flow with Auth0
  private async getToken(): Promise<string> {
    throw new Error("MCPClient.getToken() not implemented - see Lab 4");
  }

  // TODO: Implement listTools() - GET /mcp/tools with Bearer token
  async listTools(): Promise<any[]> {
    throw new Error("MCPClient.listTools() not implemented - see Lab 4");
  }

  // TODO: Implement callTool() - POST /mcp/tools/call with Bearer token
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    throw new Error("MCPClient.callTool() not implemented - see Lab 4");
  }
}

export function createMCPClient(): MCPClient {
  return new MCPClient({
    serverUrl: `http://localhost:${process.env.MCP_SERVER_PORT || 3001}`,
    auth0Domain: process.env.AUTH0_DOMAIN!,
    clientId: process.env.AUTH0_CLIENT_ID_M2M!,
    clientSecret: process.env.AUTH0_CLIENT_SECRET_M2M!,
    audience: process.env.MCP_AUTH0_AUDIENCE!,
  });
}
