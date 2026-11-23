#!/usr/bin/env bun
// Send a JSX to a running/starting AE: probe readiness, then -r, then wait .done
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { aeIsRunning, aeProbeOnce, resolveAe } from "./lib/host.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jsx = resolve(process.argv[2]);
const done = jsx + ".done";
const timeout = Number(process.argv[3] ?? 300000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ae = await resolveAe();
if (!aeIsRunning()) {
  spawn(ae.executable, [], { detached: true, stdio: "ignore" }).unref();
  const dl = Date.now() + 120000;
  while (!aeIsRunning() && Date.now() < dl) await sleep(2000);
}
const deadline = Date.now() + timeout;
rmSync(done, { force: true });
let sent = false;
while (Date.now() < deadline) {
  if (!sent) {
    const ready = await aeProbeOnce(ae, ROOT, 30000);
    if (ready) {
      spawn(ae.executable, ["-r", jsx], { detached: true, stdio: "ignore" }).unref();
      sent = true;
      console.log("script sent");
    }
  }
  if (existsSync(done)) { console.log("DONE"); process.exit(0); }
  await sleep(3000);
}
console.log(sent ? "TIMEOUT after send" : "TIMEOUT never ready");
process.exit(1);
