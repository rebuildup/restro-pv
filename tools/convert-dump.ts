#!/usr/bin/env node
// Converts per-comp AEP dumps (.tmp/aep-tree/<slug>/) into typed
// TypeScript data modules under pv/generated/.
//
//   node tools/convert-dump.ts <dumpDir> [--out pv/generated]
//
// The output is mechanical, lossless-as-possible port data: one module per
// comp plus index.ts assembling the ProjectSpec. Scene-level authoring
// happens in pv/scenes/* on top of this data later.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

interface DumpLayer {
  index: number; name: string; matchName?: string;
  enabled?: boolean; shy?: boolean; guideLayer?: boolean; nullLayer?: boolean;
  inPoint?: number; outPoint?: number; startTime?: number; stretch?: number;
  timeRemapEnabled?: boolean; trackMatteType?: number; isTrackMatte?: boolean;
  motionBlur?: boolean; collapseTransformations?: boolean;
  adjustmentLayer?: boolean; threeDLayer?: boolean; audioEnabled?: boolean;
  hasVideo?: boolean; hasAudio?: boolean;
  parent?: string; parentIndex?: number;
  src?: { type: string; name: string; fullpath?: string } | null;
  transform?: unknown; masks?: unknown; effects?: unknown;
  shapes?: unknown; text?: unknown; timeRemap?: unknown;
  __error__?: string;
}
interface DumpCompFile {
  schema: string; comp: {
    name: string; id?: number; width: number; height: number;
    duration: number; frameRate: number; pixelAspect?: number;
    bgColor?: unknown; layers: DumpLayer[];
    __error__?: string; __fatal__?: string;
  };
}
interface ItemsFile {
  items: Array<{
    type: string; name: string; id: number;
    fullpath?: string; hasVideo?: boolean; hasAudio?: boolean;
  }>;
}

const args = process.argv.slice(2);
const dumpDir = resolve(args[0] ?? '');
const outDir = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : join(ROOT, 'pv', 'generated'));
if (!args[0] || !existsSync(dumpDir)) {
  console.error('usage: node tools/convert-dump.ts <dumpDir> [--out dir]');
  process.exit(1);
}

const items = JSON.parse(readFileSync(join(dumpDir, '_items.json'), 'utf8')) as ItemsFile;
const itemByName = new Map(items.items.map((i) => [i.name, i]));

// footage item name -> repo-relative or absolute import path
const footageFiles = new Map<string, string>(); // itemName -> file path for spec
const footageSrcName = new Map<string, string>(); // itemName -> resolved file key
function resolveFootage(itemName: string): string {
  const cached = footageFiles.get(itemName);
  if (cached !== undefined) return cached;
  const it = itemByName.get(itemName);
  let p = '';
  if (it?.fullpath) {
    const abs = it.fullpath.replace(/\\/g, '/');
    const rel = relative(ROOT, abs).replace(/\\/g, '/');
    p = rel.startsWith('..') ? abs : rel;
  }
  if (!p) {
    // no recorded path (e.g. solids): try to find the basename under assets/
    const stack = [join(ROOT, 'assets')];
    while (stack.length && !p) {
      const dir = stack.pop()!;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const fp = join(dir, e.name);
        if (e.isDirectory()) stack.push(fp);
        else if (e.name === itemName) { p = relative(ROOT, fp).replace(/\\/g, '/'); break; }
      }
    }
  }
  footageFiles.set(itemName, p);
  return p;
}

function layerKind(l: DumpLayer): { kind: string; source?: string; problems: string[] } {
  const problems: string[] = [];
  if (l.nullLayer) return { kind: 'null', problems };
  if (l.src?.type === 'comp') return { kind: 'comp', source: l.src.name, problems };
  if (l.src?.type === 'footage') {
    // solids have no fullpath; flag them — handled as footage with warning
    if (!l.src.fullpath && l.src.fullpath !== undefined) problems.push('solid-or-no-path:' + l.name);
    return { kind: 'footage', source: l.src.name, problems };
  }
  if (l.matchName === 'ADBE Vector Layer' || l.shapes) return { kind: 'shape', problems };
  if (l.matchName === 'ADBE Text Layer' || l.text) return { kind: 'text', problems };
  if (l.hasVideo === false && l.hasAudio === true) return { kind: 'footage', source: l.src?.name, problems };
  problems.push('unresolved-kind:' + l.name + ':' + (l.matchName ?? '?'));
  return { kind: 'null', problems };
}

const compFiles = readdirSync(dumpDir)
  .filter((f) => /^\d\d-.*\.json$/.test(f) && existsSync(join(dumpDir, f + '.done')))
  .sort();

const warnings: string[] = [];
const compModules: Array<{ varName: string; file: string; name: string }> = [];

mkdirSync(outDir, { recursive: true });

