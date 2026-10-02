// =============================================================
// Core provisioning logic -- shared by:
//   - platform/hooks.js  (webhook-driven, platform path)
//   - server/index.js    (in-app button, Codespace path)
//
// runProvision() creates all Auth0 resources for one demo tenant:
//   Nexus Agent API + Nexus MCP Server resource servers, the MCP
//   server's own Custom API client (Token Vault exchanger), the
//   Auth for MCP tenant settings, SPA client, CIBA client, CRM
//   connection, demo users, optional FGA store.
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
  deleteLegacyCimdApp,
  deleteAgentByName,
  findClientByExternalId,
  enableAuthForMcpTenantSettings,
  promoteConnectionToDomainLevel,
  enableGuardianPush,
  disableGuardianPush,
  setMfaPolicyAlways,
  resetMfaPolicy,
  enableMfaCustomization,
  disableMfaCustomization,
  createPostLoginAction,
  deployAction,
  waitForActionBuilt,
  bindActionToPostLogin,
  unbindAndDeleteAction,
} from "./auth0Management.js";
import { provisionFgaStore, deleteFgaStore, fgaSettingsFromEnvOrRecord } from "./fgaProvision.js";

// Two resource servers, named for what they actually protect:
//
//   Nexus Agent API (AGENT_API_IDENTIFIER, scope chat:send)
//     The audience the SPA logs in for. Only the Nexus agent's own
//     backend accepts these tokens. docagent-mcp-obo is a Custom API
//     client linked to this API (resource_server_identifier), which is
//     what lets it run the On-Behalf-Of exchange on tokens issued for it.
//
//   Nexus MCP Server (identifier = the MCP server's public URL)
//     The MCP server's resource identifier. Its PRM document advertises
//     this exact value as `resource` (RFC 9728), MCP clients send it as
//     the RFC 8707 `resource` parameter, and the MCP server rejects any
//     token whose `aud` isn't this value. Per-tool scopes live here.
//
// Env var / deploymentData names predate this naming and are kept for
// compatibility with the demo platform contract:
//   AUTH0_AUDIENCE      / deploymentData.mcp_audience     -> Nexus Agent API
//   AUTH0_TOOL_AUDIENCE / deploymentData.backend_audience -> Nexus MCP Server
export const AGENT_API_IDENTIFIER =
  process.env.AGENT_API_IDENTIFIER || process.env.MCP_API_IDENTIFIER || "https://devcamp-nexus-agent-api";
export const AGENT_API_NAME = "Nexus Agent API";
export const AGENT_API_SCOPES = ["chat:send"];

// Fallback MCP server identifier for provisioning paths that don't know
// the server's public URL (e.g. the demo-platform webhook). The in-app
// Codespace path always passes the real URL -- see /api/setup/provision.
export const DEFAULT_MCP_RESOURCE_IDENTIFIER =
  process.env.MCP_RESOURCE_URI || "https://devcamp-docagent-api";
export const MCP_SERVER_API_NAME = "Nexus MCP Server";
export const MCP_SERVER_SCOPES = [
  "mcp:docs:search",
  "mcp:docs:read",
  "mcp:crm:log",
  "mcp:docs:share",
];

// Scopes a reviewing admin grants the third-party agent in Module 03.
// Read-only: no external sharing, no writes to systems of record, and
// none of the Token Vault-backed tools.
export const THIRD_PARTY_REVIEWED_SCOPES = ["mcp:docs:search", "mcp:docs:read"];

const TOKEN_VAULT_GRANT =
  "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token";
