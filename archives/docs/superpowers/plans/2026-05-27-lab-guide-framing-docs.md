# Lab Guide Framing Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write three attendee-facing lab guide documents (overview.md, introduction.md, conclusion.md) that frame the new minimal-code, platform-magic-focused Dev{Camp} workshop experience.

**Architecture:** Three standalone markdown files in `lab-guide/`. Each serves a distinct moment in the attendee journey: pre-launch (overview), during provisioning/kickoff (introduction), post-lab (conclusion). The existing `lab-guide/00-overview.md` is removed once the new docs are in place.

**Tech Stack:** Markdown. No code dependencies.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `lab-guide/overview.md` | Landing page — what this is, what you'll need, what you'll get |
| Create | `lab-guide/introduction.md` | Narrative mission briefing — RetailZero story, production blockers, your mission |
| Create | `lab-guide/conclusion.md` | Wrap-up — what you shipped, platform mapping, next steps |
| Delete | `lab-guide/00-overview.md` | Superseded by the three new documents |

---

### Task 1: Write `overview.md`

**Files:**
- Create: `lab-guide/overview.md`

- [ ] **Step 1: Create overview.md with full content**

```markdown
# Securing AI Agents with Auth0

A hands-on workshop where you take a working AI agent and make it production-ready using Auth0 — in under two hours, with minimal code.

## What you'll experience

You'll work with **Z-Merchant**, a B2B wholesale quote agent built for RetailZero. It already works — it drafts quotes, checks pricing, creates documents, and posts to Slack. Your job is to close four security gaps that stand between it and production.

Each module maps to an Auth0 capability:

| Module | Auth0 Capability | What it solves |
|--------|-----------------|----------------|
| 1 | User Authentication | The agent doesn't know who's talking to it |
| 2 | Fine-Grained Authorization | The agent can see every account, not just yours |
| 3 | Token Vault | The agent uses shared bot credentials for Google and Slack |
| 4 | Auth for MCP | The agent's tools are open to any caller |

There's also an **optional bonus module** — **Async Authorization (CIBA)** — for high-stakes actions that need out-of-band human approval.

## How it works

This isn't a traditional coding lab. The app is pre-built. For each module, you'll:

1. **Understand why** — what's the security gap and what does Auth0 do about it
2. **Configure** — set up the Auth0 feature (scopes, relationships, providers)
3. **Connect** — write 2-3 lines of code that wire it in
4. **Witness** — watch Auth0 in action through a live event panel that narrates every token exchange, access check, and credential mint in real time

## Prerequisites

A browser with access to GitHub. That's it.

Your environment runs entirely in GitHub Codespaces — no local installs, no dependencies, no laptop restrictions. Your Auth0 tenant is provisioned automatically when you launch.

## Time

~2.5 hours total:
- **30 minutes** — kickoff presentation and story setup
- **~2 hours** — hands-on modules

## Ready?

Click **Launch** to provision your environment. While it spins up, you'll get a short briefing on RetailZero and your mission.
```

- [ ] **Step 2: Review for tone and length**

Read the file back. Confirm:
- Tone is confident and concise, not salesy
- Length is ~300 words (scannable in under 2 minutes)
- CTA is clear ("Click Launch")
- No jargon that would confuse a non-developer attendee

- [ ] **Step 3: Commit**

```bash
git add lab-guide/overview.md
git commit -m "docs: add lab guide overview.md (landing page)"
```

---

### Task 2: Write `introduction.md`

**Files:**
- Create: `lab-guide/introduction.md`

- [ ] **Step 1: Create introduction.md with full content**

```markdown
# Mission Briefing

## The World

RetailZero's wholesale channel is the business. Bulk B2B orders outrun consumer retail three-to-one, and the deal desk is where those orders get made. Reps pull pricing, draft quotes, route to finance, and commit terms — all day, every day. Every cycle costs hours of salaried time. Every non-standard discount compounds the delay. First-to-quote wins on roughly 60% of wholesale RFPs.

## The Agent

Last quarter, RetailZero shipped **Z-Merchant** — an AI agent built to collapse the quote cycle. It can:

- Look up catalog prices and buyer tiers
- Draft quote documents in the rep's Google Workspace
- Post to the deal-desk triage channel in Slack
- Commit final terms to the order system

It works. It's fast. But it can't ship to production.

## The Problem

The security team flagged four blockers before Z-Merchant can go live:

1. **No identity** — Anyone can talk to it. The agent has no idea which rep is making a request, so there's no way to scope access or audit actions.

2. **No access boundaries** — It can see every wholesale account. A rep querying a competitor's pricing or another team's book has nothing stopping them.

3. **No per-user credentials** — When Z-Merchant writes a Google Doc or posts to Slack, it uses a shared bot token. If that token leaks, every rep's workspace is exposed. There's no way to revoke access for one person without breaking it for everyone.

4. **No trust boundary** — Z-Merchant's tools run on an MCP server that accepts any caller. A forged request could trigger a quote commit, access pricing data, or post to Slack — with no validation.

## Your Mission

Over the next two hours, you'll resolve each blocker using Auth0. By the end, Z-Merchant is production-ready — identity-aware, access-controlled, credential-safe, and trust-bounded.

## How You'll Work

Each module tells you what to configure in Auth0, where to connect it (2-3 lines of code), and shows you the platform in action through the live event panel. You'll see every token exchange, every access decision, and every credential mint as it happens.

Let's go.
```

