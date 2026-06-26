import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";

async function deleteResources() {
  const res = await fetch("/api/setup/deprovision", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Deprovision failed");
}

export function LoginScreen() {
  const { loginWithRedirect, isLoading } = useAuth0();
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

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Nexus</h1>
        <p>Your company knowledge, secured by identity.</p>
        <p className="login-subtitle">
          Authentication is handled by Auth0, with actions enforced through FGA for authorization, Token Vault for credential management, CIBA for out-of-band approval, and an Auth0-secured MCP server for AI agent orchestration.
        </p>
        <button
          className="login-button"
          onClick={() => loginWithRedirect()}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Log In"}
        </button>
        <p className="login-disclaimer">
          Fictitious application for the Auth0 dev&#123;camp&#125; Agentic AI workshop only.
        </p>
        <div className="login-delete-area">
          {deleteState === "done" && (
            <p className="delete-done-text">Resources deleted. Restart to re-provision.</p>
          )}
          {deleteState === "error" && (
            <p className="delete-error-text">{deleteError}</p>
          )}
          {deleteState === "confirm" && (
            <span className="delete-confirm-text">Delete all Auth0 resources?</span>
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
              className="delete-cancel-button"
              onClick={() => setDeleteState("idle")}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
