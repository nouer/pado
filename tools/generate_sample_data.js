/**
 * generate_sample_data.js - Pado サンプルデータ生成
 *
 * ブラウザのコンソールで実行するか、設定画面のインポートで使用する。
 * node tools/generate_sample_data.js > local_app/sample_data.json
 */

function generateSampleData() {
    const now = new Date().toISOString();

    // 取引先サンプル
    const partners = [
        {
            id: 'partner-001',
            partnerCode: 'P0001',
            name: '株式会社山田製作所',
            nameKana: 'カブシキガイシャヤマダセイサクジョ',
            partnerType: 'customer',
            honorific: '御中',
            zipCode: '150-0001',
            address1: '東京都渋谷区神宮前1-2-3',
            address2: 'テックビル5F',
            phone: '03-1234-5678',
            fax: '03-1234-5679',
            email: 'info@yamada-ss.example.com',
            contactPerson: '山田太郎',
            invoiceRegNumber: 'T1234567890123',
            paymentTerms: '月末締め翌月末払い',
            notes: '',
            createdAt: now,
            updatedAt: now
        },
        {
            id: 'partner-002',
            partnerCode: 'P0002',
            name: '鈴木商事株式会社',
            nameKana: 'スズキショウジカブシキガイシャ',
            partnerType: 'supplier',
            honorific: '御中',
            zipCode: '530-0001',
            address1: '大阪府大阪市北区梅田2-3-4',
            address2: '',
            phone: '06-9876-5432',
            fax: '',
            email: 'suzuki@example.com',
            contactPerson: '鈴木花子',
            invoiceRegNumber: 'T9876543210987',
            paymentTerms: '月末締め翌月15日払い',
            notes: '食品卸売業',
            createdAt: now,
            updatedAt: now
        },
        {
            id: 'partner-003',
            partnerCode: 'P0003',
            name: '佐藤デザイン事務所',
            nameKana: 'サトウデザインジムショ',
            partnerType: 'both',
            honorific: '御中',
            zipCode: '460-0003',
            address1: '愛知県名古屋市中区栄3-4-5',
            address2: 'クリエイティブセンター201',
            phone: '052-111-2222',
            fax: '',
            email: 'sato-design@example.com',
            contactPerson: '佐藤一郎',
            invoiceRegNumber: '',
            paymentTerms: '',
            notes: 'デザイン・印刷物全般',
            createdAt: now,
            updatedAt: now
        }
    ];

    // 品目サンプル
    const items = [
        {
            id: 'item-001', itemCode: 'I0001',
            name: 'Webサイト制作', description: 'レスポンシブ対応Webサイト制作',
            defaultUnitPrice: 300000, unit: '式', taxRateType: 'standard',
            sortOrder: 1, createdAt: now, updatedAt: now
        },
        {
            id: 'item-002', itemCode: 'I0002',
            name: 'ロゴデザイン', description: 'ロゴデザイン+修正2回まで',
            defaultUnitPrice: 50000, unit: '式', taxRateType: 'standard',
            sortOrder: 2, createdAt: now, updatedAt: now
        },
        {
            id: 'item-003', itemCode: 'I0003',
            name: 'コンサルティング', description: 'IT戦略コンサルティング',
            defaultUnitPrice: 15000, unit: '時間', taxRateType: 'standard',
            sortOrder: 3, createdAt: now, updatedAt: now
        },
        {
            id: 'item-004', itemCode: 'I0004',
            name: 'サーバー保守', description: 'サーバー月額保守・監視',
            defaultUnitPrice: 30000, unit: '式', taxRateType: 'standard',
            sortOrder: 4, createdAt: now, updatedAt: now
        },
        {
            id: 'item-005', itemCode: 'I0005',
            name: '弁当（会議用）', description: '会議用弁当（軽減税率対象）',
            defaultUnitPrice: 1080, unit: '個', taxRateType: 'reduced',
            sortOrder: 5, createdAt: now, updatedAt: now
        },
        {
            id: 'item-006', itemCode: 'I0006',
            name: 'お茶（ペットボトル）', description: '500ml ペットボトル（軽減税率対象）',
            defaultUnitPrice: 150, unit: '本', taxRateType: 'reduced',
            sortOrder: 6, createdAt: now, updatedAt: now
        }
    ];

    // 帳票サンプル
    const documents = [
        {
            id: 'doc-001',
            docType: 'estimate',
            docNumber: 'QT-2025-0001',
            status: 'issued',
            issueDate: '2025-12-15',
            validUntil: '2026-01-15',
            partnerId: 'partner-001',
            partnerSnapshot: {
                name: '株式会社山田製作所', honorific: '御中',
                zipCode: '150-0001', address1: '東京都渋谷区神宮前1-2-3',
                address2: 'テックビル5F', contactPerson: '山田太郎',
                invoiceRegNumber: 'T1234567890123'
            },
            lineItems: [
                { id: 'li-001', sortOrder: 1, name: 'Webサイト制作', description: 'レスポンシブ対応', quantity: 1, unit: '式', unitPrice: 300000, taxRateType: 'standard', amount: 300000 },
                { id: 'li-002', sortOrder: 2, name: 'ロゴデザイン', description: '修正2回まで', quantity: 1, unit: '式', unitPrice: 50000, taxRateType: 'standard', amount: 50000 },
                { id: 'li-003', sortOrder: 3, name: 'コンサルティング', description: 'ヒアリング・要件定義', quantity: 5, unit: '時間', unitPrice: 15000, taxRateType: 'standard', amount: 75000 }
            ],
            taxSummary: {
                subtotal: 425000,
                taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 425000, taxAmount: 42500 }],
                totalTax: 42500,
                total: 467500
            },
            notes: '納期: ご発注後2ヶ月\nお支払い: 月末締め翌月末払い',
            internalMemo: '山田社長紹介案件',
            sellerSnapshot: {
                companyName: 'サンプル事業者', invoiceRegNumber: 'T0000000000000',
                zipCode: '100-0001', address: '東京都千代田区千代田1-1',
                phone: '03-0000-0000', bankInfo: '○○銀行 本店\n普通 1234567\n口座名義 サンプルジギョウシャ',
                sealText: 'サンプル'
            },
            childDocIds: ['doc-002'],
            createdAt: now,
            updatedAt: now
        },
        {
            id: 'doc-002',
            docType: 'invoice',
            docNumber: 'INV-2025-0001',
            status: 'sent',
            issueDate: '2026-02-28',
            dueDate: '2026-03-31',
            partnerId: 'partner-001',
            partnerSnapshot: {
                name: '株式会社山田製作所', honorific: '御中',
                zipCode: '150-0001', address1: '東京都渋谷区神宮前1-2-3',
                address2: 'テックビル5F', contactPerson: '山田太郎',
                invoiceRegNumber: 'T1234567890123'
            },
            lineItems: [
                { id: 'li-004', sortOrder: 1, name: 'Webサイト制作', description: 'レスポンシブ対応', quantity: 1, unit: '式', unitPrice: 300000, taxRateType: 'standard', amount: 300000 },
                { id: 'li-005', sortOrder: 2, name: 'ロゴデザイン', description: '修正2回まで', quantity: 1, unit: '式', unitPrice: 50000, taxRateType: 'standard', amount: 50000 },
                { id: 'li-006', sortOrder: 3, name: 'コンサルティング', description: 'ヒアリング・要件定義', quantity: 5, unit: '時間', unitPrice: 15000, taxRateType: 'standard', amount: 75000 }
            ],
            taxSummary: {
                subtotal: 425000,
                taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 425000, taxAmount: 42500 }],
                totalTax: 42500,
                total: 467500
            },
            sourceDocId: 'doc-001',
            sourceDocType: 'estimate',
            sourceDocNumber: 'QT-2025-0001',
            paymentMethod: 'bank_transfer',
            notes: 'お振込手数料はご負担ください',
            internalMemo: '',
            sellerSnapshot: {
                companyName: 'サンプル事業者', invoiceRegNumber: 'T0000000000000',
                zipCode: '100-0001', address: '東京都千代田区千代田1-1',
                phone: '03-0000-0000', bankInfo: '○○銀行 本店\n普通 1234567\n口座名義 サンプルジギョウシャ',
                sealText: 'サンプル'
            },
            childDocIds: [],
            createdAt: now,
            updatedAt: now
        },
        {
            id: 'doc-003',
            docType: 'receipt',
            docNumber: 'RC-2025-0001',
            status: 'issued',
            issueDate: '2026-03-01',
            partnerId: 'partner-001',
            partnerSnapshot: {
                name: '株式会社山田製作所', honorific: '様',
                zipCode: '150-0001', address1: '東京都渋谷区神宮前1-2-3',
                address2: '', contactPerson: '', invoiceRegNumber: ''
            },
            lineItems: [],
            taxSummary: {
                subtotal: 425000,
                taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 425000, taxAmount: 42500 }],
                totalTax: 42500,
                total: 467500
            },
            receiptOf: 'Webサイト制作一式',
            revenueStampRequired: true,
            revenueStampAmount: 200,
            paymentMethod: 'bank_transfer',
            notes: '',
            internalMemo: '',
            sellerSnapshot: {
                companyName: 'サンプル事業者', invoiceRegNumber: 'T0000000000000',
                zipCode: '100-0001', address: '東京都千代田区千代田1-1',
                phone: '03-0000-0000', sealText: 'サンプル'
            },
            childDocIds: [],
            createdAt: now,
            updatedAt: now
        }
    ];

    // 設定サンプル
    const settings = {
        company_info: {
            companyName: 'サンプル事業者',
            invoiceRegNumber: 'T0000000000000',
            zipCode: '100-0001',
            address: '東京都千代田区千代田1-1',
            phone: '03-0000-0000',
            fax: '',
            bankInfo: '○○銀行 本店\n普通 1234567\n口座名義 サンプルジギョウシャ',
            sealText: 'サンプル',
            fiscalStartMonth: 4
        },
        tax_settings: {
            standardRate: 0.1,
            reducedRate: 0.08,
            roundingMethod: 'floor',
            calcMethod: 'per_total'
        },
        display_settings: {
            defaultDocType: 'estimate',
            dateFormat: 'japanese',
            showSeal: true,
            showBank: true,
            estimateValidDays: 30
        }
    };

    return {
        exportedAt: now,
        version: '1.0.0',
        partners,
        items,
        documents,
        settings
    };
}

// Node.js実行時はJSON出力
if (typeof module !== 'undefined' && require.main === module) {
    console.log(JSON.stringify(generateSampleData(), null, 2));
}

// ブラウザ実行時はグローバルに公開
if (typeof window !== 'undefined') {
    window.generateSampleData = generateSampleData;
}
