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
    return { showCountry: value.showCountry !== false, minimumAgeMonths: Object.hasOwn(ageOptions, months) ? Number(months) : 0, hideAndroid: value.hideAndroid === true, hideIOS: value.hideIOS === true, hideWeb: value.hideWeb === true, hideForYou: value.hideForYou === true, hideNews: value.hideNews === true, hideTrending: value.hideTrending === true, bioKeywords: normalizeKeywords(value.bioKeywords), hiddenCountries: normalizeKeywords(value.hiddenCountries), shownCountries: normalizeKeywords(value.shownCountries), hiddenFollowers: normalizeKeywords(value.hiddenFollowers), shownFollowers: normalizeKeywords(value.shownFollowers), hiddenFollowing: normalizeKeywords(value.hiddenFollowing), shownFollowing: normalizeKeywords(value.shownFollowing) };
  }
  const needsAbout = settings => !!(settings.showCountry || settings.hideAndroid || settings.hideIOS || settings.hideWeb || settings.hiddenCountries || settings.shownCountries);
  // South Asia, south-asia and SOUTHASIA are one name.
  const countryKey = value => typeof value === 'string' ? value.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '';
  const countryKeys = value => normalizeKeywords(value).split(', ').map(countryKey).filter(Boolean);
  function amount(text) {
    const [, digits, unit] = /^(\d+(?:\.\d+)?)([km]?)$/.exec(text) || [];
    return digits ? Math.round(digits * ({ k: 1e3, m: 1e6 }[unit] || 1)) : NaN;
  }
  // "<10", ">2k", "500-2000" and "0" become inclusive [low, high] pairs.
  function countRange(text) {
    const [, sign, limit] = /^([<>]=?)(.+)$/.exec(text) || [];
    if (sign) return { '<': [0, amount(limit) - 1], '<=': [0, amount(limit)], '>': [amount(limit) + 1, Infinity], '>=': [amount(limit), Infinity] }[sign];
    const ends = text.split('-').map(amount);
    return ends.length > 2 ? [NaN, NaN] : [ends[0], ends.at(-1)];
  }
  // A range that X Lens cannot read has no effect.
  const countRanges = value => normalizeKeywords(value).split(', ').map(text => countRange(text.replace(/\s/g, '').toLowerCase())).filter(([low, high]) => low <= high);
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

