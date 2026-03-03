/**
 * pado.calc.test.js - Pado 計算・ロジックモジュール ユニットテスト
 */

const {
    calcLineAmount,
    applyRounding,
    calculateTaxSummary,
    DEFAULT_DOC_PREFIXES,
    getFiscalYear,
    generateDocNumber,
    generatePartnerCode,
    generateItemCode,
    REVENUE_STAMP_TABLE,
    isRevenueStampRequired,
    getRevenueStampAmount,
    validatePartner,
    validateInvoiceRegNumber,
    validateDocument,
    validateImportData,
    formatDateJapanese,
    formatCurrency,
    formatYen,
    escapeHtml,
    DOC_TYPE_LABELS,
    CONVERSION_RULES,
    buildConvertedDocument
} = require('./pado.calc.js');

// ============================================================
// 3-1. 税額計算
// ============================================================
describe('calcLineAmount', () => {
    test('数量×単価を計算する', () => {
        expect(calcLineAmount(3, 1000)).toBe(3000);
    });
    test('小数点以下を切り捨てる', () => {
        expect(calcLineAmount(3, 333)).toBe(999);
    });
    test('0を含む計算', () => {
        expect(calcLineAmount(0, 1000)).toBe(0);
        expect(calcLineAmount(5, 0)).toBe(0);
    });
});

describe('applyRounding', () => {
    test('切り捨て', () => {
        expect(applyRounding(1.9, 'floor')).toBe(1);
        expect(applyRounding(1.1, 'floor')).toBe(1);
    });
    test('四捨五入', () => {
        expect(applyRounding(1.5, 'round')).toBe(2);
        expect(applyRounding(1.4, 'round')).toBe(1);
    });
    test('切り上げ', () => {
        expect(applyRounding(1.1, 'ceil')).toBe(2);
        expect(applyRounding(1.0, 'ceil')).toBe(1);
    });
    test('デフォルトは切り捨て', () => {
        expect(applyRounding(1.9, 'unknown')).toBe(1);
    });
});

describe('calculateTaxSummary', () => {
    const defaultSettings = {
        standardRate: 0.1,
        reducedRate: 0.08,
        roundingMethod: 'floor',
        calcMethod: 'per_total'
    };

    test('標準税率のみの計算', () => {
        const lines = [
            { quantity: 1, unitPrice: 10000, taxRateType: 'standard' },
            { quantity: 2, unitPrice: 5000, taxRateType: 'standard' }
        ];
        const result = calculateTaxSummary(lines, defaultSettings);
        expect(result.subtotal).toBe(20000);
        expect(result.totalTax).toBe(2000);
        expect(result.total).toBe(22000);
        expect(result.taxDetails).toHaveLength(1);
        expect(result.taxDetails[0].rateType).toBe('standard');
    });

    test('標準+軽減税率の混在', () => {
        const lines = [
            { quantity: 1, unitPrice: 80000, taxRateType: 'standard' },
            { quantity: 1, unitPrice: 20000, taxRateType: 'reduced' }
        ];
        const result = calculateTaxSummary(lines, defaultSettings);
        expect(result.subtotal).toBe(100000);
        expect(result.taxDetails).toHaveLength(2);

        const std = result.taxDetails.find(d => d.rateType === 'standard');
        const red = result.taxDetails.find(d => d.rateType === 'reduced');
        expect(std.taxAmount).toBe(8000);
        expect(red.taxAmount).toBe(1600);
        expect(result.totalTax).toBe(9600);
        expect(result.total).toBe(109600);
    });

    test('非課税を含む場合', () => {
        const lines = [
            { quantity: 1, unitPrice: 10000, taxRateType: 'standard' },
            { quantity: 1, unitPrice: 5000, taxRateType: 'exempt' }
        ];
        const result = calculateTaxSummary(lines, defaultSettings);
        expect(result.subtotal).toBe(15000);
        expect(result.totalTax).toBe(1000);
        expect(result.total).toBe(16000);
    });

    test('明細行ごとの計算（per_line）', () => {
        const settings = { ...defaultSettings, calcMethod: 'per_line' };
        const lines = [
            { quantity: 1, unitPrice: 333, taxRateType: 'standard' },
            { quantity: 1, unitPrice: 333, taxRateType: 'standard' }
        ];
        const result = calculateTaxSummary(lines, settings);
        // 333 * 0.1 = 33.3 → floor → 33 × 2行 = 66
        expect(result.totalTax).toBe(66);
    });

    test('合計に対する計算（per_total）', () => {
        const settings = { ...defaultSettings, calcMethod: 'per_total' };
        const lines = [
            { quantity: 1, unitPrice: 333, taxRateType: 'standard' },
            { quantity: 1, unitPrice: 333, taxRateType: 'standard' }
        ];
        const result = calculateTaxSummary(lines, settings);
        // 666 * 0.1 = 66.6 → floor → 66
        expect(result.totalTax).toBe(66);
    });

    test('端数処理: 切り上げ', () => {
        const settings = { ...defaultSettings, roundingMethod: 'ceil' };
        const lines = [
            { quantity: 1, unitPrice: 333, taxRateType: 'standard' }
        ];
        const result = calculateTaxSummary(lines, settings);
        // 333 * 0.1 = 33.3 → ceil → 34
        expect(result.totalTax).toBe(34);
    });

    test('空の明細', () => {
        const result = calculateTaxSummary([], defaultSettings);
        expect(result.subtotal).toBe(0);
        expect(result.totalTax).toBe(0);
        expect(result.total).toBe(0);
    });

    test('事前計算されたamountを使用', () => {
        const lines = [
            { quantity: 1, unitPrice: 1000, taxRateType: 'standard', amount: 5000 }
        ];
        const result = calculateTaxSummary(lines, defaultSettings);
        expect(result.subtotal).toBe(5000);
    });
});

