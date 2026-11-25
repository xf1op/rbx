'use strict';

(() => {
  const KEY = '__RoImprHomeGameActions';
  if (window[KEY]) return;
  window[KEY] = true;

  const CARD_SELECTOR = 'li[data-testid="wide-game-tile"], li.game-card.game-tile';
  const MESSAGE_TYPE = 'ROIMPR_GAME_SERVERS';
  const FRIEND_NAMES_MESSAGE_TYPE = 'ROIMPR_GAME_SERVER_FRIEND_NAMES';
  const instances = new WeakMap();
  const cardStates = new Set();
  let quickJoinEnabled = true;
  let serverListsEnabled = true;
  let settingsReady = false;
  let pageObserver = null;
  let rootWatcher = null;
  let openedPanel = null;
  let scanQueued = false;
  let authenticatedUserIdPromise = null;

  const style = document.createElement('style');
  style.textContent = `.RoImpr-game-actions-container{position:relative!important}.RoImpr-game-actions-overlay[hidden]{display:none!important}.RoImpr-game-actions-overlay button[hidden]{display:none!important}.RoImpr-game-actions-overlay{position:absolute;z-index:12;display:flex;align-items:center;justify-content:flex-end;gap:5px;box-sizing:border-box;padding:0 4px 0 0;border:0;border-radius:0;background:transparent;opacity:0;visibility:hidden;pointer-events:none}.RoImpr-game-actions-container:hover .RoImpr-game-actions-overlay{opacity:1;visibility:visible;pointer-events:auto}.RoImpr-game-actions-overlay button{position:relative;pointer-events:auto;appearance:none;border:0;border-radius:var(--radius-small,6px);background-image:none!important;color:var(--color-content-emphasis,var(--color-content-default));width:30px;height:30px;min-width:30px;flex:0 0 30px;padding:0;display:grid;place-items:center;cursor:pointer}.RoImpr-game-actions-overlay button:not(.RoImpr-quick-join){border:1px solid var(--color-stroke-default,var(--color-stroke-muted));background-color:var(--color-surface-0)!important}.RoImpr-game-actions-overlay button:focus-visible,.RoImpr-game-actions-panel button:focus-visible{outline:2px solid var(--color-system-emphasis);outline-offset:2px}.RoImpr-game-actions-overlay button .RoImpr-game-actions-native-icon{display:block;width:17px;height:17px;font-size:17px;line-height:17px;color:inherit;pointer-events:none}.RoImpr-game-actions-overlay button .RoImpr-private-lock-badge{position:absolute;right:1px;bottom:1px;width:10px;height:10px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;background:inherit;box-sizing:border-box}.RoImpr-game-actions-overlay button.RoImpr-quick-join,.RoImpr-game-actions-overlay button.RoImpr-quick-join:hover,.RoImpr-game-actions-overlay button.RoImpr-quick-join:active,.RoImpr-game-actions-overlay button.RoImpr-quick-join:focus-visible{background-color:var(--color-extended-blue-700,var(--color-action-emphasis))!important;color:#fff!important}.RoImpr-game-actions-overlay button.RoImpr-quick-join .RoImpr-game-actions-native-icon{color:#fff!important}.RoImpr-game-actions-overlay button[aria-expanded="true"],.RoImpr-game-actions-overlay button[aria-expanded="true"]:hover,.RoImpr-game-actions-overlay button[aria-expanded="true"]:active,.RoImpr-game-actions-overlay button[aria-expanded="true"]:focus-visible{background-color:var(--color-extended-blue-700,var(--color-action-emphasis))!important;color:#fff!important;border-color:var(--color-extended-blue-700,var(--color-action-emphasis))!important}.RoImpr-game-actions-overlay button[aria-expanded="true"] .RoImpr-game-actions-native-icon,.RoImpr-game-actions-overlay button[aria-expanded="true"] .RoImpr-private-lock-badge{color:#fff!important;stroke:#fff!important}.RoImpr-game-actions-panel{box-sizing:border-box;position:fixed!important;z-index:999999;width:260px;max-width:calc(100vw - 20px);max-height:min(340px,calc(100vh - 20px));display:flex;flex-direction:column;margin:0;padding:0;border-radius:var(--radius-large,8px);font:15px/1.35 Builder Sans,Arial,sans-serif;overflow:hidden}.RoImpr-game-actions-panel,.RoImpr-game-actions-panel *{box-shadow:none!important;text-shadow:none!important;filter:none!important;backdrop-filter:none!important}.RoImpr-game-actions-panel[hidden]{display:none!important}.RoImpr-game-actions-panel-head{display:flex;align-items:center;gap:8px;padding:9px 11px;border-bottom-width:var(--stroke-standard,1px);border-bottom-style:solid;min-height:36px;box-sizing:border-box}.RoImpr-game-actions-panel-title{min-width:0;font-size:14px;line-height:18px;font-weight:700}.RoImpr-game-actions-panel-subtitle{margin-left:auto;flex:0 0 auto;font-size:12px;line-height:16px;font-variant-numeric:tabular-nums}.RoImpr-game-actions-close{appearance:none;background:transparent;border:0;border-radius:var(--radius-small,5px);font-size:18px;line-height:18px;cursor:pointer;padding:1px 4px;margin-left:2px}.RoImpr-game-actions-close:hover{background-color:var(--color-state-hover)}.RoImpr-game-actions-list{display:flex;flex-direction:column;max-height:292px;overflow-y:auto;overscroll-behavior:contain;padding:0 8px;scrollbar-width:thin}.RoImpr-game-server-row{display:flex;align-items:center;gap:9px;width:100%;min-height:36px;padding:5px 3px;border-bottom-width:var(--stroke-standard,1px);border-bottom-style:solid;box-sizing:border-box}.RoImpr-game-server-friends-wrap{position:relative;display:inline-flex;flex:0 0 auto;flex-direction:column;align-items:stretch;min-width:0;max-width:100%}.RoImpr-game-server-friends-wrap.is-open{z-index:5}.RoImpr-game-server-friends-toggle{appearance:none;display:inline-flex;align-items:center;gap:3px;width:max-content;max-width:100%;padding:0;border:0;background:transparent!important;color:var(--color-content-muted);font:inherit;font-size:12px;line-height:15px;white-space:nowrap;cursor:pointer}.RoImpr-game-server-friends-toggle:after{content:"▾";font-size:11px}.RoImpr-game-server-friends-toggle[aria-expanded="true"]:after{content:"▴"}.RoImpr-game-server-friends-dropdown{position:absolute;top:calc(100% + 3px);left:0;z-index:6;display:flex;width:100%;min-width:0;flex-direction:column;gap:3px;box-sizing:border-box;padding:4px 5px;background-color:var(--color-surface-100)}.RoImpr-game-server-friends-dropdown[hidden]{display:none!important}.RoImpr-game-server-friend-name{display:block;max-width:100%;overflow-wrap:anywhere;font-size:13px;line-height:18px;font-weight:600;color:var(--color-content-default,var(--color-content-emphasis))}.RoImpr-game-server-row:last-child{border-bottom:0}.RoImpr-game-server-main{min-width:0;flex:1;display:flex;align-items:center;gap:8px}.RoImpr-game-server-meta{min-width:0;flex:1;display:flex;flex-direction:column;gap:0}.RoImpr-game-server-meta-public{flex-direction:row;align-items:center;gap:8px;flex-wrap:nowrap;white-space:nowrap}.RoImpr-game-server-meta-public .RoImpr-game-server-public-stats{flex:0 0 auto;gap:6px}.RoImpr-game-server-public-stats{display:flex;align-items:center;gap:8px;min-width:0}.RoImpr-game-server-friends{font-size:12px;line-height:15px;font-variant-numeric:tabular-nums;white-space:nowrap}.RoImpr-game-server-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:18px;font-weight:600}.RoImpr-game-server-detail{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:16px;font-variant-numeric:tabular-nums}.RoImpr-game-server-ping{flex:0 0 50px;font-size:13px;line-height:18px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}.RoImpr-game-server-count{font-size:13px;line-height:18px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}.RoImpr-game-server-actions{display:flex;align-items:center;gap:4px;flex:0 0 auto}.RoImpr-game-server-join,.RoImpr-game-server-join:hover:not(:disabled),.RoImpr-game-server-join:active:not(:disabled){appearance:none;border:0;border-radius:var(--radius-small,5px);background-color:var(--color-extended-blue-700,var(--color-action-emphasis))!important;color:#fff!important;min-width:46px;padding:5px 9px;font:600 13px Builder Sans,Arial,sans-serif;cursor:pointer;white-space:nowrap}.RoImpr-game-server-join:disabled{background-color:var(--color-surface-0)!important;color:var(--color-content-muted)!important;cursor:not-allowed;opacity:.65}.RoImpr-game-server-edit{appearance:none;display:grid;place-items:center;width:27px;height:27px;padding:0;border:0;border-radius:var(--radius-small,5px);background:transparent;cursor:pointer}.RoImpr-game-server-edit:hover{background-color:var(--color-state-hover)}.RoImpr-game-server-edit .icon{font-size:15px;line-height:15px}.RoImpr-game-actions-footer{display:flex;justify-content:center;padding:7px 10px 9px;border-top-width:var(--stroke-standard,1px);border-top-style:solid}.RoImpr-game-actions-footer:empty{display:none}.RoImpr-game-actions-more{background-color:var(--color-surface-0)!important;color:var(--color-content-emphasis,var(--color-content-default));padding:7px 13px;min-width:130px;border-width:var(--stroke-standard,1px);border-style:solid;border-color:var(--color-stroke-default,var(--color-stroke-muted));border-radius:var(--radius-small,5px)}.RoImpr-game-actions-more:hover{background-color:var(--color-state-hover)!important}.RoImpr-game-actions-message{padding:16px 10px;text-align:center;font-size:13px;line-height:18px}@media(max-width:600px){.RoImpr-game-actions-overlay{gap:4px}.RoImpr-game-actions-overlay button{width:28px;height:28px;min-width:28px;flex-basis:28px}.RoImpr-game-actions-panel{max-height:calc(100vh - 20px)}.RoImpr-game-actions-panel-head{padding:10px}.RoImpr-game-actions-list{max-height:calc(100vh - 90px)}.RoImpr-game-server-row{gap:6px;padding:6px 2px}.RoImpr-game-server-join{padding:6px 8px}}`;
  (document.head || document.documentElement).appendChild(style);

  function normalizedPath() {
    return location.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//i, '/')
      .replace(/\/+$/, '') || '/';
  }

  function isHomePage() {
    const path = normalizedPath();
    return path === '/' || path === '/home';
  }

  function parseGameIds(card) {
    const link = card.querySelector('a.game-card-link[href*="/games/"]');
    if (!link) return null;

    let url;
    try { url = new URL(link.href, location.href); } catch { return null; }

    const pathMatch = url.pathname.match(/\/games\/(\d+)/i);
    const placeId = url.searchParams.get('placeId') || pathMatch?.[1] || '';
    const container = card.querySelector('.game-card-container, .featured-game-container') || link.parentElement;
    if (!/^\d{1,20}$/.test(placeId)) return null;
    return { placeId, link, container };
  }

  const ROBLOX_ICON_CLASSES = {
    quick: 'icon icon-regular-circle-play',
    public: 'icon icon-regular-three-bars-horizontal',
    private: 'icon icon-regular-two-people'
  };

  function makeIconButton(className, title, iconName) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.setAttribute('aria-expanded', 'false');

    // Reuse Roblox Foundation glyphs already loaded by the Home page.
    const glyph = document.createElement('span');
    glyph.className = `${ROBLOX_ICON_CLASSES[iconName] || ''} RoImpr-game-actions-native-icon`;
    glyph.setAttribute('aria-hidden', 'true');
    button.appendChild(glyph);

    // Roblox's Home markup has a people glyph but no exposed private-server glyph;
    // add a small lock badge to make the Private action unambiguous.
    if (iconName === 'private') {
      const lock = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      lock.setAttribute('viewBox', '0 0 12 12');
      lock.setAttribute('class', 'RoImpr-private-lock-badge');
      lock.setAttribute('aria-hidden', 'true');
      const body = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      body.setAttribute('x', '2.5'); body.setAttribute('y', '5.3');
      body.setAttribute('width', '7'); body.setAttribute('height', '5.2');
      body.setAttribute('rx', '1');
      const shackle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      shackle.setAttribute('d', 'M4.2 5.3V4a1.8 1.8 0 0 1 3.6 0v1.3');
      lock.append(body, shackle);
      button.appendChild(lock);
    }
    return button;
  }

  function makeButton(label, className, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    if (title) button.title = title;
    return button;
  }


  function openRoblox(uri) {
    // Keep the protocol URI minimal; navigation is triggered directly by the user's click.
    window.location.href = uri;
  }

  function createPanel(card, game) {
    const panel = document.createElement('section');
    panel.className = 'RoImpr-game-actions-panel bg-surface-100 stroke-standard stroke-muted content-default';
    panel.hidden = true;
    panel.setAttribute('aria-live', 'polite');
    panel.dataset.kind = '';

    const head = document.createElement('div');
    head.className = 'RoImpr-game-actions-panel-head stroke-muted';
    const title = document.createElement('span');
    title.className = 'RoImpr-game-actions-panel-title content-emphasis';
    const subtitle = document.createElement('span');
    subtitle.className = 'RoImpr-game-actions-panel-subtitle content-muted';
    const close = makeButton('×', 'RoImpr-game-actions-close content-muted', 'Close server list');
    close.addEventListener('click', () => closePanel(panel));
    head.append(title, subtitle, close);

    const list = document.createElement('div');
    list.className = 'RoImpr-game-actions-list';
    const footer = document.createElement('div');
    footer.className = 'RoImpr-game-actions-footer';
    panel.append(head, list, footer);

    // Render as a body-level popover so the Home carousel's horizontal scroller cannot clip it.
    document.body.appendChild(panel);
    return { panel, title, subtitle, list, footer, card, game, anchor: null, container: null, cursor: '', kind: '', items: [], loading: false, requestId: 0, userId: '', friendNamesCache: new Map(), friendNamesLoading: new Map() };
  }

  function closePanel(panel) {
    if (!panel) return;
    panel.hidden = true;
    const state = [...document.querySelectorAll(CARD_SELECTOR)].map((card) => instances.get(card)?.panelState).find((item) => item?.panel === panel);
    state?.card?.querySelectorAll('.RoImpr-public-servers,.RoImpr-private-servers').forEach((button) => {
      button.setAttribute('aria-expanded', 'false');
    });
    if (openedPanel === panel) openedPanel = null;
  }

  function showMessage(state, message) {
    state.list.replaceChildren();
    const row = document.createElement('div');
    row.className = 'RoImpr-game-actions-message content-muted';
    row.textContent = message;
    state.list.appendChild(row);
    state.footer.replaceChildren();
    positionPanel(state);
  }

  function formatCount(playing, maxPlayers) {
    const count = Number.isFinite(Number(playing)) ? Number(playing) : 0;
    const max = Number.isFinite(Number(maxPlayers)) ? Number(maxPlayers) : 0;
    return max > 0 ? `${count}/${max} players` : `${count} players`;
  }

  function numberPing(value) {
    if (value === null || value === undefined || value === '') return Number.POSITIVE_INFINITY;
    const ping = Number(value);
    return Number.isFinite(ping) && ping >= 0 ? ping : Number.POSITIVE_INFINITY;
  }

  function sortPublicServers(items) {
    return [...items].sort((a, b) => {
      // Keep lowest latency as the primary sort; at equal ping, prefer fuller servers.
      const pingA = numberPing(a.ping);
      const pingB = numberPing(b.ping);
      if (pingA < pingB) return -1;
      if (pingA > pingB) return 1;
      const playersA = Number.isFinite(Number(a.playing)) ? Number(a.playing) : 0;
      const playersB = Number.isFinite(Number(b.playing)) ? Number(b.playing) : 0;
      if (playersA !== playersB) return playersB - playersA;
      const capacityA = Number.isFinite(Number(a.maxPlayers)) ? Number(a.maxPlayers) : 0;
      const capacityB = Number.isFinite(Number(b.maxPlayers)) ? Number(b.maxPlayers) : 0;
      return capacityB - capacityA;
    });
  }

  async function getAuthenticatedUserId() {
    if (!authenticatedUserIdPromise) {
      authenticatedUserIdPromise = chrome.runtime.sendMessage({ type: 'ROIMPR_TRANSACTION_USER' })
        .then((response) => response?.ok && /^\d{1,20}$/.test(String(response.userId || ''))
          ? String(response.userId) : '')
        .catch(() => '');
    }
    return authenticatedUserIdPromise;
  }

  function openPrivateServerSettings(server) {
    const privateServerId = String(server?.vipServerId || '');
    if (!/^\d{1,20}$/.test(privateServerId)) return;

    const url = new URL('/private-server/configure', 'https://www.roblox.com');
    url.searchParams.set('privateServerId', privateServerId);
    window.location.assign(url.href);
  }

  function isPrivateServerUnavailable(server, accessCode) {
    if (!accessCode) return true;
    if (server?.isExpired === true || server?.expired === true || server?.isActive === false) return true;
    const status = String(server?.status || server?.state || '').trim().toLowerCase();
    if (['expired', 'inactive', 'unavailable', 'closed'].includes(status)) return true;
    const expiry = server?.expiresAt || server?.expirationDate || server?.expirationTime;
    if (expiry) {
      const timestamp = typeof expiry === 'number'
        ? (expiry > 1e12 ? expiry : expiry * 1000)
        : Date.parse(String(expiry));
      if (Number.isFinite(timestamp) && timestamp <= Date.now()) return true;
    }
    return false;
  }

  function renderFriendNames(list, names, message = 'Friend names unavailable') {
    if (!list) return;
    list.replaceChildren();
    const uniqueNames = [...new Set((Array.isArray(names) ? names : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean))];
    if (!uniqueNames.length) {
      const status = document.createElement('div');
      status.className = 'RoImpr-game-server-friend-name content-muted';
      status.textContent = message;
      list.appendChild(status);
      return;
    }
    for (const displayName of uniqueNames) {
      const name = document.createElement('div');
      name.className = 'RoImpr-game-server-friend-name';
      name.textContent = displayName;
      list.appendChild(name);
    }
  }

  async function loadFriendDisplayNames(state, serverId, list) {
    if (!/^[\da-f-]{16,64}$/i.test(serverId)) {
      renderFriendNames(list, [], 'Friend names unavailable');
      return;
    }

    if (state.friendNamesCache.has(serverId)) {
      renderFriendNames(list, state.friendNamesCache.get(serverId));
      return;
    }

    let load = state.friendNamesLoading.get(serverId);
    if (!load) {
      load = chrome.runtime.sendMessage({
        type: FRIEND_NAMES_MESSAGE_TYPE,
        placeId: state.game.placeId,
        serverId
      }).then((response) => {
        if (!response?.ok) throw new Error(response?.message || 'Could not load friend names.');
        if (response.serverFound !== true) throw new Error('Friend server was not found.');
        return Array.isArray(response.names) ? response.names : [];
      });
      state.friendNamesLoading.set(serverId, load);
    }

    renderFriendNames(list, [], 'Loading…');
    try {
      const names = await load;
      state.friendNamesCache.set(serverId, names);
      renderFriendNames(list, names);
    } catch {
      renderFriendNames(list, [], 'Friend names unavailable');
    } finally {
      if (state.friendNamesLoading.get(serverId) === load) {
        state.friendNamesLoading.delete(serverId);
      }
    }
  }

  function makeServerRow(state, server) {
    const isPrivate = state.kind === 'private';
    const row = document.createElement('div');
    row.className = 'RoImpr-game-server-row stroke-muted';

    const main = document.createElement('div');
    main.className = 'RoImpr-game-server-main';
    const meta = document.createElement('div');
    meta.className = `RoImpr-game-server-meta${isPrivate ? '' : ' RoImpr-game-server-meta-public'}`;

    const actions = document.createElement('div');
    actions.className = 'RoImpr-game-server-actions';
    const join = makeButton('Join', 'RoImpr-game-server-join', 'Join this server');
    let editButton = null;
    let friendList = null;
    let friendWrap = null;

    if (!isPrivate) {
      const pingValue = numberPing(server.ping);
      const ping = document.createElement('span');
      ping.className = 'RoImpr-game-server-ping content-muted';
      ping.textContent = Number.isFinite(pingValue) ? `${pingValue}ms` : '—ms';
      ping.title = 'Server ping';

      const players = document.createElement('span');
      players.className = 'RoImpr-game-server-count content-emphasis';
      players.textContent = formatCount(server.playing, server.maxPlayers).replace(' players', '');
      players.title = 'Players in server';

      const stats = document.createElement('div');
      stats.className = 'RoImpr-game-server-public-stats';
      stats.append(ping, players);
      meta.appendChild(stats);

      const friendCount = Math.max(0, Math.floor(Number(server.friendCount) || 0));
      if (friendCount > 0) {
        const friends = makeButton(`Friends: ${friendCount}`, 'RoImpr-game-server-friends RoImpr-game-server-friends-toggle content-muted', 'Show friends in this server');
        friends.setAttribute('aria-expanded', 'false');

        friendWrap = document.createElement('div');
        friendWrap.className = 'RoImpr-game-server-friends-wrap';

        friendList = document.createElement('div');
        friendList.className = 'RoImpr-game-server-friends-dropdown';
        friendList.hidden = true;
        friendList.setAttribute('role', 'group');
        friendList.setAttribute('aria-label', `Friends in this server (${friendCount})`);
        const friendListId = `RoImpr-server-friends-${state.game.placeId}-${String(server.id || '').replace(/[^a-z0-9-]/gi, '')}`;
        friendList.id = friendListId;
        friends.setAttribute('aria-controls', friendListId);

        const serverIdForFriends = String(server.id || '');
        if (state.friendNamesCache.has(serverIdForFriends)) {
          renderFriendNames(friendList, state.friendNamesCache.get(serverIdForFriends));
        }

        friends.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const expanded = friends.getAttribute('aria-expanded') !== 'true';
          friends.setAttribute('aria-expanded', String(expanded));
          friendWrap.classList.toggle('is-open', expanded);
          if (expanded) {
            const toggleWidth = friends.getBoundingClientRect().width;
            if (toggleWidth > 0) friendWrap.style.width = `${Math.ceil(toggleWidth)}px`;
          }
          friendList.hidden = !expanded;
          if (expanded) loadFriendDisplayNames(state, serverIdForFriends, friendList);
        });
        friendWrap.append(friends, friendList);
        meta.appendChild(friendWrap);
      }

      const serverId = String(server.id || '');
      if (!/^[\da-f-]{16,64}$/i.test(serverId)) {
        join.disabled = true;
        join.title = 'Server ID is unavailable';
      } else {
        join.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openRoblox(`roblox://placeId=${state.game.placeId}&gameInstanceId=${encodeURIComponent(serverId)}`);
        });
      }
    } else {
      const owner = server.owner || {};
      const serverName = String(server.name || '').trim();
      const name = document.createElement('span');
      name.className = 'RoImpr-game-server-name content-emphasis';
      name.textContent = serverName || 'Private server';

      const ownerName = String(owner.displayName || owner.name || '').trim();
      const detail = document.createElement('span');
      detail.className = 'RoImpr-game-server-detail content-muted';
      detail.textContent = `by ${ownerName || 'Unknown'} · ${formatCount(server.playing, server.maxPlayers).replace(' players', '')}`;
      meta.append(name, detail);

      const accessCode = typeof server.accessCode === 'string' && server.accessCode.trim()
        ? server.accessCode.trim()
        : typeof server.linkCode === 'string' && server.linkCode.trim()
          ? server.linkCode.trim() : '';
      if (isPrivateServerUnavailable(server, accessCode)) {
        join.disabled = true;
        join.title = 'This private server is expired or unavailable';
      } else {
        join.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openRoblox(`roblox://placeId=${state.game.placeId}&accessCode=${encodeURIComponent(accessCode)}`);
        });
      }

      if (state.userId && String(owner.id || '') === state.userId && /^\d{1,20}$/.test(String(server.vipServerId || ''))) {
        editButton = makeButton('', 'RoImpr-game-server-edit content-muted', 'Edit private server');
        editButton.setAttribute('aria-label', 'Edit private server');
        const glyph = document.createElement('span');
        glyph.className = 'icon icon-regular-gear';
        glyph.setAttribute('aria-hidden', 'true');
        editButton.appendChild(glyph);
        editButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openPrivateServerSettings(server);
        });
      }
    }

    actions.appendChild(join);
    if (editButton) actions.appendChild(editButton);
    main.appendChild(meta);
    row.append(main, actions);
    return row;
  }

  function renderRows(state) {
    state.list.replaceChildren();
    const items = state.kind === 'public' ? sortPublicServers(state.items) : state.items;
    if (!items.length) {
      const message = document.createElement('div');
      message.className = 'RoImpr-game-actions-message content-muted';
      message.textContent = state.kind === 'private' ? 'No private servers are available.' : 'No public servers found.';
      state.list.appendChild(message);
      renderFooter(state);
      positionPanel(state);
      return;
    }
    for (let index = 0; index < items.length; index += 1) {
      state.list.appendChild(makeServerRow(state, items[index]));
    }
    positionPanel(state);
    renderFooter(state);
  }

  function showRetry(state, message, cursor) {
    if (state.items.length) {
      const notice = document.createElement('div');
      notice.className = 'RoImpr-game-actions-message content-muted';
      notice.textContent = message;
      state.list.appendChild(notice);
    } else {
      showMessage(state, message);
    }
    state.footer.replaceChildren();
    const retry = makeButton('Retry', 'RoImpr-game-actions-more');
    retry.addEventListener('click', () => loadServerPage(state, cursor || ''));
    state.footer.appendChild(retry);
  }

  function renderFooter(state) {
    state.footer.replaceChildren();
    if (!state.cursor) return;
    const more = makeButton('Load more servers', 'RoImpr-game-actions-more');
    more.addEventListener('click', () => loadServerPage(state, state.cursor));
    state.footer.appendChild(more);
  }

  async function loadServerPage(state, cursor) {
    if (!serverListsEnabled || state.loading) return;
    state.loading = true;
    state.subtitle.textContent = 'Loading…';
    state.footer.replaceChildren();
    if (!state.items.length) showMessage(state, 'Loading servers…');
    const requestKind = state.kind;
    const requestId = state.requestId;

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPE,
        kind: requestKind,
        placeId: state.game.placeId,
        cursor: cursor || ''
      });
      if (requestId !== state.requestId || requestKind !== state.kind) return;
      if (!response?.ok) {
        const fallback = state.kind === 'private'
          ? 'Private servers are not supported or are unavailable for this experience.'
          : (response?.status === 429 ? 'Roblox is rate-limiting server requests. Try again shortly.' : 'Could not load public servers.');
        showRetry(state, response?.message || fallback, cursor);
        state.subtitle.textContent = '';
        return;
      }

      const payload = response.payload || {};
      const data = Array.isArray(payload.data) ? payload.data : [];
      if (requestKind === 'private') state.userId = await getAuthenticatedUserId();
      if (requestId !== state.requestId || requestKind !== state.kind) return;
      const seen = new Set(state.items.map((item) => requestKind === 'public'
        ? String(item.id || '')
        : String(item.vipServerId || `${item.owner?.id || ''}:${item.name || ''}`)));
      for (const item of data) {
        const key = requestKind === 'public'
          ? String(item.id || '')
          : String(item.vipServerId || `${item.owner?.id || ''}:${item.name || ''}`);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        state.items.push(item);
      }
      state.cursor = typeof payload.nextPageCursor === 'string' ? payload.nextPageCursor : '';
      if (state.kind === 'private' && payload.gameJoinRestricted === true) {
        showMessage(state, 'Private servers are not supported for this experience.');
        state.subtitle.textContent = '';
        return;
      }
      state.subtitle.textContent = state.kind === 'public' ? 'Lowest ping first' : `${state.items.length} servers`;
      renderRows(state);
      if (!state.items.length) state.subtitle.textContent = '';
    } catch {
      if (requestId === state.requestId) {
        showRetry(state, 'Could not connect to Roblox.', cursor);
        state.subtitle.textContent = '';
      }
    } finally {
      if (requestId === state.requestId) state.loading = false;
    }
  }

  function positionPanel(state) {
    if (!state?.panel || state.panel.hidden || !state.anchor?.isConnected) return;
    const anchorRect = state.anchor.getBoundingClientRect();
    if (!anchorRect.width || !anchorRect.height) return;

    const panel = state.panel;
    const margin = 10;
    const width = Math.min(320, Math.max(230, window.innerWidth - margin * 2));
    panel.style.width = `${width}px`;
    panel.style.maxWidth = `calc(100vw - ${margin * 2}px)`;

    const left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - width - margin));
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(margin, anchorRect.bottom + 7)}px`;

    const panelHeight = panel.getBoundingClientRect().height;
    const below = anchorRect.bottom + 7 + panelHeight <= window.innerHeight - margin;
    const top = below
      ? anchorRect.bottom + 7
      : Math.max(margin, anchorRect.top - panelHeight - 7);
    panel.style.top = `${top}px`;
  }

  function openList(state, kind, activeButton, otherButton) {
    if (!serverListsEnabled) return;
    if (openedPanel && openedPanel !== state.panel) closePanel(openedPanel);
    if (!state.panel.hidden && state.kind === kind) {
      closePanel(state.panel);
      activeButton?.setAttribute('aria-expanded', 'false');
      return;
    }

    state.panel.hidden = false;
    openedPanel = state.panel;
    positionPanel(state);
    activeButton?.setAttribute('aria-expanded', 'true');
    otherButton?.setAttribute('aria-expanded', 'false');
    if (state.kind === kind && (state.items.length || state.loading)) return;

    // Invalidate an earlier request if the user switches Public/Private while it is loading.
    state.requestId += 1;
    state.loading = false;
    state.kind = kind;
    state.items = [];
    state.cursor = '';
    state.title.textContent = kind === 'public' ? 'Public Servers' : 'Private Servers';
    state.subtitle.textContent = '';
    showMessage(state, 'Loading servers…');
    loadServerPage(state, '');
  }

  function positionOverlay(state) {
    if (!state.overlay.isConnected || !state.thumb.isConnected || !state.container.isConnected) return;
    const parentRect = state.container.getBoundingClientRect();
    const imageRect = state.thumb.getBoundingClientRect();
    if (!parentRect.width || !imageRect.width || !imageRect.height) return;

    const barHeight = window.matchMedia('(max-width: 600px)').matches ? 34 : 38;
    state.overlay.style.left = `${imageRect.left - parentRect.left}px`;
    state.overlay.style.top = `${imageRect.bottom - parentRect.top - barHeight}px`;
    state.overlay.style.width = `${imageRect.width}px`;
    state.overlay.style.height = `${barHeight}px`;
  }

  function attachCard(card) {
    if (!quickJoinEnabled && !serverListsEnabled) return;
    if (!(card instanceof Element) || !card.matches(CARD_SELECTOR) || instances.has(card)) return;
    const game = parseGameIds(card);
    if (!game?.container) return;
    const thumb = card.querySelector('.featured-game-icon-container, .game-card-thumb-container');
    if (!thumb) return;

    const state = {
      card,
      game,
      container: game.container,
      thumb,
      overlay: document.createElement('div'),
      panelState: null,
      quickJoinButton: null,
      publicServersButton: null,
      privateServersButton: null,
      resizeObserver: null
    };
    state.container.classList.add('RoImpr-game-actions-container');
    state.overlay.className = 'RoImpr-game-actions-overlay';

    const quickJoin = makeIconButton('RoImpr-quick-join bg-action-emphasis content-action-emphasis stroke-none', 'Quick Join', 'quick');
    const servers = makeIconButton('RoImpr-public-servers', 'Public servers', 'public');
    const privateServers = makeIconButton('RoImpr-private-servers', 'Private servers', 'private');

    for (const button of [quickJoin, servers, privateServers]) {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    }
    quickJoin.addEventListener('click', () => {
      if (quickJoinEnabled) openRoblox(`roblox://placeId=${game.placeId}`);
    });

    state.panelState = createPanel(card, game);
    state.panelState.anchor = state.overlay;
    state.panelState.container = state.container;
    servers.addEventListener('click', () => {
      if (serverListsEnabled) openList(state.panelState, 'public', servers, privateServers);
    });
    privateServers.addEventListener('click', () => {
      if (serverListsEnabled) openList(state.panelState, 'private', privateServers, servers);
    });

    state.quickJoinButton = quickJoin;
    state.publicServersButton = servers;
    state.privateServersButton = privateServers;
    state.overlay.append(quickJoin, servers, privateServers);
    state.container.appendChild(state.overlay);
    instances.set(card, state);
    cardStates.add(state);
    applyCardFeatureVisibility(state);
    positionOverlay(state);

    if (typeof ResizeObserver === 'function') {
      state.resizeObserver = new ResizeObserver(() => {
        positionOverlay(state);
        if (state.panelState && !state.panelState.panel.hidden) positionPanel(state.panelState);
      });
      state.resizeObserver.observe(state.container);
      state.resizeObserver.observe(thumb);
    }
    thumb.querySelector('img')?.addEventListener('load', () => {
      positionOverlay(state);
      if (state.panelState && !state.panelState.panel.hidden) positionPanel(state.panelState);
    }, { passive: true });
  }

  function applyCardFeatureVisibility(state) {
    if (!state?.overlay) return;
    state.quickJoinButton.hidden = !quickJoinEnabled;
    state.publicServersButton.hidden = !serverListsEnabled;
    state.privateServersButton.hidden = !serverListsEnabled;
    state.overlay.hidden = !quickJoinEnabled && !serverListsEnabled;
    if (!serverListsEnabled && state.panelState) {
      state.panelState.requestId += 1;
      state.panelState.loading = false;
      closePanel(state.panelState.panel);
      state.publicServersButton?.setAttribute('aria-expanded', 'false');
      state.privateServersButton?.setAttribute('aria-expanded', 'false');
    }
  }

  function applyFeatureSettings(settings) {
    quickJoinEnabled = settings.gameQuickJoinEnabled !== false;
    serverListsEnabled = settings.gameServerListsEnabled !== false;
    for (const state of cardStates) {
      if (!state.card?.isConnected) {
        cardStates.delete(state);
        continue;
      }
      applyCardFeatureVisibility(state);
    }
    if (quickJoinEnabled || serverListsEnabled) startObserver();
    else {
      pageObserver?.disconnect();
      pageObserver = null;
      rootWatcher?.disconnect();
      rootWatcher = null;
      if (openedPanel) closePanel(openedPanel);
    }
  }

  function scanNode(node) {
    if (!(node instanceof Element)) return;
    if (node.matches(CARD_SELECTOR)) attachCard(node);
    for (const card of node.querySelectorAll(CARD_SELECTOR)) attachCard(card);
  }

  function scanPage() {
    if (!settingsReady || (!quickJoinEnabled && !serverListsEnabled) || !isHomePage()) return;
    const root = document.querySelector('#container-main') || document.querySelector('main') || document;
    for (const card of root.querySelectorAll(CARD_SELECTOR)) attachCard(card);
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      scanPage();
    });
  }

  function startObserver() {
    if (!settingsReady || (!quickJoinEnabled && !serverListsEnabled) || !isHomePage()) {
      pageObserver?.disconnect();
      pageObserver = null;
      rootWatcher?.disconnect();
      rootWatcher = null;
      return;
    }
    const root = document.querySelector('#container-main') || document.querySelector('main');
    if (!root) {
      if (!rootWatcher && document.documentElement) {
        rootWatcher = new MutationObserver(() => {
          const found = document.querySelector('#container-main') || document.querySelector('main');
          if (!found) return;
          rootWatcher.disconnect();
          rootWatcher = null;
          startObserver();
        });
        rootWatcher.observe(document.documentElement, { childList: true, subtree: true });
      }
      return;
    }
    if (pageObserver) return;
    pageObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) scanNode(node);
      }
    });
    pageObserver.observe(root, { childList: true, subtree: true });
    scanPage();
  }

  function handleRoute() {
    if (!isHomePage() && openedPanel) closePanel(openedPanel);
    startObserver();
  }

  document.addEventListener('pointerdown', (event) => {
    if (!openedPanel) return;
    const card = [...document.querySelectorAll(CARD_SELECTOR)].find((item) => instances.get(item)?.panelState?.panel === openedPanel);
    const state = card ? instances.get(card)?.panelState : null;
    if (!openedPanel.contains(event.target) && !state?.anchor?.contains(event.target)) closePanel(openedPanel);
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openedPanel) closePanel(openedPanel);
  }, true);

  window.addEventListener('scroll', () => {
    if (!openedPanel) return;
    const card = [...document.querySelectorAll(CARD_SELECTOR)].find((item) => instances.get(item)?.panelState?.panel === openedPanel);
    const state = card ? instances.get(card)?.panelState : null;
    if (state) positionPanel(state);
    else closePanel(openedPanel);
  }, { capture: true, passive: true });
  window.addEventListener('roimpr:route-change', handleRoute);
  window.addEventListener('popstate', handleRoute);
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('pageshow', handleRoute);
  window.addEventListener('resize', () => {
    for (const card of document.querySelectorAll(CARD_SELECTOR)) {
      const state = instances.get(card);
      if (state) {
        positionOverlay(state);
        if (state.panelState && !state.panelState.panel.hidden) positionPanel(state.panelState);
      }
    }
  }, { passive: true });

  chrome.storage.local.get({ gameQuickJoinEnabled: true, gameServerListsEnabled: false })
    .then((settings) => {
      settingsReady = true;
      applyFeatureSettings(settings);
    })
    .catch(() => {
      settingsReady = true;
      applyFeatureSettings({ gameQuickJoinEnabled: true, gameServerListsEnabled: false });
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' ||
        (!Object.hasOwn(changes, 'gameQuickJoinEnabled') && !Object.hasOwn(changes, 'gameServerListsEnabled'))) return;
    chrome.storage.local.get({ gameQuickJoinEnabled: true, gameServerListsEnabled: false })
      .then(applyFeatureSettings).catch(() => {});
  });
})();
