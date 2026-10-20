/* ============================================================
   VHS API WRITE ADAPTER — single authority for clinical/booking writes
   Phase 5. Every portal (Admin, User, Doctor) routes its writes through
   VHSWrites so there is exactly one place that talks to the Laravel
   write API and one place that reconciles the result into local UI state.

   Contract with the backend:
     PATCH /api/appointments/{id}/status   { status, reason? }
     PATCH /api/appointments/{id}          { appointment_date, appointment_time }
     POST  /api/appointments               { ...booking }
     PATCH /api/doctors/{id}/availability  { availability_status }
     POST  /api/pets                       { ...pet }  (multipart-capable)
     PATCH /api/pets/{id}                  { ...pet }
     DELETE /api/pets/{id}

   Every method returns a NORMALIZED result:
     { ok, status, message, errors, data, appointment?, doctor?, pet?,
       notInDatabase?, reason? }

   `notInDatabase` is the honest signal that the record the UI is holding is
   a frontend demo fixture with no server row (e.g. the seeded apt30x
   records). Callers surface that as a clear message — never a silent
   console.warn, never a fake success.

   On success the authoritative server record is mirrored into the local
   store (SharedMockAppointments / SharedMockDoctors) so all three portals
   re-render from server truth without a reload. Nothing is written locally
   unless the server accepted the change first.
   ============================================================ */
