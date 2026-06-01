// =============================================================
// FGA provisioning -- Lab 03
//
// Auth0/Okta FGA is a separate product from the Auth0 Management
// API, so it needs its own client-credentials (supplied as demo
// component settings). The CREATE hook creates a per-demo store
// and writes the authorization model; the resulting store/model
// ids are stashed in deploymentData for the live FGA client.
// =============================================================

import { OpenFgaClient, CredentialsMethod } from "@openfga/sdk";
import { FGA_AUTH_MODEL } from "../fga/model";

export interface FgaSettings {
  apiUrl: string; // e.g. https://api.us1.fga.dev
  apiTokenIssuer: string; // e.g. auth.fga.dev or fga.us.auth0.com
  apiAudience: string; // e.g. https://api.us1.fga.dev/
  clientId: string;
  clientSecret: string;
}

export function fgaSettingsFromEnvOrRecord(
  src: Record<string, any> = {}
): FgaSettings | null {
  const apiUrl = src.FGA_API_URL || process.env.FGA_API_URL;
  const apiTokenIssuer = src.FGA_API_TOKEN_ISSUER || process.env.FGA_API_TOKEN_ISSUER;
  const apiAudience = src.FGA_API_AUDIENCE || process.env.FGA_API_AUDIENCE;
  const clientId = src.FGA_CLIENT_ID || process.env.FGA_CLIENT_ID;
  const clientSecret = src.FGA_CLIENT_SECRET || process.env.FGA_CLIENT_SECRET;
  if (!apiUrl || !apiTokenIssuer || !apiAudience || !clientId || !clientSecret) return null;
  return { apiUrl, apiTokenIssuer, apiAudience, clientId, clientSecret };
}

function adminClient(settings: FgaSettings, storeId?: string): OpenFgaClient {
  return new OpenFgaClient({
    apiUrl: settings.apiUrl,
    storeId,
    credentials: {
      method: CredentialsMethod.ClientCredentials,
      config: {
        apiTokenIssuer: settings.apiTokenIssuer,
        apiAudience: settings.apiAudience,
        clientId: settings.clientId,
        clientSecret: settings.clientSecret,
      },
    },
  });
}

// Create a store for the demo and write the authorization model.
export async function provisionFgaStore(
  settings: FgaSettings,
  demoName: string
): Promise<{ storeId: string; modelId: string }> {
  const bootstrap = adminClient(settings);
  const store = await bootstrap.createStore({ name: `retailzero-${demoName}` });

  const scoped = adminClient(settings, store.id);
  const model = await scoped.writeAuthorizationModel(FGA_AUTH_MODEL as any);

  return { storeId: store.id, modelId: model.authorization_model_id };
}

export async function deleteFgaStore(settings: FgaSettings, storeId: string): Promise<void> {
  const scoped = adminClient(settings, storeId);
  await scoped.deleteStore();
}
