// 4-Layer Decoupled Rig for Restro PV (Issue #32):
//   L1 GridRef        -> logical 12x24 kg_LayoutGrid slots & safety zone (no hardcoded px)
//   L2 AnchorRig      -> 1:1 parent-child Mat4 tree (replaces AEP 12% / 833.33% coupling)
//   L3 LocalStageSpace-> scene-specific 3D camera, B lens 3x transform, C 3-layer viewport/strip/cell
//   L4 SemanticDeps   -> cross-axis causal invariants (left aperture, A2 safety clamp, B 660px slot, C dock playback)

import {
  mLookAt,
  mMultiply,
  mPerspective,
  mRotateX,
  mRotateY,
  mRotateZ,
  mScale,
  mScreenFromClip,
  mTranslation,
  transformPoint,
  type Mat4,
} from "../ae/mat4.ts";

// ---------------------------------------------------------------------------
// L1: GridRef (derived from 05-master.ts [187, 188] kg_LayoutGrid)
// ---------------------------------------------------------------------------
export interface GridSpec {
  readonly compWidth: number;
  readonly compHeight: number;
  readonly cols: number;
  readonly rows: number;
  readonly marginX: number;
  readonly marginY: number;
  readonly gutter: number;
}

export const MASTER_GRID: GridSpec = {
  compWidth: 1080,
  compHeight: 1080,
  cols: 12,
  rows: 24,
  marginX: 32,
  marginY: 80,
  gutter: 12,
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  right: number;
  bottom: number;
}

export class GridRef {
  readonly colW: number;
  readonly colPitch: number;
  readonly rowH: number;
  readonly rowPitch: number;

  constructor(readonly spec: GridSpec = MASTER_GRID) {
    this.colW = (spec.compWidth - 2 * spec.marginX - (spec.cols - 1) * spec.gutter) / spec.cols;
    this.colPitch = this.colW + spec.gutter;
    this.rowH = (spec.compHeight - 2 * spec.marginY - (spec.rows - 1) * spec.gutter) / spec.rows;
    this.rowPitch = this.rowH + spec.gutter;
  }

  colSpan(c0: number, c1Inclusive: number): { x: number; w: number; right: number } {
    const count = c1Inclusive - c0 + 1;
    const x = this.spec.marginX + c0 * this.colPitch;
    const w = count * this.colW + (count - 1) * this.spec.gutter;
    return { x, w, right: x + w };
  }

  rowSpan(r0: number, r1Inclusive: number): { y: number; h: number; bottom: number } {
    const count = r1Inclusive - r0 + 1;
    const y = this.spec.marginY + r0 * this.rowPitch;
    const h = count * this.rowH + (count - 1) * this.spec.gutter;
    return { y, h, bottom: y + h };
  }

  cellBox(c0: number, c1: number, r0: number, r1: number): Rect {
    const cx = this.colSpan(c0, c1);
    const ry = this.rowSpan(r0, r1);
    return { x: cx.x, y: ry.y, w: cx.w, h: ry.h, right: cx.right, bottom: ry.bottom };
  }

  /** Center of the 12x12 gutter junction before `colIndex` and before `rowIndex`. */
  gutterNode(colBefore: number, rowBefore: number): [number, number] {
    return [
      this.spec.marginX + colBefore * this.colPitch - this.spec.gutter / 2,
      this.spec.marginY + rowBefore * this.rowPitch - this.spec.gutter / 2,
    ];
  }

  /** Confirmed Issue #30 horizontal boundary: Col 0..4 left zone + gutter gap. */
  get safetyZone(): { leftColMaxX: number; gapLeft: number; stageMinX: number } {
    const leftRight = this.colSpan(0, 4).right;
    const gapLeft = leftRight + this.spec.gutter; // ~460.33
    const stageMinX = Math.ceil(gapLeft + 19.6); // 480
    return { leftColMaxX: leftRight, gapLeft, stageMinX };
  }
}

// ---------------------------------------------------------------------------
// L2: AnchorRig (Real 1:1 parent-child Mat4 tree evaluation)
// ---------------------------------------------------------------------------
export interface RigNodeDef {
  id: string;
  parentId?: string;
  is3D?: boolean;
  anchor?: [number, number, number];
  position: [number, number, number];
  scale?: [number, number, number];
  rotationDeg?: [number, number, number];
  bounds?: [number, number]; // local [width, height] if container/slot
  meta?: Record<string, unknown>;
}

