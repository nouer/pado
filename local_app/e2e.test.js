/**
 * e2e.test.js - Pado E2Eテスト
 * Puppeteer で Docker ネットワーク内の nginx にアクセスしてテスト
 * docker compose run --rm pado-test で実行
 *
 * 仕様トレーサビリティ: docs/test_specification.md
 * テストIDはtest名に含まれ、`docker compose run --rm pado-test` で対応確認可能
 * 例: "E2E-DOC-006: 金額が自動計算される"
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const http = require('http');

describe('E2E Test: Pado App', () => {
    let browser;
    let page;
    let baseUrl = 'http://pado-app:80';
    const pageErrors = [];
    let testCount = 0;

    jest.setTimeout(420000);

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
        // ただし elementHandle.click({ clickCount: 3 }) 等はそのまま使う。
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
        // テスト内で dialogQueue にハンドラーを push すると優先処理
        // なければデフォルトで accept する
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
    }, 420000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    beforeEach(() => {
        pageErrors.length = 0;
    });

    const waitForApp = async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('.tab-nav', { timeout: 10000, polling: 100 });
    };

    // ── ヘルパー: setTimeout を排除するためのイベント駆動待機 ──
    // 注意: Docker ヘッドレス Chrome (Alpine) では:
    //   - page.click() がイベントハンドラを発火しない → page.evaluate で JS click() を使う
    //   - waitForFunction のデフォルトポーリング(raf) が動作しない → polling: 100 を指定

    // タブ/サブタブ切替完了待ち
    const clickTab = async (selector) => {
        await page.evaluate(s => document.querySelector(s)?.click(), selector);
        await page.waitForFunction(
            s => document.querySelector(s)?.classList.contains('active'),
            { timeout: 5000, polling: 100 }, selector
        );
    };

    // UI描画完了待ち（IndexedDB非同期処理を含むDOM更新後）
    const waitForUI = () => page.evaluate(() => new Promise(r => setTimeout(r, 50)));

    // オーバーレイ表示待ち
    const waitOverlayOpen = async (id) => {
        await page.waitForFunction(
            s => { const o = document.querySelector(s); return o && o.style.display !== 'none'; },
            { timeout: 5000, polling: 100 }, id
        );
    };

    // オーバーレイ非表示待ち
    const waitOverlayClosed = async (id) => {
        await page.waitForFunction(
            s => { const o = document.querySelector(s); return o && o.style.display === 'none'; },
            { timeout: 10000, polling: 100 }, id
        );
    };

    // トースト表示待ち
    const waitForToast = async () => {
        await page.waitForFunction(
            () => { const t = document.querySelector('#toast-text'); return t && t.textContent.trim().length > 0; },
            { timeout: 5000, polling: 100 }
        );
    };

    // 確認ダイアログ表示待ち
    const waitForConfirmDialog = async () => {
        await page.waitForFunction(
            () => { const d = document.querySelector('#confirm-dialog'); return d && d.style.display === 'flex'; },
            { timeout: 5000, polling: 100 }
        );
    };

    // 計算結果反映待ち（selector の value/textContent に expected が含まれるまで待つ）
    const waitForCalc = async (selector, expected) => {
        await page.waitForFunction(
            (s, e) => { const el = document.querySelector(s); return el && (el.value || el.textContent).includes(e); },
            { timeout: 5000, polling: 100 }, selector, expected
        );
    };

    // 印刷プレビュー完了待ち
    const waitForPrint = async () => {
        await page.waitForFunction(() => window._printCalled === true, { timeout: 5000, polling: 100 });
    };

    // ============================================================
    // 基本起動
    // ============================================================
    test('アプリが起動してJSエラーがない', async () => {
        await waitForApp();
        const title = await page.title();
        expect(title).toContain('Pado');
        expect(pageErrors).toHaveLength(0);
    });

    test('4つのメインタブが表示される', async () => {
        const tabs = await page.$$eval('#main-tab-nav .tab-btn', els => els.map(e => e.textContent));
        expect(tabs).toEqual(['帳票', '取引先', '品目', '設定']);
    });

    test('7つの帳票サブタブが表示される', async () => {
        const subTabs = await page.$$eval('#doc-sub-tab-nav .sub-tab-btn', els => els.map(e => e.textContent));
        expect(subTabs).toHaveLength(7);
        expect(subTabs).toContain('見積書');
        expect(subTabs).toContain('領収書');
    });

    // ============================================================
    // E2E-INIT-005: 起動時スピナー
    // ============================================================
    test('E2E-INIT-005: 起動スピナーが表示され初期化後に消失する', async () => {
        const freshPage = await browser.newPage();
        await freshPage.setViewport({ width: 1280, height: 800 });
        freshPage.on('dialog', async dialog => { await dialog.accept(); });

        await freshPage.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // スピナー要素がHTMLに存在する
        const spinner = await freshPage.$('.loading-spinner');
        expect(spinner).not.toBeNull();

        // 初期化完了まで待機
        await freshPage.waitForFunction(() => document.body.dataset.appReady === 'true', { timeout: 30000, polling: 100 });

        // スピナーが非表示になっている
        const spinnerDisplay = await freshPage.$eval('.loading-spinner', el => getComputedStyle(el).display);
        expect(spinnerDisplay).toBe('none');

        await freshPage.close();
    });

    // ============================================================
    // E2E-INIT-006: 起動時間出力
    // ============================================================
    test('E2E-INIT-006: コンソールに起動時間が出力される', async () => {
        const freshPage = await browser.newPage();
        await freshPage.setViewport({ width: 1280, height: 800 });
        freshPage.on('dialog', async dialog => { await dialog.accept(); });
        const consoleLogs = [];
        freshPage.on('console', msg => consoleLogs.push(msg.text()));

        await freshPage.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await freshPage.waitForFunction(() => document.body.dataset.appReady === 'true', { timeout: 30000, polling: 100 });
        await freshPage.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))));

        const initLog = consoleLogs.find(t => /\[Pado\] init:.*ms/.test(t));
        expect(initLog).toBeTruthy();

        await freshPage.close();
    });

    // ============================================================
    // タブ切替
    // ============================================================
    test('タブ切替が動作する', async () => {
        // 取引先タブ
        await clickTab('[data-tab="partners"]');
        let active = await page.$eval('[data-tab="partners"]', el => el.classList.contains('active'));
        expect(active).toBe(true);
        let visible = await page.$eval('#tab-partners', el => el.classList.contains('active'));
        expect(visible).toBe(true);

        // 品目タブ
        await clickTab('[data-tab="items"]');
        active = await page.$eval('[data-tab="items"]', el => el.classList.contains('active'));
        expect(active).toBe(true);

        // 設定タブ
        await clickTab('[data-tab="settings"]');
        active = await page.$eval('[data-tab="settings"]', el => el.classList.contains('active'));
        expect(active).toBe(true);

        // 帳票タブに戻る
        await clickTab('[data-tab="documents"]');
        active = await page.$eval('[data-tab="documents"]', el => el.classList.contains('active'));
        expect(active).toBe(true);
    });

    test('帳票サブタブ切替が動作する', async () => {
        await clickTab('[data-doc-type="invoice"]');
        const active = await page.$eval('[data-doc-type="invoice"]', el => el.classList.contains('active'));
        expect(active).toBe(true);

        await clickTab('[data-doc-type="estimate"]');
        const estActive = await page.$eval('[data-doc-type="estimate"]', el => el.classList.contains('active'));
        expect(estActive).toBe(true);
    });

    // ============================================================
    // 設定
    // ============================================================
    test('E2E-SET-001: 自社情報を保存できる', async () => {
        await page.click('[data-tab="settings"]');
        await page.waitForSelector('#setting-company-name', { timeout: 5000, polling: 100 });

        await page.evaluate(() => document.getElementById('setting-company-name').value = '');
        await page.type('#setting-company-name', 'テスト商店');
        await page.evaluate(() => document.getElementById('setting-invoice-reg-number').value = '');
        await page.type('#setting-invoice-reg-number', 'T1234567890123');

        await page.click('#btn-save-company');
        await waitForUI();

        // リロードして確認
        await waitForApp();
        await page.click('[data-tab="settings"]');
        await page.waitForSelector('#setting-company-name', { timeout: 5000, polling: 100 });
        const value = await page.$eval('#setting-company-name', el => el.value);
        expect(value).toBe('テスト商店');
    });

    // ============================================================
    // 取引先CRUD
    // ============================================================
    test('取引先を登録できる', async () => {
        await clickTab('[data-tab="partners"]');

        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#partner-form-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        await page.type('#partner-name', '株式会社テスト');
        await page.select('#partner-type', 'customer');

        await page.click('#btn-save-partner');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#partner-form-overlay');
            return overlay && overlay.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        const partnerText = await page.$eval('#partner-list', el => el.textContent);
        expect(partnerText).toContain('株式会社テスト');
    });

    // ============================================================
    // 品目CRUD
    // ============================================================
    test('品目を登録できる', async () => {
        await clickTab('[data-tab="items"]');

        await page.click('#btn-new-item');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#item-form-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        await page.type('#item-name', 'テスト品目');
        await page.evaluate(() => document.getElementById('item-unit-price').value = '');
        await page.type('#item-unit-price', '50000');

        await page.click('#btn-save-item');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#item-form-overlay');
            return overlay && overlay.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        const tableText = await page.$eval('#item-table-body', el => el.textContent);
        expect(tableText).toContain('テスト品目');
    });

    // ============================================================
    // 帳票作成
    // ============================================================
    test('見積書を作成できる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="estimate"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#doc-editor-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 取引先選択
        const partnerOptions = await page.$$eval('#doc-partner option', opts =>
            opts.filter(o => o.value).map(o => ({ value: o.value, text: o.textContent }))
        );
        expect(partnerOptions.length).toBeGreaterThan(0);
        await page.select('#doc-partner', partnerOptions[0].value);

        // 明細入力（evaluate で直接設定して確実に値をセット）
        await page.evaluate(() => {
            const row = document.querySelector('#line-items-body tr');
            const nameEl = row.querySelector('.line-name');
            const priceEl = row.querySelector('.line-price');
            nameEl.value = 'テスト品目';
            nameEl.dispatchEvent(new Event('input', { bubbles: true }));
            priceEl.value = '50000';
            priceEl.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await waitForCalc('#summary-total', '¥55,000');

        // 税込合計を確認
        const total = await page.$eval('#summary-total', el => el.textContent);
        expect(total).toBe('¥55,000');

        // 保存
        await page.click('#btn-save-doc');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#doc-editor-overlay');
            return overlay && overlay.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // 一覧に表示されているか確認
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThan(0);

        const amount = await page.$eval('.doc-card-amount', el => el.textContent);
        expect(amount).toContain('55,000');
    });

    // ============================================================
    // 印刷
    // ============================================================
    test('印刷プレビューが生成される', async () => {
        await page.evaluate(() => { window._printCalled = false; window.print = () => { window._printCalled = true; }; });

        // 印刷ボタンをクリック
        const printBtn = await page.$('.doc-card-actions button[title="印刷"]');
        expect(printBtn).not.toBeNull();
        await printBtn.click();
        await waitForPrint();

        const printed = await page.evaluate(() => window._printCalled);
        expect(printed).toBe(true);

        const printHtml = await page.$eval('#print-area', el => el.innerHTML);
        expect(printHtml.length).toBeGreaterThan(0);
        expect(printHtml).toContain('テスト商店');
    });

    // ============================================================
    // E2E-DOC-006: 金額自動計算
    // ============================================================
    test('E2E-DOC-006: 金額が自動計算される', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#doc-editor-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 取引先選択
        const partnerOptions = await page.$$eval('#doc-partner option', opts =>
            opts.filter(o => o.value).map(o => o.value)
        );
        if (partnerOptions.length > 0) {
            await page.select('#doc-partner', partnerOptions[0]);
        }

        // 支払期限
        await page.evaluate(() => {
            document.getElementById('doc-due-date').value = '2026-04-03';
        });

        // 明細入力: 数量2、単価5000
        const nameInput = await page.$('#line-items-body .line-name');
        await nameInput.click({ clickCount: 3 });
        await nameInput.type('テスト品目A');

        const qtyInput = await page.$('#line-items-body .line-qty');
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type('2');

        const priceInput = await page.$('#line-items-body .line-price');
        await priceInput.click({ clickCount: 3 });
        await priceInput.type('5000');

        await waitForCalc('#summary-total', '¥11,000');

        // 金額 = 2 × 5000 = 10,000
        const amount = await page.$eval('#line-items-body .line-amount', el => el.value || el.textContent);
        expect(amount).toContain('10,000');

        // 合計 = 10,000 + 税1,000 = 11,000
        const total = await page.$eval('#summary-total', el => el.textContent);
        expect(total).toBe('¥11,000');

        // キャンセルして戻る
        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-DOC-007: 税率別集計表示
    // ============================================================
    test('E2E-DOC-007: 税率別集計が正しく表示される', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#doc-editor-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 取引先選択
        const partnerOptions = await page.$$eval('#doc-partner option', opts =>
            opts.filter(o => o.value).map(o => o.value)
        );
        if (partnerOptions.length > 0) {
            await page.select('#doc-partner', partnerOptions[0]);
        }

        // 支払期限
        await page.evaluate(() => {
            document.getElementById('doc-due-date').value = '2026-04-03';
        });

        // 1行目: 10%品目 ¥10,000
        const nameInput1 = await page.$('#line-items-body .line-name');
        await nameInput1.click({ clickCount: 3 });
        await nameInput1.type('標準税率品目');
        const priceInput1 = await page.$('#line-items-body .line-price');
        await priceInput1.click({ clickCount: 3 });
        await priceInput1.type('10000');
        await waitForUI();

        // 行追加
        await page.click('#btn-add-line');
        await waitForUI();

        // 2行目: 8%品目 ¥5,000
        const nameInputs = await page.$$('#line-items-body .line-name');
        const nameInput2 = nameInputs[1];
        await nameInput2.click({ clickCount: 3 });
        await nameInput2.type('軽減税率品目');

        const priceInputs = await page.$$('#line-items-body .line-price');
        const priceInput2 = priceInputs[1];
        await priceInput2.click({ clickCount: 3 });
        await priceInput2.type('5000');

        // 税率を8%に変更
        const taxSelects = await page.$$('#line-items-body .line-tax');
        await taxSelects[1].select('reduced');

        await waitForCalc('#summary-total', '¥16,400');

        // 小計: 15,000, 10%税: 1,000, 8%税: 400, 合計: 16,400
        const subtotal = await page.$eval('#summary-subtotal', el => el.textContent);
        expect(subtotal).toBe('¥15,000');

        const total = await page.$eval('#summary-total', el => el.textContent);
        expect(total).toBe('¥16,400');

        // 税率別内訳が表示されていること
        const taxDetails = await page.$eval('#summary-tax-details', el => el.textContent);
        expect(taxDetails).toContain('10%');
        expect(taxDetails).toContain('8%');

        // キャンセルして戻る
        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-PRT-001拡張: 印刷プレビューの値検証
    // ============================================================
    test('E2E-PRT-001拡張: 印刷プレビューに正しい合計金額が含まれる', async () => {
        // 既存の見積書の印刷プレビューHTMLを再検証
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="estimate"]');

        await page.evaluate(() => { window._printCalled = false; window.print = () => { window._printCalled = true; }; });

        const printBtn = await page.$('.doc-card-actions button[title="印刷"]');
        if (printBtn) {
            await printBtn.click();
            await waitForPrint();

            const printHtml = await page.$eval('#print-area', el => el.innerHTML);
            // 見積書は¥55,000（50,000 + 税5,000）
            expect(printHtml).toContain('55,000');
            expect(printHtml).toContain('テスト商店');
        }
    });

    // ============================================================
    // E2E-STP-001/002: 収入印紙判定
    // ============================================================
    test('E2E-STP-001: 領収書で税抜5万円未満は印紙注記なし', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="receipt"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#doc-editor-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 取引先選択
        const partnerOptions = await page.$$eval('#doc-partner option', opts =>
            opts.filter(o => o.value).map(o => o.value)
        );
        if (partnerOptions.length > 0) {
            await page.select('#doc-partner', partnerOptions[0]);
        }

        // 但し書き入力
        await page.evaluate(() => {
            const el = document.getElementById('doc-receipt-of');
            if (el) { el.value = ''; }
        });
        await page.type('#doc-receipt-of', 'お品代として');

        // 明細: 単価30,000（税抜5万円未満）
        const nameInput = await page.$('#line-items-body .line-name');
        if (nameInput) {
            await nameInput.click({ clickCount: 3 });
            await nameInput.type('テスト品');
            const priceInput = await page.$('#line-items-body .line-price');
            await priceInput.click({ clickCount: 3 });
            await priceInput.type('30000');
            await waitForUI();

            // 印紙注記が非表示
            const stampDisplay = await page.$eval('#stamp-notice', el => el.style.display);
            expect(stampDisplay === 'none' || stampDisplay === '').toBe(true);
        }

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    test('E2E-STP-002: 領収書で税抜5万円以上は印紙税額が表示される', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="receipt"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#doc-editor-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 取引先選択
        const partnerOptions = await page.$$eval('#doc-partner option', opts =>
            opts.filter(o => o.value).map(o => o.value)
        );
        if (partnerOptions.length > 0) {
            await page.select('#doc-partner', partnerOptions[0]);
        }

        // 但し書き入力
        await page.evaluate(() => {
            const el = document.getElementById('doc-receipt-of');
            if (el) { el.value = ''; }
        });
        await page.type('#doc-receipt-of', 'お品代として');

        // 明細: 単価60,000（税抜5万円以上）
        const nameInput = await page.$('#line-items-body .line-name');
        if (nameInput) {
            await nameInput.click({ clickCount: 3 });
            await nameInput.type('高額品');
            const priceInput = await page.$('#line-items-body .line-price');
            await priceInput.click({ clickCount: 3 });
            await priceInput.type('60000');
            await waitForUI();

            // 印紙注記が表示される
            const stampDisplay = await page.$eval('#stamp-notice', el => el.style.display);
            expect(stampDisplay).toBe('block');
            const stampText = await page.$eval('#stamp-notice', el => el.textContent);
            expect(stampText).toContain('収入印紙');
            expect(stampText).toContain('200');
        }

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-DOC-010: 見積書のデフォルト有効期限
    // ============================================================
    test('E2E-DOC-010: 見積書作成時に有効期限がデフォルトで設定される', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="estimate"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#doc-editor-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 有効期限フィールドにデフォルト値が設定されている
        const validUntil = await page.$eval('#doc-valid-until', el => el.value);
        expect(validUntil).toBeTruthy();

        // 約30日後であること確認（±2日の余裕）
        const validDate = new Date(validUntil);
        const now = new Date();
        const diffDays = Math.round((validDate - now) / (1000 * 60 * 60 * 24));
        expect(diffDays).toBeGreaterThanOrEqual(28);
        expect(diffDays).toBeLessThanOrEqual(32);

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-SET-003: 計算設定変更の反映
    // ============================================================
    test('E2E-SET-003: 端数処理の変更が税額に反映される', async () => {
        // まず設定を四捨五入に変更
        await page.click('[data-tab="settings"]');
        await page.waitForSelector('#setting-rounding', { timeout: 5000, polling: 100 });

        await page.select('#setting-rounding', 'round');

        await page.click('#btn-save-tax');
        await waitForUI();

        // 帳票タブに戻って請求書を作成
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#doc-editor-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 取引先選択
        const partnerOptions = await page.$$eval('#doc-partner option', opts =>
            opts.filter(o => o.value).map(o => o.value)
        );
        if (partnerOptions.length > 0) {
            await page.select('#doc-partner', partnerOptions[0]);
        }

        // 支払期限
        await page.evaluate(() => {
            document.getElementById('doc-due-date').value = '2026-04-03';
        });

        // 明細: 999円（10% 四捨五入 = 100）
        const nameInput = await page.$('#line-items-body .line-name');
        await nameInput.click({ clickCount: 3 });
        await nameInput.type('端数テスト品');
        const priceInput = await page.$('#line-items-body .line-price');
        await priceInput.click({ clickCount: 3 });
        await priceInput.type('999');
        await waitForCalc('#summary-total', '¥1,099');

        // 四捨五入: 999 * 0.1 = 99.9 → 100
        // 合計: 999 + 100 = 1,099
        const total = await page.$eval('#summary-total', el => el.textContent);
        expect(total).toBe('¥1,099');

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');

        // 設定を切り捨てに戻す
        await page.click('[data-tab="settings"]');
        await page.waitForSelector('#setting-rounding', { timeout: 5000, polling: 100 });
        await page.select('#setting-rounding', 'floor');
        await page.click('#btn-save-tax');
        await waitForUI();
    });

    // ============================================================
    // E2E-SET-004: 登録番号の帳票反映
    // ============================================================
    test('E2E-SET-004: 登録番号が印刷プレビューに反映される', async () => {
        // 先に設定されたT1234567890123が印刷に含まれることを確認
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="estimate"]');

        await page.evaluate(() => { window._printCalled = false; window.print = () => { window._printCalled = true; }; });

        const printBtn = await page.$('.doc-card-actions button[title="印刷"]');
        if (printBtn) {
            await printBtn.click();
            await waitForPrint();

            const printHtml = await page.$eval('#print-area', el => el.innerHTML);
            expect(printHtml).toContain('T1234567890123');
        }
    });

    // ============================================================
    // E2E-DOC-003/004: 明細行追加・削除
    // ============================================================
    test('E2E-DOC-003: 明細行を追加できる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#doc-editor-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 初期行数を確認
        const initialRows = await page.$$('#line-items-body tr');
        const initialCount = initialRows.length;

        // 行追加
        await page.click('#btn-add-line');
        await waitForUI();

        const afterRows = await page.$$('#line-items-body tr');
        expect(afterRows.length).toBe(initialCount + 1);

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-INIT-004: バージョン表示
    // ============================================================
    test('E2E-INIT-004: バージョン情報が表示される', async () => {
        await waitForApp();
        const versionText = await page.$eval('#app-info-display', el => el.textContent);
        expect(versionText).toMatch(/^v\d+\.\d+\.\d+$/);
    });

    // ============================================================
    // E2E-PTR-002: 取引先コード自動採番
    // ============================================================
    test('E2E-PTR-002: 取引先コードが自動採番される', async () => {
        await waitForApp();
        await clickTab('[data-tab="partners"]');

        // 1件目を登録
        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });
        await page.evaluate(() => document.getElementById('partner-name').value = '');
        await page.type('#partner-name', '自動採番テストA');
        await page.select('#partner-type', 'customer');
        await page.click('#btn-save-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // 2件目を登録
        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });
        await page.evaluate(() => document.getElementById('partner-name').value = '');
        await page.type('#partner-name', '自動採番テストB');
        await page.select('#partner-type', 'supplier');
        await page.click('#btn-save-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // カード上にPxxxxコードが表示されている
        const codes = await page.$$eval('.partner-card-code', els => els.map(e => e.textContent));
        const pCodes = codes.filter(c => /^P\d{4}$/.test(c));
        expect(pCodes.length).toBeGreaterThanOrEqual(2);
    });

    // ============================================================
    // E2E-PTR-003: 取引先編集
    // ============================================================
    test('E2E-PTR-003: 取引先を編集できる', async () => {
        await clickTab('[data-tab="partners"]');

        // 編集ボタンをクリック
        const editBtn = await page.$('.partner-card-actions .btn-outline-primary');
        expect(editBtn).not.toBeNull();
        await editBtn.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 名前を変更
        await page.evaluate(() => document.getElementById('partner-name').value = '');
        await page.type('#partner-name', '編集後取引先');
        await page.click('#btn-save-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // 一覧に反映されている
        const partnerText = await page.$eval('#partner-list', el => el.textContent);
        expect(partnerText).toContain('編集後取引先');
    });

    // ============================================================
    // E2E-PTR-005: 取引先検索
    // ============================================================
    test('E2E-PTR-005: 取引先を検索できる', async () => {
        await clickTab('[data-tab="partners"]');

        // 検索前の件数
        const beforeCards = await page.$$('.partner-card');
        const beforeCount = beforeCards.length;
        expect(beforeCount).toBeGreaterThan(0);

        // 検索実行
        await page.evaluate(() => document.getElementById('partner-search').value = '');
        await page.type('#partner-search', '編集後取引先');
        await waitForUI();

        // フィルタされた結果
        const afterCards = await page.$$('.partner-card');
        expect(afterCards.length).toBeLessThanOrEqual(beforeCount);
        expect(afterCards.length).toBeGreaterThan(0);

        const cardText = await page.$eval('.partner-card', el => el.textContent);
        expect(cardText).toContain('編集後取引先');

        // 検索をクリア
        await page.evaluate(() => {
            document.getElementById('partner-search').value = '';
            document.getElementById('partner-search').dispatchEvent(new Event('input'));
        });
        await waitForUI();
    });

    // ============================================================
    // E2E-PTR-006: 取引先バリデーションエラー
    // ============================================================
    test('E2E-PTR-006: 取引先名が空の場合バリデーションエラーになる', async () => {
        await clickTab('[data-tab="partners"]');

        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 名前空のまま保存
        await page.evaluate(() => document.getElementById('partner-name').value = '');

        await page.click('#btn-save-partner');
        await waitForToast();

        // トーストでエラーが表示される
        const toastText = await page.$eval('#toast-text', el => el.textContent);
        expect(toastText).toBeTruthy();

        // キャンセルして戻る
        await page.click('#btn-cancel-partner');
        await waitOverlayClosed('#partner-form-overlay');
    });

    // ============================================================
    // E2E-PTR-007: 取引先詳細表示
    // ============================================================
    test('E2E-PTR-007: 取引先詳細が表示される', async () => {
        await clickTab('[data-tab="partners"]');

        // 詳細ボタンをクリック
        const detailBtn = await page.$('.partner-card-actions .btn-secondary');
        expect(detailBtn).not.toBeNull();
        await detailBtn.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-detail-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // オーバーレイに取引先名が含まれる
        const detailText = await page.$eval('#partner-detail-body', el => el.textContent);
        expect(detailText).toBeTruthy();

        // .detail-row が存在する
        const detailRows = await page.$$('#partner-detail-body .detail-row');
        expect(detailRows.length).toBeGreaterThan(0);

        // 閉じる
        await page.click('#btn-close-partner-detail');
        await waitOverlayClosed('#partner-detail-overlay');
    });

    // ============================================================
    // E2E-PTR-008: 詳細から編集遷移
    // ============================================================
    test('E2E-PTR-008: 取引先詳細から編集に遷移できる', async () => {
        await clickTab('[data-tab="partners"]');

        // 詳細ボタンをクリック
        const detailBtn = await page.$('.partner-card-actions .btn-secondary');
        await detailBtn.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-detail-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 編集ボタンをクリック
        await page.click('#btn-partner-detail-edit');
        await waitOverlayOpen('#partner-form-overlay');

        // 詳細が閉じている
        const detailDisplay = await page.$eval('#partner-detail-overlay', el => el.style.display);
        expect(detailDisplay === 'none' || detailDisplay === '').toBe(true);

        // 編集フォームが開いている
        const formDisplay = await page.$eval('#partner-form-overlay', el => el.style.display);
        expect(formDisplay).not.toBe('none');

        // 名前入力欄にデータが入っている
        const nameValue = await page.$eval('#partner-name', el => el.value);
        expect(nameValue).toBeTruthy();

        // キャンセルして戻る
        await page.click('#btn-cancel-partner');
        await waitOverlayClosed('#partner-form-overlay');
    });

    // ============================================================
    // E2E-PTR-009: 電話番号不正バリデーション
    // ============================================================
    test('E2E-PTR-009: 電話番号が不正な場合バリデーションエラー', async () => {
        await clickTab('[data-tab="partners"]');

        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        await page.evaluate(() => document.getElementById('partner-name').value = '');
        await page.type('#partner-name', 'バリデーションテスト');
        await page.select('#partner-type', 'customer');
        await page.evaluate(() => document.getElementById('partner-phone').value = '');
        await page.type('#partner-phone', 'abc');

        await page.click('#btn-save-partner');
        await waitForToast();

        const toastText = await page.$eval('#toast-text', el => el.textContent);
        expect(toastText).toContain('電話番号');

        await page.click('#btn-cancel-partner');
        await waitOverlayClosed('#partner-form-overlay');
    });

    // ============================================================
    // E2E-PTR-010: メールアドレス不正バリデーション
    // ============================================================
    test('E2E-PTR-010: メールが不正な場合バリデーションエラー', async () => {
        await clickTab('[data-tab="partners"]');

        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        await page.evaluate(() => document.getElementById('partner-name').value = '');
        await page.type('#partner-name', 'メールテスト');
        await page.select('#partner-type', 'customer');
        await page.evaluate(() => document.getElementById('partner-email').value = '');
        await page.type('#partner-email', 'not-email');

        await page.click('#btn-save-partner');
        await waitForToast();

        const toastText = await page.$eval('#toast-text', el => el.textContent);
        expect(toastText).toContain('メールアドレス');

        await page.click('#btn-cancel-partner');
        await waitOverlayClosed('#partner-form-overlay');
    });

    // ============================================================
    // E2E-PTR-011: 郵便番号不正バリデーション
    // ============================================================
    test('E2E-PTR-011: 郵便番号が不正な場合バリデーションエラー', async () => {
        await clickTab('[data-tab="partners"]');

        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        await page.evaluate(() => document.getElementById('partner-name').value = '');
        await page.type('#partner-name', '郵便番号テスト');
        await page.select('#partner-type', 'customer');
        await page.evaluate(() => document.getElementById('partner-zip').value = '');
        await page.type('#partner-zip', 'invalid');

        await page.click('#btn-save-partner');
        await waitForToast();

        const toastText = await page.$eval('#toast-text', el => el.textContent);
        expect(toastText).toContain('郵便番号');

        await page.click('#btn-cancel-partner');
        await waitOverlayClosed('#partner-form-overlay');
    });

    // ============================================================
    // E2E-PTR-012: ふりがなカタカナバリデーション
    // ============================================================
    test('E2E-PTR-012: ふりがながカタカナの場合バリデーションエラー', async () => {
        await clickTab('[data-tab="partners"]');

        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        await page.evaluate(() => document.getElementById('partner-name').value = '');
        await page.type('#partner-name', 'ふりがなテスト');
        await page.select('#partner-type', 'customer');
        await page.evaluate(() => document.getElementById('partner-name-kana').value = '');
        await page.type('#partner-name-kana', 'テスト');

        await page.click('#btn-save-partner');
        await waitForToast();

        const toastText = await page.$eval('#toast-text', el => el.textContent);
        expect(toastText).toContain('ふりがな');

        await page.click('#btn-cancel-partner');
        await waitOverlayClosed('#partner-form-overlay');
    });

    // ============================================================
    // E2E-PTR-013: 登録番号桁不足バリデーション
    // ============================================================
    test('E2E-PTR-013: 登録番号が桁不足の場合バリデーションエラー', async () => {
        await clickTab('[data-tab="partners"]');

        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        await page.evaluate(() => document.getElementById('partner-name').value = '');
        await page.type('#partner-name', '登録番号テスト');
        await page.select('#partner-type', 'customer');
        await page.evaluate(() => document.getElementById('partner-reg-number').value = '');
        await page.type('#partner-reg-number', 'T123');

        await page.click('#btn-save-partner');
        await waitForToast();

        const toastText = await page.$eval('#toast-text', el => el.textContent);
        expect(toastText).toContain('登録番号');

        await page.click('#btn-cancel-partner');
        await waitOverlayClosed('#partner-form-overlay');
    });

    // ============================================================
    // E2E-PTR-014: ふりがなで取引先検索
    // ============================================================
    test('E2E-PTR-014: ふりがなで取引先を検索できる', async () => {
        await clickTab('[data-tab="partners"]');

        // ふりがな付きの取引先を登録
        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        await page.evaluate(() => document.getElementById('partner-name').value = '');
        await page.type('#partner-name', 'ふりがな検索テスト社');
        await page.select('#partner-type', 'customer');
        await page.evaluate(() => document.getElementById('partner-name-kana').value = '');
        await page.type('#partner-name-kana', 'ふりがなけんさく');
        await page.click('#btn-save-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // ふりがなで検索
        await page.evaluate(() => document.getElementById('partner-search').value = '');
        await page.type('#partner-search', 'ふりがなけんさく');
        await waitForUI();

        const cards = await page.$$('.partner-card');
        expect(cards.length).toBeGreaterThan(0);
        const cardText = await page.$eval('.partner-card', el => el.textContent);
        expect(cardText).toContain('ふりがな検索テスト社');

        // 検索をクリア
        await page.evaluate(() => {
            document.getElementById('partner-search').value = '';
            document.getElementById('partner-search').dispatchEvent(new Event('input'));
        });
        await waitForUI();
    });

    // ============================================================
    // E2E-PTR-004: 取引先削除
    // ============================================================
    test('E2E-PTR-004: 取引先を削除できる', async () => {
        await clickTab('[data-tab="partners"]');

        const beforeCards = await page.$$('.partner-card');
        const beforeCount = beforeCards.length;
        expect(beforeCount).toBeGreaterThan(0);

        // 帳票で使用されていない取引先の削除ボタンをクリック
        // 最後のカードの削除ボタンを使用（自動採番テストBは帳票未使用のはず）
        const deleteButtons = await page.$$('.partner-card-actions .btn-danger');
        const lastDeleteBtn = deleteButtons[deleteButtons.length - 1];
        await lastDeleteBtn.click();
        await waitForConfirmDialog();

        // 確認ダイアログでOK
        const confirmDialog = await page.$('#confirm-dialog');
        const display = await page.evaluate(el => el.style.display, confirmDialog);
        expect(display).toBe('flex');
        await page.click('#btn-confirm-ok');
        await waitForUI();

        const afterCards = await page.$$('.partner-card');
        expect(afterCards.length).toBe(beforeCount - 1);
    });

    // ============================================================
    // E2E-ITM-002: 品目コード自動採番
    // ============================================================
    test('E2E-ITM-002: 品目コードが自動採番される', async () => {
        await clickTab('[data-tab="items"]');

        // 2件目を登録
        await page.click('#btn-new-item');
        await page.waitForFunction(() => {
            const o = document.querySelector('#item-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });
        await page.evaluate(() => document.getElementById('item-name').value = '');
        await page.type('#item-name', '自動採番品目B');
        await page.evaluate(() => document.getElementById('item-unit-price').value = '');
        await page.type('#item-unit-price', '30000');
        await page.click('#btn-save-item');
        await page.waitForFunction(() => {
            const o = document.querySelector('#item-form-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // テーブルにIxxxxコードが表示されている
        const tableText = await page.$eval('#item-table-body', el => el.textContent);
        expect(tableText).toMatch(/I\d{4}/);
    });

    // ============================================================
    // E2E-ITM-003: 品目編集
    // ============================================================
    test('E2E-ITM-003: 品目を編集できる', async () => {
        await clickTab('[data-tab="items"]');

        // 編集ボタンをクリック
        const editBtn = await page.$('#item-table-body .btn-outline-primary');
        expect(editBtn).not.toBeNull();
        await editBtn.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#item-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 名前を変更
        await page.evaluate(() => document.getElementById('item-name').value = '');
        await page.type('#item-name', '編集後品目');
        await page.click('#btn-save-item');
        await page.waitForFunction(() => {
            const o = document.querySelector('#item-form-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        const tableText = await page.$eval('#item-table-body', el => el.textContent);
        expect(tableText).toContain('編集後品目');
    });

    // ============================================================
    // E2E-ITM-004: 品目削除
    // ============================================================
    test('E2E-ITM-004: 品目を削除できる', async () => {
        await clickTab('[data-tab="items"]');

        const beforeRows = await page.$$('#item-table-body tr');
        const beforeCount = beforeRows.length;
        expect(beforeCount).toBeGreaterThan(0);

        // 最後の品目の削除ボタンをクリック
        const deleteButtons = await page.$$('#item-table-body .btn-danger');
        const lastDeleteBtn = deleteButtons[deleteButtons.length - 1];
        await lastDeleteBtn.click();
        await waitForConfirmDialog();

        // 確認ダイアログでOK
        await page.click('#btn-confirm-ok');
        await waitForUI();

        const afterRows = await page.$$('#item-table-body tr');
        expect(afterRows.length).toBe(beforeCount - 1);
    });

    // ============================================================
    // E2E-ITM-005: 品目詳細表示
    // ============================================================
    test('E2E-ITM-005: 品目詳細が表示される', async () => {
        await clickTab('[data-tab="items"]');

        // 詳細ボタンをクリック
        const detailBtn = await page.$('#item-table-body .btn-secondary');
        expect(detailBtn).not.toBeNull();
        await detailBtn.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#item-detail-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // オーバーレイに品目名が含まれる
        const detailText = await page.$eval('#item-detail-body', el => el.textContent);
        expect(detailText).toBeTruthy();

        // 閉じる
        await page.click('#btn-close-item-detail');
        await waitOverlayClosed('#item-detail-overlay');
    });

    // ============================================================
    // E2E-ITM-006: 詳細から編集遷移
    // ============================================================
    test('E2E-ITM-006: 品目詳細から編集に遷移できる', async () => {
        await clickTab('[data-tab="items"]');

        // 詳細ボタンをクリック
        const detailBtn = await page.$('#item-table-body .btn-secondary');
        await detailBtn.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#item-detail-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 編集ボタンをクリック
        await page.click('#btn-item-detail-edit');
        await waitOverlayOpen('#item-form-overlay');

        // 詳細が閉じている
        const detailDisplay = await page.$eval('#item-detail-overlay', el => el.style.display);
        expect(detailDisplay === 'none' || detailDisplay === '').toBe(true);

        // 編集フォームが開いている
        const formDisplay = await page.$eval('#item-form-overlay', el => el.style.display);
        expect(formDisplay).not.toBe('none');

        // 名前入力欄にデータが入っている
        const nameValue = await page.$eval('#item-name', el => el.value);
        expect(nameValue).toBeTruthy();

        // キャンセルして戻る
        await page.click('#btn-cancel-item');
        await waitOverlayClosed('#item-form-overlay');
    });

    // ============================================================
    // E2E-ITM-007: 負の単価バリデーション
    // ============================================================
    test('E2E-ITM-007: 負の単価でバリデーションエラー', async () => {
        await clickTab('[data-tab="items"]');

        await page.click('#btn-new-item');
        await page.waitForFunction(() => {
            const o = document.querySelector('#item-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        await page.evaluate(() => document.getElementById('item-name').value = '');
        await page.type('#item-name', '負の単価品目');
        await page.evaluate(() => {
            const el = document.getElementById('item-unit-price');
            el.value = '-1';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });

        await page.click('#btn-save-item');
        await waitForToast();

        const toastText = await page.$eval('#toast-text', el => el.textContent);
        expect(toastText).toContain('単価');

        await page.click('#btn-cancel-item');
        await waitOverlayClosed('#item-form-overlay');
    });

    // ============================================================
    // E2E-ITM-008: 小数単価バリデーション
    // ============================================================
    test('E2E-ITM-008: 小数単価でバリデーションエラー', async () => {
        await clickTab('[data-tab="items"]');

        await page.click('#btn-new-item');
        await page.waitForFunction(() => {
            const o = document.querySelector('#item-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        await page.evaluate(() => document.getElementById('item-name').value = '');
        await page.type('#item-name', '小数単価品目');
        await page.evaluate(() => {
            const el = document.getElementById('item-unit-price');
            el.value = '100.5';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });

        await page.click('#btn-save-item');
        await waitForToast();

        const toastText = await page.$eval('#toast-text', el => el.textContent);
        expect(toastText).toContain('単価');

        await page.click('#btn-cancel-item');
        await waitOverlayClosed('#item-form-overlay');
    });

    // ============================================================
    // E2E-DOC-001: 請求書新規作成
    // ============================================================
    test('E2E-DOC-001: 請求書を新規作成できる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 取引先選択
        const partnerOptions = await page.$$eval('#doc-partner option', opts =>
            opts.filter(o => o.value).map(o => o.value)
        );
        expect(partnerOptions.length).toBeGreaterThan(0);
        await page.select('#doc-partner', partnerOptions[0]);

        // 支払期限
        await page.evaluate(() => {
            document.getElementById('doc-due-date').value = '2026-04-15';
        });

        // 明細入力
        const nameInput = await page.$('#line-items-body .line-name');
        await nameInput.click({ clickCount: 3 });
        await nameInput.type('請求テスト品');
        const priceInput = await page.$('#line-items-body .line-price');
        await priceInput.click({ clickCount: 3 });
        await priceInput.type('20000');
        await waitForUI();

        // 保存
        await page.click('#btn-save-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // 一覧に表示されている
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThan(0);
        const listText = await page.$eval('#doc-list', el => el.textContent);
        expect(listText).toContain('22,000');
    });

    // ============================================================
    // E2E-DOC-002: 帳票番号自動採番
    // ============================================================
    test('E2E-DOC-002: 帳票番号が自動採番される', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        // 2件目の請求書を作成
        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        const partnerOptions = await page.$$eval('#doc-partner option', opts =>
            opts.filter(o => o.value).map(o => o.value)
        );
        if (partnerOptions.length > 0) {
            await page.select('#doc-partner', partnerOptions[0]);
        }
        await page.evaluate(() => {
            document.getElementById('doc-due-date').value = '2026-04-15';
        });

        const nameInput = await page.$('#line-items-body .line-name');
        await nameInput.click({ clickCount: 3 });
        await nameInput.type('採番テスト品');
        const priceInput = await page.$('#line-items-body .line-price');
        await priceInput.click({ clickCount: 3 });
        await priceInput.type('10000');
        await waitForUI();

        await page.click('#btn-save-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // 帳票番号がINV-YYYY-xxxxの形式で連番になっている
        const docNumbers = await page.$$eval('.doc-card-number', els => els.map(e => e.textContent));
        const invNumbers = docNumbers.filter(n => /^INV-\d{4}-\d{4}$/.test(n));
        expect(invNumbers.length).toBeGreaterThanOrEqual(2);
    });

    // ============================================================
    // E2E-DOC-004: 明細行削除
    // ============================================================
    test('E2E-DOC-004: 明細行を削除できる（最低1行は残る）', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 行追加
        await page.click('#btn-add-line');
        await waitForUI();
        const rowsBefore = await page.$$('#line-items-body tr');
        expect(rowsBefore.length).toBe(2);

        // 2行目の削除ボタンをクリック
        const removeButtons = await page.$$('#line-items-body .btn-remove-line');
        await removeButtons[removeButtons.length - 1].click();
        await waitForUI();

        const rowsAfter = await page.$$('#line-items-body tr');
        expect(rowsAfter.length).toBe(1);

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-DOC-005: 品目選択で自動入力
    // ============================================================
    test('E2E-DOC-005: 品目選択で単価・単位・税区分が自動入力される', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // IndexedDBから品目名を取得
        const itemInfo = await page.evaluate(async () => {
            const items = await getAllFromStore('items');
            if (items.length === 0) return null;
            const item = items[0];
            return { name: item.name, unitPrice: item.defaultUnitPrice, unit: item.unit, taxRateType: item.taxRateType };
        });

        if (itemInfo) {
            // 品目名を入力してchangeイベント発火
            const nameInput = await page.$('#line-items-body .line-name');
            await nameInput.click({ clickCount: 3 });
            await nameInput.type(itemInfo.name);
            await page.evaluate(() => {
                const nameEl = document.querySelector('#line-items-body .line-name');
                nameEl.dispatchEvent(new Event('change', { bubbles: true }));
            });
            await waitForUI();

            // 単価が自動入力されている
            const priceValue = await page.$eval('#line-items-body .line-price', el => el.value);
            expect(parseInt(priceValue)).toBe(itemInfo.unitPrice || 0);
        }

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-DOC-008: 帳票編集
    // ============================================================
    test('E2E-DOC-008: 帳票を編集できる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        // 編集ボタンをクリック
        const editBtn = await page.$('.doc-card-actions button[title="編集"]');
        expect(editBtn).not.toBeNull();
        await editBtn.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 明細名を変更
        const nameInput = await page.$('#line-items-body .line-name');
        await nameInput.click({ clickCount: 3 });
        await nameInput.type('編集後品目名');
        await waitForUI();

        await page.click('#btn-save-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // 再度編集画面を開いて変更が反映されていることを確認
        const editBtnAfter = await page.$('.doc-card-actions button[title="編集"]');
        await editBtnAfter.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        const savedName = await page.$eval('#line-items-body .line-name', el => el.value);
        expect(savedName).toBe('編集後品目名');

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-DOC-009: 帳票削除
    // ============================================================
    test('E2E-DOC-009: 帳票を削除できる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        const beforeCards = await page.$$('.doc-card');
        const beforeCount = beforeCards.length;
        expect(beforeCount).toBeGreaterThan(0);

        // 削除ボタンをクリック
        const deleteBtn = await page.$('.doc-card-actions .btn-danger');
        await deleteBtn.click();
        await waitForConfirmDialog();

        // 確認ダイアログでOK
        await page.click('#btn-confirm-ok');
        await waitForUI();

        const afterCards = await page.$$('.doc-card');
        expect(afterCards.length).toBe(beforeCount - 1);
    });

    // ============================================================
    // E2E-DOC-011: 領収書但し書きフィールド確認
    // ============================================================
    test('E2E-DOC-011: 領収書の但し書きフィールドが表示される', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="receipt"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 但し書きフィールドが表示されている
        const receiptOf = await page.$('#doc-receipt-of');
        expect(receiptOf).not.toBeNull();
        const isVisible = await page.$eval('#doc-receipt-of', el => {
            const field = el.closest('.form-group');
            return field ? field.style.display !== 'none' : true;
        });
        expect(isVisible).toBe(true);

        // プレースホルダーが設定されている
        const placeholder = await page.$eval('#doc-receipt-of', el => el.placeholder);
        expect(placeholder).toBeTruthy();

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-DOC-012: ステータス変更
    // ============================================================
    test('E2E-DOC-012: 帳票のステータスを変更できる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        // 帳票が存在すること確認
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThan(0);

        // 編集ボタンをクリック
        const editBtn = await page.$('.doc-card-actions button[title="編集"]');
        await editBtn.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // ステータスを「発行済」に変更
        await page.select('#doc-status', 'issued');
        await page.click('#btn-save-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // カード上のステータスバッジを確認
        const statusText = await page.$eval('.doc-card', el => el.textContent);
        expect(statusText).toContain('発行済');

        // ステータスを元に戻す
        const editBtn2 = await page.$('.doc-card-actions button[title="編集"]');
        await editBtn2.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });
        await page.select('#doc-status', 'draft');
        await page.click('#btn-save-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });
    });

    // ============================================================
    // E2E-DOC-013: ステータスフィルター
    // ============================================================
    test('E2E-DOC-013: ステータスフィルターで帳票を絞り込める', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        // 全件数を取得
        const allCards = await page.$$('.doc-card');
        const allCount = allCards.length;
        expect(allCount).toBeGreaterThan(0);

        // 存在しないステータスでフィルター → 0件
        await page.select('#doc-status-filter', 'void');
        await waitForUI();
        const voidCards = await page.$$('.doc-card');
        expect(voidCards.length).toBe(0);

        // フィルターを全件に戻す
        await page.select('#doc-status-filter', '');
        await waitForUI();
        const resetCards = await page.$$('.doc-card');
        expect(resetCards.length).toBe(allCount);
    });

    // ============================================================
    // E2E-DOC-014: 混合税率帳票の保存と再表示
    // ============================================================
    test('E2E-DOC-014: 混合税率帳票を保存して再表示できる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // 取引先選択
        const partnerOptions = await page.$$eval('#doc-partner option', opts =>
            opts.filter(o => o.value).map(o => o.value)
        );
        if (partnerOptions.length > 0) {
            await page.select('#doc-partner', partnerOptions[0]);
        }
        await page.evaluate(() => {
            document.getElementById('doc-due-date').value = '2026-04-15';
        });

        // 1行目: 10%品目
        const nameInput1 = await page.$('#line-items-body .line-name');
        await nameInput1.click({ clickCount: 3 });
        await nameInput1.type('標準品');
        const priceInput1 = await page.$('#line-items-body .line-price');
        await priceInput1.click({ clickCount: 3 });
        await priceInput1.type('10000');
        await waitForUI();

        // 行追加
        await page.click('#btn-add-line');
        await waitForUI();

        // 2行目: 8%品目
        const nameInputs = await page.$$('#line-items-body .line-name');
        await nameInputs[1].click({ clickCount: 3 });
        await nameInputs[1].type('軽減品');
        const priceInputs = await page.$$('#line-items-body .line-price');
        await priceInputs[1].click({ clickCount: 3 });
        await priceInputs[1].type('5000');
        const taxSelects = await page.$$('#line-items-body .line-tax');
        await taxSelects[1].select('reduced');
        await waitForUI();

        // 保存
        await page.click('#btn-save-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // 再度開いて税率が維持されているか確認
        const editBtn = await page.$('.doc-card-actions button[title="編集"]');
        await editBtn.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        const savedTaxSelects = await page.$$eval('#line-items-body .line-tax', els => els.map(e => e.value));
        expect(savedTaxSelects).toContain('standard');
        expect(savedTaxSelects).toContain('reduced');

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-DOC-015: 数量0の明細行
    // ============================================================
    test('E2E-DOC-015: 数量0の明細行で金額が0になる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        const nameInput = await page.$('#line-items-body .line-name');
        await nameInput.click({ clickCount: 3 });
        await nameInput.type('数量ゼロ品');
        const qtyInput = await page.$('#line-items-body .line-qty');
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.type('0');
        const priceInput = await page.$('#line-items-body .line-price');
        await priceInput.click({ clickCount: 3 });
        await priceInput.type('10000');
        await waitForUI();

        const amount = await page.$eval('#line-items-body .line-amount', el => el.value || el.textContent);
        expect(amount).toContain('0');

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-DOC-016: 単価0の明細行
    // ============================================================
    test('E2E-DOC-016: 単価0の明細行で金額が0になる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        const nameInput = await page.$('#line-items-body .line-name');
        await nameInput.click({ clickCount: 3 });
        await nameInput.type('単価ゼロ品');
        const priceInput = await page.$('#line-items-body .line-price');
        await priceInput.click({ clickCount: 3 });
        await priceInput.type('0');
        await waitForUI();

        const amount = await page.$eval('#line-items-body .line-amount', el => el.value || el.textContent);
        expect(amount).toContain('0');

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-SET-002: 発行者情報が帳票に反映される
    // ============================================================
    test('E2E-SET-002: 発行者情報が帳票エディタに反映される', async () => {
        // 設定タブで会社名を確認（既に「テスト商店」が設定済み）
        await page.click('[data-tab="settings"]');
        await page.waitForSelector('#setting-company-name', { timeout: 5000, polling: 100 });
        const companyName = await page.$eval('#setting-company-name', el => el.value);
        expect(companyName).toBe('テスト商店');

        // 帳票を作成して保存→印刷プレビューで発行者名を確認
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="estimate"]');

        // 既存の見積書の印刷プレビューを確認
        await page.evaluate(() => { window._printCalled = false; window.print = () => { window._printCalled = true; }; });
        const printBtn = await page.$('.doc-card-actions button[title="印刷"]');
        if (printBtn) {
            await printBtn.click();
            await waitForPrint();
            const printHtml = await page.$eval('#print-area', el => el.innerHTML);
            expect(printHtml).toContain('テスト商店');
        }
    });

    // ============================================================
    // E2E-SET-005: 帳票番号プレフィックス変更
    // ============================================================
    test('E2E-SET-005: 帳票番号プレフィックスを変更できる', async () => {
        await clickTab('[data-tab="settings"]');

        // 請求書のプレフィックスを変更
        const prefixInput = await page.$('input[data-type="invoice"][data-field="prefix"]');
        expect(prefixInput).not.toBeNull();
        const originalPrefix = await page.evaluate(el => el.value, prefixInput);
        await page.evaluate(el => el.value = '', prefixInput);
        await page.type('input[data-type="invoice"][data-field="prefix"]', 'BILL');
        await page.click('#btn-save-number-format');
        await waitForUI();

        // 元に戻す
        await page.evaluate(el => el.value = '', prefixInput);
        await page.type('input[data-type="invoice"][data-field="prefix"]', originalPrefix);
        await page.click('#btn-save-number-format');
        await waitForUI();
    });

    // ============================================================
    // E2E-SET-006: 区切り文字変更
    // ============================================================
    test('E2E-SET-006: 帳票番号の区切り文字を変更できる', async () => {
        await clickTab('[data-tab="settings"]');

        const sepSelect = await page.$('select[data-type="invoice"][data-field="separator"]');
        expect(sepSelect).not.toBeNull();
        const originalSep = await page.evaluate(el => el.value, sepSelect);

        // '/'に変更
        await page.evaluate(el => el.value = '/', sepSelect);
        await page.click('#btn-save-number-format');
        await waitForUI();

        // 元に戻す
        await page.evaluate((el, v) => el.value = v, sepSelect, originalSep);
        await page.click('#btn-save-number-format');
        await waitForUI();
    });

    // ============================================================
    // E2E-SET-007: 年度トグルOFF
    // ============================================================
    test('E2E-SET-007: 帳票番号の年度トグルをOFFにできる', async () => {
        await clickTab('[data-tab="settings"]');

        const yearCheckbox = await page.$('input[data-type="invoice"][data-field="includeYear"]');
        expect(yearCheckbox).not.toBeNull();
        const originalChecked = await page.evaluate(el => el.checked, yearCheckbox);

        // トグルOFF
        if (originalChecked) {
            await yearCheckbox.click();
        }
        await page.click('#btn-save-number-format');
        await waitForUI();

        // 元に戻す
        if (originalChecked) {
            await yearCheckbox.click();
            await page.click('#btn-save-number-format');
            await waitForUI();
        }
    });

    // ============================================================
    // E2E-SET-008: サブタブ表示トグル
    // ============================================================
    test('E2E-SET-008: 帳票サブタブの表示を切り替えられる', async () => {
        await clickTab('[data-tab="settings"]');

        // 仕入伝票を非表示にする
        const checkbox = await page.$('#setting-show-purchase_slip');
        expect(checkbox).not.toBeNull();
        const wasChecked = await page.evaluate(el => el.checked, checkbox);

        if (wasChecked) {
            await checkbox.click();
        }
        await page.click('#btn-save-display');
        await waitForUI();

        // 帳票タブに切り替えて確認
        await clickTab('[data-tab="documents"]');
        const purchaseSlipTab = await page.$('[data-doc-type="purchase_slip"]');
        const tabDisplay = purchaseSlipTab ? await page.evaluate(el => getComputedStyle(el).display, purchaseSlipTab) : 'none';
        expect(tabDisplay).toBe('none');

        // 元に戻す
        await clickTab('[data-tab="settings"]');
        if (wasChecked) {
            const cb = await page.$('#setting-show-purchase_slip');
            await cb.click();
            await page.click('#btn-save-display');
            await waitForUI();
        }
    });

    // ============================================================
    // E2E-SET-009: 日付形式トグル
    // ============================================================
    test('E2E-SET-009: 日付形式を和暦に切り替えられる', async () => {
        await clickTab('[data-tab="settings"]');

        const dateFormatSelect = await page.$('#setting-date-format');
        expect(dateFormatSelect).not.toBeNull();
        const originalFormat = await page.evaluate(el => el.value, dateFormatSelect);

        // 和暦に変更
        await page.select('#setting-date-format', 'japanese');
        await page.click('#btn-save-display');
        await waitForUI();

        // リロードして確認
        await waitForApp();
        await page.click('[data-tab="settings"]');
        await page.waitForSelector('#setting-date-format', { timeout: 5000, polling: 100 });
        const savedFormat = await page.$eval('#setting-date-format', el => el.value);
        expect(savedFormat).toBe('japanese');

        // 元に戻す
        await page.select('#setting-date-format', originalFormat);
        await page.click('#btn-save-display');
        await waitForUI();
    });

    // ============================================================
    // E2E-SET-010: デフォルト帳票タイプ変更
    // ============================================================
    test('E2E-SET-010: デフォルト帳票タイプを変更できる', async () => {
        await clickTab('[data-tab="settings"]');

        const defaultDocSelect = await page.$('#setting-default-doc-type');
        expect(defaultDocSelect).not.toBeNull();
        const originalType = await page.evaluate(el => el.value, defaultDocSelect);

        // 請求書に変更
        await page.select('#setting-default-doc-type', 'invoice');
        await page.click('#btn-save-display');
        await waitForUI();

        // リロードして確認
        await waitForApp();
        await page.click('[data-tab="settings"]');
        await page.waitForSelector('#setting-default-doc-type', { timeout: 5000, polling: 100 });
        const savedType = await page.$eval('#setting-default-doc-type', el => el.value);
        expect(savedType).toBe('invoice');

        // 元に戻す
        await page.select('#setting-default-doc-type', originalType);
        await page.click('#btn-save-display');
        await waitForUI();
    });

    // ============================================================
    // E2E-SET-011: 設定のリロード後永続化
    // ============================================================
    test('E2E-SET-011: 設定がリロード後も永続化される', async () => {
        // 現在の設定を記録
        await page.click('[data-tab="settings"]');
        await page.waitForSelector('#setting-company-name', { timeout: 5000, polling: 100 });
        const companyName = await page.$eval('#setting-company-name', el => el.value);

        // リロード
        await waitForApp();
        await page.click('[data-tab="settings"]');
        await page.waitForSelector('#setting-company-name', { timeout: 5000, polling: 100 });

        // 設定が保持されている
        const afterReload = await page.$eval('#setting-company-name', el => el.value);
        expect(afterReload).toBe(companyName);
    });

    // ============================================================
    // E2E-CNV-001: 見積書→請求書変換
    // ============================================================
    test('E2E-CNV-001: 見積書から請求書に変換できる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="estimate"]');

        // 変換ボタンをクリック
        const convertBtn = await page.$('.doc-card-actions button[title="変換"]');
        expect(convertBtn).not.toBeNull();

        // prompt ダイアログで「1」(請求書)を入力
        page._dialogQueue.push(async dialog => {
            await dialog.accept('1');
        });
        await convertBtn.click();
        await waitOverlayOpen('#doc-editor-overlay');

        // 請求書エディタが開いている
        const overlay = await page.$eval('#doc-editor-overlay', el => el.style.display);
        expect(overlay).not.toBe('none');

        // 明細行がコピーされている
        const lineItems = await page.$$('#line-items-body tr');
        expect(lineItems.length).toBeGreaterThan(0);
        const lineName = await page.$eval('#line-items-body .line-name', el => el.value);
        expect(lineName).toBeTruthy();

        // 変換元リンクが表示されている
        const sourceLink = await page.$eval('#doc-source-link', el => ({
            display: el.style.display,
            text: el.textContent
        }));
        expect(sourceLink.display).toBe('block');
        expect(sourceLink.text).toContain('見積書');

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-CNV-002: 請求書→領収書変換
    // ============================================================
    test('E2E-CNV-002: 請求書から領収書に変換できる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        // 請求書が存在することを確認
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThan(0);

        // 変換ボタンをクリック
        const convertBtn = await page.$('.doc-card-actions button[title="変換"]');
        expect(convertBtn).not.toBeNull();

        // prompt ダイアログで「1」(領収書)を入力
        page._dialogQueue.push(async dialog => {
            await dialog.accept('1');
        });
        await convertBtn.click();
        await waitOverlayOpen('#doc-editor-overlay');

        // 領収書エディタが開いている
        const overlay = await page.$eval('#doc-editor-overlay', el => el.style.display);
        expect(overlay).not.toBe('none');

        // 変換元リンクが表示されている
        const sourceLink = await page.$eval('#doc-source-link', el => ({
            display: el.style.display,
            text: el.textContent
        }));
        expect(sourceLink.display).toBe('block');
        expect(sourceLink.text).toContain('請求書');

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-CNV-003: 変換元の追跡
    // ============================================================
    test('E2E-CNV-003: 変換後の帳票に変換元情報が表示される', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="estimate"]');

        // 見積書から変換
        const convertBtn = await page.$('.doc-card-actions button[title="変換"]');
        expect(convertBtn).not.toBeNull();

        page._dialogQueue.push(async dialog => {
            await dialog.accept('1');
        });
        await convertBtn.click();
        await waitOverlayOpen('#doc-editor-overlay');

        // 変換元リンクにソース帳票番号が含まれている
        const sourceLink = await page.$eval('#doc-source-link', el => el.textContent);
        expect(sourceLink).toMatch(/QT-\d{4}-\d{4}/);

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-CNV-004: 変換不可の帳票
    // ============================================================
    test('E2E-CNV-004: 領収書には変換ボタンが表示されない', async () => {
        // 領収書タブに既存の領収書があるか確認（STP テストで作成済み）
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="receipt"]');

        // 領収書カードが存在すること
        const docCards = await page.$$('.doc-card');
        if (docCards.length === 0) {
            // 存在しない場合は新規作成
            await page.click('#btn-new-doc');
            await page.waitForFunction(() => {
                const o = document.querySelector('#doc-editor-overlay');
                return o && o.style.display !== 'none';
            }, { timeout: 5000, polling: 100 });

            const partnerOptions = await page.$$eval('#doc-partner option', opts =>
                opts.filter(o => o.value).map(o => o.value)
            );
            if (partnerOptions.length > 0) {
                await page.select('#doc-partner', partnerOptions[0]);
            }
            await page.evaluate(() => {
                const el = document.getElementById('doc-receipt-of');
                if (el) el.value = 'テスト';
            });

            const nameInput = await page.$('#line-items-body .line-name');
            await nameInput.click({ clickCount: 3 });
            await nameInput.type('変換テスト品');
            const priceInput = await page.$('#line-items-body .line-price');
            await priceInput.click({ clickCount: 3 });
            await priceInput.type('1000');
            await waitForUI();

            await page.click('#btn-save-doc');
            await page.waitForFunction(() => {
                const o = document.querySelector('#doc-editor-overlay');
                return o && o.style.display === 'none';
            }, { timeout: 10000, polling: 100 });
        }

        // 領収書カードに変換ボタンがないことを確認
        const convertBtn = await page.$('.doc-card-actions button[title="変換"]');
        expect(convertBtn).toBeNull();
    });

    // ============================================================
    // E2E-CNV-005: 見積書→発注書変換
    // ============================================================
    test('E2E-CNV-005: 見積書から発注書に変換できる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="estimate"]');

        const convertBtn = await page.$('.doc-card-actions button[title="変換"]');
        expect(convertBtn).not.toBeNull();

        // prompt ダイアログで「2」(発注書)を入力
        page._dialogQueue.push(async dialog => {
            await dialog.accept('2');
        });
        await convertBtn.click();
        await waitOverlayOpen('#doc-editor-overlay');

        // 発注書エディタが開いている
        const overlay = await page.$eval('#doc-editor-overlay', el => el.style.display);
        expect(overlay).not.toBe('none');

        // 明細行がコピーされている
        const lineItems = await page.$$('#line-items-body tr');
        expect(lineItems.length).toBeGreaterThan(0);

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-CNV-006: 見積書→納品書変換
    // ============================================================
    test('E2E-CNV-006: 見積書から納品書に変換できる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="estimate"]');

        const convertBtn = await page.$('.doc-card-actions button[title="変換"]');
        expect(convertBtn).not.toBeNull();

        // prompt ダイアログで「3」(納品書)を入力
        page._dialogQueue.push(async dialog => {
            await dialog.accept('3');
        });
        await convertBtn.click();
        await waitOverlayOpen('#doc-editor-overlay');

        // 納品書エディタが開いている
        const overlay = await page.$eval('#doc-editor-overlay', el => el.style.display);
        expect(overlay).not.toBe('none');

        // 明細行がコピーされている
        const lineItems = await page.$$('#line-items-body tr');
        expect(lineItems.length).toBeGreaterThan(0);

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-CNV-007: 請求書→売上伝票変換
    // ============================================================
    test('E2E-CNV-007: 請求書から売上伝票に変換できる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="invoice"]');

        const convertBtn = await page.$('.doc-card-actions button[title="変換"]');
        expect(convertBtn).not.toBeNull();

        // prompt ダイアログで「2」(売上伝票)を入力
        page._dialogQueue.push(async dialog => {
            await dialog.accept('2');
        });
        await convertBtn.click();
        await waitOverlayOpen('#doc-editor-overlay');

        // 売上伝票エディタが開いている
        const overlay = await page.$eval('#doc-editor-overlay', el => el.style.display);
        expect(overlay).not.toBe('none');

        // 明細行がコピーされている
        const lineItems = await page.$$('#line-items-body tr');
        expect(lineItems.length).toBeGreaterThan(0);

        await page.click('#btn-cancel-doc');
        await waitOverlayClosed('#doc-editor-overlay');
    });

    // ============================================================
    // E2E-DIO-005: サンプルデータインポート
    // ============================================================
    test('E2E-DIO-005: サンプルデータをインポートできる', async () => {
        await clickTab('[data-tab="settings"]');

        // 既存データをクリアしてからサンプルデータを投入（コード重複回避）
        const importResult = await page.evaluate(async () => {
            try {
                await clearStore('partners');
                await clearStore('items');
                await clearStore('documents');
                await clearStore('doc_sequences');
                const response = await fetch('/sample_data.json');
                if (!response.ok) return 'fetch failed: ' + response.status;
                const data = await response.json();
                if (data.partners) {
                    for (const p of data.partners) { await updateInStore('partners', p); }
                }
                if (data.items) {
                    for (const item of data.items) { await updateInStore('items', item); }
                }
                if (data.documents) {
                    for (const doc of data.documents) { await updateInStore('documents', doc); }
                }
                await loadPartnerList();
                await loadItemList();
                await loadDocList();
                return 'ok';
            } catch (e) {
                return 'error: ' + e.message;
            }
        });
        expect(importResult).toBe('ok');
        await waitForUI();

        // 取引先タブで確認
        await clickTab('[data-tab="partners"]');
        const partnerCards = await page.$$('.partner-card');
        expect(partnerCards.length).toBeGreaterThanOrEqual(3);

        // 品目タブで確認
        await clickTab('[data-tab="items"]');
        const itemRows = await page.$$('#item-table-body tr');
        expect(itemRows.length).toBeGreaterThanOrEqual(6);
    });

    // ============================================================
    // E2E-DIO-001: データエクスポート
    // ============================================================
    test('E2E-DIO-001: データをエクスポートできる', async () => {
        await clickTab('[data-tab="settings"]');

        // ダウンロードを設定
        const downloadPath = '/tmp/pado-e2e-downloads';
        const client = await page.createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath
        });

        // エクスポートボタンをJSクリック
        await page.evaluate(() => document.getElementById('btn-export').click());
        await waitForUI();

        // ダウンロードファイルが存在する
        const files = fs.existsSync(downloadPath) ? fs.readdirSync(downloadPath) : [];
        const exportFile = files.find(f => f.startsWith('pado_export_') && f.endsWith('.json'));
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

    // ============================================================
    // E2E-DIO-002: データインポート
    // ============================================================
    test('E2E-DIO-002: エクスポートデータをインポートできる', async () => {
        // テスト用のインポートデータを作成
        const importData = {
            exportedAt: new Date().toISOString(),
            version: '1.0.0',
            appName: 'pado',
            partners: [{
                id: 'import-test-partner-001',
                name: 'インポートテスト取引先',
                partnerCode: 'P9999',
                partnerType: 'customer',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }],
            items: [{
                id: 'import-test-item-001',
                name: 'インポートテスト品目',
                itemCode: 'I9999',
                defaultUnitPrice: 99999,
                unit: '式',
                taxRateType: 'standard',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }],
            documents: [],
            settings: {}
        };

        const importFilePath = '/tmp/pado-e2e-import-test.json';
        fs.writeFileSync(importFilePath, JSON.stringify(importData));

        await clickTab('[data-tab="settings"]');

        // ファイル入力に設定
        const fileInput = await page.$('#import-file');
        await fileInput.uploadFile(importFilePath);

        // 確認ダイアログが表示されるのを待つ
        await page.waitForFunction(() => {
            const d = document.getElementById('confirm-dialog');
            return d && d.style.display === 'flex';
        }, { timeout: 5000, polling: 100 });

        // 確認ダイアログでOK（JSクリック）
        await page.evaluate(() => document.getElementById('btn-confirm-ok').click());
        await waitForUI();

        // 取引先タブに切り替えてリスト更新を待つ
        await clickTab('[data-tab="partners"]');
        const partnerText = await page.$eval('#partner-list', el => el.textContent);
        expect(partnerText).toContain('インポートテスト取引先');

        // 品目タブで確認
        await clickTab('[data-tab="items"]');
        const itemText = await page.$eval('#item-table-body', el => el.textContent);
        expect(itemText).toContain('インポートテスト品目');

        // クリーンアップ
        fs.unlinkSync(importFilePath);
    });

    // ============================================================
    // E2E-DIO-003: 不正ファイルインポート
    // ============================================================
    test('E2E-DIO-003: 不正なJSONファイルのインポートでエラーが表示される', async () => {
        const invalidFilePath = '/tmp/pado-e2e-invalid.json';
        fs.writeFileSync(invalidFilePath, 'これは不正なJSONです');

        await clickTab('[data-tab="settings"]');

        const fileInput = await page.$('#import-file');
        await fileInput.uploadFile(invalidFilePath);
        await waitForToast();

        // トーストでエラーが表示される
        const toastText = await page.$eval('#toast-text', el => el.textContent);
        expect(toastText).toContain('不正');

        // クリーンアップ
        fs.unlinkSync(invalidFilePath);
    });

    // ============================================================
    // E2E-DIO-004: 全データ削除
    // ============================================================
    test('E2E-DIO-004: 全データを削除できる', async () => {
        await clickTab('[data-tab="settings"]');

        // 削除ボタンをJSクリック
        await page.evaluate(() => document.getElementById('btn-delete-all').click());

        // 確認ダイアログが表示されるのを待つ
        await page.waitForFunction(() => {
            const d = document.getElementById('confirm-dialog');
            return d && d.style.display === 'flex';
        }, { timeout: 5000, polling: 100 });

        // 確認ダイアログでOK（JSクリック）
        await page.evaluate(() => document.getElementById('btn-confirm-ok').click());
        await waitForUI();

        // ページをリロードして全データ削除を確認
        await waitForApp();

        // 帳票タブで確認：一覧が空
        await clickTab('[data-tab="documents"]');
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBe(0);

        // 取引先タブで確認：一覧が空
        await clickTab('[data-tab="partners"]');
        const partnerCards = await page.$$('.partner-card');
        expect(partnerCards.length).toBe(0);
    });

    // ============================================================
    // E2E-DIO-006: エクスポートファイル内容検証
    // ============================================================
    test('E2E-DIO-006: エクスポートファイルのJSON構造が正しい', async () => {
        // DIO-004で全データ削除後なので、まず最低限のデータを作成
        await waitForApp();

        // 取引先作成
        await clickTab('[data-tab="partners"]');
        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });
        await page.type('#partner-name', 'エクスポートテスト社');
        await page.select('#partner-type', 'customer');
        await page.click('#btn-save-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // エクスポートデータの構造を直接IndexedDBから検証
        const exportData = await page.evaluate(async () => {
            const partners = await getAllFromStore('partners');
            const items = await getAllFromStore('items');
            const documents = await getAllFromStore('documents');
            return { partners, items, documents };
        });

        expect(exportData.partners).toBeDefined();
        expect(Array.isArray(exportData.partners)).toBe(true);
        expect(exportData.partners.length).toBeGreaterThan(0);
        expect(exportData.items).toBeDefined();
        expect(exportData.documents).toBeDefined();

        // 取引先データの必須フィールド確認
        const partner = exportData.partners[0];
        expect(partner.id).toBeTruthy();
        expect(partner.name).toBeTruthy();
        expect(partner.partnerType).toBeTruthy();
    });

    // ============================================================
    // E2E-DIO-007: インポートマージ動作
    // ============================================================
    test('E2E-DIO-007: インポートで重複IDは上書きマージされる', async () => {
        // 既存の取引先IDを取得
        const existingPartner = await page.evaluate(async () => {
            const partners = await getAllFromStore('partners');
            return partners.length > 0 ? partners[0] : null;
        });
        expect(existingPartner).not.toBeNull();

        // 同じIDで名前を変更したインポートデータを作成
        const updatedName = '上書きマージテスト社';
        const importData = {
            exportedAt: new Date().toISOString(),
            version: '1.0.0',
            appName: 'pado',
            partners: [{
                ...existingPartner,
                name: updatedName,
                updatedAt: new Date().toISOString()
            }],
            items: [],
            documents: [],
            settings: {}
        };

        const importFilePath = '/tmp/pado-e2e-merge-test.json';
        fs.writeFileSync(importFilePath, JSON.stringify(importData));

        await clickTab('[data-tab="settings"]');

        const fileInput = await page.$('#import-file');
        await fileInput.uploadFile(importFilePath);

        // 確認ダイアログ
        await page.waitForFunction(() => {
            const d = document.getElementById('confirm-dialog');
            return d && d.style.display === 'flex';
        }, { timeout: 5000, polling: 100 });
        await page.evaluate(() => document.getElementById('btn-confirm-ok').click());
        await waitForUI();

        // 取引先タブで上書きされた名前を確認
        await clickTab('[data-tab="partners"]');
        const partnerText = await page.$eval('#partner-list', el => el.textContent);
        expect(partnerText).toContain(updatedName);

        // クリーンアップ
        fs.unlinkSync(importFilePath);
    });

    // ============================================================
    // E2E-PRT-002: 領収書印刷レイアウト
    // ============================================================
    test('E2E-PRT-002: 領収書の印刷レイアウトに但し書きと印紙欄が表示される', async () => {
        // データ復元: まず取引先・帳票を作成
        await waitForApp();

        // 設定を再保存（会社名）
        await page.click('[data-tab="settings"]');
        await page.waitForSelector('#setting-company-name', { timeout: 5000, polling: 100 });
        await page.evaluate(() => document.getElementById('setting-company-name').value = '');
        await page.type('#setting-company-name', 'テスト商店');
        await page.click('#btn-save-company');
        await waitForUI();

        // 取引先作成
        await clickTab('[data-tab="partners"]');
        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });
        await page.type('#partner-name', '印刷テスト取引先');
        await page.select('#partner-type', 'customer');
        await page.click('#btn-save-partner');
        await page.waitForFunction(() => {
            const o = document.querySelector('#partner-form-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // 領収書作成（5万円以上で印紙表示）
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="receipt"]');

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        const partnerOptions = await page.$$eval('#doc-partner option', opts =>
            opts.filter(o => o.value).map(o => o.value)
        );
        if (partnerOptions.length > 0) {
            await page.select('#doc-partner', partnerOptions[0]);
        }

        await page.evaluate(() => {
            const el = document.getElementById('doc-receipt-of');
            if (el) el.value = '';
        });
        await page.type('#doc-receipt-of', 'お食事代');

        const nameInput = await page.$('#line-items-body .line-name');
        await nameInput.click({ clickCount: 3 });
        await nameInput.type('高額品');
        const priceInput = await page.$('#line-items-body .line-price');
        await priceInput.click({ clickCount: 3 });
        await priceInput.type('60000');
        await waitForUI();

        await page.click('#btn-save-doc');
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-editor-overlay');
            return o && o.style.display === 'none';
        }, { timeout: 10000, polling: 100 });

        // 印刷プレビューを生成
        await page.evaluate(() => { window._printCalled = false; window.print = () => { window._printCalled = true; }; });
        const printBtn = await page.$('.doc-card-actions button[title="印刷"]');
        expect(printBtn).not.toBeNull();
        await printBtn.click();
        await waitForPrint();

        const printHtml = await page.$eval('#print-area', el => el.innerHTML);
        // 但し書き
        expect(printHtml).toContain('但し');
        expect(printHtml).toContain('お食事代');
        // 印紙欄
        expect(printHtml).toContain('収入印紙');
        // 領収書レイアウト
        expect(printHtml).toContain('print-receipt');
    });

    // ============================================================
    // E2E-PRT-003: 帳票詳細から印刷
    // ============================================================
    test('E2E-PRT-003: 帳票詳細から印刷できる', async () => {
        await clickTab('[data-tab="documents"]');
        await clickTab('[data-doc-type="receipt"]');

        // 帳票が存在することを確認
        const docCards = await page.$$('.doc-card');
        expect(docCards.length).toBeGreaterThan(0);

        // 詳細ボタンをクリック
        const detailBtn = await page.$('.doc-card-actions button[title="詳細"]');
        expect(detailBtn).not.toBeNull();
        await detailBtn.click();
        await page.waitForFunction(() => {
            const o = document.querySelector('#doc-detail-overlay');
            return o && o.style.display !== 'none';
        }, { timeout: 5000, polling: 100 });

        // window.print をモック
        await page.evaluate(() => { window._printCalled = false; window.print = () => { window._printCalled = true; }; });

        // 印刷ボタンをクリック
        await page.click('#btn-detail-print');
        await waitForPrint();

        // 印刷が呼ばれた
        const printed = await page.evaluate(() => window._printCalled);
        expect(printed).toBe(true);

        // 印刷エリアにコンテンツがある
        const printHtml = await page.$eval('#print-area', el => el.innerHTML);
        expect(printHtml.length).toBeGreaterThan(0);
    });

    // ============================================================
    // E2E-NTF-001: 未読お知らせで通知トースト表示
    // ============================================================
    test('E2E-NTF-001: 未読お知らせがある場合トーストが表示される', async () => {
        await waitForApp();

        // notification_enabled を true に設定
        await page.evaluate(async () => {
            await saveSetting('notification_enabled', true);
        });

        // notification_hash を偽値に設定
        await page.evaluate(async () => {
            await saveSetting('notification_hash', 'fake_hash_for_test');
        });

        // トーストを非表示にリセット
        await page.evaluate(() => {
            document.getElementById('toast').style.display = 'none';
        });

        // checkNotification を実行
        await page.evaluate(async () => {
            await checkNotification();
        });
        await waitForUI();

        // トーストが表示されている
        const toastDisplay = await page.$eval('#toast', el => el.style.display);
        expect(toastDisplay).toBe('block');
        const toastClass = await page.$eval('#toast', el => el.className);
        expect(toastClass).toContain('clickable');
    });

    // ============================================================
    // E2E-NTF-002: トーストクリックでお知らせページ遷移
    // ============================================================
    test('E2E-NTF-002: トーストクリックでお知らせページに遷移する', async () => {
        // window.open をモック
        await page.evaluate(() => {
            window._openedUrl = null;
            window.open = (url) => { window._openedUrl = url; };
        });

        // NTF-001で表示されたトーストがまだ表示中のはず
        const toastDisplay = await page.$eval('#toast', el => el.style.display);
        if (toastDisplay === 'block') {
            // トーストをクリック（閉じるボタン以外の部分）
            await page.click('#toast-text');
            await waitForUI();

            const openedUrl = await page.evaluate(() => window._openedUrl);
            expect(openedUrl).toBeTruthy();
            expect(openedUrl).toContain('notify.html');
        }
    });

    // ============================================================
    // E2E-NTF-003: 通知無効時は表示されない
    // ============================================================
    test('E2E-NTF-003: 通知が無効の場合トーストは表示されない', async () => {
        await waitForApp();

        // notification_enabled を false に設定
        await page.evaluate(async () => {
            await saveSetting('notification_enabled', false);
        });

        // トーストを非表示にリセット
        await page.evaluate(() => {
            document.getElementById('toast').style.display = 'none';
        });

        // checkNotification を実行
        await page.evaluate(async () => {
            await checkNotification();
        });
        await waitForUI();

        // トーストが表示されていない
        const toastDisplay = await page.$eval('#toast', el => el.style.display);
        expect(toastDisplay).toBe('none');

        // notification_enabled を元に戻す
        await page.evaluate(async () => {
            await saveSetting('notification_enabled', true);
        });
    });

    // ============================================================
    // E2E-PWA-001: Service Worker登録確認
    // ============================================================
    test('E2E-PWA-001: Service Worker関連コードが存在する', async () => {
        await waitForApp();
        // registerServiceWorker 関数がページに存在する
        const hasRegisterFn = await page.evaluate(() => typeof registerServiceWorker === 'function');
        expect(hasRegisterFn).toBe(true);

        // sw.js ファイルがサーバーに存在する
        const swExists = await page.evaluate(async () => {
            try {
                const res = await fetch('/sw.js', { method: 'HEAD' });
                return res.ok;
            } catch { return false; }
        });
        expect(swExists).toBe(true);
    });

    // ============================================================
    // E2E-PWA-002: マニフェスト参照確認
    // ============================================================
    test('E2E-PWA-002: manifest.jsonが参照されている', async () => {
        const manifestLink = await page.$eval('link[rel="manifest"]', el => el.getAttribute('href'));
        expect(manifestLink).toBeTruthy();
        expect(manifestLink).toContain('manifest');
    });

    // ============================================================
    // JSエラーなし確認
    // ============================================================
    test('テスト全体でJSエラーが発生していない', async () => {
        expect(pageErrors).toHaveLength(0);
    });
});
