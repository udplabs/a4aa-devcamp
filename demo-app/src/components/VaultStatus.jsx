import { useState, useEffect, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";

export function VaultStatus() {
  const { getAccessTokenSilently } = useAuth0();
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

  async function handleConnect() {
    setBusy(true);
    try {
      const token = await getAccessTokenSilently();
      await fetch("/api/vault/link", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "crm" }),
      });
      setLinked(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      const token = await getAccessTokenSilently();
      await fetch("/api/vault/unlink", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "crm" }),
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
