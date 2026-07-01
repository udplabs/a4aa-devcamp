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
            <h2>Z-Merchant</h2>
            <p>
              RetailZero's wholesale quote agent. Draft, route, and commit
              B2B deals end-to-end. Try:
            </p>
            <div className="suggestions">
              <button
                className="suggestion"
                onClick={() => sendMessage("Quote SKU-WX-42 for Acme")}
              >
                Quote SKU-WX-42 for Acme
              </button>
              <button
                className="suggestion"
                onClick={() => sendMessage("Draft the Acme bulk quote")}
              >
                Draft the Acme bulk quote
              </button>
              <button
                className="suggestion"
                onClick={() =>
                  sendMessage("Post the Acme quote to the deal-desk triage")
                }
              >
                Post to deal-desk triage
              </button>
              <button
                className="suggestion"
                onClick={() =>
                  sendMessage(
                    "Commit the Acme quote at 25% discount, net-60"
                  )
                }
              >
                Commit at 25% discount (CIBA)
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
          placeholder="Ask me to quote, draft, triage, or commit a wholesale deal..."
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
