'use strict';

const DEFAULTS = Object.freeze({
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

const INPUT_KEYS = Object.keys(DEFAULTS).filter((key) => key !== 'sidebarCollapsed');
const pendingWrites = new Map();
const saveStatus = document.getElementById('saveStatus');
const resetButton = document.getElementById('resetSettings');
const sidebarButtonList = document.getElementById('sidebarButtonList');

function setStatus(message) {
  if (saveStatus) saveStatus.textContent = message;
}

function updateSidebarOptions() {
  const input = document.getElementById('sidebarButtonsEnabled');
  if (sidebarButtonList && input) sidebarButtonList.disabled = !input.checked || input.disabled;
}

function setInputsDisabled(disabled) {
  for (const key of INPUT_KEYS) {
    const input = document.getElementById(key);
    if (input) input.disabled = disabled;
  }
  updateSidebarOptions();
}

function updateInputs(settings) {
  for (const key of INPUT_KEYS) {
    const input = document.getElementById(key);
    if (input?.type === 'checkbox') input.checked = settings[key] === true;
  }
  updateSidebarOptions();
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(INPUT_KEYS);
  const settings = { ...DEFAULTS };
  for (const key of INPUT_KEYS) {
    if (typeof stored[key] === 'boolean') settings[key] = stored[key];
  }
  updateInputs(settings);
  return settings;
}

async function saveSetting(key, value) {
  if (!Object.hasOwn(DEFAULTS, key) || typeof value !== 'boolean') return;
  setStatus('Saving...');

  const previous = pendingWrites.get(key) || Promise.resolve();
  const write = previous.catch(() => {}).then(() =>
    chrome.storage.local.set({ [key]: value })
  );
  pendingWrites.set(key, write);

  try {
    await write;
    if (key.startsWith('sidebar')) {
      await chrome.runtime.sendMessage({ type: 'ROIMPR_SYNC_CONTENT_SCRIPTS' }).catch(() => {});
    }
    if (pendingWrites.get(key) === write) {
      pendingWrites.delete(key);
      setStatus('Saved. Reload open Roblox tabs to fully apply.');
    }
  } catch {
    if (pendingWrites.get(key) === write) {
      pendingWrites.delete(key);
      setStatus('Could not save this setting.');
      await loadSettings().catch(() => {});
    }
  }
}

async function resetSettings() {
  if (!resetButton || resetButton.disabled) return;
  resetButton.disabled = true;
  setInputsDisabled(true);
  setStatus('Restoring defaults...');

  try {
    await Promise.allSettled([...pendingWrites.values()]);
    await chrome.storage.local.set(DEFAULTS);
    await chrome.runtime.sendMessage({ type: 'ROIMPR_SYNC_CONTENT_SCRIPTS' }).catch(() => {});
    updateInputs(DEFAULTS);
    setStatus('Defaults restored. Reload open Roblox tabs to fully apply.');
  } catch {
    setStatus('Could not reset settings.');
  } finally {
    setInputsDisabled(false);
    resetButton.disabled = false;
  }
}

for (const key of INPUT_KEYS) {
  const input = document.getElementById(key);
  if (!input || input.type !== 'checkbox') continue;
  input.addEventListener('change', () => {
    if (key === 'sidebarButtonsEnabled') updateSidebarOptions();
    saveSetting(key, input.checked);
  });
}

resetButton?.addEventListener('click', resetSettings);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const key of INPUT_KEYS) {
    if (!Object.hasOwn(changes, key)) continue;
    const input = document.getElementById(key);
    const value = changes[key].newValue;
    if (input && typeof value === 'boolean') input.checked = value;
  }
  updateSidebarOptions();
});

setInputsDisabled(true);
loadSettings()
  .then(() => {
    setInputsDisabled(false);
    setStatus('Settings are local. Reload open Roblox tabs after changes.');
  })
  .catch(() => setStatus('Could not load settings.'));

const thumbnailApiKeyInput = document.getElementById('openCloudThumbnailApiKey');
const rememberThumbnailApiKeyInput = document.getElementById('rememberThumbnailApiKey');
const thumbnailTestUserIdInput = document.getElementById('thumbnailTestUserId');
const saveThumbnailApiKeyButton = document.getElementById('saveThumbnailApiKey');
const clearThumbnailApiKeyButton = document.getElementById('clearThumbnailApiKey');
const testThumbnailApiKeyButton = document.getElementById('testThumbnailApiKey');
const thumbnailKeyStatus = document.getElementById('thumbnailKeyStatus');
const thumbnailTestPreview = document.getElementById('thumbnailTestPreview');
const thumbnailTestImage = document.getElementById('thumbnailTestImage');
const thumbnailTestLabel = document.getElementById('thumbnailTestLabel');

function setThumbnailKeyStatus(message, isSaved = false) {
  if (!thumbnailKeyStatus) return;
  thumbnailKeyStatus.textContent = message;
  thumbnailKeyStatus.style.color = isSaved ? '#9fbea4' : '#aab4c1';
}

