# Nexus DevCamp redesign: third-party agent onboarding (CIMD + PRM + Agent as Principal) and dual-provider Token Vault

> This document is the implementation plan for a fresh-context build agent. It was produced via a research + planning session covering `demo-app/server/mcp/*`, `demo-app/server/platform/*`, `demo-app/server/token-vault/vault.js`, `demo-app/server/index.js`, `demo-app/server/routes/guide.js`, `demo-app/src/App.jsx`, `demo-app/src/components/ModuleChecks.jsx`, `demo-app/src/components/VaultStatus.jsx`, and `lab-guide/02`, `04`, `06`, `07`. Read those files directly before starting — this plan describes what to change, not the full current implementation.

## Context

This repo's entire premise is showing how third-party agents (Claude, Gemini, ChatGPT, Copilot, a partner's custom agent) connect to a first-party MCP server protected by Auth0 Auth for MCP. Today the lab only teaches **first-party** onboarding (Module 02's Agent as Principal + OBO M2M client) — the actual third-party path (CIMD self-registration → PRM discovery → manual admin trust decision → a *separate* Agent-as-Principal identity with equivalent access) is unbuilt. `demo-app/server/mcp/cimd.js` already exists and its own code comments say it's for third-party discovery, but nothing exercises it, and it currently squats on the same display name (`"Nexus Agent (DevCamp)"`) as the real first-party agent record — a collision that must be fixed regardless.

Separately, the Token Vault module (currently Module 04) teaches the Token Vault pattern against a self-hosted CRM mock only. We're adding a second, real external IdP (GitHub, via Auth0's built-in social connection) **alongside** CRM — not replacing it — so participants see both a custom OAuth2 connection and a built-in social connection exchanged through the identical Token Vault mechanism, with the GitHub connection set up entirely by hand (real GitHub OAuth App + Auth0 connection), mirroring how a real enterprise admin would onboard a new federated credential.

## Decisions locked in

1. **Keep CRM and add GitHub as a second Token Vault provider** — do not remove CRM. Both connections, both tools, both checkpoint checks live side by side in the Token Vault module as a deliberate "custom OAuth2 vs. built-in social connection" contrast.
2. **GitHub connection setup is fully manual** — participant registers their own GitHub OAuth App, creates the Auth0 `github` social connection by hand, enables Token Vault purpose on it, and pastes the connection name into `.env`. No auto-provisioning, no shared Nexus-owned OAuth App.
3. **GitHub tool is a simple identity check** — `check_github_identity` calls `GET https://api.github.com/user` with the vaulted token and logs/returns the user's GitHub login, proving the per-user federated credential works. Simpler than a Gist-write, same teaching point (per-user token, not a shared bot).
4. This document (`REDESIGN_PLAN.md`) is the single source of truth for implementation — build directly from it.

## A. Dual-provider Token Vault (folds into the existing Token Vault module slot)

**`demo-app/server/token-vault/vault.js`** — generalize `connectionFor(tenant, provider)` to look up `tenant.deploymentData.vault_connections[provider]` instead of hardcoding `"crm"`. No other change to `getLiveToken`/`getToken`/`TokenVaultAccessDeniedError`/`seedVaultForUser` logic — only the provider string varies per call site. `seedVaultForUser` keeps its CRM in-memory seed and gains an equivalent GitHub in-memory seed (a fake GitHub login) for the offline fallback case.

**`demo-app/server/platform/provision.js`** — CRM provisioning (resource creation, demo users, etc.) is untouched. GitHub gets **no** provisioning-time connection creation (per decision 2): add a `vault_connections: { crm: "crm-${demoName}", github: null }` shape to `deploymentData`, where `github` is filled in later from the participant's manual `.env` paste (`VAULT_CONN_GITHUB`), read the same way `AUTH0_OBO_CLIENT_ID` already flows from manual `.env` entry into tenant config today. `deploymentDataToEnvVars`/`tenantResolver` need the new `VAULT_CONN_GITHUB` key alongside `VAULT_CONN_CRM`.

**`demo-app/server/platform/auth0Management.js`** — no new function needed. `createVaultConnection` stays as-is (used only for CRM); GitHub's connection is Dashboard-created by the participant, never passed through this helper.

**`demo-app/server/mcp/server.js`** — add a second scope `mcp:github:read` to `BACKEND_SCOPES` (provision.js), `TOOLS` array, and the AS/PRM metadata scope lists (`metadata.js`, the AS-metadata block in `server.js`). Add `check_github_identity` tool case: `getToken(userSub, "github", tenant, userAccessToken)` → `GET https://api.github.com/user` with the vaulted token → return `{ success: true, login, id }`, attributed to `userSub` in the response/log line exactly like `log_crm_activity` does today. `log_crm_activity`/`mcp:crm:log` stay unchanged.

