# テスト仕様書 — パド帳票管理 (pado)

## 1. テスト構成

| テスト種別 | ファイル | 環境 | フレームワーク |
|-----------|---------|------|--------------|
| 単体テスト | `pado.calc.test.js` | jsdom | Jest |
| E2Eテスト | `e2e.test.js` | Docker (node + Puppeteer) | Jest + Puppeteer |

### 実行コマンド

```bash
# 単体テスト
npm test

# E2Eテスト
docker compose run --rm pado-test
```

---

## 2. 単体テスト仕様

テスト対象: `pado.calc.js` の全エクスポート関数

### 2.1 消費税計算 — 明細行ごと (`calcLineTax`)

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-TAX-001 | 10%・切り捨て | `amount=999, taxRateType='standard', rounding='floor'` | `99` |
| UT-TAX-002 | 10%・四捨五入 | `amount=999, taxRateType='standard', rounding='round'` | `100` |
| UT-TAX-003 | 10%・切り上げ | `amount=999, taxRateType='standard', rounding='ceil'` | `100` |
| UT-TAX-004 | 8%・切り捨て | `amount=999, taxRateType='reduced', rounding='floor'` | `79` |
| UT-TAX-005 | 8%・四捨五入 | `amount=999, taxRateType='reduced', rounding='round'` | `80` |
| UT-TAX-006 | 8%・切り上げ | `amount=999, taxRateType='reduced', rounding='ceil'` | `80` |
| UT-TAX-007 | 対象外 | `amount=10000, taxRateType='exempt', rounding='floor'` | `0` |
| UT-TAX-008 | 金額0 | `amount=0, taxRateType='standard', rounding='floor'` | `0` |
| UT-TAX-009 | 端数なし(10%) | `amount=1000, taxRateType='standard', rounding='floor'` | `100` |
| UT-TAX-010 | 端数なし(8%) | `amount=1000, taxRateType='reduced', rounding='floor'` | `80` |

### 2.2 帳票合計計算 (`calcDocumentTotals`)

#### 明細行ごと計算

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-TOTAL-001 | 10%のみ単一行 | `[{qty:1, price:10000, tax:'standard'}], per_line, floor` | `subtotal:10000, tax10Amount:1000, total:11000` |
| UT-TOTAL-002 | 8%のみ単一行 | `[{qty:1, price:10000, tax:'reduced'}], per_line, floor` | `subtotal:10000, tax8Amount:800, total:10800` |
| UT-TOTAL-003 | 混合税率 | `[{qty:1, price:300000, tax:'standard'}, {qty:10, price:150, tax:'reduced'}], per_line, floor` | `subtotal:301500, tax10Amount:30000, tax8Amount:120, total:331620` |
| UT-TOTAL-004 | 対象外含む | `[{qty:1, price:5000, tax:'standard'}, {qty:1, price:3000, tax:'exempt'}], per_line, floor` | `subtotal:8000, tax10Amount:500, taxExemptAmount:3000, total:8500` |
| UT-TOTAL-005 | 端数あり(行ごと) | `[{qty:1, price:999, tax:'standard'}, {qty:1, price:999, tax:'standard'}, {qty:1, price:999, tax:'standard'}], per_line, floor` | `subtotal:2997, tax10Amount:297, total:3294` |
| UT-TOTAL-006 | 空の明細行 | `[], per_line, floor` | `subtotal:0, tax10Amount:0, tax8Amount:0, total:0` |

#### 合計に対して計算

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-TOTAL-007 | 端数あり(合計) | `[{qty:1, price:999, tax:'standard'} x3], per_total, floor` | `subtotal:2997, tax10Amount:299, total:3296` |
| UT-TOTAL-008 | 混合(合計) | `[{qty:1, price:300000, tax:'standard'}, {qty:10, price:150, tax:'reduced'}], per_total, floor` | `subtotal:301500, tax10Amount:30000, tax8Amount:120, total:331620` |

