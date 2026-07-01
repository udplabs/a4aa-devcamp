// =============================================================
// LAB 5: Build the MCP Client
// See: lab-guide/05-auth-for-mcp.md
//
// This module connects the agent (Express API) to the MCP server.
// It handles:
// 1. PRM discovery (Part B)
// 2. Client ID Metadata lookup (Part C)
// 3. On-behalf-of token exchange (Part D)
// 4. Listing available tools from the MCP server
// 5. Calling tools with proper authorization
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

  // TODO (Part D): Implement getToken() - on-behalf-of token exchange
  // Exchange the user's access token for one scoped to the MCP server
  private async getToken(userAccessToken: string): Promise<string> {
    throw new Error("MCPClient.getToken() not implemented - see Lab 5");
  }

  // TODO: Implement listTools() - GET /mcp/tools with Bearer token
  async listTools(userAccessToken: string): Promise<any[]> {
    throw new Error("MCPClient.listTools() not implemented - see Lab 5");
  }

  // TODO: Implement callTool() - POST /mcp/tools/call with Bearer token
  async callTool(name: string, args: Record<string, any>, userAccessToken: string): Promise<any> {
    throw new Error("MCPClient.callTool() not implemented - see Lab 5");
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
