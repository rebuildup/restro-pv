// WU-Q independent review harness v2.
//
// Sends an ORDERED frame series plus FIXED acceptance criteria to a
// multimodal model and records the verdict as durable evidence. Requirements
// are loaded from verification/criteria/wu-criteria.json (versioned, tied to
// SPEC §5/§8/§11 and user feedback) — the implementer cannot shrink them
// through the manifest. A review only counts toward WU acceptance when every
// fixed criterion receives a verdict; partial evaluation cannot pass.
//
// Usage:
//   bun tools/wu-review.ts <manifest.json>
//
// Manifest shape:
//   {
//     "id": "wu-d-r23",               // review round id (dir under verification/reviews/)
//     "wu": "WU-D",                   // work unit — selects fixed criteria
//     "subject": "scene D ops windows", // what is being judged
//     "frames": [                     // ordered; "frame" is the PV-Master frame no.
//       { "file": "verification/x/f300.png", "frame": 300, "note": "W1 mid" }
//     ],
//     "context": "optional extra facts for the reviewer"
//   }
//
// series-kind criteria require >=3 ordered frames; the verdict must address
// temporal development, not mere element presence.
//
// Evidence recorded per review (verification/reviews/<id>/reviews.jsonl):
//   ts, model, sourceSha (git HEAD), criteriaVersion + criteriaSha256,
//   frames[{file, frame, sha256}], per-criterion verdicts parsed from the
//   response, overall PASS only if all criteria PASS.
// Env: MINIMAX_API_KEY, VISION_MODEL (default MiniMax-M3.1-Flash)
import { readFileSync, appendFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { join } from "node:path";

const CRITERIA_PATH = "verification/criteria/wu-criteria.json";
const MIN_SERIES_FRAMES = 3;

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("usage: bun tools/wu-review.ts <manifest.json>");
  process.exit(1);
}
const m = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  id: string;
  wu?: string;
  scene?: string; // legacy manifests used scene: "D" etc.
  subject: string;
  frames: { file: string; frame: number; note?: string }[];
  context?: string;
};
const wu = m.wu ?? (m.scene ? `WU-${m.scene}` : undefined);
if (!wu) {
  console.error("manifest needs \"wu\" (or legacy \"scene\")");
  process.exit(1);
}

// --- Load fixed criteria (cannot be overridden by the manifest) ---
const criteriaRaw = readFileSync(CRITERIA_PATH);
const criteria = JSON.parse(criteriaRaw.toString()) as {
  version: string;
  common?: { id: string; kind: "frame" | "series"; text: string; source: string }[];
  manualGates?: Record<string, string[]>;
  criteria: Record<string, { id: string; kind: "frame" | "series"; text: string; source: string }[]>;
};
// Common criteria (SPEC §4/§8, design-baseline) apply to EVERY work unit —
// merging them here prevents per-WU requirement gaps.
const wuReqs = criteria.criteria[wu];
if (!wuReqs || wuReqs.length === 0) {
  console.error(`no fixed criteria for wu "${wu}" in ${CRITERIA_PATH}`);
  process.exit(1);
}
const reqs = [...(criteria.common ?? []), ...wuReqs];
const manualGates = criteria.manualGates?.[wu] ?? [];
const needsSeries = reqs.some((r) => r.kind === "series");
if (needsSeries && m.frames.length < MIN_SERIES_FRAMES) {
  console.error(
    `${wu} has series-kind criteria; need >=${MIN_SERIES_FRAMES} ordered frames, got ${m.frames.length}`,
  );
  process.exit(1);
}

const sha256 = (buf: Buffer | string) => createHash("sha256").update(buf).digest("hex");
const sourceSha = (() => {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
})();
const criteriaSha = sha256(criteriaRaw);

const key = process.env.MINIMAX_API_KEY;
if (!key) throw new Error("MINIMAX_API_KEY not set");
const model = process.env.VISION_MODEL ?? "MiniMax-M3.1-Flash";

const frameList = m.frames
  .map((f, i) => `画像${i + 1}: frame ${f.frame}${f.note ? ` (${f.note})` : ""} — ${f.file}`)
  .join("\n");

const seriesNote = needsSeries
  ? `\nSeveral requirements concern TEMPORAL development (kind=series). Judge them from the ordered frame series: element presence alone is NOT sufficient — require visible change/progression across the frames.`
  : "";

