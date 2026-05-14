interface MessageProps {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ tool: string; result: any; status: string }>;
}

// Maps each tool to the security controls that fired on its call
// path. These badges let the rep see, at a glance, which A4AA
// pillar gated the action -- MCP (OBO + audience + scope) runs for
// every tool; Token Vault only fires when the tool calls a third
// party (Google, Slack); FGA fires on read/commit of account data.
const TOOL_BADGES: Record<string, string[]> = {
  get_catalog_and_buyer_tier: ["MCP (OBO)", "FGA"],
  create_google_doc: ["MCP (OBO)", "Token Vault -> Google"],
  post_slack_triage: ["MCP (OBO)", "Token Vault -> Slack"],
  commit_quote_terms: ["MCP (OBO)", "CIBA", "FGA"],
};

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
