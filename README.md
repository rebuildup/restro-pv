# restro-pv

Restro（After Effects 向けベクター筆画復元プラグイン）のプロモーション PV 制作リポジトリ。

**TypeScript が制作の正本**であり、ビルドされた単一の ExtendScript 互換 JSX を
After Effects で一括実行して AEP を生成する。MCP による逐次編集や場面ごとの
JSX パッチは主経路ではない（実行・レンダリング・検証には使う）。

製品本体の開発は `rebuildup/Ae_Restro` で行う。このリポジトリは PV 制作だけを扱う。

## 構成

| パス | 内容 |
| --- | --- |
| `pv/` | TypeScript 制作ソース（Project Model / Geometry / Animation / Scenes / Timeline / AE Runtime / Build） |
| `legacy/` | 移管した既存 AEP と JSX のスナップショット。解析・検証用の参照資料 |
| `assets/` | BGM・実機録画・画像などの制作素材 |
| `verification/` | beats PNG 連番・確認用レンダーなどの検証証跡 |
| `tools/` | After Effects を駆動する Node/TypeScript ツール |
| `docs/` | 仕様（`SPEC.md`）・移管記録（`migration/`）・ADR |

`legacy/` と `verification/` は **参照資料**であり、編集対象ではない。
新しい制作は `pv/` の TypeScript を変更して全体を再生成する。

## セットアップ

```sh
bun install --frozen-lockfile          # 依存導入（Bun >= 1.4.5。mise install で toolchain を固定）
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
| `bun run render:beats` | `PV master` コンポを拍ごとに PNG レンダリングして `verification/beats/` を更新 |

## 移管元

`rebuildup/Ae_Restro` の `promo` ブランチから移管した。ファイルごとの出所・
コミット SHA・MD5 は `docs/migration/PROVENANCE.md` を参照。

## ライセンス注意

`assets/audio/` の BGM は Pixabay Content License の楽曲で、**mp3 ファイル単体の
公開・配布は禁止**（private リポジトリでの作業用追跡のみ可）。PV 公開時は映像に
埋め込んだ形で公開する。詳細は `docs/migration/promotion-README.md` を参照。
