// =============================================================
// OpenAI LLM Integration (Pre-built)
//
// This module replaces pattern matching with real OpenAI tool
// calling when OPENAI_API_KEY is set. Falls back to simulator
// if the API call fails.
//
// The security layers you build in the labs (JWT, CIBA, FGA,
// Token Vault, MCP) are enforced HERE -- between the LLM's
// tool selection and the actual tool execution.
//
// LAB 2: Add authorization check before tool execution
// LAB 3: Add document tool handling (FGA)
// LAB 4: Add external files tool handling (Token Vault)
// LAB 5: Route tool execution through MCP
// =============================================================

import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./llm/prompts";
import { getToolsForOpenAI } from "./llm/tools";
import { processMessage as simulatorFallback } from "./simulator";

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
  };
}

interface ToolCallResult {
  tool: string;
  result: any;
  status: "success" | "error" | "pending_consent";
}

// The OpenAI SDK speaks any OpenAI-compatible endpoint (LiteLLM proxy,
// Azure OpenAI, local Ollama, etc.) via baseURL. Leave OPENAI_BASE_URL
// unset to call OpenAI directly.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
});
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

export async function processMessage(
  message: string,
  conversationHistory: any[],
  user: AgentUser
): Promise<LLMResponse> {
  try {
    // Build message history for OpenAI
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversationHistory.map(
        (m: any): OpenAI.Chat.ChatCompletionMessageParam => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })
      ),
      { role: "user", content: message },
    ];

    // Call OpenAI with tool definitions
    const response = await openai.chat.completions.create({
      model: LLM_MODEL,
      max_tokens: 1024,
      messages,
      tools: getToolsForOpenAI(),
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    // No tool call -- return the text response
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return { message: assistantMessage.content || "" };
    }

    // Extract the first tool call
    const toolCall = assistantMessage.tool_calls[0];
    const toolName = toolCall.function.name;
    const parameters = JSON.parse(toolCall.function.arguments);

    console.log(`[LLM] Tool call: ${toolName}`, parameters);

    // =============================================================
    // LAB 2: Add authorization check here BEFORE executing the tool
    // For consent-required tools, initiate CIBA flow
    //
    // const authResult = checkToolAuthorization(user.sub, user.scope, toolName);
    // if (!authResult.authorized) { ... }
    // =============================================================

    // Execute the tool directly (no auth check in starter)
    const result = executeToolLocally(toolName, parameters);

    // Send tool result back to OpenAI for a natural response
    const followUp = await openai.chat.completions.create({
      model: LLM_MODEL,
      max_tokens: 1024,
      messages: [
        ...messages,
        assistantMessage,
        {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        },
      ],
    });

    const finalMessage = followUp.choices[0].message.content || "";

    return {
      message: finalMessage,
      toolCalls: [{ tool: toolName, result, status: "success" }],
    };
  } catch (error: any) {
    console.warn(`[LLM] Error: ${error.message}, falling back to simulator`);
    return simulatorFallback(message, conversationHistory, user);
  }
}

// =============================================================
// LAB 5: Replace this with MCP client calls
// =============================================================
function executeToolLocally(name: string, args: Record<string, any>): any {
  switch (name) {
    case "get_catalog_and_buyer_tier": {
      const basePrices: Record<string, number> = {
        "SKU-WX-42": 129.0,
        "SKU-WX-10": 42.5,
        "SKU-RT-88": 318.75,
      };
      const tierMultipliers: Record<string, number> = {
        acme: 0.82,
        globex: 0.82,
        initech: 0.9,
        stark: 0.74,
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

    // =============================================================
    // LAB 3: Add account contract tool execution here (FGA)
    // LAB 4: Add linked workspace docs tool execution here (Token Vault)
    // =============================================================

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
