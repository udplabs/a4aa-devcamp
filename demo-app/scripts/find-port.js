import "dotenv/config";
import { findAvailablePort } from "../server/utils/port.js";
import fs from "fs";

// Find four non-overlapping available ports for API, MCP, CRM, and Acme.
// We claim each port sequentially so the next search starts above the
// one already claimed, preventing the servers from racing for the same port.
const apiPort = await findAvailablePort(Number(process.env.PORT || 3000), "API");
const mcpPort = await findAvailablePort(apiPort + 1, "MCP");
const crmPort = await findAvailablePort(mcpPort + 1, "CRM");
const acmePort = await findAvailablePort(crmPort + 1, "Acme");

// .port is read by vite.config.js to point its proxy at the API server.
// The MCP, CRM, and Acme ports are passed as env vars via the dev:server script.
fs.writeFileSync(".port", String(apiPort));

// Persist all four so server/index.js can read them without port-scanning again.
fs.writeFileSync(
  ".ports",
  `API_PORT=${apiPort}\nMCP_SERVER_PORT=${mcpPort}\nCRM_PORT=${crmPort}\nACME_SERVER_PORT=${acmePort}\n`
);

console.log(`[Startup] API: ${apiPort}  MCP: ${mcpPort}  CRM: ${crmPort}  Acme: ${acmePort}`);
