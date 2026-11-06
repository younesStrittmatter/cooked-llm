#!/usr/bin/env node

/**
 * Deploy cooked-llm to Cloudflare Pages (manual)
 *
 * Cross-platform Node.js script — works on macOS, Linux, and Windows.
 *
 * PREREQUISITE
 *   Run setup first: npm run setup
 *   Log in to Cloudflare: npx wrangler login
 *
 *   You must be invited to the shared Cloudflare account.
 *   Ask the project owner: Dashboard → Manage Account → Members
 *   Role: Workers Platform Admin
 *
 * WHAT IT DOES
 *   1. Builds the site (npm run build → dist/)
 *   2. Uploads dist/ to Cloudflare Pages via Wrangler
 *
 * USAGE
 *        npm run deploy
 *   or:
 *        node dev/deploy.js
 *
 *
 * LIVE SITE
 *   https://cooked-llm.pages.dev
 */

import { checkNode, run } from "./lib.js";

checkNode();

const projectName = process.env.CLOUDFLARE_PAGES_PROJECT ?? "cooked-llm";

console.log(`Deploying "${projectName}" to Cloudflare Pages…`);

run("Build", "npm", ["run", "build"]);
run("Upload", "npx", ["wrangler", "pages", "deploy", "dist", `--project-name=${projectName}`]);

console.log("\nDone.");
