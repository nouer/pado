# 基本設計書 — パド帳票管理 (pado)

## 1. アーキテクチャ概要

pado はブラウザ完結型のSPA（Single Page Application）として設計されている。smrm（シンプルカルテ管理）と同一のアーキテクチャを採用する。

```
┌──────────────────────────────────────┐
│            ブラウザ (Client)          │
│                                      │
│  ┌────────────────────────────────┐  │
│  │         index.html (SPA)       │  │
│  │  ┌──────────┐ ┌─────────────┐ │  │
│  │  │script.js │ │pado.calc.js │ │  │
│  │  │(UI+DB)   │ │(純粋関数)    │ │  │
│  │  └──────────┘ └─────────────┘ │  │
│  └────────────────────────────────┘  │
│            ↕                         │
│  ┌────────────────────────────────┐  │
│  │         IndexedDB (pado_db)    │  │
│  │  partners | items | documents  │  │
│  │  doc_sequences | app_settings  │  │
│  └────────────────────────────────┘  │
│            ↕                         │
│  ┌────────────────────────────────┐  │
│  │    Service Worker (sw.js)      │  │
│  │    キャッシュ + オフライン対応  │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
            ↕ HTTP (初回のみ)
┌──────────────────────────────────────┐
│     nginx (静的ファイル配信)          │
│     Docker コンテナ                   │
└──────────────────────────────────────┘
```

### 設計方針

- **外部ライブラリ不使用**: vanilla JavaScript のみで実装
- **サーバーレス**: データ処理はすべてクライアント側で完結
- **2ファイル分離**: UI/DB操作（`script.js`）と純粋関数（`pado.calc.js`）を分離
- **印刷はCSSのみ**: ブラウザ印刷機能 + CSS print stylesheet（PDF生成ライブラリ不使用）

---

## 2. ディレクトリ構成

```
pado/
├── local_app/
│   ├── index.html          # SPA エントリポイント
│   ├── script.js           # メインロジック（DB操作・UI・イベント処理）
│   ├── pado.calc.js        # 計算・バリデーション（純粋関数、DOM依存なし）
│   ├── pado.calc.test.js   # ユニットテスト（Jest）
│   ├── e2e.test.js         # E2Eテスト（Puppeteer）
│   ├── style.css           # スタイル（印刷用CSS含む）
│   ├── version.js          # ビルド時自動生成（バージョン・ビルド日時）
│   ├── sw.js               # Service Worker
│   ├── manifest.json       # PWAマニフェスト
│   ├── sample_data.json    # サンプルデータ
│   └── icons/              # アプリアイコン
├── scripts/
│   ├── build.sh            # Docker ビルド＆起動
│   ├── rebuild.sh          # 強制リビルド＆起動
│   └── generate_version.sh # version.js 生成
├── tools/
│   └── generate_sample_data.js  # サンプルデータ生成
├── docs/                   # ドキュメント
├── tasks/                  # タスク管理
├── nginx/default.conf      # nginx 設定
├── docker-compose.yml      # Docker Compose 構成
├── Dockerfile              # アプリ用 Dockerfile
├── Dockerfile.test         # テスト用 Dockerfile
├── package.json            # npm 設定
└── CLAUDE.md               # プロジェクト規約
```

---

## 3. データモデル

### 3.1 IndexedDB 構成

- **データベース名**: `pado_db`
- **バージョン**: 1

| オブジェクトストア | keyPath | インデックス | 用途 |
|-------------------|---------|-------------|------|
| `partners` | `id` | name, nameKana, partnerCode, partnerType | 取引先マスタ |
| `items` | `id` | name, itemCode, taxRateType | 品目マスタ |
| `documents` | `id` | docType, docNumber, partnerId, issueDate, status, sourceDocId | 帳票データ |
| `doc_sequences` | `id` | (なし) | 帳票番号連番管理 |
| `app_settings` | `id` | (なし) | アプリ設定 |

### 3.2 レコード構造

