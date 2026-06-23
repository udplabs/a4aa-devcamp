// =============================================================
// JWT Validation Middleware -- Lab 01
//
// Every /api route that carries user data is protected by this
// middleware. It validates the Bearer token in the Authorization
// header against the Auth0 tenant's JWKS endpoint.
//
// Multi-tenant: req.tenant is attached by tenantResolver before
// any /api route handler runs. We pull the issuer and audience
// from that tenant object so one middleware instance secures
// every demo subdomain. Local single-tenant runs fall back to env.
//
// Lab 01 orientation:
//   - validateAccessToken: drop-in Express middleware -- pass it
//     to app.post("/api/chat", validateAccessToken, handler).
//   - extractUser: pull sub, email, scope, and the raw token out
//     of req.auth so tool handlers can identify the calling rep.
// =============================================================

import { getJwtValidator } from "../platform/jwt.js";

// Lab 01 -- validates the Bearer token issued by Auth0 for
// this tenant. Rejects with 401 if the token is missing,
// expired, or signed by the wrong key.
export const validateAccessToken = (req, res, next) => {
  const tenant = req.tenant;
  const issuer = tenant?.issuer || `https://${process.env.AUTH0_DOMAIN}/`;
  const audience = tenant?.backendAudience || process.env.AUTH0_AUDIENCE || "";
  return getJwtValidator(issuer, audience)(req, res, next);
};

// Lab 01 -- extract the authenticated user's identity from the
// validated token. sub is the stable Auth0 user ID used by FGA
// and Token Vault. accessToken is forwarded to the MCP client
// for the on-behalf-of exchange (Lab 04).
export function extractUser(req) {
  const authHeader = req.headers?.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  return {
    sub: req.auth?.payload?.sub,
    scope: req.auth?.payload?.scope?.split(" ") || [],
    email: req.auth?.payload?.email,
    accessToken,
  };
}
