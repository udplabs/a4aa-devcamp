## Objective *(~20 min)*

<!-- TODO: Flow screenshot here - CIMD document → admin import → reviewed grant → second Agent as Principal record → user consent. -->

Our Nexus MCP doesn't just talk to its own first-party agent. In the real world, third party agents might need to talk to it as well.

This module onboards that second agent, **Acme Partner Agent**, the way Auth0 and the MCP authorization spec define for third-party clients: the partner publishes a **Client ID Metadata Document (CIMD)**, an admin imports and reviews it, the admin grants a deliberately smaller set of scopes, and each employee consents before Acme acts for them.

By the end, you'll understand:

- What a CIMD is, why its URL *is* the client's `client_id`, and what proves it belongs to the partner.
- What an admin does to onboard a third-party agent: tenant toggles, import, a reviewed per-app grant, a domain-level connection, and an agent record.
- How a third-party agent finds your MCP server and Auth0 on its own: a 401 or PRM, then Auth0's metadata, then Authorization Code + PKCE with the RFC 8707 `resource` parameter.
- How to tell the two agents apart in their tokens: same employee `sub`, different `act.sub`, nested versus single-level `act`, and different `client_id`.
- Why least privilege for third parties is enforced by the authorization server, not by trusting what the partner asked for.

## What's provisioned for you

Nothing Acme-specific is provisioned. A third party's agent is never something your tenant creates on its own. You, acting as the admin, make each trust decision.

Provisioning did lay the groundwork every third-party client needs:

- **Client ID Metadata Document Registration** is on (**Settings → Advanced**). Auth0's authorization server metadata now advertises `client_id_metadata_document_supported: true`.
- **Username-Password-Authentication** is promoted to a **domain-level connection**. Third-party applications, including every CIMD client, can only sign users in through domain-level connections.
- The **Nexus MCP Server** API uses **per-app authorization** for user-delegated access. A newly imported client gets *nothing* until you grant it.

> [!IMPORTANT]
> Auth0 fetches Acme's CIMD over the public internet, so Acme's port must be **public**. In the Codespace **Ports** tab, confirm port **3003** (Acme), **3001** (MCP server), and **3002** (CRM) show **Public** visibility. If not, right-click each → **Port Visibility → Public**. Auth0 rejects `localhost` CIMD URLs, so this module needs Codespaces, or a tunnel URL in `ACME_CIMD_URL`.

### First-party vs. third-party, at a glance

|  | First-party (Nexus Agent) | Third-party (Acme Partner Agent) |
|---|---|---|
| Who builds the agent | Your team | A partner, outside your tenant |
| How it's registered | You create a Custom API client | You **import** the partner's CIMD URL |
| `client_id` | Auth0-generated | The CIMD URL itself |
| Client authentication | Client secret (confidential) | None + PKCE (public); `private_key_jwt` if confidential; never a shared secret |
| Consent | Skipped (first-party) | Always shown (strict third-party) |
| Login connections | Any enabled for the app | Domain-level only |
| How it gets an MCP server token | OBO exchange of the employee's Nexus Agent API token | Authorization Code + PKCE, with `resource` = the MCP server |
| Access | Full `mcp:*` set, narrowed by role | A reviewed subset you grant: `mcp:docs:search`, `mcp:docs:read` |
| Agent record | `Nexus Agent (DevCamp)` | `Acme Partner Agent (DevCamp)` |
| `act` claim | Nested: the agent, then the SPA | Single level: Acme's agent |

The MCP server treats both the same way: validate `aud`, enforce per-tool scope, and act for `sub`.

## Dashboard steps

<!-- TODO: maybe instead of CURL, we just copy/paste the URL -->

### Step 1: discover the resource, as Acme will

Any MCP client that only knows your server's URL starts here. Call a tool endpoint with no token:

```bash
curl -i https://<your-codespace-name>-3001.app.github.dev/mcp/tools
```

*You should see: `401` with `WWW-Authenticate: Bearer resource_metadata="https://...-3001.app.github.dev/.well-known/oauth-protected-resource"`.*

Follow the pointer:

```bash
curl https://<your-codespace-name>-3001.app.github.dev/.well-known/oauth-protected-resource
```

