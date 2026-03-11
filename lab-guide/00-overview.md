# Lab Overview

## Securing an AI Chat Assistant with Auth0

In this lab, you will build a chat application that simulates an LLM-powered assistant. The assistant can answer questions and call tools (weather lookup, calendar check, email send) on behalf of authenticated users. You will secure every layer of this application using Auth0.

---

## What You'll Learn

1. How to authenticate users in a chat application with Auth0
2. How to protect a backend API that fronts an AI agent
3. How to implement agent-level authorization for tool calls using Auth0 AI for Agents patterns
4. How to build and secure an MCP server with Auth for MCP
5. How the full identity chain flows from human to agent to tool

---

## Architecture

```
Browser (React)  →  Express API  →  MCP Server
   ↕                    ↕                ↕
  Auth0              Auth0            Auth0
  Login            JWT Verify      Token Validation
```

---

## Project Structure

```
app/
├── index.html              # HTML shell
├── package.json            # Dependencies
├── vite.config.ts          # Vite + proxy config
├── .env                    # Auth0 configuration
├── src/
│   ├── main.tsx            # React entrypoint
│   ├── App.tsx             # Root component with routing
│   ├── auth/
│   │   └── Auth0Provider.tsx   # Auth0 React provider
│   ├── components/
│   │   ├── Chat.tsx            # Main chat interface
│   │   ├── Message.tsx         # Individual message bubble
│   │   ├── ToolApproval.tsx    # Consent dialog for tool calls
│   │   └── LoginScreen.tsx     # Pre-auth landing page
│   ├── hooks/
│   │   └── useChat.ts          # Chat state management
│   └── styles/
│       └── index.css           # Styles
└── server/
    ├── index.ts                # Express server entrypoint
    ├── simulator.ts            # Simulated LLM logic
    ├── middleware/
    │   └── auth.ts             # JWT validation middleware
    └── tools/
        ├── registry.ts         # Tool definitions + permissions
        ├── weather.ts          # Weather tool
        ├── calendar.ts         # Calendar tool
        └── email.ts            # Email tool
    └── mcp/
        ├── server.ts           # MCP server
        └── auth.ts             # MCP auth middleware
```

---

## Labs

| Lab | Title | Focus |
|-----|-------|-------|
| 1 | [Chat UI + User Auth](./01-environment-setup.md) | Auth0 SPA login |
| 2 | [Protected LLM API](./02-chat-interface.md) | JWT validation |
| 3 | [Agent Authorization](./03-protect-the-api.md) | Tool-level permissions |
| 4 | [MCP Server](./04-agent-authorization.md) | Auth for MCP |
| 5 | [End-to-End](./05-mcp-tools.md) | Full integration test |
