/**
 * pado.calc.js - Pado 帳票管理アプリ 計算・ロジックモジュール
 *
 * すべて純粋関数。DOM操作・IndexedDB操作禁止。
 * Node.js (Jest) でもブラウザでも動作する。
 */

// ============================================================
// 3-1. 税額計算
// ============================================================

/**
 * 明細行の金額を計算する
 * @param {number} quantity - 数量
 * @param {number} unitPrice - 単価
 * @returns {number} 金額（整数）
 */
function calcLineAmount(quantity, unitPrice) {
    return Math.floor(quantity * unitPrice);
}

/**
 * 端数処理を適用する
 * @param {number} value - 対象の数値
 * @param {string} method - 'floor' | 'round' | 'ceil'
 * @returns {number} 端数処理後の整数
 */
function applyRounding(value, method) {
    switch (method) {
        case 'ceil': return Math.ceil(value);
        case 'round': return Math.round(value);
        case 'floor':
        default: return Math.floor(value);
    }
}

/**
 * 税率別消費税サマリーを計算する
 * @param {Array} lineItems - 明細行配列 [{quantity, unitPrice, taxRateType, amount?}]
 * @param {Object} taxSettings - {standardRate: 0.1, reducedRate: 0.08, roundingMethod: 'floor', calcMethod: 'per_line'|'per_total'}
 * @returns {Object} {subtotal, taxDetails: [{rateType, rate, taxableAmount, taxAmount}], totalTax, total}
 */
function calculateTaxSummary(lineItems, taxSettings) {
    const standardRate = taxSettings.standardRate || 0.1;
    const reducedRate = taxSettings.reducedRate || 0.08;
    const roundingMethod = taxSettings.roundingMethod || 'floor';
    const calcMethod = taxSettings.calcMethod || 'per_line';

    const buckets = { standard: 0, reduced: 0, exempt: 0 };

    const processedLines = lineItems.map(line => {
        const amount = line.amount != null ? line.amount : calcLineAmount(line.quantity, line.unitPrice);
        const rateType = line.taxRateType || 'standard';
        buckets[rateType] = (buckets[rateType] || 0) + amount;
        return { ...line, amount, taxRateType: rateType };
    });

    const subtotal = buckets.standard + buckets.reduced + buckets.exempt;
    const taxDetails = [];

    if (calcMethod === 'per_line') {
        let totalStdTax = 0;
        let totalRedTax = 0;
        processedLines.forEach(line => {
            if (line.taxRateType === 'standard') {
                totalStdTax += applyRounding(line.amount * standardRate, roundingMethod);
            } else if (line.taxRateType === 'reduced') {
                totalRedTax += applyRounding(line.amount * reducedRate, roundingMethod);
            }
        });
        if (buckets.standard > 0) {
            taxDetails.push({ rateType: 'standard', rate: standardRate, taxableAmount: buckets.standard, taxAmount: totalStdTax });
        }
        if (buckets.reduced > 0) {
            taxDetails.push({ rateType: 'reduced', rate: reducedRate, taxableAmount: buckets.reduced, taxAmount: totalRedTax });
        }
    } else {
        // per_total: 税率別合計に対して一括計算
        if (buckets.standard > 0) {
            const taxAmount = applyRounding(buckets.standard * standardRate, roundingMethod);
            taxDetails.push({ rateType: 'standard', rate: standardRate, taxableAmount: buckets.standard, taxAmount });
        }
        if (buckets.reduced > 0) {
            const taxAmount = applyRounding(buckets.reduced * reducedRate, roundingMethod);
            taxDetails.push({ rateType: 'reduced', rate: reducedRate, taxableAmount: buckets.reduced, taxAmount });
        }
    }

    if (buckets.exempt > 0) {
        taxDetails.push({ rateType: 'exempt', rate: 0, taxableAmount: buckets.exempt, taxAmount: 0 });
    }

    const totalTax = taxDetails.reduce((sum, d) => sum + d.taxAmount, 0);
    const total = subtotal + totalTax;

    return { subtotal, taxDetails, totalTax, total };
}

// ============================================================
// 3-2. 帳票番号
// ============================================================

