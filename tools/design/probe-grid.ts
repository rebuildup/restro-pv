// Isolate near-neutral gray pixels (the #303030 grid lines) and find the
// dominant line families + spacing in a frame region.
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const [,, file, x0s, x1s, y0s, y1s, loS, hiS] = process.argv;
const png = PNG.sync.read(readFileSync(file));
const x0 = +x0s, x1 = +x1s, y0 = +y0s, y1 = +y1s;
const lo = +(loS ?? 30), hi = +(hiS ?? 130);

const pts: [number, number][] = [];
for (let y = y0; y < y1; y++) {
  for (let x = x0; x < x1; x++) {
    const i = (y * png.width + x) * 4;
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum >= lo && lum <= hi && Math.max(r, g, b) - Math.min(r, g, b) < 18) pts.push([x, y]);
  }
}
console.log(`${file} [${x0},${y0}]-[${x1},${y1}] gray px: ${pts.length}`);
if (pts.length < 30) process.exit(0);

interface Fam { alpha: number; score: number; spacing: number; support: number }
const fams: Fam[] = [];
for (let deg = -85; deg <= 85; deg += 0.25) {
  const a = (deg * Math.PI) / 180;
  const nx = -Math.sin(a), ny = Math.cos(a);
  const ps = pts.map(([x, y]) => x * nx + y * ny);
  const min = Math.min(...ps), max = Math.max(...ps);
  const bins = 400;
  const hist = new Array(bins).fill(0);
  for (const p of ps) hist[Math.min(bins - 1, Math.floor(((p - min) / (max - min + 1e-6)) * bins))]++;
  const mean = pts.length / bins;
  let peak = 0, peakI = 0;
  for (let i = 0; i < bins; i++) if (hist[i] > peak) { peak = hist[i]; peakI = i; }
  const score = peak / mean;
  const peaks: number[] = [];
  for (let i = 1; i < bins - 1; i++) {
    if (hist[i] > hist[i - 1] && hist[i] >= hist[i + 1] && hist[i] > mean * 1.6) peaks.push(i);
  }
  let spacing = 0;
  if (peaks.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < peaks.length; i++) gaps.push(peaks[i] - peaks[i - 1]);
    spacing = (gaps.reduce((s, g) => s + g, 0) / gaps.length / bins) * (max - min);
  }
  fams.push({ alpha: deg, score, spacing, support: peak });
}
fams.sort((a, b) => b.score - a.score);
const picked: Fam[] = [];
for (const f of fams) {
  if (picked.every((p) => Math.abs(p.alpha - f.alpha) > 5)) picked.push(f);
  if (picked.length >= 4) break;
}
for (const f of picked) console.log(`  alpha=${f.alpha.toFixed(1)} score=${f.score.toFixed(2)} spacing=${f.spacing.toFixed(1)}px support=${f.support}`);
