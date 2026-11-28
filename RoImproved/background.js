'use strict';

const API_ORIGIN = 'https://avatar.roblox.com';
const THUMBNAIL_ORIGIN = 'https://thumbnails.roblox.com';
const USER_SETTINGS_ORIGIN = 'https://apis.roblox.com';
const OPEN_CLOUD_ORIGIN = 'https://apis.roblox.com';
const AUTHENTICATED_USER_ORIGIN = 'https://users.roblox.com';
const GAMES_ORIGIN = 'https://games.roblox.com';
const BADGES_ORIGIN = 'https://badges.roblox.com';
const PAGE_SIZE = 100;
const REQUEST_GAP_MS = 1200;
const CACHE_TTL_MS = 30000;
const DEFAULT_RETRY_MS = 15000;
const MAX_RETRY_MS = 3600000;

const LEGACY_TRACKING_RULE_IDS = [43001, 73001];

const DEFAULT_SETTINGS = Object.freeze({
  cleanHomePage: false,
  removePageFooter: false,
  removeLinkParameters: true,
  deletedUserSearchEnabled: true,
  avatarAccessoryAdjustmentEnabled: true,
  badgeSortingEnabled: true,
  favoritePlacesEnabled: true,
  profileOutfitsEnabled: false,
  transactionCounterEnabled: false,
  gameQuickJoinEnabled: true,
  gameServerListsEnabled: false,
  privacyControlsEnabled: false,
  voiceChatStatusEnabled: false,
  accessoryLimitEnabled: true,
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
});

let defaultSettingsPromise = null;
async function initializeDefaultSettings() {
  if (!defaultSettingsPromise) {
    defaultSettingsPromise = chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS)).then(async (stored) => {
      const missing = {};
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (typeof stored[key] !== 'boolean') missing[key] = value;
      }
      if (Object.keys(missing).length) await chrome.storage.local.set(missing);
    });
  }
  return defaultSettingsPromise;
}

const DYNAMIC_SCRIPT_PREFIX = 'roimpr-';
const ROBLOX_ALL_PAGES = ['https://www.roblox.com/*'];
const ROBLOX_HOME_PAGES = [
  'https://www.roblox.com/',
  'https://www.roblox.com/home*',
  'https://www.roblox.com/*/home*'
];
const ROBLOX_AVATAR_PAGES = [
  'https://www.roblox.com/my/avatar*',
  'https://www.roblox.com/*/my/avatar*'
];
const contentSettingKeys = new Set([
  'cleanHomePage', 'removePageFooter', 'removeLinkParameters', 'deletedUserSearchEnabled',
  'avatarAccessoryAdjustmentEnabled', 'badgeSortingEnabled', 'favoritePlacesEnabled', 'profileOutfitsEnabled',
  'transactionCounterEnabled', 'gameQuickJoinEnabled', 'gameServerListsEnabled',
  'privacyControlsEnabled', 'voiceChatStatusEnabled', 'accessoryLimitEnabled',
  'sidebarEnabled', 'sidebarCollapsed', 'sidebarButtonsEnabled'
]);
let contentScriptSyncPromise = null;
let contentScriptSyncRequested = false;

function buildContentScriptRegistrations(settings) {
  const registrations = [];
  const routeFeatureNeeded = Boolean(
    settings.cleanHomePage || settings.removeLinkParameters || settings.deletedUserSearchEnabled ||
    settings.profileOutfitsEnabled || settings.transactionCounterEnabled ||
    settings.gameQuickJoinEnabled || settings.gameServerListsEnabled ||
    settings.privacyControlsEnabled || settings.voiceChatStatusEnabled || settings.badgeSortingEnabled || settings.favoritePlacesEnabled ||
    settings.accessoryLimitEnabled
  );

  if (routeFeatureNeeded) {
    registrations.push({
      id: 'roimpr-route-loader', matches: ROBLOX_ALL_PAGES, js: ['route-feature-loader.js'],
      runAt: 'document_start', world: 'ISOLATED', persistAcrossSessions: true
    });
    registrations.push({
      id: 'roimpr-route-bridge', matches: ROBLOX_ALL_PAGES, js: ['profile-route-bridge.js'],
      runAt: 'document_start', world: 'MAIN', persistAcrossSessions: true
    });
  }

  if (settings.cleanHomePage) registrations.push({
    id: 'roimpr-home-feed-filter', matches: ROBLOX_HOME_PAGES, js: ['home-feed-filter.js'],
    runAt: 'document_start', world: 'MAIN', persistAcrossSessions: true
  });
  if (settings.voiceChatStatusEnabled) registrations.push({
    id: 'roimpr-voice-chat-watch', matches: ROBLOX_ALL_PAGES, js: ['voice-chat-watch-main.js'],
    runAt: 'document_start', world: 'MAIN', persistAcrossSessions: true
  });
  if (settings.accessoryLimitEnabled) registrations.push({
    id: 'roimpr-accessory-limit', matches: ROBLOX_AVATAR_PAGES, js: ['accessory-limit.js'],
    runAt: 'document_start', world: 'MAIN', persistAcrossSessions: true
  });
  if (settings.avatarAccessoryAdjustmentEnabled) registrations.push({
    id: 'roimpr-avatar-adjustment', matches: ROBLOX_AVATAR_PAGES, js: ['avatar-accessory-adjustment.js'],
    runAt: 'document_idle', world: 'ISOLATED', persistAcrossSessions: true
  });
  if (settings.removePageFooter) registrations.push({
    id: 'roimpr-page-footer', matches: ROBLOX_ALL_PAGES, js: ['page-footer-removal.js'],
    runAt: 'document_start', world: 'ISOLATED', persistAcrossSessions: true
  });
  if (settings.sidebarEnabled || settings.sidebarButtonsEnabled) registrations.push({
    id: 'roimpr-sidebar', matches: ROBLOX_ALL_PAGES, js: ['sidebar-collapse.js'],
    runAt: 'document_start', world: 'ISOLATED', persistAcrossSessions: true
  });
  if (settings.sidebarEnabled && settings.sidebarCollapsed) registrations.push({
    id: 'roimpr-sidebar-preload', matches: ROBLOX_ALL_PAGES, css: ['sidebar-preload.css'],
    runAt: 'document_start', persistAcrossSessions: true
  });
  if (settings.deletedUserSearchEnabled) registrations.push({
    id: 'roimpr-deleted-user-search', matches: ROBLOX_ALL_PAGES, js: ['deleted-user-search.js'],
    runAt: 'document_idle', world: 'ISOLATED', persistAcrossSessions: true
  });

  return registrations;
}

function registrationSignature(script) {
  return JSON.stringify({
    matches: script.matches, js: script.js, css: script.css, runAt: script.runAt, world: script.world,
    persistAcrossSessions: script.persistAcrossSessions
  });
}

async function syncContentScriptRegistrations() {
  contentScriptSyncRequested = true;
  if (contentScriptSyncPromise) return contentScriptSyncPromise;

  contentScriptSyncPromise = (async () => {
    do {
      contentScriptSyncRequested = false;
      await initializeDefaultSettings();
      const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
      const settings = { ...DEFAULT_SETTINGS, ...stored };
      const desired = buildContentScriptRegistrations(settings);
      const current = await chrome.scripting.getRegisteredContentScripts();
      const currentOwned = current.filter((script) => script.id.startsWith(DYNAMIC_SCRIPT_PREFIX));
      const desiredById = new Map(desired.map((script) => [script.id, script]));
      const currentById = new Map(currentOwned.map((script) => [script.id, script]));

      const removeIds = [];
      for (const [id, currentScript] of currentById) {
        const wanted = desiredById.get(id);
        if (!wanted || registrationSignature(currentScript) !== registrationSignature(wanted)) removeIds.push(id);
      }
      if (removeIds.length) await chrome.scripting.unregisterContentScripts({ ids: removeIds });

      const removedIds = new Set(removeIds);
      const addScripts = desired.filter((script) => !currentById.has(script.id) || removedIds.has(script.id));
      if (addScripts.length) await chrome.scripting.registerContentScripts(addScripts);
    } while (contentScriptSyncRequested);
  })().catch((error) => {
    console.warn('[RoImproved] Could not synchronize feature scripts:', error);
  }).finally(() => {
    contentScriptSyncPromise = null;
    if (contentScriptSyncRequested) syncContentScriptRegistrations();
  });
  return contentScriptSyncPromise;
}

async function removeLegacyTrackingRules() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: LEGACY_TRACKING_RULE_IDS
    });
  } catch {}
}

function runStartupTasks() {
  removeLegacyTrackingRules();
  initializeDefaultSettings().then(syncContentScriptRegistrations).catch(() => {});
}

chrome.runtime.onInstalled.addListener(runStartupTasks);
chrome.runtime.onStartup.addListener(runStartupTasks);
initializeDefaultSettings().then(syncContentScriptRegistrations).catch(() => {});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !Object.keys(changes).some((key) => contentSettingKeys.has(key))) return;
  syncContentScriptRegistrations();
});