### 2.3 帳票番号生成 (`generateDocNumber`)

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-DN-001 | 請求書初回 | `docType='invoice', currentNumber=0` | `'INV-{year}-0001'` |
| UT-DN-002 | 請求書2件目 | `docType='invoice', currentNumber=1` | `'INV-{year}-0002'` |
| UT-DN-003 | 見積書初回 | `docType='estimate', currentNumber=0` | `'QT-{year}-0001'` |
| UT-DN-004 | 発注書 | `docType='purchase_order', currentNumber=0` | `'PO-{year}-0001'` |
| UT-DN-005 | 納品書 | `docType='delivery_note', currentNumber=0` | `'DN-{year}-0001'` |
| UT-DN-006 | 売上伝票 | `docType='sales_slip', currentNumber=0` | `'SS-{year}-0001'` |
| UT-DN-007 | 仕入伝票 | `docType='purchase_slip', currentNumber=0` | `'PS-{year}-0001'` |
| UT-DN-008 | 領収書 | `docType='receipt', currentNumber=0` | `'RC-{year}-0001'` |
| UT-DN-009 | 連番100 | `docType='invoice', currentNumber=99` | `'INV-{year}-0100'` |
| UT-DN-010 | 上限超過 | `docType='invoice', currentNumber=9999` | `throw '帳票番号が上限に達しました'` |

### 2.4 収入印紙税額判定 (`calcStampTax`)

| テストID | テスト名 | 入力(税抜金額) | 期待結果 |
|---------|---------|--------------|---------|
| UT-ST-001 | 5万円未満 | `30000` | `{required: false, amount: 0}` |
| UT-ST-002 | 境界値(49,999) | `49999` | `{required: false, amount: 0}` |
| UT-ST-003 | 境界値(50,000) | `50000` | `{required: true, amount: 200}` |
| UT-ST-004 | 100万円以下 | `500000` | `{required: true, amount: 200}` |
| UT-ST-005 | 境界値(1,000,000) | `1000000` | `{required: true, amount: 200}` |
| UT-ST-006 | 100万円超 | `1000001` | `{required: true, amount: 400}` |
| UT-ST-007 | 200万円以下 | `2000000` | `{required: true, amount: 400}` |
| UT-ST-008 | 200万円超 | `2000001` | `{required: true, amount: 600}` |
| UT-ST-009 | 300万円超 | `3000001` | `{required: true, amount: 1000}` |
| UT-ST-010 | 500万円超 | `5000001` | `{required: true, amount: 2000}` |
| UT-ST-011 | 1000万円超 | `10000001` | `{required: true, amount: 6000}` |
| UT-ST-012 | 3000万円超 | `30000001` | `{required: true, amount: 10000}` |
| UT-ST-013 | 5000万円超 | `50000001` | `{required: true, amount: 20000}` |
| UT-ST-014 | 1億円超 | `100000001` | `{required: true, amount: 40000}` |
| UT-ST-015 | 2億円超 | `200000001` | `{required: true, amount: 60000}` |
| UT-ST-016 | 3億円超 | `300000001` | `{required: true, amount: 100000}` |
| UT-ST-017 | 5億円超 | `500000001` | `{required: true, amount: 200000}` |
| UT-ST-018 | 金額0 | `0` | `{required: false, amount: 0}` |

### 2.5 取引先コード生成 (`generatePartnerCode`)

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-PC-001 | 取引先なし（初回） | `[]` | `'P0001'` |
| UT-PC-002 | 既存あり | `['P0001', 'P0002']` | `'P0003'` |
| UT-PC-003 | 飛び番あり | `['P0001', 'P0003']` | `'P0004'` |
| UT-PC-004 | null入力 | `null` | `'P0001'` |
| UT-PC-005 | 不正コード混在 | `['P0001', 'INVALID', 'P0005']` | `'P0006'` |
| UT-PC-006 | 上限超過 | `['P9999']` | `throw '取引先コードが上限に達しました'` |

### 2.6 品目コード生成 (`generateItemCode`)

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-IC-001 | 品目なし（初回） | `[]` | `'I0001'` |
| UT-IC-002 | 既存あり | `['I0001', 'I0002']` | `'I0003'` |
| UT-IC-003 | null入力 | `null` | `'I0001'` |
| UT-IC-004 | 上限超過 | `['I9999']` | `throw '品目コードが上限に達しました'` |

