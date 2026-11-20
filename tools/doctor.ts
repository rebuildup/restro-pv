#!/usr/bin/env node
// Environment diagnostic for the PV pipeline. Reports each check as ok /
// warn / fail with a concrete remedy; exits non-zero when a hard blocker
// (no AE install, broken ae-a8n contract) is present.
//
//   node tools/doctor.ts [--json]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { aeIsRunning, resolveAe, type AeHost } from './lib/host.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jsonOut = process.argv.includes('--json');

type Status = 'ok' | 'warn' | 'fail';
type Check = { id: string; status: Status; detail: string; remedy?: string };
const checks: Check[] = [];
const add = (id: string, status: Status, detail: string, remedy?: string) =>
  checks.push({ id, status, detail, remedy });

// --- node ------------------------------------------------------------------
const nodeMajor = Number(process.versions.node.split('.')[0]);
add('node.version', nodeMajor >= 24 ? 'ok' : 'fail',
  `node ${process.versions.node} (requires >=24)`,
  nodeMajor >= 24 ? undefined : 'install Node 24+ (see .nvmrc / mise.toml)');

// --- dependencies ----------------------------------------------------------
let a8nVersion = '';
try {
  const pkg = JSON.parse(execFileSync('npm', ['ls', '@ido-bata/ae-a8n', '--depth=0', '--json'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  a8nVersion = pkg.dependencies?.['@ido-bata/ae-a8n']?.version ?? '';
} catch { /* npm ls exits non-zero on dedup issues; handled below */ }
const a8nPkgPath = resolve(ROOT, 'node_modules/@ido-bata/ae-a8n/package.json');
if (existsSync(a8nPkgPath)) {
  a8nVersion = execFileSync('node', ['-p', `require(${JSON.stringify(a8nPkgPath)}).version`],
    { encoding: 'utf8' }).trim();
}
const devtoolsInstalled = existsSync(resolve(ROOT, 'node_modules/@ido-bata/ae-devtools-cli/package.json'));
const aeTestInstalled = existsSync(resolve(ROOT, 'node_modules/@ido-bata/ae-test/package.json'));
add('deps.ae-a8n', a8nVersion ? 'ok' : 'fail',
  `@ido-bata/ae-a8n ${a8nVersion || 'missing'}`,
  a8nVersion ? undefined : 'npm install');
add('deps.ae-devtools-cli', devtoolsInstalled ? 'ok' : 'warn',
  devtoolsInstalled ? 'installed' : 'missing (jsx-toolchain / ae-devtools CLI)',
  devtoolsInstalled ? undefined : 'npm install');
add('deps.ae-test', aeTestInstalled ? 'ok' : 'warn',
  aeTestInstalled ? 'installed' : 'missing (real-host test runner)',
  aeTestInstalled ? undefined : 'npm install');

// duplicate ae-a8n instances (ae-devtools-cli / ae-test pin 0.2.0; the root
// override must keep a single resolved copy)
try {
  const ls = execFileSync('npm', ['ls', '@ido-bata/ae-a8n', '--all', '--json'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const versions = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') {
      const n = node as Record<string, unknown>;
      const deps = n.dependencies as Record<string, { version?: string }> | undefined;
      if (deps?.['@ido-bata/ae-a8n']?.version) versions.add(deps['@ido-bata/ae-a8n'].version!);
      Object.values(n).forEach(walk);
    }
  };
  walk(JSON.parse(ls));
  add('deps.ae-a8n.dedup', versions.size <= 1 ? 'ok' : 'warn',
    versions.size <= 1 ? [...versions].join(', ') || 'n/a' : [...versions].join(', '),
    versions.size <= 1 ? undefined : 'check package.json overrides');
} catch {
  add('deps.ae-a8n.dedup', 'warn', 'npm ls failed; dedup unverified');
}

// --- After Effects install --------------------------------------------------
let ae: AeHost | null = null;
try {
  ae = await resolveAe();
  add('ae.install', 'ok', ae.executable);
} catch (error) {
  add('ae.install', 'fail', error instanceof Error ? error.message : String(error),
    'install After Effects or set AE_EXECUTABLE to AfterFX.exe');
}

// --- running instance / ownership -------------------------------------------
const running = aeIsRunning();
add('ae.running', running ? 'ok' : 'warn',
  running ? 'AfterFX.exe is running' : 'After Effects is not running (generate/verify will launch it)',
  running ? undefined : 'no action needed; tools launch AE on demand');

// --- generated artifacts -----------------------------------------------------
const jsxPath = resolve(ROOT, 'dist/pv.jsx');
const reportPath = resolve(ROOT, '.tmp/pv-report.json');
add('artifacts.jsx', existsSync(jsxPath) ? 'ok' : 'warn',
  existsSync(jsxPath) ? 'dist/pv.jsx present' : 'dist/pv.jsx missing — run npm run build:jsx',
  existsSync(jsxPath) ? undefined : 'npm run build:jsx');
add('artifacts.lastReport', existsSync(reportPath) ? 'ok' : 'warn',
  existsSync(reportPath) ? 'last generation report present' : 'no generation report yet',
  existsSync(reportPath) ? undefined : 'run the generate step first');

// --- ae-devtools doctor (delegated environment probe) ------------------------
try {
  const out = execFileSync('npx', ['ae-devtools', 'doctor'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000 });
  const doc = JSON.parse(out);
  const a8n = doc.aeA8n;
  add('devtools.ae-a8n-contract', a8n?.contractOk ? 'ok' : 'fail',
    a8n ? `ae-a8n ${a8n.version} contract ${a8n.contractOk ? 'ok' : 'FAILED'}` : 'doctor output missing aeA8n',
    a8n?.contractOk ? undefined : 'align @ido-bata/ae-a8n versions (see overrides)');
  const installs = doc.aeInstalls ?? [];
  add('devtools.ae-installs', installs.length ? 'ok' : 'warn',
    `${installs.length} install(s) detected by ae-devtools`,
    installs.length ? undefined : 'ae-devtools found no installs; AE_EXECUTABLE may be needed');
} catch (error) {
  add('devtools.doctor', 'warn',
    `ae-devtools doctor failed: ${error instanceof Error ? error.message : error}`,
    'npx ae-devtools doctor');
}

// --- summary ------------------------------------------------------------------
const fails = checks.filter((c) => c.status === 'fail');
const warns = checks.filter((c) => c.status === 'warn');
if (jsonOut) {
  console.log(JSON.stringify({ schema: 'restro-pv.doctor/v1', ok: fails.length === 0, checks }, null, 2));
} else {
  for (const c of checks) {
    const tag = { ok: ' OK ', warn: 'WARN', fail: 'FAIL' }[c.status];
    console.log(`[${tag}] ${c.id}: ${c.detail}${c.remedy ? ` — remedy: ${c.remedy}` : ''}`);
  }
  console.log(`\n${checks.length - fails.length - warns.length} ok, ${warns.length} warn, ${fails.length} fail`);
}
process.exit(fails.length ? 1 : 0);
