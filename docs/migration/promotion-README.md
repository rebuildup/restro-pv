# PV 制作データ

Ae_Restro の紹介 PV の制作データ。ここにあるのは「PV を再編集・再現するために必要な
ファイル」だけで、書き出し済みの動画（mp4）は含まない（書き出しはリリース時に行う）。

## ファイル

| ファイル | 内容 |
| --- | --- |
| `pv.aep` | After Effects の制作プロジェクト。XMP メタデータは `Adobe After Effects 2026 (Windows)` が書き出したもの（作成 2026-10-23） |
| `PV-STRUCTURE.md` | PV の構成・演出仕様（正本）。`PV-STRUCTURE-reviewed.md` はレビュー修正版の履歴 |
| `pv-review.mp4` | `master` を 20 秒・音声付きで書き出した確認用動画（h264/aac） |
| `drums-and-somps-background-music-458414.mp3` | BGM。44.1 kHz / 256 kb/s / 1 分 13.20 秒 |
| `assets/rec/*.mp4` | シーンD用の実機AE操作録画（1920×1080 / 24fps） |
| `beats/` | `master` コンポを 128 BPM の拍ごとに 1 枚ずつレンダリングした PNG 連番と `manifest.json`。編集の進捗を git 上で画像として追えるようにするためのもの |

制作データ（pv.aep と mp3）の合計は 2.8 MB で、`beats/` を含めても Git LFS は要らない
（GitHub の 1 ファイル 100 MB 制限に対して十分小さい）。制作データはバイナリなので、
ルートの `.gitattributes` で `binary` を指定して、行末変換とテキスト差分の対象から
外している。既存ファイルは変換も削除もしていない（mp3 の ID3 タグは元のまま）。

キャッシュや一時ファイルは追跡しない。今後 AE の作業中に生じる `*.aep.bak`、
`*.aep~` のようなものも追跡しない。`beats/` は例外的に、進捗確認のため追跡する
生成物である。

### pv.aep と beats/ の対応（2026-11-19 検証）

現在の `pv.aep` は `21a6b78` 時点のプロジェクトを復元したもの（`aa55fe6`）。
実機 After Effects で `master` コンポの全 43 フレームを再レンダリングし、
コミット済みの拍画像と **全件 pixel 一致**（PSNR = inf）することを確認済み。

### 2026-11-19 のシーンC/D/E再構築

`master` の C `[191,281)`・D `[281,371)`・E `[371,480)` を実素材で作り直した。
A1・A2・A3・B は変更しておらず、拍1〜17 の画像は byte 一致のまま（保護の証拠）。
変更されたのは拍18〜43。

- C：実Restro出力（Baseline の FUDE 筆画13枚）による3作品の縦スクロール窓
- D：実機AE操作録画3本を4窓で非同期に再生（主窓は分解前→後の同一録画）
- E：3シーンの小窓→完成した「筆」→商品カード（Restro / 筆画復元 / BOOTH / URL）

`manifest.json` の `layerCount` は復元時点の 260 から実測 263 に更新した。
C/D/E の構図・内容は `PV-STRUCTURE.md` 第5節の受入条件で確認する。

### 2026-11-20 の最終候補（C/Eの実素材ifix）

C と E を **実Restro出力そのもの**で作り直した。`Baseline` は文字（x 602〜1290, y 296〜994）を
1080px のフレームからはみ出させて持っており、フレームで切られていた。`Baseline` を 1400px に
広げた複製（`PV glyph`）を作れば文字全体が出るので、C の3作品（全寸／切り取り／小寸、
「作品 01〜03」）と E の「筆」はこの複製を使う。FUDE 筆画を `copyToComp` でコピーすると
パスが潰れるため、文字は**レイヤー単位では再利用できず**、コンポ複製でしか作れない
（`PV-STRUCTURE.md` 付録A-3）。

- C：白地の縦スクロール窓（x480〜1080, y60〜1020）に実Restro出力の3作品
- E：3シーンの小窓（0〜0.95秒）→ 復元された「筆」（0.90〜2.40秒）→ 商品カード（2.40秒〜、
  枠560×500の中に Restro / 筆画復元 / After Effects プラグイン / BOOTHで販売中 / URL 全部）
- 動画 `pv-review.mp4` は `master` を 480 フレーム（1080×1080）でレンダーして 20.00 秒
  h264/aac にしたもの。拍画像43枚も同じ `master` から `npm run render:pv-beats` で生成。
- **保護の証拠**: 追跡済み拍画像との md5 比較で拍1〜17（A1・A2・B）が完全一致。差分は
  拍18〜25（シーンC）と拍35〜43（シーンE）のみ、シーンD（拍26〜34）は差分なし。
