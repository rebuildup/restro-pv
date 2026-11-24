# WU 進捗管理（PR #27 / branch 23）

> 状態区分：**未着手 / 制作中 / 技術検証済み / 独立レビュー合格**。
> 「技術検証済み」は描画・タイミングが動くことの確認まで。
> 「独立レビュー合格」は tools/wu-review.ts の記録（verification/reviews/）
> に基づく。実装者の自己評価は合格根拠にしない。
> 正本の要求は SPEC §5・§11 と Issue #26 コメント。変更にはレビューを要する。

## 依存関係

- **#28 筆画素材契約** → A2/B/C/E の筆画供給。C は Baseline FUDE を
  StrokeField で直接再描画済みのため #28 非依存で制作可能。
  A2 は現行 sanitize で暫定供給中（#28 で共通化予定）。
- **D 再録画** → AE2027 + JSX + 画面収録の実機経路が前提。
  本環境で AE が使えなければ素材不足として記録し、区間編集で収束を図る。
- **全編レンダー** → 全WUが独立レビュー合格してから集約実施。

## 各WU

| WU | 内容 | 状態 | 証跡・メモ |
|---|---|---|---|
| WU-0 | 共通デザイン基準 | 制作中→改訂済 | design-baseline.md を判断基準型に改訂（固定規則の画一化を禁止） |
| WU-A | A1〜A3 導入 | 独立レビュー合格（wu-a-r6: 9/9 PASS） | r1-r4 FAIL（左カラム衝突・A3ブリッジ残像・f88-95暗部）を反復修正: bunkai(232) にフェードイン＋右シフト、孤立callout 192/193とA2T ghost非表示化、A区間の衝突するdescription層を無効化。r6 は precomp clip 後の再検証で PASS。manualGate（同一素材・共通変換の輪郭登録証明）は manual-gates.md に集約済 |
| WU-B | B 工程 | 独立レビュー合格（wu-b-r14: 8/8 PASS） | SceneB 全面作り直し: 実測の輪郭シルエット→筆画別draft輪郭→実ストローク交差のjunctionマーカー+ルーペ→13実筆画の分離再構成。analysisGate で工程を硬く切替、レンズは下部空き領域で実拡大。glyph.tsx に ContourField itemColor/itemTransform 追加。r14 は precomp clip 後の再検証で PASS |
| WU-C | C 作品例 | 独立レビュー合格（wu-c-r17: 9/9 PASS） | r7〜r15 で FAIL 反復後に作り直し。最終形: cell pitch 1920（960px 空白ギャップ=窓高で2作品が窓内に同居しない直列遷移）、各作品は認識→動き→収束→保持の完結アーク（w1 散布→段階集約→安定 ripple、w2 多色筆→時間差の波→収束、w3 上下反転エンブレムの stream-in→呼吸→保持）。作品ごとに地色・完成像を差別化（和紙/寒色/暗色）。f281 の D cut で残留なし。r17 は precomp clip 後の再検証で PASS。description comp の文字切れは AE 原本も同一箇所で切る忠実な再現と確認済（fidelity-check.md） |
| WU-D | D 実操作録画 | 独立レビュー合格（wu-d-r28 PASS 10/10） | authored 再構成完了: dumped PV ops 非表示化＋description Dブロック clamp、SceneD.tsx が左コピーと4非同期窓を自前描画（W1分解before→after / W2筆画モーション / W3制御点編集 / W4再処理dialog→結果）。区間は全フレームデコードで検証（-ssシークずれを SEGMENTS.md に記録）。再録画不要と判断。r27 FAIL（窓の退場が非同期に見えない）→ fOut を W2=356/W3=361/W4=366/W1=370 に stagger 修正＋中間フレーム追加で r28 PASS |
| WU-E | E 商品 | 独立レビュー合格（wu-e-r10: 9/9 PASS） | r4 PASS はユーザー実画像確認で撤回後、v5-v10 で再構成: hero 右ゾーンクリップ・組版ロックアップ化（Web chrome 撤去）・タイル stagger 修正・回収タイルを実成果スナップショットへ統一（B=SceneB f154 crop / C=SceneC f220 crop / D=検証済み録画フレーム、assets/rec/e-tile-*.png）。r9 FAIL（B/C が抽象記号に見える）→ 実レンダー由来の静止画タイルに置換し r10 PASS。manualGate の実コンポ/実素材参照は SceneE.tsx + assets/rec/ で証明可能 |
| WU-Q | 独立レビュー基盤 | 技術検証済（v2.1 / criteria 2026-11-25.3） | criteria: 全WU共通基準 CMN-1..4 を自動マージ、seriesFrameGuidance でフレーム密度指針を明文化（wu-d-r27 の中間フレーム不足 FAIL を教訓化）。WU-E に E-4 実コンポタイル・E-5 Web風カード禁止。manualGates で静止画不可証明条件を別証拠必須化。r4 見逃し原因=基準欠落を calib-e-fail-1（FAIL 8/9）で較正済 |
| WU-INT | シーン境界の統合検証 | 独立レビュー合格（wu-int-r5: 7/7 PASS） | integration-bounds-1 FAIL→r5 PASS。境界修正: A1→A2 ghost/context stroke fade-in、A3→B bunkai bridge フェード延長、description comp Bキャプション expression キー焼付け、D→E copyOut 早期終了、E タイル 15.44 前倒し。さらに interpreter 修正: 非ルート CompView を overflow:hidden 化し precomp を comp 境界でクリップ（AE 仕様、collapseTransformations なし確認済）。r4 で CMN-1/4 FAIL→legacy AE 原本との side-by-side（fidelity-legacy-vs-remotion.png）で同一クロップを確認し r5 PASS。その後 A/B/C/D/E 全シーンを clip 後フレームで再レビュー（wu-a-r6, wu-b-r14, wu-c-r17, wu-d-r28, wu-e-r10）し全て PASS — 現行 HEAD の描画に対する独立レビュー証跡は最新 |
| #28 | 筆画素材契約 | 技術検証済（文書化済） | docs/stroke-material-contract.md で共通契約を文書化: compStrokes/StrokeField/ContourField API、comp座標→単一 fieldTransform の変換保証、輪郭↔復元筆画の同一素材・登録証明（ink centroid ~(780,540) 実測）、sanitize/recolor の描画可能性契約。tests/stroke-contract.test.ts が Baseline=13筆画・bunkai runs4 SPEC指定セット・安定ジオメトリを pin。座標系混同による旧「描画不能」判定の無効化も記録 |

