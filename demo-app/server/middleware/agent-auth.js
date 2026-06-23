import { toolRegistry } from "../tools/registry.js";

// In-memory consent store (use a real DB in production)
const consentStore = new Map();

function getConsentKey(userId) {
  return `consent:${userId}`;
}

export function hasUserConsented(userId, toolName) {
  const key = getConsentKey(userId);
  return consentStore.get(key)?.has(toolName) || false;
}

export function recordConsent(userId, toolName) {
  const key = getConsentKey(userId);
  if (!consentStore.has(key)) {
    consentStore.set(key, new Set());
  }
  consentStore.get(key).add(toolName);
  console.log(`[Agent Auth] Consent recorded: user=${userId}, tool=${toolName}`);
}

export function revokeConsent(userId, toolName) {
  const key = getConsentKey(userId);
  consentStore.get(key)?.delete(toolName);
  console.log(`[Agent Auth] Consent revoked: user=${userId}, tool=${toolName}`);
}

export function checkToolAuthorization(userId, userScopes, toolName) {
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
