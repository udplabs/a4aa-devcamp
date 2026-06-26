# Module 03: Token Vault

## Objective *(~15 min)*

Nexus needs to log document activity to the CRM under the employee's own identity, not a shared service account. A single bot token creates operational risk: one blast radius for every user, no audit trail tied to the individual, and a manual rotation burden each time someone leaves.

The right pattern is **Token Vault**: Auth0 stores each user's federated CRM credential. At tool-call time, Nexus asks the vault for a short-lived, per-user access token scoped to the job at hand, calls the CRM with that token, and discards it. The vault handles refresh. The user's actual refresh token never leaves Auth0.

In this module you will:

- Understand how `getToken(userSub, provider)` selects the live Token Vault path vs. the in-memory fallback.
- See how `log_crm_activity` calls the CRM API (port 3002) using the vaulted token.
- Enable Token Vault on the CRM connection in the Auth0 Dashboard.

### Why we're building this

Shared bot tokens are an operational liability that scales with your user base: one token means one blast radius, zero attribution, and a manual rotation process every time someone leaves. For an AI agent platform serving multiple employees, this pattern becomes unsustainable, not just as a security risk but as a recurring operational cost.

The commercial consequence: Token Vault removes the bot token management lifecycle entirely. Per-user, short-lived credentials mean every CRM action is attributable to a specific employee, offboarding is a single revocation, and the risk surface of any credential compromise is contained to one user and one call. That is a measurable reduction in operational overhead and directly strengthens the security posture that enterprise procurement evaluates.

## Prerequisites

- You completed **Module 01** (Auth for MCP) and **Module 02** (User Authentication). Token Vault mints credentials for the same verified user identity that Module 02 established.

## What's provisioned for you

The CREATE hook provisioned a CRM OAuth2 connection on your tenant — it points to the CRM mock running on port 3002 of your Codespace. The provisioning step derived the connection URL from your Codespace's public address, so Auth0 can reach it. Token storage (Token Vault) is **disabled by default** so you experience the exact setting that makes the live exchange possible.

The `docagent-mcp-obo` client you created in Module 01 is a **Custom API Client** in Auth0. Custom API Clients have the **Token Vault** grant type enabled by default under Advanced Settings → Grant Types. This means the same client that performs OBO token exchange for the MCP server also performs the Token Vault federated credential exchange for the CRM — no additional client is required.

> [!WARNING]
> If you restart your Codespace, it gets a new public URL. The CRM connection registered in Auth0 will point to the old URL and the live Token Vault path will fail. To fix this, click **Provision Resources** again from the Nexus setup screen to re-register the connection with the new URL.

> [!IMPORTANT]
> **Dashboard Step: Enable Token Vault on the CRM connection**
>
> 1. Auth0 Dashboard → **Authentication → Social**
>
> *You should see: the Social connections page with **crm-codespace** listed in the table.*
>
> 2. Open **crm-codespace**
> 3. Scroll down to the **Purpose** section
> 4. Select **Authentication and Connected Accounts for Token Vault**
> 5. Click **Save Changes**
>
> *You should see: the Purpose radio button update to the Token Vault option. Auth0 will automatically request a refresh token from the CRM on every OAuth2 flow so it can maintain the stored credential without user re-authentication.*
>
> Before you enable it, the vault falls back to an in-memory mock CRM token — the tool call still succeeds, but Auth0 is not yet involved in storing the credential. After enabling, Auth0 stores the user's real CRM access token and refresh token, and the live federated exchange fires on every `log_crm_activity` call.

At tool-call time the backend asks Auth0 for a short-lived, per-user federated access token for exactly one downstream call, preserving the user's identity from Module 01. The user's actual refresh token never leaves Auth0.

> [!NOTE]
> If Token Vault is not yet enabled on the connection (or the user has not linked one), the vault falls back to an in-memory mint with the same API shape, so `log_crm_activity` still completes offline. The code path you observe below is what runs against the live connection; the fallback preserves its behavior.

> [!NOTE]
> Self-hosting `starter/`? Register the CRM as a custom OAuth2 social connection in your own tenant, enable Token Vault (refresh-token storage), and the same code retrieves stored tokens for the authenticated user. In production the retrieval pattern is `GET /api/v2/users/{user_id}/tokens/{connection}` with an M2M token that has `read:user_tokens`.

## How Token Vault is wired

### The vault: `server/token-vault/vault.js`

