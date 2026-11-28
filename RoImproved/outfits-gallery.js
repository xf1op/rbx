'use strict';

(() => {
  const KEY = '__RoImprOutfitsGallery';
  if (window[KEY]) return;
  window[KEY] = true;

  const STORAGE_DEFAULTS = { profileOutfitsEnabled: false };
  const BUTTON_ID = 'RoImpr-profile-outfits-button';
  const WRAPPER_ID = 'RoImpr-profile-outfits-control';
  const MODAL_ID = 'RoImpr-profile-outfits-modal';
  const STYLE_ID = 'RoImpr-profile-outfits-style';
  const ROUTE_EVENT = 'roimpr:route-change';
  const CSS = `#${MODAL_ID}{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.18);color:var(--color-content-default,#393b3d);font:inherit}#${MODAL_ID}[data-open="true"]{display:flex}#${MODAL_ID} .RoImpr-outfits-dialog{display:flex;flex-direction:column;width:min(1180px,calc(100vw - 32px));max-height:min(880px,calc(100vh - 48px));min-height:300px;overflow:hidden;border:0;border-radius:var(--radius-medium,8px);background:var(--color-surface-0,#fff);box-shadow:none}#${MODAL_ID} .RoImpr-outfits-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;background:var(--color-surface-0,#fff)}#${MODAL_ID} .RoImpr-outfits-heading{min-width:0}#${MODAL_ID} .RoImpr-outfits-title{margin:0;color:var(--color-content-default,#393b3d);font-size:18px;font-weight:600}#${MODAL_ID} .RoImpr-outfits-close{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;flex:0 0 auto;border:0;background:transparent;color:var(--color-content-default,#393b3d);font:inherit;font-size:24px;line-height:1;cursor:pointer}#${MODAL_ID} .RoImpr-outfits-close:hover{background:var(--color-state-hover,rgba(0,0,0,.06))}#${MODAL_ID} .RoImpr-outfits-status{padding:4px 18px 10px;color:var(--color-content-muted,#72777d);font-size:12px}#${MODAL_ID} .RoImpr-outfits-status:empty{display:none}#${MODAL_ID} .RoImpr-outfits-grid-wrap{min-height:0;overflow:auto;padding:10px 18px 18px}#${MODAL_ID} .RoImpr-outfits-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:12px}#${MODAL_ID} .RoImpr-outfit-card{display:flex;flex-direction:column;align-items:stretch;min-width:0;padding:4px;border:0;border-radius:var(--radius-medium,8px);background:var(--color-surface-1,rgba(0,0,0,.035));color:var(--color-content-default,#393b3d);text-align:left;cursor:pointer;box-shadow:none;outline:none}#${MODAL_ID} .RoImpr-outfit-card:hover{background:var(--color-state-hover,rgba(0,0,0,.07))}#${MODAL_ID} .RoImpr-outfit-card[aria-pressed="true"]{background:var(--color-shift-200,rgba(0,0,0,.1))}#${MODAL_ID} .RoImpr-outfit-image-wrap{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:1;overflow:hidden;border-radius:var(--radius-small,4px);background:var(--color-surface-2,rgba(0,0,0,.06))}#${MODAL_ID} .RoImpr-outfit-image{display:block;width:100%;height:100%;object-fit:contain}#${MODAL_ID} .RoImpr-outfit-placeholder{color:var(--color-content-muted,#72777d);font-size:11px;text-align:center;padding:6px}#${MODAL_ID} .RoImpr-outfit-name{display:-webkit-box;min-height:32px;margin:7px 3px 0;overflow:hidden;color:var(--color-content-default,#393b3d);font-size:12px;font-weight:500;line-height:1.35;-webkit-box-orient:vertical;-webkit-line-clamp:2}#${MODAL_ID} .RoImpr-outfit-card-id{margin:2px 3px 3px;color:var(--color-content-muted,#72777d);font-size:10px}#${MODAL_ID} .RoImpr-outfits-load-wrap{display:flex;justify-content:center;padding:0 18px 16px}#${MODAL_ID} .RoImpr-outfits-load-wrap[hidden]{display:none!important}#${MODAL_ID} .RoImpr-outfits-action{min-height:34px;padding:0 14px;border:0;border-radius:var(--radius-medium,8px);background:var(--color-action-standard,#e6e7e8);color:var(--color-content-action-standard,#393b3d);font:inherit;cursor:pointer;box-shadow:none}#${MODAL_ID} .RoImpr-outfits-action:disabled{opacity:.5;cursor:default}#${MODAL_ID} .RoImpr-outfits-empty{grid-column:1/ -1;padding:40px 16px;color:var(--color-content-muted,#72777d);text-align:center}#${WRAPPER_ID}{position:absolute!important;display:inline-flex!important;align-items:center!important;flex:0 0 auto!important;right:auto!important;bottom:auto!important;transform:translateX(calc(-100% - 8px))!important;margin:0!important;vertical-align:middle!important;white-space:nowrap!important;pointer-events:auto!important}#${BUTTON_ID}{position:relative!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;margin:0!important;vertical-align:middle!important;white-space:nowrap!important}#${BUTTON_ID}:disabled{cursor:default!important;opacity:.55!important}@media(max-width:1150px){#${MODAL_ID} .RoImpr-outfits-grid{grid-template-columns:repeat(7,minmax(0,1fr))}}@media(max-width:1000px){#${MODAL_ID} .RoImpr-outfits-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}@media(max-width:820px){#${MODAL_ID} .RoImpr-outfits-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}@media(max-width:650px){#${MODAL_ID}{padding:10px}#${MODAL_ID} .RoImpr-outfits-dialog{width:calc(100vw - 20px);max-height:calc(100vh - 20px)}#${MODAL_ID} .RoImpr-outfits-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}#${MODAL_ID} .RoImpr-outfits-grid-wrap{padding:10px}#${MODAL_ID} .RoImpr-outfits-header{padding:12px}}@media(max-width:440px){#${MODAL_ID} .RoImpr-outfits-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`;

  let enabled = false;
  let currentUserId = null;
  let trigger = null;
  let controlElement = null;
  let controlWrapper = null;
  let triggerWrapper = null;
  let profileContainer = null;
  let positionObserver = null;
  let positionFrame = 0;
  let discoveryObserver = null;
  let discoveryFrame = 0;
  let observedProfileContainers = new Set();
  let modal = null;
  let nextCursor = null;
  let loading = false;
  let loadedUserId = null;
  let outfits = [];
  let thumbnails = new Map();
  let rateLimitUntil = 0;
  let rateLimitTimer = null;
  let rateLimitContext = '';
  let bodyOverflowBefore = '';
  let routeKey = '';
  let keydownAttached = false;

  function profileUserId() {
    const path = location.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//i, '/');
    const match = path.match(/^\/users\/(\d+)\/profile\/?$/);
    return match ? match[1] : null;
  }

  function installStyles() {
    if (!document.documentElement || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function normalized(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function is3DControl(element) {
    if (!(element instanceof Element)) return false;
    const labels = [
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('data-testid'),
      element.getAttribute('data-test'),
      typeof element.className === 'string' ? element.className : element.className?.baseVal,
      element.querySelector('svg,[data-testid],[aria-label],[title]')?.getAttribute('data-testid'),
      element.querySelector('svg,[data-testid],[aria-label],[title]')?.getAttribute('aria-label'),
      element.querySelector('svg,[data-testid],[aria-label],[title]')?.getAttribute('title'),
      element.textContent
    ].map(normalized).filter(Boolean);
    return labels.some((label) =>
      /^(3d|3d view|view 3d|view in 3d|switch to 3d|show 3d)$/.test(label) ||
      /(?:^|[-_ ])(?:3d)(?:[-_ ]|$)/.test(label)
    );
  }

  function find3DControl() {
    const containers = document.querySelectorAll('.currently-wearing-avatar-with-background');
    let fallback = null;
    for (const container of containers) {
      for (const wrapper of container.querySelectorAll(':scope > .avatar-toggle-button')) {
        if (wrapper.id === WRAPPER_ID || wrapper.classList.contains('RoImpr-outfits-control')) continue;
        for (const button of wrapper.querySelectorAll('button,[role="button"],a')) {
          if (button.id === BUTTON_ID || !is3DControl(button)) continue;
          const candidate = { container, wrapper, button };
          // Prefer a laid-out control, but do not miss it when Roblox has inserted
          // the avatar controls before their first layout pass.
          const rect = button.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return candidate;
          if (!fallback) fallback = candidate;
        }
      }
    }
    return fallback;
  }

  function positionTrigger() {
    if (!triggerWrapper?.isConnected || !controlWrapper?.isConnected) return;
    const offsetParent = triggerWrapper.offsetParent || document.documentElement;
    const anchorRect = controlWrapper.getBoundingClientRect();
    const parentRect = offsetParent.getBoundingClientRect();
    const parentStyle = getComputedStyle(offsetParent);
    const scaleX = offsetParent.offsetWidth ? parentRect.width / offsetParent.offsetWidth : 1;
    const scaleY = offsetParent.offsetHeight ? parentRect.height / offsetParent.offsetHeight : 1;
    const borderLeft = parseFloat(parentStyle.borderLeftWidth) || 0;
    const borderTop = parseFloat(parentStyle.borderTopWidth) || 0;
    const left = (anchorRect.left - parentRect.left) / (scaleX || 1) - borderLeft + offsetParent.scrollLeft;
    const top = (anchorRect.top - parentRect.top) / (scaleY || 1) - borderTop + offsetParent.scrollTop;
    triggerWrapper.style.setProperty('left', `${left}px`, 'important');
    triggerWrapper.style.setProperty('top', `${top}px`, 'important');
    const zIndex = getComputedStyle(controlWrapper).zIndex;
    triggerWrapper.style.setProperty('z-index', zIndex === 'auto' ? '1' : zIndex, 'important');
  }

  function schedulePosition() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      positionTrigger();
    });
  }

  function watchTriggerPosition(container, nativeWrapper, wrapper) {
    positionObserver?.disconnect();
    positionObserver = null;
    if (typeof ResizeObserver === 'function') {
      positionObserver = new ResizeObserver(schedulePosition);
      for (const element of new Set([container, nativeWrapper, wrapper, wrapper.offsetParent])) {
        if (element instanceof Element) positionObserver.observe(element);
      }
    }
    window.removeEventListener('resize', schedulePosition);
    window.removeEventListener('scroll', schedulePosition, true);
    window.addEventListener('resize', schedulePosition, { passive: true });
    window.addEventListener('scroll', schedulePosition, { passive: true, capture: true });
    schedulePosition();
  }

  function createTrigger(anchor) {
    const { container, wrapper: nativeWrapper, button: control } = anchor;
    if (!container.isConnected || nativeWrapper.parentElement !== container) return null;

    const wrapper = document.createElement('div');
    wrapper.id = WRAPPER_ID;
    wrapper.className = 'avatar-toggle-button RoImpr-outfits-control';

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    const nativeClass = typeof control.className === 'string'
      ? control.className
      : 'foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-large height-1200 padding-x-medium bg-action-standard content-action-standard';
    button.className = `${nativeClass} RoImpr-outfit-trigger`;
    button.innerHTML = `
      <div aria-hidden="true" data-testid="foundation-web-state-layer" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
      <span class="flex items-center min-width-0 gap-small"><span class="padding-y-xsmall text-truncate-end text-no-wrap">Outfits</span></span>`;
    button.style.textDecoration = 'none';
    button.setAttribute('aria-label', 'Show this user’s outfits');
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', toggleGallery);

    wrapper.appendChild(button);
    container.insertBefore(wrapper, nativeWrapper);

    trigger = button;
    controlElement = control;
    controlWrapper = nativeWrapper;
    triggerWrapper = wrapper;
    profileContainer = container;
    watchTriggerPosition(container, nativeWrapper, wrapper);
    updateRateLimitUi();
    return button;
  }

  function stopDiscovery() {
    discoveryObserver?.disconnect();
    discoveryObserver = null;
    observedProfileContainers.clear();
    if (discoveryFrame) cancelAnimationFrame(discoveryFrame);
    discoveryFrame = 0;
  }

  function observeProfileContainer(container) {
    if (!discoveryObserver || !(container instanceof Element) || observedProfileContainers.has(container)) return;
    observedProfileContainers.add(container);
    discoveryObserver.observe(container, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class', 'aria-label', 'title', 'data-testid', 'data-test', 'hidden']
    });
  }

  function trackProfileContainers(node) {
    if (!(node instanceof Element)) return;
    if (node.matches('.currently-wearing-avatar-with-background')) observeProfileContainer(node);
    for (const container of node.querySelectorAll('.currently-wearing-avatar-with-background')) {
      observeProfileContainer(container);
    }
  }

  function scheduleDiscovery() {
    if (discoveryFrame) return;
    discoveryFrame = requestAnimationFrame(() => {
      discoveryFrame = 0;
      if (!enabled || !profileUserId()) return;
      tryAttachTrigger();
    });
  }

  function isTriggerAttached() {
    return Boolean(
      trigger?.isConnected &&
      triggerWrapper?.isConnected &&
      controlElement?.isConnected &&
      controlWrapper?.isConnected &&
      profileContainer?.isConnected &&
      profileContainer.matches('.currently-wearing-avatar-with-background') &&
      trigger.parentElement === triggerWrapper &&
      triggerWrapper.parentElement === profileContainer &&
      controlWrapper.parentElement === profileContainer &&
      triggerWrapper.nextElementSibling === controlWrapper &&
      triggerWrapper.matches('.avatar-toggle-button') &&
      controlWrapper.matches('.avatar-toggle-button') &&
      controlElement.parentElement === controlWrapper
    );
  }

  function tryAttachTrigger() {
    if (!enabled || !currentUserId || !profileUserId()) return false;
    if (isTriggerAttached()) {
      trigger.dataset.userId = currentUserId;
      return true;
    }

    const anchor = find3DControl();
    if (!anchor) {
      // Roblox briefly removes/rebuilds the native 3D control during profile
      // hydration. Keep an already-mounted Outfits button instead of deleting it
      // just because its temporary positioning anchor is missing.
      if (trigger?.isConnected && triggerWrapper?.isConnected && trigger.parentElement === triggerWrapper) {
        return true;
      }
      if (trigger || triggerWrapper || controlWrapper) removeTrigger();
      return false;
    }

    // Reuse the existing button when Roblox replaces only the native 3D control.
    // This avoids a visible remove/recreate flicker and preserves the click handler.
    if (trigger?.isConnected && triggerWrapper?.isConnected && trigger.parentElement === triggerWrapper) {
      anchor.container.insertBefore(triggerWrapper, anchor.wrapper);
      controlElement = anchor.button;
      controlWrapper = anchor.wrapper;
      profileContainer = anchor.container;
      trigger.dataset.userId = currentUserId;
      watchTriggerPosition(anchor.container, anchor.wrapper, triggerWrapper);
      updateRateLimitUi();
      return true;
    }

    if (trigger || triggerWrapper || controlWrapper) removeTrigger();
    const button = createTrigger(anchor);
    if (!button) return false;
    button.dataset.userId = currentUserId;
    return true;
  }

  function startDiscovery() {
    if (!enabled || !currentUserId || !document.documentElement) return;
    tryAttachTrigger();
    if (discoveryObserver) return;

    discoveryObserver = new MutationObserver((records) => {
      if (!enabled || !profileUserId()) {
        stopDiscovery();
        return;
      }

      let controlsChanged = false;
      let positionChanged = false;
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target?.matches?.('.currently-wearing-avatar-with-background') ||
            target?.closest?.('.currently-wearing-avatar-with-background')) {
          controlsChanged = true;
          if (record.type === 'attributes') positionChanged = true;
          break;
        }
        if (record.type === 'childList') {
          for (const node of record.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.matches?.('.currently-wearing-avatar-with-background') ||
                node.querySelector?.('.currently-wearing-avatar-with-background')) {
              trackProfileContainers(node);
              controlsChanged = true;
              break;
            }
          }
        }
        if (controlsChanged) break;
      }

      if (controlsChanged) {
        if (isTriggerAttached()) {
          if (positionChanged) schedulePosition();
        } else {
          scheduleDiscovery();
        }
      }
    });
    // Watch only page insertions globally. Attribute changes are watched only
    // inside the avatar-control container to avoid observing the whole Roblox UI.
    discoveryObserver.observe(document.documentElement, { childList: true, subtree: true });
    trackProfileContainers(document.documentElement);
  }

  function removeTrigger() {
    positionObserver?.disconnect();
    positionObserver = null;
    if (positionFrame) cancelAnimationFrame(positionFrame);
    positionFrame = 0;
    window.removeEventListener('resize', schedulePosition);
    window.removeEventListener('scroll', schedulePosition, true);
    triggerWrapper?.remove();
    trigger?.remove();
    trigger = null;
    controlElement = null;
    controlWrapper = null;
    triggerWrapper = null;
    profileContainer = null;
  }

  function handleRouteChange() {
    const nextId = profileUserId();
    const nextKey = `${location.pathname}:${nextId || ''}`;
    if (nextKey === routeKey) {
      if (nextId && enabled) {
        currentUserId = nextId;
        startDiscovery();
      }
      return;
    }
    routeKey = nextKey;
    stopDiscovery();
    if (!nextId) {
      currentUserId = null;
      removeTrigger();
      closeGallery();
      resetGalleryState();
      return;
    }
    if (currentUserId !== nextId) {
      removeTrigger();
      closeGallery();
      resetGalleryState();
    }
    currentUserId = nextId;
    if (!enabled) {
      removeTrigger();
      closeGallery();
      return;
    }
    startDiscovery();
  }

  function createModal() {
    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <section class="RoImpr-outfits-dialog" role="dialog" aria-modal="true" aria-labelledby="RoImpr-outfits-title">
        <header class="RoImpr-outfits-header">
          <div class="RoImpr-outfits-heading">
            <h2 class="RoImpr-outfits-title" id="RoImpr-outfits-title">Outfits</h2>
          </div>
          <button class="RoImpr-outfits-close" type="button" aria-label="Close outfits">×</button>
        </header>
        <div class="RoImpr-outfits-status" data-role="status" aria-live="polite"></div>
        <div class="RoImpr-outfits-grid-wrap">
          <div class="RoImpr-outfits-grid" data-role="grid"></div>
        </div>
        <div class="RoImpr-outfits-load-wrap" data-role="load-wrap" hidden>
          <button class="RoImpr-outfits-action" type="button" data-role="load-more" hidden>Load more</button>
        </div>
      </section>`;

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeGallery();
    });
    overlay.querySelector('.RoImpr-outfits-close').addEventListener('click', closeGallery);
    overlay.querySelector('[data-role="load-more"]').addEventListener('click', () => loadOutfitPage(false));
    document.body.appendChild(overlay);
    modal = overlay;
    return modal;
  }

  function resetGalleryState() {
    nextCursor = null;
    loading = false;
    loadedUserId = null;
    outfits = [];
    thumbnails = new Map();
    if (modal) {
      modal.querySelector('[data-role="grid"]').replaceChildren();
      modal.querySelector('[data-role="status"]').textContent = 'Open to load outfits.';
      modal.querySelector('[data-role="load-more"]').hidden = true;
      modal.querySelector('[data-role="load-wrap"]').hidden = true;
    }
  }

  function openGallery() {
    if (!enabled || !currentUserId) return;
    if (!modal) createModal();
    modal.dataset.open = 'true';
    trigger?.setAttribute('aria-expanded', 'true');
    if (!keydownAttached) {
      document.addEventListener('keydown', onKeydown);
      keydownAttached = true;
    }
    bodyOverflowBefore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    updateRateLimitUi();
    if (loadedUserId !== currentUserId && !loading && !isRateLimited()) loadOutfitPage(true);
  }

  function closeGallery() {
    if (modal) modal.dataset.open = 'false';
    trigger?.setAttribute('aria-expanded', 'false');
    if (keydownAttached) {
      document.removeEventListener('keydown', onKeydown);
      keydownAttached = false;
    }
    if (document.body) document.body.style.overflow = bodyOverflowBefore;
  }

  function toggleGallery() {
    if (modal?.dataset.open === 'true') closeGallery();
    else openGallery();
  }

  function setStatus(message) {
    if (modal) modal.querySelector('[data-role="status"]').textContent = message;
  }

  function formatRemaining(milliseconds) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${remainder}s`;
  }

  function updateRateLimitUi() {
    const remaining = Math.max(0, rateLimitUntil - Date.now());
    const locked = remaining > 0;
    if (trigger?.isConnected) {
      trigger.disabled = locked;
      trigger.setAttribute('aria-disabled', String(locked));
      trigger.title = locked ? `Roblox rate limit · Try again in ${formatRemaining(remaining)}` : 'Show this user’s outfits';
    }
    const loadButton = modal?.querySelector('[data-role="load-more"]');
    if (loadButton) loadButton.disabled = loading || locked;
    if (locked && modal?.dataset.open === 'true' && rateLimitContext) {
      setStatus(`${rateLimitContext} Try again in ${formatRemaining(remaining)}.`);
    }
    if (!locked && rateLimitUntil) {
      rateLimitUntil = 0;
      rateLimitContext = '';
      if (rateLimitTimer) {
        clearInterval(rateLimitTimer);
        rateLimitTimer = null;
      }
      if (modal?.dataset.open === 'true') setStatus('You can try again now.');
    }
  }

  function applyRateLimit(result, source) {
    const duration = Math.max(1000, Math.min(3600000, Number(result?.retryAfterMs) || 15000));
    rateLimitUntil = Math.max(rateLimitUntil, Date.now() + duration);
    rateLimitContext = `Roblox rate-limited ${source}.`;
    updateRateLimitUi();
    if (!rateLimitTimer) rateLimitTimer = window.setInterval(updateRateLimitUi, 1000);
  }

  function isRateLimited() {
    return Date.now() < rateLimitUntil;
  }

  function normalizeOutfits(payload) {
    const list = Array.isArray(payload) ? payload :
      Array.isArray(payload?.data) ? payload.data :
      Array.isArray(payload?.outfits) ? payload.outfits :
      Array.isArray(payload?.items) ? payload.items : [];
    const normalizedItems = [];
    for (const item of list) {
      const id = String(item?.id ?? item?.userOutfitId ?? item?.outfitId ?? '');
      if (!/^\d{1,20}$/.test(id)) continue;
      if (item?.isEditable === false || item?.IsEditable === false) continue;
      const outfitType = item?.outfitType ?? item?.OutfitType ?? null;
      if (outfitType && outfitType !== 'Avatar') continue;
      normalizedItems.push({ id, name: String(item?.name ?? item?.Name ?? `Outfit ${id}`).trim().slice(0, 100) || `Outfit ${id}` });
    }
    const rawCursor = payload?.paginationToken ?? payload?.nextPageCursor ?? payload?.nextCursor ?? payload?.nextPageCursorValue;
    const cursor = typeof rawCursor === 'string' && rawCursor.trim() ? rawCursor : null;
    return { items: normalizedItems, nextCursor: cursor };
  }

  function normalizeThumbnails(payload) {
    const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    const result = new Map();
    for (const item of list) {
      const id = String(item?.targetId ?? item?.userOutfitId ?? item?.id ?? '');
      const imageUrl = String(item?.imageUrl ?? item?.image ?? '');
      if (!/^\d{1,20}$/.test(id) || !imageUrl) continue;
      try {
        const url = new URL(imageUrl);
        if (url.protocol === 'https:' && (url.hostname === 'rbxcdn.com' || url.hostname.endsWith('.rbxcdn.com'))) {
          result.set(id, url.href);
        }
      } catch {}
    }
    return result;
  }

  async function requestOutfits(userId, cursor) {
    return chrome.runtime.sendMessage({ type: 'ROIMPR_OUTFITS_PAGE', userId, paginationToken: cursor });
  }

  async function requestThumbnails(ids) {
    return chrome.runtime.sendMessage({ type: 'ROIMPR_OUTFITS_THUMBNAILS', outfitIds: ids });
  }

  function createOutfitCard(outfit) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'RoImpr-outfit-card';
    card.setAttribute('aria-pressed', 'false');
    card.dataset.outfitId = outfit.id;

    const imageWrap = document.createElement('span');
    imageWrap.className = 'RoImpr-outfit-image-wrap';
    const imageUrl = thumbnails.get(outfit.id);
    if (imageUrl) {
      const image = document.createElement('img');
      image.className = 'RoImpr-outfit-image';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.alt = outfit.name;
      image.src = imageUrl;
      image.addEventListener('error', () => {
        image.remove();
        const placeholder = document.createElement('span');
        placeholder.className = 'RoImpr-outfit-placeholder';
        placeholder.textContent = 'Preview unavailable';
        imageWrap.appendChild(placeholder);
      }, { once: true });
      imageWrap.appendChild(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'RoImpr-outfit-placeholder';
      placeholder.textContent = 'Preview unavailable';
      imageWrap.appendChild(placeholder);
    }

    const name = document.createElement('span');
    name.className = 'RoImpr-outfit-name';
    name.textContent = outfit.name;
    const id = document.createElement('span');
    id.className = 'RoImpr-outfit-card-id';
    id.textContent = `ID: ${outfit.id}`;
    card.append(imageWrap, name, id);
    card.addEventListener('click', () => selectOutfit(outfit, card));
    return card;
  }

  function renderOutfits(newItems) {
    if (!modal) return;
    const grid = modal.querySelector('[data-role="grid"]');
    const fragment = document.createDocumentFragment();
    for (const outfit of newItems) fragment.appendChild(createOutfitCard(outfit));
    grid.appendChild(fragment);
    const loadButton = modal.querySelector('[data-role="load-more"]');
    loadButton.hidden = !nextCursor;
    modal.querySelector('[data-role="load-wrap"]').hidden = !nextCursor;
    loadButton.disabled = loading || isRateLimited();
  }

  async function copyOutfitId(id) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(id);
        return true;
      } catch {}
    }
    const field = document.createElement('textarea');
    field.value = id;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch {}
    field.remove();
    return copied;
  }

  async function selectOutfit(outfit, card) {
    if (!modal) return;
    for (const item of modal.querySelectorAll('.RoImpr-outfit-card')) {
      item.setAttribute('aria-pressed', String(item === card));
    }
    try {
      const copied = await copyOutfitId(outfit.id);
      setStatus(copied ? `Copied outfit ID ${outfit.id}.` : `Outfit ID: ${outfit.id}`);
    } catch {
      setStatus(`Outfit ID: ${outfit.id} · Clipboard unavailable`);
    }
  }

  function apiErrorMessage(result) {
    if (result?.status === 403 || result?.status === 401) return 'Roblox does not allow this outfit list to be viewed.';
    if (result?.status === 429) return 'Roblox is rate-limiting outfit requests.';
    if (result?.status === 404) return 'This profile or its outfit list could not be found.';
    return result?.message || 'Could not load outfits from Roblox.';
  }

  async function loadOutfitPage(reset) {
    if (loading || !currentUserId || !modal) return;
    if (isRateLimited()) {
      updateRateLimitUi();
      return;
    }
    if (reset) resetGalleryState();
    if (!reset && !nextCursor) {
      const loadButton = modal.querySelector('[data-role="load-more"]');
      loadButton.hidden = true;
      return;
    }

    loading = true;
    const requestedCursor = reset ? null : nextCursor;
    const loadButton = modal.querySelector('[data-role="load-more"]');
    setStatus(requestedCursor ? 'Loading more outfits…' : 'Loading outfits…');
    loadButton.disabled = true;

    try {
      const result = await requestOutfits(currentUserId, requestedCursor);
      if (!result?.ok) {
        if (result?.status === 429) applyRateLimit(result, 'outfit requests');
        throw new Error(apiErrorMessage(result));
      }

      const normalized = normalizeOutfits(result.payload);
      const newItems = normalized.items.filter((item) => !outfits.some((existing) => existing.id === item.id));
      if (newItems.length) {
        const thumbResult = await requestThumbnails(newItems.map((item) => item.id));
        if (thumbResult?.ok) {
          const received = normalizeThumbnails(thumbResult.payload);
          for (const [id, url] of received) thumbnails.set(id, url);
        } else if (thumbResult?.status === 429) {
          applyRateLimit(thumbResult, 'thumbnail requests');
        }
      }

      outfits.push(...newItems);
      nextCursor = normalized.nextCursor;
      loadedUserId = currentUserId;
      if (result.retryAfterMs > 0 && nextCursor) applyRateLimit(result, 'outfit requests');
      renderOutfits(newItems);
      if (!outfits.length) {
        const empty = document.createElement('div');
        empty.className = 'RoImpr-outfits-empty';
        empty.textContent = "User's inventory is private.";
        modal.querySelector('[data-role="grid"]').appendChild(empty);
        setStatus('');
      } else if (!isRateLimited()) {
        setStatus('');
      }
    } catch (error) {
      if (!isRateLimited()) setStatus(error instanceof Error ? error.message : 'Could not load outfits from Roblox.');
      if (!outfits.length) {
        const empty = document.createElement('div');
        empty.className = 'RoImpr-outfits-empty';
        empty.textContent = 'Outfits could not be loaded. Close and reopen the gallery to retry.';
        modal.querySelector('[data-role="grid"]').replaceChildren(empty);
      }
    } finally {
      loading = false;
      loadButton.hidden = !nextCursor;
      modal.querySelector('[data-role="load-wrap"]').hidden = !nextCursor;
      loadButton.disabled = isRateLimited() || !nextCursor;
      updateRateLimitUi();
    }
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && modal?.dataset.open === 'true') closeGallery();
  }

  function setEnabled(value) {
    enabled = value === true;
    if (!enabled) {
      stopDiscovery();
      removeTrigger();
      if (modal) modal.remove();
      modal = null;
      if (document.body) document.body.style.overflow = bodyOverflowBefore;
      return;
    }
    handleRouteChange();
  }

  function start() {
    installStyles();
    chrome.storage.local.get(STORAGE_DEFAULTS)
      .then((settings) => setEnabled(settings.profileOutfitsEnabled !== false))
      .catch(() => setEnabled(false));

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && Object.hasOwn(changes, 'profileOutfitsEnabled')) {
        setEnabled(changes.profileOutfitsEnabled.newValue !== false);
      }
    });

    window.addEventListener(ROUTE_EVENT, handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('pageshow', handleRouteChange);
    handleRouteChange();
  }

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
