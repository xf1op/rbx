'use strict';

(() => {
  const KEY = '__RoImprVoiceSettingsObserver';
  const EVENT = 'roimpr:voice-settings-response';
  if (window[KEY]) return;
  window[KEY] = true;
  let enabled = false;

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin ||
        event.data?.__roImprVoiceChatSetting !== true ||
        typeof event.data.enabled !== 'boolean') return;
    enabled = event.data.enabled;
  });

  function isVoiceSettingsRequest(input) {
    try {
      const raw = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input?.url;
      if (typeof raw !== 'string') return false;
      const url = new URL(raw, location.href);
      return url.origin === 'https://voice.roblox.com' && url.pathname === '/v1/settings';
    } catch {
      return false;
    }
  }

  function publish(payload) {
    if (!payload || typeof payload !== 'object' ||
        typeof payload.isBanned !== 'boolean' ||
        typeof payload.isVoiceEnabled !== 'boolean') return;

    const detail = {
      isBanned: payload.isBanned,
      isVoiceEnabled: payload.isVoiceEnabled,
      isUserEligible: typeof payload.isUserEligible === 'boolean' ? payload.isUserEligible : null,
      // Preserve explicit null (permanent ban), missing (unknown), and the full
      // Seconds/Nanos timestamp (temporary suspension) as distinct states.
      bannedUntil: Object.prototype.hasOwnProperty.call(payload, 'bannedUntil')
        ? payload.bannedUntil
        : undefined
    };

    try {
      window.dispatchEvent(new CustomEvent(EVENT, { detail: JSON.stringify(detail) }));
    } catch {}
  }

  if (typeof window.fetch === 'function' && !window.fetch.__roimprVoiceObserved) {
    const originalFetch = window.fetch;
    const observedFetch = function (...args) {
      if (!enabled) return Reflect.apply(originalFetch, this, args);
      const watch = isVoiceSettingsRequest(args[0]);
      const result = Reflect.apply(originalFetch, this, args);
      if (watch && result && typeof result.then === 'function') {
        result.then((response) => {
          if (!response?.ok || typeof response.clone !== 'function') return;
          response.clone().json().then(publish).catch(() => {});
        }).catch(() => {});
      }
      return result;
    };
    Object.defineProperty(observedFetch, '__roimprVoiceObserved', { value: true });
    try { window.fetch = observedFetch; } catch {}
  }

  if (typeof XMLHttpRequest === 'function' && !XMLHttpRequest.prototype.open.__roimprVoiceObserved) {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    const observedOpen = function (method, url, ...rest) {
      this.__roimprVoiceSettingsRequest = enabled && isVoiceSettingsRequest(String(url));
      return Reflect.apply(originalOpen, this, [method, url, ...rest]);
    };
    Object.defineProperty(observedOpen, '__roimprVoiceObserved', { value: true });

    const observedSend = function (...args) {
      if (this.__roimprVoiceSettingsRequest) {
        this.addEventListener('loadend', function () {
          if (this.status < 200 || this.status >= 300) return;
          try {
            const body = this.responseType === 'json' ? this.response : this.responseText;
            publish(typeof body === 'string' ? JSON.parse(body) : body);
          } catch {}
        }, { once: true });
      }
      return Reflect.apply(originalSend, this, args);
    };

    try {
      XMLHttpRequest.prototype.open = observedOpen;
      XMLHttpRequest.prototype.send = observedSend;
    } catch {}
  }
})();
