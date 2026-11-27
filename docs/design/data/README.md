# 機械可読コンポジションデータ（Issue #32 §1）

`pv/generated/*.ts` ダンプを正本とし、個別素材と元コンポジション空間の対応を機械利用できる形で保持する。**手編集禁止 — すべて `tools/design/export-compositions.ts` の生成物**。

## ファイル一覧

| ファイル | 内容 | 正本ソース |
|---|---|---|
| `kai-stroke-runs-2d.composition.json` | 「解」bunkai comp 全要素（runs4/runs5 プロキシ群＋merged parts＋解テキスト）。`STROKE_*` は 4〜13 頂点のプロキシ図形でグリフ筆画ではない | `pv/generated/02-bunkai.ts` |
| `kai-runs4-3d.composition.json` | master comp runs4（A1, 0–1.5s）。3D Null3 `[238]` 配下 | `pv/generated/05-master.ts` |
| `kai-runs5-3d.composition.json` | master comp runs5（A3, 15.17–16.67s）。3D Null3 `[214]` 配下 | 同上 |
| `kai-runs6-3d.composition.json` | master comp runs6（E, 17–18.5s）。3D Null3 `[196]` 配下 | 同上 |
| `kai-zoom.composition.json` | kai-zoom comp。一体輪郭 `merged shape`（487 頂点）＋ズーム用プロキシ | `pv/generated/04-kai-zoom.ts` |
| `fude-decomposition.composition.json` | 「筆」実筆画分解 S01–S13＋merged＋元輪郭 base/inset | `pv/generated/01-Baseline.ts` |
| `heading.composition.json` | 見出しテキストレイヤー（ZenKakuGothicAntique 等） | `pv/generated/43-Heading.ts` |
| `description.composition.json` | 解説テキスト全35レイヤー（JP/EN） | `pv/generated/03-description.ts` |
| `logo.composition.json` | ロゴ全46レイヤー | `pv/generated/46-Logo.ts` |

## スキーマ要点（`restro-pv/composition@1`）

- `elements[]`: 各レイヤーの `index/name/kind/in-out/parentIndex/threeDLayer`、**全トランスフォームプロパティのキー付き生ダンプ**（`transform.props`）、式の有無（`hasExpression`）、マスク、テキスト仕様、シェイプ項目（パス頂点・接線・塗り/線、ベクター変換）、`shapeHash`（同一性確認用 sha1）。
- `evals[]`: コンペ時間 `in+0.05 / 中点 / out-0.05` での評価済みトランスフォーム、`relToParent`（親ローカル空間への 16 要素列優先 Mat4）、`world`（コンポ空間 Mat4）。式駆動プロパティも `eval.ts` 経由で評価済み。
- `space`: 組み上がり基準空間。kai 各ランは各 Null3、fude/文字系はコンポ空間。
- 座標系・行列規約・重なり順（AE index 小＝手前）は JSON 内 `conventions` を参照。行列は `video/src/ae/mat4.ts` と同一の列優先。

## 再構成方法

1. 要素のシェイプ `path`（頂点・接線）にベクター変換 → `evals[].relToParent`（親空間）または `world`（コンポ空間）の Mat4 を適用。
2. 組み上がり状態＝同一 `t` で全要素を同一空間へ写像したもの。手動の座標補正は不要。
3. 検証値：[`../verification/assembly-metrics.json`](../verification/assembly-metrics.json)（「筆」実筆画和集合 vs 元輪郭の正規化 IoU ≈ 0.75 で全時刻安定。「解」はプロキシ図形のため筆画再構成比較は非対象 — merged parts vs 一体輪郭 IoU ≈ 0.18 を記録）。

## 再生成

```sh
bun tools/design/export-compositions.ts   # data/*.composition.json
bun tools/design/verify-assembly.ts       # verification/assembly-metrics.json
bun tools/design/motion-figures.ts        # diagrams/motion-*-onion.svg
bun tools/design/render-grid.ts           # assets/background-grid-plane.svg/.png
```
