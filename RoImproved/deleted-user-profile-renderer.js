'use strict';

(() => {
  const GLOBAL_KEY = '__ROIMPR_EXPERIMENTAL_DELETED_PROFILE_RENDERER__';
  if (window[GLOBAL_KEY]) return;

  const API = Object.freeze({
    users: 'https://users.roblox.com',
    inventory: 'https://inventory.roblox.com',
    economy: 'https://economy.roblox.com',
    friends: 'https://friends.roblox.com',
    avatar: 'https://avatar.roblox.com',
    thumbnails: 'https://thumbnails.roblox.com',
    groups: 'https://groups.roblox.com',
    badges: 'https://badges.roblox.com',
    games: 'https://games.roblox.com',
    catalog: 'https://catalog.roblox.com'
  });

  let activeRenderId = '';
  let identityPromise = Promise.resolve(null);
  let resolvedUsername = '';
  let resolvedDisplayName = '';
  let lazyFriendThumbnailObserver = null;

  function validId(value) {
    const id = String(value ?? '');
    return /^\d{1,20}$/.test(id) ? id : '';
  }

  function safeText(value, max = 160) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
  }

  function safeImage(value) {
    try {
      const url = new URL(String(value || ''));
      const host = url.hostname.toLowerCase();
      const trusted = host === 'rbxcdn.com' || host.endsWith('.rbxcdn.com') ||
        host === 'roblox.com' || host.endsWith('.roblox.com') ||
        host === 'robloxusercontent.com' || host.endsWith('.robloxusercontent.com');
      if (url.protocol !== 'https:' || url.username || url.password || !trusted) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  async function requestJson(apiName, path, method = 'GET', body = undefined) {
    try {
      if (!Object.hasOwn(API, apiName) || typeof path !== 'string' || !path.startsWith('/')) return null;
      const response = await chrome.runtime.sendMessage({
        type: 'ROIMPR_DELETED_PROFILE_API',
        api: apiName,
        path,
        method,
        parallel: true,
        ...(body === undefined ? {} : { body })
      });
      return response?.ok === true ? response.payload : null;
    } catch {
      return null;
    }
  }

  async function requestGeneratedProfileThumbnail(userId) {
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'ROIMPR_USER_THUMBNAIL',
        userId: String(userId),
        preferGenerated: true,
        forceGenerated: true,
        cloudOnly: true,
        skipPublicFallback: true
      });
      const imageUrl = safeImage(result?.imageUrl);
      const headshotUrl = safeImage(result?.headshotUrl);
      const fullAvatarUrl = safeImage(result?.fullAvatarUrl);
      if (!headshotUrl && !fullAvatarUrl && !imageUrl && result?.fullAvatarRenderAttempted !== true) return null;
      return {
        imageUrl,
        headshotUrl,
        fullAvatarUrl,
        source: result?.source && result.source !== 'none' ? result.source : 'none',
        headshotSource: result?.headshotSource || 'none',
        fullAvatarSource: result?.fullAvatarSource || 'none',
        fullAvatarRenderAttempted: result?.fullAvatarRenderAttempted === true
      };
    } catch {
      return null;
    }
  }

  async function requestProfile2dFallback(userId, excludeUrls = []) {
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'ROIMPR_USER_THUMBNAIL',
        userId: String(userId),
        avatarRenderOnly: true,
        excludeUrls: excludeUrls.filter(Boolean).slice(0, 8)
      });
      const candidate = safeImage(result?.fullAvatarUrl || result?.imageUrl);
      return result?.ok && candidate ? candidate : '';
    } catch {
      return '';
    }
  }

  function profileIsCurrent(userId) {
    const root = document.querySelector('[data-roimpr-profile-root]');
    return !!root && root.dataset.profileId === String(userId) && activeRenderId === String(userId);
  }

  function addStyles() {
    if (document.getElementById('RoImpr-profile-css')) return;
    const link = document.createElement('link');
    link.id = 'RoImpr-profile-css';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('deleted-user-profile-renderer.css');
    document.head.appendChild(link);
  }

  function makeElement(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== '') node.textContent = text;
    return node;
  }

  function createImageBox(url, alt, className = 'RoImpr-card-media') {
    const holder = makeElement('span', className);
    const imageUrl = safeImage(url);
    if (imageUrl) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = safeText(alt, 120);
      image.loading = 'lazy';
      image.decoding = 'async';
      holder.appendChild(image);
    }
    return holder;
  }

  function applyFriendThumbnail(image, result) {
    if (!image || !result?.imageUrl || !image.isConnected) return;
    applyProfileHeadCrop(image, result.iconType || 'AvatarHeadshot');
    image.dataset.thumbnailLoaded = 'true';
    image.src = result.imageUrl;
  }

  function loadFriendThumbnailWhenVisible(image, userId) {
    if (!image || !/^\d{1,20}$/.test(String(userId))) return;
    image.dataset.friendId = String(userId);
    image.loading = 'lazy';
    image.decoding = 'async';

    if (!('IntersectionObserver' in window)) {
      void loadFriendThumbnailWhenVisibleNow(image);
      return;
    }
    if (!lazyFriendThumbnailObserver) {
      lazyFriendThumbnailObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target;
          lazyFriendThumbnailObserver.unobserve(target);
          void loadFriendThumbnailWhenVisibleNow(target);
        }
      }, { rootMargin: '180px 0px', threshold: 0.01 });
    }
    lazyFriendThumbnailObserver.observe(image);
  }

  async function loadFriendThumbnailWhenVisibleNow(image) {
    const userId = String(image?.dataset.friendId || '');
    if (!image?.isConnected || !/^\d{1,20}$/.test(userId) || image.dataset.thumbnailRequested === 'true' || image.getAttribute('src')) return;
    image.dataset.thumbnailRequested = 'true';
    const result = await requestFriendHeadshot(userId, false);
    if (result?.imageUrl && image.isConnected) {
      applyFriendThumbnail(image, result);
      return;
    }
    image.dataset.thumbnailRequested = 'false';
    image.dataset.thumbnailFailed = 'true';
  }

  function createCard({ href = '', name = 'Unknown', meta = '', image = '', type = 'item' }) {
    const label = safeText(name, 120) || 'Unknown';
    const metaText = safeText(meta, 120);
    const validHref = typeof href === 'string' && /^https:\/\/www\.roblox\.com\//i.test(href) ? href : '';
    const card = document.createElement(validHref ? 'a' : 'div');
    card.className = type === 'friend' ? 'RoImpr-friend' : 'RoImpr-card';
    if (validHref) card.href = validHref;
    const media = createImageBox(image, label);
    if (type === 'friend' && validHref) {
      const friendId = validHref.match(/\/users\/(\d+)\//)?.[1] || '';
      let friendImage = media.querySelector('img');
      if (friendId) {
        if (!friendImage) {
          friendImage = document.createElement('img');
          friendImage.alt = safeText(label, 120);
          media.appendChild(friendImage);
        }
        friendImage.loading = 'lazy';
        friendImage.decoding = 'async';
        friendImage.dataset.fallbackAttempts = '0';
        friendImage.addEventListener('error', async () => {
          const failedUrl = friendImage.currentSrc || friendImage.src || '';
          const attempts = Number(friendImage.dataset.fallbackAttempts || 0);
          if (attempts >= 2) return;
          friendImage.dataset.fallbackAttempts = String(attempts + 1);
          const fallback = await requestFriendHeadshot(friendId, true, failedUrl ? [failedUrl] : []);
          if (fallback && friendImage.isConnected) applyFriendThumbnail(friendImage, fallback);
        });
        if (!image) loadFriendThumbnailWhenVisible(friendImage, friendId);
      }
    }
    card.appendChild(media);
    card.appendChild(makeElement('span', 'RoImpr-card-name', label));
    if (metaText) card.appendChild(makeElement('span', 'RoImpr-card-meta', metaText));
    return card;
  }

  function createSection(parent, key, title, href = '') {
    const section = makeElement('section', 'RoImpr-section');
    section.dataset.section = key;
    const header = makeElement('div', 'RoImpr-section-header');
    const heading = makeElement('h2', '', title);
    if (href && /^https:\/\/www\.roblox\.com\//.test(href)) {
      const link = document.createElement('a');
      link.href = href;
      link.className = 'RoImpr-section-link';
      link.appendChild(heading);
      header.appendChild(link);
    } else {
      header.appendChild(heading);
    }
    const list = makeElement('div', `RoImpr-list${key === 'friends' ? ' RoImpr-friend-list' : ''}`);
    list.dataset.list = key;
    const state = makeElement('p', 'RoImpr-state', 'Loading…');
    state.dataset.state = key;
    section.append(header, list, state);
    parent.appendChild(section);
    return { section, list, state };
  }

  function updateSection(section, cards) {
    if (!profileIsCurrent(section.section.dataset.profileId || activeRenderId)) return;
    section.list.replaceChildren(...cards);
    if (cards.length) section.state.remove();
    else section.section.remove();
  }

  function setSectionError(section, message) {
    if (!profileIsCurrent(activeRenderId) || !section.section.isConnected) return;
    section.state.textContent = message;
  }

  function byId(root, selector) {
    return root.querySelector(`[data-node="${selector}"]`);
  }



  function makeThumbnailMap(payload) {
    const map = new Map();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    for (const row of rows) {
      const id = String(row?.targetId ?? '');
      const image = safeImage(row?.imageUrl);
      if (id && image && !/(?:unapprovedimage|placeholder|blocked)/i.test(image) && (!row?.state || row.state === 'Completed')) map.set(id, image);
    }
    return map;
  }

  async function requestFriendHeadshot(userId, preferGenerated = false, excludeUrls = []) {
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'ROIMPR_USER_THUMBNAIL',
        userId: String(userId),
        ...(preferGenerated ? { preferGenerated: true, forceGenerated: true } : {}),
        ...(excludeUrls.length ? { excludeUrls: excludeUrls.slice(0, 8) } : {})
      });
      const candidate = safeImage(result?.iconUrl || result?.headshotUrl || result?.imageUrl || result?.fullAvatarUrl);
      const iconType = ['AvatarHeadshot', 'AvatarBust', 'Avatar'].includes(result?.iconType) ? result.iconType : (result?.headshotUrl ? 'AvatarHeadshot' : 'Avatar');
      return result?.ok && candidate && !/(?:unapprovedimage|placeholder|blocked)/i.test(candidate) ? { imageUrl: candidate, iconType } : null;
    } catch {
      return '';
    }
  }



  function dateLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? safeText(value, 80) : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function countLabel(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n.toLocaleString() : '—';
  }

  function profileLink(userId, suffix = 'profile') {
    return `https://www.roblox.com/users/${encodeURIComponent(userId)}/${suffix}`;
  }

  function createShell(content, target, user) {
    content.replaceChildren();
    content.classList.add('RoImpr-profile-content');

    const root = makeElement('div', 'RoImpr-profile');
    root.id = 'RoImpr-profile-root';
    root.dataset.roimprProfileRoot = 'true';
    root.dataset.profileId = target.id;

    const hero = makeElement('div', 'RoImpr-hero');
    hero.appendChild(makeElement('div', 'RoImpr-hero-backdrop'));
    const heroAvatar = makeElement('div', 'RoImpr-hero-avatar');
    const avatar = document.createElement('img');
    avatar.alt = 'Avatar';
    avatar.dataset.node = 'full-avatar';
    heroAvatar.appendChild(avatar);
    hero.appendChild(heroAvatar);

    const header = makeElement('header', 'RoImpr-header');
    const identity = makeElement('div', 'RoImpr-identity');
    const headshot = makeElement('div', 'RoImpr-headshot');
    const headshotImage = document.createElement('img');
    headshotImage.alt = 'User avatar';
    headshotImage.dataset.node = 'headshot';
    headshot.appendChild(headshotImage);

    const details = makeElement('div', 'RoImpr-details');
    const name = makeElement('div', 'RoImpr-name', safeText(user?.displayName || user?.name || 'Deleted User', 80));
    name.dataset.node = 'display-name';
    const status = makeElement('span', 'RoImpr-status', user?.name === 'Account Forgotten' ? 'Account Forgotten' : 'Banned / deleted account');
    status.dataset.node = 'status';
    name.appendChild(status);
    const username = makeElement('div', 'RoImpr-username', `@${safeText(target.username || user?.name || 'Deleted User', 64)}`);
    username.dataset.node = 'username';
    details.append(name, username);
    identity.append(headshot, details);
    header.appendChild(identity);

    const stats = makeElement('div', 'RoImpr-stats');
    for (const [key, label, path] of [
      ['friends', 'Friends', 'friends#!/friends'],
      ['followers', 'Followers', 'friends#!/followers'],
      ['following', 'Following', 'friends#!/following']
    ]) {
      const pill = document.createElement('a');
      pill.className = 'RoImpr-stat';
      pill.href = profileLink(target.id, path);
      pill.append(makeElement('strong', '', '—'), makeElement('span', '', label));
      pill.dataset.stat = key;
      stats.appendChild(pill);
    }
    header.appendChild(stats);

    const initialDescription = safeText(user?.description, 4000);
    if (initialDescription) {
      const description = makeElement('div', 'RoImpr-description', initialDescription);
      description.dataset.node = 'description';
      header.appendChild(description);
    }

    const joined = makeElement('div', 'RoImpr-joined', user?.created ? `Joined ${dateLabel(user.created)}` : '');
    joined.dataset.node = 'joined';
    header.appendChild(joined);
    header.appendChild(makeElement('div', 'RoImpr-user-id', `User ID: ${target.id}`));

    const profileContent = makeElement('div', 'RoImpr-content');
    const sections = {
      wearing: createSection(profileContent, 'wearing', 'Currently Wearing'),
      inventory: createSection(profileContent, 'inventory', 'Collectibles'),
      creations: createSection(profileContent, 'creations', 'Creations'),
      store: createSection(profileContent, 'store', 'Creator Store', 'https://www.roblox.com/catalog'),
      favorites: createSection(profileContent, 'favorites', 'Favorites', profileLink(target.id, 'favorites#!/places')),
      friends: createSection(profileContent, 'friends', 'Friends', profileLink(target.id, 'friends#!/friends')),
      groups: createSection(profileContent, 'groups', 'Communities'),
      badges: createSection(profileContent, 'badges', 'Badges', profileLink(target.id, 'inventory/#!/badges'))
    };

    root.append(hero, header, profileContent);
    content.appendChild(root);
    return { root, sections };
  }

  function applyProfileHeadCrop(image, type = 'AvatarHeadshot') {
    if (!image) return;
    const frames = {
      AvatarHeadshot: { position: 'center 16%' },
      AvatarBust: { scale: 1.9, position: 'center 11%' },
      Avatar: { scale: 2.4, position: 'center 6%' }
    };
    const frame = frames[type] || frames.AvatarHeadshot;
    image.style.objectFit = 'cover';
    image.style.objectPosition = frame.position;
    image.style.transform = frame.scale ? `scale(${frame.scale})` : 'none';
    image.style.transformOrigin = frame.scale ? frame.position : 'center';
  }

  async function loadIdentity(userId, target, user, shell) {
    const detailsResult = await requestJson('users', `/v1/users/${userId}`);
    if (!profileIsCurrent(userId)) return null;

    let details = detailsResult;
    if (!details || (!details.name && !details.displayName && !details.description && !details.created)) {
      const batch = await requestJson('users', '/v1/users', 'POST', { userIds: [Number(userId)] });
      if (!profileIsCurrent(userId)) return null;
      const rows = Array.isArray(batch?.data) ? batch.data : [];
      details = rows.find((row) => String(row?.id) === String(userId)) || details;
    }

    const generic = (value) => !value || /^(?:deleted user|account forgotten)$/i.test(String(value).trim());
    const username = !generic(details?.name) ? details.name : safeText(target.username || user?.name, 64);
    const displayName = !generic(details?.displayName) ? details.displayName :
      (!generic(details?.name) ? details.name : (safeText(target.displayName, 80) || username || 'Deleted User'));

    resolvedUsername = safeText(username, 64) || 'Deleted User';
    resolvedDisplayName = safeText(displayName, 80) || 'Deleted User';
    document.title = `${resolvedDisplayName} (@${resolvedUsername}) - Roblox`;
    byId(shell.root, 'display-name').firstChild.textContent = resolvedDisplayName;
    byId(shell.root, 'username').textContent = `@${resolvedUsername}`;

    const status = byId(shell.root, 'status');
    if (details?.name === 'Forgotten' || user?.name === 'Forgotten') {
      status.textContent = 'Forgotten';
    } else if (details?.isBanned === true) {
      status.textContent = 'Banned';
    } else if (details?.isBanned === false) {
      status.textContent = 'Ban not detected';
    } else {
      status.textContent = 'Banned / Deleted';
    }

    const description = safeText(details?.description, 4000);
    let descriptionNode = byId(shell.root, 'description');
    if (description) {
      if (!descriptionNode) {
        descriptionNode = makeElement('div', 'RoImpr-description');
        descriptionNode.dataset.node = 'description';
        const joinedNode = byId(shell.root, 'joined');
        if (joinedNode) joinedNode.before(descriptionNode);
        else status.parentElement?.after(descriptionNode);
      }
      descriptionNode.textContent = description;
    } else {
      descriptionNode?.remove();
    }
    const created = details?.created;
    byId(shell.root, 'joined').textContent = created ? `Joined ${dateLabel(created)}` : 'Join date unavailable';

    const headshotImage = byId(shell.root, 'headshot');
    const fullAvatarImage = byId(shell.root, 'full-avatar');
    const images = [headshotImage, fullAvatarImage];
    let fallbackPromise = null;
    let fallbackAttempts = 0;
    const failedUrls = new Set();
    const loadStaticFallback = (retry = false) => {
      if (retry && fallbackAttempts < 2) fallbackPromise = null;
      if (!fallbackPromise && fallbackAttempts < 2) {
        fallbackAttempts += 1;
        fallbackPromise = requestProfile2dFallback(userId, [...failedUrls]);
      }
      return fallbackPromise || Promise.resolve('');
    };

    const showPlaceholder = (image) => {
      if (!image?.parentElement) return;
      image.removeAttribute('src');
      image.dataset.avatarStage = 'pending';
      image.style.opacity = '0';
    };

    const setAvatarImage = (image, url, type, stage, isHeadshot) => {
      if (!image || !url || !profileIsCurrent(userId)) return false;
      image.dataset.avatarStage = stage;
      image.style.opacity = '1';
      if (isHeadshot && type === 'AvatarHeadshot') {
        applyProfileHeadCrop(image, type);
      } else if (isHeadshot) {
        applyProfileHeadCrop(image, type || 'Avatar');
      } else {
        image.style.objectFit = 'contain';
        image.style.objectPosition = 'center bottom';
        image.style.transform = 'none';
        image.style.transformOrigin = 'center bottom';
      }
      image.src = url;
      return true;
    };

    images.forEach((image) => {
      image.loading = 'lazy';
      image.decoding = 'async';
      image.fetchPriority = 'low';
      image.referrerPolicy = 'strict-origin-when-cross-origin';
      showPlaceholder(image);
    });

    const recoverImage = async (image, isHeadshot) => {
      if (!profileIsCurrent(userId) || image.dataset.avatarRecovery === 'done') return;
      image.dataset.avatarRecovery = 'done';
      const failedUrl = image.currentSrc || image.src || '';
      if (failedUrl) failedUrls.add(failedUrl);
      const fallback = await loadStaticFallback(true);
      if (!profileIsCurrent(userId)) return;
      if (fallback && !failedUrls.has(fallback)) {
        setAvatarImage(image, fallback, 'Avatar', 'avatar-render-fallback', isHeadshot);
        return;
      }
      image.dataset.avatarStage = 'unavailable';
      image.style.opacity = '0';
    };

    headshotImage.addEventListener('error', () => { void recoverImage(headshotImage, true); });
    fullAvatarImage.addEventListener('error', () => { void recoverImage(fullAvatarImage, false); });

    let generationStarted = false;
    const startGeneration = async () => {
      if (generationStarted || !profileIsCurrent(userId)) return;
      generationStarted = true;
      // Start both sources only after the avatar area approaches the viewport.
      // The 2D renderer can finish before Open Cloud's long-running operation, so
      // apply whichever valid image arrives first instead of waiting for both.
      const staticFallbackPromise = loadStaticFallback();
      staticFallbackPromise.then((fallback) => {
        if (!fallback || !profileIsCurrent(userId)) return;
        if (headshotImage.dataset.avatarStage === 'pending') setAvatarImage(headshotImage, fallback, 'Avatar', 'avatar-render-fallback', true);
        if (fullAvatarImage.dataset.avatarStage === 'pending') setAvatarImage(fullAvatarImage, fallback, 'Avatar', 'avatar-render-fallback', false);
      });

      const generated = await requestGeneratedProfileThumbnail(userId);
      if (!profileIsCurrent(userId)) return;

      const generatedHeadshot = safeImage(generated?.headshotUrl || generated?.imageUrl);
      const generatedFullAvatar = safeImage(generated?.fullAvatarUrl || (generated?.source === 'avatar-render' ? generated?.imageUrl : ''));
      if (generatedHeadshot) setAvatarImage(headshotImage, generatedHeadshot, generated?.headshotSource === 'open-cloud' || generated?.source === 'open-cloud' ? 'AvatarHeadshot' : 'Avatar', 'generated', true);
      if (generatedFullAvatar) setAvatarImage(fullAvatarImage, generatedFullAvatar, 'Avatar', 'generated', false);

      // If the render fallback has not returned yet, leave the placeholder in place.
      // If it already failed and Open Cloud did not provide an image, mark unavailable.
      const fallback = await staticFallbackPromise;
      if (!profileIsCurrent(userId)) return;
      for (const image of images) {
        if (image.dataset.avatarStage === 'pending') {
          if (fallback) setAvatarImage(image, fallback, 'Avatar', 'avatar-render-fallback', image === headshotImage);
          else {
            image.dataset.avatarStage = 'unavailable';
            image.style.opacity = '0';
          }
        }
      }
    };

    const lazyTarget = shell.root.querySelector('.RoImpr-identity') || shell.root;
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void startGeneration();
      }, { rootMargin: '240px 0px', threshold: 0.01 });
      observer.observe(lazyTarget);
    } else {
      requestAnimationFrame(() => { void startGeneration(); });
    }

    if (details?.hasVerifiedBadge === true) {
      const badge = makeElement('span', 'RoImpr-status', 'Verified');
      status.insertAdjacentElement('afterend', badge);
    }

    return { details, username: resolvedUsername, displayName: resolvedDisplayName };
  }

  async function loadStats(userId, shell) {
    const [friends, followers, following] = await Promise.all([
      requestJson('friends', `/v1/users/${userId}/friends/count`),
      requestJson('friends', `/v1/users/${userId}/followers/count`),
      requestJson('friends', `/v1/users/${userId}/followings/count`)
    ]);
    if (!profileIsCurrent(userId)) return;
    for (const [key, result] of [['friends', friends], ['followers', followers], ['following', following]]) {
      const pill = shell.root.querySelector(`[data-stat="${key}"] strong`);
      if (pill) pill.textContent = countLabel(result?.count);
    }
  }

  const ASSET_TYPE_NAMES = Object.freeze({
    1: 'Image', 2: 'T-Shirt', 3: 'Audio', 4: 'Mesh', 5: 'Lua', 6: 'HTML', 7: 'Text',
    8: 'Hat', 9: 'Place', 10: 'Model', 11: 'Shirt', 12: 'Pants', 13: 'Decal',
    15: 'Head', 16: 'Face', 17: 'Gear', 18: 'Badge', 19: 'Animation',
    20: 'Torso', 21: 'Right Arm', 22: 'Left Arm', 23: 'Left Leg', 24: 'Right Leg',
    25: 'Package', 32: 'Mesh Part', 33: 'Hair Accessory', 34: 'Face Accessory',
    35: 'Neck Accessory', 36: 'Shoulder Accessory', 37: 'Front Accessory',
    38: 'Back Accessory', 39: 'Waist Accessory', 40: 'Climb Animation',
    41: 'Death Animation', 42: 'Fall Animation', 43: 'Idle Animation',
    44: 'Jump Animation', 45: 'Run Animation', 46: 'Swim Animation',
    47: 'Walk Animation', 48: 'Pose Animation', 49: 'Ear Accessory',
    50: 'Eye Accessory'
  });
  const ASSET_TYPE_LABELS = new Set(Object.values(ASSET_TYPE_NAMES).map((label) => label.toLowerCase()));

  function assetIdFrom(value) {
    const candidates = [value?.id, value?.assetId, value?.AssetId, value?.targetId, value?.TargetId];
    for (const candidate of candidates) {
      const id = String(candidate ?? '');
      if (/^\d{1,20}$/.test(id)) return id;
    }
    return '';
  }

  function assetNameFrom(value) {
    const candidates = [
      value?.name, value?.Name, value?.assetName, value?.AssetName,
      value?.displayName, value?.DisplayName, value?.itemName, value?.ItemName,
      value?.title, value?.Title
    ];
    for (const candidate of candidates) {
      const name = safeText(candidate, 160);
      if (!name) continue;
      if (/^(?:asset|item|avatar item|unknown|collectible)(?:\s*\(?\d+\)?)?$/i.test(name)) continue;
      if (/^(?:asset|item)\s*\(#?\d+\)$/i.test(name)) continue;
      const normalizedName = name.replace(/[\s_-]+/g, ' ').trim().toLowerCase();
      const reportedType = safeText(assetTypeFrom(value), 64).replace(/[\s_-]+/g, ' ').trim().toLowerCase();
      if (ASSET_TYPE_LABELS.has(normalizedName) || normalizedName === reportedType ||
          ['animation', 'emote', 'asset', 'item', 'unknown'].includes(normalizedName)) continue;
      return name;
    }
    return '';
  }

  function assetTypeFrom(value) {
    const raw = value?.assetTypeName || value?.AssetTypeName ||
      (typeof value?.assetType === 'string' ? value.assetType : value?.assetType?.name || value?.assetType?.Name) ||
      value?.typeName || value?.TypeName;
    if (raw) return safeText(raw, 64);
    const typeId = Number(value?.assetTypeId ?? value?.AssetTypeId ?? value?.assetType?.id ?? value?.assetType?.Id ?? value?.assetType);
    return Number.isFinite(typeId) ? (ASSET_TYPE_NAMES[typeId] || '') : '';
  }

  function collectAssetDetailRows(payload, allowedIds, detailMap) {
    const visited = new WeakSet();
    const visit = (node, inheritedId = '', inheritIntoChildren = false, depth = 0) => {
      if (!node || typeof node !== 'object' || depth > 9) return;
      if (visited.has(node)) return;
      visited.add(node);
      if (Array.isArray(node)) {
        for (const child of node) visit(child, inheritedId, inheritIntoChildren, depth + 1);
        return;
      }

      const ownId = assetIdFrom(node);
      const id = ownId || (inheritIntoChildren ? inheritedId : '');
      if (id && allowedIds.has(id)) {
        const name = assetNameFrom(node);
        const typeName = assetTypeFrom(node);
        if (name || typeName) {
          const previous = detailMap.get(id) || {};
          detailMap.set(id, {
            ...previous,
            ...(name ? { name } : {}),
            ...(typeName ? { assetTypeName: typeName } : {}),
            ...node
          });
          if (name) detailMap.get(id).name = name;
          if (typeName) detailMap.get(id).assetTypeName = typeName;
        }
      }

      for (const [key, child] of Object.entries(node)) {
        if (!child || typeof child !== 'object') continue;
        const nestedAssetContainer = /^(?:item|asset|details|itemdetails|assetdetails|product|items|assets|data|look)$/i.test(key);
        visit(child, id || inheritedId, nestedAssetContainer, depth + 1);
      }
    };
    visit(payload);
  }

  function avatarAssetEntries(avatar) {
    const result = [];
    const seen = new Set();
    for (const key of ['assets', 'emotes', 'equippedEmotes', 'animations', 'equippedAnimations']) {
      const source = avatar?.[key];
      const rows = Array.isArray(source)
        ? source
        : (source && typeof source === 'object' ? Object.values(source) : []);
      for (const row of rows) {
        const id = assetIdFrom(row) || assetIdFrom(row?.asset) || assetIdFrom(row?.emote);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        result.push({
          ...row,
          id,
          name: assetNameFrom(row) || assetNameFrom(row?.asset) || assetNameFrom(row?.emote),
          assetTypeName: assetTypeFrom(row) || assetTypeFrom(row?.asset) || (key.toLowerCase().includes('emote') ? 'Emote' : '')
        });
      }
    }
    return result;
  }

  async function resolveAssetMetadata(ids, entries = []) {
    const detailMap = new Map();
    for (const entry of entries) {
      const id = assetIdFrom(entry);
      if (!id) continue;
      detailMap.set(id, {
        ...entry,
        name: assetNameFrom(entry),
        assetTypeName: assetTypeFrom(entry)
      });
    }

    const allowedIds = new Set(ids);
    const missing = () => ids.filter((id) => !assetNameFrom(detailMap.get(id)));
    let unresolved = missing();

    if (unresolved.length) {
      const catalog = await requestJson('catalog', '/v1/catalog/items/details', 'POST', {
        items: unresolved.map((id) => ({ itemType: 'Asset', id: Number(id) }))
      });
      collectAssetDetailRows(catalog, allowedIds, detailMap);
    }

    unresolved = missing();
    if (unresolved.length) {
      let cursor = 0;
      const worker = async () => {
        while (cursor < unresolved.length) {
          const id = unresolved[cursor++];
          const result = await requestJson('economy', `/v2/assets/${id}/details`);
          if (result && typeof result === 'object') collectAssetDetailRows(result, allowedIds, detailMap);
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, unresolved.length) }, () => worker()));
    }

    return detailMap;
  }

  async function loadCurrentlyWearing(userId, section) {
    try {
      const avatar = await requestJson('avatar', `/v4/avatar/users/${userId}`);
      if (!profileIsCurrent(userId)) return;

      let entries = avatarAssetEntries(avatar);
      if (!entries.length) {
        const legacy = await requestJson('avatar', `/v1/users/${userId}/currently-wearing`);
        if (!profileIsCurrent(userId)) return;
        entries = (Array.isArray(legacy?.assetIds) ? legacy.assetIds : []).map((id) => ({ id: String(id) }));
      }

      const ids = [...new Set(entries.map(assetIdFrom).filter(Boolean))];
      if (!ids.length) return updateSection(section, []);

      const [detailMap, thumbs] = await Promise.all([
        resolveAssetMetadata(ids, entries),
        requestJson('thumbnails', `/v1/assets?assetIds=${ids.join(',')}&size=150x150&format=Png&isCircular=false`)
      ]);
      if (!profileIsCurrent(userId)) return;

      const thumbMap = makeThumbnailMap(thumbs);
      const cards = ids.map((id) => {
        const item = detailMap.get(id) || {};
        const name = assetNameFrom(item) || 'Unknown item';
        return createCard({
          href: `https://www.roblox.com/catalog/${id}/-`,
          name,
          image: thumbMap.get(id) || '',
          type: 'item'
        });
      });
      updateSection(section, cards);
    } catch {
      setSectionError(section, 'Could not load currently worn items.');
    }
  }

  async function loadCollectibles(userId, section) {
    try {
      const payload = await requestJson('inventory', `/v1/users/${userId}/assets/collectibles?limit=10&sortOrder=Desc`);
      if (!profileIsCurrent(userId)) return;
      const rows = Array.isArray(payload?.data) ? payload.data.slice(0, 8) : [];
      if (!rows.length) return updateSection(section, []);

      const ids = [...new Set(rows.map((row) => String(row?.assetId ?? row?.id ?? '')).filter((id) => /^\d{1,20}$/.test(id)))];
      const [thumbs, detailMap] = await Promise.all([
        ids.length
          ? requestJson('thumbnails', `/v1/assets?assetIds=${ids.join(',')}&size=150x150&format=Png&isCircular=false`)
          : Promise.resolve(null),
        resolveAssetMetadata(ids, rows.map((row) => ({ ...row, id: row?.assetId ?? row?.id })))
      ]);
      if (!profileIsCurrent(userId)) return;
      const thumbMap = makeThumbnailMap(thumbs);
      const cards = rows.map((item) => {
        const id = String(item?.assetId ?? item?.id ?? '');
        if (!/^\d{1,20}$/.test(id)) return null;
        const details = detailMap.get(id) || {};
        const serial = Number(item?.serialNumber);
        const average = Number(item?.recentAveragePrice ?? item?.originalPrice);
        const meta = [
          Number.isFinite(serial) && serial > 0 ? `Serial #${serial}` : '',
          Number.isFinite(average) && average > 0 ? `${average.toLocaleString()} Robux average` : ''
        ].filter(Boolean).join(' · ');
        return createCard({
          href: `https://www.roblox.com/catalog/${id}/-`,
          name: assetNameFrom(item) || assetNameFrom(details) || 'Collectible',
          meta,
          image: thumbMap.get(id) || '',
          type: 'item'
        });
      }).filter(Boolean);
      updateSection(section, cards);
    } catch {
      setSectionError(section, 'Could not load public collectibles.');
    }
  }

  async function loadCreatorStore(userId, section) {
    try {
      await identityPromise.catch(() => null);
      if (!profileIsCurrent(userId)) return;
      if (!resolvedUsername || /^(?:deleted user|account forgotten)$/i.test(resolvedUsername)) {
        return updateSection(section, []);
      }
      const query = new URLSearchParams({ taxonomy: 'tZsUsd2BqGViQrJ9Vs3Wah', creatorName: resolvedUsername, salesTypeFilter: '1', limit: '10' });
      const payload = await requestJson('catalog', `/v2/search/items/details?${query.toString()}`);
      if (!profileIsCurrent(userId)) return;
      const rows = Array.isArray(payload?.data) ? payload.data.slice(0, 6) : [];
      if (!rows.length) return updateSection(section, []);
      const ids = rows.map((row) => String(row?.id ?? '')).filter((id) => /^\d{1,20}$/.test(id));
      const thumbs = ids.length ? await requestJson('thumbnails', `/v1/assets?assetIds=${ids.join(',')}&size=150x150&format=Png&isCircular=false`) : null;
      if (!profileIsCurrent(userId)) return;
      const thumbMap = makeThumbnailMap(thumbs);
      const cards = rows.map((row) => {
        const id = String(row.id);
        const price = Number(row.price);
        const meta = Number.isFinite(price) && price > 0 ? `${price.toLocaleString()} Robux` : 'Off sale or free';
        return createCard({ href: `https://www.roblox.com/catalog/${id}/-`, name: row.name, meta, image: thumbMap.get(id) || '', type: 'item' });
      });
      updateSection(section, cards);
    } catch {
      setSectionError(section, 'Could not load creator-store items.');
    }
  }

  async function loadGames(userId, section, favorites) {
    try {
      const path = favorites
        ? `/v2/users/${userId}/favorite/games?limit=10&sortOrder=Desc`
        : `/v2/users/${userId}/games?accessFilter=2&limit=50&sortOrder=Asc`;
      const payload = await requestJson('games', path);
      if (!profileIsCurrent(userId)) return;
      const rows = Array.isArray(payload?.data) ? payload.data.slice(0, 6) : [];
      if (!rows.length) return updateSection(section, []);
      const ids = rows.map((row) => String(row?.id ?? '')).filter((id) => /^\d{1,20}$/.test(id));
      const thumbs = ids.length ? await requestJson('thumbnails', `/v1/games/icons?universeIds=${ids.join(',')}&size=150x150&format=Png&isCircular=false`) : null;
      if (!profileIsCurrent(userId)) return;
      const thumbMap = makeThumbnailMap(thumbs);
      const cards = rows.map((game) => {
        const id = String(game.id);
        const placeId = String(game.rootPlace?.id || id);
        const visits = Number(game.placeVisits);
        const meta = Number.isFinite(visits) ? `${visits.toLocaleString()} visits` : '';
        return createCard({ href: `https://www.roblox.com/games/${placeId}/-`, name: game.name, meta, image: thumbMap.get(id) || '', type: 'game' });
      });
      updateSection(section, cards);
    } catch {
      setSectionError(section, 'Could not load experience data.');
    }
  }

  async function loadFriends(userId, section) {
    try {
      const payload = await requestJson('friends', `/v1/users/${userId}/friends/find?userSort=2&limit=10`);
      if (!profileIsCurrent(userId)) return;
      const rows = Array.isArray(payload?.PageItems) ? payload.PageItems.slice(0, 10) : [];
      if (!rows.length) return updateSection(section, []);
      const ids = rows.map((row) => String(row?.id ?? '')).filter((id) => /^\d{1,20}$/.test(id) && id !== '-1');
      const [usersResponse, thumbs] = await Promise.all([
        ids.length ? requestJson('users', '/v1/users', 'POST', { userIds: ids.map(Number) }) : null,
        ids.length ? requestJson('thumbnails', `/v1/users/avatar-headshot?userIds=${ids.join(',')}&size=150x150&format=Png&isCircular=false`) : null
      ]);
      if (!profileIsCurrent(userId)) return;
      const userMap = new Map((Array.isArray(usersResponse?.data) ? usersResponse.data : []).map((row) => [String(row.id), row]));
      const thumbMap = makeThumbnailMap(thumbs);
      // Do not generate missing avatars for every friend up front. Cards without a
      // public thumbnail request a generated fallback only as they approach view.
      const cards = rows.map((friend) => {
        const id = String(friend?.id ?? '');
        const hidden = id === '-1';
        const details = hidden ? null : userMap.get(id);
        const displayName = hidden ? 'Hidden User' : safeText(details?.displayName || friend?.displayName || details?.name || friend?.name, 80) || `User ${id}`;
        const username = safeText(details?.name || friend?.name, 64);
        const meta = hidden ? 'Private account' : (username ? `@${username}` : `ID ${id}`);
        return createCard({ href: hidden ? '' : profileLink(id), name: displayName, meta, image: thumbMap.get(id) || '', type: 'friend' });
      });
      updateSection(section, cards);
    } catch {
      setSectionError(section, 'Could not load friends.');
    }
  }

  async function loadGroups(userId, section) {
    try {
      const payload = await requestJson('groups', `/v1/users/${userId}/groups/roles?includeLocked=true`);
      if (!profileIsCurrent(userId)) return;
      const rows = Array.isArray(payload?.data) ? payload.data.slice(0, 12) : [];
      if (!rows.length) return updateSection(section, []);
      const ids = rows.map((row) => String(row?.group?.id ?? '')).filter((id) => /^\d{1,20}$/.test(id));
      const thumbs = ids.length ? await requestJson('thumbnails', `/v1/groups/icons?groupIds=${ids.join(',')}&size=150x150&format=Png&isCircular=false`) : null;
      if (!profileIsCurrent(userId)) return;
      const thumbMap = makeThumbnailMap(thumbs);
      const cards = rows.map((entry) => {
        const group = entry?.group || {};
        const id = String(group.id ?? '');
        const members = Number(group.memberCount);
        const meta = [safeText(entry?.role?.name, 64), Number.isFinite(members) && members > 0 ? `${members.toLocaleString()} members` : ''].filter(Boolean).join(' · ');
        return createCard({ href: `https://www.roblox.com/groups/${id}/-`, name: group.name || `Group ${id}`, meta, image: thumbMap.get(id) || '', type: 'group' });
      });
      updateSection(section, cards);
    } catch {
      setSectionError(section, 'Could not load communities.');
    }
  }

  async function loadBadges(userId, section) {
    try {
      const payload = await requestJson('badges', `/v1/users/${userId}/badges?limit=10&sortOrder=Desc`);
      if (!profileIsCurrent(userId)) return;
      const rows = Array.isArray(payload?.data) ? payload.data.slice(0, 6) : [];
      if (!rows.length) return updateSection(section, []);
      const ids = rows.map((row) => String(row?.id ?? '')).filter((id) => /^\d{1,20}$/.test(id));
      const thumbs = ids.length ? await requestJson('thumbnails', `/v1/badges/icons?badgeIds=${ids.join(',')}&size=150x150&format=Png&isCircular=false`) : null;
      if (!profileIsCurrent(userId)) return;
      const thumbMap = makeThumbnailMap(thumbs);
      const cards = rows.map((badge) => {
        const id = String(badge.id);
        const meta = badge.awardedDate ? dateLabel(badge.awardedDate) : '';
        return createCard({ href: `https://www.roblox.com/badges/${id}/-`, name: badge.name, meta, image: thumbMap.get(id) || '', type: 'group' });
      });
      updateSection(section, cards);
    } catch {
      setSectionError(section, 'Could not load badges.');
    }
  }

  async function waitForContent(timeoutMs = 7000) {
    const existing = document.getElementById('content');
    if (existing) return existing;
    return new Promise((resolve) => {
      let observer;
      const finish = (node) => {
        if (observer) observer.disconnect();
        clearTimeout(timer);
        resolve(node || null);
      };
      const check = () => {
        const node = document.getElementById('content');
        if (node) finish(node);
      };
      const timer = setTimeout(() => finish(document.getElementById('content')), timeoutMs);
      if (document.documentElement && 'MutationObserver' in window) {
        observer = new MutationObserver(check);
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
      check();
    });
  }

  async function render(target, user) {
    const userId = validId(target?.id);
    if (!userId) return false;
    const content = await waitForContent();
    if (!content) return false;

    activeRenderId = userId;
    resolvedUsername = safeText(target?.username || user?.name, 64);
    resolvedDisplayName = safeText(user?.displayName || user?.name, 80);
    addStyles();
    document.title = `${resolvedDisplayName || 'Deleted User'} (@${resolvedUsername || 'unknown'}) - Roblox`;

    const shell = createShell(content, { id: userId, username: resolvedUsername }, user || {});
    shell.root.dataset.profileId = userId;
    for (const section of Object.values(shell.sections)) section.section.dataset.profileId = userId;

    identityPromise = loadIdentity(userId, { id: userId, username: resolvedUsername }, user || {}, shell)
      .catch(() => null);

    const jobs = [
      identityPromise,
      loadStats(userId, shell),
      loadCurrentlyWearing(userId, shell.sections.wearing),
      loadCollectibles(userId, shell.sections.inventory),
      loadGames(userId, shell.sections.creations, false),
      loadCreatorStore(userId, shell.sections.store),
      loadGames(userId, shell.sections.favorites, true),
      loadFriends(userId, shell.sections.friends),
      loadGroups(userId, shell.sections.groups),
      loadBadges(userId, shell.sections.badges)
    ];
    await Promise.allSettled(jobs);
    if (!profileIsCurrent(userId)) return false;
    window.dispatchEvent(new CustomEvent('roimpr:experimental-deleted-profile-ready', { detail: { userId } }));
    return true;
  }

  window[GLOBAL_KEY] = Object.freeze({ render });
})();
