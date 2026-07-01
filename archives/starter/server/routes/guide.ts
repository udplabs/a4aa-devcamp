import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const LABS = [
  { id: "00-overview", title: "Lab Overview" },
  { id: "01-user-authentication", title: "Lab 1: User Authentication" },
  { id: "02-async-authorization-ciba", title: "Lab 2: Async Authorization (CIBA)" },
  { id: "03-fine-grained-authorization", title: "Lab 3: Fine-Grained Authorization" },
  { id: "04-token-vault", title: "Lab 4: Token Vault" },
  { id: "05-auth-for-mcp", title: "Lab 5: Auth for MCP" },
  { id: "06-end-to-end", title: "Lab 6: End-to-End" },
];

function getLabGuidePath(): string {
  const candidates = [
    path.resolve(process.cwd(), "lab-guide"),
    path.resolve(process.cwd(), "../lab-guide"),
    path.resolve(__dirname, "../../lab-guide"),
    path.resolve(__dirname, "../../../lab-guide"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[1];
}

// List all labs
router.get("/api/guide", (_req, res) => {
  res.json({ labs: LABS });
});

// Get a specific lab's markdown content
router.get("/api/guide/:labId", (req, res) => {
  const { labId } = req.params;
  const lab = LABS.find((l) => l.id === labId);
  if (!lab) {
    return res.status(404).json({ error: "Lab not found" });
  }

  const guideDir = getLabGuidePath();
  const filePath = path.join(guideDir, `${labId}.md`);

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ id: lab.id, title: lab.title, content });
  } catch {
    res.status(404).json({ error: `Lab guide file not found: ${labId}.md` });
  }
});

export default router;
