interface MCPClientConfig {
  serverUrl: string;
  auth0Domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
}

// Cache exchanged tokens per user (keyed by last 16 chars of user token)
const cachedTokens = new Map<string, { token: string; expiresAt: number }>();

export class MCPClient {
  private config: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    this.config = config;
  }

  // Exchange the user's access token for one scoped to the MCP server
  private async getToken(userAccessToken: string): Promise<string> {
    const cacheKey = userAccessToken.slice(-16);
    const cached = cachedTokens.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }
    if (cached) cachedTokens.delete(cacheKey);

    console.log("[MCP Client] Exchanging user token for MCP-scoped token...");

    const response = await fetch(
      `https://${this.config.auth0Domain}/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: userAccessToken,
          subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
          audience: this.config.audience,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${response.statusText} - ${error}`);
    }

    const data = await response.json();
    cachedTokens.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    });

    console.log("[MCP Client] Token exchange successful -- MCP token acquired");
    return data.access_token;
  }

  // List available tools from the MCP server
  async listTools(userAccessToken: string): Promise<any[]> {
    const token = await this.getToken(userAccessToken);
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
  async callTool(name: string, args: Record<string, any>, userAccessToken: string): Promise<any> {
    const token = await this.getToken(userAccessToken);

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
