/* VHS REQ020 — load Google's v2 checkbox once per public page, using server-published SITE key only. */
(function (global) {
  'use strict';
  var widgetId = null;
  var initPromise = null;
  var scriptPromise = null;
  var siteKey = '';
  var holder = document.getElementById('loginRecaptcha');
  var status = document.getElementById('loginCaptchaStatus');

  function message(value, error) {
    if (!status) return;
    status.textContent = value || '';
    status.classList.toggle('is-error', !!error);
  }

  function loadGoogle() {
    if (global.grecaptcha && typeof global.grecaptcha.render === 'function') return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var timeout = global.setTimeout(function () { reject(new Error('Google verification timed out.')); }, 12000);
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = function () {
        if (!global.grecaptcha) {
          global.clearTimeout(timeout);
          reject(new Error('Google verification failed to load.'));
          return;
        }
        global.grecaptcha.ready(function () {
          global.clearTimeout(timeout);
          resolve();
        });
      };
      script.onerror = function () {
        global.clearTimeout(timeout);
        reject(new Error('Google verification cannot be loaded. Check your connection.'));
      };
      document.head.appendChild(script);
    });
    return scriptPromise;
  }

  function render() {
    if (!holder || widgetId !== null) return Promise.resolve();
    if (initPromise) return initPromise;
    initPromise = (async function () {
      message('Loading verification…');
      var response = await fetch('/api/recaptcha-config', {
        credentials: 'same-origin', headers: { Accept: 'application/json' }
      });
      var json = await response.json().catch(function () { return null; });
      siteKey = json && json.data && json.data.site_key || '';
      if (!response.ok || !siteKey) throw new Error('CAPTCHA is not configured. Ask the site administrator to set it up.');
      await loadGoogle();
      // Compact only when available screen width cannot accommodate the normal 304px checkbox.
      var size = holder.getBoundingClientRect().width < 304 ? 'compact' : 'normal';
      widgetId = global.grecaptcha.render(holder, {
        sitekey: siteKey,
        size: size,
        'expired-callback': function () { message('CAPTCHA expired. Please tick the box again.', true); },
        'error-callback': function () { message('CAPTCHA connection failed. Please try again.', true); },
        callback: function () { message(''); }
      });
      message('');
    })().catch(function (error) {
      message(error.message || 'Unable to initialize CAPTCHA. Please reload the page.', true);
      initPromise = null;
    });
    return initPromise;
  }

  function token() {
    if (widgetId === null || !global.grecaptcha) return '';
    try { return global.grecaptcha.getResponse(widgetId) || ''; } catch (e) { return ''; }
  }

  function reset() {
    if (widgetId === null || !global.grecaptcha) return;
    try { global.grecaptcha.reset(widgetId); message(''); } catch (e) { /* widget unavailable */ }
  }

  global.VHSLoginCaptcha = { render: render, getToken: token, reset: reset, message: message };
})(window);
