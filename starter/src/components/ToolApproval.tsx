// =============================================================
// Tool Approval Dialog (pre-built)
// Renders a consent dialog when the agent needs approval
// to execute a high-risk tool.
//
// The approval flow is wired up in useChat.ts
// =============================================================

interface ToolApprovalProps {
  toolName: string;
  description: string;
  riskLevel: string;
  requiredScopes: string[];
  onApprove: () => void;
  onDeny: () => void;
}

export function ToolApproval({
  toolName,
  description,
  riskLevel,
  requiredScopes,
  onApprove,
  onDeny,
}: ToolApprovalProps) {
  const riskColors: Record<string, string> = {
    low: "#4caf50",
    medium: "#ff9800",
    high: "#f44336",
  };

  return (
    <div className="tool-approval">
      <div className="tool-approval-card">
        <div className="tool-approval-header">
          <span className="tool-approval-icon">&#9888;</span>
          <h3>Authorization Required</h3>
        </div>

        <p>
          The AI assistant wants to use a tool that requires your approval:
        </p>

        <div className="tool-details">
          <div className="tool-detail-row">
            <strong>Tool:</strong> <code>{toolName}</code>
          </div>
          <div className="tool-detail-row">
            <strong>Description:</strong> {description}
          </div>
          <div className="tool-detail-row">
            <strong>Risk Level:</strong>{" "}
            <span
              className="risk-badge"
              style={{ backgroundColor: riskColors[riskLevel] || "#999" }}
            >
              {riskLevel.toUpperCase()}
            </span>
          </div>
          <div className="tool-detail-row">
            <strong>Required Permissions:</strong>
            <ul>
              {requiredScopes.map((scope) => (
                <li key={scope}>
                  <code>{scope}</code>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="tool-approval-actions">
          <button className="approve-button" onClick={onApprove}>
            Approve
          </button>
          <button className="deny-button" onClick={onDeny}>
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
