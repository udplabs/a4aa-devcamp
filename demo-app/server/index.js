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
  MCP_SERVER_SCOPES,
  THIRD_PARTY_REVIEWED_SCOPES,
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
  "VAULT_CONN_CRM", "FGA_STORE_ID", "FGA_MODEL_ID",
  "DEMO_USER_ALICE_ID", "DEMO_USER_BOB_ID",
];

// Keys deploymentDataToEnvVars() should ALWAYS produce from a successful
// /api/setup/provision run. Excludes AUTH0_OBO_CLIENT_ID/SECRET (created
// manually in Module 02, not by provisioning), and FGA_STORE_ID/FGA_MODEL_ID
// (only written when FGA credentials are configured -- see below).
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
    await runDeprovision(ctx, { acmeCimdUrl: acmeCimdUrl(requestOrigin(req)), demoName: "codespace" });
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
      await runDeprovision(ctx, { acmeCimdUrl: acmeCimdUrl(requestOrigin(req)), demoName: "codespace" });
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

// Module 01 (lab guide 01-prerequisites): confirms provisioning populated .env.
app.get("/api/verify/module01", async (req, res) => {
  const REQUIRED_ENV_VARS = [
    "VITE_AUTH0_CLIENT_ID",
    "AUTH0_AUDIENCE",
    "AUTH0_TOOL_AUDIENCE",
    "MCP_SERVER_CLIENT_ID",
    "MCP_SERVER_CLIENT_SECRET",
    "AUTH0_CIBA_CLIENT_ID",
    "AUTH0_CIBA_CLIENT_SECRET",
    "VAULT_CONN_CRM",
    "AUTH0_MFA_ACTION_ID",
    "DEMO_USER_ALICE_ID",
    "DEMO_USER_BOB_ID",
  ];
  const checks = REQUIRED_ENV_VARS.map((name) => {
    const present = !!process.env[name];
    return {
      id: name.toLowerCase(),
      name: `${name} is set`,
      pass: present,
      message: present ? `${name} is set` : `${name} is not set — re-run Provision Resources`,
    };
  });
  res.json({ module: "01", checks, allPassed: checks.every((c) => c.pass) });
});

// Module 02 (lab guide 02-first-party-agent-setup): Agent as Principal + OBO client.
app.get("/api/verify/module02", async (req, res) => {
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
    // 1. Part A: Agent as Principal record exists.
    let agent = null;
    try {
      agent = await findAgentByName(ctx, AGENT_NAME);
      checks.push({ id: "agent_exists", name: "Agent record created", pass: !!agent,
        message: agent
          ? `Agent ${agent.agent_id} ("${AGENT_NAME}")`
          : `No agent named "${AGENT_NAME}" found — create it under Dashboard → Agents` });
    } catch (e) {
      checks.push({ id: "agent_exists", name: "Agent record created", pass: false, message: e.message });
    }

    // 2. Part B Step 1: the OBO client is a Custom API client linked to the
    // Nexus Agent API. Auth0 only lets Custom API clients (app_type
    // resource_server) run the On-Behalf-Of exchange, and only on tokens
    // issued for the API they're linked to.
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
    } else {
      checks.push({ id: "obo_custom_api_client", name: "OBO client is a Custom API client linked to the Nexus Agent API", pass: false,
        message: "AUTH0_OBO_CLIENT_ID is not set — complete Part B Step 1 first" });
    }

    // 3. Part B Step 2: OBO toggle — a test exchange with a bogus token
    // returns access_denied/invalid_grant (toggle on), not unauthorized_client.
    const oboSecret = process.env.AUTH0_OBO_CLIENT_SECRET;
    if (domain && oboClientId && oboSecret) {
      try {
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
          message: toggled ? `OBO toggle is on (${body.error || "ok"})` : "unauthorized_client — enable On-Behalf-Of Token Exchange on nexus-agent-obo" });
      } catch (e) {
        checks.push({ id: "obo_toggle", name: "On-Behalf-Of Token Exchange enabled", pass: false, message: e.message });
      }
    } else {
      checks.push({ id: "obo_toggle", name: "On-Behalf-Of Token Exchange enabled", pass: false,
        message: "AUTH0_OBO_CLIENT_ID or AUTH0_OBO_CLIENT_SECRET not set in .env" });
    }

    // 4. Part B Step 3: the OBO client is linked to the agent record.
    if (!agent) {
      checks.push({ id: "agent_linked", name: "OBO client linked to agent record", pass: false,
        message: `No agent named "${AGENT_NAME}" found — complete Part A first` });
    } else if (!oboClientId) {
      checks.push({ id: "agent_linked", name: "OBO client linked to agent record", pass: false,
        message: "AUTH0_OBO_CLIENT_ID is not set — complete Part B Step 1 first" });
    } else {
      try {
        const client = await mgmtGet(ctx, `/clients/${oboClientId}?fields=agent_id&include_fields=true`);
        const linked = client?.agent_id === agent.agent_id;
        checks.push({ id: "agent_linked", name: "OBO client linked to agent record", pass: linked,
          message: linked
            ? `Agent ${agent.agent_id} ("${AGENT_NAME}") linked to nexus-agent-obo`
            : `Agent ${agent.agent_id} exists but nexus-agent-obo is not linked to it — open the agent's Applications tab and add it` });
      } catch (e) {
        checks.push({ id: "agent_linked", name: "OBO client linked to agent record", pass: false, message: e.message });
      }
    }

  } else if (!checks.length) {
    checks.push({ id: "mgmt", name: "Management API access", pass: false,
      message: "AUTH0_MGMT_CLIENT_ID or AUTH0_MGMT_CLIENT_SECRET not set — cannot verify" });
  }

  res.json({ module: "02", checks, allPassed: checks.every((c) => c.pass) });
});

