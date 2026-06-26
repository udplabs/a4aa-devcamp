import { useState, useEffect } from "react";
import { marked } from "marked";
import { ModuleChecks } from "./ModuleChecks";
import { useLabProgress } from "../hooks/useLabProgress";

// Modules that have automated verification checks
const CHECKABLE_MODULES = ["00", "01", "02", "03", "04", "05"];

export function LabGuide({ onClose }) {
  const [labs, setLabs] = useState([]);
  const [activeLab, setActiveLab] = useState("overview");
  const [activeModule, setActiveModule] = useState(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const { getModuleStatus, setModuleStatus } = useLabProgress();

  useEffect(() => {
    fetch("/api/guide")
      .then((r) => r.json())
      .then((data) => setLabs(data.labs))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/guide/${activeLab}`)
      .then((r) => r.json())
      .then((data) => {
        setContent(data.content || "");
        setActiveModule(data.module || null);
        setLoading(false);
      })
      .catch(() => {
        setContent("Failed to load lab guide.");
        setLoading(false);
      });
  }, [activeLab]);

  const currentIndex = labs.findIndex((l) => l.id === activeLab);
  const prevLab = currentIndex > 0 ? labs[currentIndex - 1] : null;
  const nextLab = currentIndex < labs.length - 1 ? labs[currentIndex + 1] : null;

  const moduleLabs = labs.filter((l) => l.module !== null);

  function handleModuleComplete(moduleId) {
    setModuleStatus(moduleId, "pass");
  }

  function statusIcon(moduleId) {
    const s = getModuleStatus(moduleId);
    if (s === "pass") return "✓";
    if (s === "fail") return "✗";
    return null;
  }

  function statusClass(moduleId) {
    return getModuleStatus(moduleId) || "idle";
  }

  return (
    <div className="guide-overlay">
      <div className="guide-container">
        {/* Sidebar */}
        <nav className="guide-sidebar">
          <div className="guide-sidebar-header">
            <h2>Lab Guide</h2>
            <button className="guide-close" onClick={onClose} title="Back to chat">
              &times;
            </button>
          </div>

          {/* Progress pill strip */}
          {moduleLabs.length > 0 && (
            <div className="guide-progress-pills">
              {moduleLabs.map((lab) => (
                <button
                  key={lab.id}
                  className={`guide-pill guide-pill--${statusClass(lab.module)}${activeLab === lab.id ? " active" : ""}`}
                  onClick={() => setActiveLab(lab.id)}
                  title={lab.title}
                >
                  <span className="guide-pill-num">{lab.module}</span>
                  {statusIcon(lab.module) && (
                    <span className="guide-pill-icon">{statusIcon(lab.module)}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Full nav list */}
          <ul className="guide-nav">
            {labs.map((lab) => (
              <li key={lab.id}>
                <button
                  className={`guide-nav-item${activeLab === lab.id ? " active" : ""}${lab.module && getModuleStatus(lab.module) === "pass" ? " complete" : ""}`}
                  onClick={() => setActiveLab(lab.id)}
                >
                  {lab.module && (
                    <span className={`guide-nav-status guide-nav-status--${statusClass(lab.module)}`}>
                      {statusIcon(lab.module) || "○"}
                    </span>
                  )}
                  {lab.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <main className="guide-content">
          {loading ? (
            <div className="guide-loading">Loading…</div>
          ) : (
            <>
              <div
                className="guide-markdown"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />

              {activeModule && CHECKABLE_MODULES.includes(activeModule) && (
                <ModuleChecks
                  moduleId={activeModule}
                  onComplete={handleModuleComplete}
                />
              )}

              <div className="guide-pagination">
                {prevLab ? (
                  <button className="guide-page-btn" onClick={() => setActiveLab(prevLab.id)}>
                    &larr; {prevLab.title}
                  </button>
                ) : <span />}
                {nextLab ? (
                  <button className="guide-page-btn" onClick={() => setActiveLab(nextLab.id)}>
                    {nextLab.title} &rarr;
                  </button>
                ) : <span />}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ---- Markdown rendering ------------------------------------------

const ALERT_TYPES = { NOTE: "note", TIP: "tip", IMPORTANT: "important", WARNING: "warning", CAUTION: "caution" };

function preprocessAlerts(md) {
  const lines = md.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/);
    if (!match) { out.push(lines[i]); continue; }
    const type = ALERT_TYPES[match[1]];
    const body = [];
    let j = i + 1;
    while (j < lines.length && /^>\s?/.test(lines[j])) {
      body.push(lines[j].replace(/^>\s?/, ""));
      j++;
    }
    const inner = marked.parse(body.join("\n"));
    const label = match[1].charAt(0) + match[1].slice(1).toLowerCase();
    out.push(`<div class="gh-alert gh-alert-${type}"><p class="gh-alert-title">${label}</p>${inner}</div>`);
    i = j - 1;
  }
  return out.join("\n");
}

marked.setOptions({ gfm: true, breaks: false });

function renderMarkdown(md) {
  return marked.parse(preprocessAlerts(md));
}
