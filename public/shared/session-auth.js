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

  async function sessionFetch(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 12000);
    try { return await fetch(url, Object.assign({}, options, { signal: controller.signal })); }
    finally { clearTimeout(timer); }
  }

  async function refreshCsrf() {
    var r = await sessionFetch('/api/auth/csrf', {
      credentials: 'same-origin',
      cache: 'no-store',
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
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-CSRF-TOKEN': csrf || '' }
    };
    // GET and DELETE carry no body here; POST/PATCH/PUT serialize JSON.
    if (body && method !== 'GET' && method !== 'DELETE') {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    var r = path === 'auth/me' ? await sessionFetch('/api/' + path, init) : await fetch('/api/' + path, init);
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

  async function fetchProtected(path, init, retried) {
    init = Object.assign({}, init || {});
    if (!csrf) await refreshCsrf();
    init.credentials = 'same-origin';
    init.headers = Object.assign({ Accept: 'application/json' }, init.headers || {}, { 'X-CSRF-TOKEN': csrf || '' });
    var response = await fetch(path, init);
    if (response.status === 419 && !retried) {
      await refreshCsrf();
      return fetchProtected(path, init, true);
    }
    return response;
  }

  function writeCache(u) {
    if (!u) return;
    try {
      sessionStorage.setItem('user', JSON.stringify({
        id: u.id, userId: u.user_id || u.id,
        firstName: u.first_name || '', lastName: u.last_name || '',
        middleName: u.middle_name || '', name: u.name || '', fullName: u.name || '',
        email: u.email || '', phone: u.phone || '', address: u.address || '', photo: u.photo || '',
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

  function notifySessionChange() {
    try { global.localStorage.setItem('vhs_auth_epoch', Date.now()+':'+Math.random()); } catch (e) {}
  }
  function clearCache() {
    IDENTITY_KEYS.forEach(function (k) {
      try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ }
    });
  }

  // Authoritative identity. Null means "not signed in".
  async function me(opts) {
    if (user && !(opts && opts.force)) return user;
    if (inflight) return inflight;
    inflight = (async function () {
      var r = await send('auth/me');
      if (r.status === 401 || r.status === 403) {
        user = null;
        clearCache();
        return null;
      }
      if (!r.ok || !r.data || !r.data.user) throw new Error('Session verification is temporarily unavailable.');
      user = r.data.user;
      writeCache(user);
      return user;
    })();
    try { return await inflight; } finally { inflight = null; }
  }

  // Synchronous UI-cache read (populated by a previous me()/login).
  function currentUser() {
    if (user) return user;
    try {
      // Prefer the FULL identity cache (`user`): `vhs_user` is a reduced
      // {id,name,email,role} projection and would blank out name parts,
      // phone and address for profile rendering.
      var raw = sessionStorage.getItem('user') || sessionStorage.getItem('vhs_user');
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && (parsed.id || parsed.userId) ? parsed : null;
    } catch (e) { return null; }
  }

  // Verb helpers for the PATCH/DELETE write routes. Thin wrappers so callers
  // never hand-roll method+CSRF handling.
  function patch(path, body) { return send(path, body, { method: 'PATCH' }); }
  function put(path, body) { return send(path, body, { method: 'PUT' }); }
  function del(path) { return send(path, null, { method: 'DELETE' }); }

  function login(identifier, password, channel, captchaToken) {
    var body = { identifier: identifier, password: password };
    if (channel) body.channel = channel;
    if (captchaToken) body['g-recaptcha-response'] = captchaToken;
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
    var result = await send('auth/logout', {});
    if (!result.ok && result.status !== 401) throw new Error(result.message || 'Logout could not be confirmed. Reconnect and retry.');
    user = null;
    clearCache();
    notifySessionChange();
  }

  // Adopt an identity returned by a successful login/OTP verification.
  function remember(u) {
    if (!u) return null;
    user = u;
    writeCache(u);
    notifySessionChange();
    return u;
  }

  function portalForRole(role) {
    try { if (role === 'User' && sessionStorage.getItem('vhs_pending_checkin')) return '/user/?clinic-checkin=1'; } catch (e) {}
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
    var previous = currentUser();
    if (expected === 'User' && /[?&]clinic-checkin(?:=|&|$)/.test(global.location.search || '')) {
      try { sessionStorage.setItem('vhs_pending_checkin', '1'); } catch (e) {}
    }
    var u = await me({ force: true });
    if (!u) {
      // me() has already cleared the sessionStorage UI cache on the 401.
      global.location.replace(LOGIN_PAGE);
      return null;
    }
    if (u.role !== expected || (previous && String(previous.id || previous.userId) !== String(u.id || u.userId))) {
      global.location.replace(portalForRole(u.role));
      return null;
    }
    var sessionNotice=document.getElementById('vhsSessionRetry'); if (sessionNotice) sessionNotice.remove();
    document.documentElement.removeAttribute('data-vhs-session-checking');
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
    fetchProtected: fetchProtected,
    patch: patch,
    put: put,
    del: del,
    portalForRole: portalForRole,
    expectedRole: expectedRole
  };

  // Portal pages guard themselves simply by loading this file.
  if (expectedRole()) {
    var privacyStyle = document.createElement('style');
    // Keep private content hidden during identity checks, with a painted
    // canvas even when the browser/tunnel has not loaded the theme yet.
    privacyStyle.textContent = '[data-vhs-session-checking] { background: #F7F7FA !important; color-scheme: light; }' +
      '[data-vhs-session-checking] body { visibility: hidden !important; }' +
      '[data-vhs-session-checking]::before { content: "Checking your session…"; position: fixed; inset: 0; z-index: 2147483646; display: grid; place-content: center; background: #F7F7FA; color: #242033; font: 16px system-ui, sans-serif; }';
    document.head.appendChild(privacyStyle);
    var checking = false;
    async function revalidate() {
      if (checking) return;
      checking = true;
      document.documentElement.setAttribute('data-vhs-session-checking', '');
      try { await guard(); }
      catch (e) {
        var notice=document.getElementById('vhsSessionRetry');
        if (!notice) {
          notice=document.createElement('div');notice.id='vhsSessionRetry';notice.setAttribute('role','alert');
          notice.style.cssText='visibility:visible;position:fixed;inset:0;z-index:2147483647;background:white;display:grid;place-content:center;padding:2rem;';
          var message=document.createElement('p');message.textContent='Cannot verify your session. Your open work is preserved. Reconnect, then retry.';
          var button=document.createElement('button');button.textContent='Retry session check';button.onclick=revalidate;
          notice.appendChild(message);notice.appendChild(button);document.body.appendChild(notice);
        }
      }
      finally { checking = false; }
    }
    global.addEventListener('pageshow', revalidate);
    global.addEventListener('focus', revalidate);
    global.addEventListener('storage', function (event) { if (event.key === 'vhs_auth_epoch') revalidate(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) document.documentElement.setAttribute('data-vhs-session-checking',''); else revalidate(); });
    revalidate();
  }
})(window);
