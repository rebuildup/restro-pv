# Remotion 制作経路（正本）

ADR-0003 に基づく PV 映像の主経路。TypeScript/React を正本とし、
`pv/generated/` の CompSpec ダンプ（`legacy/pv-2dc99e1.aep` 由来）を
解釈して 1080×1080 / 24fps / 480f / 20s の MP4 を直接レンダリングする。

## 構成

**確定レイアウトと可変範囲（Issue #30 正本）**：サムネイルのデザインと
旧制作のレイアウト構成（共通背景・グリッド、ブランド、左情報領域、
右コンテンツ領域、全体の配置・視覚的階層・スケール関係）は**確定事項**。
通常制作で編集できるのは**右側コンテンツのみ**。詳細と回収記録は
`docs/issue30-recovery.md` を参照。

- `video/src/Root.tsx` — Remotion composition 登録。`PV-Master` が唯一の
  正式エントリ。`PV-Chrome`/`PV-Comp`/`PV-Comp-Description` はデバッグ用。
  拒否された pv-full 系列（`video/src/rejected/pv-full/`）は登録しない
- `video/src/PvVideo.tsx` — `PvChromeBase` → `PvStage` → `PvLeftGuard` →
  `PvChromeOverlay` の4平面合成のみを行う薄い殻
- `video/src/layout/` — 確定レイアウトの単一権威
  - `Chrome.tsx` — dumped `master` CompSpec の再生（`ae/masterPatch.ts`
    の制作パッチ適用）+ `LeftCopy`。シーン入力を一切受けない。
    保護は3つの合成平面で実現する：
    - `PvChromeBase` — protected chrome を除く master 全体（下地）
    - `PvLeftGuard` — 確定背景（grid/white/quad、`BACKGROUND_MASTER_LAYERS`）
      のみを左カラム x<460 にクリップして再描画
    - `PvChromeOverlay` — protected chrome（`PROTECTED_MASTER_LAYERS`：
      description 列・ブランドロックアップ・マット源）+ `LeftCopy` を
      最前面に再描画
  - `LeftCopy.tsx` — 左カラムの時間的コピー切替（D/E の authored 分。
    残りは dumped `description` comp が担う）
  - `Stage.tsx` — 右ステージ・スロット。`STAGE_SCENES` レジストリ経由でのみ
    シーンをマウントする明示的な接続面
  - `zones.ts` — ゾーン定数（左カラム x<460、右ステージ x≥480、安全帯）
- `video/src/ae/` — CompSpec インタプリタ
  - `project.ts` — comp/footage 解決、matte ペア対応
  - `layer.tsx` — レイヤー種別・変換・マスク・トラックマット・ネスト comp
  - `shapes.tsx` — AE ベクターシェイプ → SVG
  - `eval.ts` / `expr.ts` — プロパティ評価・式の限定解釈
  - `transform.ts` / `mat4.ts` — 2D/3D 変換
  - `masterPatch.ts` — master への制作パッチ（tab 分割、STEP_REVEAL、
    シーン別非表示窓、LEFT_COLUMN 系コピー整形）
- `video/src/scenes/` — 右ステージ・コンテンツのみ（SceneA2/B/C/D/E）。
  各シーンは `{ t }` のみを受け取り、共通レイアウト・左領域・ブランド・
  背景を所有・上書きしない。契約は `tests/pv-layout-contract.test.ts` で検証

境界の原則：シーンは画面上どこにでも描画してよい（意図的な領域外展開は
保持）が、**所有権**は layout/ にある。右コンテンツの差し替えで
背景・左領域・ブランドの構成が変化しないことは、ガード/オーバーレイの
合成順で構造保証される（Chrome はシーンに依存しない）。左カラム
x<460 の画素は PV-Master と PV-Chrome の差分で常時検証できる
（`bun tools/verify-layout.ts`、閾値 SSIM≥0.999）。

## コマンド

```sh
bun install --frozen-lockfile

# 型検査
bun tsc -p tsconfig.json --noEmit

# スチル（代表フレーム確認）
cd video
bunx remotion still src/index.ts PV-Master ../.tmp/f000.png --frame=0

# レイアウト契約のピクセル検証（PV-Master vs PV-Chrome、左領域 SSIM）
bun tools/verify-layout.ts

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
