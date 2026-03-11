// =============================================================
// Simulated LLM
//
// This module simulates an LLM's behavior using pattern matching.
// The focus of this lab is on auth, not AI - so we fake the LLM
// and keep the security layers real.
//
// LAB 3: Update this to check authorization before tool calls
// See: lab-guide/03-protect-the-api.md - Step 3
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
    // LAB 3: Add authorization check here BEFORE executing the tool
    //
    // const authResult = checkToolAuthorization(
    //   user.sub, user.scope, intent.toolName
    // );
    //
    // if (!authResult.authorized) {
    //   if (authResult.requiresConsent) {
    //     return {
    //       message: `I'd like to use **${intent.toolName}** but this requires your approval.`,
    //       pendingApproval: authResult.consentDetails,
    //     };
    //   }
    //   return { message: `I don't have permission to use ${intent.toolName}.` };
    // }
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
  // Simple extraction - a real LLM would do this much better
  const toMatch = message.match(/to\s+(\S+@\S+)/i);
  return {
    to: toMatch ? toMatch[1] : "traveler@example.com",
    subject: "Booking Confirmation — Voyager Travel",
    body: message,
  };
}

// =============================================================
// LAB 4: Replace this with MCP client calls
// See: lab-guide/04-agent-authorization.md - Step 5
// =============================================================
function executeToolLocally(
  name: string,
  args: Record<string, any>
): any {
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
        subject: args.subject || "Booking Confirmation — Voyager Travel",
        messageId: `msg-${Date.now()}`,
        timestamp: new Date().toISOString(),
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
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

  return `I understand you said: "${message}". Try asking about destination weather, your trip itinerary, or sending a booking confirmation to see the tool calling in action.`;
}
