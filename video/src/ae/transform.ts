import type { LayerSpec, PropNode } from "../../../pv/model/types.ts";
import { child, evalNum, evalProp, evalVec } from "./eval.ts";
import {
  mIdentity,
  mMultiply,
  mRotateX,
  mRotateY,
  mRotateZ,
  mScale,
  mTranslation,
  type Mat4,
} from "./mat4.ts";

export interface LayerTransform {
  anchor: number[]; // 3
  position: number[]; // 3
  scale: number[]; // 3, 1.0 = 100%
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  opacity: number; // 0..1
  separatedPosition: boolean;
}

function propOf(t: PropNode | undefined, matchName: string): PropNode | undefined {
  return child(t, matchName);
}

export function layerTransform(layer: LayerSpec, t: number): LayerTransform {
  const tr = layer.transform;
  const ectx = { layerName: layer.name };
  const anchor = evalVec(propOf(tr, "ADBE Anchor Point"), t, 3, ectx);
  while (anchor.length < 3) anchor.push(0);

  let position = evalVec(propOf(tr, "ADBE Position"), t, 3, ectx);
  let separated = false;
  if (position.length === 0) {
    separated = true;
    position = [
      evalNum(propOf(tr, "ADBE Position_0"), t),
      evalNum(propOf(tr, "ADBE Position_1"), t),
      evalNum(propOf(tr, "ADBE Position_2"), t),
    ];
  }
  while (position.length < 3) position.push(0);

  const scaleRaw = evalVec(propOf(tr, "ADBE Scale"), t, 3);
  const scale = [0, 1, 2].map((i) => {
    const v = scaleRaw[i];
    return typeof v === "number" ? v / 100 : 1;
  });

  // Orientation (euler XYZ) and Rotate X/Y/Z are alternative parametrizations
  // of the same rotation; use whichever carries non-default values.
  const orient = evalVec(propOf(tr, "ADBE Orientation"), t, 3);
  const rx = evalNum(propOf(tr, "ADBE Rotate X"), t);
  const ry = evalNum(propOf(tr, "ADBE Rotate Y"), t);
  const rz = evalNum(propOf(tr, "ADBE Rotate Z"), t);
  let rotateX = rx;
  let rotateY = ry;
  let rotateZ = rz;
  if (orient.length >= 3 && (orient[0] || orient[1] || orient[2])) {
    rotateX = orient[0] ?? 0;
    rotateY = orient[1] ?? 0;
    rotateZ = orient[2] ?? 0;
  }

  const opacity = evalNum(propOf(tr, "ADBE Opacity"), t, 100) / 100;

  return { anchor, position, scale, rotateX, rotateY, rotateZ, opacity, separatedPosition: separated };
}

function localMatrix4(tr: LayerTransform, parentAnchor: number[] | null): Mat4 {
  // Child position is relative to the parent's anchor point: the child's
  // anchor lands at parentAnchor + childPosition in parent layer space.
  const tx = parentAnchor ? parentAnchor[0] + tr.position[0] : tr.position[0];
  const ty = parentAnchor ? parentAnchor[1] + tr.position[1] : tr.position[1];
  const tz = parentAnchor ? (parentAnchor[2] ?? 0) + tr.position[2] : tr.position[2];
  let m = mTranslation(tx, ty, tz);
  m = mMultiply(m, mRotateZ(tr.rotateZ));
  m = mMultiply(m, mRotateY(tr.rotateY));
  m = mMultiply(m, mRotateX(tr.rotateX));
  m = mMultiply(m, mScale(tr.scale[0], tr.scale[1], tr.scale[2] ?? 1));
  m = mMultiply(m, mTranslation(-tr.anchor[0], -tr.anchor[1], -(tr.anchor[2] ?? 0)));
  return m;
}

export interface WorldTransform {
  matrix: Mat4; // layer space -> comp space (z included)
  opacity: number; // accumulated? no — per-layer only
  is3D: boolean;
}

function is3DLayer(layer: LayerSpec, tr: LayerTransform): boolean {
  if (layer.threeDLayer) return true;
  if ((tr.position[2] ?? 0) !== 0) return true;
  if (tr.rotateX !== 0 || tr.rotateY !== 0) return true;
  return false;
}

// Compute the layer->comp matrix by walking the parent chain. Layers are
// looked up by AE index within the same comp.
export function worldMatrix(
  layer: LayerSpec,
  layers: LayerSpec[],
  t: number,
  cache?: Map<number, WorldTransform>,
): WorldTransform {
  const cached = cache?.get(layer.index);
  if (cached) return cached;

  const tr = layerTransform(layer, t);
  const parent = layer.parentIndex ? layers.find((l) => l.index === layer.parentIndex) : undefined;

  let m: Mat4;
  let is3D = is3DLayer(layer, tr);
  if (parent) {
    const pw = worldMatrix(parent, layers, t, cache);
    const ptr = layerTransform(parent, t);
    m = mMultiply(pw.matrix, localMatrix4(tr, ptr.anchor));
    is3D = is3D || pw.is3D;
  } else {
    m = localMatrix4(tr, null);
  }

  const out = { matrix: m, opacity: tr.opacity, is3D };
  cache?.set(layer.index, out);
  return out;
}

export { mIdentity };
export type { Mat4 };
