# End-to-End

## Premise

Four core modules plus the bonus, five pillars. This closing run drives the full wholesale-quote workflow and confirms every control fires in one deal.

## Objectives

- Drive Z-Merchant through a happy-path quote for Acme.
- Drive a second deal that trips CIBA (25% discount, net-60).
- Run each negative test to confirm the guardrails hold.
- Read the logs and map each line to the pillar that produced it.

## Prerequisites

- Modules **02** through **05** wired up (and the CIBA bonus, if you ran it).
- Your tenant is provisioned on launch, so the RetailZero API audience, MCP audience, SPA client, and M2M client are already in place. (Self-hosting `starter/`? Populate `.env` and run `cd starter && npm run dev`.)
- The app is running -- frontend :5173, API :3000, MCP :3001, third-party mock :3002.
- Demo users: `alice@retailzero.demo` (owns acme + globex), `bob@retailzero.demo` (manages team-west -> initech).

## Happy path: Acme Q3 tier-2 quote

1. Log in as Alice.
2. Prompt: *"Generate Q3 bulk quote for Acme Corp, 500 units SKU-WX-42 at tier-2 pricing."*
3. Expected:
   - Tool call `get_catalog_and_buyer_tier` -- success with `account.tier=2` and the tier-2 price.
   - Badges on the tool card: **FGA + MCP (OBO)**.
4. Prompt: *"Draft the quote as a Google Doc."*
5. Expected:
   - Tool call `create_google_doc` -- returns `documentId` and `url`.
   - Badges: **Token Vault -> Google + MCP (OBO)**.
6. Prompt: *"Post a triage summary to #wholesale-quote-triage."*
7. Expected:
   - Tool call `post_slack_triage` -- returns Slack `ts` and `permalink`.
   - Badges: **Token Vault -> Slack + MCP (OBO)**.
8. Prompt: *"Commit the Acme Q3 quote at 15% discount net-30."*
9. Expected: commit lands directly (standard terms -- no CIBA).

## CIBA path: non-standard terms

10. Prompt: *"Commit the same quote at 25% discount net-60."*
11. Expected: Device Approval card shows `Approve 25% discount, net-60 on quote for acme?`.
12. Approve out-of-band:

```
curl http://localhost:3000/api/ciba/pending
# copy the authReqId
curl -X POST http://localhost:3000/api/ciba/approve/<authReqId>
```

13. The UI flips; commit completes with `committedAt` timestamp.

## Negative tests

### FGA deny

- Prompt: *"Look up pricing for SKU-WX-42 on Initech."*
- Expected: `FGA deny: user:... cannot read account:initech`. Initech belongs to team-west; Alice is not a member.

### CIBA timeout

- Start a non-standard commit. Do not approve.
- After 300 seconds, `/api/ciba/status/:id` returns `denied`. Commit aborts.

### Missing scope

- In the Auth0 dashboard, remove `mcp:docs:create` from the M2M app's authorized scopes, then restart the backend.
- Prompt: *"Draft a Google Doc."*
- Expected: `MCP denied create_google_doc -- insufficient scope (need mcp:docs:create)`.

### Vault unlinked

- Call `POST /api/vault/unlink` with `{ "provider": "slack" }`.
- Prompt: *"Post a triage summary."*
- Expected: `slack not linked`. Relink via `POST /api/vault/link`.

### Cross-rep spoofing

- Log in as Bob.
- Prompt: *"Commit the Acme quote."*
- Expected: `FGA deny: commit account:acme`. Bob can read Initech through team-west but cannot commit on Acme.

## Reading the logs

For a single end-to-end prompt, the trace looks roughly like:

```
[Auth]  validated JWT: sub=auth0|alice aud=https://devcamp-retailzero-api
[LLM]   tool call: get_catalog_and_buyer_tier { accountId: "acme", sku: "SKU-WX-42" }
[MCP client] OBO exchange -> audience=https://devcamp-mcp-server resource=https://devcamp-mcp-server
[MCP srv] validated JWT: sub=auth0|alice aud=https://devcamp-mcp-server
[MCP srv] scope check mcp:quote:read OK
[FGA]   check can_read user:auth0|alice account:acme -> allow
[MCP srv] -> { account: acme (tier 2), sku: WX-42 @ 42.50 }
```

The same rep `sub` flows through every hop, which gives you one audit key for every downstream decision.

## What you learned

Five controls -- Authentication, FGA, Token Vault, MCP with CIMD + OBO + PRM, and the CIBA bonus -- stacked behind one agent. Each one is a lever on a specific risk:

- JWT validation kills unauthenticated use.
- FGA kills cross-customer data access.
- Token Vault kills shared-credential sprawl.
- MCP kills agent-framework lock-in on your authorization code.
- CIBA kills unilateral commits on non-standard terms.

The commercial shape of that: a wholesale quote agent that closes deals faster than the manual desk (GTM acceleration), reviews cleanly with the security team (shorter procurement cycle), and does not re-buy identity work every time the agent runtime changes (lower opex on the platform team).

That is the full RetailZero Z-Merchant workshop. The starter code you just finished is the reference implementation for the pattern; the `solution/` tree mirrors it one-to-one for comparison.

#### <span style="font-variant: small-caps">Congrats!</span>

*You have completed the end-to-end run.*

You should have successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      driven a full happy-path quote for Acme through every control;
  </li>
  <li style="list-style-type:'✅ '">
      tripped CIBA on a non-standard discount and approved it out-of-band;
  </li>
  <li style="list-style-type:'✅ '">
      run each negative test and confirmed the guardrails hold;
  </li>
  <li style="list-style-type:'✅ '">
      traced a single rep <code>sub</code> through every hop in the logs.
  </li>
</ul>
