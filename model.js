(() => {
  const defaults = Object.freeze({ showCountry: true, minimumAgeMonths: 0, hideAndroid: false, hideIOS: false, hideWeb: false, hideForYou: false, hideNews: false, hideTrending: false, bioKeywords: '', hiddenCountries: '', shownCountries: '', hiddenFollowers: '', shownFollowers: '', hiddenFollowing: '', shownFollowing: '' });
  const validHandle = value => typeof value === 'string' && /^[a-zA-Z0-9_]{1,15}$/.test(value);
  const shortText = value => typeof value === 'string' && value.length <= 120 ? value.trim() : null;
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  // X sends these fields with each post. The saved cache does not hold them.
  const liveKeys = ['bio', 'followers', 'following'];
  const live = record => Object.fromEntries(liveKeys.map(key => [key, record?.[key] ?? null]));
  function keepLive(record, old) {
    for (const key of liveKeys) record[key] ??= old?.[key] ?? null;
    return record;
  }
  function parseAccount(user, requested) {
    if (!user || !validHandle(requested)) return null;
    const handle = user.core?.screen_name || user.legacy?.screen_name;
    if (!validHandle(handle) || handle.toLowerCase() !== requested.toLowerCase()) return null;
    const rawDate = user.core?.created_at || user.legacy?.created_at;
    const date = typeof rawDate === 'string' ? Date.parse(rawDate) : NaN;
    return {
      handle: handle.toLowerCase(),
      country: shortText(user.about_profile?.account_based_in),
      bio: typeof (user.profile_bio?.description ?? user.legacy?.description) === 'string' ? (user.profile_bio?.description ?? user.legacy?.description).slice(0, 2000) : null,
      followers: count(user.legacy?.followers_count),
      following: count(user.legacy?.friends_count),
      source: shortText(user.about_profile?.source),
      createdAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
      observedAt: Date.now(),
      aboutChecked: !!user.about_profile,
    };
  }
  const ageOptions = Object.freeze({ 0: 'Off', 6: '6 months', 12: '1 year', 24: '2 years', 60: '5 years' });
  function normalizeKeywords(value) {
    return typeof value === 'string' ? [...new Set(value.slice(0, 1000).split(',').map(word => word.trim()).filter(Boolean))].join(', ') : '';
  }
  function normalizeSettings(value = {}) {
    const months = value.minimumAgeMonths ?? (value.hideRecent ? 6 : 0);
    return { showCountry: value.showCountry !== false, minimumAgeMonths: Object.hasOwn(ageOptions, months) ? Number(months) : 0, hideAndroid: value.hideAndroid === true, hideIOS: value.hideIOS === true, hideWeb: value.hideWeb === true, hideForYou: value.hideForYou === true, hideNews: value.hideNews === true, hideTrending: value.hideTrending === true, bioKeywords: normalizeKeywords(value.bioKeywords), hiddenCountries: normalizeKeywords(value.hiddenCountries), shownCountries: normalizeKeywords(value.shownCountries), hiddenFollowers: normalizeRanges(value.hiddenFollowers), shownFollowers: normalizeRanges(value.shownFollowers), hiddenFollowing: normalizeRanges(value.hiddenFollowing), shownFollowing: normalizeRanges(value.shownFollowing) };
  }
  const needsAbout = settings => !!(settings.showCountry || settings.hideAndroid || settings.hideIOS || settings.hideWeb || settings.hiddenCountries || settings.shownCountries);
  // South Asia, south-asia and SOUTHASIA are one name.
  const countryKey = value => typeof value === 'string' ? value.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '';
  const countryKeys = value => normalizeKeywords(value).split(', ').map(countryKey).filter(Boolean);
  // "10,000" is one number, not two list items.
  const normalizeRanges = value => normalizeKeywords(typeof value === 'string' ? value.replace(/(\d),(?=\d{3}(?!\d))/g, '$1') : value);
  function amount(text) {
    const [, digits, unit] = /^(\d+(?:\.\d+)?)([kmb]?)$/.exec(text) || [];
    // toFixed removes float noise: 29.4 * 1000 is 29399.999999999996.
    return digits ? Number((digits * ({ k: 1e3, m: 1e6, b: 1e9 }[unit] || 1)).toFixed(3)) : NaN;
  }
  // "<10", ">2k", "500-2000" and "0" become inclusive [low, high] pairs.
  function countRange(text) {
    const [, sign, limit] = /^([<>]=?)(.+)$/.exec(text) || [];
    const edge = amount(limit);
    if (sign) return { '<': [0, Math.ceil(edge) - 1], '<=': [0, edge], '>': [Math.floor(edge) + 1, Infinity], '>=': [edge, Infinity] }[sign];
    const ends = text.split('-').map(amount);
    return ends.length > 2 ? [NaN, NaN] : [Math.min(...ends), Math.max(...ends)];
  }
  // A range that X Lens cannot read has no effect.
  const countRanges = value => normalizeRanges(value).split(', ').map(text => countRange(text.replace(/\s/g, '').replace(/[–—]/g, '-').toLowerCase())).filter(([low, high]) => low <= high);
  const countFilters = [['followers', 'hiddenFollowers', 'shownFollowers', 'Followers'], ['following', 'hiddenFollowing', 'shownFollowing', 'Following']];
  function monthsAgo(now, months) {
    const date = new Date(now);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return date.getTime();
  }
  function reasons(account, settings, now = Date.now()) {
    if (!account) return [];
    const matches = [];
    const joined = typeof account.createdAt === 'string' ? Date.parse(account.createdAt) : NaN;
    const months = normalizeSettings(settings).minimumAgeMonths;
    if (months && Number.isFinite(joined) && joined > monthsAgo(now, months) && joined <= now) {
      matches.push(`Joined within the last ${ageOptions[months]}`);
    }
    if (settings.hideAndroid && /\bandroid\b/i.test(account.source || '')) matches.push('Connected via Android');
    if (settings.hideIOS && /\b(?:ios|iphone|ipad|app store)\b/i.test(account.source || '')) matches.push('Connected via iOS / App Store');
    if (settings.hideWeb && /\bweb\b/i.test(account.source || '')) matches.push('Connected via Web');
    const bio = typeof account.bio === 'string' ? account.bio.toLowerCase() : '';
    const words = normalizeKeywords(settings.bioKeywords).split(', ').filter(Boolean);
    if (words.some(word => bio.includes(word.toLowerCase()))) matches.push('Profile bio matches your keywords');
    const country = countryKey(account.country);
    const shown = countryKeys(settings.shownCountries);
    const outsideShown = shown.length > 0 && !shown.includes(country);
    if (country && (outsideShown || countryKeys(settings.hiddenCountries).includes(country))) matches.push(`Based in ${account.country}`);
    for (const [key, hiddenKey, shownKey, label] of countFilters) {
      const total = account[key];
      if (!Number.isFinite(total)) continue;
      const within = ranges => ranges.some(([low, high]) => total >= low && total <= high);
      const shownRanges = countRanges(settings[shownKey]);
      if (within(countRanges(settings[hiddenKey])) || (shownRanges.length > 0 && !within(shownRanges))) matches.push(`${label}: ${total.toLocaleString('en-US')}`);
    }
    return matches;
  }
  const countries = new Map();
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let first = 65; first <= 90; first++) {
    for (let second = 65; second <= 90; second++) {
      const code = String.fromCharCode(first, second);
      const name = displayNames.of(code);
      if (name && name !== code) countries.set(name.toLowerCase(), code);
    }
  }
  for (const [name, code] of Object.entries({ 'united states of america': 'US', 'usa': 'US', 'uk': 'GB', 'south korea': 'KR', 'north korea': 'KP', 'russia': 'RU', 'czech republic': 'CZ', 'turkey': 'TR', 'vietnam': 'VN', 'palestine': 'PS' })) countries.set(name, code);
  function countryFlag(country) {
    const code = countries.get((country || '').toLowerCase());
    return code ? [...code].map(letter => String.fromCodePoint(letter.charCodeAt(0) + 127397)).join('') : '🌐';
  }
  globalThis.XAccountModel = Object.freeze({ defaults, validHandle, parseAccount, reasons, monthsAgo, sixMonthsAgo: now => monthsAgo(now, 6), ageOptions, normalizeSettings, normalizeKeywords, needsAbout, countryFlag, count, live, keepLive });
})();
