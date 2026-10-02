## Objective *(~15 min)*

<!-- TODO: Flow screenshot here - CIMD discovery document to manual admin review to a second Agent as Principal record. -->

Nexus doesn't just talk to its own first-party agent. In the real world, a partner ships a custom agent of their own and asks for access to your MCP server.

This module walks through onboarding that second agent, "Acme Partner Agent," the same way a real enterprise onboards a vendor's agent after security review: the vendor publishes a discovery document, an admin reviews it, and only then does the admin hand-provision a trust relationship.

By the end, you'll understand:

- Why Client ID Metadata Documents (CIMD) have no cryptographic proof of ownership, so there's no automated way to turn one into a trust decision.
- Why a manual admin review is the only spec-accurate path today, not a shortcut you're taking because the automation isn't built yet.
- How a second Agent as Principal record gives the partner's agent its own durable identity, scoped identically to your first-party agent but fully distinguishable from it.
- How to confirm Nexus's OBO-exchanged token carries an `act.sub` claim naming the acting agent, while Acme's directly-granted token carries no `act` claim at all, even though both enforce the same scopes identically.

## What's provisioned for you

Nothing in this module is auto-provisioned. That's the point: a third party's agent is never something your tenant creates on its own. You, acting as the admin, hand-provision every piece.

Your tenant already has the pieces from *One trust boundary for every agent*: the Nexus Backend API with its four `mcp:*` scopes, plus a fifth scope, `mcp:github:read`, used by the Token Vault GitHub tool later. Acme's agent will request the same scopes.

### First-party vs. third-party, at a glance

|  | First-party (Nexus Agent) | Third-party (Acme Partner Agent) |
|---|---|---|
| Who builds the agent | Your team | A vendor, outside your tenant |
| Where it's discovered | Not discovered — you built it, you know it | A CIMD document the vendor publishes |
| Where that CIMD document lives | N/A | Acme's own server, on its own port; in production, the vendor's own domain |
| What decides trust | Nothing to decide — it's yours | A human admin, reviewing requested scopes |
| Agent record | `Nexus Agent (DevCamp)` | `Acme Partner Agent (DevCamp)` |
| Credential type | Confidential M2M client (OBO exchange) | Public native client (PKCE, no secret) |
| Access granted | Four (then five) `mcp:*` scopes | The identical scope set |
| What's different in the token | `act.sub` = the Nexus agent's `agt_...` id | No `act` claim at all — the token's own `sub` is Acme's granted identity |

Same access, same enforcement, two fundamentally different grant types. One token carries an `act.sub`; the other doesn't need to.

## Dashboard steps

> [!NOTE]
> **CIMD has no cryptographic ownership proof.** A Client ID Metadata Document is just a URL an authorization server fetches at registration time. Nothing cryptographically ties that document to the vendor who published it. Auth0 doesn't automate a path from "I fetched this document" to "I trust this agent" — and no MCP-ecosystem tool does today. The only spec-accurate way to onboard a third party is the manual admin trust decision below.

### Step 1: discover the resource

Fetch the Protected Resource Metadata document. This is the same document any MCP client fetches first, first-party or third-party, so there's nothing new here.

```bash
curl https://<your-codespace-url>-3001.app.github.dev/.well-known/oauth-protected-resource
```

*You should see: `resource`, `authorization_servers`, and `scopes_supported` listing the four `mcp:*` scopes plus `mcp:github:read`.*

### Step 2: discover the third party's CIMD document

Now fetch Acme's self-published client metadata, hosted on Acme's own server.

> [!NOTE]
> **Acme really is a separate server in this lab.** It runs as its own Express process (`demo-app/server/acme/`), on its own port, independent of Nexus's MCP server. That's deliberate: a genuine third party publishes its CIMD document on its own domain, not on yours. That's the whole point of CIMD: the document lives wherever the vendor says it lives, and the URL *is* the `client_id` — there's no registry to look it up in.

```bash
curl https://<your-codespace-url>-3002.app.github.dev/.well-known/client-metadata
```

If you're running locally instead of in Codespaces, use `http://localhost:3002/.well-known/client-metadata`.

*You should see:*

```json
{
  "client_id": "https://.../.well-known/client-metadata",
  "client_name": "Acme Partner Agent",
  "grant_types": ["authorization_code"],
  "redirect_uris": ["http://localhost:3002/callback"],
  "token_endpoint_auth_method": "none",
  "scope": "mcp:docs:search mcp:docs:read mcp:crm:log mcp:docs:share mcp:github:read"
}
```

