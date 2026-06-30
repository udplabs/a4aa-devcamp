import { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRuntimeConfig } from "./config/runtimeConfig";
import { Chat } from "./components/Chat";
import { MCPStatus } from "./components/MCPStatus";
import { ToolLogs } from "./components/ToolLogs";
import { ToolTester } from "./components/ToolTester";
import { LoginScreen } from "./components/LoginScreen";
import { useLabProgress } from "./hooks/useLabProgress";
import { VaultStatus, CONNECTED_ACCOUNTS_SCOPE } from "./components/VaultStatus";

const TABS = [
  { id: "chat",   label: "Chat" },
  { id: "status", label: "MCP Status" },
  { id: "logs",   label: "Tool Logs" },
  { id: "tester", label: "Tool Tester" },
];

const LAB_MODULES = ["01", "02", "03", "04", "05"];

// Lab 01 -- useAuth0 gives us isAuthenticated, user, and logout.
// Auth0Provider (see src/auth/Auth0Provider.jsx) wraps this tree;
// domain/clientId/audience are fetched at runtime from /api/config
// so the same build works across every demo tenant.
export default function App() {
  const { isAuthenticated, isLoading, user, logout, getAccessTokenSilently, getIdTokenClaims } = useAuth0();
  const { audience, domain } = useRuntimeConfig();
  const [activeTab, setActiveTab] = useState("chat");
  const { getModuleStatus } = useLabProgress();

  const labComplete = LAB_MODULES.every((id) => getModuleStatus(id) === "pass");

  // Token Vault Connected Accounts flow lands back here with
  // `connect_code` in the URL fragment (no router in this app, so we
  // check it directly). Completes the link against our backend, then
  // reloads to drop the fragment and let VaultStatus re-fetch.
  useEffect(() => {
    if (!isAuthenticated) return;
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const connectCode = params.get("connect_code");
    if (!connectCode) return;

    (async () => {
      const stashed = JSON.parse(sessionStorage.getItem("vault_connect_state") || "{}");
      try {
        const [apiToken, caToken] = await Promise.all([
          getAccessTokenSilently(),
          getAccessTokenSilently({
            authorizationParams: {
              audience: `https://${domain}/me/`,
              scope: CONNECTED_ACCOUNTS_SCOPE,
            },
          }),
        ]);
        await fetch("/api/vault/connect/complete", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "X-Connected-Accounts-Token": caToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            connect_code: connectCode,
            auth_session: params.get("auth_session") || stashed.auth_session,
            redirect_uri: stashed.redirectUri,
          }),
        });
      } catch (err) {
        console.error("[Vault] Connect completion failed:", err.message);
      } finally {
        sessionStorage.removeItem("vault_connect_state");
        window.location.href = window.location.origin + "/";
      }
    })();
  }, [isAuthenticated, getAccessTokenSilently, domain]);

  // Expose auth state + audience to window so ProgressTracker (mounted outside
  // Auth0Provider / RuntimeConfigProvider) can run Module 02 checks correctly.
  useEffect(() => {
    window.__nexusAuth = isAuthenticated
      ? { isAuthenticated: true, getAccessTokenSilently, getIdTokenClaims, audience }
      : { isAuthenticated: false, getAccessTokenSilently: null, getIdTokenClaims: null, audience };
    return () => { window.__nexusAuth = null; };
  }, [isAuthenticated, getAccessTokenSilently, getIdTokenClaims, audience]);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Nexus</h1>
        <div className="user-info">
          <VaultStatus />
          <span>{user?.name}</span>
          <button
            className="logout-button"
            onClick={() =>
              logout({ logoutParams: { returnTo: window.location.origin } })
            }
          >
            Log Out
          </button>
        </div>
      </header>

      {!labComplete ? (
        <div className="lab-locked">
          <div className="lab-locked-card">
            <h2 className="lab-locked-title">Workshop in Progress</h2>
            <p className="lab-locked-desc">
              Complete and verify Modules 01–05 using the <strong>Lab Progress</strong> panel to unlock the Nexus demo.
            </p>
            <div className="lab-locked-modules">
              {LAB_MODULES.map((id) => {
                const status = getModuleStatus(id);
                return (
                  <span key={id} className={`lab-locked-pill lab-locked-pill--${status}`}>
                    {status === "pass" ? "✓" : "○"} Module {id}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <>
          <nav className="app-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`app-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === "chat"   && <Chat />}
          {activeTab === "status" && <MCPStatus />}
          {activeTab === "logs"   && <ToolLogs />}
          {activeTab === "tester" && <ToolTester />}
        </>
      )}

      <footer className="app-footer">
        Nexus is a fictitious application created solely for educational purposes as part of the Auth0 dev&#123;camp&#125; Agentic AI workshop. Not a real product.
      </footer>
    </div>
  );
}
