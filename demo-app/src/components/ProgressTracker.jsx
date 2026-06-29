import { useState } from "react";
import { useLabProgress } from "../hooks/useLabProgress";
import { ModuleChecks } from "./ModuleChecks";

const MODULES = [
  { id: "00", label: "Prerequisites" },
  { id: "01", label: "Auth for MCP" },
  { id: "02", label: "User Auth" },
  { id: "03", label: "Token Vault" },
  { id: "04", label: "CIBA" },
  { id: "05", label: "FGA" },
  { id: "06", label: "End-to-End" },
];

export function ProgressTracker() {
  const [minimized, setMinimized] = useState(false);
  const [expandedModule, setExpandedModule] = useState(null);
  const { getModuleStatus, setModuleStatus } = useLabProgress();

  function toggleModule(id) {
    setExpandedModule((prev) => (prev === id ? null : id));
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
          const status = getModuleStatus(mod.id);
          const isExpanded = expandedModule === mod.id;

          return (
            <li key={mod.id} className="progress-tracker-item">
              <button
                className={`progress-tracker-row progress-tracker-row--${status}`}
                onClick={() => toggleModule(mod.id)}
              >
                <span className="progress-tracker-status">
                  {status === "pass" ? "✓" : status === "fail" ? "✗" : "○"}
                </span>
                <span className="progress-tracker-num">{mod.id}</span>
                <span className="progress-tracker-label">{mod.label}</span>
                <span className={`progress-tracker-chevron${isExpanded ? " open" : ""}`}>
                  ›
                </span>
              </button>

              {isExpanded && (
                <div className="progress-tracker-checks">
                  <ModuleChecks
                    moduleId={mod.id}
                    onComplete={(id) => {
                      setModuleStatus(id, "pass");
                      setTimeout(() => window.location.reload(), 150);
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
