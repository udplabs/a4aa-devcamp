// =============================================================
// OpenAI LLM Integration -- Z-Merchant
//
// Replaces the pattern-matching simulator with real tool calling
// when OPENAI_API_KEY is set. Falls back to the simulator if the
// API call fails.
//
// All security layers are enforced between the LLM's tool choice
// and the actual MCP call:
//   - JWT scopes         (Lab 01)
//   - CIBA consent gate  (Lab 02) -- for commit_quote_terms
//   - FGA access check   (Lab 03) -- enforced at the MCP server
//   - Token Vault mint   (Lab 04) -- enforced at the MCP server
//   - MCP routing        (Lab 05) -- audience + OBO + scope
//
// FUTURE: Claude Agent SDK adapter.
// To swap this file for the Claude Agent SDK, rewrite the body
// of processMessage() to drive a Claude tool-use loop. The tool
// registry (./tools/registry.ts), MCP layer, Token Vault, FGA,
// and CIBA middleware are framework-agnostic and do not need to
// change. Keep the LLMResponse shape stable so the frontend and
// the /api/chat handler in ./index.ts keep working.
// =============================================================

import OpenAI from "openai";
import { SYSTEM_PROMPT_FULL } from "./llm/prompts";
import { getToolsForOpenAI } from "./llm/tools";
import { processMessage as simulatorFallback } from "./simulator";
import {
  checkToolAuthorization,
  AuthorizationResult,
} from "./middleware/agent-auth";
import { executeTool } from "./tools/registry";
import { initiateCIBA, buildQuoteCommitBindingMessage } from "./middleware/ciba";

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
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT_FULL },
      ...conversationHistory.map(
        (m: any): OpenAI.Chat.ChatCompletionMessageParam => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })
      ),
      { role: "user", content: message },
    ];

    const response = await openai.chat.completions.create({
      model: LLM_MODEL,
      max_tokens: 1024,
      messages,
      tools: getToolsForOpenAI(),
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return { message: assistantMessage.content || "" };
    }

    const toolCall = assistantMessage.tool_calls[0];
    const toolName = toolCall.function.name;
    const parameters = JSON.parse(toolCall.function.arguments);

    console.log(`[LLM] Tool call: ${toolName}`, parameters);

    const authResult = checkToolAuthorization(user.sub, user.scope, toolName);

    if (!authResult.authorized) {
      if (authResult.requiresConsent) {
        const bindingMessage =
          toolName === "commit_quote_terms"
            ? buildQuoteCommitBindingMessage({
                accountId: parameters.accountId || "unknown account",
                discountPercent: parameters.discountPercent,
                paymentTerms: parameters.paymentTerms,
              })
            : `Approve use of ${toolName}`;

        const ciba = await initiateCIBA(
          user.sub,
          user.email || "",
          toolName,
          authResult.tool!.requiredScopes.join(" "),
          bindingMessage
        );

        return {
          message:
            assistantMessage.content ||
            `I'm ready to commit these terms, but this requires your approval. A prompt has been sent to your device: *"${bindingMessage}"*`,
          pendingCIBA: {
            authReqId: ciba.authReqId,
            toolName,
            bindingMessage: ciba.bindingMessage,
            expiresIn: ciba.expiresIn,
            interval: ciba.interval,
          },
        };
      }
      return {
        message: `I don't have permission to use ${toolName}. ${authResult.reason}`,
      };
    }

    // All tools route through MCP (audience, OBO, per-tool scope
    // enforced by the MCP server). FGA and Token Vault checks also
    // live there, so this call path is identical for every tool.
    let result: any;
    try {
      result = await executeTool(toolName, parameters, user.accessToken);
    } catch (error: any) {
      return {
        message: `Failed to execute ${toolName}: ${error.message}`,
        toolCalls: [{ tool: toolName, result: null, status: "error" }],
      };
    }

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
