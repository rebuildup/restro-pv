#!/usr/bin/env bun
// Dump layer transforms of a comp via ae-a8n (no -r script delivery).
//   bun tools/probe-transforms.ts --aep <aep> --comp <name>
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AfterEffects, ScriptInvocationTransport } from "@ido-bata/ae-a8n";
import { resolveAe, WINDOWS_SCRIPT_FLAG } from "./lib/host.ts";
import { hostCall } from "./lib/host-retry.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (flag: string, dflt = "") => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const aep = resolve(opt("--aep", join(ROOT, "dist", "pv-generated.aep")));
const compName = opt("--comp", "brand-check");
const discard = args.includes("--discard");

async function main() {
  if (!existsSync(aep)) throw new Error("project not found: " + aep);
  const aeHost = await resolveAe();
  const transportOptions =
    process.platform !== "win32"
      ? {}
      : {
          transport: new ScriptInvocationTransport({
            installDir: aeHost.installDir,
            spawnLauncher: (command, a, spawnOptions) =>
              spawn(command, a.map((x) => (x === "-r" ? WINDOWS_SCRIPT_FLAG : x)), spawnOptions),
          }),
        };
  const sessionRoot = join(ROOT, ".tmp", "pv-probe-session");
  const ae = await AfterEffects.launch({ sessionRoot, installDir: aeHost.installDir, timeoutMs: 120_000, ...transportOptions });
  try {
    const project = await ae.openProject(aep, discard ? { unsavedChanges: "discard" } : {});
    const comp = await project.comp(compName);
    if (!comp) throw new Error("comp not found: " + compName);
    const layers = await comp.layers();
    for (const li of layers) {
      const l = await comp.layer(li.name);
      const t = await hostCall(`transform(${li.name})`, () => l.transform());
      console.log(
        `${li.index}\t${li.name}\ttype=${li.type}\t` +
          `anchor=${JSON.stringify(t.anchorPoint)} pos=${JSON.stringify(t.position)} ` +
          `scale=${JSON.stringify(t.scale)} rot=${t.rotation} op=${t.opacity} enabled=${li.enabled}`,
      );
    }
  } finally {
    try { await ae.close(); } catch (e) { console.log("session.close: " + (e as Error).message); }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
