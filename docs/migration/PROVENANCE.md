# 移管 provenance

`rebuildup/Ae_Restro` の `promotion/` と `scripts/pv/` から `restro-pv` へ
移管したファイルの出所記録。対応関係を失わないための正本。

## 移管元

| 項目 | 値 |
| --- | --- |
| source repository | `rebuildup/Ae_Restro`（private） |
| source branch | `promo` |
| source HEAD at migration | `4085083348beb256528531bd4a51ca7370442596` |
| open PR at migration | [Ae_Restro#159](https://github.com/rebuildup/Ae_Restro/pull/159)（`promo` → `main`、未マージ） |
| migration date | 2026-11-20 |

## ファイル対応表

| restro-pv | Ae_Restro での出所 | 備考 |
| --- | --- | --- |
| `legacy/pv-8495026.aep` | `promotion/pv.aep` @ commit `8495026`（83,479,191 B） | **beats 検証済みベースライン**。`verification/beats/` はこの状態から生成された |
| `legacy/pv-2dc99e1.aep` | `promotion/pv.aep` @ commit `2dc99e1`（blob `ff041d2`、85,815,165 B） | promo HEAD と同一内容。最後に pv.aep を変更したコミットは `2dc99e1` |
| `legacy/pv-worktree-20261120.aep` | `promotion/pv.aep` 作業ツリー未コミット版（85,751,395 B、2026-11-20 20:24 保存） | `build-a2b.jsx`（commit `4085083` で追加、pv.aep 未更新）適用後の状態と思われる。正常性は Phase 2 の実機解析で判定する |
| `verification/beats/` | `promotion/beats/`（beat-001..043.png + manifest.json） | 43拍PNG連番。manifest の `layerCount: 266`、`renderedAt: 2026-11-19T15:17:23Z`。beats は `8495026` 時点の pv.aep から生成され、`2dc99e1` 以降の A2/C/E 変更を**含まない**（再レンダリングが必要） |
| `verification/pv-review.mp4` | `promotion/pv-review.mp4` | `master` 480フレームの確認用レンダー（h264/aac、20秒） |
| `docs/SPEC.md` | `promotion/PV-STRUCTURE.md` | PV 構成・演出仕様の正本 |
| `docs/history/PV-STRUCTURE-reviewed.md` | `promotion/PV-STRUCTURE-reviewed.md` | Fable案レビュー修正版（履歴） |
| `docs/migration/promotion-README.md` | `promotion/README.md` | 移管元 README（ライセンス注意を含む） |
| `assets/audio/drums-and-somps-background-music-458414.mp3` | `promotion/` 同名 | BGM。Pixabay Content License（Petrushkasound、ID 458414）。**private リポジトリでの作業用追跡のみ。mp3 単体の公開・配布は禁止** |
| `assets/rec/*.mp4` | `promotion/assets/rec/`（commit `b5bf3a4` / `7f834c5`） | シーンD用の実機AE操作録画3本（1920×1080/24fps） |
| `assets/images/` | `promotion/Ae.png`、`promotion/samune-v1.png`、`promotion/master/samune-v1.png` | サムネイル・ロゴ素材 |
| `legacy/scripts/pv/*.jsx` | `scripts/pv/` @ promo HEAD | 各 JSX が何を変更したかの証拠。実行時依存ではない |
| `tools/render-pv-beats.ts` | `scripts/render-pv-beats.ts` | パスを `legacy/`・`verification/` に合わせて改変 |
| `tools/lib/host-retry.ts` | `scripts/lib/host-retry.ts` | ae-a8n の stall retry。そのまま |
| `tools/lib/host.ts` | `scripts/lib/host-platform.ts` の `resolveAe` 部分のみ | Ae_Restro 固有の build/verify を削り、AE 解決だけを移植 |

## 移管しなかったもの

| 対象 | 理由 |
| --- | --- |
| `promotion/Auto-Save/*.aep`（約1.2GB、auto-save 1〜37） | AE の自動保存・一時スナップショット。復元はコミット済み pv.aep と作業ツリー版で足りる。user 判断により ignore |
| `promotion/master.avi`（約1.5GB） | レンダリング成果物。TypeScript 正本から再生成可能。user 判断により ignore |
| `promotion/pv.aep` のその他の過去版 | git 履歴（`e9d356f` 以降の複数コミット）に残る。必要になれば `git show <sha>:promotion/pv.aep` で取得可能 |
| Ae_Restro 本体のコード・`ae-restro/` | Restro 製品の開発は Ae_Restro に残る。PV は成果物への参照のみ |

## ハッシュ（MD5）

| ファイル | MD5 |
| --- | --- |
| `legacy/pv-8495026.aep` | `2f6db8baed36cbe88b06e9f989895489` |
| `legacy/pv-2dc99e1.aep` | `42fb06e9b101e87c4146a5ba4a314218` |
| `legacy/pv-worktree-20261120.aep` | `9d6a8d9d8df81c6997afc3c5bb1146ca` |
| `assets/audio/drums-and-somps-background-music-458414.mp3` | `5e52bcbf1f676893b7f34f64be1830db` |
| `assets/rec/ae-decompose-ops.mp4` | `7e93d4afe2630a36783dc8d23c722e09` |
| `assets/rec/ae-reprocess.mp4` | `8f9c1602cc2a5765600b2d0df03fa982` |
| `assets/rec/ae-stroke-animate.mp4` | `3b799249cfa015b7a614d68a35bd7c17` |
| `verification/pv-review.mp4` | `0bf107658517f47a8f6e7a64f5aa9832` |
| `verification/beats/manifest.json` | `15d293d0bf8f65944fe4ca1c06b72725` |

## 既知の注意

- `pv.aep` 系は After Effects が絶対パスで参照を持つ。外部参照は mp3 のみで、
  移管後は `assets/audio/drums-and-somps-background-music-458414.mp3` を選んで
  再リンクする（ファイル名は変えないこと）。
- `verification/beats/manifest.json` の `project` フィールドは移管元の絶対パスを
  指したまま。再生成時は `tools/render-pv-beats.ts` が新パスで上書きする。
- beats は `2dc99e1` 以降の変更を反映していない。現行 pv.aep の正確な見た目は
  実機での再レンダリングが必要（Phase 2/4）。
