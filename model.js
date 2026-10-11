(() => {
  const defaults = Object.freeze({ showCountry: true, minimumAgeMonths: 0, hideAndroid: false, hideIOS: false, hideWeb: false, hideForYou: false, hideNews: false, hideTrending: false, bioKeywords: '', hiddenCountries: '', shownCountries: '' });
  const validHandle = value => typeof value === 'string' && /^[a-zA-Z0-9_]{1,15}$/.test(value);
  const shortText = value => typeof value === 'string' && value.length <= 120 ? value.trim() : null;
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
    return { showCountry: value.showCountry !== false, minimumAgeMonths: Object.hasOwn(ageOptions, months) ? Number(months) : 0, hideAndroid: value.hideAndroid === true, hideIOS: value.hideIOS === true, hideWeb: value.hideWeb === true, hideForYou: value.hideForYou === true, hideNews: value.hideNews === true, hideTrending: value.hideTrending === true, bioKeywords: normalizeKeywords(value.bioKeywords), hiddenCountries: normalizeKeywords(value.hiddenCountries), shownCountries: normalizeKeywords(value.shownCountries) };
  }
  const needsAbout = settings => !!(settings.showCountry || settings.hideAndroid || settings.hideIOS || settings.hideWeb || settings.hiddenCountries || settings.shownCountries);
  // South Asia, south-asia and SOUTHASIA are one name.
  const countryKey = value => typeof value === 'string' ? value.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '';
  const countryKeys = value => normalizeKeywords(value).split(', ').map(countryKey).filter(Boolean);
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
  globalThis.XAccountModel = Object.freeze({ defaults, validHandle, parseAccount, reasons, monthsAgo, sixMonthsAgo: now => monthsAgo(now, 6), ageOptions, normalizeSettings, normalizeKeywords, needsAbout, countryFlag });
})();
