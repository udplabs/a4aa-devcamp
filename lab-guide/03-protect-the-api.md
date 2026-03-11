# Lab 3: Agent Authorization + Tool Calling

**Duration:** ~25 minutes

## Objectives

- Define tool permission levels (auto-approve vs. consent-required)
- Build an approval flow in the chat UI
- Implement token exchange for tool execution
- Create the async consent loop that characterizes Auth0 AI for Agents

---

## Concept: Why Agent Authorization?

The user is authenticated. The API validates their JWT. But that's not enough.

When the user says "Send an email to my boss," the **AI agent** is the one executing the action - not the user directly. The agent needs **explicit, per-action authorization** to perform sensitive operations on the user's behalf.

This is the core idea behind **Auth0 AI for Agents**: the agent must prove it has permission to use each tool, and some tools require real-time user consent.

---

## Step 1: Define Tool Permission Levels

Open `server/tools/registry.ts` and define the authorization requirements:

```typescript
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
    description: "Get current weather for a location",
    parameters: { location: { type: "string", required: true } },
    requiredScopes: ["tools:read"],
    riskLevel: "low",
    requiresConsent: false, // Auto-approved: read-only, non-sensitive
  },

  get_calendar: {
    name: "get_calendar",
    description: "Get upcoming calendar events",
    parameters: { date: { type: "string", required: false } },
    requiredScopes: ["tools:read"],
    riskLevel: "medium",
    requiresConsent: false, // Auto-approved: read-only, but personal data
  },

  send_email: {
    name: "send_email",
    description: "Send an email on behalf of the user",
    parameters: {
      to: { type: "string", required: true },
      subject: { type: "string", required: true },
      body: { type: "string", required: true },
    },
    requiredScopes: ["email:send"],
    riskLevel: "high",
    requiresConsent: true, // REQUIRES USER CONSENT: destructive action
  },
};

export function getToolsForDisplay(): Array<{ name: string; description: string }> {
  return Object.values(toolRegistry).map((t) => ({
    name: t.name,
    description: t.description,
  }));
}
```

---

## Step 2: Build the Authorization Check

Create the agent authorization logic in `server/middleware/agent-auth.ts`:

```typescript
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
}

export function revokeConsent(userId: string, toolName: string): void {
  const key = getConsentKey(userId);
  consentStore.get(key)?.delete(toolName);
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

  // Check if tool requires consent
  if (tool.requiresConsent && !hasUserConsented(userId, toolName)) {
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

  return { authorized: true, tool };
}
```

---

## Step 3: Update the LLM Simulator to Check Authorization

Open `server/simulator.ts` and update it to check authorization before calling tools:

```typescript
import { checkToolAuthorization, AuthorizationResult } from "./middleware/agent-auth";
import { executeTool } from "./tools/registry";

export interface AgentUser {
  sub: string;
  scope: string[];
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
  conversationHistory: any[],
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
        // Return consent request to the frontend
        return {
          message: `I'd like to use the **${intent.toolName}** tool to help with your request, but this action requires your approval first.`,
          pendingApproval: authResult.consentDetails,
        };
      }
      return {
        message: `I don't have permission to use the ${intent.toolName} tool. ${authResult.reason}`,
      };
    }

    // Authorized - execute the tool
    const result = await executeTool(intent.toolName, intent.parameters);
    return {
      message: formatToolResponse(intent.toolName, result),
      toolCalls: [{ tool: intent.toolName, result, status: "success" }],
    };
  }

  // No tool needed - return a conversational response
  return { message: generateResponse(message) };
}

function detectIntent(message: string): { toolName?: string; parameters: Record<string, any> } {
  const lower = message.toLowerCase();

  if (lower.includes("weather")) {
    const location = extractLocation(message) || "San Francisco";
    return { toolName: "get_weather", parameters: { location } };
  }

  if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("meeting")) {
    return { toolName: "get_calendar", parameters: {} };
  }

  if (lower.includes("send") && lower.includes("email") || lower.includes("mail")) {
    return {
      toolName: "send_email",
      parameters: extractEmailParams(message),
    };
  }

  return { parameters: {} };
}

function extractLocation(message: string): string | null {
  const match = message.match(/(?:weather\s+(?:in|for|at)\s+)(.+?)(?:\?|$)/i);
  return match ? match[1].trim() : null;
}

function extractEmailParams(message: string) {
  return {
    to: "recipient@example.com",
    subject: "Message from AI Assistant",
    body: message,
  };
}

function formatToolResponse(toolName: string, result: any): string {
  switch (toolName) {
    case "get_weather":
      return `Here's the weather for **${result.location}**: ${result.condition}, ${result.temperature}. Humidity: ${result.humidity}.`;
    case "get_calendar":
      const events = result.events.map((e: any) => `- **${e.time}**: ${e.title}`).join("\n");
      return `Here are your upcoming events:\n${events}`;
    case "send_email":
      return `Email sent to **${result.to}** with subject "${result.subject}".`;
    default:
      return JSON.stringify(result);
  }
}

function generateResponse(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello! I'm your AI assistant. I can help you with:\n\n- **Weather** lookups (try: \"What's the weather in Tokyo?\")\n- **Calendar** checks (try: \"What's on my schedule?\")\n- **Email** sending (try: \"Send an email to my team\")\n\nWhat can I help you with?";
  }

  if (lower.includes("help") || lower.includes("what can you")) {
    return "I can help with these tools:\n\n1. **Weather** - Check weather for any location\n2. **Calendar** - View your upcoming events\n3. **Email** - Send emails on your behalf (requires approval)\n\nJust ask naturally!";
  }

  return `I understand you said: "${message}". Try asking about weather, your calendar, or sending an email to see the tool authorization in action.`;
}
```

---

## Step 4: Add Consent Endpoints

Add these routes to `server/index.ts`:

```typescript
import { recordConsent, revokeConsent } from "./middleware/agent-auth";

