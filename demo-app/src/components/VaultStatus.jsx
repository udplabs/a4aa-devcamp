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
  const { getAccessTokenSilently } = useAuth0();
  const { domain } = useRuntimeConfig();
  const [linked, setLinked] = useState(null); // null = loading
  const [busy, setBusy] = useState(false);

  const fetchStatus = useCallback(async () => {
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
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function connectedAccountsToken() {
    return getAccessTokenSilently({
      authorizationParams: {
        audience: `https://${domain}/me/`,
        scope: CONNECTED_ACCOUNTS_SCOPE,
      },
    });
  }

  async function handleConnect() {
    setBusy(true);
    try {
      const [apiToken, caToken] = await Promise.all([
        getAccessTokenSilently(),
        connectedAccountsToken(),
      ]);
      const redirectUri = `${window.location.origin}/`;
      const res = await fetch("/api/vault/connect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "X-Connected-Accounts-Token": caToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ redirectUri }),
      });
      const data = await res.json();
      if (!res.ok || !data.connect_uri) {
        throw new Error(data.error_description || data.error || "Failed to start CRM connect flow");
      }
      sessionStorage.setItem("vault_connect_state", JSON.stringify({ redirectUri, ...data }));
      window.location.href = data.connect_uri;
    } catch (err) {
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

  if (linked === null) return null;

  return (
    <div className="vault-status">
      <span className={`vault-dot ${linked ? "vault-dot--on" : "vault-dot--off"}`} />
      <span className="vault-label">CRM</span>
      {linked ? (
        <button
          className="vault-btn vault-btn--disconnect"
          onClick={handleDisconnect}
          disabled={busy}
          title="Revoke Token Vault connection"
        >
          {busy ? "…" : "Disconnect"}
        </button>
      ) : (
        <button
          className="vault-btn vault-btn--connect"
          onClick={handleConnect}
          disabled={busy}
          title="Link CRM via Token Vault"
        >
          {busy ? "…" : "Connect"}
        </button>
      )}
    </div>
  );
}