export interface EvaluatedRigNode {
  def: RigNodeDef;
  localMatrix: Mat4;
  worldMatrix: Mat4;
  worldOrigin: [number, number, number];
  worldRect?: Rect; // valid for 2D planar slots
  projectedOrigin?: [number, number]; // screen-space projection when 3D
}

export function nodeLocalMatrix(def: RigNodeDef): Mat4 {
  const [ax, ay, az] = def.anchor ?? [0, 0, 0];
  const [px, py, pz] = def.position;
  const [sx, sy, sz] = def.scale ?? [1, 1, 1];
  const [rx, ry, rz] = def.rotationDeg ?? [0, 0, 0];

  let m = mTranslation(px, py, pz);
  if (rz !== 0) m = mMultiply(m, mRotateZ(rz));
  if (ry !== 0) m = mMultiply(m, mRotateY(ry));
  if (rx !== 0) m = mMultiply(m, mRotateX(rx));
  if (sx !== 1 || sy !== 1 || sz !== 1) m = mMultiply(m, mScale(sx, sy, sz));
  if (ax !== 0 || ay !== 0 || az !== 0) m = mMultiply(m, mTranslation(-ax, -ay, -az));
  return m;
}

export interface CameraSpec {
  eye: [number, number, number];
  fovDeg: number;
  width: number;
  height: number;
}

export const AE_DEFAULT_CAMERA: CameraSpec = {
  eye: [540, 540, -1500],
  fovDeg: 40,
  width: 1080,
  height: 1080,
};

export function cameraViewProjScreen(cam: CameraSpec = AE_DEFAULT_CAMERA): Mat4 {
  const view = mLookAt(cam.eye, [cam.width / 2, cam.height / 2, 0], [0, -1, 0]);
  const proj = mPerspective(cam.fovDeg, cam.width / cam.height, 1, 100000);
  const screen = mScreenFromClip(cam.width, cam.height);
  return mMultiply(screen, mMultiply(proj, view));
}

export function evaluateRigTree(
  defs: readonly RigNodeDef[],
  cam: CameraSpec = AE_DEFAULT_CAMERA,
): Map<string, EvaluatedRigNode> {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const vp = cameraViewProjScreen(cam);
  const out = new Map<string, EvaluatedRigNode>();

  function resolve(id: string): EvaluatedRigNode {
    const cached = out.get(id);
    if (cached) return cached;
    const def = byId.get(id);
    if (!def) throw new Error(`Unknown rig node: ${id}`);
    const localMatrix = nodeLocalMatrix(def);
    const parentEval = def.parentId ? resolve(def.parentId) : undefined;
    const worldMatrix = parentEval ? mMultiply(parentEval.worldMatrix, localMatrix) : localMatrix;
    const worldOrigin = transformPoint(worldMatrix, 0, 0, 0) as [number, number, number];
    const is3D = !!def.is3D || !!parentEval?.def.is3D;

    let worldRect: Rect | undefined;
    if (!is3D && def.bounds) {
      const [bw, bh] = def.bounds;
      const p0 = transformPoint(worldMatrix, 0, 0, 0);
      const p1 = transformPoint(worldMatrix, bw, bh, 0);
      worldRect = {
        x: Math.min(p0[0], p1[0]),
        y: Math.min(p0[1], p1[1]),
        w: Math.abs(p1[0] - p0[0]),
        h: Math.abs(p1[1] - p0[1]),
        right: Math.max(p0[0], p1[0]),
        bottom: Math.max(p0[1], p1[1]),
      };
    }

    let projectedOrigin: [number, number] | undefined;
    if (is3D) {
      const sp = transformPoint(vp, worldOrigin[0], worldOrigin[1], worldOrigin[2]);
      projectedOrigin = [sp[0], sp[1]];
    }

    const res: EvaluatedRigNode = { def, localMatrix, worldMatrix, worldOrigin, worldRect, projectedOrigin };
    out.set(id, res);
    return res;
  }

  for (const d of defs) resolve(d.id);
  return out;
}