- `manifest.json` の `layerCount` は実測 266。`pv.aep` の `master` は 266 レイヤー。

シーンCは「作品内での筆画単位アニメーション」（集束／波／別構図）が未実装で、実Restro出力の
フレーミング差で3作品として見せる構成にした。仕様との差異は `PV-STRUCTURE.md` 付録A-2 に明記。

注意: `75f08da` で一度コミットされた pv.aep（5.4 MB、master=151 レイヤー）は
拍画像を生成したプロジェクトではなかった（拍画像生成時の master は 260 レイヤー）。
`60fdf55` 以降のプロジェクト変更（シーンC修復・シーンDウィンドウ等）は
`promo-backup-redesign-20261119` ブランチに保持しており、必要になった時点で
個別に評価する。

## 参照関係

`pv.aep` が参照する外部ファイルは **mp3 だけ**（プロジェクト内の参照をすべて走査した
結果、`fullpath` を持つ外部参照はこの 1 件だけ）。

```
pv.aep  ->  C:\Users\rebui\Desktop\Ae_Restro\promotion\drums-and-somps-background-music-458414.mp3
```

After Effects は参照を絶対パスで持つ。チェックアウトする場所が変わると AE は
「ファイルを検索」と言い出すので、`promotion/` にある同じ mp3 を選んで再リンクする。
mp3 を `promotion/` に置いているのは、チェックアウトし直すたびに同じ場所に来るように
するため（参照を壊さないため、ファイル名は変えない）。

それ以外の参照は AE 標準のものだけ（`ADBE` のエフェクト、図形レイヤーの塗り
`solidFill` / `gradientFill` / `stroke` 系、文字レイヤーの `ADBE Text Properties`）。
第三者の CEP 拡張や外部プラグインの参照は見つからない。

PV の構成（読み取れる範囲でのレイヤー名）:

- `Restro for Ae 2` — 文字レイヤー（ADBE Text Properties）
- `White Solid 1` / `White Solid 2` — ソリッド

## 再編集・再現の手順

1. After Effects 2026（26.5 以降）で `promotion/pv.aep` を開く。
2. 音楽が「オフライン」表示になったら、同じフォルダの
   `drums-and-somps-background-music-458414.mp3` を選ぶ。
3. 書き出すときは、音声を映像に含める（PV の映像に BGM が入る）。

## beats/ の再生成

```sh
npm run render:pv-beats
```

`scripts/render-pv-beats.ts` が ae-a8n 経由で After Effects を起動し、`pv.aep` の
`master` コンポ（1080x1080 / 24fps / 20 秒）を開いて、128 BPM（1 拍 = 0.46875 秒）
ごとの時刻に最も近いフレームを PNG として書き出す。結果は `promotion/beats/` に
`beat-001.png` から連番で置かれ、`manifest.json` に拍 → 時刻 → フレーム → ファイル名の
対応が記録される。拍の頭をずらしたい場合は `--offset <秒>`、テンポを変える場合は
`--bpm <数値>`、別コンポを見る場合は `--comp <名前>` を付ける。

注意:

- 実機の After Effects が必要。AE が既に起動している場合はそれに接続し、こちらからは
  終了しない（未保存の変更があると `openProject` が拒否するので、その場合は
  `--discard-unsaved` を付けるか AE 側で保存してから実行する）。
- レンダリングは `comp.saveFrameToPng` ベースで、動画出力モジュールは使わない。
- `beats/` は生成物だが進捗確認用に git 追跡する。再生成のたびに全ファイルが
  差し替わるので、差分レビューには向かない。

## ライセンス

- **BGM**: Pixabay のトラック
  [「Drums and Somps Background Music」](https://pixabay.com/music/drums-and-somps-background-music-458414/)
  （Petrushkasound、ID 458414）。**Pixabay Content License**。
  - 商用・非商用とも無料で使用可、**クレジット表記は不要**（表記하면歓迎される）
  - 改変して別の作品に組み込むのは可
  - **制約**: 「コンテンツを変更しない形での単体での販売・配布」はできない
    （創作の工夫が実質的にゼロで、配布物が Web サイト上の形と実質的に同じ場合）。
- したがってこのリポジトリ（**private**）で作業用として追跡するのは問題ないが、
  **mp3 ファイル単体を公開・配布しないこと**。PV を公開するときは映像に埋め込んだ形
  で公開し、mp3 が必要なら Pixabay から再ダウンロードする。
- `pv.aep` は自作の制作データなので、ライセンスの制約はない。

出典:

- [Pixabay Content License の要約](https://pixabay.com/service/license-summary/)
- [Pixabay Music](https://pixabay.com/music/)
