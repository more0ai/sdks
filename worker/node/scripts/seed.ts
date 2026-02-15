/**
 * Seed: copy example config and bootstrap files into place if they don't exist.
 */

import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const LOG_PREFIX = "capabilities-worker:seed";

const seeds: [string, string][] = [
  ["config.example.json", "config.json"],
  ["bootstrap.example.json", "bootstrap.json"],
];

for (const [src, dest] of seeds) {
  const srcPath = join(root, src);
  const destPath = join(root, dest);
  if (!existsSync(srcPath)) {
    console.warn(`${LOG_PREFIX} - Source not found: ${src}`);
    continue;
  }
  if (existsSync(destPath)) {
    console.log(`${LOG_PREFIX} - Already exists: ${dest}`);
    continue;
  }
  copyFileSync(srcPath, destPath);
  console.log(`${LOG_PREFIX} - Created ${dest} from ${src}`);
}
