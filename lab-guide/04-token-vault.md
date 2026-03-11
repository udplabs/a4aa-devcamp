# Lab 4: Token Vault

## Objectives

- Understand the Token Vault pattern for agent-to-third-party access
- Implement a token vault that stores third-party OAuth credentials per user
- Build a simulated third-party API (File Storage API)
- Create a tool that retrieves a user's vaulted token and calls the third-party API
- Handle token refresh and expiration

---

## Premise

The agent needs to call a third-party API (e.g., Google Drive, Dropbox, Slack) on behalf of the user. Token Vault securely stores and manages the user's third-party OAuth credentials so the agent can access external services without the user re-authenticating each time.

The agent never sees raw credentials — it requests a token from the vault for a specific user + provider.

---

## Concept: Token Vault

```
User links account → Token stored in vault
Agent needs access → Retrieves token from vault → Calls third-party API

┌──────────┐     ┌─────────────┐     ┌──────────────────┐
│  Agent   │────▶│ Token Vault │────▶│ Third-Party API  │
│          │     │             │     │ (File Storage)   │
│          │     │ user → {    │     │                  │
│          │◀────│   token,    │◀────│  Returns files   │
│          │     │   refresh,  │     │                  │
│          │     │   expires   │     │                  │
│          │     │ }           │     │                  │
└──────────┘     └─────────────┘     └──────────────────┘
```

Key principles:
- Tokens are stored keyed by `(userId, provider)`
- The vault handles refresh tokens and expiration
- The agent requests "give me a token for user X and provider Y"
- If the token is expired, the vault simulates a refresh

---

## Step 1: Build the Token Vault

Create `server/token-vault/vault.ts`:

```typescript
interface VaultEntry {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  provider: string;
  scopes: string[];
}

// In-memory vault: (userId, provider) → tokens
const vault = new Map<string, VaultEntry>();

function vaultKey(userId: string, provider: string): string {
  return `${userId}:${provider}`;
}

/**
 * Store a third-party token in the vault.
 */
export function storeToken(
  userId: string,
  provider: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  scopes: string[]
): void {
  const key = vaultKey(userId, provider);
  vault.set(key, {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    provider,
    scopes,
  });
  console.log(`[Token Vault] Stored token for ${userId} @ ${provider}`);
}

/**
 * Retrieve a valid token from the vault.
 * If expired, simulates a token refresh.
 */
export async function getToken(
  userId: string,
  provider: string
): Promise<{ token: string; provider: string } | null> {
  const key = vaultKey(userId, provider);
  const entry = vault.get(key);

  if (!entry) {
    console.log(`[Token Vault] No token found for ${userId} @ ${provider}`);
    return null;
  }

  // Check if token is expired
  if (Date.now() >= entry.expiresAt) {
    console.log(`[Token Vault] Token expired for ${userId} @ ${provider}, refreshing...`);

    // Simulate token refresh
    const newToken = `refreshed_${provider}_${Date.now()}`;
    entry.accessToken = newToken;
    entry.expiresAt = Date.now() + 3600 * 1000; // 1 hour
    console.log(`[Token Vault] Token refreshed for ${userId} @ ${provider}`);
  }

  return {
    token: entry.accessToken,
    provider: entry.provider,
  };
}

/**
 * Remove a token from the vault (unlink account).
 */
export function removeToken(userId: string, provider: string): boolean {
  const key = vaultKey(userId, provider);
  const existed = vault.has(key);
  vault.delete(key);
  if (existed) {
    console.log(`[Token Vault] Removed token for ${userId} @ ${provider}`);
  }
  return existed;
}

/**
 * List all linked providers for a user.
 */
export function listLinkedProviders(userId: string): Array<{
  provider: string;
  scopes: string[];
  expiresAt: number;
}> {
  const results: Array<{ provider: string; scopes: string[]; expiresAt: number }> = [];

  for (const [key, entry] of vault.entries()) {
    if (key.startsWith(`${userId}:`)) {
      results.push({
        provider: entry.provider,
        scopes: entry.scopes,
        expiresAt: entry.expiresAt,
      });
    }
  }

  return results;
}

/**
 * Seed a simulated third-party connection for a user.
 * Call this when the user first authenticates.
 */
export function seedVaultForUser(userId: string): void {
  // Simulate that the user has already linked their "File Storage" account
  storeToken(
    userId,
    "file-storage",
    `fs_access_${userId}_${Date.now()}`,
    `fs_refresh_${userId}`,
    3600, // 1 hour
    ["files:read", "files:list"]
  );
}
```

