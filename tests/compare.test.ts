import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Regression tests for tools/compare-aep.ts: intentional value or
// interpolation changes MUST fail verification, while documented AE
// representation differences (dormant/hidden props, position storage,
// disabled subtrees) must be absorbed.

const ROOT = join(import.meta.dirname, '..');
const COMPARE = join(ROOT, 'tools', 'compare-aep.ts');

type Prop = Record<string, unknown>;

function leaf(name: string, matchName: string, value: unknown, extra: Prop = {}): Prop {
  return { name, matchName, numKeys: 0, value, ...extra };
}

function transform(props: Prop[]): Prop {
  return { name: 'Transform', matchName: 'ADBE Transform Group', properties: props };
}

function baseTransform(): Prop[] {
  return [
    leaf('Anchor Point', 'ADBE Anchor Point', [0, 0, 0]),
    leaf('Position', 'ADBE Position', [50, 50, 0]),
    leaf('Scale', 'ADBE Scale', [100, 100, 100]),
    leaf('Rotation', 'ADBE Rotate Z', 0),
    leaf('Opacity', 'ADBE Opacity', 100),
  ];
}

function layer(name: string, t: Prop, extra: Prop = {}): Prop {
  return {
    name, index: 1, enabled: true, inPoint: 0, outPoint: 10, startTime: 0,
    stretch: 100, hasVideo: true, hasAudio: false, threeDLayer: false,
    transform: t, ...extra,
  };
}

function comp(layers: Prop[], extra: Prop = {}): Prop {
  return {
    name: 'Test', id: 1, width: 100, height: 100, duration: 10,
    frameRate: 30, pixelAspect: 1, bgColor: [0, 0, 0], layers, ...extra,
  };
}