/** 帳票種別のデフォルトプレフィックス */
const DEFAULT_DOC_PREFIXES = {
    estimate: 'QT',
    purchase_order: 'PO',
    invoice: 'INV',
    delivery_note: 'DN',
    sales_slip: 'SS',
    purchase_slip: 'PS',
    receipt: 'RC'
};

/**
 * 決算期に基づく年度を取得する
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {number} startMonth - 決算期開始月（1-12）
 * @returns {number} 年度
 */
function getFiscalYear(dateStr, startMonth) {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    if (startMonth === 1) return year;
    return month >= startMonth ? year : year - 1;
}

/**
 * 帳票番号を生成する
 * @param {string} docType - 帳票種別
 * @param {number} lastNumber - 現在の最終番号
 * @param {Object} format - {prefix, separator, includeYear, digits}
 * @param {number} fiscalYear - 年度
 * @returns {Object} {docNumber, nextNumber}
 */
function generateDocNumber(docType, lastNumber, format, fiscalYear) {
    const prefix = (format && format.prefix) || DEFAULT_DOC_PREFIXES[docType] || 'DOC';
    const sep = (format && format.separator) || '-';
    const includeYear = format ? format.includeYear !== false : true;
    const digits = (format && format.digits) || 4;

    const nextNumber = (lastNumber || 0) + 1;
    const numPart = String(nextNumber).padStart(digits, '0');

    let docNumber;
    if (includeYear) {
        docNumber = `${prefix}${sep}${fiscalYear}${sep}${numPart}`;
    } else {
        docNumber = `${prefix}${sep}${numPart}`;
    }

    return { docNumber, nextNumber };
}

/**
 * 取引先コードを生成する
 * @param {Array<string>} existingCodes - 既存のコード配列
 * @returns {string} 新しいコード (P0001〜)
 */
function generatePartnerCode(existingCodes) {
    let max = 0;
    (existingCodes || []).forEach(code => {
        const m = code.match(/^P(\d+)$/);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n > max) max = n;
        }
    });
    if (max >= 9999) {
        throw new Error('取引先コードが上限に達しました');
    }
    return 'P' + String(max + 1).padStart(4, '0');
}

/**
 * 品目コードを生成する
 * @param {Array<string>} existingCodes - 既存のコード配列
 * @returns {string} 新しいコード (I0001〜)
 */
function generateItemCode(existingCodes) {
    let max = 0;
    (existingCodes || []).forEach(code => {
        const m = code.match(/^I(\d+)$/);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n > max) max = n;
        }
    });
    if (max >= 9999) {
        throw new Error('品目コードが上限に達しました');
    }
    return 'I' + String(max + 1).padStart(4, '0');
}

// ============================================================
// 3-3. 収入印紙
// ============================================================

/** 印紙税額テーブル（税抜金額ベース、上限値と税額のペア） */
const REVENUE_STAMP_TABLE = [
    { threshold: 49999, amount: 0 },
    { threshold: 1000000, amount: 200 },
    { threshold: 2000000, amount: 400 },
    { threshold: 3000000, amount: 600 },
    { threshold: 5000000, amount: 1000 },
    { threshold: 10000000, amount: 2000 },
    { threshold: 30000000, amount: 6000 },
    { threshold: 50000000, amount: 10000 },
    { threshold: 100000000, amount: 20000 },
    { threshold: 200000000, amount: 40000 },
    { threshold: 300000000, amount: 60000 },
    { threshold: 500000000, amount: 100000 },
    { threshold: Infinity, amount: 200000 }
];

/**
 * 収入印紙が必要かどうかを判定する
 * @param {number} taxExclusiveAmount - 税抜金額
 * @returns {boolean}
 */
function isRevenueStampRequired(taxExclusiveAmount) {
    return taxExclusiveAmount >= 50000;
}

/**
 * 必要な収入印紙税額を取得する
 * @param {number} taxExclusiveAmount - 税抜金額
 * @returns {number} 印紙税額（0 = 不要）
 */
function getRevenueStampAmount(taxExclusiveAmount) {
    if (taxExclusiveAmount < 50000) return 0;
    for (const row of REVENUE_STAMP_TABLE) {
        if (taxExclusiveAmount <= row.threshold) {
            return row.amount;
        }
    }
    return 200000;
}

// ============================================================
// 3-4. バリデーション
// ============================================================

/**
 * 品目入力を検証する
 * @param {Object} item
 * @returns {Object} {valid: boolean, errors: string[]}
 */
