// =============================================================
// LAB 5, Part B: Protected Resource Metadata (RFC 9728)
// See: lab-guide/05-auth-for-mcp.md - Part B
//
// Implement the PRM endpoint that advertises:
// - resource identifier
// - authorization_servers
// - scopes_supported
// - bearer_methods_supported
// - client_registration_types_supported (CIMD)
// =============================================================

import { Request, Response } from "express";

/**
 * Protected Resource Metadata handler.
 * TODO: Implement - return the resource metadata JSON
 */
export function protectedResourceMetadata(req: Request, res: Response) {
  // TODO: Return metadata about this MCP server's auth requirements
  res.status(501).json({ error: "Not implemented - see Lab 5, Part B" });
}
