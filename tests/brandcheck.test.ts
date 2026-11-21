// Contract tests for the grid-driven brand verification comp
// (pv/scenes/brandcheck.ts): placement must come from GridSpec + named
// regions + anchor-relative motion — never from absolute coordinates.

import { describe, expect, test } from "bun:test";
import { brandCheckProject, brandCheckSpec } from "../pv/scenes/brandcheck.ts";
import { compileProduction } from "../pv/production/compile.ts";
import { createGrid } from "../pv/production/grid.ts";
import type { CompSpec, LayerSpec, PropNode, ProjectSpec } from "../pv/spec/types.ts";
import { materialCompsByName } from "../pv/scenes/production.ts";

const spec = brandCheckSpec();
const comp = spec.comps[0] as CompSpec;

function byName(name: string): LayerSpec {
  const l = comp.layers.find((x) => x.name === name);
  if (!l) throw new Error(`layer "${name}" missing`);
  return l;
}

function child(node: PropNode, matchName: string): PropNode | undefined {
  return node.properties?.find((p) => p.matchName === matchName);
}

function vec3(node: PropNode | undefined): number[] | undefined {
  const v = node?.value;
  if (Array.isArray(v)) return v as number[];
  if (v && typeof v === "object") {
    const o = v as { x?: number; y?: number; z?: number };
    return [Number(o.x) || 0, Number(o.y) || 0, Number(o.z) || 0];
  }
  return undefined;
}

function positionOf(l: LayerSpec): number[] {
  const v = vec3(child(l.transform!, "ADBE Position"));
  if (!v) throw new Error(`${l.name}: no scalar Position`);
  return v;
}

function recompile(mutate: (c: typeof brandCheckProject.comps[0]) => void): ProjectSpec {
  const p = structuredClone(brandCheckProject);
  mutate(p.comps[0]);
  return compileProduction(p, { materialComps: materialCompsByName() });
}

