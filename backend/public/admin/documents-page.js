(function () {
  'use strict';

  var TYPE_BADGE = {
    consultation_summary: '<span class="status-badge completed">Consultation Summary</span>',
    prescription: '<span class="status-badge info">Prescription</span>',
    lab_request: '<span class="status-badge rescheduled">Lab Request</span>',
    lab_result: '<span class="status-badge info">Lab Result</span>',
    receipt: '<span class="status-badge">Receipt</span>'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return esc(iso || '—');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function rowHtml(d) {
    return '<tr data-doc="' + esc(d.docId) + '">' +
      '<td style="white-space:nowrap;">' + fmtDateTime(d.issuedAt) + '</td>' +
      '<td>' + (TYPE_BADGE[d.type] || esc(d.type)) + '</td>' +
      '<td style="white-space:nowrap;">' + esc(d.referenceNo || '—') + '</td>' +
      '<td>' + esc(d.petName || '—') + '</td>' +
      '<td>' + esc(d.ownerName || '—') + '</td>' +
      '<td>' + esc(d.service || '—') + '</td>' +
      '<td class="action-cell"><button class="btn-small" onclick="viewDocument(\'' + esc(d.docId) + '\')">View</button></td>' +
      '</tr>';
  }

  function render() {
    var tbody = document.getElementById('documentsTableBody');
    if (!tbody || !window.SharedDocuments) return;
    var docs = window.SharedDocuments.getAll(); // newest first
    var count = document.getElementById('docCount');
    if (count) count.textContent = docs.length + (docs.length === 1 ? ' document' : ' documents');
    if (!docs.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#6b7280;padding:2.25rem 1rem;">No finalized documents yet. Completing a consultation in the Doctor portal issues the client-facing documents here.</td></tr>';
      return;
    }
    tbody.innerHTML = docs.map(rowHtml).join('');
  }

  function setupFilter() {
    var sel = document.getElementById('filterDocType');
    if (!sel) return;
    sel.addEventListener('change', function () {
      var tbody = document.getElementById('documentsTableBody');
      var v = this.value;
      var docs = window.SharedDocuments.getAll().filter(function (d) {
        return v === 'all' ? true : d.type === v;
      });
      if (!docs.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#6b7280;padding:2.25rem 1rem;">No documents match the current filter.</td></tr>';
        return;
      }
      tbody.innerHTML = docs.map(rowHtml).join('');
    });
  }

  // ── Document viewer (print-style; mirrors the portal document system) ──
  window.viewDocument = function (docId) {
    var doc = window.SharedDocuments
      ? (window.SharedDocuments.viewById
          ? window.SharedDocuments.viewById(docId)
          : window.SharedDocuments.byId(docId))
      : null;
    if (!doc) {
      if (typeof showToast === 'function') {
        showToast('That document could not be opened. Refresh and try again.', 'error');
      }
      return;
    }
    document.getElementById('docViewerBody').innerHTML = window.SharedDocumentRender.render(doc);
    document.getElementById('docViewerPrint').onclick = function () { window.print(); };
    document.getElementById('docViewerModal').classList.add('show');
    document.body.classList.add('modal-open');
  };

  window.closeDocViewer = function () {
    document.getElementById('docViewerModal').classList.remove('show');
    if (!document.querySelector('.modal-overlay.show')) document.body.classList.remove('modal-open');
  };

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.getElementById('docViewerModal')?.classList.contains('show')) closeDocViewer();
  });

  function init() {
    render();
    setupFilter();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
