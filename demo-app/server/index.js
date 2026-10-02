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
import { getToken } from "./token-vault/vault.js";
import { startCRMServer } from "./crm/app.js";
import { startMCPServer, TOOLS as MCP_TOOLS } from "./mcp/server.js";
import { getLogs } from "./mcp/toolLog.js";
import { listTuples } from "./fga/client.js";
import { executeTool } from "./tools/registry.js";
import {
  getManagementToken,
  findAgentByName,
  findClientByExternalId,
  getClient,
  getConnectionByName,
  listClientGrants,
} from "./platform/auth0Management.js";
import {
  runProvision,
  runDeprovision,
  deploymentDataToEnvVars,
  AGENT_NAME,
  THIRD_PARTY_AGENT_NAME,
  THIRD_PARTY_REVIEWED_SCOPES,
  MCP_SERVER_SCOPES,
} from "./platform/provision.js";
import { requestOrigin, originForPort, mcpPort, acmePort, acmeCimdUrl } from "./utils/publicUrl.js";
import { startAcmeServer } from "./acme/app.js";
import { fgaSettingsFromEnvOrRecord } from "./platform/fgaProvision.js";
import path from "path";
import { fileURLToPath } from "url";
import guideRouter from "./routes/guide.js";
import hooksRouter from "./platform/hooks.js";
import { tenantResolver } from "./platform/tenantResolver.js";
import { wrongPortFallback } from "./utils/wrongPortPage.js";

const PROVISIONED_ENV_KEYS = [
  "VITE_AUTH0_CLIENT_ID", "AUTH0_AUDIENCE", "AUTH0_TOOL_AUDIENCE",
  "AUTH0_OBO_CLIENT_ID", "AUTH0_OBO_CLIENT_SECRET",
  "MCP_SERVER_CLIENT_ID", "MCP_SERVER_CLIENT_SECRET",
  "AUTH0_CIBA_CLIENT_ID", "AUTH0_CIBA_CLIENT_SECRET",
  "AUTH0_MFA_ACTION_ID",
  "VAULT_CONN_CRM", "VAULT_CONN_GITHUB", "FGA_STORE_ID", "FGA_MODEL_ID",
  "DEMO_USER_ALICE_ID", "DEMO_USER_BOB_ID",
];

