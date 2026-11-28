import { compStrokes } from "../../video/src/scenes/glyph.tsx";

// area centroid of stroke polygons (points are contour vertices, may include
// multiple disjoint subpaths per layer — treat each StrokeItem.points as ONE
// polygon; for centroid purposes approximate by vertex average weighted by
// segment length is overkill: use bbox-center + vertex mean blend)
function stats(items: {points:[number,number][]; bbox:number[]}[]) {
  let sx=0,sy=0,n=0;
  for (const s of items) for (const p of s.points) { sx+=p[0]; sy+=p[1]; n++; }
  return { mx: sx/n, my: sy/n, n };
}
function bboxOf(items: {bbox:number[]}[]) {
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for (const s of items){x0=Math.min(x0,s.bbox[0]);y0=Math.min(y0,s.bbox[1]);x1=Math.max(x1,s.bbox[2]);y1=Math.max(y1,s.bbox[3]);}
  return [x0,y0,x1,y1];
}

const bunkai = compStrokes("bunkai", { pattern: /STROKE_\d+_runs[4567]|merged shape/, poseT: 0.5 });
const ghost = compStrokes("PV glyph A2", { indices: [1,15], poseT: 0.5 });

// map ghost points/bbox through ghostCss: x'=1.0599x-213.2939, y'=1.0599y-128.5836
const sx=1.0599, sy=1.0599, tx=-213.2939, ty=-128.5836;
const gpts = ghost.strokes.map(s=>({points: s.points.map(p=>[sx*p[0]+tx, sy*p[1]+ty] as [number,number]), bbox: s.bbox}));
// recompute ghost bboxes in PV-A2 space from mapped points
const gMapped = gpts.map((s,i)=>{
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const p of s.points){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}
  return {points:s.points, bbox:[x0,y0,x1,y1]};
});

const bs = stats(bunkai.strokes), gs = stats(gMapped);
const bb = bboxOf(bunkai.strokes), gb = bboxOf(gMapped);
console.log("bunkai vertex-mean:", bs.mx.toFixed(1), bs.my.toFixed(1), "bbox", bb.map(v=>v.toFixed(0)));
console.log("ghost(PV-A2) vertex-mean:", gs.mx.toFixed(1), gs.my.toFixed(1), "bbox", gb.map(v=>v.toFixed(0)));
console.log("offset needed (bunkai-ghost):", (bs.mx-gs.mx).toFixed(1), (bs.my-gs.my).toFixed(1));
console.log("bbox size bunkai:", (bb[2]-bb[0]).toFixed(0), (bb[3]-bb[1]).toFixed(0), "ghost:", (gb[2]-gb[0]).toFixed(0), (gb[3]-gb[1]).toFixed(0));
