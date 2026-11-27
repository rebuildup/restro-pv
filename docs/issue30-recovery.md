# Issue #30 回収記録 — 旧制作資産・確定レイアウト境界・再発防止

> 状態：**正本（回収と境界の記録）**。Issue #30 の実施結果。
> pv-full 系列（全面再制作）はオーナー判断により不採用。
> 制作の正本は旧制作 `PV-Master` 経路に戻る。

## 1. 回収した旧制作の実装・素材

旧制作 = Remotion `PV-Master` 経路（dumped AE master comp の解釈再生 +
authored シーン層）。**全面再制作前のコードは branch `23` 上で一切
上書きされていなかった**ことを Git で確認済み：

- `git diff --stat 8d9fb4a..HEAD -- video/` は pv-full 追加分
  （`film/`、`ProtoHook.tsx`、`music-analysis.json`、Root.tsx への comp
  追加）のみで、`PvVideo.tsx`・`scenes/Scene*.tsx`・`ae/` 配下の既存
  ファイルへの変更はゼロ。v18 時点の編集可能ソースは HEAD にそのまま残る。

| 資産 | 場所 | 出所 |
|---|---|---|
| editable 実装（旧制作） | `video/src/PvVideo.tsx`, `video/src/ae/`, `video/src/scenes/Scene*.tsx`, `video/src/scenes/glyph.tsx` | branch `23` HEAD（v18 `8d9fb4a` から無変更） |
| コンポジション定義・ダンプ | `pv/generated/`（73 comp の CompSpec） | `legacy/pv-2dc99e1.aep` 由来（ADR-0003） |
| 実レンダー v18 | `verification/pv-remotion-v18.mp4` | commit `8d9fb4a`（v1〜v18 全て git 管理下に保存） |
| ビート参照画像 | `verification/beats/`（43枚） | 実 AEP 出力の参照正本 |
| サムネイル原本 | `assets/images/samune-v1-master.png`, `samune-v1.png`, `Ae.png` | `rebuildup/Ae_Restro` `promotion/` から移行（commit `39e59a3`、PROVENANCE.md 記載） |
| 実 AE 操作収録 | `assets/rec/ae-*.mp4`（decompose-ops / stroke-animate / reprocess / decompose-auto） | 退避ブランチ `promo-backup-redesign-20261119` 系の収録素材 + WU-D scripted capture |
| legacy 参照 | `legacy/`（旧 AEP・beats 等） | 移管資料。編集せず解析・検証用 |

### 今回コードへ反映した回収（左カラム authored コピー）

旧制作では左情報領域のコピーが2系統に分かれていた：dumped `description`
comp（Chrome が再生）と、SceneD/SceneE が authored した左カラム文。
#30 の責務境界に合わせ、**SceneD/SceneE の左コピーを verbatim で
`video/src/layout/LeftCopy.tsx` へ移設**した。表示結果は不変
（§3 のフレーム照合で確認）。

## 2. 確定事項と可変範囲の実装境界

**確定事項**（変更はオーナーの明示的決定が必要）：
サムネイルのデザイン、旧制作のレイアウト構成 — 共通背景・グリッド、
ブランド（`Logo`/`Ae.png`/`AFTER EFFECTS PLUGIN`）、左情報領域
（x≈0–460、時間的コピー切替を含む）、右コンテンツ領域の存在、
全体の配置・視覚的階層・スケール関係。

**可変範囲**：右ステージのコンテンツのみ（各シーンの内容・演出・
筆画表示）。シーンは `video/src/layout/Stage.tsx` の `STAGE_SCENES`
レジストリ経由でのみマウントされ、`{ t }` だけを受け取る。

### 責務境界の構造

```
PV-Master (唯一の正式エントリ, video/src/Root.tsx)
├─ PvChromeBase   … 確定レイアウトの下地。protected chrome を除く master 全体
├─ PvStage        … STAGE_SCENES レジストリの明示的スロット
│   └─ SceneA2/B/C/D/E { t }                 … 右ステージ・コンテンツのみ
├─ PvLeftGuard    … 確定背景のみを左カラム x<460 にクリップ再描画
└─ PvChromeOverlay… protected chrome（ブランド/description 列/マット源）
                     + LeftCopy を最前面に再描画
```

- **表示境界と権限境界の区別**：シーンは画面上どこにでも描画できる
  （意図的な領域外展開・ブリードは既存演出として保持）。禁止されるのは
  共通レイアウト・左領域・ブランド・背景の**所有・上書き**であり、
  これは `Chrome.tsx`/`LeftCopy.tsx` がシーンモジュールを import しない
  こと（テストで強制）と、シーンが左カラムの authored コピーを持たない
  こと（テストで強制）で担保する。
- **保護は合成順で実装する**：「現在のシーンが正しい」ではなく
  「将来のシーン変更でも確定画素が保たれる」ことを保証するため、
  `PvLeftGuard`（確定背景を左カラムに限定再描画）と
  `PvChromeOverlay`（protected master レイヤーを最前面に再描画）を
  ステージの**後**に合成する。シーンクリップは行わないため、
  x≥460 の領域外演出・ブリードは失われない。x<460 の左カラムは
  Issue #30 の確定領域であり、そこへの描画はガードが上書きする。
