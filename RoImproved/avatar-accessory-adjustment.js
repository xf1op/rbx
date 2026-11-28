(() => {
  'use strict';
  const KEY = '__RoImprAccessoryAdjustment';
  if (window[KEY]) return;
  window[KEY] = true;

  const ROOT_ID = 'RoImpr-accessory-adjustment';
  const STYLE_ID = 'RoImpr-accessory-adjustment-style';
  const DRAFT_KEY = 'roimprAccessoryAdjustmentDrafts';
  const DIRTY_KEY = 'roimprAccessoryAdjustmentDirtyFields';
  const AVATAR_API = 'https://avatar.roblox.com';
  const THUMBNAIL_API = 'https://thumbnails.roblox.com';
  const FALLBACK_TYPES = new Set([8, 41, 42, 43, 44, 45, 46, 47, 57, 58]);
  const FALLBACK_LIMITS = {
    Position: [-0.25, 0.25, 0.01],
    Rotation: [-15, 15, 1],
    Scale: [0.8, 1.2, 0.01]
  };

  let root = null;
  let panel = null;
  let list = null;
  let sliders = null;
  let selectedLabel = null;
  let status = null;
  let assets = [];
  let rules = null;
  let drafts = {};
  let dirtyFields = {};
  let applyButton = null;
  let applying = false;
  let selectedId = null;
  let mode = 'Position';
  let loading = null;
  let loadedAt = 0;
  let saveTimer = 0;

  const CSS = [
    '#RoImpr-accessory-adjustment{margin-top:8px}',
    '#RoImpr-accessory-adjustment,#RoImpr-accessory-adjustment *{box-sizing:border-box}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-trigger{white-space:nowrap;color:var(--color-content-emphasis,#fff)}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-panel{display:none;width:min(390px,100%);margin-top:7px;padding:11px;border:1px solid var(--color-stroke-default,rgba(127,127,127,.35));border-radius:8px;background:var(--color-surface-100,#fff);color:var(--color-content-emphasis,inherit)}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-panel[data-open=true]{display:block}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-head,#RoImpr-accessory-adjustment .RoImpr-aa-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-title{font-size:13px;font-weight:600}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-close{width:26px;height:26px;border:0;border-radius:5px;background:var(--color-surface-200,rgba(127,127,127,.12))}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-list{display:flex;gap:5px;overflow-x:auto;padding:8px 1px;scrollbar-width:thin}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-item{flex:0 0 38px;width:38px;height:38px;padding:2px;border:1px solid var(--color-stroke-default,rgba(127,127,127,.35));border-radius:6px;background:var(--color-surface-200,rgba(127,127,127,.08))}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-item[aria-pressed=true]{border:2px solid var(--color-system-emphasis,#335fff);background:var(--color-state-selected,rgba(65,105,225,.15))}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-item img{width:32px;height:32px;object-fit:contain}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-name{min-height:15px;margin:0 0 8px;font-size:11px;overflow-wrap:anywhere}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-modes{display:flex;gap:5px;margin-bottom:9px}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-mode{min-height:27px;padding:0 9px;border:1px solid var(--color-stroke-default,rgba(127,127,127,.35));border-radius:5px;background:var(--color-surface-200,rgba(127,127,127,.1));font-size:11px}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-mode[aria-pressed=true]{border-color:var(--color-system-emphasis,#335fff);background:var(--color-state-selected,rgba(65,105,225,.15))}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-slider{display:grid;grid-template-columns:14px minmax(0,1fr) 43px;align-items:center;gap:8px;margin:9px 0}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-slider label{font-size:11px;font-weight:600}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-slider input{width:100%;min-width:0;accent-color:var(--color-system-emphasis,#335fff)}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-value{font-size:10px;text-align:right;font-variant-numeric:tabular-nums}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-actions{margin-top:9px;padding-top:8px;border-top:1px solid var(--color-stroke-default,rgba(127,127,127,.25))}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-reset{border:0;background:transparent;text-decoration:underline;font-size:10px;color:var(--color-content-default,inherit)}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-apply{min-height:27px;padding:0 11px;border:1px solid var(--color-system-emphasis,#335fff);border-radius:5px;background:var(--color-system-emphasis,#335fff);color:#fff;font-size:10px;font-weight:600}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-apply:disabled{opacity:.5;cursor:default}',
    '#RoImpr-accessory-adjustment .RoImpr-aa-status{margin:7px 0 0;color:var(--color-content-muted,#777);font-size:10px;line-height:1.4}',
    '#RoImpr-accessory-adjustment button:focus-visible,#RoImpr-accessory-adjustment input:focus-visible{outline:2px solid var(--color-system-emphasis,#335fff);outline-offset:2px}'
  ].join('');

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  async function apiGet(url) {
    const response = await fetch(url, {
      method: 'GET', credentials: 'include', cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.errors?.[0]?.message || payload?.message || ('Roblox API returned ' + response.status + '.'));
    }
    return payload;
  }

  function getTypeId(asset) {
    const id = Number(asset?.assetType?.id ?? asset?.assetTypeId ?? asset?.type?.id);
    return Number.isInteger(id) ? id : null;
  }

  function getTypeName(asset) {
    return String(asset?.assetType?.name || asset?.assetTypeName || 'Accessory');
  }

  function getDraft(id, meta = null) {
    if (!drafts[id] || typeof drafts[id] !== 'object') {
      const position = meta?.position || {};
      const rotation = meta?.rotation || {};
      const scale = meta?.scale || {};
      const readAxis = (vector, axis, fallback) => {
        const value = Number(vector?.[axis]);
        return Number.isFinite(value) ? value : fallback;
      };
      drafts[id] = {
        Position: {
          X: readAxis(position, 'X', 0),
          Y: readAxis(position, 'Y', 0),
          Z: readAxis(position, 'Z', 0)
        },
        Rotation: {
          X: readAxis(rotation, 'X', 0),
          Y: readAxis(rotation, 'Y', 0),
          Z: readAxis(rotation, 'Z', 0)
        },
        Scale: readAxis(scale, 'X', 1)
      };
    }
    const value = drafts[id];
    if (!value.Position) value.Position = { X: 0, Y: 0, Z: 0 };
    if (!value.Rotation) value.Rotation = { X: 0, Y: 0, Z: 0 };
    if (!Number.isFinite(Number(value.Scale))) value.Scale = 1;
    for (const axis of ['X', 'Y', 'Z']) {
      if (!Number.isFinite(Number(value.Position[axis]))) value.Position[axis] = 0;
      if (!Number.isFinite(Number(value.Rotation[axis]))) value.Rotation[axis] = 0;
    }
    return value;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = 0;
      chrome.storage.local.set({ [DRAFT_KEY]: drafts, [DIRTY_KEY]: dirtyFields }).catch(() => {});
    }, 250);
  }

  function getMetaVector(meta, key, fallback) {
    const vector = meta?.[key] || {};
    return {
      X: Number.isFinite(Number(vector.X)) ? Number(vector.X) : fallback,
      Y: Number.isFinite(Number(vector.Y)) ? Number(vector.Y) : fallback,
      Z: Number.isFinite(Number(vector.Z)) ? Number(vector.Z) : fallback
    };
  }

  function sameNumber(a, b) {
    return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) < 0.0005;
  }

  function fieldMatchesMeta(asset, kind) {
    const draft = getDraft(asset.id);
    const key = kind.toLowerCase();
    if (kind === 'Scale') {
      const current = getMetaVector(asset.meta, 'scale', 1);
      return ['X', 'Y', 'Z'].every((axis) => sameNumber(draft.Scale, current[axis]));
    }
    const current = getMetaVector(asset.meta, key, 0);
    return ['X', 'Y', 'Z'].every((axis) => sameNumber(draft[kind][axis], current[axis]));
  }

  function syncDirty(asset, kind) {
    if (!asset) return;
    const fields = dirtyFields[asset.id] || {};
    if (fieldMatchesMeta(asset, kind)) delete fields[kind];
    else fields[kind] = true;
    if (Object.keys(fields).length) dirtyFields[asset.id] = fields;
    else delete dirtyFields[asset.id];
    scheduleSave();
    updateApplyButton();
  }

  function pendingAssetCount() {
    return Object.values(dirtyFields).filter((fields) =>
      fields && ['Position', 'Rotation', 'Scale'].some((kind) => fields[kind] === true)
    ).length;
  }

  function updateApplyButton() {
    if (!applyButton) return;
    applyButton.disabled = applying || pendingAssetCount() === 0;
    applyButton.textContent = applying ? 'Applying…' : 'Apply';
  }

  function avatarV4Url() {
    const url = new URL('/v4/avatar', AVATAR_API);
    for (const selectionType of [0, 1, 2, 3, 4, 5]) {
      url.searchParams.append('selectionTypes', String(selectionType));
    }
    return url.href;
  }

  async function getCurrentAvatarModel() {
    const payload = await apiGet(avatarV4Url());
    const avatar = payload?.avatarModel || payload?.avatarDefinition || payload?.avatar || payload;
    if (!Array.isArray(avatar?.assets)) {
      throw new Error('Roblox returned an unexpected avatar response. The assets list is missing.');
    }
    return avatar;
  }

  function apiErrorMessage(payload, status) {
    const firstError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
    return firstError?.message || payload?.message || payload?.error || ('Roblox API returned HTTP ' + status + '.');
  }

  async function apiPatch(url, body) {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    const options = {
      method: 'PATCH',
      credentials: 'include',
      cache: 'no-store',
      headers,
      body: JSON.stringify(body)
    };

    let response = await fetch(url, options);
    if (response.status === 403) {
      const token = response.headers.get('x-csrf-token');
      if (token) {
        headers['X-CSRF-TOKEN'] = token;
        response = await fetch(url, options);
      }
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false || (Array.isArray(payload?.errors) && payload.errors.length)) {
      throw new Error(apiErrorMessage(payload, response.status));
    }
    return payload;
  }

  function buildRefinedMeta(sourceMeta, draft, changedFields) {
    const meta = sourceMeta && typeof sourceMeta === 'object' ? { ...sourceMeta } : {};
    if (!meta.position || typeof meta.position !== 'object') meta.position = { X: 0, Y: 0, Z: 0 };
    if (!meta.rotation || typeof meta.rotation !== 'object') meta.rotation = { X: 0, Y: 0, Z: 0 };
    if (!meta.scale || typeof meta.scale !== 'object') meta.scale = { X: 1, Y: 1, Z: 1 };
    if (changedFields.Position) meta.position = { ...draft.Position };
    if (changedFields.Rotation) meta.rotation = { ...draft.Rotation };
    if (changedFields.Scale) meta.scale = { X: draft.Scale, Y: draft.Scale, Z: draft.Scale };
    if (!Number.isInteger(Number(meta.version)) || Number(meta.version) < 1) meta.version = 1;
    return meta;
  }

  function metaMatchesDraft(meta, draft, changedFields) {
    if (changedFields.Position) {
      const value = getMetaVector(meta, 'position', 0);
      if (!['X', 'Y', 'Z'].every((axis) => sameNumber(value[axis], draft.Position[axis]))) return false;
    }
    if (changedFields.Rotation) {
      const value = getMetaVector(meta, 'rotation', 0);
      if (!['X', 'Y', 'Z'].every((axis) => sameNumber(value[axis], draft.Rotation[axis]))) return false;
    }
    if (changedFields.Scale) {
      const value = getMetaVector(meta, 'scale', 1);
      if (!['X', 'Y', 'Z'].every((axis) => sameNumber(value[axis], draft.Scale))) return false;
    }
    return true;
  }

  async function applyChanges() {
    if (applying) return;
    const pendingIds = Object.keys(dirtyFields).filter((id) =>
      dirtyFields[id] && ['Position', 'Rotation', 'Scale'].some((kind) => dirtyFields[id][kind] === true)
    );
    if (!pendingIds.length) {
      setStatus('There are no unsaved changes to apply.');
      return;
    }

    applying = true;
    updateApplyButton();
    setStatus('Refreshing your avatar before applying changes…');

    try {
      const currentAvatar = await getCurrentAvatarModel();
      const currentAssets = currentAvatar.assets;
      const currentById = new Map(currentAssets.map((item) => [String(item?.id), item]));
      const changedById = new Map();

      for (const id of pendingIds) {
        const current = currentById.get(id);
        if (!current) {
          throw new Error('An edited accessory is no longer equipped. Refresh the avatar editor and try again.');
        }
        const localAsset = assets.find((asset) => asset.id === id);
        if (!localAsset) continue;
        localAsset.meta = current.meta || null;
        const draft = getDraft(id);
        const requested = dirtyFields[id] || {};
        const changedFields = {};
        for (const kind of ['Position', 'Rotation', 'Scale']) {
          if (requested[kind] === true && !fieldMatchesMeta({ ...localAsset, meta: current.meta }, kind)) {
            changedFields[kind] = true;
          }
        }
        if (!Object.keys(changedFields).length) {
          delete dirtyFields[id];
          continue;
        }
        changedById.set(id, { draft, changedFields, source: current });
      }

      if (!changedById.size) {
        scheduleSave();
        setStatus('The latest Roblox avatar already has these values. Nothing needed to be applied.');
        return;
      }

      const requestAssets = currentAssets.map((item) => {
        const assetId = String(item.id);
        const output = { id: Number(item.id) };
        const change = changedById.get(assetId);
        if (change) {
          output.meta = buildRefinedMeta(item.meta, change.draft, change.changedFields);
        } else if (item.meta && typeof item.meta === 'object') {
          output.meta = { ...item.meta };
        }
        return output;
      });

      setStatus('Applying ' + changedById.size + ' accessory change' + (changedById.size === 1 ? '' : 's') + ' to Roblox…');
      await apiPatch(AVATAR_API + '/v4/avatar', {
        updateTypes: ['UpdateAssets'],
        avatarDefinition: {
          updateAvatarModel: { assets: requestAssets }
        }
      });

      setStatus('Roblox accepted the update. Verifying saved values…');
      let verifiedAvatar;
      try {
        verifiedAvatar = await getCurrentAvatarModel();
      } catch {
        setStatus('Roblox accepted the update, but verification failed. Refresh the avatar editor to confirm it.');
        return;
      }

      const verifiedById = new Map(verifiedAvatar.assets.map((item) => [String(item?.id), item]));
      let verifiedCount = 0;
      let normalizedCount = 0;
      let verificationFailedCount = 0;
      for (const [id, change] of changedById) {
        const saved = verifiedById.get(id);
        if (!saved || !saved.meta) {
          verificationFailedCount += 1;
          continue;
        }
        const matched = metaMatchesDraft(saved.meta, change.draft, change.changedFields);
        if (matched) verifiedCount += 1;
        else normalizedCount += 1;

        const localAsset = assets.find((asset) => asset.id === id);
        if (localAsset) localAsset.meta = saved.meta || null;
        const actualDraft = getDraft(id);
        const actualPosition = getMetaVector(saved.meta, 'position', 0);
        const actualRotation = getMetaVector(saved.meta, 'rotation', 0);
        const actualScale = getMetaVector(saved.meta, 'scale', 1);
        if (change.changedFields.Position) actualDraft.Position = actualPosition;
        if (change.changedFields.Rotation) actualDraft.Rotation = actualRotation;
        if (change.changedFields.Scale) actualDraft.Scale = actualScale.X;

        if (matched || saved.meta) delete dirtyFields[id];
      }

      scheduleSave();
      loadedAt = Date.now();
      render();
      if (verificationFailedCount) {
        setStatus('Roblox accepted the update, but ' + verificationFailedCount + ' accessory change' + (verificationFailedCount === 1 ? ' could not' : 's could not') + ' be verified. Refresh the avatar editor to check.');
      } else if (normalizedCount) {
        setStatus('Applied. Roblox adjusted or normalized ' + normalizedCount + ' accessory value' + (normalizedCount === 1 ? '' : 's') + '.');
      } else if (verifiedCount === changedById.size) {
        setStatus('Successfully applied and verified ' + verifiedCount + ' accessory change' + (verifiedCount === 1 ? '' : 's') + '.');
      } else {
        setStatus('Roblox accepted the update, but not all values could be verified. Refresh the avatar editor to check.');
      }
    } catch (error) {
      setStatus(error?.message || 'Could not apply accessory changes to Roblox.');
    } finally {
      applying = false;
      updateApplyButton();
    }
  }

  function findKey(object, names) {
    if (!object || typeof object !== 'object') return undefined;
    const entries = Object.entries(object);
    for (const name of names) {
      const match = entries.find(([key]) => key.toLowerCase() === String(name).toLowerCase());
      if (match) return match[1];
    }
    return undefined;
  }

  function readBound(rootObject, typeName, typeId, kind, axis) {
    const typeNode = findKey(rootObject, [typeName, String(typeId)]);
    if (!typeNode) return undefined;
    const modeNode = findKey(typeNode, [kind, kind.toLowerCase()]);
    const candidates = [
      findKey(modeNode, [axis, axis + kind, axis.toLowerCase()]),
      findKey(typeNode, [axis + kind, axis + kind + 'Offset'])
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    }
    if (Array.isArray(modeNode)) {
      const index = ['X', 'Y', 'Z'].indexOf(axis);
      if (Number.isFinite(Number(modeNode[index]))) return Number(modeNode[index]);
    }
    return undefined;
  }

  function getBounds(asset, kind, axis) {
    const defaults = FALLBACK_LIMITS[kind];
    const lower = readBound(rules?.accessoryRefinementLowerBounds, asset.type, asset.typeId, kind, axis);
    const upper = readBound(rules?.accessoryRefinementUpperBounds, asset.type, asset.typeId, kind, axis);
    const min = Number.isFinite(lower) ? lower : defaults[0];
    const max = Number.isFinite(upper) ? upper : defaults[1];
    return min <= max ? { min, max, step: defaults[2] } : { min: defaults[0], max: defaults[1], step: defaults[2] };
  }

  function getScaleBounds(asset) {
    const bounds = ['X', 'Y', 'Z'].map((axis) => getBounds(asset, 'Scale', axis));
    const min = Math.max(...bounds.map((bound) => bound.min));
    const max = Math.min(...bounds.map((bound) => bound.max));
    return min <= max ? { min, max, step: FALLBACK_LIMITS.Scale[2] } : {
      min: FALLBACK_LIMITS.Scale[0], max: FALLBACK_LIMITS.Scale[1], step: FALLBACK_LIMITS.Scale[2]
    };
  }

  async function loadAssets() {
    if (loading) return loading;
    if (assets.length && Date.now() - loadedAt < 15000) return assets;

    loading = (async () => {
      setStatus('Loading equipped accessories…');
      const results = await Promise.allSettled([
        getCurrentAvatarModel(),
        apiGet(AVATAR_API + '/v1/avatar-rules')
      ]);
      if (results[0].status !== 'fulfilled') throw results[0].reason;
      rules = results[1].status === 'fulfilled' ? results[1].value : null;

      const avatar = results[0].value;
      const equipped = avatar.assets;

      const refinementTypes = rules?.accessoryRefinementTypes ?? rules?.AccessoryRefinementTypes;
      const allowedTypes = Array.isArray(refinementTypes) && refinementTypes.length
        ? new Set(refinementTypes.map(Number)) : FALLBACK_TYPES;

      const stored = await chrome.storage.local.get([DRAFT_KEY, DIRTY_KEY]).catch(() => ({}));
      drafts = stored?.[DRAFT_KEY] && typeof stored[DRAFT_KEY] === 'object' ? stored[DRAFT_KEY] : {};
      dirtyFields = stored?.[DIRTY_KEY] && typeof stored[DIRTY_KEY] === 'object' ? stored[DIRTY_KEY] : {};

      assets = equipped.filter((item) => {
        const id = String(item?.id ?? '');
        return /^\d{1,20}$/.test(id) && allowedTypes.has(getTypeId(item));
      }).map((item) => ({
        id: String(item.id), name: String(item.name || ('Accessory ' + item.id)),
        type: getTypeName(item), typeId: getTypeId(item), meta: item.meta || null, image: ''
      }));

      assets.forEach((asset) => getDraft(asset.id, asset.meta));

      if (assets.length) {
        try {
          const query = new URLSearchParams({ assetIds: assets.map((asset) => asset.id).join(','), size: '150x150', format: 'Webp', isCircular: 'false' });
          const response = await apiGet(THUMBNAIL_API + '/v1/assets?' + query.toString());
          const urls = new Map((Array.isArray(response?.data) ? response.data : []).map((item) => [String(item.targetId), item.imageUrl]));
          assets.forEach((asset) => { asset.image = urls.get(asset.id) || ''; });
        } catch {}
      }

      loadedAt = Date.now();
      if (!assets.some((asset) => asset.id === selectedId)) selectedId = assets[0]?.id || null;
      render();
      setStatus(assets.length ? (pendingAssetCount() ? 'Unsaved changes are stored locally. Select Apply to update your avatar.' : 'Select an accessory and adjust its position, rotation or scale.') : 'No equipped accessories support adjustment.');
      updateApplyButton();
      return assets;
    })().catch((error) => {
      assets = [];
      render();
      setStatus(error?.message || 'Could not load avatar accessories.');
      throw error;
    }).finally(() => { loading = null; });

    return loading;
  }

  function makeItem(asset) {
    const button = el('button', 'RoImpr-aa-item');
    button.type = 'button';
    button.title = asset.name;
    button.setAttribute('aria-label', asset.name);
    button.setAttribute('aria-pressed', String(asset.id === selectedId));
    if (asset.image) {
      const image = el('img');
      image.src = asset.image;
      image.alt = '';
      image.loading = 'lazy';
      button.appendChild(image);
    } else button.textContent = '◇';
    button.addEventListener('click', () => { selectedId = asset.id; render(); });
    return button;
  }

  function makeSlider(axis, asset, value, onChange) {
    const bounds = getBounds(asset, mode, axis);
    const row = el('div', 'RoImpr-aa-slider');
    row.appendChild(el('label', '', axis));
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(bounds.min);
    input.max = String(Math.max(bounds.min, bounds.max));
    input.step = String(bounds.step);
    input.value = String(Math.min(bounds.max, Math.max(bounds.min, Number(value))));
    input.setAttribute('aria-label', mode + ' ' + axis);
    const output = el('output', 'RoImpr-aa-value', Number(input.value).toFixed(2));
    input.addEventListener('input', () => {
      const next = Number(input.value);
      output.textContent = next.toFixed(2);
      onChange(next);
      syncDirty(asset, mode);
    });
    row.append(input, output);
    return row;
  }

  function renderSliders(asset) {
    sliders.replaceChildren();
    if (!asset) return;
    const value = getDraft(asset.id);
    if (mode === 'Scale') {
      const bounds = getScaleBounds(asset);
      const row = el('div', 'RoImpr-aa-slider');
      row.appendChild(el('label', '', 'S'));
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(bounds.min);
      input.max = String(Math.max(bounds.min, bounds.max));
      input.step = String(bounds.step);
      input.value = String(Math.min(bounds.max, Math.max(bounds.min, Number(value.Scale))));
      input.setAttribute('aria-label', 'Uniform scale');
      const output = el('output', 'RoImpr-aa-value', Number(input.value).toFixed(2));
      input.addEventListener('input', () => {
        value.Scale = Number(input.value);
        output.textContent = value.Scale.toFixed(2);
        syncDirty(asset, 'Scale');
      });
      row.append(input, output);
      sliders.appendChild(row);
      return;
    }
    ['X', 'Y', 'Z'].forEach((axis) => sliders.appendChild(makeSlider(axis, asset, value[mode][axis], (next) => {
      value[mode][axis] = next;
    })));
  }

  function render() {
    if (!root) return;
    list.replaceChildren();
    assets.forEach((asset) => list.appendChild(makeItem(asset)));
    const selected = assets.find((asset) => asset.id === selectedId);
    selectedLabel.textContent = selected ? selected.name : 'No adjustable accessories found';
    panel.querySelectorAll('.RoImpr-aa-mode').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    renderSliders(selected || null);
    updateApplyButton();
  }

  function resetCurrent() {
    if (!selectedId) return;
    const asset = assets.find((item) => item.id === selectedId);
    if (!asset) return;
    const value = getDraft(selectedId);
    if (mode === 'Scale') value.Scale = 1;
    else value[mode] = { X: 0, Y: 0, Z: 0 };
    syncDirty(asset, mode);
    render();
  }

  function createPanel() {
    panel = el('section', 'RoImpr-aa-panel');
    panel.dataset.open = 'false';
    const heading = el('div', 'RoImpr-aa-head');
    heading.appendChild(el('div', 'RoImpr-aa-title', 'Accessory adjustment'));
    const close = el('button', 'RoImpr-aa-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => setOpen(false));
    heading.appendChild(close);
    list = el('div', 'RoImpr-aa-list');
    list.setAttribute('aria-label', 'Equipped accessory icons');
    selectedLabel = el('div', 'RoImpr-aa-name', 'Select an accessory');
    const modes = el('div', 'RoImpr-aa-modes');
    ['Position', 'Rotation', 'Scale'].forEach((name) => {
      const button = el('button', 'RoImpr-aa-mode', name);
      button.type = 'button';
      button.dataset.mode = name;
      button.setAttribute('aria-pressed', String(name === mode));
      button.addEventListener('click', () => { mode = name; render(); });
      modes.appendChild(button);
    });
    sliders = el('div', 'RoImpr-aa-sliders');
    const actions = el('div', 'RoImpr-aa-actions');
    const reset = el('button', 'RoImpr-aa-reset', 'Reset');
    reset.type = 'button';
    reset.addEventListener('click', resetCurrent);
    applyButton = el('button', 'RoImpr-aa-apply', 'Apply');
    applyButton.type = 'button';
    applyButton.disabled = true;
    applyButton.addEventListener('click', applyChanges);
    actions.append(reset, applyButton);
    status = el('p', 'RoImpr-aa-status', 'Changes stay as a local draft until you press Apply.');
    panel.append(heading, list, selectedLabel, modes, sliders, actions, status);
    return panel;
  }

  function setOpen(open) {
    if (!panel || !root) return;
    panel.dataset.open = String(open);
    root.querySelector('.RoImpr-aa-trigger')?.setAttribute('aria-expanded', String(open));
    if (open) loadAssets().catch(() => {});
  }

  function mount() {
    if (document.getElementById(ROOT_ID)) return true;
    installStyles();
    const redraw = document.querySelector('.redraw-avatar');
    if (!redraw || !redraw.parentElement) return false;
    const wrapper = el('div');
    wrapper.id = ROOT_ID;
    const trigger = el('button', 'foundation-web-link bg-none stroke-none padding-none appearance-none [text-align:inherit] inline-flex items-center gap-xsmall content-emphasis underline motion-safe:transition-opacity hover:cursor-pointer hover:[opacity:0.8] radius-xsmall focus-visible:[outline-style:solid] focus-visible:[outline-width:var(--stroke-standard)] focus-visible:[outline-color:var(--color-system-emphasis)] redraw-link RoImpr-aa-trigger', 'Accessory adjustment');
    trigger.type = 'button';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', () => setOpen(panel.dataset.open !== 'true'));
    root = wrapper;
    wrapper.append(trigger, createPanel());
    redraw.insertAdjacentElement('afterend', wrapper);
    return true;
  }

  function watchPage() {
    if (mount()) return;
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  watchPage();
  window.addEventListener('roimpr:route-change', mount);
  window.addEventListener('popstate', mount);
})();
