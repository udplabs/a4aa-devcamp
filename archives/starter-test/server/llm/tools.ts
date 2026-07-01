// =============================================================
// OpenAI Tool Definitions for Z-Merchant
//
// These define what tools the LLM can call. The actual execution
// and authorization happen server-side -- the LLM only decides
// WHICH tool to call and with what arguments.
//
// LAB 3: Add get_account_contract and list_account_contracts (FGA)
// LAB 4: Add get_linked_workspace_docs (Token Vault)
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
              description: "Wholesale account id (e.g., 'acme', 'globex', 'initech', 'stark')",
            },
            sku: {
              type: "string",
              description: "Catalog SKU (e.g., 'SKU-WX-42')",
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
          "Post a summary to #wholesale-quote-triage in Slack for finance sign-off.",
        parameters: {
          type: "object",
          properties: {
            channel: { type: "string", description: "Slack channel (default: #wholesale-quote-triage)" },
            summary: { type: "string", description: "Short deal summary for the triage thread" },
            docUrl: { type: "string", description: "Optional link to the quote Google Doc" },
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
            accountId: { type: "string", description: "Wholesale account id" },
            quoteId: { type: "string", description: "Quote id, e.g., 'Q3-acme-001'" },
            discountPercent: { type: "number", description: "Discount percent, 0-100" },
            paymentTerms: { type: "string", description: "Payment terms (e.g., 'net-30', 'net-60')" },
          },
          required: ["accountId", "quoteId", "discountPercent"],
        },
      },
    },

    // =============================================================
    // LAB 3: Add these tool definitions for FGA-protected account contracts
    //
    // {
    //   type: "function",
    //   function: {
    //     name: "get_account_contract",
    //     description: "Retrieve a wholesale account contract by account id",
    //     parameters: {
    //       type: "object",
    //       properties: {
    //         accountId: { type: "string", description: "Account id to retrieve" },
    //       },
    //       required: ["accountId"],
    //     },
    //   },
    // },
    // {
    //   type: "function",
    //   function: {
    //     name: "list_account_contracts",
    //     description: "List all wholesale account contracts the rep has access to",
    //     parameters: { type: "object", properties: {}, required: [] },
    //   },
    // },
    //
    // LAB 4: Add this tool definition for Token Vault workspace docs
    //
    // {
    //   type: "function",
    //   function: {
    //     name: "get_linked_workspace_docs",
    //     description: "Fetch the rep's linked Google Workspace docs for prior quotes",
    //     parameters: { type: "object", properties: {}, required: [] },
    //   },
    // },
    // =============================================================
  ];
}