// Module 03 (lab guide 03): third-party agent via CIMD.
app.get("/api/verify/module03", async (req, res) => {
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
    return res.json({ module: "03", checks, allPassed: false });
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

  // 4. Agent as Principal: THIRD_PARTY_AGENT_NAME linked to Acme's client.
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

  res.json({ module: "03", checks, allPassed: checks.every((c) => c.pass) });
});

// Module 05 (lab guide 05-every-agent-action-has-an-owner): Acme's consent
// flow attaches to the same employee session, holding a token whose
// client_id is its CIMD URL and whose aud is the MCP server.
app.get("/api/verify/module05", async (req, res) => {
  const checks = [];
  const acmeBase = `http://localhost:${acmePort()}`;
  const cimdUrl = acmeCimdUrl(requestOrigin(req));
  const mcpResource = (process.env.AUTH0_TOOL_AUDIENCE || "").replace(/\/$/, "");

  try {
    const r = await fetch(`${acmeBase}/status`);
    const data = await r.json();
    const aud = Array.isArray(data.aud) ? data.aud : [data.aud];
    const ok = !!data.connected && data.client_id === cimdUrl && aud.map((a) => (a || "").replace(/\/$/, "")).includes(mcpResource);
    checks.push({
      id: "acme_consent",
      name: "Acme completed its consent flow and holds a token for the MCP server",
      pass: ok,
      message: !data.connected
        ? `Acme is not connected — open ${acmeBase}/login in a new tab and sign in as alice@docagent.demo`
        : ok
          ? `client_id=${data.client_id}, aud=${JSON.stringify(data.aud)}`
          : `client_id=${data.client_id || "(none)"}, aud=${JSON.stringify(data.aud)} — expected client_id=${cimdUrl}, aud including ${mcpResource}`,
    });
  } catch (e) {
    checks.push({ id: "acme_consent", name: "Acme completed its consent flow and holds a token for the MCP server", pass: false,
      message: `Could not reach Acme at ${acmeBase} (${e.message})` });
  }

  res.json({ module: "05", checks, allPassed: checks.every((c) => c.pass) });
});

app.get("/api/verify/module06", async (req, res) => {
  const checks = [];
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const secret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  const crmConn = process.env.VAULT_CONN_CRM;

  const oboClientId = process.env.AUTH0_OBO_CLIENT_ID;

  if (!domain || !clientId || !secret || !crmConn) {
    checks.push({ id: "token_vault", name: "Token Vault enabled on CRM connection", pass: false,
      message: "Management credentials or CRM connection name not set" });
    return res.json({ module: "06", checks, allPassed: false });
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

    // Check 2b: nexus-agent-obo client has the Token Vault grant type.
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
        name: "Token Vault grant enabled on nexus-agent-obo",
        pass: hasVaultGrant,
        message: hasVaultGrant
          ? "Token Vault grant type is active"
          : "Open nexus-agent-obo in Auth0 Dashboard → Advanced Settings → Grant Types → check Token Vault",
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
  } catch (e) {
    checks.push({ id: "token_vault_connection", name: "Token Vault enabled on CRM connection", pass: false, message: e.message });
  }

  res.json({ module: "06", checks, allPassed: checks.every((c) => c.pass) });
});

