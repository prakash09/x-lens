(() => {
  let pending = chrome.storage.local.get('cache').then(async stored => {
    if (Array.isArray(stored.cache) && stored.cache.some(record => Object.hasOwn(record, 'bio'))) {
      await chrome.storage.local.set({ cache: stored.cache.map(clean).filter(Boolean) });
    }
  });
  const validHandle = handle => typeof handle === 'string' && /^[a-zA-Z0-9_]{1,15}$/.test(handle);
  const fresh = record => record && validHandle(record.handle) && Number.isFinite(record.observedAt) && record.observedAt <= Date.now() && Date.now() - record.observedAt < 31536000000;
  function clean(record) {
    if (!fresh(record)) return null;
    return {
      handle: record.handle.toLowerCase(), observedAt: record.observedAt,
      country: typeof record.country === 'string' ? record.country.slice(0, 120) : null,
      source: typeof record.source === 'string' ? record.source.slice(0, 120) : null,
      createdAt: typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt)) ? record.createdAt : null,
      aboutChecked: record.aboutChecked === true,
    };
  }
  async function mergeCache(records) {
    const stored = await chrome.storage.local.get('cache');
    const cache = new Map((Array.isArray(stored.cache) ? stored.cache : []).map(clean).filter(Boolean).map(record => [record.handle, record]));
    for (const value of records.slice(-1000)) {
      const record = clean(value);
      if (!record) continue;
      const previous = cache.get(record.handle);
      if (previous?.aboutChecked && !record.aboutChecked) {
        record.country = previous.country;
        record.source = previous.source;
        record.aboutChecked = true;
      }
      if (!previous || record.observedAt >= previous.observedAt) cache.set(record.handle, record);
    }
    await chrome.storage.local.set({ cache: [...cache.values()].slice(-1000) });
  }
  async function reserve(handle, owner) {
    const now = Date.now();
    const stored = await chrome.storage.local.get(['lastLookup', 'lookupFlight', 'cooldown', 'cache']);
    const cached = (Array.isArray(stored.cache) ? stored.cache : []).find(record => record.handle?.toLowerCase() === handle && fresh(record) && record.aboutChecked);
    if (cached) return { allowed: false, account: clean(cached) };
    const until = Math.max(
      Number.isFinite(stored.cooldown) ? Math.min(stored.cooldown, now + 86400000) : 0,
      Number.isFinite(stored.lastLookup) ? stored.lastLookup + 1000 : 0,
      Number.isFinite(stored.lookupFlight?.until) ? Math.min(stored.lookupFlight.until, now + 1000) : 0,
    );
    if (until > now) return { allowed: false, until };
    await chrome.storage.local.set({ lastLookup: now, lookupFlight: { handle, owner, until: now + 20000 } });
    return { allowed: true };
  }
  async function handleMessage(message, sender) {
    const handle = message.handle?.toLowerCase();
    if (message.type === 'permitLookup' && validHandle(handle)) return reserve(handle, sender.tab?.id);
    if (message.type === 'cacheAccounts' && Array.isArray(message.accounts)) await mergeCache(message.accounts);
    if (message.type === 'finishLookup' && validHandle(handle)) {
      const stored = await chrome.storage.local.get('lookupFlight');
      if (stored.lookupFlight?.handle === handle && stored.lookupFlight.owner === sender.tab?.id) {
        if (message.account?.handle?.toLowerCase() === handle) await mergeCache([message.account]);
        await chrome.storage.local.set({ lookupFlight: null });
      }
    }
    return { allowed: false };
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (!['permitLookup', 'finishLookup', 'cacheAccounts'].includes(message?.type) || sender.id !== chrome.runtime.id || !/^https:\/\/(x|twitter)\.com\//.test(sender.url || '')) return;
    pending = pending.then(() => handleMessage(message, sender)).then(reply).catch(() => reply({ allowed: false }));
    return true;
  });
})();
