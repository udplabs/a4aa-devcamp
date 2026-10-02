// =============================================================
// Auth0 Management API helper -- used by the demo platform hooks
//
// The CREATE hook receives `idp.management_credentials` for the
// customer-identity (Auth0) tenant. We exchange those for a
// Management API token and provision the lab's footprint:
//   - resource servers (Nexus Agent API + Nexus MCP Server)
//   - the MCP server's own Custom API client (Token Vault exchanger)
//   - tenant settings Auth for MCP needs (resource parameter, iss,
//     CIMD registration) and a domain-level login connection
//   - a CIBA-enabled client
//   - CRM OAuth2 connection (Token Vault storage NOT auto-enabled)
//   - reconfigure the platform-created SPA app for the subdomain
//
// The exact shape of `management_credentials` for customer-identity
// is isolated in getManagementToken() so it is easy to adjust.
// =============================================================

function normalizeDomain(creds, issuer) {
  if (creds.domain) return creds.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (creds.tokenEndpoint) return new URL(creds.tokenEndpoint).host;
  if (issuer) return new URL(issuer).host;
  throw new Error("Cannot determine Auth0 management domain from credentials");
}

export async function getManagementToken(creds, issuer) {
  const domain = normalizeDomain(creds, issuer);
  const clientId = creds.clientId || creds.client_id;
  const clientSecret = creds.clientSecret || creds.client_secret;
  const audience = creds.audience || `https://${domain}/api/v2/`;
  const tokenEndpoint = creds.tokenEndpoint || `https://${domain}/oauth/token`;

  if (!clientId || !clientSecret) {
    throw new Error("management_credentials missing client_id/client_secret for customer-identity");
  }

  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience,
    }),
  });
  if (!res.ok) {
    throw new Error(`Management token request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return { domain, token: data.access_token };
}

async function mgmt(ctx, method, path, body, attempt = 0) {
  const res = await fetch(`https://${ctx.domain}/api/v2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 4) {
    const wait = (attempt + 1) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return mgmt(ctx, method, path, body, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`Management ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? undefined : await res.json();
}

// ---- Resource servers (APIs) ------------------------------------

export async function findResourceServersByName(ctx, name) {
  const list = await mgmt(ctx, "GET", "/resource-servers?per_page=100");
  const servers = Array.isArray(list) ? list : list?.resource_servers || [];
  return servers.filter((rs) => rs.name === name);
}

export async function createResourceServer(ctx, opts) {
  // Idempotency: a re-provision call with the same identifier should reuse
  // the existing resource server rather than failing or duplicating it.
  const byIdentifier = await mgmt(
    ctx,
    "GET",
    `/resource-servers?identifier=${encodeURIComponent(opts.identifier)}`
  );
  const existing = (byIdentifier || []).find((rs) => rs.identifier === opts.identifier);
  if (existing) {
    console.log(`[provision] resource server ${opts.name} already exists (${existing.identifier}), reusing`);
    return { id: existing.id, identifier: existing.identifier };
  }

  // Any OTHER resource server sharing this display name but a different
  // identifier is stale (e.g. left over from a prior run under a different
  // Codespace-forwarded origin) -- remove it so provisioning never produces
  // two APIs named the same thing.
  const stale = await findResourceServersByName(ctx, opts.name);
  for (const rs of stale) {
    console.log(`[provision] removing stale resource server ${opts.name} (${rs.identifier})`);
    await mgmt(ctx, "DELETE", `/resource-servers/${rs.id}`);
  }

  const body = {
    name: opts.name,
    identifier: opts.identifier,
    signing_alg: "RS256",
    skip_consent_for_verifiable_first_party_clients: true,
  };
  if (opts.scopes?.length) {
    body.scopes = opts.scopes.map((value) => ({ value, description: value }));
  }
  if (opts.rbac) {
    body.enforce_policies = true;
    body.token_dialect = "access_token_authz";
  }
  // Agent as Principal (Early Access): opts a resource server into receiving
  // sub_profile/client_profile claims, and act.sub = agent_id on OBO-issued
  // tokens once the client is linked to an agent record.
  if (opts.agentSubjectClaims) {
    body.agent_subject_claims = "auth0-v1";
  }
  // Per-app authorization: a client (first- or third-party) gets no
  // user-delegated access to this API until an admin creates a client
  // grant for it. This is what makes the third-party trust decision in
  // Module 03 an explicit, reviewable admin action.
  if (opts.requireClientGrant) {
    body.subject_type_authorization = {
      user: { policy: "require_client_grant" },
      client: { policy: "require_client_grant" },
    };
  }
  const created = await mgmt(ctx, "POST", "/resource-servers", body);
  return { id: created.id, identifier: created.identifier };
}

// ---- Clients (applications) -------------------------------------

export async function createClient(ctx, opts) {
  const body = {
    name: opts.name,
    app_type: opts.app_type,
  };
  if (opts.resource_server_identifier) body.resource_server_identifier = opts.resource_server_identifier;
  if (opts.grant_types) body.grant_types = opts.grant_types;
  if (opts.token_endpoint_auth_method) body.token_endpoint_auth_method = opts.token_endpoint_auth_method;
  if (opts.callbacks) body.callbacks = opts.callbacks;
  if (opts.allowed_logout_urls) body.allowed_logout_urls = opts.allowed_logout_urls;
  if (opts.web_origins) body.web_origins = opts.web_origins;
  if (opts.app_type !== "resource_server") body.oidc_conformant = true;
  if (opts.async_approval_notification_channels) body.async_approval_notification_channels = opts.async_approval_notification_channels;
  const created = await mgmt(ctx, "POST", "/clients", body);
  return created;
}

export async function getClient(ctx, clientId, fields) {
  const qs = fields ? `?fields=${fields.join(",")}&include_fields=true` : "";
  return mgmt(ctx, "GET", `/clients/${encodeURIComponent(clientId)}${qs}`);
}

// CIMD clients are addressed by their CIMD URL (external_client_id); the
// Management API still assigns them an internal client_id.
export async function findClientByExternalId(ctx, externalClientId) {
  const list = await mgmt(
    ctx,
    "GET",
    `/clients?external_client_id=${encodeURIComponent(externalClientId)}`
  );
  const clients = Array.isArray(list) ? list : list?.clients || [];
  return clients.find((c) => c.external_client_id === externalClientId) || null;
}

export async function updateClient(ctx, clientId, patch) {
  await mgmt(ctx, "PATCH", `/clients/${clientId}`, patch);
}

export async function deleteClient(ctx, clientId) {
  await mgmt(ctx, "DELETE", `/clients/${clientId}`);
}

// ---- Demo users -------------------------------------------------

export async function createDemoUser(ctx, { email, password, name }) {
  const existing = await mgmt(ctx, "GET", `/users-by-email?email=${encodeURIComponent(email)}`);
  if (existing?.length > 0) {
    console.log(`[provision] user ${email} already exists, skipping`);
    return existing[0];
  }
  const user = await mgmt(ctx, "POST", "/users", {
    email,
    password,
    name,
    connection: "Username-Password-Authentication",
    email_verified: true,
  });
  console.log(`[provision] created demo user: ${email}`);
  return user;
}

export async function deleteDemoUser(ctx, email) {
  const users = await mgmt(ctx, "GET", `/users-by-email?email=${encodeURIComponent(email)}`).catch(() => []);
  for (const u of users || []) {
    await mgmt(ctx, "DELETE", `/users/${u.user_id}`);
    console.log(`[provision] deleted demo user: ${email}`);
  }
}

// Legacy cleanup: earlier versions of this lab registered a CIMD native app
// (client_id = the /.well-known/client-metadata URL) under this display name.
// Agent as Principal replaced that flow, but tenants provisioned before the
// switch may still have one lying around -- delete it if found, no-op otherwise.
export async function deleteLegacyCimdApp(ctx) {
  const clients = await mgmt(ctx, "GET", "/clients?fields=client_id,name&page=0&per_page=100").catch(() => []);
  const cimd = (clients || []).find(c => c.name === "Nexus Agent (DevCamp)");
  if (cimd) {
    await mgmt(ctx, "DELETE", `/clients/${encodeURIComponent(cimd.client_id)}`);
    console.log(`[provision] deleted legacy CIMD app: ${cimd.client_id}`);
  }
}

// ---- Agents (Agent as Principal, Early Access) -------------------

// Find the agent record registered for this lab by name. Auth0 does not
// support filtering /api/v2/agents by name server-side, and the endpoint
// uses cursor pagination (take/from), not page/per_page -- so page through
// with the cursor and filter client-side (same pattern as deleteLegacyCimdApp
// above).
export async function findAgentByName(ctx, name) {
  let cursor;
  do {
    const qs = new URLSearchParams({ take: "100" });
    if (cursor) qs.set("from", cursor);
    const result = await mgmt(ctx, "GET", `/agents?${qs.toString()}`);
    const agents = result?.agents || [];
    const found = agents.find((a) => a.name === name);
    if (found) return found;
    cursor = result?.next;
  } while (cursor);
  return null;
}

export async function deleteAgentByName(ctx, name) {
  const agent = await findAgentByName(ctx, name);
  if (agent) {
    await mgmt(ctx, "DELETE", `/agents/${encodeURIComponent(agent.agent_id)}`);
    console.log(`[provision] deleted agent: ${agent.agent_id} (${name})`);
  }
}

// ---- Roles & permissions ----------------------------------------

export async function createRole(ctx, { name, description }) {
  const existing = await mgmt(ctx, "GET", `/roles?name_filter=${encodeURIComponent(name)}`);
  const found = (existing || []).find((r) => r.name === name);
  if (found) return found;
  return mgmt(ctx, "POST", "/roles", { name, description });
}

export async function addPermissionsToRole(ctx, roleId, permissions) {
  // permissions: [{ resource_server_identifier, permission_name }]
  await mgmt(ctx, "POST", `/roles/${roleId}/permissions`, { permissions });
}

export async function assignRoleToUser(ctx, userId, roleId) {
  await mgmt(ctx, "POST", `/users/${userId}/roles`, { roles: [roleId] });
}

export async function deleteRoleByName(ctx, name) {
  const list = await mgmt(ctx, "GET", `/roles?name_filter=${encodeURIComponent(name)}`).catch(() => []);
  for (const r of list || []) {
    if (r.name === name) await mgmt(ctx, "DELETE", `/roles/${r.id}`);
  }
}

// Authorize a client (by client_id) to request tokens for an API.
// Pass subject_type: "user" for user-delegated (OBO) grants.
export async function grantClientToApi(ctx, clientId, audience, scopes, opts = {}) {
  const body = { client_id: clientId, audience, scope: scopes };
  if (opts.subject_type) body.subject_type = opts.subject_type;
  await mgmt(ctx, "POST", "/client-grants", body);
}

export async function listClientGrants(ctx, clientId, audience) {
  const qs = new URLSearchParams({ client_id: clientId });
  if (audience) qs.set("audience", audience);
  const list = await mgmt(ctx, "GET", `/client-grants?${qs.toString()}`);
  return Array.isArray(list) ? list : list?.client_grants || [];
}

// ---- Tenant settings (Auth for MCP prerequisites) ----------------

export async function getTenantSettings(ctx) {
  return mgmt(ctx, "GET", "/tenants/settings");
}

// The three toggles Auth for MCP relies on (Dashboard → Settings → Advanced):
//   - Resource Parameter Compatibility Profile: accept RFC 8707 `resource`
//     in place of Auth0's `audience` (MCP clients MUST send `resource`).
//   - Include Issuer in Authorization Responses: RFC 9207 `iss`, which
//     protects MCP clients against mix-up attacks.
//   - Client ID Metadata Document Registration: advertises
//     client_id_metadata_document_supported in the AS metadata and lets
//     admins import CIMD clients (Early Access).
export async function enableAuthForMcpTenantSettings(ctx) {
  await mgmt(ctx, "PATCH", "/tenants/settings", {
    resource_parameter_profile: "compatibility",
    authorization_response_iss_parameter_supported: true,
  });
  // Sent separately: if the tenant isn't in the CIMD Early Access program
  // this field is rejected, and that must not undo the two settings above.
  await mgmt(ctx, "PATCH", "/tenants/settings", {
    client_id_metadata_document_supported: true,
  });
}

// ---- Connections ------------------------------------------------

// Third-party applications (including every CIMD client) can only log
// users in through domain-level connections.
export async function promoteConnectionToDomainLevel(ctx, name) {
  const list = await mgmt(ctx, "GET", `/connections?name=${encodeURIComponent(name)}`);
  const conn = (list || [])[0];
  if (!conn?.id) throw new Error(`Connection ${name} not found`);
  await mgmt(ctx, "PATCH", `/connections/${conn.id}`, { is_domain_connection: true });
  return conn.id;
}

export async function getConnectionByName(ctx, name) {
  const list = await mgmt(ctx, "GET", `/connections?name=${encodeURIComponent(name)}`);
  return (list || [])[0] || null;
}

// ---- Token Vault connections (Lab 4) ----------------------------

// Creates a social/OAuth2 connection. Pass tokenVault: true to
// auto-enable federated token storage on the connection. When
// omitted, Token Vault must be enabled manually in the Dashboard
// (the deliberate "aha" step in Lab 03). Returns the connection name.
export async function createVaultConnection(ctx, opts) {
  const existing = await getConnectionByName(ctx, opts.name);
  if (existing) {
    // Re-sync enabled_clients on every provision run -- the MCP server
    // client (and its id) is recreated each time (see createClient), so a
    // stale list here leaves the connection authorizing a now-orphaned
    // client instead of the one vault.js actually exchanges with.
    console.log(`[provision] connection ${opts.name} already exists, syncing enabled_clients`);
    await mgmt(ctx, "PATCH", `/connections/${existing.id}`, {
      enabled_clients: opts.enabledClients,
    });
    return existing.name;
  }
  const options = {
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    scope: opts.scopes.join(" "),
    token_endpoint_auth_method: "client_secret_post",
    // This connection exists only for Token Vault linking via the Connected
    // Accounts flow -- it must not double as a primary sign-in option, or a
    // user clicking it on the login screen gets logged in without Auth0
    // ever storing the refresh token Token Vault needs.
    show_as_button: false,
    // Required by Auth0 for the oauth2 strategy even when used purely for Token Vault.
    scripts: {
      fetchUserProfile: [
        "function(accessToken, ctx, cb) {",
        "  cb(null, { user_id: ctx.connection + '|vault', name: 'Token Vault' });",
        "}",
      ].join(" "),
    },
  };
  if (opts.tokenVault) {
    options.federated_connections_access_tokens = { active: true };
  }
  if (opts.strategy === "oauth2") {
    options.authorizationURL = opts.authorizationURL;
    options.tokenURL = opts.tokenURL;
  }
  const created = await mgmt(ctx, "POST", "/connections", {
    name: opts.name,
    strategy: opts.strategy,
    options,
    enabled_clients: opts.enabledClients,
    // show_as_button only hides the button on Universal Login -- it does
    // NOT stop /authorize?connection=... from logging a user in through
    // this connection. These Purpose fields are what actually restrict it
    // to Connected Accounts linking, so a stray login attempt can't create
    // a parallel identity instead of a Token Vault connected account.
    authentication: { active: false },
    connected_accounts: { active: true },
  });
  return created.name;
}

// ---- Guardian / MFA -----------------------------------------

export async function enableGuardianPush(ctx) {
  await mgmt(ctx, "PUT", "/guardian/factors/push-notification", { enabled: true });
}

export async function disableGuardianPush(ctx) {
  await mgmt(ctx, "PUT", "/guardian/factors/push-notification", { enabled: false });
}

export async function setMfaPolicyAlways(ctx) {
  await mgmt(ctx, "PUT", "/guardian/policies", ["all-applications"]);
}

export async function resetMfaPolicy(ctx) {
  await mgmt(ctx, "PUT", "/guardian/policies", []);
}

export async function enableMfaCustomization(ctx) {
  await mgmt(ctx, "PATCH", "/tenants/settings", { customize_mfa_in_postlogin_action: true });
}

export async function disableMfaCustomization(ctx) {
  await mgmt(ctx, "PATCH", "/tenants/settings", { customize_mfa_in_postlogin_action: false });
}

// ---- Actions ----------------------------------------------------

export async function createPostLoginAction(ctx, { name, code, secrets = [] }) {
  const list = await mgmt(ctx, "GET", "/actions/actions?triggerId=post-login&per_page=100");
  const existing = (list?.actions || []).find((a) => a.name === name);
  if (existing) {
    await mgmt(ctx, "PATCH", `/actions/actions/${existing.id}`, { code, secrets });
    return existing;
  }
  return await mgmt(ctx, "POST", "/actions/actions", {
    name,
    supported_triggers: [{ id: "post-login", version: "v3" }],
    code,
    secrets,
  });
}

export async function deployAction(ctx, actionId) {
  return await mgmt(ctx, "POST", `/actions/actions/${actionId}/deploy`);
}

// Actions build asynchronously after create/update. Deploying before the
// build finishes gets rejected with "draft must be in the 'built' state".
export async function waitForActionBuilt(ctx, actionId, { timeoutMs = 20000, intervalMs = 1500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const action = await mgmt(ctx, "GET", `/actions/actions/${actionId}`);
    if (action?.status === "built") return action;
    if (action?.status === "failed") {
      throw new Error(`Action ${actionId} failed to build`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Action ${actionId} did not reach 'built' state within ${timeoutMs}ms`);
}

export async function bindActionToPostLogin(ctx, actionId, displayName) {
  const current = await mgmt(ctx, "GET", "/actions/triggers/post-login/bindings");
  const bindings = (current?.bindings || []).map((b) => ({
    ref: { type: "action_id", value: b.action.id },
    display_name: b.display_name,
  }));
  if (!bindings.some((b) => b.ref.value === actionId)) {
    bindings.push({ ref: { type: "action_id", value: actionId }, display_name: displayName });
  }
  await mgmt(ctx, "PATCH", "/actions/triggers/post-login/bindings", { bindings });
}

export async function unbindAndDeleteAction(ctx, actionId) {
  const current = await mgmt(ctx, "GET", "/actions/triggers/post-login/bindings");
  const bindings = (current?.bindings || [])
    .filter((b) => b.action.id !== actionId)
    .map((b) => ({ ref: { type: "action_id", value: b.action.id }, display_name: b.display_name }));
  await mgmt(ctx, "PATCH", "/actions/triggers/post-login/bindings", { bindings });
  await mgmt(ctx, "DELETE", `/actions/actions/${actionId}`);
}

export async function deleteConnectionByName(ctx, name) {
  const list = await mgmt(ctx, "GET", `/connections?name=${encodeURIComponent(name)}`);
  for (const c of list || []) {
    if (c?.id) await mgmt(ctx, "DELETE", `/connections/${c.id}`);
  }
}

export async function deleteResourceServerByIdentifier(ctx, identifier) {
  const list = await mgmt(ctx, "GET", `/resource-servers?identifier=${encodeURIComponent(identifier)}`);
  // Client-side filter guards against Auth0 returning extra entries (e.g. system RSes)
  // when the identifier query param doesn't produce an exact match.
  for (const rs of list || []) {
    if (rs?.id && rs.identifier === identifier) await mgmt(ctx, "DELETE", `/resource-servers/${rs.id}`);
  }
}

// Catches resource servers left behind under a stale identifier (e.g. a
// prior run's Codespace-forwarded origin) that deleteResourceServerByIdentifier
// alone wouldn't find, since Auth0 only dedups by identifier, not name.
export async function deleteResourceServerByName(ctx, name) {
  const servers = await findResourceServersByName(ctx, name);
  for (const rs of servers) {
    if (rs?.id) await mgmt(ctx, "DELETE", `/resource-servers/${rs.id}`);
  }
}
