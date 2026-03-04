/**
 * script.js - Pado 帳票管理アプリ メインスクリプト
 * DB操作・UI操作・タブ制御を担当
 */

// ============================================================
// ユーティリティ
// ============================================================
function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return generateId();
    }
    return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

// ============================================================
// グローバル状態
// ============================================================
let db = null;
let currentDocType = 'estimate';
let editingDocId = null;

const STATUS_LABELS = {
    draft: '下書き', issued: '発行済', sent: '送付済',
    accepted: '受領済', void: '無効'
};

// DOC_TYPE_LABELS は pado.calc.js で定義済み

const UNIT_OPTIONS = ['式','個','本','枚','台','セット','時間','人月','人日','kg','m','㎡'];

// ============================================================
// IndexedDB
// ============================================================
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('PadoDB', 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;

            // partners
            if (!db.objectStoreNames.contains('partners')) {
                const store = db.createObjectStore('partners', { keyPath: 'id' });
                store.createIndex('name', 'name', { unique: false });
                store.createIndex('nameKana', 'nameKana', { unique: false });
                store.createIndex('partnerCode', 'partnerCode', { unique: true });
                store.createIndex('partnerType', 'partnerType', { unique: false });
            }
            // items
            if (!db.objectStoreNames.contains('items')) {
                const store = db.createObjectStore('items', { keyPath: 'id' });
                store.createIndex('name', 'name', { unique: false });
                store.createIndex('itemCode', 'itemCode', { unique: true });
                store.createIndex('taxRateType', 'taxRateType', { unique: false });
            }
            // documents
            if (!db.objectStoreNames.contains('documents')) {
                const store = db.createObjectStore('documents', { keyPath: 'id' });
                store.createIndex('docType', 'docType', { unique: false });
                store.createIndex('docNumber', 'docNumber', { unique: false });
                store.createIndex('partnerId', 'partnerId', { unique: false });
                store.createIndex('issueDate', 'issueDate', { unique: false });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('sourceDocId', 'sourceDocId', { unique: false });
            }
            // doc_sequences
            if (!db.objectStoreNames.contains('doc_sequences')) {
                db.createObjectStore('doc_sequences', { keyPath: 'id' });
            }
            // app_settings
            if (!db.objectStoreNames.contains('app_settings')) {
                db.createObjectStore('app_settings', { keyPath: 'id' });
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

// 汎用CRUD
function addToStore(storeName, data) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.add(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function updateInStore(storeName, data) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function getFromStore(storeName, id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function getAllFromStore(storeName) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function deleteFromStore(storeName, id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const req = index.getAll(value);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function clearStore(storeName) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// ============================================================
// 設定の読み書き
// ============================================================
async function getSetting(key) {
    const rec = await getFromStore('app_settings', key);
    return rec ? rec.value : null;
}

async function saveSetting(key, value) {
    await updateInStore('app_settings', { id: key, value });
}

async function loadCompanyInfo() {
    return (await getSetting('company_info')) || {};
}

async function loadTaxSettings() {
    const s = (await getSetting('tax_settings')) || {};
    return {
        standardRate: s.standardRate != null ? s.standardRate : 0.1,
        reducedRate: s.reducedRate != null ? s.reducedRate : 0.08,
        roundingMethod: s.roundingMethod || 'floor',
        calcMethod: s.calcMethod || 'per_line'
    };
}

async function loadNumberFormat() {
    return (await getSetting('number_format')) || {};
}

async function loadDisplaySettings() {
    const s = (await getSetting('display_settings')) || {};
    return {
        defaultDocType: s.defaultDocType || 'estimate',
        dateFormat: s.dateFormat || 'japanese',
        showSeal: s.showSeal !== false,
        showBank: s.showBank !== false,
        estimateValidDays: s.estimateValidDays || 30,
        hiddenDocTypes: s.hiddenDocTypes || []
    };
}

const CONFIGURABLE_DOC_TYPES = ['estimate','purchase_order','invoice','delivery_note','sales_slip','purchase_slip'];

const PAYMENT_METHOD_LABELS = {
    bank_transfer: '銀行振込',
    cash: '現金',
    check: '小切手',
    credit_card: 'クレジットカード',
    other: 'その他'
};

// ============================================================
// タブ切替
// ============================================================
function initTabs() {
    // メインタブ
    document.querySelectorAll('#main-tab-nav .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });

    // 帳票サブタブ
    document.querySelectorAll('#doc-sub-tab-nav .sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const docType = btn.dataset.docType;
            switchDocSubTab(docType);
        });
    });

    // URLパラメータ対応
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) switchTab(tab);
}

function switchTab(tabName) {
    document.querySelectorAll('#main-tab-nav .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const btn = document.querySelector(`#main-tab-nav .tab-btn[data-tab="${tabName}"]`);
    const content = document.getElementById(`tab-${tabName}`);
    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');

    // タブ切替時にデータを読み込む
    if (tabName === 'documents') loadDocList();
    if (tabName === 'partners') loadPartnerList();
    if (tabName === 'items') loadItemList();
    if (tabName === 'settings') loadSettings();
}

function switchDocSubTab(docType) {
    currentDocType = docType;
    document.querySelectorAll('#doc-sub-tab-nav .sub-tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`#doc-sub-tab-nav .sub-tab-btn[data-doc-type="${docType}"]`);
    if (btn) btn.classList.add('active');
    loadDocList();
}

// ============================================================
// 設定タブ
// ============================================================
async function loadSettings() {
    // 自社情報
    const ci = await loadCompanyInfo();
    document.getElementById('setting-company-name').value = ci.companyName || '';
    document.getElementById('setting-invoice-reg-number').value = ci.invoiceRegNumber || '';
    document.getElementById('setting-zip-code').value = ci.zipCode || '';
    document.getElementById('setting-address').value = ci.address || '';
    document.getElementById('setting-phone').value = ci.phone || '';
    document.getElementById('setting-fax').value = ci.fax || '';
    document.getElementById('setting-bank-info').value = ci.bankInfo || '';
    document.getElementById('setting-seal-text').value = ci.sealText || '';
    document.getElementById('setting-fiscal-start').value = ci.fiscalStartMonth || '4';

    // 税設定
    const ts = await loadTaxSettings();
    document.getElementById('setting-standard-rate').value = Math.round(ts.standardRate * 100);
    document.getElementById('setting-reduced-rate').value = Math.round(ts.reducedRate * 100);
    document.getElementById('setting-rounding').value = ts.roundingMethod;
    document.getElementById('setting-calc-method').value = ts.calcMethod;

    // 表示設定
    const ds = await loadDisplaySettings();
    document.getElementById('setting-default-doc-type').value = ds.defaultDocType;
    document.getElementById('setting-date-format').value = ds.dateFormat;
    document.getElementById('setting-show-seal').checked = ds.showSeal;
    document.getElementById('setting-show-bank').checked = ds.showBank;
    document.getElementById('setting-estimate-valid-days').value = ds.estimateValidDays;

    // 帳票タブ表示設定
    CONFIGURABLE_DOC_TYPES.forEach(type => {
        document.getElementById('setting-show-' + type).checked = !ds.hiddenDocTypes.includes(type);
    });

    // 帳票番号設定を生成
    renderNumberFormatSettings();

    // アプリ情報
    if (window.APP_INFO) {
        document.getElementById('app-version').textContent = APP_INFO.version;
        document.getElementById('app-build-time').textContent = APP_INFO.buildTime;
    }
}

function renderNumberFormatSettings() {
    const container = document.getElementById('number-format-settings');
    container.innerHTML = '';
    const types = Object.keys(DOC_TYPE_LABELS);

    loadNumberFormat().then(nf => {
        types.forEach(type => {
            const fmt = (nf && nf[type]) || {};
            const prefix = fmt.prefix || DEFAULT_DOC_PREFIXES[type] || 'DOC';
            const sep = fmt.separator || '-';
            const includeYear = fmt.includeYear !== false;
            const digits = fmt.digits || 4;

            const div = document.createElement('div');
            div.className = 'number-format-item';
            div.innerHTML = `
                <label>${escapeHtml(DOC_TYPE_LABELS[type])}</label>
                <input type="text" data-type="${type}" data-field="prefix" value="${escapeHtml(prefix)}" maxlength="6" placeholder="接頭辞">
                <select data-type="${type}" data-field="separator">
                    <option value="-" ${sep === '-' ? 'selected' : ''}>-</option>
                    <option value="_" ${sep === '_' ? 'selected' : ''}>_</option>
                    <option value="" ${sep === '' ? 'selected' : ''}>なし</option>
                </select>
                <label class="checkbox-label" style="width:auto">
                    <input type="checkbox" data-type="${type}" data-field="includeYear" ${includeYear ? 'checked' : ''}> 年度
                </label>
                <input type="number" data-type="${type}" data-field="digits" value="${digits}" min="1" max="8" style="width:48px">
                <span class="number-format-preview" data-type="${type}"></span>
            `;
            container.appendChild(div);
            updateNumberPreview(type);
        });

        // プレビュー更新イベント
        container.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('input', () => {
                const type = el.dataset.type;
                if (type) updateNumberPreview(type);
            });
        });
    });
}

function updateNumberPreview(type) {
    const container = document.getElementById('number-format-settings');
    const prefix = container.querySelector(`input[data-type="${type}"][data-field="prefix"]`).value;
    const sep = container.querySelector(`select[data-type="${type}"][data-field="separator"]`).value;
    const includeYear = container.querySelector(`input[data-type="${type}"][data-field="includeYear"]`).checked;
    const digits = parseInt(container.querySelector(`input[data-type="${type}"][data-field="digits"]`).value) || 4;
    const preview = container.querySelector(`.number-format-preview[data-type="${type}"]`);

    const num = '1'.padStart(digits, '0');
    if (includeYear) {
        preview.textContent = `例: ${prefix}${sep}2026${sep}${num}`;
    } else {
        preview.textContent = `例: ${prefix}${sep}${num}`;
    }
}

function initSettingsEvents() {
    // 自社情報保存
    document.getElementById('btn-save-company').addEventListener('click', async () => {
        const regNum = document.getElementById('setting-invoice-reg-number').value.trim();
        if (regNum) {
            const v = validateInvoiceRegNumber(regNum);
            if (!v.valid) {
                showToast(v.errors.join('\n'), 'error');
                return;
            }
        }
        await saveSetting('company_info', {
            companyName: document.getElementById('setting-company-name').value.trim(),
            invoiceRegNumber: regNum,
            zipCode: document.getElementById('setting-zip-code').value.trim(),
            address: document.getElementById('setting-address').value.trim(),
            phone: document.getElementById('setting-phone').value.trim(),
            fax: document.getElementById('setting-fax').value.trim(),
            bankInfo: document.getElementById('setting-bank-info').value.trim(),
            sealText: document.getElementById('setting-seal-text').value.trim(),
            fiscalStartMonth: parseInt(document.getElementById('setting-fiscal-start').value)
        });
        showToast('自社情報を保存しました', 'success');
    });

    // 税設定保存
    document.getElementById('btn-save-tax').addEventListener('click', async () => {
        await saveSetting('tax_settings', {
            standardRate: parseInt(document.getElementById('setting-standard-rate').value) / 100,
            reducedRate: parseInt(document.getElementById('setting-reduced-rate').value) / 100,
            roundingMethod: document.getElementById('setting-rounding').value,
            calcMethod: document.getElementById('setting-calc-method').value
        });
        showToast('税設定を保存しました', 'success');
    });

    // 帳票番号設定保存
    document.getElementById('btn-save-number-format').addEventListener('click', async () => {
        const container = document.getElementById('number-format-settings');
        const nf = {};
        Object.keys(DOC_TYPE_LABELS).forEach(type => {
            nf[type] = {
                prefix: container.querySelector(`input[data-type="${type}"][data-field="prefix"]`).value.trim(),
                separator: container.querySelector(`select[data-type="${type}"][data-field="separator"]`).value,
                includeYear: container.querySelector(`input[data-type="${type}"][data-field="includeYear"]`).checked,
                digits: parseInt(container.querySelector(`input[data-type="${type}"][data-field="digits"]`).value) || 4
            };
        });
        await saveSetting('number_format', nf);
        showToast('帳票番号設定を保存しました', 'success');
    });

    // 表示設定保存
    document.getElementById('btn-save-display').addEventListener('click', async () => {
        const hiddenDocTypes = CONFIGURABLE_DOC_TYPES.filter(type =>
            !document.getElementById('setting-show-' + type).checked
        );
        await saveSetting('display_settings', {
            defaultDocType: document.getElementById('setting-default-doc-type').value,
            dateFormat: document.getElementById('setting-date-format').value,
            showSeal: document.getElementById('setting-show-seal').checked,
            showBank: document.getElementById('setting-show-bank').checked,
            estimateValidDays: parseInt(document.getElementById('setting-estimate-valid-days').value) || 30,
            hiddenDocTypes: hiddenDocTypes
        });
        applyDocTabVisibility(hiddenDocTypes);
        showToast('表示設定を保存しました', 'success');
    });

    // データ管理
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('import-file').addEventListener('change', importData);
    document.getElementById('btn-delete-all').addEventListener('click', deleteAllData);
    document.getElementById('import-sample-btn').addEventListener('click', importSampleData);
    window.addEventListener('online', updateSampleImportAvailability);
    window.addEventListener('offline', updateSampleImportAvailability);
    updateSampleImportAvailability();
}

// ============================================================
// 取引先 CRUD
// ============================================================
async function loadPartnerList() {
    const partners = await getAllFromStore('partners');
    const search = document.getElementById('partner-search').value.toLowerCase();
    const typeFilter = document.getElementById('partner-type-filter').value;

    let filtered = partners;
    if (search) {
        filtered = filtered.filter(p =>
            (p.name || '').toLowerCase().includes(search) ||
            (p.nameKana || '').toLowerCase().includes(search) ||
            (p.partnerCode || '').toLowerCase().includes(search)
        );
    }
    if (typeFilter) {
        filtered = filtered.filter(p => p.partnerType === typeFilter || p.partnerType === 'both');
    }

    filtered.sort((a, b) => (a.partnerCode || '').localeCompare(b.partnerCode || ''));

    const list = document.getElementById('partner-list');
    const empty = document.getElementById('partner-empty');

    if (filtered.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    list.innerHTML = filtered.map(p => {
        const typeClass = p.partnerType === 'customer' ? 'type-customer' :
                          p.partnerType === 'supplier' ? 'type-supplier' : 'type-both';
        const typeLabel = p.partnerType === 'customer' ? '得意先' :
                          p.partnerType === 'supplier' ? '仕入先' : '得意先＆仕入先';
        return `
            <div class="partner-card" data-id="${escapeHtml(p.id)}">
                <div class="partner-card-header">
                    <div>
                        <div class="partner-card-name">${escapeHtml(p.name)}</div>
                        <div class="partner-card-code">${escapeHtml(p.partnerCode || '')}</div>
                    </div>
                    <span class="partner-card-type ${typeClass}">${typeLabel}</span>
                </div>
                <div class="partner-card-details">
                    ${p.address1 ? escapeHtml(p.address1) + '<br>' : ''}
                    ${p.phone ? 'TEL: ' + escapeHtml(p.phone) : ''}
                    ${p.contactPerson ? ' / 担当: ' + escapeHtml(p.contactPerson) : ''}
                </div>
                <div class="partner-card-actions">
                    <button class="btn btn-sm btn-secondary" onclick="editPartner('${p.id}')">編集</button>
                    <button class="btn btn-sm btn-danger" onclick="deletePartner('${p.id}', '${escapeHtml(p.name)}')">削除</button>
                </div>
            </div>`;
    }).join('');
}

function openPartnerForm(partner) {
    const overlay = document.getElementById('partner-form-overlay');
    const title = document.getElementById('partner-form-title');

    if (partner) {
        title.textContent = '取引先編集';
        document.getElementById('partner-edit-id').value = partner.id;
        document.getElementById('partner-code').value = partner.partnerCode || '';
        document.getElementById('partner-type').value = partner.partnerType || 'customer';
        document.getElementById('partner-name').value = partner.name || '';
        document.getElementById('partner-name-kana').value = partner.nameKana || '';
        document.getElementById('partner-honorific').value = partner.honorific || '御中';
        document.getElementById('partner-zip').value = partner.zipCode || '';
        document.getElementById('partner-address1').value = partner.address1 || '';
        document.getElementById('partner-address2').value = partner.address2 || '';
        document.getElementById('partner-phone').value = partner.phone || '';
        document.getElementById('partner-fax').value = partner.fax || '';
        document.getElementById('partner-email').value = partner.email || '';
        document.getElementById('partner-contact').value = partner.contactPerson || '';
        document.getElementById('partner-reg-number').value = partner.invoiceRegNumber || '';
        document.getElementById('partner-payment-terms').value = partner.paymentTerms || '';
        document.getElementById('partner-notes').value = partner.notes || '';
    } else {
        title.textContent = '取引先登録';
        document.getElementById('partner-edit-id').value = '';
        document.getElementById('partner-code').value = '(自動採番)';
        document.getElementById('partner-type').value = 'customer';
        document.getElementById('partner-name').value = '';
        document.getElementById('partner-name-kana').value = '';
        document.getElementById('partner-honorific').value = '御中';
        document.getElementById('partner-zip').value = '';
        document.getElementById('partner-address1').value = '';
        document.getElementById('partner-address2').value = '';
        document.getElementById('partner-phone').value = '';
        document.getElementById('partner-fax').value = '';
        document.getElementById('partner-email').value = '';
        document.getElementById('partner-contact').value = '';
        document.getElementById('partner-reg-number').value = '';
        document.getElementById('partner-payment-terms').value = '';
        document.getElementById('partner-notes').value = '';
    }
    overlay.style.display = 'flex';
}

async function savePartner() {
    const editId = document.getElementById('partner-edit-id').value;
    const data = {
        name: document.getElementById('partner-name').value.trim(),
        nameKana: document.getElementById('partner-name-kana').value.trim(),
        partnerType: document.getElementById('partner-type').value,
        honorific: document.getElementById('partner-honorific').value,
        zipCode: document.getElementById('partner-zip').value.trim(),
        address1: document.getElementById('partner-address1').value.trim(),
        address2: document.getElementById('partner-address2').value.trim(),
        phone: document.getElementById('partner-phone').value.trim(),
        fax: document.getElementById('partner-fax').value.trim(),
        email: document.getElementById('partner-email').value.trim(),
        contactPerson: document.getElementById('partner-contact').value.trim(),
        invoiceRegNumber: document.getElementById('partner-reg-number').value.trim(),
        paymentTerms: document.getElementById('partner-payment-terms').value.trim(),
        notes: document.getElementById('partner-notes').value.trim()
    };

    // バリデーション
    const v = validatePartner(data);
    if (!v.valid) {
        showToast(v.errors.join('\n'), 'error');
        return;
    }

    const now = new Date().toISOString();
    if (editId) {
        data.id = editId;
        data.partnerCode = document.getElementById('partner-code').value;
        data.updatedAt = now;
        const existing = await getFromStore('partners', editId);
        data.createdAt = existing.createdAt;
        await updateInStore('partners', data);
    } else {
        const allPartners = await getAllFromStore('partners');
        const existingCodes = allPartners.map(p => p.partnerCode);
        data.id = generateId();
        data.partnerCode = generatePartnerCode(existingCodes);
        data.createdAt = now;
        data.updatedAt = now;
        await addToStore('partners', data);
    }

    document.getElementById('partner-form-overlay').style.display = 'none';
    loadPartnerList();
}

async function editPartner(id) {
    const partner = await getFromStore('partners', id);
    if (partner) openPartnerForm(partner);
}

async function deletePartner(id, name) {
    // 使用中チェック
    const docs = await getByIndex('documents', 'partnerId', id);
    if (docs.length > 0) {
        showToast(`この取引先は${docs.length}件の帳票で使用されているため削除できません。`, 'error');
        return;
    }
    showConfirm(`取引先「${name}」を削除しますか？`, async () => {
        await deleteFromStore('partners', id);
        loadPartnerList();
    });
}

function initPartnerEvents() {
    document.getElementById('btn-new-partner').addEventListener('click', () => openPartnerForm(null));
    document.getElementById('btn-save-partner').addEventListener('click', savePartner);
    document.getElementById('btn-cancel-partner').addEventListener('click', () => {
        document.getElementById('partner-form-overlay').style.display = 'none';
    });
    document.getElementById('btn-close-partner-form').addEventListener('click', () => {
        document.getElementById('partner-form-overlay').style.display = 'none';
    });
    document.getElementById('partner-search').addEventListener('input', loadPartnerList);
    document.getElementById('partner-type-filter').addEventListener('change', loadPartnerList);
}

// ============================================================
// 品目 CRUD
// ============================================================
async function loadItemList() {
    const items = await getAllFromStore('items');
    const search = document.getElementById('item-search').value.toLowerCase();

    let filtered = items;
    if (search) {
        filtered = filtered.filter(item =>
            (item.name || '').toLowerCase().includes(search) ||
            (item.itemCode || '').toLowerCase().includes(search)
        );
    }

    filtered.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.itemCode || '').localeCompare(b.itemCode || ''));

    const tbody = document.getElementById('item-table-body');
    const empty = document.getElementById('item-empty');
    const tableContainer = document.getElementById('item-list');

    if (filtered.length === 0) {
        tableContainer.style.display = 'none';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    tableContainer.style.display = 'block';

    const taxLabels = { standard: '標準(10%)', reduced: '軽減(8%)', exempt: '非課税' };
    const taxClasses = { standard: 'tax-standard', reduced: 'tax-reduced', exempt: 'tax-exempt' };

    tbody.innerHTML = filtered.map(item => `
        <tr>
            <td style="font-family:monospace;font-size:12px">${escapeHtml(item.itemCode || '')}</td>
            <td>${escapeHtml(item.name)}</td>
            <td style="text-align:right">${item.defaultUnitPrice != null ? formatYen(item.defaultUnitPrice) : '-'}</td>
            <td>${escapeHtml(item.unit || '')}</td>
            <td><span class="tax-badge ${taxClasses[item.taxRateType] || 'tax-standard'}">${taxLabels[item.taxRateType] || '標準'}</span></td>
            <td>
                <div style="display:flex;gap:4px">
                    <button class="btn btn-sm btn-secondary" onclick="editItem('${item.id}')">編集</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteItem('${item.id}', '${escapeHtml(item.name)}')">削除</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openItemForm(item) {
    const overlay = document.getElementById('item-form-overlay');
    const title = document.getElementById('item-form-title');

    if (item) {
        title.textContent = '品目編集';
        document.getElementById('item-edit-id').value = item.id;
        document.getElementById('item-code').value = item.itemCode || '';
        document.getElementById('item-name').value = item.name || '';
        document.getElementById('item-description').value = item.description || '';
        document.getElementById('item-unit-price').value = item.defaultUnitPrice || '';
        document.getElementById('item-unit').value = item.unit || '式';
        document.getElementById('item-tax-rate').value = item.taxRateType || 'standard';
        document.getElementById('item-sort-order').value = item.sortOrder || 0;
    } else {
        title.textContent = '品目登録';
        document.getElementById('item-edit-id').value = '';
        document.getElementById('item-code').value = '(自動採番)';
        document.getElementById('item-name').value = '';
        document.getElementById('item-description').value = '';
        document.getElementById('item-unit-price').value = '';
        document.getElementById('item-unit').value = '式';
        document.getElementById('item-tax-rate').value = 'standard';
        document.getElementById('item-sort-order').value = 0;
    }
    overlay.style.display = 'flex';
}

async function saveItem() {
    const editId = document.getElementById('item-edit-id').value;
    const name = document.getElementById('item-name').value.trim();
    if (!name) {
        showToast('品目名は必須です', 'error');
        return;
    }

    const data = {
        name,
        description: document.getElementById('item-description').value.trim(),
        defaultUnitPrice: parseFloat(document.getElementById('item-unit-price').value) || 0,
        unit: document.getElementById('item-unit').value,
        taxRateType: document.getElementById('item-tax-rate').value,
        sortOrder: parseInt(document.getElementById('item-sort-order').value) || 0
    };

    const now = new Date().toISOString();
    if (editId) {
        data.id = editId;
        data.itemCode = document.getElementById('item-code').value;
        data.updatedAt = now;
        const existing = await getFromStore('items', editId);
        data.createdAt = existing.createdAt;
        await updateInStore('items', data);
    } else {
        const allItems = await getAllFromStore('items');
        const existingCodes = allItems.map(i => i.itemCode);
        data.id = generateId();
        data.itemCode = generateItemCode(existingCodes);
        data.createdAt = now;
        data.updatedAt = now;
        await addToStore('items', data);
    }

    document.getElementById('item-form-overlay').style.display = 'none';
    loadItemList();
}

async function editItem(id) {
    const item = await getFromStore('items', id);
    if (item) openItemForm(item);
}

async function deleteItem(id, name) {
    showConfirm(`品目「${name}」を削除しますか？`, async () => {
        await deleteFromStore('items', id);
        loadItemList();
    });
}

function initItemEvents() {
    document.getElementById('btn-new-item').addEventListener('click', () => openItemForm(null));
    document.getElementById('btn-save-item').addEventListener('click', saveItem);
    document.getElementById('btn-cancel-item').addEventListener('click', () => {
        document.getElementById('item-form-overlay').style.display = 'none';
    });
    document.getElementById('btn-close-item-form').addEventListener('click', () => {
        document.getElementById('item-form-overlay').style.display = 'none';
    });
    document.getElementById('item-search').addEventListener('input', loadItemList);
}

// ============================================================
// 帳票一覧
// ============================================================
async function loadDocList() {
    const allDocs = await getByIndex('documents', 'docType', currentDocType);
    const search = document.getElementById('doc-search').value.toLowerCase();
    const statusFilter = document.getElementById('doc-status-filter').value;

    let filtered = allDocs;
    if (search) {
        filtered = filtered.filter(d =>
            (d.docNumber || '').toLowerCase().includes(search) ||
            (d.partnerSnapshot && d.partnerSnapshot.name || '').toLowerCase().includes(search)
        );
    }
    if (statusFilter) {
        filtered = filtered.filter(d => d.status === statusFilter);
    }

    // 日付降順
    filtered.sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));

    const list = document.getElementById('doc-list');
    const empty = document.getElementById('doc-empty');

    if (filtered.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    const displaySettings = await loadDisplaySettings();

    list.innerHTML = filtered.map(d => {
        const statusClass = 'status-' + (d.status || 'draft');
        const statusLabel = STATUS_LABELS[d.status] || '下書き';
        const partnerName = d.partnerSnapshot ? d.partnerSnapshot.name : '(取引先未設定)';
        const total = d.taxSummary ? d.taxSummary.total : 0;
        const dateStr = displaySettings.dateFormat === 'japanese' ?
            formatDateJapanese(d.issueDate) : (d.issueDate || '');

        // 変換可能先
        const convTargets = CONVERSION_RULES[d.docType] || [];

        return `
            <div class="doc-card" data-id="${escapeHtml(d.id)}">
                <div class="doc-card-main">
                    <div class="doc-card-number">${escapeHtml(d.docNumber || '(未採番)')}</div>
                    <div class="doc-card-partner">${escapeHtml(partnerName)}</div>
                    <div class="doc-card-meta">
                        <span>${escapeHtml(dateStr)}</span>
                        <span class="status-badge ${statusClass}">${statusLabel}</span>
                    </div>
                </div>
                <div class="doc-card-right">
                    <div class="doc-card-amount">${formatYen(total)}</div>
                    <div class="doc-card-actions">
                        <button class="btn btn-sm btn-secondary" onclick="showDocDetail('${d.id}')" title="詳細">詳細</button>
                        <button class="btn btn-sm btn-secondary" onclick="editDocument('${d.id}')" title="編集">編集</button>
                        <button class="btn btn-sm btn-secondary" onclick="duplicateDocument('${d.id}')" title="複製">複製</button>
                        ${convTargets.length > 0 ? `<button class="btn btn-sm btn-secondary" onclick="showConvertMenu('${d.id}', event)" title="変換">変換</button>` : ''}
                        <button class="btn btn-sm btn-secondary" onclick="printDocument('${d.id}')" title="印刷">印刷</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteDocument('${d.id}')" title="削除">削除</button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

function initDocListEvents() {
    document.getElementById('btn-new-doc').addEventListener('click', () => openDocEditor(null));
    document.getElementById('doc-search').addEventListener('input', loadDocList);
    document.getElementById('doc-status-filter').addEventListener('change', loadDocList);
}

// ============================================================
// 帳票エディタ
// ============================================================
async function openDocEditor(doc) {
    editingDocId = doc ? doc.id : null;
    const overlay = document.getElementById('doc-editor-overlay');
    const title = document.getElementById('doc-editor-title');

    title.textContent = doc ? `${DOC_TYPE_LABELS[doc.docType] || '帳票'}編集` : `${DOC_TYPE_LABELS[currentDocType]}新規作成`;

    // 取引先プルダウン読込
    await populatePartnerSelect();

    if (doc) {
        document.getElementById('doc-number').value = doc.docNumber || '(未採番)';
        document.getElementById('doc-issue-date').value = doc.issueDate || '';
        document.getElementById('doc-status').value = doc.status || 'draft';
        document.getElementById('doc-partner').value = doc.partnerId || '';
        document.getElementById('doc-notes').value = doc.notes || '';
        document.getElementById('doc-internal-memo').value = doc.internalMemo || '';

        // 種別固有フィールド
        showTypeSpecificFields(doc.docType);
        document.getElementById('doc-valid-until').value = doc.validUntil || '';
        document.getElementById('doc-due-date').value = doc.dueDate || '';
        document.getElementById('doc-delivery-date').value = doc.deliveryDate || '';
        document.getElementById('doc-receipt-of').value = doc.receiptOf || '';
        document.getElementById('doc-payment-method').value = doc.paymentMethod || '';

        // 明細行
        renderLineItems(doc.lineItems || []);

        // 変換元リンク
        if (doc.sourceDocId) {
            const sourceLink = document.getElementById('doc-source-link');
            sourceLink.innerHTML = `この${DOC_TYPE_LABELS[doc.docType]}は${DOC_TYPE_LABELS[doc.sourceDocType] || '帳票'} <a onclick="editDocument('${escapeHtml(doc.sourceDocId)}')">${escapeHtml(doc.sourceDocNumber || '')}</a> から作成されました`;
            sourceLink.style.display = 'block';
        } else {
            document.getElementById('doc-source-link').style.display = 'none';
        }

        // 税サマリー
        if (doc.taxSummary) {
            renderTaxSummary(doc.taxSummary, doc.docType);
        }
    } else {
        const today = new Date().toISOString().slice(0, 10);
        document.getElementById('doc-number').value = '(自動採番)';
        document.getElementById('doc-issue-date').value = today;
        document.getElementById('doc-status').value = 'draft';
        document.getElementById('doc-partner').value = '';
        document.getElementById('doc-notes').value = '';
        document.getElementById('doc-internal-memo').value = '';

        showTypeSpecificFields(currentDocType);

        // 見積有効期限のデフォルト
        if (currentDocType === 'estimate') {
            const ds = await loadDisplaySettings();
            const validDate = new Date();
            validDate.setDate(validDate.getDate() + ds.estimateValidDays);
            document.getElementById('doc-valid-until').value = validDate.toISOString().slice(0, 10);
        } else {
            document.getElementById('doc-valid-until').value = '';
        }
        document.getElementById('doc-due-date').value = '';
        document.getElementById('doc-delivery-date').value = '';
        document.getElementById('doc-receipt-of').value = '';
        document.getElementById('doc-payment-method').value = '';

        renderLineItems([]);
        document.getElementById('doc-source-link').style.display = 'none';
        renderTaxSummary({ subtotal: 0, taxDetails: [], totalTax: 0, total: 0 }, currentDocType);
    }

    // 発行者情報プレビュー
    await updateSellerPreview();

    overlay.style.display = 'flex';
}

function showTypeSpecificFields(docType) {
    const fields = {
        'field-valid-until': ['estimate'],
        'field-due-date': ['invoice'],
        'field-delivery-date': ['delivery_note'],
        'field-receipt-of': ['receipt'],
        'field-payment-method': ['invoice', 'receipt']
    };
    Object.keys(fields).forEach(fieldId => {
        const el = document.getElementById(fieldId);
        el.style.display = fields[fieldId].includes(docType) ? 'block' : 'none';
    });

    // 種別固有フィールドカードの表示制御
    const card = document.getElementById('doc-type-specific-fields');
    const hasFields = Object.keys(fields).some(fieldId => fields[fieldId].includes(docType));
    card.style.display = hasFields ? 'block' : 'none';
}

async function populatePartnerSelect() {
    const select = document.getElementById('doc-partner');
    const partners = await getAllFromStore('partners');
    partners.sort((a, b) => (a.partnerCode || '').localeCompare(b.partnerCode || ''));

    select.innerHTML = '<option value="">取引先を選択...</option>';
    partners.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `${p.partnerCode || ''} ${p.name}`;
        select.appendChild(option);
    });
}

async function updateSellerPreview() {
    const ci = await loadCompanyInfo();
    const preview = document.getElementById('seller-info-preview');
    if (!ci.companyName) {
        preview.innerHTML = '<p class="info-hint">設定タブで自社情報を入力してください</p>';
        return;
    }
    preview.innerHTML = `
        <strong>${escapeHtml(ci.companyName)}</strong><br>
        ${ci.invoiceRegNumber ? '登録番号: ' + escapeHtml(ci.invoiceRegNumber) + '<br>' : ''}
        ${ci.zipCode ? '〒' + escapeHtml(ci.zipCode) + '<br>' : ''}
        ${ci.address ? escapeHtml(ci.address) + '<br>' : ''}
        ${ci.phone ? 'TEL: ' + escapeHtml(ci.phone) : ''}
        ${ci.fax ? ' / FAX: ' + escapeHtml(ci.fax) : ''}
    `;
}

// ============================================================
// 明細行操作
// ============================================================
let lineItemCounter = 0;

function renderLineItems(items) {
    const tbody = document.getElementById('line-items-body');
    tbody.innerHTML = '';
    lineItemCounter = 0;

    if (items.length === 0) {
        addLineItem();
    } else {
        items.forEach(item => addLineItem(item));
    }
}

function addLineItem(data) {
    lineItemCounter++;
    const tbody = document.getElementById('line-items-body');
    const tr = document.createElement('tr');
    tr.dataset.lineId = data ? data.id : ('new_' + lineItemCounter);
    tr.innerHTML = `
        <td class="col-no" style="text-align:center">${lineItemCounter}</td>
        <td class="col-item">
            <input type="text" class="line-name" value="${escapeHtml((data && data.name) || '')}" placeholder="品目名" list="item-datalist">
        </td>
        <td class="col-desc">
            <input type="text" class="line-desc" value="${escapeHtml((data && data.description) || '')}">
        </td>
        <td class="col-qty">
            <input type="number" class="line-qty" value="${(data && data.quantity) || 1}" min="0" step="0.01">
        </td>
        <td class="col-unit">
            <select class="line-unit">
                <option value="">-</option>
                ${UNIT_OPTIONS.map(u => `<option value="${u}" ${data && data.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
        </td>
        <td class="col-price">
            <input type="number" class="line-price" value="${(data && data.unitPrice) || 0}" min="0" step="1">
        </td>
        <td class="col-tax">
            <select class="line-tax">
                <option value="standard" ${!data || data.taxRateType === 'standard' ? 'selected' : ''}>10%</option>
                <option value="reduced" ${data && data.taxRateType === 'reduced' ? 'selected' : ''}>8%</option>
                <option value="exempt" ${data && data.taxRateType === 'exempt' ? 'selected' : ''}>非課税</option>
            </select>
        </td>
        <td class="col-amount line-amount">${formatYen(data ? data.amount || calcLineAmount(data.quantity, data.unitPrice) : 0)}</td>
        <td class="col-action">
            <button class="btn-remove-line" onclick="removeLineItem(this)" title="削除">&times;</button>
        </td>
    `;

    // 金額自動計算
    const qtyInput = tr.querySelector('.line-qty');
    const priceInput = tr.querySelector('.line-price');
    const amountCell = tr.querySelector('.line-amount');

    const recalc = () => {
        const qty = parseFloat(qtyInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;
        const amount = calcLineAmount(qty, price);
        amountCell.textContent = formatYen(amount);
        recalculateTaxSummary();
    };
    qtyInput.addEventListener('input', recalc);
    priceInput.addEventListener('input', recalc);
    tr.querySelector('.line-tax').addEventListener('change', () => recalculateTaxSummary());

    // 品目名での自動入力
    const nameInput = tr.querySelector('.line-name');
    nameInput.addEventListener('change', async () => {
        const items = await getAllFromStore('items');
        const match = items.find(i => i.name === nameInput.value);
        if (match) {
            priceInput.value = match.defaultUnitPrice || 0;
            tr.querySelector('.line-unit').value = match.unit || '式';
            tr.querySelector('.line-tax').value = match.taxRateType || 'standard';
            tr.querySelector('.line-desc').value = match.description || '';
            recalc();
        }
    });

    tbody.appendChild(tr);
    updateItemDatalist();
}

function removeLineItem(btn) {
    const tr = btn.closest('tr');
    tr.remove();
    renumberLines();
    recalculateTaxSummary();
}

function renumberLines() {
    const rows = document.querySelectorAll('#line-items-body tr');
    rows.forEach((row, i) => {
        row.querySelector('.col-no').textContent = i + 1;
    });
    lineItemCounter = rows.length;
}

async function updateItemDatalist() {
    let datalist = document.getElementById('item-datalist');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'item-datalist';
        document.body.appendChild(datalist);
    }
    const items = await getAllFromStore('items');
    datalist.innerHTML = items.map(i => `<option value="${escapeHtml(i.name)}">`).join('');
}

function getLineItemsFromEditor() {
    const rows = document.querySelectorAll('#line-items-body tr');
    return Array.from(rows).map((row, i) => ({
        id: row.dataset.lineId || generateId(),
        sortOrder: i + 1,
        name: row.querySelector('.line-name').value.trim(),
        description: row.querySelector('.line-desc').value.trim(),
        quantity: parseFloat(row.querySelector('.line-qty').value) || 0,
        unit: row.querySelector('.line-unit').value,
        unitPrice: parseFloat(row.querySelector('.line-price').value) || 0,
        taxRateType: row.querySelector('.line-tax').value,
        amount: calcLineAmount(
            parseFloat(row.querySelector('.line-qty').value) || 0,
            parseFloat(row.querySelector('.line-price').value) || 0
        )
    }));
}

async function recalculateTaxSummary() {
    const lineItems = getLineItemsFromEditor();
    const taxSettings = await loadTaxSettings();
    const summary = calculateTaxSummary(lineItems, taxSettings);
    const docType = editingDocId ? (await getFromStore('documents', editingDocId)).docType : currentDocType;
    renderTaxSummary(summary, docType);
}

function renderTaxSummary(summary, docType) {
    document.getElementById('summary-subtotal').textContent = formatYen(summary.subtotal);
    document.getElementById('summary-total-tax').textContent = formatYen(summary.totalTax);
    document.getElementById('summary-total').textContent = formatYen(summary.total);

    const detailDiv = document.getElementById('summary-tax-details');
    detailDiv.innerHTML = (summary.taxDetails || []).map(d => {
        const label = d.rateType === 'standard' ? '10%対象' :
                      d.rateType === 'reduced' ? '8%対象（軽減）' : '非課税';
        return `<div class="summary-tax-row">
            <span>${label} ${formatYen(d.taxableAmount)}</span>
            <span>消費税 ${formatYen(d.taxAmount)}</span>
        </div>`;
    }).join('');

    // 領収書の場合、収入印紙通知
    const stampNotice = document.getElementById('stamp-notice');
    if (docType === 'receipt' && isRevenueStampRequired(summary.subtotal)) {
        const stampAmount = getRevenueStampAmount(summary.subtotal);
        stampNotice.innerHTML = `収入印紙が必要です（税抜金額 ${formatYen(summary.subtotal)}）→ 印紙税額: ${formatYen(stampAmount)}`;
        stampNotice.style.display = 'block';
    } else {
        stampNotice.style.display = 'none';
    }
}

// ============================================================
// 帳票保存
// ============================================================
async function saveDocument() {
    const docType = editingDocId ? (await getFromStore('documents', editingDocId)).docType : currentDocType;
    const lineItems = getLineItemsFromEditor();
    const taxSettings = await loadTaxSettings();
    const taxSummary = calculateTaxSummary(lineItems, taxSettings);
    const partnerId = document.getElementById('doc-partner').value;
    const companyInfo = await loadCompanyInfo();

    // パートナースナップショット
    let partnerSnapshot = null;
    if (partnerId) {
        const p = await getFromStore('partners', partnerId);
        if (p) {
            partnerSnapshot = {
                name: p.name, honorific: p.honorific, zipCode: p.zipCode,
                address1: p.address1, address2: p.address2,
                contactPerson: p.contactPerson, invoiceRegNumber: p.invoiceRegNumber
            };
        }
    }

    const doc = {
        docType,
        status: document.getElementById('doc-status').value,
        issueDate: document.getElementById('doc-issue-date').value,
        partnerId,
        partnerSnapshot,
        lineItems,
        taxSummary,
        notes: document.getElementById('doc-notes').value.trim(),
        internalMemo: document.getElementById('doc-internal-memo').value.trim(),
        sellerSnapshot: {
            companyName: companyInfo.companyName || '',
            invoiceRegNumber: companyInfo.invoiceRegNumber || '',
            zipCode: companyInfo.zipCode || '',
            address: companyInfo.address || '',
            phone: companyInfo.phone || '',
            fax: companyInfo.fax || '',
            bankInfo: companyInfo.bankInfo || '',
            sealText: companyInfo.sealText || ''
        },
        updatedAt: new Date().toISOString()
    };

    // 種別固有フィールド
    if (docType === 'estimate') doc.validUntil = document.getElementById('doc-valid-until').value;
    if (docType === 'invoice') {
        doc.dueDate = document.getElementById('doc-due-date').value;
        doc.paymentMethod = document.getElementById('doc-payment-method').value;
    }
    if (docType === 'delivery_note') doc.deliveryDate = document.getElementById('doc-delivery-date').value;
    if (docType === 'receipt') {
        doc.receiptOf = document.getElementById('doc-receipt-of').value.trim();
        doc.paymentMethod = document.getElementById('doc-payment-method').value;
        doc.revenueStampRequired = isRevenueStampRequired(taxSummary.subtotal);
        doc.revenueStampAmount = getRevenueStampAmount(taxSummary.subtotal);
    }

    // バリデーション
    const v = validateDocument(doc);
    if (!v.valid) {
        showToast(v.errors.join('\n'), 'error');
        return;
    }

    if (editingDocId) {
        // 更新
        const existing = await getFromStore('documents', editingDocId);
        doc.id = editingDocId;
        doc.docNumber = existing.docNumber;
        doc.createdAt = existing.createdAt;
        doc.sourceDocId = existing.sourceDocId;
        doc.sourceDocType = existing.sourceDocType;
        doc.sourceDocNumber = existing.sourceDocNumber;
        doc.childDocIds = existing.childDocIds || [];
        await updateInStore('documents', doc);
    } else {
        // 新規: 帳票番号を採番
        doc.id = generateId();
        doc.createdAt = new Date().toISOString();
        doc.childDocIds = [];

        const numberFormat = await loadNumberFormat();
        const fmt = numberFormat[docType] || {};
        const fiscalStartMonth = (companyInfo.fiscalStartMonth || 4);
        const fiscalYear = getFiscalYear(doc.issueDate, fiscalStartMonth);
        const seqKey = `${docType}_${fiscalYear}`;

        // アトミック採番
        const tx = db.transaction(['doc_sequences', 'documents'], 'readwrite');
        const seqStore = tx.objectStore('doc_sequences');
        const docStore = tx.objectStore('documents');

        const seqReq = seqStore.get(seqKey);
        await new Promise((resolve, reject) => {
            seqReq.onsuccess = () => {
                const seq = seqReq.result || { id: seqKey, lastNumber: 0 };
                const result = generateDocNumber(docType, seq.lastNumber, fmt, fiscalYear);
                doc.docNumber = result.docNumber;
                seq.lastNumber = result.nextNumber;
                seqStore.put(seq);
                docStore.add(doc);
                resolve();
            };
            seqReq.onerror = () => reject(seqReq.error);
            tx.oncomplete = () => {};
            tx.onerror = () => reject(tx.error);
        });

        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    document.getElementById('doc-editor-overlay').style.display = 'none';
    loadDocList();
}

async function editDocument(id) {
    const doc = await getFromStore('documents', id);
    if (doc) {
        currentDocType = doc.docType;
        // サブタブを切り替え
        document.querySelectorAll('#doc-sub-tab-nav .sub-tab-btn').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`#doc-sub-tab-nav .sub-tab-btn[data-doc-type="${doc.docType}"]`);
        if (btn) btn.classList.add('active');
        openDocEditor(doc);
    }
}

async function duplicateDocument(id) {
    const doc = await getFromStore('documents', id);
    if (!doc) return;

    const newDoc = { ...doc };
    delete newDoc.id;
    delete newDoc.docNumber;
    newDoc.status = 'draft';
    newDoc.sourceDocId = undefined;
    newDoc.sourceDocType = undefined;
    newDoc.sourceDocNumber = undefined;
    newDoc.childDocIds = [];
    newDoc.lineItems = (doc.lineItems || []).map(li => ({ ...li, id: generateId() }));

    editingDocId = null;
    currentDocType = doc.docType;
    openDocEditor(newDoc);
    // 上書きして無採番状態に
    document.getElementById('doc-number').value = '(自動採番)';
    editingDocId = null;
}

async function deleteDocument(id) {
    const doc = await getFromStore('documents', id);
    if (!doc) return;
    showConfirm(`帳票「${doc.docNumber || '(未採番)'}」を削除しますか？`, async () => {
        await deleteFromStore('documents', id);
        loadDocList();
    });
}

// ============================================================
// 帳票変換
// ============================================================
async function showConvertMenu(docId, event) {
    event.stopPropagation();
    const doc = await getFromStore('documents', docId);
    if (!doc) return;
    const targets = CONVERSION_RULES[doc.docType] || [];
    if (targets.length === 0) return;

    const choice = prompt(
        '変換先を選択してください:\n' +
        targets.map((t, i) => `${i + 1}. ${DOC_TYPE_LABELS[t]}`).join('\n') +
        '\n\n番号を入力:',
        '1'
    );
    if (!choice) return;
    const idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= targets.length) return;

    const targetType = targets[idx];
    await convertDocument(doc, targetType);
}

async function convertDocument(sourceDoc, targetDocType) {
    const companyInfo = await loadCompanyInfo();
    const taxSettings = await loadTaxSettings();
    const converted = buildConvertedDocument(sourceDoc, targetDocType, companyInfo, taxSettings);

    // エディタで開く
    currentDocType = targetDocType;
    editingDocId = null;
    openDocEditor(converted);
    document.getElementById('doc-number').value = '(自動採番)';

    // 変換元リンクを表示
    const sourceLink = document.getElementById('doc-source-link');
    sourceLink.innerHTML = `この${DOC_TYPE_LABELS[targetDocType]}は${DOC_TYPE_LABELS[sourceDoc.docType]} <strong>${escapeHtml(sourceDoc.docNumber || '')}</strong> から作成されます`;
    sourceLink.style.display = 'block';
}

function initDocEditorEvents() {
    document.getElementById('btn-save-doc').addEventListener('click', saveDocument);
    document.getElementById('btn-cancel-doc').addEventListener('click', () => {
        document.getElementById('doc-editor-overlay').style.display = 'none';
    });
    document.getElementById('btn-close-doc-editor').addEventListener('click', () => {
        document.getElementById('doc-editor-overlay').style.display = 'none';
    });
    document.getElementById('btn-add-line').addEventListener('click', () => addLineItem());
}

// ============================================================
// 印刷
// ============================================================
async function printDocument(id) {
    const doc = await getFromStore('documents', id);
    if (!doc) return;

    const displaySettings = await loadDisplaySettings();
    const printArea = document.getElementById('print-area');

    if (doc.docType === 'receipt') {
        printArea.innerHTML = generateReceiptPrintHtml(doc, displaySettings);
    } else {
        printArea.innerHTML = generateA4PrintHtml(doc, displaySettings);
    }

    window.print();
}

function generateA4PrintHtml(doc, displaySettings) {
    const seller = doc.sellerSnapshot || {};
    const partner = doc.partnerSnapshot || {};
    const dateStr = displaySettings.dateFormat === 'japanese' ?
        formatDateJapanese(doc.issueDate) : (doc.issueDate || '');
    const typeName = DOC_TYPE_LABELS[doc.docType] || '帳票';
    const summary = doc.taxSummary || { subtotal: 0, taxDetails: [], totalTax: 0, total: 0 };

    // 角印HTML
    const sealHtml = displaySettings.showSeal && seller.sealText ?
        `<span class="print-seal">${escapeHtml(seller.sealText)}</span>` : '';

    // 種別固有情報
    let typeSpecific = '';
    if (doc.docType === 'estimate' && doc.validUntil) {
        const validStr = displaySettings.dateFormat === 'japanese' ? formatDateJapanese(doc.validUntil) : doc.validUntil;
        typeSpecific = `<div>有効期限: ${escapeHtml(validStr)}</div>`;
    }
    if (doc.docType === 'invoice' && doc.dueDate) {
        const dueStr = displaySettings.dateFormat === 'japanese' ? formatDateJapanese(doc.dueDate) : doc.dueDate;
        typeSpecific = `<div>支払期限: ${escapeHtml(dueStr)}</div>`;
    }
    if (doc.docType === 'delivery_note' && doc.deliveryDate) {
        const delStr = displaySettings.dateFormat === 'japanese' ? formatDateJapanese(doc.deliveryDate) : doc.deliveryDate;
        typeSpecific = `<div>納品日: ${escapeHtml(delStr)}</div>`;
    }

    // 明細行
    const lineRows = (doc.lineItems || []).map((line, i) => {
        const reducedMark = line.taxRateType === 'reduced' ? '<span class="print-reduced-mark"> ※</span>' : '';
        return `<tr>
            <td class="text-center">${i + 1}</td>
            <td>${escapeHtml(line.name)}${reducedMark}</td>
            <td class="text-right">${line.quantity}</td>
            <td class="text-center">${escapeHtml(line.unit || '')}</td>
            <td class="text-right">${formatCurrency(line.unitPrice)}</td>
            <td class="text-right">${formatCurrency(line.amount)}</td>
        </tr>`;
    }).join('');

    // 税額詳細
    const taxRows = (summary.taxDetails || []).map(d => {
        const label = d.rateType === 'standard' ? '10%対象' :
                      d.rateType === 'reduced' ? ' 8%対象' : '非課税';
        return `<tr>
            <td>${label} ${formatCurrency(d.taxableAmount)}</td>
            <td class="text-right">${formatCurrency(d.taxAmount)}</td>
        </tr>`;
    }).join('');

    // 振込先（請求書のみ）
    let bankHtml = '';
    if (displaySettings.showBank && doc.docType === 'invoice' && seller.bankInfo) {
        bankHtml = `<div class="print-bank-info">
            <div class="print-bank-info-title">お振込先</div>
            <div>${escapeHtml(seller.bankInfo).replace(/\n/g, '<br>')}</div>
        </div>`;
    }

    return `<div class="print-doc">
        <div class="print-title">${escapeHtml(typeName)}</div>
        <div class="print-header-row">
            <div class="print-addressee">
                <div class="print-addressee-name">${partner.name ? escapeHtml(partner.name) + ' ' + escapeHtml(partner.honorific || '') : '&nbsp;'}</div>
                ${partner.zipCode ? '<div>〒' + escapeHtml(partner.zipCode) + '</div>' : ''}
                ${partner.address1 ? '<div>' + escapeHtml(partner.address1) + '</div>' : ''}
                ${partner.address2 ? '<div>' + escapeHtml(partner.address2) + '</div>' : ''}
                ${partner.contactPerson ? '<div>' + escapeHtml(partner.contactPerson) + ' 様</div>' : ''}
            </div>
            <div class="print-seller">
                <div><strong>${escapeHtml(seller.companyName || '')}</strong> ${sealHtml}</div>
                ${seller.invoiceRegNumber ? '<div>登録番号: ' + escapeHtml(seller.invoiceRegNumber) + '</div>' : ''}
                ${seller.zipCode ? '<div>〒' + escapeHtml(seller.zipCode) + '</div>' : ''}
                ${seller.address ? '<div>' + escapeHtml(seller.address) + '</div>' : ''}
                ${seller.phone ? '<div>TEL: ' + escapeHtml(seller.phone) + '</div>' : ''}
                ${seller.fax ? '<div>FAX: ' + escapeHtml(seller.fax) + '</div>' : ''}
            </div>
        </div>
        <div class="print-doc-info">
            <div>帳票番号: ${escapeHtml(doc.docNumber || '')}</div>
            <div>発行日: ${escapeHtml(dateStr)}</div>
            ${typeSpecific}
        </div>
        <div class="print-total-highlight">
            <span>合計金額（税込）</span>
            <span>${formatYen(summary.total)}</span>
        </div>
        <table class="print-detail-table">
            <thead><tr>
                <th style="width:30px">No</th>
                <th>品目名</th>
                <th style="width:60px">数量</th>
                <th style="width:40px">単位</th>
                <th style="width:80px">単価</th>
                <th style="width:90px">金額</th>
            </tr></thead>
            <tbody>${lineRows}</tbody>
        </table>
        ${(summary.taxDetails || []).some(d => d.rateType === 'reduced') ? '<div style="font-size:8pt;color:#666;margin-bottom:8px">※ 軽減税率対象品目</div>' : ''}
        <div class="print-tax-summary">
            <table>
                <tr><td>小計（税抜）</td><td class="text-right">${formatCurrency(summary.subtotal)}</td></tr>
                ${taxRows}
                <tr><td>消費税合計</td><td class="text-right">${formatCurrency(summary.totalTax)}</td></tr>
                <tr class="total-row"><td>合計（税込）</td><td class="text-right">${formatCurrency(summary.total)}</td></tr>
            </table>
        </div>
        ${doc.notes ? '<div class="print-notes"><strong>備考</strong><br>' + escapeHtml(doc.notes).replace(/\n/g, '<br>') + '</div>' : ''}
        ${bankHtml}
    </div>`;
}

function generateReceiptPrintHtml(doc, displaySettings) {
    const seller = doc.sellerSnapshot || {};
    const partner = doc.partnerSnapshot || {};
    const dateStr = displaySettings.dateFormat === 'japanese' ?
        formatDateJapanese(doc.issueDate) : (doc.issueDate || '');
    const summary = doc.taxSummary || { subtotal: 0, totalTax: 0, total: 0 };

    const sealHtml = displaySettings.showSeal && seller.sealText ?
        `<span class="print-seal" style="width:36px;height:36px;font-size:8pt">${escapeHtml(seller.sealText)}</span>` : '';

    // 税内訳（税率別）
    const taxDetails = summary.taxDetails || [];
    const taxDetailHtml = taxDetails.map(d => {
        const label = d.rateType === 'standard' ? '10%対象' :
                      d.rateType === 'reduced' ? '8%対象' : '非課税';
        return `${escapeHtml(label)} ${formatYen(d.taxableAmount)}（税 ${formatYen(d.taxAmount)}）`;
    }).join(' / ');

    // 印紙欄
    let stampHtml = '';
    if (doc.revenueStampRequired) {
        stampHtml = `<div class="print-receipt-stamp-area">
            <div class="print-stamp-box">収入印紙<br>貼付欄</div>
            <div class="print-stamp-info">※印紙税額 ${formatYen(doc.revenueStampAmount || 0)}（税抜${formatYen(summary.subtotal)}）</div>
        </div>`;
    }

    return `<div class="print-receipt">
        <div class="print-title">領 収 書</div>
        <div class="print-receipt-info">
            <div>No. ${escapeHtml(doc.docNumber || '')}</div>
            <div>発行日: ${escapeHtml(dateStr)}</div>
        </div>
        <div class="print-receipt-addressee">${partner.name ? escapeHtml(partner.name) + ' ' + escapeHtml(partner.honorific || '様') : '&nbsp;'}</div>
        <div class="print-receipt-amount">${formatYen(summary.total)}-</div>
        <div class="print-receipt-tax-detail">${taxDetailHtml}</div>
        ${doc.receiptOf ? `<div class="print-receipt-but">但し ${escapeHtml(doc.receiptOf)}として</div>` : ''}
        <div class="print-receipt-statement">上記正に領収いたしました</div>
        ${stampHtml}
        <div class="print-receipt-seller">
            <div><strong>${escapeHtml(seller.companyName || '')}</strong> ${sealHtml}</div>
            ${seller.invoiceRegNumber ? '<div>' + escapeHtml(seller.invoiceRegNumber) + '</div>' : ''}
            ${seller.address ? '<div>' + escapeHtml(seller.address) + '</div>' : ''}
            ${seller.phone ? '<div>TEL: ' + escapeHtml(seller.phone) + '</div>' : ''}
        </div>
    </div>`;
}

// ============================================================
// 帳票詳細表示
// ============================================================
let detailDocId = null;

async function showDocDetail(id) {
    const doc = await getFromStore('documents', id);
    if (!doc) return;

    detailDocId = id;
    const displaySettings = await loadDisplaySettings();
    const typeName = DOC_TYPE_LABELS[doc.docType] || '帳票';
    const partner = doc.partnerSnapshot || {};
    const summary = doc.taxSummary || { subtotal: 0, taxDetails: [], totalTax: 0, total: 0 };
    const dateStr = displaySettings.dateFormat === 'japanese' ?
        formatDateJapanese(doc.issueDate) : (doc.issueDate || '');
    const statusLabel = STATUS_LABELS[doc.status] || '下書き';
    const statusClass = 'status-' + (doc.status || 'draft');

    // 基本情報セクション
    let html = `<div class="doc-detail-section">
        <h3>基本情報</h3>
        <div class="detail-row"><span class="detail-label">帳票番号</span><span class="detail-value">${escapeHtml(doc.docNumber || '(未採番)')}</span></div>
        <div class="detail-row"><span class="detail-label">種別</span><span class="detail-value">${escapeHtml(typeName)}</span></div>
        <div class="detail-row"><span class="detail-label">発行日</span><span class="detail-value">${escapeHtml(dateStr)}</span></div>
        <div class="detail-row"><span class="detail-label">ステータス</span><span class="detail-value"><span class="status-badge ${statusClass}">${statusLabel}</span></span></div>
    </div>`;

    // 取引先情報セクション
    if (partner.name) {
        html += `<div class="doc-detail-section">
            <h3>取引先</h3>
            <div class="detail-row"><span class="detail-label">名称</span><span class="detail-value">${escapeHtml(partner.name)}${partner.honorific ? ' ' + escapeHtml(partner.honorific) : ''}</span></div>
            ${partner.address1 ? `<div class="detail-row"><span class="detail-label">住所</span><span class="detail-value">${escapeHtml(partner.address1)}${partner.address2 ? ' ' + escapeHtml(partner.address2) : ''}</span></div>` : ''}
            ${partner.contactPerson ? `<div class="detail-row"><span class="detail-label">担当者</span><span class="detail-value">${escapeHtml(partner.contactPerson)}</span></div>` : ''}
        </div>`;
    }

    // 種別固有情報セクション
    let typeSpecificHtml = '';
    if (doc.docType === 'estimate' && doc.validUntil) {
        const validStr = displaySettings.dateFormat === 'japanese' ? formatDateJapanese(doc.validUntil) : doc.validUntil;
        typeSpecificHtml += `<div class="detail-row"><span class="detail-label">有効期限</span><span class="detail-value">${escapeHtml(validStr)}</span></div>`;
    }
    if ((doc.docType === 'invoice') && doc.dueDate) {
        const dueStr = displaySettings.dateFormat === 'japanese' ? formatDateJapanese(doc.dueDate) : doc.dueDate;
        typeSpecificHtml += `<div class="detail-row"><span class="detail-label">支払期限</span><span class="detail-value">${escapeHtml(dueStr)}</span></div>`;
    }
    if (doc.docType === 'delivery_note' && doc.deliveryDate) {
        const delStr = displaySettings.dateFormat === 'japanese' ? formatDateJapanese(doc.deliveryDate) : doc.deliveryDate;
        typeSpecificHtml += `<div class="detail-row"><span class="detail-label">納品日</span><span class="detail-value">${escapeHtml(delStr)}</span></div>`;
    }
    if (doc.docType === 'receipt' && doc.receiptOf) {
        typeSpecificHtml += `<div class="detail-row"><span class="detail-label">但し書き</span><span class="detail-value">${escapeHtml(doc.receiptOf)}</span></div>`;
    }
    if (doc.paymentMethod) {
        typeSpecificHtml += `<div class="detail-row"><span class="detail-label">支払方法</span><span class="detail-value">${escapeHtml(PAYMENT_METHOD_LABELS[doc.paymentMethod] || doc.paymentMethod)}</span></div>`;
    }
    if (typeSpecificHtml) {
        html += `<div class="doc-detail-section"><h3>詳細情報</h3>${typeSpecificHtml}</div>`;
    }

    // 明細テーブル
    if (doc.lineItems && doc.lineItems.length > 0) {
        const lineRows = doc.lineItems.map((line, i) => {
            const taxLabel = line.taxRateType === 'standard' ? '標準' :
                             line.taxRateType === 'reduced' ? '軽減' : '非課税';
            return `<tr>
                <td class="text-center">${i + 1}</td>
                <td>${escapeHtml(line.name || '')}</td>
                <td>${escapeHtml(line.description || '')}</td>
                <td class="text-right">${line.quantity}</td>
                <td class="text-center">${escapeHtml(line.unit || '')}</td>
                <td class="text-right">${formatCurrency(line.unitPrice)}</td>
                <td class="text-center">${taxLabel}</td>
                <td class="text-right">${formatCurrency(line.amount)}</td>
            </tr>`;
        }).join('');

        html += `<div class="doc-detail-section">
            <h3>明細</h3>
            <div style="overflow-x:auto">
            <table class="doc-detail-table">
                <thead><tr>
                    <th style="width:36px">No</th>
                    <th>品目名</th>
                    <th>摘要</th>
                    <th style="width:60px;text-align:right">数量</th>
                    <th style="width:50px;text-align:center">単位</th>
                    <th style="width:80px;text-align:right">単価</th>
                    <th style="width:60px;text-align:center">税区分</th>
                    <th style="width:90px;text-align:right">金額</th>
                </tr></thead>
                <tbody>${lineRows}</tbody>
            </table>
            </div>
        </div>`;
    }

    // 金額サマリー
    const taxDetailRows = (summary.taxDetails || []).map(d => {
        const label = d.rateType === 'standard' ? '10%対象' :
                      d.rateType === 'reduced' ? ' 8%対象' : '非課税';
        return `<div class="summary-tax-row"><span>${label} ${formatCurrency(d.taxableAmount)}</span><span>${formatCurrency(d.taxAmount)}</span></div>`;
    }).join('');

    html += `<div class="doc-detail-section">
        <h3>金額</h3>
        <div class="doc-detail-summary">
            <div class="summary-row"><span>小計（税抜）</span><span>${formatCurrency(summary.subtotal)}</span></div>
            ${taxDetailRows}
            <div class="summary-row"><span>消費税合計</span><span>${formatCurrency(summary.totalTax)}</span></div>
            <div class="summary-row summary-total"><span>合計（税込）</span><span>${formatCurrency(summary.total)}</span></div>
        </div>
    </div>`;

    // 備考
    if (doc.notes) {
        html += `<div class="doc-detail-section">
            <h3>備考</h3>
            <div style="font-size:13px;white-space:pre-wrap">${escapeHtml(doc.notes)}</div>
        </div>`;
    }

    // 変換元情報
    if (doc.sourceDocId) {
        html += `<div class="doc-detail-section">
            <h3>変換元</h3>
            <div class="detail-row"><span class="detail-value">${escapeHtml(DOC_TYPE_LABELS[doc.sourceDocType] || '帳票')} ${escapeHtml(doc.sourceDocNumber || '')} から作成</span></div>
        </div>`;
    }

    document.getElementById('doc-detail-title').textContent = typeName + '詳細';
    document.getElementById('doc-detail-body').innerHTML = html;
    document.getElementById('doc-detail-overlay').style.display = '';
}

function initDocDetailEvents() {
    document.getElementById('btn-close-doc-detail').addEventListener('click', () => {
        document.getElementById('doc-detail-overlay').style.display = 'none';
    });
    document.getElementById('btn-detail-close').addEventListener('click', () => {
        document.getElementById('doc-detail-overlay').style.display = 'none';
    });
    document.getElementById('btn-detail-edit').addEventListener('click', async () => {
        document.getElementById('doc-detail-overlay').style.display = 'none';
        if (detailDocId) {
            await editDocument(detailDocId);
        }
    });
}

// ============================================================
// 帳票サブタブ表示制御
// ============================================================
function applyDocTabVisibility(hiddenDocTypes) {
    const buttons = document.querySelectorAll('#doc-sub-tab-nav .sub-tab-btn');
    let activeHidden = false;

    buttons.forEach(btn => {
        const docType = btn.dataset.docType;
        if (hiddenDocTypes.includes(docType)) {
            btn.style.display = 'none';
            if (btn.classList.contains('active')) {
                activeHidden = true;
            }
        } else {
            btn.style.display = '';
        }
    });

    // アクティブタブが非表示にされた場合、最初の表示可能タブに切り替え
    if (activeHidden) {
        const firstVisible = Array.from(buttons).find(btn => btn.style.display !== 'none');
        if (firstVisible) {
            switchDocSubTab(firstVisible.dataset.docType);
        }
    }
}

// ============================================================
// データ管理（エクスポート/インポート/削除）
// ============================================================
let _toastTimer = null;
function showToast(text, type) {
    const el = document.getElementById('toast');
    document.getElementById('toast-text').textContent = text;
    el.className = `toast ${type}`;
    el.style.display = 'block';
    clearTimeout(_toastTimer);
    if (type !== 'error') {
        _toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
    }
}
function initToast() {
    document.getElementById('toast-close').addEventListener('click', () => {
        document.getElementById('toast').style.display = 'none';
    });
}

async function exportData() {
    try {
        const data = {
            exportedAt: new Date().toISOString(),
            version: '1.0.0',
            appName: 'pado',
            partners: await getAllFromStore('partners'),
            items: await getAllFromStore('items'),
            documents: await getAllFromStore('documents'),
            settings: {}
        };

        // 設定を収集
        const settingKeys = ['company_info', 'tax_settings', 'number_format', 'display_settings'];
        for (const key of settingKeys) {
            const val = await getSetting(key);
            if (val) data.settings[key] = val;
        }

        const now = new Date();
        const ts = now.getFullYear()
            + String(now.getMonth() + 1).padStart(2, '0')
            + String(now.getDate()).padStart(2, '0')
            + '_'
            + String(now.getHours()).padStart(2, '0')
            + String(now.getMinutes()).padStart(2, '0')
            + String(now.getSeconds()).padStart(2, '0');

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pado_export_${ts}.json`;
        a.click();
        URL.revokeObjectURL(url);

        const pc = data.partners.length;
        const ic = data.items.length;
        const dc = data.documents.length;
        showToast(`${pc}件の取引先、${ic}件の品目、${dc}件の帳票をエクスポートしました`, 'success');
    } catch (err) {
        showToast('エクスポート中にエラーが発生しました: ' + err.message, 'error');
    }
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const text = await file.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        showToast('JSONファイルの形式が不正です', 'error');
        event.target.value = '';
        return;
    }

    const v = validateImportData(data);
    if (!v.valid) {
        showToast('インポートエラー: ' + v.errors.join(', '), 'error');
        event.target.value = '';
        return;
    }

    const msg = `以下のデータをインポートします:\n` +
        `- 取引先: ${v.counts.partners}件\n` +
        `- 品目: ${v.counts.items}件\n` +
        `- 帳票: ${v.counts.documents}件\n` +
        `- 設定: ${v.counts.settings}件\n\n` +
        `既存データとマージされます。続行しますか？`;

    showConfirm(msg, async () => {
        try {
            if (data.partners) {
                for (const p of data.partners) {
                    await updateInStore('partners', p);
                }
            }
            if (data.items) {
                for (const item of data.items) {
                    await updateInStore('items', item);
                }
            }
            if (data.documents) {
                for (const doc of data.documents) {
                    await updateInStore('documents', doc);
                }
            }
            if (data.settings) {
                for (const [key, value] of Object.entries(data.settings)) {
                    await saveSetting(key, value);
                }
            }
            showToast('インポートが完了しました', 'success');
            loadDocList();
            loadPartnerList();
            loadItemList();
        } catch (err) {
            showToast('インポート中にエラーが発生しました: ' + err.message, 'error');
        }
    });

    // ファイル選択をリセット
    event.target.value = '';
}

function updateSampleImportAvailability() {
    const btn = document.getElementById('import-sample-btn');
    const note = document.getElementById('sample-data-offline-note');
    if (!btn || !note) return;
    if (navigator.onLine) {
        btn.disabled = false;
        note.style.display = 'none';
    } else {
        btn.disabled = true;
        note.style.display = 'block';
    }
}

async function importSampleData() {
    const btn = document.getElementById('import-sample-btn');
    const msgEl = document.getElementById('sample-data-message');

    if (!navigator.onLine) {
        msgEl.textContent = 'オフライン環境ではサンプルデータをインポートできません。';
        msgEl.style.color = 'var(--danger)';
        return;
    }

    showConfirm(
        'サンプルデータ（取引先10件、品目15件、帳票24件）をダウンロードしてインポートします。既存データとマージされます。',
        async () => {
            btn.disabled = true;
            msgEl.textContent = 'サンプルデータをダウンロード中...';
            msgEl.style.color = '';
            try {
                const response = await fetch('/sample_data.json');
                if (!response.ok) throw new Error('ダウンロードに失敗しました (HTTP ' + response.status + ')');
                const data = await response.json();

                const v = validateImportData(data);
                if (!v.valid) throw new Error(v.errors.join('\n'));

                msgEl.textContent = 'インポート中...';

                let counts = { partners: 0, items: 0, documents: 0, settings: 0 };
                if (data.partners) {
                    for (const p of data.partners) {
                        const existing = await getFromStore('partners', p.id);
                        if (!existing) { await updateInStore('partners', p); counts.partners++; }
                    }
                }
                if (data.items) {
                    for (const item of data.items) {
                        const existing = await getFromStore('items', item.id);
                        if (!existing) { await updateInStore('items', item); counts.items++; }
                    }
                }
                if (data.documents) {
                    for (const doc of data.documents) {
                        const existing = await getFromStore('documents', doc.id);
                        if (!existing) { await updateInStore('documents', doc); counts.documents++; }
                    }
                }
                if (data.settings) {
                    for (const [key, value] of Object.entries(data.settings)) {
                        const existing = await getSetting(key);
                        if (existing === null) { await saveSetting(key, value); counts.settings++; }
                    }
                }

                msgEl.textContent = 'インポート完了: 取引先' + counts.partners + '件、品目' + counts.items + '件、帳票' + counts.documents + '件';
                msgEl.style.color = 'var(--success, green)';
                loadDocList();
                loadPartnerList();
                loadItemList();
            } catch (error) {
                msgEl.textContent = 'サンプルデータのインポートに失敗しました: ' + error.message;
                msgEl.style.color = 'var(--danger)';
            } finally {
                btn.disabled = false;
            }
        }
    );
}

async function deleteAllData() {
    showConfirm('すべてのデータを削除しますか？\nこの操作は取り消せません。', async () => {
        await clearStore('partners');
        await clearStore('items');
        await clearStore('documents');
        await clearStore('doc_sequences');
        await clearStore('app_settings');
        showToast('すべてのデータを削除しました', 'success');
        loadDocList();
        loadPartnerList();
        loadItemList();
    });
}

// ============================================================
// 確認ダイアログ
// ============================================================
let confirmCallback = null;

function showConfirm(message, onOk) {
    document.getElementById('confirm-message').textContent = message;
    confirmCallback = onOk;
    document.getElementById('confirm-dialog').style.display = 'flex';
}

function initConfirmDialog() {
    document.getElementById('btn-confirm-ok').addEventListener('click', () => {
        document.getElementById('confirm-dialog').style.display = 'none';
        if (confirmCallback) confirmCallback();
        confirmCallback = null;
    });
    document.getElementById('btn-confirm-cancel').addEventListener('click', () => {
        document.getElementById('confirm-dialog').style.display = 'none';
        confirmCallback = null;
    });
}

// ============================================================
// PWA & 更新
// ============================================================
let swRegistration = null;
let lastUpdateCheck = 0;
const UPDATE_CHECK_THROTTLE_MS = 30000;

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    const hadController = !!navigator.serviceWorker.controller;

    try {
        swRegistration = await navigator.serviceWorker.register('/sw.js');

        swRegistration.addEventListener('updatefound', () => {
            const newWorker = swRegistration.installing;
            if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'activated' && hadController) {
                        showUpdateBanner();
                    }
                });
            }
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (hadController) {
                showUpdateBanner();
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                throttledUpdateCheck();
            }
        });
    } catch (e) {
        // SW登録失敗は無視（HTTP環境等）
    }
}

function throttledUpdateCheck() {
    const now = Date.now();
    if (now - lastUpdateCheck < UPDATE_CHECK_THROTTLE_MS) return;
    lastUpdateCheck = now;
    if (swRegistration) {
        swRegistration.update().catch(() => {});
    }
}

async function checkForUpdate() {
    const statusEl = document.getElementById('update-check-status');
    if (!swRegistration) {
        if (statusEl) statusEl.textContent = 'Service Workerが未登録です';
        return;
    }

    if (statusEl) statusEl.textContent = '確認中...';

    try {
        await swRegistration.update();
        const waiting = swRegistration.waiting;
        const installing = swRegistration.installing;

        if (waiting || installing) {
            if (statusEl) statusEl.textContent = '新しいバージョンを検出しました';
            showUpdateBanner();
        } else {
            if (statusEl) statusEl.textContent = '最新バージョンです';
            setTimeout(() => {
                if (statusEl) statusEl.textContent = '';
            }, 3000);
        }
    } catch (e) {
        if (statusEl) statusEl.textContent = '確認に失敗しました';
    }
}

function showUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.style.display = 'flex';
}

function hideUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.style.display = 'none';
}

function initUpdateBanner() {
    const updateBtn = document.getElementById('update-banner-btn');
    if (updateBtn) {
        updateBtn.addEventListener('click', () => {
            location.reload();
        });
    }
    const closeBtn = document.getElementById('update-banner-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            hideUpdateBanner();
        });
    }
    const checkUpdateBtn = document.getElementById('check-update-btn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', checkForUpdate);
    }
}

// ============================================================
// スクロールトップ
// ============================================================
function initScrollTop() {
    const btn = document.getElementById('scroll-top-btn');
    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ============================================================
// アプリ情報表示
// ============================================================
function initVersionInfo() {
    const info = window.APP_INFO || {};

    const infoDisplay = document.getElementById('app-info-display');
    if (infoDisplay) {
        infoDisplay.textContent = `Build: ${info.buildTime || '---'}`;
    }

    const versionDetail = document.getElementById('app-version-info');
    if (versionDetail) {
        versionDetail.textContent = `Build: ${info.buildTime || '---'}`;
    }
}

// ============================================================
// 初期化
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        db = await openDB();
    } catch (err) {
        showToast('データベースの初期化に失敗しました: ' + err.message, 'error');
        return;
    }

    initToast();
    initTabs();
    initSettingsEvents();
    initPartnerEvents();
    initItemEvents();
    initDocListEvents();
    initDocEditorEvents();
    initDocDetailEvents();
    initConfirmDialog();
    initScrollTop();
    initVersionInfo();
    initUpdateBanner();
    registerServiceWorker();

    // デフォルトタブ読込
    const ds = await loadDisplaySettings();
    applyDocTabVisibility(ds.hiddenDocTypes);
    currentDocType = ds.defaultDocType || 'estimate';
    switchDocSubTab(currentDocType);
    loadDocList();
});
