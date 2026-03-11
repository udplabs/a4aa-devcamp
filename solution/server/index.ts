import "dotenv/config";
import express from "express";
import cors from "cors";
import { processMessage } from "./simulator";
import { validateAccessToken, extractUser } from "./middleware/auth";
import { recordConsent, revokeConsent } from "./middleware/agent-auth";
import { startMCPServer } from "./mcp/server";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Chat endpoint - protected with Auth0 JWT validation
app.post("/api/chat", validateAccessToken, async (req, res) => {
  try {
    const user = extractUser(req);
    console.log(`Authenticated request from user: ${user.sub}`);

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

// User approves a tool action
app.post("/api/consent/approve", validateAccessToken, (req, res) => {
  const user = extractUser(req);
  const { toolName } = req.body;

  recordConsent(user.sub, toolName);
  console.log(`User ${user.sub} approved tool: ${toolName}`);

  res.json({ approved: true, toolName });
});

// User denies a tool action
app.post("/api/consent/deny", validateAccessToken, (req, res) => {
  const user = extractUser(req);
  const { toolName } = req.body;

  revokeConsent(user.sub, toolName);
  console.log(`User ${user.sub} denied tool: ${toolName}`);

  res.json({ denied: true, toolName });
});

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});

// Start the MCP server on a separate port
startMCPServer();

export default app;
