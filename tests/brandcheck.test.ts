// Contract tests for the grid-driven brand verification comp
// (pv/scenes/brandcheck.ts): placement must come from GridSpec + named
// regions + anchor-relative motion — never from absolute coordinates —
// and pv/production/layoutCheck.ts must prove rest AND drifted display
// rects stay inside the frame.

import { describe, expect, test } from "bun:test";
import { brandCheckProject, brandCheckSpec } from "../pv/scenes/brandcheck.ts";
import { compileProduction } from "../pv/production/compile.ts";
import { createGrid } from "../pv/production/grid.ts";
import { checkProjectLayout } from "../pv/production/layoutCheck.ts";
import type { CompSpec, LayerSpec, PropNode, ProjectSpec } from "../pv/spec/types.ts";
import { materialCompsByName } from "../pv/scenes/production.ts";

const spec = brandCheckSpec();
const comp = spec.comps[0] as CompSpec;
const GRID = { columns: 12, rows: 16, margin: { x: 48, y: 48 }, gutter: { x: 16, y: 16 } };

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
  test("frame matches the master; brand materials + assets survive", () => {
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
    // White ground is a real layer, not only the comp background.
    expect(comp.layers.map((l) => l.name)).toContain("bg-white");
  });

  test("all required sections exist and come from layout, not absolute coords", () => {
    const names = comp.layers.map((l) => l.name);
    for (const n of [
      "description",
      "Heading",
      "Logo",
      "Icon (Ae)",
      "Main (stage)",
      "bg-white",
    ]) {
      expect(names).toContain(n);
    }
    expect(names).toContain("anchor:heading-drift");
    expect(names).toContain("anchor:logo-drift");
    expect(byName("anchor:heading-drift").kind).toBe("null");
    expect(byName("anchor:heading-drift").shy).toBe(true);
    // Debug grid guides must never leak into the comp.
    expect(names.filter((n) => /guide|grid/i.test(n))).toEqual([]);
  });

  test("parent wiring: brand layers ride their drift anchors", () => {
    const heading = byName("Heading");
    const logo = byName("Logo");
    const hd = byName("anchor:heading-drift");
    const ld = byName("anchor:logo-drift");
    expect(heading.parentIndex).toBe(hd.index);
    expect(logo.parentIndex).toBe(ld.index);
    const grid = createGrid(GRID, { width: 1080, height: 1080 });
    const restPos = (l: LayerSpec): number[] => {
      const k = child(l.transform!, "ADBE Position")!.keys![0].v as number[];
      return [k[0], k[1]];
    };
    const headingTarget = grid.span([0, 12, 4, 15]); // top-left
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
  });

  test("drift anchors keep grid base + offset keys (counter-phase)", () => {
    const hd = byName("anchor:heading-drift").transform!;
    const ld = byName("anchor:logo-drift").transform!;
    const hy = child(hd, "ADBE Position")!.keys!;
    const ly = child(ld, "ADBE Position")!.keys!;
    expect(hy.map((k) => k.t)).toEqual([3.875, 4.5, 15.5, 16.1666666666667]);
    expect(ly.map((k) => k.t)).toEqual(hy.map((k) => k.t));
    const ampH = (hy[1].v as number[])[1] - (hy[0].v as number[])[1];
    const ampL = (ly[1].v as number[])[1] - (ly[0].v as number[])[1];
    expect(ampH).toBeCloseTo(155, 5);
    expect(ampL).toBeCloseTo(-155, 5);
    const speed = (e: unknown) => (e as { speed?: number } | undefined)?.speed;
    expect(speed(hy[0].outEase?.[0])).toBe(248);
    expect(speed(ly[0].outEase?.[0])).toBe(-248);
  });

  test("zones are disjoint and inside the rail; stage takes the right side", () => {
    const grid = createGrid(GRID, { width: 1080, height: 1080 });
    const rail = grid.span([0, 0, 4, 15]);
    const stage = grid.span([5, 0, 11, 15]);
    const icon = grid.span([0, 0, 4, 2]);
    const logo = grid.span([0, 3, 4, 6]);
    const copy = grid.span([0, 7, 4, 11]);
    const heading = grid.span([0, 12, 4, 15]);
    expect(rail.width).toBeGreaterThan(400);
    expect(rail.width).toBeLessThan(450);
    expect(stage.x).toBeGreaterThanOrEqual(rail.x + rail.width);
    expect(stage.x + stage.width).toBeLessThanOrEqual(1080);
    const zones = [icon, logo, copy, heading];
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

  test("icon scale comes from metrics, not a patch transform", () => {
    const icon = byName("Icon (Ae)");
    const scale = child(icon.transform!, "ADBE Scale");
    expect(vec3(scale)).toEqual([70, 70, 100]);
  });

  test("grid change re-flows placements and keeps layout valid", () => {
    const base = positionOf(byName("description"));
    const wide = recompile((c) => {
      c.grid = { ...c.grid!, margin: { x: 40, y: 48 } };
    });
    const wideComp = wide.comps[0] as CompSpec;
    const moved = wideComp.layers.find((l) => l.name === "description")!;
    expect(positionOf(moved)).not.toEqual(base);
    // The drift trajectory moves with the grid too.
    const restKey = (l: LayerSpec): number[] => {
      const k = child(l.transform!, "ADBE Position")!.keys![0].v as number[];
      return [k[0], k[1]];
    };
    const kBase = restKey(byName("anchor:heading-drift"));
    const kWide = restKey(wideComp.layers.find((l) => l.name === "anchor:heading-drift")!);
    expect(kWide).not.toEqual(kBase);
    // And the re-flowed layout still satisfies every constraint.
    const p = structuredClone(brandCheckProject);
    p.comps[0].grid = { ...p.comps[0].grid!, margin: { x: 40, y: 48 } };
    expect(checkProjectLayout(p)).toEqual([]);
  });
});

