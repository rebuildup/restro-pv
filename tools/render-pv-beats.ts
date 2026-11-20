#!/usr/bin/env node
// Render one PNG per beat of the PV project through ae-a8n, so the edit can
// be reviewed as an image sequence committed to git (verification/beats/).
//
//   node tools/render-pv-beats.ts                 # render every beat
//   node tools/render-pv-beats.ts --probe         # list comps, render nothing
//   node tools/render-pv-beats.ts --comp MAIN --bpm 128 --offset 0.25
//
// The beat grid is t = offset + n * 60 / bpm seconds; each beat renders the
// frame nearest to its time (frame = round(t * frameRate)). Output files are
// beat-001.png ... plus manifest.json mapping beat -> time -> frame -> file.
//
// Real-host notes: this opens the AEP in After Effects and never saves it.
// On Windows the a8n launcher needs the -ro script flag (see
// tools/lib/host.ts); the session runs under .tmp/ (git-ignored).
import { AfterEffects, ScriptInvocationTransport } from '@ido-bata/ae-a8n';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hostCall } from './lib/host-retry.ts';
import { resolveAe, WINDOWS_SCRIPT_FLAG } from './lib/host.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type Options = {
  aep: string;
  comp: string | null;
  bpm: number;
  offset: number;
  out: string;
  probe: boolean;
  discardUnsaved: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    aep: join(ROOT, 'legacy', 'pv-worktree-20261120.aep'),
    comp: null,
    bpm: 128,
    offset: 0,
    out: join(ROOT, 'verification', 'beats'),
    probe: false,
    discardUnsaved: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = (): string => {
      const next = argv[++i];
      if (next === undefined) throw new Error(arg + ' needs a value');
      return next;
    };
    if (arg === '--probe') options.probe = true;
    else if (arg === '--discard-unsaved') options.discardUnsaved = true;
    else if (arg === '--aep') options.aep = resolve(value());
    else if (arg === '--comp') options.comp = value();
    else if (arg === '--bpm') options.bpm = Number(value());
    else if (arg === '--offset') options.offset = Number(value());
    else if (arg === '--out') options.out = resolve(value());
    else throw new Error('unknown argument: ' + arg);
  }
  if (!(options.bpm > 0)) throw new Error('--bpm must be positive');
  if (!(options.offset >= 0)) throw new Error('--offset must be >= 0');
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.aep)) throw new Error('project not found: ' + options.aep);

  const aeHost = await resolveAe();
  const transportOptions = process.platform !== 'win32' ? {} : {
    transport: new ScriptInvocationTransport({
      installDir: aeHost.installDir,
      spawnLauncher: (command, args, spawnOptions) =>
        spawn(command, args.map((a) => (a === '-r' ? WINDOWS_SCRIPT_FLAG : a)), spawnOptions),
    }),
  };

  const sessionRoot = join(ROOT, '.tmp', 'pv-beats-session');
  rmSync(sessionRoot, { recursive: true, force: true });
  const ae = await AfterEffects.launch({
    sessionRoot, installDir: aeHost.installDir, timeoutMs: 120_000, ...transportOptions,
  });
  try {
    const project = await ae.openProject(options.aep,
      options.discardUnsaved ? { unsavedChanges: 'discard' } : undefined);
    const comps = await hostCall('comps', () => project.comps());
    if (comps.length === 0) throw new Error('project has no compositions');
    for (const info of comps) {
      console.log(`comp ${JSON.stringify(info.name)} ${info.width}x${info.height} ` +
        `${info.duration.toFixed(3)}s @${info.frameRate}fps layers=${info.layerCount}`);
    }

    let comp = options.comp === null ? null : await project.comp(options.comp);
    if (comp === null) {
      // pv.aep holds the timeline plus checkpoint duplicates; "master" is
      // the comp promotion/master.avi is rendered from.
      const preferred = comps.find((c) => c.name === 'master') ??
        comps.reduce((a, b) => (b.duration > a.duration ? b : a));
      if (preferred.name !== 'master') {
        console.log('no --comp given and no "master" comp; using ' + JSON.stringify(preferred.name));
      }
      comp = await project.comp(preferred.name);
    }
    const info = await hostCall('comp.info', () => comp.info());
    console.log(`target comp ${JSON.stringify(info.name)} ` +
      `${info.duration.toFixed(3)}s @${info.frameRate}fps`);

    if (options.probe) return;

    const beatSeconds = 60 / options.bpm;
    const beats: { index: number; time: number; frame: number; file: string }[] = [];
    for (let time = options.offset, index = 1; time <= info.duration + 1e-6; time += beatSeconds, index += 1) {
      beats.push({ index, time, frame: Math.round(time * info.frameRate), file: '' });
    }
    console.log(`${beats.length} beats at ${options.bpm} BPM (offset ${options.offset}s)`);

    mkdirSync(options.out, { recursive: true });
    // Remove stale beat renders and manifest so the directory mirrors this run.
    for (const name of readdirSync(options.out)) {
      if (/^beat-\d+\.png$/.test(name) || name === 'manifest.json') {
        rmSync(join(options.out, name));
      }
    }

    for (const beat of beats) {
      const rendered = await hostCall(`renderFrame(${beat.frame})`,
        () => comp.renderFrame(beat.frame, { subdirectory: 'beats', prefix: `beat-${String(beat.index).padStart(3, '0')}` }));
      const file = `beat-${String(beat.index).padStart(3, '0')}.png`;
      copyFileSync(rendered.path, join(options.out, file));
      beat.file = file;
      console.log(`${file}  t=${beat.time.toFixed(4)}s  frame=${beat.frame}`);
    }

    writeFileSync(join(options.out, 'manifest.json'), JSON.stringify({
      project: options.aep,
      comp: { name: info.name, width: info.width, height: info.height,
        duration: info.duration, frameRate: info.frameRate, layerCount: info.layerCount },
      bpm: options.bpm,
      beatOffsetSeconds: options.offset,
      renderedAt: new Date().toISOString(),
      beats,
    }, null, 2) + '\n');
    console.log('wrote ' + beats.length + ' frames to ' + options.out);
  } finally {
    // Nothing here modifies the project; refuse would also be safe, but a
    // clean close keeps AE from lingering on a hidden dirty flag.
    const closed = await ae.close({ unsavedChanges: 'discard' });
    if (!closed.quit) console.error('warning: After Effects did not quit: ' + closed.reason);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