describe("brand-check grid layout", () => {
  test("frame matches the master; brand materials + stage asset survive", () => {
    expect(spec.comps).toHaveLength(1);
    expect(comp.name).toBe("brand-check");
    expect(comp.width).toBe(1080);
    expect(comp.height).toBe(1080);
    expect(comp.frameRate).toBe(24);
    expect(comp.duration).toBe(20);
    expect(comp.bgColor).toEqual([1, 1, 1]);
    expect(spec.pruneMaterial?.keepComps.sort()).toEqual([
      "Heading",
      "Logo",
      "description",
    ]);
  });

  test("brand layers and anchors come from layout, not absolute coords", () => {
    const names = comp.layers.map((l) => l.name);
    for (const n of ["description", "Heading", "Logo", "Main (stage)"]) {
      expect(names).toContain(n);
    }
    // Drift anchors are shy nulls named anchor:<id>.
    expect(names).toContain("anchor:heading-drift");
    expect(names).toContain("anchor:logo-drift");
    expect(byName("anchor:heading-drift").kind).toBe("null");
    expect(byName("anchor:heading-drift").shy).toBe(true);
  });

  test("parent wiring: brand layers ride their drift anchors", () => {
    const heading = byName("Heading");
    const logo = byName("Logo");
    const hd = byName("anchor:heading-drift");
    const ld = byName("anchor:logo-drift");
    expect(heading.parentIndex).toBe(hd.index);
    expect(logo.parentIndex).toBe(ld.index);
    // Parented layers store parent-local positions; effective comp-space
    // position = anchor rest position + child local position must equal
    // the layer's own layout target.
    const grid = createGrid(
      { columns: 12, rows: 12, margin: { x: 48, y: 48 }, gutter: { x: 16, y: 16 } },
      { width: 1080, height: 1080 },
    );
    const restPos = (l: LayerSpec): number[] => {
      const k = child(l.transform!, "ADBE Position")!.keys![0].v as number[];
      return [k[0], k[1]];
    };
    const headingTarget = grid.span([0, 11, 4, 11]); // top-left
    const logoZone = grid.span([0, 3, 4, 6]);
    const logoTarget = {
      x: logoZone.x + logoZone.width / 2,
      y: logoZone.y + logoZone.height / 2,
    };
    const eff = (l: LayerSpec, a: LayerSpec, tx: number, ty: number) => {
      const [ax, ay] = restPos(a);
      const [cx, cy] = positionOf(l);
      expect(ax + cx).toBeCloseTo(tx, 3);
      expect(ay + cy).toBeCloseTo(ty, 3);
    };
    eff(heading, hd, headingTarget.x, headingTarget.y);
    eff(logo, ld, logoTarget.x, logoTarget.y);
    // Unparented layers carry real comp-space positions inside the frame.
    for (const n of ["description", "Main (stage)"]) {
      const p = positionOf(byName(n));
      expect(p[0]).toBeGreaterThanOrEqual(0);
      expect(p[0]).toBeLessThanOrEqual(1080);
      expect(p[1]).toBeGreaterThanOrEqual(0);
      expect(p[1]).toBeLessThanOrEqual(1080);
    }
  });

  test("drift anchors keep grid base + offset keys (counter-phase)", () => {
    const hd = byName("anchor:heading-drift").transform!;
    const ld = byName("anchor:logo-drift").transform!;
    const hy = child(hd, "ADBE Position")!.keys!;
    const ly = child(ld, "ADBE Position")!.keys!;
    // Key times identical to the original rig.
    expect(hy.map((k) => k.t)).toEqual([3.875, 4.5, 15.5, 16.1666666666667]);
    expect(ly.map((k) => k.t)).toEqual(hy.map((k) => k.t));
    // Peak offsets relative to each anchor's own grid base:
    // heading +155 (down), logo -155 (up) — counter-phase.
    const ampH = (hy[1].v as number[])[1] - (hy[0].v as number[])[1];
    const ampL = (ly[1].v as number[])[1] - (ly[0].v as number[])[1];
    expect(ampH).toBeCloseTo(155, 5);
    expect(ampL).toBeCloseTo(-155, 5);
    // Bezier ease preserved.
    const speed = (e: unknown) => (e as { speed?: number } | undefined)?.speed;
    expect(speed(hy[0].outEase?.[0])).toBe(248);
    expect(speed(ly[0].outEase?.[0])).toBe(-248);
  });

  test("zones are disjoint and inside the rail; stage takes the right side", () => {
    const grid = createGrid(
      { columns: 12, rows: 12, margin: { x: 48, y: 48 }, gutter: { x: 16, y: 16 } },
      { width: 1080, height: 1080 },
    );
    const rail = grid.span([0, 0, 4, 11]);
    const stage = grid.span([5, 0, 11, 11]);
    const logo = grid.span([0, 3, 4, 6]);
    const copy = grid.span([0, 7, 4, 10]);
    const heading = grid.span([0, 11, 4, 11]);
    // Brand rail ~ material width; stage is the remainder.
    expect(rail.width).toBeGreaterThan(400);
    expect(rail.width).toBeLessThan(450);
    expect(stage.x).toBeGreaterThanOrEqual(rail.x + rail.width);
    expect(stage.x + stage.width).toBeLessThanOrEqual(1080);
    // Zones stack without overlap.
    const zones = [logo, copy, heading];
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i];
        const b = zones[j];
        const overlap =
          a.x < b.x + b.width && b.x < a.x + a.width &&
          a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap).toBe(false);
      }
    }
  });

  test("grid change re-flows unparented placements", () => {
    const base = positionOf(byName("description"));
    const wide = recompile((c) => {
      c.grid = { ...c.grid!, margin: { x: 80, y: 48 } };
    });
    const wideComp = wide.comps[0] as CompSpec;
    const moved = wideComp.layers.find((l) => l.name === "description")!;
    const p2 = positionOf(moved);
    expect(p2).not.toEqual(base);
    // And the drift anchor's comp-space base moved too (its rest key
    // carries base+offset, so a grid shift moves the whole trajectory).
    const restKey = (l: LayerSpec): number[] => {
      const k = child(l.transform!, "ADBE Position")!.keys![0].v as number[];
      return [k[0], k[1]];
    };
    const kBase = restKey(byName("anchor:heading-drift"));
    const kWide = restKey(wideComp.layers.find((l) => l.name === "anchor:heading-drift")!);
    expect(kWide).not.toEqual(kBase);
  });
});
