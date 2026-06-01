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
//   - backend API + MCP API (resource servers)
//   - M2M client with the token-exchange grant (MCP OBO)
//   - CIBA-enabled client (Lab 2)
//   - Google + Slack Token Vault connections (Lab 4, if settings)
//   - per-demo FGA store + model (Lab 3, if settings)
//   - reconfigures the platform-created SPA app for the subdomain
// =============================================================

import { Router } from "express";
import { tenantResolver } from "./tenantResolver";
import {
  getManagementToken,
  createResourceServer,
  createClient,
  updateClient,
  deleteClient,
  grantClientToApi,
  createVaultConnection,
  deleteConnectionByName,
  deleteResourceServerByIdentifier,
  ManagementContext,
} from "./auth0Management";
import { fgaSettingsFromEnvOrRecord, provisionFgaStore, deleteFgaStore } from "./fgaProvision";
import type { DeploymentData } from "./tenant";

const BACKEND_API_IDENTIFIER = process.env.BACKEND_API_IDENTIFIER || "https://devcamp-retailzero-api";
const MCP_API_IDENTIFIER = process.env.MCP_API_IDENTIFIER || "https://devcamp-mcp-server";
const MCP_SCOPES = ["mcp:quote:read", "mcp:docs:create", "mcp:slack:post", "mcp:quote:commit"];
const BACKEND_SCOPES = ["chat:send"];
const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const CIBA_GRANT = "urn:openid:params:grant-type:ciba";

const router = Router();

function baseHost(): string {
  try {
    return new URL(process.env.BASE_URI || "http://localhost:3000").hostname;
  } catch {
    return "localhost";
  }
}

function subdomainOrigins(demoName: string): string[] {
  const host = baseHost();
  const origin = `https://${demoName}.${host}`;
  return [origin, `${origin}/`];
}

function readSettings(body: any): Record<string, any> {
  return body?.settings || body?.demonstration?.settings || body?.component?.settings || {};
}

