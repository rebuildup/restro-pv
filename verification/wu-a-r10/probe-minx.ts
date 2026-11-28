import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
applyMasterPatches();
const { compStrokes } = await import("../../video/src/scenes/glyph.tsx");
for (const t of [0.5, 1.45]) {
  const { strokes } = compStrokes("master", { indices: [239, 254], poseT: t });
  const sorted = [...strokes].sort((a, b) => a.bbox[0] - b.bbox[0]);
  console.log(`--- t=${t}`);
  for (const s of sorted.slice(0, 5))
    console.log(s.name, s.bbox.map((v) => Math.round(v)));
}
