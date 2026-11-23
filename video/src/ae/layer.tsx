import React from "react";
import type { CompSpec, FootageSpec, LayerSpec, PropNode } from "../../../pv/model/types.ts";
import { child, children, evalProp } from "./eval.ts";
import { VectorShapes } from "./shapes.tsx";
import { LayerEffects } from "./effects.tsx";
import { TextLayer } from "./text.tsx";
import { compByIndex, footageByName } from "./project.ts";
import { cssMatrix3d, mIdentity, mMultiply, mScreenFromClip, mLookAt, mPerspective, type Mat4 } from "./mat4.ts";
import { worldMatrix, layerTransform } from "./transform.ts";
import { staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video, Audio, Img } from "remotion";

export interface RenderCtx {
  comps: CompSpec[];
  footage: FootageSpec[];
  camera: { fov: number; distance: number };
  matteMap: Map<number, number>; // layer.index -> matte layer.index (within comp)
}

// ---- camera -----------------------------------------------------------------
// AE renders 3D layers with an implicit default camera when the comp has none.
// Approximation: pinhole at comp center, `distance` px along -z, `fov` degrees.
export function cameraMatrices(comp: CompSpec, camera: RenderCtx["camera"]): { view: Mat4; proj: Mat4; screen: Mat4 } {
  const cx = comp.width / 2;
  const cy = comp.height / 2;
  const eye: [number, number, number] = [cx, cy, -camera.distance];
  const view = mLookAt(eye, [cx, cy, 0], [0, -1, 0]);
  const proj = mPerspective(camera.fov, comp.width / comp.height, 1, 100000);
  const screen = mScreenFromClip(comp.width, comp.height);
  return { view, proj, screen };
}

function layerScreenMatrix(
  comp: CompSpec,
  layers: LayerSpec[],
  layer: LayerSpec,
  t: number,
  cam: RenderCtx["camera"],
): { css: string; opacity: number; is3D: boolean } {
  const cache = new Map<number, ReturnType<typeof worldMatrix>>();
  const w = worldMatrix(layer, layers, t, cache);
  const tr = layerTransform(layer, t);
  if (!w.is3D) {
    // AE draws non-3D layers in comp space; the camera does not apply.
    const m = w.matrix;
    const css = `matrix(${m[0].toFixed(6)},${m[1].toFixed(6)},${m[4].toFixed(6)},${m[5].toFixed(6)},${m[12].toFixed(6)},${m[13].toFixed(6)})`;
    return { css, opacity: w.opacity * tr.opacity, is3D: false };
  }
  const { view, proj, screen } = cameraMatrices(comp, cam);
  const h = mMultiply(screen, mMultiply(proj, mMultiply(view, w.matrix)));
  return { css: cssMatrix3d(h), opacity: w.opacity * tr.opacity, is3D: true };
}

// ---- masks ------------------------------------------------------------------
function maskPaths(node: PropNode | undefined, t: number): { d: string; mode: number; opacity: number; invert: boolean }[] {
  const parade = child(node, "ADBE Mask Parade");
  const out: { d: string; mode: number; opacity: number; invert: boolean }[] = [];
  for (const m of children(parade)) {
    if (m.matchName !== "ADBE Mask Atom") continue;
    const pathNode = child(m, "ADBE Mask Shape");
    const v = evalProp(pathNode, t) as { vertices?: number[][]; inTangents?: number[][]; outTangents?: number[][]; closed?: boolean } | undefined;
    if (!v?.vertices?.length) continue;
    const verts = v.vertices;
    const n = verts.length;
    const parts: string[] = [`M${verts[0][0]},${verts[0][1]}`];
    const cnt = v.closed ? n : n - 1;
    for (let i = 0; i < cnt; i++) {
      const j = (i + 1) % n;
      const o = (v.outTangents?.[i] ?? [0, 0]) as number[];
      const it = (v.inTangents?.[j] ?? [0, 0]) as number[];
      parts.push(`C${verts[i][0] + o[0]},${verts[i][1] + (o[1] ?? 0)} ${verts[j][0] + it[0]},${verts[j][1] + (it[1] ?? 0)} ${verts[j][0]},${verts[j][1]}`);
    }
    if (v.closed) parts.push("Z");
    out.push({
      d: parts.join(" "),
      mode: typeof m.maskMode === "number" ? (m.maskMode as number) : 6813,
      opacity: 1,
      invert: false,
    });
  }
  return out;
}

