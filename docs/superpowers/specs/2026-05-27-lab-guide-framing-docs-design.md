# Lab Guide Framing Documents Design

## Context

Dev{Camps} is being redesigned to shift from code-heavy developer labs to a platform-magic-focused experience. Attendees should walk away with the story of what Auth0 does, not just code they wrote.

This spec covers three new lab guide documents: `overview.md`, `introduction.md`, and `conclusion.md`. These frame the workshop experience for attendees and replace the existing `lab-guide/00-overview.md`.

## Workshop Format (for context)

- **Delivery:** GitHub Codespaces — attendees open a repo link, everything runs in-browser.
- **Time:** 2.5 hours total. ~30 min kickoff (slides + story), ~2 hours hands-on.
- **Auth0 tenants:** Pre-provisioned per attendee via automation. Post-hook scripts pre-create apps, APIs, connections.
- **Audience:** Developers, internal SEs, partners.
- **Module rhythm:** Why → Configure → Connect (2-3 lines of code) → Witness (live observability panel).
- **Core modules:** User Auth (~10-15 min), FGA (~15-20 min), Token Vault (~15-20 min), Auth for MCP (~20-25 min).
- **Optional module:** CIBA (for fast finishers).
- **Narrative:** Progressive — each module resolves a production blocker preventing Z-Merchant from shipping.
- **Guidance:** In-app panel shows what's missing and links to the file + line in the VS Code editor.
- **Observability:** Dual-mode live event panel — narrative log by default, structured detail toggle for the curious.

## Document 1: `overview.md`

### When it appears

Visible on the lab landing page before the attendee clicks "Launch." First thing they read.

### Purpose

Answer: "What am I about to do, what will I need, and what will I walk away with?"

### Tone

Confident, concise. Sells the next 2.5 hours without overselling.

### Structure

1. **Headline** — "Securing AI Agents with Auth0" (or similar short title)
2. **One-liner** — What this workshop is in one sentence
3. **What you'll experience** — The four core modules listed with a one-sentence "why it matters" each:
   - User Authentication
   - Fine-Grained Authorization
   - Token Vault
   - Auth for MCP
   - *(Optional) CIBA*
4. **How it works** — Brief format description: pre-built app, minimal code (2-3 lines per module), live observability panel shows Auth0 in action
5. **Prerequisites** — Browser with GitHub access. That's it.
6. **Time** — ~2.5 hours (30 min kickoff + 2 hours hands-on)
7. **CTA** — "Click Launch to provision your environment."

### Length

~300 words. Scannable in under 2 minutes.

## Document 2: `introduction.md`

### When it appears

After the attendee clicks "Launch." Displayed while provisioning runs in the background and while the facilitator delivers the kickoff slide deck.

### Purpose

Ground the abstract "AI agents have security gaps" story (from the slides) into the specific world the attendee is about to work in. A companion to the slides, not a replacement.

### Tone

Narrative, immersive. Like a mission briefing.

### Structure

1. **The world** — RetailZero, the wholesale channel, the deal desk problem. 3-4 sentences. Sets business stakes.
2. **Z-Merchant** — What the agent does: drafts quotes, checks buyer tiers, creates docs, posts to Slack, commits terms. It's already built. It works. But...
3. **The problem** — Z-Merchant can't ship. Four production blockers, each framed as a risk:
   - Anyone can talk to it (no identity)
   - It can see every account (no access boundaries)
   - It uses a shared bot token for Google/Slack (no per-user credentials)
   - Its MCP tools are open to any caller (no trust boundary)
4. **Your mission** — "Over the next 2 hours, you'll resolve each blocker using Auth0. By the end, Z-Merchant is production-ready."
5. **How you'll work** — One sentence on the format: "Each module tells you what to configure, where to connect it (2-3 lines), and shows you Auth0 in action through the live event panel."

### Length

~400 words. Readable in 3-4 minutes (matches typical provisioning time).

### Relationship to slides

The slides cover the industry problem (AI security gaps broadly). This doc covers the specific problem (RetailZero's agent, these four gaps). They reinforce each other without repeating.

## Document 3: `conclusion.md`

### When it appears

After the last module completes. Facilitator is wrapping up.

### Purpose

Give the "what did I just accomplish" feeling and bridge to the attendee's real-world work.

### Tone

Reflective, empowering. They just shipped something.

### Structure

1. **What you shipped** — One paragraph. Z-Merchant is production-ready. Recap the four blockers, now resolved. Quick callback to the narrative.
2. **The Auth0 capabilities you used** — Compact table or list mapping each module to the Auth0 platform feature and the security principle:
   - User Auth → Who is this?
   - FGA → What can they touch?
   - Token Vault → How does the agent act on their behalf?
   - Auth for MCP → How do you secure tool execution?
   - *(Optional) CIBA → How do you gate high-stakes actions?*
3. **Beyond RetailZero** — 2-3 sentences connecting to their agents. "Every agent that calls APIs, accesses user data, or runs tools needs this same stack."
4. **Next steps** — Short, actionable list:
   - Auth0 for AI Agents documentation
   - Take the code home (Codespace persists for X days)
   - Auth0 community / Slack / support channel
   - Feedback link

### Length

~300 words. Quick read.

## File Locations

These documents go in `lab-guide/`:
- `lab-guide/overview.md`
- `lab-guide/introduction.md`
- `lab-guide/conclusion.md`

The existing `lab-guide/00-overview.md` will be replaced by these three documents. It should be removed once the new docs are in place.

## Out of Scope

- Observability panel UI implementation (separate effort)
- In-app guidance system implementation (separate effort)
- Individual module lab guides (separate specs per module)
- Codespace devcontainer configuration
- Tenant provisioning automation
- Code changes to the starter app
