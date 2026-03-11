import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ tool: string; result: any; status: string }>;
}

interface PendingApproval {
  toolName: string;
  description: string;
  riskLevel: string;
  requiredScopes: string[];
}

export function useChat() {
  const { getAccessTokenSilently } = useAuth0();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingApproval, setPendingApproval] =
    useState<PendingApproval | null>(null);

  const sendMessage = async (content: string) => {
    const userMessage: ChatMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Get an access token for the API
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: import.meta.env.VITE_AUTH0_AUDIENCE,
          scope: "chat:send",
        },
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: content,
          conversationHistory: messages,
        }),
      });

      if (response.status === 401) {
        throw new Error("Unauthorized - please log in again");
      }

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      // Check for pending approval from agent authorization
      if (data.pendingApproval) {
        setPendingApproval(data.pendingApproval);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.message,
          toolCalls: data.toolCalls,
        },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${error.message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproval = async (toolName: string, approved: boolean) => {
    const token = await getAccessTokenSilently({
      authorizationParams: {
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      },
    });

    const endpoint = approved ? "/api/consent/approve" : "/api/consent/deny";

    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ toolName }),
    });

    setPendingApproval(null);

    if (approved) {
      // Re-send the last user message now that consent is recorded
      const lastUserMessage = messages.filter((m) => m.role === "user").pop();
      if (lastUserMessage) {
        await sendMessage(lastUserMessage.content);
      }
    } else {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Action denied. I won't use the ${toolName} tool. Is there anything else I can help with?`,
        },
      ]);
    }
  };

  return { messages, sendMessage, isLoading, pendingApproval, handleApproval };
}