// ============================================================
// 3-2. 帳票番号
// ============================================================
describe('getFiscalYear', () => {
    test('4月開始の場合（一般的な日本の会計年度）', () => {
        expect(getFiscalYear('2026-04-01', 4)).toBe(2026);
        expect(getFiscalYear('2026-03-31', 4)).toBe(2025);
        expect(getFiscalYear('2026-12-31', 4)).toBe(2026);
    });
    test('1月開始の場合', () => {
        expect(getFiscalYear('2026-01-01', 1)).toBe(2026);
        expect(getFiscalYear('2026-12-31', 1)).toBe(2026);
    });
    test('10月開始の場合', () => {
        expect(getFiscalYear('2026-10-01', 10)).toBe(2026);
        expect(getFiscalYear('2026-09-30', 10)).toBe(2025);
    });
});

describe('generateDocNumber', () => {
    test('標準的な採番', () => {
        const result = generateDocNumber('invoice', 0, {}, 2026);
        expect(result.docNumber).toBe('INV-2026-0001');
        expect(result.nextNumber).toBe(1);
    });
    test('連番', () => {
        const result = generateDocNumber('invoice', 5, {}, 2026);
        expect(result.docNumber).toBe('INV-2026-0006');
        expect(result.nextNumber).toBe(6);
    });
    test('カスタムフォーマット', () => {
        const fmt = { prefix: 'Q', separator: '_', includeYear: true, digits: 6 };
        const result = generateDocNumber('estimate', 0, fmt, 2026);
        expect(result.docNumber).toBe('Q_2026_000001');
    });
    test('年度なしフォーマット', () => {
        const fmt = { prefix: 'RC', separator: '-', includeYear: false, digits: 4 };
        const result = generateDocNumber('receipt', 42, fmt, 2026);
        expect(result.docNumber).toBe('RC-0043');
    });
    test('デフォルトプレフィックス', () => {
        expect(DEFAULT_DOC_PREFIXES.estimate).toBe('QT');
        expect(DEFAULT_DOC_PREFIXES.invoice).toBe('INV');
        expect(DEFAULT_DOC_PREFIXES.receipt).toBe('RC');
    });
});

describe('generatePartnerCode', () => {
    test('初めてのコード', () => {
        expect(generatePartnerCode([])).toBe('P0001');
    });
    test('既存コードの次番号', () => {
        expect(generatePartnerCode(['P0001', 'P0003'])).toBe('P0004');
    });
    test('nullでも動作', () => {
        expect(generatePartnerCode(null)).toBe('P0001');
    });
});

