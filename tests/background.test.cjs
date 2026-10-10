const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(initial = {}) {
  let now = 1800000000000;
  const stored = { ...initial };
  let listener;
  const FakeDate = class extends Date { static now() { return now; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), {
    Date: FakeDate,
    chrome: {
      runtime: { id: 'test-extension', onMessage: { addListener(fn) { listener = fn; } } },
      storage: { local: { async get() { return { ...stored }; }, async set(value) { Object.assign(stored, value); } } },
    },
  });
  const message = (value, tab = 1) => new Promise(resolve => listener(value, { id: 'test-extension', tab: { id: tab }, url: 'https://x.com/home' }, resolve));
  const reserve = (handle = 'example', tab = 1) => message({ type: 'permitLookup', handle }, tab);
  return { reserve, message, stored, advance(ms) { now += ms; } };
}
test('shared budget serializes tabs and persists across worker restarts', async () => {
  const first = setup();
  const results = await Promise.all([first.reserve(), first.reserve()]);
  assert.equal(results.filter(value => value.allowed).length, 1);
  assert.equal(first.stored.lastLookup, 1800000000000);
  const restarted = setup(first.stored);
  assert.equal((await restarted.reserve()).allowed, false);
});
test('one request at a time across tabs, one second apart, no ten-account ceiling', async () => {
  const budget = setup();
  for (let count = 0; count < 12; count++) {
    assert.equal((await budget.reserve('example')).allowed, true);
    assert.equal((await budget.reserve('another', 2)).allowed, false);
    await budget.message({ type: 'finishLookup', handle: 'example' });
    assert.equal((await budget.reserve('another', 2)).allowed, false);
    budget.advance(1000);
  }
});
test('shared cache deduplicates the same account across tabs and worker restarts', async () => {
  const budget = setup();
  assert.equal((await budget.reserve()).allowed, true);
  await budget.message({ type: 'finishLookup', handle: 'example', account: { handle: 'example', aboutChecked: true, country: 'India', observedAt: 1800000000000 } });
  const cached = await budget.reserve('example', 2);
  assert.equal(cached.allowed, false);
  assert.equal(cached.account.country, 'India');
  assert.equal((await setup(budget.stored).reserve()).account.country, 'India');
  budget.advance(86400001);
  assert.equal((await budget.reserve()).allowed, true);
});
test('persisted X cooldown prevents all new reservations', async () => {
  const budget = setup({ cooldown: 1800000900000 });
  const result = await budget.reserve();
  assert.equal(result.allowed, false);
  assert.equal(result.until, 1800000900000);
  assert.equal(budget.stored.lookupBudget, undefined);
});
