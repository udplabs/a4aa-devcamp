// =============================================================
// Core provisioning logic -- shared by:
//   - platform/hooks.js  (webhook-driven, platform path)
//   - server/index.js    (in-app button, Codespace path)
//
// runProvision() creates all Auth0 resources for one demo tenant:
//   backend API + MCP API resource servers, M2M client (OBO),
//   SPA client, CIBA client, CRM connection, optional FGA store.
//
// For the platform path, pass oidcClientId to reconfigure the
// platform-created SPA. For the in-app path, leave it null and
// a new SPA is created using appUrl as the callback origin.
// =============================================================

import {
  createResourceServer,
  createClient,
  updateClient,
  grantClientToApi,
  createRole,
  addPermissionsToRole,
  assignRoleToUser,
  deleteRoleByName,
  createVaultConnection,
  deleteClient,
  deleteConnectionByName,
  deleteResourceServerByIdentifier,
  createDemoUser,
  deleteDemoUser,
  deleteCimdApp,
  enableGuardianPush,
  disableGuardianPush,
  setMfaPolicyAlways,
  resetMfaPolicy,
  createPostLoginAction,
  deployAction,
  bindActionToPostLogin,
  unbindAndDeleteAction,
} from "./auth0Management.js";
import { provisionFgaStore, deleteFgaStore, fgaSettingsFromEnvOrRecord } from "./fgaProvision.js";

export const BACKEND_API_IDENTIFIER =
  process.env.BACKEND_API_IDENTIFIER || "https://devcamp-docagent-api";
export const MCP_API_IDENTIFIER =
  process.env.MCP_API_IDENTIFIER || "https://devcamp-mcp-server";
// MCP API: coarse-grained — proves the user can access the AI chat interface.
// This is the user-facing login audience; docagent-mcp-obo has
// resource_server_identifier = MCP_API_IDENTIFIER so the subject_token
// (audience = MCP) matches, enabling OBO exchange to the backend API.
export const MCP_SCOPES = ["chat:send"];

// Backend API: fine-grained per-tool scopes — enforced on each tool call
// via OBO. The MCP server validates OBO-issued backend API tokens and
// checks the specific scope before executing the tool.
export const BACKEND_SCOPES = [
  "mcp:docs:search",
  "mcp:docs:read",
  "mcp:crm:log",
  "mcp:docs:share",
];
const CIBA_GRANT = "urn:openid:params:grant-type:ciba";

