const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../model.js');
const model = globalThis.XAccountModel;
const now = Date.parse('2026-10-10T12:00:00Z');
test('defaults leave both filters off', () => assert.deepEqual(model.defaults, { showCountry: true, minimumAgeMonths: 0, hideAndroid: false, hideForYou: false, hideNews: false, hideTrending: false }));
test('country flag uses reported country, regions stay neutral', () => {
  assert.equal(model.countryFlag('India'), '🇮🇳');
  assert.equal(model.countryFlag('United States'), '🇺🇸');
  assert.equal(model.countryFlag('Europe'), '🌐');
});
test('six calendar months, exact cutoff stays visible', () => {
  const settings = { hideRecent: true };
  assert.deepEqual(model.reasons({ createdAt: '2026-04-10T12:00:00Z' }, settings, now), []);
  assert.equal(model.reasons({ createdAt: '2026-04-10T12:00:01Z' }, settings, now).length, 1);
  assert.deepEqual(model.reasons({ createdAt: '2026-04-09T00:00:00Z' }, settings, now), []);
});
test('calendar subtraction clamps end of month and preserves time', () => {
  assert.equal(new Date(model.sixMonthsAgo(Date.parse('2026-08-31T12:34:00Z'))).toISOString(), '2026-02-28T12:34:00.000Z');
});
test('missing, invalid and future dates never match', () => {
  for (const date of [null, '', 'invalid', '2027-01-01']) assert.deepEqual(model.reasons({ createdAt: date }, { hideRecent: true }, now), []);
  assert.deepEqual(model.reasons(null, { hideRecent: true, hideAndroid: true }, now), []);
});
test('Android comes from source, never location or display name', () => {
  assert.equal(model.reasons({ source: 'Android' }, { hideAndroid: true }, now).length, 1);
  assert.equal(model.reasons({ source: 'India Android App' }, { hideAndroid: true }, now).length, 1);
  for (const source of ['Web', 'United States App Store', null, 'NotAndroid']) assert.deepEqual(model.reasons({ source, country: 'Android' }, { hideAndroid: true }, now), []);
});
test('both filters are independent and combine', () => {
  const record = { createdAt: '2026-09-01', source: 'Android' };
  assert.equal(model.reasons(record, { hideRecent: true, hideAndroid: true }, now).length, 2);
  assert.deepEqual(model.reasons(record, model.defaults, now), []);
});
test('parse account checks identity and X core date, not verification date', () => {
  const user = { core: { screen_name: 'elonmusk', created_at: 'Mon Jun 01 00:00:00 +0000 2009' }, about_profile: { account_based_in: 'United States', source: 'United States App Store' }, verification_info: { reason: { verified_since_msec: Date.now() } } };
  assert.equal(model.parseAccount(user, 'ELONMUSK').createdAt, '2009-06-01T00:00:00.000Z');
  assert.equal(model.parseAccount(user, 'elonmusk').country, 'United States');
  assert.equal(model.parseAccount(user, 'someoneelse'), null);
  assert.equal(model.parseAccount({ about_profile: user.about_profile }, 'elonmusk'), null);
});

test('all age choices use calendar cutoffs, including leap days', () => {
  for (const months of [6, 12, 24, 60]) {
    const cutoff = model.monthsAgo(now, months);
    assert.deepEqual(model.reasons({ createdAt: new Date(cutoff).toISOString() }, { minimumAgeMonths: months }, now), []);
    assert.equal(model.reasons({ createdAt: new Date(cutoff + 1).toISOString() }, { minimumAgeMonths: months }, now).length, 1);
  }
  assert.equal(new Date(model.monthsAgo(Date.parse('2024-02-29T12:00:00Z'), 12)).toISOString(), '2023-02-28T12:00:00.000Z');
});
test('settings migrate the old six-month toggle and reject unsupported ages', () => {
  assert.equal(model.normalizeSettings({ hideRecent: true }).minimumAgeMonths, 6);
  assert.equal(model.normalizeSettings({ hideRecent: true, minimumAgeMonths: 24 }).minimumAgeMonths, 24);
  assert.equal(model.normalizeSettings({ minimumAgeMonths: 17 }).minimumAgeMonths, 0);
});
