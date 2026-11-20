#!/usr/bin/env node
// Converts per-comp AEP dumps (.tmp/aep-tree/<slug>/) into typed
// TypeScript data modules under pv/generated/.
//
//   node tools/convert-dump.ts <dumpDir> [--out pv/generated]
//
// The output is mechanical port data: one module per comp plus index.ts
// assembling the ProjectSpec. References are stable: comp sources use
// sourceCompIndex (position in ProjectSpec.comps), footage sources use a
// deduplicated canonical name, parents use 1-based layer indices.
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
  src?: { type: string; name: string; id?: number; fullpath?: string } | null;
  transform?: unknown; masks?: unknown; effects?: unknown;
  shapes?: unknown; text?: unknown; timeRemap?: unknown;
  __error__?: string;
}
interface DumpComp {
  name: string; id?: number; width: number; height: number;
  duration: number; frameRate: number; pixelAspect?: number;
  bgColor?: unknown; layers: DumpLayer[];
  __error__?: string; __fatal__?: string;
}
interface DumpCompFile { schema: string; comp: DumpComp }
interface DumpItem {
  type: string; name: string; id: number;
  fullpath?: string; hasVideo?: boolean; hasAudio?: boolean;
  duration?: number; frameRate?: number; width?: number; height?: number;
  solid?: boolean; solidColor?: number[]; solidWidth?: number; solidHeight?: number;
}
interface ItemsFile { items: DumpItem[] }

const args = process.argv.slice(2);
const dumpDir = resolve(args[0] ?? '');
const outDir = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : join(ROOT, 'pv', 'generated'));
if (!args[0] || !existsSync(dumpDir)) {
  console.error('usage: node tools/convert-dump.ts <dumpDir> [--out dir]');
  process.exit(1);
}

const items = JSON.parse(readFileSync(join(dumpDir, '_items.json'), 'utf8')) as ItemsFile;
const itemById = new Map(items.items.map((i) => [i.id, i]));

const compFiles = readdirSync(dumpDir)
  .filter((f) => /^\d\d-.*\.json$/.test(f) && existsSync(join(dumpDir, f + '.done')))
  .sort();
const dumps: Array<{ file: string; comp: DumpComp }> = [];
for (const file of compFiles) {
  const raw = JSON.parse(readFileSync(join(dumpDir, file), 'utf8')) as DumpCompFile;
  if (raw.comp && !raw.comp.__fatal__) dumps.push({ file, comp: raw.comp });
}

// comp item id -> spec index (spec order = sorted dump order)
const compIndexById = new Map<number, number>();
dumps.forEach((d, i) => { if (d.comp.id !== undefined) compIndexById.set(d.comp.id, i); });

const warnings: string[] = [];

// ---- footage registry -------------------------------------------------------
// One FootageSpec per unique (kind, content) pair. Layer sources reference
// the canonical spec name; original item ids are kept in sourceUid.
interface FootageEntry {
  name: string;
  kind: 'file' | 'solid';
  file?: string;
  color?: number[];
  width?: number;
  height?: number;
}
const footageEntries: FootageEntry[] = [];
const footageIndexByKey = new Map<string, number>();
const footageNameUsed = new Set<string>();

function uniqueFootageName(base: string): string {
  let n = base, i = 2;
  while (footageNameUsed.has(n)) { n = base + ' #' + i; i++; }
  footageNameUsed.add(n);
  return n;
}

