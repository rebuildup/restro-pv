# 品質保証・受入基準（計算検証 vs 目視・時間審査の設計）

> ← [設計パッケージ目次へ戻る](./README.md)
> 本書は、次フェーズの本制作において「計算や構造規則だけで保証できる項目」と「映像の連続性・可読性・美学として人間（および実出力レンダリングフレーム）が検査すべき項目」を分離し、受入ゲートを定義する。

---

## 1. 保証方法の2層分離（対象ごとの最小十分な検証手段）

| 検証対象 | 分類 | 具体的な検査手段（自動・計算可能） | 視覚・時間レビュー必須項目（実出力確認） |
|---|---|---|---|
| **A. テーマトークン・色役割** | `[計算検証]` ＋ `[目視]` | • ソース/出力 HEX（`#f7f7f7`, `#e51515`, `#ff3b30` 等）の定数定義チェック<br>• B 限定トークン（緑・青・黄）が C/E で誤参照されていないか構文検査 | • 白地背景 `#f7f7f7` 上で文字・枠線・Grid（`#303030`）・`PV ops` 枠が潰れず十分なコントラストを持つか |
| **B. 確定レイアウト・左境界・4層リグ** | `[計算検証]` | • `tests/pv-layout-contract.test.ts`（合成順・層フィルタ・import 境界）<br>• `tools/design/verify-local-motion.ts`（L2 4層分離リグ `openProgress ∈ [0..1]` 掃引 `allRigStatesValid: true`、`x ≥ 480` 安全検証） | • `3.875→4.50s`・`15.50→16.167s` の開閉区間で左要素と右ステージの重なり／干渉が起きないか |
| **C. 実筆画・ブランド素材・再構成** | `[計算検証]` ＋ `[出自検証]` | • `tests/stroke-contract.test.ts`（`Baseline 13画` / `bunkai runs4` の有限座標・非縮退 bbox）<br>• `tools/design/verify-assembly.ts`（JSON＋個別 SVG からの同一空間非クリップ再構成：`06-PV glyph IoU=0.9998`、`kai` excl.ク `IoU=0.9999`、全54SVG非ゼロ描画） | • `解`・`筆`・新規文字の形状欠損や輪郭はみ出しクリップがないか<br>• A2 で「交差の裏から連続縦画が抜ける」開門窓（`520.2px`）が一目で判るか |
| **D. 全体タイムシート・音同期** | `[時間・視覚レビュー]` | • シーン区間（`f0, 45, 90, 101, 191, 281, 371, 480`）のギャップゼロ検査 | • 実音声（`drums-and-somps-...mp3`）と合わせた再生で、拍アタック着地・情報読了時間（特に E の `>2s` 静止）が快適か |
| **E. カード／シート／窓枠** | `[計算導出]` ＋ `[視覚]` | • `STEP 1..4` タブ座標および窓枠クリップ矩形の算出値が左右安全帯 (`x≥480`) 内に収まるか（導出チェック §2 参照）<br>• C 3作例で `55.56%` のような不正縮小係数が再混入していないか | • B の累積タブと展開スロット内テキスト／拡大鏡が衝突しないか<br>• C の3作例が視覚的に異なる3世界（白タイポ／3D暗空間等）として成立し、前作残像が残らないか |
| **F. 実操作録画（Scene D）** | `[視覚・因果レビュー]` | • 使用録画の解像度・FPS（`24fps` 以上推奨）・トリム範囲が尺以上あるかの事前チェック | • **「テキスト/シェイプ → `Decompose` クリック/完了 → `STROKE_*` 展開・編集」の因果が同一コンポで途切れず読めるか**<br>• パネル見切れ・市松白低視認・無関係エラーバー表示がないか |
| **G. モーション品質・反単調性** | `[視覚・運動レビュー]` | • 個別ピボット存在確認（回転・拡縮画の `anchor == comp_center` 禁止）<br>• 全画同一定間隔スタガー／単一ベクトル放射への偏り検査 | • **2fps〜24fps コンタクトシートおよび実再生**で「一斉拡縮・ゴム紐・単純等速スライド・無意味点滅」に見えないか、人間の目で心地よさと強弱を最終判定（※数式や検証合格だけで美観保証としない） |

---

## 2. 上位規則 → 子要素変換の導出チェック（算出検証手順）

新規制作／改修コードが本設計パッケージの上位規則に従っているかを検算する代表式（値を動かした際の依存追従確認例を含み、確定レイアウト改変を意図するものではない）：

1. **左カラム上下開閉の幾何保存（[02-layout-and-grid.md §2・§4](./02-layout-and-grid.md)）**:
   - Title / End 状態：`Logo` 上端 `y = 435`（下端 `695`）＋ ギャップ `51px` ＋ `Heading` 上端 `y = 746`（下端 `812`）。`description` マット高さ `≤ 27px`（不可視）。
   - Explain 状態：`Logo` シフト `Δy = -155px` → `280..540`、`Heading` シフト `Δy = +155px` → `901..967`。`description` マット開高 `337px` (`y=546..883`)。両状態で **上下衝突ギャップ `< 0` にならないこと**、および `P 5..12` の変位量を変えたときに子コンポが確実に追従することを機械検証する。
2. **Scene B アコーディオン展開高さ不変則（[05-cards-and-sheets.md §1](./05-cards-and-sheets.md)）**:
   - 上段タブ数 $k \in \{1..4\}$ に対し、稼働スロット高さ $= 967 - (191 + 38 \times (4 - 1)) \approx 660\text{px}$ が不変に保たれ、`Divider` が常に上位境界 $+27\text{px}$ に位置すること。また `LENS` 元円 (`140px`) × `3.0` (`300%`) = 拡大円 (`420px`) の倍率整合が維持されること。
