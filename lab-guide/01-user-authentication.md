# Lab 1: User Authentication

## Objectives

- Configure an Auth0 SPA application
- Wire `Auth0Provider` into the existing app
- Implement login/logout
- Gate the chat behind authentication
- Create an Auth0 API (resource server)
- Add JWT validation middleware to Express
- Send access tokens from frontend to API
- Extract user context (`sub`, `email`, `scopes`) and pass to the LLM simulator

---

## Premise

The chat UI is already built and running. Your job is to add the identity layer — from user login all the way through to JWT-protected API calls.

---

## Step 1: Open the Starter Project

Open the `starter/` directory:

```bash
cd starter
npm install
npm run dev
```

You should see a working chat interface. Messages can be sent and the LLM simulator responds. There is no authentication — anyone can use it.

---

## Step 2: Create an Auth0 Application

1. Log in to your [Auth0 Dashboard](https://manage.auth0.com)
2. Go to **Applications > Applications > Create Application**
3. Choose **Single Page Application** and name it `DevCamp AI Chat`
4. In the **Settings** tab, configure:

| Setting | Value |
|---------|-------|
| Allowed Callback URLs | `http://localhost:5173` |
| Allowed Logout URLs | `http://localhost:5173` |
| Allowed Web Origins | `http://localhost:5173` |

5. Note your **Domain** and **Client ID** from the Settings page.

---

## Step 3: Create an Auth0 API

1. In the Auth0 Dashboard, go to **Applications > APIs > Create API**
2. Configure:

| Setting | Value |
|---------|-------|
| Name | `DevCamp AI API` |
| Identifier | `https://devcamp-ai-api` |
| Signing Algorithm | RS256 |

3. In the **Permissions** tab, add these scopes:

| Permission | Description |
|------------|-------------|
| `chat:send` | Send messages to the AI assistant |
| `tools:read` | Read data from low-risk tools |
| `tools:execute` | Execute tool actions |
| `email:send` | Send emails on behalf of the user |

---

## Step 4: Configure Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=https://devcamp-ai-api

AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://devcamp-ai-api
```

> The `VITE_` prefixed vars are used by the frontend. The non-prefixed vars are used by the backend.

---

## Step 5: Implement the Auth0 Provider

Open `src/auth/Auth0Provider.tsx`. This file is stubbed out. Replace the contents with:

```tsx
import { Auth0Provider as Provider } from "@auth0/auth0-react";
import { PropsWithChildren } from "react";

export function Auth0Provider({ children }: PropsWithChildren) {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  if (!domain || !clientId) {
    throw new Error("Auth0 domain and clientId are required in .env");
  }

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
}
```

---

## Step 6: Wrap the App in Auth0Provider

Open `src/main.tsx` and wrap `<App />` with the provider:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { Auth0Provider } from "./auth/Auth0Provider";
import App from "./App";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Auth0Provider>
      <App />
    </Auth0Provider>
  </React.StrictMode>
);
```

---

## Step 7: Gate the Chat Behind Authentication

Open `src/App.tsx` and add the authentication gate:

```tsx
import { useAuth0 } from "@auth0/auth0-react";
import { Chat } from "./components/Chat";
import { LoginScreen } from "./components/LoginScreen";

export default function App() {
  const { isAuthenticated, isLoading, user, logout } = useAuth0();

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Voyager</h1>
        <div className="user-info">
          <span>{user?.name}</span>
          <button
            className="logout-button"
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          >
            Log Out
          </button>
        </div>
      </header>
      <Chat />
    </div>
  );
}
```

---

## Step 8: Add JWT Validation Middleware

Open `server/middleware/auth.ts` and implement JWT validation:

```typescript
import { auth } from "express-oauth2-jwt-bearer";

export const validateAccessToken = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.AUTH0_AUDIENCE,
});

export function extractUser(req: any) {
  return {
    sub: req.auth?.payload?.sub as string,
    scope: (req.auth?.payload?.scope as string)?.split(" ") || [],
    email: req.auth?.payload?.email as string | undefined,
  };
}
```

---

## Step 9: Protect the Chat Endpoint

Open `server/index.ts` and apply the middleware:

1. Import the middleware at the top:

```typescript
import { validateAccessToken, extractUser } from "./middleware/auth";
```

2. Add `validateAccessToken` to the `/api/chat` route:

```typescript
app.post("/api/chat", validateAccessToken, async (req, res) => {
  try {
    const user = extractUser(req);
    console.log(`Authenticated request from user: ${user.sub}`);

    const { message, conversationHistory } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const response = await processMessage(message, conversationHistory, user);
    res.json(response);
  } catch (error: any) {
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message });
  }
});
```

---

## Step 10: Send Access Tokens from the Frontend

Open `src/hooks/useChat.ts` and update the `sendMessage` function to include the access token.

1. Import and use the Auth0 hook:

```typescript
import { useAuth0 } from "@auth0/auth0-react";
```

2. Inside `useChat()`, get the token function:

```typescript
const { getAccessTokenSilently } = useAuth0();
```

3. In `sendMessage`, get a token before the fetch call:

```typescript
const token = await getAccessTokenSilently({
  authorizationParams: {
    audience: import.meta.env.VITE_AUTH0_AUDIENCE,
    scope: "chat:send",
  },
});
```

4. Add the Authorization header to the fetch:

```typescript
const response = await fetch("/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    message: content,
    conversationHistory: messages,
  }),
});
```

---

## Step 11: Test

### Test 1: Unauthenticated Access
1. Refresh your browser
2. You should see the **Login Screen** instead of the chat
3. The chat is now gated behind authentication

### Test 2: Login
1. Click **Log In** — you'll be redirected to Auth0's Universal Login page
2. Create an account or log in
3. After redirect, you should see the chat interface with your name in the header

### Test 3: Authenticated Chat
1. Send a message like "What's the weather in Tokyo?"
2. The LLM simulator should respond with weather data
3. Check the server console — you should see `Authenticated request from user: auth0|...`

### Test 4: Verify API Protection
Open your browser's developer console and run:

```javascript
fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Hello" })
}).then(r => console.log("Status:", r.status));
```

You should see `Status: 401`. The API rejects requests without a valid token.

---

## Understanding What Happened

```
1. User logs in via Auth0 Universal Login
2. Frontend receives ID token + access token
3. User types a message
4. Frontend calls getAccessTokenSilently() to get a fresh token
5. Frontend sends POST /api/chat with Authorization: Bearer <token>
6. Express middleware validates the JWT:
   - Checks signature against Auth0's JWKS endpoint
   - Validates issuer, audience, and expiry
   - Extracts user claims
7. If valid → LLM simulator processes the message with user context
   If invalid → 401 Unauthorized
```

---

## Checkpoint

At this point you have:
- [x] Auth0 SPA application configured
- [x] Auth0 API (resource server) created
- [x] Auth0Provider wrapping the React app
- [x] Login/Logout working
- [x] Chat gated behind authentication
- [x] JWT validation on the Express backend
- [x] Access tokens sent from the frontend
- [x] User context available to the LLM simulator

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Auth0 domain and clientId are required" | Check your `.env` file has the correct values and restart the dev server |
| Redirect fails after login | Verify "Allowed Callback URLs" in Auth0 includes `http://localhost:5173` |
| CORS errors | Verify "Allowed Web Origins" in Auth0 includes `http://localhost:5173` |
| 401 even after login | Check that `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` match in `.env` (both `VITE_` and non-`VITE_` versions) |

---

**Next: [Lab 2 — Async Authorization (CIBA)](./02-async-authorization-ciba.md)**
