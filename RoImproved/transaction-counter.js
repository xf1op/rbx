'use strict';

(() => {
  const KEY = '__RoImprTransactionCounter';
  if (window[KEY]) return;
  window[KEY] = true;

  const STORAGE_DEFAULTS = { transactionCounterEnabled: false };
  const PANEL_ID = 'RoImpr-transaction-panel';
  const STYLE_ID = 'RoImpr-transaction-panel-style';
  const LAUNCHER_ID = 'RoImpr-transaction-launcher';
  const PAGE_SIZE = 100;
  const FINAL_PAGE_SIZE = 10;
  const FINAL_PAGE_THRESHOLD = 9800;
  const MAX_TRANSACTIONS = 10000;
  const API_ORIGIN = 'https://apis.roblox.com';
  const ACCOUNT_TIMEOUT_MS = 20000;
  const PAGE_TIMEOUT_MS = 45000;
  const RATE_LIMIT_BUFFER_MS = 1000;
  const RATE_LIMIT_FALLBACK_MS = 15000;

  const CSS = `.dropdown-container.container-header{display:flex!important;flex-wrap:wrap!important;align-items:flex-end!important;gap:12px!important;width:100%!important}#${LAUNCHER_ID}{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;align-self:flex-end!important;margin:0 0 0 auto!important;white-space:nowrap!important}#${LAUNCHER_ID}:focus-visible{outline:2px solid currentColor!important;outline-offset:2px!important}#${PANEL_ID}{position:fixed;z-index:2147482500;top:84px;right:18px;width:min(320px,calc(100vw - 28px));padding:16px}#${PANEL_ID}[hidden]{display:none!important}#${PANEL_ID}.RoImpr-txn-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}#${PANEL_ID}.RoImpr-txn-title{margin:0;min-width:0}#${PANEL_ID}.RoImpr-txn-close{flex:0 0 auto;min-width:28px;min-height:28px;padding:0 8px}#${PANEL_ID}.RoImpr-txn-kind{margin:0 0 10px}#${PANEL_ID}.RoImpr-txn-results{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px}#${PANEL_ID}.RoImpr-txn-stat{min-width:0}#${PANEL_ID}.RoImpr-txn-stat-label{display:block;margin-bottom:3px}#${PANEL_ID}.RoImpr-txn-stat-value{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}#${PANEL_ID}.RoImpr-txn-status{min-height:18px;margin:0 0 12px;overflow-wrap:anywhere}#${PANEL_ID}.RoImpr-txn-actions{display:flex;gap:8px}#${PANEL_ID}.RoImpr-txn-actions button{flex:1 1 0;min-width:0;white-space:nowrap}#${PANEL_ID}.RoImpr-txn-actions button:disabled{opacity:.5;cursor:default}@media(max-width:520px){#${PANEL_ID}{top:72px;right:10px}}`;

  let enabled = false;
  let panel = null;
  let launcherButton = null;
  let observer = null;
  let scan = null;
  let attachQueued = false;
  let positionListenersActive = false;

  function onTransactionsPage() {
    const path = location.pathname
      .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//i, '/')
      .replace(/\/+$/, '') || '/';
    return path === '/transactions';
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  async function getAuthenticatedUserId() {
    const result = await chrome.runtime.sendMessage({ type: 'ROIMPR_TRANSACTION_USER' });
    if (!result?.ok || !/^\d{1,20}$/.test(String(result.userId || ''))) {
      throw new Error(result?.message || 'Could not identify the signed-in Roblox account.');
    }
    return String(result.userId);
  }

  function setStatus(targetPanel, message) {
    const status = targetPanel?.querySelector('[data-role="status"]');
    if (status) status.textContent = message;
  }

  function setResults(targetPanel, kind, robux, transactions) {
    if (!targetPanel?.isConnected) return;
    targetPanel.querySelector('[data-role="kind"]').textContent = kind || 'Choose a scan to begin';
    targetPanel.querySelector('[data-role="robux"]').textContent = robux.toLocaleString();
    targetPanel.querySelector('[data-role="robux-label"]').textContent = kind === 'Purchases' ? 'Robux spent' : 'Robux earned';
    targetPanel.querySelector('[data-role="transactions"]').textContent = transactions.toLocaleString();
  }

  function setRunning(targetPanel, running) {
    if (!targetPanel?.isConnected) return;
    targetPanel.querySelector('[data-role="purchases"]').disabled = running;
    targetPanel.querySelector('[data-role="earned"]').disabled = running;
  }

  function isCurrentScan(currentScan) {
    return scan === currentScan && !currentScan.cancelled &&
      panel === currentScan.panel && currentScan.panel?.isConnected;
  }

  function updateScanStatus(currentScan, message) {
    if (isCurrentScan(currentScan)) setStatus(currentScan.panel, message);
  }

  function cancelScan(currentScan = scan) {
    if (!currentScan) return;
    currentScan.cancelled = true;
    for (const cancel of [...currentScan.cancelHandlers]) cancel();
    currentScan.cancelHandlers.clear();
    if (scan === currentScan) scan = null;
  }

  function awaitScan(promise, currentScan, timeoutMs, timeoutMessage) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        currentScan.cancelHandlers.delete(onCancel);
        callback(value);
      };
      const onCancel = () => finish(resolve, null);
      const timer = window.setTimeout(() => finish(reject, new Error(timeoutMessage)), timeoutMs);
      currentScan.cancelHandlers.add(onCancel);
      Promise.resolve(promise).then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error)
      );
    });
  }

  function buildRequestUrl(userId, category) {
    if (!/^\d{1,20}$/.test(String(userId))) throw new Error('Invalid Roblox account ID.');
    const url = new URL(`${API_ORIGIN}/transaction-records/v1/users/${userId}/transactions`);
    url.searchParams.set('cursor', '');
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('transactionType', category === 'purchases' ? 'Purchase' : 'Sale');
    if (category === 'earned') url.searchParams.set('itemPricingType', 'PaidAndLimited');
    return url;
  }

  async function requestPage(url, cursor, pageSize) {
    const pageUrl = new URL(url.href);
    pageUrl.searchParams.set('cursor', cursor);
    pageUrl.searchParams.set('limit', String(pageSize));
    return chrome.runtime.sendMessage({
      type: 'ROIMPR_TRANSACTION_PAGE',
      url: pageUrl.href,
      cursor,
      transactionType: pageUrl.searchParams.get('transactionType')
    });
  }

  function waitForCooldown(milliseconds, currentScan) {
    const end = Date.now() + Math.max(0, milliseconds) + RATE_LIMIT_BUFFER_MS;
    return new Promise((resolve) => {
      let timer = null;
      const finish = (value) => {
        if (timer !== null) clearTimeout(timer);
        currentScan.cancelHandlers.delete(onCancel);
        resolve(value);
      };
      const onCancel = () => finish(false);
      const tick = () => {
        if (currentScan.cancelled) { finish(false); return; }
        const remaining = end - Date.now();
        if (remaining <= 0) { finish(true); return; }
        updateScanStatus(currentScan, `Roblox rate limit · retrying in ${Math.ceil(remaining / 1000)}s`);
        timer = window.setTimeout(tick, Math.min(1000, remaining));
      };
      currentScan.cancelHandlers.add(onCancel);
      tick();
    });
  }

  async function fetchPageWithRetry(url, cursor, pageSize, currentScan) {
    while (!currentScan.cancelled) {
      const result = await awaitScan(
        requestPage(url, cursor, pageSize), currentScan, PAGE_TIMEOUT_MS,
        'Roblox request timed out · Try again'
      );
      if (currentScan.cancelled || !result) return null;

      if (result.status === 429) {
        const retryAfterMs = Number.isFinite(result.retryAfterMs) && result.retryAfterMs > 0
          ? result.retryAfterMs
          : RATE_LIMIT_FALLBACK_MS;
        if (!await waitForCooldown(retryAfterMs, currentScan)) return null;
        continue;
      }

      if (result.status === 400 &&
          /provided parameters are out of bounds/i.test(String(result.message || '')) &&
          currentScan.recordsReceived >= FINAL_PAGE_THRESHOLD) {
        return { historyLimitReached: true };
      }

      if (!result.ok) {
        const status = result.status ? ` (${result.status})` : '';
        throw new Error((result.message || 'Roblox could not return transactions.') + status);
      }
      return result;
    }
    return null;
  }

  async function startScan(category) {
    const targetPanel = panel;
    if (scan || !targetPanel?.isConnected || !enabled) return;

    const currentScan = {
      category,
      panel: targetPanel,
      cancelled: false,
      cancelHandlers: new Set(),
      recordsReceived: 0,
      transactions: 0,
      robux: 0
    };
    scan = currentScan;
    setRunning(targetPanel, true);
    setResults(targetPanel, category === 'purchases' ? 'Purchases' : 'Earned', 0, 0);
    setStatus(targetPanel, 'Connecting to your Roblox account…');

    try {
      const userId = await awaitScan(
        getAuthenticatedUserId(), currentScan, ACCOUNT_TIMEOUT_MS,
        'Roblox account lookup timed out · Try again'
      );
      if (!userId || !isCurrentScan(currentScan)) return;

      const baseUrl = buildRequestUrl(userId, category);
      const seenCursors = new Set();
      let cursor = '';
      let complete = false;
      let historyLimitReached = false;

      while (!currentScan.cancelled && currentScan.recordsReceived < MAX_TRANSACTIONS) {
        const pageSize = currentScan.recordsReceived >= FINAL_PAGE_THRESHOLD
          ? FINAL_PAGE_SIZE
          : Math.min(PAGE_SIZE, FINAL_PAGE_THRESHOLD - currentScan.recordsReceived);
        const result = await fetchPageWithRetry(baseUrl, cursor, pageSize, currentScan);
        if (!result || !isCurrentScan(currentScan)) break;
        if (result.historyLimitReached) {
          historyLimitReached = true;
          break;
        }

        const payload = result.payload;
        if (!payload || !Array.isArray(payload.data)) {
          throw new Error('Roblox returned an unexpected transaction response.');
        }

        const remainingSlots = MAX_TRANSACTIONS - currentScan.recordsReceived;
        const pageItems = payload.data.slice(0, remainingSlots);
        currentScan.recordsReceived += pageItems.length;

        for (const item of pageItems) {
          currentScan.transactions += 1;
          if (item?.currency?.type === 'Robux') {
            const amount = Number(item.currency.amount);
            if (Number.isFinite(amount)) currentScan.robux += Math.abs(amount);
          }
        }

        setResults(targetPanel, category === 'purchases' ? 'Purchases' : 'Earned', currentScan.robux, currentScan.transactions);
        updateScanStatus(currentScan,
          `Scanning ${currentScan.recordsReceived.toLocaleString()} transactions`);

        if (currentScan.recordsReceived >= MAX_TRANSACTIONS) {
          historyLimitReached = true;
          break;
        }

        const nextCursor = typeof payload.nextPageCursor === 'string' && payload.nextPageCursor
          ? payload.nextPageCursor
          : null;
        if (!nextCursor) {
          complete = true;
          break;
        }
        if (seenCursors.has(nextCursor)) {
          throw new Error('Roblox repeated a transaction page. Scan stopped safely.');
        }
        seenCursors.add(nextCursor);
        cursor = nextCursor;

        if (result.retryAfterMs > 0 && result.rateLimitRemaining !== null && result.rateLimitRemaining <= 0) {
          if (!await waitForCooldown(result.retryAfterMs, currentScan)) break;
        }
      }

      if (!isCurrentScan(currentScan)) return;
      if (currentScan.cancelled) {
        setStatus(targetPanel, 'Scan stopped');
      } else if (complete) {
        setStatus(targetPanel, `Complete · ${currentScan.transactions.toLocaleString()} transactions`);
      } else if (historyLimitReached) {
        setStatus(targetPanel, 'Roblox limit reached');
      }
    } catch (error) {
      if (currentScan.cancelled) return;
      if (isCurrentScan(currentScan)) {
        setStatus(targetPanel, error instanceof Error ? error.message : 'Transaction scan failed.');
      }
    } finally {
      if (scan === currentScan) scan = null;
      if (targetPanel.isConnected) setRunning(targetPanel, false);
    }
  }

  function positionPanel() {
    if (!panel?.isConnected || !launcherButton?.isConnected) return;
    const rect = launcherButton.getBoundingClientRect();
    const top = Math.max(10, Math.min(window.innerHeight - 220, rect.bottom + 8));
    const right = Math.max(10, window.innerWidth - rect.right);
    panel.style.top = `${top}px`;
    panel.style.right = `${right}px`;
  }

  function startPositionListeners() {
    if (positionListenersActive) return;
    positionListenersActive = true;
    window.addEventListener('resize', positionPanel, { passive: true });
    window.addEventListener('scroll', positionPanel, { passive: true, capture: true });
  }

  function stopPositionListeners() {
    if (!positionListenersActive) return;
    positionListenersActive = false;
    window.removeEventListener('resize', positionPanel);
    window.removeEventListener('scroll', positionPanel, true);
  }

  function closePanel() {
    cancelScan();
    stopPositionListeners();
    panel?.remove();
    panel = null;
    launcherButton?.setAttribute('aria-expanded', 'false');
  }

  function togglePanel() {
    if (panel?.isConnected) closePanel();
    else createPanel();
  }

  function createPanel() {
    if (!document.body || panel?.isConnected) return panel;
    const wrapper = document.createElement('div');
    wrapper.id = PANEL_ID;
    wrapper.className = 'summary section-content';
    wrapper.setAttribute('aria-label', 'Transaction totals');
    wrapper.innerHTML = `
      <div class="RoImpr-txn-head">
        <h2 class="RoImpr-txn-title font-header-2">Transaction totals</h2>
        <button class="RoImpr-txn-close btn-control-sm" type="button" data-role="close" aria-label="Close transaction totals">×</button>
      </div>
      <p class="RoImpr-txn-kind font-body" data-role="kind">Choose a scan to begin</p>
      <div class="RoImpr-txn-results">
        <div class="RoImpr-txn-stat"><span class="RoImpr-txn-stat-label font-caption-body" data-role="robux-label">Robux</span><strong class="RoImpr-txn-stat-value font-header-2" data-role="robux">0</strong></div>
        <div class="RoImpr-txn-stat"><span class="RoImpr-txn-stat-label font-caption-body">Transactions</span><strong class="RoImpr-txn-stat-value font-header-2" data-role="transactions">0</strong></div>
      </div>
      <p class="RoImpr-txn-status font-caption-body" data-role="status" aria-live="polite">Scans up to 10,000 transactions, 100 per page.</p>
      <div class="RoImpr-txn-actions">
        <button class="btn-secondary-md" type="button" data-role="purchases">Purchases</button>
        <button class="btn-secondary-md" type="button" data-role="earned">Earned</button>
      </div>`;
    wrapper.querySelector('[data-role="purchases"]').addEventListener('click', () => startScan('purchases'));
    wrapper.querySelector('[data-role="earned"]').addEventListener('click', () => startScan('earned'));
    wrapper.querySelector('[data-role="close"]').addEventListener('click', closePanel);
    const pageHost = document.querySelector('#transactions-page-container') || document.getElementById('rbx-body') || document.body;
    pageHost.appendChild(wrapper);
    panel = wrapper;
    startPositionListeners();
    positionPanel();
    return wrapper;
  }

  function attach() {
    if (!enabled || !onTransactionsPage()) {
      detach();
      return;
    }
    const toolbar = document.querySelector('.dropdown-container.container-header');
    if (!toolbar) return;
    if (launcherButton?.isConnected && launcherButton.parentElement === toolbar) return;

    launcherButton?.remove();
    const button = document.createElement('button');
    button.id = LAUNCHER_ID;
    button.type = 'button';
    button.className = 'btn-secondary-md';
    button.textContent = 'Transaction totals';
    button.setAttribute('aria-label', 'Open transaction totals');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      togglePanel();
      button.setAttribute('aria-expanded', String(Boolean(panel?.isConnected)));
    });
    toolbar.appendChild(button);
    launcherButton = button;
  }

  function detach() {
    cancelScan();
    stopPositionListeners();
    panel?.remove();
    panel = null;
    launcherButton?.remove();
    launcherButton = null;
  }

  function scheduleAttach() {
    if (attachQueued) return;
    attachQueued = true;
    queueMicrotask(() => {
      attachQueued = false;
      attach();
    });
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
  }

  function startObserver() {
    if (observer || !enabled || !onTransactionsPage() || !document.documentElement) return;
    const root = document.querySelector('#container-main') || document.body || document.documentElement;
    observer = new MutationObserver(() => {
      if (!onTransactionsPage() || !enabled) {
        syncPage();
        return;
      }
      const toolbar = document.querySelector('.dropdown-container.container-header');
      if (toolbar && (!launcherButton?.isConnected || launcherButton.parentElement !== toolbar)) scheduleAttach();
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  function syncPage() {
    if (!enabled || !onTransactionsPage()) {
      stopObserver();
      detach();
      return;
    }
    startObserver();
    scheduleAttach();
  }

  function start() {
    installStyles();
    chrome.storage.local.get(STORAGE_DEFAULTS)
      .then((settings) => { enabled = settings.transactionCounterEnabled !== false; syncPage(); })
      .catch(() => { enabled = false; syncPage(); });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !Object.hasOwn(changes, 'transactionCounterEnabled')) return;
      enabled = changes.transactionCounterEnabled.newValue !== false;
      syncPage();
    });

    window.addEventListener('popstate', syncPage);
    window.addEventListener('pageshow', syncPage);
    window.addEventListener('roimpr:route-change', syncPage);
    document.addEventListener('DOMContentLoaded', syncPage, { once: true });
    syncPage();
  }

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
