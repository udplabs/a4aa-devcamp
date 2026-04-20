import net from "net";

/**
 * Finds an available port starting from the preferred port.
 * If the port is in use, increments and tries the next one.
 */
export async function findAvailablePort(startPort: number, label = "Server"): Promise<number> {
  for (let port = startPort; port < startPort + 10; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => server.close(() => resolve(true)));
      server.listen(port);
    });
    if (available) return port;
    console.log(`[${label}] Port ${port} in use, trying ${port + 1}...`);
  }
  return startPort;
}
