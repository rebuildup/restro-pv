# ADR-0003: PV制作モデルのRemotion転換

## 状態

Accepted

## 背景

ADR-0002 は「意味モデル → ProjectSpec コンパイル → 単一 JSX → After Effects」
を制作経路とした。しかし運用の結果、作業が AEP の生成・修復・実機検証に
偏り、映像そのもの（構図・動き・時間的連続性）の完成度が上がらない状態に
なった。After Effects の生成物を介さず、映像を直接コードとレンダリング
結果から扱える制作環境が必要になった。

一方で、既存 AEP（`legacy/pv-2dc99e1.aep`）には構図・グリッド・タイポ・
シーン構成・筆画素材・モーションがすでに存在し、これらを無視して新規に
作り直すことは目的ではない。`pv/generated/` には同 AEP の全73コンポの
深層ダンプ（CompSpec、プロパティツリー・キーフレーム・シェイプ頂点を含む）
があり、Remotion で解釈可能な構造データとして利用できる。

## 決定

1. **PV映像の制作・レンダリング経路を Remotion とする**。TypeScript/React
   を正本とし、`bun`/`remotion` CLI で Studio プレビューと MP4 レンダリングを
   行う。成果物は AEP ではなく Remotion composition が直接生成する動画とする。
2. **視覚的正本は AEP 構造ダンプと SPEC.md**。`pv/generated/` の CompSpec
   （`legacy/pv-2dc99e1.aep` 由来）を構造の出発点とし、`docs/SPEC.md` を
   演出・受入条件の正本とし続ける。AEP の全プロパティを機械転記することは
   目的とせず、表示結果と演出意図を保持する意味のある構造へ再構成する。
3. **AE JSX 生成経路は保全するが主経路ではない**。`pv/` の制作モデル・
   `tools/generate.ts`・`ae-test`・実機検証経路は、AEP 成果物が必要な場合と
   既存挙動の参照のために維持する。Remotion 上の映像制作の開発中必須条件
   にはしない。
4. **Remotion コードは `video/` に置く**。`pv/` は AE 向け JSX 生成モデル、
   `video/` は Remotion 向け映像モデルとして責務を分離する。package manager・
   runtime は ADR-0001 どおり Bun に統一し、lockfile は `bun.lock` を正本とする。
5. **AE 固有表現は実素材化を許容する**。SVG・画像・透過動画などへ書き出して
   利用してよいが、実際の筆画形状を見た目の似た架空図形で代替しない。

## 影響

- 新規: `video/`（Remotion compositions と AEP→Remotion 解釈層）、
  `docs/remotion-pipeline.md`（運用正本、実装時に整備）
- 新規 ADR は ADR-0002 を無効化しない。ADR-0002 のモデル→ProjectSpec→JSX
  経路は AE AEP 生成の契約として残り、Remotion 経路はその並行する別経路
  として追加される
- `AGENTS.md` の bootstrap / validation と能力表は Remotion 経路の追加に
  合わせて更新する
- GitHub Issue #22（epic）と #23〜#26 が本決定の実装単位
- BGM mp3 の単体公開・配布禁止など既存の Safety 規則は変更しない

## 却下した案

- **AE JSX 経路の延長**: 生成・修復への作業偏重という問題の原因であり、
  映像を直接扱えないため却下
- **AEP の全プロパティを TypeScript へ機械転記して Remotion 化**:
  表示結果と演出意図を超えた転記は編集可能性を下げるため却下
- **ゼロからの新規 PV 制作**: 既存 AEP の構図・素材・演出を捨てることになり、
  user の目的（AEP を出発点とする移行）に反するため却下
