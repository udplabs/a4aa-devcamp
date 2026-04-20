// =============================================================
// OpenAI Tool Definitions for the Voyager Agent
//
// Converts the tool registry into OpenAI's function-calling format.
// The actual execution and authorization happen server-side --
// the LLM only decides WHICH tool to call and with what arguments.
// =============================================================

import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { toolRegistry } from "../tools/registry";

export function getToolsForOpenAI(): ChatCompletionTool[] {
  return Object.values(toolRegistry).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: Object.entries(tool.parameters).reduce(
          (acc, [key, param]: [string, any]) => ({
            ...acc,
            [key]: {
              type: param.type,
              description: param.description || `The ${key} parameter`,
            },
          }),
          {}
        ),
        required: Object.entries(tool.parameters)
          .filter(([, param]: [string, any]) => param.required)
          .map(([key]) => key),
      },
    },
  }));
}