function routeFeatureFiles(href, settings) {
  let url;
  try { url = new URL(href); } catch { return []; }
  if (url.origin !== 'https://www.roblox.com') return [];
  const path = url.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//i, '/').replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/home') {
    const files = [];
    if (settings.cleanHomePage || settings.removeLinkParameters) files.push({ file: 'home-feed-bridge.js', world: 'ISOLATED' });
    if (settings.removeLinkParameters) files.push({ file: 'home-chart-links.js', world: 'ISOLATED' });
    if (settings.gameQuickJoinEnabled || settings.gameServerListsEnabled) files.push({ file: 'home-game-actions.js', world: 'ISOLATED' });
    return files;
  }
  if (/^\/charts(?:\/|$)/.test(path)) {
    return settings.removeLinkParameters ? [{ file: 'home-chart-links.js', world: 'ISOLATED' }] : [];
  }
  if (/^\/users\/\d+\/profile(?:\/|$)/.test(path)) {
    return settings.profileOutfitsEnabled ? [{ file: 'outfits-gallery.js', world: 'ISOLATED' }] : [];
  }
  if (/^\/transactions(?:\/|$)/.test(path)) {
    return settings.transactionCounterEnabled ? [{ file: 'transaction-counter.js', world: 'ISOLATED' }] : [];
  }
  if (/^\/users\/(?:\d+\/)?inventory(?:\/|$)/.test(path)) {
    return settings.badgeSortingEnabled ? [{ file: 'badge-sorting.js', world: 'ISOLATED' }] : [];
  }
  if (/^\/users\/\d+\/favorites(?:\/|$)/.test(path)) {
    return settings.favoritePlacesEnabled ? [{ file: 'favorite-places.js', world: 'ISOLATED' }] : [];
  }
  return [];
}

async function injectRouteFeatures(sender, href) {
  const tabId = sender?.tab?.id;
  if (!Number.isInteger(tabId)) return;
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  const features = routeFeatureFiles(href, settings);
  await Promise.all(features.map((feature) => chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] }, files: [feature.file], world: feature.world
  })));
}

const originQueues = new Map();
const lastRequestAt = new Map();
const responseCache = new Map();
const originRateLimitUntil = new Map();
const parallelProfileRequests = new Map();
const fastSearchQueues = new Map();
const fastSearchInFlight = new Map();
const fastSearchLastRequestAt = new Map();
const FAST_SEARCH_REQUEST_GAP_MS = 100;
const FAST_SEARCH_CACHE_TTL_MS = 60000;
const GENERATED_THUMBNAIL_TTL_MS = 30 * 60 * 1000;
const generatedThumbnailCache = new Map();
const generatedThumbnailInFlight = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validGeneratedThumbnailUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return '';
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const trustedHost = host === 'rbxcdn.com' || host.endsWith('.rbxcdn.com') ||
      host === 'roblox.com' || host.endsWith('.roblox.com') ||
      host === 'robloxusercontent.com' || host.endsWith('.robloxusercontent.com');
    return url.protocol === 'https:' && !url.username && !url.password && trustedHost ? url.href : '';
  } catch {
    return '';
  }
}

function getOpenCloudError(payload, fallback = 'Roblox Open Cloud did not return a thumbnail.') {
  const message = payload?.error?.message || payload?.errors?.[0]?.message || payload?.message;
  return typeof message === 'string' && message.trim() ? message.trim().slice(0, 300) : fallback;
}

function retryDelayFromResponse(response, fallback = 900) {
  const raw = response?.headers?.get?.('retry-after');
  if (!raw) return fallback;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(250, Math.min(10000, seconds * 1000));
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(250, Math.min(10000, date - Date.now())) : fallback;
}

async function getSessionThumbnailApiKey() {
  try {
    const [local, session] = await Promise.all([
      chrome.storage?.local?.get('openCloudThumbnailApiKey') || Promise.resolve({}),
      chrome.storage?.session?.get('openCloudThumbnailApiKey') || Promise.resolve({})
    ]);
    for (const value of [local?.openCloudThumbnailApiKey, session?.openCloudThumbnailApiKey]) {
      const key = typeof value === 'string' ? value.trim() : '';
      if (key.length >= 20 && key.length <= 2048) return key;
    }
  } catch {}
  return '';
}

async function requestOpenCloudJson(path, apiKey) {
  let url;
  try {
    url = new URL(path, OPEN_CLOUD_ORIGIN);
  } catch {
    return { ok: false, status: 400, payload: null, message: 'Invalid Open Cloud request path.' };
  }
  if (url.origin !== OPEN_CLOUD_ORIGIN) return { ok: false, status: 400, payload: null, message: 'Open Cloud request was blocked because its host was not trusted.' };
  const response = await fetch(url.href, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'x-api-key': apiKey }
  });
  const raw = await response.text().catch(() => '');
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  return {
    ok: response.ok,
    status: response.status,
    payload,
    message: response.ok ? '' : getOpenCloudError(payload, `Open Cloud request failed (HTTP ${response.status}).`),
    retryAfterMs: response.status === 429 || response.status >= 500 ? retryDelayFromResponse(response) : 0
  };
}

