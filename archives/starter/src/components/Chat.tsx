import { useState, useRef, useEffect } from "react";
import { Message } from "./Message";
import { ToolApproval } from "./ToolApproval";
import { useChat } from "../hooks/useChat";

export function Chat() {
  const {
    messages,
    sendMessage,
    isLoading,
    pendingApproval,
    handleApproval,
    pendingCIBA,
  } = useChat();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input;
    setInput("");
    await sendMessage(message);
  };

  return (
    <div className="chat-container">
      <div className="messages-container">
        {messages.length === 0 && (
          <div className="empty-state">
            <h2>Welcome to Z-Merchant</h2>
            <p>RetailZero's wholesale quote agent. Try one of these:</p>
            <div className="suggestions">
              <button
                className="suggestion"
                onClick={() =>
                  sendMessage(
                    "Generate Q3 bulk quote for Acme Corp, 500 units SKU-WX-42 at tier-2 pricing."
                  )
                }
              >
                Acme tier-2 quote
              </button>
              <button
                className="suggestion"
                onClick={() =>
                  sendMessage("Draft a Google Doc quote for globex at tier-2.")
                }
              >
                Draft quote doc
              </button>
              <button
                className="suggestion"
                onClick={() =>
                  sendMessage("Post a triage summary to #wholesale-quote-triage.")
                }
              >
                Slack triage
              </button>
              <button
                className="suggestion"
                onClick={() =>
                  sendMessage("Commit the acme Q3 quote at 25% discount net-60.")
                }
              >
                Commit non-standard terms
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message
            key={i}
            role={msg.role}
            content={msg.content}
            toolCalls={msg.toolCalls}
          />
        ))}

        {isLoading && (
          <div className="message assistant">
            <div className="message-bubble assistant">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        {pendingApproval && (
          <ToolApproval
            toolName={pendingApproval.toolName}
            description={pendingApproval.description}
            riskLevel={pendingApproval.riskLevel}
            requiredScopes={pendingApproval.requiredScopes}
            onApprove={() => handleApproval(pendingApproval.toolName, true)}
            onDeny={() => handleApproval(pendingApproval.toolName, false)}
          />
        )}

        {pendingCIBA && (
          <div className="tool-approval">
            <div className="tool-approval-card">
              <div className="tool-approval-header">
                <span className="tool-approval-icon">&#128274;</span>
                <h3>Device Approval Required</h3>
              </div>
              <p>
                Z-Merchant needs approval to execute{" "}
                <code>{pendingCIBA.toolName}</code>. Check your device for a
                push notification.
              </p>
              {pendingCIBA.bindingMessage && (
                <div className="tool-details">
                  <div className="tool-detail-row">
                    <strong>Approving:</strong>{" "}
                    <em>{pendingCIBA.bindingMessage}</em>
                  </div>
                </div>
              )}
              <div className="tool-details">
                <div className="tool-detail-row">
                  <strong>Request ID:</strong>{" "}
                  <code>{pendingCIBA.authReqId}</code>
                </div>
                <div className="tool-detail-row">
                  <strong>Status:</strong> Waiting for approval...
                </div>
              </div>
              <div
                className="typing-indicator"
                style={{ justifyContent: "center", padding: "8px 0" }}
              >
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe the deal, or ask Z-Merchant to draft or commit a quote..."
          disabled={isLoading}
          className="message-input"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="send-button"
        >
          Send
        </button>
      </form>
    </div>
  );
}