// ---------------------------------------------------------------------------
// L4 + L3 Instantiation: Confirmed Left Chrome + Right Stage Rig Assembly
// ---------------------------------------------------------------------------
export interface LeftChromeParams {
  /** Normalized aperture [0=Title/End collapsed, 1=Explain opened (B..D)]. */
  openProgress: number;
  /** Vertical travel from closed Title state to opened Explain state (155px in master). */
  apertureShiftPx?: number;
}

/**
 * Derive exact 1:1 parent-child rig tree for left column Chrome from L1 GridRef + L4 SemanticDeps.
 * Reproduces 05-master.ts world rects:
 *   Logo:    y=435..695 (open=0) <-> y=280..540 (open=1)
 *   Heading: y=746..812 (open=0) <-> y=901..967 (open=1)
 *   Matte:   h=27 hidden (open=0) <-> y=546..883 h=337 (open=1)
 */
export function buildLeftChromeRig(
  grid: GridRef,
  params: LeftChromeParams,
): { nodes: Map<string, EvaluatedRigNode>; invariants: { logoHeadingGap: number; matteHeight: number; valid: boolean } } {
  const shift = params.apertureShiftPx ?? 155;
  const p = Math.max(0, Math.min(1, params.openProgress));
  const leftCol = grid.colSpan(0, 4); // x=32, w=416.33
  const rightSafe = leftCol.x + 6; // x=38 (05-master Ae/Logo/Heading snap edge = P1 + 12 = 38)
  const aeSpan = grid.rowSpan(3, 4); // y=196.5..262 -> P1 anchor top y=190

  const logoH = 260;
  const headingH = 66;
  // Base closed positions derived from grid Row 9..17 symmetry around comp center:
  // Title/End clusters Logo & Heading across vertical center (y~595..620)
  const closedLogoY = 435;
  const closedHeadingY = 746;

  // L4 SemanticDeps: Heading/Logo move inversely around center; matte opens inside clear margin
  const logoY = closedLogoY - shift * p;
  const headingY = closedHeadingY + shift * p;
  const logoBottom = logoY + logoH;
  const matteTop = logoBottom + 6; // 6px clearance below Logo bottom (540 -> 546)
  const matteBottom = headingY - 18; // 18px clearance above Heading top (901 -> 883)
  const matteH = Math.max(27, matteBottom - matteTop);

  const defs: RigNodeDef[] = [
    {
      id: "leftRoot",
      position: [leftCol.x, 0, 0],
      bounds: [leftCol.w, grid.spec.compHeight],
    },
    {
      id: "badgeGroup",
      parentId: "leftRoot",
      position: [rightSafe - leftCol.x, aeSpan.y - 9.2, 0], // x=38, y=187.3
      bounds: [92.7, 92.7],
    },
    {
      id: "pluginLabel",
      parentId: "badgeGroup",
      position: [134.3, 39.9, 0], // relative child next to Ae badge -> world (172.3, 227.2)
      bounds: [220, 60],
    },
    {
      id: "logoSlot",
      parentId: "leftRoot",
      position: [rightSafe - leftCol.x, logoY, 0], // relative child (1:1 scale!)
      bounds: [416, logoH],
    },
    {
      id: "descMatteSlot",
      parentId: "leftRoot",
      position: [0, matteTop, 0], // tracks Logo bottom + 6px directly via L4 dep!
      bounds: [Math.round(leftCol.w), matteH],
    },
    {
      id: "descTextSlot",
      parentId: "descMatteSlot",
      position: [0, 39 - matteTop + 546, 0], // static text container world y=585 inside moving matte!
      bounds: [Math.round(leftCol.w), 298],
    },
    {
      id: "headingSlot",
      parentId: "leftRoot",
      position: [rightSafe - leftCol.x, headingY, 0],
      bounds: [416, headingH],
    },
  ];

  const nodes = evaluateRigTree(defs);
  const gap = headingY - logoBottom;
  const valid =
    nodes.get("logoSlot")!.worldRect!.right <= grid.safetyZone.gapLeft &&
    nodes.get("headingSlot")!.worldRect!.right <= grid.safetyZone.gapLeft &&
    gap >= 51 - 1e-6 &&
    matteH >= 27;

  return { nodes, invariants: { logoHeadingGap: gap, matteHeight: matteH, valid } };
}

