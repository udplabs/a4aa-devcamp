// =============================================================
// PKCE helper -- RFC 7636
//
// Acme Partner Agent is a genuine public OAuth client (no client
// secret). Authorization Code + PKCE is the only safe grant for a
// public client: the code_verifier, generated and held only by
// this server, proves that the party redeeming the authorization
// code is the same party that started the flow -- without needing
// a pre-shared secret.
// =============================================================

import { randomBytes, createHash } from "crypto";

function base64url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Generates a fresh { verifier, challenge, state } triple for one
// authorization request. challenge = BASE64URL(SHA256(verifier)),
// per RFC 7636 S256.
export function generatePkcePair() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));
  return { verifier, challenge, state };
}
