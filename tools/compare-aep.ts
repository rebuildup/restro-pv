#!/usr/bin/env node
// Structural comparison between two per-comp dump directories
// (tools/dump-aep-tree.ts output). Reports comp/layer/property/key/shape
// count differences — the machine-checkable half of reproduction QA.
//
//   node tools/compare-aep.ts <dumpDirA> <dumpDirB>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [dirA, dirB] = process.argv.slice(2).map((d) => resolve(d ?? ''));
if (!dirA || !dirB || !existsSync(dirA) || !existsSync(dirB)) {
  console.error('usage: node tools/compare-aep.ts <dumpDirA> <dumpDirB>');
  process.exit(1);
}

type Prop = {
  name?: string; matchName?: string; type?: number;
  numKeys?: number; numProperties?: number; properties?: Prop[];
  keys?: Array<{ t?: number; v?: unknown }>;
  value?: unknown;
  expression?: string;
};
type Layer = {
  index: number; name: string; kind?: string;
  transform?: Prop; masks?: Prop; effects?: Prop;
  shapes?: Prop; text?: Prop; timeRemap?: Prop;
};
type Comp = { name: string; width: number; height: number; duration: number; frameRate: number; layers: Layer[] };

// Comps are matched by name, not by dump order: AE's project.items order is
// not stable across projects (the generated project comes back alphabetically
// sorted while the source uses hand-arranged order), so the NN- filename
// prefix cannot be used as a pairing key. Duplicate names exist (three
// "S4 REC container" comps), so within a name group members are paired by a
// deterministic structural signature; any residual ambiguity surfaces as an
// ordinary content diff rather than a silent mismatch.
function load(dir: string): Comp[] {
  const files = readdirSync(dir).filter((x) => /^\d\d-.*\.json$/.test(x)).sort();
  return files.map((f) => {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    return raw.comp as Comp;
  });
}

function signature(c: Comp): string {
  const parts = [`${c.width}x${c.height}`, `d${c.duration}`, `f${c.frameRate}`, `n${c.layers.length}`];
  for (const l of c.layers) {
    const t = countProps(l.transform as Prop | undefined, undefined, true);
    const m = countProps(l.masks as Prop | undefined);
    const e = countProps(l.effects as Prop | undefined);
    const s = countProps(l.shapes as Prop | undefined);
    const x = countProps(l.text as Prop | undefined);
    const r = countProps(l.timeRemap as Prop | undefined);
    parts.push(`${l.name}=${t.leaves}/${t.keys},${m.leaves}/${m.keys},${e.leaves}/${e.keys},${s.leaves}/${s.keys},${x.leaves}/${x.keys},${r.leaves}/${r.keys},v${shapeVertices(l.shapes as Prop | undefined)}`);
  }
  return parts.join('|');
}

// Pair comps across A and B by name; within a name group sort both sides by
// signature so duplicate names (e.g. "S4 REC container") pair deterministically.
function pairComps(A: Comp[], B: Comp[]): Array<{ a?: Comp; b?: Comp }> {
  const group = (xs: Comp[]) => {
    const m = new Map<string, Comp[]>();
    for (const c of xs) {
      const g = m.get(c.name) ?? [];
      g.push(c);
      m.set(c.name, g);
    }
    for (const g of m.values()) g.sort((x, y) => (signature(x) < signature(y) ? -1 : signature(x) > signature(y) ? 1 : 0));
    return m;
  };
  const ga = group(A), gb = group(B);
  const names = new Set<string>([...ga.keys(), ...gb.keys()]);
  const pairs: Array<{ a?: Comp; b?: Comp }> = [];
  for (const n of [...names].sort()) {
    const xa = ga.get(n) ?? [], xb = gb.get(n) ?? [];
    const k = Math.max(xa.length, xb.length);
    for (let i = 0; i < k; i++) pairs.push({ a: xa[i], b: xb[i] });
  }
  return pairs;
}

// Position keyframes are stored on different nodes depending on AE's
// separated-dimensions state and authoring history: a source layer can report
// keys on "ADBE Position" AND "ADBE Position_1" simultaneously, while a
// generated separated layer reports them only on the dim followers
// (verified on AE 2027: separating migrates Position keys to X/Y Position and
// setValueAtTime on separated "ADBE Position" throws). The evaluated animation
// is identical either way, so position is compared semantically — the union
// of key times plus expression presence across all four nodes — instead of by
// per-node key counts.
const POSITION_MATCHNAMES = new Set(['ADBE Position', 'ADBE Position_0', 'ADBE Position_1', 'ADBE Position_2']);

function isPositionNode(p: Prop | undefined): boolean {
  return !!p && POSITION_MATCHNAMES.has(p.matchName ?? '');
}

