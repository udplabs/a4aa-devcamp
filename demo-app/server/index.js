import "dotenv/config";
import dotenv from "dotenv";
import fs from "fs";

// Load pre-claimed ports written by find-port.js so servers don't re-scan
// and collide. Falls back to env vars or defaults if the file doesn't exist.
try {
  const portsFile = fs.readFileSync(".ports", "utf-8");
  for (const line of portsFile.split("\n")) {
    const [key, val] = line.split("=");
    if (key && val && !process.env[key.trim()]) {
      process.env[key.trim()] = val.trim();
    }
  }
} catch { /* not present in production / first run */ }

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
import path from "path";
import { fileURLToPath } from "url";
import guideRouter from "./routes/guide.js";
import hooksRouter from "./platform/hooks.js";
import { tenantResolver } from "./platform/tenantResolver.js";

const PROVISIONED_ENV_KEYS = [
  "VITE_AUTH0_CLIENT_ID", "AUTH0_AUDIENCE", "AUTH0_TOOL_AUDIENCE",
  "AUTH0_OBO_CLIENT_ID", "AUTH0_OBO_CLIENT_SECRET",
  "AUTH0_CIBA_CLIENT_ID", "AUTH0_CIBA_CLIENT_SECRET",
  "AUTH0_MFA_ACTION_ID",
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

// Setup status -- tells the frontend which setup stage the app is in.
// Stages (in order):
//   1. !hasBaseConfig    → SetupBanner   (enter Auth0 credentials)
//   2. !isProvisioned    → ProvisionPanel (provision Auth0 resources)
//   3. !hasMCPConfig     → Module01Panel  (complete Module 01 Dashboard steps)
//   4. ready             → LoginScreen    (authenticate and use the app)
app.get("/api/setup/status", (_req, res) => {
  res.json({
    hasBaseConfig: !!(process.env.AUTH0_DOMAIN && process.env.AUTH0_MGMT_CLIENT_ID),
    isProvisioned: !!(process.env.VITE_AUTH0_CLIENT_ID),
    hasMCPConfig:  !!(process.env.AUTH0_OBO_CLIENT_ID && process.env.AUTH0_OBO_CLIENT_SECRET),
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
    const reqHost = req.headers["x-forwarded-host"] || req.headers.host;
    const reqProto = req.headers["x-forwarded-proto"] || req.protocol;
    const appUrl = req.body?.appUrl || `${reqProto}://${reqHost}`;
    // Derive the CRM server's public URL from the app URL.
    // Codespace: replace ANY port in the subdomain with the CRM port.
    // Local: use localhost on the CRM port directly.
    const crmPort = parseInt(process.env.CRM_PORT || process.env.THIRD_PARTY_API_PORT || "3002");
    const crmUrl = appUrl.includes(".app.github.dev")
      ? appUrl.replace(/-\d+(\.app\.github\.dev)/, `-${crmPort}$1`)
      : `http://localhost:${crmPort}`;
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

// Restart lab -- deletes Auth0 resources (best effort) and clears ALL managed
// env keys including base config, returning the app to the initial SetupBanner state.
app.post("/api/setup/restart", async (req, res) => {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const secret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  if (domain && clientId && secret) {
    try {
      const ctx = await getManagementToken({ domain, client_id: clientId, client_secret: secret });
      await runDeprovision(ctx);
    } catch (err) {
      // Best effort — log but don't fail the restart
      console.error("[restart] deprovision failed (continuing):", err.message);
    }
  }
  clearEnvKeys([
    "AUTH0_DOMAIN", "AUTH0_MGMT_CLIENT_ID", "AUTH0_MGMT_CLIENT_SECRET",
    ...PROVISIONED_ENV_KEYS,
  ]);
  res.json({ ok: true });
});

// CIMD: client metadata document. The URL of this endpoint IS the
// agent's client_id — self-referential per the CIMD spec.
app.get("/.well-known/client-metadata", (req, res) => {
  res.json(getClientMetadata(req));
});

// ---- Module verification endpoints ----------------------------------
// Each endpoint runs the setup checks for a module and returns
// { checks: [{ id, name, pass, message }] }. Used by the in-app
// ModuleChecks component so participants never need to run curl.

app.get("/api/verify/module01", async (req, res) => {
  const mcpPort = process.env.MCP_SERVER_PORT || 3001;
  const mcpBase = `http://localhost:${mcpPort}`;
  const checks = [];

  // Derive the public CIMD URL from the incoming request's forwarded host,
  // swapping the API port for the MCP port. This matches what Auth0 sees
  // when the participant imports the metadata URL in the Dashboard.
  const mcpPortStr = String(mcpPort);
  const reqProto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const reqHost  = req.headers["x-forwarded-host"]  || req.headers.host || `localhost:${mcpPort}`;
  // Replace whatever port is in the host with the MCP port — the x-forwarded-host
  // carries the browser-facing port (e.g. 5173 for Vite, or 3000 for the API direct),
  // but the CIMD URL that was registered in Auth0 uses the MCP port.
  const publicMcpHost = reqHost.includes(".app.github.dev")
    ? reqHost.replace(/-\d+(\.app\.github\.dev)$/, `-${mcpPortStr}$1`)
    : reqHost.replace(/:\d+$/, `:${mcpPortStr}`);
  const publicCimdUrl = `${reqProto}://${publicMcpHost}/.well-known/client-metadata`;

  // 1. CIMD metadata document (verify endpoint is responding locally)
  let cimdUrl = publicCimdUrl;
  try {
    const r = await fetch(`${mcpBase}/.well-known/client-metadata`);
    const body = await r.json();
    const isUrl = typeof body.client_id === "string" && body.client_id.startsWith("http");
    checks.push({ id: "cimd", name: "CIMD identity document reachable", pass: isUrl,
      message: isUrl ? `client_id: ${publicCimdUrl}` : "client_id is not a URL — is port 3001 public?" });
    if (!isUrl) cimdUrl = null;
  } catch (e) {
    checks.push({ id: "cimd", name: "CIMD identity document reachable", pass: false, message: e.message });
    cimdUrl = null;
  }

  // 1b. Verify Auth0 has a client registered with the public CIMD URL as its client_id
  const domain = process.env.AUTH0_DOMAIN;
  const mgmtId = process.env.AUTH0_MGMT_CLIENT_ID;
  const mgmtSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  if (cimdUrl && domain && mgmtId && mgmtSecret) {
    try {
      const { getManagementToken } = await import("./platform/auth0Management.js");
      const { token } = await getManagementToken({ domain, clientId: mgmtId, clientSecret: mgmtSecret });
      const mgmtUrl = `https://${domain}/api/v2/clients?external_client_id=${encodeURIComponent(cimdUrl)}&fields=client_id,name&include_fields=true`;
      const clientsR = await fetch(mgmtUrl,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );
      const clients = await clientsR.json();
      console.log(`[verify/module01] CIMD lookup url=${mgmtUrl}`);
      console.log(`[verify/module01] CIMD lookup status=${clientsR.status} body=${JSON.stringify(clients)}`);
      const found = Array.isArray(clients) && clients.length > 0 ? clients[0] : null;
      checks.push({ id: "cimd_registered", name: "CIMD client registered in Auth0", pass: !!found,
        message: found
          ? `Found: ${found.name} (${cimdUrl})`
          : `No Auth0 client with client_id = ${cimdUrl} — import the metadata URL in the Dashboard` });
    } catch (e) {
      checks.push({ id: "cimd_registered", name: "CIMD client registered in Auth0", pass: false, message: e.message });
    }
  } else if (cimdUrl) {
    checks.push({ id: "cimd_registered", name: "CIMD client registered in Auth0", pass: false,
      message: "AUTH0_MGMT_CLIENT_ID or AUTH0_MGMT_CLIENT_SECRET not set — cannot verify" });
  }

  // 2. Protected Resource Metadata
  try {
    const r = await fetch(`${mcpBase}/.well-known/oauth-protected-resource`);
    const body = await r.json();
    const ok = !!(body.resource && body.authorization_servers && body.scopes_supported);
    checks.push({ id: "prm", name: "Protected Resource Metadata (RFC 9728)", pass: ok,
      message: ok ? "resource, authorization_servers, scopes_supported present" : "missing required fields" });
  } catch (e) {
    checks.push({ id: "prm", name: "Protected Resource Metadata (RFC 9728)", pass: false, message: e.message });
  }

  // 3. Authorization Server Metadata
  try {
    const r = await fetch(`${mcpBase}/.well-known/oauth-authorization-server`);
    const body = await r.json();
    const hasTokenExchange = body.grant_types_supported?.includes("urn:ietf:params:oauth:grant-type:token-exchange");
    checks.push({ id: "as_meta", name: "Authorization Server Metadata (RFC 8414)", pass: !!(body.issuer && hasTokenExchange),
      message: body.issuer ? "issuer and token-exchange grant present" : "missing issuer or token-exchange grant" });
  } catch (e) {
    checks.push({ id: "as_meta", name: "Authorization Server Metadata (RFC 8414)", pass: false, message: e.message });
  }

  // 4. MCP tools returns 401 without bearer
  try {
    const r = await fetch(`${mcpBase}/mcp/tools`);
    checks.push({ id: "mcp_401", name: "MCP server requires bearer token", pass: r.status === 401,
      message: r.status === 401 ? "401 Unauthorized (correct)" : `Expected 401, got ${r.status}` });
  } catch (e) {
    checks.push({ id: "mcp_401", name: "MCP server requires bearer token", pass: false, message: e.message });
  }

  // 5. OBO toggle + user-delegated grant
  const oboId = process.env.AUTH0_OBO_CLIENT_ID;
  const oboSecret = process.env.AUTH0_OBO_CLIENT_SECRET;
  // OBO grant is now on the backend/tool API (fine-grained per-tool scopes).
  // The MCP server audience is the user login audience; the tool audience
  // is the OBO target that docagent-mcp-obo exchanges into.
  const mcpAudience = process.env.AUTH0_TOOL_AUDIENCE || "https://devcamp-docagent-api";
  if (domain && oboId && oboSecret) {
    try {
      // 5a. OBO toggle — test exchange returns access_denied (bad token), not unauthorized_client (toggle off)
      const r = await fetch(`https://${domain}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: "test",
          subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
          requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
          audience: mcpAudience,
          client_id: oboId,
          client_secret: oboSecret,
        }),
      });
      const body = await r.json();
      const toggled = body.error !== "unauthorized_client";
      checks.push({ id: "obo_toggle", name: "On-Behalf-Of Token Exchange enabled", pass: toggled,
        message: toggled ? `OBO toggle is on (${body.error || "ok"})` : "unauthorized_client — enable OBO toggle on docagent-mcp-obo" });

      // 5b. User-delegated grant — client must have subject_type: "user" grant against MCP API
      if (toggled && domain && mgmtId && mgmtSecret) {
        try {
          const { getManagementToken } = await import("./platform/auth0Management.js");
          const { token: mgmtToken } = await getManagementToken({ domain, clientId: mgmtId, clientSecret: mgmtSecret });
          const grantsR = await fetch(
            `https://${domain}/api/v2/client-grants?client_id=${oboId}&audience=${encodeURIComponent(mcpAudience)}`,
            { headers: { Authorization: `Bearer ${mgmtToken}` } }
          );
          const grants = await grantsR.json();
          const userGrant = Array.isArray(grants) && grants.find((g) => g.subject_type === "user");
          const grantScopes = userGrant?.scope || [];
          const required = ["mcp:docs:search", "mcp:docs:read", "mcp:crm:log", "mcp:docs:share"];
          const missing = required.filter((s) => !grantScopes.includes(s));
          const allScopesGranted = userGrant?.allow_all_scopes === true;
          // Pass if grant found with scopes, allow_all_scopes, or if API returned empty
          // (management client may lack read:client_grants — the OBO toggle check covers auth).
          const noData = !Array.isArray(grants) || grants.length === 0;
          const pass = noData || !!userGrant && (missing.length === 0 || allScopesGranted);
          checks.push({
            id: "obo_user_grant",
            name: "User-delegated grant on docagent-mcp-obo",
            pass,
            message: noData
              ? "User-delegated access not verifiable (add read:client_grants to management client) — ensure Nexus MCP Server → docagent-mcp-obo → User-Delegated Access is enabled"
              : !userGrant
                ? "Missing user-delegated grant — in Nexus MCP Server API → Applications → docagent-mcp-obo, enable user-delegated access for all mcp:* scopes"
                : `User-delegated access grant exists${allScopesGranted ? " (all permissions)" : ` (${grantScopes.join(", ")})`}`,
          });
        } catch (e) {
          checks.push({ id: "obo_user_grant", name: "User-delegated grant on docagent-mcp-obo", pass: false, message: e.message });
        }
      }
    } catch (e) {
      checks.push({ id: "obo_toggle", name: "On-Behalf-Of Token Exchange enabled", pass: false, message: e.message });
    }
  } else {
    checks.push({ id: "obo_toggle", name: "On-Behalf-Of Token Exchange enabled", pass: false,
      message: "AUTH0_OBO_CLIENT_ID or AUTH0_OBO_CLIENT_SECRET not set in .env" });
  }

  res.json({ module: "01", checks, allPassed: checks.every((c) => c.pass) });
});

app.get("/api/verify/module02", async (req, res) => {
  const checks = [];
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const secret = process.env.AUTH0_MGMT_CLIENT_SECRET;

  if (!domain || !clientId || !secret) {
    checks.push({ id: "mfa_customization", name: "MFA customization via Actions enabled", pass: false,
      message: "Management credentials not set" });
    return res.json({ module: "02", checks, allPassed: false });
  }

  try {
    const { getManagementToken } = await import("./platform/auth0Management.js");
    const ctx = await getManagementToken({ domain, client_id: clientId, client_secret: secret });
    const settings = await fetch(`https://${ctx.domain}/api/v2/tenants/settings`, {
      headers: { Authorization: `Bearer ${ctx.token}` },
    });
    const data = await settings.json();
    const enabled = !!data.customize_mfa_in_postlogin_action;
    checks.push({
      id: "mfa_customization",
      name: "MFA customization via Actions enabled",
      pass: enabled,
      message: enabled
        ? "customize_mfa_in_postlogin_action is enabled"
        : "Not enabled — re-provision or go to Security → Multifactor Auth → Additional Settings → enable Customize MFA Factors using Actions",
    });
  } catch (e) {
    checks.push({ id: "mfa_customization", name: "MFA customization via Actions enabled", pass: false, message: e.message });
  }

  res.json({ module: "02", checks, allPassed: checks.every((c) => c.pass) });
});

app.get("/api/verify/module03", async (req, res) => {
  const checks = [];
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const secret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  const crmConn = process.env.VAULT_CONN_CRM;

  const oboClientId = process.env.AUTH0_OBO_CLIENT_ID;

  if (!domain || !clientId || !secret || !crmConn) {
    checks.push({ id: "token_vault", name: "Token Vault enabled on CRM connection", pass: false,
      message: "Management credentials or CRM connection name not set" });
    return res.json({ module: "03", checks, allPassed: false });
  }

  try {
    const { getManagementToken } = await import("./platform/auth0Management.js");
    const ctx = await getManagementToken({ domain, client_id: clientId, client_secret: secret });

    // Check 1: CRM connection has Token Vault purpose enabled.
    const connR = await fetch(`https://${ctx.domain}/api/v2/connections?name=${encodeURIComponent(crmConn)}`, {
      headers: { Authorization: `Bearer ${ctx.token}` },
    });
    const connData = await connR.json();
    const conn = connData?.[0] || {};
    // connected_accounts.active is the top-level field Auth0 sets when Purpose is
    // "Connected Accounts for Token Vault" or "Authentication and Connected Accounts for Token Vault".
    const vaultEnabled = conn?.connected_accounts?.active === true;
    checks.push({
      id: "token_vault_connection",
      name: "Token Vault enabled on CRM connection",
      pass: vaultEnabled,
      message: vaultEnabled
        ? "CRM connection Purpose is set to Token Vault"
        : "Open crm-codespace in Auth0 Dashboard → Settings → Purpose → select 'Authentication and Connected Accounts for Token Vault'",
    });

    // Check 2: docagent-mcp-obo client has the Token Vault grant type.
    if (oboClientId) {
      const clientR = await fetch(`https://${ctx.domain}/api/v2/clients/${oboClientId}?fields=grant_types,name`, {
        headers: { Authorization: `Bearer ${ctx.token}` },
      });
      const clientData = await clientR.json();
      const grants = clientData?.grant_types || [];
      const hasVaultGrant = grants.includes(
        "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token"
      );
      checks.push({
        id: "token_vault_grant",
        name: "Token Vault grant enabled on docagent-mcp-obo",
        pass: hasVaultGrant,
        message: hasVaultGrant
          ? "Token Vault grant type is active"
          : "Open docagent-mcp-obo in Auth0 Dashboard → Advanced Settings → Grant Types → check Token Vault",
      });
    }
  } catch (e) {
    checks.push({ id: "token_vault_connection", name: "Token Vault enabled on CRM connection", pass: false, message: e.message });
  }

  res.json({ module: "03", checks, allPassed: checks.every((c) => c.pass) });
});

app.get("/api/verify/module04", async (req, res) => {
  const checks = [];
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const secret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  const cibaClientId = process.env.AUTH0_CIBA_CLIENT_ID;

  if (!domain || !clientId || !secret || !cibaClientId) {
    checks.push({ id: "ciba_client", name: "CIBA grant on docagent-ciba application", pass: false,
      message: !cibaClientId ? "AUTH0_CIBA_CLIENT_ID not set — re-provision resources" : "Management credentials not set" });
    return res.json({ module: "04", checks, allPassed: false });
  }

  try {
    const { getManagementToken } = await import("./platform/auth0Management.js");
    const ctx = await getManagementToken({ domain, client_id: clientId, client_secret: secret });

    // CIBA is configured at the application level only (no tenant-level toggle).
    // Check that the provisioned CIBA client has the grant and notification channels.
    const cr = await fetch(
      `https://${ctx.domain}/api/v2/clients/${cibaClientId}?fields=grant_types,async_approval_notification_channels,name&include_fields=true`,
      { headers: { Authorization: `Bearer ${ctx.token}` } }
    );
    const cibaApp = await cr.json();
    const hasGrant = cibaApp?.grant_types?.includes("urn:openid:params:grant-type:ciba");
    const channels = cibaApp?.async_approval_notification_channels || [];
    const hasPush = channels.includes("guardian-push");
    checks.push({
      id: "ciba_client",
      name: "CIBA grant on docagent-ciba application",
      pass: !!hasGrant,
      message: hasGrant
        ? `CIBA grant present on ${cibaApp.name}`
        : `CIBA grant type missing on ${cibaApp.name || cibaClientId} — check provisioning`,
    });
    checks.push({
      id: "ciba_push_channel",
      name: "Guardian push notification channel enabled",
      pass: hasPush,
      message: hasPush
        ? `Guardian push channel active (channels: ${channels.join(", ")})`
        : `Guardian push not enabled — open ${cibaApp.name || "docagent-ciba"} → Notification Channels → enable Guardian Push → Save`,
    });

    // Check that alice is enrolled in Guardian push
    const aliceRes = await fetch(
      `https://${ctx.domain}/api/v2/users-by-email?email=${encodeURIComponent("alice@docagent.demo")}`,
      { headers: { Authorization: `Bearer ${ctx.token}` } }
    );
    const aliceUsers = await aliceRes.json();
    const alice = Array.isArray(aliceUsers) ? aliceUsers[0] : null;

    if (!alice) {
      checks.push({
        id: "alice_guardian_enrollment",
        name: "alice@docagent.demo enrolled in Guardian push",
        pass: false,
        message: "alice@docagent.demo not found — re-provision resources",
      });
    } else {
      const enrollRes = await fetch(
        `https://${ctx.domain}/api/v2/users/${encodeURIComponent(alice.user_id)}/enrollments`,
        { headers: { Authorization: `Bearer ${ctx.token}` } }
      );
      const enrollments = await enrollRes.json();
      const hasGuardianEnrollment = Array.isArray(enrollments) &&
        enrollments.some((e) => e.auth_method === "guardian" && e.status === "confirmed");
      checks.push({
        id: "alice_guardian_enrollment",
        name: "alice@docagent.demo enrolled in Guardian push",
        pass: hasGuardianEnrollment,
        message: hasGuardianEnrollment
          ? "alice@docagent.demo has a confirmed Guardian push enrollment"
          : "alice@docagent.demo is not enrolled in Guardian push — log in as alice and complete Guardian push enrollment",
      });
    }

  } catch (e) {
    checks.push({ id: "ciba_client", name: "CIBA grant on docagent-ciba application", pass: false, message: e.message });
  }

  res.json({ module: "04", checks, allPassed: checks.every((c) => c.pass) });
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

// Hot-reload .env when it changes so new credentials are picked up
// on the next request without restarting the server.
const envPath = path.resolve(process.cwd(), ".env");
try {
  fs.watch(envPath, () => {
    dotenv.config({ override: true });
    console.log("[Server] .env reloaded");
  });
} catch { /* .env may not exist yet */ }

export default app;
