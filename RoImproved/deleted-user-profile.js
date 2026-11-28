'use strict';

(() => {
  const params = new URLSearchParams(location.search);
  const userId = String(params.get('id') || '').trim();
  const username = String(params.get('username') || '').trim().replace(/^@/, '').slice(0, 20);
  const displayName = String(params.get('displayName') || '').trim().slice(0, 80);
  if (!/^\d{1,20}$/.test(userId)) {
    const content = document.getElementById('content');
    if (content) content.textContent = 'Invalid Roblox user ID.';
    return;
  }

  const user = {
    id: userId,
    name: username || 'Deleted User',
    displayName: displayName || username || 'Deleted User',
    description: '',
    isBanned: true
  };
  const target = { id: userId, username, displayName };
  const renderer = window.__ROIMPR_EXPERIMENTAL_DELETED_PROFILE_RENDERER__;
  if (!renderer || typeof renderer.render !== 'function') {
    const content = document.getElementById('content');
    if (content) content.textContent = 'Could not initialize the profile renderer. Reload the page.';
    return;
  }
  renderer.render(target, user).then((ok) => {
    if (ok) return;
    const content = document.getElementById('content');
    if (content) content.textContent = 'Could not load this deleted profile. Roblox may be temporarily unavailable.';
  }).catch(() => {
    const content = document.getElementById('content');
    if (content) content.textContent = 'Could not load this deleted profile.';
  });
})();
