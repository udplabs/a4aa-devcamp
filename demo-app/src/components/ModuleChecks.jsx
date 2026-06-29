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
          const token = await getAccessTokenSilently({ authorizationParams: { audience, scope: "chat:send" } });
          const [, payloadB64] = token.split(".");
          const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
          const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
          const payload = JSON.parse(atob(padded));
          const hasAud = Array.isArray(payload.aud)
            ? payload.aud.some((a) => a.includes("devcamp-mcp-server"))
            : payload.aud?.includes("devcamp-mcp-server");
          checks.push({ id: "jwt_aud", name: "JWT contains Nexus MCP audience",
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

    case "05":
      // Quiz handled inline — runChecks is not called for this module.
      return { checks: [] };

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

// Safe wrappers — ProgressTracker is mounted outside Auth0Provider in main.jsx.
// useAuth0() does NOT throw outside its provider; it returns the default context
// with isAuthenticated: false. We merge window.__nexusAuth (set by App.jsx) so
// checks still see real auth state when the user is logged in.
function useAuth0Safe() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ctx = useAuth0();
  const windowAuth = window.__nexusAuth;
  if (windowAuth?.isAuthenticated && !ctx.isAuthenticated) {
    return windowAuth;
  }
  return ctx;
}

function useRuntimeConfigSafe() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRuntimeConfig();
  } catch {
    return { audience: window.__nexusAuth?.audience || "" };
  }
}

const FGA_QUIZ = {
  question: "Why can Alice read the Q3 Roadmap but Bob cannot?",
  options: [
    { id: "a", label: "Alice has the 'engineer' role in Auth0 RBAC; Bob has 'employee' only" },
    { id: "b", label: "Alice is a member of department:engineering, which has viewer on document:q3-roadmap — Bob has no department membership" },
    { id: "c", label: "Alice's JWT contains mcp:docs:read; Bob's token is missing that scope" },
    { id: "d", label: "Alice is listed as owner in the FGA model definition; Bob is not" },
  ],
  correct: "b",
};

function FGAQuiz({ onPass }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const correct = submitted && selected === FGA_QUIZ.correct;
  const wrong = submitted && selected !== FGA_QUIZ.correct;

  function handleSubmit() {
    setSubmitted(true);
    if (selected === FGA_QUIZ.correct) onPass();
  }

  return (
    <div className="module-checks">
      <div className="module-checks-header">
        <h3 className="module-checks-title">{correct ? "✓ Module complete" : "Verify your setup"}</h3>
      </div>
      <p className="fga-quiz-question">{FGA_QUIZ.question}</p>
      <ul className="fga-quiz-options">
        {FGA_QUIZ.options.map((opt) => (
          <li key={opt.id}>
            <label className={`fga-quiz-option${submitted && opt.id === FGA_QUIZ.correct ? " correct" : ""}${submitted && selected === opt.id && opt.id !== FGA_QUIZ.correct ? " wrong" : ""}`}>
              <input
                type="radio"
                name="fga-quiz"
                value={opt.id}
                disabled={correct}
                checked={selected === opt.id}
                onChange={() => { setSelected(opt.id); setSubmitted(false); }}
              />
              {opt.label}
            </label>
          </li>
        ))}
      </ul>
      {!correct && (
        <button
          className="module-checks-run-btn"
          disabled={!selected}
          onClick={handleSubmit}
        >
          Submit
        </button>
      )}
      {wrong && <p className="fga-quiz-feedback fga-quiz-feedback--wrong">Incorrect — review the authorization model and try again.</p>}
      {correct && <p className="fga-quiz-feedback fga-quiz-feedback--correct">Correct. Department-membership inheritance is the key FGA concept in this module.</p>}
    </div>
  );
}

export function ModuleChecks({ moduleId, onComplete }) {
  const [state, setState] = useState("idle"); // idle | running | done
  const [checks, setChecks] = useState([]);
  const [allPassed, setAllPassed] = useState(false);
  const { isAuthenticated, getAccessTokenSilently } = useAuth0Safe();
  const { audience } = useRuntimeConfigSafe();

  if (moduleId === "05") {
    return <FGAQuiz onPass={() => { if (onComplete) onComplete("05"); }} />;
  }

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
