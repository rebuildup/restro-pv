// Video+image review harness: sends an actual MP4 (video_url content part,
// server-side frame sampling) plus optional stills to MiniMax-M3.
// Usage: bun tools/video-review.ts "prompt" clip.mp4 [img1.png ...]
// Env: MINIMAX_API_KEY, VISION_MODEL (default MiniMax-M3), VIDEO_FPS (default 3)
import { readFileSync } from "node:fs";

const [, , prompt, video, ...files] = process.argv;
if (!prompt || !video) {
  console.error("usage: bun tools/video-review.ts <prompt> <video.mp4> [image...]");
  process.exit(1);
}
const key = process.env.MINIMAX_API_KEY;
if (!key) throw new Error("MINIMAX_API_KEY not set");
const model = process.env.VISION_MODEL ?? "MiniMax-M3";
const fps = process.env.VIDEO_FPS ?? "3";

const content: unknown[] = [{ type: "text", text: prompt }];
const v = readFileSync(video);
content.push({
  type: "video_url",
  video_url: {
    url: `data:video/mp4;base64,${v.toString("base64")}`,
    fps: Number(fps),
  },
});
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
    ...(model === "MiniMax-M3" ? { thinking: { type: "disabled" } } : {}),
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
console.log(j.choices?.[0]?.message?.content ?? "(empty response)");