// ---- content ----------------------------------------------------------------
function LayerContent({ layer, ctx, t, comp }: { layer: LayerSpec; ctx: RenderCtx; t: number; comp: CompSpec }): React.ReactNode {
  switch (layer.kind) {
    case "shape": {
      const shapes = layer.shapes;
      return shapes ? (
        <svg width={comp.width} height={comp.height} viewBox={`0 0 ${comp.width} ${comp.height}`} style={{ overflow: "visible", position: "absolute", left: 0, top: 0 }}>
          <VectorShapes node={shapes} t={t} />
        </svg>
      ) : null;
    }
    case "text":
      return layer.text ? <TextLayer node={layer.text} t={t} /> : null;
    case "comp": {
      const sub = compByIndex(layer.sourceCompIndex);
      if (!sub) return null;
      // Nested comps keep transparency: the comp bg color only renders for
      // the root composition, matching AE behavior.
      return <CompView comp={sub} ctx={ctx} t={layerLocalTime(layer, t)} isRoot={false} />;
    }
    case "footage": {
      const f = footageByName(layer.source);
      if (!f) return null;
      if (f.kind === "solid") {
        const c = f.color.map((x) => Math.round(x * 255));
        return (
          <div style={{ width: f.width, height: f.height, background: `rgb(${c[0]},${c[1]},${c[2]})`, position: "absolute", left: 0, top: 0 }} />
        );
      }
      const url = staticFile(f.file);
      if (/\.(mp4|mov|webm)$/i.test(f.file)) {
        return (
          <Video
            src={url}
            muted
            style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: "fill" }}
            startFrom={Math.max(0, Math.round(layerLocalTime(layer, t) * 24))}
          />
        );
      }
      if (f.audioOnly) return <Audio src={url} />;
      return <Img src={url} style={{ position: "absolute", left: 0, top: 0, maxWidth: "none" }} />;
    }
    case "null":
    default:
      return null;
  }
}

export function layerLocalTime(layer: LayerSpec, compT: number): number {
  // AE semantics: layer.startTime is the comp time at which the layer's
  // source begins (equals inPoint for precomps starting at source 0, and
  // can be negative for pre-trimmed footage). Local time is
  // (compT - startTime) * stretch/100.
  const stretch = layer.stretch ?? 100;
  const start = layer.startTime ?? layer.inPoint ?? 0;
  return ((compT - start) * stretch) / 100;
}

function layerVisible(layer: LayerSpec, comp: CompSpec, t: number): boolean {
  if (layer.enabled === false) return false;
  if (layer.shy) return false;
  if (layer.guideLayer) return false;
  const inP = layer.inPoint ?? 0;
  const outP = layer.outPoint ?? comp.duration;
  if (t < inP - 1e-6 || t >= outP - 1e-6) return false;
  if (inP === outP) return false;
  return true;
}

export function CompView({ comp, ctx, t, isRoot = false }: { comp: CompSpec; ctx: RenderCtx; t: number; isRoot?: boolean }): React.ReactElement {
  const layers = comp.layers;
  // Track matte pairing: legacy rule = layer directly above (index-1).
  // Selectable mattes (matteMap) override when the dump provides them.
  const rendered: React.ReactNode[] = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layerVisible(layer, comp, t)) continue;
    if (layer.isTrackMatte) continue; // consumed as matte; not drawn
    const { css, opacity } = layerScreenMatrix(comp, layers, layer, t, ctx.camera);
    const masks = maskPaths(layer.masks, t);
    let maskImage: string | undefined;
    if (masks.length) {
      // masks in layer space; build one SVG covering comp bounds
      const maskSvg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${comp.width}" height="${comp.height}">` +
        `<g fill="#fff" fill-rule="${masks.some((m) => m.mode === 6815) ? "evenodd" : "nonzero"}">` +
        masks.map((m) => `<path d="${m.d}"/>`).join("") +
        `</g></svg>`;
      maskImage = `url("data:image/svg+xml;utf8,${encodeURIComponent(maskSvg)}")`;
    }
    // matte: resolve source layer (selectable matte map, else legacy
    // above-layer rule) and rasterize its silhouette to a luminance mask.
    let matteImage: string | undefined;
    let maskMode: string | undefined;
    const tm = layer.trackMatteType;
    if (tm && tm !== 5012) {
      const matteIndex = ctx.matteMap?.get(layer.index) ?? layers[i - 1]?.index;
      const ml = matteIndex !== undefined ? layers.find((l) => l.index === matteIndex) : undefined;
      if (ml) {
        const svg = matteSvg(comp, layers, ml, t, ctx, tm === 5014 || tm === 5016);
        if (svg) {
          matteImage = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
          maskMode = "luminance";
        }
      }
    }
    const maskCss = [maskImage, matteImage].filter(Boolean).join(", ") || undefined;
    rendered.push(
      <div
        key={layer.index}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: comp.width,
          height: comp.height,
          transform: css,
          transformOrigin: "0 0",
          opacity,
          overflow: "visible",
          maskImage: maskCss,
          maskMode,
          WebkitMaskImage: maskCss,
        }}
      >
        <LayerEffects layer={layer} t={t} box={effectBox(layer, comp)}>
          <LayerContent layer={layer} ctx={ctx} t={t} comp={comp} />
        </LayerEffects>
      </div>,
    );
  }
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: comp.width, height: comp.height, background: isRoot ? bg(comp) : "transparent", overflow: isRoot ? "hidden" : "visible" }}>
      {rendered}
    </div>
  );
}

