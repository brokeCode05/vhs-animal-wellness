/* ============================================================
   VETTITOOLS — the one place Vetti asks the portal to DO something

   Vetti UI used to call portal globals by name: openBookModal(),
   openRescheduleModal(), cancelAppt(), showSection('pets'). This
   module is that boundary. Above it, Vetti states an INTENT
   ("start booking", "prepare a reschedule"); below it, the existing
   portal screen still does the work.

   Nothing here performs a backend mutation. Every one of these hands
   the owner to the screen that already owns the action, and each
   returns a plain result describing what actually happened so the
   caller never has to guess and Vetti never claims a change it did
   not make.

   FAILURE RULE: when the target screen is unavailable, a tool returns
   { ok:false, error } instead of throwing or silently doing nothing.
   The fallback is always the same honest one: take the owner to the
   page that has the controls, or report that it could not be opened.

   TODO(BACKEND): these become real tools calling the appointment and
   pet endpoints. Until then the portal screens stay authoritative.

   v5.0.0
   ============================================================ */
(function (global) {
  'use strict';

  function fn(name) {
    return typeof global[name] === 'function' ? global[name] : null;
  }

  // Every handoff needs an id. Accept either the shaped appointment
  // Vetti renders or a bare id, so a tool never throws on the wrong
  // argument shape.
  function idOf(target) {
    if (!target) return null;
    if (typeof target === 'string' || typeof target === 'number') return target;
    return target.appointmentId || null;
  }

  function goTo(section) {
    var show = fn('showSection');
    if (!show) return false;
    show(section);
    return true;
  }

  // ── BOOKING ───────────────────────────────────────────────────────

  // Opens the portal's own booking wizard. It re-checks for a pet
  // itself, so a zero-pet owner is guided rather than dropped into an
  // empty form.
  function startBooking(context) {
    var open = fn('openBookModal');
    if (open) {
      open();
      return { ok: true, handledBy: 'booking-wizard' };
    }
    // No wizard on this page: send the owner to the screen that owns the
    // controls rather than pretending one opened.
    if (goTo('appointments')) return { ok: true, handledBy: 'appointments-page' };
    return { ok: false, error: 'booking_unavailable' };
  }

  // ── APPOINTMENT ACTIONS ───────────────────────────────────────────

  function prepareReschedule(appointment) {
    var open = fn('openRescheduleModal');
    var id = idOf(appointment);
    if (open && id) {
      open(id);
      return { ok: true, handledBy: 'reschedule-modal' };
    }
    // Without the modal (or without a resolvable visit) the manual path
    // is the page that owns rescheduling.
    if (goTo('appointments')) return { ok: true, handledBy: 'appointments-page' };
    return { ok: false, error: 'reschedule_unavailable' };
  }

  function prepareCancellation(appointment) {
    var cancel = fn('cancelAppt');
    var id = idOf(appointment);
    if (cancel && id) {
      cancel(id);
      return { ok: true, handledBy: 'cancel-modal' };
    }
    if (goTo('appointments')) return { ok: true, handledBy: 'appointments-page' };
    return { ok: false, error: 'cancellation_unavailable' };
  }

  function openAppointmentDetails(appointment) {
    var id = idOf(appointment);
    if (id) {
      var byId = fn('_openApptDetailsModal');
      if (byId) {
        byId(id);
        return { ok: true, handledBy: 'appointment-details' };
      }
    }
    if (goTo('appointments')) return { ok: true, handledBy: 'appointments-page' };
    return { ok: false, error: 'appointment_details_unavailable' };
  }

  // ── PETS ──────────────────────────────────────────────────────────

  // Vetti's OWN first-pet form is a Vetti component rendered in the
  // conversation, not a portal screen, so it is not routed through here.
  // This tool opens the portal's own pet area for a full profile.
  function openPetProfile(pet) {
    if (goTo('pets')) return { ok: true, handledBy: 'pets-page' };
    return { ok: false, error: 'pet_profile_unavailable' };
  }

  function openPetCreation() {
    if (goTo('pets')) return { ok: true, handledBy: 'pets-page' };
    return { ok: false, error: 'pet_creation_unavailable' };
  }

  function openMyPets() {
    if (goTo('pets')) return { ok: true, handledBy: 'pets-page' };
    return { ok: false, error: 'pets_page_unavailable' };
  }

  // Re-renders the portal's own pet views after Vetti saved a pet, so the
  // My Pets page is not left showing a stale list. Best-effort: a page
  // that is not mounted simply has nothing to refresh.
  function refreshPetViews() {
    var views = global.VHSPetOnboarding;
    if (views && typeof views.refresh === 'function') views.refresh();
    var load = fn('loadPets');
    if (load) load();
    return { ok: true };
  }

  // ── NAVIGATION ────────────────────────────────────────────────────

  function openServices() {
    if (goTo('services')) return { ok: true, handledBy: 'services-page' };
    return { ok: false, error: 'services_page_unavailable' };
  }

  function openAppointments() {
    if (goTo('appointments')) return { ok: true, handledBy: 'appointments-page' };
    return { ok: false, error: 'appointments_page_unavailable' };
  }

  // Vetti's own section. Used once, at mount, so the workspace is the
  // landing view — which is exactly why it belongs here rather than as a
  // bare portal call in the UI module.
  function openWorkspace() {
    if (goTo('vetti')) return { ok: true, handledBy: 'vetti-section' };
    return { ok: false, error: 'workspace_unavailable' };
  }

  // A quiet confirmation. Returns whether it was shown, so a caller that
  // cares can fall back — no portal toast means no crash.
  function notify(message, tone) {
    var toast = fn('showToast');
    if (!toast) return false;
    toast(message, tone || 'info');
    return true;
  }

  global.VettiTools = {
    startBooking: startBooking,
    prepareReschedule: prepareReschedule,
    prepareCancellation: prepareCancellation,
    openAppointmentDetails: openAppointmentDetails,
    openPetProfile: openPetProfile,
    openPetCreation: openPetCreation,
    openMyPets: openMyPets,
    openServices: openServices,
    openAppointments: openAppointments,
    openWorkspace: openWorkspace,
    refreshPetViews: refreshPetViews,
    notify: notify
  };
})(window);