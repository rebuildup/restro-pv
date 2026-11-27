// Measure dominant grid-line orientations and spacings in left/right halves
// of two PNG frames, to compare perspective direction (AE vs Remotion).
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

function load(p: string): PNG {
  return PNG.sync.read(readFileSync(p));
}

// static mask: pixels dark in BOTH frames (grid + static chrome survive;
// moving glyphs cancel out)
function staticDark(a: PNG, b: PNG, maxLum: number): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * a.width + x) * 4;
      const j = (y * b.width + x) * 4;
      const la = 0.299 * a.data[i] + 0.587 * a.data[i + 1] + 0.114 * a.data[i + 2];
      const lb = 0.299 * b.data[j] + 0.587 * b.data[j + 1] + 0.114 * b.data[j + 2];
      if (la < maxLum && lb < maxLum) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  return { xs, ys };
}

// For line family orientation alpha (direction of the line), project points
// onto the normal and histogram; peakiness = max bin count / mean.
function familyStats(xs: number[], ys: number[], x0: number, x1: number, y0 = 0, y1 = 1080) {
  const pts = xs.map((x, i) => [x, ys[i]] as const).filter(([x, y]) => x >= x0 && x < x1 && y >= y0 && y < y1);
  const n = pts.length;
  if (n < 50) return null;
  let best: { alpha: number; score: number; spacing: number } | null = null;
  for (let deg = -80; deg <= 80; deg += 0.25) {
    const a = (deg * Math.PI) / 180;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const ps = pts.map(([x, y]) => x * nx + y * ny);
    const min = Math.min(...ps);
    const max = Math.max(...ps);
    const bins = 400;
    const hist = new Array(bins).fill(0);
    for (const p of ps) {
      const b = Math.min(bins - 1, Math.floor(((p - min) / (max - min + 1e-6)) * bins));
      hist[b]++;
    }
    const mean = n / bins;
    const peak = Math.max(...hist);
    const score = peak / mean;
    if (!best || score > best.score) {
      // estimate spacing: find peaks in hist
      const peaks: number[] = [];
      for (let i = 1; i < bins - 1; i++) {
        if (hist[i] > hist[i - 1] && hist[i] >= hist[i + 1] && hist[i] > mean * 2) peaks.push(i);
      }
      let spacing = 0;
      if (peaks.length >= 2) {
        const gaps = peaks.slice(1).map((p, i) => p - peaks[i]);
        spacing = (gaps.reduce((s, g) => s + g, 0) / gaps.length / bins) * (max - min);
      }
      best = { alpha: deg, score, spacing };
    }
  }
  return { n, ...best };
}

const [,, fa, fb, ta, tb] = process.argv;
const A = load(fa);
const B = load(fb);
const mask = staticDark(A, B, 140);
console.log(`static dark px: ${mask.xs.length}`);
for (const [name, x0, x1] of [
  ["left ", 40, 460],
  ["right", 560, 1060],
] as const) {
  for (const [y0, y1] of [
    [80, 500],
    [500, 1000],
  ] as const) {
    const s = familyStats(mask.xs, mask.ys, x0, x1, y0, y1);
    console.log(`${name} y${y0}-${y1}:`, s ? `n=${s.n} alpha=${s.alpha?.toFixed(2)} score=${s.score?.toFixed(1)} spacing=${s.spacing?.toFixed(1)}` : "n/a");
  }
}
