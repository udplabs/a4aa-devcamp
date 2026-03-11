export const FGA_MODEL = {
  type_definitions: [
    {
      type: "user",
    },
    {
      type: "document",
      relations: {
        viewer: { directly_related: ["user"] },
        editor: { directly_related: ["user"] },
        owner: { directly_related: ["user"] },
        can_view: { union: ["viewer", "editor", "owner"] },
        can_edit: { union: ["editor", "owner"] },
      },
    },
  ],
};

export const DOCUMENTS: Record<string, { title: string; content: string; classification: string }> = {
  "project-roadmap": {
    title: "Project Roadmap 2025",
    content: "Q1: Launch auth module. Q2: Add CIBA support. Q3: FGA integration. Q4: Token Vault release.",
    classification: "internal",
  },
  "budget-2025": {
    title: "Budget 2025",
    content: "Total budget: $2.4M. Engineering: $1.2M. Marketing: $600K. Operations: $600K.",
    classification: "confidential",
  },
  "classified-report": {
    title: "Classified Security Report",
    content: "REDACTED — This document contains sensitive security findings.",
    classification: "restricted",
  },
  "team-handbook": {
    title: "Team Handbook",
    content: "Welcome to the team! Here are our values, processes, and guidelines for working together.",
    classification: "public",
  },
};
