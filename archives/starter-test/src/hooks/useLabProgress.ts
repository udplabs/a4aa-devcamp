import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Lab step definitions
// ---------------------------------------------------------------------------

export interface LabStep {
  id: string;
  title: string;
  hint: string;
  check: "frontend" | "backend";
  backendKey?: string;
}

export interface LabDefinition {
  id: number;
  title: string;
  /** Leading numeric prefix used in the guide file IDs, e.g. "01-user-authentication" → 1. */
  guidePrefix: number;
  steps: LabStep[];
}

export const LABS: LabDefinition[] = [
  {
    id: 1,
    title: "Chat UI + User Auth",
    guidePrefix: 1,
    steps: [
      {
        id: "1.1",
        title: "Auth0Provider configured",
        hint: "src/auth/Auth0Provider.tsx — replace the passthrough with the real Auth0Provider from @auth0/auth0-react",
        check: "frontend",
      },
      {
        id: "1.2",
        title: "main.tsx wraps App with Auth0Provider",
        hint: "src/main.tsx — wrap <App /> with <Auth0Provider>",
        check: "frontend",
      },
      {
        id: "1.3",
        title: "LoginScreen functional",
        hint: "src/components/LoginScreen.tsx — use useAuth0() and call loginWithRedirect()",
        check: "frontend",
      },
      {
        id: "1.4",
        title: "Chat gated behind authentication",
        hint: "src/App.tsx — check isAuthenticated before rendering <Chat />",
        check: "frontend",
      },
    ],
  },
  {
    id: 2,
    title: "Protected LLM API",
    guidePrefix: 2,
    steps: [
      {
        id: "2.1",
        title: "JWT middleware active",
        hint: "server/middleware/auth.ts — replace placeholder with auth() from express-oauth2-jwt-bearer",
        check: "backend",
        backendKey: "jwtMiddlewareActive",
      },
      {
        id: "2.2",
        title: "Middleware applied to /api/chat",
        hint: "server/index.ts — add validateAccessToken middleware to /api/chat",
        check: "backend",
        backendKey: "jwtMiddlewareActive",
      },
      {
        id: "2.3",
        title: "Frontend sends access token",
        hint: "src/hooks/useChat.ts — call getAccessTokenSilently() and add Authorization: Bearer header",
        check: "frontend",
      },
    ],
  },
  {
    id: 3,
    title: "Agent Authorization",
    guidePrefix: 3,
    steps: [
      {
        id: "3.1",
        title: "Tool registry populated",
        hint: "server/tools/registry.ts — define the retail quote tools",
        check: "backend",
        backendKey: "toolRegistryPopulated",
      },
      {
        id: "3.2",
        title: "Agent auth functions implemented",
        hint: "server/middleware/agent-auth.ts — implement hasUserConsented, recordConsent, checkToolAuthorization",
        check: "backend",
        backendKey: "agentAuthImplemented",
      },
      {
        id: "3.3",
        title: "Consent endpoints added",
        hint: "server/index.ts — add POST /api/consent/approve and /api/consent/deny",
        check: "backend",
        backendKey: "consentRoutesExist",
      },
      {
        id: "3.4",
        title: "Consent flow wired in chat",
        hint: "src/hooks/useChat.ts — implement handleApproval",
        check: "frontend",
      },
    ],
  },
  {
    id: 4,
    title: "MCP Server",
    guidePrefix: 5,
    steps: [
      {
        id: "4.1",
        title: "MCP server endpoints built",
        hint: "server/mcp/server.ts — add OAuth validation, GET /mcp/tools, POST /mcp/tools/call",
        check: "backend",
        backendKey: "mcpServerReachable",
      },
      {
        id: "4.2",
        title: "MCP client implemented",
        hint: "server/mcp/client.ts — implement getToken(), listTools(), callTool()",
        check: "backend",
        backendKey: "mcpClientImplemented",
      },
      {
        id: "4.3",
        title: "Tool executor uses MCP",
        hint: "server/tools/registry.ts — update executeTool() to use mcpClient.callTool()",
        check: "backend",
        backendKey: "mcpClientImplemented",
      },
      {
        id: "4.4",
        title: "MCP server started",
        hint: "server/index.ts — import and call startMCPServer()",
        check: "backend",
        backendKey: "mcpServerReachable",
      },
    ],
  },
  {
    id: 5,
    title: "End-to-End Test",
    guidePrefix: 6,
    steps: [
      {
        id: "5.1",
        title: "All previous labs complete",
        hint: "Verify all checkmarks above are green, then run the end-to-end scenarios.",
        check: "frontend",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Backend status shape
// ---------------------------------------------------------------------------

export interface BackendStatus {
  toolRegistryPopulated: boolean;
  agentAuthImplemented: boolean;
  consentRoutesExist: boolean;
  jwtMiddlewareActive: boolean;
  mcpServerReachable: boolean;
  mcpClientImplemented: boolean;
}

export type StepStatus = "done" | "pending" | "unknown";

// ---------------------------------------------------------------------------
// DOM-based frontend checks
// ---------------------------------------------------------------------------

function checkFrontendStep(
  stepId: string,
  backendStatus: BackendStatus | null
): boolean | null {
  switch (stepId) {
    case "1.1":
    case "1.2": {
      const stubBtn = document.querySelector(".login-button");
      if (stubBtn && stubBtn.textContent?.includes("Not Implemented")) {
        return false;
      }
      const hasSpinner = document.querySelector(".spinner") !== null;
      const hasRealLogin =
        stubBtn !== null && !stubBtn.textContent?.includes("Not Implemented");
      const hasUserInfo = document.querySelector(".user-info span");
      const loggedIn =
        hasUserInfo && !hasUserInfo.textContent?.includes("Not logged in");
      return hasSpinner || hasRealLogin || !!loggedIn;
    }
    case "1.3": {
      const btn = document.querySelector(".login-button");
      if (!btn) return null;
      return !btn.textContent?.includes("Not Implemented");
    }
    case "1.4": {
      const userSpan = document.querySelector(".user-info span");
      if (!userSpan) return null;
      if (userSpan.textContent?.includes("Not logged in")) {
        const chatVisible = document.querySelector(".chat-container") !== null;
        return !chatVisible;
      }
      const hasLogout = document.querySelector(".logout-button") !== null;
      return hasLogout;
    }
    case "2.3": {
      if (backendStatus?.jwtMiddlewareActive) {
        const messages = document.querySelectorAll(".message.assistant");
        const hasError = Array.from(messages).some((m) =>
          m.textContent?.includes("Unauthorized")
        );
        return messages.length > 0 ? !hasError : null;
      }
      return null;
    }
    case "3.4":
    case "5.1":
      return null;
    default:
      return null;
  }
}

function checkBackendStep(
  step: LabStep,
  backendStatus: BackendStatus | null
): boolean | null {
  if (!backendStatus) return null;
  if (!step.backendKey) return null;
  return (backendStatus as any)[step.backendKey] === true;
}

function resolveStepStatus(
  step: LabStep,
  backendStatus: BackendStatus | null
): StepStatus {
  const result =
    step.check === "frontend"
      ? checkFrontendStep(step.id, backendStatus)
      : checkBackendStep(step, backendStatus);
  if (result === true) return "done";
  if (result === false) return "pending";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface LabProgress {
  backendStatus: BackendStatus | null;
  stepStatuses: Map<string, StepStatus>;
  totalSteps: number;
  doneSteps: number;
  labStatus: (lab: LabDefinition) => "complete" | "in-progress" | "pending";
  refresh: () => void;
}

export function useLabProgress(pollMs = 5000): LabProgress {
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    fetch("/api/lab-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setBackendStatus(data);
      })
      .catch(() => {
        /* server not up yet */
      });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  // suppress unused warning; tick forces re-render for DOM checks
  void tick;

  const stepStatuses = new Map<string, StepStatus>();
  for (const lab of LABS) {
    for (const step of lab.steps) {
      stepStatuses.set(step.id, resolveStepStatus(step, backendStatus));
    }
  }

  // Lab 5 rolls up: complete when every other lab is complete
  const allOthersDone = LABS.slice(0, 4).every((lab) =>
    lab.steps.every((s) => stepStatuses.get(s.id) === "done")
  );
  if (allOthersDone) stepStatuses.set("5.1", "done");

  const totalSteps = LABS.reduce((sum, lab) => sum + lab.steps.length, 0);
  const doneSteps = Array.from(stepStatuses.values()).filter(
    (s) => s === "done"
  ).length;

  const labStatus = (lab: LabDefinition): "complete" | "in-progress" | "pending" => {
    const statuses = lab.steps.map((s) => stepStatuses.get(s.id));
    if (statuses.every((s) => s === "done")) return "complete";
    if (statuses.some((s) => s === "done")) return "in-progress";
    return "pending";
  };

  return { backendStatus, stepStatuses, totalSteps, doneSteps, labStatus, refresh };
}

/**
 * Pull the leading numeric prefix from a guide lab id like "03-fine-grained-authorization".
 * Returns null if the id has no prefix or the prefix is not numeric.
 */
export function guidePrefixFor(labId: string): number | null {
  const match = /^(\d+)/.exec(labId);
  if (!match) return null;
  return Number(match[1]);
}

/** Find the LabDefinition that corresponds to a given guide lab id. */
export function findLabByGuideId(labId: string): LabDefinition | null {
  const prefix = guidePrefixFor(labId);
  if (prefix == null) return null;
  return LABS.find((lab) => lab.guidePrefix === prefix) ?? null;
}
