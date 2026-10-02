import { useEffect, useState } from "react";

// Must match AGENT_NAME in server/platform/provision.js exactly -- the
// backend verifier looks up the agent record by this display name.
const AGENT_NAME = "Nexus Agent (DevCamp)";

export function Module01Panel({ onReady }) {
  const [copiedAgentName, setCopiedAgentName] = useState(false);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/setup/status");
        const data = await res.json();
        if (data.hasMCPConfig) {
          clearInterval(id);
          onReady();
        }
      } catch {
        /* server may be restarting */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [onReady]);

  function copyAgentName() {
    navigator.clipboard.writeText(AGENT_NAME).catch(() => {});
    setCopiedAgentName(true);
    setTimeout(() => setCopiedAgentName(false), 2000);
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-header">
          <span className="setup-dot setup-dot--amber" />
          <h2 className="setup-title">Nexus: Complete Module 01</h2>
        </div>

        <p className="setup-desc">
          Resources are provisioned. Before you can log in and use Nexus,
          follow <strong>One trust boundary for every agent</strong> (Parts A &amp; B) in your Lab Guide to register the
          agent's identity (Agent as Principal) and create the Custom API client for OBO token exchange.
        </p>

        <div className="setup-resource-list">
          <span className="setup-resource-pill">Part A: Agent Identity</span>
          <span className="setup-resource-pill">Part B: OBO Custom API Client</span>
        </div>

        <p className="setup-terminal-hint">
          Use this exact name when creating the agent in Dashboard → Agents:
        </p>
        <div className="setup-code-block">
          <code>{AGENT_NAME}</code>
          <button className="setup-copy-btn" onClick={copyAgentName}>
            {copiedAgentName ? "Copied" : "Copy"}
          </button>
        </div>

        <p className="setup-waiting">
          <span className="spinner-sm" /> Waiting for MCP credentials…
        </p>
      </div>
    </div>
  );
}