function normalizeThumbnailOperationPath(operationPath, userId) {
  if (typeof operationPath !== 'string' || operationPath.length > 4096) return '';
  let path = operationPath.trim();
  if (!path) return '';

  if (/^https:\/\//i.test(path)) {
    try {
      const parsed = new URL(path);
      if (parsed.origin !== OPEN_CLOUD_ORIGIN) return '';
      path = parsed.pathname;
    } catch { return ''; }
  }

  path = path.replace(/^\/+/, '');
  if (path.startsWith('cloud/v2/')) path = path.slice('cloud/v2/'.length);
  if (!path.startsWith('users/')) return '';

  const match = path.match(/^users\/(\d+)\/operations\/([^/?#]+)$/);
  if (!match || match[1] !== String(userId)) return '';
  const operationId = match[2];
  if (!/^[A-Za-z0-9._~%+=-]{1,3000}$/.test(operationId)) return '';
  return `/cloud/v2/users/${encodeURIComponent(String(userId))}/operations/${operationId}`;
}

function generatedThumbnailVariants(imageUrl, source) {
  const safe = validGeneratedThumbnailUrl(imageUrl);
  if (!safe) return { imageUrl: '', headshotUrl: '', fullAvatarUrl: '' };
  if (source === 'open-cloud') {
    const upgraded = safe
      .replace(/AvatarHeadshot/g, 'Avatar')
      .replace(/\/(\d+)\/\1\//, '/420/420/')
      .replace(/\/Png\/?$/, '/Png/noFilter')
      .replace(/\/isCircular$/, '/noFilter');
    const fullAvatarUrl = /AvatarHeadshot/i.test(safe) && upgraded !== safe ? validGeneratedThumbnailUrl(upgraded) : '';
    return { imageUrl: safe, headshotUrl: safe, fullAvatarUrl };
  }
  return { imageUrl: safe, headshotUrl: '', fullAvatarUrl: safe };
}

function cacheGeneratedThumbnail(userId, imageUrl, source) {
  const key = String(userId);
  const existing = generatedThumbnailCache.get(key);
  if (existing?.source === 'open-cloud' && source !== 'open-cloud' &&
      Date.now() - existing.timestamp < GENERATED_THUMBNAIL_TTL_MS) return;
  generatedThumbnailCache.set(key, {
    imageUrl,
    source,
    timestamp: Date.now()
  });
  if (generatedThumbnailCache.size > 300) {
    generatedThumbnailCache.delete(generatedThumbnailCache.keys().next().value);
  }
}

async function requestOpenCloudUserThumbnail(userId, apiKey) {
  if (!apiKey) {
    return { imageUrl: '', source: 'none', status: 0, error: 'No Open Cloud API key is configured.' };
  }

  const startPath = `/cloud/v2/users/${encodeURIComponent(String(userId))}:generateThumbnail`;
  let start = await requestOpenCloudJson(startPath, apiKey).catch(() => ({
    ok: false, status: 0, message: 'Could not contact Roblox Open Cloud.'
  }));

  if (!start.ok && start.retryAfterMs && (start.status === 429 || start.status >= 500)) {
    await sleep(start.retryAfterMs);
    start = await requestOpenCloudJson(startPath, apiKey).catch(() => ({
      ok: false, status: 0, message: 'Could not contact Roblox Open Cloud.'
    }));
  }
  if (!start.ok || !start.payload || typeof start.payload !== 'object') {
    const error = start.status === 401 || start.status === 403
      ? `${start.message || 'Open Cloud rejected the API key.'} Check that the key is active and has access to Generate User Thumbnail.`
      : (start.message || 'Open Cloud did not start thumbnail generation.');
    return { imageUrl: '', source: 'none', status: start.status || 0, error };
  }

  let operation = start.payload;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (operation?.error) {
      return {
        imageUrl: '', source: 'none', status: 200,
        error: getOpenCloudError(operation, 'Roblox could not generate this account thumbnail.')
      };
    }

    if (operation?.done === true) {
      const imageUrl = validGeneratedThumbnailUrl(operation?.response?.imageUri);
      if (!imageUrl) {
        return {
          imageUrl: '', source: 'none', status: 200,
          error: 'Generation completed, but Roblox did not return a supported image URL.'
        };
      }
      return { imageUrl, source: 'open-cloud', status: 200, error: '' };
    }

    const operationPath = normalizeThumbnailOperationPath(
      operation?.path || operation?.name || operation?.operationPath,
      userId
    );
    if (!operationPath) {
      return {
        imageUrl: '', source: 'none', status: 200,
        error: 'Roblox returned an operation without a valid polling path.'
      };
    }

    const delay = attempt < 3 ? 500 : attempt < 12 ? 850 : 1250;
    await sleep(delay);
    let poll = await requestOpenCloudJson(operationPath, apiKey).catch(() => ({
      ok: false, status: 0, message: 'Could not check the thumbnail generation operation.'
    }));
    if (!poll.ok && poll.retryAfterMs && (poll.status === 429 || poll.status >= 500)) {
      await sleep(poll.retryAfterMs);
      poll = await requestOpenCloudJson(operationPath, apiKey).catch(() => ({
        ok: false, status: 0, message: 'Could not check the thumbnail generation operation.'
      }));
    }
    if (!poll.ok) {
      return {
        imageUrl: '', source: 'none', status: poll.status || 0,
        error: poll.message || 'Thumbnail operation polling failed.'
      };
    }
    if (!poll.payload || typeof poll.payload !== 'object') {
      return {
        imageUrl: '', source: 'none', status: poll.status || 0,
        error: 'Roblox returned an invalid thumbnail operation response.'
      };
    }
    operation = poll.payload;
  }

  return { imageUrl: '', source: 'none', status: 408, error: 'Thumbnail generation timed out. Try again later.' };
}

async function requestAvatarRenderThumbnail(userId) {
  const id = validUserId(userId);
  if (!id) return { imageUrl: '', source: 'none', status: 400, error: 'Invalid Roblox user ID.' };

  try {
    let avatar = null;
    let avatarStatus = 0;
    let avatarMessage = '';
    const modernUrl = new URL(`/v4/avatar/users/${encodeURIComponent(id)}`, API_ORIGIN);
    modernUrl.searchParams.set('selectionTypes', 'AvatarModel');
    const modernResult = await fastSearchFetch(modernUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }, `avatar-definition-v4:${id}`);

    if (modernResult.ok && modernResult.payload && typeof modernResult.payload === 'object') {
      const definition = modernResult.payload;
      const model = definition.avatarModel || definition.avatarModelV4 || definition.model || definition;
      const assets = Array.isArray(model.assets) ? model.assets : (Array.isArray(definition.assets) ? definition.assets : []);
      const colors = model.bodyColor3s || model.bodyColors3 || definition.bodyColor3s || definition.bodyColors3 || model.bodyColors || definition.bodyColors || {};
      const legacyColorKeys = ['headColor3', 'torsoColor3', 'rightArmColor3', 'leftArmColor3', 'rightLegColor3', 'leftLegColor3'];
      const normalizedColorKeys = ['headColor', 'torsoColor', 'rightArmColor', 'leftArmColor', 'rightLegColor', 'leftLegColor'];
      const colorValues = legacyColorKeys.map((key, index) => colors[key] ?? colors[normalizedColorKeys[index]]);
      const hasLegacyColors = colorValues.every((value) => value && typeof value === 'object' &&
        Number.isFinite(Number(value.r)) && Number.isFinite(Number(value.g)) && Number.isFinite(Number(value.b)));
      if (assets.length && hasLegacyColors) {
        avatar = {
          assets,
          bodyColor3s: Object.fromEntries(legacyColorKeys.map((key, index) => [key, colorValues[index]])),
          scales: model.scales || model.scale || definition.scales || definition.scale || {},
          playerAvatarType: model.playerAvatarType || definition.playerAvatarType || 'R15'
        };
      }
      avatarStatus = modernResult.status || 200;
    } else {
      avatarStatus = modernResult.status || 0;
      avatarMessage = modernResult.message || '';
    }

    if (!avatar) {
      const legacyUrl = new URL(`/v2/avatar/users/${encodeURIComponent(id)}/avatar`, API_ORIGIN);
      const legacyResult = await fastSearchFetch(legacyUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      }, `avatar-definition-v2:${id}`);
      if (legacyResult.ok && legacyResult.payload && typeof legacyResult.payload === 'object') {
        avatar = legacyResult.payload;
        avatarStatus = legacyResult.status || 200;
      } else {
        avatarStatus = legacyResult.status || avatarStatus;
        avatarMessage = legacyResult.message || avatarMessage;
      }
    }

    if (!avatar || typeof avatar !== 'object') {
      return {
        imageUrl: '', source: 'none', status: avatarStatus,
        error: `Could not retrieve the avatar definition: ${avatarMessage || 'Roblox returned no render-compatible avatar data.'}`
      };
    }

    const colors = avatar.bodyColor3s || avatar.bodyColors || {};
    const avatarDefinition = {
      assets: (Array.isArray(avatar.assets) ? avatar.assets : []).map((asset) => ({
        id: asset?.id,
        name: asset?.name,
        assetType: asset?.assetType,
        currentVersionId: asset?.currentVersionId
      })).filter((asset) => Number.isFinite(Number(asset.id)) && Number(asset.id) > 0),
      bodyColors: {
        headColor: colors.headColor3 ?? colors.headColor,
        torsoColor: colors.torsoColor3 ?? colors.torsoColor,
        rightArmColor: colors.rightArmColor3 ?? colors.rightArmColor,
        leftArmColor: colors.leftArmColor3 ?? colors.leftArmColor,
        rightLegColor: colors.rightLegColor3 ?? colors.rightLegColor,
        leftLegColor: colors.leftLegColor3 ?? colors.leftLegColor
      },
      scales: avatar.scales || avatar.scale || {},
      playerAvatarType: { playerAvatarType: avatar.playerAvatarType || 'R15' }
    };

    if (!avatarDefinition.assets.length || Object.values(avatarDefinition.bodyColors).some((value) => !value)) {
      return { imageUrl: '', source: 'none', status: avatarStatus, error: 'Roblox did not return the avatar parts needed for rendering.' };
    }

    const renderUrl = new URL('/v1/avatar/render', API_ORIGIN);
    const body = JSON.stringify({
      thumbnailConfig: { thumbnailId: 1, thumbnailType: '2d', size: '420x420' },
      avatarDefinition
    });
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    const request = (extraHeaders = {}) => fetch(renderUrl.href, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { ...headers, ...extraHeaders },
      body
    });

    let response = await request();
    if (response.status === 403) {
      const csrfToken = response.headers.get('x-csrf-token');
      if (csrfToken) response = await request({ 'x-csrf-token': csrfToken });
    }

    const payload = await response.json().catch(() => null);
    const imageUrl = validGeneratedThumbnailUrl(payload?.imageUrl || payload?.imageUri);
    if (!response.ok || !imageUrl) {
      return {
        imageUrl: '', source: 'none', status: response.status || 0,
        error: getOpenCloudError(payload, `Avatar rendering failed (HTTP ${response.status || 0}).`)
      };
    }
    cacheGeneratedThumbnail(id, imageUrl, 'avatar-render');
    return { imageUrl, source: 'avatar-render', status: 200, error: '' };
  } catch (error) {
    return {
      imageUrl: '', source: 'none', status: 0,
      error: error?.message || 'Could not render this Roblox avatar.'
    };
  }
}

async function fetchGeneratedUserThumbnail(userId, cloudOnly = false, sender = null, forceRefresh = false) {
  const cacheKey = String(userId);
  const apiKey = await getSessionThumbnailApiKey();
  const cached = generatedThumbnailCache.get(cacheKey);
  const cachedIsUsable = cached && (
    cached.source === 'open-cloud' ||
    (!cloudOnly && !apiKey && cached.source === 'avatar-render')
  );
  const attach2dFallback = async (variants, source, status = 200, error = '') => {
    let fullAvatarUrl = variants.fullAvatarUrl || (source === 'avatar-render' ? variants.imageUrl : '');
    let fullAvatarSource = fullAvatarUrl ? source : 'none';
    let fullAvatarRenderAttempted = source === 'avatar-render';

    if (!fullAvatarUrl && !cloudOnly) {
      fullAvatarRenderAttempted = true;
      const rendered = await requestAvatarRenderThumbnail(userId);
      if (rendered.imageUrl) {
        fullAvatarUrl = rendered.imageUrl;
        fullAvatarSource = 'avatar-render';
      } else if (rendered.error) {
        error = [error, rendered.error].filter(Boolean).join(' | ');
      }
    }

    return {
      ...variants,
      fullAvatarUrl,
      source,
      headshotSource: variants.headshotUrl ? source : 'none',
      fullAvatarSource,
      fullAvatarRenderAttempted,
      status,
      error
    };
  };

  if (!forceRefresh && cachedIsUsable && Date.now() - cached.timestamp < GENERATED_THUMBNAIL_TTL_MS) {
    return attach2dFallback(generatedThumbnailVariants(cached.imageUrl, cached.source), cached.source || 'open-cloud');
  }
  if (forceRefresh || (cached && Date.now() - cached.timestamp >= GENERATED_THUMBNAIL_TTL_MS)) generatedThumbnailCache.delete(cacheKey);

  const inflightKey = `${userId}:${cloudOnly ? 'cloud' : 'generated'}${forceRefresh ? ':refresh' : ''}`;
  if (generatedThumbnailInFlight.has(inflightKey)) return generatedThumbnailInFlight.get(inflightKey);

  const task = (async () => {
    const failures = [];

    if (apiKey) {
      const cloud = await requestOpenCloudUserThumbnail(userId, apiKey);
      if (cloud.imageUrl) {
        cacheGeneratedThumbnail(userId, cloud.imageUrl, 'open-cloud');
        return attach2dFallback(generatedThumbnailVariants(cloud.imageUrl, 'open-cloud'), 'open-cloud', cloud.status || 200);
      }
      failures.push(cloud.error || 'Open Cloud did not return a generated thumbnail.');
    } else {
      failures.push('No Open Cloud API key is configured.');
    }

    if (cloudOnly) {
      return {
        imageUrl: '', headshotUrl: '', fullAvatarUrl: '', source: 'none',
        headshotSource: 'none', fullAvatarSource: 'none',
        fullAvatarRenderAttempted: false, status: 0, error: failures.join(' | ')
      };
    }

    const rendered = await requestAvatarRenderThumbnail(userId);
    if (rendered.imageUrl) {
      return attach2dFallback(generatedThumbnailVariants(rendered.imageUrl, 'avatar-render'), 'avatar-render', 200, failures.join(' | '));
    }
    failures.push(rendered.error || 'Avatar renderer did not return an image.');

    return {
      imageUrl: '',
      headshotUrl: '',
      fullAvatarUrl: '',
      source: 'none',
      headshotSource: 'none',
      fullAvatarSource: 'none',
      fullAvatarRenderAttempted: true,
      status: 0,
      error: failures.join(' | ') || 'Neither Open Cloud nor avatar rendering returned an image.'
    };
  })().catch((error) => ({
    imageUrl: '',
    headshotUrl: '',
    fullAvatarUrl: '',
    source: 'none',
    headshotSource: 'none',
    fullAvatarSource: 'none',
    fullAvatarRenderAttempted: false,
    status: 0,
    error: error?.message || 'Unexpected generated-thumbnail error.'
  }));

  generatedThumbnailInFlight.set(inflightKey, task);
  try { return await task; }
  finally { if (generatedThumbnailInFlight.get(inflightKey) === task) generatedThumbnailInFlight.delete(inflightKey); }
}

