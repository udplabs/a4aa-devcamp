// =============================================================
// LAB 5: Build the MCP Client
// See: lab-guide/05-auth-for-mcp.md
//
// This module connects the agent (Express API) to the MCP server.
// It handles:
// 1. PRM discovery (Part B)
// 2. Dynamic client registration (Part C)
// 3. Getting M2M tokens with resource indicators (Part D)
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

  // TODO (Part D): Implement getToken() - client credentials flow with resource indicator
  private async getToken(): Promise<string> {
    throw new Error("MCPClient.getToken() not implemented - see Lab 5");
  }

  // TODO: Implement listTools() - GET /mcp/tools with Bearer token
  async listTools(): Promise<any[]> {
    throw new Error("MCPClient.listTools() not implemented - see Lab 5");
  }

  // TODO: Implement callTool() - POST /mcp/tools/call with Bearer token
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    throw new Error("MCPClient.callTool() not implemented - see Lab 5");
  }

  // TODO (Part B + C): Implement discoverAndRegister() - PRM + DCR
  async discoverAndRegister(): Promise<void> {
    throw new Error("MCPClient.discoverAndRegister() not implemented - see Lab 5");
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
