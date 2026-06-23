import { useState, useRef, useEffect } from "react";
import { Message } from "./Message";
import { ToolApproval } from "./ToolApproval";
import { useChat } from "../hooks/useChat";

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
          <ToolApproval
            toolName={pendingCIBA.toolName}
            bindingMessage={pendingCIBA.bindingMessage}
            onApprove={() => handleCIBADecision(true)}
            onDeny={() => handleCIBADecision(false)}
          />
        )}

        <div ref={messagesEndRef} />
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
