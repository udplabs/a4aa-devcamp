import { auth } from "express-oauth2-jwt-bearer";

export const validateAccessToken = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.AUTH0_AUDIENCE,
});

export function extractUser(req: any) {
  return {
    sub: req.auth?.payload?.sub as string,
    scope: (req.auth?.payload?.scope as string)?.split(" ") || [],
    email: req.auth?.payload?.email as string | undefined,
  };
}