async function testGeneratedThumbnailApiKey(userId) {
  const apiKey = await getSessionThumbnailApiKey();
  if (!apiKey) return { ok: false, message: 'No API key is configured for this browser session. Create a key in Creator Dashboard, paste it above, and save it for this session.' };

  const id = validUserId(userId);
  if (!id) return { ok: false, message: 'Enter the numeric ID of a banned/deleted account to test its thumbnail.' };

  const result = await fetchGeneratedUserThumbnail(id, true, null, true);
  return result.imageUrl
    ? { ok: true, userId: id, source: result.source, imageUrl: result.imageUrl, message: `Open Cloud generated a thumbnail for user ${id}.` }
    : { ok: false, userId: id, status: result.status || 0, message: result.error || 'Thumbnail generation test failed.' };
}

function isRobloxContentSender(sender) {
  const source = sender?.url || sender?.tab?.url || '';
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && url.hostname === 'www.roblox.com';
  } catch {
    return false;
  }
}

function isDeletedProfileExtensionSender(sender) {
  const source = sender?.url || '';
  try {
    const url = new URL(source);
    return sender?.id === chrome.runtime.id &&
      url.protocol === 'chrome-extension:' &&
      url.hostname === chrome.runtime.id &&
      url.pathname === '/deleted-user-profile.html';
  } catch {
    return false;
  }
}

function validUserId(value) {
  const id = String(value ?? '');
  return /^\d{1,20}$/.test(id) ? id : null;
}

function parseRetryValue(value, unit = 'seconds') {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (unit === 'milliseconds') return numeric;
    if (numeric > 1e12) return numeric - Date.now();
    if (numeric > 1e9) return numeric * 1000 - Date.now();
    return numeric * 1000;
  }
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? timestamp - Date.now() : 0;
}

function retryAfterMs(response, payload) {
  const headers = response.headers;
  const remainingRaw = headers.get('x-ratelimit-remaining');
  const remaining = remainingRaw == null ? null : Number.parseInt(remainingRaw, 10);
  const resetRaw = headers.get('x-ratelimit-reset') || headers.get('ratelimit-reset');
  const resetMs = parseRetryValue(resetRaw);

  if (response.status === 429) {
    const retryMsHeader = headers.get('retry-after-ms') || headers.get('retry-in-ms');
    const retryHeader = headers.get('retry-after') || headers.get('retry-in');
    let duration = parseRetryValue(retryMsHeader, 'milliseconds') ||
      parseRetryValue(retryHeader) || resetMs;

    const error = payload?.errors?.[0];
    const bodySeconds = error?.retryAfterSeconds ?? error?.retryAfter ?? error?.retryInSeconds ?? error?.retryIn ??
      payload?.retryAfterSeconds ?? payload?.retryAfter ?? payload?.retryInSeconds ?? payload?.retryIn;
    if (!duration && bodySeconds !== undefined) duration = parseRetryValue(bodySeconds);

    if (!duration) {
      const message = String(payload?.errors?.[0]?.message || payload?.message || '');
      const match = message.match(/retry(?:\s|\-)?(?:in|after)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|seconds?)?/i);
      if (match) duration = parseRetryValue(match[1], /^m/i.test(match[2] || '') ? 'milliseconds' : 'seconds');
    }

    return Math.min(MAX_RETRY_MS, Math.max(1000, duration || DEFAULT_RETRY_MS));
  }

  if (Number.isFinite(remaining) && remaining <= 0 && resetMs > 0) {
    return Math.min(MAX_RETRY_MS, Math.max(1000, resetMs));
  }

  return 0;
}

function jsonResult(response, payload) {
  const remainingRaw = response.headers.get('x-ratelimit-remaining');
  const remaining = remainingRaw == null ? null : Number.parseInt(remainingRaw, 10);
  return {
    ok: response.ok,
    status: response.status,
    payload,
    message: payload?.errors?.[0]?.message || payload?.message || '',
    rateLimitRemaining: Number.isFinite(remaining) ? remaining : null,
    retryAfterMs: retryAfterMs(response, payload)
  };
}

let voiceStatusCache = null;
let voiceStatusCacheUntil = 0;
const VOICE_STATUS_CACHE_MS = 60000;

async function fetchVoiceChatStatus(force = false) {
  if (!force && voiceStatusCache && voiceStatusCacheUntil > Date.now()) {
    return { ok: true, status: 200, payload: voiceStatusCache, cached: true };
  }

  try {
    const response = await fetch('https://voice.roblox.com/v1/settings', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: payload?.errors?.[0]?.message || payload?.message || 'Could not read Roblox voice chat status.'
      };
    }
    if (!payload || typeof payload !== 'object' ||
        typeof payload.isBanned !== 'boolean' || typeof payload.isVoiceEnabled !== 'boolean') {
      return { ok: false, status: response.status, message: 'Roblox returned an unrecognized voice status.' };
    }
    voiceStatusCache = payload;
    voiceStatusCacheUntil = Date.now() + VOICE_STATUS_CACHE_MS;
    return { ok: true, status: response.status, payload };
  } catch {
    return { ok: false, status: 0, message: 'Could not connect to Roblox voice chat settings.' };
  }
}

async function fetchUserPrivacySettings() {
  const url = `${USER_SETTINGS_ORIGIN}/user-settings-api/v1/user-settings/settings-and-options`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: payload?.errors?.[0]?.message || payload?.message || 'Could not read Roblox privacy settings.'
      };
    }
    return { ok: true, status: response.status, payload };
  } catch {
    return { ok: false, status: 0, message: 'Could not connect to Roblox privacy settings.' };
  }
}

async function postUserPrivacySettings(values) {
  const allowedKeys = [
    'whoCanSeeMyInventory',
    'whoCanSeeMyOnlineStatus',
    'whoCanJoinMeInExperiences'
  ];
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return { ok: false, status: 400, message: 'Invalid privacy settings.' };
  }
  const entries = Object.entries(values);
  if (!entries.length || entries.length > allowedKeys.length ||
      entries.some(([key, value]) => !allowedKeys.includes(key) ||
        typeof value !== 'string' || !value || value.length > 64)) {
    return { ok: false, status: 400, message: 'Invalid privacy settings.' };
  }

  const url = `${USER_SETTINGS_ORIGIN}/user-settings-api/v1/user-settings`;
  const request = async (csrfToken) => {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers,
      body: JSON.stringify(values)
    });
    const payload = await response.json().catch(() => null);
    return { response, payload };
  };

  try {
    let result = await request('');
    if (result.response.status === 403) {
      const csrfToken = result.response.headers.get('x-csrf-token');
      if (csrfToken) result = await request(csrfToken);
    }
    if (!result.response.ok) {
      return {
        ok: false,
        status: result.response.status,
        message: result.payload?.errors?.[0]?.message || result.payload?.message || 'Roblox rejected the privacy update.'
      };
    }
    return { ok: true, status: result.response.status, payload: result.payload };
  } catch {
    return { ok: false, status: 0, message: 'Could not connect to Roblox privacy settings.' };
  }
}

function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value, ttlMs = CACHE_TTL_MS) {
  responseCache.set(key, { value, expiresAt: Date.now() + Math.max(1000, ttlMs) });
  if (responseCache.size > 80) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
}

async function fastSearchFetch(url, options, cacheKey) {
  const cached = cacheKey ? getCached(cacheKey) : null;
  if (cached) return { ...cached, retryAfterMs: 0, cached: true };
  if (cacheKey && fastSearchInFlight.has(cacheKey)) return fastSearchInFlight.get(cacheKey);

  const origin = url.origin;
  const previous = fastSearchQueues.get(origin) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const now = Date.now();
    const cooldownWait = Math.max(0, (originRateLimitUntil.get(origin) || 0) - now);
    const elapsed = now - (fastSearchLastRequestAt.get(origin) || 0);
    const pacingWait = Math.max(0, FAST_SEARCH_REQUEST_GAP_MS - elapsed);
    const wait = Math.max(cooldownWait, pacingWait);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if ((originRateLimitUntil.get(origin) || 0) <= Date.now()) originRateLimitUntil.delete(origin);

    const requestedAt = Date.now();
    fastSearchLastRequestAt.set(origin, requestedAt);
    lastRequestAt.set(origin, requestedAt);
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => null);
    const result = jsonResult(response, payload);
    if (result.retryAfterMs > 0) {
      originRateLimitUntil.set(origin, Date.now() + result.retryAfterMs + 250);
    }
    const isUserThumbnailEndpoint = origin === THUMBNAIL_ORIGIN && /^\/v1\/users\/avatar(?:-headshot|-bust)?$/.test(url.pathname);
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const hasCompletedThumbnail = rows.some((row) => {
      const state = row?.state;
      const imageUrl = validGeneratedThumbnailUrl(row?.imageUrl);
      return imageUrl && (!state || state === 'Completed') && !/(?:unapprovedimage|placeholder|blocked)/i.test(imageUrl);
    });
    if (result.ok && cacheKey && (!isUserThumbnailEndpoint || hasCompletedThumbnail)) {
      setCached(cacheKey, { ...result, retryAfterMs: 0 }, FAST_SEARCH_CACHE_TTL_MS);
    }
    return result;
  });

  fastSearchQueues.set(origin, task.then(() => undefined, () => undefined));
  if (cacheKey) {
    fastSearchInFlight.set(cacheKey, task);
    const cleanup = () => {
      if (fastSearchInFlight.get(cacheKey) === task) fastSearchInFlight.delete(cacheKey);
    };
    task.then(cleanup, cleanup);
  }
  return task;
}

