#!/usr/bin/env node
// =============================================================
// Hook integration test -- DocAgent CREATE / UPDATE / DESTROY
//
// Fires the three lifecycle hooks against a real demo-app server
// (spawned as a child process), intercepts the async provisioning
// callback with a local mock server, and verifies the resulting
// Auth0 objects via the Management API.
//
// Required env vars (add to .env or export):
//   AUTH0_TEST_DOMAIN      -- e.g. dev-xyz.us.auth0.com
//   MGMT_CLIENT_ID         -- M2M app authorized against Auth0 Management API
//   MGMT_CLIENT_SECRET     -- that app's client secret
//
// Required Management API scopes on the M2M app:
//   create:clients  read:clients  update:clients  delete:clients
//   create:resource_servers  read:resource_servers  delete:resource_servers
//   create:client_grants  read:client_grants  delete:client_grants
//
// Run: npm run test:hooks
// =============================================================

import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getManagementToken,
  createClient,
  deleteClient,
  deleteResourceServerByIdentifier,
} from "../server/platform/auth0Management.js";

// ---- Config -------------------------------------------------------

const DOMAIN = process.env.AUTH0_TEST_DOMAIN;
const CLIENT_ID = process.env.MGMT_CLIENT_ID;
const CLIENT_SECRET = process.env.MGMT_CLIENT_SECRET;

if (!DOMAIN || !CLIENT_ID || !CLIENT_SECRET) {
  console.error(`
Missing required environment variables. Set:

  AUTH0_TEST_DOMAIN      your test Auth0 tenant domain (e.g. dev-xyz.us.auth0.com)
  MGMT_CLIENT_ID         Management API M2M app client_id
  MGMT_CLIENT_SECRET     Management API M2M app client_secret

Then re-run: npm run test:hooks
`);
  process.exit(1);
}

const DEMO_NAME = `hooktest-${Date.now()}`;
const BACKEND_API = process.env.BACKEND_API_IDENTIFIER || "https://devcamp-docagent-api";
const MCP_API     = process.env.MCP_API_IDENTIFIER     || "https://devcamp-mcp-server";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The server reads a .port file (written by scripts/find-port.js) and uses
// it even when PORT is set in the environment, so detect the port the same way.
function getAppPort() {
  try {
    return parseInt(fs.readFileSync(path.join(ROOT, ".port"), "utf-8").trim(), 10);
  } catch {
    return parseInt(process.env.PORT || "3000", 10);
  }
}

const APP_PORT = getAppPort();

// ---- Utilities ----------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Test runner --------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function pass(label) {
  console.log(`  [PASS] ${label}`);
  passed++;
}

function fail(label, reason) {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(`  [FAIL] ${label}`);
  console.error(`         ${msg}`);
  failed++;
  failures.push({ label, msg });
}

async function check(label, fn) {
  try {
    await fn();
    pass(label);
  } catch (err) {
    fail(label, err);
  }
}

// ---- Mock server --------------------------------------------------
// Handles two routes:
//   POST /token           -- returns a fake service token (for reportState)
//   PATCH /callback/:name -- captures deploymentData from the CREATE hook

function startMockServer() {
  return new Promise((resolve, reject) => {
    let resolveCallback;
    const callbackPromise = new Promise((res) => {
      resolveCallback = res;
    });

    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        const body = raw.length ? JSON.parse(raw) : {};

        if (req.method === "POST" && req.url === "/token") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              access_token: "mock-service-token",
              token_type: "Bearer",
              expires_in: 3600,
            })
          );
          return;
        }

        if (req.method === "PATCH" && req.url.startsWith("/callback/")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          resolveCallback({ state: body.state, deploymentData: body.deploymentData });
          return;
        }

        console.warn(`[mock] unhandled ${req.method} ${req.url}`);
        res.writeHead(404);
        res.end();
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port, callbackPromise });
    });
    server.on("error", reject);
  });
}

