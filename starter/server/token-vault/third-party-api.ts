// =============================================================
// LAB 04: Build the simulated Third-Party API
// See: lab-guide/04-token-vault.md
//
// Mocks the Google Workspace + Slack endpoints the MCP server
// calls after minting a short-lived token from Token Vault.
// Kept local (port 3002) so the lab runs offline.
//
// You will implement:
//   - validateGoogleToken / validateSlackToken middlewares
//   - POST /google/docs        -> returns { documentId, title, url }
//   - POST /slack/chat.postMessage -> returns { ok, channel, ts, permalink }
// =============================================================

import express from "express";
import { findAvailablePort } from "../utils/port";

const app = express();
app.use(express.json());

// TODO(lab-04): implement Bearer-token middlewares that accept
// tokens prefixed `google_access_` / `refreshed_google_` (for the
// Google mock) and `slack_access_` / `refreshed_slack_` (for Slack).

// TODO(lab-04): POST /google/docs
// - require validateGoogleToken
// - body: { title: string; body?: string }
// - respond: { documentId, title, url }

// TODO(lab-04): POST /slack/chat.postMessage
// - require validateSlackToken
// - body: { channel: string; text: string }
// - respond: { ok: true, channel, ts, permalink }

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Third-Party API (Google + Slack mocks)" });
});

export async function startThirdPartyAPI() {
  const preferredPort = parseInt(process.env.THIRD_PARTY_API_PORT || "3002");
  const port = await findAvailablePort(preferredPort, "Third-Party API");
  app.listen(port, () => {
    console.log(
      `[Third-Party API] Google + Slack mocks running on http://localhost:${port}`
    );
  });
}

export default app;
