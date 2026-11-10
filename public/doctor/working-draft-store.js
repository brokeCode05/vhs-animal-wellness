/* Server-backed working copies. This module never uses browser storage. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.createDoctorWorkingDraftStore = factory;
})(typeof window !== 'undefined' ? window : globalThis, function createDoctorWorkingDraftStore(auth, onStatus) {
  'use strict';
  const items = new Map();
  const allowed = ['clinicalRevision','fields','medicines','labs','vaccinations','reviewed','saved','startedAt',
    'completedAt','durationMinutes','createdAt','updatedAt','scribe'];
  const notify = typeof onStatus === 'function' ? onStatus : function () {};
  function entry(id) {
    const key=String(id);
    if (!items.has(key)) items.set(key, {ready:false, revision:0, dirty:false, generation:0, timer:null, flight:null, error:null});
    return items.get(key);
  }
  function safeSnapshot(draft) {
    const copy={};
    allowed.forEach(key => { if (Object.prototype.hasOwnProperty.call(draft,key)) copy[key]=draft[key]; });
    return JSON.parse(JSON.stringify(copy));
  }
  async function load(id) {
    const item=entry(id);
    if (item.ready) return {ok:true,draft:item.loadedDraft};
    try {
      const response=await auth.send('consultations/'+encodeURIComponent(id)+'/working-draft',null);
      if (!response.ok || !response.data || !Number.isInteger(response.data.revision)) {
        item.error='Could not load the working draft. Retry before editing.'; notify(id,item); return {ok:false};
      }
      item.revision=response.data.revision; item.ready=true; item.error=null;
      item.loadedDraft=response.data.draft; notify(id,item);
      return {ok:true,draft:item.loadedDraft};
    } catch (_) { item.error='Could not reach the clinic server. Retry before editing.'; notify(id,item); return {ok:false}; }
  }
  function set(id,draft) {
    const item=entry(id);
    if (!item.ready) return false;
    const snapshot=safeSnapshot(draft);
    const signature=JSON.stringify(snapshot);
    if (item.signature===signature) return true;
    item.signature=signature; item.snapshot=snapshot; item.dirty=true; item.generation++; item.error=null;
    if (item.timer) clearTimeout(item.timer);
    item.timer=setTimeout(() => { item.timer=null; void flush(id); }, 900);
    notify(id,item); return true;
  }
  async function flush(id) {
    const item=entry(id);
    if (item.timer) { clearTimeout(item.timer); item.timer=null; }
    if (!item.ready) return false;
    if (item.flight) { const ok=await item.flight; return !ok ? false : (item.dirty ? flush(id) : !item.error); }
    while (item.dirty) {
      const snapshot=item.snapshot; const generation=item.generation;
      item.flight=(async () => {
        try {
          const response=await auth.send('consultations/'+encodeURIComponent(id)+'/working-draft',
            {draft:snapshot,revision:item.revision},{method:'PUT'});
          if (!response.ok || !response.data || !Number.isInteger(response.data.revision)) {
            item.error=response.status===409 ? 'This draft changed in another window. Keep this page open and resolve the conflict before leaving.'
              : 'Working draft could not be saved. Keep this page open and retry.';
            return false;
          }
          item.revision=response.data.revision;
          if (item.generation===generation) item.dirty=false;
          item.error=null; return true;
        } catch (_) { item.error='Working draft could not be saved. Keep this page open and retry.'; return false; }
      })();
      const ok=await item.flight; item.flight=null; notify(id,item);
      if (!ok) return false;
    }
    return true;
  }
  async function flushAll() {
    for (const [id,item] of items) if (item.dirty && !(await flush(id))) return false;
    return true;
  }
  function hasUnsaved() { return Array.from(items.values()).some(item => item.dirty || item.flight); }
  return {load,set,flush,flushAll,hasUnsaved,state:entry};
});
