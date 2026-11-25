'use strict';

(() => {
  let lastHref = location.href;
  let queuedHref = '';
  let queuedRoute = false;
  let navFeatureInjected = false;
  let navObserver = null;

  function publishMainWorldSettings(settings) {
    window.postMessage({
      __roImprAccessoryLimitSetting: true,
      enabled: settings.accessoryLimitEnabled !== false
    }, location.origin);
    window.postMessage({
      __roImprVoiceChatSetting: true,
      enabled: settings.voiceChatStatusEnabled !== false
    }, location.origin);
  }

  chrome.storage.local.get({ accessoryLimitEnabled: true, voiceChatStatusEnabled: false })
    .then(publishMainWorldSettings)
    .catch(() => publishMainWorldSettings({ accessoryLimitEnabled: true, voiceChatStatusEnabled: false }));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' ||
        (!Object.hasOwn(changes, 'accessoryLimitEnabled') && !Object.hasOwn(changes, 'voiceChatStatusEnabled'))) return;
    chrome.storage.local.get({ accessoryLimitEnabled: true, voiceChatStatusEnabled: false })
      .then(publishMainWorldSettings).catch(() => {});
  });

  function sendMessage(message) {
    try {
      const result = chrome.runtime.sendMessage(message);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {}
  }

  function navReady() {
    return Boolean(
      document.querySelector('#right-navigation-header .navbar-right.rbx-navbar-right > ul.rbx-navbar-icon-group') ||
      document.querySelector('#right-navigation-header .rbx-navbar-right > ul.navbar-right')
    );
  }

  function injectNavFeature() {
    if (navFeatureInjected || !navReady()) return;
    navFeatureInjected = true;
    navObserver?.disconnect();
    navObserver = null;
    sendMessage({ type: 'ROIMPR_NAV_FEATURES' });
  }

  function startNavFeatureWatcher() {
    if (navFeatureInjected || !document.documentElement) return;

    if (navReady()) {
      injectNavFeature();
      return;
    }

    if (navObserver) return;

    navObserver = new MutationObserver(() => {
      if (navReady()) injectNavFeature();
    });
    navObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function routeKey(href) {
    let path;
    try { path = new URL(href).pathname; } catch { return ''; }
    path = path.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//i, '/').replace(/\/+$/, '') || '/';
    if (path === '/' || path === '/home') return 'home';
    if (/^\/charts(?:\/|$)/.test(path)) return 'charts';
    if (/^\/users\/\d+\/profile(?:\/|$)/.test(path)) return 'profile';
    if (/^\/transactions(?:\/|$)/.test(path)) return 'transactions';
    if (/^\/my\/avatar(?:\/|$)/.test(path)) return 'avatar';
    if (/^\/users\/(?:\d+\/)?inventory(?:\/|$)/.test(path)) return 'inventory';
    return '';
  }

  // Static content scripts already cover the first page load; scripts stay alive
  // and guard themselves, so only the first visit to each route needs injection.
  const injectedRoutes = new Set([routeKey(location.href)]);

  function handleRouteChange() {
    const href = location.href;
    if (href === lastHref) return;

    let samePath = false;
    try { samePath = new URL(href).pathname === new URL(lastHref).pathname; } catch {}
    lastHref = href;
    if (samePath) return;

    queuedHref = href;
    if (queuedRoute) return;

    queuedRoute = true;
    queueMicrotask(() => {
      queuedRoute = false;
      const key = routeKey(queuedHref);
      if (!key || injectedRoutes.has(key)) return;
      injectedRoutes.add(key);
      sendMessage({
        type: 'ROIMPR_ROUTE_FEATURES',
        href: queuedHref
      });
    });
  }

  window.addEventListener('roimpr:route-change', handleRouteChange);
  window.addEventListener('popstate', handleRouteChange);
  window.addEventListener('hashchange', handleRouteChange);

  startNavFeatureWatcher();

  if (!document.documentElement) {
    document.addEventListener('DOMContentLoaded', startNavFeatureWatcher, { once: true });
  }
})();
