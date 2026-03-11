// =============================================================
// LAB 2: Implement JWT validation middleware
// See: lab-guide/02-chat-interface.md - Step 3
//
// Use express-oauth2-jwt-bearer to validate Auth0 JWTs:
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
//   };
// }
// =============================================================

// Placeholder - remove this once you implement the real middleware
export const validateAccessToken = (_req: any, _res: any, next: any) => next();

export function extractUser(_req: any) {
  return {
    sub: "anonymous",
    scope: ["chat:send", "tools:read", "tools:execute", "email:send"],
    email: "anonymous@example.com",
  };
}
