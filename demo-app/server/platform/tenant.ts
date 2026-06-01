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

// Everything the CREATE hook provisions and stashes on the demo
// platform, then we read back at runtime via bootstrap.
export interface DeploymentData {
  demo_name?: string;
  idp_type?: string;
  created_at?: string;

  // Backend + MCP resource servers (APIs)
  backend_audience?: string;
  mcp_audience?: string;
  mcp_scopes?: string[];

  // M2M client used for the MCP on-behalf-of token exchange
  m2m_client_id?: string;
  m2m_client_secret?: string;

  // CIBA-enabled client (Lab 2)
  ciba_client_id?: string;
  ciba_client_secret?: string;

  // Token Vault federated connections (Lab 4)
  vault_connections?: { google?: string; slack?: string };

  // Auth0/Okta FGA (Lab 3) -- separate product/API
  fga_api_url?: string;
  fga_api_audience?: string;
  fga_store_id?: string;
  fga_model_id?: string;
  fga_api_token_issuer?: string;
  fga_client_id?: string;
  fga_client_secret?: string;
}

export interface BootstrapResponse {
  version?: string;
  oidc_configuration?: {
    issuer: string;
    client_id: string;
    client_secret?: string;
    authorizeUrl?: string;
    tokenUrl?: string;
    userInfoUrl?: string;
  };
  settings?: Record<string, any>;
  idp?: { type?: string; domain?: string };
  deploymentData?: DeploymentData;
}

export class Tenant {
  name: string;
  version: string;
  expiry: Date;

  // OIDC (SPA) -- what the frontend Auth0Provider consumes
  issuer: string;
  domain: string;
  clientId: string;
  clientSecret?: string;

  // Component settings configured in demo.okta.com
  settings: Record<string, any>;
  idpType: string;

  // Provisioned footprint
  deploymentData: DeploymentData;

  constructor(name: string, bootstrap?: BootstrapResponse) {
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
        m2m_client_id: process.env.AUTH0_CLIENT_ID_M2M,
        m2m_client_secret: process.env.AUTH0_CLIENT_SECRET_M2M,
        ciba_client_id: process.env.AUTH0_CIBA_CLIENT_ID,
        ciba_client_secret: process.env.AUTH0_CIBA_CLIENT_SECRET,
      };
    }
  }

  // The audience the SPA should request for the backend API.
  get backendAudience(): string | undefined {
    return this.deploymentData.backend_audience || process.env.AUTH0_AUDIENCE;
  }

  get mcpAudience(): string | undefined {
    return this.deploymentData.mcp_audience || process.env.MCP_AUTH0_AUDIENCE;
  }

  isExpired(): boolean {
    return this.expiry < new Date();
  }
}
