import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Auth0Provider } from "./auth/Auth0Provider";
import { RuntimeConfigProvider } from "./config/runtimeConfig";
import App from "./App";
import { SetupBanner } from "./components/SetupBanner";
import { ProvisionPanel } from "./components/ProvisionPanel";
import { Module01Panel } from "./components/Module01Panel";
import { RestartLabButton } from "./components/RestartLabButton";
import "./styles/index.css";
import "./styles/lab-guide.css";

// Gate that renders the appropriate setup UI when the app is not yet
// configured or provisioned. Only mounts RuntimeConfigProvider and
// Auth0Provider once both flags are true, avoiding SDK errors from
// empty domain/clientId values.
function ConfigGate({ children }) {
  const [setupStatus, setSetupStatus] = useState(null);

  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then(setSetupStatus)
      .catch(() => setSetupStatus({ hasBaseConfig: false, isProvisioned: false, hasMCPConfig: false }));
  }, []);

  if (!setupStatus) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!setupStatus.hasBaseConfig) {
    return (
      <SetupBanner
        onReady={() => window.location.reload()}
      />
    );
  }

  if (!setupStatus.isProvisioned) {
    return (
      <ProvisionPanel
        onProvisioned={() => window.location.reload()}
      />
    );
  }

  if (!setupStatus.hasMCPConfig) {
    return (
      <Module01Panel
        onReady={() => window.location.reload()}
      />
    );
  }

  return children;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfigGate>
      <RuntimeConfigProvider>
        <Auth0Provider>
          <App />
        </Auth0Provider>
      </RuntimeConfigProvider>
    </ConfigGate>
    <RestartLabButton />
  </React.StrictMode>
);
