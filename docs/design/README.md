# Restro PV 表現・構造設計パッケージ（Issue #32 正本）

> **位置づけ**: 本ディレクトリ（`docs/design/`）は、[GitHub Issue #32](https://github.com/rebuildup/restro-pv/issues/32) の要求に基づき、元 After Effects プロジェクト（`legacy/pv-2dc99e1.aep`・`pv/generated/*.ts`）、初期参照 AEP（`legacy/pv-8495026.aep` / `verification/beats/` / `verification/pv-review.mp4`）、確定サムネイル（`assets/images/samune-v1-master.png`）、各種実筆画データ・実操作録画を一次検証して再構築した、**後続の本制作・検証の根拠となる表現・構造設計のモジュール文書群**である。
>
> **上位境界**: [docs/issue30-recovery.md](../issue30-recovery.md)（サムネイル・共通背景・パースグリッド・左ブランドロックアップ・左カラム領域は確定事項として維持し、編集対象は右側ステージ表現とする）。なお、確定済み設計と現行 Remotion 実装（`video/src/`）の間に見られる乖離は各文書で事実として切り分け、修正計画の判断材料として記録している。

---

## 記述ステータスの厳密な区分（凡例）

本設計パッケージの全ファイルでは、既知の事実と推定・理想設計・未解決課題を混同しないため、以下のラベルを明示して記述する。

| ラベル | 意味 | 根拠例 |
|---|---|---|
| **`[回収事実 / 実測値]`** | AEP ダンプ（`pv/generated/*.ts`）、実画像・実動画・現行コードから直接計測・確認した一次事実 | `Grid Width=54`、`05-master.ts` のキー時刻、`Ae.png` `240×234` |
| **`[導出・推定]`** | 回収事実の変換行列・親子関係・式構造から論理的に導出した構造意図・補完設計 | `P` ノードの `Scale=12%` が 12px ガター基準点として設計されている機構 |
| **`[理想的表現構想]`** | 現行実装の都合を離れ、PV 作品として本来達成すべき表現・空間・時間・因果設計 | C の3異なる作例分離、D の単一コンポ内因果収録、E の左右役割分担 |
| **`[確定事項と現行Remotion実装の乖離]`** | 元 AEP 構造や Issue #30 確定事項と、現行 `video/src/` の実装との差異 | `LeftCopy.tsx` 固定 `top` 値、`SceneB.tsx` の固定4行化、`SceneD.tsx` の合成動画流用 |
| **`[未確定・不足事項]`** | 既存資産のみでは充足せず、新規収録・新規素材化・オーナー決定が必要な要素 | 新規 AE 操作収録、C 用の新規漢字、スタンドアロン製品アイコンの不在 |
| **`[不採用・履歴]`** | #29/#31・`pv-full`・`6179443` の局所案、および旧 `pv-expression-blueprint.md` の「確定」扱い | 本パッケージによる置き換え・修正対象 |

---

## ドキュメント構成（Issue #32 A〜G・品質保証対応）

| ファイル | 対象カテゴリ | 主な内容 | 主な図版・書き出し資産 |
|---|---|---|---|
| [01-theme-tokens.md](./01-theme-tokens.md) | **A. テーマトークン** | Source Float vs 合成後 sRGB 実測色、タイポ階層、線・面の役割色（共通 vs 場面例外）、現行 Remotion 色乖離 | [01-color-and-typo-tokens.png](./diagrams/01-color-and-typo-tokens.png), [ae-app-icon.png](./assets/ae-app-icon.png) |
| [02-layout-and-grid.md](./02-layout-and-grid.md) | **B. 構造レイアウト** | `kg_LayoutGrid` 12×24、`P` 12% ガターリグ、`Linked Quad 1..11`、3D 製図面（`Z=245, Y=20°`）と 2D 空間の分離 | [layout-kg-grid-overlay.png](./assets/layout-kg-grid-overlay.png), [02-layout-parent-rig.png](./diagrams/02-layout-parent-rig.png), [background-grid-plane.png](./assets/background-grid-plane.png) |
| [03-assets-catalog.md](./03-assets-catalog.md) | **C. 実アセット／単体書出し目録** | `Ae.png`、`Logo`（45層内訳）、`解` 16層、`筆` 13画＆輪郭、`STEP1..4` 中間データ、`PV end` の個別クリーン書き出し＋不在素材 | [logo-full.png](./assets/logo-full.png), [logo-layers-breakdown.png](./assets/logo-layers-breakdown.png), [kai-strokes-exploded.png](./assets/kai-strokes-exploded.png), [fude-strokes-exploded.png](./assets/fude-strokes-exploded.png), [step1-4-intermediates.png](./assets/step1-4-intermediates.png) |
| [04-structural-timesheet.md](./04-structural-timesheet.md) | **D. 全体構造変化のタイムシート** | 全 480f / 20s / 128 BPM、左カラムの中央集合↔上下分離の連続遷移（Title→Explain→End）、右ステージ全場面の因果連鎖 | [03-structural-timesheet.png](./diagrams/03-structural-timesheet.png) |
| [05-cards-and-sheets.md](./05-cards-and-sheets.md) | **E. カード／シート系表現** | B アコーディオン（`P19..23` × `STEP 1..4` × `300%` レンズ）、C の「窓・スクロール・作例」3層分離、D の4窓マット構造と改善設計 | [04-accordion-and-cards.png](./diagrams/04-accordion-and-cards.png) |
| [06-recordings-audit.md](./06-recordings-audit.md) | **F. 個別の録画素材監査** | 既存録画 6本（`ae-decompose-ops` 他・`wu-d-live`）の解像度・UI 実態・可否判定と、D 再収録・見切れ解消の具体仕様 | [05-recordings-audit-sheet.png](./diagrams/05-recordings-audit-sheet.png) |
| [07-motion-design.md](./07-motion-design.md) | **G. モーション設計** | 巨大「解」`runs4` 非対称キー（`f0→f9→f45`）と `bunkai`、「筆」放射式、反単調性の定量ルールと定性レビュー基準 | [06-motion-curves-and-vectors.png](./diagrams/06-motion-curves-and-vectors.png) |
| [08-quality-assurance.md](./08-quality-assurance.md) | **品質保証・受入基準** | 対象ごとの計算/構造検証 vs 視覚/時間人間レビューの分離、上位規則→子変換導出確認、アンチケース照合表・完了ゲート | [08-quality-assurance.md](./08-quality-assurance.md) |

---

## 書き出し済み視覚資産・構造図版マニフェスト

### 単体アセット・成分書き出し（`docs/design/assets/`）

| SVG (正本) | PNG (目視確認済) | 抽出ソース | 用途 |
|---|---|---|---|
| — | [ae-app-icon.png](./assets/ae-app-icon.png) | `assets/images/Ae.png` (240×234) | Adobe AE アプリバッジ（左ブランド上部のみ使用） |
| [logo-full.svg](./assets/logo-full.svg) | [logo-full.png](./assets/logo-full.png) | `pv/generated/46-Logo.ts` (45層) | 公式ブランド `Logo` コンポ（416×260、意匠原型） |
| [logo-layers-breakdown.svg](./assets/logo-layers-breakdown.svg) | [logo-layers-breakdown.png](./assets/logo-layers-breakdown.png) | `pv/generated/46-Logo.ts` | 赤アクセント6層／黒32層／部品7層の構成分解 |
| [background-grid-plane.svg](./assets/background-grid-plane.svg) | [background-grid-plane.png](./assets/background-grid-plane.png) | `05-master.ts [257]` (`grid-solid`) | 3D パース製図面（`Z=+245, Y=+20°`, `54px` 格子） |
| [layout-kg-grid-overlay.svg](./assets/layout-kg-grid-overlay.svg) | [layout-kg-grid-overlay.png](./assets/layout-kg-grid-overlay.png) | `05-master.ts [187,188]`＋`P1..23` | 12×24 `kg_LayoutGrid`・ガター交点・左右境界可視化 |
| [kai-original-outline.svg](./assets/kai-original-outline.svg) | [kai-original-outline.png](./assets/kai-original-outline.png) | `04-kai-zoom.ts [20]` | 「解」分解前の一体連結シルエット |
| [kai-strokes-exploded.svg](./assets/kai-strokes-exploded.svg) | [kai-strokes-exploded.png](./assets/kai-strokes-exploded.png) | `02-bunkai.ts` / `05-master.ts runs4` | 「解」`runs4` 全16層の個別形状・交差クラスター強調 |
| [fude-original-outline.svg](./assets/fude-original-outline.svg) | [fude-original-outline.png](./assets/fude-original-outline.png) | `01-Baseline.ts [1,2]` | 「筆」解析前連結輪郭（base/inset・x=1080 はみ出し明示） |
| [fude-strokes-exploded.svg](./assets/fude-strokes-exploded.svg) | [fude-strokes-exploded.png](./assets/fude-strokes-exploded.png) | `01-Baseline.ts [3..15]` | 「筆」実 Restro 13画 `FUDE S01..S13`＋AE 分離ベクトル |
| [step1-4-intermediates.svg](./assets/step1-4-intermediates.svg) | [step1-4-intermediates.png](./assets/step1-4-intermediates.png) | `38-STEP1` / `40-STEP3` / `01-Baseline` | B 4工程の中間データ（スキャン・延長・29頂点・13画分離） |
| [e-end-card-clean.svg](./assets/e-end-card-clean.svg) | [e-end-card-clean.png](./assets/e-end-card-clean.png) | `49-PV end.ts` / `11-PV glyph EE.ts` | Scene E 実要素構成と左カラム衝突の構造確認 |

### 解析構造図（`docs/design/diagrams/`）

| ファイル | 対応章 | 内容 |
|---|---|---|
| [01-color-and-typo-tokens.svg](./diagrams/01-color-and-typo-tokens.svg) / [PNG](./diagrams/01-color-and-typo-tokens.png) | [01-theme-tokens.md](./01-theme-tokens.md) | 全カラー役割（ソースFloat値→合成sRGB）＋フォント階層一覧 |
| [02-layout-parent-rig.svg](./diagrams/02-layout-parent-rig.svg) / [PNG](./diagrams/02-layout-parent-rig.png) | [02-layout-and-grid.md](./02-layout-and-grid.md) | `P` 12% Null リグ・左カラム座標導出・3D 平面深度分離・`Linked Quad` 対応 |
| [03-structural-timesheet.svg](./diagrams/03-structural-timesheet.svg) / [PNG](./diagrams/03-structural-timesheet.png) | [04-structural-timesheet.md](./04-structural-timesheet.md) | 全20s/480f の Left Chrome 伸縮カーブ・右ステージ生存帯・128 BPM 拍点 |
| [04-accordion-and-cards.svg](./diagrams/04-accordion-and-cards.svg) / [PNG](./diagrams/04-accordion-and-cards.png) | [05-cards-and-sheets.md](./05-cards-and-sheets.md) | B アコーディオン 4状態・C 3層分離モデル・D ウィンドウマット構成 |
| [05-recordings-audit-sheet.png](./diagrams/05-recordings-audit-sheet.png) | [06-recordings-audit.md](./06-recordings-audit.md) | 全6録画素材の実フレーム・UIパネル状態・欠陥・採否一覧 |
| [06-motion-curves-and-vectors.svg](./diagrams/06-motion-curves-and-vectors.svg) / [PNG](./diagrams/06-motion-curves-and-vectors.png) | [07-motion-design.md](./07-motion-design.md) | 巨大「解」非対称イージング曲線・`runs4` 14画変位量・`Baseline` 放射ベクトル |

---

## 既存設計文書との関係整理（Issue #32 §6）

- [docs/pv-expression-blueprint.md](../pv-expression-blueprint.md): 以前の統合表現ノートは、AEP 一次調査完了前の段階的草案を含み「表現・構造設計の正本」として過大に確定扱いされていた箇所がある。同ファイルの履歴記述は保存しつつ、ステータス注記を改め、**現在の参照正本を本ディレクトリ（`docs/design/`）へ移行**した。
- [docs/SPEC.md](../SPEC.md) / [docs/design-baseline.md](../design-baseline.md): 旧仕様上の数値・候補値を含む基準文書。確定レイアウト境界（[docs/issue30-recovery.md](../issue30-recovery.md)）と矛盾する箇所は本パッケージ記載の実測値を優先する。