#### partners（取引先）

```json
{
  "id": "uuid",
  "partnerCode": "P0001",
  "name": "株式会社サンプル商事",
  "nameKana": "さんぷるしょうじ",
  "partnerType": "customer",
  "postalCode": "100-0001",
  "address": "東京都千代田区千代田1-1-1",
  "phone": "03-1234-5678",
  "fax": "03-1234-5679",
  "email": "info@sample.co.jp",
  "contactPerson": "山田太郎",
  "invoiceRegistrationNumber": "T1234567890123",
  "memo": "",
  "createdAt": "2026-01-15T09:00:00.000Z",
  "updatedAt": "2026-01-15T09:00:00.000Z"
}
```

#### items（品目）

```json
{
  "id": "uuid",
  "itemCode": "I0001",
  "name": "Webサイト制作",
  "defaultPrice": 300000,
  "defaultUnit": "式",
  "taxRateType": "rate10",
  "memo": "",
  "createdAt": "2026-01-15T09:00:00.000Z",
  "updatedAt": "2026-01-15T09:00:00.000Z"
}
```

#### documents（帳票）

```json
{
  "id": "uuid",
  "docType": "invoice",
  "docNumber": "INV-2026-0001",
  "partnerId": "uuid (partners.id)",
  "partnerName": "株式会社サンプル商事",
  "issueDate": "2026-03-01",
  "status": "draft",
  "sourceDocId": null,

  "validUntil": null,
  "paymentDeadline": "2026-03-31",
  "deliveryDate": null,
  "description": null,

  "lines": [
    {
      "lineNo": 1,
      "itemId": "uuid",
      "itemName": "Webサイト制作",
      "quantity": 1,
      "unit": "式",
      "unitPrice": 300000,
      "taxRateType": "rate10",
      "amount": 300000
    },
    {
      "lineNo": 2,
      "itemId": null,
      "itemName": "飲料（軽減税率対象）",
      "quantity": 10,
      "unit": "本",
      "unitPrice": 150,
      "taxRateType": "rate8",
      "amount": 1500
    }
  ],

  "subtotal": 301500,
  "tax10Amount": 30000,
  "tax10Base": 300000,
  "tax8Amount": 120,
  "tax8Base": 1500,
  "taxExemptAmount": 0,
  "totalAmount": 331620,

  "memo": "",
  "createdAt": "2026-03-01T09:00:00.000Z",
  "updatedAt": "2026-03-01T09:00:00.000Z"
}
```

#### doc_sequences（帳票番号連番管理）

```json
{
  "id": "EST-2026",
  "currentNumber": 3
}
```

キー形式: `{プレフィックス}-{年}` （例: `INV-2026`, `EST-2026`）

各帳票種別・年ごとに連番を管理し、帳票作成時に `currentNumber` をインクリメントして次の番号を生成する。

#### app_settings（アプリ設定）

**発行者情報 (id: `issuer_info`)**:

```json
{
  "id": "issuer_info",
  "businessName": "パドデザイン事務所",
  "representativeName": "田中一郎",
  "postalCode": "150-0001",
  "address": "東京都渋谷区神宮前1-1-1",
  "phone": "03-9876-5432",
  "fax": "",
  "email": "info@pado-design.jp",
  "invoiceRegistrationNumber": "T9876543210987",
  "bankInfo": "○○銀行 △△支店 普通 1234567 パドデザインジムショ"
}
```

**計算設定 (id: `calc_settings`)**:

```json
{
  "id": "calc_settings",
  "taxCalcMethod": "per_line",
  "roundingMethod": "floor"
}
```

| 設定キー | 選択肢 | デフォルト |
|---------|-------|-----------|
| taxCalcMethod | `per_line`（明細行ごと） / `per_total`（合計に対して） | `per_line` |
| roundingMethod | `floor`（切り捨て） / `round`（四捨五入） / `ceil`（切り上げ） | `floor` |

---

## 4. 画面設計

