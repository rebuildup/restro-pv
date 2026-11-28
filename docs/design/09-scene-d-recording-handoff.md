# Scene D 録画素材インベントリと新規収録ハンドオフ（Issue #32 §F）

> 本書は設計フェーズで完結する半分（素材調査・因果構造設計・収録仕様）を正本化する。
> 実機 After Effects を要する収録本体は後続の本制作へ引き渡す単位として分離する。
> §3 は収録オペレータ（または AE アクセスを持つエージェント）が**追加の設計判断なしに実行できる runbook** として記述する。
> 関連: [06-recordings-audit.md](./06-recordings-audit.md)（既存6素材の実フレーム監査）、
> [03-assets-catalog.md](./03-assets-catalog.md)、[05-cards-and-sheets.md §3](./05-cards-and-sheets.md)（2窓モデル）、SPEC §5 D。

## 1. 現行 SceneD.tsx が使用する素材

| 項目 | 値 |
| --- | --- |
| 素材 | `assets/rec/ae-decompose-auto.mp4`（Remotion `staticFile` 経由。`public/assets` はリポジトリ `assets/` への junction） |
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

## 3. 新規収録 runbook（実機 AE が必要）

実行者は After Effects + Ae_Restro（Restro プラグイン）を持つ環境で以下を実行する。
本節の `[要実機確認]` 印のある手順は、このリポジトリの検証環境では確認できていないため、実機で挙動を確認してから進めること。確認結果は §3.5-13 のサイドカー注記へ記録する。

### 3.1 収録対象とショットリスト

**収録の目的**: SPEC §5 D が要求する「実 After Effects + Restro プラグインの操作が1コンポ内で因果として追える映像」。編集後の使用枠は **PV f281–370（90f = 3.75s、24fps）**。連続テイクとして **15〜20 秒**を収録し、編集時に約3.75秒の窓を切り出す（06-recordings-audit §2-2 と同一条件）。

**主証明テイク R1（必須・単一連続テイク）** — 1コンポ・1時間軸で以下の因果を途切れなく収める:

| Phase | 内容 | 目安尺 |
| --- | --- | --- |
| P0 準備状態 | 単一テキストレイヤー「筆」1本だけがタイムラインにある状態。コンポビューアに文字のみ表示 | 2.0s |
| P1 操作 | カーソルが Restro パネル（`Decompose` / `Merge` / `Refine` の3ボタン全て画内・非見切れ）へ移動し、`Decompose` を押下。プログレス/ダイアログが出る場合はその進行も視認できること | 3.0s |
| P2 結果 | タイムラインに `STROKE_*` 形状レイヤー群が出現（「筆」テキストなら実績 **13レイヤー**、`STROKE_NNN_runsR` 命名。§3.2 参照） | 2.0s |
| P3 編集証明 | 生成された `STROKE_*` のうち数画（3〜5枚）を選択し、位置/回転の値またはキーフレームを実際にドラッグしてグリフが分離して動く様子 | 5.0s |
| P4 ホールド | 安定した分解結果を静止保持 | 2.0s |
| P5（任意・R4） | 全 `STROKE_*` を選択して `Merge` を実行し、単一レイヤーへ戻る往復を同じテイク内で収める。時間が足りなければ別テイク `R4` として収録 | 5.0s |

**副素材 R4（任意）**: Merge/Refine の再処理アーク。第2窓（W_inset）が欲しい場合の `ae-reprocess.mp4` 代替。主テイクと同一 comp/同一プロジェクトで収録する（§3.2・§3.5-12）。

### 3.2 収録対象素材の正本（どの comp/レイヤーを使うか）

収録は**新規スクラッチプロジェクト**で行う。PV 素材 AEP（`legacy/pv-2dc99e1.aep`）を開いて収録すると、`expressions errors` バナーや無関係コンポが映り込む既往の欠陥（06-recordings-audit §1 `ae-decompose-ops.mp4`）を再発させる。

