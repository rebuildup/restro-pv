#!/usr/bin/env bun
// Run a standalone JSX inside After Effects and wait for its report marker.
// Same ownership rules as tools/generate.ts: refuses to delegate into a
// running AE unless --allow-running-ae.
//
//   bun tools/ae-proof.ts <script.jsx> [--report .tmp/proof-probe.json]
//                          [--timeout 600000] [--allow-running-ae]
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aeIsRunning, resolveAe } from "./lib/host.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const jsx = resolve(process.argv[2] ?? "");
const reportRel = arg("--report") ?? ".tmp/proof-probe.json";
const reportPath = resolve(ROOT, reportRel);
const donePath = reportPath + ".done";
const timeoutMs = Number(arg("--timeout") ?? 600_000);
const allowRunningAe = process.argv.includes("--allow-running-ae");

if (!jsx || !existsSync(jsx)) {
  console.error("usage: bun tools/ae-proof.ts <script.jsx> [--report path] [--timeout ms]");
  process.exit(1);
}

async function main() {
  const ae = await resolveAe();
  if (aeIsRunning() && !allowRunningAe) {
    console.error("AE is already running; -r would delegate into it. Close AE or pass --allow-running-ae.");
    process.exit(2);
  }
  rmSync(donePath, { force: true });
  rmSync(reportPath, { force: true });
  const child = spawn(ae.executable, ["-r", jsx], { detached: true, stdio: "ignore" });
  child.unref();
  console.log(`ae-proof: launched AfterFX.exe -r (pid ${child.pid}), waiting for ${reportRel}.done`);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (existsSync(donePath)) break;
    if (Date.now() > deadline) {
      console.error("ae-proof: timeout — JSX may still be running in AE. Inspect AE before retrying.");
      process.exit(3);
    }
    await sleep(3000);
  }
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    console.error("ae-proof: done marker seen but report unreadable:", e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("ae-proof crashed:", e);
  process.exit(1);
});
