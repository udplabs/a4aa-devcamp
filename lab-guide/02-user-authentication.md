# Module 02: User Authentication

## Objective

Z-Merchant only talks to authenticated RetailZero reps. A wholesale quote in the wrong hands is a margin leak, so step one is a proper Auth0 Universal Login flow that gives every request a verifiable identity (the JWT).

In this module you will:

- Gate the chat UI behind Auth0 Universal Login.
- Send the rep's access token on every `/api/*` call.
- Validate JWTs on the Express backend with `express-oauth2-jwt-bearer`.
- Extract `sub`, `email`, and `scope` from the token so downstream modules have a real user context.

## Prerequisites

- You completed **Module 00** (your Auth0 tenant is active) and **Module 01** (your local environment is ready).

## What's provisioned for you

Your Auth0 tenant is provisioned automatically when you launch, so there is no dashboard wiring to do by hand. By the time you read this, the tenant already has:

- **The RetailZero API** (resource server `https://devcamp-retailzero-api`, RS256) with the four `mcp:*` scopes the agent uses:
  - `mcp:quote:read` -- look up catalog and buyer tier
  - `mcp:docs:create` -- create a Google Doc via Token Vault
  - `mcp:slack:post` -- post to Slack via Token Vault
  - `mcp:quote:commit` -- commit final quote terms
- **The Z-Merchant SPA application**, with callbacks, logout URLs, and web origins set to your demo's URL.
- **The demo reps** seeded with intentionally different access so later modules have something to bite on: `alice@retailzero.demo` (owns Acme + Globex) and `bob@retailzero.demo` (manages team-west, which owns Initech).

The SPA pulls these values at runtime from `GET /api/config`, so the same build initializes Auth0 correctly for your tenant. There are no `VITE_AUTH0_*` or `AUTH0_*` values for you to copy.

> [!NOTE]
> Self-hosting `starter/` instead of the delivered workshop? Create the API, SPA, and a demo user in your own tenant by hand, then put the domain, client id, and audience in `starter/.env`. The delivered demo platform does all of this for you.

## Code Steps

### Step 1: wrap the React tree in `Auth0Provider`

Open `src/main.tsx` and find the `TODO(lab-01)` marker. Replace with:

```tsx
import { Auth0Provider } from "@auth0/auth0-react";

<Auth0Provider
  domain={import.meta.env.VITE_AUTH0_DOMAIN}
  clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
  authorizationParams={{
    redirect_uri: window.location.origin,
    audience: import.meta.env.VITE_AUTH0_AUDIENCE,
    scope: "openid profile email mcp:quote:read mcp:docs:create mcp:slack:post mcp:quote:commit",
  }}
>
  <App />
</Auth0Provider>
```

### Step 2: gate the app

`src/App.tsx`:

```tsx
const { isAuthenticated, isLoading, user, logout } = useAuth0();

if (isLoading) return <LoadingScreen />;
if (!isAuthenticated) return <LoginScreen />;
```

Render `user.email` and a logout button in the header.

### Step 3: make the login button real

`src/components/LoginScreen.tsx`:

```tsx
const { loginWithRedirect } = useAuth0();

<button className="login-button" onClick={() => loginWithRedirect()}>
  Sign In with Auth0
</button>
```

### Step 4: attach the access token to `/api/chat`

`src/hooks/useChat.ts` `TODO(lab-01)`:

```ts
const { getAccessTokenSilently } = useAuth0();

const token = await getAccessTokenSilently({
  authorizationParams: {
    audience: import.meta.env.VITE_AUTH0_AUDIENCE,
    scope: "mcp:quote:read mcp:docs:create mcp:slack:post mcp:quote:commit",
  },
});

const response = await fetch("/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ message: content, conversationHistory: messages }),
});
```

### Step 5: validate JWTs on the backend

`server/middleware/auth.ts`:

```ts
import { auth } from "express-oauth2-jwt-bearer";

export const validateAccessToken = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.AUTH0_AUDIENCE,
});

export function extractUser(req: any) {
  return {
    sub: req.auth?.payload?.sub,
    scope: (req.auth?.payload?.scope || "").split(" ").filter(Boolean),
    email: req.auth?.payload?.email,
    accessToken: req.headers.authorization?.replace(/^Bearer\s+/i, ""),
  };
}
```

### Step 6: apply the middleware and read the user

`server/index.ts`:

```ts
import { validateAccessToken, extractUser } from "./middleware/auth";

app.post("/api/chat", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  // ... pass user into processMessage as before
});
```

Remove the mock `anonymous` user.

## Checkpoint

> [!IMPORTANT]
> Confirm each of the following before moving on:
>
> - Clicking **Sign In** takes you to Auth0 Universal Login.
> - After login, the header shows `alice@retailzero.demo` and a Log Out button.
> - The Network tab shows `Authorization: Bearer eyJ...` on `/api/chat`.
> - Requests without a token return `401 Unauthorized`.
> - The backend logs `Authenticated request from user: auth0|...`.

> [!TIP]
> Decode the JWT at [jwt.io](https://jwt.io). Confirm `aud` contains `https://devcamp-retailzero-api` and `scope` contains the four `mcp:*` scopes.

## What you learned

Every Z-Merchant call now carries a verifiable rep identity. That identity is the anchor for everything else: FGA evaluates tuples keyed on this `sub` (Module 03), Token Vault mints tokens scoped to this rep (Module 04), Module 05 exchanges this token for an MCP token that preserves the rep's `sub` all the way to the tool execution, and the CIBA bonus binds approval to this rep's device. No identity, no audit trail. No audit trail, no compliance sign-off, no Z-Merchant in production.

> [!NOTE]
> Business win: compliance checks on wholesale pricing are table stakes for enterprise deals. A clean rep-level audit trail is the difference between a six-month security review and a two-week one.

#### <span style="font-variant: small-caps">Congrats!</span>

*You have completed this module.*

You should have successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      gated the Z-Merchant chat UI behind Auth0 Universal Login;
  </li>
  <li style="list-style-type:'✅ '">
      attached the rep's access token to every <code>/api/chat</code> call;
  </li>
  <li style="list-style-type:'✅ '">
      validated the JWT on the Express backend;
  </li>
  <li style="list-style-type:'✅ '">
      extracted the rep's <code>sub</code>, <code>email</code>, and <code>scope</code> for downstream modules.
  </li>
</ul>

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
