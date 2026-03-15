#!/usr/bin/env node
/**
 * E2E ベンチマーク: ローカル Playwright vs Docker Puppeteer の速度比較
 *
 * テストシナリオ（代表的な操作10個）:
 *   1. ページ読込
 *   2. タブ切替 × 4
 *   3. 取引先登録
 *   4. 品目登録
 *   5. 見積書作成（明細入力＋自動計算確認）
 *   6. 印刷プレビュー
 *   7. 帳票削除
 *   8. 取引先削除
 *   9. 品目削除
 *  10. 設定保存＋リロード確認
 */
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8087';

async function benchmark() {
    const times = {};
    const mark = (name) => { times[name] = Date.now(); };

    console.log(`ベンチマーク開始: ${BASE_URL}`);
    mark('total_start');

    // ブラウザ起動
    mark('launch_start');
    const browser = await chromium.launch({
        executablePath: '/snap/chromium/current/usr/lib/chromium-browser/chrome',
        headless: true,
        args: ['--no-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    // ダイアログ自動承認
    page.on('dialog', async dialog => { await dialog.accept(); });

    mark('launch_end');
    console.log(`  ブラウザ起動: ${times.launch_end - times.launch_start}ms`);

    // 1. ページ読込
    mark('load_start');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.tab-nav', { timeout: 10000 });
    mark('load_end');
    console.log(`  1. ページ読込: ${times.load_end - times.load_start}ms`);

    // 2. タブ切替 × 4
    mark('tabs_start');
    for (const tab of ['partners', 'items', 'settings', 'documents']) {
        await page.click(`[data-tab="${tab}"]`);
        await page.waitForFunction(
            s => document.querySelector(s)?.classList.contains('active'),
            `[data-tab="${tab}"]`
        );
    }
    mark('tabs_end');
    console.log(`  2. タブ切替×4: ${times.tabs_end - times.tabs_start}ms`);

    // 3. 設定保存
    mark('settings_start');
    await page.click('[data-tab="settings"]');
    await page.waitForSelector('#setting-company-name', { timeout: 5000 });
    await page.fill('#setting-company-name', 'ベンチマーク商店');
    await page.click('#btn-save-company');
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))));
    mark('settings_end');
    console.log(`  3. 設定保存: ${times.settings_end - times.settings_start}ms`);

    // 4. 取引先登録
    mark('partner_start');
    await page.click('[data-tab="partners"]');
    await page.waitForFunction(s => document.querySelector(s)?.classList.contains('active'), '[data-tab="partners"]');
    await page.click('#btn-new-partner');
    await page.waitForFunction(() => {
        const o = document.querySelector('#partner-form-overlay');
        return o && o.style.display !== 'none';
    });
    await page.fill('#partner-name', 'ベンチマーク取引先');
    await page.selectOption('#partner-type', 'customer');
    await page.click('#btn-save-partner');
    await page.waitForFunction(() => {
        const o = document.querySelector('#partner-form-overlay');
        return o && o.style.display === 'none';
    });
    mark('partner_end');
    console.log(`  4. 取引先登録: ${times.partner_end - times.partner_start}ms`);

    // 5. 品目登録
    mark('item_start');
    await page.click('[data-tab="items"]');
    await page.waitForFunction(s => document.querySelector(s)?.classList.contains('active'), '[data-tab="items"]');
    await page.click('#btn-new-item');
    await page.waitForFunction(() => {
        const o = document.querySelector('#item-form-overlay');
        return o && o.style.display !== 'none';
    });
    await page.fill('#item-name', 'ベンチマーク品目');
    await page.fill('#item-unit-price', '10000');
    await page.click('#btn-save-item');
    await page.waitForFunction(() => {
        const o = document.querySelector('#item-form-overlay');
        return o && o.style.display === 'none';
    });
    mark('item_end');
    console.log(`  5. 品目登録: ${times.item_end - times.item_start}ms`);

    // 6. 見積書作成（明細入力＋自動計算）
    mark('doc_start');
    await page.click('[data-tab="documents"]');
    await page.waitForFunction(s => document.querySelector(s)?.classList.contains('active'), '[data-tab="documents"]');
    await page.click('[data-doc-type="estimate"]');
    await page.waitForFunction(s => document.querySelector(s)?.classList.contains('active'), '[data-doc-type="estimate"]');
    await page.click('#btn-new-doc');
    await page.waitForFunction(() => {
        const o = document.querySelector('#doc-editor-overlay');
        return o && o.style.display !== 'none';
    });

    // 取引先選択
    const partnerOption = await page.evaluate(() => {
        const opts = document.querySelectorAll('#doc-partner option');
        for (const o of opts) { if (o.value) return o.value; }
        return null;
    });
    if (partnerOption) {
        await page.selectOption('#doc-partner', partnerOption);
    }

    // 明細入力
    await page.evaluate(() => {
        const row = document.querySelector('#line-items-body tr');
        const nameEl = row.querySelector('.line-name');
        const priceEl = row.querySelector('.line-price');
        nameEl.value = 'ベンチマーク品目';
        nameEl.dispatchEvent(new Event('input', { bubbles: true }));
        priceEl.value = '50000';
        priceEl.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(
        () => document.querySelector('#summary-total')?.textContent.includes('55,000')
    );

    // 保存
    await page.click('#btn-save-doc');
    await page.waitForFunction(() => {
        const o = document.querySelector('#doc-editor-overlay');
        return o && o.style.display === 'none';
    });
    mark('doc_end');
    console.log(`  6. 見積書作成: ${times.doc_end - times.doc_start}ms`);

    // 7. 印刷プレビュー
    mark('print_start');
    await page.evaluate(() => { window._printCalled = false; window.print = () => { window._printCalled = true; }; });
    const printBtn = await page.$('.doc-card-actions button[title="印刷"]');
    if (printBtn) {
        await printBtn.click();
        await page.waitForFunction(() => window._printCalled === true);
    }
    mark('print_end');
    console.log(`  7. 印刷プレビュー: ${times.print_end - times.print_start}ms`);

    // 8. 帳票削除
    mark('doc_del_start');
    const deleteDocBtn = await page.$('.doc-card-actions .btn-danger');
    if (deleteDocBtn) {
        await deleteDocBtn.click();
        await page.waitForFunction(() => {
            const d = document.querySelector('#confirm-dialog');
            return d && d.style.display === 'flex';
        });
        await page.click('#btn-confirm-ok');
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))));
    }
    mark('doc_del_end');
    console.log(`  8. 帳票削除: ${times.doc_del_end - times.doc_del_start}ms`);

    // 9. 品目削除
    mark('item_del_start');
    await page.click('[data-tab="items"]');
    await page.waitForFunction(s => document.querySelector(s)?.classList.contains('active'), '[data-tab="items"]');
    const deleteItemBtn = await page.$('#item-table-body .btn-danger');
    if (deleteItemBtn) {
        await deleteItemBtn.click();
        await page.waitForFunction(() => {
            const d = document.querySelector('#confirm-dialog');
            return d && d.style.display === 'flex';
        });
        await page.click('#btn-confirm-ok');
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))));
    }
    mark('item_del_end');
    console.log(`  9. 品目削除: ${times.item_del_end - times.item_del_start}ms`);

    // 10. 取引先削除
    mark('partner_del_start');
    await page.click('[data-tab="partners"]');
    await page.waitForFunction(s => document.querySelector(s)?.classList.contains('active'), '[data-tab="partners"]');
    const deletePartnerBtn = await page.$('.partner-card-actions .btn-danger');
    if (deletePartnerBtn) {
        await deletePartnerBtn.click();
        await page.waitForFunction(() => {
            const d = document.querySelector('#confirm-dialog');
            return d && d.style.display === 'flex';
        });
        await page.click('#btn-confirm-ok');
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))));
    }
    mark('partner_del_end');
    console.log(` 10. 取引先削除: ${times.partner_del_end - times.partner_del_start}ms`);

    await browser.close();

    mark('total_end');
    const total = times.total_end - times.total_start;
    console.log(`\n===========================`);
    console.log(`合計: ${total}ms (${(total / 1000).toFixed(1)}秒)`);
    console.log(`===========================`);
}

benchmark().catch(e => { console.error(e); process.exit(1); });
