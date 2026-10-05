## Objective *(~20 min)*

<!-- TODO: Flow screenshot here - User Identity -->

<!-- TODO: discuss cutting htis out entirely? -->

Now we can idenitfy our first and third party agents.

But OBO token exchange needs a user identity to carry through to tool execution and right now it has no user to carry.

This module wires Auth0 Universal Login so every session has a verifiable user **sub** that carries downstream.

This module is **read-through only**. The authentication wiring is pre-built in the starter.

By the end, you'll understand:

- How the chat UI is gated behind Auth0 Universal Login.
- How the user's access token reaches every **/api/\*** call.
- How JWTs are validated on the backend.
- How **sub**, **email**, and **scope** are used so downstream modules have a real user context.

## What's provisioned for you

When you clicked **Provision Resources**, the app created everything Nexus needs in your tenant:

- **The Nexus Agent API** (resource server `https://devcamp-nexus-agent-api`) with the `chat:send` scope the SPA uses. Only the Nexus agent's backend accepts these tokens. It exchanges them (OBO) for MCP server tokens before calling tools.
- **The Nexus SPA application**, with callbacks, logout URLs, and web origins set to your Codespace URL.
- **Two demo users** seeded with different access for the FGA module:
  - `alice@docagent.demo`: engineering team member, can read and share engineering documents
    - password: **`DevCamp1!`**
  - `bob@docagent.demo`: all-company access only, denied on engineering, HR, and executive documents
    - password: **`DevCamp1!`**

> [!IMPORTANT]
> **You can log in now.** In the Nexus app, click **Log In** and sign in as `alice@docagent.demo` / `DevCamp1!`.
>
> Everything from here on assumes you're logged in.
>
> Guardian push MFA is enforced tenant-wide, so login also triggers an MFA enrollment in the Auth0 Guardian app.

<!-- TODO: screenshot - Guardian MFA enrollment QR/prompt screen on first login -->
<!-- TODO: screenshot - Nexus chat interface header showing logged-in user's name and Log Out button -->

## Code steps

Open each file in your editor as you go. You'll trace the employee's identity from the browser login all the way to the backend handler.

### Step 1: the React tree is wrapped in **Auth0Provider**

On **src/main.jsx**, a **ConfigGate** checks setup status first, then the whole app is wrapped so every component can read the auth session:

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

**ConfigGate** fetches **GET /api/setup/status** on mount and renders the setup or provisioning UI if needed.

**Auth0Provider** only mounts once the tenant is fully provisioned, ensuring the SDK never initializes with empty credentials.

**RuntimeConfigProvider** fetches **GET /api/config** on mount, so the Auth0 domain, client ID, and audience come from your tenant at runtime instead of being baked in at build time.

**src/auth/Auth0Provider.jsx** reads those values and configures the SDK:

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

**src/App.jsx** uses the SDK's session state to decide what to render:

```jsx
const { isAuthenticated, isLoading, user, logout } = useAuth0();

if (isLoading) {
  return <div className="loading-screen">...</div>;
}
if (!isAuthenticated) {
  return <LoginScreen />;
}
```

Once authenticated, the header renders the user's name and a Log Out button.

### Step 3: the login button calls Auth0

**src/components/LoginScreen.jsx**:

```jsx
const { loginWithRedirect, isLoading } = useAuth0();

<button className="login-button" onClick={() => loginWithRedirect()} disabled={isLoading}>
  {isLoading ? "Loading..." : "Log In"}
</button>
```

### Step 4: the access token is attached to **/api/chat**

**src/hooks/useChat.js** requests a token for the Nexus Agent API audience and sends it on every chat call:

```js
const { getAccessTokenSilently } = useAuth0();
const { audience } = useRuntimeConfig();

const token = await getAccessTokenSilently({
  authorizationParams: {
    audience,   // https://devcamp-nexus-agent-api (the Nexus Agent API)
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

**server/middleware/auth.js** verifies the token against the tenant's issuer and backend audience, then pulls the user's identity off the request:

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

The **getJwtValidator(issuer, audience)** lets a single build serve every demo subdomain. For single-tenant local development, it falls back to **AUTH0_DOMAIN** and **AUTH0_AUDIENCE** from the environment.

### Step 6: the middleware guards the chat route

**server/index.js** applies **validateAccessToken** to **/api/chat** and reads the user off the request:

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

--- 

<details>
  <summary style='font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
  user-select: none;'>
    What you learned
  </summary>

Every Nexus call now carries a verifiable user identity. This becomes the foundational anchor for everything downstream.

Token Vault (from the next module) mints CRM credentials scoped to this user. CIBA and FGA (from *Humans approve what can't be undone and access that knows where it ends*) bind device approval and document access to the same identity. The MCP server receives this identity on every tool call.

A verifiable identity at every layer makes audit trails possible. Audit trails make compliance sign-off possible.

</details>

--- 

## Checkpoint

Use the **Run Checks** button on the left of the Nexus app page. The in-app verifier confirms all four conditions automatically:

<ul>
  <li style="list-style-type:'✅ ';">
      You're logged in as `alice@docagent.demo`.
  </li>
  <li style="list-style-type:'✅ '">
      The access token includes the Nexus Agent API audience (`https://devcamp-nexus-agent-api`).
  </li>
  <li style="list-style-type:'✅ '">
      The token carries the `chat:send` scope.
  </li>
  <li style="list-style-type:'✅ '">
      Guardian push MFA was completed at login.
  </li>
</ul>

Every request now carries a verified human identity. The next module uses that identity to retrieve per-user credentials from Token Vault, so the agent never touches a shared service account.

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
