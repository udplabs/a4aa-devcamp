interface ToolApprovalProps {
  toolName: string;
  bindingMessage: string;
  onApprove: () => void;
  onDeny: () => void;
}

// Renders the CIBA approval prompt for high-risk tools. The binding
// message is signed into the CIBA auth_req_id, so the text the rep
// sees here is the same text Auth0 attaches to the out-of-band push.
export function ToolApproval({
  toolName,
  bindingMessage,
  onApprove,
  onDeny,
}: ToolApprovalProps) {
  return (
    <div className="tool-approval">
      <div className="tool-approval-card">
        <div className="tool-approval-header">
          <span className="tool-approval-icon">&#9888;</span>
          <h3>Deal Desk Approval Required</h3>
        </div>

        <p>
          This quote exceeds standard discount or payment terms. Approve
          the request to let Z-Merchant commit the terms.
        </p>

        <div className="tool-details">
          <div className="tool-detail-row">
            <strong>Binding message:</strong>
            <blockquote className="binding-message">
              {bindingMessage}
            </blockquote>
          </div>
          <div className="tool-detail-row">
            <strong>Tool:</strong> <code>{toolName}</code>
          </div>
          <div className="tool-detail-row">
            <strong>Channel:</strong> Auth0 CIBA (out-of-band)
          </div>
        </div>

        <div className="tool-approval-actions">
          <button className="approve-button" onClick={onApprove}>
            Approve on device
          </button>
          <button className="deny-button" onClick={onDeny}>
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
