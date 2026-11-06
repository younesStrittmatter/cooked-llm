import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MIN_NODE = 18;

export function checkNode() {
  const major = Number(process.version.slice(1).split(".")[0]);
  if (major < MIN_NODE) {
    console.error(`\nNode.js ${MIN_NODE}+ is required (you have ${process.version}).\n`);
    console.error("Install the LTS version from: https://nodejs.org/\n");
    process.exit(1);
  }
}

export function run(label, command, args) {
  if (label) console.log(`\n→ ${label}\n`);

  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(`\nFailed: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
