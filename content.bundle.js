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
      followers: count(user.relationship_counts?.followers ?? user.legacy?.followers_count),
      following: count(user.relationship_counts?.following ?? user.legacy?.friends_count),
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

(() => {
  const model = globalThis.XAccountModel;
  const channel = 'x-account-context-v1';
  const accounts = new Map();
  const requested = new Map();
  const revealed = new WeakSet();
  let settings = { ...model.defaults };
  let saveTimer;
  let scanPending = false;
  let switchingToFollowing = false;
  let statusText = 'Loading account details…';
  const send = (type, value) => window.postMessage({ channel, type, ...value }, location.origin);
  const fresh = record => record && Number.isFinite(record.observedAt) && Date.now() - record.observedAt < 31536000000;
  function storageFailed(error) {
    statusText = error?.message?.includes('Extension context invalidated')
      ? 'X Lens updated. Refresh X to reconnect.'
      : 'Could not save settings. Refresh X and try again.';
    const status = document.getElementById('xac-status');
    if (status) status.textContent = statusText;
  }
  async function store(values) {
    try { await chrome.storage.local.set(values); }
    catch (error) { storageFailed(error); }
  }
  async function requestPermit(handle) {
    try { return await chrome.runtime.sendMessage({ type: 'permitLookup', handle }); }
    catch (error) { storageFailed(error); return { allowed: false }; }
  }
  function restoreCachedAccount(record) {
    if (!fresh(record) || !model.validHandle(record.handle)) return;
    const { bio, ...saved } = record;
    accounts.set(saved.handle, { ...saved, ...model.live(accounts.get(saved.handle)) });
  }
  function saveCache() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const cache = [...accounts.values()].filter(fresh).slice(-1000).map(({ bio, ...record }) => record);
      try { chrome.runtime.sendMessage({ type: 'cacheAccounts', accounts: cache }).catch(storageFailed); }
      catch (error) { storageFailed(error); }
    }, 1000);
  }
  function handleFor(header) {
    for (const link of header.querySelectorAll('a[href]')) {
      const url = new URL(link.getAttribute('href'), location.origin);
      const match = url.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/?$/);
      if (match && !['home', 'explore', 'settings', 'notifications', 'messages', 'search', 'compose', 'i'].includes(match[1].toLowerCase())) return match[1].toLowerCase();
    }
    const match = header.textContent.match(/@([a-zA-Z0-9_]{1,15})(?![a-zA-Z0-9_])/);
    return match?.[1]?.toLowerCase() || null;
  }
  function lookup(handle) {
    if (!model.needsAbout(settings)) return;
    const account = accounts.get(handle);
    if (fresh(account) && account.aboutChecked) return;
    const last = requested.get(handle);
    if (last && Date.now() - last < 5 * 60000) return;
    requested.set(handle, Date.now());
    send('lookup', { handle });
  }
  function annotate(header, handle) {
    const account = accounts.get(handle);
    let badge = header.querySelector('.xac-badge');
    if (!settings.showCountry) { badge?.remove(); return; }
    if (!badge) {
      badge = document.createElement('a');
      badge.className = 'xac-badge';
      badge.target = '_blank';
      badge.rel = 'noopener noreferrer';
      badge.addEventListener('click', event => event.stopPropagation());
      const nameLink = [...header.querySelectorAll('a[href]')].find(link => !link.textContent.trim().startsWith('@') && link.textContent.trim());
      if (nameLink) {
        nameLink.parentElement.classList.add('xac-name-line');
        nameLink.after(badge);
      }
      else header.firstElementChild?.append(badge);
    }
    badge.href = `/${handle}/about`;
    const text = account?.country ? `${model.countryFlag(account.country)} ${account.country}` : '🌐';
    if (badge.textContent !== text) badge.textContent = text;
    const title = [`Account based in: ${account?.country || 'Not available yet'}`, `Connected via: ${account?.source || 'Unknown'}`, `Joined: ${account?.createdAt ? new Date(account.createdAt).toLocaleDateString() : 'Unknown'}`, 'Open X’s About page'].join('\n');
    if (badge.title !== title) badge.title = title;
  }
  function collapse(target, handle, reasons) {
    const key = `${handle}:${reasons.join('|')}`;
    if (target.dataset.xacIdentity !== handle) {
      revealed.delete(target);
      target.dataset.xacIdentity = handle;
    }
    if (!reasons.length || revealed.has(target)) {
      delete target.dataset.xacHidden;
      target.querySelector(':scope > .xac-placeholder')?.remove();
      return;
    }
    if (target.dataset.xacHidden === key) return;
    target.querySelector(':scope > .xac-placeholder')?.remove();
    const placeholder = document.createElement('div');
    placeholder.className = 'xac-placeholder';
    const label = document.createElement('span');
    label.textContent = `Hidden @${handle} · ${reasons.join(' · ')}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Show post';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      revealed.add(target);
      collapse(target, handle, []);
    });
    placeholder.append(label, button);
    target.prepend(placeholder);
    target.dataset.xacHidden = key;
  }
  function targetFor(header) {
    const article = header.closest('article[data-testid="tweet"]');
    if (!article) return null;
    const quote = header.closest('[data-testid="quoteTweet"], div[role="link"]');
    return quote && article.contains(quote) ? quote : article;
  }
  function applyLayoutSettings() {
    for (const key of ['hideForYou', 'hideNews', 'hideTrending']) {
      document.documentElement?.toggleAttribute(`data-xac-${key}`, settings[key]);
    }
  }
  function hideDistractions() {
    const primary = document.querySelector('[data-testid="primaryColumn"]');
    const tabs = [...(primary?.querySelectorAll('[role="tab"]') || [])];
    const forYou = tabs.find(tab => tab.textContent.trim().toLowerCase() === 'for you');
    const following = tabs.find(tab => tab.textContent.trim().toLowerCase() === 'following');
    if (forYou) forYou.setAttribute('data-xac-for-you', '');
    if (!settings.hideForYou || !forYou || following?.getAttribute('aria-selected') === 'true') switchingToFollowing = false;
    if (settings.hideForYou && location.pathname === '/home' && forYou?.getAttribute('aria-selected') === 'true' && following && !switchingToFollowing) {
      switchingToFollowing = true;
      following.click();
    }
    for (const sidebar of document.querySelectorAll('[data-testid="sidebarColumn"]')) {
      for (const card of sidebar.querySelectorAll('[data-xac-section]')) card.removeAttribute('data-xac-section');
      for (const heading of sidebar.querySelectorAll('h1, h2, h3, [role="heading"]')) {
        const label = heading.cloneNode(true);
        for (const control of label.querySelectorAll('button, [role="button"], [aria-label="Close"], svg')) control.remove();
        const title = label.textContent.trim().replace(/[’‘]/g, "'").toLowerCase();
        const section = /^today's news(?:\s*close)?$/.test(title) ? 'news' : title === "what's happening" ? 'trending' : null;
        if (!section) continue;
        // Hide the card with its links, not the heading or the whole sidebar.
        for (let card = heading.parentElement; card && card !== sidebar; card = card.parentElement) {
          const links = [...card.querySelectorAll('a[href], [role="link"]')].filter(link => !heading.contains(link));
          if (card.querySelectorAll('h1, h2, [role="heading"][aria-level="1"], [role="heading"][aria-level="2"]').length > 1) break;
          const content = [...card.children].filter(child => !child.contains(heading) && !child.matches('button, [role="button"], [aria-label="Close"]'));
          if (!links.length && !content.length && !card.matches('section, aside')) continue;
          card.setAttribute('data-xac-section', section);
          break;
        }
      }
    }
  }
  function scan() {
    hideDistractions();
    document.querySelectorAll('[data-testid="User-Name"], [data-testid="UserName"]').forEach(header => {
      const handle = handleFor(header);
      if (!handle) return;
      annotate(header, handle);
      const target = targetFor(header);
      if (target) collapse(target, handle, model.reasons(accounts.get(handle), settings));
      const bounds = header.getBoundingClientRect();
      if (bounds.bottom >= -100 && bounds.top <= innerHeight * 3) lookup(handle);
    });
  }
  function scheduleScan() {
    if (scanPending) return;
    scanPending = true;
    const nextFrame = window.requestAnimationFrame || (callback => setTimeout(callback, 16));
    nextFrame(() => { scanPending = false; scan(); });
  }
  function mountControls() {
    if (document.getElementById('xac-controls')) return;
    const controls = document.createElement('div');
    controls.id = 'xac-controls';
    const toggle = document.createElement('button');
    toggle.className = 'xac-toggle';
    toggle.type = 'button';
    toggle.textContent = '🌐 Account filters';
    toggle.setAttribute('aria-expanded', 'false');
    const panel = document.createElement('section');
    panel.className = 'xac-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'X Lens settings');
    const title = document.createElement('strong');
    title.textContent = 'X Lens';
    panel.append(title);
    for (const [key, text] of Object.entries({ showCountry: 'Show country beside names', hideAndroid: 'Hide accounts connected via Android', hideIOS: 'Hide accounts connected via iOS / App Store', hideWeb: 'Hide accounts connected via Web', hideForYou: 'Hide For you tab', hideNews: 'Hide Today’s News', hideTrending: 'Hide What’s happening' })) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.setting = key;
      input.checked = settings[key];
      input.addEventListener('change', () => {
        settings = { ...settings, [key]: input.checked };
        applyLayoutSettings();
        store({ settings });
        scheduleScan();
      });
      label.append(input, document.createTextNode(text));
      panel.append(label);
    }
    const textFields = [
      ['bioKeywords', 'Hide accounts with bio keywords', 'venture, co-founder, investor'],
      ['hiddenCountries', 'Hide accounts based in', 'United States, South Asia'],
      ['shownCountries', 'Only show accounts based in', 'United States, South Asia'],
      ['hiddenFollowers', 'Hide accounts with followers in', '<10, 500-2k, >1m'],
      ['shownFollowers', 'Only show accounts with followers in', '100-50k'],
      ['hiddenFollowing', 'Hide accounts with following in', '>2000'],
      ['shownFollowing', 'Only show accounts with following in', '50-2000'],
    ];
    for (const [key, text, placeholder] of textFields) {
      const label = document.createElement('label');
      label.className = 'xac-text-label';
      label.textContent = text;
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.setting = key;
      input.maxLength = 1000;
      input.placeholder = placeholder;
      input.value = settings[key];
      input.addEventListener('input', () => {
        settings = model.normalizeSettings({ ...settings, [key]: input.value });
        store({ settings });
        scheduleScan();
      });
      label.append(input);
      panel.insertBefore(label, panel.querySelector('input[data-setting="hideForYou"]').closest('label'));
    }
    const ageLabel = document.createElement('label');
    ageLabel.textContent = 'Hide accounts younger than';
    const ageSelect = document.createElement('select');
    ageSelect.dataset.setting = 'minimumAgeMonths';
    for (const [value, text] of Object.entries(model.ageOptions)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      ageSelect.append(option);
    }
    ageSelect.value = String(settings.minimumAgeMonths);
    ageSelect.addEventListener('change', () => {
      settings = { ...settings, minimumAgeMonths: Number(ageSelect.value) };
      store({ settings });
      scheduleScan();
    });
    ageLabel.append(ageSelect);
    const firstLayoutLabel = panel.querySelector('input[data-setting="hideForYou"]').closest('label');
    panel.insertBefore(ageLabel, firstLayoutLabel);
    const layoutTitle = document.createElement('strong');
    layoutTitle.className = 'xac-section-title';
    layoutTitle.textContent = 'Hide distractions';
    panel.insertBefore(layoutTitle, firstLayoutLabel);
    const note = document.createElement('p');
    note.textContent = 'Settings are saved in this browser. Unknown accounts stay visible.';
    const status = document.createElement('p');
    status.id = 'xac-status';
    status.textContent = statusText;
    panel.append(note, status);
    toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); });
    controls.append(toggle, panel);
    document.body.append(controls);
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== channel) return;
    const message = event.data;
    if (message.type === 'requestPermit' && typeof message.id === 'string' && message.id.length < 80) {
      const reply = requestPermit(message.handle);
      reply.then(permit => send('permit', { id: message.id, allowed: permit?.allowed === true, until: permit?.until, account: permit?.account }));
    }
    if (message.type === 'lookupFinished' && model.validHandle(message.handle)) {
      try { chrome.runtime.sendMessage({ type: 'finishLookup', handle: message.handle, account: accounts.get(message.handle) }).catch(storageFailed); }
      catch (error) { storageFailed(error); }
    }
    if (message.type === 'account') {
      const account = message.account;
      if (!account || !model.validHandle(account.handle) || !Number.isFinite(account.observedAt)) return;
      const clean = {
        handle: account.handle.toLowerCase(),
        country: typeof account.country === 'string' ? account.country.slice(0, 120) : null,
        source: typeof account.source === 'string' ? account.source.slice(0, 120) : null,
        bio: typeof account.bio === 'string' ? account.bio.slice(0, 2000) : null,
        followers: model.count(account.followers),
        following: model.count(account.following),
        createdAt: typeof account.createdAt === 'string' && Number.isFinite(Date.parse(account.createdAt)) ? account.createdAt : null,
        observedAt: Math.min(account.observedAt, Date.now()),
        aboutChecked: account.aboutChecked === true,
      };
      const old = accounts.get(clean.handle);
      if (fresh(old)) model.keepLive(clean, old);
      if (fresh(old) && old.aboutChecked && !clean.aboutChecked) {
        clean.country = old.country;
        clean.source = old.source;
        clean.aboutChecked = true;
      }
      accounts.set(clean.handle, clean);
      if (accounts.size > 1000) accounts.delete(accounts.keys().next().value);
      saveCache();
      scheduleScan();
    }
    if (message.type === 'cooldown' && Number.isFinite(message.until)) store({ cooldown: message.until });
    if (message.type === 'status' && typeof message.message === 'string') {
      statusText = message.message.slice(0, 200);
      const status = document.getElementById('xac-status');
      if (status) status.textContent = statusText;
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      settings = model.normalizeSettings(changes.settings.newValue);
      applyLayoutSettings();
      send('configure', { settings });
      document.querySelectorAll('#xac-controls input[data-setting]').forEach(input => { if (input.type === 'text') {
        if (document.activeElement !== input) input.value = settings[input.dataset.setting];
      } else input.checked = settings[input.dataset.setting]; });
      const select = document.querySelector('#xac-controls select');
      if (select) select.value = String(settings.minimumAgeMonths);
      scheduleScan();
    }
    if (changes.cooldown) send('restoreCooldown', { until: changes.cooldown.newValue });
    if (changes.cache?.newValue) {
      for (const record of changes.cache.newValue) restoreCachedAccount(record);
      scheduleScan();
    }
  });
  const warmup = (async () => {
    try {
      const stored = await chrome.storage.local.get(['settings', 'cache', 'cooldown']);
      settings = model.normalizeSettings(stored.settings);
      applyLayoutSettings();
      for (const record of stored.cache || []) restoreCachedAccount(record);
      send('restoreCooldown', { until: stored.cooldown });
    } catch { statusText = 'Storage unavailable. Using default settings.'; }
    send('configure', { settings, cache: [...accounts.values()] });
  })();
  async function start() {
    await warmup;
    mountControls();
    new MutationObserver(mutations => {
      if (mutations.some(mutation => !(mutation.target.nodeType === Node.TEXT_NODE ? mutation.target.parentElement : mutation.target).closest?.('#xac-controls, .xac-badge, .xac-placeholder'))) scheduleScan();
    }).observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'role', 'href'] });
    window.addEventListener('scroll', scheduleScan, { passive: true });
    scan();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
