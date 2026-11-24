# Precomp clip fidelity check (WU-INT r4 CMN-1/CMN-4 FAIL の検証)

## 経緯

layer.tsx の非ルート CompView を overflow:hidden に変更（AE の precomp
クリップ仕様に一致。dump 内に collapseTransformations レイヤーなし）。
変更後の全フレームで左カラムのはみ出しテキストが comp 境界で切れるように
なり、wu-int-r4 で CMN-1/CMN-4 が FAIL（「意図しないクリッピング」と判定）。

## 検証

- `fidelity-legacy-vs-remotion.png`: 実機 AE レンダー
  (verification/legacy-frames-v1/f0210.png) 左カラム vs Remotion after
  (verification/wu-int/f220.png) 左カラムの比較画像。
- vision-review 判定: 「Both versions clip the large display phrase at
  the column's right edge, showing essentially the same truncated
  portion. Remotion does not lose significantly more or less text than
  the AE original.」
- 別途 f0210 単体レビューでも AE 原本が「分解した筆画は、それぞ」を
  カラム右端で文中切断していることを確認済み。

## 結論

大判表示書体のカラム端での途中切れは AE 原本の意図的な演出であり、
Remotion 側の再現は忠実。CMN-1 の「意図しないクリッピング」には該当
しない。フォントメトリクス差（Kozuka Gothic Pr6N は商用のため
フォールバック）による切れ位置の微差は既知の制約として許容。
