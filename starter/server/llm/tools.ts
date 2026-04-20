// =============================================================
// OpenAI Tool Definitions for the Voyager Agent
//
// These define what tools the LLM can call. The actual execution
// and authorization happen server-side -- the LLM only decides
// WHICH tool to call and with what arguments.
//
// LAB 3: Add get_document and list_documents tools
// LAB 4: Add get_external_files tool
// =============================================================

import type { ChatCompletionTool } from "openai/resources/chat/completions";

export function getToolsForOpenAI(): ChatCompletionTool[] {
  return [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Check destination weather and travel conditions for a city or location",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city or location to check weather for (e.g., 'Bali', 'Tokyo', 'Paris')",
            },
          },
          required: ["location"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_calendar",
        description: "View the user's trip itinerary and scheduled activities",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "send_email",
        description: "Send a booking confirmation or travel update email",
        parameters: {
          type: "object",
          properties: {
            to: {
              type: "string",
              description: "The recipient email address",
            },
            subject: {
              type: "string",
              description: "The email subject line",
            },
            body: {
              type: "string",
              description: "The email body content",
            },
          },
          required: ["to", "subject", "body"],
        },
      },
    },

    // =============================================================
    // LAB 3: Add these tool definitions for FGA-protected documents
    //
    // {
    //   type: "function",
    //   function: {
    //     name: "get_document",
    //     description: "Retrieve a specific document by ID",
    //     parameters: {
    //       type: "object",
    //       properties: {
    //         documentId: { type: "string", description: "The document ID to retrieve" },
    //       },
    //       required: ["documentId"],
    //     },
    //   },
    // },
    // {
    //   type: "function",
    //   function: {
    //     name: "list_documents",
    //     description: "List all documents the user has access to",
    //     parameters: { type: "object", properties: {}, required: [] },
    //   },
    // },
    //
    // LAB 4: Add this tool definition for Token Vault files
    //
    // {
    //   type: "function",
    //   function: {
    //     name: "get_external_files",
    //     description: "Get files from the user's linked cloud storage service",
    //     parameters: { type: "object", properties: {}, required: [] },
    //   },
    // },
    // =============================================================
  ];
}
