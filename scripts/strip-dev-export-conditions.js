/**
 * prepack script for publishable packages.
 *
 * Strips the "bun" and "@mdcms/source" export conditions from package.json
 * before npm packs the tarball. These conditions point to src/ files that
 * are not shipped to npm (only dist/ is included).
 *
 * The companion postpack script restores the original file.
 *
 * Usage in package.json:
 *   "prepack": "node ../../scripts/strip-dev-export-conditions.js",
 *   "postpack": "node ../../scripts/restore-package-json.js"
 */

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const DEV_CONDITIONS = ["bun", "@mdcms/source"];

const pkgPath = join(process.cwd(), "package.json");
const backupPath = join(process.cwd(), "package.json.prepublish-backup");

// Save backup before modifying
copyFileSync(pkgPath, backupPath);

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

function stripConditions(exports) {
  if (typeof exports !== "object" || exports === null) return;

  for (const [key, value] of Object.entries(exports)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      let isConditionMap = Object.values(value).some(
        (v) => typeof v === "string",
      );
      if (isConditionMap) {
        for (const condition of DEV_CONDITIONS) {
          delete value[condition];
        }
      }
      stripConditions(value);
    }
  }
}

if (pkg.exports) {
  stripConditions(pkg.exports);
}

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
