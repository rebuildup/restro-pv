# WU manualGates 証拠集約（静止画では証明できない条件）

各 WU の manualGate について、コード/素材/実測による別証拠を記録する。
画像レビューの PASS と併せて初めて WU 受入となる（wu-criteria.json 参照）。

## WU-A — 元輪郭と復元筆画の同一素材・共通座標変換

- **証拠**: `video/src/scenes/SceneA2.tsx` ヘッダコメント（L18-40）+ 実装。
  - ghost = dumped "PV glyph A2" comp の FUDE レイヤー（Restro 自身の出力）
  - 復元筆画 = dumped "bunkai" comp の `STROKE_*_runs4`（SPEC §5 A2 指定）
  - 両者とも `compStrokes()` → `StrokeItem.points`（worldMatrix 適用済み comp 座標）
    → 単一の `fieldTransform` でスクリーンへ写像。FOCUS/OFFSET の目測調整なし。
  - ink centroid 実測 ≈(780,540) screen px で両者一致を確認済み（quantitative
    チェック: verification/wu-a/lz.ts, glyphedge.ts）。
- **素材契約**: tests/stroke-contract.test.ts が bunkai runs4 の SPEC 指定
  ストローク集合（016/015/017）と有限・安定ジオメトリを固定。
- **状態**: 証拠はコード内に存在。受入時に本ファイルへ最終参照を記録する。

## WU-B — 工程表示が Restro の実処理・幾何に基づくこと

- **証拠**: `video/src/scenes/SceneB.tsx`
  - step0: `FUDE outline base` 実シルエット
  - step1: 13 `FUDE S*` ストロークの実輪郭（strokeContours）
  - step2: 実ストローク輪郭ポリゴンの交差から計測した junction マーカー
    （computeJunctions/strokeRings — 任意の頂点抽出ではない）
  - step3: 13 実筆画の分離＋tint
  - analysisGate で各工程を硬く切替
- **状態**: コード上の実測ジオメトリ由来を確認済み。

## WU-C — 3作品が実 Restro 出力であること

- **証拠**: `video/src/scenes/SceneC.tsx` は全作品を
  `compStrokes("Baseline", {pattern:/^FUDE S\d+/})` + `StrokeField` で描画。
  tests/stroke-contract.test.ts が 13 筆画契約を固定。
- **状態**: 構造的に実出力のみ使用。追加の別証拠は不要と判断（要レビュー）。

## WU-D — 録画が実 AE 操作であり架空 UI でないこと

- **証拠**: `verification/wu-d-mat/AUDIT.md` + `SEGMENTS.md`
  - 3録画すべて実 AE 画面収録（Decompose/Merge/Refine パネル判読可能、
    赤アンカー・STROKE_* レイヤー名が実映像内に存在）
  - 区間は全フレームデコードで検証（ffmpeg -ss のシークずれを排除）
  - SceneD.tsx は assets/rec/*.mp4 を <Video> で直接再生。ダミー UI なし。
- **状態**: 実素材性は証明済み。

## WU-E — 回収タイルが実 B/C/D 成果を参照すること

- **証拠**: `video/src/scenes/SceneE.tsx`
  - B tile: `compStrokes("Baseline")` + `tintedStrokes`（実筆画）
  - C tile: 同上の multicolor 実筆画
  - D tile: `assets/rec/e-tile-d.png`（frame-verified decompose-ops 区間の
    実フレーム、verification/wu-d-mat/SEGMENTS.md 由来）
- **状態**: 実コンポ/実素材参照をコードで証明可能。
