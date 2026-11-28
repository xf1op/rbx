'use strict';

(() => {
  const STORAGE_DEFAULTS = {
    sidebarEnabled: false,
    sidebarCollapsed: false,
    sidebarButtonsEnabled: true,
    sidebarButtonProfileCard: true,
    sidebarButtonHome: true,
    sidebarButtonProfile: true,
    sidebarButtonRobloxPlus: true,
    sidebarButtonMessages: true,
    sidebarButtonAvatar: true,
    sidebarButtonInventory: true,
    sidebarButtonTrade: true,
    sidebarButtonCommunities: true,
    sidebarButtonNewsroom: true,
    sidebarButtonOfficialStore: true,
    sidebarButtonGiftCards: true,
    sidebarButtonPlusPromo: true
  };
  const ENABLED_ATTRIBUTE = 'data-roimpr-sidebar-enabled';
  const ROOT_ATTRIBUTE = 'data-roimpr-sidebar-state';
  const DESKTOP_ATTRIBUTE = 'data-roimpr-sidebar-desktop';
  const MAIN_ATTRIBUTE = 'data-roimpr-sidebar-main';
  const STYLE_ID = 'RoImpr-sidebar-collapse-style';
  const BUTTON_ID = 'RoImpr-sidebar-toggle';
  const NAV_SELECTOR = '.left-nav';
  const MAIN_SELECTOR = '#container-main';
  const LAYOUT_SELECTOR = `${NAV_SELECTOR},#wrap,${MAIN_SELECTOR}`;
  const BUTTON_SETTINGS = [
    ['sidebarButtonProfileCard', 'profile-card', 'nav > ul > li:has(> a[href="/users/profile"])'],
    ['sidebarButtonHome', 'home', 'nav > ul > li:has(> a[href$="/home"])'],
    ['sidebarButtonProfile', 'profile', 'nav > ul > li:has(> a[href*="/users/profile"]:not([href="/users/profile"]))'],
    ['sidebarButtonRobloxPlus', 'roblox-plus', 'nav > ul > li:has(> a[href$="/plus"]:not(.gap-y-medium))'],
    ['sidebarButtonMessages', 'messages', 'nav > ul > li:has(> a[href*="/my/messages"])'],
    ['sidebarButtonAvatar', 'avatar', 'nav > ul > li:has(> a[href*="/my/avatar"])'],
    ['sidebarButtonInventory', 'inventory', 'nav > ul > li:has(> a[href*="/users/inventory"])'],
    ['sidebarButtonTrade', 'trade', 'nav > ul > li:has(> a[href*="/trades"])'],
    ['sidebarButtonCommunities', 'communities', 'nav > ul > li:has(> a[href*="/communities"])'],
    ['sidebarButtonNewsroom', 'newsroom', 'nav > ul > li:has(> a[href^="https://blog.roblox.com"])'],
    ['sidebarButtonOfficialStore', 'official-store', 'nav > ul > li:has(> button)'],
    ['sidebarButtonGiftCards', 'gift-cards', 'nav > ul > li:has(> a[href*="/giftcards-us"])'],
    ['sidebarButtonPlusPromo', 'plus-promo', 'nav > ul > li:has(> a.gap-y-medium[href$="/plus"])']
  ];
  const NAV_BUTTON_STORAGE_KEYS = BUTTON_SETTINGS.map(([key]) => key);
  const STYLES = `html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav{width:64px!important;min-width:64px!important;max-width:64px!important;box-sizing:border-box!important;border-right:1px solid var(--color-stroke-default,rgba(128,128,128,.42))!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav>div:first-child{width:63px!important;min-width:63px!important;max-width:63px!important;flex:0 0 63px!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav>div:first-child>div:first-child{width:63px!important;min-width:63px!important;max-width:63px!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav>div:first-child>div:first-child>div:first-child{width:63px!important;min-width:63px!important;padding-left:4px!important;padding-right:4px!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav nav,html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav nav>ul{width:100%!important;min-width:0!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav nav>ul>li{width:100%!important;min-width:0!important;display:flex!important;justify-content:center!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav nav>ul>li>a:not([href="/plus"]),html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav nav>ul>li>button{width:48px!important;min-width:48px!important;max-width:48px!important;height:48px!important;min-height:48px!important;margin-left:auto!important;margin-right:auto!important;padding:0!important;gap:0!important;justify-content:center!important;align-items:center!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav>div:first-child{overflow-x:hidden!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav>div:first-child>div:first-child{overflow-x:hidden!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav nav>ul>li>a:not([href="/plus"])>span:nth-of-type(n + 2):not(.fill),html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav nav>ul>li>button>span:nth-of-type(n + 2){width:0!important;min-width:0!important;max-width:0!important;flex:0 0 0!important;overflow:hidden!important;visibility:hidden!important;font-size:0!important;opacity:0!important;pointer-events:none!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav nav>ul>li>a:not([href="/plus"]){position:relative!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] .left-nav nav>ul>li>a:not([href="/plus"])>span.fill{position:absolute!important;right:2px!important;bottom:2px!important;top:auto!important;left:auto!important;width:auto!important;min-width:0!important;padding:0!important;margin:0!important;flex:none!important;pointer-events:none!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"][${MAIN_ATTRIBUTE}="true"][${ROOT_ATTRIBUTE}="collapsed"] #container-main{margin-left:64px!important;width:calc(100% - 64px)!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"] .left-nav #${BUTTON_ID}{position:absolute!important;z-index:1003!important;top:50%!important;right:-11px!important;display:flex!important;width:22px!important;height:44px!important;align-items:center!important;justify-content:center!important;padding:0!important;border:1px solid rgba(128,128,128,.38)!important;border-left:0!important;border-radius:0 8px 8px 0!important;background:var(--color-surface-0,#191b20)!important;color:var(--color-content-default,#d7dce2)!important;box-shadow:2px 1px 5px rgba(0,0,0,.12)!important;cursor:pointer!important;transform:translateY(-50%)!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"] .left-nav #${BUTTON_ID}:hover{background:var(--color-state-hover,rgba(128,128,128,.2))!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"] .left-nav #${BUTTON_ID}:focus-visible{outline:2px solid var(--color-focus,#6ea8fe)!important;outline-offset:2px!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"] .left-nav #${BUTTON_ID} span{display:block!important;width:7px!important;height:7px!important;border-top:2px solid currentColor!important;border-right:2px solid currentColor!important;transform:rotate(45deg)!important}html[${ENABLED_ATTRIBUTE}="true"][${DESKTOP_ATTRIBUTE}="true"] .left-nav #${BUTTON_ID}[data-collapsed="false"] span{transform:rotate(-135deg)!important}`;

  let enabled = false;
  let collapsed = false;
  let sidebarButtonsEnabled = true;
  let buttonSettings = { ...STORAGE_DEFAULTS };
  let toggleButton = null;
  let observer = null;
  let buttonObserver = null;
  let observedButtonList = null;
  let activeNav = null;
  let updateQueued = false;
  let started = false;
  const removedButtons = new Map();
  const savedImageSources = new WeakMap();

  function persistCollapsedState(value) {
    try {
      const pending = chrome.storage.local.set(
        { sidebarCollapsed: value },
        () => {
          void chrome.runtime?.lastError;
          try { chrome.runtime.sendMessage({ type: 'ROIMPR_SYNC_CONTENT_SCRIPTS' }).catch(() => {}); } catch {}
        }
      );
      if (pending && typeof pending.catch === 'function') {
        pending.catch(() => {});
      }
    } catch {}
  }

  function installStyles() {
    const root = document.documentElement;
    if (!root) return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    (document.head || root).appendChild(style);
  }

  function updateNavigationLabels() {
    const nav = document.querySelector(NAV_SELECTOR);
    if (!nav) return;

    for (const item of nav.querySelectorAll('a,button')) {
      if (item.id === BUTTON_ID || item.matches('a.gap-y-medium')) continue;
      const label = String(item.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label) continue;
      if (!item.hasAttribute('aria-label')) item.setAttribute('aria-label', label);
      if (enabled && collapsed && !item.hasAttribute('title')) {
        item.setAttribute('title', label);
        item.dataset.roimprTooltip = 'true';
      } else if ((!enabled || !collapsed) && item.dataset.roimprTooltip === 'true') {
        item.removeAttribute('title');
        delete item.dataset.roimprTooltip;
      }
    }
  }

  function updateToggle() {
    if (toggleButton) {
      toggleButton.dataset.collapsed = String(collapsed);
      toggleButton.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      toggleButton.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    }
    updateNavigationLabels();
  }

  function setCollapsed(value, persist = false) {
    collapsed = value === true;
    if (enabled) {
      document.documentElement?.setAttribute(ROOT_ATTRIBUTE, collapsed ? 'collapsed' : 'expanded');
      updateToggle();
    } else {
      document.documentElement?.removeAttribute(ROOT_ATTRIBUTE);
      updateNavigationLabels();
    }
    syncSidebarButtonItems();
    if (persist) persistCollapsedState(collapsed);
  }

  function itemKeyForNode(item) {
    for (const [key, , selector] of BUTTON_SETTINGS) {
      if (item.matches(selector)) return key;
    }
    return null;
  }

  function findSidebarItem(nav, key) {
    if (!nav) return null;
    const entry = BUTTON_SETTINGS.find(([entryKey]) => entryKey === key);
    if (!entry) return null;
    for (const item of nav.querySelectorAll('nav > ul > li')) {
      if (item.matches(entry[2])) return item;
    }
    return null;
  }

  function stripProfileImages(item) {
    for (const image of item.querySelectorAll('img,source')) {
      const saved = {};
      for (const attribute of ['src', 'srcset', 'sizes']) {
        if (image.hasAttribute(attribute)) {
          saved[attribute] = image.getAttribute(attribute);
          image.removeAttribute(attribute);
        }
      }
      if (Object.keys(saved).length) savedImageSources.set(image, saved);
    }
  }

  function restoreProfileImages(item) {
    for (const image of item.querySelectorAll('img,source')) {
      const saved = savedImageSources.get(image);
      if (!saved) continue;
      for (const attribute of ['src', 'srcset', 'sizes']) {
        if (saved[attribute] !== undefined && !image.hasAttribute(attribute)) {
          image.setAttribute(attribute, saved[attribute]);
        }
      }
      savedImageSources.delete(image);
    }
  }

  function removeSidebarItem(key, item) {
    if (!item?.isConnected) return;
    const previousEntry = removedButtons.get(key);
    if (previousEntry?.node === item) return;
    const parent = item.parentElement;
    if (!parent) return;
    if (key === 'sidebarButtonProfileCard') stripProfileImages(item);
    removedButtons.set(key, {
      nav: activeNav,
      parent,
      node: item,
      next: item.nextElementSibling,
      previous: item.previousElementSibling,
      index: Array.prototype.indexOf.call(parent.children, item)
    });
    item.remove();
  }

  function restoreSidebarItem(key) {
    const saved = removedButtons.get(key);
    if (!saved) return;
    const nav = document.querySelector(NAV_SELECTOR);
    if (!nav || saved.nav !== nav || !saved.parent.isConnected || !nav.contains(saved.parent)) {
      removedButtons.delete(key);
      return;
    }

    const current = findSidebarItem(nav, key);
    if (current && current !== saved.node) {
      removedButtons.delete(key);
      return;
    }

    const { parent, node, next, previous, index } = saved;
    if (next?.parentElement === parent) {
      parent.insertBefore(node, next);
    } else if (previous?.parentElement === parent) {
      parent.insertBefore(node, previous.nextSibling);
    } else {
      parent.insertBefore(node, parent.children[Math.min(index, parent.children.length)] || null);
    }
    removedButtons.delete(key);
    if (key === 'sidebarButtonProfileCard') restoreProfileImages(node);
  }

  function shouldRemoveSidebarItem(key) {
    if (key === 'sidebarButtonPlusPromo' && enabled && collapsed) return true;
    return sidebarButtonsEnabled && buttonSettings[key] === false;
  }

  function processSidebarItem(item) {
    if (!(item instanceof Element) || !item.matches('li')) return;
    const key = itemKeyForNode(item);
    if (key && shouldRemoveSidebarItem(key)) removeSidebarItem(key, item);
  }

  function syncSidebarButtonItems() {
    const nav = document.querySelector(NAV_SELECTOR);
    if (!nav) {
      removedButtons.clear();
      return;
    }
    for (const [key] of BUTTON_SETTINGS) {
      if (shouldRemoveSidebarItem(key)) {
        const item = findSidebarItem(nav, key);
        if (item) removeSidebarItem(key, item);
      } else {
        restoreSidebarItem(key);
      }
    }
  }

  function attachSidebarButtonObserver(nav) {
    const nextNav = nav || null;
    const list = nextNav?.querySelector('nav > ul') || null;
    const changed = nextNav !== activeNav || list !== observedButtonList;
    if (changed) {
      buttonObserver?.disconnect();
      buttonObserver = null;
      removedButtons.clear();
      activeNav = nextNav;
      observedButtonList = list;
    }
    if (!list) return;
    const needsScan = changed || !buttonObserver;
    if (!buttonObserver) {
      buttonObserver = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.matches('li')) processSidebarItem(node);
            else for (const item of node.querySelectorAll('li')) processSidebarItem(item);
          }
        }
      });
      buttonObserver.observe(list, { childList: true });
    }
    if (needsScan) {
      for (const item of Array.from(list.children)) processSidebarItem(item);
    }
  }

  function applySidebarButtonSettings(settings) {
    sidebarButtonsEnabled = settings.sidebarButtonsEnabled !== false;
    buttonSettings = { ...buttonSettings, ...settings };
    attachSidebarButtonObserver(document.querySelector(NAV_SELECTOR));
    syncSidebarButtonItems();
  }

  function setEnabled(value) {
    enabled = value === true;
    const root = document.documentElement;
    if (!root) return;

    if (enabled) {
      root.setAttribute(ENABLED_ATTRIBUTE, 'true');
      root.setAttribute(ROOT_ATTRIBUTE, collapsed ? 'collapsed' : 'expanded');
      updateToggle();
      syncSidebarButtonItems();
      scheduleLayoutUpdate();
      return;
    }

    root.setAttribute(ENABLED_ATTRIBUTE, 'false');
    root.removeAttribute(DESKTOP_ATTRIBUTE);
    root.removeAttribute(MAIN_ATTRIBUTE);
    root.removeAttribute(ROOT_ATTRIBUTE);
    const button = document.getElementById(BUTTON_ID);
    button?.remove();
    toggleButton = null;
    updateNavigationLabels();
    syncSidebarButtonItems();
  }

  function attachToggle() {
    if (!enabled) return false;
    const nav = document.querySelector(NAV_SELECTOR);
    if (!nav) {
      toggleButton = null;
      return false;
    }

    const existing = nav.querySelector(`#${BUTTON_ID}`);
    if (existing) {
      toggleButton = existing;
      updateToggle();
      return true;
    }

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    button.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    button.innerHTML = '<span aria-hidden="true"></span>';
    button.addEventListener('click', () => setCollapsed(!collapsed, true));
    nav.appendChild(button);
    toggleButton = button;
    updateToggle();
    return true;
  }

  function updateDesktopMode() {
    const root = document.documentElement;
    if (!root) return false;
    if (!enabled) {
      root.removeAttribute(DESKTOP_ATTRIBUTE);
      root.removeAttribute(MAIN_ATTRIBUTE);
      return false;
    }

    const nav = document.querySelector(NAV_SELECTOR);
    if (!nav) {
      root.removeAttribute(DESKTOP_ATTRIBUTE);
      root.removeAttribute(MAIN_ATTRIBUTE);
      toggleButton = null;
      return false;
    }

    const navStyle = getComputedStyle(nav);
    const navRect = nav.getBoundingClientRect();
    const largeViewport = window.innerWidth >= 1024;
    const desktopVisible = largeViewport && navStyle.visibility === 'visible' &&
      navStyle.display !== 'none' && navRect.width > 0;
    root.setAttribute(DESKTOP_ATTRIBUTE, String(desktopVisible));

    const main = document.querySelector(MAIN_SELECTOR);
    const mainOffset = main ? Number.parseFloat(getComputedStyle(main).marginLeft) || 0 : 0;
    root.setAttribute(MAIN_ATTRIBUTE, String(desktopVisible && mainOffset > 0));

    if (desktopVisible) attachToggle();
    else updateNavigationLabels();
    return true;
  }

  function scheduleLayoutUpdate() {
    if (updateQueued) return;
    updateQueued = true;
    const run = () => {
      updateQueued = false;
      const nav = document.querySelector(NAV_SELECTOR);
      attachSidebarButtonObserver(nav);
      attachToggle();
      updateDesktopMode();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function nodeContainsLayoutElement(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    return node.matches(LAYOUT_SELECTOR) || Boolean(node.querySelector(LAYOUT_SELECTOR));
  }

  function startObserver() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          if (record.target === document.documentElement || record.target === document.body || record.target.matches?.(LAYOUT_SELECTOR)) {
            scheduleLayoutUpdate();
            return;
          }
        } else {
          for (const node of [...record.addedNodes, ...record.removedNodes]) {
            if (nodeContainsLayoutElement(node)) {
              const nav = node.matches?.(NAV_SELECTOR) ? node : node.querySelector?.(NAV_SELECTOR);
              if (nav) attachSidebarButtonObserver(nav);
              scheduleLayoutUpdate();
              return;
            }
          }
          if (record.target.nodeType === Node.ELEMENT_NODE && record.target.closest?.(NAV_SELECTOR)) {
            attachSidebarButtonObserver(document.querySelector(NAV_SELECTOR));
          }
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  function finishInitialization(settings) {
    applySidebarButtonSettings(settings);
    collapsed = settings.sidebarCollapsed !== false;
    setEnabled(settings.sidebarEnabled !== false);
    setCollapsed(collapsed);
    scheduleLayoutUpdate();
  }

  function start() {
    if (started) return;
    started = true;
    installStyles();
    startObserver();

    chrome.storage.local.get(STORAGE_DEFAULTS)
      .then(finishInitialization)
      .catch(() => finishInitialization(STORAGE_DEFAULTS));

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (Object.hasOwn(changes, 'sidebarCollapsed')) {
        setCollapsed(changes.sidebarCollapsed.newValue !== false);
      }
      if (Object.hasOwn(changes, 'sidebarEnabled')) {
        setEnabled(changes.sidebarEnabled.newValue !== false);
      }
      if (Object.hasOwn(changes, 'sidebarButtonsEnabled') || NAV_BUTTON_STORAGE_KEYS.some((key) => Object.hasOwn(changes, key))) {
        chrome.storage.local.get(STORAGE_DEFAULTS).then(applySidebarButtonSettings).catch(() => {});
      }
    });

    window.addEventListener('resize', scheduleLayoutUpdate, { passive: true });
    window.addEventListener('popstate', scheduleLayoutUpdate);
    window.addEventListener('hashchange', scheduleLayoutUpdate);
    window.addEventListener('pageshow', scheduleLayoutUpdate);
    window.addEventListener('DOMContentLoaded', scheduleLayoutUpdate, { once: true });
    window.addEventListener('load', scheduleLayoutUpdate, { once: true });
  }

  if (document.documentElement) start();
  else {
    const earlyObserver = new MutationObserver(() => {
      if (!document.documentElement) return;
      earlyObserver.disconnect();
      start();
    });
    earlyObserver.observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => {
      earlyObserver.disconnect();
      start();
    }, { once: true });
  }
})();
