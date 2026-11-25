(() => {
  'use strict';

  if (globalThis.__RoImprHomeChartLinksLoaded) return;
  globalThis.__RoImprHomeChartLinksLoaded = true;

  const SECTION_SELECTOR = '.game-sort-carousel-wrapper, .games-list-container';
  const LINK_SELECTOR = 'a[href]';
  const ALLOWED_PARAMETERS = new Set(['placeid', 'universeid']);
  const ALLOWED_HOSTS = new Set(['www.roblox.com', 'roblox.com']);

  let enabled = true;
  let active = false;
  let observer = null;
  let rootWatcher = null;
  let activationListenersActive = false;

  function normalizePath(pathname) {
    return pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//i, '/') || '/';
  }

  function isTargetPage() {
    const path = normalizePath(location.pathname);
    return path === '/' ||
      path === '/home' ||
      path.startsWith('/home/') ||
      path === '/charts' ||
      path.startsWith('/charts/');
  }

  function isInsideTargetSection(link) {
    return Boolean(link.closest(SECTION_SELECTOR));
  }

  function cleanLink(link) {
    if (!enabled ||
        !active ||
        !(link instanceof HTMLAnchorElement) ||
        !isInsideTargetSection(link)) {
      return false;
    }

    const rawHref = link.getAttribute('href');
    if (!rawHref || !rawHref.includes('?')) return false;

    let url;
    try {
      url = new URL(rawHref, location.href);
    } catch {
      return false;
    }

    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
      return false;
    }

    const kept = [...url.searchParams.entries()].filter(([key]) =>
      ALLOWED_PARAMETERS.has(key.toLowerCase())
    );

    const query = new URLSearchParams(kept).toString();
    const pathname = url.pathname;
    const suffix = `${pathname}${query ? `?${query}` : ''}${url.hash}`;
    const isAbsolute = /^https?:\/\//i.test(rawHref);
    const isProtocolRelative = rawHref.startsWith('//');

    const cleanedHref = isAbsolute
      ? `${url.origin}${suffix}`
      : isProtocolRelative
        ? `//${url.host}${suffix}`
        : suffix;

    if (cleanedHref === rawHref) return false;
    link.setAttribute('href', cleanedHref);
    return true;
  }

  function cleanSection(section) {
    if (!(section instanceof Element)) return;

    if (section.matches(LINK_SELECTOR)) cleanLink(section);

    for (const link of section.querySelectorAll(LINK_SELECTOR)) {
      cleanLink(link);
    }
  }

  function cleanAddedNode(node) {
    if (!(node instanceof Element)) return;

    if (node.matches(SECTION_SELECTOR)) {
      cleanSection(node);
      return;
    }

    const parentSection = node.closest(SECTION_SELECTOR);
    if (parentSection) {
      if (node.matches(LINK_SELECTOR)) cleanLink(node);
      for (const link of node.querySelectorAll(LINK_SELECTOR)) cleanLink(link);
      return;
    }

    for (const section of node.querySelectorAll(SECTION_SELECTOR)) {
      cleanSection(section);
    }
  }

  function pageRoot() {
    return document.querySelector('#container-main') || document.querySelector('main');
  }

  function cleanExistingSections() {
    const root = pageRoot();
    if (!active || !root) return;
    for (const section of root.querySelectorAll(SECTION_SELECTOR)) cleanSection(section);
  }

  function attachActivationListeners() {
    if (activationListenersActive) return;
    activationListenersActive = true;
    document.addEventListener('pointerdown', cleanActivatedLink, true);
    document.addEventListener('click', cleanActivatedLink, true);
    document.addEventListener('auxclick', cleanActivatedLink, true);
  }

  function detachActivationListeners() {
    if (!activationListenersActive) return;
    activationListenersActive = false;
    document.removeEventListener('pointerdown', cleanActivatedLink, true);
    document.removeEventListener('click', cleanActivatedLink, true);
    document.removeEventListener('auxclick', cleanActivatedLink, true);
  }

  function startObserver() {
    if (!enabled || !active || observer || !document.documentElement) return;
    const root = pageRoot();
    if (!root) {
      if (!rootWatcher) {
        rootWatcher = new MutationObserver(() => {
          if (!pageRoot()) return;
          rootWatcher.disconnect();
          rootWatcher = null;
          startObserver();
        });
        rootWatcher.observe(document.documentElement, { childList: true, subtree: true });
      }
      return;
    }

    observer = new MutationObserver((records) => {
      if (!enabled || !active) return;

      for (const record of records) {
        if (record.type === 'attributes') {
          cleanLink(record.target);
          continue;
        }

        for (const node of record.addedNodes) {
          cleanAddedNode(node);
        }
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });

    cleanExistingSections();
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
    rootWatcher?.disconnect();
    rootWatcher = null;
    detachActivationListeners();
    active = false;
  }

  function updateRoute() {
    if (enabled && isTargetPage()) {
      active = true;
      attachActivationListeners();
      startObserver();
      cleanExistingSections();
    } else {
      stopObserver();
    }
  }

  function cleanActivatedLink(event) {
    if (!enabled || !active) return;

    const target = event.target instanceof Element
      ? event.target
      : event.target?.parentElement;
    const link = target?.closest(LINK_SELECTOR);
    if (link) cleanLink(link);
  }

  window.addEventListener('roimpr:route-change', updateRoute);
  window.addEventListener('popstate', updateRoute);
  window.addEventListener('pageshow', updateRoute);

  chrome.storage.local.get({ removeLinkParameters: true })
    .then((settings) => {
      enabled = settings.removeLinkParameters !== false;
      updateRoute();
    })
    .catch(() => {
      enabled = true;
      updateRoute();
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Object.hasOwn(changes, 'removeLinkParameters')) return;
    enabled = changes.removeLinkParameters.newValue !== false;
    updateRoute();
  });

  if (!document.documentElement) {
    const earlyObserver = new MutationObserver(() => {
      if (!document.documentElement) return;
      earlyObserver.disconnect();
      updateRoute();
    });

    earlyObserver.observe(document, { childList: true, subtree: true });
  }
})();
