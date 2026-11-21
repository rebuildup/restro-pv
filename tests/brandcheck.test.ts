// Contract tests for the kg_LayoutGrid-driven brand verification comp
// (pv/scenes/brandcheck.ts): placement must come from the original
// 12x24 grid + named regions + anchor-relative motion — never from
// absolute coordinates — and pv/production/layoutCheck.ts must prove
// rest AND drifted display rects, with bleed/overlap declarations
// scoped to specific pairs and reasons.

import { describe, expect, test } from "bun:test";
import { brandCheckProject, brandCheckSpec } from "../pv/scenes/brandcheck.ts";
import { compileProduction } from "../pv/production/compile.ts";
import { createGrid } from "../pv/production/grid.ts";
import { checkProjectLayout } from "../pv/production/layoutCheck.ts";
import type { CompSpec, LayerSpec, PropNode, ProjectSpec } from "../pv/spec/types.ts";
import { materialCompsByName } from "../pv/scenes/production.ts";

const spec = brandCheckSpec();
const comp = spec.comps[0] as CompSpec;
// kg_LayoutGrid verified parameters (master / Adjustment Layer 5).
const GRID = { columns: 12, rows: 24, margin: { x: 32, y: 80 }, gutter: { x: 12, y: 12 } };
const FRAME = { width: 1080, height: 1080 };

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

