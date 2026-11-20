#!/usr/bin/env node
// Generate the PV project: run the built single JSX in After Effects and
// wait for the runtime's own report marker. This is the ONLY supported way
// to produce dist/pv-generated.aep — never resend a timed-out run.
//
//   node tools/generate.ts [--jsx dist/pv.jsx] [--timeout 7200000]
//                          [--allow-running-ae]
//
// Ownership rules (Windows: AfterFX.exe is single-instance, so `-r` always
// lands in the already-running AE if one exists):
//   - no AE running  -> we spawn it; the instance is ours.
//   - AE running     -> REFUSED unless --allow-running-ae, because the JSX
//                       would mutate whatever project is open there. With the
//                       flag we still require the open project to be empty
//                       (verified through ae-a8n) before launching.
//
// Timeout rules: a timeout means UNKNOWN — the JSX may still be running or
// may have finished without us seeing it. We never respawn automatically;
// inspect .tmp/pv-report.json* and the AE state first.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { aeIsRunning, resolveAe } from './lib/host.ts';
import { AfterEffects } from '@ido-bata/ae-a8n';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const jsx = resolve(arg('--jsx') ?? resolve(ROOT, 'dist/pv.jsx'));
const timeoutMs = Number(arg('--timeout') ?? 7_200_000);
const allowRunningAe = process.argv.includes('--allow-running-ae');
const reportPath = resolve(ROOT, '.tmp/pv-report.json');
const donePath = reportPath + '.done';
const progressPath = resolve(ROOT, '.tmp/pv-progress.log');
const savePath = resolve(ROOT, 'dist/pv-generated.aep');
const runRecordPath = resolve(ROOT, '.tmp/generate-run.json');

if (!existsSync(jsx)) { console.error('jsx not found: ' + jsx); process.exit(1); }

const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch { return null; }
}

type RunRecord = Record<string, unknown>;
const record: RunRecord = {
  schema: 'restro-pv.generate-run/v1',
  startedAt: new Date().toISOString(),
  jsx: { path: jsx, sha256: sha256(jsx), bytes: statSync(jsx).size },
  source: { head: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']) !== '' },
  ae: {} as Record<string, unknown>,
  status: 'started',
};
const aeInfo = record.ae as Record<string, unknown>;

function finish(status: string, extra: RunRecord = {}) {
  record.status = status;
  record.finishedAt = new Date().toISOString();
  Object.assign(record, extra);
  writeFileSync(runRecordPath, JSON.stringify(record, null, 2));
  console.log(`generate: ${status} (record: ${runRecordPath})`);
}

async function main() {
  const ae = await resolveAe();
  Object.assign(aeInfo, { executable: ae.executable, installDir: ae.installDir });

  const running = aeIsRunning();
  aeInfo.wasRunning = running;
  if (running && !allowRunningAe) {
    finish('refused-ae-running', {
      reason: 'After Effects is already running; -r would delegate into it. ' +
        'Close AE or re-run with --allow-running-ae after confirming the open project is empty/disposable.',
    });
    process.exit(2);
  }
  if (running) {
    // Verify the open project is empty before delegating the build into it.
    // The session is attach-only: never call close() here — it would close
    // the user's project even though AE itself is left running.
    try {
      const session = await AfterEffects.launch({ timeoutMs: 120_000 });
      const project = await session.project();
      const info = await project.info();
      aeInfo.attachedProject = info;
      if (info.itemCount !== 0) {
        finish('refused-project-not-empty', {
          reason: `open project "${info.name ?? info.file ?? '?'}" has ${info.itemCount} items`,
        });
        process.exit(2);
      }
    } catch (error) {
      finish('refused-attach-failed', { reason: String(error) });
      process.exit(2);
    }
  }

  // Fresh markers: stale .done files must never be mistaken for this run.
  rmSync(donePath, { force: true });
  rmSync(reportPath, { force: true });
  rmSync(savePath, { force: true });
  rmSync(progressPath, { force: true });
  let progressOffset = 0;
  const tailProgress = () => {
    if (!existsSync(progressPath)) return;
    const text = readFileSync(progressPath, 'utf8');
    const lines = text.slice(progressOffset).split('\n');
    progressOffset = text.length;
    for (const line of lines) {
      if (!line.trim()) continue;
      const m = line.match(/^\d+\t(\d+)\t(.*)$/);
      const tag = m ? `+${(Number(m[1]) / 1000).toFixed(1)}s` : '';
      console.log(`  [progress ${tag}] ${m ? m[2] : line}`);
    }
  };

  const started = Date.now();
  const child = spawn(ae.executable, ['-r', jsx], { detached: true, stdio: 'ignore' });
  child.unref();
  aeInfo.spawnedPid = child.pid ?? null;
  console.log(`generate: launched AfterFX.exe -r (pid ${child.pid}), waiting up to ${Math.round(timeoutMs / 60000)}min`);

  const deadline = started + timeoutMs;
  for (;;) {
    tailProgress();
    if (existsSync(donePath)) break;
    if (Date.now() > deadline) {
      finish('unknown-timeout', {
        reason: 'report marker not seen before deadline; the JSX may still be ' +
          'running inside AE or may have finished without writing. Do NOT ' +
          'respawn — inspect AE and .tmp/pv-report.json first.',
        waitedMs: Date.now() - started,
      });
      process.exit(3);
    }
    await sleep(5000);
  }

  // Marker seen — but only trust it if it is fresh (mtime after launch) and
  // the report parses with zero errors.
  const doneMtime = statSync(donePath).mtimeMs;
  if (doneMtime < started - 1000) {
    finish('failed-stale-marker', { reason: 'done marker predates this run' });
    process.exit(1);
  }
  let report: { warnings?: number; errors?: number; errList?: string[]; warnList?: string[] };
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    finish('failed-unreadable-report', { reason: String(error) });
    process.exit(1);
  }
  record.report = {
    warnings: report.warnings ?? null, errors: report.errors ?? null,
    errList: (report.errList ?? []).slice(0, 50),
    warnList: (report.warnList ?? []).slice(0, 50),
  };
  const errors = report.errors ?? -1;
  const aepOk = existsSync(savePath) && statSync(savePath).size > 0;
  record.output = aepOk ? { path: savePath, bytes: statSync(savePath).size, sha256: sha256(savePath) } : null;
  if (errors !== 0) {
    finish('failed-report-errors', { reason: `${errors} errors recorded by runtime` });
    process.exit(1);
  }
  if (!aepOk) {
    finish('failed-no-output', { reason: 'report clean but output AEP missing/empty' });
    process.exit(1);
  }
  finish('ok', { waitedMs: Date.now() - started });
}

main().catch((error) => {
  record.status = 'crashed';
  record.finishedAt = new Date().toISOString();
  record.error = String(error);
  writeFileSync(runRecordPath, JSON.stringify(record, null, 2));
  console.error('generate crashed:', error);
  process.exit(1);
});
