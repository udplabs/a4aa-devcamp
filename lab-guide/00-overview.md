# Lab 00: Overview

## The business case

RetailZero runs a manual wholesale quote desk. Sales reps draft bulk pricing in spreadsheets, route to finance over Slack, then chase signature in email. The cycle eats days per deal. Every day a quote sits in triage is a day the competitor quote lands first.

**Z-Merchant** is the AI agent we are wiring up over the next six labs. It drafts quotes, pulls the right buyer tier, posts the finance-desk summary, and commits terms. The twist: every tool call it makes is governed by Auth0 for AI Agents.

Done right, the business wins twice:

- **Operating expense**: fewer manual quote-desk touches, fewer backfills for maternity leave, fewer "where is the quote for Acme" pings.
- **Go-to-market speed**: quotes out of the desk in minutes, not days. First-to-quote wins on roughly 60% of wholesale RFPs.

## What you will build

An end-to-end working Z-Merchant agent with the five A4AA pillars enforced at runtime:

| Pillar | Lab | What it protects |
|---|---|---|
| Authentication | 01 | Only logged-in reps reach Z-Merchant. Every request carries a JWT with the RetailZero API audience. |
| Async Authorization (CIBA) | 02 | Non-standard discounts or payment terms trigger a push approval on the rep's device before the commit lands. |
| Fine-grained Authorization | 03 | Reps only see wholesale accounts they own (or manage through their team). |
| Token Vault | 04 | Google Docs and Slack calls use short-lived, per-user tokens instead of shared bot credentials. |
| Auth for MCP | 05 | Every tool call flows through an Auth0-secured MCP server using CIMD, PRM, On-Behalf-Of token exchange, RFC 8707 resource indicators, and per-tool scope enforcement. |

Lab 06 runs the full workflow end to end and shows every pillar firing in one deal.

## Architecture at a glance

```
Rep browser (React SPA, :5173)
   |
   | 1. Auth0 Universal Login -> JWT (aud=RetailZero API)
   v
Agent backend (Express, :3000)
   |
   | 2. OpenAI / simulator picks tool
   | 3. CIBA gate (Lab 02) for non-standard terms
   | 4. MCP client exchanges user JWT -> MCP token via OBO (Lab 05)
   v
MCP server (Express, :3001)   <- Auth0-secured (JWT, PRM, per-tool scope)
   |
   | 5a. FGA check (Lab 03)
   | 5b. Token Vault mint (Lab 04)
   v
Third-party mock (:3002)      <- simulates Google Docs + Slack
```

The MCP server is the trust boundary. FGA checks and Token Vault calls live on it, not on the agent backend. That is the keystone teaching moment in Lab 05.

## What is simulated, and why

| Real | Simulated |
|---|---|
| Auth0 tenant (your own) | Google Workspace + Slack (mock server on :3002) |
| Auth0 JWTs, PRM, CIMD, OBO | FGA store (in-memory map of tuples) |
| Express-oauth2-jwt-bearer validation | CIBA push notification (approved via curl) |
| MCP server on :3001 | Token Vault storage (in-memory) |

Simulating the third-party integrations keeps the lab offline-runnable. It does not weaken the teaching: the token mint, the scoped call, and the audit trail all run end to end.

## Prerequisites

- Node 20+ and npm.
- Your own Auth0 tenant (a free tenant is enough). You will register one API and two applications during the labs.
- No OpenAI key required. If you set `OPENAI_API_KEY` the agent uses GPT-4o-mini; without it, the pattern-matching simulator handles intent detection.

## Repo layout

```
devcamp-a4aa/
  starter/      <- your working copy. Fill in TODO(lab-XX) markers.
  solution/     <- reference implementation. Peek when stuck.
  lab-guide/    <- these docs.
```

Work in `starter/`. Each lab tells you which files to open and which TODO markers to complete. Type-check as you go with `cd starter && npx tsc --noEmit`.

## How the labs are structured

Every lab follows the same shape:

1. **Premise**: the business problem the pillar solves for Z-Merchant.
2. **Objectives**: what you will have working by the end.
3. **Auth0 Dashboard Setup**: tenant configuration for this pillar.
4. **Code Steps**: the TODO markers to fill in, with the exact snippets.
5. **Checkpoint**: the runtime behavior that proves the pillar is live.
6. **What you learned**: the business value tie-in.

## Run the scaffolding

```
cd starter
npm install
npm run dev
```

You should see:

- Frontend on http://localhost:5173 (branded Z-Merchant, but "Not logged in").
- API server on http://localhost:3000.
- The third-party mock and MCP server come up as you wire them in Labs 04 and 05.

On to Lab 01.