- **収録用コンポ**: `REC-D`（新規作成）。**1280×720 / 24fps / 約20秒 / ピクセルアスペクト 1:1**。寸法は `tools/capture/wu-d-capture2.jsx` が実績のある構成（同 comp `RestroProofD` 1280×720@24）に合わせる。コンポ背景は明るい単色 `#f7f7f7`（06-recordings-audit §2-1 のコントラスト要件。市松透明×白文字は禁止）。
- **ソースレイヤー**: `筆` の**単一テキストレイヤー**1本。`Layer > New > Text` で作成し、文字 `筆`・サイズ約 420〜520px・塗り `#111111`・中央揃え。フォント候補は `Noto Sans JP` → `MS Gothic`/`MS ゴシック` → `Yu Gothic` → `Meiryo` の順で存在するものを使う（`tools/capture/wu-d-live.jsx` / `wu-d-capture2.jsx` の実績フォールバック列）。位置はコンポ中央（wu-d-capture2 実測: `pos=[W/2, H/2+200]` でインクが y≈120–592 に中央配置される）。レイヤー名は `SOURCE 筆` 等、分解後と区別できる名前にする。
- **分解後の正本名**: 実 Restro 出力のシェイプレイヤーは **`STROKE_NNN_runsR`** 命名（例: `STROKE_016_runs5`、`STROKE_001_runs6`。正本データ: `docs/design/data/kai-stroke-runs-2d.composition.json` = `02-bunkai.ts` の `bunkai` comp、`docs/design/data/fude-decomposition.composition.json` = `01-Baseline.ts` の `Baseline` comp、`docs/design/data/pv-glyph-fude.composition.json` = `06-PV glyph.ts` の `PV glyph` comp）。「筆」テキストの Decompose 実績は **13レイヤー**（`verification/wu-d-live/decompose-log.txt`: `created_layer_ids=[101..113]`, `items=13`）。
- **参照のみ（収録には使わない）**: `Baseline` comp は既に分解済みの `FUDE S01..S13`＋`FUDE outline base/inset` を含むため「分解前→後」の因果を再現できない。`bunkai` comp は「解」の別ラン（runs4/5/6/7）を含む。これらは成果物の正しさ照合用であり、収録対象ではない。

### 3.3 技術収録要件

| 項目 | 要件 |
| --- | --- |
| 収録解像度 | **1920×1080 以上**の AE ワークスペース全体。UI 文字が潰れないスケール（AE UI スケール 125〜150%、または高解像度収録からの無劣化 crop） |
| フレームレート | **24fps 固定**（PV と同一。可変/15fps は不可 — `wu-d-live-capture.mp4` の失敗例） |
| 尺 | 連続 **15〜20 秒**（編集で 90f=3.75s を切り出すため、編集後に必要な因果が全て収まる余裕を持たせる） |
| カーソル | **可視**。Decompose 押下の瞬間が因果の核心 |
| 画面状態 | `expressions errors` バナー非表示、他プラグインのパネル/ダイアログ非表示（旧収録の `ty-plus` パネル・exec ダイアログ見切れの再発防止） |
| 被写体コントラスト | コンポ `#f7f7f7` / 文字 `#111111`。縮小表示でも文字と `STROKE_*` 選択枠が判読できること |
| 収録方法（自動化の実績レシピ） | `verification/wu-d-live/CAPTURE-NOTES.md` の手順を再利用: 常駐 `AfterFX.exe`（起動時 `-r` なし）+ WGC `WindowsCapture(window_hwnd)`（GPU-safe・遮蔽不感）+ ゲートファイル（`.tmp/wu-d-go` 先例）で決定論的トリガ + `ae-proof.ts --allow-running-ae` 委譲。WGC は変化時のみフレームを出すため、**固定間隔収録または操作前後に長めの settle** を入れてフレーム欠落を防ぐ。手動収録の場合は OBS/ShareX 等でウィンドウ単位・ネイティブ解像度・24fps 以上 |
| メニュー/パネル名 | `Restro: Decompose` / `Restro: Merge` / `Restro: Refine`（ExtendScript `app.findMenuCommandId` で実在確認済み。Ae_Restro 側の正本は `ae-restro/src/ui/client.ts` の `COMMAND_NAMES` と `settings-dialog.ts` のパネル定義）。パネルボタン表示名は `Decompose` / `Merge` / `Refine` |
| プラグイン設定（推奨既定値・Ae_Restro native `settings_model.hpp` 実測） | `output_mode = Layers`（"One layer per stroke"）、`decompose_source_action = Keep`、`merge_source_action = Delete`、`anchor_mode = Center`。**収録前に設定ダイアログでこの値であることを確認し、サイドカーへ記録する**（`Merge` はソース `STROKE_*` を Delete する既定のため、往復収録時の見え方に影響する） |