`getToken(userId, provider)` tries the live federated path first. If the tenant has the CRM connection provisioned **and** Token Vault is enabled on it (the Dashboard step above), it exchanges the user's access token with Auth0 to get a short-lived CRM credential. If either condition is not met, it falls back to the in-memory mock so the lab runs offline.

> [!NOTE]
> The grant type here — `urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token` — is Auth0's own variant, distinct from the RFC 8693 OBO grant you used in Module 01 (`urn:ietf:params:oauth:grant-type:token-exchange`). Both are token exchanges but they serve different purposes: OBO preserves user identity across the agent boundary; this one retrieves a stored third-party credential from Token Vault.

```js
// Live path: Token Vault exchange
async function getLiveToken(userId, provider, tenant, userAccessToken) {
  const connection = connectionFor(tenant, provider); // resolves "crm" -> connection name
  const dd = tenant?.deploymentData;
  if (!connection || !userAccessToken || !tenant?.domain || !dd?.m2m_client_id) return null;

  const response = await fetch(`https://${tenant.domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
      subject_token: userAccessToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
      requested_token_type: "http://auth0.com/oauth/token-type/federated-connection-access-token",
      connection,
      client_id: dd.m2m_client_id,
      client_secret: dd.m2m_client_secret,
    }),
  });
  // returns { token, provider } or null on failure
}
```

### The CRM API: `server/crm/app.js`

A minimal OAuth2 authorization server and CRM activities API runs on port 3002 in your Codespace. Auth0 points the custom social connection at its `/crm/oauth/authorize` and `/crm/oauth/token` endpoints. The CRM app signs its own JWTs and validates them on every `POST /crm/activities` call.

### The tool handler: `server/mcp/server.js`

```js
case "log_crm_activity": {
  const { action, documentId, documentTitle, notes } = args;
  const tokenResult = await getToken(userSub, "crm", tenant, userAccessToken);
  if (!tokenResult) {
    return { success: false, error: "No CRM account linked. Ask the user to connect their CRM." };
  }
  const apiBase = process.env.CRM_API_URL || `http://localhost:${process.env.CRM_PORT || 3002}`;
  const response = await fetch(`${apiBase}/crm/activities`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenResult.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, documentId, documentTitle, notes, userId: userSub }),
  });
  if (!response.ok) return { success: false, error: `CRM API error: ${response.statusText}` };
  const data = await response.json();
  return { success: true, ...data };
}
```

The `userId: userSub` in the request body is the user's Auth0 subject, so the CRM record is attributed to the human, not the agent.

## Checkpoint

Use the **Run Checks** button at the bottom of this page. The in-app verifier confirms Token Vault is enabled on the CRM connection.

Before running checks, complete the interactive steps:

1. Log in and send any non-CRM message first (e.g. *"Find the Q3 roadmap"*). This seeds the in-memory CRM credential.
2. Send: *"Log that I viewed the Q3 roadmap in the CRM."* The response includes a logged activity ID.
3. Enable Token Vault on the CRM connection in the Dashboard, then send the same message again. The server log switches from the seeded mock to `[Token Vault] (live) federated token for …`.

> [!TIP]
> The `userId` in the CRM activity record should match the Auth0 `sub` of the logged-in user — not a service account. That's the confirmation the credential is scoped per-user.

## What you learned

Token Vault eliminates the operational and compliance burden of shared bot tokens. Instead of managing long-lived service credentials across teams, each call is scoped to the job and to the individual, every CRM record ties back to the employee's identity, and credential rotation becomes Auth0's responsibility rather than a manual ops ritual.

In the lab, the vault was auto-seeded with a simulated credential on your first tool call. In production, a real employee would go through an OAuth2 consent flow the first time they link their CRM account — Auth0 stores the resulting refresh token, and Token Vault exchanges it for short-lived access tokens on every subsequent call. Offboarding is revoking that connection in Auth0. No token spreadsheet to maintain.

#### <span style="font-variant: small-caps">Congrats!</span>

*You have completed this module.*

You should have successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      enabled Token Vault on the CRM connection in the Auth0 Dashboard;
  </li>
  <li style="list-style-type:'✅ '">
      observed how <code>getToken</code> selects the live federated exchange vs. the in-memory fallback;
  </li>
  <li style="list-style-type:'✅ '">
      logged a CRM activity attributed to the user's identity, not a shared service account;
  </li>
  <li style="list-style-type:'✅ '">
      confirmed the CRM record shows the user's Auth0 <code>sub</code>, not an agent client ID.
  </li>
</ul>

Per-user credentials are now handled. One gap remains: the agent can share documents with external recipients without any confirmation. Module 04 adds the approval gate.

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
