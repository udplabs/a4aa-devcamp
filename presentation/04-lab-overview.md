# Lab Overview: What We're Building

---

## The Application

A **protected AI chat assistant** that:

1. Authenticates users via Auth0
2. Processes messages through a simulated LLM
3. Calls tools (weather, calendar, email) on the user's behalf
4. Protects tool calls with agent authorization
5. Serves tools through an MCP server secured with Auth for MCP

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │              React Chat Interface                  │  │
│  │                                                    │  │
│  │   ┌──────────┐  ┌────────────┐  ┌──────────────┐ │  │
│  │   │  Login   │  │  Message   │  │    Tool      │ │  │
│  │   │  Screen  │  │  Thread    │  │   Approval   │ │  │
│  │   └──────────┘  └────────────┘  └──────────────┘ │  │
│  │              @auth0/auth0-react                    │  │
│  └──────────────────────┬────────────────────────────┘  │
│                          │ Access Token                   │
└──────────────────────────┼───────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Express    │
                    │  API Server │
                    ├─────────────┤
                    │ JWT Verify  │ ← express-oauth2-jwt-bearer
                    ├─────────────┤
                    │ LLM Sim    │ ← Simulated LLM (pattern matching)
                    ├─────────────┤
                    │ Agent Auth  │ ← Auth0 AI for Agents
                    ├─────────────┤
                    │ MCP Client  │ ← Connects to MCP Server
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ MCP Server  │
                    ├─────────────┤
                    │ Auth for    │ ← OAuth 2.0 token validation
                    │ MCP         │
                    ├─────────────┤
                    │ Tools:      │
                    │  • Weather  │
                    │  • Calendar │
                    │  • Email    │
                    └─────────────┘
```

---

## Lab Progression

### Lab 1: Chat UI + User Auth (20 min)
**Start:** Bare React app with a chat layout
**End:** Users can log in via Auth0 and see the chat interface

You will:
- Configure an Auth0 SPA application
- Add `@auth0/auth0-react` to the app
- Wrap the app in `Auth0Provider`
- Implement login/logout buttons
- Gate the chat behind authentication

### Lab 2: Protected LLM API (15 min)
**Start:** Chat UI sends messages but backend is open
**End:** API validates Auth0 JWTs on every request

You will:
- Create an Auth0 API (resource server)
- Add `express-oauth2-jwt-bearer` middleware
- Send access tokens from the frontend
- Connect the simulated LLM to respond to messages

### Lab 3: Agent Authorization (25 min)
**Start:** LLM responds but executes tools without permission
**End:** Sensitive tools require user approval before execution

You will:
- Define tool permission levels (auto-approve vs. consent-required)
- Implement an approval flow in the UI
- Add token exchange for tool execution
- Build the async consent loop

### Lab 4: MCP Server with Auth for MCP (25 min)
**Start:** Tools run locally in the same process
**End:** Tools are served via a protected MCP server

You will:
- Build an MCP server with the MCP SDK
- Register it as an Auth0 API
- Add OAuth 2.0 token validation
- Connect the agent to the MCP server with credentials
- Test end-to-end tool calls through MCP

### Lab 5: End-to-End Test (5 min)
Run through the complete flow and verify each protection layer.

---

## What's Simulated vs. Real

| Component | Real or Simulated? | Why? |
|-----------|-------------------|------|
| Auth0 login | **Real** | You'll configure a real Auth0 tenant |
| JWT validation | **Real** | Real tokens, real validation |
| LLM | **Simulated** | No API key needed; focus is on auth, not AI |
| Tool execution | **Simulated** | Mock responses; real auth flow |
| MCP protocol | **Real** | Actual MCP SDK and transport |
| Auth for MCP | **Real** | Real OAuth 2.0 token flow |

---

## Let's Build It

Open your StackBlitz environment and proceed to **Lab 1**.
