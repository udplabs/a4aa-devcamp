import { useState } from "react";

// =============================================================
// LAB 01: Attach the rep's access token to every /api/* call
//         (getAccessTokenSilently from @auth0/auth0-react).
//
// LAB 02: When the backend returns pendingCIBA, poll
//         /api/ciba/status/:authReqId until the rep approves
//         on their device. Surface the binding message in the UI.
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

interface PendingCIBA {
  authReqId: string;
  toolName: string;
  bindingMessage?: string;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingApproval, setPendingApproval] =
    useState<PendingApproval | null>(null);
  const [pendingCIBA, setPendingCIBA] = useState<PendingCIBA | null>(null);

  // LAB 01: const { getAccessTokenSilently } = useAuth0();

  const sendMessage = async (content: string) => {
    const userMessage: ChatMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // =============================================================
      // LAB 01: Add Authorization header with access token
      // const token = await getAccessTokenSilently({
      //   authorizationParams: {
      //     audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      //     scope: "mcp:quote:read mcp:docs:create mcp:slack:post mcp:quote:commit",
      //   },
      // });
      // =============================================================

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // LAB 01: Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: content,
          conversationHistory: messages,
        }),
      });

      if (response.status === 401) {
        throw new Error("Unauthorized -- please log in again");
      }

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      if (data.pendingApproval) {
        setPendingApproval(data.pendingApproval);
      }

      // =============================================================
      // LAB 02: if (data.pendingCIBA) {
      //   setPendingCIBA({
      //     authReqId: data.pendingCIBA.authReqId,
      //     toolName: data.pendingCIBA.toolName,
      //     bindingMessage: data.pendingCIBA.bindingMessage,
      //   });
      //   pollCIBAStatus(data.pendingCIBA.authReqId, data.pendingCIBA.toolName);
      // }
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
    setPendingApproval(null);

    if (!approved) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Approval denied. I will not run ${toolName}. Anything else I can help with?`,
        },
      ]);
    }
  };

  // =============================================================
  // LAB 02: Implement this polling loop.
  //
  // const pollCIBAStatus = (authReqId: string, toolName: string) => {
  //   const interval = setInterval(async () => {
  //     const res = await fetch(`/api/ciba/status/${authReqId}`);
  //     const { status } = await res.json();
  //     if (status === "approved") {
  //       clearInterval(interval);
  //       setPendingCIBA(null);
  //       // re-dispatch the tool call; or let the backend resume.
  //     } else if (status === "denied" || status === "expired") {
  //       clearInterval(interval);
  //       setPendingCIBA(null);
  //       setMessages(prev => [...prev, {
  //         role: "assistant",
  //         content: `Approval ${status} for ${toolName}.`,
  //       }]);
  //     }
  //   }, 2000);
  // };
  // =============================================================

  return {
    messages,
    sendMessage,
    isLoading,
    pendingApproval,
    handleApproval,
    pendingCIBA,
  };
}
