#!/usr/bin/env bun
// Runs a generated JSX inside After Effects and waits for ITS completion
// marker — the per-run contract materialized by tools/lib/jsx-run.ts.
//
//   bun tools/run-jsx.ts <script.jsx> [--timeout 3600000]
//
// The runner extracts the baked artifact paths from the JSX, writes a
// per-run copy under .tmp/run/<runId>/ with unique report/progress/
// warnings paths, executes that copy, and classifies the result only after
// verifying this run's report.done, report JSON and saved AEP. AE is
// launched if needed and left running. The currently open project is NOT
// closed by this tool — the JSX itself decides what to build/save.
//
// Exit codes: 0 ok, 1 failed-*, 3 unknown-timeout (never auto-resend).
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aeIsRunning, aeProbeOnce, resolveAe } from "./lib/host.ts";
import { executeRun, prepareRun } from "./lib/jsx-run.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const script = resolve(args[0] ?? "");
let timeoutMs = 3_600_000;
const ti = args.indexOf("--timeout");
if (ti >= 0) timeoutMs = Number(args[ti + 1]);
if (!args[0]) {
  console.error("usage: bun tools/run-jsx.ts <script.jsx> [--timeout ms]");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const paths = prepareRun(script, ROOT);

  const ae = await resolveAe();
  if (!aeIsRunning()) {
    console.log("launching After Effects...");
    const launcher = spawn(ae.executable, [], { detached: true, stdio: "ignore" });
    launcher.unref();
    const deadline = Date.now() + 120_000;
    while (!aeIsRunning()) {
      if (Date.now() > deadline) throw new Error("After Effects did not start");
      await sleep(2000);
    }
    await sleep(15_000);
  } else {
    console.log("After Effects already running");
  }

  // Readiness gate: process existence is not enough — a -r script delivered
  // while AE is still initializing fails inside layers.add* with
  // "undefined is not an object". Probe the DOM write path and resend until
  // AE actually answers (bounded; never assumed from a timer).
  {
    const probeDeadline = Date.now() + 300_000;
    let ready = false;
    while (Date.now() < probeDeadline && !ready) {
      ready = await aeProbeOnce(ae, ROOT, 60_000);
      if (!ready) console.log("AE probe not ready yet, retrying...");
    }
    if (!ready) throw new Error("After Effects did not become script-ready within 5min");
    console.log("AE script-ready probe passed");
  }

  // '-r' runs the script with write access (unlike '-ro' used for read-only
  // dumps). Paths must not contain whitespace on Windows.
  const result = await executeRun(
    paths,
    () => {
      const child = spawn(ae.executable, ["-r", paths.scriptPath], {
        cwd: dirname(ae.executable),
        stdio: "ignore",
      });
      child.unref();
      console.log("running " + paths.scriptPath);
    },
    { timeoutMs, log: (m) => console.log(m) },
  );

  if (result.report) {
    console.log(`warnings=${result.report.warnings} errors=${result.report.errors}`);
    for (const e of (result.report.errList ?? []).slice(0, 20)) console.log("  ERR " + e);
    for (const w of (result.report.warnList ?? []).slice(0, 10)) console.log("  WARN " + w);
  }
  if (result.output) {
    console.log(`output: ${result.output.path} (${result.output.bytes} bytes)`);
  }
  console.log(`run-jsx: ${result.status} (${Math.round(result.waitedMs / 1000)}s)`);
  if (result.reason) console.log("  " + result.reason);
  console.log("run dir: " + paths.runDir);

  if (result.status === "ok") process.exit(0);
  if (result.status === "unknown-timeout") process.exit(3);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
