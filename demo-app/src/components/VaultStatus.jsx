import { useState, useEffect, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRuntimeConfig } from "../config/runtimeConfig";

// Scopes for Auth0's My Account API -- required to drive the
// Connected Accounts flow that actually populates Token Vault with
// a federated refresh token. Requires the SPA to be authorized for
// the My Account API in the Dashboard (see Module 03 of the lab).
export const CONNECTED_ACCOUNTS_SCOPE =
  "create:me:connected_accounts read:me:connected_accounts delete:me:connected_accounts";

export function VaultStatus() {
  const { getAccessTokenSilently, loginWithRedirect, connectAccountWithRedirect } = useAuth0();
  const { domain, crmConnection } = useRuntimeConfig();
  const [linked, setLinked] = useState(null); // null = not checked yet
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);

  const meAudience = `https://${domain}/me/`;

  // Checking status calls the real live Token Vault exchange (vault.js
  // getToken), so we don't run it automatically on every mount/page
  // refresh -- only when the user explicitly clicks "Check", or right
  // after a real Connected Accounts link completes (see
  // Auth0Provider.jsx's onRedirectCallback).
  const fetchStatus = useCallback(async () => {
    setChecking(true);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch("/api/vault/providers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const crmLinked = (data.providers || []).some((p) => p.provider === "crm");
      setLinked(crmLinked);
    } catch {
      setLinked(false);
    } finally {
      setChecking(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    if (sessionStorage.getItem("vault_check_on_load")) {
      sessionStorage.removeItem("vault_check_on_load");
      fetchStatus();
    }
  }, [fetchStatus]);

  const startConnect = useCallback(() => {
    return connectAccountWithRedirect({
      connection: crmConnection,
      scopes: ["offline_access"],
      redirectUri: `${window.location.origin}/`,
    });
  }, [connectAccountWithRedirect, crmConnection]);

  // If a prior Connect click had to detour through the MFA bootstrap
  // below, this is the leg that actually resumes the real connect flow
  // once we're back with a token for the My Account API audience.
  useEffect(() => {
    if (sessionStorage.getItem("vault_pending_connect")) {
      sessionStorage.removeItem("vault_pending_connect");
      startConnect().catch((err) =>
        console.error("[Vault] Connect (post-bootstrap) failed:", err.message)
      );
    }
  }, [startConnect]);

  async function connectedAccountsToken() {
    return getAccessTokenSilently({
      authorizationParams: {
        audience: meAudience,
        scope: `openid ${CONNECTED_ACCOUNTS_SCOPE}`,
      },
    });
  }

  async function handleConnect() {
    setBusy(true);
    try {
      // connectAccountWithRedirect() needs a My Account API token
      // internally and navigates away on success -- nothing after this
      // runs in that case.
      await startConnect();
    } catch (err) {
      if (err?.error === "missing_refresh_token") {
        // First-ever request for the My Account API audience: no cached
        // refresh token yet. This tenant forces a Guardian push MFA
        // challenge on fresh authentication, which only a real (non-
        // silent) redirect can complete, so bootstrap it once via
        // loginWithRedirect, then resume the actual connect flow above
        // once we're back (see the vault_pending_connect effect).
        await loginWithRedirect({
          authorizationParams: {
            audience: meAudience,
            scope: `openid ${CONNECTED_ACCOUNTS_SCOPE}`,
          },
          appState: { thenConnect: true },
        });
        return;
      }
      console.error("[Vault] Connect failed:", err.message);
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      const [apiToken, caToken] = await Promise.all([
        getAccessTokenSilently(),
        connectedAccountsToken(),
      ]);
      await fetch("/api/vault/disconnect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "X-Connected-Accounts-Token": caToken,
          "Content-Type": "application/json",
        },
      });
      setLinked(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vault-status">
      <span
        className={`vault-dot ${linked === null ? "vault-dot--unknown" : linked ? "vault-dot--on" : "vault-dot--off"}`}
      />
      <span className="vault-label">CRM</span>
      {linked === null ? (
        <button
          className="vault-btn vault-btn--check"
          onClick={fetchStatus}
          disabled={checking}
          title="Check Token Vault connection status"
        >
          {checking ? "…" : "Check"}
        </button>
      ) : linked ? (
        <button
          className="vault-btn vault-btn--disconnect"
          onClick={handleDisconnect}
          disabled={busy}
          title="Revoke Token Vault connection"
        >
          {busy ? "…" : "Disconnect"}
        </button>
      ) : (
        <>
          <button
            className="vault-btn vault-btn--connect"
            onClick={handleConnect}
            disabled={busy}
            title="Link CRM via Token Vault"
          >
            {busy ? "…" : "Connect"}
          </button>
          <button
            className="vault-btn vault-btn--check"
            onClick={fetchStatus}
            disabled={checking}
            title="Re-check status"
          >
            {checking ? "…" : "↻"}
          </button>
        </>
      )}
    </div>
  );
}
