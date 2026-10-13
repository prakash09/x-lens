(async () => {
  const defaults = globalThis.XAccountModel.defaults;
  const stored = await chrome.storage.local.get('settings');
  let settings = globalThis.XAccountModel.normalizeSettings(stored.settings);
  for (const key of Object.keys(defaults)) {
    const input = document.getElementById(key);
    if (input.tagName === 'SELECT') input.value = String(settings[key]);
    else if (input.type === 'text') input.value = settings[key];
    else input.checked = settings[key];
    input.addEventListener(input.type === 'text' ? 'input' : 'change', async () => {
      settings = globalThis.XAccountModel.normalizeSettings({ ...settings, [key]: input.tagName === 'SELECT' ? Number(input.value) : input.type === 'text' ? input.value : input.checked });
      await chrome.storage.local.set({ settings });
      document.getElementById('status').textContent = 'Saved. Open X pages update automatically.';
    });
  }
  document.getElementById('clearCache').addEventListener('click', async () => {
    await chrome.storage.local.set({ cache: [] });
    document.getElementById('status').textContent = 'Saved details cleared. Refresh X to load fresh details.';
  });
})();
