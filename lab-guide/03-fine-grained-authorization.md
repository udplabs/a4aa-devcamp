# Module 03: Fine-Grained Authorization (FGA), Live Demo

> [!IMPORTANT]
> This module is the one piece you **watch** rather than build. FGA is already provisioned and enforced for your tenant, so you witness the allow and deny decisions land live instead of writing the authorization code.

## Objective

RetailZero has thousands of wholesale accounts. Reps own a slice; managers cover a team's slice. A rep must never see pricing for an account they do not own, not because it is top-secret, but because a cross-customer price leak is a commercial disaster.

Role-based access control is too coarse. "rep" vs "manager" vs "admin" does not capture "Alice owns Acme but not Initech." Fine-grained authorization models this as relationships instead of roles:

- `user -> owner -> account`
- `user -> member -> team`
- `team -> owner -> account`

From those few facts, FGA derives the two decisions Z-Merchant actually needs: can this rep **read** this account, and can this rep **commit** a quote on it.

## Prerequisites

- You completed **Module 02**, so each request now carries the rep's verified identity (`sub`). FGA keys every decision off that `sub`.

## What's provisioned for you

When your demo launches, the CREATE hook provisions a per-tenant Auth0 / Okta FGA store with the authorization model already written and the demo tuples seeded. You do not create a store, paste a DSL model, or copy any `FGA_*` credentials. The live FGA module reads the store id and credentials from your tenant config at runtime.

> [!NOTE]
> If the tenant launches without FGA credentials, the app falls back to an in-memory tuple store with the same model and the same allow / deny behavior, so the demo still runs offline. Either way, what you observe below is identical.

### The authorization model (for reference)

You will not edit this, but it is worth seeing the shape of what is enforcing the decisions. `owner` is the core relation; `can_read` is derived (owners, plus members of a team that owns the account); `can_commit` is tighter (owners only):

```
type user

type team
  relations
    define member: [user]

type account
  relations
    define owner: [user, team]
    define can_read: owner or member from owner
    define can_commit: owner
```

### The seeded relationships

| Rep | Tuples | Net effect |
|---|---|---|
| `alice@retailzero.demo` | `alice owner account:acme`, `alice owner account:globex` | Reads and commits on Acme + Globex |
| `bob@retailzero.demo` | `bob member team:team-west`, `team-west owner account:initech` | Reads Initech through team-west; cannot commit on Acme |

`account:stark` is intentionally never seeded, so any query against it is a clean deny. Together these give the demo a real allow path, a team-inheritance path, and two distinct deny paths.

## Where the check fires

FGA sits at the data boundary, on the MCP server you wire in **Module 05**. Two tool handlers call it:

- `get_catalog_and_buyer_tier` checks `can_read` before returning any pricing.
- `commit_quote_terms` checks `can_commit` before committing terms.

Because the check keys off the rep's `sub` (the identity from Module 02), the decision is always about the human, never the agent. A deny is returned at the boundary, before any account data is read, so nothing leaks on the way to the refusal.

## What you'll observe

Watch the live event panel as these prompts run. Each one maps to a specific edge of the relationship graph.

1. **Allow (direct owner).** Logged in as Alice: *"Look up tier-2 pricing for SKU-WX-42 on Acme."* FGA checks `can_read(alice, acme)` and allows. Pricing returns.
2. **Deny (outside the book).** Still Alice: *"Same thing for Initech."* FGA checks `can_read(alice, initech)`, finds no owning or membership path, and denies. You see `FGA deny: user:... cannot read account:initech` and no pricing.
3. **Allow (commit as owner).** Alice: *"Commit the quote on Acme."* `can_commit(alice, acme)` is true because Alice owns Acme. The commit proceeds.
4. **Team inheritance, with a ceiling.** Logged in as Bob: a read on Initech **succeeds** through his team-west membership, but a commit on Acme **fails**. Members read; owners commit.

> [!TIP]
> Each decision lands in the event panel keyed on the rep's `sub`, the relation checked, and the account, so the allow and the deny are both auditable on the same key.

## What you learned

Relationship-based authorization handles the real shape of a wholesale org (reps, teams, matrixed managers, account transfers) without the rigid role explosion RBAC forces on you. More importantly: FGA keeps pricing data for Account A from ever reaching a rep who works Account B, which is what the compliance team cares about. That keeps the cross-customer leak risk off the quarterly risk register, which keeps the security budget trained on growth work instead of remediation.

You watched this one rather than coded it, but the same `sub`-keyed decision you saw the store make is the boundary every later module relies on: Token Vault (Module 04) mints credentials for the rep FGA just authorized, and Auth for MCP (Module 05) is where these checks actually fire on each tool call.

#### <span style="font-variant: small-caps">Congrats!</span>

*You have completed this module.*

You should have successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      seen FGA allow a read and commit for an account's direct owner;
  </li>
  <li style="list-style-type:'✅ '">
      seen a clean deny when a rep queries an account outside their book;
  </li>
  <li style="list-style-type:'✅ '">
      seen team membership grant read access while reserving commit for owners;
  </li>
  <li style="list-style-type:'✅ '">
      understood how every decision is keyed on the rep's <code>sub</code> at the data boundary.
  </li>
</ul>

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