### 3.4 2窓レイアウト要件（05-cards-and-sheets §3 の数値化）

収録素材は編集時に **主窓 `W_main` + 拡大副窓 `W_inset`** の2窓構成へ切り出す前提で構図を取る。ステージ基準領域は `x=480..1080`（右ゾーン `600px` 幅）。

| 窓 | ステージ座標 | サイズ | 収める内容 |
| --- | --- | --- | --- |
| `W_main`（上段） | `y=60..600` | 約 `600×540` | コンポビューア全体＋タイムライン全景。`SOURCE 筆` → `STROKE_*` 出現 → 選択・ドラッグの一連が1画で追える構図 |
| `W_inset`（下段） | `y=624..1020` | 約 `600×396` | Restro パネル（3ボタン）＋クリック瞬間＋生成された `STROKE_*` レイヤー群の拡大クロップ。フェーズに応じてフォーカス領域を切替可能な余白を残す |

- **フレーム仕様**: 各窓に **`1.5〜2px` の濃色フレーム（`#18181b` または `#3f3f46`）** と控えめな座標ラベル。旧 `#ebebf0` は背景 `#f7f7f7` と同化するため不採用（05 §3）。
- **構図の要点**: 1920×1080 収録時、コンポビューア（`REC-D` 1280×720 を Fit 表示）・タイムライン・Restro パネルが**同時に画内**に入る AE 標準レイアウトにする。SPEC §5 D の旧計測値（コンポキャンバス x480–1160/y110–580、タイムライン下部 y700–1080）は別 UI スケールの旧収録由来のため**目安扱いとし、収録後に実フレームで窓 ROI を再計測する** `[要実機確認]`。
- **注記**: 現行 `SceneD.tsx` は v13 PROOF モードの**単一 viewport** 実装であり、05 §3 の2窓モデルとは未整合。本 runbook は「2窓へ切り出せる素材」を収録要件とし、窓構成の最終決定は後続の SceneD 実装チケットに委ねる（§6 の不整合一覧参照）。

### 3.5 実行手順（ステップ・バイ・ステップ）

1. **環境準備**: AE + Ae_Restro 導入済みの環境で作業。収録フォルダを用意: `verification/rec-d/`（プロジェクト・ログ・サイドカー）と成果物置き場 `assets/rec/`。
2. **クリーンプロジェクト作成**: `File > New > New Project` で新規プロジェクトを開く（既存 AEP は開かない）。`Composition > New Composition` で `REC-D` を作成: **1280×720 / 24fps / 20秒 / 背景色は後述のソリッドで指定**。
3. **背景**: `Layer > New > Solid` で `#f7f7f7`（RGB 247,247,247）のソリッドを全長に配置し、レイヤー名 `BG`、最背面へ。
4. **ソースレイヤー**: `Layer > New > Text` で `筆` を入力。§3.2 のサイズ・色・位置・フォント条件で調整し、レイヤー名を `SOURCE 筆` に変更。タイムラインにこの1本だけがある状態を確認。
5. **ビューア表示**: `REC-D` をコンポビューアで開き（ダブルクリック/`openInViewer` 相当）、タイムラインパネルに `SOURCE 筆` が見える標準レイアウトにする。Restro パネルが未表示なら開く `[要実機確認: パネルの開き方は Window メニュー配下か、プラグイン独自の起動方法か]`。
6. **収録開始**: §3.3 の方法で録画を開始。開始後 **2秒** 静止（P0）。
7. **Decompose 実行**: タイムラインで `SOURCE 筆` を選択 → カーソルを Restro パネルの **`Decompose`** ボタンへ移動 → クリック。実行中のプログレス/ダイアログがあればその進行を収める（P1）。
8. **結果確認**: タイムラインに `STROKE_*` レイヤーが生成される様子を収める（P2）。**生成数を数えて記録する**（「筆」の実績は13）。
9. **編集証明**: `STROKE_*` を3〜5枚選択し、Position/Rotation の値スライダーまたはキーフレームをドラッグしてグリフが分離・移動する様子を収める。必要なら `U`（keyframe navigator）やドラッグで実キーを作る — **実編集であり、収録後のキーフレーム焼き込みは禁止**（P3）。
10. **ホールド**: 分解結果を **2秒** 静止保持（P4）。
11. **（任意 R4）**: 全 `STROKE_*` を選択して `Merge` を実行し、単一レイヤーへの復帰を収める。`Refine` を使う場合も同様。ソースレイヤーの扱い（Keep/Delete）は §3.3 の設定値に従う `[要実機確認: Merge の対象選択要否・実行後のレイヤー構成]`。
12. **収録停止・保存**: 録画を停止し、プロジェクトを `verification/rec-d/REC-D.aep` として保存（素材 AEP・legacy AEP には絶対に保存しない）。
13. **サイドカー記録**: `verification/rec-d/decompose-log.txt` に以下を記録（`verification/wu-d-live/decompose-log.txt` の先例に倣う）: comp 名 `REC-D`、サイズ/ fps、使用した AE バージョン、プラグイン設定値（§3.3）、Decompose 前後のレイヤー数と `STROKE_*` 名一覧、収録ファイル名、開始/終了時刻。
14. **納品**: 主テイクを `assets/rec/ae-decompose-ui.mp4`、R4 を撮った場合は `assets/rec/ae-decompose-merge.mp4` として配置（命名規則は `ae-*.mp4` の既存 convention に従う）。

