interface MCPClientConfig {
  serverUrl: string;
  auth0Domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export class MCPClient {
  private config: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    this.config = config;
  }

  // Get an access token for the MCP server using client credentials
  private async getToken(): Promise<string> {
    // Return cached token if still valid
    if (cachedToken && Date.now() < cachedToken.expiresAt) {
      return cachedToken.token;
    }

    console.log("[MCP Client] Requesting new M2M token from Auth0...");

    const response = await fetch(
      `https://${this.config.auth0Domain}/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          audience: this.config.audience,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get MCP token: ${response.statusText} - ${error}`);
    }

    const data = await response.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };

    console.log("[MCP Client] M2M token acquired successfully");
    return cachedToken.token;
  }

  // List available tools from the MCP server
  async listTools(): Promise<any[]> {
    const token = await this.getToken();
    const response = await fetch(`${this.config.serverUrl}/mcp/tools`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`MCP listTools failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tools;
  }

  // Call a tool on the MCP server
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    const token = await this.getToken();

    console.log(`[MCP Client] Calling tool: ${name}`);

    const response = await fetch(
      `${this.config.serverUrl}/mcp/tools/call`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, arguments: args }),
      }
    );

    if (response.status === 403) {
      const error = await response.json();
      throw new Error(
        `MCP authorization failed: insufficient scope. Required: ${error.required}`
      );
    }

    if (!response.ok) {
      throw new Error(`MCP callTool failed: ${response.statusText}`);
    }

    const data = await response.json();
    return JSON.parse(data.content[0].text);
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