function registerFootage(item: DumpItem | undefined, fallbackName: string, srcFullpath?: string): number {
  // returns index into footageEntries, or -1 on failure
  if (item?.solid) {
    const key = 'solid:' + (item.solidColor ?? []).join(',') + ':' +
      (item.solidWidth ?? 0) + 'x' + (item.solidHeight ?? 0) + ':' + item.name;
    const hit = footageIndexByKey.get(key);
    if (hit !== undefined) return hit;
    const idx = footageEntries.length;
    footageEntries.push({
      name: uniqueFootageName(item.name), kind: 'solid',
      color: item.solidColor ?? [1, 1, 1],
      width: item.solidWidth ?? 100, height: item.solidHeight ?? 100,
    });
    footageIndexByKey.set(key, idx);
    return idx;
  }
  // file footage: resolve path
  let p = '';
  const full = item?.fullpath || srcFullpath || '';
  if (full) {
    const abs = full.replace(/\\/g, '/');
    const rel = relative(ROOT, abs).replace(/\\/g, '/');
    if (!rel.startsWith('..')) p = rel;
    else {
      // outside repo: prefer a same-basename file under assets/
      const bn = basename(abs);
      const stack = [join(ROOT, 'assets')];
      while (stack.length && !p) {
        const dir = stack.pop()!;
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const fp = join(dir, e.name);
          if (e.isDirectory()) stack.push(fp);
          else if (e.name === bn) { p = relative(ROOT, fp).replace(/\\/g, '/'); break; }
        }
      }
      if (!p) { p = abs; warnings.push('footage outside repo, absolute path kept: ' + abs); }
    }
  }
  if (!p) {
    // no path at all: try basename under assets/
    const stack = [join(ROOT, 'assets')];
    while (stack.length && !p) {
      const dir = stack.pop()!;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const fp = join(dir, e.name);
        if (e.isDirectory()) stack.push(fp);
        else if (e.name === fallbackName) { p = relative(ROOT, fp).replace(/\\/g, '/'); break; }
      }
    }
  }
  if (!p) {
    warnings.push('footage unresolved: ' + fallbackName + ' (id ' + (item?.id ?? '?') + ')');
    return -1;
  }
  const key = 'file:' + p;
  const hit = footageIndexByKey.get(key);
  if (hit !== undefined) return hit;
  const idx = footageEntries.length;
  footageEntries.push({ name: uniqueFootageName(item?.name || fallbackName), kind: 'file', file: p });
  footageIndexByKey.set(key, idx);
  return idx;
}

// ---- hidden/inapplicable property pruning -----------------------------------
// The dump enumerates AE's full property tree, including properties that are
// hidden for the layer's current configuration (3D-only transform channels
// on 2D layers, Vec3D material groups on non-3D layers, the unused side of
// separated X/Y/Z position). Setting a value on a hidden property is an AE
// error, so these are pruned here — they carry no visible state anyway.
const THREE_D_ONLY = new Set([
  'ADBE Orientation', 'ADBE Rotate X', 'ADBE Rotate Y', 'ADBE Envir Appear in Reflect',
]);

interface PropNode {
  matchName?: string; name?: string;
  properties?: PropNode[]; numProperties?: number;
  keys?: unknown[]; expression?: string; value?: unknown;
  separatedPosition?: boolean;
}

function pruneTree(node: PropNode, threeD: boolean): PropNode {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node.properties)) {
    node.properties = node.properties.filter((ch) => {
      if (!threeD && THREE_D_ONLY.has(ch.matchName ?? '')) return false;
      if (!threeD && ch.matchName === 'ADBE Vector Materials Group') return false;
      return true;
    }).map((ch) => pruneTree(ch, threeD));
    if (typeof node.numProperties === 'number') node.numProperties = node.properties.length;
  }
  return node;
}

// Separated X/Y/Z position: AE shows either "Position" (vector) or the three
// scalar followers, never both. The dump has all four nodes; the active side
// is the one carrying keys or an expression.
function applyPositionRule(transform: PropNode, threeD: boolean): void {
  const props = transform.properties;
  if (!Array.isArray(props)) return;
  const has = (mn: string) => props.some((p) => p.matchName === mn);
  const active = (mn: string) => props.some((p) =>
    p.matchName === mn && ((p.keys && p.keys.length > 0) || !!p.expression));
  if (!has('ADBE Position')) return;
  const separated = ['ADBE Position_0', 'ADBE Position_1', 'ADBE Position_2'].some(active);
  if (separated) {
    transform.properties = props.filter((p) => {
      if (p.matchName === 'ADBE Position') return false;
      // Z Position is hidden on 2D layers and rejects setValue.
      if (!threeD && p.matchName === 'ADBE Position_2') return false;
      return true;
    });
    transform.separatedPosition = true;
  } else {
    transform.properties = props.filter((p) => !/^ADBE Position_[012]$/.test(p.matchName ?? ''));
  }
  if (typeof transform.numProperties === 'number') transform.numProperties = transform.properties.length;
}

