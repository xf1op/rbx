'use strict';

(() => {
  const KEY = '__RoImprHomeFeedBridge';
  if (window[KEY]) return;
  window[KEY] = true;

  const DEFAULTS = { cleanHomePage: false, removeLinkParameters: true };
  const TRACKING_PARAMETERS = new Set([
    'adid',
    'adindex',
    'adtoken',
    'analyticsdata',
    'appliedfilters',
    'clickcontext',
    'clickid',
    'dclid',
    'discoverpagesessioninfo',
    'entrypoint',
    'fbclid',
    'frompage',
    'frompageid',
    'gamesettargetid',
    'gamesettypeid',
    'gclid',
    'gesessioninfo',
    'homepagesessioninfo',
    'igshid',
    'isad',
    'mc_cid',
    'mc_eid',
    'msclkid',
    'nativeaddata',
    'newgameenum_analyticsdata',
    'numberofloadedtiles',
    'page',
    'playcontext',
    'position',
    'positioninrow',
    'referrer',
    'referrerid',
    'refpage',
    'refpageid',
    'rowonpage',
    'sessionid',
    'sessioninfo',
    'sortpos',
    'sortsubid',
    'sourcesortid_analyticsdata',
    'tracking',
    'trackingid',
    'treatmenttype',
    'ttclid'
  ]);

  let cleanHomePage = DEFAULTS.cleanHomePage;
  let removeLinkParameters = DEFAULTS.removeLinkParameters;
  let observer = null;
  let rootWatcher = null;
  let scanQueued = false;
  let checkedLinks = new WeakSet();
  const checkedText = new WeakSet();

  function publish(value) {
    cleanHomePage = value?.cleanHomePage === true;
    removeLinkParameters = value?.removeLinkParameters !== false;
    checkedLinks = new WeakSet();
    window.postMessage({
      __roImprFeedBridge: 'settings',
      settings: { cleanHomePage }
    }, location.origin);

    syncPageState();
  }

  function isHomePage() {
    const path = location.pathname
      .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//i, '/')
      .replace(/\/+$/, '') || '/';
    return path === '/' || path === '/home';
  }


  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().replace(/[!:.]+$/, '').toLowerCase();
  }

  function isRemovedHeading(value) {
    const label = normalize(value);
    return /^(friends|friends are playing|friends activity|friends playing|standout games?|standout games? for you|recommended for you|recommendations?|discover|sponsored)(?:\s|$)/.test(label);
  }

  function isFeedHeading(value) {
    const label = normalize(value);
    return isRemovedHeading(label) || ['continue', 'continue playing', 'favorites', 'favourites'].includes(label);
  }

  function clearMedia(section) {
    const media = section.querySelectorAll('img,source,video,audio,iframe,track,embed,object');
    for (const element of media) {
      for (const attr of ['src', 'srcset', 'sizes', 'poster', 'data-src', 'data-srcset', 'data-lazy-src', 'data-original', 'data-original-src', 'data-background-image']) {
        if (element.hasAttribute(attr)) element.removeAttribute(attr);
      }
      if (element instanceof HTMLMediaElement) {
        try { element.pause(); element.load(); } catch {}
      }
    }
    for (const element of [section, ...section.querySelectorAll('[style]')]) {
      if (element.style?.backgroundImage) element.style.backgroundImage = 'none';
    }
  }

  function findSection(heading) {
    let node = heading;
    const cardSelector = 'a[href*="/games/"],[data-testid*="game-card" i],[data-testid*="game-tile" i],[class*="game-card" i],[class*="GameCard"]';
    const sectionSelector = 'section,[data-testid*="sort" i],[data-testid*="carousel" i],[data-testid*="section" i],[class*="sort-container" i],[class*="carousel" i],[class*="section-container" i]';

    for (let depth = 0; depth < 10; depth += 1) {
      node = node.parentElement;
      if (!node || node === document.body || node === document.documentElement || node.matches('main,#container-main')) break;

      const competing = [...node.querySelectorAll('h1,h2,h3,h4,[role="heading"],div,span')].some((candidate) => {
        if (candidate === heading || candidate.contains(heading) || heading.contains(candidate)) return false;
        const label = normalize(candidate.textContent);
        return label.length <= 70 && isFeedHeading(label);
      });
      if (competing) continue;

      const cards = node.querySelectorAll(cardSelector).length;
      if (node.matches(sectionSelector) && (cards >= 1 || node.children.length >= 3)) return node;
      if (cards >= 2 && node.children.length >= 2) return node;
    }
    return null;
  }

  function isRobloxLink(url) {
    return url.protocol === 'https:' && (url.hostname === 'roblox.com' || url.hostname.endsWith('.roblox.com'));
  }

  function isTrackingParameter(name, value) {
    const key = String(name || '').toLowerCase();
    if (TRACKING_PARAMETERS.has(key) || key.startsWith('utm_')) return true;
    if (key === 'page' && String(value || '').toLowerCase() === 'homepage') return true;
    return false;
  }

  function cleanLinkElement(element) {
    const isAnchor = element instanceof HTMLAnchorElement;
    const isForm = element instanceof HTMLFormElement;
    if (!isAnchor && !isForm) return false;

    const attribute = isAnchor ? 'href' : 'action';
    const rawUrl = element.getAttribute(attribute);
    if (!rawUrl) return false;

    try {
      const url = new URL(rawUrl, location.origin);
      if (!isRobloxLink(url) || !url.search) return false;

      let changed = false;
      for (const key of [...url.searchParams.keys()]) {
        const value = url.searchParams.get(key);
        if (isTrackingParameter(key, value)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (!changed) return false;

      const search = url.searchParams.toString();
      const path = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
      const cleanedUrl = url.origin === location.origin ? path : `${url.origin}${path}`;
      if (rawUrl !== cleanedUrl) element.setAttribute(attribute, cleanedUrl);
      return true;
    } catch {
      return false;
    }
  }

  function hasRemovableParameters(element) {
    if (!(element instanceof HTMLAnchorElement) && !(element instanceof HTMLFormElement)) return false;
    const attribute = element instanceof HTMLAnchorElement ? 'href' : 'action';
    const rawUrl = element.getAttribute(attribute);
    if (!rawUrl) return false;
    try {
      const url = new URL(rawUrl, location.origin);
      if (!isRobloxLink(url)) return false;
      return [...url.searchParams.entries()].some(([key, value]) => isTrackingParameter(key, value));
    } catch {
      return false;
    }
  }

  function cleanRobloxLinks(root) {
    if (!removeLinkParameters || !root) return;
    const selector = 'a[href],area[href],form[action]';
    if (root instanceof Element && root.matches(selector)) cleanLinkElement(root);
    if (!root.querySelectorAll) return;
    for (const element of root.querySelectorAll(selector)) {
      if (checkedLinks.has(element)) continue;
      checkedLinks.add(element);
      cleanLinkElement(element);
    }
  }


  function cleanActivatedLink(event) {
    if (!removeLinkParameters || !isHomePage()) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const link = target?.closest('a[href],area[href]');
    const root = document.querySelector('#container-main') || document.querySelector('main');
    if (link && root?.contains(link)) cleanLinkElement(link);
  }

  function scan() {
    if (!isHomePage() || (!cleanHomePage && !removeLinkParameters) || !document.documentElement) return;
    const root = document.querySelector('#container-main') || document.querySelector('main');
    if (!root) return;

    cleanRobloxLinks(root);
    if (!cleanHomePage) return;

    const candidates = new Set(root.querySelectorAll('h1,h2,h3,h4,[role="heading"],[data-testid*="title" i],[class*="section-title" i],[class*="heading" i]'));
    for (const element of root.querySelectorAll('div,span')) {
      if (element.childElementCount > 3 || checkedText.has(element)) continue;
      checkedText.add(element);
      const label = String(element.textContent || '').trim();
      if (label && label.length <= 70 && isFeedHeading(label)) candidates.add(element);
    }

    const sections = new Map();
    for (const heading of candidates) {
      if (!heading.isConnected || !isRemovedHeading(heading.textContent)) continue;
      const section = findSection(heading);
      if (section?.isConnected) sections.set(section, true);
    }

    const removals = [...sections.keys()].filter((section) =>
      ![...sections.keys()].some((other) => other !== section && other.contains(section))
    );
    for (const section of removals) {
      if (!section.isConnected) continue;
      clearMedia(section);
      section.remove();
    }
  }

  function queueScan() {
    if (scanQueued || (!cleanHomePage && !removeLinkParameters)) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      scan();
    });
  }

  function startObserver() {
    if (observer || !isHomePage()) return;
    const root = document.querySelector('#container-main') || document.querySelector('main');
    if (!root) {
      if (!rootWatcher && document.documentElement) {
        rootWatcher = new MutationObserver(() => {
          const main = document.querySelector('#container-main') || document.querySelector('main');
          if (!main) return;
          rootWatcher.disconnect();
          rootWatcher = null;
          startObserver();
          queueScan();
        });
        rootWatcher.observe(document.documentElement, { childList: true, subtree: true });
      }
      return;
    }
    observer = new MutationObserver((records) => {
      for (const record of records) {
        if (removeLinkParameters && record.type === 'attributes' &&
            (record.attributeName === 'href' || record.attributeName === 'action')) {
          cleanLinkElement(record.target);
          continue;
        }
        if (cleanHomePage && isHomePage() && record.type === 'characterData') {
          const parent = record.target.parentElement;
          if (parent) { checkedText.delete(parent); if (parent.parentElement) checkedText.delete(parent.parentElement); }
          if (isFeedHeading(record.target.nodeValue)) queueScan();
          continue;
        }
        for (const node of record.addedNodes || []) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (removeLinkParameters) cleanRobloxLinks(node);
            if (cleanHomePage && isHomePage() && node.childElementCount <= 3 && isFeedHeading(node.textContent?.slice(0, 80))) queueScan();
            else if (cleanHomePage && isHomePage() && node.childElementCount > 3) queueScan();
          } else if (cleanHomePage && isHomePage() && node.nodeType === Node.TEXT_NODE && isFeedHeading(node.nodeValue)) {
            queueScan();
          }
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'action'] });
    document.addEventListener('click', cleanActivatedLink, true);
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
    rootWatcher?.disconnect();
    rootWatcher = null;
    document.removeEventListener('click', cleanActivatedLink, true);
  }

  function syncPageState() {
    if (!isHomePage() || (!cleanHomePage && !removeLinkParameters)) {
      stopObserver();
      return;
    }
    startObserver();
    queueScan();
  }

  chrome.storage.local.get(DEFAULTS).then(publish).catch(() => publish(DEFAULTS));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || (!Object.hasOwn(changes, 'cleanHomePage') && !Object.hasOwn(changes, 'removeLinkParameters'))) return;
    chrome.storage.local.get(DEFAULTS).then(publish).catch(() => {});
  });

  function handleNavigation() {
    syncPageState();
  }

  window.addEventListener('roimpr:route-change', handleNavigation);
  window.addEventListener('popstate', handleNavigation);
  window.addEventListener('hashchange', handleNavigation);
  window.addEventListener('pageshow', handleNavigation);
})();
