# Module 02: User Authentication

## Objective *(~15 min)*

The MCP server now has a trust boundary: it can distinguish a first-party agent (CIMD identity) from an anonymous request and a valid token from a forged one. But OBO token exchange needs an employee identity to carry through to tool execution, and right now there is nothing to carry. This module wires Auth0 Universal Login so every session has a verifiable employee `sub`, the identity that CIMD's OBO exchange will preserve to every tool call downstream.

This module is a **read-through**. The authentication wiring is pre-built in the starter. Your goal is to understand where the employee's identity enters the system and how it flows downstream — not to write new code.

By the end you will understand:

- How the chat UI is gated behind Auth0 Universal Login.
- How the user's access token reaches every `/api/*` call.
- How JWTs are validated on the Express backend with `express-oauth2-jwt-bearer`.
- How `sub`, `email`, and `scope` are extracted so downstream modules have a real user context.

### Why we're building this

An AI agent that calls tools without a verified user identity cannot produce an audit trail that satisfies compliance requirements. Every access decision downstream depends on knowing which employee is behind the request: which documents they can read, which credentials Token Vault returns, and which shares CIBA approves.

The commercial consequence is direct: enterprise customers in regulated industries cite the absence of a user-level audit trail as the single most common reason they delay or block AI agent deployments. Universal Login plugs your existing IdP straight into the agent's authorization chain, so User Authentication ships with zero migration — no new identity system to stand up, no user re-enrollment, no parallel directory. Because every downstream control keys off that verified identity, skipping it means Token Vault and CIBA are working from a guess instead of a fact. A clean, attributable trail on every document access compresses security review cycles from months to weeks, directly accelerating the path to a signed contract.

## Prerequisites

- You completed **Module 01** (Auth for MCP; the MCP server is up and the trust boundary is established).

## What's provisioned for you

When you clicked **Provision Resources**, the app created everything Nexus needs in your tenant. By the time you read this, the tenant already has:

- **The Nexus API** (resource server `https://devcamp-docagent-api`, RS256) with the `chat:send` scope the SPA uses.
- **The Nexus SPA application**, with callbacks, logout URLs, and web origins set to your Codespace URL.
- **Two demo users** seeded with intentionally different document access so later modules have something to bite on:
  - `alice@docagent.demo` — engineering team member, can read and share engineering documents
  - `bob@docagent.demo` — all-company access only, denied on engineering, HR, and executive documents
  
  Both use the password **`DevCamp1!`**

The SPA pulls its Auth0 domain, client ID, and audience at runtime from `GET /api/config`, so the same build works for your tenant. There are no `VITE_AUTH0_*` values for you to copy.

## Code Steps

The app already has this wiring in place. Open each file in your editor as you go — you are tracing the employee's identity from the browser login all the way to the backend handler.

### Step 1: the React tree is wrapped in `Auth0Provider`

Open `src/main.jsx`. A `ConfigGate` checks setup status first, then the whole app is wrapped so every component can read the auth session:

```jsx
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfigGate>
      <RuntimeConfigProvider>
        <Auth0Provider>
          <App />
        </Auth0Provider>
      </RuntimeConfigProvider>
    </ConfigGate>
  </React.StrictMode>
);
```

`ConfigGate` fetches `GET /api/setup/status` on mount and renders the setup or provisioning UI if needed. `Auth0Provider` only mounts once the tenant is fully provisioned, ensuring the SDK never initializes with empty credentials. `RuntimeConfigProvider` fetches `GET /api/config` on mount, so the Auth0 domain, client ID, and audience come from your tenant at runtime instead of being baked in at build time. `src/auth/Auth0Provider.jsx` reads those values and configures the SDK:

```jsx
const { domain, clientId, audience } = useRuntimeConfig();

return (
  <Provider
    domain={domain}
    clientId={clientId}
    authorizationParams={{
      redirect_uri: window.location.origin,
      audience,
      scope: "openid profile email",
    }}
  >
    {children}
  </Provider>
);
```

### Step 2: the app is gated behind login

`src/App.jsx` uses the SDK's session state to decide what to render:

```jsx
const { isAuthenticated, isLoading, user, logout } = useAuth0();

if (isLoading) {
  return <div className="loading-screen">...</div>;
}
if (!isAuthenticated) {
  return <LoginScreen />;
}
```

Once authenticated, the header renders `user?.name` and a Log Out button.

### Step 3: the login button calls Auth0

`src/components/LoginScreen.jsx`:

