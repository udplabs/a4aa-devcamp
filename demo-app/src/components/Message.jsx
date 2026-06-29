import { useState } from "react";

const TOOL_BADGES = {
  search_documents:  ["MCP (OBO)", "FGA"],
  get_document:      ["MCP (OBO)", "FGA"],
  log_crm_activity:  ["MCP (OBO)", "Token Vault"],
  share_document:    ["MCP (OBO)", "CIBA", "FGA"],
};

function ToolCall({ tc }) {
  const [expanded, setExpanded] = useState(false);
  const badges = TOOL_BADGES[tc.tool] || ["MCP (OBO)"];
  const isSuccess = tc.status === "success";

  return (
    <div className={`tool-call tool-call--${tc.status}`}>
      <button
        className="tool-call-summary"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={`tool-call-icon tool-call-icon--${tc.status}`}>
          {isSuccess ? "✓" : "✗"}
        </span>
        <span className="tool-call-name">{tc.tool}</span>
        <div className="tool-call-badges">
          {badges.map((b) => (
            <span key={b} className="tool-call-badge">{b}</span>
          ))}
        </div>
        <span className={`tool-call-chevron${expanded ? " open" : ""}`}>›</span>
      </button>

      {expanded && (
        <div className="tool-call-details">
          {isSuccess && tc.result ? (
            <pre className="tool-call-result">
              {JSON.stringify(tc.result, null, 2)}
            </pre>
          ) : !isSuccess ? (
            <p className="tool-call-error-msg">
              {tc.result?.error || tc.result?.message || "Tool execution failed"}
            </p>
          ) : (
            <p className="tool-call-error-msg">No result data.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Message({ role, content, toolCalls }) {
  return (
    <div className={`message ${role}`}>
      <div className={`message-bubble ${role}`}>
        <div className="message-content">
          {content.split("\n").map((line, i) => {
            const parts = line.split(/(\*\*.*?\*\*)/g);
            return (
              <p key={i}>
                {parts.map((part, j) => {
                  if (part.startsWith("**") && part.endsWith("**")) {
                    return <strong key={j}>{part.slice(2, -2)}</strong>;
                  }
                  if (part.startsWith("- ")) {
                    return <span key={j} className="list-item">{part}</span>;
                  }
                  return <span key={j}>{part}</span>;
                })}
              </p>
            );
          })}
        </div>

        {toolCalls && toolCalls.length > 0 && (
          <div className="tool-calls">
            {toolCalls.map((tc, i) => (
              <ToolCall key={i} tc={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