function runCompare(a: Prop, b: Prop): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'cmp-'));
  try {
    const da = join(dir, 'a'), db = join(dir, 'b');
    mkdirSync(da); mkdirSync(db);
    writeFileSync(join(da, '01-Test.json'), JSON.stringify({ comp: a }));
    writeFileSync(join(db, '01-Test.json'), JSON.stringify({ comp: b }));
    try {
      const out = execFileSync(process.execPath, [COMPARE, da, db], { encoding: 'utf8' });
      return { code: 0, out };
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      return { code: err.status ?? 1, out: String(err.stdout ?? '') };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const mk = (t: Prop, extra: Prop = {}) => comp([layer('L1', t, extra)]);

test('identical comps match', () => {
  const r = runCompare(mk(transform(baseTransform())), mk(transform(baseTransform())));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /STRUCTURE MATCH/);
});

test('changed static value fails', () => {
  const propsB = baseTransform().map((p) =>
    p.matchName === 'ADBE Opacity' ? leaf('Opacity', 'ADBE Opacity', 50) : p);
  const r = runCompare(mk(transform(baseTransform())), mk(transform(propsB)));
  assert.equal(r.code, 1);
  assert.match(r.out, /Opacity\.value/);
});

test('changed keyframe interpolation fails', () => {
  const keyA = { t: 0, v: 100, inT: 6612, outT: 6612 };
  const keyB = { t: 0, v: 100, inT: 6613, outT: 6613 };
  const propsA = baseTransform().map((p) =>
    p.matchName === 'ADBE Opacity' ? leaf('Opacity', 'ADBE Opacity', 100, { numKeys: 1, keys: [keyA] }) : p);
  const propsB = baseTransform().map((p) =>
    p.matchName === 'ADBE Opacity' ? leaf('Opacity', 'ADBE Opacity', 100, { numKeys: 1, keys: [keyB] }) : p);
  const r = runCompare(mk(transform(propsA)), mk(transform(propsB)));
  assert.equal(r.code, 1);
  assert.match(r.out, /interp 6612\/6612 vs 6613\/6613/);
});

test('changed keyframe value fails', () => {
  const keyA = { t: 0, v: 100, inT: 6613, outT: 6613 };
  const keyB = { t: 0, v: 80, inT: 6613, outT: 6613 };
  const propsA = baseTransform().map((p) =>
    p.matchName === 'ADBE Opacity' ? leaf('Opacity', 'ADBE Opacity', 100, { numKeys: 1, keys: [keyA] }) : p);
  const propsB = baseTransform().map((p) =>
    p.matchName === 'ADBE Opacity' ? leaf('Opacity', 'ADBE Opacity', 100, { numKeys: 1, keys: [keyB] }) : p);
  const r = runCompare(mk(transform(propsA)), mk(transform(propsB)));
  assert.equal(r.code, 1);
  assert.match(r.out, /key\[0\]\.v/);
});

test('3D-only transform props on a 2D layer are absorbed', () => {
  const propsA = baseTransform().concat([
    leaf('X Rotation', 'ADBE Rotate X', 0),
    leaf('Orientation', 'ADBE Orientation', [0, 0, 0]),
    leaf('Appears in Reflections', 'ADBE Envir Appear in Reflect', 1),
  ]);
  // B legitimately lacks them: AE hides them on 2D layers.
  const r = runCompare(mk(transform(propsA)), mk(transform(baseTransform())));
  assert.equal(r.code, 0, r.out);
});

test('children of a disabled group are unwritable and absorbed', () => {
  const strokeA = {
    name: 'Stroke 1', matchName: 'ADBE Vector Graphic - Stroke', enabled: false,
    properties: [leaf('Color', 'ADBE Vector Stroke Color', [1, 0, 0, 1])],
  };
  const strokeB = {
    name: 'Stroke 1', matchName: 'ADBE Vector Graphic - Stroke', enabled: false,
    properties: [leaf('Color', 'ADBE Vector Stroke Color', [0, 1, 0, 1])],
  };
  const groupA = { name: 'G', matchName: 'ADBE Vector Group', properties: [strokeA] };
  const groupB = { name: 'G', matchName: 'ADBE Vector Group', properties: [strokeB] };
  const shapesA = { name: 'Contents', matchName: 'ADBE Root Vectors Group', properties: [groupA] };
  const shapesB = { name: 'Contents', matchName: 'ADBE Root Vectors Group', properties: [groupB] };
  const r = runCompare(
    mk(transform(baseTransform()), { shapes: shapesA }),
    mk(transform(baseTransform()), { shapes: shapesB }),
  );
  assert.equal(r.code, 0, r.out);
});

test('enabled mismatch on a group still fails', () => {
  const gA = { name: 'G', matchName: 'ADBE Vector Group', enabled: true, properties: [] };
  const gB = { name: 'G', matchName: 'ADBE Vector Group', enabled: false, properties: [] };
  const sA = { name: 'Contents', matchName: 'ADBE Root Vectors Group', properties: [gA] };
  const sB = { name: 'Contents', matchName: 'ADBE Root Vectors Group', properties: [gB] };
  const r = runCompare(
    mk(transform(baseTransform()), { shapes: sA }),
    mk(transform(baseTransform()), { shapes: sB }),
  );
  assert.equal(r.code, 1);
  assert.match(r.out, /enabled/);
});

test('vector vs separated position storage is equivalent', () => {
  // A: single vector Position node with one constant key.
  const posA = leaf('Position', 'ADBE Position', [10, 20, 0], {
    numKeys: 1, keys: [{ t: 0, v: [10, 20, 0], inT: 6613, outT: 6613 }],
  });
  // B: separated dims as static values, no Position node.
  const propsB = baseTransform().filter((p) => p.matchName !== 'ADBE Position').concat([
    leaf('X Position', 'ADBE Position_0', 10),
    leaf('Y Position', 'ADBE Position_1', 20),
    leaf('Z Position', 'ADBE Position_2', 0),
  ]);
  const propsA = baseTransform().map((p) => (p.matchName === 'ADBE Position' ? posA : p));
  const r = runCompare(mk(transform(propsA)), mk(transform(propsB)));
  assert.equal(r.code, 0, r.out);
});

test('different effective position animation fails', () => {
  const posA = leaf('Position', 'ADBE Position', [10, 20, 0], {
    numKeys: 1, keys: [{ t: 0, v: [10, 20, 0], inT: 6613, outT: 6613 }],
  });
  const posB = leaf('Position', 'ADBE Position', [10, 20, 0], {
    numKeys: 1, keys: [{ t: 0, v: [10, 20, 0], inT: 6613, outT: 6613 }, { t: 5, v: [30, 40, 0], inT: 6613, outT: 6613 }],
  });
  // numKeys differs -> key count diff must fire.
  const propsA = baseTransform().map((p) => (p.matchName === 'ADBE Position' ? posA : p));
  const propsB = baseTransform().map((p) => (p.matchName === 'ADBE Position' ? { ...posB, numKeys: 2 } : p));
  const r = runCompare(mk(transform(propsA)), mk(transform(propsB)));
  assert.equal(r.code, 1);
});
