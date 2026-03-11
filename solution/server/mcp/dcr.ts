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

const registeredClients = new Map<string, DCRResponse>();

export async function registerClient(
  auth0Domain: string,
  request: DCRRequest
): Promise<DCRResponse> {
  const clientId = `dcr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const clientSecret = `secret_${Math.random().toString(36).substring(2, 16)}`;

  const registration: DCRResponse = {
    client_id: clientId,
    client_secret: clientSecret,
    client_name: request.client_name,
    grant_types: request.grant_types,
    token_endpoint_auth_method: request.token_endpoint_auth_method,
    registration_client_uri: `https://${auth0Domain}/oidc/register/${clientId}`,
  };

  registeredClients.set(clientId, registration);
  console.log(`[DCR] Client registered: ${request.client_name} (${clientId})`);

  return registration;
}

export function getRegisteredClient(clientId: string): DCRResponse | undefined {
  return registeredClients.get(clientId);
}
