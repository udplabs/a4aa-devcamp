// =============================================================
// Client ID Metadata Document (CIMD) -- Lab 04
//
// CIMD is the A4AA answer to Dynamic Client Registration (DCR).
// Instead of creating a new ephemeral client_id at each install,
// the Nexus agent has a stable, pre-registered client_id
// whose metadata is managed by an admin in the Auth0 Dashboard.
//
// Benefits over DCR:
//   - Audit trail: the same client_id shows up in every token log.
//   - Admin consent: an admin can pre-approve the scopes without
//     the agent having to request them at runtime.
//   - Lifecycle: the client survives redeploys and upgrades.
//
// In the demo the CREATE hook provisions this M2M client and its
// id/secret arrive through runtime config (deploymentData). You
// can inspect it in the Auth0 Dashboard > Applications.
// =============================================================

// Return metadata for the pre-registered Nexus client.
// In production this could call the Auth0 Management API to fetch
// the application metadata dynamically; for the lab we return the
// known configuration for the DevCamp tenant.
export function getClientMetadata(clientId) {
  return {
    client_id: clientId,
    client_name: "Nexus (DevCamp)",
    description:
      "Nexus company knowledge assistant. Pre-registered via CIMD so its identity is stable across deploys and auditable.",
    allowed_scopes: [
      "mcp:docs:search", // search_documents (FGA-filtered)
      "mcp:docs:read",   // get_document (per-doc FGA check)
      "mcp:crm:log",     // log_crm_activity (Token Vault — CRM)
      "mcp:docs:share",  // share_document (CIBA-gated)
    ],
  };
}