for (const file of compFiles) {
  const raw = JSON.parse(readFileSync(join(dumpDir, file), 'utf8')) as DumpCompFile;
  const c = raw.comp;
  if (!c || c.__fatal__) { warnings.push(file + ': fatal ' + (c?.__fatal__ ?? 'missing comp')); continue; }

  const layers = (c.layers ?? []).map((l) => {
    const { kind, source, problems } = layerKind(l);
    for (const p of problems) warnings.push(`${c.name}/${l.name}: ${p}`);
    const parentIndex = l.parentIndex
      ?? (l.parent ? c.layers.find((x) => x.name === l.parent)?.index : undefined);
    if (l.parent && parentIndex === undefined) {
      warnings.push(`${c.name}/${l.name}: parent '${l.parent}' unresolved`);
    }
    if (l.parent && !l.parentIndex) {
      const matches = c.layers.filter((x) => x.name === l.parent);
      if (matches.length > 1) warnings.push(`${c.name}/${l.name}: ambiguous parent name '${l.parent}'`);
    }
    const spec: Record<string, unknown> = {
      index: l.index, name: l.name, kind,
      ...(source ? { source } : {}),
      ...(l.enabled === false ? { enabled: false } : {}),
      ...(l.shy ? { shy: true } : {}),
      ...(l.guideLayer ? { guideLayer: true } : {}),
      ...(l.inPoint !== undefined ? { inPoint: l.inPoint } : {}),
      ...(l.outPoint !== undefined ? { outPoint: l.outPoint } : {}),
      ...(l.startTime !== undefined ? { startTime: l.startTime } : {}),
      ...(l.stretch !== undefined ? { stretch: l.stretch } : {}),
      ...(l.timeRemapEnabled ? { timeRemapEnabled: true } : {}),
      ...(l.trackMatteType ? { trackMatteType: l.trackMatteType } : {}),
      ...(l.motionBlur ? { motionBlur: true } : {}),
      ...(l.collapseTransformations ? { collapseTransformations: true } : {}),
      ...(l.adjustmentLayer ? { adjustmentLayer: true } : {}),
      ...(l.threeDLayer ? { threeDLayer: true } : {}),
      ...(l.audioEnabled === false ? { audioEnabled: false } : {}),
      ...(parentIndex ? { parentIndex } : {}),
      ...(l.transform ? { transform: l.transform } : {}),
      ...(l.masks ? { masks: l.masks } : {}),
      ...(l.effects ? { effects: l.effects } : {}),
      ...(l.shapes ? { shapes: l.shapes } : {}),
      ...(l.text ? { text: l.text } : {}),
      ...(l.timeRemap ? { timeRemap: l.timeRemap } : {}),
      ...(l.__error__ ? { __dumpError: l.__error__ } : {}),
    };
    return spec;
  });

  const varName = 'comp_' + file.slice(0, 2);
  const modName = file.replace(/\.json$/, '');
  const compSpec = {
    name: c.name, width: c.width, height: c.height,
    ...(c.pixelAspect !== undefined ? { pixelAspect: c.pixelAspect } : {}),
    duration: c.duration, frameRate: c.frameRate,
    ...(c.bgColor !== undefined ? { bgColor: c.bgColor } : {}),
    layers,
  };
  const body = `// Generated from AEP dump ${file} — do not edit by hand.
// Regenerate: node tools/dump-aep-tree.ts <aep> <dir> && node tools/convert-dump.ts <dir>
import type { CompSpec } from '../../model/types.ts';

export const ${varName}: CompSpec = ${JSON.stringify(compSpec, null, 0)} as CompSpec;
export default ${varName};
`;
  writeFileSync(join(outDir, modName + '.ts'), body);
  compModules.push({ varName, file: modName, name: c.name });
}

// footage: every footage-sourced layer's item name -> resolved path
const footageSet = new Map<string, string>();
for (const file of compFiles) {
  const raw = JSON.parse(readFileSync(join(dumpDir, file), 'utf8')) as DumpCompFile;
  for (const l of raw.comp?.layers ?? []) {
    if (l.src?.type === 'footage' && l.src.name) {
      const p = resolveFootage(l.src.name);
      if (p) footageSet.set(l.src.name, p);
      else warnings.push(`footage unresolved: ${l.src.name}`);
    }
  }
}

const indexBody = `// Generated index — do not edit by hand.
${compModules.map((m) => `import { ${m.varName} } from './${m.file}.ts';`).join('\n')}
import type { CompSpec, FootageSpec } from '../model/types.ts';

export const GENERATED_COMPS: CompSpec[] = [
${compModules.map((m) => `  ${m.varName},`).join('\n')}
];

export const GENERATED_FOOTAGE: FootageSpec[] = ${JSON.stringify(
  [...footageSet.entries()].map(([name, file]) => ({ file })), null, 2)};

export const COMP_NAMES = ${JSON.stringify(compModules.map((m) => m.name))};
`;
writeFileSync(join(outDir, 'index.ts'), indexBody);

console.log(`converted ${compModules.length} comps -> ${outDir}`);
console.log(`footage entries: ${footageSet.size}`);
if (warnings.length) {
  console.log(`warnings: ${warnings.length}`);
  for (const w of warnings.slice(0, 40)) console.log('  ' + w);
  if (warnings.length > 40) console.log(`  ... and ${warnings.length - 40} more`);
}
