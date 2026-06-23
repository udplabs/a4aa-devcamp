// =============================================================
// TenantResolver -- demo.okta.com bootstrap integration
//
// Resolves the active demo from the request host (subdomain),
// fetches its config from the platform bootstrap endpoint, and
// caches it with a TTL. Singleton: the same instance is shared
// in-process by the main API, the MCP server, and the hooks
// router (they all run in one Node process).
//
// Bootstrap URL format (per platform contract):
//   GET {DEMO_API_ENDPOINT}/bootstrap/{DEMO_API_APP_ID}/{demoName}
// (no `/applications/` segment)
// =============================================================

import { Tenant } from "./tenant.js";

const DEMO_API_ENDPOINT = process.env.DEMO_API_ENDPOINT || "https://api.demo.okta.com";
const DEMO_API_TOKEN_ENDPOINT =
  process.env.DEMO_API_TOKEN_ENDPOINT || "https://auth.demo.okta.com/oauth/token";
const DEMO_API_AUDIENCE = process.env.DEMO_API_AUDIENCE || "https://api.demo.okta.com";
const DEMO_API_APP_ID = process.env.DEMO_API_APP_ID || "";
const DEMO_API_CLIENT_ID = process.env.DEMO_API_CLIENT_ID || "";
const DEMO_API_CLIENT_SECRET = process.env.DEMO_API_CLIENT_SECRET || "";
const BASE_URI = process.env.BASE_URI || "http://localhost:3000";

class TenantResolver {
  tenants = new Map();
  byIssuer = new Map();
  serviceToken = null;

  // Whether the platform is wired up. When false we operate in
  // single-tenant local mode using env defaults.
  get platformEnabled() {
    return Boolean(DEMO_API_APP_ID && DEMO_API_CLIENT_ID && DEMO_API_CLIENT_SECRET);
  }

  // Extract the demo name from the host (the left-most subdomain
  // that is not part of the base domain). Returns null when the
  // host has no demo subdomain (e.g. plain localhost).
  extractDemoName(host) {
    if (!host) return null;
    const hostname = host.split(":")[0];
    if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;

    const baseHost = (() => {
      try {
        return new URL(BASE_URI).hostname;
      } catch {
        return "";
      }
    })();

    // If BASE_URI is a wildcard base like app.example.com, the demo
    // is the first label of the host when host = {demo}.app.example.com
    if (baseHost && hostname.endsWith(`.${baseHost}`)) {
      return hostname.slice(0, hostname.length - baseHost.length - 1).split(".")[0];
    }

    const parts = hostname.split(".");
    return parts.length > 2 ? parts[0] : null;
  }

  async getServiceToken() {
    if (this.serviceToken && Date.now() < this.serviceToken.expiresAt) {
      return this.serviceToken.token;
    }
    const res = await fetch(DEMO_API_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: DEMO_API_CLIENT_ID,
        client_secret: DEMO_API_CLIENT_SECRET,
        audience: DEMO_API_AUDIENCE,
      }),
    });
    if (!res.ok) {
      throw new Error(`Demo API token request failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    this.serviceToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return data.access_token;
  }

  async bootstrap(demoName) {
    const token = await this.getServiceToken();
    const url = `${DEMO_API_ENDPOINT}/bootstrap/${DEMO_API_APP_ID}/${demoName}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Bootstrap failed for "${demoName}": ${res.status} ${await res.text()}`);
    }
    return await res.json();
  }

  async resolve(demoName) {
    const key = demoName || "__default__";
    const cached = this.tenants.get(key);
    if (cached && !cached.isExpired()) return cached;

    let tenant;
    if (demoName && this.platformEnabled) {
      const bootstrap = await this.bootstrap(demoName);
      tenant = new Tenant(demoName, bootstrap);
    } else {
      tenant = new Tenant(key); // env-default fallback
    }

    this.tenants.set(key, tenant);
    if (tenant.domain) this.byIssuer.set(tenant.domain, tenant);
    return tenant;
  }

  // Look up an already-resolved tenant by its Auth0 domain (issuer
  // host). Used by the internal MCP server to validate inbound
  // tokens without a subdomain in the request.
  getByDomain(domain) {
    return this.byIssuer.get(domain);
  }

  remove(demoName) {
    const t = this.tenants.get(demoName);
    if (t?.domain) this.byIssuer.delete(t.domain);
    this.tenants.delete(demoName);
  }

  // Express middleware: resolve tenant from Host and attach to req.
  middleware() {
    return async (req, res, next) => {
      try {
        const demoName = this.extractDemoName(req.headers.host);
        req.tenant = await this.resolve(demoName);
        next();
      } catch (err) {
        console.error("[TenantResolver] resolve failed:", err.message);
        res.status(502).json({ error: "Unable to bootstrap demo", detail: err.message });
      }
    };
  }
}

export const tenantResolver = new TenantResolver();
