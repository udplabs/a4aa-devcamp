import {
  checkToolAuthorization,
  AuthorizationResult,
} from "./middleware/agent-auth";
import { executeTool } from "./tools/registry";

export interface AgentUser {
  sub: string;
  scope: string[];
  email?: string;
}

export interface LLMResponse {
  message: string;
  toolCalls?: ToolCallResult[];
  pendingApproval?: AuthorizationResult["consentDetails"];
}

interface ToolCallResult {
  tool: string;
  result: any;
  status: "success" | "error" | "pending_consent";
}

export async function processMessage(
  message: string,
  _conversationHistory: any[],
  user: AgentUser
): Promise<LLMResponse> {
  const intent = detectIntent(message);

  if (intent.toolName) {
    // Check authorization BEFORE executing the tool
    const authResult = checkToolAuthorization(
      user.sub,
      user.scope,
      intent.toolName
    );

    if (!authResult.authorized) {
      if (authResult.requiresConsent) {
        return {
          message: `I'd like to use the **${intent.toolName}** tool to help with your request, but this action requires your approval first.`,
          pendingApproval: authResult.consentDetails,
        };
      }
      return {
        message: `I don't have permission to use the ${intent.toolName} tool. ${authResult.reason}`,
      };
    }

    // Authorized - execute the tool (via MCP)
    try {
      const result = await executeTool(intent.toolName, intent.parameters);
      return {
        message: formatToolResponse(intent.toolName, result),
        toolCalls: [{ tool: intent.toolName, result, status: "success" }],
      };
    } catch (error: any) {
      return {
        message: `Failed to execute ${intent.toolName}: ${error.message}`,
        toolCalls: [
          { tool: intent.toolName, result: null, status: "error" },
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

  if (lower.includes("weather")) {
    const location = extractLocation(message) || "Bali";
    return { toolName: "get_weather", parameters: { location } };
  }

  if (
    lower.includes("calendar") ||
    lower.includes("schedule") ||
    lower.includes("meeting") ||
    lower.includes("itinerary") ||
    lower.includes("trip")
  ) {
    return { toolName: "get_calendar", parameters: {} };
  }

  if (
    (lower.includes("send") && lower.includes("email")) ||
    (lower.includes("send") && lower.includes("mail")) ||
    lower.includes("email") ||
    lower.includes("booking") ||
    lower.includes("confirmation")
  ) {
    return {
      toolName: "send_email",
      parameters: extractEmailParams(message),
    };
  }

  return { parameters: {} };
}

function extractLocation(message: string): string | null {
  const match = message.match(
    /(?:weather\s+(?:in|for|at)\s+)(.+?)(?:\?|$|\.)/i
  );
  return match ? match[1].trim() : null;
}

function extractEmailParams(message: string) {
  const toMatch = message.match(/to\s+(\S+@\S+)/i);
  return {
    to: toMatch ? toMatch[1] : "traveler@example.com",
    subject: "Booking Confirmation — Voyager Travel",
    body: message,
  };
}

function formatToolResponse(toolName: string, result: any): string {
  switch (toolName) {
    case "get_weather":
      return `Here's the weather for **${result.location}**: ${result.condition}, ${result.temperature}. Humidity: ${result.humidity}.`;

    case "get_calendar": {
      const events = result.events
        .map((e: any) => `- **${e.time}** — ${e.title}`)
        .join("\n");
      return `Here's your trip itinerary:\n${events}`;
    }

    case "send_email":
      return `Booking confirmation sent to **${result.to}** — "${result.subject}". Confirmation ID: \`${result.messageId}\``;

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
    return "Hello! I'm Voyager, your AI travel concierge. I can help you with:\n\n- **Destination Weather** — check conditions anywhere in the world\n- **Trip Itinerary** — view your flights, hotels, and activities\n- **Booking Confirmations** — send travel updates and confirmations\n\nWhere are you headed?";
  }

  if (lower.includes("help") || lower.includes("what can you")) {
    return "I can help with these travel tools:\n\n1. **Destination Weather** — Check conditions for any city\n2. **Trip Itinerary** — View your scheduled flights, stays, and activities\n3. **Booking Confirmations** — Send confirmations to yourself or fellow travelers (requires approval)\n\nJust ask naturally!";
  }

  if (lower.includes("thank")) {
    return "You're welcome! Let me know if there's anything else I can help with.";
  }

  return `I understand you said: "${message}". Try asking about destination weather, your trip itinerary, or sending a booking confirmation to see the tool calling and authorization in action.`;
}
