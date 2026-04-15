/**
 * postpack script for publishable packages.
 *
 * Restores the original package.json from the backup created by
 * strip-dev-export-conditions.js during prepack.
 */

import { renameSync, existsSync } from "node:fs";
import { join } from "node:path";

const pkgPath = join(process.cwd(), "package.json");
const backupPath = join(process.cwd(), "package.json.prepublish-backup");

if (existsSync(backupPath)) {
  renameSync(backupPath, pkgPath);
}
