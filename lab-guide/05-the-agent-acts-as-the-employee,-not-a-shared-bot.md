## Objective *(~25 min)*

<!-- TODO: Flow screenshot here - Agent Identity to auth0 (token vault) highlighted -->

Now that we have user and agent identities, we need Nexus to log document activity to the CRM under the user's identity.

**Token Vault** solves this.

1. Auth0 stores each user's federated credential for a connected provider.
2. Nexus then asks the vault (politely) for a short-lived, per-user access token scoped to the job at hand.
3. Nexus calls the provider's API with that token, then discards it.
4. The vault handles refresh, and the user's actual refresh token never leaves Auth0.

This module wires up two providers side by side: the CRM, a custom OAuth2 connection, and GitHub, a built-in Auth0 social connection. Both go through the identical Token Vault mechanism — the only difference is who created the connection and how.

In this module, you'll:

- Understand how **getToken(userSub, provider)** selects the live Token Vault path vs. the in-memory fallback, for either provider.
- See how **log_crm_activity** calls the CRM API (port 3002) using a vaulted CRM token.
- Enable Token Vault on the CRM connection in the Auth0 Dashboard.
- Register your own GitHub OAuth App, wire it into Auth0 as a social connection, and enable Token Vault on it by hand.
- See how **check_github_identity** calls the GitHub API using a vaulted GitHub token.

## What's provisioned for you

- A CRM OAuth2 connection on your tenant pointing to the CRM mock running on port 3002 of your Codespace.
- The `docagent-mcp-obo` client you created in *One trust boundary for every agent* is a **Custom API Client** in Auth0. Custom API Clients have the **Token Vault** grant type enabled by default under Advanced Settings → Grant Types.
  - This means the same client that performs OBO token exchange for the MCP server also performs the Token Vault federated credential exchange for the CRM, so no additional client is required.

**Nothing is provisioned for GitHub.** Unlike the CRM connection, the GitHub social connection is entirely your responsibility to create, mirroring how a real enterprise admin onboards a new federated credential by hand.

## Codespace steps
### Make the CRM mock's port public

 1. Open the **Ports** tab in your Codespace
 2. Find port **3002**
 3. Right-click the row → **Port Visibility** → **Public**

 *You should see: the **Visibility** column for port 3002 now reads **Public**.*

<!-- TODO: screenshot - Codespace Ports tab with port 3002 set to Public -->

 Without this, clicking "Connect" fails partway through with a Content-Security-Policy error after briefly redirecting to **github.com/codespaces/auth/...**.

## Dashboard steps
### Enable Token Vault on the CRM connection
 1. Auth0 Dashboard → **Authentication → Social**
    - *You should see: the Social connections page with **crm-codespace** listed in the table.*
 2. Open **crm-codespace**
 3. Scroll down to the **Purpose** section
 4. Select **Authentication and Connected Accounts for Token Vault**
 5. Click **Save Changes**

> [!NOTE]
> *You may see an **"Offline Access Scope"** warning dialog appear at this point. This is expected.
>
> Token Vault needs a refresh token to maintain the stored credential, and this dialog is Auth0 confirming that tradeoff. Click through it to continue.*

Once turned on, Auth0 automatically requests a refresh token from the CRM on every flow, so it can maintain the stored credential without user re-authentication.

![CRM connection Purpose section with Token Vault option selected](images/03-token-vault-purpose-enabled.png)

Before you enable it, the vault falls back to an in-memory mock CRM token, so the tool call still succeeds, but Auth0 isn't involved in storing the credential.

After enabling it, Auth0 stores the user's real CRM access token and refresh token, and the live federated exchange fires on every **log_crm_activity** call.

### Authorize the Nexus SPA for the Auth0 My Account API

Enabling Token Vault on the connection makes the *exchange* possible, but Auth0 still needs a refresh token, and that only gets stored once a user actually links the CRM.

That flow runs against Auth0's My Account API, so you need to activate the API on your tenant and authorize the SPA to request a token for it.

1. Auth0 Dashboard → **Applications → APIs**
2. Find the **Auth0 My Account API** card and click **Activate**

