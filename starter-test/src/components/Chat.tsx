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
            <h2>Welcome to Voyager</h2>
            <p>Your AI travel concierge. Try asking about:</p>
            <div className="suggestions">
              <button
                className="suggestion"
                onClick={() => sendMessage("What's the weather in Bali?")}
              >
                Weather in Bali
              </button>
              <button
                className="suggestion"
                onClick={() => sendMessage("Show my trip itinerary")}
              >
                My trip itinerary
              </button>
              <button
                className="suggestion"
                onClick={() =>
                  sendMessage("Send a booking confirmation to my email")
                }
              >
                Send booking confirmation
              </button>
              <button
                className="suggestion"
                onClick={() => sendMessage("What documents do I have access to?")}
              >
                My documents
              </button>
              <button
                className="suggestion"
                onClick={() => sendMessage("Show my files from storage")}
              >
                External files
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
                <h3>Out-of-Band Approval Required</h3>
              </div>
              <p>
                The agent needs approval to execute{" "}
                <code>{pendingCIBA.toolName}</code>. A notification has been
                sent to your device.
              </p>
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
          placeholder="Ask about destinations, itineraries, or bookings..."
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
