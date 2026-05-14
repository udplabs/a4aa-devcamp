# Lab 04: Token Vault

## Premise

Z-Merchant needs to drop a quote draft into the rep's own Google Workspace and post the finance-desk summary as the rep in Slack. The cheap, wrong way to do that is a shared bot token. That token is a single blast radius for every rep on the platform and has to be rotated manually when people leave.

The right pattern is **Token Vault**: Auth0 stores each rep's federated credentials for Google and Slack. At tool-call time, Z-Merchant asks the vault for a short-lived, per-user access token scoped to the job at hand, calls the third party with that token, and discards it. The vault handles refresh. The rep's actual refresh token never leaves Auth0.

## Objectives

- Register Google and Slack as federated connections in Auth0.
- Seed the vault with per-user access tokens for both providers.
- Implement `getToken(userSub, provider)` with expiry + refresh.
- Wire `create_google_doc` and `post_slack_triage` to call the third-party mock (port 3002) using vaulted tokens.
- Stand up `/api/vault/link`, `/api/vault/unlink`, and `/api/vault/providers` endpoints.

## Auth0 Dashboard Setup

The lab simulates the vault in-process so you can run it without OAuth credentials for Google or Slack. To wire real federated connections:

### Google Workspace

- **Dashboard > Authentication > Social > Google** -- create OAuth client in Google Cloud, paste the Client ID + Secret.
- Add scopes: `https://www.googleapis.com/auth/documents`, `https://www.googleapis.com/auth/drive.file`.
- Enable **Store refresh tokens** under the connection settings.

### Slack

- **Dashboard > Authentication > Social > Slack** (custom connection if needed).
- Scopes: `chat:write`, `channels:read`.

### Expose vault operations

The Auth0 Tokens API lets your backend retrieve stored tokens on behalf of the authenticated user. For this lab we simulate it; in production the call pattern is:

```
GET /api/v2/users/{user_id}/tokens/{connection}
```

with an M2M token that has `read:user_tokens`.

## Code Steps

### Step 1: implement the vault

`starter/server/token-vault/vault.ts`:

```ts
export interface VaultEntry {
  userId: string;
  provider: "google" | "slack";
  accessToken: string;
  refreshToken?: string;
  scopes: string[];
  expiresAt: number;
}

const vault = new Map<string, VaultEntry>();
const key = (u: string, p: string) => `${u}::${p}`;

export async function storeToken(entry: VaultEntry) {
  vault.set(key(entry.userId, entry.provider), entry);
}

export async function getToken(userId: string, provider: "google" | "slack") {
  const entry = vault.get(key(userId, provider));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt - 30_000) {
    // pretend-refresh; in prod, call the provider's /token with refresh_token
    entry.accessToken = `${entry.accessToken}-refreshed`;
    entry.expiresAt = Date.now() + 3600_000;
    console.log(`[Vault] refreshed ${provider} token for ${userId}`);
  }
  return entry;
}

export async function removeToken(userId: string, provider: "google" | "slack") {
  return vault.delete(key(userId, provider));
}

export async function listLinkedProviders(userId: string) {
  return Array.from(vault.values())
    .filter((e) => e.userId === userId)
    .map((e) => e.provider);
}

export async function seedVaultForUser(userId: string) {
  await storeToken({
    userId, provider: "google",
    accessToken: `mock-google-${userId.slice(-6)}`,
    scopes: ["https://www.googleapis.com/auth/documents"],
    expiresAt: Date.now() + 3600_000,
  });
  await storeToken({
    userId, provider: "slack",
    accessToken: `mock-slack-${userId.slice(-6)}`,
    scopes: ["chat:write"],
    expiresAt: Date.now() + 3600_000,
  });
}
```

### Step 2: stand up the third-party mock

`starter/server/token-vault/third-party-api.ts`:

```ts
function validate(prefix: string) {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token?.startsWith(prefix)) return res.status(401).json({ error: "invalid_token" });
    next();
  };
}

app.post("/google/docs", validate("mock-google-"), (req, res) => {
  const id = `doc-${Date.now()}`;
  res.json({ documentId: id, url: `https://docs.google.com/document/d/${id}/edit` });
});

app.post("/slack/chat.postMessage", validate("mock-slack-"), (req, res) => {
  const ts = Date.now();
  res.json({ ok: true, ts: String(ts), permalink: `https://retailzero.slack.com/archives/C0/p${ts}` });
});

export function startThirdPartyAPI() {
  const port = Number(process.env.THIRD_PARTY_API_PORT || 3002);
  app.listen(port, () => console.log(`[Third-party mock] :${port}`));
}
```

### Step 3: call the vault from tool handlers

On the MCP server (you will complete this in Lab 05):

```ts
case "create_google_doc": {
  const entry = await getToken(userSub, "google");
  if (!entry) throw new Error("Google not linked");
  const r = await fetch(`http://localhost:${process.env.THIRD_PARTY_API_PORT || 3002}/google/docs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${entry.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return r.json();
}

case "post_slack_triage": {
  const entry = await getToken(userSub, "slack");
  if (!entry) throw new Error("Slack not linked");
  const r = await fetch(`http://localhost:${process.env.THIRD_PARTY_API_PORT || 3002}/slack/chat.postMessage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${entry.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel: args.channel || "#wholesale-quote-triage", summary: args.summary, docUrl: args.docUrl }),
  });
  return r.json();
}
```

### Step 4: expose vault endpoints + seed on login

`starter/server/index.ts`:

```ts
import { seedVaultForUser, listLinkedProviders, storeToken, removeToken } from "./token-vault/vault";
import { startThirdPartyAPI } from "./token-vault/third-party-api";

startThirdPartyAPI();

app.post("/api/vault/link", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  await seedVaultForUser(user.sub);
  res.json({ providers: await listLinkedProviders(user.sub) });
});

app.post("/api/vault/unlink", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  await removeToken(user.sub, req.body.provider);
  res.json({ providers: await listLinkedProviders(user.sub) });
});

app.get("/api/vault/providers", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  res.json({ providers: await listLinkedProviders(user.sub) });
});
```

## Checkpoint

1. Log in; the frontend calls `POST /api/vault/link` to seed google + slack entries.
2. Prompt: *"Draft a Google Doc quote for Acme at tier-2."* -> Z-Merchant calls `create_google_doc` -> response includes a `documentId` and `url`.
3. Prompt: *"Post a triage summary to #wholesale-quote-triage."* -> response includes a Slack `ts` and `permalink`.
4. Age a token manually (set `expiresAt` in the past) -> next call silently refreshes.
5. Call `/google/docs` with a bogus bearer -> 401.

## What you learned

Token Vault is the pattern that lets an AI agent act as the user in third-party systems without the agent ever holding a long-lived credential. Each call is scoped to the job and to the rep, every audit event ties back to the rep's identity, and rotation is Auth0's problem instead of a manual ops ritual. In practical terms: onboarding a new rep means "add them to Auth0 and link their Workspace" instead of "provision a bot token and log it in a spreadsheet," and offboarding is flipping one switch. That is textbook opex reduction on credential management.
