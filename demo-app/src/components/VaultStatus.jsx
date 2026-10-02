import { useState, useEffect, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRuntimeConfig } from "../config/runtimeConfig";

// Scopes for Auth0's My Account API -- required to drive the
// Connected Accounts flow that actually populates Token Vault with
// a federated refresh token. Requires the SPA to be authorized for
// the My Account API in the Dashboard (see Module 03 of the lab).
export const CONNECTED_ACCOUNTS_SCOPE =
  "create:me:connected_accounts read:me:connected_accounts delete:me:connected_accounts";

// Providers rendered as separate rows -- each is an independent Token
// Vault connection with its own Connect/Disconnect/Check lifecycle.
// "crm" is the custom OAuth2 connection.
const PROVIDERS = [
  { key: "crm", label: "CRM" },
];

export function VaultStatus() {
  const { getAccessTokenSilently, loginWithRedirect, connectAccountWithRedirect } = useAuth0();
  const { domain, crmConnection } = useRuntimeConfig();
  const connectionNames = { crm: crmConnection };
  const [linked, setLinked] = useState({}); // { crm: bool|null }
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState({});

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
      const linkedProviders = new Set((data.providers || []).map((p) => p.provider));
      setLinked({
        crm: linkedProviders.has("crm"),
      });
    } catch {
      setLinked({ crm: false });
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

  const startConnect = useCallback((providerKey) => {
    return connectAccountWithRedirect({
      connection: connectionNames[providerKey],
      scopes: ["offline_access"],
      redirectUri: `${window.location.origin}/`,
    });
  }, [connectAccountWithRedirect, connectionNames]);

  // If a prior Connect click had to detour through the MFA bootstrap
  // below, this is the leg that actually resumes the real connect flow
  // once we're back with a token for the My Account API audience.
  useEffect(() => {
    const pending = sessionStorage.getItem("vault_pending_connect");
    if (pending) {
      sessionStorage.removeItem("vault_pending_connect");
      startConnect(pending).catch((err) =>
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

  async function handleConnect(providerKey) {
    setBusy((prev) => ({ ...prev, [providerKey]: true }));
    try {
      // connectAccountWithRedirect() needs a My Account API token
      // internally and navigates away on success -- nothing after this
      // runs in that case.
      await startConnect(providerKey);
    } catch (err) {
      if (err?.error === "missing_refresh_token") {
        // First-ever request for the My Account API audience: no cached
        // refresh token yet. This tenant forces a Guardian push MFA
        // challenge on fresh authentication, which only a real (non-
        // silent) redirect can complete, so bootstrap it once via
        // loginWithRedirect, then resume the actual connect flow above
        // once we're back (see the vault_pending_connect effect).
        sessionStorage.setItem("vault_pending_connect", providerKey);
        await loginWithRedirect({
          authorizationParams: {
            audience: meAudience,
            scope: `openid ${CONNECTED_ACCOUNTS_SCOPE}`,
          },
          appState: { thenConnect: providerKey },
        });
        return;
      }
      console.error("[Vault] Connect failed:", err.message);
      setBusy((prev) => ({ ...prev, [providerKey]: false }));
    }
  }

  async function handleDisconnect(providerKey) {
    setBusy((prev) => ({ ...prev, [providerKey]: true }));
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
        body: JSON.stringify({ provider: providerKey }),
      });
      setLinked((prev) => ({ ...prev, [providerKey]: false }));
    } finally {
      setBusy((prev) => ({ ...prev, [providerKey]: false }));
    }
  }

  return (
    <div className="vault-status-group">
      {PROVIDERS.map(({ key, label }) => {
        const isLinked = linked[key];
        const isBusy = busy[key];
        return (
          <div className="vault-status" key={key}>
            <span
              className={`vault-dot ${isLinked === undefined || isLinked === null ? "vault-dot--unknown" : isLinked ? "vault-dot--on" : "vault-dot--off"}`}
            />
            <span className="vault-label">{label}</span>
            {isLinked === undefined || isLinked === null ? (
              <button
                className="vault-btn vault-btn--check"
                onClick={fetchStatus}
                disabled={checking}
                title="Check Token Vault connection status"
              >
                {checking ? "…" : "Check"}
              </button>
            ) : isLinked ? (
              <button
                className="vault-btn vault-btn--disconnect"
                onClick={() => handleDisconnect(key)}
                disabled={isBusy}
                title={`Revoke ${label} Token Vault connection`}
              >
                {isBusy ? "…" : "Disconnect"}
              </button>
            ) : (
              <>
                <button
                  className="vault-btn vault-btn--connect"
                  onClick={() => handleConnect(key)}
                  disabled={isBusy}
                  title={`Link ${label} via Token Vault`}
                >
                  {isBusy ? "…" : "Connect"}
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
      })}
    </div>
  );
}
