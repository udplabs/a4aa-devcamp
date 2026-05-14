import { useState, useRef, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ tool: string; result: any; status: string }>;
}

// CIBA approval payload surfaced by the backend when a high-risk
// tool (e.g. commit_quote_terms) needs out-of-band rep approval.
export interface PendingCIBA {
  authReqId: string;
  toolName: string;
  bindingMessage: string;
  expiresIn: number;
  interval: number;
}

export function useChat() {
  const { getAccessTokenSilently } = useAuth0();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingCIBA, setPendingCIBA] = useState<PendingCIBA | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const sendMessage = async (content: string) => {
    const userMessage: ChatMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
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
        throw new Error("Unauthorized -- please log in again");
      }

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.message,
          toolCalls: data.toolCalls,
        },
      ]);

      // High-risk tools return pendingCIBA instead of executing. We
      // kick off status polling so we can resume the flow once the
      // rep approves the prompt on their device.
      if (data.pendingCIBA) {
        setPendingCIBA(data.pendingCIBA);
        startPolling(data.pendingCIBA);
      }
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${error.message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const startPolling = (ciba: PendingCIBA) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    const intervalMs = Math.max(ciba.interval * 1000, 2000);

    pollRef.current = window.setInterval(async () => {
      try {
        const token = await getAccessTokenSilently({
          authorizationParams: {
            audience: import.meta.env.VITE_AUTH0_AUDIENCE,
          },
        });
        const res = await fetch(`/api/ciba/status/${ciba.authReqId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();

        if (payload.status === "approved") {
          stopPolling();
          setPendingCIBA(null);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Approval received. Committing ${ciba.toolName}.`,
            },
          ]);
          const lastUser = messages.filter((m) => m.role === "user").pop();
          if (lastUser) await sendMessage(lastUser.content);
        } else if (
          payload.status === "denied" ||
          payload.status === "expired"
        ) {
          stopPolling();
          setPendingCIBA(null);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                payload.status === "denied"
                  ? `Approval denied. ${ciba.toolName} was not executed.`
                  : `Approval timed out. Re-send the request when you're ready.`,
            },
          ]);
        }
      } catch {
        // swallow; next tick will retry
      }
    }, intervalMs);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // Demo helper: approve or deny the CIBA request directly from
  // the UI. In production the rep would approve via Auth0 Guardian
  // on their device; this shortcut keeps the lab offline-runnable.
  const handleCIBADecision = async (approved: boolean) => {
    if (!pendingCIBA) return;
    const endpoint = approved
      ? `/api/ciba/approve/${pendingCIBA.authReqId}`
      : `/api/ciba/deny/${pendingCIBA.authReqId}`;
    await fetch(endpoint, { method: "POST" });
  };

  return {
    messages,
    sendMessage,
    isLoading,
    pendingCIBA,
    handleCIBADecision,
  };
}
