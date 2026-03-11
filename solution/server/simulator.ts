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
        // Initiate CIBA for consent-required tools
        const cibaResult = await initiateCIBA(
          user.sub,
          user.email || "",
          intent.toolName,
          authResult.tool!.requiredScopes.join(" ")
        );

        return {
          message: `I need to use the **${intent.toolName}** tool on your behalf. This requires your approval via a secure out-of-band channel.\n\n**Waiting for approval...** Check your device or approve at the approval endpoint.`,
          pendingCIBA: {
            authReqId: cibaResult.authReqId,
            toolName: intent.toolName,
            expiresIn: cibaResult.expiresIn,
            interval: cibaResult.interval,
          },
        };
      }
      return {
        message: `I don't have permission to use the ${intent.toolName} tool. ${authResult.reason}`,
      };
    }

    // Handle FGA-protected tools locally (they need user context)
    if (intent.toolName === "get_document") {
      const result = getDocument(user.sub, intent.parameters.documentId);
      return {
        message: formatToolResponse(intent.toolName, result),
        toolCalls: [{ tool: intent.toolName, result, status: "success" }],
      };
    }

    if (intent.toolName === "list_documents") {
      const result = listDocuments(user.sub);
      return {
        message: formatToolResponse(intent.toolName, result),
        toolCalls: [{ tool: intent.toolName, result, status: "success" }],
      };
    }

    // Handle Token Vault tool locally
    if (intent.toolName === "get_external_files") {
      const result = await getExternalFiles(user.sub);
      return {
        message: formatToolResponse(intent.toolName, result),
        toolCalls: [{ tool: intent.toolName, result, status: "success" }],
      };
    }

    // Execute MCP tools via MCP client
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

  // Document tools (FGA)
  if (
    lower.includes("document") ||
    lower.includes("roadmap") ||
    lower.includes("budget") ||
    lower.includes("report") ||
    lower.includes("handbook")
  ) {
    if (lower.includes("roadmap") || lower.includes("project")) {
      return { toolName: "get_document", parameters: { documentId: "project-roadmap" } };
    }
    if (lower.includes("budget")) {
      return { toolName: "get_document", parameters: { documentId: "budget-2025" } };
    }
    if (lower.includes("classified") || lower.includes("security report")) {
      return { toolName: "get_document", parameters: { documentId: "classified-report" } };
    }
    if (lower.includes("handbook")) {
      return { toolName: "get_document", parameters: { documentId: "team-handbook" } };
    }
    return { toolName: "list_documents", parameters: {} };
  }

  // External files (Token Vault)
  if (lower.includes("file") || lower.includes("storage") || lower.includes("external")) {
    return { toolName: "get_external_files", parameters: {} };
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

    case "get_document":
      if (!result.success) {
        return `**Access Denied:** ${result.error}`;
      }
      return `**${result.document.title}** (${result.document.classification})\nYour access: *${result.document.yourAccess}*\n\n${result.document.content}`;

    case "list_documents":
      if (result.documents.length === 0) {
        return "You don't have access to any documents.";
      }
      const docList = result.documents
        .map((d: any) => `- **${d.title}** (${d.classification}) — ${d.relation}`)
        .join("\n");
      return `You have access to ${result.documents.length} of ${result.totalDocuments} documents:\n${docList}`;

    case "get_external_files":
      if (!result.success) {
        return `**File Storage Error:** ${result.error}`;
      }
      const fileList = result.files
        .map((f: any) => `- **${f.name}** (${f.size}) — modified ${f.modified}`)
        .join("\n");
      return `Here are your files from File Storage:\n${fileList}`;

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
    return "Hello! I'm Voyager, your AI travel concierge. I can help you with:\n\n- **Destination Weather** — check conditions anywhere in the world\n- **Trip Itinerary** — view your flights, hotels, and activities\n- **Booking Confirmations** — send travel updates and confirmations\n- **Documents** — access your project documents (FGA-protected)\n- **External Files** — access your linked file storage\n\nWhat can I help you with?";
  }

  if (lower.includes("help") || lower.includes("what can you")) {
    return "I can help with these tools:\n\n1. **Destination Weather** — Check conditions for any city\n2. **Trip Itinerary** — View your scheduled flights, stays, and activities\n3. **Booking Confirmations** — Send confirmations (requires CIBA approval)\n4. **Documents** — Access project docs (FGA access control)\n5. **External Files** — Access linked file storage (Token Vault)\n\nJust ask naturally!";
  }

  if (lower.includes("thank")) {
    return "You're welcome! Let me know if there's anything else I can help with.";
  }

  return `I understand you said: "${message}". Try asking about destination weather, your trip itinerary, documents, external files, or sending a booking confirmation.`;
}
