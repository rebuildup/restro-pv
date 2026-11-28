# restro-pv

Restro（After Effects 向けベクター筆画復元プラグイン）のプロモーション PV 制作リポジトリ。

PV 映像の主経路は **Remotion**（`video/`）で、TypeScript/React を正本として
1080×1080 / 24fps / 20s の MP4 を直接レンダリングする（ADR-0003）。
確定レイアウト（背景・ブランド・左情報領域）と右ステージ・コンテンツの
責務境界は `video/src/layout/` が単一権威であり、契約は
`tests/pv-layout-contract.test.ts` と `tools/verify-layout.ts` で検証する。
運用の詳細は `docs/remotion-pipeline.md`、回収記録は
`docs/issue30-recovery.md` を参照。

AE 経路（`pv/`）では TypeScript が制作の正本であり、ビルドされた単一の
ExtendScript 互換 JSX を After Effects で一括実行して AEP を生成する。
MCP による逐次編集や場面ごとの JSX パッチは主経路ではない
（実行・レンダリング・検証には使う）。

製品本体の開発は `rebuildup/Ae_Restro` で行う。このリポジトリは PV 制作だけを扱う。

## 構成

| パス | 内容 |
| --- | --- |
| `video/` | Remotion 制作ソース（主経路）。`src/layout/` が確定レイアウト、`src/scenes/` が右ステージ・コンテンツ |
| `pv/` | TypeScript 制作ソース（Project Model / Geometry / Animation / Scenes / Timeline / AE Runtime / Build）— AE JSX 経路 |
| `legacy/` | 移管した既存 AEP と JSX のスナップショット。解析・検証用の参照資料 |
| `assets/` | BGM・実機録画・画像などの制作素材 |
| `verification/` | beats PNG 連番・確認用レンダーなどの検証証跡 |
| `tools/` | After Effects を駆動する Node/TypeScript ツール |
| `docs/` | 仕様（`SPEC.md`）・移管記録（`migration/`）・ADR |

`legacy/` と `verification/` は **参照資料**であり、編集対象ではない。
新しい制作は `pv/` の TypeScript を変更して全体を再生成する。

## セットアップ

```sh
bun install --frozen-lockfile          # 依存導入（Bun >= 1.3.13。mise install で toolchain を固定）
bun run typecheck
```

After Effects を使うツール（`tools/`）には実機の After Effects が必要。
AE が見つからない場合は環境変数 `AE_EXECUTABLE` に実行ファイルの絶対パスを設定する。

## 開発コマンド

| コマンド | 内容 |
| --- | --- |
| `bun run typecheck` | TypeScript 型検査 |
| `bun test` | ユニットテスト |
| `bun run build:jsx` | `pv/` を単一 JSX にバンドル（Phase 3 で追加） |
| `bun run render:beats` | `master` コンポを拍ごとに PNG レンダリングして `verification/beats/` を更新 |
| `bun tools/verify-layout.ts` | 確定レイアウト契約のピクセル検証（PV-Master vs PV-Chrome） |

Remotion 経路のコマンド（still / render）は `docs/remotion-pipeline.md` を参照。

## 移管元

`rebuildup/Ae_Restro` の `promo` ブランチから移管した。ファイルごとの出所・
コミット SHA・MD5 は `docs/migration/PROVENANCE.md` を参照。

## ライセンス注意

`assets/audio/` の BGM は Pixabay Content License の楽曲で、**mp3 ファイル単体の
公開・配布は禁止**（private リポジトリでの作業用追跡のみ可）。PV 公開時は映像に
埋め込んだ形で公開する。詳細は `docs/migration/promotion-README.md` を参照。
