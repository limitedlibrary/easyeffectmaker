# Blender 連携（今後の開発予定）

このディレクトリは、将来実装する Blender 連携用のプレースホルダです。
**今回のスコープでは Blender 側の実装は一切含まれていません。**

## 今回実装したこと（web側）

- `web/` アプリからエフェクト設定を JSON として書き出し / 読み込みできる
- JSON のフォーマットと、弾の軌道計算アルゴリズムを `docs/json-spec.md` に
  ビット単位まで厳密に文書化した
- Three.js 側のシミュレーションコード（`web/src/core/`）は、レンダリング
  （`web/src/render/`）と完全に分離されたレンダラ非依存の純粋な計算ロジック
  として実装されており、Python への移植を前提にしている

## 次回実装する予定のこと

1. `docs/json-spec.md` の5章のアルゴリズムを Python に移植したモジュール
   （Blenderに依存しない純粋な計算部分）
2. Blender Python スクリプト / アドオンから `samples/*.json` 相当のファイルを
   読み込み、各弾をオブジェクト（またはパーティクルシステム / ジオメトリ
   ノード）として配置し、フレームごとにキーフレーム／ドライバーでアニメ
   ーションさせる処理
3. Three.js座標系（Y-up）からBlender座標系（Z-up）への変換
   （`docs/json-spec.md` 2.1節の変換式を使用）

## 今回対象外（明記）

- Blenderアドオンの作成
- Blender Pythonインポーターの実装
- Blenderとのリアルタイム通信
- サーバー機能

## 参考

- JSON仕様: [`../docs/json-spec.md`](../docs/json-spec.md)
- サンプルJSON: [`../samples/`](../samples/)
- Three.js側の正実装（移植元）:
  - `../web/src/core/types.ts`
  - `../web/src/core/math.ts`
  - `../web/src/core/random.ts`
  - `../web/src/core/effects/rotatingBarrage.ts`