describe("brand-check kg grid layout", () => {
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

  test("anchor bases land on the original grid intersections", () => {
    const grid = createGrid(GRID, FRAME);
    const restPos = (l: LayerSpec): number[] => {
      const k = child(l.transform!, "ADBE Position")!.keys![0].v as number[];
      return [k[0], k[1]];
    };
    // Original toComp measurements: Heading (32,740), Logo (32,429),
    // description top-left (32,585). Grid intersections are within 1px.
    const hd = restPos(byName("anchor:heading-drift"));
    const ld = restPos(byName("anchor:logo-drift"));
    const desc = positionOf(byName("description"));
    expect(hd[0]).toBeCloseTo(grid.columnX(0), 5);
    expect(hd[1]).toBeCloseTo(grid.rowY(17), 5);
    expect(hd[1]).toBeCloseTo(740, 0);
    expect(ld[0]).toBeCloseTo(grid.columnX(0), 5);
    expect(ld[1]).toBeCloseTo(grid.rowY(9), 5);
    expect(ld[1]).toBeCloseTo(429, 0);
    expect(desc[0]).toBeCloseTo(32, 5);
    expect(desc[1]).toBeCloseTo(585, 0);
  });

  test("parent wiring: brand layers ride their drift anchors at offset 0", () => {
    const heading = byName("Heading");
    const logo = byName("Logo");
    const hd = byName("anchor:heading-drift");
    const ld = byName("anchor:logo-drift");
    expect(heading.parentIndex).toBe(hd.index);
    expect(logo.parentIndex).toBe(ld.index);
    // Child layout targets equal the anchor bases -> parent-local pos 0,
    // so effective world pos == anchor pos (as in the original rig).
    expect(positionOf(heading)[0]).toBeCloseTo(0, 5);
    expect(positionOf(heading)[1]).toBeCloseTo(0, 5);
    expect(positionOf(logo)[0]).toBeCloseTo(0, 5);
    expect(positionOf(logo)[1]).toBeCloseTo(0, 5);
  });

  test("effective world transforms match the original rig composition", () => {
    // The original leaf scales (833%/330%) sat under 12% rig parents;
    // the authored metrics.scale is the EFFECTIVE world scale.
    for (const name of ["Heading", "Logo"]) {
      const l = byName(name);
      expect(vec3(child(l.transform!, "ADBE Scale"))).toEqual([100, 100, 100]);
      expect(vec3(child(l.transform!, "ADBE Anchor Point"))).toEqual([0, 0, 0]);
    }
    // Icon: 0.12 rig x 330% leaf = 39.6% effective, bottom-left anchor.
    const icon = byName("Icon (Ae)");
    expect(vec3(child(icon.transform!, "ADBE Scale"))).toEqual([39.6, 39.6, 100]);
    expect(vec3(child(icon.transform!, "ADBE Anchor Point"))).toEqual([0, 234, 0]);
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

  test("stage takes the right columns; brand rail is cols 0-4", () => {
    const grid = createGrid(GRID, FRAME);
    const rail = grid.span([0, 0, 4, 23]);
    const stage = grid.span([5, 0, 11, 23]);
    expect(rail.x).toBeCloseTo(32, 5);
    expect(rail.width).toBeGreaterThan(400);
    expect(rail.width).toBeLessThan(450);
    expect(stage.x).toBeGreaterThanOrEqual(rail.x + rail.width);
    expect(stage.x + stage.width).toBeLessThanOrEqual(1080);
  });

  test("grid change re-flows placements and keeps layout valid", () => {
    const base = positionOf(byName("description"));
    const wide = recompile((c) => {
      c.grid = { ...c.grid!, margin: { x: 40, y: 80 } };
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
    p.comps[0].grid = { ...p.comps[0].grid!, margin: { x: 40, y: 80 } };
    const report = checkProjectLayout(p);
    expect(report.violations).toEqual([]);
  });
});

describe("layoutCheck — swept-rect constraints", () => {
  test("authored brand-check project has zero violations", () => {
    const report = checkProjectLayout(brandCheckProject);
    expect(report.violations).toEqual([]);
    // Effective-scale elements fit the frame — nothing should be
    // reported as bleeding or unverified.
    expect(report.unverified).toEqual([]);
  });

  test("off-frame drift is rejected without a bleed declaration", () => {
    // Move the heading anchor to a low row: rest + 155px drift then
    // carries the display rect past the frame bottom.
    const p = structuredClone(brandCheckProject);
    const heading = p.comps[0].sections
      .flatMap((s) => s.layers)
      .find((l) => l.name === "Heading")!;
    heading.layout = { region: "zone-copy", align: "bottom-left" };
    const report = checkProjectLayout(p);
    expect(report.violations.some((v) => v.kind === "off-frame")).toBe(true);
  });

  test("undeclared rest overlap is rejected; scoped declaration passes", () => {
    const p = structuredClone(brandCheckProject);
    // Move description onto the icon band without a matching
    // declaration (its allowOverlap names only "Heading"/"Logo").
    const desc = p.comps[0].sections
      .flatMap((s) => s.layers)
      .find((l) => l.name === "description")!;
    desc.layout = { position: { x: 32, y: 200 } };
    const report = checkProjectLayout(p);
    expect(report.violations.some((v) => v.kind === "overlap")).toBe(true);
    // Declaring the overlap against the WRONG counterpart must not help.
    desc.allowOverlap = { reason: "wrong pair", with: ["Logo"] };
    expect(checkProjectLayout(p).violations.some((v) => v.kind === "overlap")).toBe(true);
    // Naming the actual counterparts suppresses exactly those pairs.
    desc.allowOverlap = { reason: "icon+logo band overlap", with: ["Icon (Ae)", "Logo"] };
    const ok = checkProjectLayout(p);
    expect(ok.violations.filter((v) => v.kind === "overlap")).toEqual([]);
    // Restoring the authored layout is clean again.
    expect(checkProjectLayout(brandCheckProject).violations).toEqual([]);
  });

  test("unresolvable parent is rejected", () => {
    const p = structuredClone(brandCheckProject);
    const heading = p.comps[0].sections
      .flatMap((s) => s.layers)
      .find((l) => l.name === "Heading")!;
    heading.parent = "no-such-anchor";
    const report = checkProjectLayout(p);
    expect(report.violations.some((v) => v.kind === "bad-parent")).toBe(true);
  });

  test("missing metrics are reported unverified, not skipped", () => {
    const p = structuredClone(brandCheckProject);
    const icon = p.comps[0].sections
      .flatMap((s) => s.layers)
      .find((l) => l.name === "Icon (Ae)")!;
    delete icon.metrics;
    const report = checkProjectLayout(p);
    expect(report.unverified.some((u) => u.layer === "Icon (Ae)")).toBe(true);
  });

  test("scaled parent transform is composed, not read from the leaf", () => {
    // A child under a 50%-scale anchor with local scale 2 has effective
    // scale 1 — lint must compute the same composition compile emits.
    const p = structuredClone(brandCheckProject);
    const c = p.comps[0];
    c.anchors = [
      ...(c.anchors ?? []),
      {
        id: "half",
        layout: { span: [0, 0, 0, 0], align: "top-left" },
        scale: 0.5,
      },
    ];
    const desc = c.sections
      .flatMap((s) => s.layers)
      .find((l) => l.name === "description")!;
    desc.parent = "half";
    desc.layout = { position: { x: 32, y: 400 } }; // world target: overlaps only logo
    desc.metrics = { ...desc.metrics!, scale: 2 };
    // Effective display = 416x298 at (32,400) — same as unscaled; the
    // overlap with the logo band stays declared and legal.
    const report = checkProjectLayout(p);
    expect(report.violations).toEqual([]);
  });
});