- [ ] **Step 2: Review for tone and length**

Read the file back. Confirm:
- Tone is narrative and immersive — reads like a mission briefing, not documentation
- Length is ~400 words (readable in 3-4 minutes, matching provisioning time)
- Four blockers are crisp and risk-framed
- Doesn't repeat slide content (industry-level AI gaps) — stays specific to RetailZero
- Ends with forward momentum ("Let's go.")

- [ ] **Step 3: Commit**

```bash
git add lab-guide/introduction.md
git commit -m "docs: add lab guide introduction.md (mission briefing)"
```

---

### Task 3: Write `conclusion.md`

**Files:**
- Create: `lab-guide/conclusion.md`

- [ ] **Step 1: Create conclusion.md with full content**

```markdown
# Mission Complete

## What You Shipped

Z-Merchant is production-ready. Four blockers stood between it and the real world — and you closed every one:

- The agent knows who's talking to it. Every request carries a verified identity.
- Access is scoped to the rep's book. Accounts outside their ownership graph return a clean deny.
- Third-party credentials are per-user, short-lived, and vault-managed. No shared bot tokens.
- The MCP server is a trust boundary. Every tool call is audience-validated and scope-enforced.

The deal desk just got faster, cheaper, and auditable.

## The Auth0 Capabilities You Used

| Module | Capability | Security Principle |
|--------|-----------|-------------------|
| 1 | User Authentication | Who is this? |
| 2 | Fine-Grained Authorization (FGA) | What can they touch? |
| 3 | Token Vault | How does the agent act on their behalf? |
| 4 | Auth for MCP | How do you secure tool execution? |
| *Bonus* | *Async Authorization (CIBA)* | *How do you gate high-stakes actions?* |

These aren't RetailZero-specific patterns. Every agent that calls APIs, accesses user data, or executes tools needs this same stack — regardless of the framework, model, or use case.

## What's Next

- **Docs** — [Auth0 for AI Agents](https://auth0.com/ai) — full platform documentation
- **Your code** — Your Codespace stays active. Take it home, explore, extend it.
- **Community** — Join the conversation at [community.auth0.com](https://community.auth0.com)
- **Feedback** — Tell us how this went: [feedback link]
```

- [ ] **Step 2: Review for tone and length**

Read the file back. Confirm:
- Tone is reflective and empowering — they accomplished something
- Length is ~300 words (quick read for tired attendees)
- Maps features back to security principles (the architect takeaway)
- "Beyond RetailZero" message is present and concise
- Next steps are actionable and short
- `[feedback link]` is a deliberate placeholder — to be filled with the actual URL before the event

- [ ] **Step 3: Commit**

```bash
git add lab-guide/conclusion.md
git commit -m "docs: add lab guide conclusion.md (wrap-up)"
```

---

### Task 4: Remove old overview

**Files:**
- Delete: `lab-guide/00-overview.md`

- [ ] **Step 1: Delete the old overview file**

```bash
git rm lab-guide/00-overview.md
```

- [ ] **Step 2: Commit**

```bash
git commit -m "docs: remove 00-overview.md, replaced by overview.md + introduction.md + conclusion.md"
```

---

### Task 5: Update references to old overview

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Check for references to 00-overview.md**

```bash
grep -r "00-overview" . --include="*.md"
```

- [ ] **Step 2: Update README.md lab-guide listing**

In `README.md`, update the `lab-guide/` directory listing to reflect the new structure:

```markdown
├── lab-guide/                    ← step-by-step participant guides
│   ├── overview.md               ← landing page (what you'll do)
│   ├── introduction.md           ← mission briefing (read during kickoff)
│   ├── 01-user-authentication.md
│   ├── 02-async-authorization-ciba.md
│   ├── 03-fine-grained-authorization.md
│   ├── 04-token-vault.md
│   ├── 05-auth-for-mcp.md
│   └── conclusion.md             ← wrap-up (what you shipped, next steps)
```

Also remove any "On to Lab 01" or similar references that pointed to the old flow.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README to reflect new lab guide structure"
```
