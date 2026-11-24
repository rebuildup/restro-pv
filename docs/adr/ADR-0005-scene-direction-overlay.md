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

## 改訂（2026-11-24 v6 受入不合格を受けて）

v6 の全編レビューで dumped コンポ採用が視覚受入を満たさないことが確認
されたため、dumped を既定路線とはせず **シーン単位で authored 層を復活**
させた。`glyph.tsx` の StrokeField が dumped コンポの筆画レイヤーを
rest pose で個別再配置できるため、素材の実形状を保ったまま演出だけを
Remotion 側で制御する。

- A2 [1.875,3.79): `PV A2`/`kai-zoom`/`bunkai` を退避し SceneA2 が交差
  筆画の分離・隠れ部マーカー・ゴーストを描画
- B [3.9,7.96): STEP draft カード・tab・Lens magnifier・Baseline を退避し
  SceneB が同一「筆」グリフへ工程ごとの筆画群を累積表示。SPEC §0 が
  「保護対象」とした STEP カード構造からの逸脱だが、dumped 構造では
  「同一文字への処理結果の累積」が表現できず受入不合格だったため、
  SPEC の演出意図（同一文字上に処理結果を時間とともに重ねる）に忠実な
  authored 実装を採用した。工程ラベル（master idx 166-169）は維持
- C [7.96,11.71): `PV reel C` を退避し SceneC が縦スクロール窓内に
  Baseline FUDE 筆画で構成した3作品を表示
- D: dumped `PV ops` の4録画窓は維持し、in-point をダイアログの写らない
  操作区間へ付け替え（`OPS_INPOINTS`）
- E [15.46,20): `PV end` を退避し SceneE が3タイル→筆分離再集合→
  商品カードの構成を描画
