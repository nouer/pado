#!/usr/bin/env node
const puppeteer = require('puppeteer');
const BASE_URL = 'http://pado-app:80';

async function benchmark() {
    const times = {};
    const mark = (name) => { times[name] = Date.now(); };
    const jsClick = (p, sel) => p.evaluate(s => document.querySelector(s)?.click(), sel);
    const waitUI = (p) => p.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))));
    const waitOverlay = (p, sel, visible) => p.waitForFunction((s, v) => {
        const o = document.querySelector(s);
        return o && (v ? o.style.display !== 'none' : o.style.display === 'none');
    }, { timeout: 30000 }, sel, visible);

    console.log(`ベンチマーク開始: ${BASE_URL}`);
    mark('total_start');

    mark('launch_start');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('dialog', async dialog => { await dialog.accept(); });
    mark('launch_end');
    console.log(`  ブラウザ起動: ${times.launch_end - times.launch_start}ms`);

    // 1. ページ読込
    mark('load_start');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.tab-nav', { timeout: 30000 });
    mark('load_end');
    console.log(`  1. ページ読込: ${times.load_end - times.load_start}ms`);

    // 2. タブ切替 × 4
    mark('tabs_start');
    for (const tab of ['partners', 'items', 'settings', 'documents']) {
        await jsClick(page, `[data-tab="${tab}"]`);
        await waitUI(page);
    }
    mark('tabs_end');
    console.log(`  2. タブ切替×4: ${times.tabs_end - times.tabs_start}ms`);

    // 3. 設定保存
    mark('settings_start');
    await jsClick(page, '[data-tab="settings"]');
    await page.waitForSelector('#setting-company-name', { timeout: 10000 });
    await page.evaluate(() => document.getElementById('setting-company-name').value = '');
    await page.type('#setting-company-name', 'ベンチマーク商店');
    await jsClick(page, '#btn-save-company');
    await waitUI(page);
    mark('settings_end');
    console.log(`  3. 設定保存: ${times.settings_end - times.settings_start}ms`);

    // 4. 取引先登録
    mark('partner_start');
    await jsClick(page, '[data-tab="partners"]');
    await page.waitForSelector('#btn-new-partner', { visible: true, timeout: 10000 });
    await jsClick(page, '#btn-new-partner');
    await waitOverlay(page, '#partner-form-overlay', true);
    await page.type('#partner-name', 'ベンチマーク取引先');
    await page.select('#partner-type', 'customer');
    await jsClick(page, '#btn-save-partner');
    await waitOverlay(page, '#partner-form-overlay', false);
    mark('partner_end');
    console.log(`  4. 取引先登録: ${times.partner_end - times.partner_start}ms`);

    // 5. 品目登録
    mark('item_start');
    await jsClick(page, '[data-tab="items"]');
    await page.waitForSelector('#btn-new-item', { visible: true, timeout: 10000 });
    await jsClick(page, '#btn-new-item');
    await waitOverlay(page, '#item-form-overlay', true);
    await page.type('#item-name', 'ベンチマーク品目');
    await page.evaluate(() => document.getElementById('item-unit-price').value = '');
    await page.type('#item-unit-price', '10000');
    await jsClick(page, '#btn-save-item');
    await waitOverlay(page, '#item-form-overlay', false);
    mark('item_end');
    console.log(`  5. 品目登録: ${times.item_end - times.item_start}ms`);

    // 6. 見積書作成
    mark('doc_start');
    await jsClick(page, '[data-tab="documents"]');
    await waitUI(page);
    await jsClick(page, '[data-doc-type="estimate"]');
    await waitUI(page);
    await jsClick(page, '#btn-new-doc');
    await waitOverlay(page, '#doc-editor-overlay', true);
    const opt = await page.evaluate(() => {
        const o = document.querySelectorAll('#doc-partner option');
        for (const x of o) { if (x.value) return x.value; }
        return null;
    });
    if (opt) await page.select('#doc-partner', opt);
    await page.evaluate(() => {
        const row = document.querySelector('#line-items-body tr');
        row.querySelector('.line-name').value = 'ベンチマーク品目';
        row.querySelector('.line-name').dispatchEvent(new Event('input', { bubbles: true }));
        row.querySelector('.line-price').value = '50000';
        row.querySelector('.line-price').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('#summary-total')?.textContent.includes('55,000'), { timeout: 10000 });
    await jsClick(page, '#btn-save-doc');
    await waitOverlay(page, '#doc-editor-overlay', false);
    mark('doc_end');
    console.log(`  6. 見積書作成: ${times.doc_end - times.doc_start}ms`);

    // 7. 印刷プレビュー
    mark('print_start');
    await page.evaluate(() => { window._printCalled = false; window.print = () => { window._printCalled = true; }; });
    await jsClick(page, '.doc-card-actions button[title="印刷"]');
    await page.waitForFunction(() => window._printCalled === true, { timeout: 10000 });
    mark('print_end');
    console.log(`  7. 印刷プレビュー: ${times.print_end - times.print_start}ms`);

    // 8. 帳票削除
    mark('doc_del_start');
    await jsClick(page, '.doc-card-actions .btn-danger');
    await page.waitForFunction(() => {
        const d = document.querySelector('#confirm-dialog');
        return d && d.style.display === 'flex';
    }, { timeout: 10000 });
    await jsClick(page, '#btn-confirm-ok');
    await waitUI(page);
    mark('doc_del_end');
    console.log(`  8. 帳票削除: ${times.doc_del_end - times.doc_del_start}ms`);

    await browser.close();
    mark('total_end');
    const total = times.total_end - times.total_start;
    console.log(`\n===========================`);
    console.log(`合計: ${total}ms (${(total / 1000).toFixed(1)}秒)`);
    console.log(`===========================`);
}

benchmark().catch(e => { console.error(e); process.exit(1); });