describe("layoutCheck — swept-rect constraints", () => {
  test("authored brand-check project has zero violations", () => {
    expect(checkProjectLayout(brandCheckProject)).toEqual([]);
  });

  test("reproduces the off-frame bug: bottom-row zone + drift is rejected", () => {
    // The pre-fix layout put zone-heading on the last row; the +155px
    // drift then carried the display rect past the frame bottom.
    const p = structuredClone(brandCheckProject);
    p.comps[0].regions!["zone-heading"] = { span: [0, 15, 4, 15] };
    const violations = checkProjectLayout(p);
    const offFrame = violations.filter((v) => v.kind === "off-frame");
    expect(offFrame.length).toBeGreaterThan(0);
    expect(offFrame.some((v) => v.layer.includes("Heading"))).toBe(true);
  });

  test("undeclared rest overlap is rejected; declared overlap passes", () => {
    const p = structuredClone(brandCheckProject);
    // Move description up into the icon zone without declaring overlap
    // (logo's allowOverlap only covers the logo<->copy pair, so the
    // icon<->description collision must still be reported).
    const desc = p.comps[0].sections
      .flatMap((s) => s.layers)
      .find((l) => l.name === "description")!;
    desc.layout = { region: "zone-icon", align: "top-left" };
    const violations = checkProjectLayout(p);
    expect(violations.some((v) => v.kind === "overlap")).toBe(true);
    // Restoring the authored layout is clean again.
    expect(checkProjectLayout(brandCheckProject)).toEqual([]);
  });

  test("unresolvable parent is rejected", () => {
    const p = structuredClone(brandCheckProject);
    const heading = p.comps[0].sections
      .flatMap((s) => s.layers)
      .find((l) => l.name === "Heading")!;
    heading.parent = "no-such-anchor";
    const violations = checkProjectLayout(p);
    expect(violations.some((v) => v.kind === "bad-parent")).toBe(true);
  });
});
