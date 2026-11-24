// Scan a video for per-frame motion (mean abs RGB diff) using the bundled
// remotion ffmpeg image2pipe/png output. PNG frames are split on IEND and
// decoded with zlib (scanline unfiltering).
// Usage: bun verification/wu-d/scan-motion.ts <video.mp4> [scaleW=160]
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { resolve } from "node:path";

const ffmpeg = resolve(
  "node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe",
);
const file = process.argv[2];
const W = Number(process.argv[3] ?? 160);
if (!file) throw new Error("usage: scan-motion.ts <video> [W]");

const probe = execFileSync(
  ffmpeg.replace("ffmpeg.exe", "ffprobe.exe"),
  ["-v", "error", "-select_streams", "v:0",
   "-show_entries", "stream=width,height,r_frame_rate",
   "-of", "csv=p=0", file],
).toString().trim();
const [w0, h0, fpsStr] = probe.split(",");
const fps = Number(fpsStr.split("/")[0]) / Number(fpsStr.split("/")[1]);
const H = Math.round((Number(h0) / Number(w0)) * W / 2) * 2;

const raw = execFileSync(ffmpeg, [
  "-v", "error", "-i", file,
  "-vf", `scale=${W}:${H}`,
  "-f", "image2pipe", "-vcodec", "png", "-",
], { maxBuffer: 4 * 1024 * 1024 * 1024 });

// ---- minimal PNG decode (8-bit, non-interlaced) -----------------------------
function decodePng(buf: Buffer): { w: number; h: number; rgb: Buffer } {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not png");
  let p = 8;
  let w = 0, h = 0, depth = 0, ctype = 0;
  const idat: Buffer[] = [];
  while (p + 12 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const ch = ctype === 6 ? 4 : ctype === 2 ? 3 : ctype === 0 ? 1 : 0;
  if (!ch || depth !== 8) throw new Error(`unsupported png depth=${depth} ctype=${ctype}`);
  const rawd = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const f = rawd[q++];
    const row = rawd.subarray(q, q + stride); q += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
  }
  // to rgb24
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0, j = 0; i < w * h * ch; i += ch, j += 3) {
    rgb[j] = out[i]; rgb[j + 1] = out[i + 1] ?? out[i]; rgb[j + 2] = out[i + 2] ?? out[i];
  }
  return { w, h, rgb };
}

// split concatenated PNG stream on IEND
function splitPngs(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let p = 0;
  while (p + 8 <= buf.length && buf.readUInt32BE(p) === 0x89504e47) {
    let q = p + 8, end = -1;
    while (q + 12 <= buf.length) {
      const len = buf.readUInt32BE(q);
      const type = buf.toString("ascii", q + 4, q + 8);
      q += 12 + len;
      if (type === "IEND") { end = q; break; }
    }
    if (end < 0) break;
    out.push(buf.subarray(p, end));
    p = end;
  }
  return out;
}

const pngs = splitPngs(raw);
console.log(`# ${file} ${probe} pngs=${pngs.length} fps=${fps} target=${W}x${H}`);
if (!pngs.length) process.exit(1);

let prev: Buffer | null = null;
for (let i = 0; i < pngs.length; i++) {
  const { rgb } = decodePng(pngs[i]);
  let diff = 0;
  if (prev && prev.length === rgb.length) {
    for (let q = 0; q < rgb.length; q += 3) {
      diff += Math.abs(rgb[q] - prev[q]) + Math.abs(rgb[q + 1] - prev[q + 1]) + Math.abs(rgb[q + 2] - prev[q + 2]);
    }
    diff /= rgb.length / 3;
  }
  prev = rgb;
  if (i % 6 === 0 || i === pngs.length - 1) {
    console.log(`${(i / fps).toFixed(1)}\t${diff.toFixed(2)}`);
  }
}
