(function () {
  'use strict';

  // Admin document list is served by Laravel/MySQL. Do not read the demo
  // SharedDocuments/localStorage cache: it can contain invented records.
  var TYPE_BADGE = {
    consultation_summary: '<span class="status-badge completed">Consultation Summary</span>',
    prescription: '<span class="status-badge info">Prescription</span>',
    lab_request: '<span class="status-badge rescheduled">Lab Request</span>',
    lab_result: '<span class="status-badge info">Lab Result</span>',
    receipt: '<span class="status-badge">Receipt</span>'
  };

  var documents = [];
  var loadState = 'loading';
  var errorMessage = '';

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
    // Laravel document IDs are integers; allow only those for the View action.
    var id = String(d.docId != null ? d.docId : d.id);
    if (!/^\d+$/.test(id)) return '';
    return '<tr data-doc="' + esc(id) + '">' +
      '<td style="white-space:nowrap;">' + fmtDateTime(d.issuedAt) + '</td>' +
      '<td>' + (TYPE_BADGE[d.type] || esc(d.type)) + '</td>' +
      '<td style="white-space:nowrap;">' + esc(d.referenceNo || '—') + '</td>' +
      '<td>' + esc(d.petName || '—') + '</td>' +
      '<td>' + esc(d.ownerName || '—') + '</td>' +
      '<td>' + esc(d.service || '—') + '</td>' +
      '<td class="action-cell"><button class="btn-small" onclick="viewDocument(\'' + id + '\')">View</button></td>' +
      '</tr>';
  }

  function filteredDocuments() {
    var sel = document.getElementById('filterDocType');
    var value = sel ? sel.value : 'all';
    return documents.filter(function (d) { return value === 'all' || d.type === value; });
  }

  function render() {
    var tbody = document.getElementById('documentsTableBody');
    if (!tbody) return;
    var count = document.getElementById('docCount');
    if (loadState !== 'ready') {
      if (count) count.textContent = '';
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#6b7280;padding:2.25rem 1rem;">' +
        esc(loadState === 'loading' ? 'Loading documents…' : errorMessage) + '</td></tr>';
      return;
    }
    var shown = filteredDocuments();
    if (count) count.textContent = shown.length + (shown.length === 1 ? ' document' : ' documents');
    if (!shown.length) {
      var message = documents.length ? 'No documents match the current filter.' :
        'No finalized documents yet. Completing a consultation in the Doctor portal issues the client-facing documents here.';
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#6b7280;padding:2.25rem 1rem;">' +
        esc(message) + '</td></tr>';
      return;
    }
    tbody.innerHTML = shown.map(rowHtml).join('');
  }

  function explainFailure(status, body, noun) {
    if (status === 401 || status === 419) return 'Your session has expired. Please sign in again.';
    if (status === 403) return 'Your account does not have permission to view ' + noun + '.';
    return 'Unable to load ' + noun + ' from Laravel (HTTP ' + status + ').';
  }

  function fetchDocumentData(url, key, noun) {
    return fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (body) {
        if (!response.ok || !body || body.success !== true || !body.data ||
          (key === 'documents' ? !Array.isArray(body.data.documents) : !body.data.document)) {
          throw new Error(explainFailure(response.status, body, noun));
        }
        return body.data[key];
      });
    });
  }

  function hideOutdatedDemoNotice() {
    // The markup is intentionally unchanged. Hide only the obsolete demo
    // disclaimer, which is false once the authenticated API is in use.
    var section = document.getElementById('documentsTableBody');
    if (!section) return;
    var container = section.closest('.content-section');
    if (!container) return;
    var notes = container.querySelectorAll('p');
    for (var i = 0; i < notes.length; i++) {
      if (/^\s*Demo mode: documents are frontend-only records\./.test(notes[i].textContent)) {
        notes[i].hidden = true;
      }
    }
  }

  function loadDocuments() {
    loadState = 'loading';
    errorMessage = '';
    render();
    // Admin is already authorized by session-auth and backend role middleware.
    return fetchDocumentData('/api/documents', 'documents', 'documents')
      .then(function (rows) {
        documents = rows;
        loadState = 'ready';
        hideOutdatedDemoNotice();
        render();
      })
      .catch(function (error) {
        documents = [];
        loadState = 'error';
        errorMessage = error && error.message ? error.message : 'Could not reach the document service.';
        render();
      });
  }

  window.viewDocument = function (docId) {
    var id = String(docId);
    if (!/^\d+$/.test(id)) return;
    var body = document.getElementById('docViewerBody');
    var modal = document.getElementById('docViewerModal');
    if (!body || !modal) return;
    body.textContent = 'Loading document…';
    modal.classList.add('show');
    document.body.classList.add('modal-open');
    var print = document.getElementById('docViewerPrint');
    if (print) print.onclick = null;
    fetchDocumentData('/api/documents/' + encodeURIComponent(id), 'document', 'the document')
      .then(function (doc) {
        if (!window.SharedDocumentRender || typeof window.SharedDocumentRender.render !== 'function') {
          throw new Error('Document preview is unavailable. Please refresh the page.');
        }
        body.innerHTML = window.SharedDocumentRender.render(doc);
        if (print) print.onclick = function () { window.print(); };
      })
      .catch(function (error) {
        body.textContent = error && error.message ? error.message : 'Could not load document.';
      });
  };

  window.closeDocViewer = function () {
    var modal = document.getElementById('docViewerModal');
    if (modal) modal.classList.remove('show');
    if (!document.querySelector('.modal-overlay.show')) document.body.classList.remove('modal-open');
  };

  document.addEventListener('keydown', function (e) {
    var modal = document.getElementById('docViewerModal');
    if (e.key === 'Escape' && modal && modal.classList.contains('show')) window.closeDocViewer();
  });

  function init() {
    var sel = document.getElementById('filterDocType');
    if (sel) sel.addEventListener('change', render);
    loadDocuments();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
