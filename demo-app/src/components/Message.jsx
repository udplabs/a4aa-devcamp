// Maps each tool to the security controls that fired on its call path.
// MCP (OBO) runs for every tool; FGA gates read/share access per user;
// Token Vault exchanges for a CRM credential on log; CIBA gates
// irreversible external actions.
const TOOL_BADGES = {
  search_documents:  ["MCP (OBO)", "FGA"],
  get_document:      ["MCP (OBO)", "FGA"],
  log_crm_activity:  ["MCP (OBO)", "Token Vault -> CRM"],
  share_document:    ["MCP (OBO)", "CIBA", "FGA"],
};

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
                    return (
                      <span key={j} className="list-item">
                        {part}
                      </span>
                    );
                  }
                  return <span key={j}>{part}</span>;
                })}
              </p>
            );
          })}
        </div>

        {toolCalls && toolCalls.length > 0 && (
          <div className="tool-calls">
            {toolCalls.map((tc, i) => {
              const badges = TOOL_BADGES[tc.tool] || ["MCP (OBO)"];
              return (
                <div key={i} className={`tool-call ${tc.status}`}>
                  <div className="tool-call-row">
                    <span className="tool-call-icon">
                      {tc.status === "success" ? "\u2713" : "\u2717"}
                    </span>
                    <span className="tool-call-name">{tc.tool}</span>
                    <span className="tool-call-status">{tc.status}</span>
                  </div>
                  <div className="tool-call-badges">
                    {badges.map((b) => (
                      <span key={b} className="tool-call-badge">
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