### 2.7 取引先バリデーション (`validatePartner`)

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-VP-001 | 正常な入力（必須のみ） | `{name: '株式会社テスト', partnerType: 'customer'}` | `valid: true` |
| UT-VP-002 | 取引先名が空 | `{name: '', partnerType: 'customer'}` | `valid: false, errors に '取引先名を入力してください'` |
| UT-VP-003 | 取引先名が100文字超 | `{name: 'あ'.repeat(101), ...}` | `valid: false` |
| UT-VP-004 | 取引先区分が不正 | `{name: 'テスト', partnerType: 'invalid'}` | `valid: false` |
| UT-VP-005 | ふりがなにカタカナ | `{name: 'テスト', partnerType: 'customer', nameKana: 'テスト'}` | `valid: false` |
| UT-VP-006 | ふりがなにひらがな | `{name: 'テスト', partnerType: 'customer', nameKana: 'てすと'}` | `valid: true` |
| UT-VP-007 | 電話番号不正 | `{name: 'テスト', partnerType: 'customer', phone: 'abc'}` | `valid: false` |
| UT-VP-008 | 登録番号正常 | `{..., invoiceRegistrationNumber: 'T1234567890123'}` | `valid: true` |
| UT-VP-009 | 登録番号不正（桁数不足） | `{..., invoiceRegistrationNumber: 'T123'}` | `valid: false` |
| UT-VP-010 | 登録番号不正（Tなし） | `{..., invoiceRegistrationNumber: '1234567890123'}` | `valid: false` |

### 2.8 品目バリデーション (`validateItem`)

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-VI-001 | 正常な入力 | `{name: 'テスト品目', taxRateType: 'standard'}` | `valid: true` |
| UT-VI-002 | 品目名が空 | `{name: '', taxRateType: 'standard'}` | `valid: false` |
| UT-VI-003 | 税区分が不正 | `{name: 'テスト', taxRateType: 'invalid'}` | `valid: false` |
| UT-VI-004 | デフォルト単価が負 | `{name: 'テスト', taxRateType: 'standard', defaultPrice: -1}` | `valid: false` |
| UT-VI-005 | デフォルト単価が小数 | `{name: 'テスト', taxRateType: 'standard', defaultPrice: 100.5}` | `valid: false` |

### 2.9 帳票バリデーション (`validateDocument`)

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-VD-001 | 正常な入力 | `{partnerId: 'uuid', issueDate: '2026-03-01', status: 'draft', lines: [{...}]}` | `valid: true` |
| UT-VD-002 | 取引先未選択 | `{partnerId: null, ...}` | `valid: false, errors に '取引先を選択してください'` |
| UT-VD-003 | 発行日未入力 | `{issueDate: '', ...}` | `valid: false` |
| UT-VD-004 | 明細行が空 | `{lines: [], ...}` | `valid: false, errors に '明細行を1行以上入力してください'` |
| UT-VD-005 | ステータスが不正 | `{status: 'invalid', ...}` | `valid: false` |
| UT-VD-006 | 備考が2000文字超 | `{memo: 'あ'.repeat(2001), ...}` | `valid: false` |

### 2.10 明細行バリデーション (`validateDocumentLine`)

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-VL-001 | 正常な入力 | `{itemName: 'テスト', quantity: 1, unitPrice: 1000, taxRateType: 'standard'}` | `valid: true` |
| UT-VL-002 | 品目名が空 | `{itemName: '', ...}` | `valid: false` |
| UT-VL-003 | 数量が0以下 | `{quantity: 0, ...}` | `valid: false` |
| UT-VL-004 | 数量が小数第3位 | `{quantity: 1.001, ...}` | `valid: false` |
| UT-VL-005 | 数量が小数第2位 | `{quantity: 1.01, ...}` | `valid: true` |
| UT-VL-006 | 単価が負 | `{unitPrice: -1, ...}` | `valid: false` |
| UT-VL-007 | 税区分が不正 | `{taxRateType: 'invalid', ...}` | `valid: false` |

