# Module 06: End-to-End

## Premise

Five core modules, five layers. This closing run drives the full Nexus workflow and confirms every control fires in one sequence.

## Objectives

- Drive Nexus through a happy-path document workflow as Alice.
- Drive a second sequence that trips CIBA (external document share).
- Run each negative test to confirm the guardrails hold.
- Read the logs and map each line to the layer that produced it.

## Prerequisites

- Modules **01** through **05** wired up.
- Your tenant is provisioned, meaning the Nexus API, MCP API, SPA client, M2M client, and CRM connection are already in place.
- The app is running: frontend :5173, API :3000, MCP :3001, CRM mock :3002.
- Demo users: `alice@docagent.demo` (engineering team, editor on q3-roadmap), `bob@docagent.demo` (all-company docs only).

## Happy path: engineering document workflow

1. Log in as Alice.
2. Prompt: *"Find everything we have on the Q3 roadmap."*
3. Expected:
   - Tool call `search_documents` returns `q3-roadmap` and `product-spec-v2` (both engineering).
   - Badges on the tool card: **FGA + MCP (OBO)**.
4. Prompt: *"Read the Q3 roadmap."*
5. Expected:
   - Tool call `get_document` with `documentId: q3-roadmap` returns full content.
   - Badges: **FGA + MCP (OBO)**.
6. Prompt: *"Log in the CRM that I read the Q3 roadmap."*
7. Expected:
   - Tool call `log_crm_activity` triggers Token Vault to mint a CRM credential for Alice, logging the activity with her `sub`.
   - Badges: **Token Vault → CRM + MCP (OBO)**.
   - Server log: `[Token Vault] (live) federated token for auth0|alice @ crm`

## CIBA path: external document share

8. Prompt: *"Share the Q3 roadmap with external@partner.com."*
9. Expected: Device Approval card shows `Nexus: share "Q3 Product Roadmap" with external@partner.com — approve?`
10. Approve out-of-band:

```
curl http://localhost:3000/api/ciba/pending
# copy the authReqId
curl -X POST http://localhost:3000/api/ciba/approve/<authReqId>
```

11. The UI flips; the share executes with a `sharedAt` timestamp.

## Negative tests

### FGA deny — outside department

- Log in as Bob.
- Prompt: *"Show me the Q3 roadmap."*
- Expected: `[FGA] Check: user:auth0|<bob_sub> can_read document:q3-roadmap -> DENIED`. No content returns.

### FGA deny — confidential document

- Logged in as Alice or Bob.
- Prompt: *"Find the compensation review."*
- Expected: `search_documents` returns zero results. `get_document` with `documentId: compensation-q3` returns `Access denied`.

### FGA deny — share as viewer

- Log in as Bob.
- Prompt: *"Share the employee handbook with external@partner.com."*
- Expected: `[FGA] Check: user:auth0|<bob_sub> can_share document:handbook -> DENIED`. Bob can read it but not share it.

### CIBA timeout

- Initiate a share request. Do not approve.
- After 300 seconds, `/api/ciba/status/:id` returns `denied`. The share is aborted.

### Missing scope

- In the Auth0 dashboard, remove `mcp:docs:share` from the M2M app's authorized scopes.
- Prompt: *"Share the Q3 roadmap with external@partner.com."*
- Expected: `403 { "error": "Insufficient scope", "required": "mcp:docs:share" }`.

### CRM unlinked

- Call `GET /api/setup/status` and confirm `isProvisioned: true`.
- If the vault was never seeded for the session, log in and call a non-CRM tool first to trigger seeding, then retry.
- Alternatively, simulate by pointing `VAULT_CONN_CRM` at a non-existent connection name and restarting.

## Reading the logs

For a single end-to-end prompt, the trace looks roughly like:

```
Authenticated request from user: auth0|alice
[LLM] Tool call: search_documents { query: "Q3 roadmap" }
[MCP Client] Exchanging user token for MCP-scoped token...
[MCP Client] Token exchange successful -- MCP token acquired
[MCP Server] Tool call: search_documents, sub=auth0|alice, scopes=mcp:docs:search,...
[FGA] Check: user:auth0|alice can_read document:q3-roadmap -> ALLOWED
[FGA] Check: user:auth0|alice can_read document:product-spec-v2 -> ALLOWED
[MCP Server] Tool search_documents executed
```

The same user `sub` flows through every hop, giving you one audit key for every downstream decision.

## What you learned

Five controls are stacked behind one MCP server: MCP with CIMD, OBO, and PRM; Authentication; Token Vault; CIBA; and FGA. Each one mitigates a specific risk:

- MCP (Module 01) prevents anonymous callers and agent-framework lock-in on your authorization code.
- JWT validation (Module 02) prevents unauthenticated use and anchors every downstream decision to a person.
- Token Vault (Module 03) prevents shared-credential sprawl.
- CIBA (Module 04) prevents unilateral irreversible actions.
- FGA (Module 05) prevents cross-user document access.

The commercial payoff is substantial: a document agent that helps users find and share information faster than a manual workflow accelerates go-to-market, passes security review cleanly because every decision is auditable, and does not require re-buying identity work every time the agent runtime changes, which keeps opex down on the platform team.

That is the full Nexus workshop. The starter code you just ran through is the reference implementation for the pattern.

#### <span style="font-variant: small-caps">Congrats!</span>

*You have completed the end-to-end run.*

You should have successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      driven a full happy-path document workflow through every control;
  </li>
  <li style="list-style-type:'✅ '">
      tripped CIBA on an external share and approved it out-of-band;
  </li>
  <li style="list-style-type:'✅ '">
      run each negative test and confirmed the guardrails hold;
  </li>
  <li style="list-style-type:'✅ '">
      traced a single user <code>sub</code> through every hop in the logs.
  </li>
</ul>
