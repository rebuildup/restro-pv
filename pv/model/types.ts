// PV project model. The spec mirrors the AEP dump schema
// (restro-pv.aep-comp-dump.v1) so a dumped comp converts to a spec with no
// semantic loss, and the AE runtime can materialize it generically.
//
// Contract rules:
// - Comps are referenced by `sourceCompIndex` (position in ProjectSpec.comps),
//   never by name — AE allows duplicate comp names.
// - Layers are referenced by `parentIndex` (1-based AE layer index, index 0
//   is the top layer). Layer arrays are in AE order.
// - Footage sources are referenced by canonical spec name (unique after
//   deduplication); `sourceUid` keeps the original AE item id for traceability.
// - Anything the runtime cannot materialize must throw at build time, never
//   be silently dropped.

export interface Vec2 { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }

// Keyframe exactly as dumped from AE. inT/outT are
// KeyframeInterpolationType enum numbers.
export interface KeySpec {
  t: number;                       // seconds, comp time
  v: unknown;                      // scalar | number[] | {x,y,z} | Shape-like | TextDoc
  inT?: number;
  outT?: number;
  inEase?: Array<[number, number]>;
  outEase?: Array<[number, number]>;
  spIn?: [number, number];
  spOut?: [number, number];
}

// Generic property node. A node with `properties` is a group; otherwise it is
// a leaf (value and/or keys). matchName drives runtime lookup / addProperty.
export interface PropNode {
  name: string;
  matchName: string;
  type?: number;
  numKeys?: number | null;
  value?: unknown;
  keys?: KeySpec[];
  numProperties?: number;
  properties?: PropNode[];
  expression?: string;
  maskMode?: unknown;
  active?: unknown;
  enabled?: unknown;
  propertyIndex?: unknown;
}

export interface ShapeSpec {
  vertices: Array<[number, number]>;
  inTangents: Array<[number, number]>;
  outTangents: Array<[number, number]>;
  closed: boolean;
}

export interface TextDocSpec {
  text?: string;
  font?: string;
  fontFamily?: string;
  fontStyle?: string;
  size?: number;
  fillColor?: number[] | null;
  strokeColor?: number[] | null;
  strokeWidth?: number;
  tracking?: number;
  leading?: number;
  baselineShift?: number;
  horizontalScale?: number;
  verticalScale?: number;
  applyFill?: boolean;
  applyStroke?: boolean;
  boxText?: boolean;
  boxPosition?: number[] | null;
  boxSize?: number[] | null;
  justification?: string;
}

export type LayerKind =
  | 'comp'        // source is a CompItem (precomp)
  | 'footage'     // source is a FootageItem (file, solid, ...)
  | 'shape'       // vector layer, no source
  | 'text'        // text layer, no source
  | 'null';       // null layer

export interface LayerSpec {
  index: number;                  // AE layer index, 1 = top
  name: string;
  kind: LayerKind;
  source?: string;                // footage spec name, or comp name (readability)
  sourceUid?: number;             // original AE item id of the source
  sourceCompIndex?: number;       // index into ProjectSpec.comps for kind 'comp'
  enabled?: boolean;
  shy?: boolean;
  guideLayer?: boolean;
  inPoint?: number;
  outPoint?: number;
  startTime?: number;
  stretch?: number;
  timeRemapEnabled?: boolean;
  trackMatteType?: number;        // TrackMatteType enum
  isTrackMatte?: boolean;
  motionBlur?: boolean;
  collapseTransformations?: boolean;
  adjustmentLayer?: boolean;
  threeDLayer?: boolean;
  audioEnabled?: boolean;
  parentIndex?: number;           // AE layer index of parent, 0/undefined = none
  // property trees exactly as dumped; runtime applies generically
  transform?: PropNode;
  masks?: PropNode;
  effects?: PropNode;
  shapes?: PropNode;
  text?: PropNode;
  timeRemap?: PropNode;
  markers?: PropNode;
}

export interface CompSpec {
  uid?: number;                   // original AE comp item id (traceability)
  name: string;
  width: number;
  height: number;
  pixelAspect?: number;
  duration: number;
  frameRate: number;
  bgColor?: unknown;
  layers: LayerSpec[];            // AE order: [0] = top
}

export type FootageSpec =
  | { name: string; kind: 'file'; file: string; audioOnly?: boolean } // repo-relative path
  | { name: string; kind: 'solid'; color: number[]; width: number; height: number };

export interface ProjectSpec {
  name: string;
  comps: CompSpec[];
  footage: FootageSpec[];
  savePath?: string;              // AEP output path; empty = don't save
}