// Layer-space pixel box for effect evaluation: footage layers use the
// footage's own dimensions (solid specs carry them); everything else uses
// the comp dimensions, matching how content is laid out.
function effectBox(layer: LayerSpec, comp: CompSpec): { width: number; height: number } {
  if (layer.kind === "footage") {
    const f = footageByName(layer.source);
    if (f && "width" in f && typeof f.width === "number") {
      return { width: f.width, height: f.height };
    }
  }
  return { width: comp.width, height: comp.height };
}

function bg(comp: CompSpec): string {
  const b = comp.bgColor;
  if (Array.isArray(b) && b.length >= 3) {
    return `rgb(${Math.round((b[0] as number) * 255)},${Math.round((b[1] as number) * 255)},${Math.round((b[2] as number) * 255)})`;
  }
  return "#000";
}

// matteSvg rasterizes the matte layer's silhouette into a standalone SVG
// string usable as a CSS mask-image. White = visible. `inverted` flips the
// polarity. Only shape/solid matte sources; anything else returns null and
// the caller renders unmasked (tracked approximation).
function matteSvg(
  comp: CompSpec,
  layers: LayerSpec[],
  ml: LayerSpec,
  t: number,
  ctx: RenderCtx,
  inverted: boolean,
): string | null {
  const cache = new Map<number, ReturnType<typeof worldMatrix>>();
  const w = worldMatrix(ml, layers, t, cache);
  const m = w.matrix;
  // world matrix is column-major 4x4; layer->comp affine 2D part:
  const a = m[0], b = m[1], c = m[4], d = m[5], e = m[12], f = m[13];
  const affine = `matrix(${a.toFixed(5)},${b.toFixed(5)},${c.toFixed(5)},${d.toFixed(5)},${e.toFixed(5)},${f.toFixed(5)})`;
  let inner = "";
  if (ml.kind === "shape" && ml.shapes) {
    inner = renderShapesToSvgString(ml.shapes, t);
  } else if (ml.kind === "footage") {
    const f = footageByName(ml.source);
    if (f?.kind === "solid") {
      const col = inverted ? "#000" : "#fff";
      inner = `<rect x="0" y="0" width="${f.width}" height="${f.height}" fill="${col}"/>`;
    }
  }
  if (!inner) return null;
  // invert via luminance: normal matte draws white shapes on black;
  // inverted draws black shapes on white. Shapes keep their own colors
  // only when they are fills; simplest robust form: flatten each painted
  // path to a solid silhouette.
  const body =
    ml.kind === "shape" && ml.shapes
      ? silhouetteOfShapes(ml.shapes, t, inverted ? "#000" : "#fff")
      : inner;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${comp.width}" height="${comp.height}">` +
    `<rect width="${comp.width}" height="${comp.height}" fill="${inverted ? "#fff" : "#000"}"/>` +
    `<g transform="${affine}" fill="${inverted ? "#000" : "#fff"}" fill-rule="evenodd">${body}</g>` +
    `</svg>`
  );
}

// Walk a vector tree and emit path 'd' strings for every painted shape,
// ignoring fill/stroke colors (matte uses silhouette alpha only).
function silhouetteOfShapes(node: PropNode, t: number, color: string): string {
  void color;
  const out: string[] = [];
  const visit = (n: PropNode) => {
    if (n.matchName === "ADBE Vector Shape - Group") {
      for (const k of children(n)) visit(k);
    } else if (n.matchName === "ADBE Vector Shape") {
      const s = evalProp(n, t) as { vertices?: number[][]; inTangents?: number[][]; outTangents?: number[][]; closed?: boolean } | undefined;
      if (s?.vertices?.length) {
        const verts = s.vertices;
        const cnt = verts.length;
        const parts = [`M${verts[0][0]},${verts[0][1]}`];
        const steps = s.closed ? cnt : cnt - 1;
        for (let i = 0; i < steps; i++) {
          const j = (i + 1) % cnt;
          const o = (s.outTangents?.[i] ?? [0, 0]) as number[];
          const it = (s.inTangents?.[j] ?? [0, 0]) as number[];
          parts.push(`C${verts[i][0] + o[0]},${verts[i][1] + (o[1] ?? 0)} ${verts[j][0] + it[0]},${verts[j][1] + (it[1] ?? 0)} ${verts[j][0]},${verts[j][1]}`);
        }
        if (s.closed) parts.push("Z");
        out.push(`<path d="${parts.join(" ")}"/>`);
      }
    } else {
      for (const k of children(n)) visit(k);
    }
  };
  visit(node);
  return out.join("");
}

// renderShapesToSvgString kept for non-shape matte paths; shapes go through
// silhouetteOfShapes instead.
function renderShapesToSvgString(_node: PropNode, _t: number): string {
  return "";
}
