## Objective *(~20 min)*

> [!IMPORTANT]
> This module is the one piece you **watch** rather than configure. FGA is already provisioned and enforced for your tenant. 
>
>After reading this module, move on to the end-to-end demo

Nexus gives every user access to the company knowledge base, but not all of it. 

The company policies state that nn engineer should read engineering documents, and someone in sales should not read HR compensation data.

Role-based access control is too coarse for this problem. "Engineer" versus "HR" versus "executive" cannot capture the real rules: 
- Alice can read and share the Q3 roadmap because she owns it
- But Bob can only read the employee handbook.

Fine-grained authorization models this as relationships instead of roles:

- **user → viewer/editor/owner → document**
- **user → member → department**
- **department → viewer → document** (inherited via **department#member**)

From those relationships, FGA derives the two decisions Nexus actually needs: 
1. Can this user **read** this document
2. Can this user **share** it externally.

### Why we're building this

Role-based access control breaks down at enterprise scale. Assigning roles like "engineer" or "hr" cannot capture the real shape of a knowledge organization: who owns which documents, which departments share access to which resources, and where the boundary between read and share sits. The result is either over-permissioned access that fails compliance audits, or under-permissioned access that blocks legitimate use.

The commercial consequence: relationship-based authorization at the data boundary ensures an AI agent only ever accesses data within strict, fine-grained permission boundaries, answering the "how do you prevent data leakage between departments?" question before it's asked in the security questionnaire. That same guarantee builds enterprise and buyer trust at the point of sale, because the relationship engine that enforces Alice's access over engineering docs also enforces a different customer's access over their own tenant, without custom access logic for each deployment.

## What's provisioned for you

An Auth0 / Okta FGA store with the authorization model already written. 

Demo tuples are seeded on your first tool call so the allow and deny paths are ready to observe immediately. 

> [!NOTE]
> If the tenant launches without FGA credentials, the app falls back to an in-memory tuple store with the same model and the same allow / deny behavior, so the demo still runs offline. Either way, what you observe below is identical.

### The authorization model (for reference)

**can_read** covers direct relations plus department membership, while **can_share** is tighter because only editors and owners may share:

```
type user

type department
  relations
    define member: [user]

type document
  relations
    define owner: [user]
    define editor: [user]
    define viewer: [user, department#member]
    define can_read: owner or editor or viewer
    define can_share: owner or editor
```

### The SDK operations

All three FGA operations use the **@openfga/sdk** client initialized with the tenant's FGA store and credentials. 

The object format is always **type:id** and the user format is always **user:auth0_sub**.

**Write a tuple (grant access)**

```js
await fgaClient.write({
  writes: [
    { user: "user:auth0|abc123", relation: "editor", object: "document:q3-roadmap" },
  ],
});
```

**writes** is an array so multiple tuples can be created in one call. Writing a tuple that already exists is silently ignored.

**Check a relationship (authorization decision)**

```js
const { allowed } = await fgaClient.check({
  user: "user:auth0|abc123",
  relation: "can_read",
  object: "document:q3-roadmap",
});
// allowed: true | false
```

**can_read** is a computed relation: the store evaluates it against all direct and inherited paths in the model (owner, editor, viewer, department member). The call is point-in-time and non-caching.

**Delete a tuple (revoke access)**

```js
await fgaClient.write({
  deletes: [
    { user: "user:auth0|abc123", relation: "editor", object: "document:q3-roadmap" },
  ],
});
```

**writes** and **deletes** can appear in the same call for atomic grant-and-revoke operations.

### The seeded relationships

All demo users are seeded as **viewer** on **document:handbook** and **document:security-policy** (all-company public docs). 

The table shows the additional tuples that differentiate alice and bob:

| User | Additional tuples | Net effect |
|---|---|---|
| **`alice@docagent.demo`** | **alice member department:engineering**, **alice editor document:q3-roadmap**, **alice editor document:product-spec-v2** | Reads all-company + all engineering docs; can share q3-roadmap and product-spec-v2 |
| **`bob@docagent.demo`** | *(no additional tuples)* | All-company docs only; denied on engineering, HR, and executive |

**document:compensation-q3** (HR) and **document:board-deck-q3** (Executive) are intentionally never seeded for demo users, so any query against them is going to be denied. 

## Where the checks fire

FGA sits at the data boundary **inside** the MCP server you built in *One trust boundary for every agent*. 

The three tool handlers that call it are:

- **search_documents** filters results by FGA, so only documents the user can read appear in the response, regardless of the search query.
- **get_document** checks **can_read** before returning full document content.
- **share_document** checks **can_share** before proceeding, preventing viewers from sharing (only editors and owners can).

Because every check keys off the user's **sub**, the decision is always about the *human*, never the *agent*. 

## What you'll observe

> [!NOTE]
> **Preview: you'll run these five prompts yourself, live, in *Putting it all together* (End-to-End).** 
>
>Chat unlocks once every module's checkpoint passes, so for now, read each scenario below alongside the exact event-panel line it produces.

Once chat is unlocked, open the **Tool Logs** panel on the right side of the Nexus UI and run these to watch the FGA decision land in real time.

1. **Allow (all-company viewer).** 
- Logged in as Alice: 
  - `Find the security policy.` 
  - FGA checks **can_read(alice, security-policy)**
  - Alice has a viewer tuple on all-company docs, so the document returns. 
  - Expected log line: **[FGA] Check: user:auth0|<alice_sub> can_read document:security-policy -> ALLOWED**.

2. **Allow (department member).** 
- Still Alice: 
  - `Show me the Q3 roadmap.`
  - FGA resolves the path through **alice member department:engineering** and **department:engineering viewer document:q3-roadmap**
  - The content returns. 
  - Expected log line: **[FGA] Check: user:auth0|<alice_sub> can_read document:q3-roadmap -> ALLOWED**.

3. **Deny (outside department).** 
- Logged in as Bob: 
  - `Show me the Q3 roadmap.`
  - Bob has no membership in **department:engineering** and no direct viewer tuple on **document:q3-roadmap**
  - No content returned
  - Expected log line: **[FGA] Check: user:auth0|<bob_sub> can_read document:q3-roadmap -> DENIED**. 

4. **Deny (confidential).** 
- Bob or Alice: 
  - `Find the compensation review.`
  - Neither user has any tuple on **document:compensation-q3**. 
  - Clean deny on both sides, with the document never surfacing in search results or as a retrievable ID.

5. **Share allowed for editor, denied for viewer.**
- Bob or Alice: 
  - Prompt Nexus to share a document
  -  **Approval Required** card first, CIBA initiated. 
  - After approval, Alice's share of **q3-roadmap** succeeds because she has an editor tuple (**[FGA] Check: user:auth0|<alice_sub> can_share document:q3-roadmap -> ALLOWED**). 
  - Bob's share of **security-policy** is denied at the data boundary, since viewers do not meet the **can_share** condition, even though he can read it (**[FGA] Check: user:auth0|<bob_sub> can_share document:security-policy -> DENIED**).

## What you learned

Relationship-based authorization handles the real shape of a knowledge organization (individuals, departments, matrixed ownership, document tiers) without the rigid role explosion that RBAC forces on you. More importantly, FGA keeps confidential documents for HR from ever appearing in an engineer's search results, which is what the compliance team ultimately cares about. That keeps data classification risk off the quarterly risk register.

You observed this implementation rather than building it yourself. The same **sub**-keyed decision you saw the store make has been firing inside the MCP server since *One trust boundary for every agent*. Token Vault, from *The agent acts as the employee, not a shared bot*, minted CRM credentials for the users FGA just authorized, and CIBA, from *Humans approve what can't be undone*, gated irreversible shares on the same identity. All five controls key off the same **sub**.

> [!NOTE]
> This module has no **Run Checks** button. Instead, the Nexus app asks a short knowledge-check question about *why* Alice can read the Q3 roadmap and Bob can't. Answer it correctly to unlock the module.

#### <span style="font-variant: small-caps">Congrats!</span>

*You have completed this module.*

You should have successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      Seen FGA allow a read for a direct viewer and for a department member;
  </li>
  <li style="list-style-type:'✅ '">
      Seen a clean deny when a user queries a document outside their access;
  </li>
  <li style="list-style-type:'✅ '">
      Seen confidential documents stay invisible to all demo users;
  </li>
  <li style="list-style-type:'✅ '">
      Understood that <code>can_share</code> is stricter than <code>can_read</code>, and why.
  </li>
</ul>

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
