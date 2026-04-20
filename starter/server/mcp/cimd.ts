// =============================================================
// LAB 5, Part C: Client ID Metadata (CIMD)
// See: lab-guide/05-auth-for-mcp.md - Part C
//
// Implement:
// - getClientMetadata(clientId) -- return pre-configured client metadata
//
// CIMD replaces Dynamic Client Registration (DCR). Instead of
// registering clients at runtime, clients are pre-configured
// in the Auth0 Dashboard with metadata (name, description,
// allowed scopes). The client_id is known ahead of time.
// =============================================================

export interface ClientMetadata {
  client_id: string;
  client_name: string;
  description: string;
  allowed_scopes: string[];
}

/**
 * Retrieve metadata for a pre-configured MCP client.
 * TODO: Implement
 */
export function getClientMetadata(clientId: string): ClientMetadata {
  // TODO: Return the client's pre-configured metadata
  throw new Error("getClientMetadata not implemented - see Lab 5, Part C");
}
