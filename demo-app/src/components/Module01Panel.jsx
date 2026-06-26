import { useEffect } from "react";

export function Module01Panel({ onReady }) {
  // Poll /api/setup/status every 3 s. When hasMCPConfig flips true
  // (participant added AUTH0_CLIENT_ID_M2M + AUTH0_CLIENT_SECRET_M2M
  // to .env and restarted), advance to the login screen.
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

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-header">
          <span className="setup-dot setup-dot--amber" />
          <h2 className="setup-title">Nexus: Complete Module 01</h2>
        </div>

        <p className="setup-desc">
          Resources are provisioned. Before you can log in and use Nexus,
          complete the two Dashboard steps in <strong>Module 01</strong> of your lab guide.
        </p>

        <div className="setup-resource-list">
          <span className="setup-resource-pill">Part B: CIMD Identity</span>
          <span className="setup-resource-pill">Part C: M2M Client</span>
        </div>

        <ol className="module01-steps">
          <li>
            <strong>Register the CIMD identity</strong> — Auth0 Dashboard →
            Applications → Create Application → Import from URL → paste your
            MCP server's <code>/.well-known/client-metadata</code> URL.
          </li>
          <li>
            <strong>Create the M2M client</strong> — Auth0 Dashboard →
            APIs → <code>devcamp-mcp-server</code> → Applications →
            Create &amp; Authorize New Application (Custom API Client) with all
            four <code>mcp:*</code> scopes. Then enable <strong>On-Behalf-Of
            Token Exchange</strong> in the application's Token Exchange settings.
          </li>
          <li>
            <strong>Add credentials to <code>.env</code></strong> — copy the
            M2M client ID and secret into <code>demo-app/.env</code>:
            <div className="setup-code-block" style={{ marginTop: "0.5rem" }}>
              <code>
                AUTH0_CLIENT_ID_M2M=&lt;client-id&gt;{"\n"}
                AUTH0_CLIENT_SECRET_M2M=&lt;client-secret&gt;
              </code>
            </div>
          </li>
          <li>
            <strong>Restart the app</strong> — run <code>npm run dev</code> in
            the terminal. This screen will advance automatically once the
            credentials are detected.
          </li>
        </ol>

        <p className="setup-waiting">
          <span className="spinner-sm" /> Waiting for MCP credentials…
        </p>
      </div>
    </div>
  );
}
