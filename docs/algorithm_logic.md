# アルゴリズム・ロジック仕様書 — パド帳票管理 (pado)

## 1. 消費税計算アルゴリズム

### 1.1 明細行ごとの税計算 (`calcLineTax`)

**ファイル**: `pado.calc.js`

#### アルゴリズム

```
入力: amount (number, 税抜金額), taxRateType (string), roundingMethod (string)
出力: taxAmount (integer, 消費税額)

1. IF taxRateType === 'exempt' THEN RETURN 0
2. rate = taxRateType === 'rate10' ? 0.10 : 0.08
3. rawTax = amount * rate
4. SWITCH roundingMethod:
     'floor': RETURN Math.floor(rawTax)
     'round': RETURN Math.round(rawTax)
     'ceil':  RETURN Math.ceil(rawTax)
     default: RETURN Math.floor(rawTax)
```

### 1.2 帳票合計計算 (`calcDocumentTotals`)

**ファイル**: `pado.calc.js`

#### アルゴリズム

```
入力: lines (Array, 明細行), taxCalcMethod (string), roundingMethod (string)
出力: {
  subtotal, tax10Base, tax10Amount, tax8Base, tax8Amount,
  taxExemptAmount, totalAmount
}

CASE taxCalcMethod === 'per_line':
  1. FOR EACH line IN lines:
       a. line.amount = line.quantity * line.unitPrice
       b. line.taxAmount = calcLineTax(line.amount, line.taxRateType, roundingMethod)
  2. subtotal = SUM(lines[].amount)
  3. tax10Base = SUM(lines WHERE taxRateType='rate10')[].amount)
  4. tax10Amount = SUM(lines WHERE taxRateType='rate10')[].taxAmount)
  5. tax8Base = SUM(lines WHERE taxRateType='rate8')[].amount)
  6. tax8Amount = SUM(lines WHERE taxRateType='rate8')[].taxAmount)
  7. taxExemptAmount = SUM(lines WHERE taxRateType='exempt')[].amount)
  8. totalAmount = subtotal + tax10Amount + tax8Amount

CASE taxCalcMethod === 'per_total':
  1. FOR EACH line IN lines:
       a. line.amount = line.quantity * line.unitPrice
  2. subtotal = SUM(lines[].amount)
  3. tax10Base = SUM(lines WHERE taxRateType='rate10')[].amount)
  4. tax10Amount = applyRounding(tax10Base * 0.10, roundingMethod)
  5. tax8Base = SUM(lines WHERE taxRateType='rate8')[].amount)
  6. tax8Amount = applyRounding(tax8Base * 0.08, roundingMethod)
  7. taxExemptAmount = SUM(lines WHERE taxRateType='exempt')[].amount)
  8. totalAmount = subtotal + tax10Amount + tax8Amount

RETURN { subtotal, tax10Base, tax10Amount, tax8Base, tax8Amount,
         taxExemptAmount, totalAmount }
```

#### 端数処理関数 (`applyRounding`)

```
入力: value (number), roundingMethod (string)
出力: integer

SWITCH roundingMethod:
  'floor': RETURN Math.floor(value)
  'round': RETURN Math.round(value)
  'ceil':  RETURN Math.ceil(value)
  default: RETURN Math.floor(value)
```

#### 計算例（明細行ごと・切り捨て）

| 品目 | 数量 | 単価 | 税区分 | 金額 | 消費税 |
|------|------|------|--------|------|--------|
| Webサイト制作 | 1 | 300,000 | 10% | 300,000 | 30,000 |
| ロゴデザイン | 1 | 55,000 | 10% | 55,000 | 5,500 |
| 飲料 | 10 | 150 | 8% | 1,500 | 120 |

- 小計: 356,500
- 10%対象: 355,000 / 消費税(10%): 35,500
- 8%対象: 1,500 / 消費税(8%): 120
- 合計: 392,120

#### 計算例（合計に対して・切り捨て）

同じ明細行の場合:
- 10%対象合計: 355,000 → 消費税: Math.floor(355,000 * 0.10) = 35,500
- 8%対象合計: 1,500 → 消費税: Math.floor(1,500 * 0.08) = 120
- 合計: 392,120

（この例では結果が同一だが、端数が発生する場合に差異が生じる）

#### 端数が生じる場合の差異例

