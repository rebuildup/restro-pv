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

  test("no track mattes remain; borders/cards are visible info layers", () => {
    // ADR-0004 + v12 experiment: stale legacy bindings are gone and the
    // border-matte variant was rejected — AE disables the matte-source
    // border, zeroing its alpha and erasing the draft. Every layer is
    // therefore 5012 or unset.
    const s = spec();
    for (const l of compOf(s).layers) {
      expect(l.trackMatteType ?? 5012, l.name).toBe(5012);
    }
    // Retired matte/null dependencies must not exist.
    for (const gone of ["P-71", "lens matte"]) {
      expect(compOf(s).layers.some((l) => l.name === gone), gone).toBe(false);
    }
    // Borders and cards survive as ordinary visible layers.
    for (const n of [
      "STEP 1 border",
      "STEP 2 border",
      "STEP 3 border",
      "STEP 4 border",
      "STEP 1 card",
      "STEP 2 card",
      "STEP 3 card",
      "STEP 4 card",
    ]) {
      const l = byName(s, n);
      expect(l.enabled ?? true, n).toBe(true);
      expect(l.isTrackMatte ?? false, n).toBe(false);
    }
  });

  test("lens magnifier window is an explicit mask, not a matte", () => {
    const s = spec();
    const l = byName(s, "Lens magnifier");
    expect(l.trackMatteType ?? 5012).toBe(5012);
    const parade = l.masks;
    expect(parade?.matchName).toBe("ADBE Mask Parade");
    const atom = parade?.properties?.[0];
    expect(atom?.matchName).toBe("ADBE Mask Atom");
    const path = atom?.properties?.find((p) => p.matchName === "ADBE Mask Shape");
    const v = (path?.value as { vertices: number[][] }).vertices;
    // 16-gon approximating the legacy "lens matte" circle: master center
    // (660,810) r~210 → layer space (584,472) on the 1080 comp at pos
    // (75.97,337.88). Verify bounds in layer space.
    const xs = v.map((p) => p[0]);
    const ys = v.map((p) => p[1]);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(584.03, 0);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(472.12, 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(420, 0);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(420, 0);
    // Pop-in: Mask Expansion starts collapsed and settles at 0.
    const exp = atom?.properties?.find((p) => p.matchName === "ADBE Mask Offset");
    expect(exp?.keys?.[0].v).toBeCloseTo(-210, 5);
    expect(exp?.keys?.[exp.keys.length - 1].v).toBe(0);
  });

  test("step labels appear cumulatively as each stage begins", () => {
    const s = spec();
    const expected: Array<[string, number]> = [
      ["01  輪郭を解析した", 4.25],
      ["02  輪郭線を延長した", 5.0],
      ["03  隠れた頂点を推定した", 5.625],
      ["04  一画ずつに分割中・", 6.625],
    ];
    for (const [n, t] of expected) {
      expect(byName(s, n).inPoint, n).toBeCloseTo(t, 5);
      expect(byName(s, n).outPoint!, n).toBeGreaterThan(7.9);
    }
  });

  test("B-window timing is preserved on scene layers", () => {
    const s = spec();
    for (const name of [
      "Baseline",
      "Lens magnifier",
      "tab backgrounds",
      "STEP 1 card",
    ]) {
      const l = byName(s, name);
      expect(l.inPoint, name).toBeCloseTo(4.25, 5);
      expect(l.outPoint, name).toBeCloseTo(7.91666666666667, 5);
    }
    // Each step comp is visible only during its own stage window. The
    // brush progression trails the label/lens boundaries by ~0.1-0.25s,
    // matching the observed legacy pacing (the stage color baked into
    // each material comp tracks the active step instead of stacking all
    // four identical-glyph comps).
    const stageWindows: Array<[string, number, number]> = [
      ["STEP1 outline", 4.25, 5.125],
      ["STEP2 draft", 5.125, 5.8],
      ["STEP3 draft", 5.8, 6.85],
      ["STEP4 draft", 6.85, 7.91666666666667],
    ];
    for (const [name, inn, out] of stageWindows) {
      const l = byName(s, name);
      expect(l.inPoint, name).toBeCloseTo(inn, 5);
      expect(l.outPoint, name).toBeCloseTo(out, 5);
    }
    // Cloned layers keep their dumped (frame-quantized) out points.
    for (const name of ["LENS frame", "STEP 4 border", "Linked Quad 8"]) {
      const l = byName(s, name);
      expect(l.inPoint, name).toBeCloseTo(4.25, 2);
      expect(l.outPoint!, name).toBeGreaterThan(7.9);
      expect(l.outPoint!, name).toBeLessThan(7.93);
    }
    // Always-on overlays keep their 0-20s window.
    for (const name of ["grid-solid", "White Solid 1"]) {
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
    expect(byName(s, "ctl-op").kind).toBe("null");
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
