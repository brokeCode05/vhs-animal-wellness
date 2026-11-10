(function (global) {
  'use strict';
  // The token is encrypted by Laravel and bound to the doctor, appointment,
  // and exact transcript. Never store the transcript or a draft in this cache.
  function create(storage, now) {
    const prefix='vhs-scribe-retry-v1:';
    const ttl=14 * 60 * 1000;
    function key(id) { return /^\d+$/.test(String(id || '')) ? prefix+String(id) : null; }
    function clear(id) { const k=key(id); if (!k) return; try { storage.removeItem(k); } catch (_) {} }
    return {
      save(id, token, completed, total) {
        const k=key(id); if (!k || typeof token!=='string' || !token) return false;
        try {
          const oldRaw=storage.getItem(k); const old=oldRaw ? JSON.parse(oldRaw) : null;
          const validCount=Number.isSafeInteger(completed) && Number.isSafeInteger(total) && completed>=0 && total>0 && completed<=total;
          const oldAge=old ? now()-old.savedAt : Infinity;
          if (validCount && old && typeof old.token==='string' && Number.isSafeInteger(old.completed) && old.total===total && old.completed>completed && oldAge>=0 && oldAge<ttl) return old.token;
          storage.setItem(k, JSON.stringify({token, savedAt:now(), completed:validCount?completed:null, total:validCount?total:null}));
          return token;
        } catch (_) { return false; }
      },
      load(id) {
        const k=key(id); if (!k) return null;
        try {
          const raw=storage.getItem(k); if (!raw) return null;
          const entry=JSON.parse(raw); const age=now()-entry.savedAt;
          if (typeof entry.token!=='string' || !entry.token || !Number.isFinite(age) || age<0 || age>=ttl) { clear(id); return null; }
          return entry.token;
        } catch (_) { clear(id); return null; }
      },
      clear,
      clearAll() {
        try {
          for (let i=storage.length-1; i>=0; i--) {
            const k=storage.key(i);
            if (k && k.startsWith(prefix)) storage.removeItem(k);
          }
        } catch (_) { /* storage may be unavailable */ }
      }
    };
  }
  global.ScribeRetryCache={create};
})(window);