/** Smooth Left Chrome open curve extracted directly from 05-master.ts keyframe windows [3.875..4.50] and [15.50..16.167]. */
export function leftChromeOpenProgress(t: number): number {
  const ease = (u: number) => u * u * (3 - 2 * u);
  if (t < 3.875) return 0;
  if (t < 4.5) return ease((t - 3.875) / (4.5 - 3.875));
  if (t <= 15.5) return 1;
  if (t < 16.167) return 1 - ease((t - 15.5) / (16.167 - 15.5));
  return 0;
}

// ---------------------------------------------------------------------------
// Scene B Accordion + 300% Lens L2/L3/L4 Rig
// ---------------------------------------------------------------------------
export interface SceneBAccordionParams {
  /** Active step 0..3; fractional values animate transition continuously! */
  activeStep: number;
  tabHeight?: number;
  /** Zoom factor of lens relative to stroke canvas (3.0 = 300% in 05-master). */
  lensZoom?: number;
  /** Source focal point inside stroke comp (757, 422 in master). */
  lensFocalPoint?: [number, number];
  /** Magnifier display circle center (660, 810 in master). */
  lensDisplayCenter?: [number, number];
  /** Source sample circle diameter (140 -> display = source * zoom = 420). */
  lensSourceDiameter?: number;
}

export function buildSceneBAccordionRig(grid: GridRef, params: SceneBAccordionParams) {
  const col = grid.colSpan(6, 11); // x=546, w=502.08
  const row = grid.rowSpan(3, 22); // y=196.5..960.5 -> align to P15/23 band 191..967
  const bandTop = grid.gutterNode(6, 3)[1] + 1; // 191
  const bandBottom = grid.gutterNode(6, 23)[1] + 1; // 967 (height 776)
  const bandH = bandBottom - bandTop; // 776
  const tabH = params.tabHeight ?? 38.6667;
  const nSteps = 4;
  // L4 invariant: total height minus (nSteps - 1) closed tabs = 660px active work slot!
  const activeSlotH = bandH - (nSteps - 1) * tabH;

  // Fractional step interpolates each card smoothly through upper/lower stacks
  const s = Math.max(0, Math.min(nSteps - 1, params.activeStep));
  const defs: RigNodeDef[] = [
    {
      id: "bStage",
      position: [Math.round(col.x), bandTop, 0],
      bounds: [Math.round(col.w * 100) / 100, bandH],
    },
  ];

  for (let k = 0; k < nSteps; k++) {
    // When s >= k, step k belongs to TOP stack (top = bandTop + k * tabH).
    // When s < k, step k belongs to BOTTOM stack (top = bandTop + activeSlotH + (k - 1) * tabH).
    const blend = Math.max(0, Math.min(1, s - k + 1)); // smooth 0->1 when tab k-1 yields to k? Wait: step k drops DOWN when k > s
    // Exact monotonic switch: at integer s, k <= s -> top offset k*tabH; k > s -> top offset activeSlotH + (k-1)*tabH
    const topWeight = k === 0 ? 1 : Math.max(0, Math.min(1, s - (k - 1)));
    const localYTop = k * tabH;
    const localYBottom = activeSlotH + (k - 1) * tabH;
    const localY = localYTop * topWeight + localYBottom * (1 - topWeight);

    defs.push({
      id: `stepTab_${k}`,
      parentId: "bStage",
      position: [0, localY, 0],
      bounds: [Math.round(col.w * 100) / 100, tabH],
    });
    defs.push({
      id: `stepDivider_${k}`,
      parentId: `stepTab_${k}`,
      position: [0, 27, 0], // derived child: always +27px below tab top!
      bounds: [Math.round(col.w * 100) / 100, 1.5],
    });
  }

  // Active expanded slot starts at active top tab `s * tabH` (its header occupies first tabH; divider at +27px).
  const slotStartTop = s * tabH;
  defs.push({
    id: "bActiveSlot",
    parentId: "bStage",
    position: [0, slotStartTop, 0],
    bounds: [Math.round(col.w * 100) / 100, activeSlotH],
  });
  defs.push({
    id: "bActiveContent",
    parentId: "bActiveSlot",
    position: [0, tabH, 0],
    bounds: [Math.round(col.w * 100) / 100, activeSlotH - tabH],
  });

  // L3/L4 Lens magnification chain: LensDisplayDiameter = LensSourceDiameter * Zoom (derived!)
  const zoom = params.lensZoom ?? 3.0;
  const srcD = params.lensSourceDiameter ?? 140;
  const dispD = srcD * zoom; // 140 * 3.0 = 420
  const [fx, fy] = params.lensFocalPoint ?? [757, 422];
  const [dx, dy] = params.lensDisplayCenter ?? [660, 810];

  defs.push({
    id: "lensSource",
    position: [fx, fy, 0],
    anchor: [srcD / 2, srcD / 2, 0],
    bounds: [srcD, srcD],
  });
  defs.push({
    id: "lensDisplay",
    position: [dx, dy, 0],
    anchor: [dispD / 2, dispD / 2, 0],
    bounds: [dispD, dispD],
    meta: { zoom, focalPoint: [fx, fy] },
  });
  // Transform that renders master-space geometry INSIDE lensDisplay centered on focalPoint at `zoom`x:
  // p_screen = lensDisplayCenter + (p_comp - focalPoint) * zoom
  defs.push({
    id: "lensMagnifiedContent",
    parentId: "lensDisplay",
    anchor: [fx, fy, 0],
    position: [dispD / 2, dispD / 2, 0],
    scale: [zoom, zoom, 1],
  });

  const nodes = evaluateRigTree(defs);
  const topTab0 = nodes.get("stepTab_0")!.worldRect!;
  const actRect = nodes.get("bActiveSlot")!.worldRect!;
  return {
    nodes,
    invariants: {
      stageWidth: col.w,
      bandHeight: bandH,
      activeSlotHeight: actRect.h,
      tabHeight: tabH,
      lensSourceDiameter: srcD,
      lensDisplayDiameter: dispD,
      topTabClearOfSafety: topTab0.x >= grid.safetyZone.stageMinX,
      valid: Math.abs(actRect.h - 660) < 1 && Math.abs(dispD / srcD - zoom) < 1e-6,
    },
  };
}

