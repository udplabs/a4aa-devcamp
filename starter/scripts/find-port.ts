import "dotenv/config";
import { findAvailablePort } from "../server/utils/port";
import fs from "fs";

const port = await findAvailablePort(Number(process.env.PORT || 3000), "API");
fs.writeFileSync(".port", String(port));
console.log(`[Startup] API port: ${port}`);
