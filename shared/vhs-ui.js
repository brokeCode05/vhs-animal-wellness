/* ============================================
   VHS SHARED UI — Enhanced Modals & Toasts
   Used by: admin, clerk, user dashboards
   ============================================ */

// ── TOAST ──────────────────────────────────────────────────────────────────

const TOAST_LABELS = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' };
const TOAST_ICONS  = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

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
  const { title = 'Confirm Action', icon = '⚠️', accent = 'confirm', danger = false } = options;
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
  const { title = 'Input Required', icon = '✏️', accent = 'prompt', placeholder = 'Enter text...' } = options;
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
    success: { icon: '✅', accent: 'success', title: title || 'Success' },
    error:   { icon: '❌', accent: 'error',   title: title || 'Error' },
    info:    { icon: 'ℹ️', accent: 'info',    title: title || 'Information' },
    warning: { icon: '⚠️', accent: 'confirm', title: title || 'Warning' },
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
    icon: '🔧',
    title: 'Under Development',
    message: `<strong>${feature || 'This feature'}</strong> is currently being built. Check back soon!`,
    footer: { html: `<button class="vhs-btn vhs-btn-ghost" id="_vhsOk">Got it</button>` }
  });
  overlay.querySelector('#_vhsOk').addEventListener('click', close);
}
