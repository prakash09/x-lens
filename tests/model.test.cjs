const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../model.js');
const model = globalThis.XAccountModel;
const now = Date.parse('2026-10-10T12:00:00Z');
test('defaults leave optional filters off', () => assert.deepEqual(model.defaults, { showCountry: true, minimumAgeMonths: 0, hideAndroid: false, hideIOS: false, hideWeb: false, hideForYou: false, hideNews: false, hideTrending: false, bioKeywords: '', hiddenCountries: '', shownCountries: '', hiddenFollowers: '', shownFollowers: '', hiddenFollowing: '', shownFollowing: '' }));
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

test('iOS and Web match only the reported connection source', () => {
  for (const source of ['iOS', 'Twitter for iPhone', 'iPad', 'United States App Store']) {
    assert.deepEqual(model.reasons({ source }, { hideIOS: true }), ['Connected via iOS / App Store']);
    assert.deepEqual(model.reasons({ source }, { hideWeb: true }), []);
  }
  assert.deepEqual(model.reasons({ source: 'Web' }, { hideWeb: true }), ['Connected via Web']);
  for (const source of [null, 'Android', 'Website', 'NotiOS', 'NotWeb']) {
    assert.deepEqual(model.reasons({ source, country: 'iOS', name: 'Web' }, { hideIOS: true, hideWeb: true }), []);
  }
});

test('bio keywords match any literal phrase ignoring case, only in the bio', () => {
  const settings = { bioKeywords: ' , venture, co-founder , ' };
  assert.deepEqual(model.reasons({ bio: 'Venture guy (co-founder at standard)' }, settings), ['Profile bio matches your keywords']);
  for (const bio of [null, '', 'Software engineer']) assert.deepEqual(model.reasons({ bio, name: 'venture', source: 'venture' }, settings), []);
  assert.deepEqual(model.reasons({ bio: 'a.b [founder]' }, { bioKeywords: 'a.b, [founder]' }), ['Profile bio matches your keywords']);
  assert.deepEqual(model.reasons({ bio: 'axb' }, { bioKeywords: 'a.b' }), []);
  assert.equal(model.parseAccount({ core: { screen_name: 'example' }, legacy: { description: 'venture guy' } }, 'example').bio, 'venture guy');
  assert.equal(model.parseAccount({ core: { screen_name: 'example' }, profile_bio: { description: '' }, legacy: { description: 'old bio' } }, 'example').bio, '');
});