function validateItem(item) {
    const errors = [];
    if (!item.name || !item.name.trim()) {
        errors.push('品目名は必須です');
    }
    const validRates = ['standard', 'reduced', 'exempt'];
    if (!item.taxRateType || !validRates.includes(item.taxRateType)) {
        errors.push('税区分が不正です');
    }
    if (item.defaultPrice != null) {
        if (item.defaultPrice < 0) errors.push('デフォルト単価は0以上にしてください');
        if (!Number.isInteger(item.defaultPrice)) errors.push('デフォルト単価は整数にしてください');
    }
    return { valid: errors.length === 0, errors };
}

/**
 * 取引先入力を検証する
 * @param {Object} partner
 * @returns {Object} {valid: boolean, errors: string[]}
 */
function validatePartner(partner) {
    const errors = [];
    if (!partner.name || !partner.name.trim()) {
        errors.push('取引先名は必須です');
    }
    if (partner.name && partner.name.length > 100) {
        errors.push('取引先名は100文字以内にしてください');
    }
    if (!partner.partnerType || !['customer', 'supplier', 'both'].includes(partner.partnerType)) {
        errors.push('取引先区分（得意先/仕入先/両方）を選択してください');
    }
    if (partner.nameKana && !/^[ぁ-んー\s]+$/.test(partner.nameKana)) {
        errors.push('ふりがなはひらがなで入力してください');
    }
    if (partner.phone && !/^[\d-]{7,15}$/.test(partner.phone)) {
        errors.push('電話番号の形式が正しくありません');
    }
    if (partner.invoiceRegNumber && !validateInvoiceRegNumber(partner.invoiceRegNumber).valid) {
        errors.push('適格請求書発行事業者登録番号の形式が正しくありません（T+13桁の数字）');
    }
    if (partner.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partner.email)) {
        errors.push('メールアドレスの形式が正しくありません');
    }
    if (partner.zipCode && !/^\d{3}-?\d{4}$/.test(partner.zipCode)) {
        errors.push('郵便番号の形式が正しくありません（例: 123-4567）');
    }
    return { valid: errors.length === 0, errors };
}

/**
 * インボイス登録番号を検証する
 * @param {string} regNumber - T+13桁
 * @returns {Object} {valid: boolean, errors: string[]}
 */
function validateInvoiceRegNumber(regNumber) {
    const errors = [];
    if (!regNumber) {
        return { valid: true, errors }; // 任意項目
    }
    if (!/^T\d{13}$/.test(regNumber)) {
        errors.push('登録番号はT+13桁の数字で入力してください（例: T1234567890123）');
    }
    return { valid: errors.length === 0, errors };
}

/**
 * 帳票入力を検証する
 * @param {Object} doc
 * @returns {Object} {valid: boolean, errors: string[]}
 */
