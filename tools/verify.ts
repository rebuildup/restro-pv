#!/usr/bin/env node
// Verify a generated AEP against the legacy source dump.
//
//   bun tools/verify.ts [--aep dist/pv-generated.aep] [--source-dump .tmp/aep-tree/pv-2dc99e1]
//                        [--gen-dump .tmp/aep-tree/pv-generated] [--skip-dump]
//
// Steps:
//   1. identity: output AEP exists, is non-empty, and matches the sha256
//      recorded by the last successful generate run (stale outputs from an
//      older build are rejected).
//   2. structure: dump the generated AEP (resumable, same extractor as the
//      source) and diff it against the source dump — comps matched by name
//      (project item order is not stable across projects), layers, property
//      trees, key counts, shape vertices.
//   3. report: machine-readable verdict to .tmp/verify-report.json.
//
// Visual/render comparison is a separate step (preview / release-verify);
// this command proves structural reproduction only.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (flag: string, dflt: string) => {
  const i = args.indexOf(flag);
  return resolve(i >= 0 ? args[i + 1] : dflt);
};
const skipDump = args.includes("--skip-dump");

const aep = opt("--aep", join(ROOT, "dist", "pv-generated.aep"));
// v2 dump carries the corrected timeRemapEnabled/canTimeRemap fields; the
// original pv-2dc99e1 dump recorded canSetTimeRemapEnabled by mistake.
const sourceDump = opt("--source-dump", join(ROOT, ".tmp", "aep-tree", "pv-2dc99e1-v2"));
const genDump = opt("--gen-dump", join(ROOT, ".tmp", "aep-tree", "pv-generated"));
const runRecordPath = join(ROOT, ".tmp", "generate-run.json");
const reportPath = join(ROOT, ".tmp", "verify-report.json");

const sha256 = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const report: Record<string, unknown> = {
  schema: "restro-pv.verify/v1",
  startedAt: new Date().toISOString(),
  aep,
  sourceDump,
  genDump,
  checks: [] as { id: string; ok: boolean; detail: string }[],
};
const checks = report.checks as { id: string; ok: boolean; detail: string }[];
const check = (id: string, ok: boolean, detail: string) => {
  checks.push({ id, ok, detail });
  console.log(`[${ok ? " OK " : "FAIL"}] ${id}: ${detail}`);
};

function finish(status: string) {
  report.status = status;
  report.finishedAt = new Date().toISOString();
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`verify: ${status} (report: ${reportPath})`);
  process.exit(status === "ok" ? 0 : 1);
}

// --- 1. identity -------------------------------------------------------------
if (!existsSync(aep)) finish("fail-no-aep");
const aepBytes = readFileSync(aep).length;
check("aep.exists", aepBytes > 0, `${aep} (${aepBytes} bytes)`);

let expectedSha: string | null = null;
if (existsSync(runRecordPath)) {
  const run = JSON.parse(readFileSync(runRecordPath, "utf8"));
  expectedSha = (run.output as { sha256?: string } | null)?.sha256 ?? null;
  check("generate.runStatus", run.status === "ok", `generate-run status=${run.status}`);
} else {
  check("generate.runStatus", false, "no .tmp/generate-run.json — run npm run generate first");
}
if (expectedSha) {
  const actual = sha256(aep);
  check(
    "aep.identity",
    actual === expectedSha,
    actual === expectedSha
      ? "sha256 matches generate record"
      : `sha256 ${actual} != recorded ${expectedSha}`,
  );
} else {
  check(
    "aep.identity",
    false,
    "no recorded output hash; cannot prove this AEP is the pipeline product",
  );
}
if (checks.some((c) => !c.ok)) finish("fail-identity");

if (!existsSync(join(sourceDump, "_manifest.done"))) {
  check("source.dump", false, `source dump incomplete: ${sourceDump}`);
  finish("fail-source-dump");
}
check("source.dump", true, "source dump manifest present");

// --- 2. dump generated AEP -----------------------------------------------------
if (!skipDump) {
  console.log("dumping generated AEP (resumable)...");
  try {
    execFileSync("node", ["tools/dump-aep-tree.ts", aep, genDump, "--timeout", "7200000"], {
      cwd: ROOT,
      stdio: "inherit",
    });
  } catch (error) {
    check("gen.dump", false, String(error));
    finish("fail-gen-dump");
  }
}
if (!existsSync(join(genDump, "_manifest.done"))) {
  check("gen.dump", false, `generated dump incomplete: ${genDump}`);
  finish("fail-gen-dump");
}
check("gen.dump", true, "generated dump manifest present");

// --- 3. structural diff ---------------------------------------------------------
// compare-aep exits 0 on STRUCTURE MATCH, 1 on any difference.
try {
  const out = execFileSync("node", ["tools/compare-aep.ts", sourceDump, genDump], {
    cwd: ROOT,
    encoding: "utf8",
  });
  process.stdout.write(out);
  check("structure.diff", true, "STRUCTURE MATCH");
} catch (error) {
  const e = error as { status?: number; stdout?: string };
  if (e.stdout) process.stdout.write(e.stdout);
  check(
    "structure.diff",
    false,
    e.status === 1 ? "structural differences found (see above)" : String(error),
  );
}

finish(checks.every((c) => c.ok) ? "ok" : "fail-diffs");
