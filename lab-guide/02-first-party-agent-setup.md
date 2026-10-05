## Objective *(~15 min)*

<!-- TODO: Flow screenshot here - Agent Identity -->

We need to give your first-party Nexus agent the two things it needs to call tools on behalf of employees:

- A first-class identity through **Agent as Principal** with its own `agent_id`.
- A **Custom API client** (linked to that agent) that will perform the On-Behalf-Of (OBO) token exchange.

By the end, you'll understand:

- What Agent as Principal is, and why a durable `agent_id` beats treating a client's credentials as the agent's identity.
- Why OBO requires a **Custom API client** linked to the API whose tokens it exchanges.

## Dashboard steps

> [!NOTE]
> **You need to create two things:**
> - **Agent record (Agent as Principal)**: the agent's unique Auth0 identity. Its `agent_id` is what shows up in the exchanged token's `act.sub` claim and in Auth0 logs, independent of whichever client authenticates it.
> - **Custom API client `nexus-agent-obo`**: performs the OBO exchange server-side. Auth0 only lets a Custom API client (`app_type: resource_server`) run OBO, and only on tokens issued for the API it's linked to, which here is the Nexus Agent API.

### Part A: Register the agent as a first-class Auth0 identity

<!-- TODO: Need to validate that the Agent as principal is turned on for every tenant by default. -->

**Step 1: Create the agent record**

1. Auth0 Dashboard → **Agents** → **Create New Agent**
2. Name it ***exactly*** `Nexus Agent (DevCamp)`. The app looks it up by name.
3. Select **Create**.

*You should see: the new agent record with a generated **Agent ID** in the form `agt_...`.*

<!-- TODO: put in a screenshot here for what it looks like -->

**Step 2: Note the Agent ID**

Copy the **agt_...** value somewhere handy. You'll see it as `act.sub` on the exchanged token once the client is linked to it (Part B, Step 3) and the MCP server grants it access in **Auth for MCP**.

### Part B: Create the Custom API client for OBO token exchange

<!-- TODO: screenshot here for the flow -->

The OBO exchange will take the employee's token for the **Nexus Agent API** and exchange it for one for the **Nexus MCP Server**. You'll wire the exchange itself up in the next modules; here you just create the client that performs it.

**Step 1: Create the client from the Nexus Agent API**

1. Auth0 Dashboard → **Applications → APIs → Nexus Agent API**
2. Select **Add Application**.
3. Name it `nexus-agent-obo` → **Add**.

Creating it from the API screen makes it a **Custom API Client** linked to the Nexus Agent API. That link is how Auth0 knows this client may exchange tokens issued for that API.

**Step 2: Turn on On-Behalf-Of Token Exchange for the client**

This toggle is a security posture choice and must be turned on explicitly.

1. Auth0 Dashboard → **Applications → Applications → nexus-agent-obo → Settings**
2. Scroll to the **Token Exchange** section.
3. Turn on **On-Behalf-Of Token Exchange** → **Save**.

![Token Exchange section with On-Behalf-Of Token Exchange toggled on](images/01-obo-token-exchange-enabled.png)

**Step 3: Link the client to the agent record**

1. Auth0 Dashboard → **Agents** → **Nexus Agent (DevCamp)** → **Applications** tab
2. Select **Add Application**.
3. Select `nexus-agent-obo` and confirm.

<!-- TODO: this step needs a screenshot of the Agent's Applications tab with `nexus-agent-obo` added. -->

**Step 4: Add the client's credentials to `.env`**

From the `nexus-agent-obo` application settings, copy the **Client ID** and **Client Secret**. Open `demo-app/.env` and add:

```
AUTH0_OBO_CLIENT_ID=<client-id-from-dashboard>
AUTH0_OBO_CLIENT_SECRET=<client-secret-from-dashboard>
```

> [!NOTE]
> This is, again, first-party agent specific. You own this agent, so you can trust it with a client id/secret to authenticate directly to Auth0

**Step 5: Restart the app**

If the app doesn't auto-refresh, stop the running app (`Ctrl+C`) and restart it:

```bash
npm run dev
```

> [!CAUTION]
> # DO NOT LOG IN UNTIL MODULE 5.

## Code review

> [!NOTE]
> This code is already implemented. **You aren't writing new code in this DevCamp.**

### Agent as Principal claims

Once `nexus-agent-obo` is linked to `Nexus Agent (DevCamp)` and granted access to the MCP server (next modules), every OBO token Auth0 issues for the Nexus MCP Server will look like this:

```json
{
  "sub": "auth0|alice...",
  "sub_profile": "user",
  "aud": "https://<codespace>-3001.app.github.dev",
  "client_id": "<nexus-agent-obo client id>",
  "client_profile": "service ai_agent",
  "scope": "mcp:docs:search",
  "act": {
    "sub": "agt_...",
    "sub_profile": "ai_agent",
    "client_id": "<nexus-agent-obo client id>",
    "act": { "sub": "<SPA client id>", "sub_profile": "browser_app" }
  }
}
```

The employee stays the subject. The outer `act` is the agent. The nested `act` is where the request started, the SPA. **server/mcp/server.js** logs the full decoded payload on every tool call, and the **Tool Logs** panel shows the caller block for each entry.

The `client_id` is the exchanger's credential. The agent record's `agent_id` is the agent's *durable identity*. Rotate the client's secret, or swap in a different client for another region, and the `agent_id` in tokens and logs stays the same.

## Checkpoint

<!-- TODO: screenshot - Run Checks panel -->

Use the **Run Checks** button on the left of the Nexus app page. The button confirms you completed the above steps correctly.

> [!TIP]
> If a check fails, the result should show the exact reason. Fix the flagged item and select **Re-run checks**.

---

#### <span style="font-variant: small-caps">Congrats!</span>

*You've completed this module.*

You've successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      Registered the agent as a first-class Auth0 identity;
  </li>
  <li style="list-style-type:'✅ '">
      Created a Custom API client, turned on OBO token exchange, and linked the client to the agent record;
  </li>
  <li style="list-style-type:'✅ '">
      Added the client's credentials to the app so it can perform OBO exchanges once it's granted access.
  </li>
</ul>

Your first-party agent has a durable identity and an exchanging client, but it can't call any tools yet. The next module onboards a second agent (a third party's this time).

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
