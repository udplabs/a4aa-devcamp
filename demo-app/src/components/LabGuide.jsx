import { useState, useEffect } from "react";
import { marked } from "marked";

export function LabGuide({ onClose }) {
  const [labs, setLabs] = useState([]);
  const [activeLab, setActiveLab] = useState("overview");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  // Fetch lab list on mount
  useEffect(() => {
    fetch("/api/guide")
      .then((r) => r.json())
      .then((data) => setLabs(data.labs))
      .catch(() => {});
  }, []);

  // Fetch content when active lab changes
  useEffect(() => {
    setLoading(true);
    fetch(`/api/guide/${activeLab}`)
      .then((r) => r.json())
      .then((data) => {
        setContent(data.content || "");
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
          <ul className="guide-nav">
            {labs.map((lab) => (
              <li key={lab.id}>
                <button
                  className={`guide-nav-item${activeLab === lab.id ? " active" : ""}`}
                  onClick={() => setActiveLab(lab.id)}
                >
                  {lab.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <main className="guide-content">
          {loading ? (
            <div className="guide-loading">Loading...</div>
          ) : (
            <>
              <div
                className="guide-markdown"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />
              <div className="guide-pagination">
                {prevLab ? (
                  <button
                    className="guide-page-btn"
                    onClick={() => setActiveLab(prevLab.id)}
                  >
                    &larr; {prevLab.title}
                  </button>
                ) : (
                  <span />
                )}
                {nextLab ? (
                  <button
                    className="guide-page-btn"
                    onClick={() => setActiveLab(nextLab.id)}
                  >
                    {nextLab.title} &rarr;
                  </button>
                ) : (
                  <span />
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

const ALERT_TYPES = {
  NOTE: "note",
  TIP: "tip",
  IMPORTANT: "important",
  WARNING: "warning",
  CAUTION: "caution",
};

// Convert GitHub alert blockquotes (> [!NOTE] ...) into <div class="gh-alert">
// wrappers before handing the markdown to marked. A run of leading "> "
// blockquote lines after the marker becomes the alert body.
function preprocessAlerts(md) {
  const lines = md.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/);
    if (!match) {
      out.push(lines[i]);
      continue;
    }
    const type = ALERT_TYPES[match[1]];
    const body = [];
    let j = i + 1;
    while (j < lines.length && /^>\s?/.test(lines[j])) {
      body.push(lines[j].replace(/^>\s?/, ""));
      j++;
    }
    const inner = marked.parse(body.join("\n"));
    const label = match[1].charAt(0) + match[1].slice(1).toLowerCase();
    out.push(
      `<div class="gh-alert gh-alert-${type}">` +
        `<p class="gh-alert-title">${label}</p>${inner}</div>`
    );
    i = j - 1;
  }
  return out.join("\n");
}

// Trusted content: the guide markdown is read from our own files on disk,
// so raw-HTML passthrough (small-caps <span>, <kbd>, <mark>, styled <ul>)
// is intentional. marked handles GFM tables and nested lists.
marked.setOptions({ gfm: true, breaks: false });

function renderMarkdown(md) {
  return marked.parse(preprocessAlerts(md));
}