// ---- App server ---------------------------------------------------

function spawnAppServer(mockPort) {
  const env = {
    ...process.env,
    // Route the service-token fetch to the mock so reportState() works
    // without real DEMO_API credentials.
    DEMO_API_TOKEN_ENDPOINT: `http://127.0.0.1:${mockPort}/token`,
    DEMO_API_CLIENT_ID: "mock-client",
    DEMO_API_CLIENT_SECRET: "mock-secret",
    DEMO_API_AUDIENCE: "https://mock-demo-audience",
    DEMO_API_APP_ID: "mock-app-id",
    // Suppress LLM so server starts without an OpenAI key.
    OPENAI_API_KEY: "",
  };

  const proc = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout.on("data", (d) => process.stdout.write(`[app] ${d}`));
  proc.stderr.on("data", (d) => process.stderr.write(`[app] ${d}`));
  proc.on("exit", (code) => {
    if (code !== null && code !== 0) console.warn(`[app] exited with code ${code}`);
  });

  return proc;
}

async function waitForHealth(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${APP_PORT}/api/health`);
      if (res.ok) return;
    } catch {}
    await sleep(300);
  }
  throw new Error(`App server did not become healthy on :${APP_PORT} within ${timeoutMs}ms`);
}

// ---- Management API read helpers ----------------------------------

async function mgmtGet(ctx, urlPath) {
  const res = await fetch(`https://${ctx.domain}/api/v2${urlPath}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!res.ok) throw new Error(`Management GET ${urlPath} returned ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getClientById(ctx, clientId) {
  // Propagate errors so callers see 429s as failures rather than silent nulls.
  return mgmtGet(ctx, `/clients/${clientId}`).catch((err) => {
    if (err.message.includes("404")) return null;
    throw err;
  });
}

async function getResourceServer(ctx, identifier) {
  const list = await mgmtGet(ctx, `/resource-servers?identifier=${encodeURIComponent(identifier)}`);
  return (list || []).find((rs) => rs.identifier === identifier) || null;
}

async function getClientGrants(ctx, clientId, audience) {
  const qs = new URLSearchParams({ client_id: clientId, audience });
  return mgmtGet(ctx, `/client-grants?${qs}`);
}

// ---- Main ---------------------------------------------------------

