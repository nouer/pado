/**
 * e2e.test.js - Pado E2Eテスト
 * Puppeteer で Docker ネットワーク内の nginx にアクセスしてテスト
 * docker compose run --rm pado-test で実行
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const childProcess = require('child_process');

describe('E2E Test: Pado App', () => {
    let browser;
    let page;
    let baseUrl = 'http://pado-app:80';
    const pageErrors = [];

    jest.setTimeout(300000);

    beforeAll(async () => {
        const host = process.env.E2E_APP_HOST || 'pado-app';
        const fixedIp = String(process.env.E2E_APP_IP || '').trim();
        const hasFixedIp = Boolean(fixedIp && /^\d+\.\d+\.\d+\.\d+$/.test(fixedIp));

        if (hasFixedIp) {
            baseUrl = `http://${fixedIp}:80`;
            console.log(`E2E baseUrl = ${baseUrl} (fixed)`);
        } else {
            const tryResolveIpv4 = () => {
                try {
                    const out = childProcess.execSync(`getent hosts ${host}`, { encoding: 'utf-8', timeout: 8000 }).trim();
                    const ip = out.split(/\s+/)[0];
                    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
                } catch (e) {}
                try {
                    const out = childProcess.execSync(`nslookup ${host} 127.0.0.11`, { encoding: 'utf-8', timeout: 8000 });
                    const lines = String(out || '').split('\n').map(l => l.trim()).filter(Boolean);
                    const addrLine = lines.find(l => /^Address\s+\d+:\s+\d+\.\d+\.\d+\.\d+/.test(l));
                    if (addrLine) {
                        const m = addrLine.match(/(\d+\.\d+\.\d+\.\d+)/);
                        if (m && m[1]) return m[1];
                    }
                } catch (e) {}
                try {
                    const hostsText = fs.readFileSync('/etc/hosts', 'utf-8');
                    const line = hostsText.split('\n').find(l => l.includes(` ${host}`) || l.endsWith(`\t${host}`));
                    if (line) {
                        const ip = line.trim().split(/\s+/)[0];
                        if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
                    }
                } catch (e) {}
                return null;
            };

            let ip = null;
            for (let i = 0; i < 30; i++) {
                ip = tryResolveIpv4();
                if (ip) break;
                await new Promise(r => setTimeout(r, 1000));
            }
            if (!ip) {
                throw new Error(`E2E: cannot resolve '${host}' to IPv4.`);
            }
            baseUrl = `http://${ip}:80`;
            console.log(`E2E baseUrl = ${baseUrl}`);
        }

        browser = await puppeteer.launch({
            headless: 'new',
            timeout: 300000,
            protocolTimeout: 300000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        page.on('pageerror', error => {
            console.error('Browser Page Error:', error.message);
            pageErrors.push(error.message);
        });

        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.error('Browser Console Error:', msg.text());
            }
        });
    }, 300000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    beforeEach(() => {
        pageErrors.length = 0;
    });

    const waitForApp = async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('.tab-nav', { timeout: 10000 });
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
    // タブ切替
    // ============================================================
    test('タブ切替が動作する', async () => {
        // 取引先タブ
        await page.click('[data-tab="partners"]');
        await new Promise(r => setTimeout(r, 300));
        let active = await page.$eval('[data-tab="partners"]', el => el.classList.contains('active'));
        expect(active).toBe(true);
        let visible = await page.$eval('#tab-partners', el => el.classList.contains('active'));
        expect(visible).toBe(true);

        // 品目タブ
        await page.click('[data-tab="items"]');
        await new Promise(r => setTimeout(r, 300));
        active = await page.$eval('[data-tab="items"]', el => el.classList.contains('active'));
        expect(active).toBe(true);

        // 設定タブ
        await page.click('[data-tab="settings"]');
        await new Promise(r => setTimeout(r, 300));
        active = await page.$eval('[data-tab="settings"]', el => el.classList.contains('active'));
        expect(active).toBe(true);

        // 帳票タブに戻る
        await page.click('[data-tab="documents"]');
        await new Promise(r => setTimeout(r, 300));
        active = await page.$eval('[data-tab="documents"]', el => el.classList.contains('active'));
        expect(active).toBe(true);
    });

    test('帳票サブタブ切替が動作する', async () => {
        await page.click('[data-doc-type="invoice"]');
        await new Promise(r => setTimeout(r, 300));
        const active = await page.$eval('[data-doc-type="invoice"]', el => el.classList.contains('active'));
        expect(active).toBe(true);

        await page.click('[data-doc-type="estimate"]');
        await new Promise(r => setTimeout(r, 300));
        const estActive = await page.$eval('[data-doc-type="estimate"]', el => el.classList.contains('active'));
        expect(estActive).toBe(true);
    });

    // ============================================================
    // 設定
    // ============================================================
    test('自社情報を保存できる', async () => {
        await page.click('[data-tab="settings"]');
        await page.waitForSelector('#setting-company-name', { timeout: 5000 });

        await page.evaluate(() => document.getElementById('setting-company-name').value = '');
        await page.type('#setting-company-name', 'テスト商店');
        await page.evaluate(() => document.getElementById('setting-invoice-reg-number').value = '');
        await page.type('#setting-invoice-reg-number', 'T1234567890123');

        page.once('dialog', async dialog => await dialog.accept());
        await page.click('#btn-save-company');
        await new Promise(r => setTimeout(r, 500));

        // リロードして確認
        await waitForApp();
        await page.click('[data-tab="settings"]');
        await page.waitForSelector('#setting-company-name', { timeout: 5000 });
        const value = await page.$eval('#setting-company-name', el => el.value);
        expect(value).toBe('テスト商店');
    });

    // ============================================================
    // 取引先CRUD
    // ============================================================
    test('取引先を登録できる', async () => {
        await page.click('[data-tab="partners"]');
        await new Promise(r => setTimeout(r, 300));

        await page.click('#btn-new-partner');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#partner-form-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000 });

        await page.type('#partner-name', '株式会社テスト');
        await page.select('#partner-type', 'customer');

        await page.click('#btn-save-partner');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#partner-form-overlay');
            return overlay && overlay.style.display === 'none';
        }, { timeout: 10000 });

        const partnerText = await page.$eval('#partner-list', el => el.textContent);
        expect(partnerText).toContain('株式会社テスト');
    });

    // ============================================================
    // 品目CRUD
    // ============================================================
    test('品目を登録できる', async () => {
        await page.click('[data-tab="items"]');
        await new Promise(r => setTimeout(r, 300));

        await page.click('#btn-new-item');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#item-form-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000 });

        await page.type('#item-name', 'テスト品目');
        await page.evaluate(() => document.getElementById('item-unit-price').value = '');
        await page.type('#item-unit-price', '50000');

        await page.click('#btn-save-item');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#item-form-overlay');
            return overlay && overlay.style.display === 'none';
        }, { timeout: 10000 });

        const tableText = await page.$eval('#item-table-body', el => el.textContent);
        expect(tableText).toContain('テスト品目');
    });

    // ============================================================
    // 帳票作成
    // ============================================================
    test('見積書を作成できる', async () => {
        await page.click('[data-tab="documents"]');
        await new Promise(r => setTimeout(r, 300));
        await page.click('[data-doc-type="estimate"]');
        await new Promise(r => setTimeout(r, 300));

        await page.click('#btn-new-doc');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#doc-editor-overlay');
            return overlay && overlay.style.display !== 'none';
        }, { timeout: 5000 });

        // 取引先選択
        const partnerOptions = await page.$$eval('#doc-partner option', opts =>
            opts.filter(o => o.value).map(o => ({ value: o.value, text: o.textContent }))
        );
        expect(partnerOptions.length).toBeGreaterThan(0);
        await page.select('#doc-partner', partnerOptions[0].value);

        // 明細入力
        const nameInput = await page.$('#line-items-body .line-name');
        await nameInput.click({ clickCount: 3 });
        await nameInput.type('テスト品目');

        const priceInput = await page.$('#line-items-body .line-price');
        await priceInput.click({ clickCount: 3 });
        await priceInput.type('50000');

        await new Promise(r => setTimeout(r, 300));

        // 税込合計を確認
        const total = await page.$eval('#summary-total', el => el.textContent);
        expect(total).toBe('¥55,000');

        // 保存
        await page.click('#btn-save-doc');
        await page.waitForFunction(() => {
            const overlay = document.querySelector('#doc-editor-overlay');
            return overlay && overlay.style.display === 'none';
        }, { timeout: 10000 });

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
        const printBtn = await page.$('.doc-card-actions button:nth-child(4)');
        expect(printBtn).not.toBeNull();
        await printBtn.click();
        await new Promise(r => setTimeout(r, 500));

        const printed = await page.evaluate(() => window._printCalled);
        expect(printed).toBe(true);

        const printHtml = await page.$eval('#print-area', el => el.innerHTML);
        expect(printHtml.length).toBeGreaterThan(0);
        expect(printHtml).toContain('テスト商店');
    });

    // ============================================================
    // JSエラーなし確認
    // ============================================================
    test('テスト全体でJSエラーが発生していない', async () => {
        expect(pageErrors).toHaveLength(0);
    });
});