async function pacedFetch(url, options, cacheKey, cooldownBufferMs = 0) {
  const cached = cacheKey ? getCached(cacheKey) : null;
  if (cached) return { ...cached, retryAfterMs: 0 };

  const origin = url.origin;
  const previous = originQueues.get(origin) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const now = Date.now();
    const resetUntil = originRateLimitUntil.get(origin) || 0;
    const resetWait = Math.max(0, resetUntil - now);
    const elapsed = now - (lastRequestAt.get(origin) || 0);
    const pacingWait = Math.max(0, REQUEST_GAP_MS - elapsed);
    const wait = Math.max(resetWait, pacingWait);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if ((originRateLimitUntil.get(origin) || 0) <= Date.now()) originRateLimitUntil.delete(origin);
    lastRequestAt.set(origin, Date.now());

    const response = await fetch(url, options);
    const payload = await response.json().catch(() => null);
    const result = jsonResult(response, payload);
    if (result.retryAfterMs > 0) {
      const buffer = Number.isFinite(cooldownBufferMs) ? Math.max(0, cooldownBufferMs) : 0;
      originRateLimitUntil.set(origin, Date.now() + result.retryAfterMs + buffer);
    }
    if (result.ok && cacheKey) setCached(cacheKey, { ...result, retryAfterMs: 0 });
    return result;
  });
  originQueues.set(origin, task.then(() => undefined, () => undefined));
  return task;
}

async function fetchOutfitPage(message) {
  const userId = validUserId(message.userId);
  const paginationToken = message.paginationToken == null ? '' : String(message.paginationToken);
  if (!userId || paginationToken.length > 4096) {
    return { ok: false, status: 400, message: 'Invalid profile or outfit cursor.' };
  }

  const url = new URL(`${API_ORIGIN}/v2/avatar/users/${userId}/outfits`);
  url.searchParams.set('itemsPerPage', String(PAGE_SIZE));
  url.searchParams.set('isEditable', 'true');
  if (paginationToken) url.searchParams.set('paginationToken', paginationToken);

  const cacheKey = `outfits:${url.href}`;
  return pacedFetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  }, cacheKey);
}

async function fetchOutfitThumbnails(message) {
  const ids = Array.isArray(message.outfitIds)
    ? [...new Set(message.outfitIds.map((value) => String(value)))]
    : [];
  if (!ids.length || ids.length > PAGE_SIZE || ids.some((id) => !/^\d{1,20}$/.test(id))) {
    return { ok: false, status: 400, message: 'Invalid outfit ID list.' };
  }

  const url = new URL(`${THUMBNAIL_ORIGIN}/v1/users/outfits`);
  url.searchParams.set('userOutfitIds', ids.join(','));
  url.searchParams.set('size', '150x150');
  url.searchParams.set('format', 'Png');
  url.searchParams.set('isCircular', 'false');

  const cacheKey = `thumbnails:${ids.join(',')}`;
  return pacedFetch(url, {
    method: 'GET',
    credentials: 'omit',
    cache: 'default',
    headers: { Accept: 'application/json' }
  }, cacheKey);
}

async function fetchBadgesPage(message) {
  const userId = validUserId(message.userId);
  const cursor = message.cursor == null ? '' : String(message.cursor);
  if (!userId || cursor.length > 4096) return { ok: false, status: 400, message: 'Invalid badge request.' };
  const url = new URL(`/v1/users/${userId}/badges`, BADGES_ORIGIN);
  url.searchParams.set('limit', '100');
  url.searchParams.set('sortOrder', 'Desc');
  if (cursor) url.searchParams.set('cursor', cursor);
  return pacedFetch(url, {
    method: 'GET', credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' }
  }, `badges:${url.href}`);
}

async function fetchBadgeIcons(message) {
  const ids = Array.isArray(message.badgeIds) ? [...new Set(message.badgeIds.map(String))] : [];
  if (!ids.length || ids.length > 100 || ids.some((id) => !/^\d{1,20}$/.test(id))) {
    return { ok: false, status: 400, message: 'Invalid badge ID list.' };
  }
  const url = new URL('/v1/badges/icons', THUMBNAIL_ORIGIN);
  url.searchParams.set('badgeIds', ids.join(','));
  url.searchParams.set('size', '150x150');
  url.searchParams.set('format', 'Webp');
  url.searchParams.set('isCircular', 'false');
  return pacedFetch(url, {
    method: 'GET', credentials: 'omit', cache: 'default', headers: { Accept: 'application/json' }
  }, `badge-icons:${ids.join(',')}`);
}

async function fetchFavoritePlacesPage(message) {
  const userId = validUserId(message.userId);
  const cursor = message.cursor == null ? '' : String(message.cursor);
  if (!userId || cursor.length > 4096) {
    return { ok: false, status: 400, message: 'Invalid favorite places request.' };
  }
  const url = new URL(`/v2/users/${userId}/favorite/games`, GAMES_ORIGIN);
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('cursor', cursor);
  url.searchParams.set('sortOrder', 'Desc');
  return pacedFetch(url, {
    method: 'GET', credentials: 'omit', cache: 'default', headers: { Accept: 'application/json' }
  }, `favorite-games:${url.href}`);
}

async function fetchFavoritePlaceIcons(message) {
  const ids = Array.isArray(message.universeIds) ? [...new Set(message.universeIds.map(String))] : [];
  if (!ids.length || ids.length > 100 || ids.some((id) => !/^\d{1,20}$/.test(id))) {
    return { ok: false, status: 400, message: 'Invalid favorite place ID list.' };
  }
  const url = new URL('/v1/games/icons', THUMBNAIL_ORIGIN);
  url.searchParams.set('universeIds', ids.join(','));
  url.searchParams.set('size', '150x150');
  url.searchParams.set('format', 'Webp');
  url.searchParams.set('isCircular', 'false');
  return pacedFetch(url, {
    method: 'GET', credentials: 'omit', cache: 'default', headers: { Accept: 'application/json' }
  }, `favorite-game-icons:${ids.join(',')}`);
}

async function fetchGameServers(message) {
  const placeId = validUserId(message.placeId);
  const kind = message.kind === 'private' ? 'private' : message.kind === 'public' ? 'public' : null;
  const cursor = message.cursor == null ? '' : String(message.cursor);
  if (!placeId || !kind || cursor.length > 4096) {
    return { ok: false, status: 400, message: 'Invalid game server request.' };
  }

  const path = kind === 'public'
    ? `/v2/games/${placeId}/servers/Public`
    : `/v1/games/${placeId}/private-servers`;
  const url = new URL(path, GAMES_ORIGIN);
  url.searchParams.set('cursor', cursor);
  url.searchParams.set('sortOrder', 'Desc');
  url.searchParams.set('excludeFullGames', kind === 'public' ? 'true' : 'false');
  url.searchParams.set('limit', '100');
  if (kind === 'public') url.searchParams.set('orderBy', 'BestLatency');

  try {
    const result = await pacedFetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }, null, 1000);

    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        rateLimitRemaining: result.rateLimitRemaining,
        retryAfterMs: result.retryAfterMs,
        message: result.message ||
          (kind === 'private' ? 'Private server list is not available.' : 'Could not load public servers.')
      };
    }

    const payload = result.payload || {};
    const source = Array.isArray(payload.data) ? payload.data : [];
    const data = source.map((server) => {
      if (kind === 'public') {
        return {
          id: String(server?.id || ''),
          playing: Number(server?.playing) || 0,
          maxPlayers: Number(server?.maxPlayers) || 0,
          ping: typeof server?.ping === 'number' && Number.isFinite(server.ping) ? server.ping : null,
          fps: typeof server?.fps === 'number' && Number.isFinite(server.fps) ? server.fps : null,
          friendCount: Number(server?.friendCount) || 0
        };
      }
      const owner = server?.owner && typeof server.owner === 'object' ? server.owner : {};
      return {
        name: typeof server?.name === 'string' ? server.name.slice(0, 160) : '',
        vipServerId: String(server?.vipServerId || ''),
        accessCode: typeof server?.accessCode === 'string' ? server.accessCode : '',
        linkCode: typeof server?.linkCode === 'string' ? server.linkCode : '',
        playing: Number(server?.playing) || 0,
        maxPlayers: Number(server?.maxPlayers) || 0,
        owner: {
          id: String(owner.id || ''),
          name: typeof owner.name === 'string' ? owner.name.slice(0, 64) : '',
          displayName: typeof owner.displayName === 'string' ? owner.displayName.slice(0, 64) : '',
          hasVerifiedBadge: owner.hasVerifiedBadge === true
        }
      };
    });

    return {
      ok: true,
      status: result.status,
      rateLimitRemaining: result.rateLimitRemaining,
      retryAfterMs: result.retryAfterMs,
      payload: {
        data,
        previousPageCursor: payload.previousPageCursor || null,
        nextPageCursor: payload.nextPageCursor || null,
        gameJoinRestricted: payload.gameJoinRestricted === true
      }
    };
  } catch {
    return { ok: false, status: 0, message: 'Could not connect to Roblox game servers.' };
  }
}

