#!/usr/bin/env bun
// Environment diagnostic for the PV pipeline. Reports each check as ok /
// warn / fail with a concrete remedy; exits non-zero when a hard blocker
// (no AE install, broken ae-a8n contract) is present.
//
//   bun tools/doctor.ts [--json]
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type AeHost, aeIsRunning, resolveAe } from "./lib/host.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jsonOut = process.argv.includes("--json");

type Status = "ok" | "warn" | "fail";
type Check = { id: string; status: Status; detail: string; remedy?: string };
const checks: Check[] = [];
const add = (id: string, status: Status, detail: string, remedy?: string) =>
  checks.push({ id, status, detail, remedy });

// --- bun --------------------------------------------------------------------
const bunVersion = process.versions.bun ?? "unknown";
add(
  "bun.version",
  bunVersion !== "unknown" ? "ok" : "fail",
  `bun ${bunVersion} (requires >=1.3.13)`,
  bunVersion === "unknown" ? "install Bun via mise (see mise.toml)" : undefined,
);

// --- dependencies ----------------------------------------------------------
const readVersion = (pkgJson: string) => {
  try {
    return JSON.parse(readFileSync(pkgJson, "utf8")).version as string;
  } catch {
    return "";
  }
};
const a8nVersion = readVersion(resolve(ROOT, "node_modules/@ido-bata/ae-a8n/package.json"));
const devtoolsInstalled = existsSync(
  resolve(ROOT, "node_modules/@ido-bata/ae-devtools-cli/package.json"),
);
const aeTestInstalled = existsSync(resolve(ROOT, "node_modules/@ido-bata/ae-test/package.json"));
add(
  "deps.ae-a8n",
  a8nVersion ? "ok" : "fail",
  `@ido-bata/ae-a8n ${a8nVersion || "missing"}`,
  a8nVersion ? undefined : "bun install",
);
add(
  "deps.ae-devtools-cli",
  devtoolsInstalled ? "ok" : "warn",
  devtoolsInstalled ? "installed" : "missing (jsx-toolchain / ae-devtools CLI)",
  devtoolsInstalled ? undefined : "bun install",
);
add(
  "deps.ae-test",
  aeTestInstalled ? "ok" : "warn",
  aeTestInstalled ? "installed" : "missing (real-host test runner)",
  aeTestInstalled ? undefined : "bun install",
);

// duplicate ae-a8n instances (ae-devtools-cli / ae-test pin older versions; the
// root override must keep a single resolved copy). Scan node_modules directly
// because `bun pm ls` output is not a stable JSON contract.
try {
  const versions = new Set<string>();
  const scan = (dir: string, depth: number) => {
    if (depth > 8 || !existsSync(dir)) return;
    const base = dir.replace(/\\/g, "/");
    if (base.endsWith("/@ido-bata/ae-a8n")) {
      const v = readVersion(resolve(dir, "package.json"));
      if (v) versions.add(v);
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) scan(resolve(dir, entry.name), depth + 1);
    }
  };
  scan(resolve(ROOT, "node_modules"), 0);
  add(
    "deps.ae-a8n.dedup",
    versions.size <= 1 ? "ok" : "warn",
    versions.size <= 1 ? [...versions].join(", ") || "n/a" : [...versions].join(", "),
    versions.size <= 1 ? undefined : "check package.json overrides",
  );
} catch {
  add("deps.ae-a8n.dedup", "warn", "node_modules scan failed; dedup unverified");
}

// --- After Effects install --------------------------------------------------
let ae: AeHost | null = null;
try {
  ae = await resolveAe();
  add("ae.install", "ok", ae.executable);
} catch (error) {
  add(
    "ae.install",
    "fail",
    error instanceof Error ? error.message : String(error),
    "install After Effects or set AE_EXECUTABLE to AfterFX.exe",
  );
}

// --- running instance / ownership -------------------------------------------
const running = aeIsRunning();
add(
  "ae.running",
  running ? "ok" : "warn",
  running
    ? "AfterFX.exe is running"
    : "After Effects is not running (generate/verify will launch it)",
  running ? undefined : "no action needed; tools launch AE on demand",
);

// --- generated artifacts -----------------------------------------------------
const jsxPath = resolve(ROOT, "dist/pv.jsx");
const reportPath = resolve(ROOT, ".tmp/pv-report.json");
add(
  "artifacts.jsx",
  existsSync(jsxPath) ? "ok" : "warn",
  existsSync(jsxPath) ? "dist/pv.jsx present" : "dist/pv.jsx missing — run bun run build:jsx",
  existsSync(jsxPath) ? undefined : "bun run build:jsx",
);
add(
  "artifacts.lastReport",
  existsSync(reportPath) ? "ok" : "warn",
  existsSync(reportPath) ? "last generation report present" : "no generation report yet",
  existsSync(reportPath) ? undefined : "run the generate step first",
);

// --- ae-devtools doctor (delegated environment probe) ------------------------
try {
  const out = execFileSync("bun", ["x", "ae-devtools", "doctor"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 60_000,
  });
  const doc = JSON.parse(out);
  const a8n = doc.aeA8n;
  add(
    "devtools.ae-a8n-contract",
    a8n?.contractOk ? "ok" : "fail",
    a8n
      ? `ae-a8n ${a8n.version} contract ${a8n.contractOk ? "ok" : "FAILED"}`
      : "doctor output missing aeA8n",
    a8n?.contractOk ? undefined : "align @ido-bata/ae-a8n versions (see overrides)",
  );
  const installs = doc.aeInstalls ?? [];
  add(
    "devtools.ae-installs",
    installs.length ? "ok" : "warn",
    `${installs.length} install(s) detected by ae-devtools`,
    installs.length ? undefined : "ae-devtools found no installs; AE_EXECUTABLE may be needed",
  );
} catch (error) {
  add(
    "devtools.doctor",
    "warn",
    `ae-devtools doctor failed: ${error instanceof Error ? error.message : error}`,
    "bun x ae-devtools doctor",
  );
}

// --- summary ------------------------------------------------------------------
const fails = checks.filter((c) => c.status === "fail");
const warns = checks.filter((c) => c.status === "warn");
if (jsonOut) {
  console.log(
    JSON.stringify({ schema: "restro-pv.doctor/v1", ok: fails.length === 0, checks }, null, 2),
  );
} else {
  for (const c of checks) {
    const tag = { ok: " OK ", warn: "WARN", fail: "FAIL" }[c.status];
    console.log(`[${tag}] ${c.id}: ${c.detail}${c.remedy ? ` — remedy: ${c.remedy}` : ""}`);
  }
  console.log(
    `\n${checks.length - fails.length - warns.length} ok, ${warns.length} warn, ${fails.length} fail`,
  );
}
process.exit(fails.length ? 1 : 0);
