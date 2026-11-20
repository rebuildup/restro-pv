# ADR-0001: AI エージェント環境の project-local 化

## 状態

Accepted

## 背景

この repository は TypeScript を正本とし、生成した ExtendScript 互換 JSX を After Effects で実行して AEP を作る制作基盤である。開発は AI エージェント前提だが、規則が global 設定や会話履歴にだけあると、fresh clone や別 agent で再現できない。

project-init の標準は Bun と release branch 運用を既定にするが、この repository は既に npm / package-lock / Node 24 の toolchain と、`main` 直接運用の delivery 契約を持つ。標準へ機械的に合わせると、動作する検証経路と既存の delivery 境界を壊す。

## 決定

1. `AGENTS.md` は dispatcher に留め、詳細規則は `.agents/skills/` と `.claude/skills/` の project-local Skill、`docs/` の正本へ置く。`CLAUDE.md` は `AGENTS.md` への薄い adapter とする。
2. 外部・upstream 由来の Skill は `skills` CLI の `--copy` で導入し、`skills-lock.json` に source / immutable commit / computed hash を固定する。`.agents/skills/` と `.claude/skills/` は同じ内容を維持する。
3. package manager は npm を維持する。Bun への移行は、この repository の lockfile・CI・文書化済み command を置き換える具体的な非互換が示されるまで行わない。
4. delivery は現行契約どおり `main` を base とし、release branch は必要になった時点で `release-x-y-z` を作る。release-to-main 統合と外部公開は明示的なユーザー承認を要する。
5. Web UI 向けの Skill は導入しない。この repository に HTML/CSS/DOM/ブラウザ UI はなく、成果物は After Effects の映像である。

## 採用した Skill の軸

- project-init 由来: `agent-recovery`, `code-naming`, `correctness-assurance`, `design-refinement`, `engineering-decisions`, `github-delivery`, `interaction-discipline`, `onboarding`, `quality-gate`, `security-maintenance`, `skill-selection`, `system-quality`
- 文書: `writing-discipline`, `natural-japanese`
- 外部候補: `diagnosing-bugs`
- 映像設計: `promotional-video`, `product-promo-video`, `transition-design`
- project 自作: `host-editing`（lock 対象外）

`motion-system` や `design-intent` は見送った。前者は Web/mobile UI の motion を対象とし、後者は未解決の visual direction を扱う Skill であり、この repository では `docs/SPEC.md` が構成・演出・受入条件の正本として既に存在するため、重複する routing を増やさない。

## 結果

- fresh clone で `AGENTS.md` から Skill と validation command へ辿れる。
- 外部 Skill は lock により source revision と hash が固定され、手編集との差分を検出できる。
- npm / `main` 運用という project 固有の deviation は、暗黙の例外ではなくこの ADR と `AGENTS.md` に記録された判断になる。
- 実機 After Effects を要する検証は、この環境で常に実行できるとは限らない。実行できない場合は `docs/ae-pipeline.md` の証跡規則に従い、未検証として報告する。