```jsx
const { loginWithRedirect, isLoading } = useAuth0();

<button className="login-button" onClick={() => loginWithRedirect()} disabled={isLoading}>
  {isLoading ? "Loading..." : "Log In"}
</button>
```

> [!IMPORTANT]
> **Log in now.** In the Nexus app, click **Log In** and sign in as `alice@docagent.demo` / `DevCamp1!` (from Module 00). This is the first time you're using these credentials — everything from here on assumes you're logged in.

### Step 4: the access token is attached to `/api/chat`

`src/hooks/useChat.js` requests a token for the Nexus API audience and sends it on every chat call:

```js
const { getAccessTokenSilently } = useAuth0();
const { audience } = useRuntimeConfig();

const token = await getAccessTokenSilently({
  authorizationParams: {
    audience,   // https://devcamp-docagent-api
    scope: "chat:send",
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

### Step 5: the backend validates JWTs

`server/middleware/auth.js` verifies the token against the tenant's issuer and backend audience, then pulls the user's identity off the verified payload:

```js
import { getJwtValidator } from "../platform/jwt.js";

export const validateAccessToken = (req, res, next) => {
  const tenant = req.tenant;
  const issuer = tenant?.issuer || `https://${process.env.AUTH0_DOMAIN}/`;
  const audience = tenant?.backendAudience || process.env.AUTH0_AUDIENCE || "";
  return getJwtValidator(issuer, audience)(req, res, next);
};

export function extractUser(req) {
  const authHeader = req.headers?.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return {
    sub: req.auth?.payload?.sub,
    scope: req.auth?.payload?.scope?.split(" ") || [],
    email: req.auth?.payload?.email,
    accessToken,
  };
}
```

The multi-tenant `getJwtValidator(issuer, audience)` factory lets a single build serve every demo subdomain. For single-tenant local development, it falls back to `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` from the environment.

### Step 6: the middleware guards the chat route

`server/index.js` applies `validateAccessToken` to `/api/chat` and reads the user off the request:

```js
import { validateAccessToken, extractUser } from "./middleware/auth.js";

app.post("/api/chat", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  console.log(`Authenticated request from user: ${user.sub}`);
  const { message, conversationHistory } = req.body;
  const response = await processMessage(message, conversationHistory, user, req.tenant);
  res.json(response);
});
```

There is no mock `anonymous` user: a request without a valid token never reaches the handler.

## Checkpoint

> [!NOTE]
> The **Run Checks** button lives in *this Lab Guide*, at the bottom of this page — not inside the Nexus app itself.

Use the **Run Checks** button at the bottom of this page. The in-app verifier confirms:

- You are logged in as `alice@docagent.demo`.
- The access token includes the Nexus API audience (`https://devcamp-docagent-api`).
- The token carries the `chat:send` scope.

> [!TIP]
> You can also decode the raw JWT at [jwt.io](https://jwt.io) to inspect the `aud`, `sub`, and `scope` claims directly. To get the raw token: open your browser's DevTools (F12 or right-click → Inspect), open the **Network** tab, send any chat message in Nexus, and click the `/api/chat` request that appears. Copy the `Authorization` request header's value and paste everything **after** `Bearer ` into jwt.io. The backend terminal also shows `Authenticated request from user: auth0|...` on every chat call — the `sub` there matches the `sub` in the token.

## What you learned

Every Nexus call now carries a verifiable user identity, which becomes the foundational anchor for everything that follows: Token Vault (Module 03) mints CRM credentials scoped to this user, CIBA (Module 04) binds device approval to this same identity, and FGA (Module 05) evaluates document access keyed on this `sub`. The MCP server built in Module 01 receives this identity on every tool call, which is precisely what FGA, Token Vault, and CIBA all reason against. Without a verifiable identity at every layer, there is no audit trail. Without an audit trail, there is no compliance sign-off.

> [!NOTE]
> Business win: a clean user-level audit trail on document access is the difference between a six-month security review and a two-week one.

#### <span style="font-variant: small-caps">Congrats!</span>

*You have completed this module.*

You should have successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      gated the Nexus chat UI behind Auth0 Universal Login;
  </li>
  <li style="list-style-type:'✅ '">
      attached the user's access token to every <code>/api/chat</code> call;
  </li>
  <li style="list-style-type:'✅ '">
      validated the JWT on the Express backend;
  </li>
  <li style="list-style-type:'✅ '">
      extracted the user's <code>sub</code>, <code>email</code>, and <code>scope</code> for downstream modules.
  </li>
</ul>

Every request now carries a verified employee identity. Module 03 uses that identity to retrieve per-user credentials from Token Vault — so the agent never touches a shared service account.

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
