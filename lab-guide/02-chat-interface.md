# Lab 2: Protected LLM API

**Duration:** ~15 minutes

## Objectives

- Create an Auth0 API (resource server)
- Add JWT validation to the Express backend
- Send access tokens from the React frontend
- Verify the simulated LLM only responds to authenticated requests

---

## Step 1: Create an Auth0 API

1. In the [Auth0 Dashboard](https://manage.auth0.com), go to **Applications > APIs > Create API**
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

## Step 2: Update Environment Variables

Add the API details to your `.env`:

```
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=https://devcamp-ai-api

AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://devcamp-ai-api
```

> The `VITE_` prefixed vars are used by the frontend. The non-prefixed vars are used by the backend.

---

## Step 3: Add JWT Validation Middleware

Open `server/middleware/auth.ts` and implement JWT validation:

```typescript
import { auth } from "express-oauth2-jwt-bearer";

export const validateAccessToken = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.AUTH0_AUDIENCE,
});

// Extract user info from the validated token
export function extractUser(req: any) {
  return {
    sub: req.auth?.payload?.sub,
    scope: req.auth?.payload?.scope?.split(" ") || [],
    email: req.auth?.payload?.email,
  };
}
```

---

## Step 4: Protect the Chat Endpoint

Open `server/index.ts` and apply the middleware to the `/api/chat` endpoint:

Find the existing route:

```typescript
// BEFORE: Unprotected
app.post("/api/chat", async (req, res) => {
```

Replace with:

```typescript
// AFTER: Protected with Auth0 JWT validation
import { validateAccessToken, extractUser } from "./middleware/auth";

app.post("/api/chat", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  console.log(`Authenticated request from user: ${user.sub}`);

  const { message, conversationHistory } = req.body;
  const response = await processMessage(message, conversationHistory, user);
  res.json(response);
});
```

---

## Step 5: Send Access Tokens from the Frontend

Open `src/hooks/useChat.ts` and update the `sendMessage` function to include the access token:

Find the `sendMessage` function and update the fetch call:

```typescript
import { useAuth0 } from "@auth0/auth0-react";

export function useChat() {
  const { getAccessTokenSilently } = useAuth0();
  // ... existing state ...

  const sendMessage = async (content: string) => {
    // Get an access token for the API
    const token = await getAccessTokenSilently({
      authorizationParams: {
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        scope: "chat:send",
      },
    });

    // Add user message to state
    const userMessage = { role: "user" as const, content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
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

      if (response.status === 401) {
        throw new Error("Unauthorized - your session may have expired");
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message, toolCalls: data.toolCalls },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${error.message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, sendMessage, isLoading };
}
```

---

## Step 6: Test the Protected API

### Test 1: Authenticated Request
1. Refresh your app and log in
2. Send a message like "Hello, what can you do?"
3. The simulated LLM should respond with a list of capabilities

### Test 2: Unauthenticated Request (verify protection works)
Open your browser's developer tools console and run:

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
7. If valid → LLM simulator processes the message
   If invalid → 401 Unauthorized
```

---

## Checkpoint

At this point you have:
- [x] Auth0 API (resource server) created
- [x] JWT validation on the Express backend
- [x] Access tokens sent from the frontend
- [x] API rejects unauthenticated requests
- [ ] Tools execute without per-action authorization (next lab)

---

**Next: [Lab 3 - Agent Authorization](./03-protect-the-api.md)**
