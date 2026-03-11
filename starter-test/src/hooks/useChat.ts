import { useState } from "react";

// =============================================================
// LAB 2: Add access token to fetch requests
// See: lab-guide/02-chat-interface.md - Step 5
//
// LAB 3: Add pendingApproval state and handleApproval function
// See: lab-guide/03-protect-the-api.md - Step 6
// =============================================================

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  // LAB 2: Uncomment and use this for authenticated requests
  // const { getAccessTokenSilently } = useAuth0();

  const sendMessage = async (content: string) => {
    const userMessage: ChatMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // =============================================================
      // LAB 2: Add Authorization header with access token
      // const token = await getAccessTokenSilently({
      //   authorizationParams: {
      //     audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      //     scope: "chat:send",
      //   },
      // });
      // =============================================================

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // LAB 2: Add this header:
          // Authorization: `Bearer ${token}`,
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

      // LAB 3: Check for pending approval
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

  // =============================================================
  // LAB 3: Implement handleApproval
  // See: lab-guide/03-protect-the-api.md - Step 6
  // =============================================================
  const handleApproval = async (toolName: string, approved: boolean) => {
    // LAB 3: Implement this function
    // 1. Get access token
    // 2. POST to /api/consent/approve or /api/consent/deny
    // 3. Clear pendingApproval
    // 4. If approved, re-send the last user message

    setPendingApproval(null);

    if (!approved) {
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
