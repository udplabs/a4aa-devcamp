import { useEffect, useState } from "react";

function deriveCimdUrl() {
  const origin = window.location.origin;
  // GitHub Codespace: swap the frontend port for the MCP server port (3001)
  if (origin.includes(".app.github.dev")) {
    return origin.replace(/-\d+(\.app\.github\.dev)/, "-3001$1") + "/.well-known/client-metadata";
  }
  // Local dev: replace whatever port Vite is on with 3001
  const mcpOrigin = origin.replace(/:\d+$/, ":3001");
  return mcpOrigin + "/.well-known/client-metadata";
}

export function Module01Panel({ onReady }) {
  const [copiedCimd, setCopiedCimd] = useState(false);
  const cimdUrl = deriveCimdUrl();

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

  function copyCimdUrl() {
    navigator.clipboard.writeText(cimdUrl).catch(() => {});
    setCopiedCimd(true);
    setTimeout(() => setCopiedCimd(false), 2000);
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
          follow <strong>Module 01</strong> (Parts B &amp; C) in your Lab Guide to register the
          agent's CIMD identity and create the M2M client for OBO token exchange.
        </p>

        <div className="setup-resource-list">
          <span className="setup-resource-pill">Part B: CIMD Identity</span>
          <span className="setup-resource-pill">Part C: M2M Client</span>
        </div>

        <p className="setup-terminal-hint">
          Your agent's CIMD metadata URL (generated for your Codespace):
        </p>
        <div className="setup-code-block">
          <code>{cimdUrl}</code>
          <button className="setup-copy-btn" onClick={copyCimdUrl}>
            {copiedCimd ? "Copied" : "Copy"}
          </button>
        </div>

        <p className="setup-waiting">
          <span className="spinner-sm" /> Waiting for MCP credentials…
        </p>
      </div>
    </div>
  );
}
