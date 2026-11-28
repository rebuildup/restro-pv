# 無 (MSMincho) 素材の実機取得記録

Scene C 作業 03「飛白」が使う実 Decompose 素材について、**実機が実際に返した値**と
**どう取得したか**を FACT として固定する。値の一次ソースは
`verification/rec-newmat/plugin-replies.json`（プラグインの `RESTRO_REPLY` 原文）と
`verification/rec-newmat/strokes.json`（取得時の幾何）である。

- 記録日: 2026-11-29 (JST)
- 対象: `verification/rec-newmat/NEWMAT.aep` の comp **NEWMAT 無 mincho**

---

## 1. 取得環境

| 項目 | 値 |
| --- | --- |
| After Effects | Adobe After Effects 2027 / `app.version` = **27.0x78** / `AfterFX.exe` FileVersion **27.0** |
| 実行体 | `D:\4_apps\adobe\Adobe After Effects 2027\Support Files\AfterFX.exe` |
| OS | Windows 11 Home Insider Preview 10.0.29712 (JST) |
| プラグイン | `D:\4_apps\adobe\Adobe After Effects 2027\Support Files\Plug-ins\third_party_plug\Ae_Restro.aex` (FileVersion **0.7.2.0**, 2311168 bytes, LastWriteTime 2026-10-25 14:17:24) |
| 分解コマンド | `Restro: Decompose` (menu command id **5122**) / `Restro: Merge` (**5123**) / `Restro: Refine` (**5124**) / パネル `Restro` (**5121**) |

AE は常駐インスタンス 1 個で運用し、スクリプトは `-r` 委譲で投入した（同時に 2 本の
スクリプトを走らせない。2 本目の投入は AE が "Attempt was made to run a second
script while another script was already running" を出す）。

## 2. 実行したコマンド（原文）

```sh
# 取得本体: comp を作り直し、実 Decompose を通し、返信原文と全レイヤー情報を採取
"D:\4_apps\adobe\Adobe After Effects 2027\Support Files\AfterFX.exe" \
  -r "C:/Users/rebui/Desktop/restro-pv-23/tools/capture/rec-newmat-acq.jsx"
# 実行時刻 2026-11-29 02:08:44 JST  (ログ: .tmp/rec-newmat/rec-newmat-acq.log)

# Merge / Refine 往復: 複製 comp をビューアーに開いた状態で実行
"D:\4_apps\adobe\Adobe After Effects 2027\Support Files\AfterFX.exe" \
  -r "C:/Users/rebui/Desktop/restro-pv-23/tools/capture/rec-newmat-roundtrip.jsx"
# 実行時刻 2026-11-29 02:13:09 JST  (ログ: .tmp/rec-newmat/rec-newmat-roundtrip.log)

# 判定用のラスタ取得（After Effects の Render Queue 経由）
"D:\4_apps\adobe\Adobe After Effects 2027\Support Files\AfterFX.exe" \
  -r "C:/Users/rebui/Desktop/restro-pv-23/tools/capture/rec-newmat-render.jsx"
# 実行時刻 2026-11-29 02:25:32 JST  (ログ: .tmp/rec-newmat/rec-newmat-render.log)

# 受け入れ数値の算出（AE なしで再計算できる形へ落とす）
python tools/build-newmat-acceptance.py
```

補助スクリプト（今回新建・本リポジトリ内）:
`tools/capture/rec-newmat-acq.jsx` / `rec-newmat-roundtrip.jsx` / `rec-newmat-render.jsx`、
`tools/build-newmat-acceptance.py`。

## 3. 分解対象の comp と元レイヤー

| 項目 | 値 |
| --- | --- |
| comp 名 | `NEWMAT 無 mincho` |
| サイズ | 1280 x 720 / pixel aspect **1** |
| frame rate | **24 fps** |
| 長さ | 8.000 s |
| 背景 | ソリッド `#f7f7f7` (RGB 247,247,247) / レイヤー名 `BG` / 最背面 |
| 元レイヤー | `SOURCE 無`（テキスト 1 枚） |
| フォント | **MSMincho**（候補列の 1 番目で確定。`tried=[]` = 差し替えなし） |
| サイズ | **460 px** |
| 塗り | `#111111` = RGB(0.066667, 0.066667, 0.066667) / `applyFill = true` |
| 揃え | `ParagraphJustification.CENTER_JUSTIFY` (7415) |
| 位置 | **[640, 560]**（comp 座標, = [W/2, H/2+200]） |

