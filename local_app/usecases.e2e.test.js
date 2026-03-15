/**
 * usecases.e2e.test.js - Pado ユースケース E2E テスト
 *
 * UC1〜UC8 を状態引き継ぎで逐次実行
 * 既存の e2e.test.js とは完全分離
 *
 * 実行: docker compose run --rm pado-test npm run test:usecases
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const http = require('http');

describe('Usecase E2E Test: Pado App', () => {
    let browser;
    let page;
    let baseUrl = 'http://pado-app:80';
    const pageErrors = [];
    let testCount = 0;

    jest.setTimeout(600000);

    // テスト進捗ログ
    beforeEach(() => {
        testCount++;
        console.log(`[${testCount}] ${expect.getState().currentTestName}`);
    });

    beforeAll(async () => {
        const host = process.env.E2E_APP_HOST || 'pado-app';
        baseUrl = `http://${host}:80`;
        console.log(`E2E baseUrl = ${baseUrl}`);

        // pado-app の HTTP 疎通待ち（healthcheck + service_healthy が効かない場合のフォールバック）
        for (let i = 0; i < 30; i++) {
            const ok = await new Promise(resolve => {
                http.get(baseUrl, res => { res.resume(); resolve(true); })
                    .on('error', () => resolve(false));
            });
            if (ok) break;
            await new Promise(r => setTimeout(r, 1000));
        }

        browser = await puppeteer.launch({
            headless: 'new',
            timeout: 300000,
            protocolTimeout: 300000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu'
            ]
        });
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Docker ヘッドレス Chrome では page.click() のマウスイベントが
        // イベントハンドラを正しく発火しないため、JS の click() に置換する。
        const _origClick = page.click.bind(page);
        page.click = async (selector, options) => {
            if (options && (options.clickCount || options.button)) {
                return _origClick(selector, options);
            }
            await page.evaluate(s => document.querySelector(s)?.click(), selector);
        };

        page.on('pageerror', error => {
            console.error('Browser Page Error:', error.message);
            pageErrors.push(error.message);
        });

        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.error('Browser Console Error:', msg.text());
            }
        });

        // ダイアログキュー: ハング防止のグローバルハンドラー
        page._dialogQueue = [];
        page.on('dialog', async dialog => {
            const handler = page._dialogQueue.shift();
            if (handler) {
                await handler(dialog);
            } else {
                console.log(`[DIALOG AUTO-ACCEPT] type=${dialog.type()}, message="${dialog.message().slice(0, 80)}"`);
                await dialog.accept();
            }
        });

        // サンプルデータの自動読み込みを防止（空DB検出時の自動インポートをブロック）
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (request.url().includes('sample_data.json')) {
                request.respond({ status: 404, body: 'Not found' });
            } else {
                request.continue();
            }
        });

        // アプリ起動・全データクリア
        await waitForApp();
        await page.evaluate(async () => {
            await clearStore('partners');
            await clearStore('items');
            await clearStore('documents');
            await clearStore('doc_sequences');
        });
        await waitForApp();
    }, 300000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    // ================================================================
    // ヘルパー関数
    // ================================================================

    // ── ヘルパー: setTimeout を排除するためのイベント駆動待機 ──

    // タブ/サブタブ切替完了待ち
    const clickTab = async (selector) => {
        await page.evaluate(s => document.querySelector(s)?.click(), selector);
        await page.waitForFunction(
            s => document.querySelector(s)?.classList.contains('active'),
            { timeout: 5000 }, selector
        );
    };

    // UI描画完了待ち
    const waitForUI = () => page.evaluate(() => new Promise(r => setTimeout(r, 50)));

    // オーバーレイ表示待ち
    const waitOverlayOpen = async (id) => {
        await page.waitForFunction(
            s => { const o = document.querySelector(s); return o && o.style.display !== 'none'; },
            { timeout: 5000 }, id
        );
    };

    // オーバーレイ非表示待ち
    const waitOverlayClosed = async (id) => {
        await page.waitForFunction(
            s => { const o = document.querySelector(s); return o && o.style.display === 'none'; },
            { timeout: 10000 }, id
        );
    };

    // トースト表示待ち
    const waitForToast = async () => {
        await page.waitForFunction(
            () => { const t = document.querySelector('#toast-text'); return t && t.textContent.trim().length > 0; },
            { timeout: 5000 }
        );
    };

    // 確認ダイアログ表示待ち
    const waitForConfirmDialog = async () => {
        await page.waitForFunction(
            () => { const d = document.querySelector('#confirm-dialog'); return d && d.style.display === 'flex'; },
            { timeout: 5000 }
        );
    };

    // 計算結果反映待ち
    const waitForCalc = async (selector, expected) => {
        await page.waitForFunction(
            (s, e) => { const el = document.querySelector(s); return el && (el.value || el.textContent).includes(e); },
            { timeout: 5000 }, selector, expected
        );
    };

    // 印刷プレビュー完了待ち
    const waitForPrint = async () => {
        await page.waitForFunction(() => window._printCalled === true, { timeout: 5000, polling: 100 });
    };

    const waitForApp = async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('.tab-nav', { timeout: 10000, polling: 100 });
    };

    const openDocEditor = async () => {
        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#doc-editor-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 10000, polling: 100 });
        await waitForUI();
    };

    const saveDoc = async () => {
        await page.click('#btn-save-doc');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#doc-editor-overlay');
            return overlay && overlay.style.display === 'none';
        }, { timeout: 15000, polling: 100 });
        await waitForUI();
    };

    const openPartnerForm = async () => {
        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#partner-form-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });
        await waitForUI();
    };

    const savePartner = async () => {
        await page.click('#btn-save-partner');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#partner-form-overlay');
            return overlay && overlay.style.display === 'none';
        }, { timeout: 10000, polling: 100 });
        await waitForUI();
    };

    const openItemForm = async () => {
        await page.click('#btn-new-item');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#item-form-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });
        await waitForUI();
    };

    const saveItem = async () => {
        await page.click('#btn-save-item');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#item-form-overlay');
            return overlay && overlay.style.display === 'none';
        }, { timeout: 10000, polling: 100 });
        await waitForUI();
    };

    const convertDoc = async (promptAnswer) => {
        const convertBtn = await page.$('.doc-card-actions button[title="変換"]');
        expect(convertBtn).not.toBeNull();
        page._dialogQueue.push(async dialog => {
            await dialog.accept(promptAnswer);
        });
        await convertBtn.click();
        // エディタが開いていることを確認
        await waitOverlayOpen('#doc-editor-overlay');
    };

    const switchMainTab = async (tabName) => {
        await clickTab(`[data-tab="${tabName}"]`);
    };

    const switchDocSubTab = async (docType) => {
        await clickTab(`[data-doc-type="${docType}"]`);
    };

    const setLineItem = async (rowIndex, name, qty, price, taxType) => {
        await page.evaluate((idx, n, q, p, t) => {
            const rows = document.querySelectorAll('#line-items-body tr');
            const row = rows[idx];
            if (!row) return;
            const nameEl = row.querySelector('.line-name');
            const qtyEl = row.querySelector('.line-qty');
            const priceEl = row.querySelector('.line-price');
            const taxEl = row.querySelector('.line-tax');
            nameEl.value = n;
            nameEl.dispatchEvent(new Event('input', { bubbles: true }));
            qtyEl.value = String(q);
            qtyEl.dispatchEvent(new Event('input', { bubbles: true }));
            priceEl.value = String(p);
            priceEl.dispatchEvent(new Event('input', { bubbles: true }));
            if (t) {
                taxEl.value = t;
                taxEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, rowIndex, name, qty, price, taxType || null);
        await waitForUI();
    };

    const selectPartnerInEditor = async (partnerNameSubstring) => {
        const optionValue = await page.evaluate((sub) => {
            const options = Array.from(document.querySelectorAll('#doc-partner option'));
            const match = options.find(o => o.textContent.includes(sub) && o.value);
            return match ? match.value : null;
        }, partnerNameSubstring);
        if (optionValue) {
            await page.select('#doc-partner', optionValue);
        }
        await waitForUI();
    };

    // ================================================================
    // UC1: 初期設定
    // ================================================================
    test('UC1-01: 自社情報を設定する', async () => {
        await switchMainTab('settings');
        await page.waitForSelector('#setting-company-name', { timeout: 5000, polling: 100 });

        // 会社名
        await page.evaluate(() => document.getElementById('setting-company-name').value = '');
        await page.type('#setting-company-name', 'Studio Sato');

        // インボイス登録番号
        await page.evaluate(() => document.getElementById('setting-invoice-reg-number').value = '');
        await page.type('#setting-invoice-reg-number', 'T1234567890123');

        // 住所
        await page.evaluate(() => document.getElementById('setting-address').value = '');
        await page.type('#setting-address', '東京都渋谷区テスト1-2-3');

        // 電話
        await page.evaluate(() => document.getElementById('setting-phone').value = '');
        await page.type('#setting-phone', '03-9999-0000');

        // 振込先
        await page.evaluate(() => document.getElementById('setting-bank-info').value = '');
        await page.type('#setting-bank-info', 'テスト銀行 渋谷支店 普通 1234567');

        // 角印テキスト
        await page.evaluate(() => document.getElementById('setting-seal-text').value = '');
        await page.type('#setting-seal-text', 'Studio Sato');

        await page.click('#btn-save-company');
        await waitForUI();

        // リロードして永続化を確認
        await waitForApp();
        await switchMainTab('settings');
        await page.waitForSelector('#setting-company-name', { timeout: 5000, polling: 100 });
        const value = await page.$eval('#setting-company-name', el => el.value);
        expect(value).toBe('Studio Sato');
    });

    test('UC1-02: 税設定を保存する', async () => {
        await switchMainTab('settings');
        await page.waitForSelector('#setting-rounding', { timeout: 5000, polling: 100 });

        await page.select('#setting-rounding', 'floor');
        await page.select('#setting-calc-method', 'per_line');

        await page.click('#btn-save-tax');
        await waitForUI();

        // リロードして確認
        await waitForApp();
        await switchMainTab('settings');
        await page.waitForSelector('#setting-rounding', { timeout: 5000, polling: 100 });
        const rounding = await page.$eval('#setting-rounding', el => el.value);
        expect(rounding).toBe('floor');
        const calcMethod = await page.$eval('#setting-calc-method', el => el.value);
        expect(calcMethod).toBe('per_line');
    });

    test('UC1-03: 表示設定を保存する', async () => {
        await switchMainTab('settings');
        await page.waitForSelector('#setting-default-doc-type', { timeout: 5000, polling: 100 });

        await page.select('#setting-default-doc-type', 'estimate');
        await page.select('#setting-date-format', 'japanese');

        await page.evaluate(() => {
            document.getElementById('setting-show-seal').checked = true;
            document.getElementById('setting-show-bank').checked = true;
        });

        await page.evaluate(() => {
            document.getElementById('setting-estimate-valid-days').value = '30';
        });

        await page.click('#btn-save-display');
        await waitForUI();

        // リロードして確認
        await waitForApp();
        await switchMainTab('settings');
        await page.waitForSelector('#setting-default-doc-type', { timeout: 5000, polling: 100 });
        const docType = await page.$eval('#setting-default-doc-type', el => el.value);
        expect(docType).toBe('estimate');
    });

    test('UC1-04: 帳票番号設定のプレフィックスが表示されている', async () => {
        await switchMainTab('settings');
        await waitForUI();

        const hasNumberFormat = await page.evaluate(() => {
            const container = document.getElementById('number-format-settings');
            return container && container.innerHTML.length > 0;
        });
        expect(hasNumberFormat).toBe(true);
    });

    test('UC1-05: サブタブ表示制御 - 仕入伝票を非表示にできる', async () => {
        await switchMainTab('settings');
        await page.waitForSelector('#setting-show-purchase_slip', { timeout: 5000, polling: 100 });

        // チェックを外す
        await page.evaluate(() => {
            document.getElementById('setting-show-purchase_slip').checked = false;
        });
        await page.click('#btn-save-display');
        await waitForUI();

        // 帳票タブに切り替えて確認
        await switchMainTab('documents');
        await waitForUI();

        const purchaseSlipBtn = await page.$('[data-doc-type="purchase_slip"]');
        const isHidden = await page.evaluate(el => el.style.display === 'none', purchaseSlipBtn);
        expect(isHidden).toBe(true);
    });

    test('UC1-06: サブタブ表示制御 - 仕入伝票を再表示できる', async () => {
        await switchMainTab('settings');
        await page.waitForSelector('#setting-show-purchase_slip', { timeout: 5000, polling: 100 });

        // チェックを戻す
        await page.evaluate(() => {
            document.getElementById('setting-show-purchase_slip').checked = true;
        });
        await page.click('#btn-save-display');
        await waitForUI();

        // 帳票タブに切り替えて確認
        await switchMainTab('documents');
        await waitForUI();

        const purchaseSlipBtn = await page.$('[data-doc-type="purchase_slip"]');
        const isVisible = await page.evaluate(el => el.style.display !== 'none', purchaseSlipBtn);
        expect(isVisible).toBe(true);
    });

    // ================================================================
    // UC2: 取引先・品目登録
    // ================================================================
    test('UC2-01: 取引先「株式会社ミドリ商事」を登録する（得意先）', async () => {
        await switchMainTab('partners');
        await waitForUI();

        await openPartnerForm();
        await page.evaluate(() => document.getElementById('partner-name').value = '');
        await page.type('#partner-name', '株式会社ミドリ商事');
        await page.select('#partner-type', 'customer');
        await savePartner();

        const codes = await page.$$eval('.partner-card-code', els => els.map(e => e.textContent));
        expect(codes).toContain('P0001');

        const partnerText = await page.$eval('#partner-list', el => el.textContent);
        expect(partnerText).toContain('株式会社ミドリ商事');
    });

    test('UC2-02: 取引先「デザインツール商社」を登録する（仕入先）', async () => {
        await switchMainTab('partners');
        await waitForUI();

        await openPartnerForm();
        await page.evaluate(() => document.getElementById('partner-name').value = '');
        await page.type('#partner-name', 'デザインツール商社');
        await page.select('#partner-type', 'supplier');
        await savePartner();

        const codes = await page.$$eval('.partner-card-code', els => els.map(e => e.textContent));
        expect(codes).toContain('P0002');
    });

    test('UC2-03: 品目「Webサイト制作」を登録する', async () => {
        await switchMainTab('items');
        await waitForUI();

        await openItemForm();
        await page.evaluate(() => document.getElementById('item-name').value = '');
        await page.type('#item-name', 'Webサイト制作');
        await page.evaluate(() => document.getElementById('item-unit-price').value = '');
        await page.type('#item-unit-price', '300000');
        await page.select('#item-tax-rate', 'standard');
        await saveItem();

        const tableText = await page.$eval('#item-table-body', el => el.textContent);
        expect(tableText).toContain('Webサイト制作');
        expect(tableText).toContain('I0001');
    });

    test('UC2-04: 品目「ロゴデザイン」を登録する', async () => {
        await switchMainTab('items');
        await waitForUI();

        await openItemForm();
        await page.evaluate(() => document.getElementById('item-name').value = '');
        await page.type('#item-name', 'ロゴデザイン');
        await page.evaluate(() => document.getElementById('item-unit-price').value = '');
        await page.type('#item-unit-price', '80000');
        await page.select('#item-tax-rate', 'standard');
        await saveItem();

        const tableText = await page.$eval('#item-table-body', el => el.textContent);
        expect(tableText).toContain('ロゴデザイン');
        expect(tableText).toContain('I0002');
    });

    test('UC2-05: 品目「イラスト素材集」を登録する（軽減税率）', async () => {
        await switchMainTab('items');
        await waitForUI();

        await openItemForm();
        await page.evaluate(() => document.getElementById('item-name').value = '');
        await page.type('#item-name', 'イラスト素材集');
        await page.evaluate(() => document.getElementById('item-unit-price').value = '');
        await page.type('#item-unit-price', '5000');
        await page.select('#item-tax-rate', 'reduced');
        await saveItem();

        const tableText = await page.$eval('#item-table-body', el => el.textContent);
        expect(tableText).toContain('イラスト素材集');
        expect(tableText).toContain('I0003');
    });

    // ================================================================
    // UC3: 見積書作成
    // ================================================================
    test('UC3-01: 見積書を作成する（3行明細＋行削除）', async () => {
        await switchMainTab('documents');
        await switchDocSubTab('estimate');

        await openDocEditor();

        // 取引先選択
        await selectPartnerInEditor('ミドリ商事');

        // 1行目: Webサイト制作 × 1 × 300,000
        await setLineItem(0, 'Webサイト制作', 1, 300000);

        // 行追加 + 2行目: ロゴデザイン × 2 × 80,000
        await page.click('#btn-add-line');
        await waitForUI();
        await setLineItem(1, 'ロゴデザイン', 2, 80000);

        // 行追加 + 3行目: イラスト素材集 × 10 × 5,000 (軽減税率)
        await page.click('#btn-add-line');
        await waitForUI();
        await setLineItem(2, 'イラスト素材集', 10, 5000, 'reduced');

        // 4行目を追加して削除
        await page.click('#btn-add-line');
        await waitForUI();
        const rowsBefore = await page.$$('#line-items-body tr');
        expect(rowsBefore.length).toBe(4);

        const removeButtons = await page.$$('#line-items-body .btn-remove-line');
        await removeButtons[removeButtons.length - 1].click();
        await waitForUI();

        const rowsAfter = await page.$$('#line-items-body tr');
        expect(rowsAfter.length).toBe(3);

        await waitForCalc('#summary-subtotal', '510,000');

        // 小計確認: 300,000 + 160,000 + 50,000 = 510,000
        const subtotal = await page.$eval('#summary-subtotal', el => el.textContent);
        expect(subtotal).toBe('¥510,000');

        // 合計確認: 510,000 + 税(300,000*10%=30,000 + 160,000*10%=16,000 + 50,000*8%=4,000) = 560,000
        const total = await page.$eval('#summary-total', el => el.textContent);
        expect(total).toBe('¥560,000');
    });

    test('UC3-02: 見積書の有効期限がデフォルト設定（約30日後）である', async () => {
        const validUntil = await page.$eval('#doc-valid-until', el => el.value);
        expect(validUntil).toBeTruthy();

        const validDate = new Date(validUntil);
        const now = new Date();
        const diffDays = Math.round((validDate - now) / (1000 * 60 * 60 * 24));
        expect(diffDays).toBeGreaterThanOrEqual(28);
        expect(diffDays).toBeLessThanOrEqual(32);
    });

    test('UC3-03: 見積書を保存して番号がQT-で始まることを確認する', async () => {
        await saveDoc();

        const docNumbers = await page.$$eval('.doc-card-number', els => els.map(e => e.textContent));
        const qtNumbers = docNumbers.filter(n => /^QT-/.test(n));
        expect(qtNumbers.length).toBeGreaterThanOrEqual(1);
    });

    test('UC3-04: 見積書の詳細表示を確認する', async () => {
        const detailBtn = await page.$('.doc-card-actions button[title="詳細"]');
        expect(detailBtn).not.toBeNull();
        await detailBtn.click();
        await waitOverlayOpen('#doc-detail-overlay');

        const detailOverlay = await page.$eval('#doc-detail-overlay', el => el.style.display);
        expect(detailOverlay).not.toBe('none');

        const detailBody = await page.$eval('#doc-detail-body', el => el.textContent);
        expect(detailBody).toContain('ミドリ商事');

        // 詳細を閉じる
        await page.click('#btn-close-doc-detail');
        await waitOverlayClosed('#doc-detail-overlay');
    });

    test('UC3-05: 見積書の印刷プレビューに自社名と登録番号が含まれる', async () => {
        await page.evaluate(() => { window._printCalled = false; window.print = () => { window._printCalled = true; }; });

        const printBtn = await page.$('.doc-card-actions button[title="印刷"]');
        expect(printBtn).not.toBeNull();
        await printBtn.click();
        await waitForPrint();

        const printed = await page.evaluate(() => window._printCalled);
        expect(printed).toBe(true);

        const printHtml = await page.$eval('#print-area', el => el.innerHTML);
        expect(printHtml).toContain('Studio Sato');
        expect(printHtml).toContain('T1234567890123');
    });

    // ================================================================
    // UC4: 変換ワークフロー（見積書→請求書→領収書/売上伝票）
    // ================================================================
    test('UC4-01: 見積書を請求書に変換する', async () => {
        await switchMainTab('documents');
        await switchDocSubTab('estimate');

        await convertDoc('1'); // estimate → invoice

        // 明細行がコピーされている
        const lineItems = await page.$$('#line-items-body tr');
        expect(lineItems.length).toBeGreaterThanOrEqual(3);

        // 変換元リンクが表示されている
        const sourceLink = await page.$eval('#doc-source-link', el => ({
            display: el.style.display,
            text: el.textContent
        }));
        expect(sourceLink.display).toBe('block');
        expect(sourceLink.text).toContain('見積書');
    });

    test('UC4-02: 請求書のステータスを発行済にして支払期限を設定し保存する', async () => {
        await page.select('#doc-status', 'issued');

        // 支払期限を30日後に設定
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        const dueDateStr = dueDate.toISOString().split('T')[0];
        await page.evaluate((d) => {
            document.getElementById('doc-due-date').value = d;
        }, dueDateStr);

        await saveDoc();

        // 請求書サブタブに切り替えて確認
        await switchDocSubTab('invoice');

        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThanOrEqual(1);
    });

    test('UC4-03: 請求書の印刷プレビューに振込先と登録番号が含まれる', async () => {
        await switchDocSubTab('invoice');

        await page.evaluate(() => { window._printCalled = false; window.print = () => { window._printCalled = true; }; });

        const printBtn = await page.$('.doc-card-actions button[title="印刷"]');
        expect(printBtn).not.toBeNull();
        await printBtn.click();
        await waitForPrint();

        const printHtml = await page.$eval('#print-area', el => el.innerHTML);
        expect(printHtml).toContain('テスト銀行');
        expect(printHtml).toContain('T1234567890123');
    });

    test('UC4-04: 請求書を領収書に変換する', async () => {
        await switchDocSubTab('invoice');

        await convertDoc('1'); // invoice → receipt

        // 但し書きを入力
        await page.evaluate(() => {
            const el = document.getElementById('doc-receipt-of');
            if (el) el.value = '';
        });
        await page.type('#doc-receipt-of', 'Webサイト制作代として');

        // 収入印紙注記が表示されている（税抜510,000円 → ¥200）
        await waitForUI();
        const stampDisplay = await page.$eval('#stamp-notice', el => el.style.display);
        expect(stampDisplay).toBe('block');
        const stampText = await page.$eval('#stamp-notice', el => el.textContent);
        expect(stampText).toContain('収入印紙');
        expect(stampText).toContain('200');
    });

    test('UC4-05: 領収書を保存する', async () => {
        await saveDoc();

        await switchDocSubTab('receipt');
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThanOrEqual(1);
    });

    test('UC4-06: 領収書の印刷プレビューにprint-receiptレイアウトが含まれる', async () => {
        await switchDocSubTab('receipt');

        await page.evaluate(() => { window._printCalled = false; window.print = () => { window._printCalled = true; }; });

        const printBtn = await page.$('.doc-card-actions button[title="印刷"]');
        expect(printBtn).not.toBeNull();
        await printBtn.click();
        await waitForPrint();

        const printHtml = await page.$eval('#print-area', el => el.innerHTML);
        expect(printHtml).toContain('print-receipt');
        expect(printHtml).toContain('但し');
    });

    test('UC4-07: 請求書を売上伝票に変換して保存する', async () => {
        await switchDocSubTab('invoice');

        await convertDoc('2'); // invoice → sales_slip

        await saveDoc();

        await switchDocSubTab('sales_slip');
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThanOrEqual(1);
    });

    // ================================================================
    // UC5: 仕入ワークフロー
    // ================================================================
    test('UC5-01: 発注書を作成する', async () => {
        await switchMainTab('documents');
        await switchDocSubTab('purchase_order');

        await openDocEditor();
        await selectPartnerInEditor('デザインツール商社');
        await setLineItem(0, 'デザインソフトライセンス', 1, 50000);
        await saveDoc();

        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThanOrEqual(1);

        const docNumbers = await page.$$eval('.doc-card-number', els => els.map(e => e.textContent));
        const poNumbers = docNumbers.filter(n => /^PO-/.test(n));
        expect(poNumbers.length).toBeGreaterThanOrEqual(1);
    });

    test('UC5-02: 発注書を納品書に変換して保存する', async () => {
        await switchDocSubTab('purchase_order');

        await convertDoc('2'); // purchase_order → delivery_note

        await saveDoc();

        await switchDocSubTab('delivery_note');
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThanOrEqual(1);
    });

    test('UC5-03: 納品書を売上伝票に変換して保存する', async () => {
        await switchDocSubTab('delivery_note');

        await convertDoc('2'); // delivery_note → sales_slip

        await saveDoc();

        await switchDocSubTab('sales_slip');
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThanOrEqual(2);
    });

    test('UC5-04: 発注書を仕入伝票に変換して保存する', async () => {
        await switchDocSubTab('purchase_order');

        await convertDoc('1'); // purchase_order → purchase_slip

        await saveDoc();

        await switchDocSubTab('purchase_slip');
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThanOrEqual(1);
    });

    test('UC5-05: 新しい見積書を作成する（コンサルティング）', async () => {
        await switchDocSubTab('estimate');

        await openDocEditor();
        await selectPartnerInEditor('ミドリ商事');
        await setLineItem(0, 'コンサルティング', 1, 100000);
        await saveDoc();

        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThanOrEqual(2);
    });

    test('UC5-06: 見積書を発注書に変換して保存する', async () => {
        await switchDocSubTab('estimate');

        // 最新の見積書（コンサルティング）の変換ボタンをクリック
        const convertBtns = await page.$$('.doc-card-actions button[title="変換"]');
        expect(convertBtns.length).toBeGreaterThanOrEqual(1);

        page._dialogQueue.push(async dialog => {
            await dialog.accept('2'); // estimate → purchase_order
        });
        await convertBtns[0].click();
        await waitOverlayOpen('#doc-editor-overlay');

        // 変換元リンク確認
        const sourceLink = await page.$eval('#doc-source-link', el => el.textContent);
        expect(sourceLink).toContain('見積書');

        await saveDoc();

        await switchDocSubTab('purchase_order');
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThanOrEqual(2);
    });

    // ================================================================
    // UC6: 検索・日常管理
    // ================================================================
    test('UC6-01: 帳票番号で検索する（QT）', async () => {
        await switchMainTab('documents');
        await switchDocSubTab('estimate');
        await waitForUI();

        await page.evaluate(() => document.getElementById('doc-search').value = '');
        await page.type('#doc-search', 'QT');
        await waitForUI();

        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThan(0);

        // 全て QT- で始まること
        const numbers = await page.$$eval('.doc-card-number', els => els.map(e => e.textContent));
        numbers.forEach(n => expect(n).toMatch(/^QT-/));
    });

    test('UC6-02: 取引先名で検索する（ミドリ）', async () => {
        await page.evaluate(() => {
            document.getElementById('doc-search').value = '';
            document.getElementById('doc-search').dispatchEvent(new Event('input'));
        });
        await waitForUI();

        await page.type('#doc-search', 'ミドリ');
        await waitForUI();

        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThan(0);

        // 検索をクリア
        await page.evaluate(() => {
            document.getElementById('doc-search').value = '';
            document.getElementById('doc-search').dispatchEvent(new Event('input'));
        });
        await waitForUI();
    });

    test('UC6-03: ステータスフィルタで絞り込む（発行済）', async () => {
        // 全タブ横断で確認するため、請求書タブ（発行済がある）に移動
        await switchDocSubTab('invoice');
        await waitForUI();

        await page.select('#doc-status-filter', 'issued');
        await waitForUI();

        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThanOrEqual(1);

        // フィルタをリセット
        await page.select('#doc-status-filter', '');
        await waitForUI();
    });

    test('UC6-04: 帳票を編集する（ステータスを送付済に変更）', async () => {
        await switchDocSubTab('invoice');
        await waitForUI();

        const editBtn = await page.$('.doc-card-actions button[title="編集"]');
        expect(editBtn).not.toBeNull();
        await editBtn.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        await page.select('#doc-status', 'sent');
        await saveDoc();

        // 変更が反映されていることを確認
        const cardText = await page.$eval('.doc-card', el => el.textContent);
        expect(cardText).toContain('送付済');
    });

    test('UC6-05: 帳票を削除する', async () => {
        // 売上伝票タブの帳票を一つ削除
        await switchDocSubTab('sales_slip');
        await waitForUI();

        const beforeCards = await page.$$('.doc-card');
        const beforeCount = beforeCards.length;
        expect(beforeCount).toBeGreaterThan(0);

        const deleteBtn = await page.$('.doc-card-actions .btn-danger');
        await deleteBtn.click();
        await waitForConfirmDialog();

        // 確認ダイアログでOK
        await page.click('#btn-confirm-ok');
        await waitForUI();

        const afterCards = await page.$$('.doc-card');
        expect(afterCards.length).toBe(beforeCount - 1);
    });

    test('UC6-06: 全7種のサブタブを巡回する', async () => {
        await switchMainTab('documents');

        const docTypes = [
            'estimate', 'purchase_order', 'invoice', 'delivery_note',
            'sales_slip', 'purchase_slip', 'receipt'
        ];

        for (const dt of docTypes) {
            await switchDocSubTab(dt);
            const active = await page.$eval(`[data-doc-type="${dt}"]`, el => el.classList.contains('active'));
            expect(active).toBe(true);
        }
    });

    test('UC6-07: 売上伝票を新規作成する', async () => {
        await switchDocSubTab('sales_slip');

        await openDocEditor();
        await selectPartnerInEditor('ミドリ商事');
        await setLineItem(0, 'スポットコンサル', 1, 30000);
        await saveDoc();

        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThanOrEqual(1);
    });

    test('UC6-08: 売上伝票を領収書に変換して保存する', async () => {
        await switchDocSubTab('sales_slip');

        await convertDoc('2'); // sales_slip → receipt

        // 但し書き入力
        await page.evaluate(() => {
            const el = document.getElementById('doc-receipt-of');
            if (el) el.value = '';
        });
        await page.type('#doc-receipt-of', 'コンサル料として');

        await saveDoc();

        await switchDocSubTab('receipt');
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThanOrEqual(2);
    });

    // ================================================================
    // UC7: マスターデータ管理
    // ================================================================
    test('UC7-01: 取引先を検索する（ミドリ）', async () => {
        await switchMainTab('partners');
        await waitForUI();

        await page.evaluate(() => document.getElementById('partner-search').value = '');
        await page.type('#partner-search', 'ミドリ');
        await waitForUI();

        const partnerCards = await page.$$('.partner-card');
        expect(partnerCards.length).toBeGreaterThanOrEqual(1);

        const cardText = await page.$eval('.partner-card', el => el.textContent);
        expect(cardText).toContain('ミドリ商事');

        // 検索をクリア
        await page.evaluate(() => {
            document.getElementById('partner-search').value = '';
            document.getElementById('partner-search').dispatchEvent(new Event('input'));
        });
        await waitForUI();
    });

    test('UC7-02: 取引先を種別フィルタで絞り込む（得意先）', async () => {
        await switchMainTab('partners');
        await waitForUI();

        await page.select('#partner-type-filter', 'customer');
        await waitForUI();

        const partnerCards = await page.$$('.partner-card');
        expect(partnerCards.length).toBeGreaterThanOrEqual(1);

        const cardText = await page.$eval('.partner-card', el => el.textContent);
        expect(cardText).toContain('ミドリ商事');

        // フィルタをリセット
        await page.select('#partner-type-filter', '');
        await waitForUI();
    });

    test('UC7-03: ミドリ商事の詳細を表示する', async () => {
        await switchMainTab('partners');
        await waitForUI();

        // ミドリ商事の詳細ボタンをクリック
        const detailBtns = await page.$$('.partner-card-actions .btn-secondary');
        let targetBtn = null;
        for (const btn of detailBtns) {
            const text = await page.evaluate(el => el.closest('.partner-card').textContent, btn);
            if (text.includes('ミドリ商事')) {
                targetBtn = btn;
                break;
            }
        }
        expect(targetBtn).not.toBeNull();
        await targetBtn.click();
        await waitOverlayOpen('#partner-detail-overlay');

        const detailOverlay = await page.$eval('#partner-detail-overlay', el => el.style.display);
        expect(detailOverlay).not.toBe('none');

        const detailBody = await page.$eval('#partner-detail-body', el => el.textContent);
        expect(detailBody).toContain('ミドリ商事');
    });

    test('UC7-04: 詳細画面から編集して電話番号を追加する', async () => {
        // 詳細画面の編集ボタン
        await page.click('#btn-partner-detail-edit');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 電話番号を入力
        await page.evaluate(() => document.getElementById('partner-phone').value = '');
        await page.type('#partner-phone', '03-1111-2222');
        await savePartner();

        // 再度詳細を開いて電話番号が表示されていることを確認
        const detailBtns = await page.$$('.partner-card-actions .btn-secondary');
        let targetBtn = null;
        for (const btn of detailBtns) {
            const text = await page.evaluate(el => el.closest('.partner-card').textContent, btn);
            if (text.includes('ミドリ商事')) {
                targetBtn = btn;
                break;
            }
        }
        await targetBtn.click();
        await waitOverlayOpen('#partner-detail-overlay');

        const detailBody = await page.$eval('#partner-detail-body', el => el.textContent);
        expect(detailBody).toContain('03-1111-2222');

        // 詳細を閉じる
        await page.click('#btn-close-partner-detail');
        await waitOverlayClosed('#partner-detail-overlay');
    });

    test('UC7-05: 品目を検索する（ロゴ）', async () => {
        await switchMainTab('items');
        await waitForUI();

        await page.evaluate(() => document.getElementById('item-search').value = '');
        await page.type('#item-search', 'ロゴ');
        await waitForUI();

        const tableText = await page.$eval('#item-table-body', el => el.textContent);
        expect(tableText).toContain('ロゴデザイン');

        // 検索をクリア
        await page.evaluate(() => {
            document.getElementById('item-search').value = '';
            document.getElementById('item-search').dispatchEvent(new Event('input'));
        });
        await waitForUI();
    });

    test('UC7-06: イラスト素材集の詳細を表示する', async () => {
        await switchMainTab('items');
        await waitForUI();

        // イラスト素材集の詳細ボタンをクリック
        const detailBtns = await page.$$('#item-table-body .btn-secondary');
        let targetBtn = null;
        for (const btn of detailBtns) {
            const text = await page.evaluate(el => el.closest('tr').textContent, btn);
            if (text.includes('イラスト素材集')) {
                targetBtn = btn;
                break;
            }
        }
        expect(targetBtn).not.toBeNull();
        await targetBtn.click();
        await waitOverlayOpen('#item-detail-overlay');

        const detailOverlay = await page.$eval('#item-detail-overlay', el => el.style.display);
        expect(detailOverlay).not.toBe('none');

        const detailBody = await page.$eval('#item-detail-body', el => el.textContent);
        expect(detailBody).toContain('イラスト素材集');

        // 詳細を閉じる
        await page.click('#btn-close-item-detail');
        await waitOverlayClosed('#item-detail-overlay');
    });

    test('UC7-07: ロゴデザインの単価を90,000円に編集する', async () => {
        await switchMainTab('items');
        await waitForUI();

        // ロゴデザインの編集ボタンをクリック
        const editBtns = await page.$$('#item-table-body .btn-outline-primary');
        let targetBtn = null;
        for (const btn of editBtns) {
            const text = await page.evaluate(el => el.closest('tr').textContent, btn);
            if (text.includes('ロゴデザイン')) {
                targetBtn = btn;
                break;
            }
        }
        expect(targetBtn).not.toBeNull();
        await targetBtn.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#item-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        await page.evaluate(() => document.getElementById('item-unit-price').value = '');
        await page.type('#item-unit-price', '90000');
        await saveItem();

        const tableText = await page.$eval('#item-table-body', el => el.textContent);
        expect(tableText).toContain('90,000');
    });

    test('UC7-08: イラスト素材集を削除する', async () => {
        await switchMainTab('items');
        await waitForUI();

        const beforeRows = await page.$$('#item-table-body tr');
        const beforeCount = beforeRows.length;

        // イラスト素材集の削除ボタンをクリック
        const deleteBtns = await page.$$('#item-table-body .btn-danger');
        let targetBtn = null;
        for (const btn of deleteBtns) {
            const text = await page.evaluate(el => el.closest('tr').textContent, btn);
            if (text.includes('イラスト素材集')) {
                targetBtn = btn;
                break;
            }
        }
        expect(targetBtn).not.toBeNull();
        await targetBtn.click();
        await waitForConfirmDialog();

        // 確認ダイアログでOK
        await page.click('#btn-confirm-ok');
        await waitForUI();

        const afterRows = await page.$$('#item-table-body tr');
        expect(afterRows.length).toBe(beforeCount - 1);

        const tableText = await page.$eval('#item-table-body', el => el.textContent);
        expect(tableText).not.toContain('イラスト素材集');
    });

    test('UC7-09: 使用中の取引先は削除できない', async () => {
        await switchMainTab('partners');
        await waitForUI();

        const beforeCards = await page.$$('.partner-card');
        const beforeCount = beforeCards.length;

        // デザインツール商社の削除ボタンをクリック（UC5で帳票を作成済み）
        const deleteBtns = await page.$$('.partner-card-actions .btn-danger');
        let targetBtn = null;
        for (const btn of deleteBtns) {
            const text = await page.evaluate(el => el.closest('.partner-card').textContent, btn);
            if (text.includes('デザインツール商社')) {
                targetBtn = btn;
                break;
            }
        }
        expect(targetBtn).not.toBeNull();
        await targetBtn.click();
        await waitForToast();

        // 使用中エラーが表示される（確認ダイアログではなくトースト）
        const toastText = await page.evaluate(() => {
            const toast = document.querySelector('.toast');
            return toast ? toast.textContent : '';
        });
        expect(toastText).toContain('使用されているため削除できません');

        // 取引先数は変わらない
        const afterCards = await page.$$('.partner-card');
        expect(afterCards.length).toBe(beforeCount);
    });

    test('UC7-10: 未使用の取引先を新規登録して削除する', async () => {
        await switchMainTab('partners');
        await waitForUI();

        // テスト用取引先を登録
        await openPartnerForm();
        await page.evaluate(() => document.getElementById('partner-name').value = '');
        await page.type('#partner-name', '削除テスト株式会社');
        await page.select('#partner-type', 'customer');
        await savePartner();

        const beforeCards = await page.$$('.partner-card');
        const beforeCount = beforeCards.length;

        // 削除テスト株式会社の削除ボタンをクリック
        const deleteBtns = await page.$$('.partner-card-actions .btn-danger');
        let targetBtn = null;
        for (const btn of deleteBtns) {
            const text = await page.evaluate(el => el.closest('.partner-card').textContent, btn);
            if (text.includes('削除テスト株式会社')) {
                targetBtn = btn;
                break;
            }
        }
        expect(targetBtn).not.toBeNull();
        await targetBtn.click();
        await waitForConfirmDialog();

        // 確認ダイアログでOK
        await page.click('#btn-confirm-ok');
        await waitForUI();

        const afterCards = await page.$$('.partner-card');
        expect(afterCards.length).toBe(beforeCount - 1);
    });

    // ================================================================
    // UC8: データバックアップ・復元
    // ================================================================
    test('UC8-01: データをエクスポートする', async () => {
        await switchMainTab('settings');
        await waitForUI();

        // ダウンロードパスを設定
        const downloadPath = '/tmp/pado-usecase-e2e-downloads';
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }
        const client = await page.createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath
        });

        // エクスポートボタンをJSクリック
        await page.evaluate(() => document.getElementById('btn-export').click());
        // ダウンロードファイルの生成をポーリングで待つ
        let exportFile = null;
        for (let i = 0; i < 20; i++) {
            const files = fs.existsSync(downloadPath) ? fs.readdirSync(downloadPath) : [];
            exportFile = files.find(f => f.startsWith('pado_export_') && f.endsWith('.json'));
            if (exportFile) break;
            await new Promise(r => setTimeout(r, 200));
        }

        // ダウンロードファイルが存在する
        expect(exportFile).toBeTruthy();

        // JSONとして有効であることを確認
        if (exportFile) {
            const content = fs.readFileSync(`${downloadPath}/${exportFile}`, 'utf-8');
            const data = JSON.parse(content);
            expect(data.partners).toBeDefined();
            expect(data.items).toBeDefined();
            expect(data.documents).toBeDefined();
        }
    });

    test('UC8-02: 全データを削除する', async () => {
        await switchMainTab('settings');
        await waitForUI();

        // 削除ボタンをJSクリック
        await page.evaluate(() => document.getElementById('btn-delete-all').click());

        // 確認ダイアログが表示されるのを待つ
        await waitForConfirmDialog();

        // 確認ダイアログでOK
        await page.evaluate(() => document.getElementById('btn-confirm-ok').click());
        await waitForUI();

        // ページをリロード
        await waitForApp();
    });

    test('UC8-03: 全データ削除後にタブが空であることを確認する', async () => {
        // 帳票タブ
        await switchMainTab('documents');
        await waitForUI();
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBe(0);

        // 取引先タブ
        await switchMainTab('partners');
        await waitForUI();
        const partnerCards = await page.$$('.partner-card');
        expect(partnerCards.length).toBe(0);

        // 品目タブ
        await switchMainTab('items');
        await waitForUI();
        const itemRows = await page.$$('#item-table-body tr');
        expect(itemRows.length).toBe(0);
    });

    test('UC8-04: エクスポートデータをインポートしてデータが復元される', async () => {
        const downloadPath = '/tmp/pado-usecase-e2e-downloads';
        const files = fs.existsSync(downloadPath) ? fs.readdirSync(downloadPath) : [];
        const exportFile = files.find(f => f.startsWith('pado_export_') && f.endsWith('.json'));
        expect(exportFile).toBeTruthy();

        const importFilePath = `${downloadPath}/${exportFile}`;

        await switchMainTab('settings');
        await waitForUI();

        // ファイル入力に設定
        const fileInput = await page.$('#import-file');
        await fileInput.uploadFile(importFilePath);

        // 確認ダイアログが表示されるのを待つ
        await waitForConfirmDialog();

        // 確認ダイアログでOK
        await page.evaluate(() => document.getElementById('btn-confirm-ok').click());
        await waitForUI();

        // インポート完了をリロードで確認
        await waitForApp();

        // 取引先タブで確認
        await switchMainTab('partners');
        await waitForUI();
        const partnerCards = await page.$$('.partner-card');
        expect(partnerCards.length).toBeGreaterThanOrEqual(1);

        const partnerText = await page.$eval('#partner-list', el => el.textContent);
        expect(partnerText).toContain('ミドリ商事');

        // 品目タブで確認
        await switchMainTab('items');
        await waitForUI();
        const itemRows = await page.$$('#item-table-body tr');
        expect(itemRows.length).toBeGreaterThanOrEqual(1);

        // 帳票タブで確認
        await switchMainTab('documents');
        await switchDocSubTab('estimate');
        await waitForUI();
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThanOrEqual(1);
    });

    // ================================================================
    // 全体検証
    // ================================================================
    test('テスト全体でJSエラーが発生していない', async () => {
        expect(pageErrors).toHaveLength(0);
    });
});
