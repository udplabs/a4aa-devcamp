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
  const [copied, setCopied] = useState(false);
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          complete the Dashboard steps in <strong>Module 01</strong> of your lab guide.
        </p>

        <div className="setup-resource-list">
          <span className="setup-resource-pill">Part B: CIMD Identity</span>
          <span className="setup-resource-pill">Part C: M2M Client</span>
        </div>

        <ul className="module01-steps">
          <li>
            <strong>Register the CIMD identity</strong>
            <ul>
              <li>
                In your Codespace, open the <strong>PORTS</strong> tab → find port <strong>3001</strong> → right-click → <strong>Port Visibility → Public</strong>
                <br />
                <span style={{ fontSize: "12px", color: "#6E5A8A" }}>
                  Auth0 needs to reach the metadata URL to register the agent. The port must be public before the next step.
                </span>
              </li>
              <li>Auth0 Dashboard → <strong>Applications → Applications → Create Application</strong></li>
              <li>Select <strong>Import from URL</strong></li>
              <li>
                Paste your agent's metadata URL and click <strong>Preview</strong>:
                <div className="setup-code-block" style={{ marginTop: "8px" }}>
                  <code>{cimdUrl}</code>
                  <button className="setup-copy-btn" onClick={copyCimdUrl}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </li>
              <li>Click <strong>Create</strong></li>
            </ul>
          </li>
          <li>
            <strong>Create the M2M client for OBO exchange</strong>
            <ul>
              <li>Auth0 Dashboard → <strong>APIs → devcamp-mcp-server → Applications tab</strong></li>
              <li>Click <strong>Create &amp; Authorize New Application</strong> → Custom API Client</li>
              <li>Name it <code>docagent-mcp-m2m</code> and authorize all four <code>mcp:*</code> scopes</li>
              <li>Open the new application → scroll to <strong>Token Exchange</strong></li>
              <li>Enable <strong>On-Behalf-Of Token Exchange</strong> → <strong>Save</strong></li>
            </ul>
          </li>
          <li>
            <strong>Add credentials to <code>.env</code></strong>
            <ul>
              <li>Copy the client ID and secret from the application settings</li>
              <li>
                Add to <code>demo-app/.env</code>:
                <div className="setup-code-block" style={{ marginTop: "8px" }}>
                  <code>
                    AUTH0_CLIENT_ID_M2M=&lt;client-id&gt;{"\n"}
                    AUTH0_CLIENT_SECRET_M2M=&lt;client-secret&gt;
                  </code>
                </div>
              </li>
            </ul>
          </li>
          <li>
            <strong>Restart the app</strong>
            <ul>
              <li>Stop the app (<code>Ctrl+C</code>) and run <code>npm run dev</code></li>
              <li>This screen advances automatically once the credentials are detected</li>
            </ul>
          </li>
        </ul>

        <p className="setup-waiting">
          <span className="spinner-sm" /> Waiting for MCP credentials…
        </p>
      </div>
    </div>
  );
}
