#!/usr/bin/env node
// Dump an AEP into per-comp JSON files (resumable) by running
// tools/analysis/dump-comp.jsx inside After Effects.
//
//   bun tools/dump-aep-tree.ts <input.aep> <outDir> [--timeout 3600000]
//
// Output: <outDir>/<NN>-<comp>.json + .done markers, _items.json,
// _manifest.json, _progress.log. Re-running skips comps that already have a
// .done marker, so an interrupted run resumes instead of restarting.
// Requires a locally installed After Effects (AE_EXECUTABLE overrides
// discovery). AE is launched if it is not running and left running afterwards;
// the opened project is closed without saving.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { aeIsRunning, resolveAe, WINDOWS_SCRIPT_FLAG } from "./lib/host.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(ROOT, "tools", "analysis", "dump-comp.jsx");

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let timeoutMs = 3_600_000;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--timeout") timeoutMs = Number(argv[++i]);
    else positional.push(argv[i]);
  }
  if (positional.length !== 2) {
    throw new Error("usage: bun tools/dump-aep-tree.ts <input.aep> <outDir> [--timeout ms]");
  }
  return { aep: resolve(positional[0]), outDir: resolve(positional[1]), timeoutMs };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const { aep, outDir, timeoutMs } = parseArgs(process.argv.slice(2));
  if (!existsSync(aep)) throw new Error("AEP not found: " + aep);

  const ae = await resolveAe();
  mkdirSync(outDir, { recursive: true });
  const workDir = join(ROOT, ".tmp", "aep-dump");
  mkdirSync(workDir, { recursive: true });
  const scriptPath = join(workDir, "dump-comp-run.jsx");
  const donePath = join(outDir, "_manifest.done");
  rmSync(donePath, { force: true });

  const template = readFileSync(TEMPLATE, "utf8");
  writeFileSync(
    scriptPath,
    template
      .replaceAll("__AEP_PATH__", aep.replaceAll("\\", "/"))
      .replaceAll("__OUT_DIR__", outDir.replaceAll("\\", "/")),
  );

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

  console.log("running per-comp dump script in AE (resumable)...");
  const child = spawn(ae.executable, [WINDOWS_SCRIPT_FLAG, scriptPath], {
    cwd: dirname(ae.executable),
    stdio: "ignore",
  });
  child.unref();

  const deadline = Date.now() + timeoutMs;
  while (!existsSync(donePath)) {
    // surface progress so long runs are observable
    const prog = join(outDir, "_progress.log");
    if (existsSync(prog)) {
      const lines = readFileSync(prog, "utf8").trim().split("\n");
      process.stdout.write(`\r  ${lines.length} comps processed`);
    }
    if (Date.now() > deadline) {
      console.log("");
      throw new Error(
        "dump timed out after " + timeoutMs + "ms — progress is checkpointed; re-run to resume",
      );
    }
    await sleep(5000);
  }
  console.log("");
  const manifest = JSON.parse(readFileSync(join(outDir, "_manifest.json"), "utf8"));
  console.log(
    `dump complete: ${manifest.done} done, ${manifest.skipped} skipped, ` +
      `${manifest.errors} errors of ${manifest.comps} comps`,
  );
  if (manifest.errors > 0) {
    for (const r of manifest.results.filter((x: { status: string }) => x.status === "error")) {
      console.log("  ERROR: " + r.name);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
