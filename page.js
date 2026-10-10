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
        if (record.bio === null && typeof old?.bio === 'string') record.bio = old.bio;
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
    if (active || !queue.length || (!settings.showCountry && !settings.hideAndroid && !settings.hideIOS && !settings.hideWeb)) return;
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
      observed.set(nextHandle, permit.account);
      emit('account', { account: permit.account });
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
      if (record.bio === null && typeof observed.get(handle)?.bio === 'string') record.bio = observed.get(handle).bio;
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
      if (!settings.showCountry && !settings.hideAndroid && !settings.hideIOS && !settings.hideWeb) {
        clearTimeout(pumpTimer);
        pumpTimer = null;
        queue.length = 0;
        queued.clear();
        lookupController?.abort();
        status('Country display and connection filters are off.');
      }
      for (const record of (Array.isArray(event.data.cache) ? event.data.cache.slice(-1000) : [])) {
        if (model.validHandle(record.handle) && record.aboutChecked && Number.isFinite(record.observedAt) && Date.now() - record.observedAt < 31536000000) {
          const handle = record.handle.toLowerCase();
          observed.set(handle, { ...record, handle });
          emit('account', { account: observed.get(handle) });
        }
      }
    }
    if (event.data.type === 'permit' && typeof event.data.id === 'string') {
      const resolve = permits.get(event.data.id);
      if (resolve) { permits.delete(event.data.id); resolve({ allowed: event.data.allowed === true, until: event.data.until, account: event.data.account }); }
    }
    if ((settings.showCountry || settings.hideAndroid || settings.hideIOS || settings.hideWeb) && event.data.type === 'lookup' && model.validHandle(event.data.handle)) enqueue(event.data.handle.toLowerCase());
  });
})();
