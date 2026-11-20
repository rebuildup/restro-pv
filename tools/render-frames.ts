#!/usr/bin/env node
// Render arbitrary frames of a comp through ae-a8n for quick visual checks.
//
//   node tools/render-frames.ts --aep <aep> --comp <name> --frames 0,100,200 --out <dir>
import { AfterEffects, ScriptInvocationTransport } from '@ido-bata/ae-a8n';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hostCall, hostQuery } from './lib/host-retry.ts';
import { resolveAe, WINDOWS_SCRIPT_FLAG } from './lib/host.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const opt = (flag: string, dflt = '') => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const aep = resolve(opt('--aep', join(ROOT, 'dist', 'pv-generated.aep')));
const compName = opt('--comp', 'PV master');
const frames = opt('--frames', '0').split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
const out = resolve(opt('--out', join(ROOT, '.tmp', 'frames')));

async function main() {
  if (!existsSync(aep)) throw new Error('project not found: ' + aep);
  const aeHost = await resolveAe();
  const transportOptions = process.platform !== 'win32' ? {} : {
    transport: new ScriptInvocationTransport({
      installDir: aeHost.installDir,
      spawnLauncher: (command, a, spawnOptions) =>
        spawn(command, a.map((x) => (x === '-r' ? WINDOWS_SCRIPT_FLAG : x)), spawnOptions),
    }),
  };
  const sessionRoot = join(ROOT, '.tmp', 'pv-frames-session');
  rmSync(sessionRoot, { recursive: true, force: true });
  const ae = await AfterEffects.launch({
    sessionRoot, installDir: aeHost.installDir, timeoutMs: 120_000, ...transportOptions,
  });
  try {
    const project = await ae.openProject(aep);
    const comp = await project.comp(compName);
    if (!comp) throw new Error('comp not found: ' + compName);
    mkdirSync(out, { recursive: true });
    for (const frame of frames) {
      const rendered = await hostCall(`renderFrame(${frame})`,
        () => comp.renderFrame(frame, { subdirectory: 'frames' }));
      const file = `f${String(frame).padStart(4, '0')}.png`;
      copyFileSync(rendered.path, join(out, file));
      console.log(`${file} <- frame ${frame}`);
    }
  } finally {
    try { await ae.close(); } catch (e) { console.log('session.close: ' + (e as Error).message); }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
