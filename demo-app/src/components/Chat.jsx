import { useState, useRef, useEffect } from "react";
import { Message } from "./Message";
import { useChat } from "../hooks/useChat";

const CIBA_TIMEOUT_SECONDS = 60;

function CIBAWaiting({ ciba, onApprove, onDeny }) {
  const [secondsLeft, setSecondsLeft] = useState(CIBA_TIMEOUT_SECONDS);
  const timedOut = secondsLeft <= 0;

  useEffect(() => {
    if (timedOut) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, timedOut]);

  const pct = (secondsLeft / CIBA_TIMEOUT_SECONDS) * 100;

  return (
    <div className="message assistant">
      <div className="message-bubble assistant ciba-waiting-bubble">
        {timedOut ? (
          <p className="ciba-timeout-msg">Approval timed out. Re-send your message to try again.</p>
        ) : (
          <>
            <div className="ciba-waiting-header">
              <span className="spinner-sm" />
              <span className="ciba-waiting-label">Waiting for approval on your device</span>
            </div>
            <p className="ciba-binding-msg">{ciba.bindingMessage}</p>
            <div className="ciba-timer-bar">
              <div className="ciba-timer-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="ciba-timer-label">{secondsLeft}s remaining</p>
            <div className="ciba-demo-actions">
              <span className="ciba-demo-label">Demo controls:</span>
              <button className="ciba-approve-btn" onClick={onApprove}>Approve</button>
              <button className="ciba-deny-btn" onClick={onDeny}>Deny</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Chat() {
  const {
    messages,
    sendMessage,
    isLoading,
    pendingCIBA,
    handleCIBADecision,
  } = useChat();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e) => {
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
            <h2>Nexus</h2>
            <p>
              Your company knowledge assistant — secured by identity. Every
              document retrieved is FGA-gated to your access level. Try:
            </p>
            <div className="suggestions">
              <button
                className="suggestion"
                onClick={() => sendMessage("Find the Q3 roadmap")}
              >
                Find the Q3 roadmap
              </button>
              <button
                className="suggestion"
                onClick={() => sendMessage("Show me the employee handbook")}
              >
                Show me the employee handbook
              </button>
              <button
                className="suggestion"
                onClick={() =>
                  sendMessage("Log that I viewed the security policy in the CRM")
                }
              >
                Log CRM activity (Token Vault)
              </button>
              <button
                className="suggestion"
                onClick={() =>
                  sendMessage(
                    "Share the Q3 roadmap with vendor@acme.com"
                  )
                }
              >
                Share document (CIBA)
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

        {pendingCIBA && (
          <CIBAWaiting
            ciba={pendingCIBA}
            onApprove={() => handleCIBADecision(true)}
            onDeny={() => handleCIBADecision(false)}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-suggestions">
        <button className="chat-suggestion" onClick={() => sendMessage("Find the Q3 roadmap")} disabled={isLoading}>Find the Q3 roadmap</button>
        <button className="chat-suggestion" onClick={() => sendMessage("Show me the employee handbook")} disabled={isLoading}>Employee handbook</button>
        <button className="chat-suggestion" onClick={() => sendMessage("Log that I viewed the security policy in the CRM")} disabled={isLoading}>Log CRM activity</button>
        <button className="chat-suggestion" onClick={() => sendMessage("Share the Q3 roadmap with vendor@acme.com")} disabled={isLoading}>Share document (CIBA)</button>
      </div>

      <form className="input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me to search, read, log a CRM activity, or share a document..."
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