- **対象レイヤーの根拠**：`PROTECTED_MASTER_LAYERS` = description(10)・
  ブランドロックアップ(15–18)・そのアルファマット源(8)。
  `BACKGROUND_MASTER_LAYERS` = grid-solid(257)・White Solid 1(258)・
  Linked Quad 8–10(260–262)（master スタック最下層の可視背景。
  無効化兄弟・マット専用層は除外）。
- **迂回経路の封鎖**：pv-full 系列は `video/src/rejected/pv-full/` へ
  移設し Root.tsx から登録解除。`PV-Master` 以外に全編を構成する
  comp は存在しない（`PV-Chrome`/`PV-Comp*` はデバッグ用）。
- **検証**：`tests/pv-layout-contract.test.ts`（12件）が
  layerFilter の意味論（base が protected を除外、overlay が protected
  のみ、guard が背景のみ）・合成順・レジストリ・import 境界・
  左コピー所在・comp 登録を常時検証。画素レベルの証明は §3 と
  `bun tools/verify-layout.ts`（再実行可能な回帰チェック）。

## 3. 回帰検証の実施結果（実施済み）

**恒常チェック**：`bun tools/verify-layout.ts` が PV-Master / PV-Chrome
のスチルを契約フレーム（f0,12,60,108,156,228,324,420,468）で描画し、
左領域 x<455 の SSIM が全フレーム ≥0.999 であることを検査する
（report: `.tmp/layout-verify/report.json`）。合成順・layerFilter の
構造保証は `bun test` が常時検証する。

**実施結果（4平面構成）**：9/9 フレームで左領域 SSIM **1.000000**。
PV-Master still と `pv-remotion-v18.mp4` 同フレームの全画面 SSIM は
f60=0.9966、f324=0.9980、f468=0.9981（h264 圧縮誤差の範囲）で、
回収忠実性を維持している。

以下は境界強化前（2平面構成）に実施した初回計測の記録。

`bunx remotion still` で PV-Master / PV-Chrome を代表8フレーム
（f24 A1, f60 A2, f150 B, f230 C, f300 D, f400 E, f460 E-card, f479 終了）
描画し ffmpeg SSIM で比較：

| フレーム | 左領域 x<455 SSIM | 全画面 SSIM |
|---|---|---|
| f24 | **1.000000** | 1.000000（A1 は dumped のみ・シーン無し） |
| f60 | 1.000000 | 0.853946 |
| f150 | 1.000000 | 0.806525 |
| f230 | 1.000000 | 0.773192 |
| f300 | 1.000000 | 0.925778 |
| f400 | 1.000000 | 0.867466 |
| f460 | 1.000000 | 0.876256 |
| f479 | 1.000000 | 0.876256 |

- **左領域（ブランド+左カラム）は全フレームで画素一致** — シーンの
  有無・内容が共通レイアウトに影響しないことの実測証明。
- 全画面差分はシーンが描画する右ステージ内容のみ（想定どおり）。
- **v18 との対応照合**：同フレームを `pv-remotion-v18.mp4` から抽出し
  PV-Master still と SSIM 比較 → 全フレーム **0.9896〜0.9981**
  （h264 圧縮誤差の範囲。コードは v18 から無変更＋左コピー移設は
  表示不変のため、回収忠実性を確認）。

その他：`bun tsc --noEmit` パス、`bun test tests` 22件全パス
（新規6件を含む）。

## 4. 既知の右側コンテンツの課題（回収時点・今回は修正しない）

`docs/wu-status.md` の v18 暫定評価および SPEC §10 監査に記録済みの
右ステージ側の既知欠陥（次セッションの作業対象）：

- D の実操作証明は暫定評価で不合格判定歴あり（実収録素材への差替えと
  制作痕跡の除去が指摘済み。`assets/rec/ae-decompose-auto.mp4` は
  scripted capture で対応済みの版あり）
- CTA（BOOTH URL）のコントラスト・配置、連続重複フレーム
- B 工程図の情報過多、C のストローク重なり濁り、薄いコピーの
  コントラスト不足、大文字の右端クリップ
- C の作品内筆画単位アニメーションは未実装（SPEC §5 C の完全達成には
  別途制作が必要）

これらは**右ステージ・コンテンツの課題**であり、確定レイアウトの
問題ではない。新規の企画・演出判断は次セッション（agy）に残す。

## 5. 引き渡し（次セッションへの参照先）

- **制作の入口**：`video/src/Root.tsx` の `PV-Master` のみ。
  レンダー：`cd video && bunx remotion render src/index.ts PV-Master out.mp4 --codec=h264 --audio-codec=aac`
- **編集範囲**：`video/src/scenes/`（右ステージ）と `STAGE_SCENES`。
  レイアウト変更は `video/src/layout/` — オーナー決定なしに触れない。
- **契約テスト**：`bun test tests/pv-layout-contract.test.ts`
- **境界のピクセル検証**：`bun tools/verify-layout.ts`
  （PV-Master vs PV-Chrome、左領域 SSIM ≥0.999）
- **不採用系列**：`video/src/rejected/pv-full/`、`verification/pv-full-v*.mp4`、
  `docs/step1-plan.md`（撤回注記付きで履歴保持）
- **コミット基点**：本記録を含む branch `23` の HEAD（PR #27 Draft）
