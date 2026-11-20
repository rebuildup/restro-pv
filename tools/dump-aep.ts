#!/usr/bin/env node
// Dump an AEP's full structure to JSON by running tools/analysis/dump-aep.jsx
// inside After Effects.
//
//   bun tools/dump-aep.ts <input.aep> <output.json> [--timeout 600000]
//
// Requires a locally installed After Effects (AE_EXECUTABLE overrides
// discovery). AE is launched if it is not running and left running afterwards;
// the opened project is closed without saving.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { aeIsRunning, resolveAe, WINDOWS_SCRIPT_FLAG } from "./lib/host.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(ROOT, "tools", "analysis", "dump-aep.jsx");

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let timeoutMs = 600_000;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--timeout") timeoutMs = Number(argv[++i]);
    else positional.push(argv[i]);
  }
  if (positional.length !== 2) {
    throw new Error("usage: bun tools/dump-aep.ts <input.aep> <output.json> [--timeout ms]");
  }
  return { aep: resolve(positional[0]), out: resolve(positional[1]), timeoutMs };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const { aep, out, timeoutMs } = parseArgs(process.argv.slice(2));
  if (!existsSync(aep)) throw new Error("AEP not found: " + aep);

  const ae = await resolveAe();
  mkdirSync(dirname(out), { recursive: true });
  const workDir = join(ROOT, ".tmp", "aep-dump");
  mkdirSync(workDir, { recursive: true });
  const scriptPath = join(workDir, "dump-run.jsx");
  const donePath = out + ".done";
  rmSync(donePath, { force: true });
  rmSync(out, { force: true });

  const template = readFileSync(TEMPLATE, "utf8");
  writeFileSync(
    scriptPath,
    template
      .replaceAll("__AEP_PATH__", aep.replaceAll("\\", "/"))
      .replaceAll("__OUT_PATH__", out.replaceAll("\\", "/")),
  );

  if (!aeIsRunning()) {
    console.log("launching After Effects...");
    const launcher = spawn(ae.executable, [], { detached: true, stdio: "ignore" });
    launcher.unref();
    // Wait for the process and a settle period for the scripting engine.
    const deadline = Date.now() + 120_000;
    while (!aeIsRunning()) {
      if (Date.now() > deadline) throw new Error("After Effects did not start");
      await sleep(2000);
    }
    await sleep(15_000);
  } else {
    console.log("After Effects already running");
  }

  console.log("running dump script in AE...");
  const child = spawn(ae.executable, [WINDOWS_SCRIPT_FLAG, scriptPath], {
    cwd: dirname(ae.executable),
    stdio: "ignore",
  });
  child.unref();

  const deadline = Date.now() + timeoutMs;
  while (!existsSync(donePath)) {
    if (Date.now() > deadline) throw new Error("dump timed out after " + timeoutMs + "ms");
    await sleep(2000);
  }
  if (!existsSync(out)) throw new Error("dump finished but no output file: " + out);
  const size = readFileSync(out).length;
  console.log(`dump written: ${out} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