// Keys deploymentDataToEnvVars() should ALWAYS produce from a successful
// /api/setup/provision run. Excludes AUTH0_OBO_CLIENT_ID/SECRET (created
// manually in Module 02, not by provisioning), VAULT_CONN_GITHUB (created
// manually in the Token Vault module), and FGA_STORE_ID/FGA_MODEL_ID (only
// written when FGA credentials are configured -- see below).
// runProvision() wraps every Auth0 API call in safe(), which swallows
// errors and returns null on failure, so a single failed step silently
// drops its key from the written .env without failing the request. This
// list lets us flag that instead of finding out later when something in
// the demo breaks.
const REQUIRED_PROVISION_ENV_KEYS = [
  "VITE_AUTH0_CLIENT_ID", "AUTH0_AUDIENCE", "AUTH0_TOOL_AUDIENCE",
  "MCP_SERVER_CLIENT_ID", "MCP_SERVER_CLIENT_SECRET",
  "AUTH0_CIBA_CLIENT_ID", "AUTH0_CIBA_CLIENT_SECRET",
  "AUTH0_MFA_ACTION_ID", "VAULT_CONN_CRM",
  "DEMO_USER_ALICE_ID", "DEMO_USER_BOB_ID",
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
    const appUrl = req.body?.appUrl || requestOrigin(req);
    // Derive the other servers' public URLs from the app URL.
    // Codespace: replace the port in the subdomain. Local: localhost:<port>.
    const crmPort = parseInt(process.env.CRM_PORT || process.env.THIRD_PARTY_API_PORT || "3002");
    const crmUrl = originForPort(appUrl, crmPort);
    // The MCP server's resource identifier is its own public origin, so
    // that the `resource` in its PRM, the RFC 8707 `resource` clients
    // send, and the `aud` it validates are all the same value.
    const mcpResourceUri = process.env.MCP_RESOURCE_URI || originForPort(appUrl, mcpPort());
    const ctx = await getManagementToken({ domain, client_id: clientId, client_secret: secret });
    const fgaSettings = fgaSettingsFromEnvOrRecord({});
    const deploymentData = await runProvision(ctx, {
      appUrl,
      crmUrl,
      mcpResourceUri,
      demoName: "codespace",
      fgaSettings,
      oidcClientId: null,
    });
    const envVars = deploymentDataToEnvVars(deploymentData);
    writeEnv(envVars);
    Object.assign(process.env, envVars);

    const requiredKeys = fgaSettings
      ? [...REQUIRED_PROVISION_ENV_KEYS, "FGA_STORE_ID", "FGA_MODEL_ID"]
      : REQUIRED_PROVISION_ENV_KEYS;
    const missingKeys = requiredKeys.filter((k) => !envVars[k]);
    if (missingKeys.length) {
      console.error(
        `[setup] provision wrote .env but these expected keys are missing: ${missingKeys.join(", ")} -- check the "[provision] step ... failed" logs above for the cause and re-run provisioning.`
      );
    }
    res.json({ ok: true, keys: Object.keys(envVars), missingKeys });
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
    await runDeprovision(ctx, { acmeCimdUrl: acmeCimdUrl(requestOrigin(req)) });
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
      await runDeprovision(ctx, { acmeCimdUrl: acmeCimdUrl(requestOrigin(req)) });
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

// ---- Module verification endpoints ----------------------------------
// Each endpoint runs the setup checks for a module and returns
// { checks: [{ id, name, pass, message }] }. Used by the in-app
// ModuleChecks component so participants never need to run curl.

// Shared helper for the module verify endpoints below.
async function mgmtCtxFromEnv() {
  const domain = process.env.AUTH0_DOMAIN;
  const mgmtId = process.env.AUTH0_MGMT_CLIENT_ID;
  const mgmtSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  if (!domain || !mgmtId || !mgmtSecret) return null;
  return getManagementToken({ domain, clientId: mgmtId, clientSecret: mgmtSecret });
}

async function mgmtGet(ctx, path) {
  const r = await fetch(`https://${ctx.domain}/api/v2${path}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

// Module 02 (lab guide 02): Auth for MCP + first-party agent.
app.get("/api/verify/module01", async (req, res) => {
  const mcpBase = `http://localhost:${mcpPort()}`;
  const checks = [];
  const domain = process.env.AUTH0_DOMAIN;
  const oboClientId = process.env.AUTH0_OBO_CLIENT_ID;
  const mcpResource = (process.env.AUTH0_TOOL_AUDIENCE || "").replace(/\/$/, "");
  const agentApi = process.env.AUTH0_AUDIENCE || "";

  let ctx = null;
  try {
    ctx = await mgmtCtxFromEnv();
  } catch (e) {
    checks.push({ id: "mgmt", name: "Management API access", pass: false, message: e.message });
  }

  if (ctx) {
    // 1. Agent as Principal: AGENT_NAME exists and is linked to docagent-mcp-obo.
    try {
      const agent = await findAgentByName(ctx, AGENT_NAME);
      if (!agent) {
        checks.push({ id: "agent_registered", name: "Agent registered and linked to OBO client", pass: false,
          message: `No agent named "${AGENT_NAME}" found — create it under Dashboard → Agents` });
      } else if (!oboClientId) {
        checks.push({ id: "agent_registered", name: "Agent registered and linked to OBO client", pass: false,
          message: `Found agent ${agent.agent_id}, but AUTH0_OBO_CLIENT_ID is not set — complete Part B first` });
      } else {
        const client = await mgmtGet(ctx, `/clients/${oboClientId}?fields=agent_id&include_fields=true`);
        const linked = client?.agent_id === agent.agent_id;
        checks.push({ id: "agent_registered", name: "Agent registered and linked to OBO client", pass: linked,
          message: linked
            ? `Agent ${agent.agent_id} ("${AGENT_NAME}") linked to docagent-mcp-obo`
            : `Agent ${agent.agent_id} exists but docagent-mcp-obo is not linked to it — open the agent's Applications tab and add it` });
      }
    } catch (e) {
      checks.push({ id: "agent_registered", name: "Agent registered and linked to OBO client", pass: false, message: e.message });
    }

    // 2. The OBO client is a Custom API client linked to the Nexus Agent API.
    // Auth0 only lets Custom API clients (app_type resource_server) run the
    // On-Behalf-Of exchange, and only on tokens issued for the API they're
    // linked to.
    if (oboClientId) {
      try {
        const c = await mgmtGet(ctx, `/clients/${oboClientId}?fields=app_type,resource_server_identifier,name&include_fields=true`);
        const ok = c?.app_type === "resource_server" &&
          (c?.resource_server_identifier || "").replace(/\/$/, "") === agentApi.replace(/\/$/, "");
        checks.push({ id: "obo_custom_api_client", name: "OBO client is a Custom API client linked to the Nexus Agent API", pass: ok,
          message: ok
            ? `${c.name}: app_type=resource_server, linked to ${c.resource_server_identifier}`
            : `${c?.name || oboClientId} has app_type=${c?.app_type}, resource_server_identifier=${c?.resource_server_identifier || "(none)"} — recreate it from APIs → Nexus Agent API → Add Application` });
      } catch (e) {
        checks.push({ id: "obo_custom_api_client", name: "OBO client is a Custom API client linked to the Nexus Agent API", pass: false, message: e.message });
      }
    }

    // 3. The MCP server API opted into agent subject claims.
    try {
      const list = await mgmtGet(ctx, `/resource-servers?identifier=${encodeURIComponent(mcpResource)}`);
      const rs = Array.isArray(list) ? list.find((r) => r.identifier.replace(/\/$/, "") === mcpResource) : null;
      const enabled = rs?.agent_subject_claims === "auth0-v1";
      checks.push({ id: "agent_subject_claims", name: "MCP server API accepts agent subject claims", pass: enabled,
        message: enabled
          ? `agent_subject_claims = auth0-v1 on ${mcpResource}`
          : `Nexus MCP Server API (${mcpResource || "AUTH0_TOOL_AUDIENCE unset"}) is missing agent_subject_claims — re-run Provision Resources` });
    } catch (e) {
      checks.push({ id: "agent_subject_claims", name: "MCP server API accepts agent subject claims", pass: false, message: e.message });
    }

    // 4. Tenant settings Auth for MCP relies on.
    try {
      const t = await mgmtGet(ctx, "/tenants/settings");
      const resourceParam = t.resource_parameter_profile === "compatibility";
      const issParam = t.authorization_response_iss_parameter_supported === true;
      checks.push({ id: "auth_for_mcp_settings", name: "Resource Parameter Compatibility Profile and iss parameter enabled",
        pass: resourceParam && issParam,
        message: resourceParam && issParam
          ? "resource_parameter_profile=compatibility, authorization_response_iss_parameter_supported=true"
          : "Dashboard → Settings → Advanced: enable Resource Parameter Compatibility Profile and Include Issuer in Authorization Responses" });
    } catch (e) {
      checks.push({ id: "auth_for_mcp_settings", name: "Resource Parameter Compatibility Profile and iss parameter enabled", pass: false, message: e.message });
    }
  } else if (!checks.length) {
    checks.push({ id: "mgmt", name: "Management API access", pass: false,
      message: "AUTH0_MGMT_CLIENT_ID or AUTH0_MGMT_CLIENT_SECRET not set — cannot verify" });
  }

  // 5. Protected Resource Metadata: `resource` is the MCP server's identifier
  // and the authorization server is this tenant.
  try {
    const r = await fetch(`${mcpBase}/.well-known/oauth-protected-resource`);
    const body = await r.json();
    const resourceOk = (body.resource || "").replace(/\/$/, "") === mcpResource && !!mcpResource;
    const asOk = body.authorization_servers?.[0] === `https://${domain}/`;
    checks.push({ id: "prm", name: "Protected Resource Metadata (RFC 9728)", pass: resourceOk && asOk,
      message: resourceOk && asOk
        ? `resource=${body.resource}, authorization_servers=[${body.authorization_servers[0]}]`
        : `resource=${body.resource} (expected ${mcpResource}), authorization_servers=${JSON.stringify(body.authorization_servers)}` });
  } catch (e) {
    checks.push({ id: "prm", name: "Protected Resource Metadata (RFC 9728)", pass: false, message: e.message });
  }

  // 6. 401 without a token, with a WWW-Authenticate pointer to the PRM.
  try {
    const r = await fetch(`${mcpBase}/mcp/tools`);
    const challenge = r.headers.get("www-authenticate") || "";
    const ok = r.status === 401 && challenge.includes("resource_metadata=");
    checks.push({ id: "mcp_401", name: "MCP server returns 401 with a resource_metadata challenge", pass: ok,
      message: ok ? `401, WWW-Authenticate: ${challenge}` : `Expected 401 with resource_metadata, got ${r.status} "${challenge}"` });
  } catch (e) {
    checks.push({ id: "mcp_401", name: "MCP server returns 401 with a resource_metadata challenge", pass: false, message: e.message });
  }

  // 7. OBO toggle + user-delegated grant on the MCP server API.
  const oboSecret = process.env.AUTH0_OBO_CLIENT_SECRET;
  if (domain && oboClientId && oboSecret) {
    try {
      // 7a. OBO toggle — a test exchange with a bogus token returns
      // access_denied/invalid_grant (toggle on), not unauthorized_client.
      const r = await fetch(`https://${domain}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: "test",
          subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
          requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
          audience: mcpResource,
          client_id: oboClientId,
          client_secret: oboSecret,
        }),
      });
      const body = await r.json();
      const toggled = body.error !== "unauthorized_client";
      checks.push({ id: "obo_toggle", name: "On-Behalf-Of Token Exchange enabled", pass: toggled,
        message: toggled ? `OBO toggle is on (${body.error || "ok"})` : "unauthorized_client — enable On-Behalf-Of Token Exchange on docagent-mcp-obo" });

      // 7b. User-delegated grant from docagent-mcp-obo to the MCP server API.
      if (toggled && ctx) {
        try {
          const grants = await listClientGrants(ctx, oboClientId, mcpResource);
          const userGrant = grants.find((g) => g.subject_type === "user");
          const grantScopes = userGrant?.scope || [];
          const required = ["mcp:docs:search", "mcp:docs:read", "mcp:crm:log", "mcp:docs:share"];
          const missing = required.filter((sc) => !grantScopes.includes(sc));
          const allScopesGranted = userGrant?.allow_all_scopes === true;
          const pass = !!userGrant && (missing.length === 0 || allScopesGranted);
          checks.push({
            id: "obo_user_grant",
            name: "User-delegated grant: docagent-mcp-obo → Nexus MCP Server",
            pass,
            message: !userGrant
              ? "Missing user-delegated grant — Nexus MCP Server → Application Access → docagent-mcp-obo → User-Delegated Access → authorize the mcp:* scopes"
              : pass
                ? `User-delegated access grant exists${allScopesGranted ? " (all permissions)" : ` (${grantScopes.join(", ")})`}`
                : `Grant is missing: ${missing.join(", ")}`,
          });
        } catch (e) {
          checks.push({ id: "obo_user_grant", name: "User-delegated grant: docagent-mcp-obo → Nexus MCP Server", pass: false,
            message: `${e.message} (the management client needs read:client_grants)` });
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

// Module 03 (lab guide 03): third-party agent via CIMD.
app.get("/api/verify/module02", async (req, res) => {
  const checks = [];
  const mcpResource = (process.env.AUTH0_TOOL_AUDIENCE || "").replace(/\/$/, "");
  const acmeBase = `http://localhost:${acmePort()}`;
  const cimdUrl = acmeCimdUrl(requestOrigin(req));
  const cimdHost = (() => { try { return new URL(cimdUrl); } catch { return null; } })();

  // 1. Acme publishes a CIMD document Auth0 can import: HTTPS, not
  // localhost, ≤ 120 bytes, and client_id exactly equal to its own URL.
  try {
    const r = await fetch(`${acmeBase}/.well-known/client-metadata`, {
      headers: cimdHost ? { "x-forwarded-host": cimdHost.host, "x-forwarded-proto": cimdHost.protocol.replace(":", "") } : {},
    });
    const body = await r.json();
    const problems = [];
    if (body.client_id !== cimdUrl) problems.push(`client_id ${body.client_id} ≠ ${cimdUrl}`);
    if (!cimdUrl.startsWith("https://")) problems.push("CIMD URL must be HTTPS");
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(cimdUrl)) problems.push("Auth0 rejects localhost CIMD URLs — run in Codespaces or set ACME_CIMD_URL");
    if (Buffer.byteLength(cimdUrl) > 120) problems.push("CIMD URL is longer than 120 bytes");
    if (!body.client_name) problems.push("client_name missing");
    if (!body.redirect_uris?.length) problems.push("redirect_uris missing");
    if (body.token_endpoint_auth_method !== "none") problems.push("token_endpoint_auth_method should be none (public client + PKCE)");
    checks.push({ id: "cimd_discoverable", name: "Acme publishes an importable CIMD document", pass: problems.length === 0,
      message: problems.length === 0 ? `${cimdUrl} ("${body.client_name}")` : problems.join("; ") });
  } catch (e) {
    checks.push({ id: "cimd_discoverable", name: "Acme publishes an importable CIMD document", pass: false,
      message: `Could not reach Acme at ${acmeBase} (${e.message})` });
  }

  let ctx = null;
  try {
    ctx = await mgmtCtxFromEnv();
  } catch (e) {
    checks.push({ id: "mgmt", name: "Management API access", pass: false, message: e.message });
  }
  if (!ctx) {
    if (!checks.some((c) => c.id === "mgmt")) {
      checks.push({ id: "mgmt", name: "Management API access", pass: false,
        message: "AUTH0_MGMT_CLIENT_ID or AUTH0_MGMT_CLIENT_SECRET not set — cannot verify" });
    }
    return res.json({ module: "02", checks, allPassed: false });
  }

  // 2. Tenant: CIMD registration on, login connection at domain level.
  try {
    const t = await mgmtGet(ctx, "/tenants/settings");
    const on = t.client_id_metadata_document_supported === true;
    checks.push({ id: "cimd_tenant_setting", name: "Client ID Metadata Document Registration enabled", pass: on,
      message: on ? "client_id_metadata_document_supported = true"
        : "Dashboard → Settings → Advanced → enable Client ID Metadata Document Registration (Early Access)" });
  } catch (e) {
    checks.push({ id: "cimd_tenant_setting", name: "Client ID Metadata Document Registration enabled", pass: false, message: e.message });
  }
  try {
    const conn = await getConnectionByName(ctx, "Username-Password-Authentication");
    const ok = conn?.is_domain_connection === true;
    checks.push({ id: "domain_connection", name: "Login connection promoted to domain level", pass: ok,
      message: ok ? "Username-Password-Authentication is a domain-level connection"
        : "Authentication → Database → Username-Password-Authentication → Settings → enable Promote Connection to Domain Level" });
  } catch (e) {
    checks.push({ id: "domain_connection", name: "Login connection promoted to domain level", pass: false, message: e.message });
  }

  // 3. The admin imported Acme's CIMD (client_id = CIMD URL, third-party).
  let acme = null;
  try {
    acme = await findClientByExternalId(ctx, cimdUrl);
    const ok = !!acme && acme.is_first_party === false && acme.token_endpoint_auth_method === "none";
    checks.push({ id: "cimd_registered", name: "Acme registered from its CIMD URL as a third-party client", pass: ok,
      message: !acme
        ? `No client with external_client_id ${cimdUrl} — Applications → Create Application → Import from URL`
        : ok
          ? `${acme.name} (${acme.client_id}) — is_first_party=false, token_endpoint_auth_method=none`
          : `${acme.name}: is_first_party=${acme.is_first_party}, token_endpoint_auth_method=${acme.token_endpoint_auth_method}` });
  } catch (e) {
    checks.push({ id: "cimd_registered", name: "Acme registered from its CIMD URL as a third-party client", pass: false, message: e.message });
  }

  // 4. The trust decision: a reviewed, read-only user-delegated grant.
  if (acme) {
    try {
      const grants = await listClientGrants(ctx, acme.client_id, mcpResource);
      const userGrant = grants.find((g) => g.subject_type === "user");
      const scopes = userGrant?.allow_all_scopes ? MCP_SERVER_SCOPES : userGrant?.scope || [];
      const missing = THIRD_PARTY_REVIEWED_SCOPES.filter((sc) => !scopes.includes(sc));
      const excess = scopes.filter((sc) => !THIRD_PARTY_REVIEWED_SCOPES.includes(sc));
      const ok = !!userGrant && missing.length === 0 && excess.length === 0;
      checks.push({ id: "thirdparty_api_grant", name: "Acme holds only the reviewed scopes on the MCP server API", pass: ok,
        message: !userGrant
          ? "No user-delegated grant — Nexus MCP Server → Application Access → Acme Partner Agent → User-Delegated Access → Grant Access"
          : ok
            ? `User-delegated grant: ${scopes.join(", ")}`
            : `Grant should be exactly ${THIRD_PARTY_REVIEWED_SCOPES.join(", ")}${missing.length ? `; missing ${missing.join(", ")}` : ""}${excess.length ? `; remove ${excess.join(", ")}` : ""}` });
    } catch (e) {
      checks.push({ id: "thirdparty_api_grant", name: "Acme holds only the reviewed scopes on the MCP server API", pass: false, message: e.message });
    }
  }

  // 5. Agent as Principal: THIRD_PARTY_AGENT_NAME linked to Acme's client.
  try {
    const agent = await findAgentByName(ctx, THIRD_PARTY_AGENT_NAME);
    if (!agent) {
      checks.push({ id: "thirdparty_agent_registered", name: "Third-party agent registered and linked to Acme's client", pass: false,
        message: `No agent named "${THIRD_PARTY_AGENT_NAME}" found — create it under Dashboard → Agents` });
    } else if (!acme) {
      checks.push({ id: "thirdparty_agent_registered", name: "Third-party agent registered and linked to Acme's client", pass: false,
        message: `Found agent ${agent.agent_id}, but Acme's CIMD client isn't registered yet` });
    } else {
      const client = await getClient(ctx, acme.client_id, ["agent_id"]);
      const linked = client?.agent_id === agent.agent_id;
      checks.push({ id: "thirdparty_agent_registered", name: "Third-party agent registered and linked to Acme's client", pass: linked,
        message: linked
          ? `Agent ${agent.agent_id} ("${THIRD_PARTY_AGENT_NAME}") linked to ${acme.name}`
          : `Agent ${agent.agent_id} exists but Acme's client is not linked to it — open the agent's Applications tab and add it` });
    }
  } catch (e) {
    checks.push({ id: "thirdparty_agent_registered", name: "Third-party agent registered and linked to Acme's client", pass: false, message: e.message });
  }

  // 6. Acme completed consent and holds a token for the MCP server.
  try {
    const r = await fetch(`${acmeBase}/status`);
    const body = await r.json();
    const aud = Array.isArray(body.aud) ? body.aud : [body.aud];
    const ok = body?.connected === true && body.client_id === cimdUrl &&
      aud.map((a) => String(a || "").replace(/\/$/, "")).includes(mcpResource);
    checks.push({ id: "thirdparty_consent_granted", name: "Acme completed its consent flow", pass: ok,
      message: body?.connected !== true
        ? `Acme hasn't logged in yet — open ${originForPort(requestOrigin(req), acmePort())}/login`
        : ok
          ? `sub=${body.sub}, client_id=${body.client_id}, act.sub=${body.act?.sub || "(none)"}, scope=${body.scope}`
          : `Token has client_id=${body.client_id}, aud=${JSON.stringify(body.aud)} — expected ${cimdUrl} and ${mcpResource}` });
  } catch (e) {
    checks.push({ id: "thirdparty_consent_granted", name: "Acme completed its consent flow", pass: false,
      message: `Could not reach Acme server at ${acmeBase} — is it running? (${e.message})` });
  }

  res.json({ module: "02", checks, allPassed: checks.every((c) => c.pass) });
});

app.get("/api/verify/module03", async (req, res) => {
  const checks = [];
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const secret = process.env.AUTH0_MGMT_CLIENT_SECRET;

  if (!domain || !clientId || !secret) {
    checks.push({ id: "mfa_customization", name: "MFA customization via Actions enabled", pass: false,
      message: "Management credentials not set" });
    return res.json({ module: "03", checks, allPassed: false });
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

  res.json({ module: "03", checks, allPassed: checks.every((c) => c.pass) });
});

app.get("/api/verify/module04", async (req, res) => {
  const checks = [];
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const secret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  const crmConn = process.env.VAULT_CONN_CRM;

  const oboClientId = process.env.AUTH0_OBO_CLIENT_ID;

  if (!domain || !clientId || !secret || !crmConn) {
    checks.push({ id: "token_vault", name: "Token Vault enabled on CRM connection", pass: false,
      message: "Management credentials or CRM connection name not set" });
    return res.json({ module: "04", checks, allPassed: false });
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

    // Check 2a: the MCP server's own Custom API client (provisioned) has the
    // Token Vault grant. It exchanges the token every tool call arrives
    // with, whichever agent sent it.
    const mcpServerClientId = process.env.MCP_SERVER_CLIENT_ID;
    if (!mcpServerClientId) {
      checks.push({
        id: "token_vault_grant_mcp_server",
        name: "Token Vault grant on the MCP server's Custom API client",
        pass: false,
        message: "MCP_SERVER_CLIENT_ID not set — re-run Provision Resources",
      });
    } else {
      const msR = await fetch(`https://${ctx.domain}/api/v2/clients/${mcpServerClientId}?fields=grant_types,name`, {
        headers: { Authorization: `Bearer ${ctx.token}` },
      });
      const msData = await msR.json();
      const msHasVault = (msData?.grant_types || []).includes(
        "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token"
      );
      checks.push({
        id: "token_vault_grant_mcp_server",
        name: "Token Vault grant on the MCP server's Custom API client",
        pass: msHasVault,
        message: msHasVault
          ? `Token Vault grant type is active on ${msData.name}`
          : `Open ${msData?.name || "nexus-mcp-server-codespace"} in Auth0 Dashboard → Advanced Settings → Grant Types → check Token Vault`,
      });
    }

    // Check 2b: docagent-mcp-obo client has the Token Vault grant type.
    // Used by the Nexus backend's own Connected Accounts status check and
    // as the first-party fallback (TOKEN_VAULT_FIRST_PARTY_FALLBACK).
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

    // Check 3: SPA authorized for the Auth0 My Account API's Connected
    // Accounts scopes -- required for the real "Connect" flow in the app
    // header to mint a token for the https://{domain}/me/ audience.
    const spaClientId = process.env.VITE_AUTH0_CLIENT_ID;
    if (spaClientId) {
      const meAudience = `https://${ctx.domain}/me/`;
      const grantR = await fetch(
        `https://${ctx.domain}/api/v2/client-grants?client_id=${spaClientId}&audience=${encodeURIComponent(meAudience)}`,
        { headers: { Authorization: `Bearer ${ctx.token}` } }
      );
      const grantData = await grantR.json();
      const requiredScopes = [
        "create:me:connected_accounts",
        "read:me:connected_accounts",
        "delete:me:connected_accounts",
      ];
      const grantedScopes = grantData?.[0]?.scope || [];
      const hasConnectedAccountsScopes = requiredScopes.every((s) => grantedScopes.includes(s));
      checks.push({
        id: "my_account_api_grant",
        name: "SPA authorized for Auth0 My Account API Connected Accounts scopes",
        pass: hasConnectedAccountsScopes,
        message: hasConnectedAccountsScopes
          ? "create/read/delete:me:connected_accounts are granted"
          : "Activate Auth0 My Account API (Auth0 Dashboard → Applications → APIs → Auth0 My Account API → Activate), then open docagent-spa-codespace → API Access tab → enable Auth0 My Account API → select create/read/delete:me:connected_accounts",
      });
    }
    // Check 4: GitHub connection has Token Vault purpose enabled. This
    // connection is hand-provisioned by the participant (REDESIGN_PLAN.md
    // decision 2) -- VAULT_CONN_GITHUB is never auto-provisioned, so an
    // unset value is reported as a normal "not set up yet" state rather
    // than an error.
    const githubConn = process.env.VAULT_CONN_GITHUB;
    if (!githubConn) {
      checks.push({
        id: "token_vault_github_connection",
        name: "Token Vault enabled on GitHub connection",
        pass: false,
        message: "VAULT_CONN_GITHUB not set — create the GitHub social connection in Auth0 Dashboard, enable Token Vault purpose, then paste its connection name into .env",
      });
    } else {
      const githubConnR = await fetch(`https://${ctx.domain}/api/v2/connections?name=${encodeURIComponent(githubConn)}`, {
        headers: { Authorization: `Bearer ${ctx.token}` },
      });
      const githubConnData = await githubConnR.json();
      const githubConnObj = githubConnData?.[0] || {};
      const githubVaultEnabled = githubConnObj?.connected_accounts?.active === true;
      checks.push({
        id: "token_vault_github_connection",
        name: "Token Vault enabled on GitHub connection",
        pass: githubVaultEnabled,
        message: githubVaultEnabled
          ? "GitHub connection Purpose is set to Token Vault"
          : `Open ${githubConn} in Auth0 Dashboard → Settings → Purpose → select 'Authentication and Connected Accounts for Token Vault'`,
      });
    }
  } catch (e) {
    checks.push({ id: "token_vault_connection", name: "Token Vault enabled on CRM connection", pass: false, message: e.message });
  }

  res.json({ module: "04", checks, allPassed: checks.every((c) => c.pass) });
});

app.get("/api/verify/module05", async (req, res) => {
  const checks = [];
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const secret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  const cibaClientId = process.env.AUTH0_CIBA_CLIENT_ID;

  if (!domain || !clientId || !secret || !cibaClientId) {
    checks.push({ id: "ciba_client", name: "CIBA grant on docagent-ciba application", pass: false,
      message: !cibaClientId ? "AUTH0_CIBA_CLIENT_ID not set — re-provision resources" : "Management credentials not set" });
    return res.json({ module: "05", checks, allPassed: false });
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

  res.json({ module: "05", checks, allPassed: checks.every((c) => c.pass) });
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
    audience: tenant?.agentAudience || process.env.AUTH0_AUDIENCE || "",
    // Connection names for the SDK's connectAccountWithRedirect() call
    // (VaultStatus.jsx) -- crmConnection is derived at provisioning time;
    // githubConnection is pasted in by hand (VAULT_CONN_GITHUB) since the
    // GitHub social connection is created manually in the Dashboard.
    crmConnection: tenant?.deploymentData?.vault_connections?.crm || process.env.VAULT_CONN_CRM || "",
    githubConnection: tenant?.deploymentData?.vault_connections?.github || process.env.VAULT_CONN_GITHUB || "",
    // Acme runs as its own process on its own port (see find-port.js);
    // in Codespaces that port has its own forwarded origin, so the
    // backend reports the full URL rather than just the port.
    acmePort: acmePort(),
    acmeUrl: originForPort(requestOrigin(req), acmePort()),
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
//
// Real Token Vault linking via Auth0's My Account API "Connected
// Accounts" flow. The SPA drives /connect and /complete itself via the
// SDK's connectAccountWithRedirect() (VaultStatus.jsx) -- a full-page
// redirect is required, not a silent/background call, because this
// tenant's post-login Action forces a Guardian push MFA challenge that
// only an interactive redirect can complete. Disconnecting isn't exposed
// by the SDK, so it still goes through our own proxy below, using a
// short-lived My Account API token the SPA sends in
// X-Connected-Accounts-Token -- separate from the normal Authorization
// bearer used for our own API auth, because it authorizes a different
// audience (https://{domain}/me/).

function connectedAccountsToken(req) {
  const header = req.headers["x-connected-accounts-token"];
  return typeof header === "string" ? header : undefined;
}

app.post("/api/vault/disconnect", validateAccessToken, async (req, res) => {
  const tenant = req.tenant;
  const provider = req.body?.provider || "crm";
  const connection = tenant?.deploymentData?.vault_connections?.[provider];
  const token = connectedAccountsToken(req);
  if (!token) {
    return res.status(400).json({ error: "Missing X-Connected-Accounts-Token header." });
  }

  const listRes = await fetch(`https://${tenant.domain}/me/v1/connected-accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const list = await listRes.json();
  if (!listRes.ok) {
    return res.status(listRes.status).json(list);
  }

  const entry = (Array.isArray(list) ? list : list.connected_accounts || []).find(
    (a) => a.connection === connection
  );
  if (!entry) {
    return res.json({ unlinked: false, provider });
  }

  const deleteRes = await fetch(`https://${tenant.domain}/me/v1/connected-accounts/${entry.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!deleteRes.ok) {
    const data = await deleteRes.json().catch(() => ({}));
    return res.status(deleteRes.status).json(data);
  }
  res.json({ unlinked: true, provider });
});

app.get("/api/vault/providers", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  const providers = [];
  for (const provider of ["crm", "github"]) {
    try {
      const linked = await getToken(user.sub, provider, req.tenant, user.accessToken);
      if (linked) providers.push({ provider });
    } catch {
      // Connection exists but doesn't allow API access (e.g. authentication-only),
      // or isn't configured for this provider -- treat as not linked for display purposes.
    }
  }
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
    scopes: ["mcp:docs:search", "mcp:docs:read", "mcp:crm:log", "mcp:docs:share", "mcp:github:read"],
    timestamp: new Date().toISOString(),
  });
});

// Logs: recent tool call log entries written by the MCP server.
app.get("/api/mcp/logs", (_req, res) => {
  res.json({ logs: getLogs() });
});

// FGA: current simulated tuple graph for this tenant (Lab 06). Only
// meaningful in simulated mode -- when a live FGA store is provisioned,
// `live: true` comes back with an empty tuple list, since those tuples
// live in Okta FGA, not in this process.
app.get("/api/fga/tuples", (req, res) => {
  res.json(listTuples(req.tenant));
});

// Test: direct authenticated tool call. The user's access token is used
// for the OBO exchange so identity + FGA are enforced exactly as in chat.
app.post("/api/mcp/test", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  const { toolName, parameters, agent } = req.body;
  if (!toolName) {
    return res.status(400).json({ error: "toolName is required" });
  }
  try {
    const result = await executeTool(toolName, parameters || {}, user.accessToken, agent);
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
} else {
  // Dev mode: no built SPA here, the real app is Vite on 5173. Anything
  // not under /api or /hooks is someone hitting this port directly
  // (e.g. Codespaces' port-forward toast pointing at the wrong port).
  app.get(
    /^(?!\/(api|hooks)\/).*/,
    wrongPortFallback(
      "Nexus API server",
      "This backend powers tool calls, authentication, and provisioning for the Nexus app."
    )
  );
}

// Start servers
app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});

startMCPServer();
startCRMServer();
startAcmeServer();

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