| 品目 | 数量 | 単価 | 税区分 | 金額 |
|------|------|------|--------|------|
| 品目A | 1 | 999 | 10% | 999 |
| 品目B | 1 | 999 | 10% | 999 |
| 品目C | 1 | 999 | 10% | 999 |

明細行ごと（切り捨て）: 各行 Math.floor(999 * 0.10) = 99 → 消費税合計 = 297
合計に対して（切り捨て）: Math.floor(2997 * 0.10) = Math.floor(299.7) = 299

---

## 2. 帳票番号生成アルゴリズム

### 関数: `generateDocNumber(docType, currentNumber)`

**ファイル**: `pado.calc.js`

#### アルゴリズム

```
入力: docType (string), currentNumber (integer)
出力: docNumber (string)

1. prefix = DOC_PREFIX_MAP[docType]
     estimate       → "EST"
     purchase_order → "PO"
     invoice        → "INV"
     delivery_note  → "DN"
     sales_slip     → "SS"
     purchase_slip  → "PS"
     receipt        → "RCP"
2. year = new Date().getFullYear()
3. nextNum = currentNumber + 1
4. IF nextNum > 9999 THEN THROW "帳票番号が上限に達しました"
5. paddedNum = String(nextNum).padStart(4, '0')
6. RETURN `${prefix}-${year}-${paddedNum}`
```

#### 生成例

| 帳票種別 | 連番 | 結果 |
|---------|------|------|
| invoice (初回) | 0 | INV-2026-0001 |
| invoice (2件目) | 1 | INV-2026-0002 |
| estimate (初回) | 0 | EST-2026-0001 |
| receipt (100件目) | 99 | RCP-2026-0100 |

### 関数: `getSequenceKey(docType, year)`

```
入力: docType (string), year (number)
出力: sequenceKey (string)

1. prefix = DOC_PREFIX_MAP[docType]
2. RETURN `${prefix}-${year}`
```

用途: `doc_sequences` ストアのキーとして使用。年が変わると連番がリセットされる。

---

## 3. 収入印紙税額判定アルゴリズム

### 関数: `calcStampTax(taxExcludedAmount)`

**ファイル**: `pado.calc.js`

#### アルゴリズム

```
入力: taxExcludedAmount (number, 税抜金額)
出力: { required: boolean, amount: number }

1. IF taxExcludedAmount < 50000
     RETURN { required: false, amount: 0 }
2. STAMP_TABLE = [
     { threshold:    50000, tax:      0 },  // (不要、step 1で除外済み)
     { threshold:  1000000, tax:    200 },
     { threshold:  2000000, tax:    400 },
     { threshold:  3000000, tax:    600 },
     { threshold:  5000000, tax:   1000 },
     { threshold: 10000000, tax:   2000 },
     { threshold: 30000000, tax:   6000 },
     { threshold: 50000000, tax:  10000 },
     { threshold:100000000, tax:  20000 },
     { threshold:200000000, tax:  40000 },
     { threshold:300000000, tax:  60000 },
     { threshold:500000000, tax: 100000 }
   ]
3. FOR i = STAMP_TABLE.length - 1 DOWN TO 0:
     IF taxExcludedAmount > STAMP_TABLE[i].threshold
       RETURN { required: true, amount: STAMP_TABLE[i+1 < length ? i+1 : 特殊].tax }
     (上の閾値を超えるものを見つけて対応する税額を返す)
4. 5億円超の場合:
     RETURN { required: true, amount: 200000 }
```

より正確な実装:

```
入力: taxExcludedAmount (number, 税抜金額)
出力: { required: boolean, amount: number }

STAMP_BRACKETS = [
  { min:         0, max:     49999, tax:      0, required: false },
  { min:     50000, max:   1000000, tax:    200, required: true },
  { min:   1000001, max:   2000000, tax:    400, required: true },
  { min:   2000001, max:   3000000, tax:    600, required: true },
  { min:   3000001, max:   5000000, tax:   1000, required: true },
  { min:   5000001, max:  10000000, tax:   2000, required: true },
  { min:  10000001, max:  30000000, tax:   6000, required: true },
  { min:  30000001, max:  50000000, tax:  10000, required: true },
  { min:  50000001, max: 100000000, tax:  20000, required: true },
  { min: 100000001, max: 200000000, tax:  40000, required: true },
  { min: 200000001, max: 300000000, tax:  60000, required: true },
  { min: 300000001, max: 500000000, tax: 100000, required: true },
  { min: 500000001, max:  Infinity, tax: 200000, required: true }
]

1. FOR EACH bracket IN STAMP_BRACKETS:
     IF taxExcludedAmount >= bracket.min AND taxExcludedAmount <= bracket.max
       RETURN { required: bracket.required, amount: bracket.tax }
```

