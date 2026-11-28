'use strict';

(() => {
  const GUARD = '__RoImprUserSearch';
  const STYLE_ID = 'RoImpr-user-search-style';
  const CARD_ID = 'RoImpr-user-search-result';
  const REQUEST_TYPE = 'ROIMPR_USER_LOOKUP';
  const STATUS_REQUEST_TYPE = 'ROIMPR_USER_STATUS';
  const NAV_STYLE_ID = 'RoImpr-user-nav-style';
  const NAV_RESULT_ID = 'RoImpr-user-nav-result';
  const FRIEND_BANNED_MARK = 'data-roimpr-banned-user-id';
  const FRIEND_CHECK_MARK = 'data-roimpr-user-checked-id';

  if (window[GUARD]) return;
  Object.defineProperty(window, GUARD, { value: true });

  let activeKey = '';
  let requestToken = 0;
  let rootObserver = null;
  let rootObserverTimer = 0;
  let featureEnabled = false;
  const banStatusCache = new Map();
  const banStatusRequests = new Map();
  const userThumbnailCache = new Map();
  let friendsObserver = null;
  let friendsObservedRoot = null;
  let friendsScanTimer = 0;
  const friendCardRequests = new Map();
  let lazyBannedFriendThumbnailObserver = null;
  const ICON_HEAD_CROPS = Object.freeze({
    AvatarHeadshot: Object.freeze({}),
    AvatarBust: Object.freeze({}),
    Avatar: Object.freeze({})
  });

  function isTrustedImage(value) {
    return typeof value === 'string' && /^https:\/\/(?:[a-z0-9-]+\.)*(?:rbxcdn\.com|roblox\.com|robloxusercontent\.com)\//i.test(value);
  }

  function normalizedPath() {
    return location.pathname
      .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//i, '/')
      .replace(/\/+$/, '') || '/';
  }

  function currentSearch() {
    if (normalizedPath() !== '/search/users') return null;

    const params = new URLSearchParams(location.search);
    const raw = (params.get('keyword') || '').trim();
    const username = raw.replace(/^@/, '').trim();
    if (!/^[a-z0-9_]{3,20}$/i.test(username)) return null;

    return { username, key: `${location.pathname}?${username.toLowerCase()}` };
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `#${CARD_ID}{margin:16px 0 20px;width:100%;color:var(--color-content-standard,#f7f7f8)}#${CARD_ID} .RoImpr-user-link{display:flex;align-items:center;gap:12px;min-height:68px;padding:12px 14px;border:1px solid var(--color-divider,#3b3d43);border-radius:var(--radius-medium,8px);background:var(--color-surface-100,#25272d);color:inherit;text-decoration:none;transition:background-color .15s ease,border-color .15s ease}#${CARD_ID} .RoImpr-user-link:hover{background:var(--color-state-hover,rgba(255,255,255,.07));border-color:var(--color-divider-strong,#555861)}#${CARD_ID} .RoImpr-user-avatar{display:flex;flex:0 0 48px;align-items:center;justify-content:center;width:48px;height:48px;overflow:hidden;border-radius:50%;background:var(--color-surface-300,#3a3c43);color:var(--color-content-muted,#c4c5ca);font-size:19px;font-weight:700}#${CARD_ID} .RoImpr-user-avatar img{display:block;width:100%;height:100%;object-fit:cover}#${CARD_ID} .RoImpr-user-avatar[data-failed="true"]:after{content:attr(data-initial);font-size:17px;font-weight:700}#${CARD_ID} .RoImpr-user-copy{display:flex;min-width:0;flex:1;align-items:center}#${CARD_ID} .RoImpr-user-identity{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}#${CARD_ID} .RoImpr-user-display-name{overflow:hidden;color:var(--color-content-standard,#f7f7f8);font-size:15px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}#${CARD_ID} .RoImpr-user-username{overflow:hidden;color:var(--color-content-muted,#b8b8bd);font-size:13px;text-overflow:ellipsis;white-space:nowrap}#${CARD_ID} .RoImpr-user-banned{color:#ff6b6b;font-size:12px;font-weight:700;line-height:16px;text-transform:lowercase}#${CARD_ID} .RoImpr-user-banned[hidden]{display:none}li[${FRIEND_BANNED_MARK}] .avatar-card-label[data-roimpr-banned-label="true"]{color:#ff8585;font-weight:700}li[${FRIEND_BANNED_MARK}] .avatar-card-caption[data-roimpr-banned-caption]::after{content:attr(data-roimpr-banned-caption);display:block;color:#ff8585;font-size:12px;font-weight:700}li[${FRIEND_BANNED_MARK}] [data-roimpr-banned-friend-link]{cursor:pointer}@media(prefers-reduced-motion:reduce){#${CARD_ID} .RoImpr-user-link{transition:none}}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function getProfileUrl(user, requestedUsername) {
    if (user.isBanned === true) {
      const url = new URL(chrome.runtime.getURL('deleted-user-profile.html'));
      url.searchParams.set('id', String(user.id));
      url.searchParams.set('username', user.name || requestedUsername || 'Deleted User');
      if (user.displayName) url.searchParams.set('displayName', String(user.displayName).slice(0, 80));
      return url.href;
    }
    return `https://www.roblox.com/users/${encodeURIComponent(user.id)}/profile`;
  }

  async function requestBanStatus(userId) {
    const id = String(userId || '');
    if (!/^\d{1,20}$/.test(id)) return null;
    if (banStatusCache.has(id)) return banStatusCache.get(id);
    if (banStatusRequests.has(id)) return banStatusRequests.get(id);

    const request = chrome.runtime.sendMessage({ type: STATUS_REQUEST_TYPE, userId: id })
      .then((result) => {
        if (!result?.ok || result.userId !== id || typeof result.isBanned !== 'boolean') return null;
        const details = {
          isBanned: result.isBanned,
          name: typeof result.name === 'string' ? result.name : '',
          displayName: typeof result.displayName === 'string' ? result.displayName : '',
          description: typeof result.description === 'string' ? result.description : '',
          created: typeof result.created === 'string' ? result.created : '',
          hasVerifiedBadge: result.hasVerifiedBadge === true
        };
        banStatusCache.set(id, details);
        if (banStatusCache.size > 500) banStatusCache.delete(banStatusCache.keys().next().value);
        return details;
      })
      .catch(() => null)
      .finally(() => banStatusRequests.delete(id));
    banStatusRequests.set(id, request);
    return request;
  }

  function applySearchBanStatus(userId, isBanned) {
    const card = document.getElementById(CARD_ID);
    if (!card || card.dataset.userId !== String(userId)) return;
    const link = card.querySelector('.RoImpr-user-link');
    const badge = card.querySelector('.RoImpr-user-banned');
    if (!link) return;
    const username = link.dataset.username || '';
    const displayName = card.querySelector('.RoImpr-user-display-name')?.textContent || '';
    link.href = getProfileUrl({ id: userId, name: username, displayName, isBanned }, username);
    if (badge) {
      badge.textContent = 'banned';
      badge.hidden = !isBanned;
    }
  }

  function createResult(user, requestedUsername) {
    const section = document.createElement('section');
    section.id = CARD_ID;
    section.setAttribute('aria-label', 'User search result');
    section.dataset.userId = String(user.id);

    const link = document.createElement('a');
    link.className = 'RoImpr-user-link';
    link.href = getProfileUrl(user, requestedUsername);
    link.dataset.username = user.name || requestedUsername;
    link.title = 'Open user profile';

    const avatar = document.createElement('span');
    avatar.className = 'RoImpr-user-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.dataset.initial = (user.displayName || user.name || requestedUsername || '?').slice(0, 1).toUpperCase();
    avatar.dataset.failed = 'true';
    const avatarImage = document.createElement('img');
    avatarImage.alt = '';
    avatarImage.loading = 'eager';
    avatarImage.decoding = 'async';
    avatarImage.fetchPriority = 'high';
    avatarImage.referrerPolicy = 'strict-origin-when-cross-origin';
    avatarImage.onload = () => { avatar.dataset.failed = 'false'; };
    const cachedInitialThumbnail = userThumbnailCache.get(String(user.id));
    const initialThumbnail = user.thumbnailUrl || cachedInitialThumbnail?.imageUrl || '';
    const initialSource = cachedInitialThumbnail?.imageUrl === initialThumbnail
      ? cachedInitialThumbnail.source
      : (user.thumbnailSource || 'public-thumbnail');
    const initialType = cachedInitialThumbnail?.imageUrl === initialThumbnail
      ? cachedInitialThumbnail.iconType
      : (user.thumbnailType || 'AvatarHeadshot');
    applyIconHeadCrop(avatarImage, initialType, initialSource);
    avatarImage.dataset.fallbackAttempts = '0';
    avatarImage.onerror = async () => {
      const failedUrl = avatarImage.currentSrc || avatarImage.src || '';
      avatarImage.removeAttribute('src');
      avatarImage.alt = '';
      avatar.dataset.failed = 'true';
      const attempts = Number(avatarImage.dataset.fallbackAttempts || 0);
      if (attempts >= 2) return;
      avatarImage.dataset.fallbackAttempts = String(attempts + 1);
      const fallback = await requestUserThumbnail(user.id, true, failedUrl ? [failedUrl] : []);
      if (!fallback || !avatarImage.isConnected) return;
      avatar.dataset.failed = 'true';
      applyIconHeadCrop(avatarImage, fallback.iconType, fallback.source);
      avatarImage.src = fallback.imageUrl;
    };
    if (isTrustedImage(initialThumbnail)) {
      avatarImage.src = initialThumbnail;
    }
    avatar.appendChild(avatarImage);

    const copy = document.createElement('span');
    copy.className = 'RoImpr-user-copy';
    const identity = document.createElement('span');
    identity.className = 'RoImpr-user-identity';
    const displayName = document.createElement('span');
    displayName.className = 'RoImpr-user-display-name';
    displayName.textContent = user.displayName || user.name || requestedUsername;
    const username = document.createElement('span');
    username.className = 'RoImpr-user-username';
    username.textContent = `@${user.name || requestedUsername}`;
    const banned = document.createElement('span');
    banned.className = 'RoImpr-user-banned';
    banned.textContent = 'banned';
    banned.hidden = user.isBanned !== true;
    identity.append(displayName, username, banned);
    copy.append(identity);
    link.append(avatar, copy);
    section.append(link);
    return section;
  }

  function findMount() {
    return document.querySelector('#container-main .content') ||
      document.querySelector('#container-main') ||
      document.querySelector('main[role="main"]') ||
      document.querySelector('main') || null;
  }

  function stopRootObserver() {
    rootObserver?.disconnect();
    rootObserver = null;
    if (rootObserverTimer) {
      window.clearTimeout(rootObserverTimer);
      rootObserverTimer = 0;
    }
  }

  function insertResult(user, requestedUsername, token) {
    const insert = () => {
      if (!featureEnabled || token !== requestToken || !currentSearch()) return true;
      const existing = document.getElementById(CARD_ID);
      if (existing?.dataset.userId === String(user.id)) return true;
      existing?.remove();

      const mount = findMount();
      if (!mount) return false;

      mount.prepend(createResult(user, requestedUsername));
      return true;
    };

    if (insert()) return;
    if (!document.documentElement) return;

    stopRootObserver();
    rootObserver = new MutationObserver(() => {
      if (insert()) stopRootObserver();
    });
    rootObserver.observe(document.documentElement, { childList: true, subtree: true });
    rootObserverTimer = window.setTimeout(stopRootObserver, 15000);
  }

  function applyIconHeadCrop(image, type = 'AvatarHeadshot', source = '') {
    if (!image) return;
    if (source === 'open-cloud') {
      image.style.objectFit = 'contain';
      image.style.objectPosition = 'center';
      image.style.transform = 'none';
      image.style.transformOrigin = 'center';
      return;
    }
    const frame = ICON_HEAD_CROPS[type] || ICON_HEAD_CROPS.AvatarHeadshot;
    image.style.objectFit = 'cover';
    image.style.objectPosition = frame.position;
    image.style.transform = `scale(${frame.scale})`;
    image.style.transformOrigin = frame.position;
  }

  async function requestUserThumbnail(userId, preferGenerated = false, excludeUrls = []) {
    const id = String(userId || '');
    if (!/^\d{1,20}$/.test(id)) return null;
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'ROIMPR_USER_THUMBNAIL',
        userId: id,
        ...(preferGenerated ? { preferGenerated: true, forceGenerated: true } : {}),
        ...(excludeUrls.length ? { excludeUrls: excludeUrls.slice(0, 8) } : {})
      });
      const headshotUrl = isTrustedImage(result?.headshotUrl) ? result.headshotUrl : '';
      const fullAvatarUrl = isTrustedImage(result?.fullAvatarUrl) ? result.fullAvatarUrl : '';
      const iconUrl = [result?.iconUrl, headshotUrl, result?.imageUrl, fullAvatarUrl].find(isTrustedImage) || '';
      if (!result?.ok || !iconUrl) {
        if (preferGenerated && result?.message) console.warn('[RoImproved] Generated thumbnail unavailable:', result.message);
        return null;
      }
      return {
        imageUrl: iconUrl,
        source: result.headshotSource && result.headshotSource !== 'none' ? result.headshotSource : (result.source || 'public-thumbnail'),
        iconType: ['AvatarHeadshot', 'AvatarBust', 'Avatar'].includes(result.iconType) ? result.iconType : (headshotUrl ? (result.headshotType || 'AvatarHeadshot') : 'Avatar')
      };
    } catch {
      return null;
    }
  }

  function cacheUserThumbnail(userId, imageUrl, source, iconType) {
    const idValue = String(userId);
    const current = userThumbnailCache.get(idValue);
    const priority = (value) => value === 'generated' || value === 'open-cloud' || value === 'avatar-render' ? 2 : (value ? 1 : 0);
    if (current && priority(current.source) > priority(source)) return current;
    const entry = { imageUrl, source, iconType };
    userThumbnailCache.set(idValue, entry);
    if (userThumbnailCache.size > 100) {
      userThumbnailCache.delete(userThumbnailCache.keys().next().value);
    }
    return entry;
  }

  function applyUserThumbnail(userId, imageUrl, token, nav = false, source = 'public-thumbnail', iconType = 'AvatarHeadshot') {
    if (!imageUrl) return;
    const idValue = String(userId);
    const cached = cacheUserThumbnail(idValue, imageUrl, source, iconType);
    imageUrl = cached.imageUrl;
    iconType = cached.iconType || iconType;
    if (nav) {
      if (token !== navToken || lastNavResult?.user?.id !== idValue) return;
      lastNavResult.user.thumbnailUrl = imageUrl;
      lastNavResult.user.thumbnailSource = cached.source;
      lastNavResult.user.thumbnailType = cached.iconType;
      const item = document.getElementById(NAV_RESULT_ID);
      const image = item?.querySelector('img');
      if (image && item.dataset.userId === idValue) { applyIconHeadCrop(image, iconType, cached.source); if (image.getAttribute('src') !== imageUrl) image.src = imageUrl; }
      return;
    }
    if (token !== requestToken) return;
    const card = document.getElementById(CARD_ID);
    const image = card?.querySelector('.RoImpr-user-avatar img');
    if (card?.dataset.userId === idValue && image) {
      applyIconHeadCrop(image, iconType, cached.source);
      if (image.getAttribute('src') !== imageUrl) image.src = imageUrl;
    }
  }

  async function lookupUser(username, token) {
    if (!featureEnabled) return;
    try {
      const result = await chrome.runtime.sendMessage({ type: REQUEST_TYPE, username });
      if (token !== requestToken || !result?.ok || result.found !== true || !result.user) return;
      const user = result.user;
      insertResult(user, username, token);

      requestUserThumbnail(user.id).then((thumbnail) => { if (thumbnail) applyUserThumbnail(user.id, thumbnail.imageUrl, token, false, thumbnail.source, thumbnail.iconType); });

      const banDetails = await requestBanStatus(user.id);
      if (token !== requestToken || !banDetails) return;
      user.isBanned = banDetails.isBanned;
      user.displayName = banDetails.displayName || user.displayName;
      user.banStatusKnown = true;
      applySearchBanStatus(user.id, banDetails.isBanned);
      if (banDetails.isBanned) {
        requestUserThumbnail(user.id, true).then((thumbnail) => {
          if (thumbnail) applyUserThumbnail(user.id, thumbnail.imageUrl, token, false, thumbnail.source, thumbnail.iconType);
        });
      }
    } catch {
    }
  }

  let navInput = null;
  let navDropdown = null;
  let navTimer = 0;
  let navToken = 0;
  let navObserver = null;
  let navInputController = null;
  let lastNavResult = null;

  function installNavStyles() {
    if (document.getElementById(NAV_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = NAV_STYLE_ID;
    style.textContent = `#${NAV_RESULT_ID}{list-style:none;margin:0;padding:0;border-top:1px solid var(--color-divider,#3b3d43)}#${NAV_RESULT_ID} .RoImpr-nav-user-link{display:flex;align-items:center;gap:10px;padding:9px 12px;min-height:58px;color:inherit;text-decoration:none;white-space:normal}#${NAV_RESULT_ID} .RoImpr-nav-user-link:hover,#${NAV_RESULT_ID} .RoImpr-nav-user-link:focus{background:var(--color-state-hover,rgba(255,255,255,.08));outline:none}#${NAV_RESULT_ID} .RoImpr-nav-user-avatar{position:relative;display:flex;flex:0 0 40px;align-items:center;justify-content:center;width:40px;height:40px;overflow:hidden;border-radius:50%;background:var(--color-surface-300,#393b42);color:var(--color-content-muted,#c4c5ca);font-size:16px;font-weight:700}#${NAV_RESULT_ID} .RoImpr-nav-user-avatar[data-failed=true]::after{content:attr(data-initial)}#${NAV_RESULT_ID} .RoImpr-nav-user-avatar img{position:absolute;inset:0;display:block;width:100%;height:100%;border-radius:inherit;object-fit:cover}#${NAV_RESULT_ID} .RoImpr-nav-user-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:2px}#${NAV_RESULT_ID} .RoImpr-nav-user-identity{display:flex;align-items:baseline;gap:7px;min-width:0;flex-wrap:wrap}#${NAV_RESULT_ID} .RoImpr-nav-user-title{overflow:hidden;font-size:13px;font-weight:600;line-height:18px;text-overflow:ellipsis;white-space:nowrap}#${NAV_RESULT_ID} .RoImpr-nav-user-username{overflow:hidden;color:var(--color-content-muted,#aaa);font-size:12px;line-height:16px;text-overflow:ellipsis;white-space:nowrap}#${NAV_RESULT_ID} .RoImpr-nav-user-id{color:var(--color-content-muted,#aaa);font-size:11px;line-height:15px}#${NAV_RESULT_ID} .RoImpr-nav-user-banned{display:inline-flex;align-items:center;color:#ff6b6b;font-size:11px;font-weight:700;line-height:15px;text-transform:lowercase}#${NAV_RESULT_ID} .RoImpr-nav-user-banned[hidden]{display:none}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function clearNavResult(clearPending = true) {
    document.getElementById(NAV_RESULT_ID)?.remove();
    if (clearPending) lastNavResult = null;
  }

  function showNavResult(user, username) {
    if (!navDropdown || !navDropdown.isConnected) {
      const latest = findNavSearch();
      if (latest?.dropdown) navDropdown = latest.dropdown;
    }
    if (!navDropdown || !navDropdown.isConnected) return;

    let item = document.getElementById(NAV_RESULT_ID);
    if (item && item.parentElement !== navDropdown) {
      item.remove();
      item = null;
    }

    if (!item) {
      item = document.createElement(/^(UL|OL)$/i.test(navDropdown.tagName) ? 'li' : 'div');
      item.id = NAV_RESULT_ID;
      item.setAttribute('role', 'presentation');

      const link = document.createElement('a');
      link.className = 'RoImpr-nav-user-link';
      link.setAttribute('role', 'menuitem');
      link.title = 'Open user profile';

      const avatarWrap = document.createElement('span');
      avatarWrap.className = 'RoImpr-nav-user-avatar';
      avatarWrap.dataset.failed = 'true';
      const avatar = document.createElement('img');
      avatar.alt = '';
      avatar.loading = 'eager';
      avatar.decoding = 'async';
      avatar.fetchPriority = 'high';
      avatar.referrerPolicy = 'strict-origin-when-cross-origin';
      applyIconHeadCrop(avatar, 'AvatarHeadshot');
      avatar.dataset.fallbackAttempts = '0';
      avatar.onload = () => { avatarWrap.dataset.failed = 'false'; };
      avatar.onerror = async () => {
        const failedUrl = avatar.currentSrc || avatar.src || '';
        avatar.removeAttribute('src');
        avatarWrap.dataset.failed = 'true';
        const attempts = Number(avatar.dataset.fallbackAttempts || 0);
        if (attempts >= 2) return;
        avatar.dataset.fallbackAttempts = String(attempts + 1);
        const userId = item?.dataset.userId || '';
        const fallback = await requestUserThumbnail(userId, true, failedUrl ? [failedUrl] : []);
        if (fallback && avatar.isConnected && item?.dataset.userId === userId) {
          applyIconHeadCrop(avatar, fallback.iconType, fallback.source);
          avatar.src = fallback.imageUrl;
        }
      };
      avatarWrap.appendChild(avatar);

      const copy = document.createElement('span');
      copy.className = 'RoImpr-nav-user-copy';
      const identity = document.createElement('span');
      identity.className = 'RoImpr-nav-user-identity';
      const title = document.createElement('span');
      title.className = 'RoImpr-nav-user-title';
      const usernameText = document.createElement('span');
      usernameText.className = 'RoImpr-nav-user-username';
      const banned = document.createElement('span');
      banned.className = 'RoImpr-nav-user-banned';
      banned.textContent = 'banned';
      const id = document.createElement('span');
      id.className = 'RoImpr-nav-user-id';

      identity.append(title, usernameText, banned);
      copy.append(identity, id);
      link.append(avatarWrap, copy);
      item.appendChild(link);
    }

    const idValue = String(user.id);
    if (!user.thumbnailUrl) user.thumbnailUrl = userThumbnailCache.get(idValue)?.imageUrl || '';
    const accountName = user.name || username;
    const displayName = user.displayName || accountName;
    const link = item.querySelector('.RoImpr-nav-user-link');
    const avatarWrap = item.querySelector('.RoImpr-nav-user-avatar');
    const avatar = avatarWrap?.querySelector('img');
    const title = item.querySelector('.RoImpr-nav-user-title');
    const usernameText = item.querySelector('.RoImpr-nav-user-username');
    const banned = item.querySelector('.RoImpr-nav-user-banned');
    const id = item.querySelector('.RoImpr-nav-user-id');
    const profileUrl = getProfileUrl(user, username);
    if (avatarWrap) {
      avatarWrap.dataset.initial = (displayName || accountName || '?').slice(0, 1).toUpperCase();
      if (!avatar?.getAttribute('src')) avatarWrap.dataset.failed = 'true';
    }
    const avatarUrl = typeof user.thumbnailUrl === 'string' &&
      /^https:\/\/(?:tr\.rbxcdn\.com|thumbnails\.roblox\.com)\//i.test(user.thumbnailUrl)
      ? user.thumbnailUrl
      : '';

    item.dataset.userId = idValue;
    if (link.getAttribute('href') !== profileUrl) link.href = profileUrl;
    if (link.dataset.username !== accountName) link.dataset.username = accountName;
    if (title.textContent !== displayName) title.textContent = displayName;
    const shownUsername = `@${accountName}`;
    if (usernameText.textContent !== shownUsername) usernameText.textContent = shownUsername;
    if (id.textContent !== `ID ${idValue}`) id.textContent = `ID ${idValue}`;
    if (banned.hidden !== (user.isBanned !== true)) banned.hidden = user.isBanned !== true;
    if (avatar && avatarUrl) {
      const cachedThumbnail = userThumbnailCache.get(idValue);
      applyIconHeadCrop(avatar, user.thumbnailType || cachedThumbnail?.iconType || 'AvatarHeadshot', user.thumbnailSource || cachedThumbnail?.source || 'public-thumbnail');
      if (avatar.getAttribute('src') !== avatarUrl) avatar.src = avatarUrl;
    }

    if (item.parentElement !== navDropdown || navDropdown.firstElementChild !== item) {
      navDropdown.insertBefore(item, navDropdown.firstElementChild);
    }
  }

  function keepNavResultFirst() {
    const item = document.getElementById(NAV_RESULT_ID);
    if (item && navDropdown && item.parentElement === navDropdown && navDropdown.firstElementChild !== item) {
      navDropdown.insertBefore(item, navDropdown.firstElementChild);
    }
  }

  async function lookupNavUser(rawValue, token) {
    if (!featureEnabled) return;
    const username = String(rawValue || '').trim().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,20}$/i.test(username)) {
      clearNavResult();
      return;
    }
    try {
      const result = await chrome.runtime.sendMessage({ type: REQUEST_TYPE, username });
      if (token !== navToken || !navInput || navInput.value.trim().replace(/^@/, '').toLowerCase() !== username.toLowerCase()) return;
      if (result?.ok && result.found === true && result.user) {
        const user = result.user;
        lastNavResult = { user, username };
        showNavResult(user, username);
        requestUserThumbnail(user.id).then((thumbnail) => { if (thumbnail) applyUserThumbnail(user.id, thumbnail.imageUrl, token, true, thumbnail.source, thumbnail.iconType); });
        const banDetails = await requestBanStatus(user.id);
        if (token !== navToken || !banDetails) return;
        user.isBanned = banDetails.isBanned;
        user.displayName = banDetails.displayName || user.displayName;
        user.name = banDetails.name || user.name;
        user.banStatusKnown = true;
        if (lastNavResult?.user?.id === user.id) {
          lastNavResult.user = user;
          showNavResult(user, username);
        }
        if (banDetails.isBanned) {
          requestUserThumbnail(user.id, true).then((thumbnail) => {
            if (thumbnail) applyUserThumbnail(user.id, thumbnail.imageUrl, token, true, thumbnail.source, thumbnail.iconType);
          });
        }
      } else clearNavResult();
    } catch {
      if (token === navToken) clearNavResult();
    }
  }

  function findNavSearch() {
    const root = document.querySelector('#right-navigation-header') ||
      document.querySelector('#navbar') || document;
    const selectors = [
      '#navbar-search-input',
      '[data-testid="navigation-search-input-field"]',
      '.navbar-search input[type="text"]',
      '[data-testid*="navigation-search"] input'
    ];
    const inputs = [...new Set(selectors.flatMap((selector) => [...root.querySelectorAll(selector)]))];
    let firstInput = null;
    for (const input of inputs) {
      firstInput ||= input;
      let node = input;
      for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
        const dropdown = node.querySelector?.('.dropdown-menu,[role="listbox"],[data-testid*="search-results"]');
        if (dropdown && dropdown !== input && dropdown.contains(input) === false) return { input, dropdown };
      }
    }
    return firstInput ? { input: firstInput, dropdown: null } : null;
  }

  function bindNavSearch() {
    if (!featureEnabled) return false;
    const found = findNavSearch();
    const input = found?.input;
    const dropdown = found?.dropdown;
    if (!input) return false;

    if (navInput === input) {
      if (dropdown && dropdown !== navDropdown) navDropdown = dropdown;
      if (lastNavResult && input.value.trim().replace(/^@/, '').toLowerCase() === lastNavResult.username.toLowerCase()) {
        const current = document.getElementById(NAV_RESULT_ID);
        if (!current || current.dataset.userId !== String(lastNavResult.user.id) || current.parentElement !== navDropdown) {
          showNavResult(lastNavResult.user, lastNavResult.username);
        } else {
          keepNavResultFirst();
        }
      }
      return true;
    }

    navInputController?.abort();
    navToken += 1;
    if (navTimer) window.clearTimeout(navTimer);
    navTimer = 0;
    clearNavResult();
    navInputController = new AbortController();
    navInput = input;
    navDropdown = dropdown;
    installNavStyles();

    const scheduleLookup = (value, delay = 1000) => {
      navToken += 1;
      const token = navToken;
      if (navTimer) window.clearTimeout(navTimer);
      navTimer = 0;
      clearNavResult();
      if (!String(value || '').trim()) return;
      navTimer = window.setTimeout(() => {
        navTimer = 0;
        lookupNavUser(value, token);
      }, delay);
    };

    input.addEventListener('input', () => {
      if (!featureEnabled) return;
      scheduleLookup(input.value, 1000);
    }, { signal: navInputController.signal });

    input.addEventListener('focus', () => {
      if (featureEnabled && input.value.trim()) scheduleLookup(input.value, 1000);
    }, { signal: navInputController.signal });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        navToken += 1;
        if (navTimer) window.clearTimeout(navTimer);
        navTimer = 0;
        clearNavResult();
      }
    }, { signal: navInputController.signal });

    return true;
  }

  let observedNavRoot = null;
  function startNavWatcher() {
    if (!featureEnabled || !document.documentElement) return;
    bindNavSearch();

    const root = document.querySelector('#right-navigation-header') ||
      document.querySelector('#navbar') || document.documentElement;
    if (navObserver && observedNavRoot === root) return;
    navObserver?.disconnect();
    observedNavRoot = root;
    navObserver = new MutationObserver(() => {
      bindNavSearch();
      keepNavResultFirst();
      const latestRoot = document.querySelector('#right-navigation-header') ||
        document.querySelector('#navbar') || document.documentElement;
      if (latestRoot !== observedNavRoot) startNavWatcher();
    });
    navObserver.observe(root, { childList: true, subtree: true });
  }

  function isFriendsRoute() {
    const path = normalizedPath();
    return path === '/users/friends' || /^\/users\/\d+\/friends$/.test(path);
  }

  function isGenericAccountName(value) {
    return /^(?:@?account deleted|@?deleted user|account forgotten|unknown)$/i.test(String(value || '').trim());
  }

  function friendCardIsDeletedPlaceholder(card) {
    if (!card || !/^\d{1,20}$/.test(String(card.id || ''))) return false;
    const labels = [...card.querySelectorAll('.avatar-card-label')].map((node) => node.textContent.trim());
    const usernameLabel = labels.find((value) => value.startsWith('@')) || '';
    const displayName = card.querySelector('.avatar-name')?.textContent?.trim() || '';
    const container = card.querySelector('.avatar-card-container');
    const blockedImage = !!card.querySelector('.avatar-card-image.icon-blocked, .avatar-card-image img[src*="UnapprovedImage"]');
    return isGenericAccountName(usernameLabel) ||
      (container?.classList.contains('disabled') === true && blockedImage) ||
      (isGenericAccountName(displayName) && blockedImage);
  }

  function friendProfileUrl(userId, details, displayNameFallback) {
    const name = details.name && !isGenericAccountName(details.name) ? details.name : 'Deleted User';
    return getProfileUrl({
      id: userId,
      name,
      displayName: details.displayName || displayNameFallback || '',
      isBanned: true
    }, name);
  }

  function ensureFriendCardLink(element, url, kind) {
    if (!element) return null;
    const existing = element.closest('a');
    if (existing) {
      existing.href = url;
      existing.dataset.roimprBannedFriendLink = kind;
      return existing;
    }

    // Keep Roblox's React-owned card tree intact. Replacing/reparenting nodes here
    // can invalidate React's child references and make pagination clear the page.
    element.dataset.roimprBannedFriendHref = url;
    element.dataset.roimprBannedFriendLink = kind;
    element.setAttribute('role', 'link');
    element.setAttribute('tabindex', '0');
    if (element.dataset.roimprLinkHandlerBound !== 'true') {
      element.dataset.roimprLinkHandlerBound = 'true';
      element.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button > 0) return;
        const target = event.target;
        if (target?.closest?.('button, input, select, textarea')) return;
        const destination = element.dataset.roimprBannedFriendHref;
        if (destination) location.assign(destination);
      });
      element.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const destination = element.dataset.roimprBannedFriendHref;
        if (destination) location.assign(destination);
      });
    }
    return element;
  }

  function applyBannedFriendCard(card, details) {
    if (!card?.isConnected || details?.isBanned !== true) return;
    const userId = String(card.id || '');
    if (!/^\d{1,20}$/.test(userId)) return;

    const displayNode = card.querySelector('.avatar-name');
    const labels = [...card.querySelectorAll('.avatar-card-label')];
    const usernameNode = labels.find((node) => node.textContent.trim().startsWith('@')) || labels[0] || null;
    const statusNode = labels.filter((node) => node !== usernameNode).at(-1) || null;
    const visibleDisplayName = displayNode?.textContent?.trim() || '';
    const displayName = details.displayName && !isGenericAccountName(details.displayName)
      ? details.displayName
      : (!isGenericAccountName(visibleDisplayName) ? visibleDisplayName : (details.name || 'Deleted User'));
    const username = details.name && !isGenericAccountName(details.name) ? details.name : 'Deleted User';
    const profileUrl = friendProfileUrl(userId, { ...details, displayName }, displayName);

    card.setAttribute(FRIEND_BANNED_MARK, userId);
    const cardContainer = card.querySelector('.avatar-card-container');
    cardContainer?.classList.remove('disabled');
    cardContainer?.removeAttribute('aria-disabled');
    card.querySelector('.avatar-card-menu')?.setAttribute('hidden', '');

    const imageHolder = card.querySelector('.avatar-card-fullbody .avatar-card-image');
    if (imageHolder) {
      imageHolder.classList.remove('icon-blocked');
      imageHolder.removeAttribute('aria-label');
      imageHolder.style.backgroundImage = 'none';
      imageHolder.style.backgroundColor = 'transparent';
      let image = imageHolder.querySelector('img');
      if (!image) {
        image = document.createElement('img');
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        imageHolder.appendChild(image);
      }
      image.removeAttribute('srcset');
      if (/unapprovedimage|placeholder|blocked/i.test(image.getAttribute('src') || '')) {
        image.removeAttribute('src');
        image.removeAttribute('srcset');
      }
      image.style.display = 'block';
      image.style.width = '100%';
      image.style.height = '100%';
      applyIconHeadCrop(image, 'AvatarHeadshot');
      imageHolder.style.overflow = 'hidden';
      if (image.dataset.roimprFallbackBound !== 'true') {
        image.dataset.roimprFallbackBound = 'true';
        image.dataset.fallbackAttempts = image.dataset.fallbackAttempts || '0';
        image.addEventListener('error', async () => {
          const failedUrl = image.currentSrc || image.src || '';
          const attempts = Number(image.dataset.fallbackAttempts || 0);
          if (attempts >= 2) return;
          image.dataset.fallbackAttempts = String(attempts + 1);
          const fallback = await requestUserThumbnail(userId, true, failedUrl ? [failedUrl] : []);
          if (fallback && image.isConnected && card.getAttribute(FRIEND_BANNED_MARK) === userId) {
            applyIconHeadCrop(image, fallback.iconType, fallback.source);
            image.src = fallback.imageUrl;
          }
        });
      }
      imageHolder.style.backgroundImage = 'none';
      imageHolder.style.backgroundColor = 'var(--color-surface-300, #393b42)';
      ensureFriendCardLink(imageHolder, profileUrl, 'avatar');
    }

    if (displayNode) {
      displayNode.textContent = displayName;
      const existingNameLink = displayNode.closest('a');
      if (existingNameLink) {
        existingNameLink.href = profileUrl;
        existingNameLink.dataset.roimprBannedFriendLink = 'name';
      } else {
        ensureFriendCardLink(displayNode, profileUrl, 'name');
      }
    }

    if (usernameNode) usernameNode.textContent = `@${username}`;
    if (statusNode) {
      statusNode.textContent = 'BANNED';
      statusNode.dataset.roimprBannedLabel = 'true';
    } else {
      const caption = card.querySelector('.avatar-card-caption');
      if (caption) caption.dataset.roimprBannedCaption = 'BANNED';
    }

    const avatarHolder = card.querySelector('.avatar-card-fullbody .avatar-card-image');
    const avatarImage = avatarHolder?.querySelector('img');
    const cachedThumbnail = userThumbnailCache.get(userId);
    const cached = cachedThumbnail?.imageUrl || '';
    if (avatarImage) {
      avatarImage.alt = `${displayName} profile picture`;
      if (cached) {
        applyIconHeadCrop(avatarImage, cachedThumbnail.iconType || 'AvatarHeadshot', cachedThumbnail.source);
        if (avatarImage.getAttribute('src') !== cached) avatarImage.src = cached;
      }
    }
  }

  function loadBannedFriendThumbnailWhenVisible(userId) {
    const id = String(userId || '');
    if (!/^\d{1,20}$/.test(id)) return;
    const card = document.getElementById(id);
    const image = card?.querySelector('.avatar-card-fullbody .avatar-card-image img');
    if (!image || image.dataset.roimprLazyRequest === 'true' || image.getAttribute('src')) return;

    const load = async () => {
      if (!image.isConnected || image.dataset.roimprLazyRequest === 'true' || image.getAttribute('src')) return;
      image.dataset.roimprLazyRequest = 'true';
      const thumbnail = await requestUserThumbnail(id, true);
      if (!thumbnail?.imageUrl || !image.isConnected || card.getAttribute(FRIEND_BANNED_MARK) !== id) return;
      const cached = cacheUserThumbnail(id, thumbnail.imageUrl, thumbnail.source, thumbnail.iconType);
      applyIconHeadCrop(image, cached.iconType || 'AvatarHeadshot', cached.source);
      image.src = cached.imageUrl;
    };

    if (!('IntersectionObserver' in window)) {
      void load();
      return;
    }
    if (!lazyBannedFriendThumbnailObserver) {
      lazyBannedFriendThumbnailObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          lazyBannedFriendThumbnailObserver.unobserve(entry.target);
          const targetCard = entry.target.closest('li.avatar-card[id]');
          if (targetCard) loadBannedFriendThumbnailWhenVisibleNow(targetCard);
        }
      }, { rootMargin: '180px 0px', threshold: 0.01 });
    }
    lazyBannedFriendThumbnailObserver.observe(card);
  }

  async function loadBannedFriendThumbnailWhenVisibleNow(card) {
    const id = String(card?.id || '');
    const image = card?.querySelector('.avatar-card-fullbody .avatar-card-image img');
    if (!/^\d{1,20}$/.test(id) || !image || image.dataset.roimprLazyRequest === 'true' || image.getAttribute('src')) return;
    image.dataset.roimprLazyRequest = 'true';
    const thumbnail = await requestUserThumbnail(id, true);
    if (!thumbnail?.imageUrl || !image.isConnected || card.getAttribute(FRIEND_BANNED_MARK) !== id) return;
    const cached = cacheUserThumbnail(id, thumbnail.imageUrl, thumbnail.source, thumbnail.iconType);
    applyIconHeadCrop(image, cached.iconType || 'AvatarHeadshot', cached.source);
    image.src = cached.imageUrl;
  }

  function bannedFriendCardIsApplied(card, userId, details) {
    if (!card || card.getAttribute(FRIEND_BANNED_MARK) !== userId) return false;
    const labels = [...card.querySelectorAll('.avatar-card-label')];
    const hasBannedLabel = labels.some((node) =>
      node.dataset.roimprBannedLabel === 'true' || node.textContent.trim().toUpperCase() === 'BANNED');
    const caption = card.querySelector('.avatar-card-caption');
    const statusIsApplied = hasBannedLabel || caption?.dataset.roimprBannedCaption === 'BANNED';
    const name = card.querySelector('.avatar-name');
    const visibleName = name?.textContent?.trim() || '';
    const displayName = details.displayName && !isGenericAccountName(details.displayName)
      ? details.displayName
      : (!isGenericAccountName(visibleName) ? visibleName : (details.name || 'Deleted User'));
    const username = details.name && !isGenericAccountName(details.name) ? details.name : 'Deleted User';
    const profileUrl = friendProfileUrl(userId, { ...details, displayName }, displayName);
    const usernameNode = labels.find((node) => node.textContent.trim().startsWith('@')) || null;
    const avatar = card.querySelector('.avatar-card-fullbody .avatar-card-image');
    const nameLinked = name?.closest('a')?.href === profileUrl || name?.dataset.roimprBannedFriendHref === profileUrl;
    const avatarLinked = avatar?.closest('a')?.href === profileUrl || avatar?.dataset.roimprBannedFriendHref === profileUrl;
    const containerEnabled = !card.querySelector('.avatar-card-container')?.classList.contains('disabled');
    const avatarEnabled = !!avatar && !avatar.classList.contains('icon-blocked');
    return statusIsApplied && visibleName === displayName && usernameNode?.textContent.trim() === `@${username}` &&
      nameLinked && avatarLinked && containerEnabled && avatarEnabled;
  }


  async function inspectDeletedFriendCard(card) {
    const userId = String(card?.id || '');
    if (!featureEnabled || !/^\d{1,20}$/.test(userId) || !card?.isConnected) return;

    // The page can reuse a card element after pagination and restore its original
    // placeholder markup. Reapply the cached result even when our marker remains.
    const cachedDetails = banStatusCache.get(userId);
    if (cachedDetails?.isBanned === true) {
      if (!bannedFriendCardIsApplied(card, userId, cachedDetails)) applyBannedFriendCard(card, cachedDetails);
      loadBannedFriendThumbnailWhenVisible(userId);
      return;
    }

    if (!friendCardIsDeletedPlaceholder(card) || card.getAttribute(FRIEND_CHECK_MARK) === userId) return;
    if (friendCardRequests.has(userId)) return friendCardRequests.get(userId);

    const request = (async () => {
      const details = await requestBanStatus(userId);
      if (!featureEnabled || !card.isConnected || String(card.id) !== userId || !details) return;
      card.setAttribute(FRIEND_CHECK_MARK, userId);
      if (details.isBanned) {
        applyBannedFriendCard(card, details);
        loadBannedFriendThumbnailWhenVisible(userId);
      }
    })().finally(() => friendCardRequests.delete(userId));
    friendCardRequests.set(userId, request);
    return request;
  }

  function scanFriendsCards() {
    if (!featureEnabled || !isFriendsRoute()) return;
    const list = document.querySelector('.friends-content ul.avatar-cards, ul.hlist.avatar-cards');
    if (!list) return;
    for (const card of list.querySelectorAll('li.avatar-card[id]')) inspectDeletedFriendCard(card);
  }

  function stopFriendsWatcher() {
    friendsObserver?.disconnect();
    friendsObserver = null;
    friendsObservedRoot = null;
    if (friendsScanTimer) window.clearTimeout(friendsScanTimer);
    friendsScanTimer = 0;
  }

  function scheduleFriendsScan() {
    if (friendsScanTimer) return;
    friendsScanTimer = window.setTimeout(() => {
      friendsScanTimer = 0;
      if (!isFriendsRoute()) {
        stopFriendsWatcher();
        return;
      }
      const latestRoot = document.querySelector('#container-main') || document.querySelector('.friends-content') || document.documentElement;
      if (latestRoot && latestRoot !== friendsObservedRoot) {
        startFriendsWatcher();
        return;
      }
      scanFriendsCards();
    }, 100);
  }

  function startFriendsWatcher() {
    if (!featureEnabled || !isFriendsRoute() || !document.documentElement) {
      stopFriendsWatcher();
      return;
    }
    const root = document.querySelector('#container-main') || document.querySelector('.friends-content') || document.documentElement;
    if (friendsObserver && root === friendsObservedRoot) return;
    installStyles();
    friendsObserver?.disconnect();
    friendsObservedRoot = root;
    friendsObserver = new MutationObserver(scheduleFriendsScan);
    friendsObserver.observe(root, { childList: true, subtree: true });
    scanFriendsCards();
  }

  function handleRouteChange() {
    if (!featureEnabled) return;
    startFriendsWatcher();
    const search = currentSearch();
    const nextKey = search?.key || '';
    if (nextKey === activeKey) return;

    activeKey = nextKey;
    requestToken += 1;
    stopRootObserver();
    document.getElementById(CARD_ID)?.remove();

    if (!search) return;
    installStyles();
    lookupUser(search.username, requestToken);
  }

  function setFeatureEnabled(value) {
    const next = value === true;
    if (featureEnabled === next) return;
    featureEnabled = next;
    if (!featureEnabled) {
      requestToken += 1;
      navToken += 1;
      if (navTimer) window.clearTimeout(navTimer);
      navTimer = 0;
      stopRootObserver();
      stopFriendsWatcher();
      navObserver?.disconnect();
      navObserver = null;
      observedNavRoot = null;
      navInputController?.abort();
      navInputController = null;
      navInput = null;
      navDropdown = null;
      lastNavResult = null;
      document.getElementById(CARD_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
      document.getElementById(NAV_RESULT_ID)?.remove();
      document.getElementById(NAV_STYLE_ID)?.remove();
      activeKey = '';
      return;
    }
    handleRouteChange();
    startNavWatcher();
  }

  chrome.storage.local.get({ deletedUserSearchEnabled: true })
    .then((settings) => setFeatureEnabled(settings.deletedUserSearchEnabled !== false))
    .catch(() => setFeatureEnabled(true));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.hasOwn(changes, 'deletedUserSearchEnabled')) {
      setFeatureEnabled(changes.deletedUserSearchEnabled.newValue !== false);
    }
  });

  window.addEventListener('roimpr:route-change', () => { handleRouteChange(); startNavWatcher(); });
  window.addEventListener('popstate', handleRouteChange);
  window.addEventListener('hashchange', handleRouteChange);
  window.addEventListener('pageshow', handleRouteChange);
})();
