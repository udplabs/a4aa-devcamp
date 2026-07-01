import { useState } from "react";

export function RestartLabButton() {
  const [state, setState] = useState("idle"); // idle | confirm | restarting

  async function handleRestart() {
    if (state === "idle") {
      setState("confirm");
      return;
    }
    setState("restarting");
    try {
      await fetch("/api/setup/restart", { method: "POST" });
    } catch {
      // Best effort — clear and reload regardless
    }
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  }

  return (
    <div className="restart-lab-fab">
      {state === "confirm" && (
        <div className="restart-lab-confirm">
          <span>
            This deletes every Auth0 resource provisioned for this demo
            (APIs, clients, the CRM connection) and resets your lab progress.
            This cannot be undone.
          </span>
          <button className="restart-lab-confirm-yes" onClick={handleRestart}>
            Yes, delete resources &amp; reset
          </button>
          <button className="restart-lab-confirm-no" onClick={() => setState("idle")}>
            Cancel
          </button>
        </div>
      )}
      <button
        className={`restart-lab-btn${state === "restarting" ? " restarting" : ""}`}
        onClick={state === "restarting" ? undefined : handleRestart}
        title="Reset Lab (deletes provisioned Auth0 resources)"
        disabled={state === "restarting"}
      >
        {state === "restarting" ? (
          <span className="spinner-sm" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        )}
      </button>
    </div>
  );
}