**`demo-app/src/components/VaultStatus.jsx`** — generalize from a single CRM-labeled widget to one row per configured provider: read both `crmConnection` and `githubConnection` from `/api/config`, render a Connect/Disconnect/Check control for each (same `connectAccountWithRedirect({ connection, scopes: ["offline_access"] })` call shape, parameterized by connection name and label). `fetchStatus`'s `/api/vault/providers` check becomes a loop over both provider keys instead of a single `=== "crm"` check.

**`demo-app/server/index.js`** — `/api/config` returns both `crmConnection` and `githubConnection`; `/api/vault/disconnect` and `/api/vault/providers` become provider-parameterized instead of CRM-only; `REQUIRED_PROVISION_ENV_KEYS` keeps `VAULT_CONN_CRM` (auto-provisioned) but puts `VAULT_CONN_GITHUB` in the optional/manual set alongside `AUTH0_OBO_CLIENT_ID`, since it's filled in by hand after a Dashboard step, not at provision time.

## B. First-party Agent as Principal — minimal fix only

No structural change. The existing Module 02 flow (agent record → M2M client → link → `agent_subject_claims`) is already the correct, real mechanism per Auth0's actual Early Access capabilities — don't touch Parts A/B, the `/api/verify/module01` checks, or `provision.js`'s agent-related code.

**Required fix regardless of the third-party work:** `demo-app/server/mcp/cimd.js`'s `getClientMetadata()` currently returns `client_name: "Nexus Agent (DevCamp)"`, colliding with the real Agent-as-Principal record's name. Rename it to describe the third-party agent instead (see Section C) — this endpoint stops being vestigial and becomes the actual third-party discovery document exercised in the new module.

## C. Third-party agent onboarding: Acme's own server, CIMD + PRM, PKCE consent → manual admin trust decision → separate Agent as Principal (new module)

### The real-world model this teaches

CIMD per the MCP authorization spec has no cryptographic ownership proof — the metadata document is just a URL the AS fetches at registration time. Auth0 has no automated CIMD→Agent-as-Principal linking and no DCR automation. So the only spec-accurate way to onboard a third party is a **manual admin trust decision**: the vendor publishes a CIMD document on its own server, an admin reviews it, and only then hand-provisions a public application + a separate Agent-as-Principal record on the vendor's behalf — exactly how a real enterprise reviews a vendor's agent and grants it access after security review. Acme never gets a shared service credential; it gets a standard, user-consented, public-client sign-in, same as any OAuth app a user installs. This is the deliberate point of the module, not a workaround.

On-behalf-of token exchange stays a first-party-only pattern (Section B, unchanged): it exists for a backend you own exchanging a user's token to call your own MCP server. A genuine third party was never a candidate for that pattern — it authenticates its own users directly.

### Exact names (avoids the Section B collision, mirrors existing conventions)

- CIMD third-party `client_name`: `"Acme Partner Agent"`
- Third-party public Auth0 application: `Acme Partner Agent` (Native, no secret)
- Third-party Agent-as-Principal record: `"Acme Partner Agent (DevCamp)"`
- New `provision.js` constant: `THIRD_PARTY_AGENT_NAME = "Acme Partner Agent (DevCamp)"`

### Flow (new module, Dashboard steps)

1. **Discovery**: fetch `GET /.well-known/oauth-protected-resource` (existing `metadata.js`, unchanged — PRM describes the resource, not the caller, so no change needed for multi-consumer support) then `GET /.well-known/client-metadata` from Acme's own server to see the third party's self-published CIMD document.
2. **Manual admin review** (prose-only, no automation — state explicitly that none exists today): review the requested scopes against least privilege before trusting it.
3. **Admin hand-provisions trust artifacts**:
   - Agents → Create New Agent → name exactly `Acme Partner Agent (DevCamp)`.
   - Applications → Create Application → **Native** → name `Acme Partner Agent`. No client secret is issued.
   - Advanced Settings → turn off **This is a first party application**, so Auth0 shows a real consent screen.
   - Set the allowed callback URL to Acme's own `/callback` route.
   - Confirm the same four `mcp:*` scopes (now including `mcp:github:read`) as user-delegated access on the Nexus Backend API — same access as the first-party agent.
   - Link the public application to the agent record.
   - Paste into `.env`: `AUTH0_ACME_CLIENT_ID` (no secret, since this is a public client).
