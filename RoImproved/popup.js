'use strict';

const DEFAULTS = Object.freeze({
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
    if (pendingWrites.get(key) === write) {
      pendingWrites.delete(key);
      setStatus('Saved locally.');
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
    updateInputs(DEFAULTS);
    setStatus('Default settings restored.');
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
    setStatus('Settings are stored locally.');
  })
  .catch(() => setStatus('Could not load settings.'));