This is Acme's entire pitch for access: a name, a redirect URI, and a requested scope list. Nothing more. The `client_id` is the URL of the document itself, self-referential to Acme's own server — CIMD is self-referential by design, so there's no separate registration step to forge or spoof around. `token_endpoint_auth_method: "none"` is the detail to remember here: Acme is declaring itself a public client from the start, with no secret and no credential to exchange.

### Step 3: review the requested scopes (manual, no automation exists)

Before trusting anything, review Acme's requested scope list against least privilege.

- Does `mcp:docs:search` and `mcp:docs:read` make sense for a partner agent that needs document access? Yes.
- Does `mcp:crm:log` make sense? Only if the partnership calls for CRM activity logging.
- Does `mcp:docs:share` make sense for a partner agent, given it triggers an external share and a CIBA approval? Only if the partnership explicitly requires it.

There's no automated gate for this today. No tool in Auth0 or the broader MCP ecosystem evaluates a CIMD document and emits an approve/deny decision. A human reviews the request and decides, exactly like approving any other vendor's access request.

### Step 4: hand-provision the trust artifacts

Once you decide to trust Acme, you provision two artifacts by hand: an agent record for its durable identity, and a public Auth0 application for its actual sign-in credential. The CIMD document itself can never be used as a credential — it just describes what Acme is asking for. The application below is the real thing: a public client with no secret, since Acme authenticates its own users directly through standard consent, not through a shared service credential.

**Create the agent record:**

1. Auth0 Dashboard → **Agents** → **Create New Agent**
2. Name it ***exactly*** `Acme Partner Agent (DevCamp)`
3. Click **Create**

*You should see: a new agent record with a generated **Agent ID** in the form `agt_...`, distinct from your first-party agent's ID.*

**Create the public native application:**

1. Auth0 Dashboard → **Applications** → **Create Application**
2. Name it `Acme Partner Agent`
3. Choose **Native** as the application type → **Create**

*You should see: a new application with no client secret displayed, since native applications authenticate without one.*

**Turn off first-party status:**

1. On the new application's **Settings** tab, scroll to **Advanced Settings → Application Properties**
2. Turn off **This is a first party application** → **Save Changes**

This is the detail that makes Acme behave like a real third party. Every other application in this lab is first-party, so Auth0 skips the consent screen for them. With first-party status off, Auth0 shows Acme's users a real consent screen before granting any scope — the first time you'll see one in this lab.

**Set the allowed callback URL:**

1. Still on the **Settings** tab, find **Application URIs → Allowed Callback URLs**
2. Add `http://localhost:3002/callback` (or your Codespace equivalent, `https://<your-codespace-url>-3002.app.github.dev/callback`) → **Save Changes**

**Grant the application access to the Nexus Backend API:**

1. Auth0 Dashboard → **Applications → APIs → Nexus Backend API → Applications tab**
2. Confirm the new `Acme Partner Agent` application is listed with the same scope set Acme requested in its CIMD document:
   - `mcp:docs:search`
   - `mcp:docs:read`
   - `mcp:crm:log`
   - `mcp:docs:share`
   - `mcp:github:read`

This is the same scope set `docagent-mcp-obo` holds for the first-party agent — Acme's agent gets identical access, just under a separate, independently auditable identity, and without a shared credential of any kind.

**Link the public application to the agent record:**

1. Auth0 Dashboard → **Agents** → **Acme Partner Agent (DevCamp)** → **Applications** tab
2. Click **Add Application**
3. Select `Acme Partner Agent` and confirm

**Add the client ID to `.env`:**

From the `Acme Partner Agent` application settings, copy the **Client ID**. Open `demo-app/.env` and add:

```
AUTH0_ACME_CLIENT_ID=<client-id-from-dashboard>
```

There's no secret to copy. This is a public client — the whole point is that it has none.

Restart the app (`Ctrl+C`, then `npm run dev`) if it doesn't auto-refresh.

### Step 5: prove the two agents are distinct

First, connect as Acme. Visit:

```
http://localhost:3002/login
```

(or your Codespace equivalent). This kicks off Acme's own Authorization Code + PKCE flow directly against Auth0 — no client secret involved, since Acme is a public client. Log in and approve the requested `mcp:*` scopes.

> [!NOTE]
> **This is the first real consent screen in this lab.** Every other application you've used so far is first-party, so Auth0 skips the prompt. Acme isn't first-party, so Auth0 asks you to explicitly approve what it's requesting, exactly like signing in to a vendor's app with your work account.