app.get("/api/verify/module07", async (req, res) => {
  const checks = [];
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const secret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  const cibaClientId = process.env.AUTH0_CIBA_CLIENT_ID;

  if (!domain || !clientId || !secret || !cibaClientId) {
    checks.push({ id: "ciba_client", name: "CIBA grant on docagent-ciba application", pass: false,
      message: !cibaClientId ? "AUTH0_CIBA_CLIENT_ID not set — re-provision resources" : "Management credentials not set" });
    return res.json({ module: "07", checks, allPassed: false });
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

  res.json({ module: "07", checks, allPassed: checks.every((c) => c.pass) });
});

// Module 04 (lab guide 04-auth-for-mcp): grant nexus-agent-obo and Acme's
// agent their respective scopes on the Nexus MCP Server resource server.
app.get("/api/verify/module04", async (req, res) => {
  const checks = [];
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const secret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  const oboClientId = process.env.AUTH0_OBO_CLIENT_ID;
  const mcpResource = (process.env.AUTH0_TOOL_AUDIENCE || "").replace(/\/$/, "");
  const cimdUrl = acmeCimdUrl(requestOrigin(req));

  if (!domain || !clientId || !secret) {
    checks.push({ id: "mgmt", name: "Management API access", pass: false,
      message: "AUTH0_MGMT_CLIENT_ID or AUTH0_MGMT_CLIENT_SECRET not set — cannot verify" });
    return res.json({ module: "04", checks, allPassed: false });
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
    return res.json({ module: "04", checks, allPassed: false });
  }

  // 1. nexus-agent-obo has a user-delegated client grant on the Nexus MCP
  // Server carrying all four tool scopes.
  if (!oboClientId || !mcpResource) {
    checks.push({ id: "obo_mcp_grant", name: "nexus-agent-obo granted access to the Nexus MCP Server", pass: false,
      message: "AUTH0_OBO_CLIENT_ID or AUTH0_TOOL_AUDIENCE not set — complete Module 02 first" });
  } else {
    try {
      const grants = await listClientGrants(ctx, oboClientId, mcpResource);
      const grant = grants.find((g) => g.audience === mcpResource);
      const grantedScopes = grant?.scope || [];
      const missing = MCP_SERVER_SCOPES.filter((s) => !grantedScopes.includes(s));
      checks.push({ id: "obo_mcp_grant", name: "nexus-agent-obo granted access to the Nexus MCP Server", pass: missing.length === 0,
        message: missing.length === 0
          ? `nexus-agent-obo has all tool scopes: ${grantedScopes.join(", ")}`
          : !grant
            ? "No grant found — Applications → APIs → Nexus MCP Server → Application Access → nexus-agent-obo → Edit → grant all mcp:* scopes"
            : `Missing scopes: ${missing.join(", ")} — Applications → APIs → Nexus MCP Server → Application Access → nexus-agent-obo → Edit → grant the missing scopes` });
    } catch (e) {
      checks.push({ id: "obo_mcp_grant", name: "nexus-agent-obo granted access to the Nexus MCP Server", pass: false, message: e.message });
    }
  }

  // 2. Acme's CIMD client has a reviewed, smaller user-delegated grant on
  // the Nexus MCP Server: exactly mcp:docs:search and mcp:docs:read, and
  // explicitly not mcp:docs:share or mcp:crm:log.
  if (!mcpResource) {
    checks.push({ id: "acme_mcp_grant", name: "Acme granted a reviewed, smaller scope set", pass: false,
      message: "AUTH0_TOOL_AUDIENCE not set" });
  } else {
    try {
      const acme = await findClientByExternalId(ctx, cimdUrl);
      if (!acme) {
        checks.push({ id: "acme_mcp_grant", name: "Acme granted a reviewed, smaller scope set", pass: false,
          message: "Acme's CIMD client isn't registered yet — complete Module 03 first" });
      } else {
        const grants = await listClientGrants(ctx, acme.client_id, mcpResource);
        const grant = grants.find((g) => g.audience === mcpResource);
        const grantedScopes = grant?.scope || [];
        const hasReviewed = THIRD_PARTY_REVIEWED_SCOPES.every((s) => grantedScopes.includes(s));
        const overGranted = grantedScopes.filter((s) => !THIRD_PARTY_REVIEWED_SCOPES.includes(s));
        const ok = hasReviewed && overGranted.length === 0;
        checks.push({ id: "acme_mcp_grant", name: "Acme granted a reviewed, smaller scope set", pass: ok,
          message: ok
            ? `${acme.name} granted exactly: ${grantedScopes.join(", ")}`
            : !grant
              ? `No grant found for ${acme.name} — Applications → APIs → Nexus MCP Server → Application Access → Acme Partner Agent → Edit → grant only mcp:docs:search and mcp:docs:read`
              : overGranted.length > 0
                ? `${acme.name} is over-granted: ${overGranted.join(", ")} — remove scopes beyond mcp:docs:search / mcp:docs:read`
                : `${acme.name} is missing: ${THIRD_PARTY_REVIEWED_SCOPES.filter((s) => !grantedScopes.includes(s)).join(", ")}` });
      }
    } catch (e) {
      checks.push({ id: "acme_mcp_grant", name: "Acme granted a reviewed, smaller scope set", pass: false, message: e.message });
    }
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
    audience: tenant?.agentAudience || process.env.AUTH0_AUDIENCE || "",
    // Connection name for the SDK's connectAccountWithRedirect() call
    // (VaultStatus.jsx) -- crmConnection is derived at provisioning time.
    crmConnection: tenant?.deploymentData?.vault_connections?.crm || process.env.VAULT_CONN_CRM || "",
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
  for (const provider of ["crm"]) {
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
    scopes: ["mcp:docs:search", "mcp:docs:read", "mcp:crm:log", "mcp:docs:share"],
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
