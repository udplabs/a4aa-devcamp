import express from "express";
import { findAvailablePort } from "../utils/port";

const app = express();
app.use(express.json());

const FILES = {
  default: [
    { id: "f1", name: "vacation-photos.zip", size: "245 MB", modified: "2025-01-15" },
    { id: "f2", name: "trip-itinerary.pdf", size: "1.2 MB", modified: "2025-02-01" },
    { id: "f3", name: "travel-receipts.xlsx", size: "340 KB", modified: "2025-02-20" },
    { id: "f4", name: "passport-scan.pdf", size: "2.1 MB", modified: "2024-12-10" },
  ],
};

function validateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.split(" ")[1];
  if (!token.startsWith("fs_access_") && !token.startsWith("refreshed_file-storage_")) {
    return res.status(401).json({ error: "Invalid access token" });
  }

  console.log(`[Third-Party API] Valid token received`);
  next();
}

app.get("/api/files", validateToken, (_req, res) => {
  console.log("[Third-Party API] Listing files");
  res.json({ files: FILES.default });
});

app.get("/api/files/:fileId", validateToken, (req, res) => {
  const file = FILES.default.find((f) => f.id === req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: "File not found" });
  }
  res.json({ file });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "File Storage API" });
});

export async function startThirdPartyAPI() {
  const preferredPort = parseInt(process.env.THIRD_PARTY_API_PORT || "3002");
  const port = await findAvailablePort(preferredPort, "Third-Party API");
  app.listen(port, () => {
    console.log(`[Third-Party API] File Storage API running on http://localhost:${port}`);
  });
}

export default app;
