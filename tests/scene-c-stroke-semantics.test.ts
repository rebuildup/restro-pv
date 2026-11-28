// Scene C stroke semantics: the writing order of 筆 and the structural
// parts of 解 are DERIVED from the real dumped geometry, and the derivation
// is pinned here so a silent change of the dump cannot quietly make the
// on-screen "writing order" false again.
//
// 筆 is written in 12 strokes (竹 6 + 聿 6). The plugin returns 13 pieces,
// because it splits the 聿 横折 into its horizontal and the vertical it
// turns into. The AEP's own layer names (FUDE S01..S13) are an EXTRACTION
// index, not a writing order — 9 of the 13 disagree with the true order,
// so the scene must not use them for the draw-on.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compStrokes } from "../video/src/scenes/glyph.tsx";
import {
  deriveFudeRoles,
  splitKaiParts,
} from "../video/src/design/strokeSemantics.ts";

const FUDE = compStrokes("PV glyph", { pattern: /^FUDE S\d+/, poseT: 2 });

test("the plugin hands back the 13 pieces of 筆", () => {
  assert.equal(FUDE.strokes.length, 13);
});

test("derived writing order matches the true 12-stroke order of 筆", () => {
  const { roles } = deriveFudeRoles(FUDE.strokes);
  const byOrder = roles
    .map((r, i) => ({
      ...r,
      name: (/(FUDE S\d+)/.exec(FUDE.strokes[i].name) ?? [FUDE.strokes[i].name])[1],
    }))
    .sort((a, b) => a.order - b.order || a.step - b.step);

  // The true order, by the AEP piece that carries it.
  const expected = [
    "FUDE S01", // 1 撇   竹 left
    "FUDE S03", // 2 横   竹 left
    "FUDE S02", // 3 点   竹 left
    "FUDE S04", // 4 撇   竹 right
    "FUDE S06", // 5 横   竹 right
    "FUDE S05", // 6 点   竹 right
    "FUDE S07", // 7 横折 (horizontal)
    "FUDE S08", // 7 横折 (fold)
    "FUDE S09", // 8 横
    "FUDE S10", // 9 横
    "FUDE S11", // 10 横
    "FUDE S12", // 11 横
    "FUDE S13", // 12 丨   (last)
  ];
  assert.deepEqual(
    byOrder.map((r) => r.name),
    expected,
  );

  // The 横折 is one writing stroke delivered as two pieces.
  assert.equal(byOrder[6].order, byOrder[7].order);
  assert.equal(byOrder[6].order, 7);
  // The central vertical is written last.
  assert.equal(byOrder[byOrder.length - 1].order, 12);
  assert.equal(byOrder[byOrder.length - 1].role, "vertical");

  // The AEP's own numbering must NOT be the writing order — 9 of the 13
  // pieces disagree, so the scene must not use the layer names for the
  // draw-on.
  const aepIndexOrder = FUDE.strokes
    .map((s) => {
      const m = /S(\d+)/.exec(s.name);
      return m ? `FUDE S${m[1].padStart(2, "0")}` : s.name;
    })
    .sort();
  assert.notDeepEqual(
    byOrder.map((r) => r.name),
    aepIndexOrder,
  );
});

test("every derived stroke has a brush axis that travels the stroke", () => {
  const { roles } = deriveFudeRoles(FUDE.strokes);
  roles.forEach((r, i) => {
    assert.ok(r.length > 0, `${FUDE.strokes[i].name} has no brush axis`);
    const s = r.axis.start;
    const e = r.axis.end;
    assert.notDeepEqual([s[0], s[1]], [e[0], e[1]]);
    // the axis endpoints must lie inside the stroke's own bounding box
    const b = FUDE.strokes[i].bbox;
    for (const p of [s, e]) {
      assert.ok(p[0] >= b[0] - 1 && p[0] <= b[2] + 1);
      assert.ok(p[1] >= b[1] - 1 && p[1] <= b[3] + 1);
    }
  });
});

test("解 splits into 角 / 刀 / 牛 by the character's own layout", () => {
  const kai = compStrokes("bunkai", { indices: [21, 36], poseT: 3 });
  assert.equal(kai.strokes.length, 16);
  const parts = splitKaiParts(kai.strokes);
  assert.equal(parts.length, 3);
  assert.deepEqual(
    parts.map((p) => p.place),
    ["left", "upper-right", "lower-right"],
  );
  // every stroke belongs to exactly one part
  const all = parts.flatMap((p) => p.members).sort((a, b) => a - b);
  assert.deepEqual(all, Array.from({ length: 16 }, (_, i) => i));
});