フォント指定は AE が受け付けない表示名（`UD Digi Kyokasho N` 等）を避けて
PostScript 名で固定している。実測で確定した PostScript 名は `MSMincho` / `NotoSansJP-*` ほか。

## 4. 分解時に効いていたプラグイン設定

設定は**プラグイン自身**から pulled した（`RESTRO_CALL = {"op":"get_settings"}` を
`Restro` パネルコマンドに渡して `RESTRO_REPLY` の `settings` オブジェクトを読む）。
原文は `plugin-replies.json` の `replies[0]`。

| キー | 値 |
| --- | --- |
| `output_mode` | **layers** |
| `decompose_source_action` | **delete** |
| `merge_source_action` | **delete** |
| `anchor_mode` | **center** |
| `anchor_x` / `anchor_y` | 0.0 / 0.0 |
| `fit_curves` | true |
| `fit_tolerance` | 0.25 |
| `simplify` | auto |
| `simplify_tolerance` | 0.0 |
| `debug_logging` | false |
| `layout` | auto |
| `labels` | auto |
| `label_align` | aligned |

**Decompose / Merge / Refine の返信それ自体は `settings` を持たない**（`"settings":null`）。
上の値は分解直前に別途取得した get_settings 返信が正本である。

## 5. プラグインの返信（原文・逐語）

`verification/rec-newmat/plugin-replies.json` に原文で保存している。抜粋を改変せず再掲する。

### 5.1 分解前（テキスト選択中に取得した設定）

```
{"code":"","command":"settings","created_layer_ids":[],"message":"","ok":true,"schema":"restro.reply.v1","settings":{"anchor_mode":"center","anchor_x":0.0,"anchor_y":0.0,"debug_logging":false,"decompose_source_action":"delete","fit_curves":true,"fit_tolerance":0.25,"label_align":"aligned","labels":"auto","layout":"auto","merge_source_action":"delete","output_mode":"layers","simplify":"auto","simplify_tolerance":0.0}}
```

### 5.2 Decompose 直後

```
{"code":"","command":"decompose","created_layer_ids":[109,110,111,112,113,114,115,116,117,118,119,120],"message":"items=12 created=12 hidden=0 removed=1","ok":true,"schema":"restro.reply.v1","settings":null}
```

### 5.3 Merge 往復（複製 comp 上で 12 枚の STROKE_* を選択した状態）

```
{"code":"","command":"merge","created_layer_ids":[197],"message":"items=1 created=1 hidden=0 removed=12","ok":true,"schema":"restro.reply.v1","settings":null}
```

### 5.4 Refine 往復（同一複製 comp 内の merged レイヤーに対して）

```
{"code":"SOURCE_IN_OTHER_COMP","command":"refine","created_layer_ids":[],"message":"SOURCE_IN_OTHER_COMP: \"Ae_Restro merged shape\" was decomposed in another composition","ok":false,"schema":"restro.reply.v1","settings":null}
```

Refine は失敗した。`Ae_Restro merged shape` は別 comp で分解された由来を持つため、
Refine が `SOURCE_IN_OTHER_COMP` で拒否する。**往復は Merge まで成立し、Refine は未成立**である。

### 5.5 失敗した最初の試行（記録として残す）

複製 comp をビューアーに開かないまま Merge / Refine を実行した最初の試行は、
どちらも次で失敗している（プラグインは「ビューアーに開いている comp」の選択を見るため）。

```
{"code":"CAPTURE_FAILED","command":"merge","created_layer_ids":[],"message":"Select one or more layers first.","ok":false,"schema":"restro.reply.v1","settings":null}
{"code":"CAPTURE_FAILED","command":"refine","created_layer_ids":[],"message":"Select one or more layers first.","ok":false,"schema":"restro.reply.v1","settings":null}
```

## 6. 生成されたレイヤー

