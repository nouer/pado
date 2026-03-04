/**
 * e2e-empty-save.spec.js - 空入力保存テスト
 * 6帳票（見積書・発注書・請求書・納品書・売上伝票・仕入伝票）で
 * 何も入力せずに保存できることを検証する
 *
 * npx playwright test local_app/e2e-empty-save.spec.js
 */
const { test, expect } = require('playwright/test');

const docTypes = [
    { type: 'estimate', label: '見積書' },
    { type: 'purchase_order', label: '発注書' },
    { type: 'invoice', label: '請求書' },
    { type: 'delivery_note', label: '納品書' },
    { type: 'sales_slip', label: '売上伝票' },
    { type: 'purchase_slip', label: '仕入伝票' },
];

test.describe('空入力保存テスト', () => {
    for (const { type, label } of docTypes) {
        test(`${label}を空入力で保存できる`, async ({ page }) => {
            await page.goto('http://localhost:8087');

            // 帳票タブをクリック
            await page.click('[data-tab="documents"]');

            // 帳票種別サブタブをクリック
            await page.click(`[data-doc-type="${type}"]`);

            // 新規作成ボタンをクリック
            await page.click('#btn-new-doc');

            // エディタオーバーレイが表示されるまで待つ
            await expect(page.locator('#doc-editor-overlay')).toBeVisible();

            // 何も入力せず保存ボタンをクリック
            await page.click('#btn-save-doc');

            // エディタが閉じることを確認（保存成功）
            await expect(page.locator('#doc-editor-overlay')).toBeHidden({ timeout: 5000 });

            // 帳票一覧に doc-card が表示されることを確認
            await expect(page.locator('.doc-card')).toBeVisible({ timeout: 5000 });
        });
    }
});
