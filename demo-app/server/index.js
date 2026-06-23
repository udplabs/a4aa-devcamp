import "dotenv/config";
import express from "express";
import cors from "cors";
import { processMessage as simulatorProcessMessage } from "./simulator.js";
import { validateAccessToken, extractUser } from "./middleware/auth.js";
import {
  initiateCIBA,
  checkCIBAStatus,
  approveCIBA,
  denyCIBA,
  listPendingCIBA,
} from "./middleware/ciba.js";
import { recordConsent } from "./middleware/agent-auth.js";
import { storeToken, removeToken, listLinkedProviders } from "./token-vault/vault.js";
import { startCRMServer } from "./crm/app.js";
import { startMCPServer, TOOLS as MCP_TOOLS } from "./mcp/server.js";
import { getLogs } from "./mcp/toolLog.js";
import { executeTool } from "./tools/registry.js";
import { getClientMetadata } from "./mcp/cimd.js";
import { getManagementToken } from "./platform/auth0Management.js";
import { runProvision, runDeprovision, deploymentDataToEnvVars } from "./platform/provision.js";
import { fgaSettingsFromEnvOrRecord } from "./platform/fgaProvision.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import guideRouter from "./routes/guide.js";
import hooksRouter from "./platform/hooks.js";
import { tenantResolver } from "./platform/tenantResolver.js";

const PROVISIONED_ENV_KEYS = [
  "VITE_AUTH0_CLIENT_ID", "AUTH0_AUDIENCE", "MCP_AUTH0_AUDIENCE",
  "AUTH0_CLIENT_ID_M2M", "AUTH0_CLIENT_SECRET_M2M",
  "AUTH0_CIBA_CLIENT_ID", "AUTH0_CIBA_CLIENT_SECRET",
  "VAULT_CONN_CRM", "FGA_STORE_ID", "FGA_MODEL_ID",
];

// Remove specific keys from the .env file and from process.env.
function clearEnvKeys(keys) {
  const envPath = path.resolve(process.cwd(), ".env");
  let existing = "";
  try { existing = fs.readFileSync(envPath, "utf-8"); } catch { return; }
  const keySet = new Set(keys);
  const result = existing
    .split("\n")
    .filter((line) => {
      const match = line.match(/^([A-Z0-9_]+)=/);
      return !match || !keySet.has(match[1]);
    })
    .join("\n");
  fs.writeFileSync(envPath, result, "utf-8");
  for (const k of keys) delete process.env[k];
}

