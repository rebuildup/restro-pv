#!/usr/bin/env node
// Runs a generated JSX inside After Effects and waits for its report marker.
//
//   node tools/run-jsx.ts <script.jsx> [--timeout 3600000]
//
// The script is expected to write <report>.done when finished (build-jsx.ts
// bakes __REPORT_PATH and the runtime writes the marker). AE is launched if
// needed and left running. The currently open project is NOT closed by this
// tool — the JSX itself decides what to build/save.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { aeIsRunning, resolveAe } from './lib/host.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const script = resolve(args[0] ?? '');
let timeoutMs = 3_600_000;
const ti = args.indexOf('--timeout');
if (ti >= 0) timeoutMs = Number(args[ti + 1]);
if (!args[0] || !existsSync(script)) {
  console.error('usage: node tools/run-jsx.ts <script.jsx> [--timeout ms]');
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const ae = await resolveAe();
  if (!aeIsRunning()) {
    console.log('launching After Effects...');
    const launcher = spawn(ae.executable, [], { detached: true, stdio: 'ignore' });
    launcher.unref();
    const deadline = Date.now() + 120_000;
    while (!aeIsRunning()) {
      if (Date.now() > deadline) throw new Error('After Effects did not start');
      await sleep(2000);
    }
    await sleep(15_000);
  } else {
    console.log('After Effects already running');
  }

  // report marker: derive from script name under .tmp/run/
  const reportBase = resolve(ROOT, '.tmp', 'run', script.replace(/[^\w.-]+/g, '_'));
  const donePath = reportBase + '.done';
  const { rmSync } = await import('node:fs');
  rmSync(donePath, { force: true });
  rmSync(reportBase, { force: true });

  console.log('running ' + script);
  // '-r' runs the script with write access (unlike '-ro' used for read-only
  // dumps). Paths must not contain whitespace on Windows.
  const child = spawn(ae.executable, ['-r', script],
    { cwd: dirname(ae.executable), stdio: 'ignore' });
  child.unref();

  // The JSX's __REPORT_PATH is baked at build time; the runner cannot know it.
  // Poll for ANY new .done under .tmp/ plus rely on build report path printed
  // by convention: tools/build-jsx defaults report to .tmp/pv-build-report.json
  const reportJson = resolve(ROOT, '.tmp', 'pv-build-report.json');
  const reportDone = reportJson + '.done';
  rmSync(reportDone, { force: true });

  const deadline = Date.now() + timeoutMs;
  while (!existsSync(reportDone)) {
    if (Date.now() > deadline) throw new Error('jsx run timed out after ' + timeoutMs + 'ms');
    await sleep(3000);
  }
  console.log('jsx finished; report: ' + reportJson);
  if (existsSync(reportJson)) {
    const r = JSON.parse((await import('node:fs')).readFileSync(reportJson, 'utf8'));
    console.log(`warnings=${r.warnings} errors=${r.errors}`);
    for (const e of (r.errList ?? []).slice(0, 20)) console.log('  ERR ' + e);
    for (const w of (r.warnList ?? []).slice(0, 10)) console.log('  WARN ' + w);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
