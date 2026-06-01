// =============================================================
// Auth0 Management API helper -- used by the demo platform hooks
//
// The CREATE hook receives `idp.management_credentials` for the
// customer-identity (Auth0) tenant. We exchange those for a
// Management API token and provision the lab's footprint:
//   - resource servers (backend API + MCP API)
//   - an M2M client with the token-exchange grant (MCP OBO)
//   - a CIBA-enabled client
//   - Google + Slack Token Vault connections
//   - reconfigure the platform-created SPA app for the subdomain
//
// The exact shape of `management_credentials` for customer-identity
// is isolated in getManagementToken() so it is easy to adjust.
// =============================================================

export interface ManagementCredentials {
  domain?: string;
  tokenEndpoint?: string;
  clientId?: string;
  client_id?: string;
  clientSecret?: string;
  client_secret?: string;
  audience?: string;
  // Okta/private-key style (not expected for Auth0, handled defensively)
  clientJWKS?: { keys: any[] };
}

export interface ManagementContext {
  domain: string;
  token: string;
}

function normalizeDomain(creds: ManagementCredentials, issuer?: string): string {
  if (creds.domain) return creds.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (creds.tokenEndpoint) return new URL(creds.tokenEndpoint).host;
  if (issuer) return new URL(issuer).host;
  throw new Error("Cannot determine Auth0 management domain from credentials");
}

export async function getManagementToken(
  creds: ManagementCredentials,
  issuer?: string
): Promise<ManagementContext> {
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

async function mgmt<T = any>(
  ctx: ManagementContext,
  method: string,
  path: string,
  body?: any
): Promise<T> {
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
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// ---- Resource servers (APIs) ------------------------------------

export async function createResourceServer(
  ctx: ManagementContext,
  opts: { identifier: string; name: string; scopes?: string[]; rbac?: boolean }
): Promise<{ id: string; identifier: string }> {
  const body: any = {
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
  const created = await mgmt<{ id: string; identifier: string }>(ctx, "POST", "/resource-servers", body);
  return { id: created.id, identifier: created.identifier };
}

// ---- Clients (applications) -------------------------------------

export async function createClient(
  ctx: ManagementContext,
  opts: { name: string; app_type: string; grant_types: string[]; callbacks?: string[]; allowed_logout_urls?: string[]; web_origins?: string[] }
): Promise<{ client_id: string; client_secret?: string }> {
  const created = await mgmt<{ client_id: string; client_secret?: string }>(ctx, "POST", "/clients", {
    name: opts.name,
    app_type: opts.app_type,
    grant_types: opts.grant_types,
    callbacks: opts.callbacks,
    allowed_logout_urls: opts.allowed_logout_urls,
    web_origins: opts.web_origins,
    oidc_conformant: true,
  });
  return created;
}

export async function updateClient(
  ctx: ManagementContext,
  clientId: string,
  patch: Record<string, any>
): Promise<void> {
  await mgmt(ctx, "PATCH", `/clients/${clientId}`, patch);
}

export async function deleteClient(ctx: ManagementContext, clientId: string): Promise<void> {
  await mgmt(ctx, "DELETE", `/clients/${clientId}`);
}

// Authorize a client (by client_id) to request tokens for an API.
export async function grantClientToApi(
  ctx: ManagementContext,
  clientId: string,
  audience: string,
  scopes: string[]
): Promise<void> {
  await mgmt(ctx, "POST", "/client-grants", {
    client_id: clientId,
    audience,
    scope: scopes,
  });
}

// ---- Token Vault connections (Lab 4) ----------------------------

// Creates a social connection with token vault enabled. Requires
// real OAuth client id/secret for the upstream provider (supplied
// as component settings). Returns the connection name.
export async function createVaultConnection(
  ctx: ManagementContext,
  opts: {
    name: string;
    strategy: "google-oauth2" | "oauth2";
    clientId: string;
    clientSecret: string;
    scopes: string[];
    enabledClients: string[];
    authorizationURL?: string;
    tokenURL?: string;
  }
): Promise<string> {
  const options: any = {
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    scope: opts.scopes.join(" "),
    // Enable Token Vault (federated token storage) on this connection.
    token_endpoint_auth_method: "client_secret_post",
    federated_connections_access_tokens: { active: true },
  };
  if (opts.strategy === "oauth2") {
    options.authorizationURL = opts.authorizationURL;
    options.tokenURL = opts.tokenURL;
  }
  const created = await mgmt<{ name: string }>(ctx, "POST", "/connections", {
    name: opts.name,
    strategy: opts.strategy,
    options,
    enabled_clients: opts.enabledClients,
  });
  return created.name;
}

export async function deleteConnectionByName(ctx: ManagementContext, name: string): Promise<void> {
  const list = await mgmt<any[]>(ctx, "GET", `/connections?name=${encodeURIComponent(name)}`);
  for (const c of list || []) {
    if (c?.id) await mgmt(ctx, "DELETE", `/connections/${c.id}`);
  }
}

export async function deleteResourceServerByIdentifier(
  ctx: ManagementContext,
  identifier: string
): Promise<void> {
  const list = await mgmt<any[]>(ctx, "GET", `/resource-servers?identifier=${encodeURIComponent(identifier)}`);
  for (const rs of list || []) {
    if (rs?.id) await mgmt(ctx, "DELETE", `/resource-servers/${rs.id}`);
  }
}
