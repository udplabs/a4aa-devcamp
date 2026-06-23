// =============================================================
// FGA model -- Nexus company knowledge document graph
//
// Relationships:
//   user -> viewer/editor/owner -> document
//   user -> member -> department
//   department -> viewer -> document (via department#member)
//
// can_read = viewer OR editor OR owner
//             OR member of a department that has viewer on the doc
// can_share = editor OR owner
// =============================================================

export const FGA_MODEL = {
  type_definitions: [
    { type: "user" },
    {
      type: "department",
      relations: {
        member: { directly_related: ["user"] },
      },
    },
    {
      type: "document",
      relations: {
        owner:      { directly_related: ["user"] },
        editor:     { directly_related: ["user"] },
        viewer:     { directly_related: ["user", "department#member"] },
        can_read:   { union: ["owner", "editor", "viewer"] },
        can_share:  { union: ["owner", "editor"] },
      },
    },
  ],
};

// Real OpenFGA (Auth0/Okta FGA) authorization model -- schema 1.1.
// Written to a per-demo store by the CREATE hook and used by the
// live FGA client. Mirrors FGA_MODEL above in proper OpenFGA shape.
export const FGA_AUTH_MODEL = {
  schema_version: "1.1",
  type_definitions: [
    { type: "user" },
    {
      type: "department",
      relations: {
        member: { this: {} },
      },
      metadata: {
        relations: {
          member: { directly_related_user_types: [{ type: "user" }] },
        },
      },
    },
    {
      type: "document",
      relations: {
        owner:  { this: {} },
        editor: { this: {} },
        viewer: { this: {} },
        can_read: {
          union: {
            child: [
              { computedUserset: { relation: "owner" } },
              { computedUserset: { relation: "editor" } },
              { computedUserset: { relation: "viewer" } },
            ],
          },
        },
        can_share: {
          union: {
            child: [
              { computedUserset: { relation: "owner" } },
              { computedUserset: { relation: "editor" } },
            ],
          },
        },
      },
      metadata: {
        relations: {
          owner:     { directly_related_user_types: [{ type: "user" }] },
          editor:    { directly_related_user_types: [{ type: "user" }] },
          viewer:    { directly_related_user_types: [{ type: "user" }, { type: "department", relation: "member", wildcard: {} }] },
          can_read:  {},
          can_share: {},
        },
      },
    },
  ],
};

// Demo document corpus. FGA tuples control who can read/share each doc;
// this is just the metadata + content for the mock. classification drives
// the FGA deny demo: "confidential" docs are never seeded for demo users.
export const DOCUMENTS = [
  {
    id: "handbook",
    title: "Employee Handbook",
    department: "all-company",
    classification: "public",
    snippet: "Covers onboarding, benefits, PTO policy, code of conduct, and remote work guidelines for all employees.",
    content: "Welcome to the company. This handbook covers everything you need to know as an employee: onboarding steps, benefits enrollment, PTO accrual, expense policy, code of conduct, and remote work guidelines. All employees are expected to review this document annually.",
  },
  {
    id: "security-policy",
    title: "Information Security Policy",
    department: "all-company",
    classification: "internal",
    snippet: "Defines acceptable use, data classification, access control, and incident reporting requirements for all staff.",
    content: "All employees must comply with this Information Security Policy. Data is classified as Public, Internal, or Confidential. Access to systems follows least-privilege principles. Incidents must be reported to security@company.com within 24 hours. Password requirements: 16+ characters, MFA required for all SaaS tools.",
  },
  {
    id: "q3-roadmap",
    title: "Q3 Product Roadmap",
    department: "engineering",
    classification: "internal",
    snippet: "Engineering milestones for Q3: auth platform upgrade, MCP server rollout, FGA integration, and mobile SDK release.",
    content: "Q3 Roadmap — Engineering. Key milestones: (1) Auth platform upgrade to Auth0 for AI Agents by July 15. (2) MCP server v2 rollout with per-tool scope enforcement by Aug 1. (3) FGA integration across all internal tools by Aug 31. (4) Mobile SDK v3.0 release by Sept 15. All milestones require sign-off from VP Engineering.",
  },
  {
    id: "product-spec-v2",
    title: "Product Spec v2.0",
    department: "engineering",
    classification: "internal",
    snippet: "Technical specification for the v2.0 platform: API contracts, data models, auth flows, and integration points.",
    content: "Product Spec v2.0. API: RESTful, JSON, OAuth 2.0 protected. Auth flows: Authorization Code + PKCE for SPA, OBO token exchange for agent-to-MCP calls. Data model: Users, Organizations, Documents, AuditLog. Integration: Auth0 tenant per org, FGA store per deployment, Token Vault for federated credentials. All agent actions must carry user sub in token.",
  },
  {
    id: "compensation-q3",
    title: "Q3 Compensation Review",
    department: "hr",
    classification: "confidential",
    snippet: "Confidential compensation adjustments and band reviews for Q3. HR access only.",
    content: "CONFIDENTIAL — HR ONLY. Q3 compensation review covering salary band adjustments, equity refresh grants, and promotion-related comp changes. Not for distribution outside HR and executive leadership.",
  },
  {
    id: "board-deck-q3",
    title: "Q3 Board Deck",
    department: "executive",
    classification: "confidential",
    snippet: "Board presentation for Q3: revenue, pipeline, headcount, and strategic priorities.",
    content: "CONFIDENTIAL — EXECUTIVE ONLY. Q3 board presentation. Revenue: $12.4M (+18% YoY). Pipeline: $31M. Net new logos: 47. Headcount: 312 (+22 QoQ). Strategic priorities: enterprise expansion, AI platform launch, Series C preparation.",
  },
];
