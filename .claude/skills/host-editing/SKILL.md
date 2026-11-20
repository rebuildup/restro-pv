---
name: host-editing
description: After Effects / Premiere Pro / BlenderをMCP経由で編集・自動化する前に、対象確認・読み取り先行・可逆パターンの選択を判断する時に使用する。ホストアプリへの委任編集で事故や不可逆な変更を防ぐためのガードレール。
---

# Host editing

ホストアプリ（AE / Premiere / Blender）へのAI委任編集は、この手順を順に守る。守れない条件があるなら編集を開始しない。

## 1. 対象を固定してから触る

- どのホストapp・どのプロジェクトファイル・どのcomp/sequence/sceneかを、最初の操作の前に確認する。曖昧なら読み取りツールで確認してから宣言する
- 初回の作業・未検証のworkflowは、**保存済みコピー**に対して行う。原本のAEP/PRPROJ/BLENDを直接開いて編集しない
- 複数エージェント（Claude Code / OMP等）が同時に同じ開いているtimelineへ書き込まない。書き込みは直列化し、担当を交代する時に読み取りで状態を再確認する

## 2. 読み取りで先行する

編集の前に、対象の構造を読む（AE: `get_project_summary` / `list_layers` / `screenshot_frame`、Premiere: `get_capabilities` / `verify_premiere_connection`、Blender: シーンのinspect）。画面やUIの見た目ではなく、ツールの応答を根拠にする。

## 3. 可逆パターンを選ぶ

| 状況 | 使う可逆手段 |
| --- | --- |
| AE（Engine Room MCP） | `checkpoint_comp` → 編集 → `screenshot_frame`で確認 → `revert_comp`。これが標準パターン |
| AEのメニューUndo | `run_jsx`は呼び出しごとに独自のundo groupを作る。後続のscriptからメニューUndoを実行すると**間違ったgroup**をundoする。使わない |
| Premiere | `undo`は`expected_undo_stack_index`（直前の編集結果が報告した`undoStackIndex`）を必ず渡す。guardが位置不一致を検出すると何もせず拒否する |
| Blender | 編集用codeの最後でオブジェクト名を明示して作成し、復元は同じ名前で`bpy.data.objects.remove(o, do_unlink=True)`。`.blend`は編集後に保存しない |
| Premiere / Blender共通 | 保存せずに破棄、または編集前のファイルコピー。保存は人間の確認後 |

- 編集の結果は`run_jsx`の戻り値やdiffではなく、読み取りツールで**状態を読み戻して**確認する
- AEの`run_jsx`で値を返すには`return`を使う（無しでも失敗ではない）
- スクリーンショット（`screenshot_frame`）は視認の証拠になる。レイアウト確認・演出確認に使う

## 4. 実行の注意

- AE: `AfterFX.exe -r script.jsx`で起動したインスタンスはscript完了後に終了することがある。常設で使うならplain起動する。ブリッジはAE起動時にパネルが自動ロードされ、`127.0.0.1:7777`で待つ。ae-a8n（alpha）はWindowsで`launch()`がハングする既知defectあり（INTEGRATIONS.md参照）— MCP経由を優先する
- Premiere: CEP bridgeはheadless拡張が`ApplicationActivate`で自動起動し、パネルUIの操作は不要だった。シーケンス作成はプリセット必須（無しで呼ぶとPremiere 26+でモーダルが出てscriptingが凍結する）。視認は`capture_frame`（`export_frame`はQE DOM / AME双方が失敗した）
- Blender: GUI起動時のautostartはポートをlistenしなかった。正本はheadless: `blender --online-mode --background <file.blend> --command blender_mcp`（`--online-mode`必須）。headlessでは`get_objects_summary`が古い状態を返すことがある — `execute_blender_code`で読み戻す。サーバーコンテキストに`bpy.context.active_object`は無い
- 外部入手のscript・MCP add-onは使い捨てプロジェクトでreviewしてから実行する
- トークン・秘密情報をホストのlog・MCP設定・このリポジトリへ置かない

## 5. 検証の記録

実host検証の結果は`docs/SETUP.md`の受入matrixへ、状態（verified / not verified / waiting）を明示して記録する。未検証を成功として扱わない。
