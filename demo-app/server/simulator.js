// =============================================================
// Pattern-matching Simulator -- default agent runtime
//
// Runs when OPENAI_API_KEY is absent. Detects intent from simple
// regex matches and routes to the MCP-backed tool registry.
//
// All tools route through the MCP client (see ../tools/registry.js
// -> executeTool -> ../mcp/client.js). Authorization (scope, FGA,
// Token Vault) happens at the MCP server boundary -- this file is
// just the "what did the user ask for" layer.
//
// FUTURE: Swapping this module for the Claude Agent SDK only
// requires rewriting processMessage(); the registry and MCP
// layers stay identical. See ../llm.js for the parallel comment.
// =============================================================

import { checkToolAuthorization } from "./middleware/agent-auth.js";
import { executeTool } from "./tools/registry.js";
import { initiateCIBA, buildDocShareBindingMessage } from "./middleware/ciba.js";

export async function processMessage(message, _conversationHistory, user, tenant) {
  const intent = detectIntent(message);

  if (!intent.toolName) {
    return { message: generateResponse(message) };
  }

  // Authorization gate: scopes + CIBA for high-risk tools.
  const authResult = checkToolAuthorization(user.sub, user.scope, intent.toolName);

  if (!authResult.authorized) {
    if (authResult.requiresConsent) {
      const bindingMessage =
        intent.toolName === "share_document"
          ? buildDocShareBindingMessage({
              documentTitle: intent.parameters.documentTitle || intent.parameters.documentId || "document",
              recipientEmail: intent.parameters.recipientEmail || "recipient",
            })
          : `Approve use of ${intent.toolName}`;

      const ciba = await initiateCIBA(
        user.sub,
        user.email || "",
        intent.toolName,
        authResult.tool.requiredScopes.join(" "),
        bindingMessage,
        tenant
      );

      return {
        message: `I'm ready to share this document, but external sharing requires your approval. A prompt has been sent to your device: *"${bindingMessage}"*`,
        pendingCIBA: {
          authReqId: ciba.authReqId,
          toolName: intent.toolName,
          bindingMessage: ciba.bindingMessage,
          expiresIn: ciba.expiresIn,
          interval: ciba.interval,
        },
      };
    }
    return {
      message: `I don't have permission to use ${intent.toolName}. ${authResult.reason}`,
    };
  }

  // Route through MCP (scope, audience, OBO enforced there).
  try {
    const result = await executeTool(
      intent.toolName,
      intent.parameters,
      user.accessToken
    );
    return {
      message: formatToolResponse(intent.toolName, result),
      toolCalls: [{ tool: intent.toolName, result, status: "success" }],
    };
  } catch (error) {
    return {
      message: `Failed to execute ${intent.toolName}: ${error.message}`,
      toolCalls: [{ tool: intent.toolName, result: null, status: "error" }],
    };
  }
}

// ---- Intent detection -------------------------------------------

function detectIntent(message) {
  const lower = message.toLowerCase();

  // share / send / email -> share_document (CIBA-gated)
  if (
    lower.includes("share") ||
    lower.includes("send to") ||
    (lower.includes("email") && (lower.includes("doc") || lower.includes("file")))
  ) {
    return {
      toolName: "share_document",
      parameters: {
        documentId:     extractDocumentId(message) || "q3-roadmap",
        documentTitle:  extractDocumentTitle(message),
        recipientEmail: extractEmail(message) || "recipient@external.com",
      },
    };
  }

  // log / record / crm / track activity -> log_crm_activity
  if (
    lower.includes("log") ||
    lower.includes("crm") ||
    lower.includes("record activity") ||
    lower.includes("track") ||
    lower.includes("activity")
  ) {
    return {
      toolName: "log_crm_activity",
      parameters: {
        action:     extractCRMAction(lower),
        documentId: extractDocumentId(message) || "q3-roadmap",
        documentTitle: extractDocumentTitle(message),
        notes:      message.trim(),
      },
    };
  }

  // get / open / read / show / retrieve -> get_document
  if (
    lower.includes("get doc") ||
    lower.includes("open doc") ||
    lower.includes("read doc") ||
    lower.includes("show me") ||
    lower.includes("retrieve") ||
    lower.includes("full content") ||
    (lower.includes("get") && lower.includes("document"))
  ) {
    return {
      toolName: "get_document",
      parameters: {
        documentId: extractDocumentId(message) || "handbook",
      },
    };
  }

  // search / find / look up / what docs / any doc reference -> search_documents
  if (
    lower.includes("search") ||
    lower.includes("find") ||
    lower.includes("look up") ||
    lower.includes("what doc") ||
    lower.includes("any doc") ||
    lower.includes("document") ||
    lower.includes("handbook") ||
    lower.includes("policy") ||
    lower.includes("roadmap") ||
    lower.includes("spec") ||
    lower.includes("compensation") ||
    lower.includes("board")
  ) {
    return {
      toolName: "search_documents",
      parameters: {
        query: extractQuery(message),
      },
    };
  }

  return { parameters: {} };
}