### 2.11 和暦変換 (`toJapaneseEra`)

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-JE-001 | 令和通常 | `'2026-03-01'` | `'令和8年3月1日'` |
| UT-JE-002 | 令和元年 | `'2019-05-01'` | `'令和元年5月1日'` |
| UT-JE-003 | 平成最終日 | `'2019-04-30'` | `'平成31年4月30日'` |
| UT-JE-004 | 平成元年 | `'1989-01-08'` | `'平成元年1月8日'` |
| UT-JE-005 | 昭和最終日 | `'1989-01-07'` | `'昭和64年1月7日'` |
| UT-JE-006 | 不正な入力 | `'invalid'` | `'invalid'`（入力文字列をそのまま返す） |
| UT-JE-007 | 空文字 | `''` | `''`（空文字を返す） |

### 2.12 インボイス登録番号バリデーション (`validateInvoiceNumber`)

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-INV-001 | 正常な番号 | `'T1234567890123'` | `valid: true` |
| UT-INV-002 | 空文字（任意） | `''` | `valid: true` |
| UT-INV-003 | null（任意） | `null` | `valid: true` |
| UT-INV-004 | Tなし | `'1234567890123'` | `valid: false` |
| UT-INV-005 | 桁数不足 | `'T123456789012'` | `valid: false` |
| UT-INV-006 | 桁数超過 | `'T12345678901234'` | `valid: false` |
| UT-INV-007 | 英字混入 | `'T123456789012A'` | `valid: false` |
| UT-INV-008 | 小文字t | `'t1234567890123'` | `valid: false` |

### 2.13 インポートデータバリデーション (`validateImportData`)

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-IMP-001 | 正常なデータ | `{appName: 'pado', partners: [], items: [], documents: []}` | `valid: true` |
| UT-IMP-002 | appName不一致 | `{appName: 'other', ...}` | `valid: false, error に 'pado形式ではありません'` |
| UT-IMP-003 | null入力 | `null` | `valid: false` |
| UT-IMP-004 | partnersが配列でない | `{appName: 'pado', partners: 'not-array', ...}` | `valid: false` |
| UT-IMP-005 | itemsが配列でない | `{..., items: 'not-array'}` | `valid: false` |
| UT-IMP-006 | documentsが配列でない | `{..., documents: 'not-array'}` | `valid: false` |

### 2.14 帳票変換可否判定 (`getConversionTargets`)

| テストID | テスト名 | 入力(docType) | 期待結果 |
|---------|---------|--------------|---------|
| UT-CV-001 | 見積書の変換先 | `'estimate'` | `['invoice', 'purchase_order', 'delivery_note']` |
| UT-CV-002 | 発注書の変換先 | `'purchase_order'` | `['purchase_slip', 'delivery_note']` |
| UT-CV-003 | 請求書の変換先 | `'invoice'` | `['receipt', 'sales_slip']` |
| UT-CV-004 | 納品書の変換先 | `'delivery_note'` | `['invoice', 'sales_slip']` |
| UT-CV-005 | 売上伝票の変換先 | `'sales_slip'` | `['invoice', 'receipt']` |
| UT-CV-006 | 仕入伝票の変換先 | `'purchase_slip'` | `[]` |
| UT-CV-007 | 領収書の変換先 | `'receipt'` | `[]` |

### 2.15 HTMLエスケープ (`escapeHtml`)

| テストID | テスト名 | 入力 | 期待結果 |
|---------|---------|------|---------|
| UT-ESC-001 | 通常文字 | `'テスト'` | `'テスト'` |
| UT-ESC-002 | &エスケープ | `'A&B'` | `'A&amp;B'` |
| UT-ESC-003 | <エスケープ | `'<script>'` | `'&lt;script&gt;'` |
| UT-ESC-004 | "エスケープ | `'"test"'` | `'&quot;test&quot;'` |
| UT-ESC-005 | null入力 | `null` | `''` |
| UT-ESC-006 | undefined入力 | `undefined` | `''` |
| UT-ESC-007 | 数値入力 | `123` | `'123'`（String変換後エスケープ） |

### 2.16 金額フォーマット (`formatYen` / `formatCurrency`)

| テストID | テスト名 | 関数 | 入力 | 期待結果 |
|---------|---------|------|------|---------|
| UT-FC-001 | 通常金額(¥付き) | `formatYen` | `1234567` | `'¥1,234,567'` |
| UT-FC-002 | 0円(¥付き) | `formatYen` | `0` | `'¥0'` |
| UT-FC-003 | 3桁以下(¥付き) | `formatYen` | `999` | `'¥999'` |
| UT-FC-004 | 大きな金額(¥付き) | `formatYen` | `100000000` | `'¥100,000,000'` |