const CIBA_GRANT = "urn:openid:params:grant-type:ciba";
// Agent as Principal (Early Access): display name participants use when
// registering the agent record in the Dashboard and linking it to
// docagent-mcp-obo. Kept as a constant so provisioning, verification,
// and the frontend copy-paste helper all agree on the exact string.
export const AGENT_NAME = "Nexus Agent (DevCamp)";
// Agent as Principal identity for the third-party agent, created by an
// admin after importing and reviewing its CIMD client (Module 03: A
// second agent knocks). Kept distinct from AGENT_NAME so the two agents
// are distinguishable in tokens (act.sub) and tenant logs.
export const THIRD_PARTY_AGENT_NAME = "Acme Partner Agent (DevCamp)";

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
  { appUrl, crmUrl, mcpResourceUri, demoName, fgaSettings, oidcClientId = null }
) {
  const MCP_RESOURCE = (mcpResourceUri || DEFAULT_MCP_RESOURCE_IDENTIFIER).replace(/\/$/, "");

  // 0. Tenant settings Auth for MCP relies on: RFC 8707 resource parameter,
  // RFC 9207 iss in authorization responses, and CIMD client registration.
  await safe("auth for mcp tenant settings", () => enableAuthForMcpTenantSettings(ctx));

  // 1. Resource servers (idempotent-ish: ignore "already exists")
  await safe("mcp server resource server", () =>
    createResourceServer(ctx, {
      identifier: MCP_RESOURCE,
      name: MCP_SERVER_API_NAME,
      scopes: MCP_SERVER_SCOPES,
      rbac: true,
      // Opts this API into agent-aware claims (sub_profile, client_profile,
      // act.sub = agent_id) for any agent-linked client -- see Modules 02/03.
      agentSubjectClaims: true,
      // Per-app authorization: no client gets user-delegated access until an
      // admin grants it. docagent-mcp-obo gets its grant in Module 02; the
      // third-party CIMD client gets a reviewed subset in Module 03.
      requireClientGrant: true,
    })
  );
  await safe("agent resource server", () =>
    createResourceServer(ctx, {
      identifier: AGENT_API_IDENTIFIER,
      name: AGENT_API_NAME,
      scopes: AGENT_API_SCOPES,
      rbac: true,
    })
  );

  // 1b. The MCP server's own Custom API client. The MCP server calls Token
  // Vault with the token it received (aud = MCP_RESOURCE), and Auth0 only
  // allows that exchange from a client linked to the API in the subject
  // token's aud. This client is infrastructure the MCP server owns, so it's
  // provisioned for you; it's what makes Token Vault work no matter which
  // agent (first- or third-party) called the tool.
  const mcpServerClient = await safe("mcp server custom api client", () =>
    createClient(ctx, {
      name: `nexus-mcp-server-${demoName}`,
      app_type: "resource_server",
      resource_server_identifier: MCP_RESOURCE,
    })
  );
  // Separate step so a rejected grant type can't cost us the client itself.
  if (mcpServerClient?.client_id) {
    await safe("mcp server client token vault grant", () =>
      updateClient(ctx, mcpServerClient.client_id, { grant_types: [TOKEN_VAULT_GRANT] })
    );
  }

  // 2. OBO Custom API client (docagent-mcp-obo) — NOT auto-provisioned.
  // Participants create it in Module 02 from the Nexus Agent API screen
  // (APIs → Nexus Agent API → Add Application), which makes it a Custom
  // API client (app_type: resource_server) linked to that API -- the only
  // client type Auth0 lets run the On-Behalf-Of exchange. They also
  // register an Agent record (Agent as Principal, Early Access) and link
  // it to this client, so every OBO-issued token carries act.sub = agt_...
  const m2m = null;

  // 2b. Third-party CIMD client (Acme) — NOT auto-provisioned, by design.
  // Acme self-publishes a Client ID Metadata Document on its own server.
  // In Module 03 an admin imports it (Applications → Create Application →
  // Import from URL), which registers a strict third-party client whose
  // client_id IS the CIMD URL, then grants it a reviewed scope subset on
  // the MCP server API and links it to its own Agent record. Provisioning
  // only lays the groundwork every third-party client needs: the CIMD
  // tenant toggle (step 0) and a domain-level login connection (step 6b).

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
        grantClientToApi(ctx, spa.client_id, AGENT_API_IDENTIFIER, AGENT_API_SCOPES)
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
      grantClientToApi(ctx, ciba.client_id, AGENT_API_IDENTIFIER, AGENT_API_SCOPES)
    );
    await safe("grant ciba -> backend api (share scope)", () =>
      grantClientToApi(ctx, ciba.client_id, MCP_RESOURCE, ["mcp:docs:share"])
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
      enabledClients: [spa?.client_id, m2m?.client_id, mcpServerClient?.client_id].filter(Boolean),
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

  // 6b. Third-party applications (every CIMD client) can only use
  // domain-level connections, so promote the database connection the
  // demo users live in. First-party apps are unaffected.
  await safe("promote db connection to domain level", () =>
    promoteConnectionToDomainLevel(ctx, "Username-Password-Authentication")
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
        AGENT_API_SCOPES.map((s) => ({ resource_server_identifier: AGENT_API_IDENTIFIER, permission_name: s }))
      )
    );
    await safe("role backend permissions", () =>
      addPermissionsToRole(ctx, nexusRole.id,
        MCP_SERVER_SCOPES.map((s) => ({ resource_server_identifier: MCP_RESOURCE, permission_name: s }))
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

  // 8. Guardian push + MFA customization via Actions.
  await safe("enable guardian push factor", () => enableGuardianPush(ctx));
  await safe("set mfa policy to always", () => setMfaPolicyAlways(ctx));
  await safe("enable mfa customization in postlogin action", () => enableMfaCustomization(ctx));

  // 9. Post-login Action: enforce Guardian push MFA for the SPA.
  // New users are redirected to enroll; returning users are challenged.
  const MFA_ACTION_NAME = `enforce-guardian-push-${demoName}`;
  const mfaActionCode = `exports.onExecutePostLogin = async (event, api) => {
  if (event.client.client_id !== event.secrets.SPA_CLIENT_ID) return;

  // If MFA was already completed in this authentication context, skip.
  // This prevents re-challenging on silent token refreshes (getAccessTokenSilently).
  const methods = event.authentication?.methods || [];
  if (methods.some((m) => m.name === "mfa")) return;

  const enrolledFactors = event.user.enrolledFactors || [];
  const hasPush = enrolledFactors.some((f) => f.type === "push-notification");
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
    await safe("mfa action wait for built", () => waitForActionBuilt(ctx, mfaAction.id));
    const deployed = await safe("mfa action deploy", () => deployAction(ctx, mfaAction.id));
    if (deployed) {
      await safe("mfa action bind", () =>
        bindActionToPostLogin(ctx, mfaAction.id, "Enforce Guardian Push MFA")
      );
    } else {
      console.error(`[provision] skipping "mfa action bind": action ${mfaAction.id} was not deployed`);
    }
  }

  // 10. FGA store + model (optional; only if FGA credentials are provided)
  let fga = null;
  if (fgaSettings) {
    fga = await safe("fga store", () => provisionFgaStore(fgaSettings, demoName));
  }

  const deploymentData = {
    demo_name: demoName,
    created_at: new Date().toISOString(),
    // See the naming note at the top of this file.
    backend_audience: MCP_RESOURCE,
    mcp_audience: AGENT_API_IDENTIFIER,
    mcp_scopes: AGENT_API_SCOPES,
    mcp_server_client_id: mcpServerClient?.client_id,
    mcp_server_client_secret: mcpServerClient?.client_secret,
    spa_client_id: spa?.client_id,
    m2m_client_id: m2m?.client_id,
    m2m_client_secret: m2m?.client_secret,
    ciba_client_id: ciba?.client_id,
    ciba_client_secret: ciba?.client_secret,
    mfa_action_id: mfaAction?.id,
    demo_users: { alice: alice?.user_id, bob: bob?.user_id },
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
export async function runDeprovision(ctx, { acmeCimdUrl } = {}) {
  const spaClientId = process.env.VITE_AUTH0_CLIENT_ID;
  const m2mClientId = process.env.AUTH0_OBO_CLIENT_ID;
  const mcpServerClientId = process.env.MCP_SERVER_CLIENT_ID;
  const mcpResource = process.env.AUTH0_TOOL_AUDIENCE || DEFAULT_MCP_RESOURCE_IDENTIFIER;
  const agentApi = process.env.AUTH0_AUDIENCE || AGENT_API_IDENTIFIER;
  const cibaClientId = process.env.AUTH0_CIBA_CLIENT_ID;
  const mfaActionId = process.env.AUTH0_MFA_ACTION_ID;
  const crmConnName = process.env.VAULT_CONN_CRM;
  const fgaStoreId = process.env.FGA_STORE_ID;

  if (mfaActionId) await safe("del mfa action", () => unbindAndDeleteAction(ctx, mfaActionId));
  await safe("del nexus user role", () => deleteRoleByName(ctx, "Nexus User"));
  if (spaClientId) await safe("del spa client", () => deleteClient(ctx, spaClientId));
  if (m2mClientId) await safe("del obo m2m client", () => deleteClient(ctx, m2mClientId));
  if (mcpServerClientId) await safe("del mcp server client", () => deleteClient(ctx, mcpServerClientId));
  // The Acme CIMD client is addressed by its CIMD URL (external_client_id).
  if (acmeCimdUrl) {
    await safe("del acme cimd client", async () => {
      const acme = await findClientByExternalId(ctx, acmeCimdUrl);
      if (acme?.client_id) await deleteClient(ctx, acme.client_id);
    });
  }
  if (cibaClientId) await safe("del ciba client", () => deleteClient(ctx, cibaClientId));
  await safe("del legacy cimd app", () => deleteLegacyCimdApp(ctx));
  await safe("del agent", () => deleteAgentByName(ctx, AGENT_NAME));
  await safe("del thirdparty agent", () => deleteAgentByName(ctx, THIRD_PARTY_AGENT_NAME));
  if (crmConnName) await safe("del crm connection", () => deleteConnectionByName(ctx, crmConnName));
  await safe("del mcp server api", () => deleteResourceServerByIdentifier(ctx, mcpResource));
  await safe("del agent api", () => deleteResourceServerByIdentifier(ctx, agentApi));
  await safe("del demo user alice", () => deleteDemoUser(ctx, "alice@docagent.demo"));
  await safe("del demo user bob",   () => deleteDemoUser(ctx, "bob@docagent.demo"));
  await safe("disable guardian push", () => disableGuardianPush(ctx));
  await safe("reset mfa policy", () => resetMfaPolicy(ctx));
  await safe("disable mfa customization in postlogin action", () => disableMfaCustomization(ctx));
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
  // AUTH0_AUDIENCE is the user-facing login audience (Nexus Agent API).
  // AUTH0_TOOL_AUDIENCE is the MCP server's resource identifier (the OBO
  // target and the `resource` its PRM advertises).
  if (dd.mcp_audience) vars.AUTH0_AUDIENCE = dd.mcp_audience;
  if (dd.backend_audience) vars.AUTH0_TOOL_AUDIENCE = dd.backend_audience;
  if (dd.mcp_server_client_id) vars.MCP_SERVER_CLIENT_ID = dd.mcp_server_client_id;
  if (dd.mcp_server_client_secret) vars.MCP_SERVER_CLIENT_SECRET = dd.mcp_server_client_secret;
  if (dd.m2m_client_id) vars.AUTH0_OBO_CLIENT_ID = dd.m2m_client_id;
  if (dd.m2m_client_secret) vars.AUTH0_OBO_CLIENT_SECRET = dd.m2m_client_secret;
  if (dd.ciba_client_id) vars.AUTH0_CIBA_CLIENT_ID = dd.ciba_client_id;
  if (dd.ciba_client_secret) vars.AUTH0_CIBA_CLIENT_SECRET = dd.ciba_client_secret;
  if (dd.vault_connections?.crm) vars.VAULT_CONN_CRM = dd.vault_connections.crm;
  if (dd.mfa_action_id) vars.AUTH0_MFA_ACTION_ID = dd.mfa_action_id;
  if (dd.fga_store_id) vars.FGA_STORE_ID = dd.fga_store_id;
  if (dd.fga_model_id) vars.FGA_MODEL_ID = dd.fga_model_id;
  // Persisted so the FGA seeding branch (alice vs. bob access) still works
  // after a restart -- deploymentData.demo_users otherwise only lives in
  // memory and is lost the moment the server restarts (which happens
  // automatically right after provisioning).
  if (dd.demo_users?.alice) vars.DEMO_USER_ALICE_ID = dd.demo_users.alice;
  if (dd.demo_users?.bob) vars.DEMO_USER_BOB_ID = dd.demo_users.bob;
  return vars;
}
