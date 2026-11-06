#!/usr/bin/env node

/**
 * One-time project setup for cooked-llm
 *
 * Cross-platform — works on macOS, Linux, and Windows.
 * Requires Node.js 18+: https://nodejs.org/
 *
 * USAGE
 *   npm run setup
 *
 * THEN
 *   npm run dev
 */

import { checkNode, run } from "./lib.js";

console.log("Setting up cooked-llm…");
checkNode();

run("Install dependencies", "npm", ["install"]);
run("Verify build", "npm", ["run", "build"]);

console.log(`
Setup complete.

  npm run dev   http://localhost:8788
`);
