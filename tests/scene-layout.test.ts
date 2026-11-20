import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PV_GRID,
  ascendingMainSlots,
  lintSceneLayouts,
  type SceneLayout,
} from "../pv/production/scene-layout.ts";

function example(): SceneLayout {
  const main = ascendingMainSlots(3, 320);
  return {
    id: "examples",
    fromFrame: 191,
    toFrame: 281,
    sections: [
      { id: "heading", role: "heading", rect: { x: 48, y: 48, width: 480, height: 70 }, fromFrame: 191, toFrame: 281 },
      { id: "description", role: "description", rect: { x: 48, y: 135, width: 560, height: 85 }, fromFrame: 191, toFrame: 281 },
      { id: "icon", role: "icon", rect: { x: 890, y: 48, width: 130, height: 130 }, fromFrame: 191, toFrame: 281 },
      ...main.map((rect, i) => ({
        id: "work-" + i,
        role: "main" as const,
        rect,
        mainOrder: i,
        fromFrame: 191,
        toFrame: 281,
      })),
    ],
  };
}

test("ascending main is contained and increases right/up", () => {
  const slots = ascendingMainSlots(3, 320);
  assert.equal(slots.length, 3);
  assert.ok(slots[0].x < slots[1].x && slots[1].x < slots[2].x);
  assert.ok(slots[0].y > slots[1].y && slots[1].y > slots[2].y);
  assert.ok(slots[2].y >= PV_GRID.main.y);
  assert.deepEqual(lintSceneLayouts([example()]), []);
});

test("spatial collision is a lint failure", () => {
  const scene = example();
  const sections = scene.sections.map((s) => ({ ...s, rect: { ...s.rect } }));
  sections[1].rect = { ...sections[0].rect };
  const codes = lintSceneLayouts([{ ...scene, sections }]).map((x) => x.code);
  assert.ok(codes.includes("OVERLAP"));
});

test("same area at nonoverlapping times is allowed", () => {
  const scene = example();
  const sections = scene.sections.map((s) => ({ ...s, rect: { ...s.rect } }));
  sections[1].rect = { ...sections[0].rect };
  sections[0].toFrame = 220;
  sections[1].fromFrame = 220;
  assert.deepEqual(lintSceneLayouts([{ ...scene, sections }]), []);
});

test("overlap is allowed only with a specific active rationale", () => {
  const scene = example();
  const sections = scene.sections.map((s) => ({ ...s, rect: { ...s.rect } }));
  sections[1].rect = { ...sections[0].rect };
  const approved = { ...scene, sections, intendedOverlaps: [{ a: "description", b: "heading", reason: "crossfade while copy changes" }] };
  assert.deepEqual(lintSceneLayouts([approved]), []);
  sections[1].rect = { x: 48, y: 135, width: 560, height: 85 };
  assert.ok(lintSceneLayouts([approved]).some((x) => x.code === "STALE_ALLOWANCE"));
});

test("trim, main direction and out-of-bounds errors are rejected", () => {
  const scene = example();
  const sections = scene.sections.map((s) => ({ ...s, rect: { ...s.rect } }));
  sections[0].toFrame = 500;
  sections[3].rect.y = 290; // makes main direction inverted
  sections[5].rect.x = 2000;
  const codes = lintSceneLayouts([{ ...scene, sections }]).map((x) => x.code);
  assert.ok(codes.includes("TRIM"));
  assert.ok(codes.includes("ASCENDING_MAIN"));
  assert.ok(codes.includes("BOUNDS"));
});
