# Docker + Puppeteer E2E テスト高速化ガイド

## 1. 概要

Docker + Alpine + Chromium + Puppeteer（ARM64）環境での E2E テスト高速化ガイド。
pado プロジェクトで発見・検証した 3 つの施策をまとめる。

| 施策 | 効果 | 難易度 |
|------|------|--------|
| setTimeout の排除 | **最大**（90秒以上の無駄な待機を削減） | 中 |
| Docker Chrome 136 の互換性対応 | テストハング防止 | 低 |
| Docker Compose のネットワーク設計 | Pool overlaps エラーの根絶 | 低 |

### 対象環境

- Docker（Alpine Linux ベースイメージ）
- Chromium（ヘッドレスモード、ARM64 含む）
- Puppeteer
- Jest（テストランナー）

---

## 2. 施策1: setTimeout の排除（最大効果）

### 問題

固定 `setTimeout(300)` / `setTimeout(500)` が E2E テスト全体に散在し、累積で **90秒以上** の無駄な待機時間を生んでいた。

```javascript
// ❌ Before: 固定遅延の連鎖
await page.click('#tab-settings');
await new Promise(r => setTimeout(r, 300));
await page.type('#company-name', 'テスト株式会社');
await new Promise(r => setTimeout(r, 300));
await page.click('#save-btn');
await new Promise(r => setTimeout(r, 500));
// → 3操作で 1,100ms の固定遅延
```

### 解決: イベント駆動ヘルパー関数

UI の状態変化を直接監視することで、固定遅延をゼロにする。

```javascript
// ✅ After: イベント駆動
await clickTab('#tab-settings');       // active クラスの付与を検出
await page.type('#company-name', 'テスト株式会社');
await page.click('#save-btn');
await waitForToast();                  // トースト表示を検出
// → 実際の処理時間のみ（数十ms）
```

### ヘルパー関数一覧

#### clickTab — タブ切り替え

```javascript
const clickTab = async (selector) => {
    await page.evaluate(s => document.querySelector(s)?.click(), selector);
    await page.waitForFunction(
        s => document.querySelector(s)?.classList.contains('active'),
        { timeout: 5000, polling: 100 }, selector
    );
};
```

#### waitForUI — 最小 UI 更新待ち

DOM 更新の反映を待つ最小限のヘルパー。`requestAnimationFrame` はヘッドレス Chrome で発火しないため `setTimeout` を使用する（後述）。

```javascript
const waitForUI = () => page.evaluate(() => new Promise(r => setTimeout(r, 50)));
```

#### waitOverlayOpen / waitOverlayClosed — オーバーレイ表示/非表示

```javascript
const waitOverlayOpen = async (id) => {
    await page.waitForFunction(
        s => { const o = document.querySelector(s); return o && o.style.display !== 'none'; },
        { timeout: 5000, polling: 100 }, id
    );
};

const waitOverlayClosed = async (id) => {
    await page.waitForFunction(
        s => { const o = document.querySelector(s); return o && o.style.display === 'none'; },
        { timeout: 10000, polling: 100 }, id
    );
};
```

#### waitForToast — トースト通知

```javascript
const waitForToast = async () => {
    await page.waitForFunction(
        () => { const t = document.querySelector('#toast-text'); return t && t.textContent.trim().length > 0; },
        { timeout: 5000, polling: 100 }
    );
};
```

#### waitForConfirmDialog — 確認ダイアログ

```javascript
const waitForConfirmDialog = async () => {
    await page.waitForFunction(
        () => { const d = document.querySelector('#confirm-dialog'); return d && d.style.display === 'flex'; },
        { timeout: 5000, polling: 100 }
    );
};
```

#### waitForCalc — 計算結果の反映

```javascript
const waitForCalc = async (selector, expected) => {
    await page.waitForFunction(
        (s, e) => { const el = document.querySelector(s); return el && (el.value || el.textContent).includes(e); },
        { timeout: 5000, polling: 100 }, selector, expected
    );
};
```

#### waitForPrint — 印刷プレビュー

```javascript
const waitForPrint = async () => {
    await page.waitForFunction(() => window._printCalled === true, { timeout: 5000, polling: 100 });
};
```

### 効果: ベンチマーク結果

イベント駆動化後の操作単位の所要時間（Docker Puppeteer 実測値）:

