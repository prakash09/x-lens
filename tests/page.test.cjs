const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function setup(responseFactory) {
  const dom = new JSDOM('<body></body>', { url: 'https://x.com/home', runScripts: 'outside-only' });
  const { window } = dom;
  const requests = [];
  const messages = [];
  window.Intl.DisplayNames = Intl.DisplayNames;
  window.Headers = Headers;
  window.Request = Request;
  window.AbortSignal = AbortSignal;
  window.AbortController = AbortController;
  window.document.cookie = 'ct0=test-csrf';
  window.fetch = async (input, init) => {
    requests.push({ input, init });
    return responseFactory(input, init);
  };
  window.postMessage = message => {
    messages.push(message);
    if (message.type === 'requestPermit') window.dispatchEvent(new window.MessageEvent('message', { origin: window.location.origin, source: window, data: { channel: message.channel, type: 'permit', id: message.id, allowed: true } }));
  };
  for (const file of ['model.js', 'page.js']) window.eval(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'));
  const session = new window.XMLHttpRequest();
  session.open('GET', '/i/api/graphql/test/HomeTimeline');
  session.setRequestHeader('authorization', 'Bearer test-client-header');
  session.dispatchEvent(new window.Event('load'));
  window.dispatchEvent(new window.MessageEvent('message', { origin: window.location.origin, source: window, data: { channel: 'x-account-context-v1', type: 'configure', settings: { autoLookup: true } } }));
  const lookup = handle => window.dispatchEvent(new window.MessageEvent('message', { origin: window.location.origin, source: window, data: { channel: 'x-account-context-v1', type: 'lookup', handle } }));
  return { dom, window, requests, messages, lookup };
}
test('lookup stays on X, projects fields and never passes session headers to isolated world', async () => {
  const fixture = { data: { user_result_by_screen_name: { result: { core: { screen_name: 'elonmusk', created_at: '2009-06-01' }, about_profile: { account_based_in: 'United States', source: 'United States App Store' } } } } };
  const { dom, requests, messages, lookup } = setup(() => new Response(JSON.stringify(fixture)));
  try {
    lookup('elonmusk'); lookup('elonmusk'); lookup('../bad');
    await pause(50);
    assert.equal(requests.length, 1);
    assert.ok(requests[0].input.startsWith('/i/api/graphql/'));
    assert.equal(requests[0].init.credentials, 'include');
    assert.equal(requests[0].init.headers['x-csrf-token'], 'test-csrf');
    assert.equal(messages.find(message => message.type === 'account').account.country, 'United States');
    assert.equal(JSON.stringify(messages).includes('test-csrf'), false);
    assert.equal(JSON.stringify(messages).includes('Bearer'), false);
  } finally { dom.window.close(); }
});
test('429 pauses queue and broadcasts cooldown without assigning country', async () => {
  const { dom, requests, messages, lookup } = setup(() => new Response('{}', { status: 429 }));
  try {
    lookup('one'); lookup('two');
    await pause(1700);
    assert.equal(requests.length, 1);
    assert.ok(messages.some(message => message.type === 'cooldown' && message.until > Date.now()));
    assert.equal(messages.some(message => message.type === 'account'), false);
  } finally { dom.window.close(); }
});
test('mismatched response does not attach another account country', async () => {
  const { dom, messages, lookup } = setup(() => new Response(JSON.stringify({ data: { user_result_by_screen_name: { result: { core: { screen_name: 'wronguser' }, about_profile: { account_based_in: 'India' } } } } })));
  try {
    lookup('elonmusk');
    await pause(50);
    assert.equal(messages.some(message => message.type === 'account'), false);
    assert.ok(messages.some(message => message.type === 'lookupFailed'));
  } finally { dom.window.close(); }
});
test('timeline response prefetches before DOM requests; warm cache skips the lookup', async () => {
  const fixture = { core: { screen_name: 'aheaduser', created_at: '2009-06-01' } };
  for (const cached of [false, true]) {
    const { dom, window, requests } = setup(input => input.includes('Timeline') ? new Response(JSON.stringify({ data: fixture })) : new Response(JSON.stringify({ data: { user_result_by_screen_name: { result: { ...fixture, about_profile: { account_based_in: 'India' } } } } })));
    try {
      window.dispatchEvent(new window.MessageEvent('message', { origin: window.location.origin, source: window, data: { channel: 'x-account-context-v1', type: 'configure', settings: { showCountry: true, autoLookup: true }, cache: cached ? [{ handle: 'aheaduser', aboutChecked: true, country: 'India', observedAt: Date.now() }] : [] } }));
      await window.fetch('/i/api/graphql/example/HomeTimeline');
      await pause(70);
      assert.equal(window.document.querySelectorAll('article').length, 0);
      assert.equal(requests.filter(request => request.input.includes('AboutAccountQuery')).length, cached ? 0 : 1);
    } finally { dom.window.close(); }
  }
});
test('default settings make no background About requests', async () => {
  const fixture = { core: { screen_name: 'quietuser', created_at: '2020-01-01' } };
  const { dom, window, requests, lookup } = setup(() => new Response(JSON.stringify({ data: fixture })));
  try {
    window.dispatchEvent(new window.MessageEvent('message', { origin: window.location.origin, source: window, data: { channel: 'x-account-context-v1', type: 'configure', settings: {} } }));
    await window.fetch('/i/api/graphql/test/HomeTimeline');
    lookup('quietuser');
    await pause(70);
    assert.equal(requests.filter(request => request.input.includes('AboutAccountQuery')).length, 0);
  } finally { dom.window.close(); }
});