async function main() {
  console.log("=============================================================");
  console.log(" DocAgent hook integration test");
  console.log(`  tenant:    ${DOMAIN}`);
  console.log(`  demo name: ${DEMO_NAME}`);
  console.log("=============================================================\n");

  // Start mock callback server before anything else to avoid any
  // race condition with the CREATE hook's async PATCH.
  process.stdout.write("Starting mock callback server... ");
  const mock = await startMockServer();
  console.log(`OK (port ${mock.port})\n`);

  process.stdout.write("Authenticating with Management API... ");
  let ctx;
  try {
    ctx = await getManagementToken(
      { client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
      `https://${DOMAIN}/`
    );
    console.log("OK\n");
  } catch (err) {
    console.error(`FAILED\n\n${err.message}\n`);
    mock.server.close();
    process.exit(1);
  }

  // Create a throwaway SPA in Auth0 to simulate the platform-created
  // OIDC app that the CREATE hook patches with subdomain callbacks.
  process.stdout.write("Creating placeholder SPA in Auth0... ");
  let testSpa;
  try {
    testSpa = await createClient(ctx, {
      name: `hooktest-spa-${DEMO_NAME}`,
      app_type: "spa",
      grant_types: ["authorization_code"],
    });
    console.log(`OK (${testSpa.client_id})\n`);
  } catch (err) {
    console.error(`FAILED\n\n${err.message}\n`);
    mock.server.close();
    process.exit(1);
  }

  process.stdout.write("Starting demo-app server... ");
  const appProc = spawnAppServer(mock.port);
  try {
    await waitForHealth();
    console.log("OK\n");
  } catch (err) {
    console.error(`FAILED\n\n${err.message}\n`);
    appProc.kill();
    mock.server.close();
    await deleteClient(ctx, testSpa.client_id).catch(() => {});
    process.exit(1);
  }

  let deploymentData = null;

  try {
    // ------------------------------------------------------------------
    // Section 1: CREATE hook
    // ------------------------------------------------------------------
    console.log("Section 1: CREATE hook");

    const createPayload = {
      event: {
        callback: `http://127.0.0.1:${mock.port}/callback/${DEMO_NAME}`,
      },
      idp: {
        management_credentials: {
          domain: DOMAIN,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        },
      },
      application: {
        oidc_configuration: {
          issuer: `https://${DOMAIN}/`,
          client_id: testSpa.client_id,
        },
      },
      demonstration: { name: DEMO_NAME },
      settings: {},
    };

    await check("POST /hooks/create returns 200", async () => {
      const res = await fetch(`http://127.0.0.1:${APP_PORT}/hooks/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createPayload),
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

    process.stdout.write("\n  Waiting for provisioning callback (up to 45s)... ");
    const callbackResult = await Promise.race([
      mock.callbackPromise,
      sleep(45000).then(() => null),
    ]);

    if (!callbackResult) {
      fail("provisioning callback received within 45s", "Timed out -- check app server logs above");
    } else {
      pass("provisioning callback received within 45s");
      if (callbackResult.state !== "finish") {
        fail("callback state is 'finish'", `Got: ${callbackResult.state}`);
      } else {
        pass("callback state is 'finish'");
        deploymentData = callbackResult.deploymentData;
      }
    }

    // ------------------------------------------------------------------
    // Section 2: Verify provisioned Auth0 objects
    // ------------------------------------------------------------------
    console.log("\nSection 2: Verify provisioned Auth0 objects");

    if (!deploymentData) {
      fail("Auth0 object checks", "No deploymentData received -- skipping all object verification");
    } else {
      // Space out verification GETs to stay under free-tier Management API rate limits.
      const pause = () => sleep(1500);

      await check("backend API resource server created with RBAC", async () => {
        const rs = await getResourceServer(ctx, BACKEND_API);
        if (!rs) throw new Error("not found");
        if (!rs.enforce_policies) throw new Error("RBAC (enforce_policies) not enabled");
        const scopes = (rs.scopes || []).map((s) => s.value);
        if (!scopes.includes("chat:send")) throw new Error("chat:send scope missing");
      }); await pause();

      await check("MCP API resource server created with RBAC and 4 scopes", async () => {
        const rs = await getResourceServer(ctx, MCP_API);
        if (!rs) throw new Error("not found");
        if (!rs.enforce_policies) throw new Error("RBAC (enforce_policies) not enabled");
        const scopes = (rs.scopes || []).map((s) => s.value);
        for (const s of ["mcp:docs:search", "mcp:docs:read", "mcp:crm:log", "mcp:docs:share"]) {
          if (!scopes.includes(s)) throw new Error(`scope missing: ${s}`);
        }
      }); await pause();

      await check("Custom API client (resource_server) in deploymentData and exists in Auth0", async () => {
        if (!deploymentData.m2m_client_id) throw new Error("m2m_client_id missing from deploymentData");
        if (!deploymentData.m2m_client_secret) throw new Error("m2m_client_secret missing");
        const client = await getClientById(ctx, deploymentData.m2m_client_id);
        if (!client) throw new Error("Custom API client not found in Auth0");
        if (client.app_type !== "resource_server")
          throw new Error(`wrong app_type: ${client.app_type} (expected resource_server)`);
        // token_exchange profile is NOT auto-enabled -- participants enable it manually
        // in the Dashboard (Lab 04 Dashboard step). This check is intentionally absent.
      }); await pause();

      await check("Custom API client granted user-delegated access to MCP API with all 4 mcp:* scopes", async () => {
        if (!deploymentData.m2m_client_id) throw new Error("m2m_client_id missing");
        const grants = await getClientGrants(ctx, deploymentData.m2m_client_id, MCP_API);
        const grant = (grants || []).find((g) => g.client_id === deploymentData.m2m_client_id);
        if (!grant) throw new Error("user-delegated grant to MCP API not found");
        for (const s of ["mcp:docs:search", "mcp:docs:read", "mcp:crm:log", "mcp:docs:share"]) {
          if (!grant.scope.includes(s)) throw new Error(`scope missing: ${s}`);
        }
      }); await pause();

      await check("test SPA callbacks reconfigured to demo subdomain", async () => {
        const client = await getClientById(ctx, testSpa.client_id);
        if (!client) throw new Error("SPA client not found");
        const prefix = `https://${DEMO_NAME}.`;
        const hasCallback = (client.callbacks || []).some((c) => c.startsWith(prefix));
        if (!hasCallback)
          throw new Error(
            `No callback starting with ${prefix} -- got: ${JSON.stringify(client.callbacks)}`
          );
      }); await pause();

      await check("CIBA client in deploymentData and exists in Auth0", async () => {
        if (!deploymentData.ciba_client_id) throw new Error("ciba_client_id missing from deploymentData");
        if (!deploymentData.ciba_client_secret) throw new Error("ciba_client_secret missing");
        const client = await getClientById(ctx, deploymentData.ciba_client_id);
        if (!client) throw new Error("CIBA client not found in Auth0");
        const CIBA_GRANT = "urn:openid:params:grant-type:ciba";
        if (!client.grant_types.includes(CIBA_GRANT))
          throw new Error("CIBA grant type missing");
        if (client.app_type !== "regular_web")
          throw new Error(`wrong app_type: ${client.app_type} (expected regular_web)`);
      }); await pause();

      await check("CIBA client granted chat:send on backend API", async () => {
        if (!deploymentData.ciba_client_id) throw new Error("ciba_client_id missing");
        const grants = await getClientGrants(ctx, deploymentData.ciba_client_id, BACKEND_API);
        const grant = (grants || []).find((g) => g.client_id === deploymentData.ciba_client_id);
        if (!grant) throw new Error("grant to backend API not found");
        if (!grant.scope.includes("chat:send")) throw new Error("chat:send scope missing");
      }); await pause();

      await check("CIBA client granted mcp:docs:share on MCP API", async () => {
        if (!deploymentData.ciba_client_id) throw new Error("ciba_client_id missing");
        const grants = await getClientGrants(ctx, deploymentData.ciba_client_id, MCP_API);
        const grant = (grants || []).find((g) => g.client_id === deploymentData.ciba_client_id);
        if (!grant) throw new Error("grant to MCP API not found");
        if (!grant.scope.includes("mcp:docs:share")) throw new Error("mcp:docs:share scope missing");
      });

      await check("deploymentData contains all required fields", async () => {
        const required = [
          "m2m_client_id",
          "m2m_client_secret",
          "ciba_client_id",
          "ciba_client_secret",
          "backend_audience",
          "mcp_audience",
          "mcp_scopes",
          "vault_connections",
        ];
        const missing = required.filter(
          (k) => !deploymentData[k] || (Array.isArray(deploymentData[k]) && deploymentData[k].length === 0)
        );
        if (missing.length > 0) throw new Error(`missing fields: ${missing.join(", ")}`);
      });
    }

    // ------------------------------------------------------------------
    // Section 3: UPDATE hook
    // ------------------------------------------------------------------
    console.log("\nSection 3: UPDATE hook");

    await check("POST /hooks/update returns 200", async () => {
      const res = await fetch(`http://127.0.0.1:${APP_PORT}/hooks/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demonstration: { name: DEMO_NAME } }),
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

    // ------------------------------------------------------------------
    // Section 4: DESTROY hook
    // ------------------------------------------------------------------
    console.log("\nSection 4: DESTROY hook");

    if (!deploymentData) {
      console.log("  [SKIP] No deploymentData -- skipping DESTROY and deletion verification");
    } else {
      const destroyPayload = {
        idp: {
          management_credentials: {
            domain: DOMAIN,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
          },
        },
        application: {
          oidc_configuration: {
            issuer: `https://${DOMAIN}/`,
            client_id: testSpa.client_id,
          },
        },
        demonstration: { name: DEMO_NAME },
        deploymentData,
      };

      await check("POST /hooks/destroy returns 200", async () => {
        const res = await fetch(`http://127.0.0.1:${APP_PORT}/hooks/destroy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(destroyPayload),
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      });

      process.stdout.write("\n  Waiting 20s for async DESTROY to complete... ");
      await sleep(20000);
      console.log("done\n");

      console.log("Section 5: Verify objects deleted");

      await check("M2M client deleted", async () => {
        if (!deploymentData.m2m_client_id) throw new Error("no m2m_client_id to check");
        const client = await getClientById(ctx, deploymentData.m2m_client_id);
        if (client) throw new Error(`M2M client still exists: ${deploymentData.m2m_client_id}`);
      });

      await check("CIBA client deleted", async () => {
        if (!deploymentData.ciba_client_id) throw new Error("no ciba_client_id to check");
        const client = await getClientById(ctx, deploymentData.ciba_client_id);
        if (client) throw new Error(`CIBA client still exists: ${deploymentData.ciba_client_id}`);
      });

      await check("backend API resource server deleted", async () => {
        const rs = await getResourceServer(ctx, BACKEND_API);
        if (rs) throw new Error("backend API resource server still exists");
      });

      await check("MCP API resource server deleted", async () => {
        const rs = await getResourceServer(ctx, MCP_API);
        if (rs) throw new Error("MCP API resource server still exists");
      });
    }
  } finally {
    // ------------------------------------------------------------------
    // Cleanup -- always runs so the test tenant stays clean.
    // ------------------------------------------------------------------
    console.log("\n--- Cleanup ---");

    appProc.kill();
    mock.server.close();

    async function tryClean(label, fn) {
      try {
        await fn();
        console.log(`  [CLEAN] ${label}`);
      } catch (err) {
        console.warn(`  [WARN]  cleanup ${label}: ${err.message}`);
      }
    }

    // The test SPA is not deleted by DESTROY (platform owns it) so always clean it.
    if (testSpa?.client_id)
      await tryClean("test SPA", () => deleteClient(ctx, testSpa.client_id));

    // Remaining provisioned objects -- no-ops if already deleted by DESTROY.
    if (deploymentData?.m2m_client_id)
      await tryClean("M2M client", () => deleteClient(ctx, deploymentData.m2m_client_id));
    if (deploymentData?.ciba_client_id)
      await tryClean("CIBA client", () => deleteClient(ctx, deploymentData.ciba_client_id));
    // deleteResourceServerByIdentifier returns silently if the RS doesn't exist.
    await tryClean("backend API resource server", () =>
      deleteResourceServerByIdentifier(ctx, BACKEND_API)
    );
    await tryClean("MCP API resource server", () =>
      deleteResourceServerByIdentifier(ctx, MCP_API)
    );
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  const total = passed + failed;
  console.log("\n=============================================================");
  console.log(` Result: ${passed}/${total} checks passed`);

  if (failures.length > 0) {
    console.error("\nFailed checks:");
    for (const { label, msg } of failures) {
      console.error(`  - ${label}`);
      console.error(`    ${msg}`);
    }
    console.error("");
    process.exit(1);
  } else {
    console.log(" All hook integration checks passed.\n");
  }
}

main().catch((err) => {
  console.error("\nUnhandled error:", err.message);
  process.exit(1);
});