// ---- Parameter extraction ---------------------------------------

function extractDocumentId(message) {
  // Named doc IDs
  if (/handbook/i.test(message)) return "handbook";
  if (/security.?policy|infosec/i.test(message)) return "security-policy";
  if (/q3.?roadmap|roadmap/i.test(message)) return "q3-roadmap";
  if (/product.?spec|spec.*v2/i.test(message)) return "product-spec-v2";
  if (/compensation|salary|comp.?review/i.test(message)) return "compensation-q3";
  if (/board.?deck|board/i.test(message)) return "board-deck-q3";
  // Explicit doc: prefix
  const explicit = message.match(/doc(?:ument)?[:\s]+([a-zA-Z0-9_-]+)/i);
  return explicit ? explicit[1].toLowerCase() : null;
}

function extractDocumentTitle(message) {
  // Try to find a quoted title or named doc
  const quoted = message.match(/["']([^"']+)["']/);
  if (quoted) return quoted[1];
  const id = extractDocumentId(message);
  const titles = {
    "handbook": "Employee Handbook",
    "security-policy": "Information Security Policy",
    "q3-roadmap": "Q3 Product Roadmap",
    "product-spec-v2": "Product Spec v2.0",
    "compensation-q3": "Q3 Compensation Review",
    "board-deck-q3": "Q3 Board Deck",
  };
  return id ? (titles[id] || id) : null;
}

function extractEmail(message) {
  const match = message.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function extractCRMAction(lower) {
  if (lower.includes("share") || lower.includes("shared")) return "shared";
  if (lower.includes("view") || lower.includes("viewed") || lower.includes("read")) return "viewed";
  if (lower.includes("export")) return "exported";
  return "updated";
}

function extractTitle(message) {
  const match = message.match(/titled?\s+["']?([^"'\n]+?)["']?(?:$|[,.])/i);
  return match ? match[1].trim() : null;
}

function extractQuery(message) {
  // Strip common intent words to get the core query
  return message
    .replace(/^(search|find|look up|show me|get|retrieve)\s+(for\s+)?/i, "")
    .trim() || message.trim();
}

// ---- Response formatting ----------------------------------------

function formatToolResponse(toolName, result) {
  if (result && result.success === false) {
    return `**Access denied:** ${result.error}`;
  }
  switch (toolName) {
    case "search_documents": {
      if (!result.results || result.results.length === 0) {
        return `No documents found matching *"${result.query}"* that you have access to. Some documents may exist but require elevated permissions.`;
      }
      const list = result.results
        .map((d) => `- **${d.title}** (\`${d.id}\`, ${d.classification}) — ${d.snippet}`)
        .join("\n");
      return `Found **${result.total}** document${result.total !== 1 ? "s" : ""} matching *"${result.query}"*:\n\n${list}`;
    }
    case "get_document": {
      const d = result.document;
      return `**${d.title}** (${d.classification}, ${d.department})\n\n${d.content}`;
    }
    case "log_crm_activity": {
      const a = result.activity;
      return `Logged **${a.action}** on **${a.documentTitle}** to CRM. Activity ID: \`${a.id}\`.`;
    }
    case "share_document": {
      const s = result.shared;
      return `Shared **${s.documentTitle}** with **${s.recipientEmail}**. Shared at ${new Date(s.sharedAt).toLocaleTimeString()}.`;
    }
    default:
      return JSON.stringify(result);
  }
}

function generateResponse(message) {
  const lower = message.toLowerCase();
  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello! I'm Nexus, your company knowledge assistant. I can help you:\n\n- **Search** the internal knowledge base for documents\n- **Retrieve** the full content of a specific document\n- **Log** a document activity to the CRM (under your identity)\n- **Share** a document externally (requires device approval)\n\nTry: *\"Find the Q3 roadmap\"* or *\"Get the employee handbook\"* or *\"Share the security policy with vendor@acme.com\"*.";
  }
  if (lower.includes("help") || lower.includes("what can you")) {
    return "I handle company knowledge end-to-end:\n\n1. **Search** — find documents by keyword (FGA-filtered: you only see what you're authorized to read)\n2. **Retrieve** — get the full content of a specific document\n3. **Log CRM activity** — record a document event under your identity (Token Vault — attributed to you, not a bot)\n4. **Share** — send a document to an external recipient (CIBA-gated — requires approval on your device)\n\nAsk me naturally.";
  }
  if (lower.includes("thank")) {
    return "You're welcome. Let me know if you need anything else.";
  }
  return `I heard: *"${message}"*. Try asking me to search for a document, retrieve its content, log a CRM activity, or share a document externally.`;
}
