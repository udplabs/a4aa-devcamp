// =============================================================
// Auth0 Management API helper -- used by the demo platform hooks
//
// The CREATE hook receives `idp.management_credentials` for the
// customer-identity (Auth0) tenant. We exchange those for a
// Management API token and provision the lab's footprint:
//   - resource servers (backend API + MCP API)
//   - an M2M client (CIMD) with user-delegated OBO grant
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

async function mgmt(ctx, method, path, body) {
  const res = await fetch(`https://${ctx.domain}/api/v2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Management ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? undefined : await res.json();
}

// ---- Resource servers (APIs) ------------------------------------

export async function createResourceServer(ctx, opts) {
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
  if (opts.callbacks) body.callbacks = opts.callbacks;
  if (opts.allowed_logout_urls) body.allowed_logout_urls = opts.allowed_logout_urls;
  if (opts.web_origins) body.web_origins = opts.web_origins;
  if (opts.app_type !== "resource_server") body.oidc_conformant = true;
  if (opts.async_approval_notification_channels) body.async_approval_notification_channels = opts.async_approval_notification_channels;
  const created = await mgmt(ctx, "POST", "/clients", body);
  return created;
}

export async function updateClient(ctx, clientId, patch) {
  await mgmt(ctx, "PATCH", `/clients/${clientId}`, patch);
}

export async function deleteClient(ctx, clientId) {
  await mgmt(ctx, "DELETE", `/clients/${clientId}`);
}

// Authorize a client (by client_id) to request tokens for an API.
// Pass subject_type: "user" for user-delegated (OBO) grants.
export async function grantClientToApi(ctx, clientId, audience, scopes, opts = {}) {
  const body = { client_id: clientId, audience, scope: scopes };
  if (opts.subject_type) body.subject_type = opts.subject_type;
  await mgmt(ctx, "POST", "/client-grants", body);
}

// ---- Token Vault connections (Lab 4) ----------------------------

// Creates a social/OAuth2 connection. Pass tokenVault: true to
// auto-enable federated token storage on the connection. When
// omitted, Token Vault must be enabled manually in the Dashboard
// (the deliberate "aha" step in Lab 03). Returns the connection name.
export async function createVaultConnection(ctx, opts) {
  const options = {
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    scope: opts.scopes.join(" "),
    token_endpoint_auth_method: "client_secret_post",
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
  });
  return created.name;
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
