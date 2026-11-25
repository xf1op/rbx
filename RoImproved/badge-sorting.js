(() => {
  'use strict';
  const KEY = '__roImprBadgeSorting';
  if (window[KEY]) return;
  window[KEY] = true;

  const ATTR = 'data-roimpr-badges';
  const STYLE_ID = 'RoImpr-badge-sorting-style';
  const WRAP_ID = 'roimpr-badges';
  const PATH_RE = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?users\/(?:(\d+)\/)?inventory\/?$/i;
  const RATE_LIMIT_BUFFER_MS = 1000;
  const RATE_LIMIT_FALLBACK_MS = 15000;
  const W = `#${WRAP_ID}`;
  const STYLE = `html[${ATTR}="on"] #assetsItems,html[${ATTR}="on"] #assetsItems~.pager-holder{display:none!important}
${W}{container-type:inline-size;width:100%}
${W} .item-cards{display:grid!important;grid-template-columns:repeat(10,minmax(0,1fr));gap:.3cqw .6cqw;margin:0!important;padding:0!important;width:100%}
${W} .item-cards::before,${W} .item-cards::after{content:none!important;display:none!important}
${W} .item-card{padding:0 3px!important}
${W} .item-card,${W} .item-card-container,${W} .item-card-link,${W} .item-card-thumb-container,${W} .item-card-thumb,${W} .thumbnail-2d-container{background:none!important;box-shadow:none!important;border:0!important}
${W} .item-card,${W} .item-card-container{height:auto!important;min-height:0!important;margin-bottom:0!important}
${W} .item-card{width:auto!important;min-width:0!important;margin:0!important;float:none!important;list-style:none}
${W} .item-card-container,${W} .item-card-link,${W} .item-card-thumb-container,${W} .item-card-thumb,${W} .thumbnail-2d-container{display:block!important;width:100%!important;min-width:0!important;height:auto!important}
${W} .thumbnail-2d-container{aspect-ratio:1}
${W} img{display:block;width:100%!important;height:100%!important;object-fit:contain;border-radius:50%;background:none!important}
${W} .item-card-name,${W} .item-card-label{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px!important;line-height:1.2;margin:0!important;height:auto!important;min-height:0!important;padding:0!important}
${W} .pager{display:flex;align-items:center;justify-content:center;gap:8px;margin:10px 0 0;padding:0}
${W} .pager li{list-style:none}
${W} .roimpr-pg{min-width:32px;height:32px;padding:0 8px;border:0;border-radius:6px;background:none;color:inherit;font:inherit;cursor:pointer}
${W} .roimpr-pg:hover:not([disabled]){background:var(--color-state-hover,rgba(128,128,128,.2))}
${W} .roimpr-pg[disabled]{opacity:.4;cursor:default}
${W} .roimpr-pg[aria-current]{font-weight:700}
${W} .roimpr-status{min-height:1.4em;margin-top:6px;text-align:center;opacity:.8}`;

  let enabled = true;
  let observer = null;
  let frame = 0;
  let owner = '';
  let cursors = [''];
  let pages = new Map();
  let page = 1;
  let busy = false;
  let loadToken = 0;
  let status = '';
  let statusEl = null;
  let wrap = null;
  const cooldowns = new Map();

  const send = (message) => {
    const failed = { ok: false, status: 0 };
    try { return chrome.runtime.sendMessage(message).then((res) => res || failed, () => failed); } catch { return Promise.resolve(failed); }
  };

  function setStatus(text) {
    status = text;
    if (statusEl) statusEl.textContent = text;
  }

  // Same rate-limit handling as the transaction scanner: honour 429 and an exhausted
  // x-ratelimit-remaining by waiting retryAfterMs (+ buffer) with a visible countdown.
  function countdown(ms, token) {
    const end = Date.now() + ms;
    return new Promise((resolve) => {
      const tick = () => {
        if (token !== loadToken) return resolve(false);
        const left = end - Date.now();
        if (left <= 0) { setStatus(''); return resolve(true); }
        setStatus(`Retrying: ${Math.ceil(left / 1000)}s`);
        setTimeout(tick, Math.min(1000, left));
      };
      tick();
    });
  }

  async function call(message, token) {
    for (;;) {
      const wait = (cooldowns.get(message.type) || 0) - Date.now();
      if (wait > 0 && !await countdown(wait, token)) return null;
      const res = await send(message);
      if (token !== loadToken) return null;
      const retry = res?.retryAfterMs > 0 ? res.retryAfterMs : 0;
      if (res?.status === 429) {
        cooldowns.set(message.type, Date.now() + (retry || RATE_LIMIT_FALLBACK_MS) + RATE_LIMIT_BUFFER_MS);
        continue;
      }
      if (retry && res.rateLimitRemaining !== null && res.rateLimitRemaining <= 0) {
        cooldowns.set(message.type, Date.now() + retry + RATE_LIMIT_BUFFER_MS);
      }
      return res;
    }
  }

  function active() {
    const match = PATH_RE.exec(location.pathname);
    if (!enabled || !match || !/^#!\/badges(?:\/|$)/.test(location.hash)) return '';
    return match[1] || document.querySelector('meta[name="user-data"]')?.dataset.userid || '';
  }

  function reset(id) {
    owner = id;
    cursors = [''];
    pages = new Map();
    cooldowns.clear();
    page = 1;
    busy = false;
    status = '';
    loadToken++;
  }

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  function pager() {
    const hasNext = pages.has(page) && cursors.length > page;
    const button = (label, target, disabled, props) => {
      const b = el('button', { type: 'button', className: 'roimpr-pg', textContent: label, disabled, ...props });
      b.dataset.page = String(target);
      return b;
    };
    return el('ul', { className: 'pager' },
      el('li', {}, button('‹', page - 1, busy || page <= 1, { ariaLabel: 'Previous' })),
      el('li', {}, button(String(page), page, busy, { ariaCurrent: 'page' })),
      el('li', {}, button('›', page + 1, busy || !hasNext, { ariaLabel: 'Next' })));
  }

  function card(item, icon) {
    const img = el('img', { alt: '', loading: 'lazy' });
    if (icon) img.src = icon;
    return el('li', { className: 'list-item item-card' },
      el('div', { className: 'item-card-container' },
        el('a', { className: 'item-card-link', href: `/badges/${item.id}` },
          el('div', { className: 'item-card-thumb-container' },
            el('span', { className: 'item-card-thumb' }, el('span', { className: 'thumbnail-2d-container' }, img))),
          el('div', { className: 'item-card-name', title: item.name }, el('span', { textContent: item.name }))),
        ...(item.creator ? [el('div', { className: 'text-overflow item-card-label' }, el('span', { textContent: 'By' }), ' ',
          el('a', {
            className: 'creator-name text-overflow text-link', textContent: item.creator.name,
            href: item.creator.type === 'Group' ? `/groups/${item.creator.id}` : `/users/${item.creator.id}/profile`
          }))] : [])));
  }

  function paint() {
    if (!wrap) return;
    const data = pages.get(page);
    const list = el('ul', { className: 'hlist item-cards item-cards-embed' });
    if (data) list.append(...data.items.map((item) => card(item, data.icons[item.id])));
    statusEl = el('div', { className: 'roimpr-status', textContent: status });
    wrap.replaceChildren(list, el('div', { className: 'pager-holder' }, pager()), statusEl);
  }

  async function load(n) {
    if (pages.has(n)) { page = n; return paint(); }
    if (busy || n < 1 || cursors.length < n) return;
    busy = true;
    const token = loadToken;
    setStatus('Loading…');
    paint();
    try {
      const res = await call({ type: 'ROIMPR_BADGES_PAGE', userId: owner, cursor: cursors[n - 1] }, token);
      if (!res) return;
      if (!res.ok || !Array.isArray(res.payload?.data)) {
        return setStatus(`Could not load badges (${res.status ? `status ${res.status}` : 'no response'}). Click the page number to retry.`);
      }
      const items = res.payload.data.map((b) => ({
        id: String(b.id), name: String(b.displayName || b.name || ''),
        creator: b.creator?.id ? { id: String(b.creator.id), name: String(b.creator.name || ''), type: b.creator.type } : null
      }));
      const icons = {};
      if (items.length) {
        const thumbs = await call({ type: 'ROIMPR_BADGE_ICONS', badgeIds: items.map((i) => i.id) }, token);
        if (!thumbs && token !== loadToken) return;
        for (const t of thumbs?.payload?.data || []) if (t.imageUrl) icons[String(t.targetId)] = t.imageUrl;
      }
      pages.set(n, { items, icons });
      if (res.payload.nextPageCursor && cursors.length === n) cursors.push(res.payload.nextPageCursor);
      page = n;
      setStatus('');
      wrap?.scrollIntoView({ block: 'start' });
    } finally {
      if (token === loadToken) { busy = false; paint(); }
    }
  }

  function sync() {
    frame = 0;
    const id = active();
    if (!id) return teardown();
    const list = document.getElementById('assetsItems');
    if (!list?.parentElement) return;
    if (id !== owner) reset(id);
    if (wrap?.isConnected && wrap.previousElementSibling === list) return;
    wrap = el('div', { id: WRAP_ID });
    wrap.addEventListener('click', (event) => {
      const target = event.target.closest?.('button[data-page]');
      if (target && !target.disabled && !busy) load(Number(target.dataset.page));
    });
    list.after(wrap);
    document.documentElement.setAttribute(ATTR, 'on');
    if (pages.has(page)) paint(); else load(page);
  }

  function teardown() {
    if (wrap) { wrap.remove(); wrap = null; statusEl = null; }
    document.documentElement.removeAttribute(ATTR);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(sync);
  }

  function evaluate() {
    if (PATH_RE.test(location.pathname) && enabled) {
      if (!observer) {
        observer = new MutationObserver(schedule);
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
      schedule();
    } else {
      observer?.disconnect();
      observer = null;
      teardown();
    }
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  (document.head || document.documentElement).appendChild(style);

  window.addEventListener('hashchange', evaluate);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.hasOwn(changes, 'badgeSortingEnabled')) {
      enabled = changes.badgeSortingEnabled.newValue !== false;
      evaluate();
    }
  });
  chrome.storage.local.get({ badgeSortingEnabled: true })
    .then((value) => { enabled = value.badgeSortingEnabled !== false; })
    .catch(() => {})
    .then(evaluate);
})();
