import { useState } from "react";
import { useLabProgress } from "../hooks/useLabProgress";
import { ModuleChecks } from "./ModuleChecks";

// Mirrors demo-app/server/routes/guide.js LABS, in lab-guide file order.
// `id` is the internal checkable-step id consumed by ModuleChecks. The CIBA
// and FGA lab-guide file is a single row ("05") that covers both the CIBA
// backend checks and the FGA knowledge-check quiz, merged under one
// moduleId -- see ModuleChecks.jsx case "05".
const MODULES = [
  { fileNum: "01", id: "00", label: "Prerequisites" },
  { fileNum: "02", id: "01", label: "First-Party Agent Setup" },
  { fileNum: "03", id: "02", label: "Third-Party Agent Setup" },
  { fileNum: "04", id: "06", label: "Auth for MCP" },
  { fileNum: "05", id: "03", label: "User Authentication" },
  { fileNum: "06", id: "04", label: "Token Vault" },
  { fileNum: "07", id: "05", label: "CIBA and FGA" },
  { fileNum: "08", id: "07", label: "End-to-End" },
];

function moduleStatus(mod, getModuleStatus) {
  if (mod.id === null) return "idle";
  const ids = Array.isArray(mod.id) ? mod.id : [mod.id];
  const statuses = ids.map((i) => getModuleStatus(i));
  if (statuses.every((s) => s === "pass")) return "pass";
  if (statuses.some((s) => s === "fail")) return "fail";
  return "idle";
}

// Row key must stay stable and unique even for the null-id (Auth for MCP)
// and multi-id (CIBA and FGA) rows, so it's derived from the label rather
// than the checkable id.
function rowKey(mod) {
  return mod.label;
}

export function ProgressTracker() {
  const [minimized, setMinimized] = useState(false);
  const [expandedModule, setExpandedModule] = useState(null);
  const { getModuleStatus, setModuleStatus } = useLabProgress();

  function toggleModule(key) {
    setExpandedModule((prev) => (prev === key ? null : key));
  }

  if (minimized) {
    return (
      <div
        className="progress-tracker-tab"
        onClick={() => setMinimized(false)}
        title="Lab Progress"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="currentColor"/>
          <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="currentColor"/>
          <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="currentColor"/>
        </svg>
      </div>
    );
  }

  return (
    <div className="progress-tracker">
      <div className="progress-tracker-header">
        <span className="progress-tracker-title">Lab Progress</span>
        <button
          className="progress-tracker-minimize"
          onClick={() => setMinimized(true)}
          title="Minimize"
        >
          −
        </button>
      </div>

      <ul className="progress-tracker-list">
        {MODULES.map((mod) => {
          const key = rowKey(mod);
          const status = moduleStatus(mod, getModuleStatus);
          const isExpanded = expandedModule === key;
          // Auth for MCP has no automated check yet, so there's nothing for
          // ModuleChecks to run and the row isn't expandable.
          const expandable = mod.id !== null;
          const checkIds = Array.isArray(mod.id) ? mod.id : [mod.id];

          return (
            <li key={key} className="progress-tracker-item">
              <button
                className={`progress-tracker-row progress-tracker-row--${status}`}
                onClick={() => expandable && toggleModule(key)}
                disabled={!expandable}
              >
                <span className="progress-tracker-status">
                  {status === "pass" ? "✓" : status === "fail" ? "✗" : "○"}
                </span>
                <span className="progress-tracker-num">{mod.fileNum}</span>
                <span className="progress-tracker-label">{mod.label}</span>
                {expandable && (
                  <span className={`progress-tracker-chevron${isExpanded ? " open" : ""}`}>
                    ›
                  </span>
                )}
              </button>

              {isExpanded && expandable && (
                <div className="progress-tracker-checks">
                  {checkIds.map((id) => (
                    <ModuleChecks
                      key={id}
                      moduleId={id}
                      onComplete={(id) => setModuleStatus(id, "pass")}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