describe('generateItemCode', () => {
    test('初めてのコード', () => {
        expect(generateItemCode([])).toBe('I0001');
    });
    test('既存コードの次番号', () => {
        expect(generateItemCode(['I0001', 'I0002'])).toBe('I0003');
    });
});

// ============================================================
// 3-3. 収入印紙
// ============================================================
describe('isRevenueStampRequired', () => {
    test('5万円未満は不要', () => {
        expect(isRevenueStampRequired(49999)).toBe(false);
    });
    test('5万円は必要', () => {
        expect(isRevenueStampRequired(50000)).toBe(true);
    });
    test('100万円は必要', () => {
        expect(isRevenueStampRequired(1000000)).toBe(true);
    });
});

describe('getRevenueStampAmount', () => {
    test('5万円未満 → 0円', () => {
        expect(getRevenueStampAmount(49999)).toBe(0);
    });
    test('5万円 → 200円', () => {
        expect(getRevenueStampAmount(50000)).toBe(200);
    });
    test('100万円 → 200円', () => {
        expect(getRevenueStampAmount(1000000)).toBe(200);
    });
    test('100万円超 → 400円', () => {
        expect(getRevenueStampAmount(1000001)).toBe(400);
    });
    test('200万円超 → 600円', () => {
        expect(getRevenueStampAmount(2000001)).toBe(600);
    });
    test('300万円超 → 1000円', () => {
        expect(getRevenueStampAmount(3000001)).toBe(1000);
    });
    test('500万円超 → 2000円', () => {
        expect(getRevenueStampAmount(5000001)).toBe(2000);
    });
    test('1000万円超 → 6000円', () => {
        expect(getRevenueStampAmount(10000001)).toBe(6000);
    });
    test('5億円超 → 20万円', () => {
        expect(getRevenueStampAmount(500000001)).toBe(200000);
    });
});

