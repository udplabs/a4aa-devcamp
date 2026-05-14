// =============================================================
// Simulated LLM for Z-Merchant
//
// This module simulates an LLM's behavior using pattern matching.
// The focus of this lab is on auth, not AI -- so we fake the LLM
// and keep the security layers real.
//
// LAB 02: Trigger CIBA for commit_quote_terms (non-standard terms)
// LAB 03: FGA-gate get_catalog_and_buyer_tier
// LAB 04: Route create_google_doc / post_slack_triage through Token Vault
// LAB 05: Route all tool execution through the MCP client (OBO)
// =============================================================

export interface AgentUser {
  sub: string;
  scope: string[];
  email?: string;
  accessToken?: string;
}

export interface LLMResponse {
  message: string;
  toolCalls?: ToolCallResult[];
  pendingApproval?: {
    toolName: string;
    description: string;
    riskLevel: string;
    requiredScopes: string[];
  };
  pendingCIBA?: {
    authReqId: string;
    toolName: string;
    expiresIn: number;
    interval: number;
    bindingMessage?: string;
  };
}

interface ToolCallResult {
  tool: string;
  result: any;
  status: "success" | "error" | "pending_consent";
}

export async function processMessage(
  message: string,
  _conversationHistory: any[],
  _user: AgentUser
): Promise<LLMResponse> {
  const intent = detectIntent(message);

  if (intent.toolName) {
    // =============================================================
    // LAB 02: If intent is commit_quote_terms AND (discount > 20 ||
    // paymentTerms !== "net-30"), build a binding message from the
    // parameters and call initiateCIBA(...). Return pendingCIBA so
    // the frontend can poll /api/ciba/status/:authReqId.
    // =============================================================

    // =============================================================
    // LAB 05: Replace the stub below with an MCP client call that
    // carries the rep's access token for OBO exchange:
    //   const result = await mcpClient.callTool(intent.toolName,
    //                                           intent.parameters,
    //                                           _user.accessToken!);
    // =============================================================
    try {
      const result = executeToolLocally(intent.toolName, intent.parameters);
      return {
        message: formatToolResponse(intent.toolName, result),
        toolCalls: [{ tool: intent.toolName, result, status: "success" }],
      };
    } catch (err: any) {
      return {
        message: `Tool "${intent.toolName}" is not wired up yet (${err.message}).`,
        toolCalls: [
          { tool: intent.toolName, result: { error: err.message }, status: "error" },
        ],
      };
    }
  }

  return { message: generateResponse(message) };
}

function detectIntent(
  message: string
): { toolName?: string; parameters: Record<string, any> } {
  const lower = message.toLowerCase();

  // =============================================================
  // LAB 03 -- catalog / buyer tier intent (read, FGA-gated)
  // Example: "what's the tier-2 price for SKU-WX-42 on acme?"
  // =============================================================
  if (
    lower.includes("catalog") ||
    lower.includes("pricing") ||
    lower.includes("tier") ||
    /sku-[a-z0-9-]+/i.test(message)
  ) {
    return {
      toolName: "get_catalog_and_buyer_tier",
      parameters: {
        accountId: extractAccountId(message) || "acme",
        sku: extractSku(message) || "SKU-WX-42",
      },
    };
  }

  // =============================================================
  // LAB 04 -- Google Docs intent (Token Vault federated call)
  // =============================================================
  if (
    (lower.includes("draft") || lower.includes("create") || lower.includes("doc")) &&
    (lower.includes("quote") || lower.includes("google") || lower.includes("document"))
  ) {
    return {
      toolName: "create_google_doc",
      parameters: {
        title: `Quote draft -- ${extractAccountId(message) || "acme"}`,
        body: "Bulk quote draft",
      },
    };
  }

  // =============================================================
  // LAB 04 -- Slack intent (Token Vault federated call)
  // =============================================================
  if (
    (lower.includes("slack") || lower.includes("triage") || lower.includes("post")) &&
    (lower.includes("quote") || lower.includes("deal") || lower.includes("finance"))
  ) {
    return {
      toolName: "post_slack_triage",
      parameters: {
        channel: "#wholesale-quote-triage",
        summary: "Quote summary placeholder",
      },
    };
  }

  // =============================================================
  // LAB 02 -- commit intent (CIBA-gated when non-standard)
  // Example: "commit the quote at 25% discount net-60"
  // =============================================================
  if (
    lower.includes("commit") ||
    lower.includes("finalize") ||
    lower.includes("approve quote")
  ) {
    const discountMatch = message.match(/(\d+(?:\.\d+)?)\s*%/);
    const termsMatch = message.match(/net-?(\d+)/i);
    return {
      toolName: "commit_quote_terms",
      parameters: {
        accountId: extractAccountId(message) || "acme",
        quoteId: extractQuoteId(message) || "Q3-draft",
        discountPercent: discountMatch ? parseFloat(discountMatch[1]) : 10,
        paymentTerms: termsMatch ? `net-${termsMatch[1]}` : "net-30",
      },
    };
  }

  return { parameters: {} };
}

function extractAccountId(message: string): string | null {
  const match = message.match(/\b(acme|globex|initech|stark)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function extractSku(message: string): string | null {
  const match = message.match(/sku-[a-z0-9-]+/i);
  return match ? match[0].toUpperCase() : null;
}

function extractQuoteId(message: string): string | null {
  const match = message.match(/\b(Q[1-4]-[A-Za-z0-9-]+)\b/);
  return match ? match[1] : null;
}

// =============================================================
// LAB 05: Replace this with an MCP client call.
// Until Lab 05, the starter intentionally throws so the attendee
// sees the missing link.
// =============================================================
function executeToolLocally(
  name: string,
  _args: Record<string, any>
): any {
  throw new Error(
    `Tool execution not implemented: ${name}. Route through MCP client (see Lab 05).`
  );
}

function formatToolResponse(_toolName: string, result: any): string {
  return JSON.stringify(result, null, 2);
}

function generateResponse(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello -- I'm Z-Merchant, RetailZero's wholesale quote agent. I can help you:\n\n- Look up catalog pricing and buyer tier for a wholesale account\n- Draft a bulk quote as a Google Doc\n- Post a triage summary to #wholesale-quote-triage\n- Commit final quote terms (non-standard terms require your device approval)\n\nWhat quote are we building today?";
  }

  if (lower.includes("help") || lower.includes("what can you")) {
    return "Z-Merchant tools:\n\n1. **Catalog + buyer tier** -- SKU pricing for a wholesale account (FGA-gated)\n2. **Draft Google Doc** -- Bulk quote draft in the rep's Workspace\n3. **Slack triage post** -- Summary to #wholesale-quote-triage for finance sign-off\n4. **Commit quote terms** -- Final commit to the order system (CIBA-approved for non-standard discounts)\n\nJust describe the deal.";
  }

  if (lower.includes("thank")) {
    return "You're welcome. Let me know when you need the next quote drafted.";
  }

  return `I understand you said: "${message}". Try: "Generate Q3 bulk quote for Acme, 500 units SKU-WX-42 at tier-2 pricing," or "Commit the quote at 25% discount net-60."`;
}