Confirm the connection:

```bash
curl http://localhost:3002/status
```

*You should see: `{"connected": true, "sub": "...", "scope": "..."}`.*

Now open the **Tool Tester** tab in the Nexus app and compare the two agents.

1. Set **Call as** to **Nexus Agent (first-party)**. Call `search_documents` with any query.
2. Open the **Tool Logs** panel and note the `act.sub` value — it's Nexus's OBO-exchanged token, so it carries an `act` claim identifying the first-party agent.
3. Set **Call as** to **Acme Partner Agent (third-party)**. Call the same tool with the same query.
4. Check **Tool Logs** again — this token has no `act` claim at all. Acme never exchanged anything; its token's own `sub` directly reflects the identity it was granted through consent.

Both calls succeed with the same scopes and identical enforcement, but by fundamentally different grant types: one arrives through token exchange with an `act.sub` naming the acting agent, the other arrives through a direct, user-delegated authorization with no exchange step at all. That's the proof point: the MCP server's authorization is grant-type-agnostic. It enforces scope the same way regardless of how the caller got its token.

## Checkpoint

Use the **Run Checks** button on the left of the Nexus app page. The in-app verifier confirms these conditions automatically:

- The third-party CIMD document is discoverable at Acme's own `/.well-known/client-metadata` endpoint and has the expected shape (name, redirect URIs, scope list). This is a shape check only — no cryptographic verification exists, so it doesn't claim to prove ownership.
- The Management API confirms the Acme application is genuinely public: no retrievable secret, `token_endpoint_auth_method: "none"`.
- An agent named **Acme Partner Agent (DevCamp)** exists and is linked to that public application.
- Acme has completed its PKCE consent flow — its `/status` endpoint reports `connected: true`.

> [!TIP]
> If a check fails, the result row shows the exact reason. Fix the flagged item and click **Re-run checks**.

<details>
  <summary style='font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
  user-select: none;'>
    What we learned
  </summary>

CIMD gets a vendor's agent in front of you with zero pre-shared secrets, but it stops there by design. There's no cryptographic signature tying the document to its publisher, so Auth0 — and every other MCP-ecosystem tool today — treats it as a discovery artifact, not a credential. Trust still comes from a human decision.

Once you make that decision, the mechanism is agent-record-plus-public-client-and-PKCE-consent: a durable `agent_id` paired with a public application that Acme's own users consent to directly. The partner's agent gets its own identity and its own audit trail, fully separable from your first-party agent even though both carry identical scopes.

On-behalf-of token exchange is correctly reserved for first-party agents acting on behalf of a backend you own, like Nexus exchanging a user's token to call its own MCP server. A genuine third party should never hold a shared service credential like that. It gets its own user-delegated token through standard consent instead, exactly as Acme does here.

Why this matters beyond the lab:

- **Security.** Every vendor integration gets a distinct, revocable identity. Pulling a partner's access later means deleting one agent record and one client, not auditing which calls came from which shared credential.
- **GTM.** A documented manual-review step for third-party agents is exactly what a security questionnaire asks for. It's a defensible, repeatable process rather than an ad hoc exception.

</details>

---

<details>
  <summary style='font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
  user-select: none;'>
    Further reading
  </summary>

- Agent as Principal (Early Access): [auth0.com/docs/ai-agents-mcp/agent-as-principal](https://auth0.com/docs/ai-agents-mcp/agent-as-principal)
- MCP authorization spec (2025-11-25), Client ID Metadata Documents: [modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)
- RFC 7591 Dynamic Client Registration (the alternative CIMD avoids — contrast noted in `server/acme/cimd.js`)

</details>

---

#### <span style="font-variant: small-caps">Congrats!</span>

*You've completed this module.*

You've successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      Fetched a third party's self-published CIMD document and reviewed its requested scopes;
  </li>
  <li style="list-style-type:'✅ '">
      Hand-provisioned a separate Agent as Principal record and a public client for that third party;
  </li>
  <li style="list-style-type:'✅ '">
      Granted it the same scoped access as your first-party agent;
  </li>
  <li style="list-style-type:'✅ '">
      Confirmed Nexus's token carries an <code>act.sub</code> claim while Acme's carries none at all, despite both calls succeeding with identical scope enforcement.
  </li>
</ul>

Two agents now call Nexus with equivalent access and fully separable identities. The next module anchors every one of those calls to a real, verified employee.

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
