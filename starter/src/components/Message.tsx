interface MessageProps {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ tool: string; result: any; status: string }>;
}

// =============================================================
// LAB 06: Attribute each tool call with an A4AA pillar badge so
// the rep can see which security control fired. Example:
//
//   const TOOL_BADGES: Record<string, string> = {
//     get_catalog_and_buyer_tier: "FGA + MCP (OBO)",
//     create_google_doc: "Token Vault -> Google + MCP (OBO)",
//     post_slack_triage: "Token Vault -> Slack + MCP (OBO)",
//     commit_quote_terms: "CIBA + MCP (OBO)",
//   };
//
// Render TOOL_BADGES[tc.tool] under the tool name.
// =============================================================

export function Message({ role, content, toolCalls }: MessageProps) {
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
            {toolCalls.map((tc, i) => (
              <div key={i} className={`tool-call ${tc.status}`}>
                <span className="tool-call-icon">
                  {tc.status === "success" ? "\u2713" : "\u2717"}
                </span>
                <span className="tool-call-name">{tc.tool}</span>
                <span className="tool-call-status">{tc.status}</span>
                {/* LAB 06: render TOOL_BADGES[tc.tool] here */}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
