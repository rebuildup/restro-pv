import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { STAGE_SCENES } from "../video/src/layout/Stage.tsx";

// Issue #30 layout contract — the confirmed common composition
// (background/grid, brand, left column, placement) is owned by
// video/src/layout and cannot be reached or overridden by right-stage
// scene content. These tests pin the structural guarantees; the pixel
// -level proof (PV-Master vs PV-Chrome diffs confined to stage content)
// is recorded in docs/issue30-recovery.md.

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

test("chrome layer never imports scene modules (scene-independent by construction)", () => {
  for (const f of ["video/src/layout/Chrome.tsx", "video/src/layout/LeftCopy.tsx", "video/src/layout/zones.ts"]) {
    const src = read(f);
    assert.ok(
      !/from\s+["'][^"']*scenes\//.test(src),
      `${f} must not import scene modules — chrome cannot depend on stage content`,
    );
  }
});

test("scenes do not author left-column copy (recovered anchor left:44)", () => {
  // The left information column is confirmed layout owned by
  // layout/LeftCopy.tsx + the dumped description comp. Scene components
  // own right-stage content only; the recovered left-copy anchor is
  // left:44 inside the x<460 column.
  for (const f of tsxFiles(join(VIDEO_SRC, "scenes"))) {
    const src = readFileSync(f, "utf8");
    assert.ok(
      !/left:\s*44\b/.test(src),
      `${f} authors left-column copy — move it to video/src/layout/LeftCopy.tsx`,
    );
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
