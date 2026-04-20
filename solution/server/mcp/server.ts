import express from "express";
import { auth } from "express-oauth2-jwt-bearer";
import { protectedResourceMetadata } from "./metadata";
import { findAvailablePort } from "../utils/port";

const app = express();
app.use(express.json());

// OAuth 2.0 token validation
const validateMCPToken = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.MCP_AUTH0_AUDIENCE,
});

// RFC 9728: Protected Resource Metadata
app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);

// OAuth 2.0 Authorization Server Metadata
app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: `https://${process.env.AUTH0_DOMAIN}/`,
    authorization_endpoint: `https://${process.env.AUTH0_DOMAIN}/authorize`,
    token_endpoint: `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
    jwks_uri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
    scopes_supported: [
      "mcp:weather:read",
      "mcp:calendar:read",
      "mcp:email:send",
      "mcp:documents:read",
    ],
    grant_types_supported: [
      "urn:ietf:params:oauth:grant-type:token-exchange",
    ],
    client_registration_types_supported: ["metadata"],
  });
});

// List available tools (MCP tools/list)
app.get("/mcp/tools", validateMCPToken, (_req, res) => {
  console.log("[MCP Server] Tools list requested");
  res.json({
    tools: [
      {
        name: "get_weather",
        description: "Check destination weather and travel conditions",
        inputSchema: {
          type: "object",
          properties: { location: { type: "string", description: "Destination city" } },
          required: ["location"],
        },
        requiredScope: "mcp:weather:read",
      },
      {
        name: "get_calendar",
        description: "View your trip itinerary and scheduled activities",
        inputSchema: {
          type: "object",
          properties: { date: { type: "string", description: "Date (YYYY-MM-DD)" } },
        },
        requiredScope: "mcp:calendar:read",
      },
      {
        name: "send_email",
        description: "Send a booking confirmation or travel update email",
        inputSchema: {
          type: "object",
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["to", "subject", "body"],
        },
        requiredScope: "mcp:email:send",
      },
      {
        name: "get_document",
        description: "Retrieve a document by ID",
        inputSchema: {
          type: "object",
          properties: { documentId: { type: "string" } },
          required: ["documentId"],
        },
        requiredScope: "mcp:documents:read",
      },
    ],
  });
});

// Execute a tool (MCP tools/call) — protected + scope enforcement
app.post("/mcp/tools/call", validateMCPToken, (req, res) => {
  const { name, arguments: args } = req.body;
  const tokenScopes = (req as any).auth?.payload?.scope?.split(" ") || [];

  console.log(`[MCP Server] Tool call: ${name}, scopes: ${tokenScopes}`);

  const scopeMap: Record<string, string> = {
    get_weather: "mcp:weather:read",
    get_calendar: "mcp:calendar:read",
    send_email: "mcp:email:send",
    get_document: "mcp:documents:read",
  };

  const requiredScope = scopeMap[name];
  if (!requiredScope) {
    return res.status(404).json({ error: `Unknown tool: ${name}` });
  }

  if (!tokenScopes.includes(requiredScope)) {
    console.log(`[MCP Server] DENIED — Required: ${requiredScope}, have: ${tokenScopes}`);
    return res.status(403).json({
      error: "Insufficient scope",
      required: requiredScope,
      provided: tokenScopes,
    });
  }

  const result = executeToolLocally(name, args);
  console.log(`[MCP Server] Tool ${name} executed successfully`);
  res.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
});

function executeToolLocally(name: string, args: any): any {
  switch (name) {
    case "get_weather":
      return {
        location: args.location,
        temperature: `${Math.floor(Math.random() * 30 + 5)}\u00B0C`,
        condition: ["Sunny", "Cloudy", "Rainy", "Partly Cloudy"][Math.floor(Math.random() * 4)],
        humidity: `${Math.floor(Math.random() * 60 + 30)}%`,
      };
    case "get_calendar":
      return {
        events: [
          { time: "9:00 AM", title: "Airport Check-in (Terminal 2)" },
          { time: "11:30 AM", title: "Flight to Bali (GA-412)" },
          { time: "3:00 PM", title: "Hotel Check-in (The Mulia Resort)" },
          { time: "7:00 PM", title: "Dinner Reservation (La Lucciola)" },
        ],
      };
    case "send_email":
      return {
        success: true,
        to: args.to,
        subject: args.subject,
        messageId: `msg-${Date.now()}`,
        timestamp: new Date().toISOString(),
      };
    case "get_document":
      return {
        documentId: args.documentId,
        title: `Document: ${args.documentId}`,
        content: "Document content retrieved via MCP.",
      };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function startMCPServer() {
  const preferredPort = parseInt(process.env.MCP_SERVER_PORT || "3001");
  const port = await findAvailablePort(preferredPort, "MCP Server");
  app.listen(port, () => {
    console.log(`[MCP Server] Running on http://localhost:${port}`);
    console.log(`[MCP Server] PRM: http://localhost:${port}/.well-known/oauth-protected-resource`);
    console.log(`[MCP Server] OAuth: http://localhost:${port}/.well-known/oauth-authorization-server`);
  });
}

export default app;
