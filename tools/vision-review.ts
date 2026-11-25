// Vision review harness: sends frame PNGs to a multimodal LLM and prints the answer.
// Usage: bun tools/vision-review.ts "prompt" img1.png img2.png ...
// Env: MINIMAX_API_KEY (api.minimax.io), model override via VISION_MODEL.
import { readFileSync } from "node:fs";

const [, , prompt, ...files] = process.argv;
if (!prompt || files.length === 0) {
  console.error("usage: bun tools/vision-review.ts <prompt> <image...>");
  process.exit(1);
}
const key = process.env.MINIMAX_API_KEY;
if (!key) throw new Error("MINIMAX_API_KEY not set");
const model = process.env.VISION_MODEL ?? "MiniMax-M3";

const content: unknown[] = [{ type: "text", text: prompt }];
for (const f of files) {
  const b64 = readFileSync(f).toString("base64");
  content.push({
    type: "image_url",
    image_url: { url: `data:image/png;base64,${b64}` },
  });
}
const res = await fetch("https://api.minimax.io/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    reasoning_effort: "low",
    // MiniMax-M3 supports thinking.type="disabled"; without it the whole
    // max_tokens budget can be consumed by reasoning and the answer comes
    // back empty (observed on the r12 holistic review).
    ...(model === "MiniMax-M3" ? { thinking: { type: "disabled" } } : {}),
    messages: [{ role: "user", content }],
    max_tokens: Number(process.env.VISION_MAX_TOKENS ?? 3000),
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
console.log(j.choices?.[0]?.message?.content ?? JSON.stringify(j).slice(0, 2000));
