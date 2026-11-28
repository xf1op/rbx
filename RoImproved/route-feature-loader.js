'use strict';

(() => {
  let lastHref = location.href;
  let queuedHref = '';
  let queuedRoute = false;
  let navFeatureInjected = false;
  let navObserver = null;
  let navFeaturesEnabled = false;

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

  function applyStoredSettings(settings) {
    publishMainWorldSettings(settings);
    navFeaturesEnabled = settings.privacyControlsEnabled === true || settings.voiceChatStatusEnabled === true;
    if (navFeaturesEnabled) startNavFeatureWatcher();
    else {
      navObserver?.disconnect();
      navObserver = null;
      navFeatureInjected = false;
    }
  }

  const ROUTE_SETTINGS_DEFAULTS = {
    accessoryLimitEnabled: true,
    voiceChatStatusEnabled: false,
    privacyControlsEnabled: false,
    profileOutfitsEnabled: false,
    favoritePlacesEnabled: true
  };

  chrome.storage.local.get(ROUTE_SETTINGS_DEFAULTS)
    .then(applyStoredSettings)
    .catch(() => applyStoredSettings(ROUTE_SETTINGS_DEFAULTS));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Object.keys(changes).some((key) =>
      ['accessoryLimitEnabled', 'voiceChatStatusEnabled', 'privacyControlsEnabled', 'profileOutfitsEnabled', 'favoritePlacesEnabled'].includes(key))) return;
    chrome.storage.local.get(ROUTE_SETTINGS_DEFAULTS).then((settings) => {
      applyStoredSettings(settings);
      if (Object.hasOwn(changes, 'profileOutfitsEnabled') && settings.profileOutfitsEnabled === true && routeKey(location.href) === 'profile') {
        injectedRoutes.delete('profile');
        injectCurrentRoute();
      }
      if (Object.hasOwn(changes, 'favoritePlacesEnabled') && settings.favoritePlacesEnabled === true && routeKey(location.href) === 'favorites') {
        injectedRoutes.delete('favorites');
        injectCurrentRoute();
      }
    }).catch(() => {});
  });

  function sendMessage(message) {
    try {
      const result = chrome.runtime.sendMessage(message);
      return result && typeof result.then === 'function' ? result.catch(() => null) : Promise.resolve(null);
    } catch {
      return Promise.resolve(null);
    }
  }

  function navReady() {
    return Boolean(
      document.querySelector('#right-navigation-header .navbar-right.rbx-navbar-right > ul.rbx-navbar-icon-group') ||
      document.querySelector('#right-navigation-header .rbx-navbar-right > ul.navbar-right')
    );
  }

  function injectNavFeature() {
    if (!navFeaturesEnabled || navFeatureInjected || !navReady()) return;
    navFeatureInjected = true;
    navObserver?.disconnect();
    navObserver = null;
    sendMessage({ type: 'ROIMPR_NAV_FEATURES' }).then((result) => {
      if (result?.ok) return;
      navFeatureInjected = false;
    });
  }

  function startNavFeatureWatcher() {
    if (!navFeaturesEnabled || navFeatureInjected || !document.documentElement) return;

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
    if (/^\/search\/users(?:\/|$)/.test(path)) return 'search-users';
    if (/^\/transactions(?:\/|$)/.test(path)) return 'transactions';
    if (/^\/my\/avatar(?:\/|$)/.test(path)) return 'avatar';
    if (/^\/users\/(?:\d+\/)?inventory(?:\/|$)/.test(path)) return 'inventory';
    if (/^\/users\/\d+\/favorites(?:\/|$)/.test(path)) return 'favorites';
    return '';
  }

  const injectedRoutes = new Set();
  const pendingRoutes = new Set();

  function injectCurrentRoute(href = location.href) {
    const key = routeKey(href);
    if (!key || injectedRoutes.has(key) || pendingRoutes.has(key)) return;
    pendingRoutes.add(key);
    sendMessage({ type: 'ROIMPR_ROUTE_FEATURES', href })
      .then((result) => {
        if (result?.ok) injectedRoutes.add(key);
      })
      .finally(() => pendingRoutes.delete(key));
  }

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
      injectCurrentRoute(queuedHref);
    });
  }

  window.addEventListener('roimpr:route-change', handleRouteChange);
  window.addEventListener('popstate', handleRouteChange);
  window.addEventListener('hashchange', handleRouteChange);

  injectCurrentRoute();
  if (!document.documentElement) {
    document.addEventListener('DOMContentLoaded', () => {
      startNavFeatureWatcher();
      injectCurrentRoute();
    }, { once: true });
  } else {
    startNavFeatureWatcher();
  }
})();