function positionSignature(transform: Prop | undefined): string {
  if (!transform) return '';
  // Per-axis effective track: "ADBE Position" vector keys drive all three
  // axes; dim followers drive only their own axis and win on time conflicts.
  // An axis whose keyed values are all identical collapses to "static:<v>",
  // matching an unkeyed static value — constant keyframes and a plain value
  // evaluate identically.
  const axes: Array<Map<number, number>> = [new Map(), new Map(), new Map()];
  const staticVals: Array<number | undefined> = [undefined, undefined, undefined];
  const exprCount = [0, 0, 0];
  const put = (axis: number, t: number, v: number) => {
    const m = axes[axis];
    const key = Math.round(t * 1e4) / 1e4;
    if (!m.has(key)) m.set(key, v);
  };
  const walk = (n: Prop | undefined) => {
    if (!n) return;
    if (isPositionNode(n)) {
      const mn = n.matchName ?? '';
      const idx = mn === 'ADBE Position' ? -1 : Number(mn.slice(-1));
      const targets = idx === -1 ? [0, 1, 2] : [idx];
      const val = n.value;
      for (const a of targets) {
        const comp = idx === -1 && Array.isArray(val) ? Number(val[a]) : Number(val);
        if (Number.isFinite(comp)) staticVals[a] = comp;
      }
      for (const k of n.keys ?? []) {
        if (typeof k.t !== 'number') continue;
        const kv = k.v;
        for (const a of targets) {
          const comp = idx === -1 && Array.isArray(kv) ? Number(kv[a]) : Number(kv);
          if (Number.isFinite(comp)) put(a, k.t, comp);
        }
      }
      if (n.expression) for (const a of targets) exprCount[a]++;
      return; // position nodes are leaves; do not descend
    }
    for (const c of n.properties ?? []) walk(c);
  };
  walk(transform);
  return axes.map((m, a) => {
    const rv = (v: number) => Math.round(v * 1000) / 1000;
    const suffix = exprCount[a] ? '+e' + exprCount[a] : '';
    if (m.size === 0) return 's' + (staticVals[a] === undefined ? '?' : rv(staticVals[a]!)) + suffix;
    const vals = new Set<number>();
    for (const v of m.values()) vals.add(rv(v));
    if (vals.size === 1) return 's' + [...vals][0] + suffix;
    return [...m.entries()].sort((x, y) => x[0] - y[0]).map(([t, v]) => rv(t) + ':' + rv(v)).join(',') + suffix;
  }).join('|');
}

function countProps(node: Prop | undefined, acc = { leaves: 0, keys: 0, shapes: 0 }, skipPosition = false): typeof acc {
  if (!node) return acc;
  if (skipPosition && isPositionNode(node)) return acc;
  const isLeaf = !node.properties || node.properties.length === 0;
  if (isLeaf) {
    acc.leaves++;
    acc.keys += node.numKeys ?? 0;
  } else {
    for (const p of node.properties!) countProps(p, acc, skipPosition);
  }
  return acc;
}
function shapeVertices(node: Prop | undefined): number {
  // count vertices in Shape values inside the tree
  let n = 0;
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.vertices)) n += (o.vertices as unknown[]).length;
      for (const k of Object.keys(o)) if (k !== 'vertices') walk(o[k]);
    }
  };
  walk(node);
  return n;
}

const A = load(dirA), B = load(dirB);
const pairs = pairComps(A, B);
console.log(`A: ${A.length} comps, B: ${B.length} comps (${pairs.length} matched pairs)`);

let diffs = 0;
for (const { a, b } of pairs) {
  if (!a || !b) {
    console.log(`${!a ? '-' : '+'} comp '${a?.name ?? b?.name ?? '?'}'`);
    diffs++;
    continue;
  }
  const name = a.name;
  const prob: string[] = [];
  if (a.width !== b.width || a.height !== b.height) prob.push(`size ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  if (Math.abs(a.duration - b.duration) > 1e-6) prob.push(`dur ${a.duration} vs ${b.duration}`);
  if (a.frameRate !== b.frameRate) prob.push(`fps ${a.frameRate} vs ${b.frameRate}`);
  if (a.layers.length !== b.layers.length) prob.push(`layers ${a.layers.length} vs ${b.layers.length}`);
  else {
    for (let li = 0; li < a.layers.length; li++) {
      const la = a.layers[li], lb = b.layers[li];
      if (la.name !== lb.name) prob.push(`layer[${li}] name '${la.name}' vs '${lb.name}'`);
      for (const key of ['transform', 'masks', 'effects', 'shapes', 'text', 'timeRemap'] as const) {
        const skipPos = key === 'transform';
        const ca = countProps(la[key] as Prop | undefined, undefined, skipPos);
        const cb = countProps(lb[key] as Prop | undefined, undefined, skipPos);
        if (ca.leaves !== cb.leaves || ca.keys !== cb.keys) {
          prob.push(`layer '${la.name}' ${key}: leaves ${ca.leaves}/${cb.leaves} keys ${ca.keys}/${cb.keys}`);
        }
        if (skipPos) {
          const pa = positionSignature(la.transform as Prop | undefined);
          const pb = positionSignature(lb.transform as Prop | undefined);
          if (pa !== pb) prob.push(`layer '${la.name}' position track differs`);
        }
      }
      const va = shapeVertices(la.shapes as Prop | undefined);
      const vb = shapeVertices(lb.shapes as Prop | undefined);
      if (va !== vb) prob.push(`layer '${la.name}' shape vertices ${va} vs ${vb}`);
    }
  }
  if (prob.length) {
    diffs++;
    console.log(`comp '${name}': ${prob.length} diffs`);
    for (const p of prob.slice(0, 10)) console.log('   ' + p);
    if (prob.length > 10) console.log(`   ... +${prob.length - 10}`);
  }
}
console.log(diffs === 0 ? 'STRUCTURE MATCH' : `${diffs} comps differ`);
process.exit(diffs === 0 ? 0 : 1);