| 項目 | 値 |
| --- | --- |
| `created_layer_ids` | `[109,110,111,112,113,114,115,116,117,118,119,120]`（12 件） |
| 分解前レイヤー数 | 2（`SOURCE 無`, `BG`） |
| 分解後レイヤー数 | 13（`STROKE_*` 12 枚 + `BG`） |
| `SOURCE 無` | `decompose_source_action = delete` のため**削除**された（`removed=1`） |

生成レイヤー名（index 順）:

| index | name | enabled | 頂点数 | bbox (comp) |
| --- | --- | --- | --- | --- |
| 1 | `STROKE_011_runs4` | true | 5 | 570.3, 506.7 – 610.6, 595.2 |
| 2 | `STROKE_010_runs4` | true | 6 | 763.0, 496.1 – 856.1, 600.3 |
| 3 | `STROKE_009_runs4` | true | 6 | 666.2, 503.9 – 725.9, 595.7 |
| 4 | `STROKE_008_runs4` | true | 5 | 429.5, 497.9 – 517.9, 599.8 |
| 5 | `STROKE_007_runs8` | true | 4 | 439.6, 447.9 – 844.5, 476.2 |
| 6 | `STROKE_006_runs4` | true | 4 | 754.7, 224.5 – 783.8, 475.4 |
| 7 | `STROKE_005_runs4` | true | 4 | 668.0, 224.5 – 695.4, 475.4 |
| 8 | `STROKE_004_runs4` | true | 4 | 582.8, 224.5 – 610.1, 475.4 |
| 9 | `STROKE_003_runs4` | true | 4 | 498.5, 221.4 – 527.2, 475.4 |
| 10 | `STROKE_002_runs12` | true | 4 | 432.7, 335.3 – 851.5, 363.6 |
| 11 | `STROKE_001_runs6` | true | 4 | 496.7, 223.7 – 833.4, 251.9 |
| 12 | `STROKE_000_runs6` | true | 10 | 428.5, 168.5 – 565.2, 314.0 |

全 12 枚が `closed = true` かつ `Fill` あり（塗りパス 1 本／uenclosure 複数可）。
頂点座標・面積・重心は `verification/rec-newmat/strokes.json` に全量で保存した。

Merge 成功後の複製 comp は `1:Ae_Restro merged shape(en=true) , 2:BG(en=true)` の 2 枚になり、
merged レイヤーの**頂点数は 181**。`merged shape` レイヤーの存在は**真**。

## 7. 受け入れ数値（実測）

算出は `tools/build-newmat-acceptance.py`（AE なし再計算可）。結果は
`verification/rec-newmat/acceptance.json` に同値で保存。

| 指標 | 値 | 定義 |
| --- | --- | --- |
| stroke count | **12** | 生成された `STROKE_*` の数 |
| merged shape layer 有無 | **あり** | `Ae_Restro merged shape`（頂点 181） |
| **overlap ratio** | **0.147520** | 2 枚以上に覆われる px / union px（10,349 / 70,153） |
| **largest piece / union** | **0.173621** | 最大 1 枚 `STROKE_007_runs8` 12,180 px / 70,153 px |
| **ink coverage（union / 元字）** | **1.034308** | union px 70,153 / 元字インク px 67,826 |
| ink coverage（分解描画 / 元字描画） | **1.000103** | AE 描画どうしの比 67,833 / 67,826 |
| ink coverage（union ∩ 元字 / 元字） | **0.991714** | 67,264 / 67,826 |
| ink coverage（フレームに対する率） | **0.076121** | union px / 1280x720 = 70,153 / 921,600 |

- union / 各 1 枚は**プラグイン自身のベクタ経路**を comp 座標 1px = 1 comp px で
  ラスタライズして求めた（`strokes.json` の `paths` を使うので AE なしで再現できる）。
- 元字のインクは同じ MSMincho テキストを AE で描いたもの
  （`verification/rec-newmat/png/00-source.png`、背景 #f7f7f7 / インク #111111、
  8bit 階調 <128 をインク判定）。
- 分解描画（`01-decomposed.png`）のインク bbox は x 429..855 / y 169..599 で、
  元字描画と**完全に一致**している（インク量も 67,833 px vs 67,826 px）。
  つまり分解は字形を再現しており、0.1475 の overlap は隣接画が 10,349 px だけ
  重なる（隣接する画どうしが 10,349 px だけ重なっている）ことを意味する。
