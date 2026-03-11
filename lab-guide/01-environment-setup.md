# Lab 1: Chat Interface + User Authentication

**Duration:** ~20 minutes

## Objectives

- Set up the development environment
- Configure an Auth0 SPA application
- Add user authentication to the chat interface
- Gate the chat behind login

---

## Step 1: Open the Starter Project

Open the `starter/` directory in StackBlitz (or locally):

```bash
cd starter
npm install
```

Run the app to see the unprotected chat UI:

```bash
npm run dev
```

You should see a basic chat interface. Messages can be sent but the backend returns simple echo responses. There is no authentication.

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

## Step 3: Configure Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=https://devcamp-ai-api
```

> **Note:** We'll create the API (audience) in Lab 2. For now, just set the value.

---

## Step 4: Add the Auth0 Provider

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

## Step 5: Wrap the App in Auth0Provider

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

## Step 6: Implement the Login Screen

Open `src/components/LoginScreen.tsx` and implement it:

```tsx
import { useAuth0 } from "@auth0/auth0-react";

export function LoginScreen() {
  const { loginWithRedirect, isLoading } = useAuth0();

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>AI Assistant</h1>
        <p>Log in to start chatting with the AI assistant.</p>
        <p className="login-subtitle">
          Your conversations are protected by Auth0.
        </p>
        <button
          className="login-button"
          onClick={() => loginWithRedirect()}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Log In"}
        </button>
      </div>
    </div>
  );
}
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
        <h1>AI Assistant</h1>
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

## Step 8: Test

1. Refresh your browser
2. You should see the **Login Screen** instead of the chat
3. Click **Log In** - you'll be redirected to Auth0's Universal Login page
4. Create an account or log in
5. After redirect, you should see the chat interface with your name in the header
6. Send a message - the LLM simulator should respond (no auth on API yet)

---

## Checkpoint

At this point you have:
- [x] Auth0 SPA application configured
- [x] Auth0Provider wrapping the React app
- [x] Login/Logout working
- [x] Chat gated behind authentication
- [ ] API is still unprotected (next lab)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Auth0 domain and clientId are required" | Check your `.env` file has the correct values and restart the dev server |
| Redirect fails after login | Verify "Allowed Callback URLs" in Auth0 includes `http://localhost:5173` |
| CORS errors | Verify "Allowed Web Origins" in Auth0 includes `http://localhost:5173` |

---

**Next: [Lab 2 - Protected LLM API](./02-chat-interface.md)**
