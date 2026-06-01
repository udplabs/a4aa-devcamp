// =============================================================
// Pattern-matching Simulator -- default agent runtime
//
// Runs when OPENAI_API_KEY is absent. Detects intent from simple
// regex matches and routes to the MCP-backed tool registry.
//
// All tools route through the MCP client (see ../tools/registry.ts
// -> executeTool -> ../mcp/client.ts). Authorization (scope, FGA,
// Token Vault) happens at the MCP server boundary -- this file is
// just the "what did the user ask for" layer.
//
// FUTURE: Swapping this module for the Claude Agent SDK only
// requires rewriting processMessage(); the registry and MCP
// layers stay identical. See ../llm.ts for the parallel comment.
// =============================================================

import {
  checkToolAuthorization,
  AuthorizationResult,
} from "./middleware/agent-auth";
import { executeTool } from "./tools/registry";
import { initiateCIBA, buildQuoteCommitBindingMessage } from "./middleware/ciba";
import type { Tenant } from "./platform/tenant";

export interface AgentUser {
  sub: string;
  scope: string[];
  email?: string;
  accessToken?: string;
}

export interface LLMResponse {
  message: string;
  toolCalls?: ToolCallResult[];
  pendingApproval?: AuthorizationResult["consentDetails"];
  pendingCIBA?: {
    authReqId: string;
    toolName: string;
    bindingMessage: string;
    expiresIn: number;
    interval: number;
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
  user: AgentUser,
  tenant?: Tenant
): Promise<LLMResponse> {
  const intent = detectIntent(message);

  if (!intent.toolName) {
    return { message: generateResponse(message) };
  }

  // Authorization gate: scopes + CIBA for high-risk tools.
  const authResult = checkToolAuthorization(user.sub, user.scope, intent.toolName);

  if (!authResult.authorized) {
    if (authResult.requiresConsent) {
      const bindingMessage =
        intent.toolName === "commit_quote_terms"
          ? buildQuoteCommitBindingMessage({
              accountId: intent.parameters.accountId || "unknown account",
              discountPercent: intent.parameters.discountPercent,
              paymentTerms: intent.parameters.paymentTerms,
            })
          : `Approve use of ${intent.toolName}`;

      const ciba = await initiateCIBA(
        user.sub,
        user.email || "",
        intent.toolName,
        authResult.tool!.requiredScopes.join(" "),
        bindingMessage,
        tenant
      );

      return {
        message: `I'm ready to commit these terms, but this requires your approval. A prompt has been sent to your device: *"${bindingMessage}"*`,
        pendingCIBA: {
          authReqId: ciba.authReqId,
          toolName: intent.toolName,
          bindingMessage: ciba.bindingMessage,
          expiresIn: ciba.expiresIn,
          interval: ciba.interval,
        },
      };
    }
    return {
      message: `I don't have permission to use ${intent.toolName}. ${authResult.reason}`,
    };
  }

  // Route through MCP (scope, audience, OBO enforced there).
  try {
    const result = await executeTool(
      intent.toolName,
      intent.parameters,
      user.accessToken
    );
    return {
      message: formatToolResponse(intent.toolName, result),
      toolCalls: [{ tool: intent.toolName, result, status: "success" }],
    };
  } catch (error: any) {
    return {
      message: `Failed to execute ${intent.toolName}: ${error.message}`,
      toolCalls: [{ tool: intent.toolName, result: null, status: "error" }],
    };
  }
}

// ---- Intent detection -------------------------------------------

function detectIntent(
  message: string
): { toolName?: string; parameters: Record<string, any> } {
  const lower = message.toLowerCase();

  // commit terms / final / approve / close -> commit_quote_terms
  if (
    lower.includes("commit") ||
    lower.includes("finalize") ||
    lower.includes("close the quote") ||
    (lower.includes("approve") && lower.includes("discount"))
  ) {
    return {
      toolName: "commit_quote_terms",
      parameters: {
        accountId: extractAccount(message) || "acme",
        quoteId: `q-${Date.now()}`,
        discountPercent: extractDiscount(message),
        paymentTerms: extractTerms(message),
      },
    };
  }

  // post to slack / notify deal desk -> post_slack_triage
  if (
    lower.includes("slack") ||
    lower.includes("triage") ||
    lower.includes("deal desk") ||
    lower.includes("notify")
  ) {
    return {
      toolName: "post_slack_triage",
      parameters: {
        channel: "#wholesale-quote-triage",
        summary:
          extractSummary(message) ||
          "New quote draft ready for deal-desk review.",
      },
    };
  }

  // draft / create / write doc / mutual action plan -> create_google_doc
  if (
    lower.includes("draft") ||
    lower.includes("create doc") ||
    lower.includes("google doc") ||
    lower.includes("generate quote doc")
  ) {
    return {
      toolName: "create_google_doc",
      parameters: {
        title:
          extractTitle(message) || "Bulk Quote Draft",
        body:
          extractSummary(message) ||
          "Draft of wholesale quote generated by Z-Merchant.",
      },
    };
  }

  // quote / price / catalog / tier -> get_catalog_and_buyer_tier
  if (
    lower.includes("quote") ||
    lower.includes("price") ||
    lower.includes("catalog") ||
    lower.includes("tier") ||
    lower.includes("sku")
  ) {
    return {
      toolName: "get_catalog_and_buyer_tier",
      parameters: {
        accountId: extractAccount(message) || "acme",
        sku: extractSku(message) || "SKU-WX-42",
      },
    };
  }

  return { parameters: {} };
}

// ---- Parameter extraction ---------------------------------------

function extractAccount(message: string): string | null {
  const named = message.match(/\b(acme|globex|initech|stark)\b/i);
  if (named) return named[1].toLowerCase();
  const explicit = message.match(/account[:\s]+([a-zA-Z0-9_-]+)/i);
  return explicit ? explicit[1].toLowerCase() : null;
}

function extractSku(message: string): string | null {
  const match = message.match(/SKU-[A-Z0-9-]+/i);
  return match ? match[0].toUpperCase() : null;
}

function extractDiscount(message: string): number {
  const match = message.match(/(\d{1,2})\s*%/);
  return match ? parseInt(match[1], 10) : 15;
}

function extractTerms(message: string): string | undefined {
  const match = message.match(/net[-\s]?(\d{2,3})/i);
  return match ? `net-${match[1]}` : undefined;
}

function extractTitle(message: string): string | null {
  const match = message.match(/titled?\s+["']?([^"'\n]+?)["']?(?:$|[,.])/i);
  return match ? match[1].trim() : null;
}

function extractSummary(message: string): string | null {
  return message.length > 20 ? message.trim() : null;
}

// ---- Response formatting ----------------------------------------

function formatToolResponse(toolName: string, result: any): string {
  if (result && result.success === false) {
    return `**Tool error:** ${result.error}`;
  }
  switch (toolName) {
    case "get_catalog_and_buyer_tier": {
      const { account, sku } = result;
      return `**${account.name}** (${account.tier}, ${account.segment}) — **${sku.name}** list $${sku.listPrice}, tier price **$${sku.tierPrice}**.`;
    }
    case "create_google_doc":
      return `Drafted **${result.title}** in Google Docs. [Open doc](${result.url})`;
    case "post_slack_triage":
      return `Posted to **${result.channel}**. [Open in Slack](${result.permalink})`;
    case "commit_quote_terms": {
      const c = result.committed;
      return `Committed quote **${c.quoteId}** for **${c.accountId}** — ${c.discountPercent}% discount, ${c.paymentTerms}.`;
    }
    default:
      return JSON.stringify(result);
  }
}

function generateResponse(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello! I'm Z-Merchant, RetailZero's wholesale quote agent. I can help you:\n\n- Look up **catalog pricing and buyer tiers** for a wholesale account\n- **Draft a quote doc** in Google Docs\n- **Post a quote summary** to the deal-desk triage channel\n- **Commit final terms** (with approval for non-standard discounts)\n\nTry: *\"Quote SKU-WX-42 for Acme\"* or *\"Draft the Acme bulk quote\"*.";
  }
  if (lower.includes("help") || lower.includes("what can you")) {
    return "I handle wholesale quote prep end-to-end:\n\n1. **Lookup** — catalog price + buyer tier (FGA-gated by account ownership)\n2. **Draft** — Google Doc in your Workspace (Token Vault)\n3. **Triage** — post to #wholesale-quote-triage (Token Vault)\n4. **Commit** — final terms to the order system (CIBA-gated for non-standard discounts)\n\nAsk me naturally.";
  }
  if (lower.includes("thank")) {
    return "You're welcome. Ping me on the next deal.";
  }
  return `I heard: "${message}". Try asking me to look up a quote, draft the doc, notify the deal desk, or commit terms.`;
}