export async function safe(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[provision] step "${label}" failed: ${err.message}`);
    return null;
  }
}

export async function runProvision(
  ctx,
  { appUrl, crmUrl, demoName, fgaSettings, oidcClientId = null }
) {
  // 1. Resource servers (idempotent-ish: ignore "already exists")
  await safe("backend resource server", () =>
    createResourceServer(ctx, {
      identifier: BACKEND_API_IDENTIFIER,
      name: "Nexus Backend API",
      scopes: BACKEND_SCOPES,
      rbac: true,
    })
  );
  await safe("mcp resource server", () =>
    createResourceServer(ctx, {
      identifier: MCP_API_IDENTIFIER,
      name: "Nexus MCP Server",
      scopes: MCP_SCOPES,
      rbac: true,
    })
  );

  // 2. M2M confidential client (OBO) — NOT auto-provisioned.
  // Participants create this manually in Module 01 from the MCP API
  // resource server screen (APIs → devcamp-mcp-server → Applications).
  // They also register a separate CIMD native app (public) via
  // Applications → Import from URL using the /.well-known/client-metadata
  // URL. The M2M client performs OBO exchanges; the CIMD native app
  // establishes the agent's published identity document.
  const m2m = null;

  // 4. SPA client — reconfigure if the platform created one, otherwise create new.
  const appOrigin = (appUrl || "").replace(/\/$/, "");
  let spa = null;
  if (oidcClientId) {
    await safe("reconfigure SPA", () =>
      updateClient(ctx, oidcClientId, {
        app_type: "spa",
        token_endpoint_auth_method: "none",
        callbacks: [appOrigin, `${appOrigin}/`],
        allowed_logout_urls: [appOrigin, `${appOrigin}/`],
        web_origins: [appOrigin, `${appOrigin}/`],
      })
    );
    spa = { client_id: oidcClientId };
  } else {
    spa = await safe("create SPA", () =>
      createClient(ctx, {
        name: `docagent-spa-${demoName}`,
        app_type: "spa",
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "implicit", "refresh_token"],
        callbacks: [appOrigin, `${appOrigin}/`],
        allowed_logout_urls: [appOrigin, `${appOrigin}/`],
        web_origins: [appOrigin, `${appOrigin}/`],
      })
    );
    if (spa) {
      await safe("grant spa -> mcp api", () =>
        grantClientToApi(ctx, spa.client_id, MCP_API_IDENTIFIER, MCP_SCOPES)
      );
    }
  }

  // 4. CIBA client (Bonus lab). CIBA must be enabled at tenant level in Dashboard.
  const ciba = await safe("ciba client", () =>
    createClient(ctx, {
      name: `docagent-ciba-${demoName}`,
      app_type: "regular_web",
      grant_types: [CIBA_GRANT],
      async_approval_notification_channels: ["guardian-push"],
    })
  );
  if (ciba) {
    await safe("grant ciba -> mcp api", () =>
      grantClientToApi(ctx, ciba.client_id, MCP_API_IDENTIFIER, MCP_SCOPES)
    );
    await safe("grant ciba -> backend api (share scope)", () =>
      grantClientToApi(ctx, ciba.client_id, BACKEND_API_IDENTIFIER, ["mcp:docs:share"])
    );
  }

  // 5. CRM OAuth2 connection. Token Vault storage is intentionally NOT enabled
  // so participants enable it manually in the Dashboard (Lab 03 step).
  const vault_connections = {};
  const crmBase = (crmUrl || appOrigin).replace(/\/$/, "");
  const crmName = await safe("crm connection", () =>
    createVaultConnection(ctx, {
      name: `crm-${demoName}`,
      strategy: "oauth2",
      authorizationURL: `${crmBase}/crm/oauth/authorize`,
      tokenURL: `${crmBase}/crm/oauth/token`,
      clientId: "crm-demo-client",
      clientSecret: process.env.CRM_CLIENT_SECRET || "crm-demo-secret",
      scopes: ["crm:activities:write"],
      enabledClients: [spa?.client_id, m2m?.client_id].filter(Boolean),
    })
  );
  if (crmName) vault_connections.crm = crmName;

  // 6. Demo users — alice (engineering access) and bob (all-company only).
  // Password is shown in the lab guide; email_verified is set so they can
  // log in immediately without an invitation email.
  const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || "DevCamp1!";
  const alice = await safe("demo user alice", () =>
    createDemoUser(ctx, {
      email: "alice@docagent.demo",
      password: DEMO_PASSWORD,
      name: "Alice (Engineering)",
    })
  );
  const bob = await safe("demo user bob", () =>
    createDemoUser(ctx, {
      email: "bob@docagent.demo",
      password: DEMO_PASSWORD,
      name: "Bob (All-Company)",
    })
  );

  // 7. Role: "Nexus User" — grants chat:send on the backend API.
  // Required because the backend API has RBAC enforced; without this role
  // the scope is withheld from the token even when the SPA requests it.
  const nexusRole = await safe("nexus user role", () =>
    createRole(ctx, { name: "Nexus User", description: "Standard Nexus app access" })
  );
  if (nexusRole) {
    await safe("role mcp permissions", () =>
      addPermissionsToRole(ctx, nexusRole.id,
        MCP_SCOPES.map((s) => ({ resource_server_identifier: MCP_API_IDENTIFIER, permission_name: s }))
      )
    );
    await safe("role backend permissions", () =>
      addPermissionsToRole(ctx, nexusRole.id,
        BACKEND_SCOPES.map((s) => ({ resource_server_identifier: BACKEND_API_IDENTIFIER, permission_name: s }))
      )
    );
    for (const demoUser of [alice, bob]) {
      if (demoUser?.user_id) {
        await safe(`assign role -> ${demoUser.email}`, () =>
          assignRoleToUser(ctx, demoUser.user_id, nexusRole.id)
        );
      }
    }
  }

  // 8. Guardian push — required for CIBA push notifications.
  await safe("enable guardian push factor", () => enableGuardianPush(ctx));

  // 9. Post-login Action: enforce Guardian push MFA for the SPA.
  // New users are redirected to enroll; returning users are challenged.
  const MFA_ACTION_NAME = `enforce-guardian-push-${demoName}`;
  const mfaActionCode = `exports.onExecutePostLogin = async (event, api) => {
  if (event.client.client_id !== event.secrets.SPA_CLIENT_ID) return;
  const enrolled = event.user.multifactor || [];
  const hasPush = enrolled.includes("guardian");
  if (hasPush) {
    api.authentication.challengeWith({ type: "push-notification" });
  } else {
    api.authentication.enrollWith({ type: "push-notification" });
  }
};`;
  const mfaAction = await safe("mfa action create", () =>
    createPostLoginAction(ctx, {
      name: MFA_ACTION_NAME,
      code: mfaActionCode,
      secrets: [{ name: "SPA_CLIENT_ID", value: spa?.client_id || "" }],
    })
  );
  if (mfaAction?.id) {
    await safe("mfa action deploy", () => deployAction(ctx, mfaAction.id));
    await safe("mfa action bind", () =>
      bindActionToPostLogin(ctx, mfaAction.id, "Enforce Guardian Push MFA")
    );
  }

  // 10. FGA store + model (optional; only if FGA credentials are provided)
  let fga = null;
  if (fgaSettings) {
    fga = await safe("fga store", () => provisionFgaStore(fgaSettings, demoName));
  }

  const deploymentData = {
    demo_name: demoName,
    created_at: new Date().toISOString(),
    backend_audience: BACKEND_API_IDENTIFIER,
    mcp_audience: MCP_API_IDENTIFIER,
    mcp_scopes: MCP_SCOPES,
    spa_client_id: spa?.client_id,
    m2m_client_id: m2m?.client_id,
    m2m_client_secret: m2m?.client_secret,
    ciba_client_id: ciba?.client_id,
    ciba_client_secret: ciba?.client_secret,
    mfa_action_id: mfaAction?.id,
    vault_connections,
    ...(fga
      ? {
          fga_api_url: fgaSettings.apiUrl,
          fga_api_audience: fgaSettings.apiAudience,
          fga_store_id: fga.storeId,
          fga_model_id: fga.modelId,
          fga_api_token_issuer: fgaSettings.apiTokenIssuer,
          fga_client_id: fgaSettings.clientId,
          fga_client_secret: fgaSettings.clientSecret,
        }
      : {}),
  };

  return deploymentData;
}

// Tear down the provisioned Auth0 footprint for the current .env config.
// Reads client/connection IDs from process.env and deletes them in order:
// clients first (so grants are removed), then connections, then resource servers.
export async function runDeprovision(ctx) {
  const spaClientId = process.env.VITE_AUTH0_CLIENT_ID;
  const m2mClientId = process.env.AUTH0_OBO_CLIENT_ID;
  const cibaClientId = process.env.AUTH0_CIBA_CLIENT_ID;
  const mfaActionId = process.env.AUTH0_MFA_ACTION_ID;
  const crmConnName = process.env.VAULT_CONN_CRM;
  const fgaStoreId = process.env.FGA_STORE_ID;

  if (mfaActionId) await safe("del mfa action", () => unbindAndDeleteAction(ctx, mfaActionId));
  await safe("del nexus user role", () => deleteRoleByName(ctx, "Nexus User"));
  if (spaClientId) await safe("del spa client", () => deleteClient(ctx, spaClientId));
  if (m2mClientId) await safe("del obo m2m client", () => deleteClient(ctx, m2mClientId));
  if (cibaClientId) await safe("del ciba client", () => deleteClient(ctx, cibaClientId));
  await safe("del cimd app", () => deleteCimdApp(ctx));
  if (crmConnName) await safe("del crm connection", () => deleteConnectionByName(ctx, crmConnName));
  await safe("del backend api", () => deleteResourceServerByIdentifier(ctx, BACKEND_API_IDENTIFIER));
  await safe("del mcp api", () => deleteResourceServerByIdentifier(ctx, MCP_API_IDENTIFIER));
  await safe("del demo user alice", () => deleteDemoUser(ctx, "alice@docagent.demo"));
  await safe("del demo user bob",   () => deleteDemoUser(ctx, "bob@docagent.demo"));
  await safe("disable guardian push", () => disableGuardianPush(ctx));
  if (fgaStoreId) {
    const fgaSettings = fgaSettingsFromEnvOrRecord({});
    if (fgaSettings) await safe("del fga store", () => deleteFgaStore(fgaSettings, fgaStoreId));
  }
}

// Maps deploymentData keys to the env var names that tenant.js reads
// in its single-tenant (env var) fallback path.
export function deploymentDataToEnvVars(dd) {
  const vars = {};
  if (dd.spa_client_id) vars.VITE_AUTH0_CLIENT_ID = dd.spa_client_id;
  // AUTH0_AUDIENCE is the user-facing login audience (MCP server).
  // AUTH0_TOOL_AUDIENCE is the OBO target (backend API, per-tool scopes).
  if (dd.mcp_audience) vars.AUTH0_AUDIENCE = dd.mcp_audience;
  if (dd.backend_audience) vars.AUTH0_TOOL_AUDIENCE = dd.backend_audience;
  if (dd.m2m_client_id) vars.AUTH0_OBO_CLIENT_ID = dd.m2m_client_id;
  if (dd.m2m_client_secret) vars.AUTH0_OBO_CLIENT_SECRET = dd.m2m_client_secret;
  if (dd.ciba_client_id) vars.AUTH0_CIBA_CLIENT_ID = dd.ciba_client_id;
  if (dd.ciba_client_secret) vars.AUTH0_CIBA_CLIENT_SECRET = dd.ciba_client_secret;
  if (dd.vault_connections?.crm) vars.VAULT_CONN_CRM = dd.vault_connections.crm;
  if (dd.mfa_action_id) vars.AUTH0_MFA_ACTION_ID = dd.mfa_action_id;
  if (dd.fga_store_id) vars.FGA_STORE_ID = dd.fga_store_id;
  if (dd.fga_model_id) vars.FGA_MODEL_ID = dd.fga_model_id;
  return vars;
}