---

## Step 2: Build the Simulated Third-Party API

Create `server/token-vault/third-party-api.ts`:

```typescript
import express from "express";

const app = express();
app.use(express.json());

// Simulated file storage data
const FILES: Record<string, Array<{ id: string; name: string; size: string; modified: string }>> = {
  default: [
    { id: "f1", name: "vacation-photos.zip", size: "245 MB", modified: "2025-01-15" },
    { id: "f2", name: "trip-itinerary.pdf", size: "1.2 MB", modified: "2025-02-01" },
    { id: "f3", name: "travel-receipts.xlsx", size: "340 KB", modified: "2025-02-20" },
    { id: "f4", name: "passport-scan.pdf", size: "2.1 MB", modified: "2024-12-10" },
  ],
};

/**
 * Validate the bearer token.
 * In a real third-party API, this would validate against their OAuth server.
 */
function validateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.split(" ")[1];

  // Accept any token that starts with "fs_access_" or "refreshed_file-storage_"
  if (!token.startsWith("fs_access_") && !token.startsWith("refreshed_file-storage_")) {
    return res.status(401).json({ error: "Invalid access token" });
  }

  console.log(`[Third-Party API] Valid token received`);
  next();
}

// List files
app.get("/api/files", validateToken, (_req, res) => {
  console.log("[Third-Party API] Listing files");
  res.json({ files: FILES.default });
});

// Get a specific file
app.get("/api/files/:fileId", validateToken, (req, res) => {
  const file = FILES.default.find((f) => f.id === req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: "File not found" });
  }
  res.json({ file });
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "File Storage API" });
});

export function startThirdPartyAPI() {
  const port = parseInt(process.env.THIRD_PARTY_API_PORT || "3002");
  app.listen(port, () => {
    console.log(`[Third-Party API] File Storage API running on http://localhost:${port}`);
  });
}

export default app;
```

---

## Step 3: Create the External Files Tool

Create `server/tools/external-files.ts`:

```typescript
import { getToken, seedVaultForUser, listLinkedProviders } from "../token-vault/vault";

// Track seeded users
const seededUsers = new Set<string>();

function ensureSeeded(userId: string) {
  if (!seededUsers.has(userId)) {
    seedVaultForUser(userId);
    seededUsers.add(userId);
  }
}

/**
 * Get files from the external File Storage API using a vaulted token.
 */
