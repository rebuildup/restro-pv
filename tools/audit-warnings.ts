// Aggregate .tmp/pv-warnings.jsonl into a classified diagnostic report.
// Every warning is counted — nothing is dropped. Groups by operation kind,
// failing property (matchName when present), and normalized AE error text.
//
//   node tools/audit-warnings.ts [warnings.jsonl] [--out report.json]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const args = process.argv.slice(2);
const inPath = resolve(args.find((a) => !a.startsWith('--')) ?? resolve(ROOT, '.tmp/pv-warnings.jsonl'));
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? resolve(args[outIdx + 1]) : null;

if (!existsSync(inPath)) { console.error('not found: ' + inPath); process.exit(1); }

interface WarnRec { k: string; m: string }
interface Bucket {
  count: number;
  kind: string;
  prop: string;      // last matchName-like token in the path
  err: string;       // normalized error text
  samples: string[]; // up to 3 full messages
}

const OP_KINDS: [RegExp, string][] = [
  [/^setValue failed/, 'setValue'],
  [/^setValueAtTime failed/, 'setValueAtTime'],
  [/^key meta failed/, 'keyMeta'],
  [/^enabled failed/, 'enabled'],
  [/^active failed/, 'active'],
  [/^maskMode failed/, 'maskMode'],
  [/^addProperty/, 'addProperty'],
  [/^missing property/, 'missingProp'],
  [/^skipping (children|disabled)/, 'skippedDisabled'],
  [/expression/i, 'expression'],
];

function classify(m: string): { kind: string; prop: string; err: string } {
  let kind = 'other';
  for (const [re, k] of OP_KINDS) if (re.test(m)) { kind = k; break; }
  // Path is everything before the last ': ' that introduces the AE error,
  // or the whole message for warnings without an error suffix.
  const ci = m.lastIndexOf(': ');
  const path = ci > 0 ? m.slice(0, ci) : m;
  const err = ci > 0 ? m.slice(ci + 2) : '';
  // Last path segment is "matchName or name"; prefer ADBE tokens anywhere.
  const segs = path.split('/');
  let prop = segs[segs.length - 1] ?? '';
  const adbe = path.match(/ADBE [A-Za-z0-9_ ]+/g);
  if (adbe && adbe.length) prop = adbe[adbe.length - 1];
  // Normalize error: strip numbers/quoted names that differ per instance.
  const norm = err
    .replace(/"[^"]*"/g, '"?"')
    .replace(/#\d+/g, '#?')
    .replace(/\b\d+\.?\d*/g, 'N')
    .slice(0, 160);
  return { kind, prop, err: norm };
}

const buckets = new Map<string, Bucket>();
const lines = readFileSync(inPath, 'utf8').split(/\r?\n/);
let total = 0, errors = 0, malformed = 0;
const matchNameHist = new Map<string, number>();

for (const line of lines) {
  if (!line.trim()) continue;
  let rec: WarnRec;
  try { rec = JSON.parse(line); } catch { malformed++; continue; }
  if (rec.k === 'e') errors++; else total++;
  const { kind, prop, err } = classify(rec.m);
  const key = kind + '|' + prop + '|' + err;
  let b = buckets.get(key);
  if (!b) {
    b = { count: 0, kind, prop, err, samples: [] };
    buckets.set(key, b);
  }
  b.count++;
  if (b.samples.length < 3) b.samples.push(rec.m.slice(0, 300));
  if (prop) matchNameHist.set(prop, (matchNameHist.get(prop) ?? 0) + 1);
}

const sorted = [...buckets.values()].sort((x, y) => y.count - x.count);
const topProps = [...matchNameHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);

const report = {
  schema: 'restro-pv.warning-audit/v1',
  source: inPath,
  warnings: total,
  errors,
  malformed,
  distinctBuckets: sorted.length,
  byKind: {} as Record<string, number>,
  buckets: sorted.map((b) => ({ ...b, samples: undefined })),
  samples: Object.fromEntries(sorted.slice(0, 60).map((b, i) => [String(i), b.samples])),
  topProps,
};
for (const b of sorted) report.byKind[b.kind] = (report.byKind[b.kind] ?? 0) + b.count;

const json = JSON.stringify(report, null, 2);
if (outPath) { writeFileSync(outPath, json); console.log('wrote ' + outPath); }
console.log(`warnings=${total} errors=${errors} malformed=${malformed} buckets=${sorted.length}`);
console.log('byKind:', JSON.stringify(report.byKind));
console.log('top buckets:');
for (const b of sorted.slice(0, 25)) console.log(`  ${String(b.count).padStart(6)}  ${b.kind}  ${b.prop}  ${b.err}`);
