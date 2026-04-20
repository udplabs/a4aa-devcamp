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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

// =============================================================
// LAB 5: Replace this with MCP client calls
// =============================================================
function executeToolLocally(name: string, args: Record<string, any>): any {
  switch (name) {
    case "get_weather":
      return {
        location: args.location,
        temperature: `${Math.floor(Math.random() * 30 + 5)}\u00B0C`,
        condition: ["Sunny", "Cloudy", "Rainy", "Partly Cloudy"][
          Math.floor(Math.random() * 4)
        ],
        humidity: `${Math.floor(Math.random() * 60 + 30)}%`,
      };

    case "get_calendar":
      return {
        events: [
          { time: "9:00 AM", title: "Airport Check-in (Terminal 2)" },
          { time: "11:30 AM", title: "Flight to Bali (GA-412)" },
          { time: "3:00 PM", title: "Hotel Check-in (The Mulia Resort)" },
          { time: "7:00 PM", title: "Dinner Reservation (La Lucciola)" },
        ],
      };

    case "send_email":
      return {
        success: true,
        to: args.to || "traveler@example.com",
        subject: args.subject || "Booking Confirmation",
        messageId: `msg-${Date.now()}`,
        timestamp: new Date().toISOString(),
      };

    // =============================================================
    // LAB 3: Add document tool execution here (FGA)
    // LAB 4: Add external files tool execution here (Token Vault)
    // =============================================================

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
