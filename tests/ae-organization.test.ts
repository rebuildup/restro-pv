import assert from "node:assert/strict";
import { test } from "node:test";
import { ROLE_LABELS, classifyLayer, foldDivider, withFoldGroups } from "../pv/production/ae-organization.ts";
import type { LayerSpec } from "../pv/model/types.ts";
import { AE_RUNTIME } from "../pv/runtime/aeRuntime.ts";

test("FoldLayers metadata is real FD-0/FD-H identity, not a name-only group", () => {
  const divider = foldDivider("content", 1, 20);
  assert.equal(divider.kind, "shape");
  assert.equal(divider.foldDivider?.folded, false);
  assert.equal(divider.enabled, false);
  assert.ok(AE_RUNTIME.includes('state.name = desc.folded ? "FD-1" : "FD-0"'));
  assert.ok(AE_RUNTIME.includes('"FD-H:" + desc.hierarchy'));
});

test("group dividers preserve stack z-order and remap parent/LayerControl", () => {
  const stack: LayerSpec[] = [
    {
      index: 1,
      kind: "comp",
      name: "Main",
      source: "Source",
      parentIndex: 3,
      effects: {
        name: "Effects", matchName: "ADBE Effect Parade",
        properties: [{ name: "Corner", matchName: "ADBE Layer Control-0001", value: 3 }],
      },
    },
    { index: 2, kind: "null", name: "Unused" },
    { index: 3, kind: "null", name: "Tracker" },
  ];
  const actual = withFoldGroups(stack, 20);
  assert.deepEqual(actual.map((l) => l.name), [
    "▾ 01 MAIN CONTENT", "Main", "▾ 02 TRACKING RIG", "Unused", "Tracker",
  ]);
  assert.equal(actual[1].parentIndex, 5);
  assert.equal(actual[1].effects?.properties?.[0].value, 5);
  assert.equal(actual[1].label, ROLE_LABELS.content);
  assert.equal(actual[4].label, ROLE_LABELS.rig);
  assert.equal(stack[0].parentIndex, 3, "original model must not be mutated");
});

test("role classification uses content responsibility", () => {
  assert.equal(classifyLayer({ index: 1, kind: "null", name: "Control" }), "rig");
  assert.equal(classifyLayer({ index: 2, kind: "text", name: "Heading" }), "information");
  assert.equal(classifyLayer({ index: 3, kind: "footage", name: "sound.wav" }), "audio");
  assert.equal(classifyLayer({ index: 4, kind: "footage", name: "grid-solid" }), "background");
});

test("missing parent and Layer Control are contract errors", () => {
  assert.throws(() => withFoldGroups([
    { index: 1, kind: "text", name: "A", parentIndex: 100 },
  ], 10), /missing old index/);
  assert.throws(() => withFoldGroups([
    {
      index: 1, kind: "text", name: "A",
      effects: { name: "Effect", matchName: "ADBE Effect Parade", properties: [
        { name: "Layer", matchName: "ADBE Layer Control-0001", value: 999 },
      ] },
    },
  ], 10), /missing old index/);
});
