import { useState, useEffect } from "react";

interface Lab {
  id: string;
  title: string;
}

export function LabGuide({ onClose }: { onClose: () => void }) {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [activeLab, setActiveLab] = useState<string>("00-overview");
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

// Lightweight markdown renderer (no external dependency)
function renderMarkdown(md: string): string {
  let html = md
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Fenced code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
      return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Headers
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Horizontal rules
    .replace(/^---+$/gm, "<hr>")
    // Tables
    .replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line
        .split("|")
        .filter((c) => c.trim() !== "");
      if (cells.every((c) => /^[\s-:]+$/.test(c))) {
        return "<!--table-sep-->";
      }
      const tag = "td";
      const row = cells.map((c) => `<${tag}>${c.trim()}</${tag}>`).join("");
      return `<tr>${row}</tr>`;
    })
    // Wrap table rows
    .replace(
      /((?:<tr>.*<\/tr>\n?)+)/g,
      (block) => {
        const cleaned = block.replace(/<!--table-sep-->\n?/g, "");
        if (!cleaned.trim()) return "";
        return `<table>${cleaned}</table>`;
      }
    )
    // Unordered lists
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Paragraphs (blank lines)
    .replace(/\n\n+/g, "</p><p>")
    // Single newlines in paragraphs
    .replace(/\n/g, "<br>");

  return `<p>${html}</p>`;
}
