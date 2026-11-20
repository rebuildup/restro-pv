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

// Comps are matched by dump order (the NN- filename prefix), not by name:
// the project legitimately contains duplicate comp names (three
// "S4 REC container" comps), so a name-keyed map would silently drop two
// of them. A name mismatch at the same index is itself reported as a diff.
function load(dir: string): Comp[] {
  const files = readdirSync(dir).filter((x) => /^\d\d-.*\.json$/.test(x)).sort();
  return files.map((f) => {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    return raw.comp as Comp;
  });
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
console.log(`A: ${A.length} comps, B: ${B.length} comps`);

let diffs = 0;
const n = Math.max(A.length, B.length);
for (let i = 0; i < n; i++) {
  const a = A[i], b = B[i];
  if (!a || !b) {
    console.log(`${!a ? '-' : '+'} comp at index ${i}: ${a?.name ?? b?.name ?? '?'}`);
    diffs++;
    continue;
  }
  const name = a.name === b.name ? a.name : `${a.name} vs ${b.name}`;
  const prob: string[] = [];
  if (a.name !== b.name) prob.push(`name '${a.name}' vs '${b.name}'`);
  if (a.width !== b.width || a.height !== b.height) prob.push(`size ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  if (Math.abs(a.duration - b.duration) > 1e-6) prob.push(`dur ${a.duration} vs ${b.duration}`);
  if (a.frameRate !== b.frameRate) prob.push(`fps ${a.frameRate} vs ${b.frameRate}`);
  if (a.layers.length !== b.layers.length) prob.push(`layers ${a.layers.length} vs ${b.layers.length}`);
  else {
    for (let li = 0; li < a.layers.length; li++) {
      const la = a.layers[li], lb = b.layers[li];
      if (la.name !== lb.name) prob.push(`layer[${li}] name '${la.name}' vs '${lb.name}'`);
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
    console.log(`comp[${i}] ${name}: ${prob.length} diffs`);
    for (const p of prob.slice(0, 10)) console.log('   ' + p);
    if (prob.length > 10) console.log(`   ... +${prob.length - 10}`);
  }
}
console.log(diffs === 0 ? 'STRUCTURE MATCH' : `${diffs} comps differ`);
process.exit(diffs === 0 ? 0 : 1);
