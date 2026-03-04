#!/usr/bin/env node
/**
 * take_screenshots.js — Pado アプリのスクリーンショット自動撮影
 *
 * 使い方:
 *   docker compose run --rm pado-test node tools/take_screenshots.js
 *
 * 前提:
 *   - Docker内で実行（pado-app が http://pado-app:80 で起動済み）
 *   - Chromium がインストール済み（Dockerfile.test）
 *   - sample_data.json が local_app/ に存在
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const childProcess = require('child_process');

const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'images');
const SAMPLE_DATA_PATH = path.join(__dirname, '..', 'local_app', 'sample_data.json');

// --- ヘルパー ---

function resolveBaseUrl() {
    const fixedIp = String(process.env.E2E_APP_IP || '').trim();
    if (fixedIp && /^\d+\.\d+\.\d+\.\d+$/.test(fixedIp)) {
        return `http://${fixedIp}:80`;
    }
    const host = 'pado-app';
    try {
        const out = childProcess.execSync(`getent hosts ${host}`, { encoding: 'utf-8', timeout: 8000 }).trim();
        const ip = out.split(/\s+/)[0];
        if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return `http://${ip}:80`;
    } catch (e) { /* ignore */ }
    return `http://${host}:80`;
}

async function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function screenshot(page, name, opts = {}) {
    const filePath = path.join(OUTPUT_DIR, name);
    await page.screenshot({ path: filePath, fullPage: false, ...opts });
    console.log(`  ✓ ${name}`);
}

// --- メイン ---