(function (global) {
  'use strict';

  function auth() { return global.VHSAuth || null; }
  function contract() { return global.AppointmentContract || null; }
  function store() { return global.SharedMockAppointments || null; }

  // Normalize an auth() result into the write-adapter shape. Distinguishes a
  // genuine server rejection (4xx/5xx with a message) from "this record has
  // no server row" so the UI can explain the difference.
  function normalize(r, opts) {
    opts = opts || {};
    var out = {
      ok: !!(r && r.ok),
      status: r ? r.status : 0,
      message: (r && r.message) || '',
      errors: (r && r.errors) || {},
      data: (r && r.data) || null
    };
    // Laravel route-model-binding a missing row → 404. That means the id the
    // UI holds is a demo fixture, not a database record.
    if (r && r.status === 404) {
      out.notInDatabase = true;
      out.ok = false;
      if (!out.message) out.message = 'This record is not in the clinic database (demo fixture).';
    }
    if (opts.appointmentKey && out.data && out.data.appointment) {
      out.appointment = out.data.appointment;
    }
    if (opts.consultationKey && out.data && out.data.consultation) {
      out.consultation = out.data.consultation;
    }
    if (opts.doctorKey && out.data && out.data.doctor) {
      out.doctor = out.data.doctor;
    }
    if (opts.petKey && out.data && out.data.pet) {
      out.pet = out.data.pet;
    }
    return out;
  }

  // Mirror a server-confirmed appointment back into the local store so the
  // queue/cards re-render from the authoritative status + timestamps.
  function mirrorAppointment(serverAppt) {
    var s = store();
    if (!s || !serverAppt) return null;
    var c = contract();
    // Canonicalize the presenter shape so the store, contract and every portal
    // agree on field names before we persist it locally.
    var canonical = c && c.fromLegacy ? c.fromLegacy(serverAppt) : serverAppt;
    if (!canonical || !canonical.appointmentId) return null;
    if (typeof s.applyServerPatch === 'function') {
      s.applyServerPatch(canonical.appointmentId, {
        status: canonical.status,
        checkedInAt: canonical.checkedInAt,
        consultationStartedAt: canonical.consultationStartedAt,
        consultationCompletedAt: canonical.consultationCompletedAt,
        appointmentDate: canonical.appointmentDate,
        appointmentTime: canonical.appointmentTime,
        notes: canonical.notes,
        rescheduledFrom: canonical.rescheduledFrom
      });
    }
    return canonical;
  }

  // ── APPOINTMENT STATUS ───────────────────────────────────────────────
  // One method for the whole lifecycle. The backend owns transition
  // validation and timestamps; we only ask and mirror.
  function setStatus(appointmentId, nextStatus, reason) {
    var a = auth();
    if (!a) return Promise.resolve({ ok: false, status: 0, message: 'Not signed in.' });
    var body = { status: nextStatus };
    if (reason) body.reason = String(reason).slice(0, 120);
    return a.patch('appointments/' + encodeURIComponent(appointmentId) + '/status', body)
      .then(function (r) {
        var out = normalize(r, { appointmentKey: true });
        if (out.ok) mirrorAppointment(out.appointment);
        return out;
      })
      .catch(function (e) {
        return { ok: false, status: 0, message: 'Network error. Please try again.', error: e };
      });
  }

  // ── APPOINTMENT RESCHEDULE ───────────────────────────────────────────
  // PATCH /appointments/{id}. The backend revalidates the slot and the
  // reschedule cutoff server-side; a refusal here is authoritative.
  function reschedule(appointmentId, newDate, newTime, notes) {
    var a = auth();
    if (!a) return Promise.resolve({ ok: false, status: 0, message: 'Not signed in.' });
    var body = { appointment_date: newDate, appointment_time: newTime };
    if (notes) body.notes = String(notes).slice(0, 255);
    return a.patch('appointments/' + encodeURIComponent(appointmentId), body)
      .then(function (r) {
        var out = normalize(r, { appointmentKey: true });
        if (out.ok) mirrorAppointment(out.appointment);
        return out;
      })
      .catch(function (e) {
        return { ok: false, status: 0, message: 'Network error. Please try again.', error: m(e) };
      });
  }

  // ── APPOINTMENT CREATE (booking) ─────────────────────────────────────
  // POST /appointments. The DB assigns appointmentId/referenceNo; we upsert
  // that authoritative record into the local store so the owner, Admin and
  // Doctor all see the same new row.
  function createAppointment(payload) {
    var a = auth();
    if (!a) return Promise.resolve({ ok: false, status: 0, message: 'Not signed in.' });
    return a.send('appointments', payload)
      .then(function (r) {
        var out = normalize(r, { appointmentKey: true });
        var s = store();
        if (out.ok && out.appointment && s && typeof s.upsertFromServer === 'function') {
          var c = contract();
          var canonical = c && c.fromLegacy ? c.fromLegacy(out.appointment) : out.appointment;
          s.upsertFromServer(canonical);
          out.canonical = canonical;
        }
        return out;
      })
      .catch(function (e) {
        return { ok: false, status: 0, message: 'Network error. Please try again.', error: m(e) };
      });
  }

  // ── BOOKING OTP ──────────────────────────────────────────────────
  // POST /appointments/request_otp.php — issues and DELIVERS a 6-digit code
  // (email or SMS chosen server-side from the account's contact record), then
  // binds it to this session as pending_appointment_otp.
  // POST /appointments/verify_otp.php — consumes the code AND creates the
  // appointment in one transaction: a bad/expired code rolls the booking back,
  // so the UI never mints a reference number of its own.
  function requestAppointmentOtp() {
    var a = auth();
    if (!a) return Promise.resolve({ ok: false, status: 0, message: 'Not signed in.' });
    return a.send('appointments/request_otp.php', {})
      .then(function (r) {
        var out = normalize(r);
        // The channel is the server's decision, never the client's guess — the
        // UI must tell the owner where the code actually went. VHSAuth.send()
        // exposes the parsed JSON body on r.raw (its own fields are only
        // ok/status/message/errors/data), so the top-level channel and
        // destination are read from there.
        var body = (r && r.raw) || null;
        out.channel = (body && body.channel) || (r && r.channel) || (out.data && out.data.channel) || null;
        out.destination = (body && body.destination) || (r && r.destination) || (out.data && out.data.destination) || null;
        return out;
      })
      .catch(function (e) {
        return { ok: false, status: 0, message: 'Network error. Please try again.', error: m(e) };
      });
  }

  function verifyAppointmentOtp(code, appointmentData) {
    var a = auth();
    if (!a) return Promise.resolve({ ok: false, status: 0, message: 'Not signed in.' });
    return a.send('appointments/verify_otp.php', {
      otp_code: String(code || '').trim(),
      appointment_data: appointmentData || {}
    }).then(function (r) {
      var out = normalize(r, { appointmentKey: true });
      // VHSAuth.send() exposes the parsed JSON body on r.raw (its own fields
      // are only ok/status/message/errors/data). The OTP booking endpoints
      // return their authoritative fields at the TOP LEVEL of that body —
      // reference_no, appointment_id and the appointment itself — so they
      // are read from there as well as from any nested data shape. The UI
      // shows ONLY these server values; no client-minted reference exists.
      var body = (r && r.raw) || null;
      if (!out.appointment && body && body.appointment) out.appointment = body.appointment;
      // The server response is the authoritative booking: mirror it so every
      // portal re-renders from the DB-assigned id + reference number.
      var s = store();
      if (out.ok && out.appointment && s && typeof s.upsertFromServer === 'function') {
        var c = contract();
        var canonical = c && c.fromLegacy ? c.fromLegacy(out.appointment) : out.appointment;
        s.upsertFromServer(canonical);
        out.canonical = canonical;
      }
      out.referenceNo = (body && body.reference_no)
        || (out.appointment && (out.appointment.referenceNo || out.appointment.reference_no))
        || null;
      out.appointmentId = (body && body.appointment_id)
        || (out.appointment && (out.appointment.appointmentId || out.appointment.id))
        || null;
      return out;
    })
      .catch(function (e) {
        return { ok: false, status: 0, message: 'Network error. Please try again.', error: m(e) };
      });
  }

  // ── DOCTOR AVAILABILITY ──────────────────────────────────────────────
  // PATCH /doctors/{id}/availability. status ∈ on_duty|on_break|on_leave.
  function setDoctorAvailability(doctorId, availabilityStatus) {
    var a = auth();
    if (!a) return Promise.resolve({ ok: false, status: 0, message: 'Not signed in.' });
    return a.patch('doctors/' + encodeURIComponent(doctorId) + '/availability', {
      availability_status: availabilityStatus
    })
      .then(function (r) {
        var out = normalize(r, { doctorKey: true });
        var d = global.SharedMockDoctors;
        if (out.ok && out.doctor && d && typeof d.applyServerPatch === 'function') {
          d.applyServerPatch(out.doctor.doctorId || doctorId, {
            availabilityStatus: out.doctor.availabilityStatus || availabilityStatus
          });
        }
        return out;
      })
      .catch(function (e) {
        return { ok: false, status: 0, message: 'Network error. Please try again.', error: m(e) };
      });
  }

  // ── PETS ─────────────────────────────────────────────────────────────
  // The pet form is multipart (photo upload), so these accept a FormData or a
  // plain object. FormData is sent as-is (fetch sets the multipart boundary);
  // plain objects are JSON-encoded.
  //
  // CRITICAL (Repair Batch 2): a multipart body can only be parsed by PHP when
  // the request is POST. On a multipart PATCH/PUT/DELETE, PHP leaves the body
  // unparsed in php://input and $_POST stays empty, so Laravel's Request::all()
  // sees NO fields at all. Every update rule is `sometimes`, so validation then
  // passes on an empty payload, the write is a no-op, and the API returns a
  // false "Pet updated." 200. The user's edit silently never persisted.
  //
  // So multipart writes are ALWAYS sent as POST with Laravel's _method field
  // carrying the real verb. The router still resolves PATCH /pets/{id}, but the
  // fields now actually reach the controller.
  function petRequest(method, path, payload) {
    var a = auth();
    if (!a) return Promise.resolve({ ok: false, status: 0, message: 'Not signed in.' });
    var isForm = (typeof FormData !== 'undefined') && (payload instanceof FormData);
    // For multipart we must NOT force a JSON content-type; VHSAuth.send would,
    // so we go through a raw fetch that still carries the CSRF token.
    if (isForm) {
      var verb = method;
      if (method !== 'POST') {
        // Spoof the verb through the body so PHP populates $_POST. Never a
        // real PATCH/PUT/DELETE — those silently discard every form field.
        payload.set('_method', method);
        verb = 'POST';
      }
      return a.refreshCsrf().then(function (csrf) {
        // The SAME path is used for both create (pets) and update (pets/{id}).
        return fetch('/api/' + path, {
          method: verb,
          credentials: 'same-origin',
          headers: { Accept: 'application/json', 'X-CSRF-TOKEN': csrf || '' },
          body: payload
        });
      }).then(function (resp) {
        return resp.json().catch(function () { return null; }).then(function (data) {
          return normalize({ ok: resp.ok && (!data || data.success !== false), status: resp.status, message: (data && data.message) || '', errors: (data && data.errors) || {}, data: (data && data.data) || null }, { petKey: true });
        });
      }).catch(function (e) {
        return { ok: false, status: 0, message: 'Network error. Please try again.', error: m(e) };
      });
    }
    var init = path; // Already 'pets' or 'pets/{id}': never duplicate the prefix.
    var call = method === 'POST' ? a.send(init, payload) : a.patch(init, payload);
    return call.then(function (r) { return normalize(r, { petKey: true }); })
      .catch(function (e) {
        return { ok: false, status: 0, message: 'Network error. Please try again.', error: m(e) };
      });
  }

  function createPet(payload) { return petRequest('POST', 'pets', payload); }
  // PATCH /api/pets/{id}. The pet form is multipart (photo upload), so the
  // request carries the route id in the path, not in the form body — the API
  // route-parameter {pet} is the only canonical pet identifier.
  function updatePet(petId, payload) { return petRequest('PATCH', 'pets/' + encodeURIComponent(petId), payload); }

  function deletePet(petId) {
    var a = auth();
    if (!a) return Promise.resolve({ ok: false, status: 0, message: 'Not signed in.' });
    return a.del('pets/' + encodeURIComponent(petId))
      .then(function (r) { return normalize(r); })
      .catch(function (e) {
        return { ok: false, status: 0, message: 'Network error. Please try again.', error: m(e) };
      });
  }

  // ── CONSULTATION SESSION (Doctor clinical flow) ──────────────────────────
  // One consultation record per appointment, owned by the assigned doctor.
  // The backend creates/resumes it, validates every transition and refuses
  // edits to completed consultations; the local store is only ever patched
  // AFTER the server accepts.

  /** POST /api/consultations { appointment_id } — start OR resume the ONE
   *  consultation for a checked-in appointment. Repeated calls return the
   *  same row (no duplicates). Also moves the appointment to in_consultation
   *  server-side; the appointment mirror below keeps the local store in step. */
  function startConsultationSession(appointmentId) {
    var a = auth();
    if (!a) return Promise.resolve({ ok: false, status: 0, message: 'Not signed in.' });
    return a.send('consultations', { appointment_id: appointmentId })
      .then(function (r) {
        var out = normalize(r, { consultationKey: true });
        var s = store();
        if (out.ok && out.consultation && s && typeof s.applyServerPatch === 'function') {
          s.applyServerPatch(appointmentId, {
            status: 'in_consultation',
            consultationStartedAt: out.consultation.startedAt
          });
        }
        return out;
      })
      .catch(function (e) {
        return { ok: false, status: 0, message: 'Network error. Please try again.', error: m(e) };
      });
  }

  /** PATCH /api/consultations/{id} — persist SOAP / prescriptions / lab
   *  requests / vaccinations. The backend refuses completed consultations
   *  and any consultation owned by another veterinarian (403). */
  function saveConsultation(consultationId, payload) {
    var a = auth();
    if (!a) return Promise.resolve({ ok: false, status: 0, message: 'Not signed in.' });
    return a.patch('consultations/' + encodeURIComponent(consultationId), payload || {})
      .then(function (r) { return normalize(r, { consultationKey: true }); })
      .catch(function (e) {
        return { ok: false, status: 0, message: 'Network error. Please try again.', error: m(e) };
      });
  }

  /** POST /api/consultations/{id}/complete — finalize the consultation AND
   *  the appointment in one backend transaction (documents fan out there). */
  function completeConsultationSession(consultationId) {
    var a = auth();
    if (!a) return Promise.resolve({ ok: false, status: 0, message: 'Not signed in.' });
    return a.send('consultations/' + encodeURIComponent(consultationId) + '/complete', {})
      .then(function (r) {
        var out = normalize(r, { consultationKey: true });
        var s = store();
        if (out.ok && out.consultation && s && typeof s.applyServerPatch === 'function') {
          s.applyServerPatch(out.consultation.appointmentId, {
            status: 'completed',
            consultationCompletedAt: out.consultation.completedAt
          });
        }
        return out;
      })
      .catch(function (e) {
        return { ok: false, status: 0, message: 'Network error. Please try again.', error: m(e) };
      });
  }

  function m(e) { return (e && e.message) || e; }

  global.VHSWrites = {
    setStatus: setStatus,
    checkIn: function (id) { return setStatus(id, 'checked_in'); },
    startConsultation: function (id) { return setStatus(id, 'in_consultation'); },
    completeConsultation: function (id) { return setStatus(id, 'completed'); },
    cancel: function (id, reason) { return setStatus(id, 'canceled', reason); },
    approve: function (id) { return setStatus(id, 'confirmed'); },
    markNoShow: function (id) { return setStatus(id, 'no_show'); },
    reschedule: reschedule,
    createAppointment: createAppointment,
    requestAppointmentOtp: requestAppointmentOtp,
    verifyAppointmentOtp: verifyAppointmentOtp,
    setDoctorAvailability: setDoctorAvailability,
    createPet: createPet,
    updatePet: updatePet,
    deletePet: deletePet,
    startConsultationSession: startConsultationSession,
    saveConsultation: saveConsultation,
    completeConsultationSession: completeConsultationSession
  };
})(window);
