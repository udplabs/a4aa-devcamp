import "dotenv/config";
import express from "express";
import cors from "cors";
import { processMessage } from "./simulator";
import { validateAccessToken, extractUser } from "./middleware/auth";
import {
  initiateCIBA,
  checkCIBAStatus,
  approveCIBA,
  denyCIBA,
  listPendingCIBA,
} from "./middleware/ciba";
import { storeToken, removeToken, listLinkedProviders } from "./token-vault/vault";
import { startThirdPartyAPI } from "./token-vault/third-party-api";
import { startMCPServer } from "./mcp/server";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Chat endpoint - protected with Auth0 JWT validation
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

// --- CIBA Endpoints (Lab 2) ---

app.post("/api/ciba/initiate", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  const { toolName, scope } = req.body;
  const result = await initiateCIBA(user.sub, user.email || "", toolName, scope);
  res.json(result);
});

app.get("/api/ciba/status/:authReqId", validateAccessToken, (req, res) => {
  const result = checkCIBAStatus(req.params.authReqId);
  res.json(result);
});

app.post("/api/ciba/approve/:authReqId", (req, res) => {
  const success = approveCIBA(req.params.authReqId);
  res.json({ approved: success });
});

app.post("/api/ciba/deny/:authReqId", (req, res) => {
  const success = denyCIBA(req.params.authReqId);
  res.json({ denied: success });
});

app.get("/api/ciba/pending", (req, res) => {
  res.json(listPendingCIBA());
});

// --- Token Vault Endpoints (Lab 4) ---

app.post("/api/vault/link", validateAccessToken, (req, res) => {
  const user = extractUser(req);
  const { provider } = req.body;
  storeToken(
    user.sub,
    provider,
    `fs_access_${user.sub}_${Date.now()}`,
    `fs_refresh_${user.sub}`,
    3600,
    ["files:read", "files:list"]
  );
  res.json({ linked: true, provider });
});

app.post("/api/vault/unlink", validateAccessToken, (req, res) => {
  const user = extractUser(req);
  const { provider } = req.body;
  const removed = removeToken(user.sub, provider);
  res.json({ unlinked: removed, provider });
});

app.get("/api/vault/providers", validateAccessToken, (req, res) => {
  const user = extractUser(req);
  const providers = listLinkedProviders(user.sub);
  res.json({ providers });
});

// Start servers
app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});

startMCPServer();
startThirdPartyAPI();

export default app;