## 次のアクション

1. manualGates の最終集約: 各WUの合否判定へ manualGate 証拠を紐付ける
   （verification/manual-gates.md は A〜E を網羅済み。WU 受入時に
   画像PASSと併せて参照する運用を維持）
2. 潜在課題: (a) ネスト comp の overflow:visible はみ出し → **解決済**
   （layer.tsx で clip 化、wu-int-r5 PASS、legacy 原本との忠実性確認済）。
   (b) description comp の文字クリップ → AE 原本も同一箇所で切ることが
   判明し、忠実な再現として解決。残るはフォントメトリクス差
   （Kozuka Gothic Pr6N フォールバック）の微差のみ
3. ~~全シーン再レビュー~~ → **完了**: precomp clip 化後の全シーン再レビュー
   （wu-a-r6 / wu-b-r14 / wu-c-r17 / wu-d-r28 / wu-e-r10）で全て PASS。
   text.tsx justify 修正もこれらのフレームに含まれる。**全編レンダー
   実施済み: verification/pv-remotion-v11.mp4**（1080×1080/24fps/
   h264+AAC/20.01s、ffprobe 確認済。抽出フレームはレビュー済みスチルと
   コーデック誤差範囲で一致）。PR は Draft 維持、release 統合は
   ユーザー承認待ち
4. ~~WU-Q series 密度監査~~ → **完了**: criteria v2026-11-25.3 に
   seriesFrameGuidance を追加（フェーズをまたぐフレーム＋転換区間
   5-10f 間隔の中間フレームを要求）。wu-d-r27 の FAIL 事例を教訓化
