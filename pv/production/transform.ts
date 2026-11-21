// 2D affine transform composition for AE-style parent-child chains.
//
// AE semantics (verified against the legacy master dumps):
//   - A layer's local transform maps layer-space point c to parent space:
//       L(c) = pos + R(rot) * S(scale) * (c - anchor)
//     i.e. affine A = R*S, translation t = pos - A*anchor, so L(c)=A*c+t
//     and the anchor point itself lands exactly on `pos`.
//   - A child's Position/Anchor/Scale are expressed in the parent's
//     layer coordinate system; the world transform is
//       W_l = W_parent ∘ L_l   (parent applied after child-local)
//   - Equivalently, for a child position q in parent space:
//       worldAnchorPos = W_parent(q)
//   - World scale/rotation compose by matrix multiplication — a 12% rig
//     null above an 833% brand comp yields ~100% effective scale. This is
//     why effective transforms must be computed through the WHOLE chain,
//     never by reading the leaf scale alone.
//
// Used by BOTH compile.ts (world layout target -> parent-local position)
// and layoutCheck.ts (world display rects / motion envelopes), so the
// authored model and the lint share one transform model.

export interface Vec2 {
  x: number;
  y: number;
}

/** Affine map: p' = { a*x + c*y + tx, b*x + d*y + ty }. */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export const AFFINE_IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export function affineApply(m: Affine, p: Vec2): Vec2 {
  return { x: m.a * p.x + m.c * p.y + m.tx, y: m.b * p.x + m.d * p.y + m.ty };
}

/** Linear part only (drops translation) — for direction/delta vectors. */
export function affineLinear(m: Affine, v: Vec2): Vec2 {
  return { x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y };
}

/** parent ∘ child: apply child first, then parent. */
export function affineMultiply(parent: Affine, child: Affine): Affine {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty,
  };
}

export function affineInvert(m: Affine): Affine {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) throw new Error("affineInvert: singular matrix");
  const ia = m.d / det;
  const ib = -m.b / det;
  const ic = -m.c / det;
  const id = m.a / det;
  return {
    a: ia,
    b: ib,
    c: ic,
    d: id,
    tx: -(ia * m.tx + ic * m.ty),
    ty: -(ib * m.tx + id * m.ty),
  };
}

export interface TRS {
  /** Anchor point in layer (source-comp) coordinates. */
  anchor: Vec2;
  /** Position in parent space — where the anchor lands. */
  position: Vec2;
  /** Rotation in degrees (AE convention, clockwise positive). */
  rotation?: number;
}

const DEG = Math.PI / 180;

/**
 * Local transform L(c) = pos + R(rot)·S(scale)·(c − anchor).
 * `scale` accepts a uniform fraction or per-axis pair (default 1).
 */
export function localAffine(
  t: TRS & { scale?: number | { x: number; y: number } },
): Affine {
  const s =
    t.scale === undefined
      ? { x: 1, y: 1 }
      : typeof t.scale === "number"
        ? { x: t.scale, y: t.scale }
        : t.scale;
  const rad = (t.rotation ?? 0) * DEG;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // A = R * S
  const a = cos * s.x;
  const b = sin * s.x;
  const c = -sin * s.y;
  const d = cos * s.y;
  // t_vec = pos - A*anchor
  return {
    a,
    b,
    c,
    d,
    tx: t.position.x - (a * t.anchor.x + c * t.anchor.y),
    ty: t.position.y - (b * t.anchor.x + d * t.anchor.y),
  };
}
