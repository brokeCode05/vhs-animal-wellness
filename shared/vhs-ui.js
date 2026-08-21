/* ============================================
   VHS SHARED UI — Enhanced Modals & Toasts
   Used by: admin, clerk, user dashboards
   ============================================ */

// ── SHARED CONSTANTS ───────────────────────────────────────────────────────
// Single definition used by user, admin, and clerk booking modals.
const VHS_TIME_SLOTS = [
  '8:00 AM','9:00 AM','10:00 AM','11:00 AM',
  '1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM'
];

// Operating hours by day of week (0=Sun, 6=Sat)
// Sunday/Friday/Saturday: 10AM-7PM, Monday-Thursday: 9AM-6PM
const VHS_HOURS = {
  0: { open: 10, close: 19 }, // Sunday
  1: { open: 9,  close: 18 }, // Monday
  2: { open: 9,  close: 18 }, // Tuesday
  3: { open: 9,  close: 18 }, // Wednesday
  4: { open: 9,  close: 18 }, // Thursday
  5: { open: 10, close: 19 }, // Friday
  6: { open: 10, close: 19 }, // Saturday
};

// Return time slots appropriate for a given date string (YYYY-MM-DD)
function getVHSTimeSlots(dateStr) {
  if (!dateStr) return VHS_TIME_SLOTS;
  var d = new Date(dateStr + 'T12:00:00');
  var day = d.getDay();
  var h = VHS_HOURS[day];
  var slots = [];
  var allSlots = [
    { label: '8:00 AM', hour: 8 },
    { label: '9:00 AM', hour: 9 },
    { label: '10:00 AM', hour: 10 },
    { label: '11:00 AM', hour: 11 },
    { label: '12:00 PM', hour: 12 },
    { label: '1:00 PM', hour: 13 },
    { label: '2:00 PM', hour: 14 },
    { label: '3:00 PM', hour: 15 },
    { label: '4:00 PM', hour: 16 },
    { label: '5:00 PM', hour: 17 },
    { label: '6:00 PM', hour: 18 },
  ];
  allSlots.forEach(function(s) {
    if (s.hour >= h.open && s.hour < h.close) slots.push(s.label);
  });
  return slots;
}

// ── TOAST ──────────────────────────────────────────────────────────────────

const TOAST_LABELS = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' };
const TOAST_ICONS  = {
  success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  error:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
};

function showToast(message, type = 'info') {
  let container = document.getElementById('vhsToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'vhsToastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon-wrap">${TOAST_ICONS[type] || 'ℹ'}</div>
    <div class="toast-body">
      <div class="toast-title">${TOAST_LABELS[type] || 'Notice'}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" aria-label="Dismiss">×</button>
    <div class="toast-progress"></div>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
  container.appendChild(toast);

  // Auto dismiss after 3.5s
  const timer = setTimeout(() => dismissToast(toast), 3500);
  toast._timer = timer;
}

function dismissToast(toast) {
  clearTimeout(toast._timer);
  toast.style.animation = 'toastSlideOut 0.3s ease forwards';
  setTimeout(() => toast.remove(), 300);
}

// ── MODAL ENGINE ───────────────────────────────────────────────────────────

function _createModal({ accent, icon, title, message, footer }) {
  const overlay = document.createElement('div');
  overlay.className = 'vhs-modal-overlay';
  overlay.innerHTML = `
    <div class="vhs-modal" role="dialog" aria-modal="true" aria-labelledby="vhsModalTitle">
      <div class="vhs-modal-accent ${accent}"></div>
      <div class="vhs-modal-body">
        <div class="vhs-modal-icon-wrap">${icon}</div>
        <div class="vhs-modal-title" id="vhsModalTitle">${title}</div>
        <div class="vhs-modal-message">${message}</div>
        ${footer.input ? `<input type="text" class="vhs-modal-input" placeholder="${footer.inputPlaceholder || ''}" value="${footer.inputDefault || ''}">` : ''}
      </div>
      <div class="vhs-modal-footer">${footer.html}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  const close = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  return { overlay, close, input: overlay.querySelector('.vhs-modal-input') };
}

// Confirm modal
function confirmAction(message, onConfirm, options = {}) {
  const { title = 'Confirm Action', icon = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', accent = 'confirm', danger = false } = options;
  const { overlay, close } = _createModal({
    accent, icon, title, message,
    footer: {
      html: `
        <button class="vhs-btn ${danger ? 'vhs-btn-danger' : 'vhs-btn-confirm'}" id="_vhsOk">Confirm</button>
        <button class="vhs-btn vhs-btn-ghost" id="_vhsCancel">Cancel</button>
      `
    }
  });
  overlay.querySelector('#_vhsOk').addEventListener('click', () => { close(); setTimeout(function() { onConfirm?.(); }, 50); });
  overlay.querySelector('#_vhsCancel').addEventListener('click', close);
}

// Prompt modal
function showPrompt(message, defaultValue, onConfirm, options = {}) {
  const { title = 'Input Required', icon = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>', accent = 'prompt', placeholder = 'Enter text...' } = options;
  const { overlay, close, input } = _createModal({
    accent, icon, title, message,
    footer: {
      input: true, inputDefault: defaultValue || '', inputPlaceholder: placeholder,
      html: `
        <button class="vhs-btn vhs-btn-primary" id="_vhsOk">OK</button>
        <button class="vhs-btn vhs-btn-ghost" id="_vhsCancel">Cancel</button>
      `
    }
  });
  setTimeout(() => { input?.focus(); input?.select(); }, 50);
  const ok = () => { const v = input?.value ?? ''; close(); setTimeout(function() { onConfirm?.(v); }, 50); };
  overlay.querySelector('#_vhsOk').addEventListener('click', ok);
  overlay.querySelector('#_vhsCancel').addEventListener('click', () => { close(); setTimeout(function() { onConfirm?.(null); }, 50); });
  input?.addEventListener('keypress', e => { if (e.key === 'Enter') ok(); });
}

// Alert modal (info/success/error)
function showAlert(message, type = 'info', title) {
  const map = {
    success: { icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', accent: 'success', title: title || 'Success' },
    error:   { icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>', accent: 'error', title: title || 'Error' },
    info:    { icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>', accent: 'info', title: title || 'Information' },
    warning: { icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', accent: 'confirm', title: title || 'Warning' },
  };
  const cfg = map[type] || map.info;
  const { overlay, close } = _createModal({
    accent: cfg.accent, icon: cfg.icon, title: cfg.title, message,
    footer: { html: `<button class="vhs-btn vhs-btn-primary" id="_vhsOk">OK</button>` }
  });
  overlay.querySelector('#_vhsOk').addEventListener('click', close);
}

// Under work modal
function showUnderWork(feature) {
  const { overlay, close } = _createModal({
    accent: 'underwork',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>',
    title: 'Under Development',
    message: `<strong>${feature || 'This feature'}</strong> is currently being built. Check back soon!`,
    footer: { html: `<button class="vhs-btn vhs-btn-ghost" id="_vhsOk">Got it</button>` }
  });
  overlay.querySelector('#_vhsOk').addEventListener('click', close);
}
