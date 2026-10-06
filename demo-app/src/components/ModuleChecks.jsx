import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRuntimeConfig } from "../config/runtimeConfig";

// Run the verification checks for a given module.
// Returns { checks, allPassed } or throws.
async function runChecks(moduleId, { isAuthenticated, getAccessTokenSilently, getIdTokenClaims, audience }) {
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
      const r = await fetch("/api/verify/module02");
      return await r.json();
    }

    case "03": {
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
          // The SPA requested this token for the Nexus backend audience
          // above (`audience`), not the MCP server audience -- that one is
          // only ever seen server-side, after the OBO exchange in Module 05.
          const hasAud = Array.isArray(payload.aud)
            ? payload.aud.includes(audience)
            : payload.aud === audience;
          checks.push({ id: "jwt_aud", name: "JWT contains Nexus API audience",
            pass: !!hasAud, message: hasAud ? `aud: ${JSON.stringify(payload.aud)}` : "Audience missing — check SPA configuration" });
          const hasScope = payload.scope?.includes("chat:send");
          checks.push({ id: "jwt_scope", name: "JWT contains chat:send scope",
            pass: !!hasScope, message: hasScope ? "scope includes chat:send" : "chat:send scope missing" });

          const idToken = await getIdTokenClaims();
          const amr = idToken?.amr || [];
          const hasMfa = amr.some((m) => ["mfa", "otp", "push", "guardian"].includes(m));
          checks.push({
            id: "mfa_enforced",
            name: "Guardian push MFA completed at login",
            pass: hasMfa,
            message: hasMfa
              ? `MFA verified (amr: ${JSON.stringify(amr)})`
              : "MFA not detected — log out and log back in to trigger the Guardian push enrollment",
          });
        } catch (e) {
          checks.push({ id: "jwt_aud", name: "JWT contains Nexus API audience", pass: false, message: e.message });
        }
      }

      // Backend check: Acme's consent flow and MCP-server-scoped token.
      const r03 = await fetch("/api/verify/module03");
      const d03 = await r03.json();
      checks.push(...d03.checks);

      return { checks };
    }

    case "04": {
      const r = await fetch("/api/verify/module04");
      return await r.json();
    }

    case "05": {
      const r = await fetch("/api/verify/module05");
      return await r.json();
    }

    case "06": {
      const r = await fetch("/api/verify/module06");
      return await r.json();
    }

    case "07": {
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
    { id: "b", label: "Alice has a direct editor tuple on document:q3-roadmap (alice editor document:q3-roadmap) — Bob has no tuple on that document" },
    { id: "c", label: "Alice's JWT contains mcp:docs:read; Bob's token is missing that scope" },
    { id: "d", label: "Alice is listed as owner in the FGA model definition; Bob is not" },
  ],
  correct: "b",
};

function FGAQuiz({ onPass, passed }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const correct = passed || (submitted && selected === FGA_QUIZ.correct);
  const wrong = !passed && submitted && selected !== FGA_QUIZ.correct;

  function handleSubmit() {
    setSubmitted(true);
    if (selected === FGA_QUIZ.correct) onPass();
  }

  return (
    <div className="module-checks">
      <div className="module-checks-header">
        <h3 className="module-checks-title">{correct ? "✓ Part B complete (FGA)" : "Part B knowledge check (FGA)"}</h3>
      </div>
      <p className="fga-quiz-hint">
        This part has no automated Run Checks step. Answer the question below and submit it to unlock the chat.
      </p>
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
      {correct && <p className="fga-quiz-feedback fga-quiz-feedback--correct">Correct. A direct editor relationship tuple is the key FGA concept in this module.</p>}
    </div>
  );
}

export function ModuleChecks({ moduleId, onComplete }) {
  const [state, setState] = useState("idle"); // idle | running | done
  const [checks, setChecks] = useState([]);
  const [allPassed, setAllPassed] = useState(false);
  const [quizPassed, setQuizPassed] = useState(false);
  const { isAuthenticated, getAccessTokenSilently, getIdTokenClaims } = useAuth0Safe();
  const { audience } = useRuntimeConfigSafe();

  // Module "05" (lab-guide/07-ciba-and-fga.md) merges two parts into one
  // checkable module: Part A (CIBA) has an automated backend check
  // (/api/verify/module05 below); Part B (FGA) is read-through only and
  // is gated by a knowledge-check quiz instead. The module is complete
  // only once both parts pass.
  const hasFgaQuiz = moduleId === "05";

  function maybeComplete(cibaOk, quizOk) {
    if (onComplete && cibaOk && quizOk) onComplete(moduleId);
  }

  async function handleRun() {
    setState("running");
    try {
      const result = await runChecks(moduleId, { isAuthenticated, getAccessTokenSilently, getIdTokenClaims, audience });
      const passed = result.checks.every((c) => c.pass);
      setChecks(result.checks);
      setAllPassed(passed);
      setState("done");
      if (hasFgaQuiz) {
        maybeComplete(passed, quizPassed);
      } else if (passed && onComplete) {
        onComplete(moduleId);
      }
    } catch (err) {
      setChecks([{ id: "error", name: "Check failed", pass: false, message: err.message }]);
      setAllPassed(false);
      setState("done");
    }
  }

  const moduleComplete = hasFgaQuiz ? allPassed && quizPassed : allPassed;

  return (
    <div className="module-checks">
      <div className="module-checks-header">
        <h3 className="module-checks-title">
          {moduleComplete ? "✓ Module complete" : hasFgaQuiz ? "Part A: Verify your setup (CIBA)" : "Verify your setup"}
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

      {state === "done" && allPassed && !hasFgaQuiz && (
        <p className="module-checks-success">
          All checks passed. This module is complete.
        </p>
      )}

      {hasFgaQuiz && (
        <FGAQuiz
          passed={quizPassed}
          onPass={() => {
            setQuizPassed(true);
            maybeComplete(allPassed, true);
          }}
        />
      )}
    </div>
  );
}
