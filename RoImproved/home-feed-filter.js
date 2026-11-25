(() => {
  'use strict';

  const KEY = '__RoImprHomeFeedFilter';
  if (window[KEY]) return;
  window[KEY] = true;

  const ENDPOINT_PATH = '/discovery-api/omni-recommendation';
  const KEEP_TOPIC_IDS = new Set([100000001, 100000003]);
  let cleanHomePage = false;
  let settingsReady = false;
  let resolveSettings;
  const settingsReadyPromise = new Promise((resolve) => { resolveSettings = resolve; });

  function applySettings(value) {
    cleanHomePage = value?.cleanHomePage === true;
    if (!settingsReady) {
      settingsReady = true;
      resolveSettings();
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.__roImprFeedBridge === 'settings') applySettings(event.data.settings);
  });

  setTimeout(() => {
    if (!settingsReady) applySettings({ cleanHomePage: false });
  }, 1200);

  function isHomePage() {
    const path = location.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//i, '/').replace(/\/+$/, '') || '/';
    return path === '/' || path === '/home';
  }

  function isTargetUrl(value) {
    if (!isHomePage() || typeof value !== 'string' || !value) return false;
    try {
      const url = new URL(value, location.href);
      return url.origin === 'https://apis.roblox.com' && url.pathname === ENDPOINT_PATH;
    } catch {
      return false;
    }
  }

  function shouldKeepSort(sort) {
    const id = Number(sort?.topicId);
    const topic = String(sort?.topic || '').trim().toLowerCase();
    return KEEP_TOPIC_IDS.has(id) || topic === 'continue' || topic === 'continue playing' ||
      topic === 'favorites' || topic === 'favourites';
  }

  function collectRetainedIds(sorts) {
    const ids = new Set();
    const types = new Set();
    for (const sort of sorts) {
      if (!Array.isArray(sort?.recommendationList)) continue;
      for (const item of sort.recommendationList) {
        if (!item || item.contentId === undefined || item.contentId === null) continue;
        if (!item.contentType || item.contentType === 'Game') ids.add(String(item.contentId));
        types.add(String(item.contentType || 'Game'));
      }
    }
    return { ids, types };
  }

  function isExcludedLayoutNode(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    for (const key of ['topicId', 'sortId', 'feedTopicId']) {
      const id = Number(value[key]);
      if ([600000000, 100000000, 100000008].includes(id)) return true;
    }
    for (const key of ['topic', 'title', 'name', 'label', 'sortName', 'displayName']) {
      const label = String(value[key] || '').trim().toLowerCase();
      if (['friends', 'friends are playing', 'friends activity', 'standout games', 'recommended for you'].includes(label)) return true;
    }
    return false;
  }

  function pruneLayout(value) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.filter((item) => !isExcludedLayoutNode(item)).map(pruneLayout);
    for (const key of Object.keys(value)) {
      if (isExcludedLayoutNode(value[key])) delete value[key];
      else if (value[key] && typeof value[key] === 'object') value[key] = pruneLayout(value[key]);
    }
    return value;
  }

  function filterPayload(payload) {
    if (!isHomePage() || !cleanHomePage || !payload || typeof payload !== 'object' ||
        (payload.pageType && payload.pageType !== 'Home') || !Array.isArray(payload.sorts)) return false;

    const originalLength = payload.sorts.length;
    const keptSorts = payload.sorts.filter(shouldKeepSort);
    if (keptSorts.length === originalLength) return false;
    payload.sorts = keptSorts;

    const retained = collectRetainedIds(keptSorts);
    const metadata = payload.contentMetadata;
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const games = metadata.Game;
      if (games && typeof games === 'object' && !Array.isArray(games)) {
        for (const id of Object.keys(games)) if (!retained.ids.has(String(id))) delete games[id];
      }
      for (const key of Object.keys(metadata)) if (!retained.types.has(key)) delete metadata[key];
    }

    if (retained.types.size === 1 && retained.types.has('Game') && payload.contentMetadataByStringId) {
      delete payload.contentMetadataByStringId;
    }

    for (const key of ['globalLayoutData', 'sdui']) {
      if (payload[key] && typeof payload[key] === 'object') payload[key] = pruneLayout(payload[key]);
    }

    return true;
  }

  function filterText(raw) {
    if (typeof raw !== 'string' || !raw) return raw;
    try {
      const payload = JSON.parse(raw);
      return filterPayload(payload) ? JSON.stringify(payload) : raw;
    } catch {
      return raw;
    }
  }

  if (typeof Response !== 'undefined' && Response.prototype) {
    const nativeJson = Response.prototype.json;
    const nativeText = Response.prototype.text;

    if (typeof nativeJson === 'function') {
      Response.prototype.json = function (...args) {
        if (!isTargetUrl(this.url)) return nativeJson.apply(this, args);
        const response = this;
        return settingsReadyPromise.then(() => nativeJson.apply(response, args)).then((payload) => {
          filterPayload(payload);
          return payload;
        });
      };
    }

    if (typeof nativeText === 'function') {
      Response.prototype.text = function (...args) {
        if (!isTargetUrl(this.url)) return nativeText.apply(this, args);
        const response = this;
        return settingsReadyPromise.then(() => nativeText.apply(response, args)).then(filterText);
      };
    }
  }

  if (typeof XMLHttpRequest !== 'undefined' && XMLHttpRequest.prototype) {
    const proto = XMLHttpRequest.prototype;
    const nativeOpen = proto.open;
    const responseDescriptor = Object.getOwnPropertyDescriptor(proto, 'response');
    const responseTextDescriptor = Object.getOwnPropertyDescriptor(proto, 'responseText');
    const urls = new WeakMap();
    const textCache = new WeakMap();

    function xhrIsTarget(xhr) {
      let responseUrl = '';
      try { responseUrl = xhr.responseURL || ''; } catch {}
      return isTargetUrl(responseUrl) || isTargetUrl(urls.get(xhr));
    }

    function transformed(xhr, property, raw) {
      if (!xhrIsTarget(xhr)) return raw;
      if (property === 'response' && xhr.responseType === 'json' && raw && typeof raw === 'object') {
        if (settingsReady && cleanHomePage) filterPayload(raw);
        return raw;
      }
      if (typeof raw === 'string' && (property === 'responseText' || xhr.responseType === '' || xhr.responseType === 'text')) {
        if (!settingsReady) return raw;
        const cached = textCache.get(xhr);
        if (cached?.raw === raw) return cached.filtered;
        const filtered = filterText(raw);
        textCache.set(xhr, { raw, filtered });
        return filtered;
      }
      return raw;
    }

    if (responseDescriptor?.get && responseDescriptor.configurable) {
      Object.defineProperty(proto, 'response', {
        configurable: true,
        enumerable: responseDescriptor.enumerable,
        get() { return transformed(this, 'response', responseDescriptor.get.call(this)); }
      });
    }

    if (responseTextDescriptor?.get && responseTextDescriptor.configurable) {
      Object.defineProperty(proto, 'responseText', {
        configurable: true,
        enumerable: responseTextDescriptor.enumerable,
        get() { return transformed(this, 'responseText', responseTextDescriptor.get.call(this)); }
      });
    }

    proto.open = function (method, url, ...rest) {
      const result = nativeOpen.call(this, method, url, ...rest);
      try {
        if (isTargetUrl(String(url))) {
          urls.set(this, String(url));
          textCache.delete(this);
          if (responseDescriptor?.get && !Object.prototype.hasOwnProperty.call(this, 'response')) {
            Object.defineProperty(this, 'response', {
              configurable: true,
              enumerable: responseDescriptor.enumerable,
              get() { return transformed(this, 'response', responseDescriptor.get.call(this)); }
            });
          }
          if (responseTextDescriptor?.get && !Object.prototype.hasOwnProperty.call(this, 'responseText')) {
            Object.defineProperty(this, 'responseText', {
              configurable: true,
              enumerable: responseTextDescriptor.enumerable,
              get() { return transformed(this, 'responseText', responseTextDescriptor.get.call(this)); }
            });
          }
        } else {
          urls.delete(this);
          textCache.delete(this);
        }
      } catch {}
      return result;
    };
  }
})();
