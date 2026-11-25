# WU 進捗管理（PR #27 / branch 23）

> 状態区分：**未着手 / 制作中 / 技術検証済み / 独立レビュー合格**。
> 「技術検証済み」は描画・タイミングが動くことの確認まで。
> 「独立レビュー合格」は tools/wu-review.ts の記録（verification/reviews/）
> に基づく。実装者の自己評価は合格根拠にしない。
> 正本の要求は SPEC §5・§11 と Issue #26 コメント。変更にはレビューを要する。
>
> **v11 受入不合格を受けた再制作（2026-11-25）**: ユーザーが v11 を視覚
> 受入不合格とし、SPEC §11 全要求の実映像への回収を指示。前任の PASS
> 判定は受入根拠としない。wu-c-r17 manifest にあった評価除外文言は
> 禁止事項として wu-review.ts が manifest を拒否するよう修正済
> （criteria 2026-11-25.3 + exemption guard）。

## 依存関係

- **#28 筆画素材契約** → A2/B/C/E の筆画供給。文書化済み
  （docs/stroke-material-contract.md）。
- **D 再録画** → 既存3録画で実操作を充足と判断（r30 で判読性を反復中）。
- **全編レンダー** → 全WUが独立レビュー合格してから集約実施。

## 各WU（v12 再制作ラウンド）

| WU | 内容 | 状態 | 証跡・メモ |
|---|---|---|---|
| WU-0 | 共通デザイン基準 | 制作中→改訂済 | design-baseline.md を判断基準型に改訂済 |
| WU-A | A1〜A3 導入 | **独立レビュー合格（wu-a-r8: 9/9 PASS）** | v11指摘（縦画が画面に収まらない・ゴースト対応不明瞭）を再設計で解消: 交差クラスタ構図、runs4 014除去（SPEC指定は015/016/017）、元輪郭ghostを交差近傍に局所化＋実測登録行列、尾fade加速でA3へクリーンに受け渡し |
| WU-B | B 工程 | **独立レビュー合格（wu-b-r18: 8/8 PASS）** | v11指摘（逆算幾何・薄い輪郭・小レンズ・工程帯組版不良）を解消: 実Restro処理中間情報（スキャンライン・延長A/B・推定頂点・ソルバ点）へ置換、レンズを画面内へ、f101から実輪郭シルエットを表示 |
| WU-C | C 作品例 | **独立レビュー合格（wu-c-r18: 9/9 PASS、6R）** | v11指摘（説明文切断・稚拙さ・囲み/余白不適切）を解消: W3エンブレムを真の左右対称二翼へ再構築、transit脚を圧縮し筆画が飛行中に見える構成、説明文切断は masterPatch の caption fit pass で中央対応 |
| WU-D | D 実操作録画 | **独立レビュー合格（wu-d-r33: 10/10 PASS）** | r29-r32 で判読性を反復後、全タイムラインスキャンで実行証拠を発見: ae-decompose-ops source f161-190 に「Executing Script」ダイアログ（t6.7-7.9s、Restroパネル表示中）— 分解実行のトリガー。W1 を clip A（実行dialog PiP）→clip B（検証済みf886 before→after ジャンプカット）へ再構成。正直証拠原則: 3録画全走査でクリック/押下状態は存在しないと確認し、シーンは script-execution→result のみを主張。W4結果のコントラスト/ROI、PiP拡大、W2ジャンプ識別も修正 |
| WU-E | E 商品 | **独立レビュー合格（wu-e-r17: 9/9 PASS）** | v11指摘（小さすぎるタイル・無駄な余白・製品名重複・販売階層不足）を解消: 回収を実B/C/Dスチルのハードカットスロット化、hero筆画復元、組版ロックアップ＋分離したBOOTH/URL販売群。統合後に mask 撤去・closing line をブランド下へ移動し r17 で再PASS |
| WU-Q | 独立レビュー基盤 | 技術検証済（v2.1 / criteria 2026-11-25.3） | exemption guard 追加: manifest の subject/context に評価除外文言（do not fail / exempt / 忠実 / 不合格としない 等）があると wu-review.ts が拒否。CMN-1..4 全WU自動マージ、manualGates で静止画不可証明条件を別証拠必須化 |
| WU-INT | シーン境界の統合検証 | **独立レビュー合格（wu-int-r6: 7/7 PASS）** | v12統合ツリーで23フレームのシーム再検証 PASS。修正済み: description comp caption fit pass（fontSize縮小＋端anchor中央寄せ、切断解消をf220で確認）、E-section dumped copy 全層zero化、tagline を15.44sでclamp、SceneE mask撤去でブランドロックアップ復帰（f375確認）、closing line のブランド重なり解消（f460確認）。SceneD r33 変更後の D→E 境界は wu-d-r33 の密フレーム（f371-390）で再確認済 |
| #28 | 筆画素材契約 | 技術検証済（文書化済） | docs/stroke-material-contract.md + tests/stroke-contract.test.ts（16/16 pass） |

## 次のアクション

1. **全WU収束・v12 レンダー済み**: `verification/pv-remotion-v12.mp4`
   （1080×1080/24fps/h264+AAC/20.01s、ffprobe確認。抽出フレームは
   レビュー済みスチルとコーデック誤差範囲で一致）。全WU独立レビュー
   PASS: wu-a-r8 9/9, wu-b-r18 8/8, wu-c-r18 9/9, wu-d-r33 10/10,
   wu-e-r17 9/9, wu-int-r6 7/7
2. ユーザーによる v12 実映像の目視受入待ち。PR #27 は Draft 維持。
   release 統合はユーザー承認待ち
