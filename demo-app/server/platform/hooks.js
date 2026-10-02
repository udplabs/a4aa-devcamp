// =============================================================
// Demo platform lifecycle hooks
//
//   POST /hooks/request  -- pre-creation validation
//   POST /hooks/create   -- provision the Auth0 footprint, then
//                           PATCH the callback with deploymentData
//   POST /hooks/update   -- settings changed; drop cached tenant
//   POST /hooks/destroy  -- best-effort teardown + drop cache
//
// CREATE provisions, for the demo's customer-identity tenant:
//   - Nexus Agent API + Nexus MCP Server (resource servers)
//   - the MCP server's own Custom API client (Token Vault exchanger)
//   - Auth for MCP tenant settings + a domain-level login connection
//   (the OBO Custom API client and both Agent records are created by
//   participants in the Dashboard -- Modules 02 and 03)
//   - CIBA-enabled client (CIBA must be enabled at tenant level -- bonus)
//   - CRM OAuth2 connection (Token Vault storage off by default -- Lab 03)
//   - per-demo FGA store + model (Lab 03, if settings)
//   - reconfigures the platform-created SPA app for the subdomain
// =============================================================

import { Router } from "express";
import { tenantResolver } from "./tenantResolver.js";
import {
  getManagementToken,
  deleteClient,
  deleteConnectionByName,
  deleteResourceServerByIdentifier,
} from "./auth0Management.js";
import { fgaSettingsFromEnvOrRecord, deleteFgaStore } from "./fgaProvision.js";
import {
  runProvision,
  safe,
  AGENT_API_IDENTIFIER,
  DEFAULT_MCP_RESOURCE_IDENTIFIER,
} from "./provision.js";

const router = Router();

function baseHost() {
  try {
    return new URL(process.env.BASE_URI || "http://localhost:3000").hostname;
  } catch {
    return "localhost";
  }
}

function subdomainOrigins(demoName) {
  const host = baseHost();
  const origin = `https://${demoName}.${host}`;
  return [origin, `${origin}/`];
}

function readSettings(body) {
  return body?.settings || body?.demonstration?.settings || body?.component?.settings || {};
}

async function reportState(callbackUrl, payload) {
  const token = await tenantResolver.getServiceToken();
  const res = await fetch(callbackUrl, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error(`[hooks] callback PATCH failed: ${res.status} ${await res.text()}`);
  }
}

// REQUEST -------------------------------------------------------
router.post("/hooks/request", (_req, res) => {
  console.log("[hooks] request");
  res.sendStatus(200);
});

// CREATE --------------------------------------------------------
router.post("/hooks/create", (req, res) => {
  console.log("[hooks] create");
  res.sendStatus(200); // respond fast; provision async

  (async () => {
    const body = req.body || {};
    const callbackUrl = body?.event?.callback;
    try {
      const idp = body.idp || {};
      const oidc = body.application?.oidc_configuration || {};
      const demoName = body.demonstration?.name || "demo";
      const settings = readSettings(body);

      const ctx = await getManagementToken(
        idp.management_credentials || {},
        oidc.issuer
      );

      const appUrl = subdomainOrigins(demoName)[0];
      const crmUrl = `https://${demoName}.${baseHost()}`;
      const fgaSettings = fgaSettingsFromEnvOrRecord(settings);

      const deploymentData = await runProvision(ctx, {
        appUrl,
        crmUrl,
        demoName,
        fgaSettings,
        oidcClientId: oidc.client_id || null,
      });
      deploymentData.idp_type = idp.type;

      if (callbackUrl) {
        await reportState(callbackUrl, { state: "finish", deploymentData });
      }
      console.log(`[hooks] create finished for ${demoName}`, Object.keys(deploymentData));
    } catch (err) {
      console.error("[hooks] create failed:", err.message);
      if (callbackUrl) {
        await reportState(callbackUrl, { state: "fail" }).catch(() => {});
      }
    }
  })();
});

// UPDATE --------------------------------------------------------
router.post("/hooks/update", (req, res) => {
  const name = req.body?.demonstration?.name;
  if (name) tenantResolver.remove(name);
  console.log("[hooks] update", name);
  res.sendStatus(200);
});

// DESTROY -------------------------------------------------------
router.post("/hooks/destroy", (req, res) => {
  console.log("[hooks] destroy");
  res.sendStatus(200);

  (async () => {
    const body = req.body || {};
    const demoName = body?.demonstration?.name;
    if (demoName) tenantResolver.remove(demoName);
    try {
      const idp = body.idp || {};
      const oidc = body.application?.oidc_configuration || {};
      const ctx = await getManagementToken(idp.management_credentials || {}, oidc.issuer);
      const dd = body?.deploymentData || {};

      if (dd.m2m_client_id) await safe("del m2m", () => deleteClient(ctx, dd.m2m_client_id));
      if (dd.mcp_server_client_id)
        await safe("del mcp server client", () => deleteClient(ctx, dd.mcp_server_client_id));
      if (dd.ciba_client_id) await safe("del ciba", () => deleteClient(ctx, dd.ciba_client_id));
      if (dd.vault_connections?.crm)
        await safe("del crm conn", () => deleteConnectionByName(ctx, dd.vault_connections.crm));
      await safe("del mcp server api", () =>
        deleteResourceServerByIdentifier(ctx, dd.backend_audience || DEFAULT_MCP_RESOURCE_IDENTIFIER));
      await safe("del agent api", () =>
        deleteResourceServerByIdentifier(ctx, dd.mcp_audience || AGENT_API_IDENTIFIER));

      const fgaSettings = fgaSettingsFromEnvOrRecord(readSettings(body));
      if (fgaSettings && dd.fga_store_id) {
        await safe("del fga store", () => deleteFgaStore(fgaSettings, dd.fga_store_id));
      }
      console.log(`[hooks] destroy cleanup done for ${demoName}`);
    } catch (err) {
      console.error("[hooks] destroy cleanup failed:", err.message);
    }
  })();
});

export default router;
