# Pado - 帳票管理アプリ

個人事業主・小規模事業者向けの帳票管理アプリ（見積書・発注書・請求書・納品書・売上伝票・仕入伝票・領収書）

## アーキテクチャ

```
local_app/
├── index.html          # SPA メイン画面
├── script.js           # UI操作・IndexedDB操作（アプリの中心）
├── pado.calc.js        # 計算ロジック（純粋関数のみ）
├── pado.calc.test.js   # ユニットテスト
├── e2e.test.js         # E2Eテスト
├── usecases.e2e.test.js # ユースケースE2Eテスト
├── sw.js               # Service Worker（PWAキャッシュ）
├── version.js          # ビルドバージョン・日時（自動生成）
├── style.css           # スタイル
├── manifest.json       # PWAマニフェスト
├── notify.html         # リリース通知ページ
├── usecases_showcase.html # ユースケース紹介ページ
└── promotion.html      # プロモーションページ
docs/                   # 設計・仕様ドキュメント
scripts/                # ビルド・デプロイスクリプト
tasks/                  # タスク管理・lessons learned
```

## 開発コマンド

```bash
# セットアップ
npm install

# Docker ビルド＆起動（ポート 8087）
bash scripts/build.sh

# 強制リビルド
bash scripts/rebuild.sh

# ユニットテスト
npm test

# ユースケースE2Eテスト
npm run test:usecases

# E2Eテスト（Docker内で実行）
docker compose run --rm pado-test
```

## コーディング規約

- `pado.calc.js` には純粋関数のみ（DOM操作・IndexedDB操作禁止）
- `script.js` にUI操作・DB操作を集約
- 外部ライブラリ追加禁止（vanilla JSのみ）
- HTML特殊文字は必ず `escapeHtml()` でエスケープ

## ドキュメント更新ルール

- バリデーションルール、フィールドの必須/任意、UI挙動を変更した場合は、必ず `docs/` 配下の該当ドキュメントも同時に更新する
- 対象ドキュメントと更新基準:
  - `docs/requirements_definition.md` — フィールドの追加/削除/必須変更、機能要件の変更
  - `docs/detailed_design.md` — バリデーションルール変更、UI要素の追加/変更、画面構成の変更
  - `docs/test_specification.md` — テストケースの追加/変更/削除
  - `docs/algorithm_logic.md` — 計算ロジック、アルゴリズムの変更
- コミット前にドキュメントの更新漏れがないか確認する

## コミットメッセージ

- 日本語で記述し、英語プレフィックスを付ける: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `chore:`
- 変更内容を具体的に、箇条書き（`- `）で複数の変更点をリストアップ
- 大きな変更がある場合は、複数のコミットに分割することを提案する