async function fetchGameServerFriendNames(message) {
  const placeId = validUserId(message.placeId);
  const serverId = String(message.serverId || '').toLowerCase();
  const initialCursor = message.cursor == null ? '' : String(message.cursor);
  if (!placeId || !/^[\da-f-]{16,64}$/i.test(serverId) || initialCursor.length > 4096) {
    return { ok: false, status: 400, message: 'Invalid friend server lookup.' };
  }

  let cursor = initialCursor;
  try {
    for (let page = 0; page < 5; page += 1) {
      const url = new URL(`/v1/games/${placeId}/servers/Friend`, GAMES_ORIGIN);
      url.searchParams.set('cursor', cursor);
      url.searchParams.set('sortOrder', 'Desc');
      url.searchParams.set('excludeFullGames', 'false');

      const result = await pacedFetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      }, null, 1000);

      if (!result.ok) {
        return {
          ok: false,
          status: result.status,
          rateLimitRemaining: result.rateLimitRemaining,
          retryAfterMs: result.retryAfterMs,
          message: result.message || 'Could not load friends in this server.'
        };
      }

      const payload = result.payload || {};
      const servers = Array.isArray(payload.data) ? payload.data : [];
      const match = servers.find((server) => String(server?.id || '').toLowerCase() === serverId);
      if (match) {
        const names = [];
        const seen = new Set();
        const players = Array.isArray(match.players) ? match.players : [];
        for (const player of players) {
          const displayName = typeof player?.displayName === 'string'
            ? player.displayName.trim().slice(0, 64) : '';
          if (!displayName) continue;
          const key = displayName.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          names.push(displayName);
        }
        return { ok: true, status: result.status, serverFound: true, names };
      }

      cursor = typeof payload.nextPageCursor === 'string' ? payload.nextPageCursor : '';
      if (!cursor) break;
    }

    return { ok: true, status: 200, serverFound: false, names: [] };
  } catch {
    return { ok: false, status: 0, message: 'Could not connect to Roblox friend servers.' };
  }
}

async function fetchAuthenticatedTransactionUser() {
  try {
    const response = await fetch(`${AUTHENTICATED_USER_ORIGIN}/v1/users/authenticated`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !/^\d{1,20}$/.test(String(payload?.id ?? ''))) {
      return {
        ok: false,
        status: response.status,
        message: response.status === 401
          ? 'Sign in to Roblox to scan your transactions.'
          : payload?.errors?.[0]?.message || payload?.message || 'Could not identify the signed-in Roblox account.'
      };
    }
    return { ok: true, status: response.status, userId: String(payload.id) };
  } catch {
    return { ok: false, status: 0, message: 'Could not connect to your Roblox account.' };
  }
}

const DELETED_PROFILE_API_ORIGINS = Object.freeze({
  users: AUTHENTICATED_USER_ORIGIN,
  inventory: 'https://inventory.roblox.com',
  friends: 'https://friends.roblox.com',
  avatar: API_ORIGIN,
  thumbnails: THUMBNAIL_ORIGIN,
  groups: 'https://groups.roblox.com',
  badges: BADGES_ORIGIN,
  games: GAMES_ORIGIN,
  catalog: 'https://catalog.roblox.com',
  economy: 'https://economy.roblox.com'
});
const DELETED_PROFILE_API_RULES = Object.freeze({
  users: [['GET', /^\/v1\/users\/\d+$/], ['GET', /^\/v1\/users\/\d+\/username-history$/], ['POST', /^\/v1\/users$/]],
  inventory: [['GET', /^\/v1\/users\/\d+\/assets\/collectibles$/]],
  friends: [['GET', /^\/v1\/users\/\d+\/(?:friends\/count|followers\/count|followings\/count|friends\/find|followers|followings)$/]],
  avatar: [['GET', /^\/v4\/avatar\/users\/\d+$/], ['GET', /^\/v1\/users\/\d+\/currently-wearing$/]],
  thumbnails: [['GET', /^\/v1\/users\/(?:avatar-headshot|avatar-bust|avatar)$/], ['GET', /^\/v1\/(?:assets|games\/icons|groups\/icons|badges\/icons)$/]],
  groups: [['GET', /^\/v1\/users\/\d+\/groups\/roles$/]],
  badges: [['GET', /^\/v1\/users\/\d+\/badges$/]],
  games: [['GET', /^\/v2\/users\/\d+\/(?:games|favorite\/games)$/]],
  catalog: [['GET', /^\/v2\/search\/items\/details$/], ['POST', /^\/v1\/catalog\/items\/details$/]],
  economy: [['GET', /^\/v2\/assets\/\d+\/details$/]]
});

async function fetchDeletedProfileApi(message) {
  const apiName = typeof message.api === 'string' ? message.api : '';
  const origin = DELETED_PROFILE_API_ORIGINS[apiName];
  const method = message.method === 'POST' ? 'POST' : 'GET';
  const path = typeof message.path === 'string' ? message.path : '';
  if (!origin || !path.startsWith('/') || path.length > 8192 || path.includes('#')) return { ok:false,status:400,payload:null };
  let url;
  try { url = new URL(path, origin); } catch { return { ok:false,status:400,payload:null }; }
  if (url.origin !== origin || !(DELETED_PROFILE_API_RULES[apiName] || []).some(([m,p]) => m === method && p.test(url.pathname))) return { ok:false,status:403,payload:null };
  let body;
  if (method === 'POST') {
    if (!message.body || typeof message.body !== 'object' || Array.isArray(message.body)) return {ok:false,status:400,payload:null};
    body = JSON.stringify(message.body);
    if (body.length > 50000) return {ok:false,status:413,payload:null};
  }
  const options = {method,credentials:'include',cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body}:{})};
  const cacheKey = method === 'GET' ? `deleted-profile-api:${url.href}` : null;
  if (message.parallel === true) {
    const cached = cacheKey ? getCached(cacheKey) : null;
    if (cached) return {...cached,retryAfterMs:0,cached:true};
    if (cacheKey && parallelProfileRequests.has(cacheKey)) return parallelProfileRequests.get(cacheKey);
    const task = (async () => {
      const wait = Math.max(0,(originRateLimitUntil.get(url.origin)||0)-Date.now());
      if (wait) await new Promise(resolve => setTimeout(resolve,wait));
      let response = await fetch(url,options);
      if (method === 'POST' && response.status === 403) {
        const csrfToken = response.headers.get('x-csrf-token');
        if (csrfToken) {
          response = await fetch(url, {
            ...options,
            headers: { ...options.headers, 'x-csrf-token': csrfToken }
          });
        }
      }
      const payload = await response.json().catch(()=>null);
      const result = jsonResult(response,payload);
      if (result.retryAfterMs > 0) originRateLimitUntil.set(url.origin,Math.max(originRateLimitUntil.get(url.origin)||0,Date.now()+result.retryAfterMs));
      const isUserThumbnailEndpoint = apiName === 'thumbnails' && /^\/v1\/users\/avatar(?:-headshot|-bust)?$/.test(url.pathname);
      const thumbnailRows = Array.isArray(payload?.data) ? payload.data : [];
      const hasCompletedThumbnail = thumbnailRows.some((row) => {
        const state = row?.state;
        const imageUrl = validGeneratedThumbnailUrl(row?.imageUrl);
        return imageUrl && (!state || state === 'Completed') && !/(?:unapprovedimage|placeholder|blocked)/i.test(imageUrl);
      });
      if (result.ok && cacheKey && (!isUserThumbnailEndpoint || hasCompletedThumbnail)) {
        setCached(cacheKey,{...result,retryAfterMs:0},isUserThumbnailEndpoint ? 300000 : CACHE_TTL_MS);
      }
      return result;
    })().catch(()=>({ok:false,status:0,payload:null,message:'Roblox profile API request failed.',retryAfterMs:0}));
    if (cacheKey) { parallelProfileRequests.set(cacheKey,task); task.finally(()=>{if(parallelProfileRequests.get(cacheKey)===task)parallelProfileRequests.delete(cacheKey);}); }
    return task;
  }
  return pacedFetch(url,options,cacheKey);
}

async function fetchUserByUsername(message) {
  const username = typeof message.username === 'string' ? message.username.trim().replace(/^@/, '') : '';
  if (!/^[a-z0-9_]{3,20}$/i.test(username)) {
    return { ok: false, status: 400, message: 'Enter an exact Roblox username.' };
  }

  const lookupUrl = new URL('/v1/usernames/users', AUTHENTICATED_USER_ORIGIN);
  const lookup = await fastSearchFetch(lookupUrl, {
    method: 'POST',
    credentials: 'omit',
    cache: 'default',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
  }, `user-search:${username.toLowerCase()}`);

  if (!lookup.ok) {
    return {
      ok: false,
      status: lookup.status,
      retryAfterMs: lookup.retryAfterMs,
      message: lookup.message || 'Could not look up this username.'
    };
  }

  const matches = Array.isArray(lookup.payload?.data) ? lookup.payload.data : [];
  const exactMatch = matches.find((item) =>
    String(item?.requestedUsername || '').toLowerCase() === username.toLowerCase() ||
    String(item?.name || '').toLowerCase() === username.toLowerCase()
  );
  const userId = validUserId(exactMatch?.id);
  if (!userId) return { ok: true, status: lookup.status, found: false };

  const name = typeof exactMatch.name === 'string' && exactMatch.name.trim()
    ? exactMatch.name.trim().slice(0, 64)
    : username;
  const displayName = typeof exactMatch.displayName === 'string' && exactMatch.displayName.trim()
    ? exactMatch.displayName.trim().slice(0, 64)
    : name;

  return {
    ok: true,
    status: lookup.status,
    found: true,
    user: {
      id: userId,
      name,
      displayName,
      thumbnailUrl: '',
      requestedUsername: username,
      hasVerifiedBadge: exactMatch.hasVerifiedBadge === true,
      isBanned: false,
      banStatusKnown: false
    }
  };
}

