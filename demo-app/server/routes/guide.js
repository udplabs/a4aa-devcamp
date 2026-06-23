import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const LABS = [
  { id: "overview", title: "Overview" },
  { id: "introduction", title: "Introduction" },
  { id: "00-prerequisites", title: "Module 00: Prerequisites" },
  { id: "01-user-authentication", title: "Module 01: User Authentication" },
  { id: "02-fine-grained-authorization", title: "Module 02: Fine-Grained Authorization" },
  { id: "03-token-vault", title: "Module 03: Token Vault" },
  { id: "04-auth-for-mcp", title: "Module 04: Auth for MCP" },
  { id: "bonus-async-authorization-ciba", title: "Bonus: Async Authorization (CIBA)" },
  { id: "05-end-to-end", title: "Module 05: End-to-End" },
  { id: "conclusion", title: "Conclusion" },
];

function getLabGuidePath() {
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
