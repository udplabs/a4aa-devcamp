// =============================================================
// LAB 5, Part C: Dynamic Client Registration
// See: lab-guide/05-auth-for-mcp.md - Part C
//
// Implement:
// - registerClient(auth0Domain, request) — register a new client
// - getRegisteredClient(clientId) — look up a registered client
// =============================================================

interface DCRRequest {
  client_name: string;
  grant_types: string[];
  token_endpoint_auth_method: string;
  redirect_uris?: string[];
}

interface DCRResponse {
  client_id: string;
  client_secret: string;
  client_name: string;
  grant_types: string[];
  token_endpoint_auth_method: string;
  registration_client_uri: string;
}

/**
 * Register a new client dynamically.
 * TODO: Implement
 */
export async function registerClient(
  auth0Domain: string,
  request: DCRRequest
): Promise<DCRResponse> {
  throw new Error("registerClient not implemented - see Lab 5, Part C");
}

/**
 * Look up a dynamically registered client.
 * TODO: Implement
 */
export function getRegisteredClient(
  clientId: string
): DCRResponse | undefined {
  return undefined;
}