#### 判定例

| 税抜金額 | 印紙要否 | 印紙税額 | 備考 |
|---------|---------|---------|------|
| 30,000 | 不要 | 0 | 5万円未満 |
| 49,999 | 不要 | 0 | 境界値（5万円未満） |
| 50,000 | 必要 | 200 | 境界値（5万円以上） |
| 500,000 | 必要 | 200 | 100万円以下 |
| 1,000,000 | 必要 | 200 | 境界値（100万円以下） |
| 1,000,001 | 必要 | 400 | 100万円超 |
| 5,000,000 | 必要 | 1,000 | 境界値（500万円以下） |
| 10,000,000 | 必要 | 2,000 | 境界値（1,000万円以下） |
| 500,000,001 | 必要 | 200,000 | 5億円超 |

#### 重要な仕様

- **判定基準は税抜金額**: 消費税額が区分記載されている場合、消費税額を除いた金額で判定する
- **領収書のみに適用**: 他の帳票種別では収入印紙の判定は行わない
- **電子発行の場合**: 電子データとして発行された領収書は印紙税法上の「文書」に該当せず非課税だが、本アプリは印刷利用を前提とするため常に判定を行う

---

## 4. 帳票変換アルゴリズム

### 関数: `convertDocument(sourceDoc, targetDocType)`

**ファイル**: `pado.calc.js`（データマッピング部分）

#### アルゴリズム

```
入力: sourceDoc (object, 変換元帳票), targetDocType (string, 変換先種別)
出力: newDoc (object, 変換先帳票のテンプレート)

1. 変換可否チェック
   CONVERSION_MAP = {
     estimate:       ['invoice', 'purchase_order', 'delivery_note'],
     purchase_order: ['purchase_slip'],
     delivery_note:  ['sales_slip'],
     invoice:        ['receipt'],
     sales_slip:     ['invoice'],
     purchase_slip:  [],
     receipt:        []
   }
   IF targetDocType NOT IN CONVERSION_MAP[sourceDoc.docType]
     THROW "この帳票種別への変換はできません"

2. 共通フィールドコピー
   newDoc = {
     docType: targetDocType,
     partnerId: sourceDoc.partnerId,
     partnerName: sourceDoc.partnerName,
     issueDate: today(),
     status: 'draft',
     sourceDocId: sourceDoc.id,
     lines: deepCopy(sourceDoc.lines),
     memo: sourceDoc.memo
   }

3. 種別固有フィールドのデフォルト設定
   SWITCH targetDocType:
     'estimate':
       newDoc.validUntil = addDays(today(), 30)
     'invoice':
       newDoc.paymentDeadline = endOfMonth(today())
     'purchase_order':
       newDoc.deliveryDate = null
     'delivery_note':
       newDoc.deliveryDate = today()
     'sales_slip':
       newDoc.description = ''
     'purchase_slip':
       newDoc.description = ''
     'receipt':
       newDoc.description = 'お品代として'

4. RETURN newDoc
```

#### 変換可能マトリクス

| 変換元 ＼ 変換先 | 見積書 | 発注書 | 請求書 | 納品書 | 売上伝票 | 仕入伝票 | 領収書 |
|----------------|--------|--------|--------|--------|---------|---------|--------|
| 見積書 | - | ○ | ○ | ○ | - | - | - |
| 発注書 | - | - | - | - | - | ○ | - |
| 請求書 | - | - | - | - | - | - | ○ |
| 納品書 | - | - | - | - | ○ | - | - |
| 売上伝票 | - | - | ○ | - | - | - | - |
| 仕入伝票 | - | - | - | - | - | - | - |
| 領収書 | - | - | - | - | - | - | - |

---

## 5. 取引先コード自動生成アルゴリズム

### 関数: `generatePartnerCode(existingCodes)`

**ファイル**: `pado.calc.js`

#### アルゴリズム

