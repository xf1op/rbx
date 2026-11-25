'use strict';

(() => {
  const KEY = '__RoImprVoiceChatStatus';
  if (window[KEY]) return;
  window[KEY] = true;

  const ITEM_ID = 'RoImpr-voicechat-nav-item';
  const MENU_ID = 'RoImpr-voicechat-menu';
  const STYLE_ID = 'RoImpr-voicechat-style';
  const PRIVACY_ITEM_ID = 'RoImpr-privacy-nav-item';
  const CACHE_MS = 60000;
  const OBSERVED_EVENT = 'roimpr:voice-settings-response';

  let item = null;
  let trigger = null;
  let menu = null;
  let hoverTimer = 0;
  let countdownTimer = 0;
  let pinned = false;
  let inFlight = null;
  let cachedPayload = null;
  let cachedAt = 0;
  let lastObservedAt = 0;
  let expiryRefreshAttemptedFor = 0;
  let closeListenersActive = false;
  let initialized = false;
  let featureEnabled = false;
  let started = false;
  let navObserver = null;
  const routeHandler = () => attach();
  const observedHandler = (event) => acceptObservedPayload(event.detail);

  const CSS = `
#${ITEM_ID} { position:relative; display:flex; align-items:center; flex:0 0 auto; z-index:21; }
#${ITEM_ID} .RoImpr-voicechat-trigger {
  display:inline-flex; align-items:center; justify-content:center; width:40px; height:40px; min-width:40px;
  padding:0; border:0; border-radius:var(--radius-medium, 8px); background:transparent;
  color:var(--color-content-default, inherit); cursor:pointer;
}
#${ITEM_ID} .RoImpr-voicechat-trigger:hover,
#${ITEM_ID} .RoImpr-voicechat-trigger[aria-expanded="true"] { background:var(--color-state-hover, rgba(128,128,128,.16)); }
#${ITEM_ID} .RoImpr-voicechat-trigger:focus-visible { outline:2px solid var(--color-system-emphasis, currentColor); outline-offset:2px; }
#${ITEM_ID} .RoImpr-voicechat-icon { display:block; width:22px; height:22px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; transition:color .12s ease,stroke .12s ease; }
#${ITEM_ID} .RoImpr-voicechat-trigger[data-state="active"] { color:#2ebd68; }
#${ITEM_ID} .RoImpr-voicechat-trigger[data-state="suspended"] { color:#e6a23c; }
#${ITEM_ID} .RoImpr-voicechat-trigger[data-state="banned"] { color:#e05252; }
#${ITEM_ID} .RoImpr-voicechat-trigger[data-state="inactive"],
#${ITEM_ID} .RoImpr-voicechat-trigger[data-state="unknown"] { color:var(--color-content-muted, #9299a3); }
#${MENU_ID} {
  position:absolute; z-index:2147482500; top:calc(100% + 5px); left:50%; transform:translateX(-50%); width:max-content; min-width:0;
  max-width:calc(100vw - 16px); padding:6px 9px; border:1px solid color-mix(in srgb, var(--color-content-default, #393b3d) 18%, var(--color-surface-0, #fff));
  border-radius:var(--radius-small, 5px); background:var(--color-surface-0, #25272b); color:var(--color-content-default, inherit);
  box-shadow:0 2px 8px rgba(0,0,0,.22); font:600 12px/16px "Builder Sans", "Helvetica Neue", Arial, sans-serif;
  white-space:nowrap; pointer-events:auto;
}
#${MENU_ID}[data-state="active"] { color:#2ebd68; }
#${MENU_ID}[data-state="suspended"] { color:#e6a23c; }
#${MENU_ID}[data-state="banned"] { color:#e05252; }
#${MENU_ID}[data-state="inactive"],
#${MENU_ID}[data-state="unknown"] { color:var(--color-content-muted, #9299a3); }
`;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function expiryTime(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Roblox serializes this timestamp as { Seconds, Nanos }.
      // Accept lower-camel variants too in case the response is normalized.
      const seconds = Number(value.Seconds ?? value.seconds);
      const nanosValue = value.Nanos ?? value.nanos ?? 0;
      const nanos = Number(nanosValue);
      if (!Number.isFinite(seconds) || !Number.isFinite(nanos) || Math.abs(nanos) >= 1e9) return null;
      return seconds * 1000 + nanos / 1e6;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value > 1e12) return value;
      if (value > 1e9) return value * 1000;
      return null;
    }
    if (typeof value !== 'string' || !value.trim()) return null;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      if (numeric > 1e12) return numeric;
      if (numeric > 1e9) return numeric * 1000;
      return null;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function validPayload(payload) {
    return Boolean(payload && typeof payload === 'object' &&
      typeof payload.isBanned === 'boolean' &&
      typeof payload.isVoiceEnabled === 'boolean');
  }

  function updateCountdown(payload) {
    if (!featureEnabled) return;
    if (countdownTimer) clearTimeout(countdownTimer);
    countdownTimer = 0;
    const expiry = expiryTime(payload?.bannedUntil);
    if (!payload?.isBanned || expiry === null) return;

    const remaining = expiry - Date.now();
    if (remaining <= 0) {
      if (expiryRefreshAttemptedFor !== expiry) {
        expiryRefreshAttemptedFor = expiry;
        window.setTimeout(() => loadStatus(true), 0);
      }
      return;
    }

    // While the compact tooltip is visible, update its seconds locally once
    // per second. While hidden, sleep until expiry instead of running a timer.
    const delay = menu && !menu.hidden ? 1000 : remaining;
    countdownTimer = window.setTimeout(() => {
      countdownTimer = 0;
      const currentExpiry = expiryTime(cachedPayload?.bannedUntil);
      if (currentExpiry !== null && currentExpiry <= Date.now()) {
        if (expiryRefreshAttemptedFor !== currentExpiry) {
          expiryRefreshAttemptedFor = currentExpiry;
          render(cachedPayload);
          loadStatus(true);
        } else {
          render(cachedPayload);
        }
      } else if (menu && !menu.hidden) {
        render(cachedPayload);
      } else {
        updateCountdown(cachedPayload);
      }
    }, Math.max(250, Math.min(remaining, delay)));
  }

  function render(payload) {
    if (!featureEnabled || !validPayload(payload)) return;

    const expiry = expiryTime(payload.bannedUntil);
    if (expiry !== null && expiryRefreshAttemptedFor && expiry !== expiryRefreshAttemptedFor) {
      expiryRefreshAttemptedFor = 0;
    }
    let state = 'unknown';
    let label = 'Unknown';

    if (payload.isBanned === true) {
      if (expiry !== null && expiry > Date.now()) {
        const totalSeconds = Math.max(1, Math.ceil((expiry - Date.now()) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        state = 'suspended';
        label = minutes > 0
          ? `Suspended: ${minutes}m ${String(seconds).padStart(2, '0')}s`
          : `Suspended: ${seconds}s`;
      } else if (payload.bannedUntil === null) {
        // Only an explicit null expiry is treated as a permanent ban.
        state = 'banned';
        label = 'Banned';
      } else if (expiry !== null) {
        // The suspension has elapsed. Clear the visible restriction immediately;
        // one expiry-triggered revalidation will confirm the account's new state.
        state = 'inactive';
        label = 'Inactive';
      } else {
        state = 'unknown';
        label = 'Unknown';
      }
    } else if (payload.isVoiceEnabled === true) {
      state = 'active';
      label = 'Active';
    } else if (payload.isUserEligible === false) {
      state = 'inactive';
      label = 'Unavailable';
    } else {
      state = 'inactive';
      label = 'Inactive';
    }

    if (trigger) {
      trigger.dataset.state = state;
      trigger.removeAttribute('title');
      trigger.setAttribute('aria-label', `Voice chat status: ${label}`);
    }
    if (menu) {
      menu.dataset.state = state;
      menu.textContent = label;
    }
    updateCountdown(payload);
  }

  function setLoading(value) {
    if (value && !cachedPayload && menu) {
      menu.textContent = 'Checking…';
      menu.dataset.state = 'unknown';
    }
  }

  async function loadStatus(force = false) {
    if (!featureEnabled) return { ok: false, disabled: true };
    if (inFlight) return inFlight;
    if (!force && cachedPayload && Date.now() - cachedAt < CACHE_MS) {
      render(cachedPayload);
      return { ok: true, payload: cachedPayload, cached: true };
    }

    setLoading(true);
    const requestStartedAt = Date.now();
    inFlight = (async () => {
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'ROIMPR_VOICE_STATUS_GET',
          force: force === true
        });
        if (!result?.ok || !validPayload(result?.payload)) {
          throw new Error(result?.message || 'Could not read voice chat status.');
        }
        // A later passive Roblox response is newer than this extension request.
        // Never let a delayed initial fetch overwrite that observed state.
        if (lastObservedAt <= requestStartedAt) {
          cachedPayload = result.payload;
          cachedAt = Date.now();
        }
        render(cachedPayload || result.payload);
        return result;
      } catch (error) {
        if (!cachedPayload) {
          if (trigger) {
            trigger.dataset.state = 'unknown';
            trigger.removeAttribute('title');
            trigger.setAttribute('aria-label', 'Voice chat status: Unknown');
          }
          if (menu) { menu.textContent = 'Unknown'; menu.dataset.state = 'unknown'; }
        }
        return { ok: false, message: error instanceof Error ? error.message : 'Could not read voice chat status.' };
      } finally {
        inFlight = null;
        setLoading(false);
      }
    })();
    return inFlight;
  }

  function acceptObservedPayload(raw) {
    if (!featureEnabled) return;
    let payload;
    try { payload = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
    if (!validPayload(payload)) return;
    cachedPayload = payload;
    cachedAt = Date.now();
    lastObservedAt = cachedAt;
    render(cachedPayload);
  }

  function handleDocumentClick(event) {
    if (item?.isConnected && !item.contains(event.target)) closeMenu();
  }

  function handleDocumentKeydown(event) {
    if (event.key === 'Escape') closeMenu();
  }

  function attachCloseListeners() {
    if (closeListenersActive) return;
    closeListenersActive = true;
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeydown);
  }

  function detachCloseListeners() {
    if (!closeListenersActive) return;
    closeListenersActive = false;
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('keydown', handleDocumentKeydown);
  }

  function openMenu(pin = false) {
    if (!menu || !trigger) return;
    if (pin) pinned = true;
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    attachCloseListeners();
    loadStatus(false);
  }

  function closeMenu() {
    if (menu) menu.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    pinned = false;
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = 0;
    if (cachedPayload) updateCountdown(cachedPayload);
    detachCloseListeners();
  }

  function createMenu() {
    menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.className = 'RoImpr-voicechat-tooltip';
    menu.hidden = true;
    menu.setAttribute('role', 'status');
    menu.setAttribute('aria-live', 'polite');
    menu.dataset.state = 'unknown';
    menu.textContent = 'Unknown';
    return menu;
  }

  function createItem() {
    item = document.createElement('li');
    item.id = ITEM_ID;
    item.className = 'navbar-icon-item';

    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'btn-navigation-nav-settings-md RoImpr-voicechat-trigger';
    trigger.dataset.state = 'unknown';
    trigger.setAttribute('aria-label', 'Voice chat status');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', MENU_ID);
    trigger.removeAttribute('title');
    trigger.innerHTML = '<svg class="RoImpr-voicechat-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="12" rx="3"></rect><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7"></path></svg>';

    trigger.addEventListener('mouseenter', () => {
      if (pinned || !menu?.hidden) return;
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => {
        hoverTimer = 0;
        if (item?.matches(':hover') && !pinned) openMenu(false);
      }, 250);
    });
    item.addEventListener('mouseleave', () => {
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = 0;
      if (!pinned) closeMenu();
    });
    trigger.addEventListener('click', () => {
      if (menu.hidden) openMenu(true);
      else if (pinned) closeMenu();
      else pinned = true;
    });

    item.append(trigger, createMenu());
    return item;
  }

  function attach() {
    if (!featureEnabled) return false;
    const privacyItem = document.getElementById(PRIVACY_ITEM_ID);
    const list = privacyItem?.parentElement ||
      document.querySelector('#right-navigation-header .navbar-right.rbx-navbar-right > ul.rbx-navbar-icon-group') ||
      document.querySelector('#right-navigation-header .rbx-navbar-right > ul.navbar-right');
    if (!list) return false;

    const anchor = privacyItem?.isConnected
      ? privacyItem
      : list.querySelector(':scope > li.age-bracket-label') ||
        Array.from(list.children).find((entry) => entry.querySelector('a[href*="/users/"][href*="/profile"]'));
    if (!anchor) return false;

    if (item?.isConnected) {
      if (item.nextElementSibling !== anchor) list.insertBefore(item, anchor);
      return true;
    }

    installStyles();
    list.insertBefore(createItem(), anchor);
    if (!initialized) {
      initialized = true;
      loadStatus(false);
    }
    return true;
  }

  function start() {
    if (!featureEnabled || started || !document.documentElement) return;
    started = true;
    const root = document.querySelector('#right-navigation-header') || document.documentElement;
    navObserver = new MutationObserver(() => {
      if (!item?.isConnected || !document.getElementById(PRIVACY_ITEM_ID)) attach();
    });
    navObserver.observe(root, { childList: true, subtree: true });
    attach();
    window.addEventListener('roimpr:route-change', routeHandler);
    window.addEventListener(OBSERVED_EVENT, observedHandler);
  }

  function stop() {
    navObserver?.disconnect();
    navObserver = null;
    if (started) {
      window.removeEventListener('roimpr:route-change', routeHandler);
      window.removeEventListener(OBSERVED_EVENT, observedHandler);
    }
    started = false;
    closeMenu();
    if (hoverTimer) clearTimeout(hoverTimer);
    if (countdownTimer) clearTimeout(countdownTimer);
    hoverTimer = countdownTimer = 0;
    item?.remove();
    item = trigger = menu = null;
    document.getElementById(STYLE_ID)?.remove();
    initialized = false;
  }

  function setEnabled(value) {
    featureEnabled = value !== false;
    if (featureEnabled) start();
    else stop();
  }

  chrome.storage.local.get({ voiceChatStatusEnabled: false })
    .then((settings) => setEnabled(settings.voiceChatStatusEnabled))
    .catch(() => setEnabled(false));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.hasOwn(changes, 'voiceChatStatusEnabled')) {
      setEnabled(changes.voiceChatStatusEnabled.newValue);
    }
  });

  if (!document.documentElement) document.addEventListener('DOMContentLoaded', start, { once: true });
})();
