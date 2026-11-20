import assert from "node:assert/strict";
import { test } from "node:test";
import { pvProjectSpec } from "../pv/scenes/master.ts";
import { risingHeroRects } from "../pv/production/scene-layout.ts";
import { lintProductionProject } from "../pv/production/project-lint.ts";
import type { ProjectSpec, LayerSpec } from "../pv/model/types.ts";

test("the master and three authored scenes form an exact 480-frame timeline", () => {
  const spec = pvProjectSpec();
  assert.equal(spec.organizeProject, true);
  assert.deepEqual(spec.comps.map((comp) => comp.name), ["Scene C", "Scene D", "Scene E", "PV master"]);
  assert.equal(spec.comps.at(-1)?.duration, 20);
  assert.deepEqual(lintProductionProject(spec), []);
  const master = spec.comps[3];
  const visual = master.layers.filter((layer) => layer.kind === "comp");
  assert.deepEqual(visual.map((layer) => layer.source), ["Scene E", "Scene D", "Scene C", "master"]);
  assert.deepEqual(visual.map((layer) => [
    Math.round((layer.inPoint ?? 0) * 24),
    Math.round((layer.outPoint ?? 0) * 24),
  ]), [[371, 480], [281, 371], [191, 281], [0, 191]]);
  assert.ok(spec.comps.every((comp) => comp.layers.every((layer) => layer.kind !== "null")));
});

test("C/D/E main content progresses towards upper right with actual transform", () => {
  const spec = pvProjectSpec();
  const positions = spec.comps.slice(0, 3).map((comp) => {
    const main = comp.layers.find((layer) => layer.name.endsWith(" / main"));
    assert.ok(main?.transform);
    const p = main.transform.properties?.find((node) => node.matchName === "ADBE Position");
    return p?.value as number[];
  });
  assert.deepEqual(risingHeroRects(3, 700, 700).map(({ x, y, width, height }) => [
    x + width / 2, y + height / 2,
  ]), positions.map(([x, y]) => [x, y]));
  assert.ok(positions[0][0] < positions[1][0]);
  assert.ok(positions[0][1] > positions[1][1]);
});

test("a dangling null or an invalid AE expression is a hard lint error", () => {
  const base = pvProjectSpec();
  const spec = structuredClone(base);
  const master = spec.comps[3];
  const orphan: LayerSpec = {
    index: master.layers.length + 1,
    name: "Orphan control",
    kind: "null",
    role: "rig",
    label: 6,
    inPoint: 0,
    outPoint: 20,
  };
  master.layers.push(orphan);
  assert.ok(lintProductionProject(spec).some((issue) => issue.code === "UNUSED_NULL"));
  master.layers.pop();

  const text = spec.comps[0].layers.find((layer) => layer.kind === "text");
  assert.ok(text);
  text.text?.properties?.push({
    name: "Broken",
    matchName: "ADBE Text Animator",
    expression: "(() =>",
  });
  assert.ok(lintProductionProject(spec).some((issue) => issue.code === "EXPRESSION_SYNTAX"));
});

test("invalid trims and missing references are build blockers", () => {
  const spec: ProjectSpec = structuredClone(pvProjectSpec());
  const master = spec.comps[3];
  const first = master.layers.find((layer) => layer.kind === "comp");
  assert.ok(first);
  first.outPoint = 999;
  first.sourceCompIndex = 99;
  first.label = 0;
  const codes = lintProductionProject(spec).map((item) => item.code);
  assert.ok(codes.includes("TRIM"));
  assert.ok(codes.includes("SOURCE"));
  assert.ok(codes.includes("UNLABELED"));
});
