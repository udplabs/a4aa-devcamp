// =============================================================
// Client ID Metadata Document (CIMD) -- third-party agent identity
//
// Acme Partner Agent is a genuine standalone third party: it runs its
// own server, at its own origin, and publishes its own CIMD here. Per
// the MCP authorization spec and Auth0's CIMD support, the URL of this
// document IS Acme's OAuth client_id.
//
// How an enterprise onboards it (Module 03):
//   1. The admin previews the URL in Auth0 (Applications → Create
//      Application → Import from URL, or POST /api/v2/clients/cimd/preview).
//      Auth0 fetches it over HTTPS -- no localhost, no redirects, ≤ 5 KB,
//      ≤ 120-byte URL -- and checks that `client_id` exactly matches the
//      URL it was fetched from. Control of that HTTPS origin is the proof
//      that the document belongs to its publisher.
//   2. Import registers a strict third-party client (is_first_party:
//      false, consent always shown) whose client_id is this URL.
//      `client_name` is what users see on the consent screen.
//   3. The admin decides what Acme actually gets: a per-app user-
//      delegated grant on the MCP server API with a reviewed subset of
//      the scopes requested below, then links the client to an Agent
//      record so tokens carry act.sub = Acme's agent id.
//
// Shared secrets are not allowed for CIMD clients. A public client uses
// `none` + PKCE (this one); a confidential client would use
// `private_key_jwt` with a `jwks_uri` on the same origin as the CIMD.
//
// Contrast with Dynamic Client Registration (DCR, RFC 7591):
//   - DCR mints a new client_id on every registration, from an open
//     endpoint anyone on the internet can call.
//   - CIMD gives one stable, human-readable client_id per deployment
//     that appears as-is in tokens and tenant logs.
// =============================================================

import { requestOrigin, acmeCimdUrl } from "../utils/publicUrl.js";

// Everything Acme would like. What it gets is the admin's call.
export const ACME_REQUESTED_SCOPE =
  "mcp:docs:search mcp:docs:read mcp:crm:log mcp:docs:share";

// Acme's public origin: from ACME_CIMD_URL when set, otherwise the
// origin the request reached Acme on (the Codespace forwarded URL).
export function acmeOrigin(req) {
  if (process.env.ACME_CIMD_URL) return new URL(process.env.ACME_CIMD_URL).origin;
  return requestOrigin(req);
}

export function acmeClientId(req) {
  return acmeCimdUrl(acmeOrigin(req));
}

export function acmeRedirectUri(req) {
  return `${acmeOrigin(req)}/callback`;
}

export function getClientMetadata(req) {
  return {
    client_id: acmeClientId(req),
    client_name: "Acme Partner Agent",
    description: "Acme's partner agent: searches and reads Nexus documents for Acme staff.",
    application_type: "web",
    grant_types: ["authorization_code"],
    response_types: ["code"],
    redirect_uris: [acmeRedirectUri(req)],
    token_endpoint_auth_method: "none",
    scope: ACME_REQUESTED_SCOPE,
  };
}
