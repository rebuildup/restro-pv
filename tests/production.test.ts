// Contract tests for the production model compiler (pv/production/).
// Proves the ADR-0002 invariants without After Effects:
//   - grid changes re-flow section placements
//   - anchor changes propagate to followers (parent / $ref / {{ref:}})
//   - renames and layer additions cannot break stable-id references
//   - unresolvable references fail at compile time, never silently

import assert from "node:assert/strict";
import { test } from "node:test";
import { compileProduction, layerExpr, layerRef } from "../pv/production/compile.ts";
import { createGrid } from "../pv/production/grid.ts";
import type {
  CompProduction,
  ProductionProject,
  SectionLayerSpec,
} from "../pv/production/model.ts";
import type { CompSpec, LayerSpec, ProjectSpec, PropNode } from "../pv/spec/types.ts";

const FRAME = { width: 1080, height: 1080, frameRate: 24, duration: 20 };

function posOf(layer: LayerSpec): number[] {
  const t = layer.transform as PropNode;
  const p = (t.properties ?? []).find((c) => c.matchName === "ADBE Position");
  assert.ok(p, `layer ${layer.name} has no Position`);
  const v = p.value as unknown;
  // Anchor positions compile as {x,y,z} objects; layout positions as arrays.
  if (v !== null && typeof v === "object" && !Array.isArray(v) && "x" in v) {
    const o = v as { x: number; y: number; z?: number };
    return [o.x, o.y, o.z ?? 0];
  }
  return v as number[];
}

function propOf(layer: LayerSpec, matchName: string): PropNode | undefined {
  const walk = (n: PropNode | undefined): PropNode | undefined => {
    if (!n) return undefined;
    if (n.matchName === matchName) return n;
    for (const c of n.properties ?? []) {
      const r = walk(c);
      if (r) return r;
    }
    return undefined;
  };
  for (const k of ["transform", "masks", "effects", "shapes", "text"] as const) {
    const r = walk(layer[k] as PropNode | undefined);
    if (r) return r;
  }
  return undefined;
}

function layerControlValue(layer: LayerSpec): unknown {
  const fx = layer.effects as PropNode | undefined;
  const parade = fx?.properties ?? [];
  for (const effect of parade) {
    for (const p of effect.properties ?? []) {
      if (p.matchName === "ADBE Layer Control-0001") return p.value;
    }
  }
  return undefined;
}

function layerByName(comp: CompSpec, name: string): LayerSpec {
  const l = comp.layers.find((x) => x.name === name);
  assert.ok(l, `comp ${comp.name} missing layer ${name}`);
  return l;
}

function layerByIndex(comp: CompSpec, index: number): LayerSpec {
  const l = comp.layers.find((x) => x.index === index);
  assert.ok(l, `comp ${comp.name} missing layer index ${index}`);
  return l;
}

