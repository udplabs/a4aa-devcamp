// =============================================================
// OpenAI LLM Integration for Z-Merchant (Pre-built)
//
// This module is the single place that speaks to the model
// provider. When OPENAI_API_KEY is set, it routes through real
// OpenAI function calling. Otherwise it falls back to the
// pattern-matching simulator in ./simulator.ts.
//
// The security layers you build in the labs (JWT, CIBA, FGA,
// Token Vault, MCP) are enforced HERE -- between the LLM's
// tool selection and the actual tool execution.
//
// FUTURE: Claude Agent SDK adapter
// To swap the simulator / OpenAI path for Claude Agent SDK,
// replace the body of processMessage() below. The tool registry
// (./tools/registry.ts) and MCP layer are framework-agnostic
// and do not require changes.
//
// LAB 02: Add CIBA gating for commit_quote_terms
// LAB 03: Route get_catalog_and_buyer_tier through FGA check
// LAB 04: Route create_google_doc / post_slack_triage through Token Vault
// LAB 05: Route all tool execution through the MCP client (OBO)
// =============================================================

import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./llm/prompts";
import { getToolsForOpenAI } from "./llm/tools";
import { processMessage as simulatorFallback } from "./simulator";

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
      { role: "system", content: SYSTEM_PROMPT },
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

    // =============================================================
    // LAB 02: CIBA gate for commit_quote_terms when discount > 20%
    // or payment terms deviate from net-30. Build the binding message
    // from the quote params so the rep's device shows the exact
    // terms they are approving.
    //
    //   if (toolName === "commit_quote_terms" && isNonStandard(parameters)) {
    //     const bindingMessage = buildQuoteCommitBindingMessage(parameters);
    //     const ciba = await initiateCIBA(user.sub, user.email!, toolName,
    //                                     "mcp:quote:commit", bindingMessage);
    //     return { message: "...", pendingCIBA: { ...ciba, toolName } };
    //   }
    // =============================================================

    // =============================================================
    // LAB 05: Route execution through the MCP client using user.accessToken
    // so that OBO token exchange preserves the rep's identity.
    //
    //   const mcpClient = createMCPClient();
    //   const result = await mcpClient.callTool(toolName, parameters, user.accessToken!);
    //
    // Until Lab 05 is complete, this throws.
    // =============================================================
    const result = executeToolLocally(toolName, parameters);

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
// LAB 05: Replace this with an MCP client call.
// Until then, tool execution is unimplemented -- the starter
// intentionally throws so the attendee sees the missing link.
// =============================================================
function executeToolLocally(name: string, _args: Record<string, any>): any {
  throw new Error(
    `Tool execution not implemented: ${name}. Route through MCP client (see Lab 05).`
  );
}
