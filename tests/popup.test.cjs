const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const pause = () => new Promise(resolve => setImmediate(resolve));
async function openPopup(saved) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'popup.html'), 'utf8'), { runScripts: 'outside-only' });
  dom.window.Intl.DisplayNames = Intl.DisplayNames;
  dom.window.chrome = { storage: { local: {
    get: async () => JSON.parse(JSON.stringify(saved)),
    set: async values => Object.assign(saved, JSON.parse(JSON.stringify(values))),
  } } };
  for (const file of ['model.js', 'popup.js']) dom.window.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  await pause();
  return dom;
}
test('all popup settings survive closing and recreating the popup', async () => {
  const saved = {};
  const first = await openPopup(saved);
  const expected = { showCountry: false, minimumAgeMonths: 24, hideAndroid: true, hideIOS: true, hideWeb: true, hideForYou: true, hideNews: true, hideTrending: true };
  try {
    for (const [key, value] of Object.entries(expected)) {
      const input = first.window.document.getElementById(key);
      if (input.tagName === 'SELECT') input.value = String(value);
      else input.checked = value;
      input.dispatchEvent(new first.window.Event('change'));
      await pause();
    }
  } finally { first.window.close(); }
  assert.deepEqual(saved.settings, expected);
  const second = await openPopup(saved);
  try {
    for (const [key, value] of Object.entries(expected)) {
      const input = second.window.document.getElementById(key);
      assert.equal(input.tagName === 'SELECT' ? Number(input.value) : input.checked, value, key);
    }
    second.window.document.getElementById('clearCache').click();
    await pause();
    assert.deepEqual(saved.settings, expected);
  } finally { second.window.close(); }
});