async function main() {
    const baseUrl = resolveBaseUrl();
    console.log(`Base URL: ${baseUrl}`);

    // 出力ディレクトリ作成
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // サンプルデータ読み込み
    const sampleData = JSON.parse(fs.readFileSync(SAMPLE_DATA_PATH, 'utf-8'));

    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/chromium-browser',
        timeout: 120000,
        protocolTimeout: 120000,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    try {
        const page = await browser.newPage();

        // ダイアログ自動承認
        page.on('dialog', async dialog => {
            await dialog.accept();
        });

        // ========== データ投入 ==========
        console.log('Injecting sample data...');
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('.tab-nav', { timeout: 10000 });

        // IndexedDB にサンプルデータを直接投入
        await page.evaluate(async (data) => {
            const db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('PadoDB', 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('partners')) db.createObjectStore('partners', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('doc_sequences')) db.createObjectStore('doc_sequences', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('app_settings')) db.createObjectStore('app_settings', { keyPath: 'id' });
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });

            async function putAll(storeName, items) {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                for (const item of items) { store.put(item); }
                await new Promise((resolve, reject) => {
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                });
            }

            // 取引先・品目・帳票
            if (data.partners) await putAll('partners', data.partners);
            if (data.items) await putAll('items', data.items);
            if (data.documents) await putAll('documents', data.documents);

            // 設定（app_settings ストアに { id: key, value: val } 形式で保存）
            if (data.settings) {
                // 角印テキストを「山田商店」に上書き、折返し数も設定
                const settings = { ...data.settings };
                settings.company_info = {
                    ...settings.company_info,
                    companyName: '山田商店',
                    sealText: '山田商店',
                    address: '東京都渋谷区神宮前1-2-3 テックビル5F',
                    phone: '03-1234-5678',
                    bankInfo: '○○銀行 渋谷支店\n普通 1234567\nヤマダショウテン'
                };
                settings.display_settings = {
                    ...settings.display_settings,
                    showSeal: true,
                    showBank: true
                };
                const tx = db.transaction('app_settings', 'readwrite');
                const store = tx.objectStore('app_settings');
                for (const [key, value] of Object.entries(settings)) {
                    store.put({ id: key, value });
                }
                await new Promise((resolve, reject) => {
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                });
            }

            db.close();
        }, sampleData);

        console.log('Sample data injected.');

        // リロードしてデータ反映
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('.tab-nav', { timeout: 10000 });
        await wait(1000);

        // ========== PC版スクリーンショット ==========
        console.log('\n--- PC screenshots ---');

        // 01: 帳票タブ — 見積書一覧
        await page.setViewport({ width: 1280, height: 800 });
        await page.click('button[data-tab="documents"]');
        await wait(500);
        await page.click('button[data-doc-type="estimate"]');
        await wait(500);
        await screenshot(page, '01_doc_list.png');

        // 02: 帳票編集画面（見積書の1件目を編集）
        await page.setViewport({ width: 1280, height: 1200 });
        const editBtns = await page.$$('#doc-list .btn-secondary');
        // 「編集」ボタンを探す
        let editClicked = false;
        for (const btn of editBtns) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text.trim() === '編集') {
                await btn.click();
                editClicked = true;
                break;
            }
        }
        if (editClicked) {
            await page.waitForSelector('#doc-editor-overlay', { visible: true, timeout: 5000 });
            await wait(500);
            await screenshot(page, '02_doc_editor.png');
            // エディタを閉じる
            await page.click('#btn-cancel-doc');
            await wait(300);
        }

        // 03: 請求書の印刷プレビュー
        await page.click('button[data-doc-type="invoice"]');
        await wait(500);

        // window.print をオーバーライドして印刷を抑止
        await page.evaluate(() => { window.print = () => {}; });

        // 請求書一覧から「印刷」ボタンをクリック
        const invoicePrintBtns = await page.$$('#doc-list .btn-secondary');
        for (const btn of invoicePrintBtns) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text.trim() === '印刷') {
                await btn.click();
                break;
            }
        }
        await wait(500);

        // @media print を有効にしてスクリーンショット
        await page.emulateMediaType('print');
        await wait(500);
        await page.setViewport({ width: 1280, height: 900 });
        await screenshot(page, '03_print_invoice.png', { fullPage: true });
        await page.emulateMediaType('screen');

        // 04: 領収書の印刷プレビュー
        await page.click('button[data-doc-type="receipt"]');
        await wait(500);
        await page.evaluate(() => { window.print = () => {}; });

        const receiptPrintBtns = await page.$$('#doc-list .btn-secondary');
        for (const btn of receiptPrintBtns) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text.trim() === '印刷') {
                await btn.click();
                break;
            }
        }
        await wait(500);

        // @media print を有効にしてスクリーンショット
        await page.emulateMediaType('print');
        await wait(500);
        await page.setViewport({ width: 1280, height: 900 });
        await screenshot(page, '04_print_receipt.png', { fullPage: true });
        await page.emulateMediaType('screen');

        // 05: 取引先タブ — 一覧
        await page.setViewport({ width: 1280, height: 800 });
        await page.click('button[data-tab="partners"]');
        await wait(500);
        await screenshot(page, '05_partners.png');

        // 06: 取引先登録フォーム
        await page.setViewport({ width: 1280, height: 900 });
        // 既存の取引先の「編集」ボタンをクリック
        const partnerEditBtns = await page.$$('#partner-list .btn-secondary');
        let partnerEditClicked = false;
        for (const btn of partnerEditBtns) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text.trim() === '編集') {
                await btn.click();
                partnerEditClicked = true;
                break;
            }
        }
        if (partnerEditClicked) {
            await page.waitForSelector('#partner-form-overlay', { visible: true, timeout: 5000 });
            await wait(500);
            await screenshot(page, '06_partner_form.png');
            await page.click('#btn-cancel-partner');
            await wait(300);
        }

        // 07: 品目タブ — 一覧
        await page.setViewport({ width: 1280, height: 800 });
        await page.click('button[data-tab="items"]');
        await wait(500);
        await screenshot(page, '07_items.png');

        // 08: 設定 — 自社情報
        await page.setViewport({ width: 1280, height: 1200 });
        await page.click('button[data-tab="settings"]');
        await wait(500);
        await screenshot(page, '08_settings_company.png');

        // 09: 設定 — 税設定（スクロールして税設定セクションを表示）
        await page.setViewport({ width: 1280, height: 800 });
        await page.evaluate(() => {
            // 税設定セクションまでスクロール
            const sections = document.querySelectorAll('#tab-settings .settings-section');
            for (const sec of sections) {
                const h2 = sec.querySelector('h2');
                if (h2 && h2.textContent.includes('税設定')) {
                    sec.scrollIntoView({ block: 'start' });
                    break;
                }
            }
        });
        await wait(300);
        await screenshot(page, '09_settings_tax.png');

        // 10: 設定 — 表示設定
        await page.evaluate(() => {
            const sections = document.querySelectorAll('#tab-settings .settings-section');
            for (const sec of sections) {
                const h2 = sec.querySelector('h2');
                if (h2 && h2.textContent.includes('表示設定')) {
                    sec.scrollIntoView({ block: 'start' });
                    break;
                }
            }
        });
        await wait(300);
        await screenshot(page, '10_settings_display.png');

        // 11: 設定 — データ管理
        await page.evaluate(() => {
            const sections = document.querySelectorAll('#tab-settings .settings-section');
            for (const sec of sections) {
                const h2 = sec.querySelector('h2');
                if (h2 && h2.textContent.includes('データ管理')) {
                    sec.scrollIntoView({ block: 'start' });
                    break;
                }
            }
        });
        await wait(300);
        await screenshot(page, '11_settings_data.png');

        // ========== モバイル版スクリーンショット ==========
        console.log('\n--- Mobile screenshots ---');

        await page.setViewport({ width: 375, height: 812 });
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('.tab-nav', { timeout: 10000 });
        await wait(1000);

        // 12: モバイル — 帳票一覧
        await page.click('button[data-tab="documents"]');
        await wait(500);
        await screenshot(page, '12_mobile_doc_list.png');

        // 13: モバイル — 設定画面
        await page.click('button[data-tab="settings"]');
        await wait(500);
        await screenshot(page, '13_mobile_settings.png');

        // ========== クリーンアップ ==========
        console.log('\nCleaning up...');
        await page.evaluate(async () => {
            const dbs = await indexedDB.databases();
            for (const db of dbs) {
                if (db.name) indexedDB.deleteDatabase(db.name);
            }
        });

        await browser.close();
        console.log(`\nDone! ${fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png')).length} screenshots saved to docs/images/`);

    } catch (err) {
        await browser.close();
        throw err;
    }
}

main().catch(e => { console.error(e); process.exit(1); });
