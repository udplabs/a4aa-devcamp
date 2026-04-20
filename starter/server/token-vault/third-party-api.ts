// =============================================================
// LAB 4: Build the Simulated Third-Party API
// See: lab-guide/04-token-vault.md - Step 2
//
// This is a separate Express server that simulates a third-party
// File Storage API. It validates bearer tokens and returns files.
//
// Implement:
// - Token validation middleware
// - GET /api/files — list files (protected)
// - GET /api/files/:fileId — get a specific file (protected)
// - startThirdPartyAPI() — start the server
// =============================================================

import express from "express";
import { findAvailablePort } from "../utils/port";

const app = express();
app.use(express.json());

// TODO: Add token validation middleware

// TODO: Add GET /api/files endpoint (protected)

// TODO: Add GET /api/files/:fileId endpoint (protected)

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "File Storage API" });
});

export async function startThirdPartyAPI() {
  const preferredPort = parseInt(process.env.THIRD_PARTY_API_PORT || "3002");
  const port = await findAvailablePort(preferredPort, "Third-Party API");
  app.listen(port, () => {
    console.log(
      `[Third-Party API] File Storage API running on http://localhost:${port}`
    );
  });
}

export default app;
