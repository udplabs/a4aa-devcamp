interface MessageProps {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ tool: string; result: any; status: string }>;
}

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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