![Auth0 My Account API card showing active status](images/03-my-account-api-activated.png)

3. Auth0 Dashboard → **Applications → Applications → docagent-spa-codespace**
4. Go to the **API Access** tab
    
<!-- TODO: screenshot here -->

5. Click **Auth0 My Account API** in the list. In the panel that opens, stay on the **User-Delegated Access** tab and select scopes: `create:me:connected_accounts`, `read:me:connected_accounts`, `delete:me:connected_accounts`
6. Click **Grant Access**. This takes effect immediately. A separate **Save** button on this screen may appear grayed out. If so, there's nothing to save, and you can move on.
    - *You should see: "3 / 8 permissions granted" under User-delegated Access for Auth0 My Account API.*

![docagent-spa-codespace API Access tab with 3/8 My Account API scopes granted](images/03-spa-my-account-scopes-granted.png)

Now at tool-call time, the backend asks Auth0's Token Vault for a short-lived, per-user federated access token for exactly one downstream call, preserving the user's identity.

The user's actual refresh token never leaves Auth0.

### Add GitHub as a second Token Vault provider

CRM is a **custom OAuth2 connection** — Nexus owns the OAuth app and you provisioned it automatically. GitHub is a **built-in social connection** — Auth0 ships first-class support for it, but you still have to register your own OAuth App and wire up the connection by hand. Both exchange through the identical Token Vault mechanism once configured.

**Step 1: Register a GitHub OAuth App**

1. On GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**
2. **Application name**: anything, for example `Nexus DevCamp`
3. **Homepage URL**: your Codespace's frontend URL (port 5173)
4. **Authorization callback URL**: `https://<your-auth0-domain>/login/callback`
5. Click **Register application**, then generate a **Client Secret**

*You should see: a **Client ID** and a **Client Secret** for your new OAuth App.*

**Step 2: Create the Auth0 `github` social connection**

1. Auth0 Dashboard → **Authentication → Social → Create Connection**
2. Select **GitHub**
3. Paste in the **Client ID** and **Client Secret** from Step 1
4. Under **Permissions**, select at least `read:user`
5. Click **Create**

**Step 3: Enable Token Vault on the connection**

1. Open the new `github` connection
2. Scroll to the **Purpose** section
3. Select **Authentication and Connected Accounts for Token Vault**
4. Click **Save Changes**

This is the same toggle, in the same place, as the CRM connection above — Token Vault doesn't care whether the connection is custom or built-in.

**Step 4: Paste the connection name into `.env`**

Auth0 names a GitHub social connection `github` by default. Confirm the name in the Dashboard, then open `demo-app/.env` and add:

```
VAULT_CONN_GITHUB=github
```

Restart the app (`Ctrl+C`, then `npm run dev`) if it doesn't auto-refresh.

**Step 5: Connect your GitHub account**

1. In the Nexus app header, click **Connect** next to **GitHub**
2. This runs the real Connected Accounts flow against GitHub and redirects you back into the app

**Step 6: Call `check_github_identity`**

1. Open the **Tool Tester** tab
2. Select **check_github_identity** and call it
3. *You should see: `{ success: true, login: "<your-github-username>", id: <your-github-id> }`*

## How Token Vault is wired

### The vault: **server/token-vault/vault.js**

**getToken(userId, provider)** tries the live federated path first. If the tenant has a connection provisioned for that provider (`"crm"` or `"github"`) **and** Token Vault is enabled on it, it exchanges the user's access token with Auth0 to get a short-lived federated credential.

If either condition isn't met, it falls back to the in-memory mock so the lab can run offline. The fallback has a seeded fake credential for both CRM and GitHub.

> [!NOTE]
> The grant type here:
> **urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token**
> 
> is Auth0's own variant, distinct from the RFC 8693 OBO grant you used in *One trust boundary for every agent* (**urn:ietf:params:oauth:grant-type:token-exchange**).
>
> Both are token exchanges but they serve different purposes:
> - OBO preserves user identity across the agent boundary.
> - This one retrieves a stored third-party credential from Token Vault.
>
> There's also a role reversal worth noticing. In *One trust boundary for every agent*, the MCP server only ever validated tokens — the agent's backend did the exchanging. Here, the MCP server itself becomes the client: it calls out to Auth0 to exchange the user's token for a CRM credential before calling the CRM API. Same OBO pattern, one hop further down the chain.

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

