/* ============================================================
   DOCUMENT RENDERER — shared print-style client-facing documents
   (Phase 5). Pure function of a shared document-store record; used
   by the Admin Documents viewer and the User My Documents viewer.

   Mirrors the established VHS print-document language: letterhead
   (logo + clinic name + contact), bordered info grid, zebra rows,
   signature block, confidentiality notice.

   TODO(BACKEND): server-side PDF generation replaces this client
   renderer when the document API exists.
   ============================================================ */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return esc(iso || '');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function header(title, subtitle) {
    return '<div style="text-align:center;margin-bottom:1.25rem;">' +
      '<div style="font-size:1.05rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#111827;">' + esc(title) + '</div>' +
      (subtitle ? '<div style="font-size:0.8rem;color:#6b7280;margin-top:0.2rem;">' + esc(subtitle) + '</div>' : '') +
      '</div>';
  }

  function grid(rows) {
    return '<div style="border:1px solid #e5e7eb;border-radius:0.75rem;overflow:hidden;margin-bottom:1rem;">' +
      rows.map(function (r) {
        return '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.5rem 0.75rem;border-bottom:1px solid #f3f4f6;font-size:0.88rem;">' +
          '<span style="color:#6b7280;flex-shrink:0;">' + esc(r[0]) + '</span>' +
          '<span style="text-align:right;font-weight:500;color:#111827;">' + esc(r[1]) + '</span>' +
          '</div>';
      }).join('') +
      '</div>';
  }

  function section(title, bodyHtml) {
    return '<div style="margin-bottom:1rem;">' +
      '<div style="font-size:0.72rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;margin-bottom:0.35rem;">' + esc(title) + '</div>' +
      bodyHtml +
      '</div>';
  }

  function sig() {
    return '<div style="display:flex;justify-content:space-between;gap:2rem;margin-top:2rem;font-size:0.8rem;color:#374151;">' +
      '<div style="flex:1;border-top:1px solid #d1d5db;padding-top:0.3rem;">Dr. Santos, Veterinarian</div>' +
      '<div style="flex:1;border-top:1px solid #d1d5db;"></div>' +
      '</div>' +
      '<p style="font-size:0.7rem;color:#9ca3af;margin-top:1.5rem;">Confidential — for the pet owner' + "'" + 's records.</p>';
  }

  function medicinesTable(list) {
    return '<div style="border:1px solid #e5e7eb;border-radius:0.75rem;overflow:hidden;font-size:0.85rem;">' +
      '<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:0;background:#f9fafb;padding:0.4rem 0.75rem;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">' +
      '<span>Medicine</span><span>Dosage</span><span>Frequency</span><span>Duration</span></div>' +
      list.map(function (m, i) {
        return '<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:0;padding:0.45rem 0.75rem;border-bottom:' + (i < list.length - 1 ? '1px solid #f3f4f6' : 'none') + ';">' +
          '<span style="font-weight:600;">' + esc(m.medicine || '') + '</span>' +
          '<span>' + esc(m.dosage || '—') + '</span>' +
          '<span>' + esc(m.frequency || '—') + '</span>' +
          '<span>' + esc(m.duration || '—') + '</span>' +
          '</div>' + (m.instructions ? '<div style="padding:0 0.75rem 0.45rem;font-size:0.78rem;color:#6b7280;">' + esc(m.instructions) + '</div>' : '');
      }).join('') +
      '</div>';
  }

  function testsList(tests) {
    return '<ul style="margin:0;padding-left:1.1rem;font-size:0.88rem;color:#111827;">' +
      tests.map(function (t) {
        return '<li style="margin-bottom:0.2rem;">' + esc(t.test || t) + '</li>';
      }).join('') +
      '</ul>';
  }

  // Public: returns the printable HTML for one document record.
  function render(doc, clinicInfo) {
    var clinic = clinicInfo || (global.VHSClinicSettings ? global.VHSClinicSettings.get().clinicInfo : { name: 'VHS Animal Wellness Center' });
    var head =
      '<div style="display:flex;align-items:center;gap:0.75rem;border-bottom:2px solid #4c1d95;padding-bottom:0.6rem;margin-bottom:1rem;">' +
      '<img src="../web-page/image/vhs-assets/vhs-logo.png" alt="VHS" style="height:42px;">' +
      '<div style="flex:1;">' +
      '<div style="font-weight:700;color:#111827;">' + esc(clinic.name || 'VHS Animal Wellness Center') + '</div>' +
      '<div style="font-size:0.75rem;color:#6b7280;">' + esc(clinic.address || '') + (clinic.address && clinic.phone ? ' · ' : '') + esc(clinic.phone || '') + '</div>' +
      '</div>' +
      '<div style="font-size:0.75rem;color:#6b7280;text-align:right;">Issued ' + fmtDate(doc.issuedAt) + '</div>' +
      '</div>';

    var common = grid([
      ['Reference No.', doc.referenceNo || doc.appointmentId],
      ['Pet', doc.petName + (doc.data && doc.data.species ? ' (' + doc.data.species + ')' : '')],
      ['Owner', doc.ownerName],
      ['Service', doc.service || '—'],
      ['Veterinarian', doc.veterinarian ? doc.veterinarian.name : '—']
    ]);

    var body = '';
    if (doc.type === 'consultation_summary') {
      var d = doc.data || {};
      body = header('Consultation Summary', 'Reference ' + (doc.referenceNo || '')) +
        grid([
          ['Date', (d.date || '—') + (d.time ? ' · ' + d.time : '')],
          ['Weight', d.weight ? d.weight + ' kg' : '—'],
          ['Temperature', d.temperature ? d.temperature + ' °C' : '—'],
          ['Heart Rate', d.heartRate ? d.heartRate + ' bpm' : '—'],
          ['Duration', d.durationMinutes ? d.durationMinutes + ' min' : '—']
        ]) +
        section('Assessment', '<p style="margin:0;font-size:0.88rem;color:#111827;white-space:pre-wrap;">' + (esc(d.assessment) || '—') + '</p>') +
        section('Plan / Home Care', '<p style="margin:0;font-size:0.88rem;color:#111827;white-space:pre-wrap;">' + (esc(d.plan) || '—') + '</p>') +
        sig();
    } else if (doc.type === 'prescription') {
      body = header('Prescription', 'Reference ' + (doc.referenceNo || '')) +
        common +
        section('Medicines', medicinesTable((doc.data && doc.data.medicines) || [])) +
        sig();
    } else if (doc.type === 'lab_request') {
      body = header('Lab Request', 'Reference ' + (doc.referenceNo)) +
        common +
        section('Requested Tests', testsList((doc.data && doc.data.tests) || [])) +
        sig();
    } else if (doc.type === 'lab_result') {
      body = header('Lab Result', 'Reference ' + (doc.referenceNo || '')) +
        common +
        section('Result Summary', '<p style="margin:0;font-size:0.88rem;color:#111827;">Result details are delivered by the laboratory once processed. ' +
          (doc.data && doc.data.note ? esc(doc.data.note) : '') + '</p>') +
        sig();
    } else if (doc.type === 'receipt') {
      body = header('Receipt', 'Reference ' + (doc.referenceNo || '')) +
        common +
        section('Amount', '<p style="margin:0;font-size:0.95rem;font-weight:600;">' + esc((doc.data && doc.data.amount) || '—') + '</p>') +
        sig();
    }
    return head + body;
  }

  global.SharedDocumentRender = { render: render };
})(window);
