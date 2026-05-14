# Lab 01: User Authentication

## Premise

Z-Merchant only talks to authenticated RetailZero reps. A wholesale quote in the wrong hands is a margin leak, so step one is a proper Auth0 Universal Login flow that gives every request a verifiable identity (the JWT).

## Objectives

- Register a RetailZero API (resource server) and a Z-Merchant SPA application in Auth0.
- Gate the chat UI behind Auth0 Universal Login.
- Send the rep's access token on every `/api/*` call.
- Validate JWTs on the Express backend with `express-oauth2-jwt-bearer`.
- Extract `sub`, `email`, and `scope` from the token so downstream labs have a real user context.

## Auth0 Dashboard Setup

### 1. Create the RetailZero API

- **Dashboard > Applications > APIs > Create API**
- **Name:** `RetailZero Wholesale API`
- **Identifier (audience):** `https://devcamp-retailzero-api`
- **Signing Algorithm:** RS256

Add permissions (scopes):

- `mcp:quote:read` -- look up catalog and buyer tier
- `mcp:docs:create` -- create a Google Doc via Token Vault
- `mcp:slack:post` -- post to Slack via Token Vault
- `mcp:quote:commit` -- commit final quote terms

### 2. Create the Z-Merchant SPA application

- **Dashboard > Applications > Applications > Create > Single Page Web Applications**
- **Name:** `Z-Merchant (SPA)`
- **Allowed Callback URLs:** `http://localhost:5173`
- **Allowed Logout URLs:** `http://localhost:5173`
- **Allowed Web Origins:** `http://localhost:5173`

Copy the **Domain** and **Client ID** into `starter/.env`:

```
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=...
VITE_AUTH0_AUDIENCE=https://devcamp-retailzero-api

AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://devcamp-retailzero-api
```

### 3. Create a demo user

- **Dashboard > User Management > Users > Create User**
- **Email:** `alice@retailzero.demo`
- **Connection:** `Username-Password-Authentication`

## Code Steps

### Step 1: wrap the React tree in `Auth0Provider`

Open `starter/src/main.tsx` and find the `TODO(lab-01)` marker. Replace with:

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

`starter/src/App.tsx`:

```tsx
const { isAuthenticated, isLoading, user, logout } = useAuth0();

if (isLoading) return <LoadingScreen />;
if (!isAuthenticated) return <LoginScreen />;
```

Render `user.email` and a logout button in the header.

### Step 3: make the login button real

`starter/src/components/LoginScreen.tsx`:

```tsx
const { loginWithRedirect } = useAuth0();

<button className="login-button" onClick={() => loginWithRedirect()}>
  Sign In with Auth0
</button>
```

### Step 4: attach the access token to `/api/chat`

`starter/src/hooks/useChat.ts` TODO(lab-01):

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

`starter/server/middleware/auth.ts`:

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

`starter/server/index.ts`:

```ts
import { validateAccessToken, extractUser } from "./middleware/auth";

app.post("/api/chat", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  // ... pass user into processMessage as before
});
```

Remove the mock `anonymous` user.

## Checkpoint

- Clicking **Sign In** takes you to Auth0 Universal Login.
- After login, the header shows `alice@retailzero.demo` and a Log Out button.
- The Network tab shows `Authorization: Bearer eyJ...` on `/api/chat`.
- Requests without a token return `401 Unauthorized`.
- The backend logs `Authenticated request from user: auth0|...`.

Decode the JWT at [jwt.io](https://jwt.io). Confirm `aud` contains `https://devcamp-retailzero-api` and `scope` contains the four `mcp:*` scopes.

## What you learned

Every Z-Merchant call now carries a verifiable rep identity. That identity is the anchor for everything else: CIBA binds approval to this rep's device, FGA evaluates tuples keyed on this `sub`, Token Vault mints tokens scoped to this rep, and Lab 05 exchanges this token for an MCP token that preserves the rep's `sub` all the way to the tool execution. No identity, no audit trail. No audit trail, no compliance sign-off, no Z-Merchant in production.

Business win: compliance checks on wholesale pricing are table stakes for enterprise deals. A clean rep-level audit trail is the difference between a six-month security review and a two-week one.
