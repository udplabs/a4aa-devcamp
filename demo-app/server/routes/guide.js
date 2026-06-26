import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

export const LABS = [
  { id: "overview",                      title: "Overview",                   module: null },
  { id: "introduction",                  title: "Introduction",               module: null },
  { id: "00-prerequisites",              title: "Module 00: Prerequisites",   module: "00" },
  { id: "01-auth-for-mcp",              title: "Module 01: Auth for MCP",    module: "01" },
  { id: "02-user-authentication",        title: "Module 02: User Auth",       module: "02" },
  { id: "03-token-vault",               title: "Module 03: Token Vault",     module: "03" },
  { id: "04-ciba",                       title: "Module 04: CIBA",            module: "04" },
  { id: "05-fine-grained-authorization", title: "Module 05: FGA",             module: "05" },
  { id: "06-end-to-end",                title: "Module 06: End-to-End",      module: "06" },
  { id: "conclusion",                    title: "Conclusion",                 module: null },
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

router.get("/api/guide", (_req, res) => {
  res.json({ labs: LABS });
});

router.get("/api/guide/:labId", (req, res) => {
  const { labId } = req.params;
  const lab = LABS.find((l) => l.id === labId);
  if (!lab) return res.status(404).json({ error: "Lab not found" });

  const guideDir = getLabGuidePath();
  const filePath = path.join(guideDir, `${labId}.md`);

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ id: lab.id, title: lab.title, module: lab.module, content });
  } catch {
    res.status(404).json({ error: `Lab guide file not found: ${labId}.md` });
  }
});

export default router;
