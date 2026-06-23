import { useEffect, useState } from "react";

const VARS = [
  { key: "AUTH0_DOMAIN", label: "Auth0 tenant domain", hint: "e.g. your-tenant.auth0.com" },
  { key: "AUTH0_MGMT_CLIENT_ID", label: "Management API client ID", hint: "from Launch Pad" },
  { key: "AUTH0_MGMT_CLIENT_SECRET", label: "Management API client secret", hint: "from Launch Pad" },
];

export function SetupBanner({ onReady }) {
  const [copied, setCopied] = useState(null);

  // Poll /api/setup/status every 3 s; dismiss when hasBaseConfig flips true.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/setup/status");
        const data = await res.json();
        if (data.hasBaseConfig) {
          clearInterval(id);
          onReady();
        }
      } catch {
        /* server may be restarting */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [onReady]);

  function copySnippet() {
    const snippet = VARS.map((v) => `${v.key}=`).join("\n");
    navigator.clipboard.writeText(snippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-header">
          <span className="setup-dot" />
          <h2 className="setup-title">Nexus: Environment Setup</h2>
        </div>

        <p className="setup-desc">
          Add the following variables to your <code>.env</code> file in the Codespace terminal,
          then reload this page. You can find these values in the <strong>Launch Pad</strong>.
        </p>

        <div className="setup-env-block">
          {VARS.map((v) => (
            <div key={v.key} className="setup-env-row">
              <span className="setup-env-key">{v.key}</span>
              <span className="setup-env-eq">=</span>
              <span className="setup-env-hint">{v.hint}</span>
            </div>
          ))}
        </div>

        <p className="setup-terminal-hint">
          In the Codespace terminal:
        </p>
        <div className="setup-code-block">
          <code>
            {VARS.map((v) => `${v.key}=YOUR_VALUE`).join("\n")}
          </code>
          <button className="setup-copy-btn" onClick={copySnippet}>
            {copied ? "Copied" : "Copy keys"}
          </button>
        </div>

        <p className="setup-waiting">
          <span className="spinner-sm" /> Waiting for environment variables…
        </p>
      </div>
    </div>
  );
}