### 3.6 受入条件（収録素材が満たすべきこと）

06-recordings-audit §1 の全欠陥の再発がないことをフレーム単位で確認する:

- **因果の連続性**: 「`SOURCE 筆` 1本 → `Decompose` 押下（ボタン/メニューが画内で視認可能）→ `STROKE_*` 生成 → 選択・ドラッグで分離移動」が**同一 comp・同一時間軸・同一テイク内**で追える。コンポ切替・別 comp へのジャンプなし。
- **UI 判読性**: Restro パネルの `Decompose`/`Merge`/`Refine` 3ボタン全てが画内（見切れなし）。`expressions errors` バナー・デバッグ overlay・他プラグイン窓なし。
- **編集可能性の証明**: `STROKE_*` が独立レイヤーとして選択・移動できることが映像上で確認できる（＝「After Effectsでそのまま動かせる」の実証）。
- **コントラスト**: `#f7f7f7` 背景＋`#111` 文字で、市松白文字の低コントラスト問題を再発させない。
- **技術**: 1920×1080+ / 24fps / カーソル可視 / 15〜20秒の連続テイク。編集に使える 90f（3.75s）以上の良品区間を含む。
- **往復（R4 撮影時）**: Merge/Refine による再処理が「どのボタンを押し→何が起きたか」因果として読める。
- **検証手順**: 収録後は `verification/wu-d-r34/` と同様の全デコード監査を行い、抽出フレームで上記を確認してから `assets/rec/` へ確定配置する。

### 3.7 出力命名と配置（コード側との対応）

| 成果物 | 配置先 | 命名 | 備考 |
| --- | --- | --- | --- |
| 主テイク | `assets/rec/` | `ae-decompose-ui.mp4` | 新規名。既存 `ae-decompose-auto.mp4` は残す（履歴・比較用） |
| R4 副素材（任意） | `assets/rec/` | `ae-decompose-merge.mp4` | Merge/Refine 往復 |
| プロジェクト | `verification/rec-d/` | `REC-D.aep` | 再現・再収録用に保存 |
| ログ | `verification/rec-d/` | `decompose-log.txt` | §3.5-13 のサイドカー |

**既知の不整合（コード側の後続対応が必要）**: 現行 `video/src/scenes/SceneD.tsx` は `WIN.file = "ae-decompose-auto.mp4"` 固定で `CLIPS`/`ROI` も旧素材前提。本 runbook の成果物を使うには、後続チケットで `SceneD.tsx` の `file`/`ROI`/`CLIPS` 差し替えと、05 §3 の2窓モデルへの再構成（または単一窓継続の判断）が必要。**本 runbook では `SceneD.tsx` を編集しない**。

## 4. 設計フェーズで完結する残作業（本書のスコープ内・実施済み/継続）

- 素材ごとの個別インベントリ（§2）— 済。
- Scene D の因果可読性設計（メイン窓＋パネル・クローズアップの2窓構成、`03-assets-catalog.md` §Scene D-E 準拠）— 05-cards-and-sheets / 04-structural-timesheet に既存記述あり、R1 仕様確定後に窓割りを数値化する → **§3.4 で数値化済み**。
- SPEC §5 D の旧非同期4窓記述（W1–W4）は v13 PROOF モードに対し陳腐化 — 本制作時に SPEC 側を更新する（本Issueの範囲では設計資料側を正本とする）。
