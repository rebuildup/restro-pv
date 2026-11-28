# Scene D 録画素材インベントリと新規収録ハンドオフ（Issue #32 §F）

> 本書は設計フェーズで完結する半分（素材調査・因果構造設計・収録仕様）を正本化する。
> 実機 After Effects を要する収録本体は後続の本制作へ引き渡す単位として分離する。
> 関連: [06-recordings-audit.md](./06-recordings-audit.md)（既存6素材の実フレーム監査）、
> [03-assets-catalog.md](./03-assets-catalog.md)、SPEC §5 D。

## 1. 現行 SceneD.tsx が使用する素材

| 項目 | 値 |
| --- | --- |
| 素材 | `assets/rec/ae-decompose-auto.mp4`（Remotion `staticFile` 経由） |
| 仕様 | 1280×720 / 24fps / 6.00s / 144f |
| 使用区間 | `srcStart=1.30s`・90f（PV f281–370、t=11.71–15.46s） |
| ROI | `{x:370, y:0, w:560, h:470}` → 表示 viewport `x=480, y=90, w=600, h=560` |
| 内容 | 実 `Restro: Decompose` を走らせた**レンダー済みコンポ**（comp `RestroProofD`、筆テキスト→13 `STROKE_*` 形状レイヤー生成→キーフレームで組み上がり）。AE UI・パネル・タイムラインは映らない |
| 検証 | 全デコード監査 `verification/wu-d-r34/`、レビュー `verification/reviews/wu-d-r35c/`（PASS 10/10） |

**判定**: 実バックエンド処理の結果映像ではあるが、06-recordings-audit が `[× Scene D として不適]` と判定した通り、SPEC §5 D が要求する「押したボタン・結果・レイヤーの視認」は満たさない。`SceneD.tsx` のコメント「再収録は不要」は監査結論と矛盾しており、**新規実機収録が必要**（§3）。

## 2. 素材インベントリ（`assets/rec/` + `verification/` 全録画）

| 素材 | 仕様 | 操作内容 | 現在の用途 | 判定 |
| --- | --- | --- | --- | --- |
| `ae-decompose-auto.mp4` | 1280×720, 6.0s | 実 Decompose→13画生成（UIなし） | SceneD 唯一のクリップ | △ UI因果なし |
| `ae-decompose-ops.mp4` | 1920×1080, 62s | AE ワークスペース: Restro パネル、comp 切替、before→after、`error 1 of 16` バナー | 旧 `52-PV ops` comp | × デバッグ overlay・エラー表示 |
| `ae-stroke-animate.mp4` | 1920×1080, 75s | 筆画の移動・キーフレーム編集（f550–640, f622/665） | 同上 W2/W3 | △ 編集可能性の傍証のみ |
| `ae-reprocess.mp4` | 1920×1080, 65s | Merge/Refine 再処理（exec ダイアログ~t6s） | 同上 W4 | × 因果不明瞭 |
| `pv-proof-decompose.mp4` | 1080×1080, 3.62s | 唯一「Executing Script」ダイアログ実写（f0–24） | 旧 `ProofAct.tsx` | △ 補助証拠 |
| `wu-d-live-capture.mp4` | 2506×1392, **15fps**, 2.93s | WGC 実機キャプチャ（reply JSON items=13） | 未使用 | × フレーム欠落 |
| `c-scene.mp4`（`verification/wu-c-v14/`） | — | Scene C 検証用 | Scene C | — |

検証済み使用可能区間（`verification/wu-d-mat/SEGMENTS.md`）: decompose-ops f860–945、stroke-animate f550–640、reprocess f120–170 — いずれも単独では SPEC の因果連鎖を構成できない。

## 3. 新規収録ハンドオフ仕様（実機 AE が必要）

実行者は After Effects + Ae_Restro を持つ環境で以下を収録する。収録後は `assets/rec/` へ配置し、SceneD.tsx の `CLIPS`/`ROI` を差し替える。

- **R1 主証明テイク**（連続 15–20s、編集後 ~3.75s）: 高コントラストな単一 comp（1080×1080 または 16:9、背景 `#f7f7f7`、文字 `#111`。**チェッカーボード+白文字、`expressions errors` バナー禁止**）。手順: (a) 「筆」等の単一テキスト/シェイプレイヤー表示 → (b) カーソルが Restro パネル（Decompose/Merge/Refine の3ボタン全て画内・非見切れ）へ移動し Decompose 実行（または script 実行の進行が視認できる）→ (c) タイムラインに `STROKE_*` レイヤー出現 → (d) 数画を選択し位置/回転キーをドラッグしてグリフが動く → (e) 安定結果でホールド。
- **R2 フレーミング**: AE ワークスペース全体を 1920×1080+ で収録（UI スケール 125–150% またはロスレス crop）。メイン窓（comp+タイムライン）とクローズアップ窓（Restro パネル+筆画生成）を再サンプリングなしで切り出せる構図。
- **R3 同一 comp/時間軸の対応**: 全テイクを単一 AE プロジェクト/comp で収録。comp 名と `STROKE_*` 数をサイドカー注記へ記録（`decompose-log.txt` の先例に倣う）。
- **R4 任意副素材**: 同一 comp での Merge/Refine 再処理アーク（第2窓が欲しい場合、`ae-reprocess.mp4` の代替）。
- **収録方法**: `verification/wu-d-live/` の実績レシピを再利用 — 常駐 `AfterFX.exe`（起動時 `-r` なし）+ WGC `WindowsCapture(window_hwnd)`（GPU-safe・遮蔽不感）+ ゲートファイルで決定論的トリガ + `ae-proof.ts --allow-running-ae` 委譲。WGC の 15fps/フレーム欠落は固定間隔収録または長めの settle で回避。

## 4. 設計フェーズで完結する残作業（本書のスコープ内・実施済み/継続）

- 素材ごとの個別インベントリ（§2）— 済。
- Scene D の因果可読性設計（メイン窓＋パネル・クローズアップの2窓構成、`03-assets-catalog.md` §Scene D-E 準拠）— 05-cards-and-sheets / 04-structural-timesheet に既存記述あり、R1 仕様確定後に窓割りを数値化する。
- SPEC §5 D の旧非同期4窓記述（W1–W4）は v13 PROOF モードに対し陳腐化 — 本制作時に SPEC 側を更新する（本Issueの範囲では設計資料側を正本とする）。