*You should see: `resource` (the MCP server's URL), `authorization_servers` (your Auth0 tenant), and the five `mcp:*` scopes.*

Then Auth0's own metadata, which the PRM points to:

```bash
curl https://<your-auth0-domain>/.well-known/openid-configuration | grep -E 'code_challenge|client_id_metadata'
```

*You should see: `code_challenge_methods_supported` including `S256`, and `client_id_metadata_document_supported: true`.* That's how a client learns, without asking anyone, that it can register with a CIMD and must use PKCE.

### Step 2: read the partner's CIMD

Acme publishes its client metadata on its own server.

> [!NOTE]
> **Acme really is a separate server in this lab.** It runs as its own Express process (`demo-app/server/acme/`) on its own port and public URL, independent of Nexus. A real partner publishes its CIMD on its own domain. The document lives wherever the partner says, and its URL *is* the `client_id`.

```bash
curl https://<your-codespace-name>-3003.app.github.dev/.well-known/client-metadata
```

*You should see:*

<!-- TODO: compare to claudes real CIMD. -->

```json
{
  "client_id": "https://<your-codespace-name>-3003.app.github.dev/.well-known/client-metadata",
  "client_name": "Acme Partner Agent",
  "application_type": "web",
  "grant_types": ["authorization_code"],
  "response_types": ["code"],
  "redirect_uris": ["https://<your-codespace-name>-3003.app.github.dev/callback"],
  "token_endpoint_auth_method": "none",
  "scope": "mcp:docs:search mcp:docs:read mcp:crm:log mcp:docs:share"
}
```

Copy the `client_id` value. You'll import it in the next step.

Notice three things:
- `client_id` equals the document's own URL. Controlling that HTTPS origin is the proof that this is Acme's document, the same proof a TLS certificate gives any website.
- `token_endpoint_auth_method: "none"` means Acme is a public client: We're not using a shared secret, we use PKCE instead. CIMD clients are public and thus can't use shared secrets at all. A confidential partner would use `private_key_jwt` with a `jwks_uri` on the same origin.
- Acme asks for **everything**, including `mcp:docs:share` and the Token Vault tools. Asking her isn't the same as receiving.

### Step 3: import the CIMD

<!-- TODO: screenshot here -->

1. Auth0 Dashboard → **Applications → Applications** → **Create Application** → **Import from URL**
2. Paste the CIMD URL from Step 2 → **Preview**.

    Auth0 fetches the document and validates it: HTTPS, no localhost, no redirects, 120-byte URL limit, `client_id` matching the URL, and allowed grant types and auth methods. Review the preview and any warnings.
3. Select **Create**.

*You should see: a new application named **Acme Partner Agent**. In **Settings**, its client is identified by the CIMD URL, it's a third-party application, and there's no client secret.*

Auth0 stores a copy of the metadata, but the partner's hosted document stays the source of truth. If Acme changes it (say, a new redirect URI), you pull the update with **Refresh Client Metadata**.

### Step 4: review and grant a smaller scope set

Review Acme's request against least privilege:

- `mcp:docs:search`, `mcp:docs:read`: a partner agent that answers questions from shared documents needs these. **Grant.**
- `mcp:docs:share`: an irreversible external share. **Don't grant** to a third party.
- `mcp:crm:log`: this acts in an *other* system with the employee's own federated credentials (Token Vault). **Don't grant** unless the partnership specifically requires it.

Now to implement that decision:

1. Auth0 Dashboard → **Applications → APIs → Nexus MCP Server → Application Access** tab
2. Find **Acme Partner Agent** → **Edit**
3. Under **User-Delegated Access**, select **Grant Access**, then select only:
    - `mcp:docs:search`
    - `mcp:docs:read`
4. Select **Save**.

This grant is what Auth0 enforces. When Acme requests all five scopes, the token it receives carries only these two.

### Step 5: give Acme's agent its own identity

1. Auth0 Dashboard → **Agents** → **Create New Agent**
2. Name it ***exactly*** `Acme Partner Agent (DevCamp)` → **Create**
3. On the new agent, open the **Applications** tab → **Add Application** → select **Acme Partner Agent** → confirm.

*You should see: a second agent record with its own `agt_...` ID, distinct from your first-party agent's.*

Once linked, every token Acme obtains through a normal login carries `act.sub` = this agent's ID and `client_profile: "ai_agent"`. Tenant logs record the agent ID on every token issuance, so the partner's activity is auditable separately from your own agent's.

### Step 6: connect as Acme and consent

Open Acme's login route in a new tab:

```
https://<your-codespace-name>-3003.app.github.dev/login
```

Acme discovers the MCP server and Auth0 (Step 1's chain), then starts Authorization Code + PKCE with:
- `client_id` = its CIMD URL
- `resource` = the MCP server's URL (RFC 8707)
- `code_challenge_method=S256`

Sign in as **alice@docagent.demo**.

> [!NOTE]
> **This is the first consent screen in this lab.** Every other application you've used is first-party, so Auth0 skips the prompt. Acme is a third party, so Auth0 shows Acme's `client_name` and the scopes it will actually receive, and asks you to approve.

*You should see: "Acme connected." with the granted scope `mcp:docs:search mcp:docs:read`.*

```bash
curl https://<your-codespace-name>-3003.app.github.dev/status
```

*You should see: `connected: true`, `client_id` = the CIMD URL, `aud` = the MCP server URL, and `act.sub` = Acme's `agt_...`.*

> [!NOTE]
> Acme can already call `search_documents` and `get_document` on the strength of this grant. **Auth for MCP** (the next module) finishes wiring your own first-party agent's access, then proves the two agents are distinct side by side.

## Checkpoint

Use the **Run Checks** button on the left of the Nexus app page. The in-app verifier confirms these conditions automatically:

- Acme serves a CIMD document Auth0 can import: HTTPS, not localhost, under 120 bytes, `client_id` equal to its URL, public client.
- **Client ID Metadata Document Registration** is on for the tenant.
- **Username-Password-Authentication** is a domain-level connection.
- A client with `external_client_id` = Acme's CIMD URL exists and is third-party.
- Acme's user-delegated grant on the Nexus MCP Server is exactly `mcp:docs:search` and `mcp:docs:read`.
- An agent named **Acme Partner Agent (DevCamp)** exists and is linked to Acme's client.
- Acme completed its consent flow and holds a token whose `client_id` is its CIMD URL and whose `aud` is the MCP server.

> [!TIP]
> If a check fails, the result row shows the exact reason. Fix the flagged item and select **Re-run checks**.

<details>
  <summary style='font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
  user-select: none;'>
    What we learned
  </summary>

A CIMD gets a partner's agent in front of you with no pre-shared secret and no open registration endpoint. Its URL is a stable, human-readable `client_id` that appears as-is in tokens and logs, and controlling that HTTPS origin is the proof of who published it.

The trust decision is still yours, and Auth0 gives it concrete shape:

- **Import** registers the partner as a strict third-party client. Consent is always shown, shared secrets are impossible, and only domain-level connections are allowed.
- **A per-app grant** sets the ceiling on what it can ever receive, whatever it asks for.
- **An agent record** gives it a durable identity in `act.sub` and in tenant logs, separate from your own agent.

On-Behalf-Of exchange stays a first-party pattern: a backend you own, exchanging a token for its own API, using a confidential Custom API client. A third party authenticates employees directly, with their consent, and holds no credential of yours.

Why this matters beyond the lab:

- **Security.** Every partner integration is a distinct, revocable identity with a reviewed scope set. Pulling a partner's access means deleting one grant or one client, not untangling a shared credential.
- **GTM.** "Partners register with a domain-verified metadata document, an admin approves a least-privilege grant, and every employee consents" is exactly what a security questionnaire wants to read.

</details>

---

<details>
  <summary style='font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
  user-select: none;'>
    Further reading
  </summary>

- Register applications with CIMD: [auth0.com/docs/get-started/auth0-overview/create-applications/register-applications-with-cimd](https://auth0.com/docs/get-started/auth0-overview/create-applications/register-applications-with-cimd)
- Manual CIMD registration for MCP clients: [auth0.com/ai/docs/mcp/guides/registering-your-mcp-client-application/manual-cimd-registration](https://auth0.com/ai/docs/mcp/guides/registering-your-mcp-client-application/manual-cimd-registration)
- Third-party applications: [auth0.com/docs/get-started/applications/third-party-applications](https://auth0.com/docs/get-started/applications/third-party-applications)
- Agent identity in tokens: [auth0.com/docs/ai-agents-mcp/agent-as-principal/agent-identity-in-tokens](https://auth0.com/docs/ai-agents-mcp/agent-as-principal/agent-identity-in-tokens)
- MCP authorization spec (2025-11-25), Client ID Metadata Documents: [modelcontextprotocol.io/specification/2025-11-25/basic/authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- RFC 7591 Dynamic Client Registration (the alternative CIMD avoids; see `server/acme/cimd.js`)

</details>

---

#### <span style="font-variant: small-caps">Congrats!</span>

*You've completed this module.*

You've successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      Discovered the MCP server and Auth0 the way any third-party MCP client does;
  </li>
  <li style="list-style-type:'✅ '">
      Imported a partner's CIMD as a third-party client and granted it a reviewed, read-only scope set;
  </li>
  <li style="list-style-type:'✅ '">
      Given the partner's agent its own Agent as Principal identity;
  </li>
  <li style="list-style-type:'✅ '">
      Confirmed Acme can call its granted tools and connected as alice with explicit consent.
  </li>
</ul>

Two agents now have fully separable identities and admin-decided access, but neither can call a tool yet. The next module, **Auth for MCP**, grants your first-party agent's client access to the MCP server and proves the two agents are distinct.

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