### 4.1 タブ構成

| # | タブID | ラベル | 内容 |
|---|--------|--------|------|
| 1 | `documents` | 帳票 | 帳票一覧・検索・新規作成（7種別サブタブ） |
| 2 | `partners` | 取引先 | 取引先マスタ管理 |
| 3 | `items` | 品目 | 品目マスタ管理 |
| 4 | `settings` | 設定 | 発行者情報・計算設定・データ管理 |

### 4.2 帳票タブ内のサブタブ

| # | サブタブID | ラベル | 帳票コード |
|---|-----------|--------|-----------|
| 1 | `sub-estimate` | 見積書 | estimate |
| 2 | `sub-purchase-order` | 発注書 | purchase_order |
| 3 | `sub-invoice` | 請求書 | invoice |
| 4 | `sub-delivery-note` | 納品書 | delivery_note |
| 5 | `sub-sales-slip` | 売上伝票 | sales_slip |
| 6 | `sub-purchase-slip` | 仕入伝票 | purchase_slip |
| 7 | `sub-receipt` | 領収書 | receipt |

### 4.3 画面フロー

```
[帳票タブ]
  ├── 帳票種別サブタブ（7種）
  │     ├── 検索バー（帳票番号・取引先名で検索）
  │     ├── 帳票カード一覧
  │     │     └── カードクリック → 帳票編集オーバーレイ
  │     └── ＋新規作成ボタン → 帳票編集オーバーレイ（新規）
  └── 帳票編集オーバーレイ
        ├── 1. 基本情報カード（帳票番号・発行日・ステータス・取引先選択）
        ├── 2. 種別固有フィールド（有効期限/支払期限/納品日/摘要/但し書き）
        ├── 3. 明細行（動的行追加・品目選択・数量・単位・単価・税区分・金額）
        ├── 4. 金額集計（小計・10%税額・8%税額・合計・印紙税注記）
        ├── 5. 備考・メモ
        ├── 6. 発行者情報（設定から自動反映・読み取り専用）
        └── 操作ボタン（保存/印刷/変換/複製/削除/閉じる）

[取引先タブ]
  ├── 検索バー
  ├── 取引先カード一覧
  │     └── カードクリック → 取引先編集モーダル
  └── ＋新規登録ボタン → 取引先登録モーダル

[品目タブ]
  ├── 検索バー
  ├── 品目カード一覧
  │     └── カードクリック → 品目編集モーダル
  └── ＋新規登録ボタン → 品目登録モーダル

[設定タブ]
  ├── 発行者情報
  ├── 計算設定（消費税計算方式・端数処理）
  ├── データ管理（エクスポート/インポート/全削除）
  ├── アプリ情報
  └── サンプルデータインポート
```

### 4.4 モーダル・オーバーレイ一覧

| 種別 | トリガー | 内容 |
|------|---------|------|
| 帳票編集オーバーレイ | 新規作成ボタン / 帳票カードクリック | 帳票フォーム全項目（6セクション構成） |
| 取引先登録/編集モーダル | 新規登録ボタン / 取引先カードクリック | 取引先フォーム全項目 |
| 品目登録/編集モーダル | 新規登録ボタン / 品目カードクリック | 品目フォーム全項目 |
| 確認ダイアログ | 削除操作等 | タイトル・メッセージ・確認ボタン |
| 帳票変換ダイアログ | 変換ボタン | 変換先帳票種別の選択 |

### 4.5 帳票編集オーバーレイ構成

| # | セクション | 内容 |
|---|-----------|------|
| 1 | 基本情報カード | 帳票番号（自動採番/読み取り専用）、発行日、ステータス選択、取引先選択 |
| 2 | 種別固有フィールド | 見積書:有効期限 / 請求書:支払期限 / 納品書:納品日 / 伝票:摘要 / 領収書:但し書き |
| 3 | 明細行エリア | 動的行追加・削除。各行: 品目選択(ドロップダウン+自由入力), 数量, 単位, 単価, 税区分, 金額(自動計算) |
| 4 | 金額集計エリア | 小計、10%対象額・税額、8%対象額・税額、対象外額、合計、収入印紙注記（領収書のみ） |
| 5 | 備考・メモ | テキストエリア |
| 6 | 発行者情報 | 設定タブの発行者情報を読み取り専用で表示（登録番号含む） |

