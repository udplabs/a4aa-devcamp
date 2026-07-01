// =============================================================
// Simulated LLM for Z-Merchant
//
// This module simulates an LLM's behavior using pattern matching.
// The focus of this lab is on auth, not AI -- so we fake the LLM
// and keep the security layers real.
//
// LAB 2: Update to check authorization + trigger CIBA for
//        commit_quote_terms when terms are non-standard
// LAB 3: Add account contract intent detection (FGA)
// LAB 4: Add linked workspace docs intent detection (Token Vault)
// LAB 5: Route tool execution through MCP
// =============================================================

export interface AgentUser {
  sub: string;
  scope: string[];
  email?: string;
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
    // LAB 2: Add authorization check here BEFORE executing the tool
    // For non-standard quote commits (discount > 20% or terms !=
    // net-30), initiate the CIBA flow so the rep approves on device.
    // =============================================================

    // Execute the tool directly (no auth check in starter)
    const result = executeToolLocally(intent.toolName, intent.parameters);
    return {
      message: formatToolResponse(intent.toolName, result),
      toolCalls: [{ tool: intent.toolName, result, status: "success" }],
    };
  }

  return { message: generateResponse(message) };
}

function detectIntent(
  message: string
): { toolName?: string; parameters: Record<string, any> } {
  const lower = message.toLowerCase();

  // Catalog + buyer tier lookup (read, FGA-gated in Lab 3)
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
  // LAB 3: Add account contract intent detection here
  // LAB 4: Add linked workspace docs intent detection here
  // =============================================================

  // Google Doc draft (Token Vault federated call in Lab 4)
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

  // Slack triage post (Token Vault federated call in Lab 4)
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

  // Commit final quote terms (CIBA-gated when non-standard in Lab 2)
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
// LAB 5: Replace this with MCP client calls
// =============================================================
function executeToolLocally(
  name: string,
  args: Record<string, any>
): any {
  switch (name) {
    case "get_catalog_and_buyer_tier": {
      const basePrices: Record<string, number> = {
        "SKU-WX-42": 129.0,
        "SKU-WX-10": 42.5,
        "SKU-RT-88": 318.75,
      };
      const tierMultipliers: Record<string, number> = {
        acme: 0.82, // tier-2
        globex: 0.82, // tier-2
        initech: 0.9, // tier-1
        stark: 0.74, // tier-3
      };
      const tierLabels: Record<string, string> = {
        acme: "tier-2",
        globex: "tier-2",
        initech: "tier-1",
        stark: "tier-3",
      };
      const sku = (args.sku || "SKU-WX-42").toUpperCase();
      const accountId = (args.accountId || "acme").toLowerCase();
      const listPrice = basePrices[sku] ?? 99.0;
      const multiplier = tierMultipliers[accountId] ?? 1.0;
      return {
        accountId,
        sku,
        listPrice,
        buyerTier: tierLabels[accountId] ?? "tier-0",
        tierPrice: Number((listPrice * multiplier).toFixed(2)),
      };
    }

    case "create_google_doc":
      return {
        success: true,
        docId: `doc-${Date.now()}`,
        title: args.title || "Bulk quote draft",
        url: `https://docs.google.com/document/d/doc-${Date.now()}/edit`,
        timestamp: new Date().toISOString(),
      };

    case "post_slack_triage":
      return {
        success: true,
        channel: args.channel || "#wholesale-quote-triage",
        summary: args.summary,
        permalink: `https://retailzero.slack.com/archives/C0WQTRG/p${Date.now()}`,
        timestamp: new Date().toISOString(),
      };

    case "commit_quote_terms":
      return {
        success: true,
        accountId: args.accountId,
        quoteId: args.quoteId,
        discountPercent: args.discountPercent,
        paymentTerms: args.paymentTerms || "net-30",
        orderRef: `ORD-${Date.now()}`,
        timestamp: new Date().toISOString(),
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function formatToolResponse(toolName: string, result: any): string {
  switch (toolName) {
    case "get_catalog_and_buyer_tier":
      return `**${result.accountId.toUpperCase()}** on **${result.sku}** -- list ${result.listPrice}, buyer tier ${result.buyerTier}, tier price **${result.tierPrice}**.`;

    case "create_google_doc":
      return `Quote draft created: **${result.title}** -- ${result.url}`;

    case "post_slack_triage":
      return `Posted to **${result.channel}**: ${result.permalink}`;

    case "commit_quote_terms":
      return `Committed **${result.quoteId}** for **${result.accountId}** at **${result.discountPercent}% / ${result.paymentTerms}**. Order ref: \`${result.orderRef}\`.`;

    default:
      return JSON.stringify(result);
  }
}

function generateResponse(message: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("hello") ||
    lower.includes("hi") ||
    lower.includes("hey")
  ) {
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