### 2.17 日付ユーティリティ

| テストID | テスト名 | 関数 | 入力 | 期待結果 |
|---------|---------|------|------|---------|
| UT-DT-001 | 月末(31日月) | `endOfMonth` | `'2026-01-15'` | `'2026-01-31'` |
| UT-DT-002 | 月末(30日月) | `endOfMonth` | `'2026-04-15'` | `'2026-04-30'` |
| UT-DT-003 | 月末(2月・平年) | `endOfMonth` | `'2026-02-15'` | `'2026-02-28'` |
| UT-DT-004 | 月末(2月・閏年) | `endOfMonth` | `'2028-02-15'` | `'2028-02-29'` |
| UT-DT-005 | 日付加算 | `addDays` | `'2026-03-01', 30` | `'2026-03-31'` |
| UT-DT-006 | 日付加算(月跨ぎ) | `addDays` | `'2026-03-25', 10` | `'2026-04-04'` |
| UT-DT-007 | 日付フォーマット | `formatDate` | `'2026-03-01'` | `'2026/03/01'` |
| UT-DT-008 | 不正日付 | `formatDate` | `'invalid'` | `'---'` |

---

## 3. E2Eテスト仕様

テスト環境: Docker コンテナ内で Puppeteer を実行

### 3.1 アプリ起動・初期表示

| テストID | テスト名 | 操作 | 期待結果 |
|---------|---------|------|---------|
| E2E-INIT-001 | アプリ読み込み | ページアクセス | タイトル「パド帳票管理」が表示される |
| E2E-INIT-002 | 初期タブ | ページアクセス | 帳票タブがアクティブ |
| E2E-INIT-003 | サブタブ表示 | 帳票タブ表示 | 7種の帳票サブタブが表示される |
| E2E-INIT-004 | バージョン表示 | ページアクセス | 右上にバージョン情報が表示される |

### 3.2 取引先管理

| テストID | テスト名 | 操作 | 期待結果 |
|---------|---------|------|---------|
| E2E-PTR-001 | 取引先新規登録 | 取引先タブ→新規登録ボタン→フォーム入力→保存 | 取引先一覧に新規取引先が表示される |
| E2E-PTR-002 | 取引先コード自動採番 | 取引先を2件登録 | P0001、P0002が自動採番される |
| E2E-PTR-003 | 取引先編集 | 取引先カードクリック→名前変更→保存 | 変更が反映される |
| E2E-PTR-004 | 取引先削除 | 取引先カードクリック→削除→確認 | 一覧から削除される |
| E2E-PTR-005 | 取引先検索 | 検索バーに名前を入力 | 一致する取引先のみ表示される |
| E2E-PTR-006 | バリデーションエラー | 取引先名を空で保存 | エラーメッセージが表示される |

### 3.3 品目管理

| テストID | テスト名 | 操作 | 期待結果 |
|---------|---------|------|---------|
| E2E-ITM-001 | 品目新規登録 | 品目タブ→新規登録ボタン→フォーム入力→保存 | 品目一覧に新規品目が表示される |
| E2E-ITM-002 | 品目コード自動採番 | 品目を2件登録 | I0001、I0002が自動採番される |
| E2E-ITM-003 | 品目編集 | 品目カードクリック→名前変更→保存 | 変更が反映される |
| E2E-ITM-004 | 品目削除 | 品目カードクリック→削除→確認 | 一覧から削除される |

### 3.4 帳票作成・編集

