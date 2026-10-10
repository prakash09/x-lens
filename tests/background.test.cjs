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
  const reserve = () => new Promise(resolve => listener({ type: 'permitLookup' }, { id: 'test-extension', url: 'https://x.com/home' }, resolve));
  return { reserve, stored, advance(ms) { now += ms; } };
}
test('shared budget serializes tabs and persists across worker restarts', async () => {
  const first = setup();
  const results = await Promise.all([first.reserve(), first.reserve()]);
  assert.equal(results.filter(value => value.allowed).length, 1);
  assert.equal(first.stored.lookupBudget.length, 1);
  const restarted = setup(first.stored);
  assert.equal((await restarted.reserve()).allowed, false);
});
test('ten lookups per hour, at least fifteen seconds apart', async () => {
  const budget = setup();
  for (let count = 0; count < 10; count++) {
    assert.equal((await budget.reserve()).allowed, true);
    budget.advance(15000);
  }
  const denied = await budget.reserve();
  assert.equal(denied.allowed, false);
  assert.equal(denied.until, budget.stored.lookupBudget[0] + 3600000);
  budget.advance(3600000);
  assert.equal((await budget.reserve()).allowed, true);
});
test('persisted X cooldown prevents all new reservations', async () => {
  const budget = setup({ cooldown: 1800000900000 });
  const result = await budget.reserve();
  assert.equal(result.allowed, false);
  assert.equal(result.until, 1800000900000);
  assert.equal(budget.stored.lookupBudget, undefined);
});
