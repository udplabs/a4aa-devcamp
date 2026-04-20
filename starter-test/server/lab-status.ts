import { Request, Response } from "express";
import { toolRegistry } from "./tools/registry";
import { checkToolAuthorization } from "./middleware/agent-auth";
import { createMCPClient } from "./mcp/client";

export async function labStatusHandler(_req: Request, res: Response) {
  // Check if tool registry has been populated (Lab 3, Step 1)
  const toolRegistryPopulated = Object.keys(toolRegistry).length > 0;

  // Check if agent auth actually enforces scopes (Lab 3, Step 2)
  // The stub always returns { authorized: true } — a real implementation
  // would reject a request with no scopes for a tool that requires them
  let agentAuthImplemented = false;
  try {
    const result = checkToolAuthorization("test-user", [], "get_weather");
    // If toolRegistry is empty, this might return authorized:true by default.
    // If populated and auth is implemented, empty scopes should be rejected.
    agentAuthImplemented = toolRegistryPopulated && !result.authorized;
  } catch {
    agentAuthImplemented = false;
  }

  // Check if consent routes are registered (Lab 3, Step 4)
  const app = _req.app;
  let consentRoutesExist = false;
  try {
    const stack = (app as any)._router?.stack || [];
    consentRoutesExist = stack.some(
      (layer: any) =>
        layer.route?.path === "/api/consent/approve" &&
        layer.route?.methods?.post
    );
  } catch {
    consentRoutesExist = false;
  }

  // Check if JWT middleware is active on /api/chat (Lab 2, Step 4)
  // The protected route will have middleware handlers (more than just the final handler)
  let jwtMiddlewareActive = false;
  try {
    const stack = (app as any)._router?.stack || [];
    const chatRoute = stack.find(
      (layer: any) =>
        layer.route?.path === "/api/chat" && layer.route?.methods?.post
    );
    jwtMiddlewareActive = chatRoute?.route?.stack?.length > 1;
  } catch {
    jwtMiddlewareActive = false;
  }

  // Check if MCP server is reachable (Lab 4)
  let mcpServerReachable = false;
  const mcpPort = process.env.MCP_SERVER_PORT || "3001";
  try {
    const r = await fetch(
      `http://localhost:${mcpPort}/.well-known/oauth-authorization-server`,
      { signal: AbortSignal.timeout(1000) }
    );
    mcpServerReachable = r.ok;
  } catch {
    mcpServerReachable = false;
  }

  // Check if MCP client is implemented (Lab 4, Step 2)
  let mcpClientImplemented = false;
  try {
    const client = createMCPClient();
    await client.callTool("test", {}, "");
    // If we get here without error, it's implemented (though the call itself may fail for other reasons)
    mcpClientImplemented = true;
  } catch (e: any) {
    // The stub throws "not implemented" — a real implementation throws something else
    mcpClientImplemented =
      e.message != null && !e.message.includes("not implemented");
  }

  res.json({
    toolRegistryPopulated,
    agentAuthImplemented,
    consentRoutesExist,
    jwtMiddlewareActive,
    mcpServerReachable,
    mcpClientImplemented,
  });
}
