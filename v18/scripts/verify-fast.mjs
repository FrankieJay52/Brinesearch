import { execFileSync, spawnSync } from "node:child_process";
import { extname } from "node:path";

function fail(message) {
  console.error(`BrineSearch fast verification failed: ${message}`);
  process.exit(1);
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function existingBase() {
  const requested = process.env.BRINESEARCH_VERIFY_BASE?.trim();
  const candidates = [requested, "origin/main", "main", "HEAD~1"].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = git(["rev-parse", "--verify", candidate]);
    if (resolved) return resolved;
  }
  return null;
}

function changedFiles(base) {
  const files = new Set();
  const add = (text) => {
    for (const line of String(text || "").split(/\r?\n/u)) {
      const value = line.trim();
      if (value) files.add(value.replaceAll("\\", "/"));
    }
  };

  if (base) {
    const mergeBase = git(["merge-base", "HEAD", base]) || base;
    add(git(["diff", "--name-only", "--diff-filter=ACMR", `${mergeBase}...HEAD`]));
  }
  add(git(["diff", "--name-only", "--diff-filter=ACMR"]));
  add(git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]));
  return [...files].sort();
}

function matches(files, patterns) {
  return files.some((file) => patterns.some((pattern) => (
    typeof pattern === "string" ? file.includes(pattern) : pattern.test(file)
  )));
}

function run(label, command, args) {
  console.log(`\n[fast verify] ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) fail(`${label} exited with ${result.status ?? "no status"}`);
}

const base = existingBase();
const files = changedFiles(base);
console.log(`[fast verify] base=${base || "unavailable"}`);
console.log(`[fast verify] changed files=${files.length}`);
for (const file of files) console.log(`  ${file}`);

if (!files.length) {
  console.log("[fast verify] no changed files; nothing to verify in the iteration loop");
  process.exit(0);
}

const broadTestImpact = matches(files, [
  /^v18\/(package|package-lock)\.json$/u,
  /^v18\/vitest\.config\./u,
  /^v18\/tsconfig\.json$/u,
]);
const typescriptImpact = broadTestImpact || files.some((file) => [".ts", ".tsx"].includes(extname(file)));
const runtimeImpact = matches(files, [/^v18\/src\//u, /^v18\/scripts\//u]);

// Contract/audit mapping is intentionally conservative. A change may select
// several focused checks, but a failure stops immediately instead of burning
// time on unrelated gates.
const commands = [];
const add = (key, label, command, args) => {
  if (!commands.some((entry) => entry.key === key)) commands.push({ key, label, command, args });
};

if (matches(files, ["sanitize-pad-fallback-data", "pad-fallback-data"])) {
  add("fallback", "fallback sanitizer contract", "npm", ["run", "verify:fallback"]);
}
if (matches(files, ["batch0-ascent", "audit-batch0-ascent", "batch0-ascent-six-county"])) {
  add("batch0", "Ascent batch-0 navigation contract", "npm", ["run", "verify:batch0-audit"]);
}
if (matches(files, ["ascentPad", "ascent-pad", "V18_NAMED_ROAD_NAVIGATION_CONTRACT", "named-road-navigation"])) {
  add("data-status", "named-road navigation contract", "npm", ["run", "verify:data-status"]);
  add("ascent-generator", "Ascent approach generator regression", "npm", ["run", "verify:ascent-approach-generator"]);
  add("ascent-batch2", "Ascent approach artifact audit", "npm", ["run", "verify:ascent-batch2"]);
}
if (matches(files, ["companyRoad", "company-road", "public-company-road"])) {
  add("company-roads", "public company-road overlay contract", "npm", ["run", "verify:company-roads"]);
}
if (matches(files, ["ownerApproved", "owner-approved", "ApprovedRoutes", "approved-routes-map"])) {
  add("owner-roads", "owner approved-routes contract", "npm", ["run", "verify:owner-roads"]);
}
if (matches(files, ["ownerGoogle", "owner-google", "google-verify-map"])) {
  add("owner-map", "owner Google verifier contract", "npm", ["run", "verify:owner-map"]);
}

if (typescriptImpact) add("typecheck", "TypeScript typecheck", "npm", ["run", "typecheck"]);

if (runtimeImpact) {
  if (broadTestImpact || !base) {
    add("vitest", "full Vitest suite (broad/unknown impact)", "npm", ["run", "test"]);
  } else {
    add("vitest-changed", "Vitest tests related to changed files", "npx", [
      "vitest", "run", "--config", "vitest.config.ts", "--changed", base,
    ]);
  }
}

if (!commands.length) {
  console.log("[fast verify] no runtime/test contract matched; iteration verification is documentation/config-only");
  process.exit(0);
}

for (const entry of commands) run(entry.label, entry.command, entry.args);
console.log("\n[fast verify] PASS — iteration checks only; this is not release evidence.");
console.log("[fast verify] Before PR readiness/merge/release, run the exact-head full gate.");
