const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function header(handle) { return `<div data-testid="User-Name"><div><a href="/${handle}"><span>${handle}</span></a></div><div><a href="/${handle}">@${handle}</a></div></div>`; }
async function setup() {
  const dom = new JSDOM(`<body><article data-testid="tweet" id="post">${header('oldauthor')}<div data-testid="tweetText">Original post</div><div role="link" id="quote">${header('newauthor')}<div>Quoted post</div></div></article></body>`, { url: 'https://x.com/home', runScripts: 'outside-only' });
  const { window } = dom;
  let listener;
  window.Intl.DisplayNames = Intl.DisplayNames;
  window.chrome = { storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener: fn => { listener = fn; } } } };
  for (const file of ['model.js', 'content.js']) window.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  await pause(180);
  const record = (handle, source, createdAt, country = 'India') => window.dispatchEvent(new window.MessageEvent('message', { origin: window.location.origin, source: window, data: { channel: 'x-account-context-v1', type: 'account', account: { handle, source, createdAt, country, observedAt: Date.now(), aboutChecked: true } } }));
  const settings = async next => { listener({ settings: { newValue: next } }, 'local'); await pause(180); };
  return { dom, window, record, settings };
}
test('country badge is beside author and quoted author, no duplicates', async () => {
  const { dom, window, record } = await setup();
  try {
    record('oldauthor', 'Web', '2009-06-01', 'United States');
    record('newauthor', 'Android', new Date().toISOString());
    await pause(180);
    assert.equal(window.document.querySelectorAll('.xac-badge').length, 2);
    assert.equal(window.document.querySelector('#post .xac-badge').textContent, '🇺🇸 United States');
    assert.equal(window.document.querySelector('#quote .xac-badge').textContent, '🇮🇳 India');
    assert.equal(window.document.querySelector('.xac-badge').previousElementSibling.tagName, 'A');
    assert.equal(window.document.querySelectorAll('[data-xac-hidden]').length, 0);
  } finally { dom.window.close(); }
});
test('quote filters independently; reveal and disable restore content', async () => {
  const { dom, window, record, settings } = await setup();
  try {
    record('oldauthor', 'Web', '2009-06-01');
    record('newauthor', 'Android', new Date().toISOString());
    await settings({ showCountry: true, hideRecent: true, hideAndroid: true });
    const post = window.document.getElementById('post');
    const quote = window.document.getElementById('quote');
    assert.equal(post.hasAttribute('data-xac-hidden'), false);
    assert.equal(quote.hasAttribute('data-xac-hidden'), true);
    quote.querySelector('.xac-placeholder button').click();
    assert.equal(quote.hasAttribute('data-xac-hidden'), false);
    await settings({ showCountry: false, hideRecent: false, hideAndroid: false });
    assert.equal(window.document.querySelectorAll('.xac-badge').length, 0);
    assert.equal(window.document.querySelectorAll('.xac-placeholder').length, 0);
  } finally { dom.window.close(); }
});
test('Android author collapses main post; switching off restores it', async () => {
  const { dom, window, record, settings } = await setup();
  try {
    record('oldauthor', 'Android', '2009-06-01');
    await settings({ showCountry: true, hideRecent: false, hideAndroid: true });
    assert.equal(window.document.getElementById('post').hasAttribute('data-xac-hidden'), true);
    await settings({ showCountry: true, hideRecent: false, hideAndroid: false });
    assert.equal(window.document.getElementById('post').hasAttribute('data-xac-hidden'), false);
  } finally { dom.window.close(); }
});
test('untrusted country is text, not executable HTML', async () => {
  const { dom, window, record } = await setup();
  try {
    record('oldauthor', null, null, '<img src=x onerror=alert(1)>');
    await pause(180);
    assert.equal(window.document.querySelector('.xac-badge img'), null);
  } finally { dom.window.close(); }
});
