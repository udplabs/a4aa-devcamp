import { toolRegistry, ToolDefinition } from "../tools/registry";

// In-memory consent store (use a real DB in production)
const consentStore = new Map<string, Set<string>>();

function getConsentKey(userId: string): string {
  return `consent:${userId}`;
}

export function hasUserConsented(userId: string, toolName: string): boolean {
  const key = getConsentKey(userId);
  return consentStore.get(key)?.has(toolName) || false;
}

export function recordConsent(userId: string, toolName: string): void {
  const key = getConsentKey(userId);
  if (!consentStore.has(key)) {
    consentStore.set(key, new Set());
  }
  consentStore.get(key)!.add(toolName);
  console.log(`[Agent Auth] Consent recorded: user=${userId}, tool=${toolName}`);
}

export function revokeConsent(userId: string, toolName: string): void {
  const key = getConsentKey(userId);
  consentStore.get(key)?.delete(toolName);
  console.log(`[Agent Auth] Consent revoked: user=${userId}, tool=${toolName}`);
}

export interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
  requiresConsent?: boolean;
  tool?: ToolDefinition;
  consentDetails?: {
    toolName: string;
    description: string;
    requiredScopes: string[];
    riskLevel: string;
  };
}

export function checkToolAuthorization(
  userId: string,
  userScopes: string[],
  toolName: string
): AuthorizationResult {
  const tool = toolRegistry[toolName];

  if (!tool) {
    return { authorized: false, reason: `Unknown tool: ${toolName}` };
  }

  // Check if user has required scopes
  const hasScopes = tool.requiredScopes.every((s) => userScopes.includes(s));
  if (!hasScopes) {
    return {
      authorized: false,
      reason: `Missing required scopes: ${tool.requiredScopes.join(", ")}`,
    };
  }

  // Check if tool requires consent and whether user has consented
  if (tool.requiresConsent && !hasUserConsented(userId, toolName)) {
    console.log(
      `[Agent Auth] Tool ${toolName} requires consent from user ${userId}`
    );
    return {
      authorized: false,
      requiresConsent: true,
      tool,
      consentDetails: {
        toolName: tool.name,
        description: tool.description,
        requiredScopes: tool.requiredScopes,
        riskLevel: tool.riskLevel,
      },
    };
  }

  console.log(
    `[Agent Auth] Tool ${toolName} authorized for user ${userId}`
  );
  return { authorized: true, tool };
}