---

## 5. レスポンシブ対応

| ブレークポイント | 対象 | 特記事項 |
|----------------|------|---------|
| 〜375px | モバイル | サブタブがスクロール可能、明細行が縦積みレイアウト |
| 376px〜768px | タブレット | 明細行が横並びに収まる |
| 769px〜 | デスクトップ | 帳票カードが2〜3カラム表示 |

---

## 6. 印刷設計

### 6.1 共通印刷レイアウト（A4縦）

```
┌─────────────────────────────────┐
│ [帳票種別名]         [帳票番号]  │
│                                 │
│ [取引先名] 御中    [発行者情報]  │
│                    [登録番号]    │
│                    [住所・電話]  │
│─────────────────────────────────│
│ 発行日: YYYY年MM月DD日          │
│ 支払期限: YYYY年MM月DD日 (※)   │
│─────────────────────────────────│
│ │No│品目名│数量│単位│単価│税区分│金額│
│ │ 1│...  │   │   │   │ 10% │    │
│ │ 2│...  │   │   │   │  8% │    │
│─────────────────────────────────│
│           小計    ¥XXX,XXX      │
│  10%対象  ¥XXX,XXX 消費税 ¥XXX │
│   8%対象  ¥XXX,XXX 消費税 ¥XXX │
│         合計金額  ¥XXX,XXX      │
│─────────────────────────────────│
│ 備考: ...                       │
└─────────────────────────────────┘
(※) 帳票種別により異なるフィールド
```

### 6.2 領収書レイアウト（コンパクト）

```
┌─────────────────────────────────┐
│          領 収 書                │
│                                 │
│ [取引先名] 様                   │
│                                 │
│ ¥XXX,XXX-            ┌───────┐ │
│                      │収入印紙│ │
│ 但し [但し書き] として│ 貼付欄 │ │
│ 上記正に領収いたしました└───────┘ │
│                                 │
│ 内訳:                           │
│   10%対象 ¥XXX,XXX (税 ¥XXX)   │
│    8%対象 ¥XXX,XXX (税 ¥XXX)   │
│                                 │
│ 発行日: YYYY年MM月DD日          │
│ No. RCP-YYYY-NNNN              │
│                                 │
│ [発行者情報]                    │
│ 登録番号: TXXXXXXXXXXXXX        │
│                                 │
│ ※印紙税額 ¥XXX （税抜¥XXX,XXX）│
└─────────────────────────────────┘
```

---

## 7. PWA構成

### 7.1 Service Worker (`sw.js`)

- **キャッシュ戦略**: プリキャッシュ + ネットワークフォールバック
- **プリキャッシュ対象**: index.html, style.css, script.js, pado.calc.js, version.js, manifest.json, アイコン群
- **install**: 全アセットをキャッシュに追加、即座に `skipWaiting()`
- **activate**: 旧キャッシュを削除、即座に `clients.claim()`
- **fetch**: キャッシュ優先、キャッシュミス時はネットワークからフェッチしてキャッシュに追加
- **SKIP_WAITING メッセージ**: クライアントからの指示で即座に更新

### 7.2 Web App Manifest (`manifest.json`)

| 項目 | 値 |
|------|-----|
| name | パド帳票管理 |
| short_name | パド |
| display | standalone |
| orientation | portrait |
| theme_color | (業務アプリに適した色) |
| background_color | #ffffff |
| start_url | /index.html |

### 7.3 PWA ショートカット

| ショートカット名 | URL |
|----------------|-----|
| 帳票 | /index.html?tab=documents |
| 取引先 | /index.html?tab=partners |