export async function getExternalFiles(userId: string): Promise<{
  success: boolean;
  files?: any[];
  error?: string;
}> {
  ensureSeeded(userId);

  // Retrieve the token from the vault
  const tokenResult = await getToken(userId, "file-storage");

  if (!tokenResult) {
    return {
      success: false,
      error: "No File Storage account linked. Please link your account first.",
    };
  }

  // Call the third-party API with the vaulted token
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

/**
 * Get linked provider status for a user.
 */
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
```

---

## Step 4: Register the Tool and Update the Simulator

Add to `server/tools/registry.ts`:

```typescript
get_external_files: {
  name: "get_external_files",
  description: "Get your files from the linked File Storage service",
  parameters: {},
  requiredScopes: ["tools:read"],
  riskLevel: "medium",
  requiresConsent: false,
},
```

In `server/simulator.ts`, add intent detection:

```typescript
if (lower.includes("file") || lower.includes("storage") || lower.includes("external")) {
  return { toolName: "get_external_files", parameters: {} };
}
```

Add tool execution:

```typescript
import { getExternalFiles } from "./tools/external-files";

// In the tool execution section:
case "get_external_files":
  return await getExternalFiles(user.sub);
```

Add response formatting:

```typescript
case "get_external_files":
  if (!result.success) {
    return `**File Storage Error:** ${result.error}`;
  }
  const fileList = result.files
    .map((f: any) => `- **${f.name}** (${f.size}) — modified ${f.modified}`)
    .join("\n");
  return `Here are your files from File Storage:\n${fileList}`;
```

---

## Step 5: Start the Third-Party API

Open `server/index.ts` and add:

```typescript
import { startThirdPartyAPI } from "./token-vault/third-party-api";

// At the bottom, after starting the main server:
startThirdPartyAPI();
```

Update `.env` to include:

```
# Token Vault (Lab 4)
THIRD_PARTY_API_PORT=3002
```

---

## Step 6: Add Account Linking Endpoints

Add to `server/index.ts`:

```typescript
import { storeToken, removeToken, listLinkedProviders } from "./token-vault/vault";

// Link a third-party account
app.post("/api/vault/link", validateAccessToken, (req, res) => {
  const user = extractUser(req);
  const { provider } = req.body;

  // In production, this would initiate an OAuth flow with the third-party provider.
  // For the lab, we simulate it by storing a token directly.
  storeToken(
    user.sub,
    provider,
    `fs_access_${user.sub}_${Date.now()}`,
    `fs_refresh_${user.sub}`,
    3600,
    ["files:read", "files:list"]
  );

  res.json({ linked: true, provider });
});

// Unlink a third-party account
app.post("/api/vault/unlink", validateAccessToken, (req, res) => {
  const user = extractUser(req);
  const { provider } = req.body;
  const removed = removeToken(user.sub, provider);
  res.json({ unlinked: removed, provider });
});

// List linked providers
app.get("/api/vault/providers", validateAccessToken, (req, res) => {
  const user = extractUser(req);
  const providers = listLinkedProviders(user.sub);
  res.json({ providers });
});
```

---

## Step 7: Test the Token Vault

### Test 1: Get External Files
Send: **"Show my files from storage"**

Expected: List of 4 files from the simulated File Storage API.

### Test 2: Verify the Token Chain
Check server logs — you should see:

```
[Token Vault] Stored token for auth0|abc123 @ file-storage
[Token Vault] Retrieved token for auth0|abc123 @ file-storage
[Third-Party API] Valid token received
[Third-Party API] Listing files
```

### Test 3: Third-Party API Direct Access (Unauthorized)

```bash
curl http://localhost:3002/api/files
```

Should return `401` — the third-party API rejects requests without a valid token.

### Test 4: Test with a Valid Token

```bash
# This should work if you know the token format
curl -H "Authorization: Bearer fs_access_test_12345" http://localhost:3002/api/files
```

---

## Understanding the Token Vault Flow

```
User: "Show my files from storage"
  │
  ▼
Agent: detectIntent() → get_external_files
  │
  ▼
Agent: getExternalFiles(userId)
  │
  ├── Token Vault: getToken(userId, "file-storage")
  │   │
  │   ├── Token found and valid → return token
  │   └── Token expired → refresh → return new token
  │
  ▼
Agent: fetch("http://localhost:3002/api/files", { Authorization: Bearer <token> })
  │
  ▼
Third-Party API: Validate token → Return files
  │
  ▼
Agent: Format and return file list to user
```

---

## Checkpoint

At this point you have:
- [x] Token vault storing third-party credentials per user
- [x] Simulated File Storage third-party API
- [x] Agent retrieves vaulted tokens to access external APIs
- [x] Token refresh handled on expiration
- [x] Account linking/unlinking endpoints
- [x] Third-party API protected with bearer tokens

---

**Next: [Lab 5 — Auth for MCP](./05-auth-for-mcp.md)**
