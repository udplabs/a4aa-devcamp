// =============================================================
// OpenAI Tool Definitions for Z-Merchant
//
// These define what tools the LLM can call. The actual execution
// and authorization happen server-side. The LLM only decides
// WHICH tool to call and with what arguments.
//
// Pre-built: the four Z-Merchant tools. Do not modify unless the
// tool registry shape changes.
// =============================================================

import type { ChatCompletionTool } from "openai/resources/chat/completions";

export function getToolsForOpenAI(): ChatCompletionTool[] {
  return [
    {
      type: "function",
      function: {
        name: "get_catalog_and_buyer_tier",
        description:
          "Look up catalog pricing for a SKU and the buyer tier for a wholesale account.",
        parameters: {
          type: "object",
          properties: {
            accountId: {
              type: "string",
              description: "Wholesale account id, e.g. 'acme', 'globex'",
            },
            sku: {
              type: "string",
              description: "Catalog SKU, e.g. 'SKU-WX-42'",
            },
          },
          required: ["accountId", "sku"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_google_doc",
        description:
          "Create a Google Doc (bulk quote draft) in the rep's Workspace.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Doc title" },
            body: { type: "string", description: "Markdown-flavored body" },
          },
          required: ["title", "body"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "post_slack_triage",
        description:
          "Post a summary to #wholesale-quote-triage in Slack.",
        parameters: {
          type: "object",
          properties: {
            channel: { type: "string" },
            summary: { type: "string" },
            docUrl: { type: "string" },
          },
          required: ["summary"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "commit_quote_terms",
        description:
          "Commit final quote terms to the order system. CIBA-gated when discount > 20% or payment terms deviate from net-30.",
        parameters: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            quoteId: { type: "string" },
            discountPercent: { type: "number" },
            paymentTerms: { type: "string" },
          },
          required: ["accountId", "quoteId", "discountPercent"],
        },
      },
    },
  ];
}
