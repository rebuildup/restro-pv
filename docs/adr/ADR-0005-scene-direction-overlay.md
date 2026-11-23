# ADR-0005: シーン演出は Remotion 側 React シーンで実装する

## 状態

Accepted（一部改訂: 下記「改訂」を参照）

## 背景

ADR-0003 により PV 映像の主経路は Remotion となった。レンダラー基盤
（#23 / PR #27）は `pv/generated/` の CompSpec ダンプを解釈して AEP 構造を
再生するが、SPEC §10 監査が指摘する未達（C の作品差別化・D の可読性・
E の締め・A2 の専用演出・B の工程進行・左コピー整理）は dumped 構造の
ままでは解消できない。CompSpec は生成物であり、手編集すると再生成で
失われる。

## 決定

1. **シーン演出の作り込みは `video/src/scenes/` の React コンポーネント
   として実装する**。`PvVideo` の `layerFilter` で master の該当レイヤー
   を時間窓ごとに退避させ、React 側シーンを同じ時間窓・同じゾーンに
   重ねる。dumped CompSpec は AEP 構造の参照として変更しない。
2. **実Restro出力の筆画は dumped shape データを再利用する**。
   `Baseline`/`PV glyph`/`bunkai` の FUDE S*・STROKE_* レイヤーを
   `VectorShapes` で SVG 描画し、レイヤー単位の transform を React 側で
   時間関数駆動する。見た目の似た架空図形での代替は禁止（ADR-0003 第5項）。
3. **左カラムと B の工程進行も同じ機構で扱う**。`description`/`Heading`/
   STEP 系レイヤーの表示窓を `layerFilter` で整理し、必要なコピーは
   React テキストで置き換える。
4. CompSpec への恒久的な変更が必要になった場合は、ダンプ生成側
   （`tools/dump-aep-tree.ts` 系）か AEP 側の修正として別 Issue で扱い、
   `pv/generated/*.ts` の手編集は行わない。

## 影響

- 新規: `video/src/scenes/`（LeftCopy ほか、必要に応じてシーン別
  オーバーレイを追加）
- `video/src/PvVideo.tsx` の `layerFilter` がシーン退避とコピー整理を担う
- Issue #26 の受入条件はこの方式で満たす
- AE JSX 経路（`pv/`→AEP）にはこの決定を適用しない。AE 経路は ADR-0003
  第3項どおり保全のみ

## 改訂（2026-11-24 実装検証後）

CompSpec 解釈層（#23 / PR #27）の成熟により、master 内の dumped シーン
コンポ（`PV A2`・`PV reel C` 系・`PV ops`・`PV end`）が master コンテキストで
正しくレンダリングされることが確認された。C の3作品は `PV glyph WA/WB/WC`
の別文字コンポ、D の4窓は正しい in-point とトラックマットを持ち、E の
終了カードも素材どおり表示される。

このため **C/D/E/A2 のシーン全体を React で置き換える方針は取りやめ、
dumped コンポをそのまま使う**。React 側の残存オーバーレイは次に限定する。

- `LeftCopy`: 左カラムコピーのシーン別整理（`description`/`Heading`/
  A シーン見出しテキスト層の退避）
- `STEP_REVEAL` + tab 分割: B シーンの4工程の順次進行表示

`layerFilter` + React オーバーレイの機構自体は維持し、将来 dumped では
表現できない演出が必要になった場合に同じ方式で追加する。
