import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Lab step definitions
// ---------------------------------------------------------------------------

interface Step {
  id: string;
  title: string;
  hint: string;
  check: "frontend" | "backend";
  backendKey?: string; // key in /api/lab-status response
}

interface Lab {
  id: number;
  title: string;
  steps: Step[];
}

const LABS: Lab[] = [
  {
    id: 1,
    title: "Chat UI + User Auth",
    steps: [
      {
        id: "1.1",
        title: "Auth0Provider configured",
        hint: "Open `src/auth/Auth0Provider.tsx` — replace the passthrough with the real Auth0Provider from `@auth0/auth0-react`",
        check: "frontend",
      },
      {
        id: "1.2",
        title: "main.tsx wraps App with Auth0Provider",
        hint: "Open `src/main.tsx` — wrap `<App />` with `<Auth0Provider>`",
        check: "frontend",
      },
      {
        id: "1.3",
        title: "LoginScreen functional",
        hint: "Open `src/components/LoginScreen.tsx` — use `useAuth0()` hook and call `loginWithRedirect()`",
        check: "frontend",
      },
      {
        id: "1.4",
        title: "Chat gated behind authentication",
        hint: "Open `src/App.tsx` — check `isAuthenticated` from `useAuth0()` before rendering `<Chat />`",
        check: "frontend",
      },
    ],
  },
  {
    id: 2,
    title: "Protected LLM API",
    steps: [
      {
        id: "2.1",
        title: "JWT middleware active",
        hint: "Open `server/middleware/auth.ts` — replace placeholder with `auth()` from `express-oauth2-jwt-bearer`",
        check: "backend",
        backendKey: "jwtMiddlewareActive",
      },
      {
        id: "2.2",
        title: "Middleware applied to /api/chat",
        hint: "Open `server/index.ts` — add `validateAccessToken` middleware to the `/api/chat` route",
        check: "backend",
        backendKey: "jwtMiddlewareActive",
      },
      {
        id: "2.3",
        title: "Frontend sends access token",
        hint: "Open `src/hooks/useChat.ts` — call `getAccessTokenSilently()` and add `Authorization: Bearer` header",
        check: "frontend",
      },
    ],
  },
  {
    id: 3,
    title: "Agent Authorization",
    steps: [
      {
        id: "3.1",
        title: "Tool registry populated",
        hint: "Open `server/tools/registry.ts` — define `get_weather`, `get_calendar`, and `send_email` tools",
        check: "backend",
        backendKey: "toolRegistryPopulated",
      },
      {
        id: "3.2",
        title: "Agent auth functions implemented",
        hint: "Open `server/middleware/agent-auth.ts` — implement `hasUserConsented`, `recordConsent`, `checkToolAuthorization`",
        check: "backend",
        backendKey: "agentAuthImplemented",
      },
      {
        id: "3.3",
        title: "Consent endpoints added",
        hint: "Open `server/index.ts` — add `POST /api/consent/approve` and `POST /api/consent/deny` routes",
        check: "backend",
        backendKey: "consentRoutesExist",
      },
      {
        id: "3.4",
        title: "Consent flow wired in chat",
        hint: "Open `src/hooks/useChat.ts` — implement `handleApproval` to call consent endpoints and re-send message",
        check: "frontend",
      },
    ],
  },
  {
    id: 4,
    title: "MCP Server",
    steps: [
      {
        id: "4.1",
        title: "MCP server endpoints built",
        hint: "Open `server/mcp/server.ts` — add OAuth validation, `GET /mcp/tools`, and `POST /mcp/tools/call`",
        check: "backend",
        backendKey: "mcpServerReachable",
      },
      {
        id: "4.2",
        title: "MCP client implemented",
        hint: "Open `server/mcp/client.ts` — implement `getToken()`, `listTools()`, `callTool()`",
        check: "backend",
        backendKey: "mcpClientImplemented",
      },
      {
        id: "4.3",
        title: "Tool executor uses MCP",
        hint: "Open `server/tools/registry.ts` — update `executeTool()` to use `mcpClient.callTool()`",
        check: "backend",
        backendKey: "mcpClientImplemented",
      },
      {
        id: "4.4",
        title: "MCP server started",
        hint: "Open `server/index.ts` — import and call `startMCPServer()`",
        check: "backend",
        backendKey: "mcpServerReachable",
      },
    ],
  },
  {
    id: 5,
    title: "End-to-End Test",
    steps: [
      {
        id: "5.1",
        title: "All previous labs complete",
        hint: "Verify all checkmarks above are green, then run through the test scenarios in the lab guide",
        check: "frontend",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Backend status type
// ---------------------------------------------------------------------------

interface BackendStatus {
  toolRegistryPopulated: boolean;
  agentAuthImplemented: boolean;
  consentRoutesExist: boolean;
  jwtMiddlewareActive: boolean;
  mcpServerReachable: boolean;
  mcpClientImplemented: boolean;
}

// ---------------------------------------------------------------------------
// Frontend detection helpers
//
// These inspect the live DOM to figure out which lab steps are done.
// No globals or flags needed — we observe the app's actual rendered state.
// ---------------------------------------------------------------------------

function checkFrontendStep(
  stepId: string,
  _backendStatus: BackendStatus | null
): boolean | null {
  switch (stepId) {
    // Lab 1.1 + 1.2: Auth0Provider configured & wrapping App.
    // If the stub is still in place, there's no Auth0 context at all,
    // so the login button will say "Not Implemented Yet" and the
    // header will say "Not logged in". Once Auth0Provider is real,
    // the page will either show a loading spinner or an Auth0-powered
    // login screen (no "Not Implemented" text).
    case "1.1":
    case "1.2": {
      // The stub Auth0Provider doesn't provide context — so the
      // login button still says "Not Implemented Yet" and useAuth0()
      // would throw. Once real, we'll see an Auth0 loading state or
      // a working login button.
      const stubBtn = document.querySelector(".login-button");
      if (stubBtn && stubBtn.textContent?.includes("Not Implemented")) {
        return false;
      }
      // If there's a loading spinner or a real login button, Auth0 is working
      const hasSpinner = document.querySelector(".spinner") !== null;
      const hasRealLogin =
        stubBtn !== null && !stubBtn.textContent?.includes("Not Implemented");
      const hasUserInfo = document.querySelector(".user-info span");
      const loggedIn =
        hasUserInfo && !hasUserInfo.textContent?.includes("Not logged in");
      return hasSpinner || hasRealLogin || !!loggedIn;
    }

    // Lab 1.3: LoginScreen is functional (button no longer disabled/stub)
    case "1.3": {
      const btn = document.querySelector(".login-button");
      if (!btn) return null; // login screen not visible — maybe already logged in
      return !btn.textContent?.includes("Not Implemented");
    }

    // Lab 1.4: Chat gated behind auth — if user-info shows a real name
    // (not "Not logged in"), the gate is working. If it still says
    // "Not logged in" but we see the chat, the gate is missing.
    case "1.4": {
      const userSpan = document.querySelector(".user-info span");
      if (!userSpan) return null;
      // If the header still says "Not logged in" but the chat is visible, not gated
      if (userSpan.textContent?.includes("Not logged in")) {
        const chatVisible = document.querySelector(".chat-container") !== null;
        return !chatVisible; // if chat is NOT visible, gate is working (unlikely without auth though)
      }
      // If showing a real user name + logout button, auth gate is in place
      const hasLogout = document.querySelector(".logout-button") !== null;
      return hasLogout;
    }

    // Lab 2.3: Frontend sends access token — hard to detect from DOM alone.
    // We check the backend status for this (jwtMiddlewareActive implies
    // the frontend must also be sending tokens for things to work).
    case "2.3": {
      // If JWT middleware is active and the chat still works (user can send messages),
      // then the frontend must be sending tokens.
      if (_backendStatus?.jwtMiddlewareActive) {
        // Check if the user appears to be chatting successfully
        const messages = document.querySelectorAll(".message.assistant");
        const hasError = Array.from(messages).some((m) =>
          m.textContent?.includes("Unauthorized")
        );
        return messages.length > 0 ? !hasError : null;
      }
      return null; // can't determine without backend info
    }

    // Lab 3.4: Consent flow wired — we can't easily detect this from the DOM
    // without the user triggering a tool call. Return null (unknown).
    case "3.4":
      return null;

    // Lab 5: All complete — handled separately
    case "5.1":
      return null;

    default:
      return null;
  }
}

function checkBackendStep(
  step: Step,
  backendStatus: BackendStatus | null
): boolean | null {
  if (!backendStatus) return null; // unknown — server unreachable
  if (!step.backendKey) return null;
  return (backendStatus as any)[step.backendKey] === true;
}

function resolveStepStatus(
  step: Step,
  backendStatus: BackendStatus | null
): "done" | "pending" | "unknown" {
  let result: boolean | null;
  if (step.check === "frontend") {
    result = checkFrontendStep(step.id, backendStatus);
  } else {
    result = checkBackendStep(step, backendStatus);
  }
  if (result === true) return "done";
  if (result === false) return "pending";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LabGuide() {
  const [expanded, setExpanded] = useState(false);
  const [openLab, setOpenLab] = useState<number | null>(1);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(
    null
  );
  const [tick, setTick] = useState(0); // forces re-render for DOM-based checks

  // Poll backend status + trigger DOM re-check
  const fetchStatus = useCallback(() => {
    setTick((t) => t + 1); // re-render to re-evaluate DOM checks
    fetch("/api/lab-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setBackendStatus(data);
      })
      .catch(() => {
        /* server not running yet — that's fine */
      });
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // suppress unused var warning
  void tick;

  // Compute step statuses
  const stepStatuses = new Map<string, "done" | "pending" | "unknown">();
  for (const lab of LABS) {
    for (const step of lab.steps) {
      stepStatuses.set(step.id, resolveStepStatus(step, backendStatus));
    }
  }

  // Special case: Lab 5 "all complete"
  const allOthersDone = LABS.slice(0, 4).every((lab) =>
    lab.steps.every((s) => stepStatuses.get(s.id) === "done")
  );
  if (allOthersDone) {
    stepStatuses.set("5.1", "done");
  }

  // Progress counts
  const totalSteps = LABS.reduce((sum, lab) => sum + lab.steps.length, 0);
  const doneSteps = Array.from(stepStatuses.values()).filter(
    (s) => s === "done"
  ).length;

  // Determine lab-level status
  function labStatus(lab: Lab): "complete" | "in-progress" | "pending" {
    const statuses = lab.steps.map((s) => stepStatuses.get(s.id));
    if (statuses.every((s) => s === "done")) return "complete";
    if (statuses.some((s) => s === "done")) return "in-progress";
    return "pending";
  }

  // Render hint text with inline code formatting
  function renderHint(hint: string) {
    const parts = hint.split(/(`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={i}>{part.slice(1, -1)}</code>;
      }
      return <span key={i}>{part}</span>;
    });
  }

  // --- Collapsed pill ---
  if (!expanded) {
    return (
      <div
        className={`lab-guide-pill${expanded ? " expanded" : ""}`}
        onClick={() => setExpanded(true)}
      >
        <span>Lab Guide</span>
        <span className="pill-progress">
          {doneSteps}/{totalSteps}
        </span>
        <span className="pill-arrow">&#9650;</span>
      </div>
    );
  }

  // --- Expanded panel ---
  return (
    <div className="lab-guide-panel">
      <div className="lab-guide-header" onClick={() => setExpanded(false)}>
        <h3>Lab Guide</h3>
        <div className="header-meta">
          <span className="progress-text">
            {doneSteps}/{totalSteps} steps
          </span>
          <span className="collapse-btn">&#9660;</span>
        </div>
      </div>

      <div className="lab-guide-body">
        {allOthersDone && doneSteps === totalSteps ? (
          <div className="lab-guide-complete">
            <div className="complete-icon">&#9989;</div>
            <p>
              <strong>All labs complete!</strong>
              <br />
              Run through the end-to-end test scenarios in the lab guide.
            </p>
          </div>
        ) : (
          LABS.map((lab) => {
            const status = labStatus(lab);
            const isOpen = openLab === lab.id;

            return (
              <div className="lab-section" key={lab.id}>
                <div
                  className="lab-section-header"
                  onClick={() => setOpenLab(isOpen ? null : lab.id)}
                >
                  <span
                    className={`lab-number ${
                      status === "complete"
                        ? "complete"
                        : status === "in-progress"
                        ? "in-progress"
                        : "pending"
                    }`}
                  >
                    {status === "complete" ? "\u2713" : lab.id}
                  </span>
                  <span className="lab-title">{lab.title}</span>
                  <span
                    className={`section-arrow${isOpen ? " open" : ""}`}
                  >
                    &#9654;
                  </span>
                </div>

                {isOpen && (
                  <div className="lab-steps">
                    {lab.steps.map((step) => {
                      const s = stepStatuses.get(step.id) || "unknown";
                      const isSelected = selectedStep === step.id;

                      return (
                        <div key={step.id}>
                          <div
                            className="lab-step"
                            onClick={() =>
                              setSelectedStep(isSelected ? null : step.id)
                            }
                          >
                            <span
                              className={`step-icon ${
                                s === "done"
                                  ? "done"
                                  : s === "pending"
                                  ? "pending"
                                  : "unknown"
                              }`}
                            >
                              {s === "done"
                                ? "\u2713"
                                : s === "pending"
                                ? "\u25CB"
                                : "?"}
                            </span>
                            <span
                              className={`step-title${
                                s === "done" ? " done" : ""
                              }`}
                            >
                              {step.title}
                            </span>
                          </div>
                          {isSelected && s !== "done" && (
                            <div className="step-hint">
                              {renderHint(step.hint)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
