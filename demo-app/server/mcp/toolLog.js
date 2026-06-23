// Shared in-memory ring buffer for MCP tool call logs.
// Written by mcp/server.js on every tool invocation;
// read by server/index.js for the /api/mcp/logs endpoint.
// Both processes run in the same Node.js instance so this module
// is a singleton -- no IPC needed.

const MAX_LOGS = 100;
const logs = [];

export function addLog(entry) {
  logs.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
}

export function getLogs() {
  return [...logs];
}
