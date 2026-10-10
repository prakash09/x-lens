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
  const style = window.document.createElement('style');
  style.textContent = fs.readFileSync(path.join(root, 'content.css'), 'utf8');
  window.document.head.append(style);
  let listener;
  window.Intl.DisplayNames = Intl.DisplayNames;
  window.chrome = { storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener: fn => { listener = fn; } } } };
  for (const file of ['content.bundle.js']) window.eval(fs.readFileSync(path.join(root, file), 'utf8'));
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
function distractions(window) {
  const layout = window.document.createElement('div');
  layout.innerHTML = `<main data-testid="primaryColumn"><nav role="tablist"><a role="tab" aria-selected="true" href="/home" id="for-you">For you</a><a role="tab" aria-selected="false" href="/home" id="following">Following</a></nav><article id="unrelated-post"><h2>Today's News</h2><a href="/example">A post with the same words</a></article></main><aside data-testid="sidebarColumn"><div id="news"><div><h2>Today’s News<span aria-label="Close">Close</span></h2></div><div role="link" tabindex="0"><h3>A news story</h3></div></div><section id="trends"><div><h2>What’s happening</h2></div><a href="/search?q=topic">A trend</a></section><section id="follow"><h2>Who to follow</h2><a href="/example">A suggested account</a></section></aside>`;
  window.document.body.append(layout);
  const following = window.document.getElementById('following');
  let clicks = 0;
  following.addEventListener('click', event => {
    event.preventDefault();
    clicks++;
    window.document.getElementById('for-you').setAttribute('aria-selected', 'false');
    following.setAttribute('aria-selected', 'true');
  });
  return { layout, clicks: () => clicks };
}
test('layout toggles are independent, scoped and reversible', async () => {
  const { dom, window, settings } = await setup();
  try {
    distractions(window);
    await settings({ hideNews: true });
    assert.equal(window.document.documentElement.hasAttribute('data-xac-hideNews'), true);
    assert.equal(window.document.documentElement.hasAttribute('data-xac-hideTrending'), false);
    assert.equal(window.document.getElementById('news').dataset.xacSection, 'news');
    assert.equal(window.getComputedStyle(window.document.getElementById('news')).display, 'none');
    assert.equal(window.document.getElementById('trends').dataset.xacSection, 'trending');
    assert.equal(window.document.getElementById('follow').hasAttribute('data-xac-section'), false);
    assert.equal(window.document.getElementById('unrelated-post').hasAttribute('data-xac-section'), false);
    await settings({ hideTrending: true });
    assert.equal(window.document.documentElement.hasAttribute('data-xac-hideNews'), false);
    assert.equal(window.document.documentElement.hasAttribute('data-xac-hideTrending'), true);
    assert.notEqual(window.getComputedStyle(window.document.getElementById('news')).display, 'none');
    assert.equal(window.getComputedStyle(window.document.getElementById('trends')).display, 'none');
    await settings({});
    assert.equal(window.document.documentElement.hasAttribute('data-xac-hideTrending'), false);
  } finally { dom.window.close(); }
});
test('hiding selected For you switches to Following once and preserves other tabs', async () => {
  const { dom, window, settings } = await setup();
  try {
    const layout = distractions(window);
    await settings({ hideForYou: true });
    await pause(100);
    assert.equal(layout.clicks(), 1);
    assert.equal(window.document.getElementById('following').getAttribute('aria-selected'), 'true');
    assert.equal(window.document.getElementById('for-you').hasAttribute('data-xac-for-you'), true);
    assert.equal(window.document.getElementById('following').hasAttribute('data-xac-for-you'), false);
    await settings({ hideForYou: false });
    assert.equal(window.document.documentElement.hasAttribute('data-xac-hideForYou'), false);
    assert.equal(layout.clicks(), 1);
  } finally { dom.window.close(); }
});
test('new sidebar cards after navigation receive the active hide setting', async () => {
  const { dom, window, settings } = await setup();
  try {
    await settings({ hideNews: true });
    distractions(window);
    await pause(80);
    assert.equal(window.document.getElementById('news').dataset.xacSection, 'news');
    assert.equal(window.getComputedStyle(window.document.getElementById('news')).display, 'none');
    assert.equal(window.document.documentElement.hasAttribute('data-xac-hideNews'), true);
  } finally { dom.window.close(); }
});

test('extension reload does not throw when saving settings', async () => {
  const { dom, window } = await setup();
  try {
    const errors = [];
    window.addEventListener('error', event => { errors.push(event.error); event.preventDefault(); });
    window.chrome.storage.local.set = () => { throw new Error('Extension context invalidated.'); };
    window.document.querySelector('input[data-setting="hideNews"]').click();
    await pause(50);
    assert.deepEqual(errors, []);
    assert.match(window.document.getElementById('xac-status').textContent, /Refresh X to reconnect/);
  } finally { dom.window.close(); }
});
