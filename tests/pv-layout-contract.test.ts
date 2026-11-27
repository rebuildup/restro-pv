import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  BACKGROUND_MASTER_LAYERS,
  chromeBaseCtx,
  chromeBgCtx,
  chromeOverlayCtx,
  PROTECTED_MASTER_LAYERS,
} from "../video/src/layout/Chrome.tsx";
import { STAGE_SCENES } from "../video/src/layout/Stage.tsx";

// Issue #30 layout contract — the confirmed common composition
// (background/grid, brand, left column, placement) is owned by
// video/src/layout and cannot be reached or overridden by right-stage
// scene content. Protection is compositing order: PvLeftGuard repaints
// the confirmed background inside the left column and PvChromeOverlay
// repaints the protected chrome layers LAST, above the stage. These
// tests pin the structural guarantees behaviorally (layerFilter
// semantics, mount order, registry); the pixel-level proof is
// tools/verify-layout.ts + docs/issue30-recovery.md.

const ROOT = join(import.meta.dirname, "..");
const VIDEO_SRC = join(ROOT, "video", "src");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const tsxFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? tsxFiles(join(dir, e.name))
      : e.name.endsWith(".tsx") || e.name.endsWith(".ts")
        ? [join(dir, e.name)]
        : [],
  );

// Minimal stand-ins for the CompSpec/LayerSpec shapes layerFilter sees.
const master = { name: "master" } as never;
const otherComp = { name: "description" } as never;
const layer = (index: number) => ({ index }) as never;

test("stage registry: windows are valid and inside the 20s comp", () => {
  assert.ok(STAGE_SCENES.length >= 5, "expected the recovered A2-E scenes");
  const ids = new Set<string>();
  for (const s of STAGE_SCENES) {
    assert.ok(!ids.has(s.id), `duplicate scene id ${s.id}`);
    ids.add(s.id);
    assert.ok(s.window[0] < s.window[1], `${s.id}: empty window`);
    assert.ok(s.window[0] >= 0 && s.window[1] <= 20, `${s.id}: window outside 0-20s`);
    assert.equal(typeof s.Component, "function", `${s.id}: not a component`);
  }
});

test("protected set covers description column + brand lockup + matte source", () => {
  // Recovered master indices: description=10, Heading=15,
  // AFTER EFFECTS PLUGIN=16, Ae.png=17, Logo=18, matte source=8.
  for (const i of [8, 10, 15, 16, 17, 18]) {
    assert.ok(PROTECTED_MASTER_LAYERS.has(i), `protected set missing layer ${i}`);
  }
});

test("overlay ctx renders ONLY protected master layers; scenes cannot reach them", () => {
  const f = chromeOverlayCtx.layerFilter;
  assert.ok(f, "overlay ctx has no layerFilter");
  for (const i of PROTECTED_MASTER_LAYERS) {
    assert.equal(f(master, layer(i), 10), true, `overlay drops protected layer ${i}`);
  }
  for (const i of [1, 11, 13, 14, 100, 232, 257]) {
    assert.equal(f(master, layer(i), 10), false, `overlay leaks stage layer ${i}`);
  }
  // Nested comps inside a kept layer still render fully.
  assert.equal(f(otherComp, layer(1), 10), true);
});

test("base ctx excludes protected layers but keeps stage + window filters", () => {
  const f = chromeBaseCtx.layerFilter;
  assert.ok(f, "base ctx has no layerFilter");
  for (const i of PROTECTED_MASTER_LAYERS) {
    assert.equal(f(master, layer(i), 10), false, `base renders protected layer ${i}`);
  }
  // A normal stage layer (not protected, not in any hide window) renders in base.
  assert.equal(f(master, layer(100), 2.0), true);
  // B-window hidden layer is filtered by the recovered window table.
  assert.equal(f(master, layer(166), 5.0), false);
  assert.equal(f(otherComp, layer(1), 10), true);
});

test("left-guard ctx renders ONLY the confirmed background layers", () => {
  const f = chromeBgCtx.layerFilter;
  assert.ok(f, "bg ctx has no layerFilter");
  for (const i of BACKGROUND_MASTER_LAYERS) {
    assert.equal(f(master, layer(i), 10), true, `guard drops background layer ${i}`);
  }
  for (const i of [8, 10, 15, 18, 100, 232, 357]) {
    assert.equal(f(master, layer(i), 10), false, `guard leaks non-background layer ${i}`);
  }
  assert.equal(f(otherComp, layer(1), 10), true);
});

test("background set excludes matte-only and disabled siblings", () => {
  for (const i of [187, 255, 256, 259, 263, 264, 265, 266, 267]) {
    assert.ok(!BACKGROUND_MASTER_LAYERS.has(i), `background set wrongly includes ${i}`);
  }
});

test("official entry composites guard + overlay AFTER the stage", () => {
  const src = read("video/src/PvVideo.tsx");
  const baseAt = src.indexOf("<PvChromeBase");
  const stageAt = src.indexOf("<PvStage");
  const guardAt = src.indexOf("<PvLeftGuard");
  const overlayAt = src.indexOf("<PvChromeOverlay");
  assert.ok(
    baseAt >= 0 && stageAt > baseAt && guardAt > stageAt && overlayAt > guardAt,
    "PvVideo must render base -> stage -> leftGuard -> overlay in that order",
  );
});

test("chrome layer never imports scene modules (scene-independent by construction)", () => {
  for (const f of [
    "video/src/layout/Chrome.tsx",
    "video/src/layout/LeftCopy.tsx",
    "video/src/layout/zones.ts",
  ]) {
    const src = read(f);
    assert.ok(
      !/from\s+["'][^"']*scenes\//.test(src),
      `${f} must not import scene modules — chrome cannot depend on stage content`,
    );
  }
});

test("recovered left-column copy is not duplicated back into scenes", () => {
  // The D/E left lines live only in layout/LeftCopy.tsx. If a scene
  // reintroduces them, the copy would double-render under the overlay.
  for (const f of tsxFiles(join(VIDEO_SRC, "scenes"))) {
    // Strip comments so references in prose don't count as duplication.
    const src = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    assert.ok(!src.includes("そのまま動かせる。"), `${f} duplicates recovered D copy`);
    assert.ok(!src.includes("輪郭から筆画へ。"), `${f} duplicates recovered E copy`);
  }
});

test("rejected pv-full series is not reachable from production code", () => {
  for (const f of tsxFiles(VIDEO_SRC)) {
    if (f.includes(`${join("rejected", "pv-full")}`)) continue;
    const src = readFileSync(f, "utf8");
    assert.ok(
      !/from\s+["'][^"']*(rejected\/|film\/PvFull|ProtoHook)/.test(src),
      `${f} imports the rejected pv-full series`,
    );
  }
});

test("official entry registers PV-Master and no rejected compositions", () => {
  const src = read("video/src/Root.tsx");
  assert.ok(src.includes('id="PV-Master"'), "PV-Master must be registered");
  assert.ok(!src.includes("PV-Full"), "rejected PV-Full comp must not be registered");
  assert.ok(!src.includes("Proto-Hook"), "rejected ProtoHook comps must not be registered");
});

test("left-column copy lives in the chrome layer for both authored scenes", () => {
  const src = read("video/src/layout/LeftCopy.tsx");
  // Scene D copy + Scene E closing line, recovered verbatim.
  assert.ok(src.includes("そのまま動かせる。"), "missing recovered D left copy");
  assert.ok(src.includes("輪郭から筆画へ。"), "missing recovered E left copy");
  assert.ok(src.includes("分解した筆画がレイヤーとして動く"), "missing D sub-line");
});
