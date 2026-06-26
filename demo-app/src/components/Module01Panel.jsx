import { useEffect, useState } from "react";

const OBO_CREDS_SNIPPET = "AUTH0_OBO_CLIENT_ID=\nAUTH0_OBO_CLIENT_SECRET=";

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
  const [copiedCreds, setCopiedCreds] = useState(false);
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

  function copyCreds() {
    navigator.clipboard.writeText(OBO_CREDS_SNIPPET).catch(() => {});
    setCopiedCreds(true);
    setTimeout(() => setCopiedCreds(false), 2000);
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
                    {copiedCimd ? "Copied" : "Copy"}
                  </button>
                </div>
              </li>
              <li>Click <strong>Create</strong></li>
            </ul>
          </li>
          <li>
            <strong>Create the M2M client for OBO exchange</strong>
            <ul>
              <li>Auth0 Dashboard → <strong>APIs → Nexus MCP Server → Applications tab</strong></li>
              <li>Click <strong>Add Application</strong></li>
              <li>Name it <code>docagent-mcp-obo</code> and enable <strong>user-delegated access</strong> for all four <code>mcp:*</code> scopes</li>
              <li>Open the new application → scroll to <strong>Token Exchange</strong></li>
              <li>Enable <strong>On-Behalf-Of Token Exchange</strong> → <strong>Save</strong></li>
            </ul>
          </li>
          <li>
            <strong>Add credentials to <code>.env</code></strong>
            <ul>
              <li>Copy the Client ID and Client Secret from the application settings</li>
              <li>
                Add these keys to <code>demo-app/.env</code> and fill in the values:
                <div className="setup-code-block" style={{ marginTop: "8px" }}>
                  <code>{OBO_CREDS_SNIPPET}</code>
                  <button className="setup-copy-btn" onClick={copyCreds}>
                    {copiedCreds ? "Copied" : "Copy keys"}
                  </button>
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
