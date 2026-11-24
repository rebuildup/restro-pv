// WU-Q independent review harness.
//
// Sends an ORDERED frame series plus an explicit requirement checklist to a
// multimodal model and records the verdict as durable evidence. This is the
// evaluation path required by SPEC §11 / user feedback: per-requirement
// pass/fail, real frame<->time mapping, recorded model/prompt/frames, and
// re-review after fixes — independent of the implementer's self-assessment.
//
// Usage:
//   bun tools/wu-review.ts <manifest.json>
//
// Manifest shape:
//   {
//     "id": "wu-c-r1",               // review round id (dir under verification/reviews/)
//     "scene": "C",                  // work unit
//     "subject": "scene C strip",    // what is being judged
//     "frames": [                    // ordered; "frame" is the PV-Master frame no.
//       { "file": "verification/x/f200.png", "frame": 200, "note": "work1 dwell" }
//     ],
//     "requirements": [              // each judged independently
//       "3作品が内容と動きの異なる完成した映像作品として見える",
//       "..."
//     ],
//     "context": "optional extra facts for the reviewer"
//   }
//
// Output: prints verdict; appends JSONL record to
//   verification/reviews/<id>.jsonl  and a human summary <id>.md
// Env: MINIMAX_API_KEY, VISION_MODEL (default MiniMax-M3.1-Flash)
import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("usage: bun tools/wu-review.ts <manifest.json>");
  process.exit(1);
}
const m = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  id: string;
  scene: string;
  subject: string;
  frames: { file: string; frame: number; note?: string }[];
  requirements: string[];
  context?: string;
};
const key = process.env.MINIMAX_API_KEY;
if (!key) throw new Error("MINIMAX_API_KEY not set");
const model = process.env.VISION_MODEL ?? "MiniMax-M3.1-Flash";

const frameList = m.frames
  .map((f, i) => `画像${i + 1}: frame ${f.frame}${f.note ? ` (${f.note})` : ""} — ${f.file}`)
  .join("\n");

const prompt = `You are an independent video-quality reviewer for a Japanese promo PV (1080x1080, 24fps). You are judging ${m.scene} — ${m.subject}. The images below are an ORDERED frame series (image N corresponds to the frame number listed). ${m.context ?? ""}

Judge EACH requirement independently against the SPEC criteria. Do not pass an item merely because the element exists — judge whether it fulfills its purpose as video. Call out obvious breakage, cheapness, pointlessness, or technical-demo feel explicitly.

Requirements:
${m.requirements.map((r, i) => `${i + 1}. ${r}`).join("\n")}

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

const dir = join("verification", "reviews", m.id);
mkdirSync(dir, { recursive: true });
const ts = new Date().toISOString();
appendFileSync(
  join(dir, "reviews.jsonl"),
  JSON.stringify({
    ts,
    model,
    scene: m.scene,
    subject: m.subject,
    frames: m.frames.map((f) => ({ file: f.file, frame: f.frame, note: f.note })),
    requirements: m.requirements,
    verdict,
  }) + "\n",
);
writeFileSync(join(dir, `${ts.replace(/[:.]/g, "-")}.md`), `# ${m.id} — ${m.scene} ${m.subject}\n\n${verdict}\n`);
console.log(verdict);
console.log(`\n[recorded] verification/reviews/${m.id}/`);
