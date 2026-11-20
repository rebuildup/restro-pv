// PV project model: the canonical description of everything that ends up in
// the master comp. Scene builders produce these specs; the AE runtime emits
// ExtendScript that materializes them in After Effects.

export interface Vec2 { x: number; y: number; }
export interface Vec3 { x: number; y: number; z: number; }

export interface KeyframeSpec {
  time: number;            // comp seconds
  value: number | Vec2 | Vec3 | number[];
  // optional per-dimension interpolation metadata emitted verbatim to AE
  ease?: [number, number][];        // temporal ease pairs (in,out) speed
  spatialTangent?: Vec2[];          // spatial in/out tangents
  interpolation?: 'linear' | 'bezier' | 'hold';
}

export interface PropertySpec {
  name: string;            // e.g. "Opacity", "Position", "Scale"
  matchName?: string;      // e.g. "ADBE Opacity"
  keys: KeyframeSpec[];    // empty = constant at `value`
  value?: number | Vec2 | Vec3 | number[];
  // shape-path properties are handled by ShapeSpec instead
}

export interface ShapePathSpec {
  vertices: Vec2[];
  inTangents: Vec2[];
  outTangents: Vec2[];
  closed: boolean;
}

export interface MaskSpec {
  name?: string;
  mode: 'add' | 'subtract' | 'intersect' | 'none' | 'difference' | 'lighten' | 'darken';
  path: ShapePathSpec;
  opacity?: number;        // percent
  expansion?: number;
  inverted?: boolean;
  locked?: boolean;
}

export interface FillSpec {
  color: Vec3;             // 0..1 RGB
  opacity?: number;        // percent
}
export interface StrokeSpec {
  color: Vec3;
  width: number;
  opacity?: number;
}

export interface ShapeLayerSpec {
  kind: 'shape';
  name: string;
  // contents groups, in order; each group is a list of ops
  groups: Array<
    | { type: 'path'; path: ShapePathSpec }
    | { type: 'fill'; fill: FillSpec }
    | { type: 'stroke'; stroke: StrokeSpec }
    | { type: 'rect'; rect: { size: Vec2; position: Vec2 } }
    | { type: 'ellipse'; ellipse: { size: Vec2; position: Vec2 } }
    | { type: 'transform'; transform: PropertySpec[] }
    | { type: 'group'; name?: string; items: ShapeLayerSpec['groups'] }
  >;
}

export interface TextDocSpec {
  text: string;
  fontName?: string;
  fontSize?: number;
  fillColor?: Vec3;
  strokeColor?: Vec3;
  strokeWidth?: number;
  justification?: 'left' | 'center' | 'right';
}

export interface FootageRef {
  file: string;            // path relative to repo root or absolute
  name?: string;
}

export interface CompLayerSpec {
  kind: 'comp' | 'footage' | 'text' | 'null' | 'camera' | 'light';
  name: string;
  source?: string;         // comp name or footage file
  startTime?: number;      // layer start offset in comp time
  inPoint?: number;        // layer in-point, comp seconds
  outPoint?: number;       // layer out-point, comp seconds
  stretch?: number;        // time stretch percent (100 = normal)
  enabled?: boolean;
  parent?: string;         // parent layer name within same comp
  transform?: PropertySpec[];
  masks?: MaskSpec[];
  shape?: ShapeLayerSpec;
  text?: TextDocSpec;
  // effects omitted for now — see pv/ae/runtime for effect support status
}

export interface CompSpec {
  name: string;
  width: number;
  height: number;
  pixelAspect?: number;
  duration: number;        // seconds
  frameRate: number;
  layers: CompLayerSpec[]; // top to bottom? AE layer index 1 = top
  bgColor?: Vec3;
}

export interface ProjectSpec {
  name: string;
  comps: CompSpec[];
  footage?: FootageRef[];   // imported project items
  bgm?: FootageRef;
}
