#!/usr/bin/env node
/**
 * Builds the static (GitHub Pages) bundle.
 *
 * `output: export` cannot contain dynamic API routes, and they are useless in a
 * static build anyway — the browser uses the localStorage engine instead. This
 * script moves `src/app/api` aside for the duration of the build and always
 * restores it, so a single checkout serves both deployment modes.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");
const backupDir = path.join(root, ".api-route-backup");

const exists = fs.existsSync(apiDir);
const backupExists = fs.existsSync(backupDir);

if (backupExists && !exists) {
  // Recover from a previously interrupted run before doing anything else.
  fs.renameSync(backupDir, apiDir);
}

if (exists) {
  fs.renameSync(apiDir, backupDir);
}

function restore() {
  if (fs.existsSync(backupDir)) {
    if (fs.existsSync(apiDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    } else {
      fs.renameSync(backupDir, apiDir);
    }
  }
}

try {
  execSync("next build", { stdio: "inherit", cwd: root, env: { ...process.env } });
} catch (error) {
  restore();
  process.exitCode = 1;
} finally {
  restore();
}