```
入力: existingCodes (string[], 既存取引先コードの配列)
出力: nextCode (string, "P" + 4桁ゼロ埋め)

1. IF existingCodes が null/空 THEN RETURN "P0001"
2. numbers = existingCodes から /^P\d{4}$/ にマッチするものを数値化
3. IF numbers が空 THEN RETURN "P0001"
4. maxNum = numbers の最大値
5. nextNum = maxNum + 1
6. IF nextNum > 9999 THEN THROW "取引先コードが上限に達しました"
7. RETURN "P" + nextNum を4桁ゼロ埋め
```

#### 計算例

| 既存コード | 結果 | 備考 |
|-----------|------|------|
| `[]` | `P0001` | 初回 |
| `["P0001", "P0002"]` | `P0003` | 連番 |
| `["P0001", "P0003"]` | `P0004` | 飛び番あり（最大値+1） |
| `null` | `P0001` | null入力 |
| `["P9999"]` | Error | 上限超過 |

---

## 6. 品目コード自動生成アルゴリズム

### 関数: `generateItemCode(existingCodes)`

**ファイル**: `pado.calc.js`

#### アルゴリズム

```
入力: existingCodes (string[], 既存品目コードの配列)
出力: nextCode (string, "I" + 4桁ゼロ埋め)

1. IF existingCodes が null/空 THEN RETURN "I0001"
2. numbers = existingCodes から /^I\d{4}$/ にマッチするものを数値化
3. IF numbers が空 THEN RETURN "I0001"
4. maxNum = numbers の最大値
5. nextNum = maxNum + 1
6. IF nextNum > 9999 THEN THROW "品目コードが上限に達しました"
7. RETURN "I" + nextNum を4桁ゼロ埋め
```

---

## 7. 和暦変換アルゴリズム

### 関数: `toJapaneseEra(dateStr)`

**ファイル**: `pado.calc.js`

#### アルゴリズム

```
入力: dateStr (string, "YYYY-MM-DD" 形式)
出力: string (和暦文字列)

ERA_TABLE = [
  { name: '令和', start: '2019-05-01' },
  { name: '平成', start: '1989-01-08' },
  { name: '昭和', start: '1926-12-25' },
  { name: '大正', start: '1912-07-30' },
  { name: '明治', start: '1868-01-25' }
]

1. IF dateStr が無効 THEN RETURN '---'
2. FOR EACH era IN ERA_TABLE (新しい順):
     IF dateStr >= era.start:
       year = dateStr の年 - era.start の年 + 1
       (ただし era.start の年と同年の場合は元年)
       IF year === 1 THEN yearStr = '元'
       ELSE yearStr = String(year)
       RETURN `${era.name}${yearStr}年${month}月${day}日`
3. RETURN '---' (対応元号なし)
```

#### 変換例

| 入力 | 出力 |
|------|------|
| `'2026-03-01'` | `'令和8年3月1日'` |
| `'2019-05-01'` | `'令和元年5月1日'` |
| `'2019-04-30'` | `'平成31年4月30日'` |
| `'1989-01-08'` | `'平成元年1月8日'` |
| `'1989-01-07'` | `'昭和64年1月7日'` |

---

## 8. インボイス登録番号バリデーション

### 関数: `validateInvoiceNumber(number)`

**ファイル**: `pado.calc.js`

#### アルゴリズム

```
入力: number (string)
出力: { valid: boolean, error?: string }

1. IF number === null OR number === '' OR number === undefined
     RETURN { valid: true }  // 任意項目のため空は有効
2. IF typeof number !== 'string'
     RETURN { valid: false, error: '登録番号の形式が不正です' }
3. IF !/^T\d{13}$/.test(number)
     RETURN { valid: false, error: '登録番号はT+13桁の数字で入力してください' }
4. RETURN { valid: true }
```

---

## 9. エクスポートデータバリデーションアルゴリズム

### 関数: `validateImportData(data)`

**ファイル**: `pado.calc.js`

#### アルゴリズム

```
入力: data (any)
出力: { valid: boolean, error?: string }

1. IF typeof data !== 'object' OR data === null
     RETURN { valid: false, error: 'JSONオブジェクト形式ではありません' }
2. IF data.appName !== 'pado'
     RETURN { valid: false, error: 'このファイルはpado形式ではありません' }
3. IF !Array.isArray(data.partners)
     RETURN { valid: false, error: 'partnersフィールドが不正です' }
4. IF !Array.isArray(data.items)
     RETURN { valid: false, error: 'itemsフィールドが不正です' }
5. IF !Array.isArray(data.documents)
     RETURN { valid: false, error: 'documentsフィールドが不正です' }
6. RETURN { valid: true }
```

