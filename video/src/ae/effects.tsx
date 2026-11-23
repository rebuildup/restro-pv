import React from "react";
import type { LayerSpec, PropNode } from "../../../pv/model/types.ts";
import { child, children, evalProp, evalVec } from "./eval.ts";

// AE layer effects (Effect Parade) interpreted for the CompSpec dump.
// Only effects observed enabled in the reachable comp tree are implemented:
//   ADBE Fill  — flood the layer alpha with a solid color (SVG filter)
//   ADBE Grid  — Generate > Grid line pattern in layer space
// Anything else is ignored; disabled effects never reach this module.

function num(v: unknown, d = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

function rgbaOf(node: PropNode | undefined, t: number): [number, number, number, number] {
  const v = evalProp(node, t);
  if (Array.isArray(v)) {
    const c = v.map((x) => Math.min(1, Math.max(0, num(x))));
    return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 1];
  }
  return [0, 0, 0, 1];
}

function cssRgb(c: [number, number, number, number]): string {
  return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}

function enabledEffects(layer: LayerSpec): PropNode[] {
  return children(layer.effects).filter((e) => e.enabled !== false && e.active !== false);
}

interface FillSpec {
  color: [number, number, number, number];
  opacity: number; // 0..1
}

interface GridSpec {
  anchor: [number, number];
  sizeFrom: number; // 1=Corner Point, 2=Width Slider, 3=Width & Height
  corner: [number, number];
  width: number;
  height: number;
  border: number;
  feather: number;
  invert: boolean;
  color: [number, number, number, number];
  opacity: number; // 0..1
}

function parseEffects(layer: LayerSpec, t: number): { fill?: FillSpec; grid?: GridSpec } {
  const out: { fill?: FillSpec; grid?: GridSpec } = {};
  for (const e of enabledEffects(layer)) {
    if (e.matchName === "ADBE Fill") {
      const op = num(evalProp(child(e, "ADBE Fill-0005"), t), 1);
      out.fill = {
        color: rgbaOf(child(e, "ADBE Fill-0002"), t),
        // AE Fill opacity slider is 0..1 in this dump.
        opacity: op <= 1 ? op : op / 100,
      };
    } else if (e.matchName === "ADBE Grid") {
      const gop = num(evalProp(child(e, "ADBE Grid-0013"), t), 100);
      out.grid = {
        anchor: evalVec(child(e, "ADBE Grid-0001"), t, 2) as [number, number],
        sizeFrom: num(evalProp(child(e, "ADBE Grid-0002"), t), 1),
        corner: evalVec(child(e, "ADBE Grid-0003"), t, 2) as [number, number],
        width: num(evalProp(child(e, "ADBE Grid-0004"), t), 0),
        height: num(evalProp(child(e, "ADBE Grid-0005"), t), 0),
        border: num(evalProp(child(e, "ADBE Grid-0006"), t), 0),
        feather: num(evalProp(child(e, "ADBE Grid-0007"), t), 0),
        invert: num(evalProp(child(e, "ADBE Grid-0011"), t), 0) !== 0,
        color: rgbaOf(child(e, "ADBE Grid-0012"), t),
        opacity: gop <= 1 ? gop : gop / 100,
      };
    }
  }
  return out;
}

// Cell size in layer pixels per Size From popup (1-based AE index):
//   1 = Corner Point      — one cell spans Anchor -> Corner
//   2 = Width Slider      — square cells of side Width
//   3 = Width & Height    — Width x Height rectangles
function gridCell(g: GridSpec): { w: number; h: number } {
  if (g.sizeFrom === 3) return { w: g.width, h: g.height };
  if (g.sizeFrom === 2) return { w: g.width, h: g.width };
  return { w: Math.abs(g.corner[0] - g.anchor[0]), h: Math.abs(g.corner[1] - g.anchor[1]) };
}

function GridOverlay({ spec, width, height, id }: { spec: GridSpec; width: number; height: number; id: string }) {
  const { w: cw, h: ch } = gridCell(spec);
  if (cw <= 0 || ch <= 0 || spec.border <= 0) return null;
  const [ax, ay] = spec.anchor;
  const half = spec.border / 2;
  const color = cssRgb(spec.color);
  const op = spec.opacity * spec.color[3];
  const lines: React.ReactNode[] = [];
  let key = 0;
  const kMinX = Math.floor((0 - ax) / cw) - 1;
  const kMaxX = Math.ceil((width - ax) / cw) + 1;
  for (let k = kMinX; k <= kMaxX; k++) {
    const x = ax + k * cw;
    if (x < -spec.border || x > width + spec.border) continue;
    lines.push(<rect key={key++} x={x - half} y={-spec.border} width={spec.border} height={height + spec.border * 2} fill={color} opacity={op} />);
  }
  const kMinY = Math.floor((0 - ay) / ch) - 1;
  const kMaxY = Math.ceil((height - ay) / ch) + 1;
  for (let k = kMinY; k <= kMaxY; k++) {
    const y = ay + k * ch;
    if (y < -spec.border || y > height + spec.border) continue;
    lines.push(<rect key={key++} x={-spec.border} y={y - half} width={width + spec.border * 2} height={spec.border} fill={color} opacity={op} />);
  }
  // Invert Grid swaps opaque/transparent areas: cell interiors become opaque,
  // grid lines transparent. Rendered as a full-field rect masked by the
  // inverse of the line pattern.
  if (spec.invert) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <mask id={id}>
          <rect x="0" y="0" width={width} height={height} fill="#fff" />
          {lines.map((l) => {
            const p = (l as React.ReactElement<{ x?: number; y?: number; width?: number; height?: number }>).props;
            return <rect key={(l as React.ReactElement).key} x={p.x} y={p.y} width={p.width} height={p.height} fill="#000" />;
          })}
        </mask>
        <rect x="0" y="0" width={width} height={height} fill={color} opacity={op} mask={`url(#${id})`} />
      </svg>
    );
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {lines}
    </svg>
  );
}

// Wraps layer content with its Effect Parade output. `box` is the layer-space
// pixel size used to bound the Grid pattern (footage dims for footage layers,
// comp dims otherwise).
export function LayerEffects({
  layer,
  t,
  box,
  children,
}: {
  layer: LayerSpec;
  t: number;
  box: { width: number; height: number };
  children: React.ReactNode;
}): React.ReactElement {
  const fx = parseEffects(layer, t);
  if (!fx.fill && !fx.grid) return <>{children}</>;

  const content = fx.fill ? (
    <div style={{ position: "absolute", left: 0, top: 0, width: box.width, height: box.height, filter: `url(#${fillFilterId(layer)})` }}>
      {children}
    </div>
  ) : (
    children
  );

  return (
    <>
      {fx.fill ? <FillFilterDef spec={fx.fill} id={fillFilterId(layer)} /> : null}
      <div style={{ position: "absolute", left: 0, top: 0, width: box.width, height: box.height }}>
        {content}
        {fx.grid ? <GridOverlay spec={fx.grid} width={box.width} height={box.height} id={`grid-inv-${fillFilterId(layer)}`} /> : null}
      </div>
    </>
  );
}

function fillFilterId(layer: LayerSpec): string {
  // Layer index is unique within a comp; the same comp rendered twice shares
  // identical effect params, so id collisions are benign.
  return `ae-fill-${layer.index}`;
}

function FillFilterDef({ spec, id }: { spec: FillSpec; id: string }) {
  const c = spec.color;
  const color = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feFlood floodColor={color} floodOpacity={spec.opacity * c[3]} result="flood" />
          <feComposite in="flood" in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}
