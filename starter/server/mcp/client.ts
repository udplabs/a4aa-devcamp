// =============================================================
// LAB 05: Build the MCP Client
// See: lab-guide/05-auth-for-mcp.md
//
// This module connects the agent (Express API) to the MCP server.
// It performs:
//   1. PRM discovery (optional, once during startup)
//   2. CIMD (client identity comes from the pre-registered Auth0
//      client ID + secret passed in via env)
//   3. On-Behalf-Of token exchange with RFC 8707 resource indicator
//   4. Listing tools and calling them with the exchanged token
// =============================================================

interface MCPClientConfig {
  serverUrl: string;
  auth0Domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
}

// Cache exchanged tokens per user (keyed by the last 16 chars of
// the user token so the exchange only runs once per rep session).
const cachedTokens = new Map<string, { token: string; expiresAt: number }>();

export class MCPClient {
  private config: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    this.config = config;
  }

  // TODO(lab-05, Part E): On-Behalf-Of token exchange.
  //
  // POST https://${AUTH0_DOMAIN}/oauth/token with body:
  //   grant_type: urn:ietf:params:oauth:grant-type:token-exchange
  //   subject_token: <user's access token>
  //   subject_token_type: urn:ietf:params:oauth:token-type:access_token
  //   audience: <MCP audience>
  //   resource: <MCP audience>    // RFC 8707 resource indicator
  //   client_id: <agent client id, pre-registered via CIMD>
  //   client_secret: <agent client secret>
  //
  // Auth0 preserves the `sub` claim from the subject_token. That
  // is how the MCP server knows which rep the agent is acting for.
  private async getToken(userAccessToken: string): Promise<string> {
    const cacheKey = userAccessToken.slice(-16);
    const cached = cachedTokens.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }
    void this.config;
    throw new Error("MCPClient.getToken() not implemented - see Lab 05, Part E");
  }

  // TODO(lab-05): GET /mcp/tools with `Authorization: Bearer <exchanged token>`.
  async listTools(userAccessToken: string): Promise<any[]> {
    void userAccessToken;
    throw new Error("MCPClient.listTools() not implemented - see Lab 05");
  }

  // TODO(lab-05): POST /mcp/tools/call with name + arguments.
  // Handle 403 (insufficient scope) by surfacing the required scope
  // name so the lab checkpoint can verify per-tool enforcement.
  async callTool(name: string, args: Record<string, any>, userAccessToken: string): Promise<any> {
    void name;
    void args;
    void userAccessToken;
    throw new Error("MCPClient.callTool() not implemented - see Lab 05");
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