| テストID | テスト名 | 操作 | 期待結果 |
|---------|---------|------|---------|
| E2E-DOC-001 | 請求書新規作成 | 請求書サブタブ→新規作成→取引先選択→明細入力→保存 | 帳票一覧に新規請求書が表示される |
| E2E-DOC-002 | 帳票番号自動採番 | 請求書を2件作成 | INV-{year}-0001、INV-{year}-0002が採番される |
| E2E-DOC-003 | 明細行追加 | 帳票編集→行追加ボタン | 新しい空行が追加される |
| E2E-DOC-004 | 明細行削除 | 帳票編集→行削除ボタン | 行が削除される（最低1行は残る） |
| E2E-DOC-005 | 品目選択で自動入力 | 明細行の品目をドロップダウンから選択 | 単価・単位・税区分が自動入力される |
| E2E-DOC-006 | 金額自動計算 | 数量・単価を入力 | 金額（数量x単価）が自動表示される |
| E2E-DOC-007 | 税率別集計表示 | 10%品目と8%品目を入力 | 税率別の内訳が正しく表示される |
| E2E-DOC-008 | 帳票編集 | 帳票カードクリック→内容変更→保存 | 変更が反映される |
| E2E-DOC-009 | 帳票削除 | 帳票編集→削除→確認 | 一覧から削除される |
| E2E-DOC-010 | 見積書作成 | 見積書サブタブ→新規作成→保存 | 有効期限がデフォルト（+30日）で設定される |
| E2E-DOC-011 | 領収書作成 | 領収書サブタブ→新規作成 | 但し書きフィールドが表示され、プレースホルダーが表示される |

### 3.5 帳票変換

| テストID | テスト名 | 操作 | 期待結果 |
|---------|---------|------|---------|
| E2E-CNV-001 | 見積書→請求書変換 | 見積書作成→変換ボタン→請求書選択 | 新規請求書が作成され、明細行がコピーされる |
| E2E-CNV-002 | 請求書→領収書変換 | 請求書作成→変換ボタン→領収書選択 | 新規領収書が作成される |
| E2E-CNV-003 | 変換元の追跡 | 変換後の帳票を確認 | sourceDocId が設定されている |
| E2E-CNV-004 | 変換不可の帳票 | 領収書の変換ボタン | 変換先が表示されない（変換不可） |

### 3.6 収入印紙

| テストID | テスト名 | 操作 | 期待結果 |
|---------|---------|------|---------|
| E2E-STP-001 | 印紙不要 | 領収書で税抜5万円未満の明細入力 | 印紙税注記が表示されない |
| E2E-STP-002 | 印紙必要 | 領収書で税抜5万円以上の明細入力 | 印紙税額が注記に表示される |

### 3.7 設定

| テストID | テスト名 | 操作 | 期待結果 |
|---------|---------|------|---------|
| E2E-SET-001 | 発行者情報保存 | 設定タブ→発行者情報入力→保存 | 設定が保存される |
| E2E-SET-002 | 帳票に発行者反映 | 発行者情報保存→帳票作成 | 帳票の発行者情報エリアに反映される |
| E2E-SET-003 | 計算設定変更 | 端数処理を四捨五入に変更 | 帳票の税額計算に反映される |
| E2E-SET-004 | 登録番号設定 | 登録番号を入力して保存 | 帳票に登録番号が表示される |

### 3.8 データエクスポート/インポート

| テストID | テスト名 | 操作 | 期待結果 |
|---------|---------|------|---------|
| E2E-DIO-001 | エクスポート | データ投入→エクスポートボタン | JSONファイルがダウンロードされる |
| E2E-DIO-002 | インポート | エクスポートファイルをインポート | データが復元される |
| E2E-DIO-003 | 不正ファイルインポート | 不正JSONをインポート | エラーメッセージが表示される |
| E2E-DIO-004 | 全データ削除 | 全データ削除→確認 | 全ストアがクリアされる |
| E2E-DIO-005 | サンプルデータ | サンプルデータ読み込み | サンプルの取引先・品目・帳票が登録される |

### 3.9 印刷

| テストID | テスト名 | 操作 | 期待結果 |
|---------|---------|------|---------|
| E2E-PRT-001 | 印刷プレビュー確認 | 帳票作成→印刷ボタン | 印刷用レイアウトが表示される（no-print要素が非表示） |
| E2E-PRT-002 | 領収書印刷レイアウト | 領収書作成→印刷ボタン | コンパクトレイアウト+印紙欄が表示される |

### 3.10 PWA

| テストID | テスト名 | 操作 | 期待結果 |
|---------|---------|------|---------|
| E2E-PWA-001 | Service Worker登録 | ページアクセス | Service Worker が登録される |
| E2E-PWA-002 | マニフェスト確認 | ページアクセス | manifest.json が正しく参照される |