// ---- layer conversion -------------------------------------------------------
function convertLayer(l: DumpLayer, comp: DumpComp): Record<string, unknown> | null {
  if (l.__error__) { warnings.push(`${comp.name}/${l.name}: dump error ${l.__error__}`); return null; }
  const spec: Record<string, unknown> = { index: l.index, name: l.name };

  // kind + source resolution
  if (l.nullLayer) {
    spec.kind = 'null';
  } else if (l.src?.type === 'comp') {
    spec.kind = 'comp';
    spec.source = l.src.name;
    if (l.src.id !== undefined) {
      spec.sourceUid = l.src.id;
      const ci = compIndexById.get(l.src.id);
      if (ci === undefined) warnings.push(`${comp.name}/${l.name}: comp source id ${l.src.id} not in dump`);
      else spec.sourceCompIndex = ci;
    } else {
      warnings.push(`${comp.name}/${l.name}: comp source '${l.src.name}' has no id`);
    }
  } else if (l.src?.type === 'footage') {
    spec.kind = 'footage';
    spec.sourceUid = l.src.id;
    const item = l.src.id !== undefined ? itemById.get(l.src.id) : undefined;
    const fi = registerFootage(item, l.src.name, l.src.fullpath);
    if (fi >= 0) spec.source = footageEntries[fi].name;
    else spec.source = l.src.name; // unresolved; runtime will error loudly
  } else if (l.shapes) {
    spec.kind = 'shape';
  } else if (l.text) {
    spec.kind = 'text';
  } else {
    spec.kind = 'null';
    warnings.push(`${comp.name}/${l.name}: no source and no shape/text — emitted as null`);
  }

  if (l.enabled === false) spec.enabled = false;
  if (l.shy) spec.shy = true;
  if (l.guideLayer) spec.guideLayer = true;
  if (l.inPoint !== undefined) spec.inPoint = l.inPoint;
  if (l.outPoint !== undefined) spec.outPoint = l.outPoint;
  if (l.startTime !== undefined) spec.startTime = l.startTime;
  if (l.stretch !== undefined) spec.stretch = l.stretch;
  if (l.timeRemapEnabled) spec.timeRemapEnabled = true;
  if (l.trackMatteType) spec.trackMatteType = l.trackMatteType;
  if (l.motionBlur) spec.motionBlur = true;
  if (l.collapseTransformations) spec.collapseTransformations = true;
  if (l.adjustmentLayer) spec.adjustmentLayer = true;
  if (l.threeDLayer) spec.threeDLayer = true;
  if (l.audioEnabled === false) spec.audioEnabled = false;
  if (l.isTrackMatte) spec.isTrackMatte = true;

  const parentIndex = l.parentIndex
    ?? (l.parent ? comp.layers.find((x) => x.name === l.parent)?.index : undefined);
  if (l.parent && parentIndex === undefined) {
    warnings.push(`${comp.name}/${l.name}: parent '${l.parent}' unresolved`);
  } else if (parentIndex) {
    spec.parentIndex = parentIndex;
    if (!l.parentIndex && comp.layers.filter((x) => x.name === l.parent).length > 1) {
      warnings.push(`${comp.name}/${l.name}: ambiguous parent name '${l.parent}'`);
    }
  }

  const threeD = !!l.threeDLayer;
  if (l.transform) {
    const t = pruneTree(l.transform as PropNode, threeD);
    applyPositionRule(t, threeD);
    spec.transform = t;
  }
  if (l.masks) spec.masks = pruneTree(l.masks as PropNode, threeD);
  if (l.effects) spec.effects = pruneTree(l.effects as PropNode, threeD);
  if (l.shapes) spec.shapes = pruneTree(l.shapes as PropNode, threeD);
  if (l.text) spec.text = pruneTree(l.text as PropNode, threeD);
  // timeRemapEnabled now records the real L.timeRemapEnabled state (the old
  // dump recorded canSetTimeRemapEnabled — capability, not state). The
  // dormant property node is only meaningful while remapping is enabled.
  if (l.timeRemapEnabled && l.timeRemap) spec.timeRemap = pruneTree(l.timeRemap as PropNode, threeD);
  return spec;
}

