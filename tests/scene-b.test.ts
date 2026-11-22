// Scene-B verification comp — structural contract tests (issue #19 Step 3).
// The comp reproduces the original master's B window (4.25-7.92s) as semantic
// sections; these tests pin the properties that make it faithful:
// matte-source adjacency, section z-order, material keep-set, and resolved
// references (no dangling legacy stack indices).

import { describe, expect, test } from "bun:test";

import { sceneBProject } from "../pv/scenes/scene-b.ts";
import { compileProduction } from "../pv/production/compile.ts";
import { materialCompsByName } from "../pv/scenes/production.ts";
import { materialKeepSet } from "../pv/scenes/production.ts";
import type { LayerSpec, PropNode, ProjectSpec } from "../pv/spec/types.ts";

function spec(): ProjectSpec {
  const s = compileProduction(sceneBProject, { materialComps: materialCompsByName() });
  s.pruneMaterial = materialKeepSet(s);
  return s;
}

// The comp is named "master" (not the id) because the Restro material
// comps resolve comp("master").layer("Linked Quad 8/9/10") for corner
// tracking — see pv/scenes/scene-b.ts.
const COMP = "master";

function compOf(s: ProjectSpec) {
  const c = s.comps.find((x) => x.name === COMP);
  if (!c) throw new Error("missing comp " + COMP);
  return c;
}

function byName(s: ProjectSpec, name: string): LayerSpec {
  const l = compOf(s).layers.find((x) => x.name === name);
  if (!l) throw new Error("missing layer " + name);
  return l;
}

function indexOf(s: ProjectSpec, name: string): number {
  return compOf(s).layers.findIndex((x) => x.name === name) + 1;
}

describe("scene-b structure", () => {
  test("comp frame matches the master; verification folder", () => {
    const s = spec();
    const c = compOf(s);
    expect(c.width).toBe(1080);
    expect(c.height).toBe(1080);
    expect(c.duration).toBe(20);
    expect(c.frameRate).toBe(24);
    expect(c.folder).toBe("_Verification");
    expect(s.comps).toHaveLength(1);
  });

  test("master's inert mattes reproduce as NO_TRACK_MATTE; z-order adjacency kept", () => {
    // The master dump sets ALPHA (5013) on these layers but every matte
    // source has isTrackMatte=false — the bindings are stale and the
    // original renders them unmasked. We reproduce the effective state.
    const s = spec();
    const layers = compOf(s).layers;
    const pairs: Array<[string, string]> = [
      ["description", "LENS frame"],
      ["Lens magnifier", "P-71"],
      ["STEP4 draft", "STEP 4 border"],
      ["STEP3 draft", "STEP 3 border"],
      ["STEP2 draft", "STEP 2 border"],
      ["STEP1 outline", "STEP 1 border"],
    ];
    for (const [matted, matte] of pairs) {
      const mi = indexOf(s, matted);
      const si = indexOf(s, matte);
      expect(mi, matted).toBeGreaterThan(0);
      expect(si, matte).toBe(mi - 1);
      expect(layers[mi - 1].trackMatteType, matted).toBe(5012);
    }
  });

  test("B-window timing is preserved on scene layers", () => {
    const s = spec();
    for (const name of [
      "Baseline",
      "STEP4 draft",
      "STEP3 draft",
      "STEP2 draft",
      "Lens magnifier",
      "tab backgrounds",
      "STEP 1 card",
    ]) {
      const l = byName(s, name);
      expect(l.inPoint, name).toBeCloseTo(4.25, 5);
      expect(l.outPoint, name).toBeCloseTo(7.91666666666667, 5);
    }
    // Cloned layers keep their dumped (frame-quantized) out points.
    for (const name of ["LENS frame", "STEP 4 border", "Linked Quad 8"]) {
      const l = byName(s, name);
      expect(l.inPoint, name).toBeCloseTo(4.25, 2);
      expect(l.outPoint!, name).toBeGreaterThan(7.9);
      expect(l.outPoint!, name).toBeLessThan(7.93);
    }
    expect(byName(s, "STEP1 outline").outPoint).toBeCloseTo(6.25, 5);
    // Always-on overlays keep their 0-20s window.
    for (const name of ["grid-solid", "White Solid 1", "lens matte"]) {
      const l = byName(s, name);
      expect(l.inPoint, name).toBe(0);
      expect(l.outPoint, name).toBeGreaterThanOrEqual(20);
    }
  });

  test("step z-order matches the master: border above draft, Baseline last", () => {
    const s = spec();
    const order = [
      "STEP 4 border",
      "STEP4 draft",
      "STEP 3 border",
      "STEP3 draft",
      "STEP 2 border",
      "STEP2 draft",
      "STEP 1 border",
      "STEP1 outline",
      "Baseline",
    ].map((n) => indexOf(s, n));
    for (let i = 1; i < order.length; i++) {
      expect(order[i], "z-order").toBeGreaterThan(order[i - 1]);
    }
  });

  test("material keep-set covers the B scene + brand comps and their footage", () => {
    const s = spec();
    expect(s.pruneMaterial?.keepComps.sort()).toEqual(
      [
        "Baseline",
        "Heading",
        "Lens magnifier",
        "Logo",
        "STEP1 outline",
        "STEP2 draft",
        "STEP3 draft",
        "STEP4 draft",
        "description",
      ].sort(),
    );
    for (const f of [
      "grid-solid",
      "White Solid 1",
      "drums-and-somps-background-music-458414.mp3",
      "Blue Solid 1",
      "Blue Solid 2",
    ]) {
      expect(s.pruneMaterial?.keepFootage).toContain(f);
    }
  });

  test("tracker rig is emitted as shy nulls under a folded divider", () => {
    const s = spec();
    const nulls = compOf(s).layers.filter((l) => l.kind === "null" && l.shy);
    // ~55 rig nulls + 2 brand drift anchors; the exact count is the legacy
    // closure size — assert a sane range rather than a brittle number.
    expect(nulls.length).toBeGreaterThan(50);
    const p71 = byName(s, "P-71");
    expect(p71.kind).toBe("null");
    expect(p71.parentIndex).toBe(indexOf(s, "P 18"));
  });

  test("every Layer Control / expression reference resolved to a valid index", () => {
    const s = spec();
    const layers = compOf(s).layers;
    const walk = (n: PropNode | undefined): void => {
      if (!n) return;
      if (n.matchName === "ADBE Layer Control-0001") {
        const check = (v: unknown) => {
          if (typeof v === "number") {
            expect(v, "layer control index").toBeGreaterThanOrEqual(1);
            expect(v, "layer control index").toBeLessThanOrEqual(layers.length);
          }
        };
        check(n.value);
        for (const k of n.keys ?? []) check(k.v);
      }
      if (typeof n.expression === "string") {
        expect(n.expression).not.toContain("{{ref:");
      }
      for (const p of n.properties ?? []) walk(p);
    };
    for (const l of layers) {
      for (const key of ["transform", "masks", "effects", "shapes", "text", "timeRemap"] as const) {
        walk(l[key] as PropNode | undefined);
      }
    }
  });
});
