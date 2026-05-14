import "dotenv/config";
import express from "express";
import cors from "cors";
import { processMessage as simulatorProcessMessage } from "./simulator";
import fs from "fs";
import guideRouter from "./routes/guide";

// Use OpenAI LLM when API key is available, otherwise fall back to pattern matching
const useLLM = !!process.env.OPENAI_API_KEY;
let processMessage = simulatorProcessMessage;

if (useLLM) {
  const llm = await import("./llm");
  processMessage = llm.processMessage;
  console.log("[Server] Using OpenAI LLM for chat responses");
} else {
  console.log("[Server] No OPENAI_API_KEY found, using pattern-matching simulator");
}

const app = express();

let PORT = Number(process.env.PORT || 3000);
try { PORT = parseInt(fs.readFileSync(".port", "utf-8").trim()); } catch {}

app.use(cors());
app.use(express.json());

// =============================================================
// LAB 01: Import and apply JWT validation middleware
// See: lab-guide/01-user-authentication.md
//
// import { validateAccessToken, extractUser } from "./middleware/auth";
// =============================================================

// Lab guide viewer
app.use(guideRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Chat endpoint
// LAB 01: Add validateAccessToken middleware to this route
app.post("/api/chat", async (req, res) => {
  try {
    // LAB 01: Extract the authenticated user from the validated access token.
    // const user = extractUser(req);
    // const accessToken = req.headers.authorization?.replace(/^Bearer\s+/i, "");

    // Mock user until Lab 01 wires up JWT validation.
    const user = {
      sub: "anonymous",
      scope: ["mcp:quote:read", "mcp:docs:create", "mcp:slack:post", "mcp:quote:commit"],
      email: "anonymous@example.com",
      accessToken: undefined as string | undefined,
    };

    const { message, conversationHistory } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const response = await processMessage(message, conversationHistory, user);
    res.json(response);
  } catch (error: any) {
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================
// LAB 02: Add CIBA endpoints. The commit_quote_terms tool triggers
// a backchannel approval when discount > 20% or terms are non-standard.
// Build the binding message in /api/ciba/initiate from the quote
// parameters so the rep's device displays the exact terms.
//
// POST /api/ciba/initiate
// GET  /api/ciba/status/:authReqId
// POST /api/ciba/approve/:authReqId
// POST /api/ciba/deny/:authReqId
// GET  /api/ciba/pending
//
// See: lab-guide/02-async-authorization-ciba.md
// =============================================================

// =============================================================
// LAB 04: Token Vault endpoints
//   POST /api/vault/link    body: { provider: "google" | "slack" }
//   POST /api/vault/unlink  body: { provider }
//   GET  /api/vault/providers
// See: lab-guide/04-token-vault.md
// =============================================================

// =============================================================
// LAB 04: Start the third-party mock API (Google + Slack)
//   import { startThirdPartyAPI } from "./token-vault/third-party-api";
//   startThirdPartyAPI();
// =============================================================

// =============================================================
// LAB 05: Start the Auth0-secured MCP server
//   import { startMCPServer } from "./mcp/server";
//   startMCPServer();
// See: lab-guide/05-auth-for-mcp.md
// =============================================================

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});

export default app;
