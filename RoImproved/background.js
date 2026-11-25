'use strict';


const API_ORIGIN = 'https://avatar.roblox.com';
const THUMBNAIL_ORIGIN = 'https://thumbnails.roblox.com';
const USER_SETTINGS_ORIGIN = 'https://apis.roblox.com';
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
  badgeSortingEnabled: true,
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

async function removeLegacyTrackingRules() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: LEGACY_TRACKING_RULE_IDS
    });
  } catch {}
}

function runStartupTasks() {
  removeLegacyTrackingRules();
  initializeDefaultSettings().catch(() => {});
}

chrome.runtime.onInstalled.addListener(runStartupTasks);
chrome.runtime.onStartup.addListener(runStartupTasks);

function routeFeatureFiles(href) {
  let url;
  try { url = new URL(href); } catch { return []; }
  if (url.origin !== 'https://www.roblox.com') return [];
  const path = url.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//i, '/').replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/home') return [
    { file: 'home-feed-bridge.js', world: 'ISOLATED' },
    { file: 'home-chart-links.js', world: 'ISOLATED' },
    { file: 'home-game-actions.js', world: 'ISOLATED' }
  ];
  if (/^\/charts(?:\/|$)/.test(path)) return [{ file: 'home-chart-links.js', world: 'ISOLATED' }];
  if (/^\/users\/\d+\/profile(?:\/|$)/.test(path)) return [{ file: 'outfits-gallery.js', world: 'ISOLATED' }];
  if (/^\/transactions(?:\/|$)/.test(path)) return [{ file: 'transaction-counter.js', world: 'ISOLATED' }];
  if (/^\/my\/avatar(?:\/|$)/.test(path)) return [{ file: 'accessory-limit.js', world: 'MAIN' }];
  if (/^\/users\/(?:\d+\/)?inventory(?:\/|$)/.test(path)) return [{ file: 'badge-sorting.js', world: 'ISOLATED' }];
  return [];
}

async function injectRouteFeatures(sender, href) {
  const tabId = sender?.tab?.id;
  if (!Number.isInteger(tabId)) return;
  const features = routeFeatureFiles(href);
  await Promise.all(features.map((feature) => chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] }, files: [feature.file], world: feature.world
  })));
}

const originQueues = new Map();
const lastRequestAt = new Map();
const responseCache = new Map();
const originRateLimitUntil = new Map();

function isRobloxContentSender(sender) {
  const source = sender?.url || sender?.tab?.url || '';
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && url.hostname === 'www.roblox.com';
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

function setCached(key, value) {
  responseCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (responseCache.size > 80) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
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
    // Use the same per-origin queue and rate-limit headers as the transaction scanner.
    // When Roblox reports Remaining: 0, wait until Reset plus one extra second
    // before allowing the next public/private server request to reach this origin.
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
    // Only run this lookup after the user opens Friends: x. Keep it on the
    // shared games.roblox.com queue and honor the same reset + 1s cooldown.
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ROIMPR_NAV_FEATURES') {
    if (!isRobloxContentSender(sender)) {
      sendResponse({ ok: false, status: 403, message: 'Request is not from a Roblox page.' });
      return false;
    }
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [0] },
      files: ['privacy-toggle.js', 'voice-chat-status.js'], world: 'ISOLATED'
    }).then(() => sendResponse({ ok: true }))
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
  const supportedTypes = [
    'ROIMPR_OUTFITS_PAGE',
    'ROIMPR_OUTFITS_THUMBNAILS',
    'ROIMPR_PRIVACY_GET',
    'ROIMPR_PRIVACY_SET',
    'ROIMPR_VOICE_STATUS_GET',
    'ROIMPR_TRANSACTION_PAGE',
    'ROIMPR_TRANSACTION_USER',
    'ROIMPR_GAME_SERVERS',
    'ROIMPR_GAME_SERVER_FRIEND_NAMES',
    'ROIMPR_BADGES_PAGE',
    'ROIMPR_BADGE_ICONS'
  ];
  if (!message || !supportedTypes.includes(message.type)) return false;
  if (!isRobloxContentSender(sender)) {
    sendResponse({ ok: false, status: 403, message: 'Request is not from a Roblox page.' });
    return false;
  }

  const operations = {
    ROIMPR_OUTFITS_PAGE: () => fetchOutfitPage(message),
    ROIMPR_OUTFITS_THUMBNAILS: () => fetchOutfitThumbnails(message),
    ROIMPR_PRIVACY_GET: () => fetchUserPrivacySettings(),
    ROIMPR_PRIVACY_SET: () => postUserPrivacySettings(message.values),
    ROIMPR_VOICE_STATUS_GET: () => fetchVoiceChatStatus(message.force === true),
    ROIMPR_TRANSACTION_PAGE: () => fetchTransactionPage(message),
    ROIMPR_TRANSACTION_USER: () => fetchAuthenticatedTransactionUser(),
    ROIMPR_GAME_SERVERS: () => fetchGameServers(message),
    ROIMPR_GAME_SERVER_FRIEND_NAMES: () => fetchGameServerFriendNames(message),
    ROIMPR_BADGES_PAGE: () => fetchBadgesPage(message),
    ROIMPR_BADGE_ICONS: () => fetchBadgeIcons(message)
  };
  const operation = operations[message.type]();

  operation
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, status: 0, message: 'Roblox API request failed.', retryAfterMs: 0 }));
  return true;
});

