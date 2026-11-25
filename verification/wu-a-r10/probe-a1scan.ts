import { applyMasterPatches } from "../../video/src/ae/masterPatch.ts";
applyMasterPatches();
const { compStrokes } = await import("../../video/src/scenes/glyph.tsx");
for (const t of [0.05, 0.15, 0.3, 0.45, 0.6, 0.9, 1.2, 1.45]) {
  const { strokes } = compStrokes("master", { indices: [239, 254], poseT: t });
  let u = [1e9, 1e9, -1e9, -1e9];
  for (const s of strokes) {
    u = [
      Math.min(u[0], s.bbox[0]),
      Math.min(u[1], s.bbox[1]),
      Math.max(u[2], s.bbox[2]),
      Math.max(u[3], s.bbox[3]),
    ];
  }
  console.log(`t=${t} union=[${u.map((v) => Math.round(v))}]`);
}
