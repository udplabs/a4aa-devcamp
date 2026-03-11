import { createMCPClient } from "../mcp/client";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  requiredScopes: string[];
  riskLevel: "low" | "medium" | "high";
  requiresConsent: boolean;
}

export const toolRegistry: Record<string, ToolDefinition> = {
  get_weather: {
    name: "get_weather",
    description: "Check destination weather and travel conditions",
    parameters: { location: { type: "string", required: true } },
    requiredScopes: ["tools:read"],
    riskLevel: "low",
    requiresConsent: false,
  },

  get_calendar: {
    name: "get_calendar",
    description: "View your trip itinerary and scheduled activities",
    parameters: { date: { type: "string", required: false } },
    requiredScopes: ["tools:read"],
    riskLevel: "medium",
    requiresConsent: false,
  },

  send_email: {
    name: "send_email",
    description: "Send a booking confirmation or travel update email",
    parameters: {
      to: { type: "string", required: true },
      subject: { type: "string", required: true },
      body: { type: "string", required: true },
    },
    requiredScopes: ["email:send"],
    riskLevel: "high",
    requiresConsent: true,
  },
};

export function getToolsForDisplay(): Array<{
  name: string;
  description: string;
}> {
  return Object.values(toolRegistry).map((t) => ({
    name: t.name,
    description: t.description,
  }));
}

const mcpClient = createMCPClient();

export async function executeTool(
  toolName: string,
  parameters: Record<string, any>
): Promise<any> {
  console.log(`[Tools] Executing via MCP: ${toolName}`, parameters);

  try {
    const result = await mcpClient.callTool(toolName, parameters);
    console.log(`[Tools] MCP result:`, result);
    return result;
  } catch (error: any) {
    console.error(`[Tools] MCP execution failed: ${error.message}`);
    throw error;
  }
}