test('hidden countries match the whole name, ignoring case, spaces and hyphens', () => {
  const settings = { hiddenCountries: ' , South-asia, united  STATES , ' };
  for (const country of ['South Asia', 'south asia', 'SOUTHASIA', 'United States']) assert.deepEqual(model.reasons({ country }, settings), [`Based in ${country}`]);
  for (const country of [null, '', 'Asia', 'South Asia Pacific', 'India']) assert.deepEqual(model.reasons({ country, bio: 'South Asia', source: 'South Asia' }, settings), []);
  assert.deepEqual(model.reasons({ country: 'Nigeria' }, { hiddenCountries: 'Niger' }), []);
  assert.deepEqual(model.reasons({ country: 'Côte d’Ivoire' }, { hiddenCountries: 'cote divoire' }), ['Based in Côte d’Ivoire']);
  assert.deepEqual(model.reasons({ country: 'India' }, model.defaults), []);
});
test('follower and following ranges cover below, above and between; unknown counts stay visible', () => {
  const hidden = { hiddenFollowers: '<10, 500-2k, > 1.5M', hiddenFollowing: '>2000' };
  for (const followers of [0, 9, 500, 2000, 1500001]) assert.deepEqual(model.reasons({ followers }, hidden), [`Followers: ${followers.toLocaleString('en-US')}`]);
  for (const followers of [10, 499, 2001, 1500000, null, undefined]) assert.deepEqual(model.reasons({ followers, following: 2000 }, hidden), []);
  assert.deepEqual(model.reasons({ followers: 5, following: 2001 }, hidden), ['Followers: 5', 'Following: 2,001']);
  assert.deepEqual(model.reasons({ followers: 100 }, { hiddenFollowers: '<=100' }), ['Followers: 100']);
  assert.deepEqual(model.reasons({ following: 100 }, { hiddenFollowing: '>=101, 0' }), []);
  assert.deepEqual(model.reasons({ following: 0 }, { hiddenFollowing: '>=101, 0' }), ['Following: 0']);
});
test('shown ranges hide every other known count; unreadable ranges have no effect', () => {
  const shown = { shownFollowers: '100-50k', shownFollowing: '<2000' };
  for (const account of [{ followers: 100, following: 1999 }, { followers: 50000 }, {}]) assert.deepEqual(model.reasons(account, shown), []);
  assert.deepEqual(model.reasons({ followers: 99, following: 2000 }, shown), ['Followers: 99', 'Following: 2,000']);
  assert.deepEqual(model.reasons({ followers: 150 }, { shownFollowers: '100-50k', hiddenFollowers: '100-200' }), ['Followers: 150']);
  for (const text of ['', ' , ', 'many', '10-', '-10', '1-2-3', '<', '10+']) {
    assert.deepEqual(model.reasons({ followers: 5, following: 5 }, { hiddenFollowers: text, shownFollowing: text }), [], text);
  }
});
test('ranges accept thousands separators, decimals, reversed ends and long dashes', () => {
  const hides = (hiddenFollowers, followers) => model.reasons({ followers }, { hiddenFollowers }).length === 1;
  assert.equal(model.normalizeSettings({ hiddenFollowers: '>10,000, 1,000-5,000' }).hiddenFollowers, '>10000, 1000-5000');
  assert.deepEqual([11, 10000, 10001].map(count => hides('>10,000', count)), [false, false, true]);
  assert.deepEqual([999, 1000, 5000, 5001].map(count => hides('1,000-5,000', count)), [false, true, true, false]);
  assert.deepEqual([1, 2].map(count => hides('>1.5', count)), [false, true]);
  assert.deepEqual([1, 2].map(count => hides('<1.2', count)), [true, false]);
  assert.deepEqual([29400, 29401].map(count => hides('>29.4k', count)), [false, true]);
  assert.deepEqual([499, 500, 1000, 1001].map(count => hides('1k–500', count)), [false, true, true, false]);
  assert.deepEqual([1e9, 1e9 + 1].map(count => hides('>1B', count)), [false, true]);
});
test('parse account reads counts from X; a response without counts keeps the last ones', () => {
  const user = { core: { screen_name: 'ScyllaDB' }, relationship_counts: { followers: 29412, following: 232 } };
  const account = model.parseAccount(user, 'scylladb');
  assert.deepEqual([account.followers, account.following], [29412, 232]);
  const older = model.parseAccount({ core: user.core, legacy: { followers_count: 7, friends_count: 2100 } }, 'scylladb');
  assert.deepEqual([older.followers, older.following], [7, 2100]);
  const mixed = model.parseAccount({ core: user.core, relationship_counts: { followers: 0, following: '232' }, legacy: { followers_count: 7, friends_count: 2100 } }, 'scylladb');
  assert.deepEqual([mixed.followers, mixed.following], [0, null]);
  const about = model.parseAccount({ core: user.core, about_profile: { source: 'Web' }, legacy: { followers_count: -1, friends_count: '232' } }, 'scylladb');
  assert.deepEqual([about.followers, about.following], [null, null]);
  assert.deepEqual(model.live(model.keepLive(about, account)), { bio: null, followers: 29412, following: 232 });
  assert.deepEqual(model.live(undefined), { bio: null, followers: null, following: null });
});
test('lookups stay on for a country filter alone', () => {
  const quiet = { ...model.defaults, showCountry: false };
  assert.equal(model.needsAbout(quiet), false);
  assert.equal(model.needsAbout({ ...quiet, hiddenCountries: 'India' }), true);
  assert.equal(model.needsAbout({ ...quiet, shownCountries: 'India' }), true);
  assert.equal(model.needsAbout({ ...quiet, bioKeywords: 'venture', minimumAgeMonths: 6, hiddenFollowers: '<10', shownFollowing: '<2000' }), false);
});
test('shown countries hide every other known country; unknown countries stay visible', () => {
  const settings = { shownCountries: 'south-asia, United States' };
  for (const country of ['South Asia', 'united states', null, '']) assert.deepEqual(model.reasons({ country }, settings), []);
  for (const country of ['India', 'Asia', 'Canada']) assert.deepEqual(model.reasons({ country }, settings), [`Based in ${country}`]);
  for (const shownCountries of ['', ' , ', '--, &']) assert.deepEqual(model.reasons({ country: 'Canada' }, { shownCountries }), []);
  const both = { shownCountries: 'Canada, India', hiddenCountries: 'India, Brazil' };
  assert.deepEqual(model.reasons({ country: 'Canada' }, both), []);
  for (const country of ['India', 'Brazil']) assert.deepEqual(model.reasons({ country }, both), [`Based in ${country}`]);
});
