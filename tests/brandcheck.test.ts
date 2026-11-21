// Contract tests for the Step-2 brand/grid verification comp
// (pv/scenes/brandcheck.ts). These pin the semantic structure — grid-driven
// placement, stable-id parenting, minimal anchors, material keep-set — so the
// verification AEP cannot silently regress to legacy coordinates.

import { describe, expect, test } from "bun:test";
import { compileProduction } from "../pv/production/compile.ts";
import { brandCheckProject, brandCheckSpec } from "../pv/scenes/brandcheck.ts";
import { materialCompsByName } from "../pv/scenes/production.ts";
import type { CompSpec, LayerSpec } from "../pv/spec/types.ts";

const spec = brandCheckSpec();
const comp = spec.comps[0] as CompSpec;

function posOf(l: LayerSpec): number[] | undefined {
  const p = l.transform?.properties?.find((p) => p.matchName === "ADBE Position");
  return Array.isArray(p?.value) ? (p.value as number[]) : undefined;
}

function byName(name: string): LayerSpec {
  const l = comp.layers.find((x) => x.name === name);
  if (!l) throw new Error(`layer "${name}" missing`);
  return l;
}

describe("brand-check spec", () => {
  test("single 1080x1080@24fps comp, no legacy scene material", () => {
    expect(spec.comps).toHaveLength(1);
    expect(comp.name).toBe("brand-check");
    expect(comp.width).toBe(1080);
    expect(comp.height).toBe(1080);
    expect(comp.frameRate).toBe(24);
    expect(comp.duration).toBe(4);
    // Only brand material comps survive pruning — no master/C/D/E.
    expect(spec.pruneMaterial?.keepComps.sort()).toEqual(["Heading", "Logo"]);
    expect(spec.pruneMaterial?.keepFootage).toContain("Ae.png");
  });

  test("exactly two anchor nulls; brand children parent to brand-origin", () => {
    const anchors = comp.layers.filter((l) => l.kind === "null");
    expect(anchors.map((l) => l.name).sort()).toEqual([
      "anchor:brand-origin",
      "anchor:copy-origin",
    ]);
    const brandOrigin = byName("anchor:brand-origin");
    const copyOrigin = byName("anchor:copy-origin");
    for (const n of ["Logo", "Ae.png", "AFTER EFFECTS PLUGIN"]) {
      expect(byName(n).parentIndex).toBe(brandOrigin.index);
    }
    for (const n of ["Heading", "HOW IT WORKS"]) {
      expect(byName(n).parentIndex).toBe(copyOrigin.index);
    }
    // No other layer is parented — anchors are the only rig.
    // 5 copy children (Heading + 4 texts) + 3 brand children.
    const parented = comp.layers.filter((l) => l.parentIndex !== undefined);
    expect(parented).toHaveLength(8);
  });

  test("brand-origin anchor carries the up-right key move", () => {
    const a = byName("anchor:brand-origin");
    const pos = a.transform?.properties?.find((p) => p.matchName === "ADBE Position");
    expect(pos?.keys?.length).toBeGreaterThanOrEqual(3);
    const first = pos?.keys?.[0]?.v;
    const moved = pos?.keys?.[pos.keys.length - 1]?.v;
    expect(Array.isArray(first) || typeof first === "object").toBe(true);
    const f = first as { x?: number; y?: number } | number[];
    const m = moved as { x?: number; y?: number } | number[];
    const fx = Array.isArray(f) ? f[0] : f.x;
    const fy = Array.isArray(f) ? f[1] : f.y;
    const mx = Array.isArray(m) ? m[0] : m.x;
    const my = Array.isArray(m) ? m[1] : m.y;
    expect(mx! - fx!).toBeCloseTo(72, 5);
    expect(my! - fy!).toBeCloseTo(-36, 5);
  });

  test("grid lines exist for all 13+13 grid lines and start invisible", () => {
    const lines = comp.layers.filter((l) => l.name.startsWith("grid "));
    expect(lines).toHaveLength(26);
    const v = byName("grid v6");
    const op = v.transform?.properties?.find((p) => p.matchName === "ADBE Opacity");
    expect(op?.keys?.[0]?.v).toBe(0);
    expect(op?.keys?.[op.keys.length - 1]?.v).toBe(65);
  });

  test("grid reflow: changing margin moves region-derived positions", () => {
    const wide = structuredClone(brandCheckProject);
    wide.frame = { ...wide.frame };
    const comp2 = structuredClone(wide.comps[0]);
    comp2.grid = { ...comp2.grid!, margin: { x: 128, y: 128 } };
    wide.comps = [comp2];
    const s2 = compileProduction(wide, { materialComps: materialCompsByName() });
    const c2 = s2.comps[0] as CompSpec;
    // Parented children keep identical parent-local offsets (the anchor
    // absorbs the grid shift), so assert on the unparented main marker and
    // on the anchor's comp-space position instead.
    const marker2 = c2.layers.find((l) => l.name === "main stage (region marker)")!;
    const marker1 = byName("main stage (region marker)");
    const m1 = posOf(marker1)!;
    const m2 = posOf(marker2)!;
    expect(m2).not.toEqual(m1);
    const anchor2 = c2.layers.find((l) => l.name === "anchor:brand-origin")!;
    const aPos = anchor2.transform?.properties?.find((p) => p.matchName === "ADBE Position");
    const av = aPos?.keys?.[0]?.v ?? aPos?.value;
    const bx = Array.isArray(av) ? av[0] : (av as { x: number }).x;
    const by = Array.isArray(av) ? av[1] : (av as { y: number }).y;
    // The brand region's left edge IS the margin — a grid-layout anchor
    // must track it (128 here, was 64).
    expect(bx).toBeCloseTo(128, 5);
    expect(by).toBeGreaterThan(100);
  });

  test("no expression refs or legacy layer indices leak into the spec", () => {
    const json = JSON.stringify(comp.layers);
    expect(json).not.toContain("{{ref:");
    // parentIndex values must all resolve to anchor nulls (checked above);
    // sourceCompIndex must be absent (no project-internal comp refs).
    for (const l of comp.layers) {
      expect(l.sourceCompIndex).toBeUndefined();
    }
  });
});
