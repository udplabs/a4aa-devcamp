// =============================================================
// useChat -- frontend chat state + CIBA polling
//
// Lab 01: getAccessTokenSilently() fetches a short-lived JWT
// from Auth0 (using the cached refresh token) and attaches it
// to every /api/chat request. The backend validates this token
// in server/middleware/auth.js.
//
// Bonus CIBA: when the backend returns { pendingCIBA } instead
// of a response, the agent paused to wait for rep approval. This
// hook starts polling /api/ciba/status/:authReqId. Once the rep
// approves on their Guardian device (or via the demo approve
// button), the poll resolves and the message is re-sent.
// =============================================================

import { useState, useRef, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRuntimeConfig } from "../config/runtimeConfig";

export function useChat() {
  const { getAccessTokenSilently } = useAuth0();
  const { audience } = useRuntimeConfig();
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingCIBA, setPendingCIBA] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const sendMessage = async (content) => {
    const userMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Lab 01 -- silently refresh and return the user's JWT.
      // The token is scoped to `audience` so the backend can validate it.
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience,
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

      // Bonus CIBA -- the backend paused a high-risk tool and returned
      // { pendingCIBA: { authReqId, bindingMessage, interval } }.
      // Start polling so we can resume the commit once the rep approves.
      if (data.pendingCIBA) {
        setPendingCIBA(data.pendingCIBA);
        startPolling(data.pendingCIBA);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${error.message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const startPolling = (ciba) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    const intervalMs = Math.max(ciba.interval * 1000, 2000);

    pollRef.current = window.setInterval(async () => {
      try {
        const token = await getAccessTokenSilently({
          authorizationParams: {
            audience,
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
  const handleCIBADecision = async (approved) => {
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
