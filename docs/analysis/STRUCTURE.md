# AEP 構造解析（Phase 2）

`analysis/dumps/` に3つの AEP の全構造ダンプ（JSON、schema `restro-pv.aep-dump.v1`）がある。
実機 After Effects 2027 で `tools/analysis/dump-aep.jsx` を実行して生成した。

## 対象と判定

| ファイル | comps | master layers | 判定 |
| --- | ---: | ---: | --- |
| `legacy/pv-8495026.aep` | 67 | 266 | **beats 検証済み**。`verification/beats/`（43拍）と `verification/pv-review.mp4` はこの状態の出力。manifest の `layerCount: 266` と一致 |
| `legacy/pv-2dc99e1.aep` | 73 | 267 | **TS 移植のベースライン**。コミット済み最新。`PV A2` と `PV glyph A2/EE/WA/WB/WC` の6コンポを追加し、master に `PV A2` を配線済み。全シーンの配線が揃っている |
| `legacy/pv-worktree-20261120.aep` | 73 | 261 | **破綻した途中状態**。master から `PV frame C`/`PV matte C`/`PV showreel`/`PV end`/`PV reel C`/`PV A2` の6レイヤーが外れている。`build-a2b.jsx`・`build-scene-c2.jsx`・`build-scene-e2.jsx`（commit `4085083` で追加）の適用途中と思われる。再現対象にしない |

beats は `8495026` 時点のもので、`2dc99e1` の A2/C/E 再構築を**含まない**。
映像比較の正本は beats だが、構造の正本は `pv-2dc99e1.aep` とする。

## master コンポ

1080×1080 / 24fps / 20秒（480フレーム）。267レイヤー（2dc99e1時点）。

シーン配線（in/out 秒）:

| シーン | 区間 | master 上のレイヤー |
| --- | --- | --- |
| A1+A2+A3+B | 0–7.96 | `PV A2` [1.50,3.79)、`LENS frame`/`Lens magnifier` [4.25,7.92)、`description`、`Heading`、`Ae.png`、`Logo`、`AFTER EFFECTS PLUGIN`、`P-*` テキスト群、`Baseline`/`bunkai`/`kai-zoom` 等のグリフコンポ参照 |
| C | 7.96–11.71 | `PV reel C` |
| D | 11.71–15.46 | `PV ops` |
| E | 15.46–20.00 | `PV end` |
| 音声 | 0–20 | `drums-and-somps-background-music-458414.mp3` [0,73.28)、`tempo` [0.5,20) |

`PV frame C`/`PV matte C`/`PV showreel` は 8495026 時点の残留レイヤー
（inPoint==outPoint のゼロ尺を含む）。2dc99e1 では `PV reel C`/`PV ops`/`PV end` が
シーンコンポを指す。

## コンポ一覧の要点（2dc99e1、73コンポ）

- **グリフ複製系**: `PV glyph`（`Baseline` を1400pxに広げた複製）、`PV glyph A2`/`EE`/`WA`/`WB`/`WC`
  （筆画を保持するため comp duplicate でしか作れない。`copyToComp` はパスを潰す — build-glyph.jsx の実測知見）
- **シーンコンポ**: `PV reel C`（作品3点の縦スクロール窓）、`PV ops`（実機録画3本の非同期ウィンドウ）、
  `PV end`（小窓→筆→商品カード）、`PV A2`（交差筆画の分解アニメーション）
- **素材コンポ**: `Baseline`（FUDE筆画13枚の実Restro出力）、`bunkai`（解のSTROKE群）、
  `BG decomposed strokes`、`Logo`
- 残りは工程表示（STEP1-4）・レンズ・カード・テキスト用の小コンポと、旧シーンの遺構

## 外部参照

- `pv.aep` が参照する外部ファイルは mp3 のみ（`fullpath` 走査済み）。
  移管後は `assets/audio/drums-and-somps-background-music-458414.mp3` を選んで再リンクする
- `assets/rec/*.mp4` はシーンDで使用（`PV ops` 内のフッテージレイヤー）

## legacy/scripts/pv/*.jsx の変更対応表

| JSX | 対象 | 内容 |
| --- | --- | --- |
| `build-glyph.jsx` | `PV glyph` + 複製群 | `Baseline` を1400px幅に複製し筆画を中央寄せ・墨色化。comp duplicate でパスを保持 |
| `build-description.jsx` | `description` コンポ | Aシーン用テキスト対の追加、Cキャプション重複の修正 |
| `build-scene-c.jsx` / `build-scene-c2.jsx` | `PV reel C` | v1: 3作品の縦スクロール窓。v2: 筆画レベルの個別アニメーション（集束/波/変形） |
| `build-scene-d.jsx` | `PV ops` | 実機録画3本を4窓で非同期再生。マット+ボーダーの2層構成 |
| `build-scene-e.jsx` / `build-scene-e2.jsx` | `PV end` | v1: 小窓→筆→商品カード。v2: 筆のドリフト+タイポグラフィ組版（カードなし） |
| `build-a2.jsx` / `build-a2b.jsx` | `PV A2` / `PV A2 rig` | A2再構築。b版は `bunkai` runs4 の交差筆画（縦→横の分離）を主役に |
| `wire-master.jsx` | `master` | シーンコンポを master の時間区間へ配線（冪等） |

実行順の系譜: build-glyph → build-description → 各シーン → wire-master。
`2dc99e1` は build-a2/build-description/build-scene-c2/build-scene-e2 を追加し
pv.aep を更新、`4085083` は build-a2b.jsx を追加したが pv.aep 未更新
（＝worktree 版がその適用途中）。

## 機械可読データ

`analysis/dumps/*.json` — コンポ・レイヤー・トランスフォーム（キーフレーム・補間・ease・空間タンジェント）・
マスク（頂点・タンジェント・モード）・エフェクト・シェイプパス（頂点・in/outタンジェント・closed）・
テキストドキュメント・フッテージ参照を全件収録。TS 移植はこのJSONを入力に進める。
