(() => {
  'use strict';
  const STYLE_ID = 'RoImpr-footer-style';
  let style = null;

  function apply(settings) {
    const enabled = settings.removePageFooter !== false;
    if (!enabled) {
      style?.remove();
      style = null;
      return;
    }
    if (style?.isConnected) return;
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '#footer-container.container-footer{display:none!important}';
    (document.head || document.documentElement).appendChild(style);
  }

  chrome.storage.local.get({ removePageFooter: false })
    .then(apply)
    .catch(() => apply({ removePageFooter: false }));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.hasOwn(changes, 'removePageFooter')) {
      apply({ removePageFooter: changes.removePageFooter.newValue });
    }
  });
})();
