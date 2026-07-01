/**
 * Client ID Metadata (CIMD)
 *
 * Instead of Dynamic Client Registration (DCR) where clients
 * register at runtime, CIMD uses pre-configured client metadata
 * from the Auth0 Dashboard.
 *
 * The client_id is known ahead of time and its metadata
 * (name, description, allowed scopes) is managed by an admin.
 */

export interface ClientMetadata {
  client_id: string;
  client_name: string;
  description: string;
  allowed_scopes: string[];
}

/**
 * Retrieve metadata for a pre-configured MCP client.
 *
 * In production, this could call the Auth0 Management API
 * to fetch the application's metadata dynamically.
 * For this lab, we return the known configuration.
 */
export function getClientMetadata(clientId: string): ClientMetadata {
  return {
    client_id: clientId,
    client_name: "DevCamp MCP Agent",
    description: "Voyager travel concierge MCP client",
    allowed_scopes: [
      "mcp:weather:read",
      "mcp:calendar:read",
      "mcp:email:send",
      "mcp:documents:read",
    ],
  };
}
