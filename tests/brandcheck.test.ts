// Contract tests for the Step-2-B brand verification comp
// (pv/scenes/brandcheck.ts): faithful reproduction of the legacy master's
// Heading + Logo block. These pin the ORIGINAL structure — the P-null rig,
// verbatim transforms, counter-phase Y keys, z-order — so the verification
// AEP cannot silently regress to invented layout values.

import { describe, expect, test } from "bun:test";
import { brandCheckSpec } from "../pv/scenes/brandcheck.ts";
import type { CompSpec, LayerSpec, PropNode } from "../pv/spec/types.ts";

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
  return Array.isArray(node?.value) ? (node.value as number[]) : undefined;
}

describe("brand-check faithful reproduction", () => {
  test("frame matches the original master; only brand material survives", () => {
    expect(spec.comps).toHaveLength(1);
    expect(comp.name).toBe("brand-check");
    expect(comp.width).toBe(1080);
    expect(comp.height).toBe(1080);
    expect(comp.frameRate).toBe(24);
    expect(comp.duration).toBe(20);
    expect(comp.bgColor).toEqual([1, 1, 1]);
    expect(spec.pruneMaterial?.keepComps.sort()).toEqual(["Heading", "Logo"]);
  });

  test("exactly the five reproduced layers, original names and kinds", () => {
    expect(comp.layers.map((l) => l.name)).toEqual([
      "Heading",
      "Logo",
      "P 9",
      "P-33",
      "P 5",
    ]);
    expect(byName("Heading").kind).toBe("comp");
    expect(byName("Heading").source).toBe("Heading");
    expect(byName("Logo").kind).toBe("comp");
    expect(byName("Logo").source).toBe("Logo");
    for (const n of ["P 9", "P-33", "P 5"]) {
      expect(byName(n).kind).toBe("null");
    }
  });

  test("parent chain matches the original rig", () => {
    const heading = byName("Heading");
    const logo = byName("Logo");
    const p9 = byName("P 9");
    const p33 = byName("P-33");
    const p5 = byName("P 5");
    expect(heading.parentIndex).toBe(p33.index);
    expect(p33.parentIndex).toBe(p9.index);
    expect(logo.parentIndex).toBe(p5.index);
    expect(p9.parentIndex).toBeUndefined();
    expect(p5.parentIndex).toBeUndefined();
    // Z-order: Heading above Logo (original idx 15 < 18).
    expect(heading.index).toBeLessThan(logo.index);
  });

  test("brand transforms are the verbatim dumped values", () => {
    const h = byName("Heading").transform!;
    expect(vec3(child(h, "ADBE Anchor Point"))).toEqual([0, 0, 0]);
    expect(vec3(child(h, "ADBE Position"))).toEqual([0, 0, 0]);
    expect(vec3(child(h, "ADBE Scale"))).toEqual([833.333333333333, 833.333333333333, 100]);
    const l = byName("Logo").transform!;
    expect(vec3(child(l, "ADBE Position"))).toEqual([100, 100, 0]);
    expect(vec3(child(l, "ADBE Scale"))).toEqual([833.333333333333, 833.333333333333, 100]);
    const p33 = byName("P-33").transform!;
    expect(vec3(child(p33, "ADBE Position"))).toEqual([100, 100, 0]);
    expect(vec3(child(p33, "ADBE Scale"))).toEqual([100, 100, 100]);
  });

  test("brand layers do not time-remap, matching the original master", () => {
    // Live AE read on legacy master: timeRemapEnabled=false on both layers.
    for (const n of ["Heading", "Logo"]) {
      const l = byName(n);
      expect(l.timeRemapEnabled).toBeFalsy();
      expect(l.timeRemap).toBeUndefined();
    }
  });

  test("rig nulls keep the 12% compressed coordinate system", () => {
    for (const n of ["P 9", "P 5"]) {
      const t = byName(n).transform!;
      expect(t.separatedPosition).toBe(true);
      expect(vec3(child(t, "ADBE Anchor Point"))).toEqual([50, 50, 0]);
      expect(child(t, "ADBE Position_0")?.value).toBe(26);
      expect(vec3(child(t, "ADBE Scale"))).toEqual([12, 12, 100]);
      expect(child(t, "ADBE Position")).toBeUndefined();
    }
  });

  test("counter-phase Y keys reproduce the 4s/16s rig move", () => {
    const y9 = child(byName("P 9").transform!, "ADBE Position_1")!;
    const y5 = child(byName("P 5").transform!, "ADBE Position_1")!;
    expect(y9.keys?.map((k) => [k.t, k.v])).toEqual([
      [3.875, 734],
      [4.5, 889],
      [15.5, 889],
      [16.1666666666667, 734],
    ]);
    expect(y5.keys?.map((k) => [k.t, k.v])).toEqual([
      [3.875, 423],
      [4.5, 268],
      [15.5, 268],
      [16.1666666666667, 423],
    ]);
    // Same key times on both nulls — the block moves as one counter-phase pair.
    expect(y9.keys?.map((k) => k.t)).toEqual(y5.keys?.map((k) => k.t));
    // Bezier easing preserved from the dump.
    const easeSpeed = (e: unknown) =>
      (e as { speed?: number } | undefined)?.speed;
    expect(easeSpeed(y9.keys?.[0]?.outEase?.[0])).toBe(248);
    expect(easeSpeed(y5.keys?.[0]?.outEase?.[0])).toBe(-248);
  });

  test("no grid, regions, authored text or invented anchors leaked in", () => {
    expect(comp.layers.every((l) => !l.name.startsWith("grid "))).toBe(true);
    expect(comp.layers.every((l) => l.kind !== "text")).toBe(true);
    expect(comp.layers.every((l) => !l.name.startsWith("anchor:"))).toBe(true);
    const json = JSON.stringify(comp.layers);
    expect(json).not.toContain("{{ref:");
    for (const l of comp.layers) {
      expect(l.sourceCompIndex).toBeUndefined();
    }
  });
});
