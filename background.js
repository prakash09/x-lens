(() => {
  let pending = Promise.resolve();
  async function reserve() {
    const now = Date.now();
    const stored = await chrome.storage.local.get(['lookupBudget', 'cooldown']);
    const attempts = (Array.isArray(stored.lookupBudget) ? stored.lookupBudget : [])
      .filter(time => Number.isFinite(time) && time > now - 3600000 && time <= now);
    const until = Math.max(
      Number.isFinite(stored.cooldown) ? Math.min(stored.cooldown, now + 86400000) : 0,
      attempts.length >= 10 ? attempts[0] + 3600000 : 0,
      attempts.length ? attempts[attempts.length - 1] + 15000 : 0,
    );
    if (until > now) return { allowed: false, until };
    await chrome.storage.local.set({ lookupBudget: [...attempts, now] });
    return { allowed: true };
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== 'permitLookup' || sender.id !== chrome.runtime.id || !/^https:\/\/(x|twitter)\.com\//.test(sender.url || '')) return;
    pending = pending.then(reserve).then(reply).catch(() => reply({ allowed: false }));
    return true;
  });
})();
