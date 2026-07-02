# Nexus Mock CRM Service

A standalone mock CRM: a minimal OAuth2 authorization server plus an activities API. It exists as the externally-hosted alternative to the CRM mock that `demo-app/` already runs in-process on `:3002` for the Codespace/local lab (Module 04, Token Vault). Most participants never need this service; it's here for anyone who wants the CRM connection to point at a separately-running service instead of a co-located process in the same Node app.

For the workshop, "separately-running" means its own GitHub Codespace with the port forwarded, not a Vercel deployment. The code also supports deploying to Vercel (`vercel.json`, `api/index.js`) if you want a persistent hosted URL instead of a Codespace's forwarded port, but that's not how it's actually run day-to-day.

Auth0 registers this as a **custom social connection**, using it two ways:

1. As the OAuth2 authorization server Auth0 redirects to when a user links their CRM account (Connected Accounts / Token Vault).
2. As the downstream CRM API the MCP server calls with a vaulted, per-user access token after Token Vault exchanges for it.

## Why the auth codes are stateless

Auth codes are signed JWTs, not entries in an in-memory `Map`. This keeps the service portable: whether it's a long-running process in a Codespace or a serverless function on Vercel that cold-starts between the `/authorize` redirect and the `/token` exchange, there's no shared store either environment has to keep alive between those two requests. Encoding the grant (email, redirect URI, scope) directly into a short-lived signed JWT means any instance, warm or cold, can verify it on its own.

## Endpoints

| Method + path | Purpose |
|---|---|
| `GET /.well-known/oauth-authorization-server` | OAuth2 discovery document (issuer, endpoints, supported scopes/grants) |
| `GET /authorize` | Auto-approves and redirects back with a signed JWT auth code. Reads the linked user's email from `login_hint`, which Auth0 passes during the Connected Accounts linking flow |
| `POST /token` | Verifies the auth code JWT and client credentials, then issues a signed CRM access token carrying the user's email |
| `POST /crm/activities` | Logs a document activity event. Requires a bearer token from `/token`; the request body's `userId` (the employee's Auth0 `sub`) ties the record to a real person |
| `GET /crm/activities` | Returns the activity log accumulated in the current warm instance |
| `GET /crm/health` | Health check |

## Running in a GitHub Codespace (or locally)

This is how the service is actually run: open this directory in its own Codespace (separate from `demo-app`'s), or work locally if you prefer.

```bash
npm install
cp .env.example .env
```

If you're in a Codespace, forward the port publicly first (**PORTS** tab → find the port → right-click → **Port Visibility → Public**), then fill in `.env` using that forwarded URL as `BASE_URL`:

```
PORT=3000
BASE_URL=https://<your-codespace>-3000.app.github.dev
JWT_SECRET=<generate below>
OAUTH_CLIENT_ID=nexus-crm
OAUTH_CLIENT_SECRET=<any value; must match what you register in Auth0>
```

Running locally instead, `BASE_URL` is `http://localhost:3000`, but note that Auth0 (a cloud service) can't reach `localhost`, so the `/authorize` and `/token` redirects only work end-to-end from a public URL such as a Codespace's forwarded port or a real deployment.

Generate `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start the service:

```bash
npm run dev    # node --watch server.js
npm start      # node server.js
```

## Deploying to Vercel (optional, not the workshop's path)

The code also supports a persistent hosted deployment if you'd rather not rely on a Codespace's forwarded port. `vercel.json` rewrites every request to `api/index.js`, a thin wrapper that re-exports the same Express app (`server.js`) as a serverless function:

```bash
vercel deploy
```

Set the same environment variables (`JWT_SECRET`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `BASE_URL`) in the Vercel project's settings. `BASE_URL` must match the deployed URL exactly (e.g. `https://your-mock-crm.vercel.app`); it's signed into every token as the issuer and audience, and it's the URL Auth0 will call for `/authorize` and `/token`.

> [!NOTE]
> The activity log (`GET /crm/activities`) only reflects what's accumulated in the current warm instance, so on Vercel it can reset on a cold start (a long-running Codespace process doesn't have this issue). Every logged activity is also written with `console.log`, which Vercel's function logs capture permanently, so nothing is actually lost, it's just not queryable through the API across cold starts.

## Registering with Auth0

Create a custom OAuth2 social connection pointing at this deployment:

- **Authorization URL**: `{BASE_URL}/authorize`
- **Token URL**: `{BASE_URL}/token`
- **Client ID** / **Client Secret**: the same `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` values set in this service's environment
- **Scope**: `crm:activities:write`

Enable **Token Vault** (Connected Accounts) on the connection so Auth0 vaults a per-user federated token after the user completes the `/authorize` redirect, exactly as described for the in-process mock in [`../lab-guide/04-token-vault.md`](../lab-guide/04-token-vault.md).

## Further reading

- [`../README.md`](../README.md): workshop overview and the modules
- [`../demo-app/README.md`](../demo-app/README.md): the app that calls this service after Token Vault exchange
- [`../lab-guide/04-token-vault.md`](../lab-guide/04-token-vault.md): Module 04, where the in-process CRM mock and Token Vault flow are covered step by step