- 面積は AE のパス面積（layer 空間、単位 px²）も `strokes.json` に保存している。

### 数値の一次ソース

| データ | ファイル |
| --- | --- |
| ベクタ経路・bbox・頂点数・面積 | `verification/rec-newmat/strokes.json` |
| プラグイン返信原文 | `verification/rec-newmat/plugin-replies.json` |
| 元字の描画 | `verification/rec-newmat/png/00-source.png`（1280x720, 15,582 bytes） |
| 分解結果の描画 | `verification/rec-newmat/png/01-decomposed.png`（1280x720, 15,578 bytes） |
| 受け入れ数値（算出結果） | `verification/rec-newmat/acceptance.json` |
| 取得スクリプトの生出力 | `.tmp/rec-newmat/acq.json` / `.tmp/rec-newmat/roundtrip.json` および同ディレクトリの `*.log` |
| プロジェクト | `verification/rec-newmat/NEWMAT.aep` |

## 8. gothic 版と mincho 版、そして Scene C がどちらを使うか

`NEWMAT.aep` には無の comp が 2 種類ある。

| comp | 書体 | STROKE_* | 備考 |
| --- | --- | --- | --- |
| `NEWMAT 無` | NotoSansJP-Medium（ゴシック系） | 12 枚（**全て enabled=false**） | -scenes C 側の**フォールバック候補** |
| `NEWMAT 無 mincho` | **MSMincho**（明朝系） | 12 枚（全て enabled=true） | **Scene C 作業 03「飛白」が実際に使う方** |

- `video/src/scenes/SceneC.tsx` の `WORK_SOURCES[2]` は
  `comp: "NEWMAT 無 mincho"`, `pattern: /^STROKE_/`, `title: "飛白"` を指す。
  フォールバック順は `W3_CANDIDATES = [NEWMAT 無 mincho, NEWMAT 無]`。
- 理由はコードのコメントに明記されている:「the mincho variant first (a brush-derived
  face, so the three gallery works do not all share the gothic texture of the
  筆/解 material)」。3 作品（墨帖 / 深解 / 飛白）が同じゴシック体で並ぶのを避けるため、
  3 作目だけは明朝系で撮る。
- なお「飛白」= 12 画。Scene C が「the twelve strokes are independent objects in flight」
  と描述している 12 画は、この分解の 12 枚 `STROKE_*` に対応する。

### 8.1 発見した不具合（未修正・要判断）

1. **`NEWMAT 無`（gothic）の 12 枚 `STROKE_*` が全て `enabled = false`。**
   `verification/rec-newmat/NEWMAT.aep` 内のこの comp は **BG だけの空のフレーム**に
   なる。`rec-newmat.jsx` 実行時にvisibility を戻す処理が壊れたまま保存されたため。
   Scene C は mincho 版を最優先で選ぶので通常は出番が無いが、
   `NEWMAT 無` が欠けた場合のフォールバックとしては**使えない状態**にある。
   本記録では他人（AEP 実体）を勝手に変更していない。
2. **分解設定 `decompose_source_action = delete` のため、元テキスト `SOURCE 無` は保存されない。**
   取得前の `NEWMAT 無 mincho` には `SOURCE 無` が残っていたが（`pv/generated/75-NEWMAT 無 mincho.ts`
   にも index 1 として残る）、今回取得した comp には無い。`pv/generated/` は再生成しない限り
   现状のままなので PV ビルドには影響しないが、再ダンプすると `SOURCE 無` は消える。
   Scene C 側は `pattern: /^STROKE_/` で層を絞るため動作は変わらない。
3. **Refine は merged レイヤー を受け付けない**（`SOURCE_IN_OTHER_COMP`）。§5.4 のとおり。

## 9. この記録がカバーしていないもの

- Merge → Refine の**往復は未成立**（Refine が拒否する）。R4 副素材（Merge/Refine 往復）を
  撮る場合は素の `STROKE_*` 群に対して Refine をかける必要がある。
- `decompose_source_action` を `keep` にした場合の再取得はしていない（プラグイン設定は
  製品側の判断なので、この記録では現状の `delete` のまま取得し、記録した）。
- `fit_curves` / `simplify` を変えた条件の比較はしていない。