---

## 10. UUID生成

### 関数: `generateUUID()`

**ファイル**: `pado.calc.js`

#### アルゴリズム

```
1. IF crypto.randomUUID が利用可能
     RETURN crypto.randomUUID()
2. ELSE (フォールバック)
     テンプレート "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx" の各文字を:
     - 'x': ランダムな16進数 (0-f)
     - 'y': ランダムな16進数 (8, 9, a, b のいずれか)
     - '4': 固定値4 (UUID v4 識別子)
     に置換して返す
```

---

## 11. HTMLエスケープ

### 関数: `escapeHtml(str)`

**ファイル**: `pado.calc.js`

#### アルゴリズム

```
入力: str (any)
出力: エスケープ済み文字列

1. IF typeof str !== 'string' THEN RETURN ''
2. 以下の置換を順番に適用:
   '&' → '&amp;'
   '<' → '&lt;'
   '>' → '&gt;'
   '"' → '&quot;'
   "'" → '&#039;'
3. RETURN 置換済み文字列
```

---

## 12. 日付ユーティリティ

### 関数: `formatDate(dateStr)`

```
入力: dateStr (string | Date)
出力: "YYYY/MM/DD" 形式の文字列、不正な場合は "---"
```

### 関数: `formatDateJP(dateStr)`

```
入力: dateStr (string | Date)
出力: "YYYY年MM月DD日" 形式の文字列、不正な場合は "---"
```

### 関数: `endOfMonth(dateStr)`

```
入力: dateStr (string, "YYYY-MM-DD")
出力: その月の末日 ("YYYY-MM-DD")

1. date = new Date(dateStr)
2. date.setMonth(date.getMonth() + 1)
3. date.setDate(0)
4. RETURN formatISO(date)
```

### 関数: `addDays(dateStr, days)`

```
入力: dateStr (string, "YYYY-MM-DD"), days (integer)
出力: 加算後の日付 ("YYYY-MM-DD")
```

---

## 13. 金額フォーマット

### 関数: `formatCurrency(amount)`

```
入力: amount (number)
出力: "¥" + カンマ区切り文字列

例: formatCurrency(1234567) → "¥1,234,567"
例: formatCurrency(0) → "¥0"
```

実装: `'¥' + amount.toLocaleString('ja-JP')`

---

## 14. 角印テキスト折り返しアルゴリズム

### 関数: `formatSealText(text, wrapCount)`

**ファイル**: `pado.calc.js`

#### アルゴリズム

```
入力: text (string, 角印テキスト), wrapCount (number, 1列あたりの文字数)
出力: string (改行区切りのテキスト)

1. IF text が null/undefined/空文字 THEN RETURN ''
2. IF wrapCount <= 0 THEN RETURN text（折り返しなし）
3. chars = Array.from(text)  // サロゲートペア対応のためArray.fromで分割
4. chunks = []
5. FOR i = 0; i < chars.length; i += wrapCount:
     chunk = chars.slice(i, i + wrapCount).join('')
     chunks.push(chunk)
6. RETURN chunks.join('\n')
```

#### HTML描画時の処理

角印テキストをHTMLとして描画する際は以下の手順で処理する:

1. `escapeHtml(text)` でHTMLエスケープを適用
2. `formatSealText()` で折り返し処理を実行
3. 改行文字 `\n` を `<br>` に置換して出力
4. 折り返しあり（`sealWrapCount > 0`）の場合は `letter-spacing: 0px` を適用

描画は `buildSealHtml(seller, displaySettings, sizeOverride)` ヘルパー関数（`script.js`）で行う。

#### 計算例

| テキスト | wrapCount | 結果 |
|---------|-----------|------|
| `'山田商店'` | 0 | `'山田商店'` |
| `'山田商店'` | 2 | `'山田\n商店'` |
| `'あいうえお'` | 2 | `'あい\nうえ\nお'` |
| `'あいうえおか'` | 3 | `'あいう\nえおか'` |
| `'𠮷野家𠮷'` | 2 | `'𠮷野\n家𠮷'` |
| `''` | 2 | `''` |
| `'AB'` | 3 | `'AB'` |