async function reportState(callbackUrl: string, payload: Record<string, any>): Promise<void> {
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
      const demoName: string = body.demonstration?.name || "demo";
      const settings = readSettings(body);

      const ctx: ManagementContext = await getManagementToken(
        idp.management_credentials || {},
        oidc.issuer
      );

      // 1. Resource servers (idempotent-ish: ignore "already exists")
      await safe("backend resource server", () =>
        createResourceServer(ctx, {
          identifier: BACKEND_API_IDENTIFIER,
          name: "RetailZero Backend API",
          scopes: BACKEND_SCOPES,
          rbac: true,
        })
      );
      await safe("mcp resource server", () =>
        createResourceServer(ctx, {
          identifier: MCP_API_IDENTIFIER,
          name: "RetailZero MCP Server",
          scopes: MCP_SCOPES,
          rbac: true,
        })
      );

      // 2. M2M client for MCP on-behalf-of token exchange
      const m2m = await createClient(ctx, {
        name: `retailzero-mcp-m2m-${demoName}`,
        app_type: "non_interactive",
        grant_types: ["client_credentials", TOKEN_EXCHANGE_GRANT],
      });
      await safe("grant m2m -> mcp api", () =>
        grantClientToApi(ctx, m2m.client_id, MCP_API_IDENTIFIER, MCP_SCOPES)
      );

      // 3. Reconfigure the platform-created SPA app for the subdomain
      const origins = subdomainOrigins(demoName);
      if (oidc.client_id) {
        await safe("reconfigure SPA", () =>
          updateClient(ctx, oidc.client_id, {
            callbacks: origins,
            allowed_logout_urls: origins,
            web_origins: origins,
          })
        );
      }

      // 4. CIBA-enabled client (Lab 2)
      let ciba: { client_id: string; client_secret?: string } | null = null;
      ciba = await safe("ciba client", () =>
        createClient(ctx, {
          name: `retailzero-ciba-${demoName}`,
          app_type: "regular_web",
          grant_types: [CIBA_GRANT],
        })
      );
      if (ciba) {
        await safe("grant ciba -> backend api", () =>
          grantClientToApi(ctx, ciba!.client_id, BACKEND_API_IDENTIFIER, BACKEND_SCOPES)
        );
      }

      // 5. Token Vault connections (Lab 4) -- need upstream OAuth creds
      const vault_connections: DeploymentData["vault_connections"] = {};
      if (settings.GOOGLE_CLIENT_ID && settings.GOOGLE_CLIENT_SECRET) {
        const name = await safe("google connection", () =>
          createVaultConnection(ctx, {
            name: `google-${demoName}`,
            strategy: "google-oauth2",
            clientId: settings.GOOGLE_CLIENT_ID,
            clientSecret: settings.GOOGLE_CLIENT_SECRET,
            scopes: ["openid", "profile", "email",
              "https://www.googleapis.com/auth/documents",
              "https://www.googleapis.com/auth/drive.file"],
            enabledClients: [oidc.client_id, m2m.client_id].filter(Boolean),
          })
        );
        if (name) vault_connections.google = name;
      }
      if (settings.SLACK_CLIENT_ID && settings.SLACK_CLIENT_SECRET) {
        const name = await safe("slack connection", () =>
          createVaultConnection(ctx, {
            name: `slack-${demoName}`,
            strategy: "oauth2",
            clientId: settings.SLACK_CLIENT_ID,
            clientSecret: settings.SLACK_CLIENT_SECRET,
            scopes: ["chat:write", "channels:read"],
            enabledClients: [oidc.client_id, m2m.client_id].filter(Boolean),
            authorizationURL: "https://slack.com/oauth/v2/authorize",
            tokenURL: "https://slack.com/api/oauth.v2.access",
          })
        );
        if (name) vault_connections.slack = name;
      }

      // 6. FGA store + model (Lab 3) -- separate FGA credentials
      let fga: { storeId: string; modelId: string } | null = null;
      const fgaSettings = fgaSettingsFromEnvOrRecord(settings);
      if (fgaSettings) {
        fga = await safe("fga store", () => provisionFgaStore(fgaSettings, demoName));
      }

      // 7. Assemble deploymentData and finish
      const deploymentData: DeploymentData = {
        demo_name: demoName,
        idp_type: idp.type,
        created_at: new Date().toISOString(),
        backend_audience: BACKEND_API_IDENTIFIER,
        mcp_audience: MCP_API_IDENTIFIER,
        mcp_scopes: MCP_SCOPES,
        m2m_client_id: m2m.client_id,
        m2m_client_secret: m2m.client_secret,
        ciba_client_id: ciba?.client_id,
        ciba_client_secret: ciba?.client_secret,
        vault_connections,
        ...(fga
          ? {
              fga_api_url: fgaSettings!.apiUrl,
              fga_api_audience: fgaSettings!.apiAudience,
              fga_store_id: fga.storeId,
              fga_model_id: fga.modelId,
              fga_api_token_issuer: fgaSettings!.apiTokenIssuer,
              fga_client_id: fgaSettings!.clientId,
              fga_client_secret: fgaSettings!.clientSecret,
            }
          : {}),
      };

      if (callbackUrl) {
        await reportState(callbackUrl, { state: "finish", deploymentData });
      }
      console.log(`[hooks] create finished for ${demoName}`, Object.keys(deploymentData));
    } catch (err: any) {
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
      const dd: DeploymentData = body?.deploymentData || {};

      if (dd.m2m_client_id) await safe("del m2m", () => deleteClient(ctx, dd.m2m_client_id!));
      if (dd.ciba_client_id) await safe("del ciba", () => deleteClient(ctx, dd.ciba_client_id!));
      if (dd.vault_connections?.google)
        await safe("del google conn", () => deleteConnectionByName(ctx, dd.vault_connections!.google!));
      if (dd.vault_connections?.slack)
        await safe("del slack conn", () => deleteConnectionByName(ctx, dd.vault_connections!.slack!));
      await safe("del backend api", () => deleteResourceServerByIdentifier(ctx, BACKEND_API_IDENTIFIER));
      await safe("del mcp api", () => deleteResourceServerByIdentifier(ctx, MCP_API_IDENTIFIER));

      const fgaSettings = fgaSettingsFromEnvOrRecord(readSettings(body));
      if (fgaSettings && dd.fga_store_id) {
        await safe("del fga store", () => deleteFgaStore(fgaSettings, dd.fga_store_id!));
      }
      console.log(`[hooks] destroy cleanup done for ${demoName}`);
    } catch (err: any) {
      console.error("[hooks] destroy cleanup failed:", err.message);
    }
  })();
});

// Run a provisioning step, logging + swallowing failures so one
// optional piece (e.g. a missing upstream cred) doesn't abort the
// whole create. Returns the result or null on failure.
async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err: any) {
    console.error(`[hooks] step "${label}" failed: ${err.message}`);
    return null;
  }
}

export default router;
