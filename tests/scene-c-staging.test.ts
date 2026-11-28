// Scene C staging contract.
//
// The three gallery works must be three DIFFERENT pieces — different
// grounds, different compositions, different motion laws — and not three
// versions of one specimen sheet (a character centred on a flat ground with
// a caption underneath). The scene's finished form must also be readable:
// SPEC §5 C forbids showing the completed work for only a few frames.
//
// This file pins the staging decisions and the slot timings so a later
// change cannot quietly collapse the three works back into one staging
// idea, or squeeze the readable hold away again.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FIELD_WORK,
  type SceneCWork,
  SHEET_WORK,
  STAGE_WORK,
} from "../video/src/design/sceneCworks.ts";
import {
  SCENE_C_HOLDS,
  SCENE_C_SLOTS,
  sceneCWorkSources,
  WORK_SOURCES,
} from "../video/src/scenes/SceneC.tsx";

const WORKS: SceneCWork[] = [SHEET_WORK, STAGE_WORK, FIELD_WORK];

test("the three works are staged in three different grounds", () => {
  const grounds = WORKS.map((w) => w.ground);
  assert.deepEqual(grounds, ["sheet", "stage", "field"]);
  assert.equal(new Set(grounds).size, 3);
});

test("the three works obey three different motion laws", () => {
  const motions = WORKS.map((w) => w.motion);
  assert.deepEqual(motions, ["write", "separate", "drift"]);
  assert.equal(new Set(motions).size, 3);
});

test("the three works are composed differently, not as one centred character", () => {
  // each work's mass sits at its own anchor ...
  const anchors = WORKS.map((w) => w.anchor);
  assert.equal(new Set(anchors.map((a) => a.join(","))).size, 3);
  // ... and the cell is not symmetric about the vertical centre line
  // (a centred character on a flat ground is the specimen staging).
  for (const w of WORKS) {
    assert.ok(Math.abs(w.anchor[0] - 300) > 20, `${w.ground} is centred horizontally`);
  }
  // the three grounds also read at different values, so the strip is not
  // three copies of one background
  const bases = WORKS.map((w) => w.base);
  assert.equal(new Set(bases).size, 3);
});

test("each work's ground has its own structure and depth", () => {
  // the sheet lies on a desk and is photographed askew
  assert.ok(SHEET_WORK.base !== SHEET_WORK.titleInk);
  assert.equal(SHEET_WORK.titleInk, "#ece7db");
  // the stage is a dark room with a floor
  assert.equal(STAGE_WORK.base, "#0b0d12");
  // the field is an open dusk ground
  assert.equal(FIELD_WORK.base, "#121821");
});

test("the page-turn legs land on the 128 BPM beat grid", () => {
  const { beat, w1End, w2Start, w2End, w3Land } = SCENE_C_SLOTS;
  for (const t of [w1End, w2Start, w2End, w3Land]) {
    const beats = t / beat;
    assert.ok(Math.abs(beats - Math.round(beats)) < 1e-6, `${t}s is not on the ${beat}s beat grid`);
  }
  // the legs are ordered and each one is a whole beat long
  assert.ok(w1End < w2Start && w2Start < w2End && w2End < w3Land);
  assert.equal(w2Start - w1End, beat);
  assert.equal(w3Land - w2End, beat);
});

test("every work's finished form is held long enough to be read", () => {
  for (const [work, hold] of Object.entries(SCENE_C_HOLDS)) {
    assert.ok(hold >= 0.35, `${work} is only held for ${hold}s`);
  }
});

test("the scene opens on a page that is already being written", () => {
  // the writing starts before the cut, so the first frame is not a blank
  // sheet (SPEC §5 C)
  assert.ok(SCENE_C_SLOTS.writeStart < 0);
  // ... and it still finishes early enough to leave a readable hold
  assert.ok(SCENE_C_SLOTS.writeEnd < SCENE_C_SLOTS.w1End);
});

test("the strip falls back to two works and never to the brand Logo comp", () => {
  const withoutNewmat = sceneCWorkSources(
    (name) => name !== "NEWMAT 無 mincho" && name !== "NEWMAT 無",
  );
  assert.equal(withoutNewmat.length, 2);
  assert.deepEqual(
    withoutNewmat.map((w) => w.title),
    ["墨帖", "深解"],
  );
  for (const w of withoutNewmat) {
    assert.notEqual(w.comp, "Logo");
  }
  // the third work's real material is preferred when it is in the dump
  const withNewmat = sceneCWorkSources(
    (name) => name === "PV glyph" || name === "bunkai" || name === "NEWMAT 無 mincho",
  );
  assert.equal(withNewmat.length, 3);
  assert.equal(withNewmat[2].comp, "NEWMAT 無 mincho");
});

test("the work sources keep their real material", () => {
  assert.equal(WORK_SOURCES[0].comp, "PV glyph");
  assert.deepEqual(WORK_SOURCES[1].indices, [21, 36]);
  assert.equal(WORK_SOURCES[2].comp, "NEWMAT 無 mincho");
});