async function fetchPublicUserThumbnail(userId, type, size = '150x150') {
  const endpointByType = {
    AvatarHeadshot: 'avatar-headshot',
    AvatarBust: 'avatar-bust',
    Avatar: 'avatar'
  };
  const endpoint = endpointByType[type];
  if (!endpoint) return { imageUrl: '', status: 400, error: 'Unsupported user thumbnail type.' };

  const url = new URL(`/v1/users/${endpoint}`, THUMBNAIL_ORIGIN);
  url.searchParams.set('userIds', userId);
  url.searchParams.set('size', size);
  url.searchParams.set('format', 'Png');
  url.searchParams.set('isCircular', 'false');
  url.searchParams.set('returnPolicy', 'PlaceHolder');
  const baseCacheKey = `user-${type.toLowerCase()}:${userId}:${size}`;
  let lastResult = { imageUrl: '', status: 0, error: 'Roblox did not return a user thumbnail.' };

  for (let attempt = 0; attempt <= 4; attempt += 1) {
    if (attempt > 0) await sleep(900);
    const cacheKey = attempt === 0 ? baseCacheKey : `${baseCacheKey}:retry:${attempt}`;
    const result = await fastSearchFetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: attempt === 0 ? 'default' : 'no-store',
      headers: { Accept: 'application/json' }
    }, cacheKey);

    if (!result.ok) {
      lastResult = { imageUrl: '', status: result.status, retryAfterMs: result.retryAfterMs, error: result.message || '' };
      if (result.status === 429 || result.status >= 500) continue;
      return lastResult;
    }

    const row = Array.isArray(result.payload?.data)
      ? result.payload.data.find((item) => String(item?.targetId) === userId)
      : null;
    const candidate = typeof row?.imageUrl === 'string' ? row.imageUrl : '';
    const imageUrl = validGeneratedThumbnailUrl(candidate);
    const isPlaceholder = /unapprovedimage|placeholder|blocked/i.test(candidate);
    const state = row?.state || 'Unknown';
    const isCompleted = !row?.state || row.state === 'Completed';
    if (imageUrl && isCompleted && !isPlaceholder) {
      return { imageUrl, status: result.status, state, error: '' };
    }

    lastResult = {
      imageUrl: '',
      status: result.status,
      state,
      error: 'Roblox did not return a completed user thumbnail.'
    };
    if (state !== 'Pending' && state !== 'InReview') break;
  }

  return lastResult;
}


async function fetchUserThumbnail(message, sender) {
  const userId = validUserId(message.userId);
  if (!userId) {
    return { ok: false, status: 400, imageUrl: '', iconUrl: '', iconType: '', headshotUrl: '', fullAvatarUrl: '', source: 'none' };
  }

  const excludedUrls = new Set(
    (Array.isArray(message.excludeUrls) ? message.excludeUrls : [])
      .slice(0, 8)
      .map(validGeneratedThumbnailUrl)
      .filter(Boolean)
  );
  const usable = (value) => {
    const url = validGeneratedThumbnailUrl(value);
    return url && !excludedUrls.has(url) ? url : '';
  };

  if (message.avatarRenderOnly === true) {
    const rendered = await requestAvatarRenderThumbnail(userId);
    const imageUrl = usable(rendered.imageUrl);
    return {
      ok: Boolean(imageUrl),
      status: rendered.status || (imageUrl ? 200 : 0),
      imageUrl,
      iconUrl: imageUrl,
      iconType: imageUrl ? 'Avatar' : '',
      headshotUrl: '',
      fullAvatarUrl: imageUrl,
      source: imageUrl ? 'avatar-render' : 'none',
      headshotSource: 'none',
      fullAvatarSource: imageUrl ? 'avatar-render' : 'none',
      fullAvatarRenderAttempted: true,
      message: imageUrl ? '' : (rendered.error || 'Roblox could not create a static 2D avatar thumbnail.')
    };
  }

  if (message.preferGenerated === true && message.cloudOnly === true) {
    const generated = await fetchGeneratedUserThumbnail(userId, true, sender, excludedUrls.size > 0);
    const headshotUrl = usable(generated.headshotUrl);
    const fullAvatarUrl = usable(generated.fullAvatarUrl);
    const iconUrl = headshotUrl || fullAvatarUrl;
    return {
      ok: Boolean(iconUrl),
      status: generated.status || 200,
      imageUrl: iconUrl,
      iconUrl,
      iconType: headshotUrl ? 'AvatarHeadshot' : (fullAvatarUrl ? 'Avatar' : ''),
      headshotUrl,
      fullAvatarUrl,
      source: generated.source || 'none',
      headshotSource: headshotUrl ? generated.headshotSource || generated.source || 'open-cloud' : 'none',
      fullAvatarSource: fullAvatarUrl ? generated.fullAvatarSource || generated.source : 'none',
      fullAvatarRenderAttempted: generated.fullAvatarRenderAttempted === true,
      message: generated.error || ''
    };
  }

  const forceGenerated = message.forceGenerated === true || message.preferGenerated === true;
  const skipPublicFallback = message.skipPublicFallback === true;
  let publicHeadshot = { imageUrl: '', status: 0, error: 'No public headshot has been returned.' };
  let generated = null;

  if (!forceGenerated) {
    publicHeadshot = await fetchPublicUserThumbnail(userId, 'AvatarHeadshot', '150x150');
  }

  if (forceGenerated || !usable(publicHeadshot.imageUrl)) {
    generated = await fetchGeneratedUserThumbnail(userId, false, sender, excludedUrls.size > 0).catch((error) => ({
      imageUrl: '', headshotUrl: '', fullAvatarUrl: '', source: 'none',
      headshotSource: 'none', fullAvatarSource: 'none', fullAvatarRenderAttempted: false,
      status: 0, error: error?.message || 'Thumbnail generation failed.'
    }));
  }

  let generatedHeadshotUrl = usable(generated?.headshotUrl);
  let publicHeadshotUrl = usable(publicHeadshot.imageUrl);
  if (!generatedHeadshotUrl && !publicHeadshotUrl && forceGenerated && !skipPublicFallback) {
    publicHeadshot = await fetchPublicUserThumbnail(userId, 'AvatarHeadshot', '150x150');
    publicHeadshotUrl = usable(publicHeadshot.imageUrl);
  }

  let bust = null;
  let bustUrl = '';
  if (!generatedHeadshotUrl && !publicHeadshotUrl && !skipPublicFallback) {
    bust = await fetchPublicUserThumbnail(userId, 'AvatarBust', '150x150');
    bustUrl = usable(bust.imageUrl);
  }

  const dedicatedHeadshotUrl = generatedHeadshotUrl || publicHeadshotUrl || bustUrl;
  const headshotSource = generatedHeadshotUrl
    ? (generated.headshotSource || generated.source || 'open-cloud')
    : (dedicatedHeadshotUrl ? 'public-thumbnail' : 'none');
  const headshotType = generatedHeadshotUrl || publicHeadshotUrl ? 'AvatarHeadshot' : (bustUrl ? 'AvatarBust' : '');
  let fullAvatarUrl = usable(generated?.fullAvatarUrl);
  if (!fullAvatarUrl && generated?.source === 'avatar-render') fullAvatarUrl = usable(generated?.imageUrl);
  let publicAvatar = null;
  if (!dedicatedHeadshotUrl && !fullAvatarUrl && !skipPublicFallback) {
    publicAvatar = await fetchPublicUserThumbnail(userId, 'Avatar', '150x150');
    fullAvatarUrl = usable(publicAvatar.imageUrl);
  }
  const iconUrl = dedicatedHeadshotUrl || fullAvatarUrl;
  return {
    ok: Boolean(iconUrl),
    status: generated?.status || publicHeadshot.status || bust?.status || 200,
    imageUrl: iconUrl,
    iconUrl,
    iconType: dedicatedHeadshotUrl ? headshotType : (fullAvatarUrl ? 'Avatar' : ''),
    headshotUrl: dedicatedHeadshotUrl,
    fullAvatarUrl,
    source: generated?.source || headshotSource,
    headshotSource,
    headshotType,
    fullAvatarSource: generated?.fullAvatarSource || (publicAvatar?.imageUrl ? 'public-thumbnail' : (fullAvatarUrl ? generated?.source || 'none' : 'none')),
    fullAvatarRenderAttempted: generated?.fullAvatarRenderAttempted === true,
    message: iconUrl ? '' : (generated?.error || bust?.error || publicHeadshot.error || 'Roblox did not return a usable user thumbnail.')
  };
}

async function fetchUsernameHistory(userId) {
  const url = new URL(`/v1/users/${userId}/username-history`, AUTHENTICATED_USER_ORIGIN);
  url.searchParams.set('limit', '10');
  url.searchParams.set('sortOrder', 'Desc');
  const result = await fastSearchFetch(url, {
    method: 'GET', credentials: 'omit', cache: 'default',
    headers: { Accept: 'application/json' }
  }, `user-name-history:${userId}`);
  if (!result.ok) return '';
  const rows = Array.isArray(result.payload?.data) ? result.payload.data : [];
  const blockedNames = new Set(['deleted user', 'account deleted', 'account forgotten', '']);
  const row = rows.find((entry) => {
    const name = String(entry?.name || '').trim();
    return name && !blockedNames.has(name.toLowerCase());
  });
  return typeof row?.name === 'string' ? row.name.trim().slice(0, 64) : '';
}

