/* ============================================================
   VHS SESSION AUTH ADAPTER (same-origin Laravel session)

   Single authority for "who is signed in": GET /api/auth/me.

   sessionStorage carries a UI cache of that identity only — it is
   never authentication proof. Domain mocks (mock-users, mock-doctors)
   stay available for non-integrated data, but never decide identity.

   Portals (/admin/, /doctor/, /user/) auto-guard on load:
     - 401 from /api/auth/me  -> redirect to the public login page
     - authenticated, wrong role -> redirect to that role's portal
   Backend authorization stays authoritative; this is UX only.
   ============================================================ */
(function (global) {
  'use strict';

  var PORTAL_FOR_ROLE = { Admin: '/admin/', Doctor: '/doctor/', User: '/user/' };
  var LOGIN_PAGE = '/auth';
  var IDENTITY_KEYS = ['user', 'vhs_user'];

  var csrf = null;
  var user = null;
  var inflight = null;

  function metaCsrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.content : null;
  }

  async function refreshCsrf() {
    var r = await fetch('/api/auth/csrf', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    var j = await r.json().catch(function () { return null; });
    csrf = j && j.data ? j.data.csrf_token : metaCsrf();
    return csrf;
  }

  // One JSON round-trip against the Laravel API, same-origin, CSRF protected.
  // `opts` may be { method: 'PATCH'|'DELETE'|'POST'|'GET', retried: true }.
  // A bare `true` (legacy internal call) is treated as { retried: true }.
  // PATCH is required: every Laravel write route (appointments status,
  // reschedule, pets, doctor availability) is PATCH/PUT, not POST.
  async function send(path, body, opts) {
    if (opts === true) opts = { retried: true };
    opts = opts || {};
    var method = (opts.method || (body ? 'POST' : 'GET')).toUpperCase();
    if (!csrf) await refreshCsrf();
    var init = {
      method: method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-CSRF-TOKEN': csrf || '' }
    };
    // GET and DELETE carry no body here; POST/PATCH/PUT serialize JSON.
    if (body && method !== 'GET' && method !== 'DELETE') {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    var r = await fetch('/api/' + path, init);
    var data = null;
    try { data = await r.json(); } catch (e) { data = null; }

    // 419 = expired session / rotated CSRF token: refresh once and retry.
    if (r.status === 419 && !opts.retried) {
      await refreshCsrf();
      return await send(path, body, { method: method, retried: true });
    }

    return {
      ok: r.ok && (!data || data.success !== false),
      status: r.status,
      message: data && data.message ? data.message : '',
      errors: (data && data.errors) || {},
      data: data && data.data ? data.data : null,
      raw: data
    };
  }

  function writeCache(u) {
    if (!u) return;
    try {
      sessionStorage.setItem('user', JSON.stringify({
        id: u.id, userId: u.user_id || u.id,
        firstName: u.first_name || '', lastName: u.last_name || '',
        middleName: u.middle_name || '', name: u.name || '', fullName: u.name || '',
        email: u.email || '', phone: u.phone || '', address: u.address || '',
        birthdate: u.birthdate || '', role: u.role,
        employeeId: u.employee_id || '', status: u.status || ''
      }));
      sessionStorage.setItem('vhs_user', JSON.stringify({
        id: u.id, userId: u.user_id || u.id, name: u.name || '',
        fullName: u.name || '', email: u.email || '', role: u.role,
        employeeId: u.employee_id || ''
      }));
    } catch (e) { /* storage unavailable */ }
  }

  function clearCache() {
    IDENTITY_KEYS.forEach(function (k) {
      try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ }
    });
  }

  // Authoritative identity. Null means "not signed in".
  async function me() {
    if (user) return user;
    if (inflight) return inflight;
    inflight = (async function () {
      var r = await send('auth/me');
      if (r.status === 401 || !r.ok || !r.data || !r.data.user) {
        user = null;
        clearCache();
        return null;
      }
      user = r.data.user;
      writeCache(user);
      return user;
    })();
    var out = await inflight;
    inflight = null;
    return out;
  }

  // Synchronous UI-cache read (populated by a previous me()/login).
  function currentUser() {
    if (user) return user;
    try {
      var raw = sessionStorage.getItem('vhs_user') || sessionStorage.getItem('user');
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && (parsed.id || parsed.userId) ? parsed : null;
    } catch (e) { return null; }
  }

  // Verb helpers for the PATCH/DELETE write routes. Thin wrappers so callers
  // never hand-roll method+CSRF handling.
  function patch(path, body) { return send(path, body, { method: 'PATCH' }); }
  function put(path, body) { return send(path, body, { method: 'PUT' }); }
  function del(path) { return send(path, null, { method: 'DELETE' }); }

  function login(identifier, password, channel) {
    var body = { identifier: identifier, password: password };
    if (channel) body.channel = channel;
    return send('auth/login', body);
  }

  function verifyLoginOtp(identifier, channel, code) {
    return send('auth/verify-otp', {
      identifier: identifier, channel: channel, context: 'login', code: code
    });
  }

  function resendOtp(identifier, channel, context) {
    return send('auth/resend-otp', { identifier: identifier, channel: channel, context: context });
  }

  // Ends the Laravel session server-side, then drops the local identity cache.
  async function logout() {
    try { await send('auth/logout', {}); } catch (e) { /* session may already be gone */ }
    user = null;
    clearCache();
  }

  // Adopt an identity returned by a successful login/OTP verification.
  function remember(u) {
    if (!u) return null;
    user = u;
    writeCache(u);
    return u;
  }

  function portalForRole(role) {
    return PORTAL_FOR_ROLE[role] || LOGIN_PAGE;
  }

  function expectedRole() {
    var p = global.location.pathname || '';
    if (p.indexOf('/admin') === 0) return 'Admin';
    if (p.indexOf('/doctor') === 0) return 'Doctor';
    if (p.indexOf('/user') === 0) return 'User';
    return null;
  }

  async function guard() {
    var expected = expectedRole();
    if (!expected) return null;
    var u = await me();
    if (!u) {
      // me() has already cleared the sessionStorage UI cache on the 401.
      global.location.replace(LOGIN_PAGE);
      return null;
    }
    if (u.role !== expected) {
      global.location.replace(portalForRole(u.role));
      return null;
    }
    return u;
  }

  global.VHSAuth = {
    me: me,
    currentUser: currentUser,
    login: login,
    verifyLoginOtp: verifyLoginOtp,
    resendOtp: resendOtp,
    logout: logout,
    remember: remember,
    guard: guard,
    refreshCsrf: refreshCsrf,
    send: send,
    patch: patch,
    put: put,
    del: del,
    portalForRole: portalForRole,
    expectedRole: expectedRole
  };

  // Portal pages guard themselves simply by loading this file.
  if (expectedRole()) guard();
})(window);
