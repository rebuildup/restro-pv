import assert from "node:assert/strict";
import { test } from "node:test";
import { compStrokes, type StrokeItem } from "../video/src/scenes/glyph.tsx";

// Issue #28 — drawable-stroke material contract.
//
// Scenes A2/B/C/E all consume Restro's real stroke output through
// compStrokes() + StrokeField. This test pins the contract those scenes
// rely on: the named stroke sets exist, every stroke has measurable
// world-space geometry, coordinates are finite, and bboxes are sane
// relative to their comp. It does NOT verify pixels — drawability is
// established by the fact that StrokeField renders these same
// StrokeItems through VectorShapes (the interpreter used by CompView).

function assertStrokeContract(strokes: StrokeItem[], label: string) {
  assert.ok(strokes.length > 0, `${label}: no strokes found`);
  for (const s of strokes) {
    assert.ok(s.points.length >= 2, `${label}/${s.name}: <2 points`);
    const [x0, y0, x1, y1] = s.bbox;
    for (const v of [x0, y0, x1, y1, s.center[0], s.center[1]]) {
      assert.ok(Number.isFinite(v), `${label}/${s.name}: non-finite coord`);
    }
    assert.ok(x1 > x0 && y1 > y0, `${label}/${s.name}: degenerate bbox`);
    assert.ok(
      x0 > -1e5 && x1 < 1e5 && y0 > -1e5 && y1 < 1e5,
      `${label}/${s.name}: bbox outside plausible comp space`,
    );
  }
}

test("Baseline FUDE strokes: the shared 13-stroke set resolves", () => {
  const { comp, strokes } = compStrokes("Baseline", {
    pattern: /^FUDE S\d+/,
    poseT: 0.5,
  });
  assertStrokeContract(strokes, "Baseline/FUDE");
  // SPEC §5: PV glyph WA/WB/WC/EE/A/A2/B/C are all the same 13 strokes.
  assert.equal(strokes.length, 13, `expected 13 FUDE strokes, got ${strokes.length}`);
  assert.ok(comp.width > 0 && comp.height > 0);
});

test("bunkai runs4 strokes: A2's SPEC-assigned set resolves", () => {
  const { strokes } = compStrokes("bunkai", {
    pattern: /^STROKE_\d+_runs4$/,
    poseT: 0.5,
  });
  assertStrokeContract(strokes, "bunkai/runs4");
  const names = new Set(strokes.map((s) => s.name));
  // SPEC §5 A2: vertical = STROKE_016_runs4, horizontals = 015/017_runs4.
  for (const n of ["STROKE_016_runs4", "STROKE_015_runs4", "STROKE_017_runs4"]) {
    assert.ok(names.has(n), `missing SPEC stroke ${n}`);
  }
});

test("stroke geometry is stable across pose times", () => {
  // Rest-pose measurement must not depend on animated shape keys being
  // at a particular phase — scenes pass poseT=0.5 but the contract is
  // that geometry exists at any sampled time.
  for (const poseT of [0.2, 0.5, 0.8]) {
    const { strokes } = compStrokes("Baseline", {
      pattern: /^FUDE S\d+/,
      poseT,
    });
    assertStrokeContract(strokes, `Baseline/FUDE@${poseT}`);
    assert.equal(strokes.length, 13);
  }
});
