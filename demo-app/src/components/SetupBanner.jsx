import { useEffect, useState } from "react";

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
          It looks like your environment variables are not set up yet. See <strong>Module 01: Prerequisites</strong>, 
          Step 1 in your Lab Guide for where to find these values. Paste them into <code>demo-app/.env</code>:
        </p>

        <p className="setup-waiting">
          <span className="spinner-sm" /> Waiting for environment variables…
        </p>
      </div>
    </div>
  );
}
