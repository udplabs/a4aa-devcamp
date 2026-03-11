import "dotenv/config";
import express from "express";
import cors from "cors";
import { processMessage } from "./simulator";
import { labStatusHandler } from "./lab-status";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// =============================================================
// LAB 2: Import and apply JWT validation middleware
// See: lab-guide/02-chat-interface.md - Step 4
//
// import { validateAccessToken, extractUser } from "./middleware/auth";
// =============================================================

// Lab progress detection (used by the in-app Lab Guide panel)
app.get("/api/lab-status", labStatusHandler);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Chat endpoint
// LAB 2: Add validateAccessToken middleware to this route
app.post("/api/chat", async (req, res) => {
  try {
    // LAB 2: Extract authenticated user from token
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
// LAB 3: Add consent endpoints
// See: lab-guide/03-protect-the-api.md - Step 4
//
// POST /api/consent/approve
// POST /api/consent/deny
// =============================================================

// =============================================================
// LAB 4: Start the MCP server
// See: lab-guide/04-agent-authorization.md - Step 6
//
// import { startMCPServer } from "./mcp/server";
// startMCPServer();
// =============================================================

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});

export default app;