// Upsert env var key=value pairs into the .env file at the project root.
// Existing keys not in `vars` are preserved; existing keys in `vars` are
// overwritten. New keys are appended.
function writeEnv(vars) {
  const envPath = path.resolve(process.cwd(), ".env");
  let existing = "";
  try { existing = fs.readFileSync(envPath, "utf-8"); } catch { /* file may not exist yet */ }
  const lines = existing ? existing.split("\n") : [];
  const updated = new Set();
  const result = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match && vars[match[1]] !== undefined) {
      updated.add(match[1]);
      return `${match[1]}=${vars[match[1]]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(vars)) {
    if (!updated.has(k)) result.push(`${k}=${v}`);
  }
  fs.writeFileSync(envPath, result.join("\n"), "utf-8");
}

// Use OpenAI LLM when API key is available, otherwise fall back to pattern matching
const useLLM = !!process.env.OPENAI_API_KEY;
let processMessage = simulatorProcessMessage;

if (useLLM) {
  const llm = await import("./llm.js");
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

// Setup status -- tells the frontend which of the three states the app is in
// (unconfigured / configured-but-not-provisioned / ready). No auth required.
app.get("/api/setup/status", (_req, res) => {
  res.json({
    hasBaseConfig: !!(process.env.AUTH0_DOMAIN && process.env.AUTH0_MGMT_CLIENT_ID),
    isProvisioned: !!(process.env.VITE_AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_ID_M2M),
  });
});

// In-app provisioning -- runs the Auth0 Management API calls, writes results
// to .env, and injects them into process.env for the current process. The
// dev server (nodemon/vite-node) detects the .env change and restarts.
app.post("/api/setup/provision", async (req, res) => {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const secret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  if (!domain || !clientId || !secret) {
    return res.status(400).json({
      error: "Missing AUTH0_DOMAIN, AUTH0_MGMT_CLIENT_ID, or AUTH0_MGMT_CLIENT_SECRET in .env",
    });
  }
  try {
    const appUrl = req.body?.appUrl || `${req.protocol}://${req.headers.host}`;
    // In a Codespace the CRM server runs on port 3002; derive its public URL
    // by swapping the port suffix in the Codespace forwarding URL.
    const crmUrl = appUrl.replace(/-3000(\.app\.github\.dev)/, "-3002$1");
    const ctx = await getManagementToken({ domain, client_id: clientId, client_secret: secret });
    const fgaSettings = fgaSettingsFromEnvOrRecord({});
    const deploymentData = await runProvision(ctx, {
      appUrl,
      crmUrl,
      demoName: "codespace",
      fgaSettings,
      oidcClientId: null,
    });
    const envVars = deploymentDataToEnvVars(deploymentData);
    writeEnv(envVars);
    Object.assign(process.env, envVars);
    res.json({ ok: true, keys: Object.keys(envVars) });
  } catch (err) {
    console.error("[setup] provision failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// In-app deprovisioning -- deletes all Auth0 resources created by /api/setup/provision
// and clears the provisioned keys from .env. The base config keys (AUTH0_DOMAIN,
// AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET) are preserved so the panel
// can be used to re-provision without re-entering credentials.
app.post("/api/setup/deprovision", async (req, res) => {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const secret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  if (!domain || !clientId || !secret) {
    return res.status(400).json({
      error: "Missing AUTH0_DOMAIN, AUTH0_MGMT_CLIENT_ID, or AUTH0_MGMT_CLIENT_SECRET in .env",
    });
  }
  try {
    const ctx = await getManagementToken({ domain, client_id: clientId, client_secret: secret });
    await runDeprovision(ctx);
    clearEnvKeys(PROVISIONED_ENV_KEYS);
    res.json({ ok: true });
  } catch (err) {
    console.error("[setup] deprovision failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// CIMD: per-tenant client metadata document (RFC 9728 / MCP CIMD spec).
// In the Codespace model the URL is unique per participant automatically
// because each Codespace has its own public hostname.
app.get("/.well-known/client-metadata", (req, res) => {
  const clientId =
    req.tenant?.deploymentData?.m2m_client_id ||
    process.env.AUTH0_CLIENT_ID_M2M ||
    "";
  res.json(getClientMetadata(clientId));
});

// Resolve the tenant for every /api request from the request
// subdomain and attach req.tenant. No-op for local single-tenant runs.
app.use("/api", tenantResolver.middleware());

// Runtime config for the SPA. The frontend fetches this on mount to
// initialize Auth0 per tenant, instead of baking VITE_AUTH0_* at build
// time -- one build serves every demo subdomain.
app.get("/api/config", (req, res) => {
  const tenant = req.tenant;
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

    const response = await processMessage(message, conversationHistory, user, req.tenant);
    res.json(response);
  } catch (error) {
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
    req.tenant
  );
  res.json(result);
});

app.get("/api/ciba/status/:authReqId", validateAccessToken, async (req, res) => {
  const result = await checkCIBAStatus(req.params.authReqId);
  // On approval, record in-memory consent so the re-sent message passes
  // checkToolAuthorization without triggering a second CIBA loop.
  if (result.status === "approved" && result.userId && result.toolName) {
    recordConsent(result.userId, result.toolName);
  }
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
  const scopeMap = {
    crm: ["crm:activities:write"],
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

// --- MCP Dev Endpoints ---

// Status: tool catalog + scope inventory. No auth -- this is an
// observable description of what the MCP server exposes, not user data.
app.get("/api/mcp/status", (_req, res) => {
  res.json({
    status: "ok",
    serverUrl: `http://localhost:${process.env.MCP_SERVER_PORT || 3001}`,
    tools: MCP_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      requiredScope: t.requiredScope,
      inputSchema: t.inputSchema,
    })),
    scopes: ["mcp:docs:search", "mcp:docs:read", "mcp:crm:log", "mcp:docs:share"],
    timestamp: new Date().toISOString(),
  });
});

// Logs: recent tool call log entries written by the MCP server.
app.get("/api/mcp/logs", (_req, res) => {
  res.json({ logs: getLogs() });
});

// Test: direct authenticated tool call. The user's access token is used
// for the OBO exchange so identity + FGA are enforced exactly as in chat.
app.post("/api/mcp/test", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  const { toolName, parameters } = req.body;
  if (!toolName) {
    return res.status(400).json({ error: "toolName is required" });
  }
  try {
    const result = await executeTool(toolName, parameters || {}, user.accessToken);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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
startCRMServer();

export default app;
