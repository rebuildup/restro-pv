# AE パイプライン運用（Issue #6）

TypeScript 正本 → 単一 JSX → 実機 AE → 完成 AEP → 検証 の経路と、
`@ido-bata/ae-a8n` / `ae-devtools-cli` / `ae-test` の役割分担を記録する。

## コマンド対応表

| 段階 | コマンド | 実体 | 実機 AE |
| --- | --- | --- | --- |
| 診断 | `npm run doctor` | `tools/doctor.ts`（Node/AE/依存/所有権/成果物 + `ae-devtools doctor` 委譲） | 不要 |
| 型検査 | `npm run typecheck` / `npm test` | tsc / node --test | 不要 |
| JSX 静的検査 | `npm run jsx:check` | `jsx-toolchain check dist/pv.jsx`（AE API 型・ES3 構文） | 不要 |
| ビルド | `npm run build:jsx` | `tools/build-jsx.ts` → `dist/pv.jsx`（ASCII-only） | 不要 |
| 生成 | `npm run generate` | `tools/generate.ts` → `AfterFX.exe -r` + レポート待機 | **必要** |
| 構造検証 | `npm run verify` | `tools/verify.ts`（出力同一性 → 再ダンプ → `compare-aep`） | 必要（ダンプ時） |
| プレビュー | `npm run render:beats` | `tools/render-pv-beats.ts`（生成 AEP が既定） | 必要 |
| ベースライン | `npm run render:baseline` | 同上、`legacy/pv-2dc99e1.aep` 固定 | 必要 |
| リリース検証 | `npm run release-verify` | `tools/release-verify.ts`（全フレーム + mp4 + beats） | 必要 |
| ae-test | `npm run test:ae` | fake ホストの runner 契約 spec | fake のみ |

## パッケージの役割と検証済み事実

- `@ido-bata/ae-a8n@0.4.0`（npm registry、旧 git pin `b70f329` = 0.1.0-alpha.1 から更新）
  - `AfterEffects.launch()` / `ScriptInvocationTransport` / `openProject` / `comp.renderFrame`
  - `dist/testing` の `FakeApplication` + `runHostScript` で生成 JSX を Node 内 ES3 エンジンで実行可能（`tests/pv-fake.test.ts`）
  - あいまいだった所有権を `HostOwnership`（owned/attached/unknown）と launch provenance で明示
- `@ido-bata/ae-devtools-cli@0.5.0`
  - `ae-devtools doctor|discover|inspect|execute|verify|diagnose`、`jsx-toolchain check|lint|resolve`
  - `discover` の 97 op は現状 **fake/mock 検証のみ**（realHostVerified: 0）
  - `doctor` の `aeInstalls` 検出は macOS `/Applications` のみ → Windows では常に 0 件（既知のプラットフォーム差）
  - `verify`/`execute` は `--consent grant` が必要。session 既定は `fake`
- `@ido-bata/ae-test@1.1.0`
  - Playwright 風 runner。fake ホストで CI 可能（`ae-test.config.json` 済）
  - **real-host は現バージョンで Windows 非対応**: ae-a8n が Windows で「自分が起動した AE」を証明できず、ae-test は非所有セッションを拒否する（README 明記）。実機検証は generate/verify/render-pv-beats 経路を使う

## 依存の単一化

`ae-devtools-cli@0.5.0` と `ae-test@1.1.0` は内部で `ae-a8n@0.2.0` を完全一致 pin する。
`package.json` の `overrides` で `@ido-bata/ae-a8n: 0.4.0` に統一し、
`npm ls` で単一インスタンスを確認する（`doctor` の `deps.ae-a8n.dedup` が監視）。

## AE 実行の所有権

Windows の `AfterFX.exe` はシングルインスタンスで、`-r` は起動中の AE へ委譲される
（ae-a8n script-invocation の仕様どおり）。したがって:

- AE 未起動 → `generate` が spawn し、そのインスタンスは我々のもの
- AE 起動中 → 既定で **拒否**（`refused-ae-running`）。`--allow-running-ae` は
  ae-a8n で attach して開いているプロジェクトが空（`itemCount === 0`）であることを
  確認した場合のみ許可。attach には `close()` を呼ばない（ユーザープロジェクトを閉じないため）
- `hostMutation`（`tools/lib/host-retry.ts`）は stall 時に **絶対に再実行しない**。
  結果不明は `HostOutcomeUnknownError` として報告し、状態読み戻しを要求する
- 読み取り・冪等処理のみ `hostCall`/`hostQuery` が 1 回だけ retry する

## タイムアウトと二重実行

- `generate` は `.tmp/pv-report.json.done` を spawn 前に削除し、**fresh な marker**
  （mtime > 起動時刻）だけを成功とみなす。stale `.done` は証拠にならない
- タイムアウトは `unknown-timeout`：JSX がまだ AE 内で走っている可能性があるため
  **自動再 spawn しない**。AE と `.tmp/pv-report.json*` を人間が確認してから再開する
- `verify` は `generate-run.json` の `output.sha256` と実 AEP のハッシュを照合し、
  別ビルドの成果物や手作業の AEP を誤って検証しない

## 失敗時の証跡

- `.tmp/generate-run.json`: jsx sha256/bytes、git HEAD/dirty、AE 実行ファイル、
  spawn pid、添付プロジェクト情報、report の warn/err 一覧、出力 AEP の sha256
- `.tmp/pv-report.json`: ランタイムが書く warnings/errors（上限各200件）
- `.tmp/verify-report.json` / `.tmp/release-report.json`: 検証判定
- `ae-devtools` の runs dir（`%TEMP%/ae-devtools-cli-runs`）と consent audit

## JSX のエンコーディング

生成 JSX は **ASCII のみ**（`pv/emit/spec-literal.ts` が非 ASCII を `\uXXXX` 化）。
ExtendScript は BOM 無し UTF-8 の非 ASCII を誤パースするため（`evalFile` で
"Unterminated string constant" を実測）。

## 既知の制約・未検証事項

- `ae-test --real-host` は Windows では動かない（上記）。macOS での実機 spec は未作成
- `ae-devtools execute/verify` の real dispatch は未検証（consent・session 方針の検討が先）
- 分離位置（Position_X/Y/Z）は keys/expression の有無で判定。キー無しの静的分離は
  現状検出できず、非分離側として処理される（発生時は convert-warnings ではなく
  実行時エラーとして顕在化する想定）
- hidden プロパティの刈り込みは 3D 系と Vec3D material が対象。effect 引数など
  他の hidden 系が残っていれば report の errors で検出して個別対応する
