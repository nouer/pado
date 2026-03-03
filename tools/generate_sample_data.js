/**
 * generate_sample_data.js - Pado サンプルデータ生成
 *
 * ブラウザのコンソールで実行するか、設定画面のインポートで使用する。
 * node tools/generate_sample_data.js > local_app/sample_data.json
 */

function generateSampleData() {
    const now = new Date().toISOString();

    // 共通の売り手スナップショット
    const sellerSnapshot = {
        companyName: 'サンプル事業者', invoiceRegNumber: 'T0000000000000',
        zipCode: '100-0001', address: '東京都千代田区千代田1-1',
        phone: '03-0000-0000', bankInfo: '○○銀行 本店\n普通 1234567\n口座名義 サンプルジギョウシャ',
        sealText: 'サンプル'
    };

    const sellerSnapshotReceipt = {
        companyName: 'サンプル事業者', invoiceRegNumber: 'T0000000000000',
        zipCode: '100-0001', address: '東京都千代田区千代田1-1',
        phone: '03-0000-0000', sealText: 'サンプル'
    };

    // 取引先スナップショット生成ヘルパー
    function snap(p) {
        return {
            name: p.name, honorific: p.honorific,
            zipCode: p.zipCode, address1: p.address1,
            address2: p.address2, contactPerson: p.contactPerson,
            invoiceRegNumber: p.invoiceRegNumber
        };
    }

    function snapReceipt(p) {
        return {
            name: p.name, honorific: '様',
            zipCode: p.zipCode, address1: p.address1,
            address2: '', contactPerson: '', invoiceRegNumber: ''
        };
    }

    // ================================================================
    // 取引先サンプル (8件)
    // ================================================================
    const partners = [
        {
            id: 'partner-001', partnerCode: 'P0001',
            name: '株式会社山田製作所', nameKana: 'カブシキガイシャヤマダセイサクジョ',
            partnerType: 'customer', honorific: '御中',
            zipCode: '150-0001', address1: '東京都渋谷区神宮前1-2-3', address2: 'テックビル5F',
            phone: '03-1234-5678', fax: '03-1234-5679',
            email: 'info@yamada-ss.example.com', contactPerson: '山田太郎',
            invoiceRegNumber: 'T1234567890123', paymentTerms: '月末締め翌月末払い',
            notes: '', createdAt: now, updatedAt: now
        },
        {
            id: 'partner-002', partnerCode: 'P0002',
            name: '鈴木商事株式会社', nameKana: 'スズキショウジカブシキガイシャ',
            partnerType: 'supplier', honorific: '御中',
            zipCode: '530-0001', address1: '大阪府大阪市北区梅田2-3-4', address2: '',
            phone: '06-9876-5432', fax: '',
            email: 'suzuki@example.com', contactPerson: '鈴木花子',
            invoiceRegNumber: 'T9876543210987', paymentTerms: '月末締め翌月15日払い',
            notes: '食品卸売業', createdAt: now, updatedAt: now
        },
        {
            id: 'partner-003', partnerCode: 'P0003',
            name: '佐藤デザイン事務所', nameKana: 'サトウデザインジムショ',
            partnerType: 'both', honorific: '御中',
            zipCode: '460-0003', address1: '愛知県名古屋市中区栄3-4-5', address2: 'クリエイティブセンター201',
            phone: '052-111-2222', fax: '',
            email: 'sato-design@example.com', contactPerson: '佐藤一郎',
            invoiceRegNumber: '', paymentTerms: '',
            notes: 'デザイン・印刷物全般', createdAt: now, updatedAt: now
        },
        {
            id: 'partner-004', partnerCode: 'P0004',
            name: '有限会社田中建設', nameKana: 'ユウゲンガイシャタナカケンセツ',
            partnerType: 'customer', honorific: '御中',
            zipCode: '330-0063', address1: '埼玉県さいたま市浦和区高砂3-1-4', address2: '',
            phone: '048-222-3333', fax: '048-222-3334',
            email: 'tanaka-k@example.com', contactPerson: '田中次郎',
            invoiceRegNumber: 'T1122334455667', paymentTerms: '月末締め翌月末払い',
            notes: '建設業・リフォーム', createdAt: now, updatedAt: now
        },
        {
            id: 'partner-005', partnerCode: 'P0005',
            name: '株式会社高橋食品', nameKana: 'カブシキガイシャタカハシショクヒン',
            partnerType: 'supplier', honorific: '御中',
            zipCode: '812-0011', address1: '福岡県福岡市博多区博多駅前2-5-10', address2: '博多フードビル3F',
            phone: '092-444-5555', fax: '092-444-5556',
            email: 'takahashi-food@example.com', contactPerson: '高橋美咲',
            invoiceRegNumber: 'T2233445566778', paymentTerms: '月末締め翌月末払い',
            notes: '食品卸・軽減税率対象品多数', createdAt: now, updatedAt: now
        },
        {
            id: 'partner-006', partnerCode: 'P0006',
            name: '合同会社中村テクノロジー', nameKana: 'ゴウドウガイシャナカムラテクノロジー',
            partnerType: 'customer', honorific: '御中',
            zipCode: '220-0012', address1: '神奈川県横浜市西区みなとみらい2-3-1', address2: 'ITタワー12F',
            phone: '045-666-7777', fax: '',
            email: 'info@nakamura-tech.example.com', contactPerson: '中村健太',
            invoiceRegNumber: 'T3344556677889', paymentTerms: '月末締め翌月末払い',
            notes: 'システム開発・IT企業', createdAt: now, updatedAt: now
        },
        {
            id: 'partner-007', partnerCode: 'P0007',
            name: '株式会社渡辺物流', nameKana: 'カブシキガイシャワタナベブツリュウ',
            partnerType: 'both', honorific: '御中',
            zipCode: '455-0032', address1: '愛知県名古屋市港区入船1-7-2', address2: '',
            phone: '052-888-9999', fax: '052-888-9990',
            email: 'watanabe-logistics@example.com', contactPerson: '渡辺大輔',
            invoiceRegNumber: 'T4455667788990', paymentTerms: '月末締め翌月15日払い',
            notes: '物流・配送業', createdAt: now, updatedAt: now
        },
        {
            id: 'partner-008', partnerCode: 'P0008',
            name: '小林工房', nameKana: 'コバヤシコウボウ',
            partnerType: 'customer', honorific: '様',
            zipCode: '600-8216', address1: '京都府京都市下京区東塩小路町680', address2: '',
            phone: '075-333-4444', fax: '',
            email: 'kobayashi-craft@example.com', contactPerson: '小林由美',
            invoiceRegNumber: '', paymentTerms: '',
            notes: '個人事業主・手工芸品', createdAt: now, updatedAt: now
        }
    ];

    // ================================================================
    // 品目サンプル (15件)
    // ================================================================
    const items = [
        { id: 'item-001', itemCode: 'I0001', name: 'Webサイト制作', description: 'レスポンシブ対応Webサイト制作', defaultUnitPrice: 300000, unit: '式', taxRateType: 'standard', sortOrder: 1, createdAt: now, updatedAt: now },
        { id: 'item-002', itemCode: 'I0002', name: 'ロゴデザイン', description: 'ロゴデザイン+修正2回まで', defaultUnitPrice: 50000, unit: '式', taxRateType: 'standard', sortOrder: 2, createdAt: now, updatedAt: now },
        { id: 'item-003', itemCode: 'I0003', name: 'コンサルティング', description: 'IT戦略コンサルティング', defaultUnitPrice: 15000, unit: '時間', taxRateType: 'standard', sortOrder: 3, createdAt: now, updatedAt: now },
        { id: 'item-004', itemCode: 'I0004', name: 'サーバー保守', description: 'サーバー月額保守・監視', defaultUnitPrice: 30000, unit: '式', taxRateType: 'standard', sortOrder: 4, createdAt: now, updatedAt: now },
        { id: 'item-005', itemCode: 'I0005', name: '弁当（会議用）', description: '会議用弁当（軽減税率対象）', defaultUnitPrice: 1080, unit: '個', taxRateType: 'reduced', sortOrder: 5, createdAt: now, updatedAt: now },
        { id: 'item-006', itemCode: 'I0006', name: 'お茶（ペットボトル）', description: '500ml ペットボトル（軽減税率対象）', defaultUnitPrice: 150, unit: '本', taxRateType: 'reduced', sortOrder: 6, createdAt: now, updatedAt: now },
        { id: 'item-007', itemCode: 'I0007', name: '印刷物制作', description: 'チラシ・パンフレット等の印刷', defaultUnitPrice: 50000, unit: '部', taxRateType: 'standard', sortOrder: 7, createdAt: now, updatedAt: now },
        { id: 'item-008', itemCode: 'I0008', name: '名刺デザイン', description: '名刺デザイン・印刷（100枚/箱）', defaultUnitPrice: 5000, unit: '箱', taxRateType: 'standard', sortOrder: 8, createdAt: now, updatedAt: now },
        { id: 'item-009', itemCode: 'I0009', name: '建設工事', description: '建築・リフォーム工事一式', defaultUnitPrice: 1500000, unit: '式', taxRateType: 'standard', sortOrder: 9, createdAt: now, updatedAt: now },
        { id: 'item-010', itemCode: 'I0010', name: '電気工事', description: '電気配線・照明設置工事', defaultUnitPrice: 300000, unit: '式', taxRateType: 'standard', sortOrder: 10, createdAt: now, updatedAt: now },
        { id: 'item-011', itemCode: 'I0011', name: '配送料', description: '国内配送サービス', defaultUnitPrice: 3000, unit: '件', taxRateType: 'standard', sortOrder: 11, createdAt: now, updatedAt: now },
        { id: 'item-012', itemCode: 'I0012', name: '梱包資材', description: '段ボール・緩衝材一式', defaultUnitPrice: 500, unit: '個', taxRateType: 'standard', sortOrder: 12, createdAt: now, updatedAt: now },
        { id: 'item-013', itemCode: 'I0013', name: '菓子折り', description: '手土産用菓子詰め合わせ（軽減税率対象）', defaultUnitPrice: 3240, unit: '箱', taxRateType: 'reduced', sortOrder: 13, createdAt: now, updatedAt: now },
        { id: 'item-014', itemCode: 'I0014', name: 'ミネラルウォーター', description: '500mlペットボトル（軽減税率対象）', defaultUnitPrice: 100, unit: '本', taxRateType: 'reduced', sortOrder: 14, createdAt: now, updatedAt: now },
        { id: 'item-015', itemCode: 'I0015', name: '研修講師料', description: '社内研修・セミナー講師派遣', defaultUnitPrice: 80000, unit: '日', taxRateType: 'standard', sortOrder: 15, createdAt: now, updatedAt: now }
    ];

    // ================================================================
    // 帳票サンプル (20件・全7種類)
    // ================================================================

    // --- チェーン1: Web制作案件（山田製作所）既存3件 ---

    // doc-001: 見積書
    const doc001 = {
        id: 'doc-001', docType: 'estimate', docNumber: 'QT-2025-0001',
        status: 'issued', issueDate: '2025-12-15', validUntil: '2026-01-15',
        partnerId: 'partner-001', partnerSnapshot: snap(partners[0]),
        lineItems: [
            { id: 'li-001', sortOrder: 1, name: 'Webサイト制作', description: 'レスポンシブ対応', quantity: 1, unit: '式', unitPrice: 300000, taxRateType: 'standard', amount: 300000 },
            { id: 'li-002', sortOrder: 2, name: 'ロゴデザイン', description: '修正2回まで', quantity: 1, unit: '式', unitPrice: 50000, taxRateType: 'standard', amount: 50000 },
            { id: 'li-003', sortOrder: 3, name: 'コンサルティング', description: 'ヒアリング・要件定義', quantity: 5, unit: '時間', unitPrice: 15000, taxRateType: 'standard', amount: 75000 }
        ],
        taxSummary: {
            subtotal: 425000,
            taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 425000, taxAmount: 42500 }],
            totalTax: 42500, total: 467500
        },
        notes: '納期: ご発注後2ヶ月\nお支払い: 月末締め翌月末払い',
        internalMemo: '山田社長紹介案件',
        sellerSnapshot: sellerSnapshot,
        childDocIds: ['doc-002'],
        createdAt: now, updatedAt: now
    };

    // doc-002: 請求書
    const doc002 = {
        id: 'doc-002', docType: 'invoice', docNumber: 'INV-2025-0001',
        status: 'sent', issueDate: '2026-02-28', dueDate: '2026-03-31',
        partnerId: 'partner-001', partnerSnapshot: snap(partners[0]),
        lineItems: [
            { id: 'li-004', sortOrder: 1, name: 'Webサイト制作', description: 'レスポンシブ対応', quantity: 1, unit: '式', unitPrice: 300000, taxRateType: 'standard', amount: 300000 },
            { id: 'li-005', sortOrder: 2, name: 'ロゴデザイン', description: '修正2回まで', quantity: 1, unit: '式', unitPrice: 50000, taxRateType: 'standard', amount: 50000 },
            { id: 'li-006', sortOrder: 3, name: 'コンサルティング', description: 'ヒアリング・要件定義', quantity: 5, unit: '時間', unitPrice: 15000, taxRateType: 'standard', amount: 75000 }
        ],
        taxSummary: {
            subtotal: 425000,
            taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 425000, taxAmount: 42500 }],
            totalTax: 42500, total: 467500
        },
        sourceDocId: 'doc-001', sourceDocType: 'estimate', sourceDocNumber: 'QT-2025-0001',
        paymentMethod: 'bank_transfer',
        notes: 'お振込手数料はご負担ください',
        internalMemo: '',
        sellerSnapshot: sellerSnapshot,
        childDocIds: ['doc-003'],
        createdAt: now, updatedAt: now
    };

    // doc-003: 領収書
    const doc003 = {
        id: 'doc-003', docType: 'receipt', docNumber: 'RC-2025-0001',
        status: 'issued', issueDate: '2026-03-01',
        partnerId: 'partner-001', partnerSnapshot: snapReceipt(partners[0]),
        lineItems: [],
        taxSummary: {
            subtotal: 425000,
            taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 425000, taxAmount: 42500 }],
            totalTax: 42500, total: 467500
        },
        receiptOf: 'Webサイト制作一式',
        revenueStampRequired: true, revenueStampAmount: 200,
        paymentMethod: 'bank_transfer',
        notes: '', internalMemo: '',
        sellerSnapshot: sellerSnapshotReceipt,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    // --- チェーン2: 建設工事案件（田中建設）新規4件 ---
    // 建設工事 1式=1,500,000 + 電気工事 1式=300,000 + コンサル 3h*15,000=45,000
    // subtotal=1,845,000  tax=184,500  total=2,029,500

    const chain2Lines = [
        { name: '建設工事', description: '事務所リフォーム工事一式', quantity: 1, unit: '式', unitPrice: 1500000, taxRateType: 'standard', amount: 1500000 },
        { name: '電気工事', description: '電気配線・照明設置', quantity: 1, unit: '式', unitPrice: 300000, taxRateType: 'standard', amount: 300000 },
        { name: 'コンサルティング', description: '事前調査・現場確認', quantity: 3, unit: '時間', unitPrice: 15000, taxRateType: 'standard', amount: 45000 }
    ];
    const chain2Tax = {
        subtotal: 1845000,
        taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 1845000, taxAmount: 184500 }],
        totalTax: 184500, total: 2029500
    };

    // doc-004: 見積書
    const doc004 = {
        id: 'doc-004', docType: 'estimate', docNumber: 'QT-2026-0001',
        status: 'issued', issueDate: '2026-01-10', validUntil: '2026-02-09',
        partnerId: 'partner-004', partnerSnapshot: snap(partners[3]),
        lineItems: chain2Lines.map((l, i) => ({ ...l, id: 'li-' + String(7 + i).padStart(3, '0'), sortOrder: i + 1 })),
        taxSummary: chain2Tax,
        notes: '工期: 約1ヶ月\n現場: さいたま市浦和区',
        internalMemo: '田中社長から直接依頼',
        sellerSnapshot: sellerSnapshot,
        childDocIds: ['doc-005', 'doc-006'],
        createdAt: now, updatedAt: now
    };

    // doc-005: 請求書
    const doc005 = {
        id: 'doc-005', docType: 'invoice', docNumber: 'INV-2026-0001',
        status: 'sent', issueDate: '2026-02-15', dueDate: '2026-03-31',
        partnerId: 'partner-004', partnerSnapshot: snap(partners[3]),
        lineItems: chain2Lines.map((l, i) => ({ ...l, id: 'li-' + String(10 + i).padStart(3, '0'), sortOrder: i + 1 })),
        taxSummary: chain2Tax,
        sourceDocId: 'doc-004', sourceDocType: 'estimate', sourceDocNumber: 'QT-2026-0001',
        paymentMethod: 'bank_transfer',
        notes: 'お振込手数料はご負担ください',
        internalMemo: '',
        sellerSnapshot: sellerSnapshot,
        childDocIds: ['doc-007'],
        createdAt: now, updatedAt: now
    };

    // doc-006: 納品書
    const doc006 = {
        id: 'doc-006', docType: 'delivery_note', docNumber: 'DN-2026-0001',
        status: 'issued', issueDate: '2026-02-20', deliveryDate: '2026-02-20',
        partnerId: 'partner-004', partnerSnapshot: snap(partners[3]),
        lineItems: chain2Lines.map((l, i) => ({ ...l, id: 'li-' + String(13 + i).padStart(3, '0'), sortOrder: i + 1 })),
        taxSummary: chain2Tax,
        sourceDocId: 'doc-004', sourceDocType: 'estimate', sourceDocNumber: 'QT-2026-0001',
        notes: '', internalMemo: '',
        sellerSnapshot: sellerSnapshot,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    // doc-007: 売上伝票
    const doc007 = {
        id: 'doc-007', docType: 'sales_slip', docNumber: 'SS-2026-0001',
        status: 'issued', issueDate: '2026-02-28',
        partnerId: 'partner-004', partnerSnapshot: snap(partners[3]),
        lineItems: chain2Lines.map((l, i) => ({ ...l, id: 'li-' + String(16 + i).padStart(3, '0'), sortOrder: i + 1 })),
        taxSummary: chain2Tax,
        sourceDocId: 'doc-005', sourceDocType: 'invoice', sourceDocNumber: 'INV-2026-0001',
        notes: '', internalMemo: '',
        sellerSnapshot: sellerSnapshot,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    // --- チェーン3: 食品仕入（高橋食品）新規3件 ---
    // 弁当 20個*1,080=21,600(reduced) + お茶 24本*150=3,600(reduced)
    // + 菓子折り 5箱*3,240=16,200(reduced) + 梱包資材 10個*500=5,000(standard)
    // subtotal=46,400  std_tax=floor(5000*0.1)=500  red_tax=floor(41400*0.08)=3312
    // totalTax=3,812  total=50,212

    const chain3Lines = [
        { name: '弁当（会議用）', description: '会議用弁当', quantity: 20, unit: '個', unitPrice: 1080, taxRateType: 'reduced', amount: 21600 },
        { name: 'お茶（ペットボトル）', description: '500mlペットボトル', quantity: 24, unit: '本', unitPrice: 150, taxRateType: 'reduced', amount: 3600 },
        { name: '菓子折り', description: '手土産用菓子詰め合わせ', quantity: 5, unit: '箱', unitPrice: 3240, taxRateType: 'reduced', amount: 16200 },
        { name: '梱包資材', description: '段ボール・緩衝材', quantity: 10, unit: '個', unitPrice: 500, taxRateType: 'standard', amount: 5000 }
    ];
    const chain3Tax = {
        subtotal: 46400,
        taxDetails: [
            { rateType: 'standard', rate: 0.1, taxableAmount: 5000, taxAmount: 500 },
            { rateType: 'reduced', rate: 0.08, taxableAmount: 41400, taxAmount: 3312 }
        ],
        totalTax: 3812, total: 50212
    };

    // doc-008: 発注書
    const doc008 = {
        id: 'doc-008', docType: 'purchase_order', docNumber: 'PO-2026-0001',
        status: 'issued', issueDate: '2026-01-20',
        partnerId: 'partner-005', partnerSnapshot: snap(partners[4]),
        lineItems: chain3Lines.map((l, i) => ({ ...l, id: 'li-' + String(19 + i).padStart(3, '0'), sortOrder: i + 1 })),
        taxSummary: chain3Tax,
        notes: '納品先: 東京都千代田区千代田1-1\n希望納品日: 2026年1月25日',
        internalMemo: '社内イベント用',
        sellerSnapshot: sellerSnapshot,
        childDocIds: ['doc-009', 'doc-010'],
        createdAt: now, updatedAt: now
    };

    // doc-009: 仕入伝票
    const doc009 = {
        id: 'doc-009', docType: 'purchase_slip', docNumber: 'PS-2026-0001',
        status: 'issued', issueDate: '2026-01-25',
        partnerId: 'partner-005', partnerSnapshot: snap(partners[4]),
        lineItems: chain3Lines.map((l, i) => ({ ...l, id: 'li-' + String(23 + i).padStart(3, '0'), sortOrder: i + 1 })),
        taxSummary: chain3Tax,
        sourceDocId: 'doc-008', sourceDocType: 'purchase_order', sourceDocNumber: 'PO-2026-0001',
        notes: '', internalMemo: '',
        sellerSnapshot: sellerSnapshot,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    // doc-010: 納品書
    const doc010 = {
        id: 'doc-010', docType: 'delivery_note', docNumber: 'DN-2026-0002',
        status: 'issued', issueDate: '2026-01-25', deliveryDate: '2026-01-25',
        partnerId: 'partner-005', partnerSnapshot: snap(partners[4]),
        lineItems: chain3Lines.map((l, i) => ({ ...l, id: 'li-' + String(27 + i).padStart(3, '0'), sortOrder: i + 1 })),
        taxSummary: chain3Tax,
        sourceDocId: 'doc-008', sourceDocType: 'purchase_order', sourceDocNumber: 'PO-2026-0001',
        notes: '', internalMemo: '',
        sellerSnapshot: sellerSnapshot,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    // --- チェーン4: IT開発案件（中村テクノロジー）新規4件 ---
    // Web制作 1式=300,000 + サーバー保守 6式=180,000 + コンサル 10h=150,000 + 研修 2日=160,000
    // subtotal=790,000  tax=79,000  total=869,000

    const chain4Lines = [
        { name: 'Webサイト制作', description: '社内ポータルサイト構築', quantity: 1, unit: '式', unitPrice: 300000, taxRateType: 'standard', amount: 300000 },
        { name: 'サーバー保守', description: 'クラウドサーバー保守（6ヶ月分）', quantity: 6, unit: '式', unitPrice: 30000, taxRateType: 'standard', amount: 180000 },
        { name: 'コンサルティング', description: 'システム設計・要件定義', quantity: 10, unit: '時間', unitPrice: 15000, taxRateType: 'standard', amount: 150000 },
        { name: '研修講師料', description: '社員向けIT研修', quantity: 2, unit: '日', unitPrice: 80000, taxRateType: 'standard', amount: 160000 }
    ];
    const chain4Tax = {
        subtotal: 790000,
        taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 790000, taxAmount: 79000 }],
        totalTax: 79000, total: 869000
    };

    // doc-011: 見積書
    const doc011 = {
        id: 'doc-011', docType: 'estimate', docNumber: 'QT-2026-0002',
        status: 'issued', issueDate: '2026-02-01', validUntil: '2026-03-03',
        partnerId: 'partner-006', partnerSnapshot: snap(partners[5]),
        lineItems: chain4Lines.map((l, i) => ({ ...l, id: 'li-' + String(31 + i).padStart(3, '0'), sortOrder: i + 1 })),
        taxSummary: chain4Tax,
        notes: '納期: ご発注後3ヶ月\nお支払い: 月末締め翌月末払い',
        internalMemo: 'Webサイトから問い合わせ',
        sellerSnapshot: sellerSnapshot,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    // doc-012: 発注書（鈴木商事への外注）
    // サーバー保守 6式=180,000  tax=18,000  total=198,000
    const doc012 = {
        id: 'doc-012', docType: 'purchase_order', docNumber: 'PO-2026-0002',
        status: 'issued', issueDate: '2026-02-05',
        partnerId: 'partner-002', partnerSnapshot: snap(partners[1]),
        lineItems: [
            { id: 'li-035', sortOrder: 1, name: 'サーバー保守', description: 'クラウドサーバー保守（外注・6ヶ月分）', quantity: 6, unit: '式', unitPrice: 30000, taxRateType: 'standard', amount: 180000 }
        ],
        taxSummary: {
            subtotal: 180000,
            taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 180000, taxAmount: 18000 }],
            totalTax: 18000, total: 198000
        },
        notes: '中村テクノロジー案件の外注分',
        internalMemo: '',
        sellerSnapshot: sellerSnapshot,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    // doc-013: 請求書
    const doc013 = {
        id: 'doc-013', docType: 'invoice', docNumber: 'INV-2026-0002',
        status: 'sent', issueDate: '2026-03-01', dueDate: '2026-03-31',
        partnerId: 'partner-006', partnerSnapshot: snap(partners[5]),
        lineItems: chain4Lines.map((l, i) => ({ ...l, id: 'li-' + String(36 + i).padStart(3, '0'), sortOrder: i + 1 })),
        taxSummary: chain4Tax,
        paymentMethod: 'bank_transfer',
        notes: 'お振込手数料はご負担ください',
        internalMemo: '',
        sellerSnapshot: sellerSnapshot,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    // doc-014: 領収書
    const doc014 = {
        id: 'doc-014', docType: 'receipt', docNumber: 'RC-2026-0001',
        status: 'issued', issueDate: '2026-03-15',
        partnerId: 'partner-006', partnerSnapshot: snapReceipt(partners[5]),
        lineItems: [],
        taxSummary: chain4Tax,
        receiptOf: 'IT開発・コンサルティング一式',
        revenueStampRequired: true, revenueStampAmount: 200,
        paymentMethod: 'bank_transfer',
        notes: '', internalMemo: '',
        sellerSnapshot: sellerSnapshotReceipt,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    // --- チェーン5: 物流案件（渡辺物流）新規3件 ---
    // 配送料 15件*3,000=45,000 + 梱包資材 30個*500=15,000
    // subtotal=60,000  tax=6,000  total=66,000

    const chain5Lines = [
        { name: '配送料', description: '国内配送サービス', quantity: 15, unit: '件', unitPrice: 3000, taxRateType: 'standard', amount: 45000 },
        { name: '梱包資材', description: '段ボール・緩衝材一式', quantity: 30, unit: '個', unitPrice: 500, taxRateType: 'standard', amount: 15000 }
    ];
    const chain5Tax = {
        subtotal: 60000,
        taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 60000, taxAmount: 6000 }],
        totalTax: 6000, total: 66000
    };

    // doc-015: 納品書
    const doc015 = {
        id: 'doc-015', docType: 'delivery_note', docNumber: 'DN-2026-0003',
        status: 'issued', issueDate: '2026-02-10', deliveryDate: '2026-02-10',
        partnerId: 'partner-007', partnerSnapshot: snap(partners[6]),
        lineItems: chain5Lines.map((l, i) => ({ ...l, id: 'li-' + String(40 + i).padStart(3, '0'), sortOrder: i + 1 })),
        taxSummary: chain5Tax,
        notes: '', internalMemo: '',
        sellerSnapshot: sellerSnapshot,
        childDocIds: ['doc-016', 'doc-017'],
        createdAt: now, updatedAt: now
    };

    // doc-016: 売上伝票
    const doc016 = {
        id: 'doc-016', docType: 'sales_slip', docNumber: 'SS-2026-0002',
        status: 'issued', issueDate: '2026-02-10',
        partnerId: 'partner-007', partnerSnapshot: snap(partners[6]),
        lineItems: chain5Lines.map((l, i) => ({ ...l, id: 'li-' + String(42 + i).padStart(3, '0'), sortOrder: i + 1 })),
        taxSummary: chain5Tax,
        sourceDocId: 'doc-015', sourceDocType: 'delivery_note', sourceDocNumber: 'DN-2026-0003',
        notes: '', internalMemo: '',
        sellerSnapshot: sellerSnapshot,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    // doc-017: 請求書
    const doc017 = {
        id: 'doc-017', docType: 'invoice', docNumber: 'INV-2026-0003',
        status: 'draft', issueDate: '2026-03-01', dueDate: '2026-03-31',
        partnerId: 'partner-007', partnerSnapshot: snap(partners[6]),
        lineItems: chain5Lines.map((l, i) => ({ ...l, id: 'li-' + String(44 + i).padStart(3, '0'), sortOrder: i + 1 })),
        taxSummary: chain5Tax,
        sourceDocId: 'doc-015', sourceDocType: 'delivery_note', sourceDocNumber: 'DN-2026-0003',
        paymentMethod: 'bank_transfer',
        notes: 'お振込手数料はご負担ください',
        internalMemo: '',
        sellerSnapshot: sellerSnapshot,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    // --- 単発帳票 新規3件 ---

    // doc-018: 仕入伝票（佐藤デザインからの印刷物仕入）
    // 印刷物 3部*50,000=150,000 + 名刺 2箱*5,000=10,000
    // subtotal=160,000  tax=16,000  total=176,000
    const doc018 = {
        id: 'doc-018', docType: 'purchase_slip', docNumber: 'PS-2026-0002',
        status: 'issued', issueDate: '2026-02-15',
        partnerId: 'partner-003', partnerSnapshot: snap(partners[2]),
        lineItems: [
            { id: 'li-046', sortOrder: 1, name: '印刷物制作', description: '会社案内パンフレット', quantity: 3, unit: '部', unitPrice: 50000, taxRateType: 'standard', amount: 150000 },
            { id: 'li-047', sortOrder: 2, name: '名刺デザイン', description: '社員用名刺', quantity: 2, unit: '箱', unitPrice: 5000, taxRateType: 'standard', amount: 10000 }
        ],
        taxSummary: {
            subtotal: 160000,
            taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 160000, taxAmount: 16000 }],
            totalTax: 16000, total: 176000
        },
        notes: '', internalMemo: '佐藤デザイン事務所へ発注分',
        sellerSnapshot: sellerSnapshot,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    // doc-019: 見積書（小林工房向け名刺）
    // 名刺 5箱*5,000=25,000 + 印刷物 1部*50,000=50,000
    // subtotal=75,000  tax=7,500  total=82,500
    const doc019 = {
        id: 'doc-019', docType: 'estimate', docNumber: 'QT-2026-0003',
        status: 'draft', issueDate: '2026-02-20', validUntil: '2026-03-22',
        partnerId: 'partner-008', partnerSnapshot: snap(partners[7]),
        lineItems: [
            { id: 'li-048', sortOrder: 1, name: '名刺デザイン', description: 'オリジナル名刺デザイン', quantity: 5, unit: '箱', unitPrice: 5000, taxRateType: 'standard', amount: 25000 },
            { id: 'li-049', sortOrder: 2, name: '印刷物制作', description: 'ショップカード印刷', quantity: 1, unit: '部', unitPrice: 50000, taxRateType: 'standard', amount: 50000 }
        ],
        taxSummary: {
            subtotal: 75000,
            taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 75000, taxAmount: 7500 }],
            totalTax: 7500, total: 82500
        },
        notes: '納期: ご発注後2週間',
        internalMemo: '小林様からの紹介',
        sellerSnapshot: sellerSnapshot,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    // doc-020: 発注書（渡辺物流への配送依頼）
    // 配送料 10件*3,000=30,000 + 梱包資材 20個*500=10,000
    // subtotal=40,000  tax=4,000  total=44,000
    const doc020 = {
        id: 'doc-020', docType: 'purchase_order', docNumber: 'PO-2026-0003',
        status: 'draft', issueDate: '2026-03-01',
        partnerId: 'partner-007', partnerSnapshot: snap(partners[6]),
        lineItems: [
            { id: 'li-050', sortOrder: 1, name: '配送料', description: '国内配送サービス', quantity: 10, unit: '件', unitPrice: 3000, taxRateType: 'standard', amount: 30000 },
            { id: 'li-051', sortOrder: 2, name: '梱包資材', description: '段ボール・緩衝材', quantity: 20, unit: '個', unitPrice: 500, taxRateType: 'standard', amount: 10000 }
        ],
        taxSummary: {
            subtotal: 40000,
            taxDetails: [{ rateType: 'standard', rate: 0.1, taxableAmount: 40000, taxAmount: 4000 }],
            totalTax: 4000, total: 44000
        },
        notes: '配送先: 京都府京都市下京区',
        internalMemo: '',
        sellerSnapshot: sellerSnapshot,
        childDocIds: [],
        createdAt: now, updatedAt: now
    };

    const documents = [
        doc001, doc002, doc003, doc004, doc005, doc006, doc007,
        doc008, doc009, doc010, doc011, doc012, doc013, doc014,
        doc015, doc016, doc017, doc018, doc019, doc020
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
