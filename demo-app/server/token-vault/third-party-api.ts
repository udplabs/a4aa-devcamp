// =============================================================
// Third-Party API (simulated) -- Lab 04
//
// Mocks the Google Workspace + Slack endpoints the MCP server
// calls after minting a short-lived token from Token Vault.
// Kept local (port 3002) so the lab runs offline. In production
// these would be the real SaaS endpoints.
// =============================================================

import express from "express";
import { findAvailablePort } from "../utils/port";

const app = express();
app.use(express.json());

// ----- Google Workspace mock -----------------------------------

function validateGoogleToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }
  const token = authHeader.split(" ")[1];
  if (!token.startsWith("google_access_") && !token.startsWith("refreshed_google_")) {
    return res.status(401).json({ error: "Invalid Google access token" });
  }
  console.log(`[Google Mock] Token accepted`);
  next();
}

app.post("/google/docs", validateGoogleToken, (req, res) => {
  const { title, body } = req.body as { title?: string; body?: string };
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }
  const documentId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const url = `https://docs.google.com/document/d/${documentId}/edit`;
  console.log(`[Google Mock] Created doc "${title}" (${body?.length ?? 0} chars) -> ${documentId}`);
  res.json({ documentId, title, url });
});

// ----- Slack mock ----------------------------------------------

function validateSlackToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "not_authed" });
  }
  const token = authHeader.split(" ")[1];
  if (!token.startsWith("slack_access_") && !token.startsWith("refreshed_slack_")) {
    return res.status(401).json({ ok: false, error: "invalid_auth" });
  }
  console.log(`[Slack Mock] Token accepted`);
  next();
}

app.post("/slack/chat.postMessage", validateSlackToken, (req, res) => {
  const { channel, text } = req.body as { channel?: string; text?: string };
  if (!channel || !text) {
    return res.status(400).json({ ok: false, error: "channel and text are required" });
  }
  const ts = `${Math.floor(Date.now() / 1000)}.${Math.floor(Math.random() * 1_000_000)}`;
  const permalink = `https://retailzero.slack.com/archives/${encodeURIComponent(channel)}/p${ts.replace(".", "")}`;
  console.log(`[Slack Mock] Posted to ${channel}: "${text.slice(0, 60)}..."`);
  res.json({ ok: true, channel, ts, permalink });
});

// ----- Health --------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Third-Party API (Google + Slack mocks)" });
});

export async function startThirdPartyAPI() {
  const preferredPort = parseInt(process.env.THIRD_PARTY_API_PORT || "3002");
  const port = await findAvailablePort(preferredPort, "Third-Party API");
  app.listen(port, () => {
    console.log(`[Third-Party API] Google + Slack mocks running on http://localhost:${port}`);
  });
}

export default app;