### The CRM API: **server/crm/app.js**

An OAuth2 authorization server and CRM activities API run on port 3002 in your Codespace.

Auth0 points the custom social connection at its **/crm/oauth/authorize** and **/crm/oauth/token** endpoints.

The CRM app signs its own JWTs and validates them on every **POST /crm/activities** call.

### The tool handler: **server/mcp/server.js**

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

> [!IMPORTANT]
> The **userId: userSub** in the request body is the user's Auth0 subject, so the CRM record is attributed to the *human*, not the *agent*.

### The GitHub tool handler: **server/mcp/server.js**

```js
case "check_github_identity": {
  const tokenResult = await getToken(userSub, "github", tenant, userAccessToken);
  // ... same getToken(userSub, provider, ...) call as log_crm_activity,
  // just against the built-in GitHub social connection instead of the
  // custom CRM OAuth2 one.
  const response = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenResult.token}` },
  });
  const data = await response.json();
  return { success: true, login: data.login, id: data.id };
}
```

Same pattern, same `getToken` call, same per-user attribution — only the provider string and the downstream API differ.

## Checkpoint

1. Click **Connect** next to "CRM" in the app header. This runs the real Connected Accounts flow against the CRM mock and redirects you back into the app.
2. Click **Connect** next to "GitHub" in the app header. This runs the real Connected Accounts flow against GitHub and redirects you back into the app.

<!-- TODO: screenshot - app header with the CRM and GitHub "Connect" buttons before linking -->
<!-- TODO: screenshot - app header after both are connected (Connect buttons replaced with connected state) -->

3. Use the **Run Checks** button on the left of the Nexus app page. The in-app verifier confirms Token Vault is enabled on the CRM connection.
4. In the **Tool Tester**, call **log_crm_activity** and **check_github_identity**. Both should succeed independently, and **/api/vault/providers** reports both as linked.

--- 

<details>
  <summary style='font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
  user-select: none;'>
    What you learned
  </summary>

Token Vault eliminates the operational and compliance burden of shared bot tokens. Instead of managing long-lived service credentials across teams, each call is scoped to the job and the individual. Every record ties back to the employee's identity, and credential rotation becomes Auth0's responsibility.

In the lab, the vault was auto-seeded with a simulated credential on your first tool call. In production, a real employee would go through an OAuth2 consent flow the first time they link an account. Auth0 stores the resulting refresh token, and Token Vault exchanges it for short-lived access tokens on every subsequent call. Offboarding just means revoking that connection in Auth0, with no token spreadsheet to maintain.

The CRM-vs-GitHub contrast is the point worth remembering: a custom OAuth2 connection and a built-in social connection look completely different to set up, but once configured, they're indistinguishable to `getToken` and to every downstream tool. The mechanism doesn't care who issued the credential.
</details>

--- 

#### <span style="font-variant: small-caps">Congrats!</span>

*You've completed this module.*

You've successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      Enabled Token Vault on the CRM connection in the Auth0 Dashboard;
  </li>
  <li style="list-style-type:'✅ '">
      Registered a GitHub OAuth App and wired it into Auth0 as a Token Vault-enabled social connection, by hand;
  </li>
  <li style="list-style-type:'✅ '">
      Observed how <code>getToken</code> selects the live federated exchange vs. the in-memory fallback, for either provider;
  </li>
  <li style="list-style-type:'✅ '">
      Logged a CRM activity and confirmed a GitHub identity, both attributed to the user's identity, not a shared service account;
  </li>
  <li style="list-style-type:'✅ '">
      Confirmed both records show the user's Auth0 <code>sub</code>, not an agent client ID.
  </li>
</ul>

Per-user credentials are now handled. Now we need to worry about the agent sharing documents with external recipients without any confirmation. The next module adds the approval gate.

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