4. **Acme connects**: the participant visits Acme's own `/login` route, completes Auth0's Authorization Code + PKCE flow directly (no client secret), and approves the requested scopes at the first real consent screen in the lab. Acme's `/status` route then reports `connected: true`.
5. **Proof point**: call a tool as each agent (Tool Tester agent-selector) and compare tokens. Nexus's OBO-exchanged token carries an `act.sub` identifying the first-party agent; Acme's directly-granted token carries no `act` claim at all — its own `sub` is the identity Auth0 granted through consent. Both calls succeed with identical scope enforcement, proving the MCP server's authorization is grant-type-agnostic.

### Code changes

- **`demo-app/server/acme/`** (new): a standalone Express server, listening on `process.env.ACME_SERVER_PORT` (default `3002`), independent of the Nexus MCP server process. Routes:
  - `GET /.well-known/client-metadata` — Acme's self-hosted CIMD document (moved from `demo-app/server/mcp/cimd.js`), self-referential to Acme's own port, `client_name: "Acme Partner Agent"`, `token_endpoint_auth_method: "none"`, `grant_types: ["authorization_code"]`.
  - `GET /login` — starts the Authorization Code + PKCE flow (RFC 7636) against Auth0, using `AUTH0_ACME_CLIENT_ID` only (no secret).
  - `GET /callback` — exchanges the authorization code for a token and caches it in memory.
  - `GET /status` — returns `{ connected, sub, scope }` from the cached token.
  - `POST /api/call-tool` — proxies a tool call to the Nexus MCP server using Acme's cached user-delegated token.
- **`demo-app/server/mcp/cimd.js`**: removed. Its CIMD document and header comment move to `demo-app/server/acme/` as described above; nothing under `server/mcp/` serves third-party discovery anymore.
- **`demo-app/server/mcp/metadata.js`**: no change (confirmed single PRM document is correct for any number of consumers).
- **`demo-app/server/mcp/server.js`**: no change to `validateMCPToken`/`TOOLS`/scope enforcement — both agents' tokens target the same Backend API with the same scopes, so enforcement is already grant-type-agnostic. Optional: log `payload.act?.sub` on its own line in Tool Logs so the no-`act`-claim contrast in step 5 is visually obvious.
- **`demo-app/server/mcp/client.js`**: no third-party OBO config path — Acme never exchanges tokens. The Tool Tester's "Call as: Nexus Agent / Acme Partner Agent" selector routes Acme's calls through `server/acme/`'s own cached token (`POST /api/call-tool`) instead of through `mcpClient`'s OBO path. The main `/api/chat` path stays wired to the first-party agent, unchanged.
- **`demo-app/server/platform/provision.js`**: add `THIRD_PARTY_AGENT_NAME` constant; no third-party client provisioning of any kind — the public application is entirely hand-created in the Dashboard, same spirit as the first-party M2M client staying unprovisioned, but here there's no credential pair at all to leave `null`. `runDeprovision` adds `deleteAgentByName(ctx, THIRD_PARTY_AGENT_NAME)` and removes the public application by its env-var client ID, mirroring first-party teardown.
- **`demo-app/server/platform/auth0Management.js`**: no new functions — `findAgentByName`/`deleteAgentByName` are already generic over name; reused verbatim with different string arguments. No `createClient`/`grantClientToApi` call needed for Acme's application, since it's hand-created, not provisioned.
- **`demo-app/server/index.js`**: new `/api/verify/moduleXX` (id per Section D) with checks: `cimd_discoverable` (shape check only, fetched from Acme's own server now — no crypto verification exists, don't pretend otherwise), `thirdparty_client_is_public` (Management API confirms no secret, `token_endpoint_auth_method: "none"`), `thirdparty_agent_registered` (agent exists and is linked to the public client, same pattern as module01's `agent_registered`), `thirdparty_consent_granted` (Acme's own `/status` reports `connected: true`).
- **Env vars**: add `AUTH0_ACME_CLIENT_ID`, `ACME_SERVER_PORT`. Remove `AUTH0_OBO_THIRDPARTY_CLIENT_ID`, `AUTH0_OBO_THIRDPARTY_CLIENT_SECRET`, and any `thirdParty` M2M/OBO code paths.
- **`demo-app/src/components/ModuleChecks.jsx` / `demo-app/src/App.jsx`**: new case in `runChecks` mirroring case `"01"`; new id added to `LAB_MODULES` gate array.

## D. Module renumbering

Insert the new third-party module immediately after the current Module 02 (Auth for MCP) — it's a direct extension of the same resource server/OBO/Agent-as-Principal concepts and belongs before user auth/Token Vault/CIBA/FGA so Module 08 (end-to-end) can exercise both agents against the full stack. The Token Vault module keeps its existing slot (same module, dual-provider content per Section A) — no separate new module for GitHub.

