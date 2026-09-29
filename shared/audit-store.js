/* ============================================================
   AUDIT STORE — shared frontend demo audit trail (Phase 4)

   One small append-only event store for the frontend demo.
   Admin, Doctor, and User action points call AuditLog.add(...)
   at the exact spot where a real transaction succeeds.

   TODO(BACKEND): Replace frontend audit persistence with
   server-generated audit records. The backend is authoritative:
   every action here maps 1:1 to a Laravel transaction that will
   write its own audit_log row (see admin/audit-log.html footer).
   Frontend events are a prototype of what should be recorded
   server-side — the frontend is never trusted as the final
   audit source.

   Persistence: browser localStorage inside THIS module only.
   Portal files never touch localStorage for audit data.
   No secrets are ever stored: no passwords, OTPs, or tokens.

   Exposes window.AuditLog:
     .add(event)              -> entry|null  (prepends, newest first)
     .getAll()                -> [entries]   (newest first)
     .forEntity(type, id)     -> [entries]
     .clearDemoData()         -> wipes stored demo entries (testing)
   ============================================================ */
(function (global) {
  'use strict';

  var STORE_KEY = 'vhs_audit_log_v1';
  var MAX_ENTRIES = 500; // demo safety valve; backend keeps full history

  // Centralized frontend-demo Admin actor. The Admin portal has no
  // session identity yet; every admin-side action is attributed to
  // this single actor.
  // TODO(BACKEND): Resolve actor from authenticated server session.
  var ADMIN_ACTOR = { actorType: 'Admin', actorId: 'admin-001', actorName: 'Administrator' };

  function _read() {
    try {
      var raw = global.localStorage.getItem(STORE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function _write(list) {
    try { global.localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  }

  function _seq() {
    var list = _read();
    var max = 0;
    list.forEach(function (e) {
      var m = /^aud-(\d+)$/.exec(String(e.auditId || ''));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max + 1;
  }

  function _clean(v) { return v === undefined || v === null ? '' : String(v); }

  var AuditLog = {
    // Centralized demo Admin actor (for pages that record admin actions).
    adminActor: function () { return Object.assign({}, ADMIN_ACTOR); },

    // actor: { actorType, actorId?, actorName }  (User/Doctor portals pass
    // their real shared identity; Admin pages may omit it and the demo
    // Admin actor is applied).
    // event: { action, entityType, entityId?, referenceNo?, description, metadata? }
    add: function (event) {
      if (!event || !event.action || !event.entityType || !event.description) return null;
      var actor = event.actor || ADMIN_ACTOR;
      var entry = {
        auditId: 'aud-' + String(_seq()).padStart(4, '0'),
        timestamp: new Date().toISOString(),
        actorType: _clean(actor.actorType),
        actorId: _clean(actor.actorId),
        actorName: _clean(actor.actorName),
        action: _clean(event.action),
        entityType: _clean(event.entityType),
        entityId: _clean(event.entityId),
        referenceNo: _clean(event.referenceNo),
        description: _clean(event.description)
      };
      if (event.metadata && typeof event.metadata === 'object') {
        entry.metadata = event.metadata;
      }
      var list = _read();
      list.unshift(entry); // newest first, single storage layout
      if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
      _write(list);
      return entry;
    },

    getAll: function () { return _read(); },

    forEntity: function (type, id) {
      return _read().filter(function (e) {
        return e.entityType === type && (!id || String(e.entityId) === String(id));
      });
    },

    // Test helper — used by the Audit Log page's demo-data control and by
    // the milestone verification flow. Never called during normal actions.
    clearDemoData: function () { _write([]); }
  };

  global.AuditLog = AuditLog;
})(window);
