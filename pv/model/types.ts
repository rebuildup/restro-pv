// PV project model. The spec mirrors the AEP dump schema
// (restro-pv.aep-comp-dump.v1) so a dumped comp converts to a spec with no
// semantic loss, and the AE runtime can materialize it generically.
//
// Contract rules:
// - References use stable identifiers: comp source = comp name (comps are
//   unique in a project), layer parent = 1-based layer index within the comp
//   (AE layer(1) is the top layer), footage source = project item name.
// - Layer arrays are in AE order: index 0 = top layer (AE layer(1)).
// - Anything the runtime cannot materialize must throw at build time, never
//   be silently dropped.

export interface Vec2 { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }

// Keyframe exactly as dumped from AE. inT/outT are
// KeyframeInterpolationType enum numbers (1 linear, 2 bezier, 3 hold).
export interface KeySpec {
  t: number;                       // seconds, comp time
  v: unknown;                      // scalar | number[] | {x,y,z} | Shape-like
  inT?: number;
  outT?: number;
  inEase?: Array<[number, number]>;
  outEase?: Array<[number, number]>;
  spIn?: [number, number];
  spOut?: [number, number];
}

// Generic property node. `type`: 1 = property, 2 = indexed property,
// 3+ = property group (AE reports inconsistent group type ids, so the
// runtime treats "has properties" as a group).
export interface PropNode {
  name: string;
  matchName: string;
  type?: number;
  numKeys?: number;
  value?: unknown;
  keys?: KeySpec[];
  numProperties?: number;
  properties?: PropNode[];
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
  justification?: string;
  boxText?: boolean;
  boxPosition?: number[];
  boxSize?: number[];
}

export type LayerKind =
  | 'comp'        // source is a CompItem
  | 'footage'     // source is a FootageItem (incl. solids)
  | 'shape'       // vector layer, no source
  | 'text'        // text layer, no source
  | 'null';       // null layer

export interface LayerSpec {
  index: number;                  // AE layer index, 1 = top
  name: string;
  kind: LayerKind;
  source?: string;                // comp name or footage item name
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
  // non-property extras discovered during conversion
  textDoc?: TextDocSpec;
}

export interface CompSpec {
  name: string;
  width: number;
  height: number;
  pixelAspect?: number;
  duration: number;
  frameRate: number;
  bgColor?: unknown;
  layers: LayerSpec[];            // AE order: [0] = top
}

export interface FootageSpec {
  file: string;                   // repo-relative path imported into the project
}

export interface ProjectSpec {
  name: string;
  comps: CompSpec[];
  footage: FootageSpec[];
  savePath?: string;              // AEP output path; empty = don't save
}