// A minimal two-comp project: an inner comp and a master comp that places
// it on a grid with anchors and tracked followers.
function demoProject(gridColumns = 4): ProductionProject {
  const inner: CompProduction = {
    id: "inner",
    name: "demo-inner",
    sections: [
      {
        id: "card",
        role: "stage",
        layers: [
          {
            id: "card/body",
            content: {
              kind: "spec",
              layer: {
                index: 0,
                name: "card-body",
                kind: "shape",
              },
            },
          },
        ],
      },
    ],
  };
  const master: CompProduction = {
    id: "master",
    name: "demo-master",
    grid: {
      columns: gridColumns,
      rows: 4,
      margin: { x: 40, y: 40 },
      gutter: { x: 20, y: 20 },
    },
    regions: {
      stage: { span: [1, 1, 2, 2] },
      brand: { rect: { x: 40, y: 40, width: 200, height: 100 } },
    },
    anchors: [
      { id: "rig.origin", at: { x: 100, y: 200, z: 0 } },
      { id: "rig.corner.tl", parent: "rig.origin", offset: { x: -50, y: -50, z: 0 } },
    ],
    sections: [
      {
        id: "stage",
        role: "stage",
        layers: [
          {
            id: "stage/screen",
            content: { kind: "comp", comp: "inner" },
            layout: { region: "stage", align: "center" },
          },
        ],
      },
      {
        id: "brand",
        role: "brand",
        layers: [
          {
            id: "brand/mark",
            name: "brand-mark",
            content: {
              kind: "spec",
              layer: { index: 0, name: "", kind: "null" },
            },
            layout: { region: "brand", align: "top-left" },
            parent: "rig.origin",
          },
          {
            id: "brand/tracked",
            name: "brand-tracked",
            content: {
              kind: "spec",
              layer: {
                index: 0,
                name: "",
                kind: "null",
                effects: {
                  name: "Effects",
                  matchName: "ADBE Effect Parade",
                  properties: [
                    {
                      name: "Corner TL",
                      matchName: "ADBE Layer Control",
                      properties: [
                        {
                          name: "Layer",
                          matchName: "ADBE Layer Control-0001",
                          value: layerRef("rig.corner.tl"),
                        },
                      ],
                    },
                  ],
                },
                transform: {
                  name: "Transform",
                  matchName: "ADBE Transform Group",
                  properties: [
                    {
                      name: "Position",
                      matchName: "ADBE Position",
                      expression: layerExpr("rig.corner.tr") + ".transform.position",
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      {
        id: "scaffold",
        role: "guide",
        enabled: false,
        layers: [
          {
            content: { kind: "material-comp", comp: "PV showreel" },
            timing: { inPoint: 4, outPoint: 4 },
          },
        ],
      },
    ],
  };
  // rig.corner.tr is declared in the brand section's anchors to prove
  // section-scoped anchors merge into the comp table.
  master.sections[1].anchors = [{ id: "rig.corner.tr", at: { x: 300, y: 300, z: 0 } }];
  return {
    name: "demo",
    frame: FRAME,
    comps: [inner, master],
    assets: [{ id: "grid-bg", kind: "solid", color: [0.1, 0.1, 0.1], width: 1080, height: 1080 }],
  };
}

function masterOf(spec: ProjectSpec): CompSpec {
  const m = spec.comps.find((c) => c.name === "demo-master");
  assert.ok(m);
  return m;
}

test("grid: cells, spans and lattice points derive from GridSpec", () => {
  const g = createGrid(
    { columns: 4, rows: 2, margin: { x: 40, y: 20 }, gutter: { x: 20, y: 10 } },
    { width: 1080, height: 480 },
  );
  // innerW = 1080-80-60=940 -> cellW 235; innerH = 480-40-10=430 -> cellH 215
  assert.equal(g.cellWidth, 235);
  assert.equal(g.cellHeight, 215);
  assert.deepEqual(g.cell(0, 0), { x: 40, y: 20, width: 235, height: 215 });
  assert.deepEqual(g.cell(3, 1), { x: 40 + 3 * 255, y: 20 + 225, width: 235, height: 215 });
  // span cols1..2 rows0..0: x=columnX(1)=295, w=columnX(3)-columnX(1)=510;
  // y=20, h=rowY(1)-rowY(0)=225 (cellH 215 + gutter 10)
  assert.deepEqual(g.span([1, 0, 2, 0]), { x: 295, y: 20, width: 510, height: 225 });
  // far-edge lines resolve to the inner content edge
  assert.equal(g.columnX(4), 1040);
  assert.equal(g.rowY(2), 460);
  assert.deepEqual(g.point(4, 2), { x: 1040, y: 460 });
  assert.throws(() => g.cell(4, 0), /cell column/);
  assert.throws(() => g.span([2, 0, 1, 0]), /inverted/);
});

test("grid change re-flows section placement", () => {
  const narrow = compileProduction(demoProject(4));
  const wide = compileProduction(demoProject(8));
  const mN = masterOf(narrow);
  const mW = masterOf(wide);
  const stageN = mN.layers.find((l) => l.name === "stage/screen")!;
  const stageW = mW.layers.find((l) => l.name === "stage/screen")!;
  assert.ok(stageN && stageW);
  assert.notDeepEqual(posOf(stageN), posOf(stageW), "8-column grid must move the stage");
});

test("layout: region/rect/align compute anchor positions", () => {
  const spec = compileProduction(demoProject(4));
  const m = masterOf(spec);
  // brand region rect {40,40,200,100}, align top-left -> anchor lands at (40,40)
  const mark = layerByName(m, "brand-mark");
  assert.deepEqual(posOf(mark), [40, 40, 0]);
  // stage region span [1,1,2,2] on 4x4 grid, margin 40, gutter 20:
  // cellW=cellH=235; span x=295,y=295,w=510,h=510 -> center (550,550)
  const screen = layerByName(m, "stage/screen");
  assert.deepEqual(posOf(screen), [550, 550, 0]);
  assert.equal(screen.sourceCompIndex, 0);
  assert.equal(screen.kind, "comp");
});

test("anchors: parent/offset hierarchy and stable-id followers", () => {
  const spec = compileProduction(demoProject(4));
  const m = masterOf(spec);
  const origin = layerByName(m, "anchor:rig.origin");
  const cornerTl = layerByName(m, "anchor:rig.corner.tl");
  const cornerTr = layerByName(m, "anchor:rig.corner.tr");
  // anchors are nulls, shy, emitted after content layers
  assert.equal(origin.kind, "null");
  assert.equal(origin.shy, true);
  assert.deepEqual(posOf(origin), [100, 200, 0]);
  assert.deepEqual(posOf(cornerTl), [-50, -50, 0]); // parent-space offset
  // corner.tl parents to origin -> parentIndex = origin's AE index
  assert.equal(cornerTl.parentIndex, origin.index);
  // brand-mark parents to rig.origin
  const mark = layerByName(m, "brand-mark");
  assert.equal(mark.parentIndex, origin.index);
  // Layer Control "Layer" param resolved from {$ref} marker to the AE index
  // of rig.corner.tl (the expression below tracks rig.corner.tr instead)
  const tracked = layerByName(m, "brand-tracked");
  assert.equal(layerControlValue(tracked), cornerTl.index);
  // {{ref:}} expression placeholder resolved to thisComp.layer(index)
  const expr = propOf(tracked, "ADBE Position")?.expression;
  assert.ok(expr);
  assert.ok(expr.includes(`thisComp.layer(${cornerTr.index})`), expr);
  assert.ok(!expr.includes("{{ref:"), expr);
});

test("references survive renames, reordering and layer additions", () => {
  const base = compileProduction(demoProject(4));
  const mutated = demoProject(4);
  // rename display names and add unrelated sections/layers
  mutated.comps[1].sections[0].layers[0].name = "renamed-screen";
  mutated.comps[1].sections.push({
    id: "extra",
    role: "overlay",
    layers: [
      { content: { kind: "material-comp", comp: "unused-scaffold" } },
      { content: { kind: "spec", layer: { index: 0, name: "", kind: "null" } } },
    ],
  });
  const spec2 = compileProduction(mutated);
  const m1 = masterOf(base);
  const m2 = masterOf(spec2);
  const tr1 = layerByName(m1, "anchor:rig.corner.tr").index;
  const tr2 = layerByName(m2, "anchor:rig.corner.tr").index;
  const tl1 = layerByName(m1, "anchor:rig.corner.tl").index;
  const tl2 = layerByName(m2, "anchor:rig.corner.tl").index;
  const tracked2 = layerByName(m2, "brand-tracked");
  assert.equal(layerControlValue(tracked2), tl2);
  assert.notEqual(tl1, tl2, "added layers must shift indices — refs still resolve");
  // parentIndex still points at the same anchor, not a stale number
  assert.equal(
    layerByName(m2, "brand-mark").parentIndex,
    layerByName(m2, "anchor:rig.origin").index,
  );
});

test("timing, enabled sections and asset footage compile through", () => {
  const spec = compileProduction(demoProject(4));
  const m = masterOf(spec);
  // single-layer section defaults its AE name to the section id
  const scaffold = m.layers.find((l) => l.name === "scaffold")!;
  assert.equal(scaffold.enabled, false);
  assert.equal(scaffold.inPoint, 4);
  assert.equal(scaffold.outPoint, 4);
  assert.equal(scaffold.source, "PV showreel");
  // asset declared but unused -> not imported
  assert.deepEqual(spec.footage, []);
});

test("used assets become footage entries in first-use order", () => {
  const p = demoProject(4);
  p.comps[1].sections[0].layers.push({
    id: "stage/bg",
    content: { kind: "footage", asset: "grid-bg" },
    layout: { position: { x: 540, y: 540 } },
  });
  const spec = compileProduction(p);
  assert.equal(spec.footage?.length, 1);
  assert.equal(spec.footage?.[0].kind, "solid");
  const bg = masterOf(spec).layers.find((l) => l.name === "stage/bg")!;
  assert.equal(bg.kind, "footage");
  assert.equal(bg.source, "grid-bg");
});

test("unresolvable references fail at compile time", () => {
  const badComp = demoProject(4);
  badComp.comps[1].sections[0].layers[0].content = { kind: "comp", comp: "nope" };
  assert.throws(() => compileProduction(badComp), /unknown comp id "nope"/);

  const badAnchor = demoProject(4);
  badAnchor.comps[1].sections[0].layers[0].parent = "missing.anchor";
  assert.throws(() => compileProduction(badAnchor), /unknown parent "missing.anchor"/);

  const badAsset = demoProject(4);
  badAsset.comps[1].sections[0].layers[0].content = { kind: "footage", asset: "nope" };
  assert.throws(() => compileProduction(badAsset), /unknown asset id "nope"/);

  const badRegion = demoProject(4);
  badRegion.comps[1].sections[0].layers[0].layout = { region: "nope" };
  assert.throws(() => compileProduction(badRegion), /unknown layout region "nope"/);

  const dup = demoProject(4);
  dup.comps[1]!.anchors!.push({ id: "rig.origin", at: { x: 0, y: 0, z: 0 } });
  assert.throws(() => compileProduction(dup), /duplicate ref id "rig.origin"/);

  const badRef = demoProject(4);
  // point the Layer Control at a nonexistent id
  const fxLayer = badRef.comps[1].sections[1].layers[1];
  const fx = (fxLayer.content as { layer: LayerSpec }).layer;
  const fxProps = (fx.effects as PropNode).properties![0].properties![0];
  fxProps.value = layerRef("missing.node");
  assert.throws(() => compileProduction(badRef), /unresolved layer ref "missing.node"/);
});

test("material-layer clones from provided dumps and strips stale identity", () => {
  const material: CompSpec = {
    name: "PV showreel",
    width: 1080,
    height: 1080,
    duration: 1,
    frameRate: 24,
    layers: [
      {
        index: 7,
        name: "inner-null",
        kind: "null",
        parentIndex: 3,
        transform: {
          name: "Transform",
          matchName: "ADBE Transform Group",
          properties: [{ name: "Position", matchName: "ADBE Position", value: [10, 20, 0] }],
        },
      },
    ],
  };
  const p = demoProject(4);
  p.comps[1].sections[0].layers.push({
    id: "stage/cloned",
    content: { kind: "material-layer", comp: "PV showreel", layer: "inner-null" },
    layout: { position: { x: 500, y: 500 } },
  });
  const spec = compileProduction(p, { materialComps: { "PV showreel": material } });
  const cloned = masterOf(spec).layers.find((l) => l.name === "stage/cloned")!;
  assert.equal(cloned.kind, "null");
  assert.equal(cloned.parentIndex, undefined);
  assert.deepEqual(posOf(cloned), [500, 500, 0]);
  assert.throws(() => compileProduction(p), /material comp "PV showreel" not provided/);
});
