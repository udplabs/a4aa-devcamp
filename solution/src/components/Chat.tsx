import { useState, useRef, useEffect } from "react";
import { Message } from "./Message";
import { ToolApproval } from "./ToolApproval";
import { useChat } from "../hooks/useChat";

export function Chat() {
  const { messages, sendMessage, isLoading, pendingApproval, handleApproval } =
    useChat();
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
                onClick={() =>
                  sendMessage("What's the weather in Bali?")
                }
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
