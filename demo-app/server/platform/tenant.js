// =============================================================
// Tenant model -- demo.okta.com multi-tenant runtime
//
// One Tenant represents a single demo instance (one subdomain ->
// one Auth0 tenant). It carries the OIDC config the platform
// minted for the SPA plus the `deploymentData` our CREATE hook
// provisioned (the backend/MCP audiences, M2M + CIBA client
// creds, FGA store, federated connection names).
// =============================================================

const DEFAULT_TTL_MS = Number(process.env.TENANT_TTL_MS || 10 * 60 * 1000);

export class Tenant {
  constructor(name, bootstrap) {
    this.name = name;
    this.version = bootstrap?.version || "1.0.0";
    this.expiry = new Date(Date.now() + DEFAULT_TTL_MS);
    this.settings = bootstrap?.settings || {};
    this.idpType = bootstrap?.idp?.type || "unknown";
    this.deploymentData = bootstrap?.deploymentData || {};

    const oidc = bootstrap?.oidc_configuration;
    if (oidc?.issuer) {
      this.issuer = oidc.issuer.replace(/\/$/, "") + "/";
      this.domain = new URL(this.issuer).host;
      this.clientId = oidc.client_id;
      this.clientSecret = oidc.client_secret;
    } else {
      // Local/default fallback so the app still runs without the platform.
      const domain = process.env.AUTH0_DOMAIN || "";
      this.domain = domain;
      this.issuer = domain ? `https://${domain}/` : "";
      this.clientId = process.env.VITE_AUTH0_CLIENT_ID || "";
      this.clientSecret = undefined;
      this.idpType = "default";
      this.deploymentData = {
        backend_audience: process.env.AUTH0_AUDIENCE,
        mcp_audience: process.env.MCP_AUTH0_AUDIENCE,
        m2m_client_id: process.env.AUTH0_OBO_CLIENT_ID,
        m2m_client_secret: process.env.AUTH0_OBO_CLIENT_SECRET,
        ciba_client_id: process.env.AUTH0_CIBA_CLIENT_ID,
        ciba_client_secret: process.env.AUTH0_CIBA_CLIENT_SECRET,
        vault_connections: process.env.VAULT_CONN_CRM
          ? { crm: process.env.VAULT_CONN_CRM }
          : undefined,
      };
    }
  }

  // The audience the SPA should request for the backend API.
  get backendAudience() {
    return this.deploymentData.backend_audience || process.env.AUTH0_AUDIENCE;
  }

  get mcpAudience() {
    return this.deploymentData.mcp_audience || process.env.MCP_AUTH0_AUDIENCE;
  }

  isExpired() {
    return this.expiry < new Date();
  }
}
