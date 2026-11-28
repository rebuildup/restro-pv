# 筆画素材契約（Issue #28）

Remotion 側シーンが Restro の筆画素材を消費するための共通契約。
各シーンに sanitize/recolor/座標変換の個別実装を増やさず、
`video/src/scenes/glyph.tsx` の共有 API を通してのみ素材を供給する。

対象コンポ（dump 済み Restro 出力、`video/src/ae/project.ts` 経由）:

| コンポ | 内容 | 主な利用場面 |
|---|---|---|
| `Baseline` | FUDE S01–S13（13 筆画）+ outline base | B 工程、C 作品、E 回収タイル |
| `bunkai` | STROKE_*_runs4/5/6/7 + 解テキスト | A2 SPEC 指定筆画、A3 ブリッジ |
| `PV glyph A2` | FUDE 再エンコード（解グリフ） | A2 元輪郭ゴースト |

## API 契約

- `compStrokes(compName, {pattern|indices, poseT})` → `{comp, strokes}`
  - `StrokeItem.points` は **comp 座標**（shape 頂点 → vector-group 行列
    `groupMatrix` → レイヤー `worldMatrix` の順で写像済み）。
  - `center`/`bbox` も同じ comp 座標系で実測。
- `StrokeField` … 筆画を comp サイズの SVG として描画。可視性・変形は
  `strokeOpacity`/`strokeTransform`/`zIndex` でシーンが所有する。
- `strokeContours` / `strokeRings` … 同一ジオメトリの輪郭線・閉ポリゴン
  （B の工程表示・junction 計測など解析用途。塗りでは構造が見えないため）。
- `ContourField` … 輪郭を stroke 描画する解析用フィールド。
- `cleanShapes`/`sanitizeShapes`/`recolorShapes`/`tintedStrokes`
  … 描画用クローンの paint 正規化。元の dumped `layer.shapes` は変更しない。

## 座標変換の保証

- 全ジオメトリは **comp 座標**で一貫。comp→screen の写像はシーンごとに
  1 つの `fieldTransform`（translate/scale）のみが担う。
  例: `SceneA2.tsx` の `fieldTransform` は ghost と strokes の双方に
  同一適用され、筆画ごとの個別 offset は禁止。
- `worldMatrix` は comp 全レイヤーを参照して親チェーン
  （bunkai の "Null 3 (stroke)" 等）を解決する。部分レイヤー集合での
  計測は禁止（`measureStrokes` が comp.layers 全体を渡す実装で保証）。
- `groupMatrix` の合成順は `shapes.tsx` の SVG 出力と一致
  （translate → rotate → skewX → scale → translate(-anchor)）。
- 過去の障害: `fieldTransform` が panel-local 座標内で絶対スクリーン
  座標を使い +470/+170px ずれていたため、「筆画が描画できない」という
  誤判定が生じた。座標系混同による描画不能判定は無効。
  FOCUS/OFFSET の目測調整を輪郭一致の保証に使わない。

## 輪郭 ↔ 復元筆画の対応保証（A2 の登録契約）

- **同一素材由来**: ghost（PV glyph A2 の FUDE 層）と復元筆画
  （bunkai の STROKE_*_runs4）は、いずれも Ae_Restro が同一ソース
  グリフ「解」を分解した出力。SPEC §5 A2 が runs4 の
  016/015/017 を指定。
- **同一スクリーン配置**: A1 中、master 上で bunkai（layer 255）と
  PV A2（layer 11）はともに worldMatrix = identity。ink マスク登録で
  両者の centroid がともに ~(780,540) screen px、identity が
  scale 0.5–1.5 で最適 — 追加オフセット不要を実測確認
  （verification/wu-a/lz.ts, glyphedge.ts）。
- **テスト固定**: `tests/stroke-contract.test.ts` が
  Baseline FUDE=13 筆画、bunkai runs4 SPEC 指定セット、有限・安定
  ジオメトリを pin する。

## 描画可能性の契約

- dumped 筆画層は paint props（fill/stroke opacity, trim, color）を
  キーアニメーションしており、静止 poseT では不可視になり得る。
  `sanitizeShapes` が opacity=100・trim=rest・色キー解除のクリーンな
  クローンを作り、可視性はシーン側の `strokeOpacity` が担う。
- `recolorShapes`/`tintedStrokes` は複製にのみ適用し、dumped 原本を
  汚染しない。
- 「この筆画は描画できない」という判定は、座標変換が正しいことを
  確認した上でのみ有効。別筆画への置き換えは、同じ復元の意味を
  実形状から証明できる場合に限る。

## 非目標・既知の限界

- 完全な AE 互換ではない。式サブセット・マスク・ネスト comp の
  クリップ挙動など未対応領域がある（WU-INT で
  `overflow: visible` の comp 境界外はみ出しを確認済み）。
- 各シーンの演出（集約・分離・色・タイミング）は本契約の対象外。
  素材の供給と座標の保証のみを扱う。
