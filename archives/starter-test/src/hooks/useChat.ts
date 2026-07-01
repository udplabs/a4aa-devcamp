import { useState } from "react";

// =============================================================
// LAB 1: Add access token to fetch requests
// See: lab-guide/01-user-authentication.md - Step 10
//
// LAB 2: Add pendingCIBA state and polling
// See: lab-guide/02-async-authorization-ciba.md - Step 6
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
  const [pendingApproval, setPendingApproval] =
    useState<PendingApproval | null>(null);
  const [pendingCIBA, setPendingCIBA] = useState<{
    authReqId: string;
    toolName: string;
  } | null>(null);

  // LAB 1: Uncomment and use this for authenticated requests
  // const { getAccessTokenSilently } = useAuth0();

  const sendMessage = async (content: string) => {
    const userMessage: ChatMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // =============================================================
      // LAB 1: Add Authorization header with access token
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
          // LAB 1: Add this header:
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

      // Check for pending approval (consent-required tools)
      if (data.pendingApproval) {
        setPendingApproval(data.pendingApproval);
      }

      // =============================================================
      // LAB 2: Check for pendingCIBA and start polling
      // if (data.pendingCIBA) { ... }
      // =============================================================

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
    // =============================================================
    // LAB 2: Implement CIBA-based approval flow
    // See: lab-guide/02-async-authorization-ciba.md
    // =============================================================

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

  return {
    messages,
    sendMessage,
    isLoading,
    pendingApproval,
    handleApproval,
    pendingCIBA,
  };
}