| 操作 | 所要時間 |
|------|---------|
| アプリ起動（networkidle2） | 1,034ms |
| タブ切り替え × 4 | 78ms |
| 設定保存 | 66ms |
| 取引先登録 | 57ms |
| 品目登録 | 96ms |
| 帳票作成（計算検証込み） | 98ms |
| 印刷プレビュー | 6ms |
| 帳票削除 | 10ms |

アプリ起動を除く全操作が **100ms 以下** で完了する。固定 `setTimeout` では同じ操作に 300〜1,000ms かかっていた。

---

## 3. 施策2: Docker Chrome 136 (Alpine) の互換性対応

Docker ヘッドレス Chrome（特に Chrome 136 / Alpine）では、ローカル環境と異なる挙動が 3 点ある。いずれも対処しないとテストがハングする。

### 問題1: `page.click()` がイベントハンドラを発火しない

**症状**: `page.click('#tab-xxx')` を実行しても、タブが `active` にならない。

**検証結果**:
```
page.click()     → 1秒後も active=false（イベント未発火）
page.evaluate()  → 即座に active=true（正常動作）
```

`page.click()` は Puppeteer の CDP (Chrome DevTools Protocol) 経由でマウスイベントを合成するが、Docker ヘッドレス Chrome ではこの合成イベントが正しくディスパッチされない。`elementHandle.click()` も同様に影響を受ける。

**解決**: `page.click` を monkey-patch して `page.evaluate` ベースのクリックに置き換える。

```javascript
// beforeAll で適用
const _origClick = page.click.bind(page);
page.click = async (selector, options) => {
    // clickCount（ダブルクリック）や button（右クリック）は元の実装を使用
    if (options && (options.clickCount || options.button)) {
        return _origClick(selector, options);
    }
    await page.evaluate(s => document.querySelector(s)?.click(), selector);
};
```

> **注意**: この monkey-patch は `clickCount`（ダブルクリック）や `button`（右クリック）を使う場合は元の実装にフォールバックする。通常のクリックのみ `evaluate` に置き換わる。

> **⚠ トレードオフ: 偽陽性リスク**
>
> `page.evaluate(() => el.click())` は DOM の `click()` メソッドを直接呼び出すため、Puppeteer 本来の `page.click()` が行う以下のチェックを **バイパス** する:
>
> - ヒットテスト（要素が他の要素に覆われていないか）
> - 可視性チェック（`display: none` / `visibility: hidden` でないか）
> - `mousedown` → `mouseup` → `click` のイベントシーケンス
>
> これにより、ユーザーが実際にはクリックできない UI 要素でもテストが通る偽陽性が発生し得る。
>
> **緩和策**:
> - クリック前に `page.waitForSelector(selector, { visible: true })` で可視性を確認する
> - CI ではこの monkey-patch 付きで高速実行し、定期的にローカル環境（monkey-patch なし）でもテストを実行して UI の到達可能性を検証する
> - Chrome / Puppeteer のアップデートで本問題が修正された場合は、monkey-patch を除去する

### 問題2: `waitForFunction` のデフォルトポーリング (raf) が発火しない

**症状**: `page.waitForFunction()` がタイムアウトせずに永久にハングする。

Puppeteer の `waitForFunction` はデフォルトで `requestAnimationFrame`（raf）ベースのポーリングを使用する。しかし Docker ヘッドレス Chrome では `requestAnimationFrame` が発火しないため、条件が満たされても検出されない。

**解決**: 全ての `waitForFunction` に `{ polling: 100 }` を明示的に指定する。

```javascript
// ❌ Before: デフォルト raf ポーリング → ハング
await page.waitForFunction(() => someCondition(), { timeout: 5000 });

// ✅ After: 明示的なインターバルポーリング
await page.waitForFunction(() => someCondition(), { timeout: 5000, polling: 100 });
```

### 問題3: `requestAnimationFrame` がヘッドレスで発火しない

**症状**: `requestAnimationFrame` を使った UI 更新待ちが永久にハングする。

```javascript
// ❌ Before: ハング
const waitForUI = () => page.evaluate(() => new Promise(r => requestAnimationFrame(r)));

// ✅ After: setTimeout で代替
const waitForUI = () => page.evaluate(() => new Promise(r => setTimeout(r, 50)));
```

