// Music analysis for the PV BGM: decodes the mp3 to mono PCM via ffmpeg,
// computes a spectral-flux onset envelope, estimates tempo, and writes
// structured JSON that Remotion scenes can import.
// Usage: bun tools/analyze-music.ts [src.mp3] [out.json]
// Env: FFMPEG (defaults to the yt-dlp-gui build when `ffmpeg` is not on PATH)
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const FFMPEG_CANDIDATES = [
  process.env.FFMPEG,
  "ffmpeg",
  "C:\\Users\\rebui\\AppData\\Local\\yt-dlp-gui\\ffmpeg.exe",
].filter(Boolean) as string[];

function findFfmpeg(): string {
  for (const c of FFMPEG_CANDIDATES) {
    const r = spawnSync(c, ["-version"], { encoding: "utf8" });
    if (r.status === 0) return c;
  }
  throw new Error("ffmpeg not found");
}

const SR = 22050;
const HOP = 512;
const NFFT = 1024;

function decode(path: string, ffmpeg: string): Float32Array {
  const r = spawnSync(
    ffmpeg,
    ["-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"],
    { maxBuffer: 1 << 28 },
  );
  if (r.status !== 0) throw new Error(`ffmpeg decode failed: ${r.stderr}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
}

// iterative radix-2 FFT, in place on interleaved re/im arrays
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cwr - im[i + j + len / 2] * cwi;
        const vi = re[i + j + len / 2] * cwi + im[i + j + len / 2] * cwr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr; cwr = nwr;
      }
    }
  }
}

function spectralFlux(x: Float32Array): { flux: number[]; hopSec: number } {
  const hopSec = HOP / SR;
  const nFrames = 1 + Math.floor((x.length - NFFT) / HOP);
  const bins = NFFT / 2 + 1;
  const prev = new Float64Array(bins);
  const flux: number[] = [0];
  const re = new Float64Array(NFFT);
  const im = new Float64Array(NFFT);
  const hann = new Float64Array(NFFT);
  for (let i = 0; i < NFFT; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (NFFT - 1));
  for (let f = 0; f < nFrames; f++) {
    const off = f * HOP;
    for (let i = 0; i < NFFT; i++) {
      re[i] = (x[off + i] ?? 0) * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    let s = 0;
    for (let b = 0; b < bins; b++) {
      const m = Math.log1p(1000 * Math.hypot(re[b], im[b]));
      const d = m - prev[b];
      if (d > 0) s += d;
      prev[b] = m;
    }
    flux.push(s);
  }
  return { flux, hopSec };
}

function tempoAndBeats(novelty: number[], hopSec: number, dur: number) {
  const fpsEnv = 1 / hopSec;
  const mean = novelty.reduce((a, b) => a + b, 0) / novelty.length;
  // autocorrelation
  const maxLag = Math.floor((fpsEnv * 60) / 60); // 60 BPM period
  const minLag = Math.floor((fpsEnv * 60) / 200);
  let bestLag = minLag, bestAc = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0;
    for (let i = 0; i + lag < novelty.length; i++) ac += (novelty[i] - mean) * (novelty[i + lag] - mean);
    if (ac > bestAc) { bestAc = ac; bestLag = lag; }
  }
  const bpm = (60 * fpsEnv) / bestLag;
  const period = (fpsEnv * 60) / bpm; // in env frames
  // phase scan
  let bestPhase = 0, bestScore = -Infinity;
  for (let ph = 0; ph < period; ph += 1) {
    let score = 0, n = 0;
    for (let i = Math.floor(ph); i < novelty.length; i += period) { score += novelty[i]; n++; }
    score /= Math.max(n, 1);
    if (score > bestScore) { bestScore = score; bestPhase = ph; }
  }
  const beats: number[] = [];
  for (let i = bestPhase; i < novelty.length; i += period) {
    const t = i * hopSec;
    if (t < dur) beats.push(t);
  }
  return { bpm, period, beats };
}

function strongOnsets(novelty: number[], hopSec: number): number[] {
  const sorted = [...novelty].sort((a, b) => a - b);
  const thr = sorted[Math.floor(sorted.length * 0.92)];
  const minGap = Math.floor(0.08 / hopSec);
  const out: number[] = [];
  let last = -1e9;
  for (let i = 1; i < novelty.length - 1; i++) {
    if (novelty[i] <= thr || novelty[i] < novelty[i - 1] || novelty[i] < novelty[i + 1]) continue;
    if (i - last < minGap) continue;
    out.push(Number((i * hopSec).toFixed(3)));
    last = i;
  }
  return out;
}

function rmsEnvelope(x: Float32Array): { t: number[]; v: number[] } {
  const win = Math.floor(0.25 * SR);
  const step = Math.floor(win / 2);
  const raw: number[] = [];
  for (let s = 0; s + win <= x.length; s += step) {
    let sum = 0;
    for (let i = s; i < s + win; i++) sum += x[i] * x[i];
    raw.push(Math.sqrt(sum / win));
  }
  const max = Math.max(...raw, 1e-9);
  const t: number[] = [], v: number[] = [];
  for (let i = 0; i < raw.length; i += 4) {
    t.push(Number(((i * step) / SR).toFixed(2)));
    v.push(Number((raw[i] / max).toFixed(3)));
  }
  return { t, v };
}

function sections(t: number[], v: number[]): number[] {
  const bounds = [0];
  for (let i = 2; i < v.length - 2; i++) {
    if (Math.abs(v[i] - v[i - 2]) > 0.25 && Math.abs(v[i] - v[i + 2]) > 0.15 && t[i] - bounds[bounds.length - 1] > 1.5) {
      bounds.push(t[i]);
    }
  }
  return bounds;
}

const [, , srcArg, outArg] = process.argv;
const src = srcArg ?? "assets/audio/drums-and-somps-background-music-458414.mp3";
const out = outArg ?? "video/src/music-analysis.json";
const ffmpeg = findFfmpeg();
const x = decode(src, ffmpeg);
const dur = x.length / SR;

// raw flux then novelty = flux / local mean
const { flux, hopSec } = spectralFlux(x);
const k = 43;
const novelty = flux.map((_, i) => {
  let s = 0, n = 0;
  for (let j = Math.max(0, i - k / 2); j <= Math.min(flux.length - 1, i + k / 2); j++) { s += flux[j]; n++; }
  const local = s / n;
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
  return local < mean * 0.2 ? 0 : flux[i] / (local + 1e-9);
});

const { bpm, beats } = tempoAndBeats(novelty, hopSec, dur);
const env = rmsEnvelope(x);
const sec = sections(env.t, env.v);
sec.push(Number(dur.toFixed(2)));

const doc = {
  source: src,
  durationSec: Number(dur.toFixed(3)),
  sampleRate: SR,
  hopSec: Number(hopSec.toFixed(4)),
  tempoBpm: Number(bpm.toFixed(2)),
  beatsSec: beats.map((b) => Number(b.toFixed(3))),
  strongOnsetsSec: strongOnsets(novelty, hopSec),
  sectionsSec: sec,
  rmsEnvelope: env,
};
writeFileSync(out, JSON.stringify(doc, null, 1));
console.log(`duration=${dur.toFixed(2)}s bpm=${bpm.toFixed(1)} beats=${beats.length} onsets=${doc.strongOnsetsSec.length}`);
console.log(`sections=${JSON.stringify(sec)}`);
console.log(`first beats=${beats.slice(0, 12).map((b) => b.toFixed(2)).join(",")}`);
console.log(`onsets(30)=${doc.strongOnsetsSec.slice(0, 30).join(",")}`);