| New filename | Internal id | Title | Status |
|---|---|---|---|
| `00-introduction.md` | `null` | Introduction | unchanged |
| `01-prerequisites.md` | `"00"` | Prerequisites | unchanged |
| `02-one-trust-boundary-for-every-agent.md` | `"01"` | Auth for MCP | Section B fix only |
| **`03-a-second-agent-knocks.md`** (new) | **`"02"`** | **Third-Party Agent Onboarding** | new, Section C |
| `04-every-agent-action-has-an-owner.md` | `"03"` | User Authentication | renumbered, unchanged content |
| `05-the-agent-acts-as-the-employee,-not-a-shared-bot.md` | `"04"` | Token Vault | renumbered, Section A (dual-provider) |
| `06-humans-approve-what-cant-be-undone.md` | `"05"` | CIBA | renumbered, unchanged content |
| `07-access-that-knows-where-it-ends.md` | `"06"` | FGA | renumbered, unchanged content |
| `08-putting-it-all-together.md` | `"07"` | End-to-End | renumbered, extended (both agents + both providers) |
| `99-conclusion.md` | `null` | Conclusion | unchanged |

Update together, consistently (this is the load-bearing 4-way checkpoint contract — see `demo-app/server/routes/guide.js`'s `LABS` array as the source of truth):
- `demo-app/server/routes/guide.js` `LABS` array — insert the new row, renumber every row after it.
- `demo-app/server/index.js` — add `/api/verify/module02` (new, third-party) and shift existing numbered endpoints up by one (`module02`→`04`, `module03`→`05`, `module04`→`06`), including the `module: "0X"` literal in each response body.
- `demo-app/src/components/ModuleChecks.jsx` — shift cases accordingly; new `case "02"` for the third-party module.
- `demo-app/src/App.jsx` `LAB_MODULES` — becomes `["01","02","03","04","05","06"]` (everything through FGA; End-to-End module `"07"` stays excluded from the hard gate, same pattern as today).

**Module 08 (End-to-End) additions**: prerequisite line for the new module's env vars and the GitHub Connected-Accounts link; a GitHub-flavored happy-path step (`check_github_identity`) alongside the existing CRM step; a new step calling the search tool as both agents via the Tool Tester selector, confirming Nexus's token carries `act.sub` while Acme's carries no `act` claim at all; "Missing scope" negative test optionally repeated against the **Acme Partner Agent** application as well as `docagent-mcp-obo`.

## Critical files

- `demo-app/server/token-vault/vault.js`, `demo-app/server/platform/provision.js`, `demo-app/server/platform/auth0Management.js` — Token Vault + provisioning
- `demo-app/server/mcp/cimd.js`, `demo-app/server/mcp/metadata.js`, `demo-app/server/mcp/server.js`, `demo-app/server/mcp/client.js` — CIMD/PRM/tool/OBO
- `demo-app/server/index.js`, `demo-app/server/routes/guide.js` — verify endpoints, checkpoint contract, config/vault routes
- `demo-app/src/components/ModuleChecks.jsx`, `demo-app/src/App.jsx`, `demo-app/src/components/VaultStatus.jsx` — frontend gating and provider UI
- `lab-guide/02-...md`, new `lab-guide/03-a-second-agent-knocks.md`, `lab-guide/05-...md` (renumbered Token Vault), `lab-guide/08-...md` (renumbered end-to-end) — apply the Microsoft Writing Style Guide to all new/edited prose (sentence-case headings, active voice, contractions, serial comma, no filler "you can")
- `README.md` — update module table to match Section D's lineup

Reuse, don't reinvent: `findAgentByName`/`deleteAgentByName`/`createClient`/`grantClientToApi`/`mgmt()` (`auth0Management.js`), the module01 verify-check pattern (`demo-app/server/index.js`), `connectAccountWithRedirect`/My-Account-API Connected-Accounts flow (`VaultStatus.jsx`, already provider-agnostic in shape).

## Verification

- Provision a fresh tenant; confirm Module 02 (`/api/verify/module01`) still passes unchanged.
- Walk the new third-party module: fetch CIMD doc, hand-provision the public `Acme Partner Agent` application + `Acme Partner Agent (DevCamp)` agent record, confirm `/api/verify/module02` passes, including the scope-match assertion against the first-party client.
- Make a tool call via each agent selector in Tool Tester; confirm distinct `act.sub` values in the server log/token payload for the same scope.
- Connect both CRM and GitHub via Connected Accounts as Alice; run `check_github_identity` and `log_crm_activity`; confirm both succeed independently and `/api/vault/providers` reports both.
- Run the renumbered end-to-end module (`08`) in full, including both negative-scope tests.
- Run deprovision; confirm both agent records, the first-party OBO client, the Acme public application, and the CRM connection are cleaned up (GitHub connection is manual/out-of-band, so it isn't auto-deleted — note this explicitly in the deprovision lab step).