async function fetchUserBanStatus(message) {
  const userId = validUserId(message.userId);
  if (!userId) return { ok: false, status: 400, message: 'Invalid Roblox user ID.' };

  const detailsUrl = new URL(`/v1/users/${userId}`, AUTHENTICATED_USER_ORIGIN);
  const details = await fastSearchFetch(detailsUrl, {
    method: 'GET',
    credentials: 'omit',
    cache: 'default',
    headers: { Accept: 'application/json' }
  }, `user-status:${userId}`);

  if (!details.ok && details.status !== 404) {
    return {
      ok: false,
      status: details.status,
      retryAfterMs: details.retryAfterMs,
      message: details.message || 'Could not verify this account status.'
    };
  }

  let info = details.ok && details.payload && typeof details.payload === 'object' ? details.payload : {};
  if (!info.name && !info.displayName && !info.description && !info.created) {
    const batchUrl = new URL('/v1/users', AUTHENTICATED_USER_ORIGIN);
    const batch = await fastSearchFetch(batchUrl, {
      method: 'POST', credentials: 'omit', cache: 'default',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: [Number(userId)] })
    }, `user-by-id-batch:${userId}`);
    const rows = Array.isArray(batch.payload?.data) ? batch.payload.data : [];
    const match = rows.find((row) => String(row?.id) === userId);
    if (batch.ok && match) info = { ...match, ...info };
  }

  const currentName = typeof info.name === 'string' ? info.name.trim().slice(0, 64) : '';
  const genericNames = new Set(['deleted user', 'account deleted', 'account forgotten']);
  const genericName = genericNames.has(currentName.toLowerCase());
  const isBanned = details.status === 404 || info.isBanned === true || genericName;

  let name = currentName;
  if (isBanned && (!name || genericName)) {
    name = await fetchUsernameHistory(userId) || name;
  }

  if (details.ok) {
    setCached(`deleted-profile-api:${detailsUrl.href}`, { ...details, retryAfterMs: 0 }, FAST_SEARCH_CACHE_TTL_MS);
  }

  return {
    ok: true,
    status: details.status,
    userId,
    isBanned,
    name,
    displayName: typeof info.displayName === 'string' ? info.displayName.trim().slice(0, 80) : '',
    description: typeof info.description === 'string' ? info.description.slice(0, 4000) : '',
    created: typeof info.created === 'string' ? info.created : '',
    hasVerifiedBadge: info.hasVerifiedBadge === true
  };
}

async function fetchTransactionPage(message) {
  const cursor = message.cursor == null ? '' : String(message.cursor);
  if (cursor.length > 8192 || typeof message.url !== 'string' || message.url.length > 8192) {
    return { ok: false, status: 400, message: 'Invalid transaction request.' };
  }

  let url;
  try {
    url = new URL(message.url);
  } catch {
    return { ok: false, status: 400, message: 'Invalid transaction request.' };
  }

  if (url.origin !== USER_SETTINGS_ORIGIN || !/^\/transaction-records\/v1\/users\/\d+\/transactions$/.test(url.pathname)) {
    return { ok: false, status: 403, message: 'Unsupported transaction endpoint.' };
  }

  const transactionType = message.transactionType;
  if (transactionType !== 'Purchase' && transactionType !== 'Sale') {
    return { ok: false, status: 400, message: 'Unsupported transaction type.' };
  }
  const requestedLimit = Number(url.searchParams.get('limit') || PAGE_SIZE);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > PAGE_SIZE) {
    return { ok: false, status: 400, message: 'Invalid transaction page size.' };
  }
  url.searchParams.set('limit', String(requestedLimit));
  url.searchParams.set('cursor', cursor);
  url.searchParams.set('transactionType', transactionType);
  url.searchParams.delete('itemPricingType');
  if (transactionType === 'Sale') url.searchParams.set('itemPricingType', 'PaidAndLimited');
  return pacedFetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  }, null);
}

const MESSAGE_OPERATIONS = new Map([
  ['ROIMPR_OUTFITS_PAGE', (message) => fetchOutfitPage(message)],
  ['ROIMPR_OUTFITS_THUMBNAILS', (message) => fetchOutfitThumbnails(message)],
  ['ROIMPR_PRIVACY_GET', () => fetchUserPrivacySettings()],
  ['ROIMPR_PRIVACY_SET', (message) => postUserPrivacySettings(message.values)],
  ['ROIMPR_VOICE_STATUS_GET', (message) => fetchVoiceChatStatus(message.force === true)],
  ['ROIMPR_TRANSACTION_PAGE', (message) => fetchTransactionPage(message)],
  ['ROIMPR_TRANSACTION_USER', () => fetchAuthenticatedTransactionUser()],
  ['ROIMPR_GAME_SERVERS', (message) => fetchGameServers(message)],
  ['ROIMPR_GAME_SERVER_FRIEND_NAMES', (message) => fetchGameServerFriendNames(message)],
  ['ROIMPR_BADGES_PAGE', (message) => fetchBadgesPage(message)],
  ['ROIMPR_BADGE_ICONS', (message) => fetchBadgeIcons(message)],
  ['ROIMPR_FAVORITE_PLACES_PAGE', (message) => fetchFavoritePlacesPage(message)],
  ['ROIMPR_FAVORITE_PLACE_ICONS', (message) => fetchFavoritePlaceIcons(message)],
  ['ROIMPR_USER_LOOKUP', (message) => fetchUserByUsername(message)],
  ['ROIMPR_DELETED_USER_LOOKUP', (message) => fetchUserByUsername(message)],
  ['ROIMPR_USER_STATUS', (message) => fetchUserBanStatus(message)],
  ['ROIMPR_USER_THUMBNAIL', (message, sender) => fetchUserThumbnail(message, sender)]
]);
const USER_LOOKUP_MESSAGE_TYPES = new Set([
  'ROIMPR_USER_LOOKUP',
  'ROIMPR_DELETED_USER_LOOKUP',
  'ROIMPR_USER_STATUS',
  'ROIMPR_USER_THUMBNAIL'
]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ROIMPR_THUMBNAIL_KEY_TEST') {
    const source = sender?.url || '';
    let trustedPopup = false;
    try {
      const url = new URL(source);
      trustedPopup = sender?.id === chrome.runtime.id && url.protocol === 'chrome-extension:' &&
        url.hostname === chrome.runtime.id && url.pathname === '/popup.html';
    } catch { trustedPopup = false; }
    if (!trustedPopup) {
      sendResponse({ ok: false, message: 'This action is only available from the RoImproved popup.' });
      return false;
    }
    testGeneratedThumbnailApiKey(message.userId)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, message: error?.message || 'Thumbnail generation test failed.' }));
    return true;
  }
  if (message?.type === 'ROIMPR_SYNC_CONTENT_SCRIPTS') {
    if (sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, status: 403 });
      return false;
    }
    syncContentScriptRegistrations()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false, status: 0 }));
    return true;
  }
  if (message?.type === 'ROIMPR_DELETED_PROFILE_API') {
    if (sender.id !== chrome.runtime.id) { sendResponse({ ok:false,status:403,payload:null }); return false; }
    fetchDeletedProfileApi(message).then(sendResponse).catch(() => sendResponse({ok:false,status:0,payload:null}));
    return true;
  }
  if (message?.type === 'ROIMPR_NAV_FEATURES') {
    if (!isRobloxContentSender(sender)) {
      sendResponse({ ok: false, status: 403, message: 'Request is not from a Roblox page.' });
      return false;
    }
    chrome.storage.local.get({ privacyControlsEnabled: false, voiceChatStatusEnabled: false })
      .then((settings) => {
        const files = [];
        if (settings.privacyControlsEnabled) files.push('privacy-toggle.js');
        if (settings.voiceChatStatusEnabled) files.push('voice-chat-status.js');
        if (!files.length) return { ok: true, skipped: true };
        return chrome.scripting.executeScript({
          target: { tabId: sender.tab.id, frameIds: [0] }, files, world: 'ISOLATED'
        }).then(() => ({ ok: true }));
      })
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, status: 0, message: 'Could not initialize navigation controls.' }));
    return true;
  }
  if (message?.type === 'ROIMPR_ROUTE_FEATURES') {
    if (!isRobloxContentSender(sender) || typeof message.href !== 'string' || message.href.length > 4096) {
      sendResponse({ ok: false, status: 403, message: 'Request is not from a Roblox page.' });
      return false;
    }
    injectRouteFeatures(sender, message.href)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false, status: 0, message: 'Could not initialize this page feature.' }));
    return true;
  }

  const operation = MESSAGE_OPERATIONS.get(message?.type);
  if (!operation) return false;
  const isProfileThumbnailRequest = message.type === 'ROIMPR_USER_THUMBNAIL' && isDeletedProfileExtensionSender(sender);
  if (!isRobloxContentSender(sender) && !isProfileThumbnailRequest) {
    sendResponse({ ok: false, status: 403, message: 'Request is not from a supported Roblox or RoImproved profile page.' });
    return false;
  }

  const runOperation = () => operation(message, sender);
  if (USER_LOOKUP_MESSAGE_TYPES.has(message.type)) {
    chrome.storage.local.get({ deletedUserSearchEnabled: true }).then((settings) => {
      if (!settings.deletedUserSearchEnabled && message.type !== 'ROIMPR_USER_THUMBNAIL') {
        sendResponse({ ok: false, status: 403, message: 'User search is disabled.' });
        return;
      }
      runOperation().then(sendResponse).catch((error) =>
        sendResponse({ ok: false, status: 0, message: error?.message || 'Roblox API request failed.', retryAfterMs: 0 })
      );
    }).catch(() => sendResponse({ ok: false, status: 0, message: 'Could not read extension settings.' }));
    return true;
  }

  runOperation()
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, status: 0, message: 'Roblox API request failed.', retryAfterMs: 0 }));
  return true;
});
