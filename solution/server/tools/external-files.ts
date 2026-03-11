import { getToken, seedVaultForUser, listLinkedProviders } from "../token-vault/vault";

const seededUsers = new Set<string>();

function ensureSeeded(userId: string) {
  if (!seededUsers.has(userId)) {
    seedVaultForUser(userId);
    seededUsers.add(userId);
  }
}

export async function getExternalFiles(userId: string): Promise<{
  success: boolean;
  files?: any[];
  error?: string;
}> {
  ensureSeeded(userId);

  const tokenResult = await getToken(userId, "file-storage");

  if (!tokenResult) {
    return {
      success: false,
      error: "No File Storage account linked. Please link your account first.",
    };
  }

  const apiPort = process.env.THIRD_PARTY_API_PORT || "3002";
  try {
    const response = await fetch(`http://localhost:${apiPort}/api/files`, {
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return {
          success: false,
          error: "Token expired or invalid. Please re-link your File Storage account.",
        };
      }
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      files: data.files,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to reach File Storage API: ${error.message}`,
    };
  }
}

export function getLinkedProviders(userId: string): Array<{
  provider: string;
  scopes: string[];
  connected: boolean;
}> {
  ensureSeeded(userId);

  const providers = listLinkedProviders(userId);
  return providers.map((p) => ({
    provider: p.provider,
    scopes: p.scopes,
    connected: true,
  }));
}
