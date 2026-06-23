import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { Chat } from "./components/Chat";
import { MCPStatus } from "./components/MCPStatus";
import { ToolLogs } from "./components/ToolLogs";
import { ToolTester } from "./components/ToolTester";
import { LoginScreen } from "./components/LoginScreen";

const TABS = [
  { id: "chat",   label: "Chat" },
  { id: "status", label: "MCP Status" },
  { id: "logs",   label: "Tool Logs" },
  { id: "tester", label: "Tool Tester" },
];

// Lab 01 -- useAuth0 gives us isAuthenticated, user, and logout.
// Auth0Provider (see src/auth/Auth0Provider.jsx) wraps this tree;
// domain/clientId/audience are fetched at runtime from /api/config
// so the same build works across every demo tenant.
async function deleteResources() {
  const res = await fetch("/api/setup/deprovision", { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Deprovision failed");
  }
}

export default function App() {
  const { isAuthenticated, isLoading, user, logout } = useAuth0();
  const [activeTab, setActiveTab] = useState("chat");
  const [deleteState, setDeleteState] = useState("idle"); // idle | confirm | deleting | done | error
  const [deleteError, setDeleteError] = useState(null);

  async function handleDelete() {
    if (deleteState === "idle") {
      setDeleteState("confirm");
      return;
    }
    if (deleteState === "confirm") {
      setDeleteState("deleting");
      try {
        await deleteResources();
        setDeleteState("done");
      } catch (err) {
        setDeleteError(err.message);
        setDeleteState("error");
      }
    }
  }

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  // Lab 01 -- unauthenticated users land on the login screen.
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Nexus</h1>
        <div className="user-info">
          <span>{user?.name}</span>
          {deleteState === "confirm" && (
            <span className="delete-confirm-text">Delete all Auth0 resources?</span>
          )}
          {deleteState === "error" && (
            <span className="delete-error-text">{deleteError}</span>
          )}
          {deleteState === "done" && (
            <span className="delete-done-text">Resources deleted. Restart to re-provision.</span>
          )}
          {(deleteState === "idle" || deleteState === "confirm" || deleteState === "error") && (
            <button
              className={`delete-resources-button${deleteState === "confirm" ? " confirming" : ""}`}
              onClick={handleDelete}
              disabled={deleteState === "deleting"}
            >
              {deleteState === "confirm" ? "Confirm Delete" : "Delete Resources"}
            </button>
          )}
          {deleteState === "confirm" && (
            <button
              className="cancel-delete-button"
              onClick={() => setDeleteState("idle")}
            >
              Cancel
            </button>
          )}
          {deleteState === "deleting" && (
            <button className="delete-resources-button" disabled>
              Deleting…
            </button>
          )}
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

      <footer className="app-footer">
        Nexus is a fictitious application created solely for educational purposes as part of the Auth0 dev&#123;camp&#125; Agentic AI workshop. Not a real product.
      </footer>
    </div>
  );
}