function validateDocument(doc) {
    const errors = [];
    const validTypes = ['estimate', 'purchase_order', 'invoice', 'delivery_note', 'sales_slip', 'purchase_slip', 'receipt'];

    if (!doc.docType || !validTypes.includes(doc.docType)) {
        errors.push('帳票種別が不正です');
    }
    if (!doc.issueDate) {
        errors.push('発行日は必須です');
    }
    if (doc.status) {
        const validStatuses = ['draft', 'issued', 'sent', 'paid', 'cancelled'];
        if (!validStatuses.includes(doc.status)) {
            errors.push('ステータスが不正です');
        }
    }
    if (doc.memo && doc.memo.length > 2000) {
        errors.push('備考は2000文字以内にしてください');
    }
    if (!doc.partnerId && !doc.partnerSnapshot) {
        errors.push('取引先を選択してください');
    }
    if (!doc.lineItems || doc.lineItems.length === 0) {
        if (doc.docType !== 'receipt') {
            errors.push('明細を1行以上入力してください');
        }
    }
    if (doc.lineItems) {
        const validTaxRateTypes = ['standard', 'reduced', 'exempt'];
        doc.lineItems.forEach((line, i) => {
            if (!line.name || !line.name.trim()) {
                errors.push(`明細${i + 1}行目: 品目名は必須です`);
            }
            if (line.quantity == null || line.quantity <= 0) {
                errors.push(`明細${i + 1}行目: 数量は0より大きい値を入力してください`);
            }
            if (line.quantity != null) {
                const qtyStr = String(line.quantity);
                const dotIndex = qtyStr.indexOf('.');
                if (dotIndex !== -1 && qtyStr.length - dotIndex - 1 > 2) {
                    errors.push(`明細${i + 1}行目: 数量の小数点以下は2桁までです`);
                }
            }
            if (line.unitPrice == null || line.unitPrice < 0) {
                errors.push(`明細${i + 1}行目: 単価は0以上の値を入力してください`);
            }
            if (line.taxRateType && !validTaxRateTypes.includes(line.taxRateType)) {
                errors.push(`明細${i + 1}行目: 税区分が不正です`);
            }
        });
    }
    // 種別固有チェック
    if (doc.docType === 'estimate' && !doc.validUntil) {
        errors.push('見積有効期限を入力してください');
    }
    if (doc.docType === 'invoice' && !doc.dueDate) {
        errors.push('支払期限を入力してください');
    }
    if (doc.docType === 'receipt' && !doc.receiptOf) {
        errors.push('但し書きを入力してください');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * インポートデータを検証する
 * @param {Object} data - インポート対象データ
 * @returns {Object} {valid: boolean, errors: string[], counts: {partners, items, documents, settings}}
 */
function validateImportData(data) {
    const errors = [];
    const counts = { partners: 0, items: 0, documents: 0, settings: 0 };

    if (!data || typeof data !== 'object') {
        errors.push('データ形式が不正です');
        return { valid: false, errors, counts };
    }

    if (data.appName && data.appName !== 'pado') {
        errors.push('pado形式ではありません');
        return { valid: false, errors, counts };
    }

    if (data.partners) {
        if (!Array.isArray(data.partners)) {
            errors.push('取引先データの形式が不正です');
        } else {
            counts.partners = data.partners.length;
            data.partners.forEach((p, i) => {
                if (!p.id) errors.push(`取引先データ${i + 1}: IDが不正です`);
                if (!p.name) errors.push(`取引先データ${i + 1}: 名前が不正です`);
            });
        }
    }
    if (data.items) {
        if (!Array.isArray(data.items)) {
            errors.push('品目データの形式が不正です');
        } else {
            counts.items = data.items.length;
            data.items.forEach((item, i) => {
                if (!item.id) errors.push(`品目データ${i + 1}: IDが不正です`);
                if (!item.name) errors.push(`品目データ${i + 1}: 名前が不正です`);
            });
        }
    }
    if (data.documents) {
        if (!Array.isArray(data.documents)) {
            errors.push('帳票データの形式が不正です');
        } else {
            counts.documents = data.documents.length;
        }
    }
    if (data.settings) {
        counts.settings = Object.keys(data.settings).length;
    }

    return { valid: errors.length === 0, errors, counts };
}

// ============================================================
// 3-5. フォーマット
// ============================================================

/** 和暦テーブル */
const ERA_TABLE = [
    { name: '令和', start: new Date('2019-05-01') },
    { name: '平成', start: new Date('1989-01-08') },
    { name: '昭和', start: new Date('1926-12-25') },
    { name: '大正', start: new Date('1912-07-30') },
    { name: '明治', start: new Date('1868-01-25') }
];

/**
 * 日付を和暦に変換する
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @returns {string} '令和X年M月D日'
 */
function formatDateJapanese(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    for (const era of ERA_TABLE) {
        if (d >= era.start) {
            const year = d.getFullYear() - era.start.getFullYear() + 1;
            const yearStr = year === 1 ? '元' : String(year);
            return `${era.name}${yearStr}年${d.getMonth() + 1}月${d.getDate()}日`;
        }
    }
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 金額を通貨書式にフォーマットする（3桁カンマ区切り）
 * @param {number} amount
 * @returns {string} '1,234,567'
 */
function formatCurrency(amount) {
    if (amount == null || isNaN(amount)) return '0';
    return Math.floor(amount).toLocaleString('ja-JP');
}

/**
 * 金額を円表記にフォーマットする
 * @param {number} amount
 * @returns {string} '¥1,234,567'
 */
function formatYen(amount) {
    return '¥' + formatCurrency(amount);
}

/**
 * 日付を YYYY/MM/DD 形式にフォーマットする
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @returns {string} 'YYYY/MM/DD' or '---'
 */
function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '---';
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 月末日を返す
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @returns {string} 'YYYY-MM-DD' or '---'
 */
function endOfMonth(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '---';
    const y = d.getFullYear(), m = d.getMonth();
    const last = new Date(y, m + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

/**
 * 日付に日数を加算する
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {number} days - 加算日数
 * @returns {string} 'YYYY-MM-DD' or '---'
 */
function addDays(dateStr, days) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '---';
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * HTMLエスケープ
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================
// 3-6. 帳票変換
// ============================================================

/** 帳票種別の日本語名 */
const DOC_TYPE_LABELS = {
    estimate: '見積書',
    purchase_order: '発注書',
    invoice: '請求書',
    delivery_note: '納品書',
    sales_slip: '売上伝票',
    purchase_slip: '仕入伝票',
    receipt: '領収書'
};

/** 変換可能な組み合わせ */
const CONVERSION_RULES = {
    estimate: ['invoice', 'purchase_order', 'delivery_note'],
    purchase_order: ['purchase_slip', 'delivery_note'],
    invoice: ['receipt', 'sales_slip'],
    delivery_note: ['invoice', 'sales_slip'],
    sales_slip: ['invoice', 'receipt'],
    purchase_slip: [],
    receipt: []
};

/**
 * 帳票間のデータを引き継いで新帳票を作成する
 * @param {Object} sourceDoc - 変換元帳票
 * @param {string} targetDocType - 変換先の帳票種別
 * @param {Object} companyInfo - 自社情報
 * @param {Object} taxSettings - 税設定
 * @returns {Object} 変換後の帳票データ（未保存）
 */
function buildConvertedDocument(sourceDoc, targetDocType, companyInfo, taxSettings) {
    const now = new Date().toISOString().slice(0, 10);
    const converted = {
        docType: targetDocType,
        docNumber: '', // 保存時に採番
        status: 'draft',
        issueDate: now,
        partnerId: sourceDoc.partnerId,
        partnerSnapshot: sourceDoc.partnerSnapshot ? { ...sourceDoc.partnerSnapshot } : null,
        lineItems: sourceDoc.lineItems ? sourceDoc.lineItems.map(line => ({
            ...line,
            id: crypto.randomUUID ? crypto.randomUUID() : 'li_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
        })) : [],
        notes: sourceDoc.notes || '',
        internalMemo: '',
        sourceDocId: sourceDoc.id,
        sourceDocType: sourceDoc.docType,
        sourceDocNumber: sourceDoc.docNumber,
        sellerSnapshot: companyInfo ? {
            companyName: companyInfo.companyName,
            invoiceRegNumber: companyInfo.invoiceRegNumber,
            zipCode: companyInfo.zipCode,
            address: companyInfo.address,
            phone: companyInfo.phone,
            bankInfo: companyInfo.bankInfo
        } : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    // 種別固有フィールドの設定
    if (targetDocType === 'invoice') {
        converted.dueDate = sourceDoc.dueDate || '';
        converted.paymentTerms = sourceDoc.paymentTerms || '';
    } else if (targetDocType === 'receipt') {
        // 領収書の場合、金額情報を但し書きに変換
        const summary = sourceDoc.taxSummary || calculateTaxSummary(sourceDoc.lineItems || [], taxSettings);
        converted.receiptOf = sourceDoc.receiptOf || '';
        converted.taxSummary = summary;
        converted.revenueStampRequired = isRevenueStampRequired(summary.subtotal);
        converted.revenueStampAmount = getRevenueStampAmount(summary.subtotal);
    } else if (targetDocType === 'delivery_note') {
        converted.deliveryDate = now;
    } else if (targetDocType === 'estimate') {
        // デフォルト30日有効
        const validDate = new Date();
        validDate.setDate(validDate.getDate() + 30);
        converted.validUntil = validDate.toISOString().slice(0, 10);
    }

    // 税サマリー再計算
    if (converted.lineItems.length > 0 && targetDocType !== 'receipt') {
        converted.taxSummary = calculateTaxSummary(converted.lineItems, taxSettings);
    }

    return converted;
}

// ============================================================
// エクスポート（Node.js / ブラウザ両対応）
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
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
        ERA_TABLE,
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
    };
}
