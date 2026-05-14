# Lab 03: Fine-Grained Authorization (FGA)

## Premise

RetailZero has thousands of wholesale accounts. Reps own a slice; managers cover a team's slice. A rep must never see pricing for an account they do not own -- not because it is top-secret, but because a cross-customer price leak is a commercial disaster.

Role-based access control is too coarse ("rep" vs "manager" vs "admin" does not capture "Alice owns Acme but not Initech"). Fine-grained authorization models this as relationships: `user -> owns -> account`, `user -> manages -> team`, `team -> owns -> account`.

## Objectives

- Define the wholesale FGA model (users, teams, accounts; `owner`, `member`, `can_read`, `can_commit` relations).
- Seed tuples for the demo users: `alice owns acme`, `alice owns globex`, `bob manages team-west`, `team-west owns initech`.
- Implement `canReadAccount(userId, accountId)` and `canCommitQuote(userId, accountId)` using the FGA check API.
- Gate `get_catalog_and_buyer_tier` and `commit_quote_terms` on the MCP server with these checks.

## Auth0 Dashboard Setup

The lab ships an in-memory FGA simulator so you can complete the flow without provisioning a store. To use the real Okta FGA service:

1. **Auth0 Dashboard > Extensions > FGA** (or the standalone Okta FGA dashboard).
2. Create a new store `retailzero-z-merchant`.
3. Paste the DSL model from Step 1 below into the **Model** editor.
4. Copy the store ID, client ID, and client secret into `starter/.env` as `FGA_STORE_ID`, `FGA_CLIENT_ID`, `FGA_CLIENT_SECRET`. The lab code autodetects these and calls the real API when present.

## Code Steps

### Step 1: define the authorization model

`starter/server/fga/model.ts` -- fill in `FGA_MODEL.type_definitions`:

```ts
export const FGA_MODEL = {
  schema_version: "1.1",
  type_definitions: [
    { type: "user" },
    {
      type: "team",
      relations: { member: { this: {} } },
      metadata: { relations: { member: { directly_related_user_types: [{ type: "user" }] } } },
    },
    {
      type: "account",
      relations: {
        owner: { this: {} },
        can_read: {
          union: {
            child: [
              { computedUserset: { relation: "owner" } },
              { tupleToUserset: {
                  tupleset: { relation: "owner" },
                  computedUserset: { relation: "member" },
              } },
            ],
          },
        },
        can_commit: { computedUserset: { relation: "owner" } },
      },
      metadata: {
        relations: {
          owner: { directly_related_user_types: [{ type: "user" }, { type: "team" }] },
        },
      },
    },
  ],
};
```

`owner` is the core relation; `can_read` is derived (owners AND members of a team that owns the account); `can_commit` is tighter (only owners).

### Step 2: implement the FGA client

`starter/server/fga/client.ts`:

```ts
interface Tuple { user: string; relation: string; object: string; }
const tuples: Tuple[] = [];

export async function writeTuple(user, relation, object) {
  tuples.push({ user, relation, object });
}

async function check(user: string, relation: string, object: string): Promise<boolean> {
  if (tuples.some(t => t.user === user && t.relation === relation && t.object === object)) return true;
  if (relation === "can_read") {
    // direct owner?
    if (tuples.some(t => t.user === user && t.relation === "owner" && t.object === object)) return true;
    // team-owner -> member of that team?
    const teamOwners = tuples.filter(t => t.relation === "owner" && t.object === object && t.user.startsWith("team:"));
    for (const t of teamOwners) {
      if (tuples.some(x => x.user === user && x.relation === "member" && x.object === t.user)) return true;
    }
    return false;
  }
  if (relation === "can_commit") {
    return tuples.some(t => t.user === user && t.relation === "owner" && t.object === object);
  }
  return false;
}

export async function canReadAccount(userSub: string, accountId: string) {
  return check(`user:${userSub}`, "can_read", `account:${accountId}`);
}

export async function canCommitQuote(userSub: string, accountId: string) {
  return check(`user:${userSub}`, "can_commit", `account:${accountId}`);
}

export async function seedTuplesForUser(userSub: string, email?: string) {
  if (email?.startsWith("alice")) {
    await writeTuple(`user:${userSub}`, "owner", "account:acme");
    await writeTuple(`user:${userSub}`, "owner", "account:globex");
  }
  if (email?.startsWith("bob")) {
    await writeTuple(`user:${userSub}`, "member", "team:team-west");
    await writeTuple("team:team-west", "owner", "account:initech");
  }
}
```

### Step 3: gate the tool handlers (on the MCP server)

You will wire the MCP server in Lab 05. Preview the integration:

```ts
case "get_catalog_and_buyer_tier": {
  if (!(await canReadAccount(userSub, args.accountId))) {
    throw new Error(`FGA deny: ${userSub} cannot read account:${args.accountId}`);
  }
  return { account: getAccount(args.accountId), sku: getCatalogEntry(args.sku, tier) };
}

case "commit_quote_terms": {
  if (!(await canCommitQuote(userSub, args.accountId))) {
    throw new Error(`FGA deny: ${userSub} cannot commit on account:${args.accountId}`);
  }
  return { committed: { ... } };
}
```

### Step 4: seed tuples on first request

At the top of `executeToolLogic` (Lab 05), call `seedTuplesForUser(userSub, email)` once per session. For Lab 03 alone, you can also seed on `/api/chat` right after `extractUser`.

## Checkpoint

1. Log in as `alice@retailzero.demo`.
2. Prompt: *"Look up tier-2 pricing for SKU-WX-42 on Acme."* -> success, returns price.
3. Prompt: *"Same thing for Initech."* -> `FGA deny: user:... cannot read account:initech`.
4. Prompt: *"Commit the quote on Acme."* -> success (alice owns acme).
5. Log in as `bob` (manager) -> Initech reads succeed (via team-west membership) but commits fail (managers read, owners commit).

## What you learned

Relationship-based authorization handles the real shape of a wholesale org (reps, teams, matrixed managers, account transfers) without the rigid role explosion RBAC forces on you. More importantly: FGA keeps pricing data for Account A from ever reaching a rep who works Account B, which is what the compliance team cares about. That keeps the cross-customer leak risk off the quarterly risk register, which keeps the security budget trained on growth work instead of remediation.
