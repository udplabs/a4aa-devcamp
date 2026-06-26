import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRuntimeConfig } from "../config/runtimeConfig";

// Run the verification checks for a given module.
// Returns { checks, allPassed } or throws.
async function runChecks(moduleId, { isAuthenticated, getAccessTokenSilently, audience }) {
  switch (moduleId) {
    case "00": {
      const r = await fetch("/api/setup/status");
      const d = await r.json();
      return {
        checks: [
          { id: "provisioned", name: "Auth0 resources provisioned", pass: !!d.isProvisioned,
            message: d.isProvisioned ? "Resources provisioned" : "Click Provision Resources to set up Auth0" },
        ],
      };
    }

    case "01": {
      const r = await fetch("/api/verify/module01");
      return await r.json();
    }

    case "02": {
      const checks = [];
      checks.push({
        id: "authenticated", name: "User is authenticated",
        pass: isAuthenticated,
        message: isAuthenticated ? "Logged in" : "Log in using the Log In button",
      });
      if (isAuthenticated) {
        try {
          const token = await getAccessTokenSilently({ authorizationParams: { audience } });
          const [, payloadB64] = token.split(".");
          const payload = JSON.parse(atob(payloadB64));
          const hasAud = Array.isArray(payload.aud)
            ? payload.aud.some((a) => a.includes("docagent"))
            : payload.aud?.includes("docagent");
          checks.push({ id: "jwt_aud", name: "JWT contains Nexus API audience",
            pass: !!hasAud, message: hasAud ? `aud: ${JSON.stringify(payload.aud)}` : "Audience missing — check SPA configuration" });
          const hasScope = payload.scope?.includes("chat:send");
          checks.push({ id: "jwt_scope", name: "JWT contains chat:send scope",
            pass: !!hasScope, message: hasScope ? "scope includes chat:send" : "chat:send scope missing" });
        } catch (e) {
          checks.push({ id: "jwt_aud", name: "JWT contains Nexus API audience", pass: false, message: e.message });
        }
      }
      return { checks };
    }

    case "03": {
      const r = await fetch("/api/verify/module03");
      return await r.json();
    }

    case "04": {
      const r = await fetch("/api/verify/module04");
      return await r.json();
    }

    case "05": {
      return {
        checks: [
          { id: "observed", name: "FGA demo observed", pass: true,
            message: "Mark as complete when you have run through the demo scenarios" },
        ],
      };
    }

    case "06": {
      return {
        checks: [
          { id: "completed", name: "End-to-end flow completed", pass: true,
            message: "Mark as complete once you have run the full scenario from login to document share" },
        ],
      };
    }

    default:
      return { checks: [] };
  }
}

// Safe wrappers — these hooks throw when called outside their provider trees
// (e.g. when ProgressTracker is mounted outside ConfigGate during Module01Panel).
// Fall back to window.__nexusAuth, which App.jsx populates once the user logs in.
function useAuth0Safe() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAuth0();
  } catch {
    return window.__nexusAuth || { isAuthenticated: false, getAccessTokenSilently: null };
  }
}

function useRuntimeConfigSafe() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRuntimeConfig();
  } catch {
    return { audience: "" };
  }
}

export function ModuleChecks({ moduleId, onComplete }) {
  const [state, setState] = useState("idle"); // idle | running | done
  const [checks, setChecks] = useState([]);
  const [allPassed, setAllPassed] = useState(false);
  const { isAuthenticated, getAccessTokenSilently } = useAuth0Safe();
  const { audience } = useRuntimeConfigSafe();

  async function handleRun() {
    setState("running");
    try {
      const result = await runChecks(moduleId, { isAuthenticated, getAccessTokenSilently, audience });
      const passed = result.checks.every((c) => c.pass);
      setChecks(result.checks);
      setAllPassed(passed);
      setState("done");
      if (passed && onComplete) onComplete(moduleId);
    } catch (err) {
      setChecks([{ id: "error", name: "Check failed", pass: false, message: err.message }]);
      setAllPassed(false);
      setState("done");
    }
  }

  return (
    <div className="module-checks">
      <div className="module-checks-header">
        <h3 className="module-checks-title">
          {allPassed ? "✓ Module complete" : "Verify your setup"}
        </h3>
        {state !== "running" && (
          <button
            className={`module-checks-run-btn${allPassed ? " passed" : ""}`}
            onClick={handleRun}
          >
            {state === "idle" ? "Run checks" : allPassed ? "Re-run" : "Re-run checks"}
          </button>
        )}
        {state === "running" && (
          <span className="module-checks-running">
            <span className="spinner-sm" /> Running…
          </span>
        )}
      </div>

      {checks.length > 0 && (
        <ul className="module-checks-list">
          {checks.map((c) => (
            <li key={c.id} className={`module-check-item ${c.pass ? "pass" : "fail"}`}>
              <span className="module-check-icon">{c.pass ? "✓" : "✗"}</span>
              <span className="module-check-name">{c.name}</span>
              <span className="module-check-msg">{c.message}</span>
            </li>
          ))}
        </ul>
      )}

      {state === "done" && allPassed && (
        <p className="module-checks-success">
          All checks passed. This module is complete.
        </p>
      )}
    </div>
  );
}
