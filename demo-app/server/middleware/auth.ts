import type { RequestHandler } from "express";
import { getJwtValidator } from "../platform/jwt";

// Multi-tenant JWT validation for the backend API. The tenant
// resolver middleware (mounted on /api) has already attached
// req.tenant from the request subdomain; we use that tenant's
// issuer + backend audience to verify the access token. Falls back
// to env for local single-tenant runs.
export const validateAccessToken: RequestHandler = (req, res, next) => {
  const tenant = (req as any).tenant;
  const issuer = tenant?.issuer || `https://${process.env.AUTH0_DOMAIN}/`;
  const audience = tenant?.backendAudience || process.env.AUTH0_AUDIENCE || "";
  return getJwtValidator(issuer, audience)(req, res, next);
};

export function extractUser(req: any) {
  const authHeader = req.headers?.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  return {
    sub: req.auth?.payload?.sub as string,
    scope: (req.auth?.payload?.scope as string)?.split(" ") || [],
    email: req.auth?.payload?.email as string | undefined,
    accessToken,
  };
}
