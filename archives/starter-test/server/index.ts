import "dotenv/config";
import express from "express";
import cors from "cors";
import { processMessage as simulatorProcessMessage } from "./simulator";
import { labStatusHandler } from "./lab-status";
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
// LAB 1: Import and apply JWT validation middleware
// See: lab-guide/01-user-authentication.md - Step 9
//
// import { validateAccessToken, extractUser } from "./middleware/auth";
// =============================================================

// Lab guide viewer
app.use(guideRouter);

// Lab progress detection (used by the in-app Lab Guide panel)
app.get("/api/lab-status", labStatusHandler);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Chat endpoint
// LAB 1: Add validateAccessToken middleware to this route
app.post("/api/chat", async (req, res) => {
  try {
    // LAB 1: Extract authenticated user from token
    // const user = extractUser(req);
    // console.log(`Authenticated request from user: ${user.sub}`);

    // For now, use a mock user
    const user = {
      sub: "anonymous",
      scope: ["chat:send", "tools:read", "tools:execute", "email:send"],
      email: "anonymous@example.com",
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
// LAB 2: Add CIBA endpoints
// See: lab-guide/02-async-authorization-ciba.md - Step 4
//
// POST /api/ciba/initiate
// GET  /api/ciba/status/:authReqId
// POST /api/ciba/approve/:authReqId
// POST /api/ciba/deny/:authReqId
// GET  /api/ciba/pending
// =============================================================

// =============================================================
// LAB 4: Add Token Vault endpoints
// See: lab-guide/04-token-vault.md - Step 6
//
// POST /api/vault/link
// POST /api/vault/unlink
// GET  /api/vault/providers
// =============================================================

// =============================================================
// LAB 4: Start the third-party API server
// See: lab-guide/04-token-vault.md - Step 5
//
// import { startThirdPartyAPI } from "./token-vault/third-party-api";
// startThirdPartyAPI();
// =============================================================

// =============================================================
// LAB 5: Start the MCP server
// See: lab-guide/05-auth-for-mcp.md - Part E
//
// import { startMCPServer } from "./mcp/server";
// startMCPServer();
// =============================================================

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});

export default app;
