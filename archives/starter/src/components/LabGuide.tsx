import { useState, useEffect } from "react";

interface Lab {
  id: string;
  title: string;
}

interface LabGuideProps {
  onClose: () => void;
  minimized?: boolean;
  onToggleMinimize?: () => void;
}

export function LabGuide({
  onClose,
  minimized = false,
  onToggleMinimize,
}: LabGuideProps) {
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

  // Escape closes; arrow keys navigate the carousel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "Escape") onClose();
      if (typing) return;
      if (e.key === "ArrowLeft" && prevLab) setActiveLab(prevLab.id);
      if (e.key === "ArrowRight" && nextLab) setActiveLab(nextLab.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, prevLab, nextLab]);

  // Delegate clicks on "Copy" buttons inside rendered markdown
  useEffect(() => {
    const scope = document.querySelector(".guide-carousel-content");
    if (!scope) return;
    const onClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest(".guide-code-copy") as HTMLButtonElement | null;
      if (!btn) return;
      const block = btn.closest(".guide-code-block");
      const codeEl = block?.querySelector("pre code") as HTMLElement | null;
      if (!codeEl) return;
      const text = codeEl.innerText;
      const done = () => {
        btn.classList.add("is-copied");
        const prev = btn.textContent;
        btn.textContent = "Copied";
        window.setTimeout(() => {
          btn.classList.remove("is-copied");
          btn.textContent = prev || "Copy";
        }, 1600);
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => done());
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch {}
        document.body.removeChild(ta);
        done();
      }
    };
    scope.addEventListener("click", onClick);
    return () => scope.removeEventListener("click", onClick);
  }, [content]);

  if (minimized) {
    return (
      <div className="guide-drawer guide-rail">
        <div className="guide-rail-header">
          <button
            className="guide-rail-expand"
            onClick={onToggleMinimize}
            title="Expand lab guide"
            aria-label="Expand lab guide"
          >
            &raquo;
          </button>
        </div>
        <ul className="guide-rail-nav">
          {labs.map((lab, i) => (
            <li key={lab.id}>
              <button
                className={`guide-rail-item${activeLab === lab.id ? " active" : ""}`}
                onClick={() => {
                  setActiveLab(lab.id);
                  onToggleMinimize?.();
                }}
                title={lab.title}
              >
                <span className="guide-rail-index">
                  {String(i).padStart(2, "0")}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="guide-rail-footer">
          <button
            className="guide-rail-close"
            onClick={onClose}
            title="Close lab guide"
            aria-label="Close lab guide"
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  const current = labs[currentIndex];
  const total = labs.length;
  const position = total > 0 ? currentIndex + 1 : 0;

  return (
    <div className="guide-drawer guide-carousel">
      <header className="guide-carousel-header">
        <div className="guide-carousel-title">
          <span className="guide-carousel-eyebrow">Lab Guide</span>
          <h2>{current?.title ?? "Loading..."}</h2>
        </div>
        <div className="guide-sidebar-actions">
          {onToggleMinimize && (
            <button
              className="guide-minimize"
              onClick={onToggleMinimize}
              title="Minimize"
              aria-label="Minimize lab guide"
            >
              &laquo;
            </button>
          )}
          <button
            className="guide-close"
            onClick={onClose}
            title="Back to chat"
          >
            &times;
          </button>
        </div>
      </header>

      <nav className="guide-carousel-nav" aria-label="Lab step navigation">
        <button
          className="guide-carousel-arrow"
          onClick={() => prevLab && setActiveLab(prevLab.id)}
          disabled={!prevLab}
          aria-label="Previous lab"
        >
          &larr;
        </button>
        <div className="guide-carousel-dots" role="tablist">
          {labs.map((lab, i) => (
            <button
              key={lab.id}
              role="tab"
              aria-selected={lab.id === activeLab}
              aria-label={`${lab.title} (step ${i + 1} of ${total})`}
              className={`guide-carousel-dot${
                lab.id === activeLab ? " active" : ""
              }`}
              onClick={() => setActiveLab(lab.id)}
            />
          ))}
        </div>
        <span className="guide-carousel-position">
          {position}/{total}
        </span>
        <button
          className="guide-carousel-arrow"
          onClick={() => nextLab && setActiveLab(nextLab.id)}
          disabled={!nextLab}
          aria-label="Next lab"
        >
          &rarr;
        </button>
      </nav>

      <main className="guide-content guide-carousel-content">
        {loading ? (
          <div className="guide-loading">Loading...</div>
        ) : (
          <div
            className="guide-markdown"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        )}
      </main>

      <footer className="guide-carousel-footer">
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
      </footer>
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
    // Fenced code blocks — wrapped with a copy affordance
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
      const langLabel = lang ? `<span class="guide-code-lang">${lang}</span>` : "";
      return `<div class="guide-code-block">${langLabel}<button class="guide-code-copy" type="button" aria-label="Copy code">Copy</button><pre><code class="lang-${lang}">${code.trim()}</code></pre></div>`;
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
    // Blockquotes (after HTML escape so we match &gt; not >)
    .replace(/^(?:&gt; ?.*(?:\n&gt; ?.*)*)/gm, (block) => {
      const inner = block
        .split("\n")
        .map((l) => l.replace(/^&gt; ?/, ""))
        .join(" ")
        .trim();
      return `<blockquote><p>${inner}</p></blockquote>`;
    })
    // Tables — mark raw rows, keep separator line, transform after
    .replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line
        .split("|")
        .filter((c) => c.trim() !== "");
      if (cells.every((c) => /^[\s\-:]+$/.test(c))) {
        return "<!--table-sep-->";
      }
      const row = cells.map((c) => `<!--cell-->${c.trim()}`).join("");
      return `<!--row-->${row}`;
    })
    // Collapse consecutive rows into a <table> with <thead> + <tbody>
    .replace(
      /(?:<!--row-->[^\n]*\n?(?:<!--table-sep-->\n?)?)+/g,
      (block) => {
        const lines = block
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        let headerIdx = lines.findIndex((l) => l === "<!--table-sep-->") - 1;
        const rows: { header: boolean; cells: string[] }[] = [];
        lines.forEach((l, i) => {
          if (l === "<!--table-sep-->") return;
          if (!l.startsWith("<!--row-->")) return;
          const cells = l
            .replace("<!--row-->", "")
            .split("<!--cell-->")
            .filter((c) => c !== "");
          rows.push({ header: i === headerIdx, cells });
        });
        if (!rows.length) return "";
        const hasHeader = headerIdx >= 0;
        const head = hasHeader
          ? `<thead><tr>${rows[0].cells
              .map((c) => `<th>${c}</th>`)
              .join("")}</tr></thead>`
          : "";
        const bodyRows = (hasHeader ? rows.slice(1) : rows)
          .map(
            (r) =>
              `<tr>${r.cells.map((c) => `<td>${c}</td>`).join("")}</tr>`
          )
          .join("");
        return `<div class="guide-table-wrap"><table>${head}<tbody>${bodyRows}</tbody></table></div>`;
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
