import { useState, useEffect } from "react";

const STEPS = [
  "Creating backend API resource server",
  "Creating MCP API resource server",
  "Creating M2M client (OBO)",
  "Creating SPA client",
  "Creating CIBA client",
  "Creating CRM OAuth2 connection",
  "Writing .env and restarting",
];

export function ProvisionPanel({ onProvisioned }) {
  const [status, setStatus] = useState("idle"); // idle | running | success | error
  const [stepIndex, setStepIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);

  // Simulate step progress while provision is running (real work is server-side).
  useEffect(() => {
    if (status !== "running") return;
    if (stepIndex >= STEPS.length - 1) return;
    const t = setTimeout(() => setStepIndex((i) => i + 1), 1400);
    return () => clearTimeout(t);
  }, [status, stepIndex]);

  // After success, poll /api/setup/status until isProvisioned flips, then
  // call onProvisioned so the ConfigGate can re-render the full app.
  useEffect(() => {
    if (status !== "success") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/setup/status");
        const data = await res.json();
        if (data.isProvisioned) {
          clearInterval(id);
          onProvisioned();
        }
      } catch {
        /* server may be restarting */
      }
    }, 2000);
    return () => clearInterval(id);
  }, [status, onProvisioned]);

  async function provision() {
    setStatus("running");
    setStepIndex(0);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/setup/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appUrl: window.location.origin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStepIndex(STEPS.length - 1);
      setStatus("success");
    } catch (err) {
      setErrorMsg(err.message);
      setStatus("error");
    }
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-header">
          <span className="setup-dot setup-dot--amber" />
          <h2 className="setup-title">Nexus: Provision Auth0 Resources</h2>
        </div>

        {status === "idle" && (
          <>
            <p className="setup-desc">
              Your environment is configured. Click below to create the Auth0 applications,
              APIs, and connections that Nexus needs. This takes about 10 seconds.
            </p>
            <div className="setup-resource-list">
              <span className="setup-resource-pill">Backend API</span>
              <span className="setup-resource-pill">MCP API</span>
              <span className="setup-resource-pill">M2M Client (OBO)</span>
              <span className="setup-resource-pill">SPA Client</span>
              <span className="setup-resource-pill">CIBA Client</span>
              <span className="setup-resource-pill">CRM Connection</span>
            </div>
            <button className="setup-provision-btn" onClick={provision}>
              Provision Resources
            </button>
          </>
        )}

        {status === "running" && (
          <div className="setup-progress">
            {STEPS.map((step, i) => (
              <div
                key={step}
                className={`setup-step ${i < stepIndex ? "done" : i === stepIndex ? "active" : "pending"}`}
              >
                <span className="setup-step-icon">
                  {i < stepIndex ? "✓" : i === stepIndex ? <span className="spinner-sm" /> : "·"}
                </span>
                <span className="setup-step-label">{step}</span>
              </div>
            ))}
          </div>
        )}

        {status === "success" && (
          <div className="setup-success">
            <p className="setup-success-msg">
              Resources provisioned successfully. The server is restarting, and the app will reload automatically once initialization completes.
            </p>
            <div className="spinner" />
          </div>
        )}

        {status === "error" && (
          <div className="setup-error">
            <p className="setup-error-msg">Provisioning failed: {errorMsg}</p>
            <p className="setup-error-hint">
              Verify that your management credentials are valid and your Auth0 tenant is active, then try again.
            </p>
            <button className="setup-provision-btn" onClick={provision}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
