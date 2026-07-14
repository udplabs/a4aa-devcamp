// =============================================================
// OpenAI LLM Integration -- Nexus
//
// Replaces the pattern-matching simulator with real tool calling
// when OPENAI_API_KEY is set. Falls back to the simulator if the
// API call fails.
//
// All security layers are enforced between the LLM's tool choice
// and the actual MCP call:
//   - JWT scopes         (Lab 01)
//   - CIBA consent gate  (Lab 02) -- for share_document
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
// the /api/chat handler in ./index.js keep working.
// =============================================================

import OpenAI from "openai";
import { SYSTEM_PROMPT_FULL } from "./llm/prompts.js";
import { getToolsForOpenAI } from "./llm/tools.js";
import { processMessage as simulatorFallback } from "./simulator.js";
import { checkToolAuthorization, revokeConsent } from "./middleware/agent-auth.js";
import { executeTool } from "./tools/registry.js";
import { initiateCIBA, buildDocShareBindingMessage } from "./middleware/ciba.js";

// The OpenAI SDK speaks any OpenAI-compatible endpoint (LiteLLM proxy,
// Azure OpenAI, local Ollama, etc.) via baseURL. Leave OPENAI_BASE_URL
// unset to call OpenAI directly.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
});
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

export async function processMessage(message, conversationHistory, user, tenant) {
  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT_FULL },
      ...conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
      })),
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
          toolName === "share_document"
            ? buildDocShareBindingMessage({
                documentTitle: parameters.documentTitle || parameters.documentId || "document",
                recipientEmail: parameters.recipientEmail || "recipient",
              })
            : `Approve use of ${toolName}`;

        const ciba = await initiateCIBA(
          user.sub,
          user.email || "",
          toolName,
          authResult.tool.requiredScopes.join(" "),
          bindingMessage,
          tenant
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
    let result;
    try {
      result = await executeTool(toolName, parameters, user.accessToken);
    } catch (error) {
      return {
        message: `Failed to execute ${toolName}: ${error.message}`,
        toolCalls: [{ tool: toolName, result: null, status: "error" }],
      };
    }

    // Consent is single-use: it exists only to let the CIBA-approved
    // resubmission through without re-prompting. Revoke it immediately
    // so the *next* share_document call requires a fresh approval.
    if (authResult.tool?.requiresConsent) {
      revokeConsent(user.sub, toolName);
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
  } catch (error) {
    console.warn(`[LLM] Error: ${error.message}, falling back to simulator`);
    return simulatorFallback(message, conversationHistory, user);
  }
}
