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
};
type Layer = {
  index: number; name: string; kind?: string;
  transform?: Prop; masks?: Prop; effects?: Prop;
  shapes?: Prop; text?: Prop; timeRemap?: Prop;
};
type Comp = { name: string; width: number; height: number; duration: number; frameRate: number; layers: Layer[] };

function load(dir: string): Map<string, Comp> {
  const map = new Map<string, Comp>();
  for (const f of readdirSync(dir).filter((x) => /^\d\d-.*\.json$/.test(x)).sort()) {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (raw.comp?.name) map.set(raw.comp.name, raw.comp as Comp);
  }
  return map;
}

function countProps(node: Prop | undefined, acc = { leaves: 0, keys: 0, shapes: 0 }): typeof acc {
  if (!node) return acc;
  const isLeaf = !node.properties || node.properties.length === 0;
  if (isLeaf) {
    acc.leaves++;
    acc.keys += node.numKeys ?? 0;
  } else {
    for (const p of node.properties!) countProps(p, acc);
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
const namesA = [...A.keys()], namesB = [...B.keys()];
console.log(`A: ${namesA.length} comps, B: ${namesB.length} comps`);

let diffs = 0;
for (const n of namesA) {
  if (!B.has(n)) { console.log(`- comp missing in B: ${n}`); diffs++; continue; }
}
for (const n of namesB) {
  if (!A.has(n)) { console.log(`+ comp only in B: ${n}`); diffs++; }
}
for (const n of namesA) {
  const a = A.get(n)!, b = B.get(n);
  if (!b) continue;
  const prob: string[] = [];
  if (a.width !== b.width || a.height !== b.height) prob.push(`size ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  if (Math.abs(a.duration - b.duration) > 1e-6) prob.push(`dur ${a.duration} vs ${b.duration}`);
  if (a.frameRate !== b.frameRate) prob.push(`fps ${a.frameRate} vs ${b.frameRate}`);
  if (a.layers.length !== b.layers.length) prob.push(`layers ${a.layers.length} vs ${b.layers.length}`);
  else {
    for (let i = 0; i < a.layers.length; i++) {
      const la = a.layers[i], lb = b.layers[i];
      if (la.name !== lb.name) prob.push(`layer[${i}] name '${la.name}' vs '${lb.name}'`);
      for (const key of ['transform', 'masks', 'effects', 'shapes', 'text', 'timeRemap'] as const) {
        const ca = countProps(la[key] as Prop | undefined);
        const cb = countProps(lb[key] as Prop | undefined);
        if (ca.leaves !== cb.leaves || ca.keys !== cb.keys) {
          prob.push(`layer '${la.name}' ${key}: leaves ${ca.leaves}/${cb.leaves} keys ${ca.keys}/${cb.keys}`);
        }
      }
      const va = shapeVertices(la.shapes as Prop | undefined);
      const vb = shapeVertices(lb.shapes as Prop | undefined);
      if (va !== vb) prob.push(`layer '${la.name}' shape vertices ${va} vs ${vb}`);
    }
  }
  if (prob.length) {
    diffs++;
    console.log(`comp ${n}: ${prob.length} diffs`);
    for (const p of prob.slice(0, 10)) console.log('   ' + p);
    if (prob.length > 10) console.log(`   ... +${prob.length - 10}`);
  }
}
console.log(diffs === 0 ? 'STRUCTURE MATCH' : `${diffs} comps differ`);
process.exit(diffs === 0 ? 0 : 1);
