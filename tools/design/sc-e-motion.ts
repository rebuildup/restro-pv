// Scene-content motion: build per-frame "scene mask" = |PV-Master - PV-Chrome|
// (cancels animated background/chrome), then diff consecutive masks to get
// the bbox/count of pixels where scene content actually changed.
// Usage: bun tools/sc-e-motion.ts <frame...>
import { PNG } from "pngjs";
import { readFileSync, existsSync } from "node:fs";

const TH = 24;
const load = (f: string) => PNG.sync.read(readFileSync(f));

function sceneMask(m: PNG, c: PNG): Uint8Array {
  const out = new Uint8Array(m.width * m.height);
  for (let i = 0; i < m.width * m.height; i++) {
    const j = i * 4;
    const d =
      Math.abs(m.data[j] - c.data[j]) +
      Math.abs(m.data[j + 1] - c.data[j + 1]) +
      Math.abs(m.data[j + 2] - c.data[j + 2]);
    if (d > TH) out[i] = 1;
  }
  return out;
}

const frames = process.argv.slice(2).map(Number).sort((a, b) => a - b);
const masks = new Map<number, { m: PNG; mask: Uint8Array }>();
for (const f of frames) {
  const mp = `.tmp/sc-e-${f}.png`, cp = `.tmp/chrome-${f}.png`;
  if (!existsSync(mp) || !existsSync(cp)) { console.log(`skip f${f}`); continue; }
  masks.set(f, { m: load(mp), mask: sceneMask(load(mp), load(cp)) });
}

// scene mask stats per frame
for (const f of [...masks.keys()]) {
  const { m, mask } = masks.get(f)!;
  let n = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  // stage region only + left col count
  let leftN = 0;
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++) {
      if (mask[y * m.width + x]) {
        n++;
        if (x < 460) leftN++;
        if (x >= 480) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
  console.log(`f${f} t=${(f / 24).toFixed(3)}  stageInk=${n} leftColInk=${leftN} stageBBox=[${minX},${minY}]-[${maxX},${maxY}]`);
}

// consecutive mask diffs -> motion extent of scene content
console.log("\n== scene-content change between consecutive sampled frames ==");
const ks = [...masks.keys()];
for (let i = 1; i < ks.length; i++) {
  const f0 = ks[i - 1], f1 = ks[i];
  const a = masks.get(f0)!, b = masks.get(f1)!;
  let n = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let y = 0; y < a.m.height; y++)
    for (let x = 0; x < a.m.width; x++) {
      const idx = y * a.m.width + x;
      if (a.mask[idx] !== b.mask[idx]) {
        n++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  console.log(`f${f0}->f${f1}: changedPx=${n} bbox=[${minX},${minY}]-[${maxX},${maxY}]`);
}
