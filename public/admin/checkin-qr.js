/* The reception QR contains an expiring server token, never an appointment or identity. */
(function () {
  'use strict';
  var payload = '', timer;
  function render(id, size) {
    var el = document.getElementById(id); if (!el) return;
    el.textContent = '';
    if (!payload || typeof QRCode === 'undefined') { el.textContent = 'QR unavailable. Please use manual reception check-in.'; return; }
    new QRCode(el, {text:payload, width:size, height:size, colorDark:'#4c1d95', colorLight:'#ffffff', correctLevel:QRCode.CorrectLevel.M});
  }
  async function refresh() {
    clearTimeout(timer);
    try {
      var result = await window.VHSAuth.send('check-in/qr');
      if (!result.ok) throw new Error(result.message || 'QR unavailable.');
      payload = new URL(result.data.relative_url || result.data.url, location.origin).href;
      render('clinicCheckinQr', 240); render('clinicCheckinQrLarge', 320);
      var status = document.getElementById('checkinQrStatus');
      if (status) status.textContent = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
        ? 'Local computer only. Phones need the clinic server’s reachable address; localhost on a phone will not work.'
        : 'QR refreshes automatically. Choose email or SMS, enter the code, then check in. Check-in opens two hours before today’s appointment.';
      var largeStatus=document.getElementById('checkinQrLargeStatus');if (largeStatus && status) largeStatus.textContent=status.textContent;
      timer = setTimeout(refresh, result.data.refresh_after_seconds * 1000);
    } catch (e) {
      payload = ''; render('clinicCheckinQr',240); render('clinicCheckinQrLarge',320);
      var status = document.getElementById('checkinQrStatus'); if (status) status.textContent = 'QR could not be loaded. Manual check-in remains available.';
      timer = setTimeout(refresh, 30000);
    }
  }
  window.showCheckinQrFullscreen = function () { document.getElementById('checkinQrFullscreen').style.display = 'flex'; render('clinicCheckinQrLarge',320); };
  window.hideCheckinQrFullscreen = function () { document.getElementById('checkinQrFullscreen').style.display = 'none'; };
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',refresh); else refresh();
})();
