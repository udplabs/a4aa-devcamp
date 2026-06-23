#!/usr/bin/env node
// =============================================================
// Provisioning integration test -- DocAgent CREATE hook
//
// Runs the same steps the demo platform CREATE hook runs, verifies
// every Auth0 object via the Management API, then cleans up.
//
// Required env vars (add to .env or export before running):
//   AUTH0_TEST_DOMAIN      -- your test tenant, e.g. dev-xyz.us.auth0.com
//   MGMT_CLIENT_ID         -- M2M app authorized against Auth0 Management API
//   MGMT_CLIENT_SECRET     -- that app's client secret
//
// Required Management API scopes on the M2M app:
//   create:clients  read:clients  update:clients  delete:clients
//   create:resource_servers  read:resource_servers  delete:resource_servers
//   create:client_grants  read:client_grants  delete:client_grants
//   read:tenants (optional -- used to check CIBA + token exchange features)
//
// Usage:
//   AUTH0_TEST_DOMAIN=dev-xyz.us.auth0.com \
//   MGMT_CLIENT_ID=... MGMT_CLIENT_SECRET=... \
//   node scripts/test-provision.js
//
//   -- or --  add the three vars to .env and run:
//   node scripts/test-provision.js
// =============================================================

import "dotenv/config";
import {
  getManagementToken,
  createResourceServer,
  createClient,
  updateClient,
  deleteClient,
  grantClientToApi,
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

Then re-run: node scripts/test-provision.js
`);
  process.exit(1);
}

// Unique demo name per run so parallel test runs don't collide.
const DEMO_NAME = `test-${Date.now()}`;

const BACKEND_API = process.env.BACKEND_API_IDENTIFIER || "https://devcamp-docagent-api";
const MCP_API     = process.env.MCP_API_IDENTIFIER     || "https://devcamp-mcp-server";

const MCP_SCOPES     = ["mcp:docs:search", "mcp:docs:read", "mcp:crm:log", "mcp:docs:share"];
const BACKEND_SCOPES = ["chat:send"];
const CIBA_GRANT     = "urn:openid:params:grant-type:ciba";

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

// ---- Management API read helpers ----------------------------------

async function mgmtGet(ctx, path) {
  const res = await fetch(`https://${ctx.domain}/api/v2${path}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!res.ok) {
    throw new Error(`Management GET ${path} returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function getResourceServer(ctx, identifier) {
  const list = await mgmtGet(ctx, `/resource-servers?identifier=${encodeURIComponent(identifier)}`);
  return (list || []).find((rs) => rs.identifier === identifier) || null;
}

async function getClientGrants(ctx, clientId, audience) {
  const qs = new URLSearchParams({ client_id: clientId, audience });
  return mgmtGet(ctx, `/client-grants?${qs}`);
}

async function getTenantSettings(ctx) {
  try {
    return await mgmtGet(ctx, "/tenants/settings");
  } catch {
    return null; // read:tenants scope may not be granted -- non-fatal
  }
}

// ---- Main ---------------------------------------------------------

async function main() {
  console.log("=============================================================");
  console.log(" DocAgent provisioning test");
  console.log(`  tenant:    ${DOMAIN}`);
  console.log(`  demo name: ${DEMO_NAME}`);
  console.log("=============================================================\n");

  // Authenticate with the Management API
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
    console.error(
      "Check that AUTH0_TEST_DOMAIN, MGMT_CLIENT_ID, and MGMT_CLIENT_SECRET are correct\n" +
      "and that the M2M app is authorized against the Auth0 Management API."
    );
    process.exit(1);
  }

  // Tracks what was created so we can clean up in finally.
  const created = {};

  try {
    // ------------------------------------------------------------------
    // Section 0: Tenant feature flags
    // ------------------------------------------------------------------
    console.log("Section 0: Tenant feature flags (informational)");

    const tenantSettings = await getTenantSettings(ctx);
    if (!tenantSettings) {
      console.log("  [INFO] read:tenants scope not granted -- skipping feature flag checks.");
      console.log("         Manually verify in Auth0 Dashboard > Settings > Advanced:");
      console.log("           - Enable Client-Initiated Backchannel Authentication (CIBA)");
      console.log("           - Enable Token Exchange");
    } else {
      const flags = tenantSettings.flags || {};
      const advanced = tenantSettings.advanced || {};

      // Token exchange -- varies by API version; check a few known fields.
      const tokenExchangeOn =
        flags.enable_token_exchange === true ||
        advanced.enable_token_exchange === true ||
        tenantSettings.enable_token_exchange === true;

      if (tokenExchangeOn) {
        pass("token exchange feature enabled on tenant");
      } else {
        fail(
          "token exchange feature enabled on tenant",
          "Not detected. Enable it in Auth0 Dashboard > Settings > Advanced > Token Exchange. " +
          "The OBO exchange in Lab 04 will fail without it."
        );
      }

      // CIBA -- similar multi-field check.
      const cibaOn =
        flags.enable_backchannel_authentication === true ||
        advanced.enable_backchannel_authentication === true ||
        tenantSettings.enable_backchannel_authentication === true;

      if (cibaOn) {
        pass("CIBA feature enabled on tenant");
      } else {
        fail(
          "CIBA feature enabled on tenant",
          "Not detected. Enable it in Auth0 Dashboard > Settings > Advanced > " +
          "Client-Initiated Backchannel Authentication. Live CIBA will fail without it."
        );
      }
    }

    // ------------------------------------------------------------------
    // Section 1: Resource servers
    // ------------------------------------------------------------------
    console.log("\nSection 1: Resource servers");

    await check("create backend API resource server", async () => {
      const rs = await createResourceServer(ctx, {
        identifier: BACKEND_API,
        name: "DocAgent Backend API (provision-test)",
        scopes: BACKEND_SCOPES,
        rbac: true,
      });
      created.backendApiId = rs.id;

      const verify = await getResourceServer(ctx, BACKEND_API);
      if (!verify) throw new Error("resource server not found after creation");
      if (!verify.enforce_policies) throw new Error("RBAC (enforce_policies) not enabled");
      const scopeValues = (verify.scopes || []).map((s) => s.value);
      for (const s of BACKEND_SCOPES) {
        if (!scopeValues.includes(s)) throw new Error(`scope missing: ${s}`);
      }
    });

    await check("create MCP API resource server with 4 scopes + RBAC", async () => {
      const rs = await createResourceServer(ctx, {
        identifier: MCP_API,
        name: "DocAgent MCP Server (provision-test)",
        scopes: MCP_SCOPES,
        rbac: true,
      });
      created.mcpApiId = rs.id;

      const verify = await getResourceServer(ctx, MCP_API);
      if (!verify) throw new Error("MCP resource server not found after creation");
      if (!verify.enforce_policies) throw new Error("RBAC (enforce_policies) not enabled");
      const scopeValues = (verify.scopes || []).map((s) => s.value);
      for (const s of MCP_SCOPES) {
        if (!scopeValues.includes(s)) throw new Error(`scope missing: ${s}`);
      }
    });

    // ------------------------------------------------------------------
    // Section 2: M2M client (OBO token exchange)
    // ------------------------------------------------------------------
    console.log("\nSection 2: M2M client (on-behalf-of token exchange)");

    await check("create Custom API client (resource_server) for OBO", async () => {
      const client = await createClient(ctx, {
        name: `docagent-mcp-m2m-${DEMO_NAME}`,
        app_type: "resource_server",
        resource_server_identifier: MCP_API,
      });
      created.m2mClientId     = client.client_id;
      created.m2mClientSecret = client.client_secret;

      const verify = await mgmtGet(ctx, `/clients/${client.client_id}`);
      if (verify.app_type !== "resource_server")
        throw new Error(`wrong app_type: ${verify.app_type}`);
      if (!client.client_secret)
        throw new Error("client_secret not returned (cannot populate deploymentData.m2m_client_secret)");
    });

    await check("grant Custom API client user-delegated access to MCP API with all 4 mcp:* scopes", async () => {
      if (!created.m2mClientId) throw new Error("Custom API client not created, skipping");
      await grantClientToApi(ctx, created.m2mClientId, MCP_API, MCP_SCOPES, { subject_type: "user" });

      const grants = await getClientGrants(ctx, created.m2mClientId, MCP_API);
      const grant = (grants || []).find((g) => g.client_id === created.m2mClientId);
      if (!grant) throw new Error("client grant to MCP API not found");
      for (const s of MCP_SCOPES) {
        if (!grant.scope.includes(s)) throw new Error(`grant missing scope: ${s}`);
      }
    });

    // OBO Token Exchange is intentionally NOT auto-enabled by the CREATE hook.
    // Participants enable it manually in the Dashboard (Lab 04 Dashboard step):
    //   Applications > docagent-mcp-m2m-{demoName} > Advanced Settings > Grant Types > Token Exchange

    // ------------------------------------------------------------------
    // Section 3: SPA reconfiguration
    // ------------------------------------------------------------------
    console.log("\nSection 3: SPA reconfiguration (subdomain callbacks)");

    await check("create placeholder SPA and patch subdomain callbacks + web_origins", async () => {
      // Simulates the platform-created OIDC app that the CREATE hook patches.
      const spa = await createClient(ctx, {
        name: `test-spa-${DEMO_NAME}`,
        app_type: "spa",
        grant_types: ["authorization_code"],
      });
      created.spaClientId = spa.client_id;

      const origin = `https://${DEMO_NAME}.your-deployment.example.com`;
      await updateClient(ctx, spa.client_id, {
        callbacks:           [origin],
        allowed_logout_urls: [origin],
        web_origins:         [origin],
      });

      const verify = await mgmtGet(ctx, `/clients/${spa.client_id}`);
      if (!verify.callbacks.includes(origin))
        throw new Error(`callbacks not set to ${origin}`);
      if (!verify.allowed_logout_urls.includes(origin))
        throw new Error("allowed_logout_urls not set");
      if (!verify.web_origins.includes(origin))
        throw new Error("web_origins not set");
    });

    // ------------------------------------------------------------------
    // Section 4: CIBA client
    // ------------------------------------------------------------------
    console.log("\nSection 4: CIBA client (async authorization / bonus lab)");

    await check("create CIBA client with CIBA grant type", async () => {
      const client = await createClient(ctx, {
        name: `docagent-ciba-${DEMO_NAME}`,
        app_type: "regular_web",
        grant_types: [CIBA_GRANT],
        async_approval_notification_channels: ["email"],
      });
      created.cibaClientId     = client.client_id;
      created.cibaClientSecret = client.client_secret;

      const verify = await mgmtGet(ctx, `/clients/${client.client_id}`);
      if (!verify.grant_types.includes(CIBA_GRANT))
        throw new Error("CIBA grant type missing from client");
      if (verify.app_type !== "regular_web")
        throw new Error(`wrong app_type: ${verify.app_type} (expected regular_web)`);
      if (!client.client_secret)
        throw new Error("client_secret not returned (cannot populate deploymentData.ciba_client_secret)");
    });

    await check("grant CIBA client to backend API with chat:send", async () => {
      if (!created.cibaClientId) throw new Error("CIBA client not created, skipping");
      await grantClientToApi(ctx, created.cibaClientId, BACKEND_API, BACKEND_SCOPES);

      const grants = await getClientGrants(ctx, created.cibaClientId, BACKEND_API);
      const grant = (grants || []).find((g) => g.client_id === created.cibaClientId);
      if (!grant) throw new Error("client grant to backend API not found");
      if (!grant.scope.includes("chat:send"))
        throw new Error("chat:send scope missing from backend API grant");
    });

    await check("grant CIBA client to MCP API with mcp:docs:share", async () => {
      if (!created.cibaClientId) throw new Error("CIBA client not created, skipping");
      await grantClientToApi(ctx, created.cibaClientId, MCP_API, ["mcp:docs:share"]);

      const grants = await getClientGrants(ctx, created.cibaClientId, MCP_API);
      const grant = (grants || []).find((g) => g.client_id === created.cibaClientId);
      if (!grant) throw new Error("client grant to MCP API not found for CIBA client");
      if (!grant.scope.includes("mcp:docs:share"))
        throw new Error("mcp:docs:share scope missing -- live CIBA /bc-authorize will fail");
    });

    // ------------------------------------------------------------------
    // Section 5: deploymentData shape
    // ------------------------------------------------------------------
    console.log("\nSection 5: deploymentData completeness");

    await check("all required deploymentData fields are populated", async () => {
      const dd = {
        m2m_client_id:     created.m2mClientId,
        m2m_client_secret: created.m2mClientSecret,
        ciba_client_id:    created.cibaClientId,
        ciba_client_secret: created.cibaClientSecret,
        backend_audience:  BACKEND_API,
        mcp_audience:      MCP_API,
        mcp_scopes:        MCP_SCOPES,
      };
      const missing = Object.entries(dd)
        .filter(([, v]) => !v || (Array.isArray(v) && v.length === 0))
        .map(([k]) => k);
      if (missing.length > 0)
        throw new Error(`missing fields: ${missing.join(", ")}`);
    });

  } finally {
    // ------------------------------------------------------------------
    // Cleanup -- runs even on failure so the test tenant stays clean.
    // ------------------------------------------------------------------
    console.log("\n--- Cleanup ---");

    async function tryClean(label, fn) {
      try {
        await fn();
        console.log(`  [CLEAN] ${label}`);
      } catch (err) {
        console.warn(`  [WARN]  cleanup ${label}: ${err.message}`);
      }
    }

    if (created.m2mClientId)
      await tryClean("M2M client", () => deleteClient(ctx, created.m2mClientId));
    if (created.cibaClientId)
      await tryClean("CIBA client", () => deleteClient(ctx, created.cibaClientId));
    if (created.spaClientId)
      await tryClean("test SPA", () => deleteClient(ctx, created.spaClientId));

    // Resource servers are shared identifiers -- only delete if we created them.
    if (created.backendApiId)
      await tryClean("backend API resource server", () =>
        deleteResourceServerByIdentifier(ctx, BACKEND_API)
      );
    if (created.mcpApiId)
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
    console.log(" All provisioning checks passed.\n");
  }
}

main().catch((err) => {
  console.error("\nUnhandled error:", err.message);
  process.exit(1);
});
