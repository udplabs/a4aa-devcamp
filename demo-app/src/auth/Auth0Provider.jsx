// =============================================================
// Auth0Provider -- Lab 01
//
// Wraps the React tree in the Auth0 SDK provider. domain,
// clientId, and audience are NOT baked at build time (no
// VITE_AUTH0_* vars) -- they come from /api/config at runtime
// via useRuntimeConfig() so one build serves every demo tenant.
//
// Lab 01 orientation:
//   - domain: your Auth0 tenant domain, e.g. acme.auth0.com
//   - clientId: the SPA application's client_id in Auth0
//   - audience: the API identifier the SPA requests tokens for.
//     The token's `aud` claim must match what the backend checks
//     in server/middleware/auth.js (validateAccessToken).
//   - scope "openid profile email": the standard claims the SPA
//     needs. Tool-specific scopes (mcp:docs:search etc.) are
//     requested later, at token-acquisition time in useChat.js.
// =============================================================

import { Auth0Provider as Provider } from "@auth0/auth0-react";
import { useRuntimeConfig } from "../config/runtimeConfig";

export function Auth0Provider({ children }) {
  // Lab 01 -- runtime config from /api/config. No hardcoded tenant.
  const { domain, clientId, audience } = useRuntimeConfig();

  return (
    <Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        // Lab 01 -- audience tells Auth0 which API to mint a JWT for.
        // The backend validates this audience on every /api/chat call.
        audience,
        // chat:send is included at login so getAccessTokenSilently calls
        // (verify checks, useChat) return from cache without triggering
        // a silent re-auth that would re-invoke the post-login MFA action.
        scope: "openid profile email chat:send",
      }}
    >
      {children}
    </Provider>
  );
}