> **背景**: ヘッドレスモードでは画面描画が行われないため、`requestAnimationFrame` のコールバックが呼ばれない。`setTimeout` による短い遅延で代替する。

---

## 4. 施策3: Docker Compose のネットワーク設計

### 問題: 固定サブネットによる Pool overlaps エラー

```yaml
# ❌ Before: 固定サブネット — 他プロジェクトと競合
networks:
  app_net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.32.0.0/24

services:
  app:
    networks:
      app_net:
        ipv4_address: 172.32.0.10
```

複数プロジェクト（pado, smrm, sbpr 等）が同じサブネットを使用すると、Docker の `Pool overlaps with other one on this address space` エラーが発生する。

### 解決: Docker 自動割当 + DNS サービスディスカバリ

```yaml
# ✅ After: Docker 自動割当
services:
  app:
    build: .
    networks:
      - app_net
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:80/"]
      interval: 2s
      timeout: 3s
      retries: 10
      start_period: 5s

  test:
    build:
      context: .
      dockerfile: Dockerfile.test
    shm_size: '1gb'
    networks:
      - app_net
    depends_on:
      app:
        condition: service_healthy

networks:
  app_net:
    driver: bridge
```

**ポイント**:

| 項目 | 説明 |
|------|------|
| **固定 IP 削除** | `ipam` と `ipv4_address` を削除し、Docker に自動割当を任せる |
| **DNS サービスディスカバリ** | テストコード内で IP ではなくサービス名（例: `http://app:80`）でアクセスする |
| **healthcheck** | `wget` による HTTP チェックで、アプリの起動完了を検出する |
| **depends_on + service_healthy** | テストコンテナはアプリの healthcheck 通過後に起動する |
| **shm_size: '1gb'** | Chrome のレンダラプロセスが `/dev/shm` を使用するため、十分な共有メモリを確保する（デフォルト 64MB では不足） |

---

## 5. 適用チェックリスト

### setTimeout の排除

- [ ] テストコード内の `setTimeout` を洗い出す
- [ ] 各 `setTimeout` をイベント駆動ヘルパーに置換する
- [ ] 意図的な遅延（アニメーション待ち等）は `waitForUI()` に統一する

### Docker Chrome 互換性対応

- [ ] `page.click` の monkey-patch を `beforeAll` に追加する
- [ ] monkey-patch 使用時は、クリック前に `waitForSelector(selector, { visible: true })` で可視性を確認する
- [ ] 定期的にローカル環境（monkey-patch なし）でもテストを実行し、UI の到達可能性を検証する
- [ ] 全ての `waitForFunction` に `{ polling: 100 }` を追加する
- [ ] `requestAnimationFrame` を使用している箇所を `setTimeout` に置換する

### Docker Compose ネットワーク

- [ ] `docker-compose.yml` から固定サブネット (`ipam`) / 固定 IP (`ipv4_address`) を削除する
- [ ] テストコード内の IP アドレスをサービス名に変更する
- [ ] `shm_size: '1gb'` をテストコンテナに追加する
- [ ] `healthcheck` をアプリコンテナに追加する
- [ ] `depends_on: condition: service_healthy` をテストコンテナに追加する

---

## 6. ベンチマーク結果

### Docker Puppeteer vs ローカル Playwright

イベント駆動化後、同一操作シナリオでの比較（実測値）:

| 操作 | Docker Puppeteer | ローカル Playwright |
|------|------------------:|--------------------:|
| ブラウザ起動 | 263ms | 338ms |
| ページロード | 1,034ms | 93ms |
| タブ切り替え × 4 | 78ms | 230ms |
| 設定保存 | 66ms | 95ms |
| 取引先登録 | 57ms | 187ms |
| 品目登録 | 96ms | 148ms |
| 帳票作成 | 98ms | 214ms |
| 印刷プレビュー | 6ms | 69ms |
| 帳票削除 | 10ms | 113ms |
| **合計** | **約 1.8s** | **約 1.5s** |

### 結論

- **Docker 自体は遅くない** — ページロードを除き、Docker Puppeteer の方が多くの操作で高速
- **ページロードの差** は `networkidle2` の待機戦略に起因し、Docker のオーバーヘッドではない
- **真のボトルネックは `setTimeout`** — 固定遅延が 230 箇所で累積 90 秒以上の無駄な待機を生んでいた
- イベント駆動化により、操作部分の合計は **2 秒以下** に短縮される
