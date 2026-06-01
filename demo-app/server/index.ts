import "dotenv/config";
import express from "express";
import cors from "cors";
import { processMessage as simulatorProcessMessage } from "./simulator";
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
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import guideRouter from "./routes/guide";
import hooksRouter from "./platform/hooks";
import { tenantResolver } from "./platform/tenantResolver";

// Use OpenAI LLM when API key is available, otherwise fall back to pattern matching
const useLLM = !!process.env.OPENAI_API_KEY;
let processMessage = simulatorProcessMessage;

if (useLLM) {
  const llm = await import("./llm");
  processMessage = llm.processMessage;
  console.log("[Server] Using OpenAI LLM for chat responses");
} else {
  console.log("[Server] No OPENAI_API_KEY found, using pattern-matching simulator");
}

const app = express();

let PORT = Number(process.env.PORT || 3000);
try { PORT = parseInt(fs.readFileSync(".port", "utf-8").trim()); } catch {}

app.use(cors());
app.use(express.json());

// Lab guide viewer
app.use(guideRouter);

// Demo platform lifecycle hooks (request/create/update/destroy)
app.use(hooksRouter);

// Health check -- registered BEFORE the tenant middleware so platform
// liveness probes never trigger a bootstrap lookup.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Resolve the tenant for every /api request from the request
// subdomain and attach req.tenant. No-op for local single-tenant runs.
app.use("/api", tenantResolver.middleware());

// Runtime config for the SPA. The frontend fetches this on mount to
// initialize Auth0 per tenant, instead of baking VITE_AUTH0_* at build
// time -- one build serves every demo subdomain.
app.get("/api/config", (req, res) => {
  const tenant = (req as any).tenant;
  res.json({
    domain: tenant?.domain || process.env.AUTH0_DOMAIN || "",
    clientId: tenant?.clientId || process.env.VITE_AUTH0_CLIENT_ID || "",
    audience: tenant?.backendAudience || process.env.AUTH0_AUDIENCE || "",
  });
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

    const response = await processMessage(message, conversationHistory, user, (req as any).tenant);
    res.json(response);
  } catch (error: any) {
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- CIBA Endpoints (Lab 2) ---

app.post("/api/ciba/initiate", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  const { toolName, scope, bindingMessage } = req.body;
  const result = await initiateCIBA(
    user.sub,
    user.email || "",
    toolName,
    scope,
    bindingMessage,
    (req as any).tenant
  );
  res.json(result);
});

app.get("/api/ciba/status/:authReqId", validateAccessToken, async (req, res) => {
  const result = await checkCIBAStatus(req.params.authReqId);
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
  const { provider } = req.body as { provider: "google" | "slack" | string };
  const scopeMap: Record<string, string[]> = {
    google: [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive.file",
    ],
    slack: ["chat:write", "channels:read"],
  };
  const scopes = scopeMap[provider] || ["openid"];
  storeToken(
    user.sub,
    provider,
    `${provider}_access_${user.sub}_${Date.now()}`,
    `${provider}_refresh_${user.sub}`,
    3600,
    scopes
  );
  res.json({ linked: true, provider, scopes });
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

// Production: serve the built SPA. In dev, Vite serves the frontend on
// its own port, so this only kicks in when dist/ exists.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback: anything not under /api or /hooks returns index.html.
  app.get(/^(?!\/(api|hooks)\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
  console.log(`[Server] Serving built SPA from ${distDir}`);
}

// Start servers
app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});

startMCPServer();
startThirdPartyAPI();

export default app;
