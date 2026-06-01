// =============================================================
// Per-tenant JWT validator factory
//
// `express-oauth2-jwt-bearer` builds a verifier bound to a single
// issuer + audience at construction time. In a multi-tenant
// deployment every demo has its own Auth0 domain (issuer) and its
// own API audiences, so we lazily build and cache one verifier per
// (issuer, audience) pair and pick the right one per request.
// =============================================================

import { auth } from "express-oauth2-jwt-bearer";
import type { RequestHandler } from "express";

const cache = new Map<string, RequestHandler>();

export function getJwtValidator(issuerBaseURL: string, audience: string): RequestHandler {
  const issuer = issuerBaseURL.replace(/\/$/, "");
  const key = `${issuer}::${audience}`;
  let validator = cache.get(key);
  if (!validator) {
    validator = auth({ issuerBaseURL: issuer, audience });
    cache.set(key, validator);
  }
  return validator;
}

// Decode a JWT payload without verifying -- used only to discover
// which tenant a token belongs to (by `iss`) before we run the
// real, signature-checking verifier for that tenant.
export function decodeUnverified(token: string): Record<string, any> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function bearerFromHeader(req: { headers?: Record<string, any> }): string | null {
  const h = req.headers?.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}
