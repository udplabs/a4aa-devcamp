// =============================================================
// LAB 01: Implement JWT validation middleware for Z-Merchant
// See: lab-guide/01-user-authentication.md
//
// Use express-oauth2-jwt-bearer to validate Auth0 JWTs issued for
// the RetailZero wholesale API (audience = AUTH0_AUDIENCE).
//
// import { auth } from "express-oauth2-jwt-bearer";
//
// export const validateAccessToken = auth({
//   issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
//   audience: process.env.AUTH0_AUDIENCE,
// });
//
// export function extractUser(req: any) {
//   return {
//     sub: req.auth?.payload?.sub,
//     scope: req.auth?.payload?.scope?.split(" ") || [],
//     email: req.auth?.payload?.email,
//     accessToken: req.headers.authorization?.replace(/^Bearer\s+/i, ""),
//   };
// }
// =============================================================

// Placeholder -- replace once Lab 01 is wired up.
export const validateAccessToken = (_req: any, _res: any, next: any) => next();

export function extractUser(_req: any) {
  return {
    sub: "anonymous",
    scope: ["mcp:quote:read", "mcp:docs:create", "mcp:slack:post", "mcp:quote:commit"],
    email: "anonymous@example.com",
    accessToken: undefined as string | undefined,
  };
}
