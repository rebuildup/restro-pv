// Source-of-truth geometry and timing for TS-authored scene sections.
// Rectangles are conservative visual envelopes, NOT AE comp dimensions.
export type SectionRole = "heading" | "description" | "icon" | "main" | "overlay";

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Section {
  id: string;
  role: SectionRole;
  rect: FrameRect;
  fromFrame: number;
  toFrame: number; // exclusive
  mainOrder?: number;
}

export interface IntendedOverlap {
  a: string;
  b: string;
  reason: string;
}

export interface SceneLayout {
  id: string;
  fromFrame: number;
  toFrame: number;
  sections: readonly Section[];
  intendedOverlaps?: readonly IntendedOverlap[];
}

export interface LayoutIssue {
  scene: string;
  code: string;
  detail: string;
}

// All values are in output pixels at 1080x1080. No hidden AE coordinate offsets.
export const PV_GRID = {
  width: 1080,
  height: 1080,
  fps: 24,
  margin: 48,
  gutter: 24,
  top: { x: 48, y: 48, width: 984, height: 216 },
  main: { x: 48, y: 292, width: 984, height: 740 },
} as const;

function inside(inner: FrameRect, outer: FrameRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function intersects(a: FrameRect, b: FrameRect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function sharedFrame(a: Section, b: Section): boolean {
  return Math.max(a.fromFrame, b.fromFrame) < Math.min(a.toFrame, b.toFrame);
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("\u0000");
}

// Evenly spaced horizontal slots form a rising baseline from left/bottom to
// right/top. Callers own the number/size of actual visual elements.
export function ascendingMainSlots(count: number, height: number): FrameRect[] {
  const region = PV_GRID.main;
  if (!Number.isInteger(count) || count < 1 || count > 8) {
    throw new Error("main slot count must be between 1 and 8");
  }
  if (!Number.isFinite(height) || height <= 0 || height > region.height) {
    throw new Error("main slot height must fit inside the main region");
  }
  const width = (region.width - (count - 1) * PV_GRID.gutter) / count;
  if (width <= 0) throw new Error("main slots cannot fit horizontally");
  return Array.from({ length: count }, (_, order) => ({
    x: region.x + order * (width + PV_GRID.gutter),
    y: region.y + (region.height - height) * (count === 1 ? 0.5 : 1 - order / (count - 1)),
    width,
    height,
  }));
}

// Strict by default: overlapping content is invalid unless a named pair has
// a specific compositing reason. An unused exception also fails the gate.
export function lintSceneLayouts(scenes: readonly SceneLayout[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const report = (scene: string, code: string, detail: string): void => {
    issues.push({ scene, code, detail });
  };
  const sceneIds = new Set<string>();
  for (const scene of scenes) {
    if (!scene.id || sceneIds.has(scene.id)) report(scene.id, "SCENE_ID", "scene ids must be unique");
    sceneIds.add(scene.id);
    if (
      !Number.isInteger(scene.fromFrame) ||
      !Number.isInteger(scene.toFrame) ||
      scene.fromFrame < 0 ||
      scene.toFrame > PV_GRID.fps * 20 ||
      scene.toFrame <= scene.fromFrame
    ) {
      report(scene.id, "SCENE_TIME", "invalid scene interval");
    }
    const sections = new Map<string, Section>();
    for (const s of scene.sections) {
      if (!s.id || sections.has(s.id)) report(scene.id, "SECTION_ID", "duplicate/empty section id " + s.id);
      sections.set(s.id, s);
      if (
        !Number.isInteger(s.fromFrame) ||
        !Number.isInteger(s.toFrame) ||
        s.fromFrame < scene.fromFrame ||
        s.toFrame > scene.toFrame ||
        s.toFrame <= s.fromFrame
      ) report(scene.id, "TRIM", "invalid active interval " + s.id);
      if (
        ![s.rect.x, s.rect.y, s.rect.width, s.rect.height].every(Number.isFinite) ||
        s.rect.width <= 0 ||
        s.rect.height <= 0 ||
        !inside(s.rect, { x: 0, y: 0, width: PV_GRID.width, height: PV_GRID.height })
      ) report(scene.id, "BOUNDS", "invalid/offscreen rect " + s.id);
      const region = s.role === "main" ? PV_GRID.main : PV_GRID.top;
      if (s.role !== "overlay" && !inside(s.rect, region)) {
        report(scene.id, "REGION", s.id + " is outside its " + s.role + " region");
      }
    }
    const allowed = new Map<string, string>();
    for (const o of scene.intendedOverlaps ?? []) {
      const key = pairKey(o.a, o.b);
      if (
        o.a === o.b || !sections.has(o.a) || !sections.has(o.b) ||
        !o.reason.trim() || allowed.has(key)
      ) report(scene.id, "OVERLAP_ALLOWANCE", "invalid or duplicate allowance " + o.a + "/" + o.b);
      else allowed.set(key, o.reason);
    }
    const seenOverlaps = new Set<string>();
    for (let i = 0; i < scene.sections.length; i++) {
      const a = scene.sections[i];
      for (let j = i + 1; j < scene.sections.length; j++) {
        const b = scene.sections[j];
        if (!sharedFrame(a, b) || !intersects(a.rect, b.rect)) continue;
        const key = pairKey(a.id, b.id);
        seenOverlaps.add(key);
        if (!allowed.has(key)) report(scene.id, "OVERLAP", a.id + " intersects " + b.id);
      }
    }
    for (const key of allowed.keys()) {
      if (!seenOverlaps.has(key)) report(scene.id, "STALE_ALLOWANCE", "unnecessary overlap allowance: " + key.replace("\u0000", "/"));
    }
    const main = scene.sections.filter((s) => s.role === "main" && s.mainOrder !== undefined);
    main.sort((a, b) => (a.mainOrder ?? 0) - (b.mainOrder ?? 0));
    for (let i = 1; i < main.length; i++) {
      const a = main[i - 1], b = main[i];
      if (
        a.mainOrder === b.mainOrder ||
        a.rect.x + a.rect.width > b.rect.x ||
        a.rect.y <= b.rect.y
      ) report(scene.id, "ASCENDING_MAIN", a.id + " -> " + b.id + " is not right-rising");
    }
  }
  return issues;
}

export function assertSceneLayouts(scenes: readonly SceneLayout[]): void {
  const failures = lintSceneLayouts(scenes);
  if (failures.length) {
    throw new Error(failures.map((x) => x.scene + ": " + x.code + ": " + x.detail).join("\n"));
  }
}