function clearThumbnailPreview() {
  if (thumbnailTestPreview) thumbnailTestPreview.hidden = true;
  if (thumbnailTestImage) thumbnailTestImage.removeAttribute('src');
  if (thumbnailTestLabel) thumbnailTestLabel.textContent = '';
}

async function refreshThumbnailKeyStatus() {
  try {
    const [local, session] = await Promise.all([
      chrome.storage.local.get('openCloudThumbnailApiKey'),
      chrome.storage.session.get('openCloudThumbnailApiKey')
    ]);
    const localKey = typeof local.openCloudThumbnailApiKey === 'string' && local.openCloudThumbnailApiKey.length >= 20;
    const sessionKey = typeof session.openCloudThumbnailApiKey === 'string' && session.openCloudThumbnailApiKey.length >= 20;
    if (rememberThumbnailApiKeyInput) rememberThumbnailApiKeyInput.checked = localKey;
    setThumbnailKeyStatus(localKey
      ? 'API key is saved on this device. Test it against a banned user ID below.'
      : sessionKey
        ? 'API key is saved for this browser session. Enable “Remember this key” to keep it after restarting the browser.'
        : 'No API key configured. Public headshots remain enabled; Open Cloud fallback is disabled.', localKey || sessionKey);
  } catch {
    setThumbnailKeyStatus('Could not read the saved API key status.');
  }
}

async function runThumbnailTest() {
  const userId = String(thumbnailTestUserIdInput?.value || '').trim();
  if (!/^\d{1,20}$/.test(userId)) {
    setThumbnailKeyStatus('Enter the numeric ID of the banned/deleted user you want to test.');
    clearThumbnailPreview();
    return;
  }
  if (testThumbnailApiKeyButton) {
    testThumbnailApiKeyButton.disabled = true;
    testThumbnailApiKeyButton.textContent = 'Testing…';
  }
  setThumbnailKeyStatus(`Testing Open Cloud thumbnail generation for user ${userId}…`);
  clearThumbnailPreview();
  try {
    const result = await chrome.runtime.sendMessage({ type: 'ROIMPR_THUMBNAIL_KEY_TEST', userId });
    if (result?.ok && result.imageUrl) {
      if (thumbnailTestImage) thumbnailTestImage.src = result.imageUrl;
      if (thumbnailTestPreview) thumbnailTestPreview.hidden = false;
      if (thumbnailTestLabel) thumbnailTestLabel.textContent = `Generated for ${userId} (${result.source || 'Open Cloud'}).`;
      setThumbnailKeyStatus(result.message || 'Generated thumbnail received.', true);
    } else {
      setThumbnailKeyStatus(result?.message || 'Generation failed. Check the key permissions and Roblox response.');
    }
  } catch {
    setThumbnailKeyStatus('Could not contact the extension background service. Reload RoImproved and retry.');
  } finally {
    if (testThumbnailApiKeyButton) {
      testThumbnailApiKeyButton.disabled = false;
      testThumbnailApiKeyButton.textContent = 'Test Open Cloud key';
    }
  }
}

saveThumbnailApiKeyButton?.addEventListener('click', async () => {
  const key = String(thumbnailApiKeyInput?.value || '').trim();
  if (key.length < 20 || key.length > 2048) {
    setThumbnailKeyStatus('Enter a valid-looking Open Cloud API key (20–2048 characters).');
    return;
  }
  try {
    if (rememberThumbnailApiKeyInput?.checked) {
      await chrome.storage.local.set({ openCloudThumbnailApiKey: key });
      await chrome.storage.session.remove('openCloudThumbnailApiKey');
      setThumbnailKeyStatus('API key saved on this device. Test it against a banned user ID.', true);
    } else {
      await chrome.storage.session.set({ openCloudThumbnailApiKey: key });
      await chrome.storage.local.remove('openCloudThumbnailApiKey');
      setThumbnailKeyStatus('API key saved for this browser session. Enable “Remember this key” to keep it after restarting the browser.', true);
    }
    if (thumbnailApiKeyInput) thumbnailApiKeyInput.value = '';
  } catch {
    setThumbnailKeyStatus('Could not save the API key.');
  }
});

clearThumbnailApiKeyButton?.addEventListener('click', async () => {
  try {
    await Promise.all([
      chrome.storage.session.remove('openCloudThumbnailApiKey'),
      chrome.storage.local.remove('openCloudThumbnailApiKey')
    ]);
    if (thumbnailApiKeyInput) thumbnailApiKeyInput.value = '';
    if (rememberThumbnailApiKeyInput) rememberThumbnailApiKeyInput.checked = false;
    clearThumbnailPreview();
    setThumbnailKeyStatus('API key cleared. Public thumbnail fallbacks remain enabled.');
  } catch {
    setThumbnailKeyStatus('Could not clear the saved API key.');
  }
});

testThumbnailApiKeyButton?.addEventListener('click', runThumbnailTest);
refreshThumbnailKeyStatus();
