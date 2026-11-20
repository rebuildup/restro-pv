# restro-pv agent contract

このファイルは dispatcher です。規則の本文はここへ複製せず、下の Skill と
`docs/` を正本として参照します。

## 目的と境界

Restro のプロモーション PV を、**TypeScript を正本**として制作するリポジトリ。
ビルドされた単一の ExtendScript 互換 JSX を After Effects で一括実行し、
完成した AEP を生成する。MCP による逐次編集や場面ごとの JSX パッチは
制作の主経路ではない。

- 製品本体（Restro / Ae_Restro プラグイン）の開発は `rebuildup/Ae_Restro`。
  このリポジトリから Ae_Restro のソースを編集しない。
- `legacy/`・`verification/` は移管した参照資料。編集せず、解析と検証に使う。
- secret value・トークンはこのリポジトリに置かない。

## 正本

| 対象 | 正本 |
| --- | --- |
| PV の構成・演出仕様 | `docs/SPEC.md` |
| 実装 scope / 受入条件 | GitHub Issues |
| review / 統合 / 検証 evidence | GitHub Pull Requests |
| 移管元との対応 | `docs/migration/PROVENANCE.md` |
| 判断の経緯 | `docs/adr/` |

`main` への release 統合は明示的なユーザー承認を要する。
ticket PR は依存順に自律統合してよい。

## Bootstrap / validation

```sh
npm ci
npm run typecheck   # 型検査
npm test            # ユニットテスト
npm run build:jsx   # pv/ -> 単一 JSX（実装後）
```

`npm run typecheck` / `npm test` は実機 After Effects を必要としない。
実機検証（JSX 実行・レンダリング・beats 再生成）はローカルの AE が必要で、
CI では証明しない。実機検証の結果は PR に記録する。

## 作業開始

1. GitHub Issue を選ぶ。branch 名は Issue 番号だけにする。
2. 最初の意味のある commit の後、remote へ push し、直後に PR を作る。
   base は `main`（release branch は未運用。必要になったら `release-x-y-z` を作る）。
3. PR は作業中 Draft、検証を満たしたら Ready にする。

手順の詳細は `github-delivery` Skill。判断を user へ返す条件は
`engineering-decisions` Skill。

## 能力ごとの担当

| 能力 | Skill | 使う場面 |
| --- | --- | --- |
| delivery | `github-delivery` | Issue / branch / PR / release 運用 |
| recovery | `agent-recovery` | 中断からの再開、checkpoint |
| quality-gate | `quality-gate` | 検証レベルの決定、完了判定 |
| engineering-decisions | `engineering-decisions` | 実装判断の優先順位、userへ返す判断の境界 |
| design-before-build | `design-refinement` | 非自明な feature / 設計の実装前整理 |
| host-editing | `host-editing` | AE への編集・自動化・検証を行う前 |
| debugging | `diagnosing-bugs` | 失敗・壊れた動作の原因特定 |
| onboarding | `onboarding` | docs の整備・更新 |
| prose-artifact | `writing-discipline` | README / ADR / Issue / PR / commit 等を書く前 |
| prose-japanese | `natural-japanese` | 日本語文書の推敲 |
| interaction-style | `interaction-discipline` | user への質問・blocker 報告 |

Skill の実体は `.agents/skills/<name>/SKILL.md`（Claude Code は `.claude/skills/`）。

## House rule

- source code / commit message は英語、internal docs・Issue・PR・review は日本語
- commit message: `<work-prefix>: <短い title>`
- package manager は npm。text search は `rg`
- 新規 script を `.py` で追加しない。Node 側 script は TypeScript
- TypeScript ソースは `pv/` に構造化し、実行時は単一 JSX にバンドルする。
  外部素材を除き、既存 AEP や既存コンポへの実行時依存を持たせない
- project 固有の rule を global 設定・home directory・agent の私的 memory にだけ置かない

## Safety

- AE を開く前に対象プロジェクト・コンポを確認する。読み取り専用で先行し、
  初回・破壊的操作は保存済みコピーに対して行う
- AE への書き込みは直列化する。同じ開いているプロジェクトへ同時書き込みしない
- `legacy/` の AEP を直接編集して成果物にしない。編集は `pv/` の TS 側で行い、
  JSX を再生成して新しい AEP を作る
- BGM mp3 を単体で公開・配布しない（Pixabay Content License の制約）