// User approves a tool action
app.post("/api/consent/approve", validateAccessToken, (req, res) => {
  const user = extractUser(req);
  const { toolName } = req.body;

  recordConsent(user.sub, toolName);
  console.log(`User ${user.sub} approved tool: ${toolName}`);

  res.json({ approved: true, toolName });
});

// User denies a tool action
app.post("/api/consent/deny", validateAccessToken, (req, res) => {
  const user = extractUser(req);
  const { toolName } = req.body;

  revokeConsent(user.sub, toolName);
  console.log(`User ${user.sub} denied tool: ${toolName}`);

  res.json({ denied: true, toolName });
});
```

---

## Step 5: Build the Tool Approval UI

Open `src/components/ToolApproval.tsx` and implement the consent dialog:

```tsx
import { useAuth0 } from "@auth0/auth0-react";

interface ToolApprovalProps {
  toolName: string;
  description: string;
  riskLevel: string;
  requiredScopes: string[];
  onApprove: () => void;
  onDeny: () => void;
}

export function ToolApproval({
  toolName,
  description,
  riskLevel,
  requiredScopes,
  onApprove,
  onDeny,
}: ToolApprovalProps) {
  const riskColors: Record<string, string> = {
    low: "#4caf50",
    medium: "#ff9800",
    high: "#f44336",
  };

  return (
    <div className="tool-approval">
      <div className="tool-approval-card">
        <div className="tool-approval-header">
          <span className="tool-approval-icon">&#9888;</span>
          <h3>Authorization Required</h3>
        </div>

        <p>The AI assistant wants to use a tool that requires your approval:</p>

        <div className="tool-details">
          <div className="tool-detail-row">
            <strong>Tool:</strong> <code>{toolName}</code>
          </div>
          <div className="tool-detail-row">
            <strong>Description:</strong> {description}
          </div>
          <div className="tool-detail-row">
            <strong>Risk Level:</strong>{" "}
            <span
              className="risk-badge"
              style={{ backgroundColor: riskColors[riskLevel] }}
            >
              {riskLevel.toUpperCase()}
            </span>
          </div>
          <div className="tool-detail-row">
            <strong>Required Permissions:</strong>
            <ul>
              {requiredScopes.map((scope) => (
                <li key={scope}><code>{scope}</code></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="tool-approval-actions">
          <button className="approve-button" onClick={onApprove}>
            Approve
          </button>
          <button className="deny-button" onClick={onDeny}>
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Step 6: Wire Up Consent in the Chat

Update `src/hooks/useChat.ts` to handle the consent flow:

```typescript
const [pendingApproval, setPendingApproval] = useState<any>(null);

const handleApproval = async (toolName: string, approved: boolean) => {
  const token = await getAccessTokenSilently({
    authorizationParams: {
      audience: import.meta.env.VITE_AUTH0_AUDIENCE,
    },
  });

  const endpoint = approved ? "/api/consent/approve" : "/api/consent/deny";

  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ toolName }),
  });

  setPendingApproval(null);

  if (approved) {
    // Re-send the last user message now that consent is recorded
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    if (lastUserMessage) {
      await sendMessage(lastUserMessage.content);
    }
  } else {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Action denied. I won't use the ${toolName} tool. Is there anything else I can help with?`,
      },
    ]);
  }
};
```

Then in the `sendMessage` function, check for `pendingApproval` in the response:

```typescript
// After getting the response data:
if (data.pendingApproval) {
  setPendingApproval(data.pendingApproval);
}
```

---

## Step 7: Test the Authorization Flow

### Test 1: Low-Risk Tool (Auto-Approved)
1. Send: "What's the weather in Tokyo?"
2. The agent should respond immediately with weather data
3. No consent dialog appears (auto-approved)

### Test 2: High-Risk Tool (Consent Required)
1. Send: "Send an email to my team about the meeting"
2. You should see the **Tool Approval** dialog appear
3. Review the tool details (name, risk level, scopes)
4. Click **Approve**
5. The agent re-processes and sends the email
6. A confirmation message appears

### Test 3: Denied Consent
1. Send: "Send an email to everyone about the party"
2. When the consent dialog appears, click **Deny**
3. The agent should acknowledge the denial gracefully

---

## Understanding the Flow

```
User: "Send an email to my team"
  │
  ▼
Agent: detectIntent() → send_email
  │
  ▼
Agent: checkToolAuthorization(userId, scopes, "send_email")
  │
  ├── User has not consented to send_email
  │   │
  │   ▼
  │   Return: { requiresConsent: true, consentDetails: {...} }
  │   │
  │   ▼
  │   Frontend shows ToolApproval dialog
  │   │
  │   ├── User clicks Approve → POST /api/consent/approve
  │   │   │
  │   │   ▼
  │   │   Re-send message → Agent executes tool → Response
  │   │
  │   └── User clicks Deny → POST /api/consent/deny
  │       │
  │       ▼
  │       "Action denied" message
  │
  └── User has already consented
      │
      ▼
      Execute tool immediately → Response
```

---

## Checkpoint

At this point you have:
- [x] Tool permission levels defined
- [x] Authorization check before tool execution
- [x] Consent dialog in the UI
- [x] Approve/deny flow working
- [x] Auto-approval for low-risk tools
- [ ] Tools run in-process (next lab moves them to MCP)

---

**Next: [Lab 4 - MCP Server with Auth for MCP](./04-agent-authorization.md)**