(() => {
  const model = globalThis.XAccountModel;
  const nativeFetch = window.fetch;
  const channel = 'x-account-context-v1';
  let queryPath = '/i/api/graphql/XRqGa7EeokUU5kppkh13EA/AboutAccountQuery';
  let authorization = null;
  let cooldown = 0;
  let pauseMessage = 'X lookups paused. Cached countries still appear.';
  let lastLookup = 0;
  let active = false;
  let settings = model.defaults;
  let pumpTimer;
  const queue = [];
  const queued = new Set();
  const observed = new Map();
  const attempted = new Map();
  const permits = new Map();
  let permitSequence = 0;
  let lookupController;
  const emit = (type, value) => window.postMessage({ channel, type, ...value }, location.origin);
  const status = message => emit('status', { message });
  function capture(url, headers) {
    try {
      const parsed = new URL(url, location.origin);
      if (parsed.origin !== location.origin || !parsed.pathname.startsWith('/i/api/graphql/')) return false;
      const auth = new Headers(headers).get('authorization');
      if (auth) authorization = auth;
      if (/^\/i\/api\/graphql\/[a-zA-Z0-9_-]+\/AboutAccountQuery$/.test(parsed.pathname)) queryPath = parsed.pathname;
      return true;
    } catch { return false; }
  }
  function readUsers(payload) {
    let visited = 0;
    function visit(value, depth) {
      if (!value || typeof value !== 'object' || depth > 35 || ++visited > 25000) return;
      const handle = value.core?.screen_name || value.legacy?.screen_name;
      if (model.validHandle(handle) && (value.core?.created_at || value.legacy?.created_at || value.about_profile || value.profile_bio || typeof value.legacy?.description === 'string')) {
        const record = model.parseAccount(value, handle);
        const old = observed.get(record.handle);
        model.keepLive(record, old);
        if (old?.aboutChecked && !record.aboutChecked) {
          record.country = old.country;
          record.source = old.source;
          record.aboutChecked = true;
        }
        observed.set(record.handle, record);
        if (observed.size > 1000) observed.delete(observed.keys().next().value);
        emit('account', { account: record });
      }
      for (const child of Object.values(value)) visit(child, depth + 1);
    }
    visit(payload, 0);
  }
  window.fetch = function(input, init) {
    const url = input instanceof Request ? input.url : String(input);
    const relevant = capture(url, init?.headers || (input instanceof Request ? input.headers : undefined));
    const response = nativeFetch.apply(this, arguments);
    if (relevant) response.then(result => {
      if (result.ok) result.clone().json().then(readUsers).catch(() => {});
    }).catch(() => {});
    return response;
  };
  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrHeader = XMLHttpRequest.prototype.setRequestHeader;
  const xhrRequests = new WeakMap();
  XMLHttpRequest.prototype.open = function(method, url) {
    xhrRequests.set(this, { url: String(url), headers: {} });
    this.addEventListener('load', () => {
      const request = xhrRequests.get(this);
      if (!request || !capture(request.url, request.headers) || this.status !== 200) return;
      try { readUsers(this.responseType === 'json' ? this.response : JSON.parse(this.responseText)); } catch { /* X also sends non-JSON responses. */ }
    }, { once: true });
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    const request = xhrRequests.get(this);
    if (request) request.headers[name] = value;
    return xhrHeader.apply(this, arguments);
  };
  function enqueue(handle, priority = false) {
    const record = observed.get(handle);
    if (record?.aboutChecked && Number.isFinite(record.observedAt) && Date.now() - record.observedAt < 31536000000) { emit('account', { account: record }); return; }
    if (queued.has(handle)) {
      if (priority) {
        const index = queue.indexOf(handle);
        if (index > 0) { queue.splice(index, 1); queue.unshift(handle); }
      }
      return;
    }
    if (Date.now() - (attempted.get(handle) || 0) < 5 * 60000 || queue.length >= 100) return;
    queued.add(handle);
    if (priority) queue.unshift(handle);
    else queue.push(handle);
    if (!active && !pumpTimer) schedulePump(1000);
  }
  function schedulePump(delay) {
    clearTimeout(pumpTimer);
    pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, delay);
  }
  function requestPermit(handle) {
    return new Promise(resolve => {
      const id = `lookup-${++permitSequence}`;
      const timer = setTimeout(() => { permits.delete(id); resolve({ allowed: false }); }, 5000);
      permits.set(id, result => { clearTimeout(timer); resolve(result); });
      emit('requestPermit', { id, handle });
    });
  }
  async function pump() {
    if (active || !queue.length || !model.needsAbout(settings)) return;
    if (Date.now() < cooldown) {
      status(pauseMessage);
      schedulePump(Math.min(cooldown - Date.now(), 2147483647));
      return;
    }
    const csrf = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1];
    if (!csrf || !authorization) {
      status('Waiting for X session headers.');
      schedulePump(1000);
      return;
    }
    active = true;
    const nextHandle = queue[0];
    const permit = await requestPermit(nextHandle);
    if (permit.account) {
      const account = { ...permit.account, ...model.live(observed.get(nextHandle)) };
      observed.set(nextHandle, account);
      emit('account', { account });
      queue.shift();
      queued.delete(nextHandle);
      active = false;
      if (queue.length) schedulePump(0);
      return;
    }
    if (!permit.allowed) {
      active = false;
      schedulePump(Math.max(1000, Number.isFinite(permit.until) ? permit.until - Date.now() : 5000));
      return;
    }
    const handle = queue.shift();
    let lookupTimeout;
    if (!handle) { active = false; return; }
    try {
      lastLookup = Date.now();
      attempted.set(handle, lastLookup);
      const params = new URLSearchParams({ variables: JSON.stringify({ screenName: handle }) });
      lookupController = new AbortController();
      const controller = lookupController;
      lookupTimeout = setTimeout(() => controller.abort(), 15000);
      const response = await nativeFetch(`${queryPath}?${params}`, {
        credentials: 'include',
        headers: { authorization, 'x-csrf-token': decodeURIComponent(csrf), 'x-twitter-active-user': 'yes', 'x-twitter-auth-type': 'OAuth2Session', 'accept-language': 'en-US,en;q=0.9' },
        signal: lookupController.signal,
      });
      clearTimeout(lookupTimeout);
      if (response.status === 429) {
        const reset = Number(response.headers.get('x-rate-limit-reset')) * 1000;
        cooldown = Math.max(Date.now() + 15 * 60000, Number.isFinite(reset) ? reset : 0);
        emit('cooldown', { until: cooldown });
        pauseMessage = 'X rate limit reached. Lookups paused for at least 15 minutes.';
        status(pauseMessage);
        emit('lookupFailed', { handle });
        return;
      }
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) {
          cooldown = Date.now() + 5 * 60000;
          pauseMessage = `X returned ${response.status}. Open an account’s About page, then refresh X.`;
          emit('cooldown', { until: cooldown });
          status(pauseMessage);
        } else status(`Account lookup unavailable (X returned ${response.status}).`);
        emit('lookupFailed', { handle });
        return;
      }
      const json = await response.json();
      const record = model.parseAccount(json?.data?.user_result_by_screen_name?.result, handle);
      if (!record) { emit('lookupFailed', { handle }); return; }
      model.keepLive(record, observed.get(handle));
      observed.set(handle, record);
      emit('account', { account: record });
      status('Ready · account details stay in this browser');
    } catch {
      status('Account lookup failed. Unknown accounts stay visible.');
      emit('lookupFailed', { handle });
    } finally {
      clearTimeout(lookupTimeout);
      lookupController = null;
      emit('lookupFinished', { handle });
      queued.delete(handle);
      active = false;
      if (queue.length) schedulePump(1000);
    }
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== channel) return;
    if (event.data.type === 'restoreCooldown' && Number.isFinite(event.data.until)) {
      cooldown = Math.max(cooldown, Math.min(event.data.until, Date.now() + 86400000));
    }
    if (event.data.type === 'configure') {
      settings = model.normalizeSettings(event.data.settings);
      if (!model.needsAbout(settings)) {
        clearTimeout(pumpTimer);
        pumpTimer = null;
        queue.length = 0;
        queued.clear();
        lookupController?.abort();
        status('Country display, connection filters and country filters are off.');
      }
      for (const record of (Array.isArray(event.data.cache) ? event.data.cache.slice(-1000) : [])) {
        if (model.validHandle(record.handle) && record.aboutChecked && Number.isFinite(record.observedAt) && Date.now() - record.observedAt < 31536000000) {
          const handle = record.handle.toLowerCase();
          observed.set(handle, { ...record, handle, ...model.live(observed.get(handle)) });
          emit('account', { account: observed.get(handle) });
        }
      }
    }
    if (event.data.type === 'permit' && typeof event.data.id === 'string') {
      const resolve = permits.get(event.data.id);
      if (resolve) { permits.delete(event.data.id); resolve({ allowed: event.data.allowed === true, until: event.data.until, account: event.data.account }); }
    }
    if (model.needsAbout(settings) && event.data.type === 'lookup' && model.validHandle(event.data.handle)) enqueue(event.data.handle.toLowerCase());
  });
})();
