# 機械可読コンポジションデータ（Issue #32 §1）

`pv/generated/*.ts` ダンプを正本とし、個別素材と元コンポジション空間の対応を機械利用できる形で保持する。**手編集禁止 — すべて `tools/design/export-compositions.ts` の生成物**。

## ファイル一覧

| ファイル | 内容 | 正本ソース |
|---|---|---|
| `kai-stroke-runs-2d.composition.json` | 「解」bunkai comp 全要素（`STROKE_*` 14層＝直線4v画9本＋曲線ベジェ画5本＋未分解 `merged shape` 2層＋テキスト）。すべて実「解」グリフ構成要素 | `pv/generated/02-bunkai.ts` |
| `kai-runs4-3d.composition.json` | master comp runs4（A1, 0–1.5s）。3D Null3 `[238]` 基準空間変換 `toReferenceSpace` 付 | `pv/generated/05-master.ts` |
| `kai-runs5-3d.composition.json` | master comp runs5（A3, 15.17–16.67s）。3D Null3 `[214]` 配下 | 同上 |
| `kai-runs6-3d.composition.json` | master comp runs6（E, 17–18.5s）。3D Null3 `[196]` 配下 | 同上 |
| `kai-zoom.composition.json` | kai-zoom comp。一体輪郭 `merged shape`（487v・6複合サブパス `evenodd` で「角」4孔抜き＋左上「ク」切り欠き）＋上重ねズーム画 | `pv/generated/04-kai-zoom.ts` |
| `pv-glyph-fude.composition.json` | 「筆」**無変位 rest ポーズ正本**（`1400×1080`、S01–S13＋outline base/inset、`pos == ap`、同一空間 `IoU = 0.9998`） | `pv/generated/06-PV glyph.ts` |
| `fude-decomposition.composition.json` | 「筆」Baseline（`1080×1080`、S01–S13＋元輪郭、CTI 焼き込み `0.7278×m[k]` ＋右端1080はみ出しあり） | `pv/generated/01-Baseline.ts` |
| `heading.composition.json` | 見出しテキストレイヤー（ZenKakuGothicAntique 等） | `pv/generated/43-Heading.ts` |
| `description.composition.json` | 解説テキスト全35レイヤー（JP/EN） | `pv/generated/03-description.ts` |
| `logo.composition.json` | ロゴ全46レイヤー（`effects` Fill 色オーバーライド・赤6層情報保持） | `pv/generated/46-Logo.ts` |

## スキーマ要点（`restro-pv/composition@2`）

- `elements[]`: 各レイヤーの `index/name/kind/in-out/parentIndex/threeDLayer`、**全トランスフォームプロパティの式・キー付き生ダンプ**（`expression`・`separatedPosition` 保持）、`effects`（`ADBE Fill` 等）、マスク、テキスト仕様、シェイプ項目（ネストされた `ADBE Vector Group` 累積チェーン `groupTransforms[]` と合成2D行列 `localMatrix`・`paintScopeKey` 保持）、`shapeHash`。
- `evals[]`: キー時刻／式駆動マイルストーン／`in..mid..out` での評価済みトランスフォーム、`relToParent`（直接の親ローカル空間）、**`toReferenceSpace`**（`referenceSpaceLayerIndex` 基準空間への厳密変換行列）および `anchorInReferenceSpace`。
- 座標系・行列規約・重なり順（AE index 小＝手前）は JSON 内 `conventions` を参照。行列は `video/src/ae/mat4.ts` と同一の列優先。

## 再構成・検証結果（クロップ／拡大補正なしの同一空間厳密評価）

1. **構成データのみからの再構成**: `verify-assembly.ts` は元 TS ダンプを直接読まず、`docs/design/data/*.composition.json` と `docs/design/assets/individual/**/*.svg` のみから同一非クリップ座標系（`1800×1400`）で組み上がり IoU を検証する。
2. **検証値（[`../verification/assembly-metrics.json`](../verification/assembly-metrics.json)）**:
   - **「筆」rest 正本（`06-PV glyph` vs `FUDE outline base`）**: 同一空間非クリップ **`IoU = 0.9998`**（`interPx = 250434`, `onlyAssembledPx = 26`, `onlyOutlinePx = 32`）→ [`fude-rest-diff.png`](../verification/fude-rest-diff.png)。
   - **「筆」`01-Baseline`（`t=0`）**: `IoU = 0.7310`（1080クリップ `0.7423`）— ダンプ時 CTI での式変位 `~0.7278×m[k]` が `Position.value` に焼き込まれていた未解消事象として原因特定済。
   - **「解」`runs4` 全16層 vs `kai-zoom [20]`**: 全16層 `recallOfOutline = 0.9999` (`IoU = 0.8865`)、左上「ク」3画（`STROKE_000/001/002`）除外 13層で **`IoU = 0.9999`** → [`kai-runs4-vs-zoom-diff.png`](../verification/kai-runs4-vs-zoom-diff.png)。

## 再生成

```sh
bun tools/design/export-compositions.ts   # data/*.composition.json (10件, composition@2)
bun tools/design/verify-assembly.ts       # verification/assembly-metrics.json + diff PNG
bun tools/design/verify-3d-space.ts       # verification/3d-projection-check.png
bun tools/design/verify-local-motion.ts   # verification/local-motion-check.json
bun tools/design/motion-figures.ts        # diagrams/motion-*-onion.svg/.png (3種)
bun tools/design/render-grid.ts           # assets/background-grid-plane.svg/.png
```
