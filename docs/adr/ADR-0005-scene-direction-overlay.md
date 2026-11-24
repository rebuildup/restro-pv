# ADR-0005: シーン演出の実装方針（dumped 優先 + 筆画 authored 層）

## 状態

Accepted

## 背景

ADR-0003 により PV 映像の主経路は Remotion となった。レンダラー基盤
（#23 / PR #27）は `pv/generated/` の CompSpec ダンプを解釈して AEP 構造を
再生する。SPEC §10 監査と v6/v9/v10 の受入不合格を経て、制作手段の選択が
要求を変えないよう、以下の安定した境界を定める。

`verification/beats/`（実AEP出力43ビート）は**原本の演出と素材を理解する
ための参照**であり、完成品質の正本ではない。原本に存在する未達
（C の作品同一性・D の静止録画・E のカード配置など）を継承しない。

## 決定（安定版 — 以降の改訂はこの枠組みの内側で行う）

1. **dumped コンポを既定とし、描画できるものはそのまま使う**。
   グリッド・ロゴ・テキスト・フッテージ・カード枠・タブ帯など、
   CompSpec 解釈層が正しく再生できる要素は dumped を保持する。
2. **FUDE 筆画リグは描画不能なので、字形が必要な場面では実筆画
   パスを StrokeField で authored 再描画する**。`glyph.tsx` は dumped
   コンポの shape データをそのまま SVG 化し、レイヤー transform と
   塗り色のみをシーン側で制御する。見た目の似た架空図形での代替は禁止
   （ADR-0003 第5項）。
3. **シーンの置き換えは「dumped が描画不能」または「dumped の配置が
   要求を満たさない」場合に限定し、シーン全体の安易な再実装をしない**。
   置き換える場合も原本の保護対象（構成・コピー・モーションの意味）を
   beats と SPEC から復元する。
4. **新規制作が必須の作業単位（C の作品・D の録画）は、省略せず実施する**。
   素材不足は作業省略の根拠にならない。
5. CompSpec への恒久的な変更が必要になった場合はダンプ生成側
   （`tools/dump-aep-tree.ts` 系）か AEP 側の修正として別 Issue で扱い、
   `pv/generated/*.ts` の手編集は行わない。`masterPatch.ts` の時間窓
   フィルタは dumped を変更しない実行時パッチとして許容する。

## 検証済みの事実（2026-11-25）

- FUDE リグ（STEP1-4 draft・Baseline・PV glyph・PV probe char・
  TMP_widecopy 等）は Opacity=0 固定で、表示を AE 式
  （`comp().layer()`・`createPath`・Linked Quad マスク式）に依存する。
  CompSpec 解釈層では**一切描画されない**。字形は StrokeField で再構成する。
- PV glyph WA/WB/WC/EE/A/A2/B/C は**全て同一の13筆画（同一「筆」）**。
  C の「3作品」は原本では同一素材のスケール違いであり、SPEC §5 C の
  「内容と動きの異なる複数作品」を満たさない。C は新規制作対象。
- dumped `PV end` は商品コピーを左カラム（x≈124）に配置しカード枠がなく、
  beats の右側カードと異なる。E の商品カードは authored 層で補う。
- `PV ops` の4録画窓は in-point 付け替え（`OPS_INPOINTS`）で
  ダイアログの写らない区間を表示できるが、素材自体の動きは限定的。
  D は実機再収録を前提に設計する。

## 影響

- `video/src/ae/masterPatch.ts`: dumped 実行時パッチ（tab 分割・
  STEP_REVEAL・B_HIDDEN・E_HIDDEN・D in-point）
- `video/src/scenes/`: 字形 authored 層（glyph.tsx + SceneB/SceneE ほか、
  WU ごとに追加）
- Issue #26 の作業単位 WU-0〜WU-Q（Issue コメント参照）で受入を管理
- AE JSX 経路（`pv/`→AEP）にはこの決定を適用しない。AE 経路は
  ADR-0003 第3項どおり保全のみ
