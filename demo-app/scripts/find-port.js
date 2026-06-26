import "dotenv/config";
import { findAvailablePort } from "../server/utils/port.js";
import fs from "fs";

// Find three non-overlapping available ports for API, MCP, and CRM.
// We claim each port sequentially so the next search starts above the
// one already claimed, preventing the servers from racing for the same port.
const apiPort = await findAvailablePort(Number(process.env.PORT || 3000), "API");
const mcpPort = await findAvailablePort(apiPort + 1, "MCP");
const crmPort = await findAvailablePort(mcpPort + 1, "CRM");

// .port is read by vite.config.js to point its proxy at the API server.
// The MCP and CRM ports are passed as env vars via the dev:server script.
fs.writeFileSync(".port", String(apiPort));

// Persist all three so server/index.js can read them without port-scanning again.
fs.writeFileSync(
  ".ports",
  `API_PORT=${apiPort}\nMCP_SERVER_PORT=${mcpPort}\nCRM_PORT=${crmPort}\n`
);

console.log(`[Startup] API: ${apiPort}  MCP: ${mcpPort}  CRM: ${crmPort}`);