const prompt = `You are an independent video-quality reviewer for a Japanese promo PV (1080x1080, 24fps). You are judging work unit ${wu} — ${m.subject}. The images below are an ORDERED frame series (image N corresponds to the frame number listed). ${m.context ?? ""}${seriesNote}

Judge EACH requirement independently against the fixed acceptance criteria (derived from docs/SPEC.md §5/§8/§11 and user feedback). Do not pass an item merely because the element exists — judge whether it fulfills its purpose as video. Call out obvious breakage, cheapness, pointlessness, technical-demo feel, or unauthorized element removal explicitly.

Requirements:
${reqs.map((r, i) => `${i + 1}. [${r.kind}] ${r.text}`).join("\n")}

Respond in Japanese, in EXACTLY this format:
## 総合判定
PASS または FAIL（1行理由）
## 要件別
1. PASS|FAIL — 理由（実フレーム番号を引用）
2. ...
## 具体的な問題点
- 箇条書き（なければ「なし」）
## 修正提案
- 箇条書き（なければ「なし」)`;

const content: unknown[] = [{ type: "text", text: prompt + "\n\n" + frameList }];
for (const f of m.frames) {
  if (!existsSync(f.file)) {
    console.error(`missing frame file: ${f.file}`);
    process.exit(1);
  }
  content.push({
    type: "image_url",
    image_url: { url: `data:image/png;base64,${readFileSync(f.file).toString("base64")}` },
  });
}

const res = await fetch("https://api.minimax.io/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    reasoning_effort: "low",
    messages: [{ role: "user", content }],
    max_tokens: Number(process.env.VISION_MAX_TOKENS ?? 4000),
  }),
});
const j = (await res.json()) as {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};
if (j.error) {
  console.error("API error:", j.error.message);
  process.exit(1);
}
const verdict = j.choices?.[0]?.message?.content ?? "";

// --- Parse per-requirement verdicts; incomplete evaluation cannot pass ---
const perReq: { id: string; verdict: "PASS" | "FAIL" | "MISSING"; text: string }[] = reqs.map((r, i) => {
  const re = new RegExp(`^${i + 1}\\.\\s*(PASS|FAIL|INCOMPLETE)`, "m");
  const match = verdict.match(re);
  const v = match?.[1];
  return {
    id: r.id,
    verdict: v === "PASS" ? "PASS" : v === "FAIL" ? "FAIL" : "MISSING",
    text: r.text,
  };
});
const missing = perReq.filter((p) => p.verdict === "MISSING").map((p) => p.id);
const anyFail = perReq.some((p) => p.verdict === "FAIL");
const outcome = missing.length > 0 ? "INCOMPLETE" : anyFail ? "FAIL" : "PASS";

// --- Record evidence ---
const dir = join("verification", "reviews", m.id);
mkdirSync(dir, { recursive: true });
const ts = new Date().toISOString();
const record = {
  ts,
  model,
  wu: wu,
  subject: m.subject,
  sourceSha,
  criteriaVersion: criteria.version,
  criteriaSha256: criteriaSha,
  outcome,
  perRequirement: perReq,
  missingVerdicts: missing,
  manualGates,
  manualGatesNote:
    "manualGates cannot be proven by stills; WU acceptance additionally requires separate code/material evidence for each gate.",
  frames: m.frames.map((f) => ({
    file: f.file,
    frame: f.frame,
    note: f.note,
    sha256: sha256(readFileSync(f.file)),
  })),
  verdict,
};
appendFileSync(join(dir, "reviews.jsonl"), JSON.stringify(record) + "\n");
writeFileSync(
  join(dir, `${ts.replace(/[:.]/g, "-")}.md`),
  `# ${m.id} — ${wu} ${m.subject}\n\n` +
    `- ts: ${ts}\n- model: ${model}\n- sourceSha: ${sourceSha}\n` +
    `- criteria: v${criteria.version} sha256:${criteriaSha}\n` +
    `- outcome: **${outcome}**\n` +
    (manualGates.length
      ? `- manualGates pending (${manualGates.length}): image review cannot prove these; separate evidence required\n`
      : "") +
    `\n${verdict}\n`,
);
console.log(verdict);
console.log(`\n[evidence] ${outcome} | ${perReq.filter((p) => p.verdict === "PASS").length}/${reqs.length} criteria PASS${missing.length ? ` | MISSING verdicts: ${missing.join(",")}` : ""}`);
console.log(`[recorded] verification/reviews/${m.id}/`);
process.exit(outcome === "PASS" ? 0 : 1);