// ---------------------------------------------------------------------------
// Scene C 3-Layer Showreel Rig (Viewport -> Strip -> 1:1 Work Cell)
// ---------------------------------------------------------------------------
export interface SceneCShowreelParams {
  /** Scroll offset in fractional cell indices [0.0 .. 2.0]. */
  stripIndex: number;
  /** Current normalized time speed of strip scroll (used by L4 dock lock). */
  stripVelocity?: number;
}

export function buildSceneCShowreelRig(grid: GridRef, params: SceneCShowreelParams) {
  const x0 = grid.safetyZone.stageMinX; // 480
  const vpW = grid.spec.compWidth - x0; // 600
  const vpY = 60;
  const vpH = grid.spec.compHeight - 2 * vpY; // 960
  const vel = Math.abs(params.stripVelocity ?? 0);
  const isDocked = vel < 0.08;

  const defs: RigNodeDef[] = [
    { id: "cViewport", position: [x0, vpY, 0], bounds: [vpW, vpH] },
    { id: "cStrip", parentId: "cViewport", position: [0, -params.stripIndex * vpH, 0], bounds: [vpW, vpH * 3] },
    { id: "cWork0", parentId: "cStrip", position: [0, 0, 0], scale: [1, 1, 1], bounds: [vpW, vpH] },
    { id: "cWork1", parentId: "cStrip", position: [0, vpH, 0], scale: [1, 1, 1], bounds: [vpW, vpH] },
    { id: "cWork2", parentId: "cStrip", position: [0, vpH * 2, 0], scale: [1, 1, 1], bounds: [vpW, vpH] },
  ];

  const nodes = evaluateRigTree(defs);
  const vp = nodes.get("cViewport")!.worldRect!;
  return {
    nodes,
    isDocked,
    invariants: {
      viewportWidth: vp.w,
      viewportHeight: vp.h,
      cellScale: 1.0, // legacy 55.56% shrink eliminated!
      viewportClearsSafety: vp.x >= grid.safetyZone.stageMinX,
      valid: vp.w === 600 && vp.h === 960 && vp.x >= grid.safetyZone.stageMinX,
    },
  };
}