// ---- emit --------------------------------------------------------------------
mkdirSync(outDir, { recursive: true });
const compModules: Array<{ varName: string; file: string; name: string }> = [];

for (let di = 0; di < dumps.length; di++) {
  const { file, comp: c } = dumps[di];
  const layers = (c.layers ?? []).map((l) => convertLayer(l, c)).filter(Boolean);
  const varName = 'comp_' + file.slice(0, 2);
  const modName = file.replace(/\.json$/, '');
  const compSpec: Record<string, unknown> = {
    ...(c.id !== undefined ? { uid: c.id } : {}),
    name: c.name, width: c.width, height: c.height,
    ...(c.pixelAspect !== undefined ? { pixelAspect: c.pixelAspect } : {}),
    duration: c.duration, frameRate: c.frameRate,
    ...(c.bgColor !== undefined ? { bgColor: c.bgColor } : {}),
    layers,
  };
  const body = `// Generated from AEP dump ${file} — do not edit by hand.
// Regenerate: node tools/dump-aep-tree.ts <aep> <dir> && node tools/convert-dump.ts <dir>
import type { CompSpec } from '../model/types.ts';

export const ${varName}: CompSpec = ${JSON.stringify(compSpec)} as CompSpec;
export default ${varName};
`;
  writeFileSync(join(outDir, modName + '.ts'), body);
  compModules.push({ varName, file: modName, name: c.name });
}

const indexBody = `// Generated index — do not edit by hand.
${compModules.map((m) => `import { ${m.varName} } from './${m.file}.ts';`).join('\n')}
import type { CompSpec, FootageSpec } from '../model/types.ts';

export const GENERATED_COMPS: CompSpec[] = [
${compModules.map((m) => `  ${m.varName},`).join('\n')}
];

export const GENERATED_FOOTAGE: FootageSpec[] = ${JSON.stringify(footageEntries)};

export const COMP_NAMES = ${JSON.stringify(compModules.map((m) => m.name))};
`;
writeFileSync(join(outDir, 'index.ts'), indexBody);

console.log(`converted ${compModules.length} comps -> ${outDir}`);
console.log(`footage entries: ${footageEntries.length} (${footageEntries.filter((f) => f.kind === 'solid').length} solids)`);
if (warnings.length) {
  writeFileSync(join(ROOT, '.tmp', 'convert-warnings.txt'), warnings.join('\n') + '\n');
  const cats = new Map<string, number>();
  for (const w of warnings) {
    const key = w.includes('unresolved') ? 'unresolved'
      : w.includes('dump error') ? 'dump-error'
      : w.includes('not in dump') ? 'comp-src-missing'
      : w.includes('no id') ? 'comp-src-no-id'
      : w.includes('parent') ? 'parent' : 'other';
    cats.set(key, (cats.get(key) ?? 0) + 1);
  }
  console.log('warning categories:', Object.fromEntries(cats));
  console.log(`full list: .tmp/convert-warnings.txt`);
  for (const w of warnings.slice(0, 40)) console.log('  ' + w);
} else {
  console.log('no warnings');
}
