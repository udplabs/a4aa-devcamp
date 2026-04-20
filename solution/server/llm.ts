// =============================================================
// OpenAI LLM Integration (Complete Solution)
//
// This module replaces pattern matching with real OpenAI tool
// calling when OPENAI_API_KEY is set. Falls back to simulator
// if the API call fails.
//
// All security layers are enforced between the LLM's tool
// selection and actual execution:
// - JWT scopes (Lab 1)
// - CIBA consent for high-risk tools (Lab 2)
// - FGA document access checks (Lab 3)
// - Token Vault for third-party APIs (Lab 4)
// - MCP routing for tool execution (Lab 5)
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
import { initiateCIBA } from "./middleware/ciba";
import { getDocument, listDocuments } from "./tools/documents";
import { getExternalFiles } from "./tools/external-files";

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
    expiresIn: number;
    interval: number;
  };
}

interface ToolCallResult {
  tool: string;
  result: any;
  status: "success" | "error" | "pending_consent";
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function processMessage(
  message: string,
  conversationHistory: any[],
  user: AgentUser
): Promise<LLMResponse> {
  try {
    // Build message history for OpenAI
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

    // Call OpenAI with tool definitions
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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

    // Check authorization BEFORE executing the tool
    const authResult = checkToolAuthorization(
      user.sub,
      user.scope,
      toolName
    );

    if (!authResult.authorized) {
      if (authResult.requiresConsent) {
        // Initiate CIBA for consent-required tools
        const cibaResult = await initiateCIBA(
          user.sub,
          user.email || "",
          toolName,
          authResult.tool!.requiredScopes.join(" ")
        );

        return {
          message:
            assistantMessage.content ||
            `I need to use the **${toolName}** tool on your behalf. This requires your approval via a secure out-of-band channel.\n\n**Waiting for approval...** Check your device or approve at the approval endpoint.`,
          pendingCIBA: {
            authReqId: cibaResult.authReqId,
            toolName,
            expiresIn: cibaResult.expiresIn,
            interval: cibaResult.interval,
          },
        };
      }
      return {
        message: `I don't have permission to use the ${toolName} tool. ${authResult.reason}`,
      };
    }

    // Execute the tool (route based on type)
    let result: any;

    // FGA-protected tools run locally (they need user context)
    if (toolName === "get_document") {
      result = getDocument(user.sub, parameters.documentId);
    } else if (toolName === "list_documents") {
      result = listDocuments(user.sub);
    } else if (toolName === "get_external_files") {
      // Token Vault tool runs locally
      result = await getExternalFiles(user.sub);
    } else {
      // MCP tools route through MCP client
      try {
        result = await executeTool(toolName, parameters, user.accessToken);
      } catch (error: any) {
        return {
          message: `Failed to execute ${toolName}: ${error.message}`,
          toolCalls: [{ tool: toolName, result: null, status: "error" }],
        };
      }
    }

    // Send tool result back to OpenAI for a natural response
    const followUp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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