// ============================================================
// 3-4. バリデーション
// ============================================================
describe('validatePartner', () => {
    test('有効な取引先', () => {
        const result = validatePartner({ name: 'テスト株式会社', partnerType: 'customer' });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });
    test('名前なしはエラー', () => {
        const result = validatePartner({ name: '', partnerType: 'customer' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('取引先名は必須です');
    });
    test('区分なしはエラー', () => {
        const result = validatePartner({ name: 'テスト', partnerType: '' });
        expect(result.valid).toBe(false);
    });
    test('不正なメールアドレス', () => {
        const result = validatePartner({ name: 'テスト', partnerType: 'customer', email: 'invalid' });
        expect(result.valid).toBe(false);
    });
    test('不正な郵便番号', () => {
        const result = validatePartner({ name: 'テスト', partnerType: 'customer', zipCode: '12345' });
        expect(result.valid).toBe(false);
    });
    test('正しい登録番号', () => {
        const result = validatePartner({ name: 'テスト', partnerType: 'customer', invoiceRegNumber: 'T1234567890123' });
        expect(result.valid).toBe(true);
    });
    test('不正な登録番号', () => {
        const result = validatePartner({ name: 'テスト', partnerType: 'customer', invoiceRegNumber: 'T123' });
        expect(result.valid).toBe(false);
    });
});

describe('validateInvoiceRegNumber', () => {
    test('空は有効（任意項目）', () => {
        expect(validateInvoiceRegNumber('').valid).toBe(true);
        expect(validateInvoiceRegNumber(null).valid).toBe(true);
    });
    test('正しい形式', () => {
        expect(validateInvoiceRegNumber('T1234567890123').valid).toBe(true);
    });
    test('Tなし', () => {
        expect(validateInvoiceRegNumber('1234567890123').valid).toBe(false);
    });
    test('桁数不足', () => {
        expect(validateInvoiceRegNumber('T123456789012').valid).toBe(false);
    });
    test('桁数超過', () => {
        expect(validateInvoiceRegNumber('T12345678901234').valid).toBe(false);
    });
});

describe('validateDocument', () => {
    const baseDoc = {
        docType: 'estimate',
        issueDate: '2026-03-03',
        partnerId: 'p1',
        lineItems: [{ name: 'テスト品目', quantity: 1, unitPrice: 1000 }],
        validUntil: '2026-04-03'
    };

    test('有効な見積書', () => {
        expect(validateDocument(baseDoc).valid).toBe(true);
    });
    test('帳票種別なし', () => {
        expect(validateDocument({ ...baseDoc, docType: '' }).valid).toBe(false);
    });
    test('発行日なし', () => {
        expect(validateDocument({ ...baseDoc, issueDate: '' }).valid).toBe(false);
    });
    test('取引先なし', () => {
        expect(validateDocument({ ...baseDoc, partnerId: '', partnerSnapshot: null }).valid).toBe(false);
    });
    test('明細なし（見積書）', () => {
        expect(validateDocument({ ...baseDoc, lineItems: [] }).valid).toBe(false);
    });
    test('明細なし（領収書はOK）', () => {
        const receiptDoc = { ...baseDoc, docType: 'receipt', lineItems: [], receiptOf: 'お食事代' };
        expect(validateDocument(receiptDoc).valid).toBe(true);
    });
    test('見積書の有効期限なし', () => {
        expect(validateDocument({ ...baseDoc, validUntil: '' }).valid).toBe(false);
    });
    test('請求書の支払期限なし', () => {
        const invoiceDoc = { ...baseDoc, docType: 'invoice', dueDate: '' };
        expect(validateDocument(invoiceDoc).valid).toBe(false);
    });
    test('領収書の但し書きなし', () => {
        const receiptDoc = { ...baseDoc, docType: 'receipt', receiptOf: '' };
        expect(validateDocument(receiptDoc).valid).toBe(false);
    });
    test('明細行の品目名なし', () => {
        const doc = { ...baseDoc, lineItems: [{ name: '', quantity: 1, unitPrice: 1000 }] };
        expect(validateDocument(doc).valid).toBe(false);
    });
    test('明細行の数量0以下', () => {
        const doc = { ...baseDoc, lineItems: [{ name: 'テスト', quantity: 0, unitPrice: 1000 }] };
        expect(validateDocument(doc).valid).toBe(false);
    });
});

describe('validateImportData', () => {
    test('有効なデータ', () => {
        const data = {
            partners: [{ id: '1', name: 'テスト' }],
            items: [{ id: '1', name: '品目' }],
            documents: [{ id: '1' }],
            settings: { tax: {} }
        };
        const result = validateImportData(data);
        expect(result.valid).toBe(true);
        expect(result.counts.partners).toBe(1);
    });
    test('nullデータ', () => {
        expect(validateImportData(null).valid).toBe(false);
    });
    test('不正な取引先データ', () => {
        const data = { partners: [{ name: 'テスト' }] };
        expect(validateImportData(data).valid).toBe(false);
    });
});

// ============================================================
// 3-5. フォーマット
// ============================================================
describe('formatDateJapanese', () => {
    test('令和の日付', () => {
        expect(formatDateJapanese('2026-03-03')).toBe('令和8年3月3日');
    });
    test('令和元年', () => {
        expect(formatDateJapanese('2019-05-01')).toBe('令和元年5月1日');
    });
    test('平成の日付', () => {
        expect(formatDateJapanese('2019-04-30')).toBe('平成31年4月30日');
    });
    test('空文字列', () => {
        expect(formatDateJapanese('')).toBe('');
    });
    test('不正な日付', () => {
        expect(formatDateJapanese('invalid')).toBe('invalid');
    });
});

describe('formatCurrency', () => {
    test('3桁カンマ区切り', () => {
        expect(formatCurrency(1234567)).toBe('1,234,567');
    });
    test('0', () => {
        expect(formatCurrency(0)).toBe('0');
    });
    test('null', () => {
        expect(formatCurrency(null)).toBe('0');
    });
    test('小数点切り捨て', () => {
        expect(formatCurrency(1234.56)).toBe('1,234');
    });
});

describe('formatYen', () => {
    test('円記号付き', () => {
        expect(formatYen(10000)).toBe('¥10,000');
    });
    test('0', () => {
        expect(formatYen(0)).toBe('¥0');
    });
});

describe('escapeHtml', () => {
    test('HTMLタグをエスケープ', () => {
        expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
    test('アンパサンド', () => {
        expect(escapeHtml('A & B')).toBe('A &amp; B');
    });
    test('シングルクォート', () => {
        expect(escapeHtml("it's")).toBe("it&#39;s");
    });
    test('空文字列', () => {
        expect(escapeHtml('')).toBe('');
    });
    test('null', () => {
        expect(escapeHtml(null)).toBe('');
    });
});

// ============================================================
// 3-6. 帳票変換
// ============================================================
describe('DOC_TYPE_LABELS', () => {
    test('7種帳票の日本語ラベル', () => {
        expect(Object.keys(DOC_TYPE_LABELS)).toHaveLength(7);
        expect(DOC_TYPE_LABELS.estimate).toBe('見積書');
        expect(DOC_TYPE_LABELS.receipt).toBe('領収書');
    });
});

describe('CONVERSION_RULES', () => {
    test('見積書からの変換先', () => {
        expect(CONVERSION_RULES.estimate).toEqual(['invoice', 'purchase_order', 'delivery_note']);
    });
    test('領収書は変換先なし', () => {
        expect(CONVERSION_RULES.receipt).toEqual([]);
    });
});

describe('buildConvertedDocument', () => {
    const sourceDoc = {
        id: 'doc1',
        docType: 'estimate',
        docNumber: 'QT-2026-0001',
        partnerId: 'p1',
        partnerSnapshot: { name: 'テスト会社', honorific: '御中' },
        lineItems: [
            { id: 'li1', name: '品目A', quantity: 2, unitPrice: 5000, taxRateType: 'standard', unit: '個', amount: 10000 }
        ],
        notes: 'テスト備考',
        taxSummary: { subtotal: 10000, taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 10000, taxAmount: 1000 }], totalTax: 1000, total: 11000 }
    };
    const companyInfo = { companyName: 'テスト事業者', invoiceRegNumber: 'T1234567890123' };
    const taxSettings = { standardRate: 0.1, reducedRate: 0.08, roundingMethod: 'floor', calcMethod: 'per_total' };

    test('見積書→請求書への変換', () => {
        const result = buildConvertedDocument(sourceDoc, 'invoice', companyInfo, taxSettings);
        expect(result.docType).toBe('invoice');
        expect(result.status).toBe('draft');
        expect(result.partnerId).toBe('p1');
        expect(result.partnerSnapshot.name).toBe('テスト会社');
        expect(result.lineItems).toHaveLength(1);
        expect(result.lineItems[0].name).toBe('品目A');
        expect(result.sourceDocId).toBe('doc1');
        expect(result.sourceDocType).toBe('estimate');
        expect(result.sourceDocNumber).toBe('QT-2026-0001');
    });

    test('請求書→領収書への変換', () => {
        const invoiceDoc = { ...sourceDoc, docType: 'invoice' };
        const result = buildConvertedDocument(invoiceDoc, 'receipt', companyInfo, taxSettings);
        expect(result.docType).toBe('receipt');
        expect(result.revenueStampRequired).toBe(false); // 1万円なので不要
    });

    test('大金額の領収書変換で印紙が必要', () => {
        const bigDoc = {
            ...sourceDoc,
            docType: 'invoice',
            lineItems: [{ id: 'li1', name: '大口取引', quantity: 1, unitPrice: 100000, taxRateType: 'standard', amount: 100000 }],
            taxSummary: { subtotal: 100000, taxDetails: [], totalTax: 10000, total: 110000 }
        };
        const result = buildConvertedDocument(bigDoc, 'receipt', companyInfo, taxSettings);
        expect(result.revenueStampRequired).toBe(true);
        expect(result.revenueStampAmount).toBe(200);
    });

    test('変換先が見積書の場合、有効期限が設定される', () => {
        const result = buildConvertedDocument(sourceDoc, 'estimate', companyInfo, taxSettings);
        expect(result.validUntil).toBeTruthy();
    });

    test('変換先が納品書の場合、納品日が設定される', () => {
        const result = buildConvertedDocument(sourceDoc, 'delivery_note', companyInfo, taxSettings);
        expect(result.deliveryDate).toBeTruthy();
    });

    test('明細行のIDが新規生成される', () => {
        const result = buildConvertedDocument(sourceDoc, 'invoice', companyInfo, taxSettings);
        expect(result.lineItems[0].id).not.toBe('li1');
    });
});
