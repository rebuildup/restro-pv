# Remotion 制作経路（正本）

ADR-0003 に基づく PV 映像の主経路。TypeScript/React を正本とし、
`pv/generated/` の CompSpec ダンプ（`legacy/pv-2dc99e1.aep` 由来）を
解釈して 1080×1080 / 24fps / 480f / 20s の MP4 を直接レンダリングする。

## 構成

- `video/src/Root.tsx` — Remotion composition 登録（`PV-Master` が正本、
  `PV-Comp`/`PV-Comp-Description` はデバッグ用）
- `video/src/PvVideo.tsx` — master CompSpec の再生 + `LeftCopy` オーバーレイ
- `video/src/ae/` — CompSpec インタプリタ
  - `project.ts` — comp/footage 解決、matte ペア対応
  - `layer.tsx` — レイヤー種別・変換・マスク・トラックマット・ネスト comp
  - `shapes.tsx` — AE ベクターシェイプ → SVG
  - `eval.ts` / `expr.ts` — プロパティ評価・式の限定解釈
  - `transform.ts` / `mat4.ts` — 2D/3D 変換
  - `masterPatch.ts` — master への制作パッチ（tab 分割、STEP_REVEAL、
    LEFT_COLUMN_REPLACED）
- `video/src/scenes/LeftCopy.tsx` — シーン別の左カラムコピー

シーン本体（A2/C/D/E）は dumped コンポをそのまま使う（ADR-0005 改訂）。
dumped で表現できない演出が必要になった場合のみ `video/src/scenes/` に
React オーバーレイを追加し、`masterPatch.ts` の時間窓で退避させる。

## コマンド

```sh
bun install --frozen-lockfile

# 型検査
bun tsc -p tsconfig.json --noEmit

# スチル（代表フレーム確認）
cd video
bunx remotion still src/index.ts PV-Master ../.tmp/f000.png --frame=0

# フルレンダー（20秒 / 音声付き）
bunx remotion render src/index.ts PV-Master ../verification/pv-remotion-vN.mp4 \
  --codec=h264 --audio-codec=aac
```

- BGM は master の footage レイヤー（`assets/audio/…mp3`）から AE レイヤー
  時間 semantics で再生される。mp3 の単体配布は禁止（AGENTS.md Safety）。
- レンダリングは `video/` を cwd として実行する（public dir は `assets/` への
  junction）。

## 検証

- 成果物の確認: `ffmpeg -i <mp4>` で 1080×1080 / 24fps / AAC を確認
- 代表フレームは `verification/v6-frames/` の方式でシーン境界・工程進行・
  終了カードを網羅する
- AE 実機経路（`bun run generate` → `verify` → `render:beats`）は ADR-0003
  第3項どおり保全のみ。PV 完成の必須条件ではない
