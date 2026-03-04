/**
 * pado.calc.test.js - Pado 計算・ロジックモジュール ユニットテスト
 *
 * 仕様トレーサビリティ: docs/test_specification.md
 * テストIDはtest名に含まれ、`npm test -- --verbose` で対応確認可能
 * 例: "UT-TAX-001: 10%・切り捨て"
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
    validateItem,
    validatePartner,
    validateInvoiceRegNumber,
    validateDocument,
    validateImportData,
    formatDateJapanese,
    formatDate,
    endOfMonth,
    addDays,
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

// ============================================================
// 消費税計算 - 明細行ごと (UT-TAX-001〜010)
// ============================================================
describe('消費税計算 - 明細行ごと (UT-TAX)', () => {
    test.each([
        ['UT-TAX-001', 999, 'standard', 'floor', 99],
        ['UT-TAX-002', 999, 'standard', 'round', 100],
        ['UT-TAX-003', 999, 'standard', 'ceil', 100],
        ['UT-TAX-004', 999, 'reduced', 'floor', 79],
        ['UT-TAX-005', 999, 'reduced', 'round', 80],
        ['UT-TAX-006', 999, 'reduced', 'ceil', 80],
        ['UT-TAX-007', 10000, 'exempt', 'floor', 0],
        ['UT-TAX-008', 0, 'standard', 'floor', 0],
        ['UT-TAX-009', 1000, 'standard', 'floor', 100],
        ['UT-TAX-010', 1000, 'reduced', 'floor', 80],
    ])('%s: amount=%d, rate=%s, rounding=%s → tax=%d', (id, amount, rate, rounding, expected) => {
        const lines = [{ quantity: 1, unitPrice: amount, taxRateType: rate }];
        const settings = {
            standardRate: 0.1,
            reducedRate: 0.08,
            roundingMethod: rounding,
            calcMethod: 'per_line'
        };
        const result = calculateTaxSummary(lines, settings);
        expect(result.totalTax).toBe(expected);
    });
});

// ============================================================
// 帳票合計計算 (UT-TOTAL-001〜008)
// ============================================================
describe('帳票合計計算 (UT-TOTAL)', () => {
    const defaultPerLine = {
        standardRate: 0.1,
        reducedRate: 0.08,
        roundingMethod: 'floor',
        calcMethod: 'per_line'
    };
    const defaultPerTotal = {
        standardRate: 0.1,
        reducedRate: 0.08,
        roundingMethod: 'floor',
        calcMethod: 'per_total'
    };

    test('UT-TOTAL-001: 10%のみ単一行', () => {
        const lines = [{ quantity: 1, unitPrice: 10000, taxRateType: 'standard' }];
        const result = calculateTaxSummary(lines, defaultPerLine);
        expect(result.subtotal).toBe(10000);
        const std = result.taxDetails.find(d => d.rateType === 'standard');
        expect(std.taxAmount).toBe(1000);
        expect(result.total).toBe(11000);
    });

    test('UT-TOTAL-002: 8%のみ単一行', () => {
        const lines = [{ quantity: 1, unitPrice: 10000, taxRateType: 'reduced' }];
        const result = calculateTaxSummary(lines, defaultPerLine);
        expect(result.subtotal).toBe(10000);
        const red = result.taxDetails.find(d => d.rateType === 'reduced');
        expect(red.taxAmount).toBe(800);
        expect(result.total).toBe(10800);
    });

    test('UT-TOTAL-003: 混合税率', () => {
        const lines = [
            { quantity: 1, unitPrice: 300000, taxRateType: 'standard' },
            { quantity: 10, unitPrice: 150, taxRateType: 'reduced' }
        ];
        const result = calculateTaxSummary(lines, defaultPerLine);
        expect(result.subtotal).toBe(301500);
        const std = result.taxDetails.find(d => d.rateType === 'standard');
        const red = result.taxDetails.find(d => d.rateType === 'reduced');
        expect(std.taxAmount).toBe(30000);
        expect(red.taxAmount).toBe(120);
        expect(result.total).toBe(331620);
    });

    test('UT-TOTAL-004: 対象外含む', () => {
        const lines = [
            { quantity: 1, unitPrice: 5000, taxRateType: 'standard' },
            { quantity: 1, unitPrice: 3000, taxRateType: 'exempt' }
        ];
        const result = calculateTaxSummary(lines, defaultPerLine);
        expect(result.subtotal).toBe(8000);
        const std = result.taxDetails.find(d => d.rateType === 'standard');
        expect(std.taxAmount).toBe(500);
        const exempt = result.taxDetails.find(d => d.rateType === 'exempt');
        expect(exempt.taxableAmount).toBe(3000);
        expect(result.total).toBe(8500);
    });

    test('UT-TOTAL-005: 端数あり(行ごと) 3×999', () => {
        const lines = [
            { quantity: 1, unitPrice: 999, taxRateType: 'standard' },
            { quantity: 1, unitPrice: 999, taxRateType: 'standard' },
            { quantity: 1, unitPrice: 999, taxRateType: 'standard' }
        ];
        const result = calculateTaxSummary(lines, defaultPerLine);
        expect(result.subtotal).toBe(2997);
        // 999 * 0.1 = 99.9 → floor → 99 × 3 = 297
        expect(result.totalTax).toBe(297);
        expect(result.total).toBe(3294);
    });

    test('UT-TOTAL-006: 空の明細行', () => {
        const result = calculateTaxSummary([], defaultPerLine);
        expect(result.subtotal).toBe(0);
        expect(result.totalTax).toBe(0);
        expect(result.total).toBe(0);
    });

    test('UT-TOTAL-007: 端数あり(合計) 3×999', () => {
        const lines = [
            { quantity: 1, unitPrice: 999, taxRateType: 'standard' },
            { quantity: 1, unitPrice: 999, taxRateType: 'standard' },
            { quantity: 1, unitPrice: 999, taxRateType: 'standard' }
        ];
        const result = calculateTaxSummary(lines, defaultPerTotal);
        expect(result.subtotal).toBe(2997);
        // 2997 * 0.1 = 299.7 → floor → 299
        expect(result.totalTax).toBe(299);
        expect(result.total).toBe(3296);
    });

    test('UT-TOTAL-008: 混合税率(合計)', () => {
        const lines = [
            { quantity: 1, unitPrice: 300000, taxRateType: 'standard' },
            { quantity: 10, unitPrice: 150, taxRateType: 'reduced' }
        ];
        const result = calculateTaxSummary(lines, defaultPerTotal);
        expect(result.subtotal).toBe(301500);
        const std = result.taxDetails.find(d => d.rateType === 'standard');
        const red = result.taxDetails.find(d => d.rateType === 'reduced');
        expect(std.taxAmount).toBe(30000);
        expect(red.taxAmount).toBe(120);
        expect(result.total).toBe(331620);
    });
});

describe('calculateTaxSummary - 追加', () => {
    const defaultSettings = {
        standardRate: 0.1,
        reducedRate: 0.08,
        roundingMethod: 'floor',
        calcMethod: 'per_total'
    };

    test('事前計算されたamountを使用', () => {
        const lines = [
            { quantity: 1, unitPrice: 1000, taxRateType: 'standard', amount: 5000 }
        ];
        const result = calculateTaxSummary(lines, defaultSettings);
        expect(result.subtotal).toBe(5000);
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
});

// ============================================================
// 3-2. 帳票番号 (UT-DN-001〜010)
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

describe('帳票番号生成 (UT-DN)', () => {
    test('UT-DN-001: 請求書初回', () => {
        const result = generateDocNumber('invoice', 0, {}, 2026);
        expect(result.docNumber).toBe('INV-2026-0001');
        expect(result.nextNumber).toBe(1);
    });

    test('UT-DN-002: 請求書2件目', () => {
        const result = generateDocNumber('invoice', 1, {}, 2026);
        expect(result.docNumber).toBe('INV-2026-0002');
        expect(result.nextNumber).toBe(2);
    });

    test('UT-DN-003: 見積書初回', () => {
        const result = generateDocNumber('estimate', 0, {}, 2026);
        expect(result.docNumber).toBe('QT-2026-0001');
    });

    test('UT-DN-004: 発注書', () => {
        const result = generateDocNumber('purchase_order', 0, {}, 2026);
        expect(result.docNumber).toBe('PO-2026-0001');
    });

    test('UT-DN-005: 納品書', () => {
        const result = generateDocNumber('delivery_note', 0, {}, 2026);
        expect(result.docNumber).toBe('DN-2026-0001');
    });

    test('UT-DN-006: 売上伝票', () => {
        const result = generateDocNumber('sales_slip', 0, {}, 2026);
        expect(result.docNumber).toBe('SS-2026-0001');
    });

    test('UT-DN-007: 仕入伝票', () => {
        const result = generateDocNumber('purchase_slip', 0, {}, 2026);
        expect(result.docNumber).toBe('PS-2026-0001');
    });

    test('UT-DN-008: 領収書', () => {
        const result = generateDocNumber('receipt', 0, {}, 2026);
        expect(result.docNumber).toBe('RC-2026-0001');
    });

    test('UT-DN-009: 連番100', () => {
        const result = generateDocNumber('invoice', 99, {}, 2026);
        expect(result.docNumber).toBe('INV-2026-0100');
    });

    test('UT-DN-010: 上限超過', () => {
        // generateDocNumber自体はthrowしないが、9999+1=10000で5桁になる
        const result = generateDocNumber('invoice', 9999, {}, 2026);
        expect(result.docNumber).toBe('INV-2026-10000');
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

    test('デフォルトプレフィックス確認', () => {
        expect(DEFAULT_DOC_PREFIXES.estimate).toBe('QT');
        expect(DEFAULT_DOC_PREFIXES.purchase_order).toBe('PO');
        expect(DEFAULT_DOC_PREFIXES.invoice).toBe('INV');
        expect(DEFAULT_DOC_PREFIXES.delivery_note).toBe('DN');
        expect(DEFAULT_DOC_PREFIXES.sales_slip).toBe('SS');
        expect(DEFAULT_DOC_PREFIXES.purchase_slip).toBe('PS');
        expect(DEFAULT_DOC_PREFIXES.receipt).toBe('RC');
    });
});

// ============================================================
// 3-3. 収入印紙 (UT-ST-001〜018)
// ============================================================
describe('収入印紙税額判定 (UT-ST)', () => {
    test.each([
        ['UT-ST-001', 30000, false, 0],
        ['UT-ST-002', 49999, false, 0],
        ['UT-ST-003', 50000, true, 200],
        ['UT-ST-004', 500000, true, 200],
        ['UT-ST-005', 1000000, true, 200],
        ['UT-ST-006', 1000001, true, 400],
        ['UT-ST-007', 2000000, true, 400],
        ['UT-ST-008', 2000001, true, 600],
        ['UT-ST-009', 3000001, true, 1000],
        ['UT-ST-010', 5000001, true, 2000],
        ['UT-ST-011', 10000001, true, 6000],
        ['UT-ST-012', 30000001, true, 10000],
        ['UT-ST-013', 50000001, true, 20000],
        ['UT-ST-014', 100000001, true, 40000],
        ['UT-ST-015', 200000001, true, 60000],
        ['UT-ST-016', 300000001, true, 100000],
        ['UT-ST-017', 500000001, true, 200000],
        ['UT-ST-018', 0, false, 0],
    ])('%s: 金額=%d → required=%s, amount=%d', (id, amount, expectedRequired, expectedAmount) => {
        expect(isRevenueStampRequired(amount)).toBe(expectedRequired);
        expect(getRevenueStampAmount(amount)).toBe(expectedAmount);
    });
});

// ============================================================
// 3-4a. 取引先コード生成 (UT-PC-001〜006)
// ============================================================
describe('取引先コード生成 (UT-PC)', () => {
    test('UT-PC-001: 取引先なし（初回）', () => {
        expect(generatePartnerCode([])).toBe('P0001');
    });

    test('UT-PC-002: 既存あり', () => {
        expect(generatePartnerCode(['P0001', 'P0002'])).toBe('P0003');
    });

    test('UT-PC-003: 飛び番あり', () => {
        expect(generatePartnerCode(['P0001', 'P0003'])).toBe('P0004');
    });

    test('UT-PC-004: null入力', () => {
        expect(generatePartnerCode(null)).toBe('P0001');
    });

    test('UT-PC-005: 不正コード混在', () => {
        expect(generatePartnerCode(['P0001', 'INVALID', 'P0005'])).toBe('P0006');
    });

    test('UT-PC-006: 上限超過', () => {
        expect(() => generatePartnerCode(['P9999'])).toThrow('取引先コードが上限に達しました');
    });
});

// ============================================================
// 3-4b. 品目コード生成 (UT-IC-001〜004)
// ============================================================
describe('品目コード生成 (UT-IC)', () => {
    test('UT-IC-001: 品目なし（初回）', () => {
        expect(generateItemCode([])).toBe('I0001');
    });

    test('UT-IC-002: 既存あり', () => {
        expect(generateItemCode(['I0001', 'I0002'])).toBe('I0003');
    });

    test('UT-IC-003: null入力', () => {
        expect(generateItemCode(null)).toBe('I0001');
    });

    test('UT-IC-004: 上限超過', () => {
        expect(() => generateItemCode(['I9999'])).toThrow('品目コードが上限に達しました');
    });
});

// ============================================================
// 3-5a. 取引先バリデーション (UT-VP-001〜010)
// ============================================================
describe('取引先バリデーション (UT-VP)', () => {
    test('UT-VP-001: 正常な入力（必須のみ）', () => {
        const result = validatePartner({ name: '株式会社テスト', partnerType: 'customer' });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('UT-VP-002: 取引先名が空', () => {
        const result = validatePartner({ name: '', partnerType: 'customer' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('取引先名は必須です');
    });

    test('UT-VP-003: 取引先名が100文字超', () => {
        const result = validatePartner({ name: 'あ'.repeat(101), partnerType: 'customer' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('取引先名は100文字以内にしてください');
    });

    test('UT-VP-004: 取引先区分が不正', () => {
        const result = validatePartner({ name: 'テスト', partnerType: 'invalid' });
        expect(result.valid).toBe(false);
    });

    test('UT-VP-005: ふりがなにカタカナ', () => {
        const result = validatePartner({ name: 'テスト', partnerType: 'customer', nameKana: 'テスト' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('ふりがなはひらがなで入力してください');
    });

    test('UT-VP-006: ふりがなにひらがな', () => {
        const result = validatePartner({ name: 'テスト', partnerType: 'customer', nameKana: 'てすと' });
        expect(result.valid).toBe(true);
    });

    test('UT-VP-007: 電話番号不正', () => {
        const result = validatePartner({ name: 'テスト', partnerType: 'customer', phone: 'abc' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('電話番号の形式が正しくありません');
    });

    test('UT-VP-008: 登録番号正常', () => {
        const result = validatePartner({ name: 'テスト', partnerType: 'customer', invoiceRegNumber: 'T1234567890123' });
        expect(result.valid).toBe(true);
    });

    test('UT-VP-009: 登録番号不正（桁数不足）', () => {
        const result = validatePartner({ name: 'テスト', partnerType: 'customer', invoiceRegNumber: 'T123' });
        expect(result.valid).toBe(false);
    });

    test('UT-VP-010: 登録番号不正（Tなし）', () => {
        const result = validatePartner({ name: 'テスト', partnerType: 'customer', invoiceRegNumber: '1234567890123' });
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
});

// ============================================================
// 3-5b. 品目バリデーション (UT-VI-001〜005)
// ============================================================
describe('品目バリデーション (UT-VI)', () => {
    test('UT-VI-001: 正常な入力', () => {
        const result = validateItem({ name: 'テスト品目', taxRateType: 'standard' });
        expect(result.valid).toBe(true);
    });

    test('UT-VI-002: 品目名が空', () => {
        const result = validateItem({ name: '', taxRateType: 'standard' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('品目名は必須です');
    });

    test('UT-VI-003: 税区分が不正', () => {
        const result = validateItem({ name: 'テスト', taxRateType: 'invalid' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('税区分が不正です');
    });

    test('UT-VI-004: デフォルト単価が負', () => {
        const result = validateItem({ name: 'テスト', taxRateType: 'standard', defaultPrice: -1 });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('デフォルト単価は0以上にしてください');
    });

    test('UT-VI-005: デフォルト単価が小数', () => {
        const result = validateItem({ name: 'テスト', taxRateType: 'standard', defaultPrice: 100.5 });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('デフォルト単価は整数にしてください');
    });
});

// ============================================================
// 3-5c. インボイス登録番号バリデーション (UT-INV-001〜008)
// ============================================================
describe('インボイス登録番号バリデーション (UT-INV)', () => {
    test('UT-INV-001: 正常な番号', () => {
        expect(validateInvoiceRegNumber('T1234567890123').valid).toBe(true);
    });

    test('UT-INV-002: 空文字（任意）', () => {
        expect(validateInvoiceRegNumber('').valid).toBe(true);
    });

    test('UT-INV-003: null（任意）', () => {
        expect(validateInvoiceRegNumber(null).valid).toBe(true);
    });

    test('UT-INV-004: Tなし', () => {
        expect(validateInvoiceRegNumber('1234567890123').valid).toBe(false);
    });

    test('UT-INV-005: 桁数不足', () => {
        expect(validateInvoiceRegNumber('T123456789012').valid).toBe(false);
    });

    test('UT-INV-006: 桁数超過', () => {
        expect(validateInvoiceRegNumber('T12345678901234').valid).toBe(false);
    });

    test('UT-INV-007: 英字混入', () => {
        expect(validateInvoiceRegNumber('T123456789012A').valid).toBe(false);
    });

    test('UT-INV-008: 小文字t', () => {
        expect(validateInvoiceRegNumber('t1234567890123').valid).toBe(false);
    });
});

// ============================================================
// 3-5d. 帳票バリデーション (UT-VD-001〜006)
// ============================================================
describe('帳票バリデーション (UT-VD)', () => {
    const baseDoc = {
        docType: 'estimate',
        issueDate: '2026-03-03',
        partnerId: 'p1',
        lineItems: [{ name: 'テスト品目', quantity: 1, unitPrice: 1000 }],
        validUntil: '2026-04-03'
    };

    test('UT-VD-001: 正常な入力', () => {
        expect(validateDocument(baseDoc).valid).toBe(true);
    });

    test('UT-VD-002: 取引先未選択でも保存可能', () => {
        expect(validateDocument({ ...baseDoc, partnerId: '', partnerSnapshot: null }).valid).toBe(true);
    });

    test('UT-VD-003: 発行日未入力でも保存可能', () => {
        expect(validateDocument({ ...baseDoc, issueDate: '' }).valid).toBe(true);
    });

    test('UT-VD-004: 明細行が空', () => {
        const result = validateDocument({ ...baseDoc, lineItems: [] });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('明細を1行以上入力してください');
    });

    test('UT-VD-005: ステータスが不正', () => {
        const result = validateDocument({ ...baseDoc, status: 'invalid' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('ステータスが不正です');
    });

    test('UT-VD-006: 備考が2000文字超', () => {
        const result = validateDocument({ ...baseDoc, memo: 'あ'.repeat(2001) });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('備考は2000文字以内にしてください');
    });

    test('帳票種別なし', () => {
        expect(validateDocument({ ...baseDoc, docType: '' }).valid).toBe(false);
    });

    test('明細なし（領収書はOK）', () => {
        const receiptDoc = { ...baseDoc, docType: 'receipt', lineItems: [], receiptOf: 'お食事代' };
        expect(validateDocument(receiptDoc).valid).toBe(true);
    });

    test('見積書の有効期限なしでも保存可能', () => {
        expect(validateDocument({ ...baseDoc, validUntil: '' }).valid).toBe(true);
    });

    test('請求書の支払期限なしでも保存可能', () => {
        const invoiceDoc = { ...baseDoc, docType: 'invoice', dueDate: '' };
        expect(validateDocument(invoiceDoc).valid).toBe(true);
    });

    test('領収書の但し書きなしでも保存可能', () => {
        const receiptDoc = { ...baseDoc, docType: 'receipt', receiptOf: '' };
        expect(validateDocument(receiptDoc).valid).toBe(true);
    });
});

// ============================================================
// 3-5e. 明細行バリデーション (UT-VL-001〜007)
// ============================================================
describe('明細行バリデーション (UT-VL)', () => {
    const baseDoc = {
        docType: 'invoice',
        issueDate: '2026-03-03',
        partnerId: 'p1',
        dueDate: '2026-04-03',
        lineItems: []
    };

    test('UT-VL-001: 正常な入力', () => {
        const doc = { ...baseDoc, lineItems: [{ name: 'テスト', quantity: 1, unitPrice: 1000, taxRateType: 'standard' }] };
        expect(validateDocument(doc).valid).toBe(true);
    });

    test('UT-VL-002: 品目名が空', () => {
        const doc = { ...baseDoc, lineItems: [{ name: '', quantity: 1, unitPrice: 1000 }] };
        expect(validateDocument(doc).valid).toBe(false);
    });

    test('UT-VL-003: 数量が0以下', () => {
        const doc = { ...baseDoc, lineItems: [{ name: 'テスト', quantity: 0, unitPrice: 1000 }] };
        expect(validateDocument(doc).valid).toBe(false);
    });

    test('UT-VL-004: 数量が小数第3位', () => {
        const doc = { ...baseDoc, lineItems: [{ name: 'テスト', quantity: 1.001, unitPrice: 1000 }] };
        const result = validateDocument(doc);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('小数点以下は2桁まで'))).toBe(true);
    });

    test('UT-VL-005: 数量が小数第2位', () => {
        const doc = { ...baseDoc, lineItems: [{ name: 'テスト', quantity: 1.01, unitPrice: 1000 }] };
        expect(validateDocument(doc).valid).toBe(true);
    });

    test('UT-VL-006: 単価が負', () => {
        const doc = { ...baseDoc, lineItems: [{ name: 'テスト', quantity: 1, unitPrice: -1 }] };
        expect(validateDocument(doc).valid).toBe(false);
    });

    test('UT-VL-007: 税区分が不正', () => {
        const doc = { ...baseDoc, lineItems: [{ name: 'テスト', quantity: 1, unitPrice: 1000, taxRateType: 'invalid' }] };
        const result = validateDocument(doc);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('税区分が不正です'))).toBe(true);
    });
});

// ============================================================
// 3-5f. インポートデータバリデーション (UT-IMP-001〜006)
// ============================================================
describe('インポートデータバリデーション (UT-IMP)', () => {
    test('UT-IMP-001: 正常なデータ', () => {
        const data = {
            appName: 'pado',
            partners: [{ id: '1', name: 'テスト' }],
            items: [{ id: '1', name: '品目' }],
            documents: [{ id: '1' }],
            settings: { tax: {} }
        };
        const result = validateImportData(data);
        expect(result.valid).toBe(true);
        expect(result.counts.partners).toBe(1);
    });

    test('UT-IMP-002: appName不一致', () => {
        const data = { appName: 'other', partners: [], items: [], documents: [] };
        const result = validateImportData(data);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('pado形式ではありません');
    });

    test('UT-IMP-003: null入力', () => {
        expect(validateImportData(null).valid).toBe(false);
    });

    test('UT-IMP-004: partnersが配列でない', () => {
        const data = { appName: 'pado', partners: 'not-array', items: [], documents: [] };
        expect(validateImportData(data).valid).toBe(false);
    });

    test('UT-IMP-005: itemsが配列でない', () => {
        const data = { appName: 'pado', partners: [], items: 'not-array', documents: [] };
        expect(validateImportData(data).valid).toBe(false);
    });

    test('UT-IMP-006: documentsが配列でない', () => {
        const data = { appName: 'pado', partners: [], items: [], documents: 'not-array' };
        expect(validateImportData(data).valid).toBe(false);
    });

    test('不正な取引先データ', () => {
        const data = { partners: [{ name: 'テスト' }] };
        expect(validateImportData(data).valid).toBe(false);
    });
});

// ============================================================
// 3-6a. 和暦変換 (UT-JE-001〜007)
// ============================================================
describe('和暦変換 (UT-JE)', () => {
    test('UT-JE-001: 令和通常', () => {
        expect(formatDateJapanese('2026-03-01')).toBe('令和8年3月1日');
    });

    test('UT-JE-002: 令和元年', () => {
        expect(formatDateJapanese('2019-05-01')).toBe('令和元年5月1日');
    });

    test('UT-JE-003: 平成最終日', () => {
        expect(formatDateJapanese('2019-04-30')).toBe('平成31年4月30日');
    });

    test('UT-JE-004: 平成元年', () => {
        expect(formatDateJapanese('1989-01-08')).toBe('平成元年1月8日');
    });

    test('UT-JE-005: 昭和最終日', () => {
        expect(formatDateJapanese('1989-01-07')).toBe('昭和64年1月7日');
    });

    test('UT-JE-006: 不正な入力', () => {
        expect(formatDateJapanese('invalid')).toBe('invalid');
    });

    test('UT-JE-007: 空文字', () => {
        expect(formatDateJapanese('')).toBe('');
    });
});

// ============================================================
// 3-6b. 日付ユーティリティ (UT-DT-001〜008)
// ============================================================
describe('日付ユーティリティ (UT-DT)', () => {
    test('UT-DT-001: 月末(31日月)', () => {
        expect(endOfMonth('2026-01-15')).toBe('2026-01-31');
    });

    test('UT-DT-002: 月末(30日月)', () => {
        expect(endOfMonth('2026-04-15')).toBe('2026-04-30');
    });

    test('UT-DT-003: 月末(2月・平年)', () => {
        expect(endOfMonth('2026-02-15')).toBe('2026-02-28');
    });

    test('UT-DT-004: 月末(2月・閏年)', () => {
        expect(endOfMonth('2028-02-15')).toBe('2028-02-29');
    });

    test('UT-DT-005: 日付加算', () => {
        expect(addDays('2026-03-01', 30)).toBe('2026-03-31');
    });

    test('UT-DT-006: 日付加算(月跨ぎ)', () => {
        expect(addDays('2026-03-25', 10)).toBe('2026-04-04');
    });

    test('UT-DT-007: 日付フォーマット', () => {
        expect(formatDate('2026-03-01')).toBe('2026/03/01');
    });

    test('UT-DT-008: 不正日付', () => {
        expect(formatDate('invalid')).toBe('---');
    });
});

// ============================================================
// 3-6c. HTMLエスケープ (UT-ESC-001〜007)
// ============================================================
describe('HTMLエスケープ (UT-ESC)', () => {
    test('UT-ESC-001: 通常文字', () => {
        expect(escapeHtml('テスト')).toBe('テスト');
    });

    test('UT-ESC-002: &エスケープ', () => {
        expect(escapeHtml('A&B')).toBe('A&amp;B');
    });

    test('UT-ESC-003: <エスケープ', () => {
        expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    test('UT-ESC-004: "エスケープ', () => {
        expect(escapeHtml('"test"')).toBe('&quot;test&quot;');
    });

    test('UT-ESC-005: null入力', () => {
        expect(escapeHtml(null)).toBe('');
    });

    test('UT-ESC-006: undefined入力', () => {
        expect(escapeHtml(undefined)).toBe('');
    });

    test('UT-ESC-007: 数値入力', () => {
        expect(escapeHtml(123)).toBe('123');
    });

    test('シングルクォート', () => {
        expect(escapeHtml("it's")).toBe("it&#39;s");
    });

    test('空文字列', () => {
        expect(escapeHtml('')).toBe('');
    });
});

// ============================================================
// 3-6d. 金額フォーマット (UT-FC-001〜004)
// ============================================================
describe('金額フォーマット (UT-FC)', () => {
    test('UT-FC-001: 通常金額(¥付き)', () => {
        expect(formatYen(1234567)).toBe('¥1,234,567');
    });

    test('UT-FC-002: 0円(¥付き)', () => {
        expect(formatYen(0)).toBe('¥0');
    });

    test('UT-FC-003: 3桁以下(¥付き)', () => {
        expect(formatYen(999)).toBe('¥999');
    });

    test('UT-FC-004: 大きな金額(¥付き)', () => {
        expect(formatYen(100000000)).toBe('¥100,000,000');
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

// ============================================================
// 3-7. 帳票変換 (UT-CV-001〜007)
// ============================================================
describe('帳票変換可否判定 (UT-CV)', () => {
    test('UT-CV-001: 見積書の変換先', () => {
        expect(CONVERSION_RULES.estimate).toEqual(['invoice', 'purchase_order', 'delivery_note']);
    });

    test('UT-CV-002: 発注書の変換先', () => {
        expect(CONVERSION_RULES.purchase_order).toEqual(['purchase_slip', 'delivery_note']);
    });

    test('UT-CV-003: 請求書の変換先', () => {
        expect(CONVERSION_RULES.invoice).toEqual(['receipt', 'sales_slip']);
    });

    test('UT-CV-004: 納品書の変換先', () => {
        expect(CONVERSION_RULES.delivery_note).toEqual(['invoice', 'sales_slip']);
    });

    test('UT-CV-005: 売上伝票の変換先', () => {
        expect(CONVERSION_RULES.sales_slip).toEqual(['invoice', 'receipt']);
    });

    test('UT-CV-006: 仕入伝票の変換先', () => {
        expect(CONVERSION_RULES.purchase_slip).toEqual([]);
    });

    test('UT-CV-007: 領収書の変換先', () => {
        expect(CONVERSION_RULES.receipt).toEqual([]);
    });
});

describe('DOC_TYPE_LABELS', () => {
    test('7種帳票の日本語ラベル', () => {
        expect(Object.keys(DOC_TYPE_LABELS)).toHaveLength(7);
        expect(DOC_TYPE_LABELS.estimate).toBe('見積書');
        expect(DOC_TYPE_LABELS.receipt).toBe('領収書');
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
        expect(result.revenueStampRequired).toBe(false);
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

// ============================================================
// サンプルデータ整合性検証
// ============================================================
describe('サンプルデータ整合性', () => {
    const sampleData = require('./sample_data.json');
    const documents = sampleData.documents || [];
    const partners = sampleData.partners || [];
    const items = sampleData.items || [];
    const partnerIds = new Set(partners.map(p => p.id));

    test('全ドキュメントのsellerSnapshotが「サンプル事業者」であること', () => {
        documents.forEach(doc => {
            if (doc.sellerSnapshot) {
                expect(doc.sellerSnapshot.companyName).toBe('サンプル事業者');
            }
        });
    });

    test('receiptOfに「として」が含まれないこと', () => {
        documents.forEach(doc => {
            if (doc.receiptOf) {
                expect(doc.receiptOf).not.toMatch(/として/);
            }
        });
    });

    test('partnerIdが設定されている場合、partners配列に存在すること', () => {
        documents.forEach(doc => {
            if (doc.partnerId) {
                expect(partnerIds.has(doc.partnerId)).toBe(true);
            }
        });
    });

    test('領収書のtaxSummary.totalが計算結果と一致すること', () => {
        documents.filter(d => d.docType === 'receipt').forEach(doc => {
            const summary = doc.taxSummary;
            if (summary) {
                expect(summary.total).toBe(summary.subtotal + summary.totalTax);
            }
        });
    });

    test('partnerCodeの一意性', () => {
        const codes = partners.map(p => p.partnerCode);
        expect(new Set(codes).size).toBe(codes.length);
    });

    test('itemCodeの一意性', () => {
        const codes = items.map(i => i.itemCode);
        expect(new Set(codes).size).toBe(codes.length);
    });

    test('領収書にrevenueStampRequired/revenueStampAmountが設定されていること', () => {
        documents.filter(d => d.docType === 'receipt').forEach(doc => {
            expect(doc).toHaveProperty('revenueStampRequired');
            expect(doc).toHaveProperty('revenueStampAmount');
        });
    });

    test('docNumberの形式が帳票種別に応じたプレフィックスであること', () => {
        documents.forEach(doc => {
            const prefix = DEFAULT_DOC_PREFIXES[doc.docType];
            if (prefix && doc.docNumber) {
                expect(doc.docNumber.startsWith(prefix + '-')).toBe(true);
            }
        });
    });
});