3. **3D パース面と焦点距離（[02-layout-and-grid.md §3](./02-layout-and-grid.md)）**:
   - `grid-solid`（`Z=+245`）に対する `runs4` 文字面（`Z=-96`）の奥行き差 `341px`（$f=1500\text{px}$ 時拡大比 $\approx 1500+245 : 1500-96 = 1.24\times$）と右＝手前遠近が、確定サムネイル重畳照合 [`verification/3d-projection-check.png`](./verification/3d-projection-check.png)（`runs4EdgeHitRateOnInk = 0.618`, 格子幅 `26.0→83.9px`）および A1 参照フレーム（[beat-001.png](../../verification/beats/beat-001.png)）と視覚一致すること。
4. **状態基準モーション検証（[`verification/local-motion-check.json`](./verification/local-motion-check.json)／[`diagrams/motion-kai-designed-a2-onion.png`](./diagrams/motion-kai-designed-a2-onion.png)）**:
   - 均等時刻サンプリングではなく、ピーク変位（`f9`）・開門ホールド（`f56..76`）・式駆動 `easeOut(7.142..7.611s)` の状態基準で生成し、`015/017` 開門隙 **`520.2px`** かつ `004` クランプ後 **`minScreenX = 490.4px`（`x ≥ 480` 安全）** を数値確認すること（なお `01-Baseline` 単体 `t=0` の `IoU=0.7310` は CTI 式焼き込みによる未解消オフセットとして `06-PV glyph` と峻別記録済）。
5. **確定 Chrome 復元時の乖離解消チェック（[02-layout-and-grid.md §5](./02-layout-and-grid.md)／[07-chrome-reconciliation.png](./diagrams/07-chrome-reconciliation.png)）**:
   - `f420..f479`（Scene E 後半）において `Ae.png`・`AFTER EFFECTS PLUGIN`・`Logo`・`Heading` が消去されずに `Title/End` 姿勢（`y=435 / 746`）へ帰着していること。
   - `LeftCopy.tsx` 固定座標 `top: 648 / 706` による二重描画・D/E 衝突が解消され、`#d64520` が `#e51515` に統一されていること。

---

## 3. アンチケース対応表（過去の失敗を再発させないための禁止パターン）

| 過去の失敗（不採用・欠陥実態） | 本設計パッケージでの防止・参照先 | 確認タイミング |
|---|---|---|
| ブランド `Logo`（`46-Logo.ts`）を解体して汎用筆画・E の作例に混ぜる | [03-assets-catalog.md](./03-assets-catalog.md) で「完成ブランド標章 vs 実 Restro 出力」を完全分離し個別書き出し済 | 素材設計・コード実装前 |
| A2 で `解` ではなく `筆` を使う／または全画を均等分解して交差証明を埋没させる | [04-structural-timesheet.md §3](./04-structural-timesheet.md)＋[07-motion-design.md §3.1](./07-motion-design.md) | シーン構成レビュー時 |
| 一部の AEP 数値（`1:4` 時間比等）や色トークンを全編一律の強制規約へ押し込める | [01-theme-tokens.md §3](./01-theme-tokens.md)＋[07-motion-design.md §1・§3](./07-motion-design.md) で局所自由度を分離明記 | 全シーン仕様確定時 |
| 一覧表・コンタクトシートの切り抜きだけを「個別アセット」と称する | `docs/design/assets/individual/` 配下に単体 SVG＋透過 PNG（全 `解` 16層・`筆` 13画・B中間・Logo構成層等）を独立出力済 | 素材引き渡し時 |
| Scene C を同じ「筆」1文字の色・配置違い 3連発で済ませる（かつ `55.6%` 縮小） | [05-cards-and-sheets.md §2](./05-cards-and-sheets.md) の3層分離＋異作品化要件 | 新規筆画素材調達時 |
| Scene D に UI 無しの `ae-decompose-auto.mp4` や欠損 `wu-d-live`・無関係カット繋ぎを使う | [06-recordings-audit.md §1–2](./06-recordings-audit.md) の個別監査結果＋新規収録要件 | Scene D 素材確定時 |
| Scene E で左ブランド・`Heading` を消去し、`x=120` の旧 `PV end` を左カラムと衝突させる | [02-layout-and-grid.md §5](./02-layout-and-grid.md)＋[07-chrome-reconciliation.png](./diagrams/07-chrome-reconciliation.png) | レイアウト検証・E 完了時 |
| Web UI 風の2×2均等カード化・全画均等スタガー・テスト合格のみで美的完成と宣言 | [05-cards-and-sheets.md §1](./05-cards-and-sheets.md)＋[07-motion-design.md §4](./07-motion-design.md) | モーションレビュー時 |

---

## 4. 次フェーズ（本制作着手）への進行ゲート

本制作（実装・実録画・新規文字分解）へ進む前に、以下がすべて揃っていることを確認する：
1. 本設計パッケージ（[docs/design/README.md](./README.md) 配下 A〜G＋QA・個別アセット群）がオーナーレビューで合意されていること。
2. `[未確定・不足事項]` の2件――① **Scene C 用の別文字実 Restro 出力**、② **Scene D 用の単一コンポ連続実機 AE 録画**（および必要時、独立製品アイコン有無の決定）――の実物調達計画（実機 AE 操作）が着手状態にあること。
3. 現行 Remotion の Chrome 乖離点（[02-layout-and-grid.md §5](./02-layout-and-grid.md)：`hideBrandLockupForEndCard` 撤去、`LeftCopy.tsx` と `masterPatch.ts` 整理、`#d64520`→`#e51515` 統一）の復元範囲について合意され、本設計パッケージ承認後の次作業として実施できる状態にあること。
