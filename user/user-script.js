/* ============================================

   VHS USER DASHBOARD — Self-contained script

   No external API dependency.

   showToast / confirmAction / showUnderWork

   are provided by shared/vhs-ui.js

============================================ */



// ─── SECTION NAVIGATION ──────────────────────────────────────────────────────



function showSection(name) {

  document

    .querySelectorAll(".page-section")

    .forEach((s) => s.classList.remove("active"));

  document.getElementById("section-" + name)?.classList.add("active");

  document.querySelectorAll(".sidebar .nav-item").forEach((item) => {

    item.classList.toggle("active", item.dataset.section === name);

  });

  closeMobileSidebar();

}



// ─── MOBILE SIDEBAR ───────────────────────────────────────────────────────────



const sidebar = document.getElementById("sidebar");

const hamburger = document.getElementById("hamburgerMenu");

const overlay = document.createElement("div");

overlay.className = "sidebar-overlay";

document.body.appendChild(overlay);



function openMobileSidebar() {

  sidebar?.classList.add("open");

  overlay.classList.add("show");

  hamburger?.classList.add("active");

}

function closeMobileSidebar() {

  sidebar?.classList.remove("open");

  overlay.classList.remove("show");

  hamburger?.classList.remove("active");

}



hamburger?.addEventListener("click", () =>

  sidebar?.classList.contains("open") ?

    closeMobileSidebar()

  : openMobileSidebar(),

);

overlay.addEventListener("click", closeMobileSidebar);

window.addEventListener("resize", () => {

  if (window.innerWidth > 768) closeMobileSidebar();

});



// ─── SESSION USER HELPER ─────────────────────────────────────────────────────

// Single source of truth — replaces the repeated JSON.parse pattern everywhere.

function _getSessionUser() {

  try {

    return JSON.parse(

      sessionStorage.getItem("vhs_user") ||

        sessionStorage.getItem("user") ||

        "{}",

    );

  } catch (e) {

    return {};

  }

}



// ─── TOAST & CONFIRM ─────────────────────────────────────────────────────────

// Provided by shared/vhs-ui.js: showToast(), confirmAction(), showAlert(), showUnderWork()



// Legacy alias so existing calls to showConfirm() still work

function showConfirm(message, icon, title, onConfirm) {

  confirmAction(message, onConfirm, {

    title: title || "Confirm Action",

    icon:

      icon ||

      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',

  });

}



// ─── MODAL HELPERS ────────────────────────────────────────────────────────────



function openModal(id) {

  const modal = document.getElementById(id);

  if (!modal) return;

  modal.classList.add("show");

  document.body.classList.add("modal-open");

  const today = new Date().toISOString().split("T")[0];

  modal

    .querySelectorAll('input[type="date"]')

    .forEach((i) => i.setAttribute("min", today));

}



function closeModal(id) {

  const modal = document.getElementById(id);

  if (!modal) return;

  modal.classList.remove("show");

  if (!document.querySelector(".modal-overlay.show")) {

    document.body.classList.remove("modal-open");

  }

  modal.querySelector("form")?.reset();

}



document.querySelectorAll(".modal-overlay").forEach((m) => {

  m.addEventListener("click", (e) => {

    if (e.target === m) closeModal(m.id);

  });

});



document.addEventListener("keydown", (e) => {

  if (e.key === "Escape") {

    const open = document.querySelector(".modal-overlay.show");

    if (open) closeModal(open.id);

  }

});



// ─── LOGOUT ───────────────────────────────────────────────────────────────────



function initLogout() {

  document.getElementById("logoutBtn")?.addEventListener("click", (e) => {

    e.preventDefault();

    showConfirm(

      "Are you sure you want to logout?",

      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',

      "Logout",

      () => {

        sessionStorage.clear();

        const loader = document.createElement("div");

        loader.style.cssText =

          "position:fixed;inset:0;background:#1a0a3e;display:flex;align-items:center;justify-content:center;z-index:99999;";

        const _paw = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="width:32px;height:32px;"><ellipse cx="22" cy="18" rx="8" ry="10"/><ellipse cx="42" cy="18" rx="8" ry="10"/><ellipse cx="10" cy="34" rx="7" ry="9"/><ellipse cx="54" cy="34" rx="7" ry="9"/><path d="M32 36c-10 0-18 7-18 14s4 10 10 10c4 0 6-2 8-6 2 4 4 6 8 6 6 0 10-5 10-10s-8-14-18-14z"/></svg>';

        const _pawStyle = 'display:inline-block;opacity:0;animation:pawIn 0.4s ease-out forwards;';

        loader.innerHTML = `

        <div style="text-align:center;">

          <div style="display:flex;gap:0.5rem;justify-content:center;align-items:flex-end;margin-bottom:1.5rem;">

            <div style="${_pawStyle}animation-delay:0s;"><div style="fill:rgba(255,255,255,0.2)">${_paw}</div></div>

            <div style="${_pawStyle}animation-delay:0.25s;"><div style="fill:rgba(255,255,255,0.35)">${_paw}</div></div>

            <div style="${_pawStyle}animation-delay:0.5s;"><div style="fill:rgba(255,255,255,0.5)">${_paw}</div></div>

            <div style="${_pawStyle}animation-delay:0.75s;"><div style="fill:#ffaa00">${_paw}</div></div>

          </div>

          <div style="color:white;font-size:0.85rem;font-weight:600;letter-spacing:3px;text-transform:uppercase;font-family:inherit;">Logging out</div>

        </div>

        <style>@keyframes pawIn{from{opacity:0;transform:translateY(6px) scale(0.7)}to{opacity:1;transform:translateY(0) scale(1)}}</style>

      `;

        document.body.appendChild(loader);

        setTimeout(() => {

          window.location.href = "../web-page/index.html";

        }, 1200);

      },

    );

  });

}



// ─── APPOINTMENTS ─────────────────────────────────────────────────────────────


function loadUserAppointments() {
  // Use mock data for rendering the new card-based appointments view
  renderAppointmentCards();
}



// _apptStatusBadge defined later (near renderAppointmentCards)



function _fmtApptDate(date, time) {

  if (!date) return "—";

  var parts = date.split("-");

  var d = new Date(

    parseInt(parts[0]),

    parseInt(parts[1]) - 1,

    parseInt(parts[2]),

  );

  var dateStr = d.toLocaleDateString("en-US", {

    month: "short",

    day: "numeric",

    year: "numeric",

  });

  return time ? dateStr + " · " + time : dateStr;

}



function renderApptRows(tbodyId, appts, cols) {

  var tbody = document.getElementById(tbodyId);

  if (!tbody) return;



  if (!appts.length) {

    tbody.innerHTML =

      '<tr class="empty-row"><td colspan="' +

      cols +

      '" style="text-align:center;padding:2rem;color:var(--text-muted,#888);">No appointments found.</td></tr>';

    return;

  }



  tbody.innerHTML = appts

    .map(function (a, i) {

      var petLabel = a.pet_name + (a.pet_type ? " (" + a.pet_type + ")" : "");

      var dateTime = _fmtApptDate(a.date, a.time);

      var statusBadge = _apptStatusBadge(a.status);

      var canCancel = a.status === "pending" || a.status === "scheduled";



      if (cols === 5) {

        // Dashboard compact view: Pet | Service | Date & Time | Status | Actions

        return (

          '<tr data-id="' +

          a.id +

          '">' +

          "<td>" +

          petLabel +

          "</td>" +

          "<td>" +

          (a.service || "—") +

          "</td>" +

          "<td>" +

          dateTime +

          "</td>" +

          "<td>" +

          statusBadge +

          "</td>" +

          "<td>" +

          '<button class="btn-small" onclick="viewAppt(' +

          a.id +

          ')">View</button>' +

          (canCancel ?

            ' <button class="btn-small btn-danger" onclick="cancelAppt(' +

            a.id +

            ')">Cancel</button>'

          : "") +

          "</td>" +

          "</tr>"

        );

      } else {

        // Full view: # | Pet | Service | Date & Time | Notes | Status | Actions

        return (

          '<tr data-id="' +

          a.id +

          '">' +

          "<td>#" +

          String(i + 1).padStart(2, "0") +

          "</td>" +

          "<td>" +

          petLabel +

          "</td>" +

          "<td>" +

          (a.service || "—") +

          "</td>" +

          "<td>" +

          dateTime +

          "</td>" +

          "<td>" +

          (a.notes || "—") +

          "</td>" +

          "<td>" +

          statusBadge +

          "</td>" +

          "<td>" +

          '<button class="btn-small" onclick="viewAppt(' +

          a.id +

          ')">View</button>' +

          (canCancel ?

            ' <button class="btn-small btn-danger" onclick="cancelAppt(' +

            a.id +

            ')">Cancel</button>'

          : "") +

          "</td>" +

          "</tr>"

        );

      }

    })

    .join("");

}



function openBookModal(serviceName) {

  openModal("bookModal");



  var user = _getSessionUser();

  var userId = user.id || user.userId;



  // Pre-select service if provided

  if (serviceName) {

    var svcSelect = document.getElementById("bookServiceSelect");

    if (svcSelect) {

      svcSelect.value = serviceName;

      // Sync custom dropdown trigger text

      var trigger = svcSelect.parentNode.querySelector('.cd-trigger-text');

      if (trigger) {

        var selOpt = svcSelect.options[svcSelect.selectedIndex];

        trigger.textContent = selOpt ? selOpt.text : 'Choose a service';

      }

    }

  }



  // Load user's pets

  var petSelect = document.getElementById("bookPetSelect");

  if (petSelect && userId) {

    petSelect.innerHTML = '<option value="">Loading pets...</option>';

    fetch("get_pets_user.php?user_id=" + userId)

      .then(function (r) {

        return r.json();

      })

      .then(function (pets) {

        petSelect.innerHTML =

          pets.length ?

            '<option value="">Choose a pet</option>' +

            pets

              .map(function (p) {

                return (

                  '<option value="' +

                  p.id +

                  '">' +

                  p.name +

                  " (" +

                  p.type +

                  ")</option>"

                );

              })

              .join("")

          : '<option value="">No pets registered yet</option>';

      })

      .catch(function () {

        petSelect.innerHTML = '<option value="">Failed to load pets</option>';

      });

  }



  // Refresh available time slots if a date is already set

  refreshUserTimeSlots();

}



// Auto-detect service from card when Book Now is clicked in Services section

document.addEventListener("click", function(e) {

  var btn = e.target.closest(".service-card-user .btn-primary");

  if (!btn) return;

  e.preventDefault();

  var card = btn.closest(".service-card-user");

  if (!card) return;

  var h3 = card.querySelector("h3");

  if (h3) {

    var name = h3.textContent.trim().toLowerCase();

    openBookModal(name);

  }

});



async function submitBooking(e) {

  e.preventDefault();



  // Prevent double-submit

  var submitBtn = document.querySelector('#bookForm button[type="submit"]');

  if (submitBtn && submitBtn.disabled) return;

  if (submitBtn) {

    submitBtn.disabled = true;

    submitBtn.textContent = "Booking...";

  }



  var user = _getSessionUser();

  var userId = user.id || user.userId;



  if (!userId) {

    showToast("Session expired. Please log in again.", "error");

    if (submitBtn) {

      submitBtn.disabled = false;

      submitBtn.textContent = "Book Appointment";

    }

    return;

  }



  var petId = document.getElementById("bookPetSelect").value;

  var service = document.getElementById("bookServiceSelect").value;

  var appTime = document.getElementById("bookTimeSelect").value;

  var form = document.getElementById("bookForm");

  var appDate = form.querySelector('input[type="date"]').value;

  var appNotes = form.querySelector("textarea").value.trim();



  var appointmentPayload = {

    user_id: parseInt(userId) || 0,

    pet_id: parseInt(petId) || 0,

    service: service,

    appointment_date: appDate,

    appointment_time: appTime,

    notes: appNotes,

  };



  if (appointmentPayload.user_id === 0) {

    showToast("Invalid User Session ID.", "error");

    if (submitBtn) {

      submitBtn.disabled = false;

      submitBtn.textContent = "Book Appointment";

    }

    return;

  }

  if (appointmentPayload.pet_id === 0) {

    showToast("Please select a valid pet.", "warning");

    if (submitBtn) {

      submitBtn.disabled = false;

      submitBtn.textContent = "Book Appointment";

    }

    return;

  }

  if (!appointmentPayload.service) {

    showToast("Please select a service.", "warning");

    if (submitBtn) {

      submitBtn.disabled = false;

      submitBtn.textContent = "Book Appointment";

    }

    return;

  }

  if (!appointmentPayload.appointment_date) {

    showToast("Please select a date.", "warning");

    if (submitBtn) {

      submitBtn.disabled = false;

      submitBtn.textContent = "Book Appointment";

    }

    return;

  }

  if (!appointmentPayload.appointment_time) {

    showToast("Please select a time.", "warning");

    if (submitBtn) {

      submitBtn.disabled = false;

      submitBtn.textContent = "Book Appointment";

    }

    return;

  }



  try {

    var response = await fetch("../php_files/book-appointment.php", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify(appointmentPayload),

    });



    var data = await response.json();



    if (data.status === "success") {

      showToast(

        data.message + "\nReference No: " + (data.reference_no || "N/A"),

        "success",

      );



      form.reset();

      closeModal("bookModal");

      loadUserAppointments();

    } else {

      showToast("Booking Failed: " + data.message, "error");

    }

  } catch (error) {

    console.error("Transmission Failure:", error);

    showToast("Could not connect to the booking system server.", "error");

  } finally {

    if (submitBtn) {

      submitBtn.disabled = false;

      submitBtn.textContent = "Book Appointment";

    }

  }

}



// Refresh time slots when date changes in booking modal

function refreshUserTimeSlots() {

  var form = document.getElementById("bookForm");

  if (!form) return;

  var dateInput = form.querySelector('input[type="date"]');

  var timeSelect = document.getElementById("bookTimeSelect");

  if (!timeSelect) return;



  if (!dateInput || !dateInput.value) {

    var defaultSlots = getVHSTimeSlots(new Date().toISOString().split('T')[0]);

    timeSelect.innerHTML =

      '<option value="">Select time</option>' +

      defaultSlots.map(function (s) {

        return '<option value="' + s + '">' + s + "</option>";

      }).join("");

    return;

  }



  var slots = getVHSTimeSlots(dateInput.value);

  timeSelect.innerHTML = '<option value="">Loading slots...</option>';

  fetch("../php_files/get_booked_slots.php?date=" + dateInput.value)

    .then(function (r) {

      return r.json();

    })

    .then(function (data) {

      var booked = data.booked_slots || [];

      timeSelect.innerHTML =

        '<option value="">Select time</option>' +

        slots.map(function (slot) {

          var isBooked = booked.indexOf(slot) !== -1;

          return (

            '<option value="' +

            slot +

            '"' +

            (isBooked ? " disabled" : "") +

            ">" +

            slot +

            (isBooked ? " (Unavailable)" : "") +

            "</option>"

          );

        }).join("");

    })

    .catch(function () {

      timeSelect.innerHTML =

        '<option value="">Select time</option>' +

        slots.map(function (s) {

          return '<option value="' + s + '">' + s + "</option>";

        }).join("");

    });

}



// Wire date change to slot refresh

document.addEventListener("change", function (e) {

  var form = document.getElementById("bookForm");

  if (form && e.target === form.querySelector('input[type="date"]')) {

    refreshUserTimeSlots();

  }

});function viewAppt(id) {
  var appt = mockAppointmentsData.find(function(a) { return a.id === id; });
  if (!appt) return;

  // Populate detail summary
  var detailEl = document.getElementById('apptDetails');
  if (detailEl) {
    var statusMap = { pending: 'Scheduled', scheduled: 'Confirmed', completed: 'Completed', canceled: 'Cancelled', cancelled: 'Cancelled' };
    detailEl.innerHTML =
      '<div class="appt-detail-row"><span class="appt-detail-label">Reference No.</span><span class="appt-detail-val">' + escapeHtml(appt.reference_no || '—') + '</span></div>'
      + '<div class="appt-detail-row"><span class="appt-detail-label">Pet</span><span class="appt-detail-val">' + escapeHtml(appt.pet_name) + ' (' + escapeHtml(appt.pet_type) + (appt.pet_breed ? ' / ' + escapeHtml(appt.pet_breed) : '') + ')</span></div>'
      + '<div class="appt-detail-row"><span class="appt-detail-label">Service</span><span class="appt-detail-val">' + escapeHtml(appt.service) + '</span></div>'
      + '<div class="appt-detail-row"><span class="appt-detail-label">Date</span><span class="appt-detail-val">' + _fmtApptDateShort(appt.date) + '</span></div>'
      + '<div class="appt-detail-row"><span class="appt-detail-label">Time</span><span class="appt-detail-val">' + escapeHtml(appt.time || '—') + '</span></div>'
      + '<div class="appt-detail-row"><span class="appt-detail-label">Status</span><span class="appt-detail-val">' + _apptStatusBadge(appt.status) + '</span></div>'
      + (appt.notes ? '<div class="appt-detail-row"><span class="appt-detail-label">Notes</span><span class="appt-detail-val">' + escapeHtml(appt.notes) + '</span></div>' : '');
  }

  // Render real QR code via QRCode.js library
  var qrWrap = document.getElementById('apptQrCode');
  var qrRef = document.getElementById('apptQrRef');
  if (qrWrap) {
    qrWrap.innerHTML = '';
    var refText = appt.reference_no || appt.id;
    try {
      new QRCode(qrWrap, {
        text: refText,
        width: 160,
        height: 160,
        colorDark: '#4c1d95',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (e) {
      qrWrap.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">QR unavailable</p>';
    }
    if (qrRef) {
      qrRef.innerHTML = '<span class="appt-qr-ref-label">Reference No:</span> <span class="appt-qr-ref-value">' + escapeHtml(refText) + '</span>';
    }
  }

  openModal('viewApptModal');
}



function rescheduleAppt(id) {

  showConfirm(

    "Do you want to reschedule this appointment?",

    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',

    "Reschedule",

    () => {

      openBookModal();

      showToast("Please select a new date and time.", "info");

    },

  );

}



function cancelAppt(id) {

  showConfirm(

    "Are you sure you want to cancel this appointment?",

    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',

    "Cancel Appointment",

    () => {

      fetch("../php_files/update_appointment_status.php", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ id: id, status: "canceled" }),

      })

        .then(function (r) {

          return r.json();

        })

        .then(function (data) {

          if (data.status === "success") {

            showToast("Appointment cancelled.", "warning");

            loadUserAppointments();

          } else {

            showToast(

              "Failed to cancel: " + (data.message || "Unknown error"),

              "error",

            );

          }

        })

        .catch(function () {

          showToast("Network error.", "error");

        });

    },

  );

}



// Search & filter

document.getElementById("searchAppts")?.addEventListener("input", (e) => {

  const term = e.target.value.toLowerCase();

  document.querySelectorAll("#apptTableBody tr[data-id]").forEach((row) => {

    row.style.display =

      row.textContent.toLowerCase().includes(term) ? "" : "none";

  });

});



document.getElementById("filterApptStatus")?.addEventListener("change", (e) => {

  const val = e.target.value.toLowerCase();

  document.querySelectorAll("#apptTableBody tr[data-id]").forEach((row) => {

    var rowStatus = (

      row.querySelector(".status-badge")?.textContent || ""

    ).toLowerCase();

    row.style.display = val === "all" || rowStatus.includes(val) ? "" : "none";

  });

});



// ─── PETS ─────────────────────────────────────────────────────────────────────



function toggleHistory(id) {
  document.getElementById(id)?.classList.toggle("hidden");
}


var _currentPets = [];
var _currentPrintPet = null;

function showMedicalHistory(petId) {
  // Resolve pet from loaded data (backend or mock)
  var pet = _currentPets.find(function (p) { return p.id === petId; });
  if (!pet) pet = mockPetsData.find(function (p) { return p.id === petId; });
  _currentPrintPet = pet;

  var titleEl = document.getElementById('medHistModalTitle');
  var subtitleEl = document.getElementById('medHistModalSubtitle');
  if (titleEl) titleEl.textContent = 'Medical History';
  if (subtitleEl) subtitleEl.textContent = pet ? pet.name + ' \u2014 ' + (pet.type || pet.species || '') + ', ' + (pet.breed || '') : '';

  renderPetHistory(pet, 'medHistoryTimeline');
  openModal('medHistoryModal');
}



function openAddPetModal() {

  document.getElementById("petModalTitle").textContent = "Add New Pet";

  document.getElementById("petForm")?.reset();

  delete document.getElementById("petForm")?.dataset.editId;

  // Reset photo preview

  var preview = document.getElementById("petPhotoPreview");

  if (preview)

    preview.innerHTML =

      '<span class="upload-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span><span>Click to upload photo</span>';

  // Inject user ID

  var user = _getSessionUser();

  var hiddenId = document.getElementById("petUserId");

  if (hiddenId) hiddenId.value = user.id || user.userId || "";

  openModal("petModal");

}



function previewPetPhoto(input) {

  if (!input.files || !input.files[0]) return;

  var reader = new FileReader();

  reader.onload = function (e) {

    var preview = document.getElementById("petPhotoPreview");

    if (preview) {

      preview.innerHTML = '<img src="' + e.target.result + '" alt="Pet photo">';

    }

  };

  reader.readAsDataURL(input.files[0]);

}function openEditPetModal(id) {
  document.getElementById('petModalTitle').textContent = 'Edit Pet';
  document.getElementById('petForm').reset();

  var preview = document.getElementById('petPhotoPreview');
  if (preview)
    preview.innerHTML = '<span class="upload-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span><span>Click to change photo</span>';

  var user = _getSessionUser();
  var hiddenId = document.getElementById('petUserId');
  if (hiddenId) hiddenId.value = user.id || user.userId || '';
  var form = document.getElementById('petForm');
  if (form) form.dataset.editId = id;

  // Resolve pet from loaded data (backend or mock)
  function _populate(p) {
    if (!p) { showToast('Pet not found.', 'error'); return; }
    document.getElementById('petName').value = p.name || '';
    document.getElementById('petSpecies').value = p.species || p.type || '';
    document.getElementById('petBreed').value = p.breed || '';
    document.getElementById('petAge').value = p.age || '';
    document.getElementById('petGender').value = p.gender || '';
    document.getElementById('petWeight').value = p.weight || '';
    document.getElementById('petColor').value = p.color || '';
    document.getElementById('petReproStatus').value = p.reproductiveStatus || '';
    document.getElementById('petMicrochip').value = p.microchip || '';
    document.getElementById('petAllergies').value = p.allergies || '';
    document.getElementById('petChronic').value = p.chronicConditions || '';
    document.getElementById('petNotes').value = p.notes || '';
    if (p.photo && preview) {
      preview.innerHTML = '<img src="' + p.photo + '" alt="Pet photo" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">';
    }
    openModal('petModal');
  }

  // Try mock data first (for GitHub Pages / no session)
  var mockPet = _currentPets.find(function (x) { return x.id === id; })
    || mockPetsData.find(function (x) { return x.id === id; });
  if (mockPet) { _populate(mockPet); return; }

  // Try backend
  var userId = user.id || user.userId;
  if (!userId) { showToast('Session expired.', 'error'); return; }
  fetch('get_pets_user.php?user_id=' + userId)
    .then(function (r) { return r.json(); })
    .then(function (pets) {
      var p = pets.find(function (x) { return x.id === id; });
      _populate(p);
    })
    .catch(function () { showToast('Failed to load pet data.', 'error'); });
}



// ─── MOCK PET MEDICAL HISTORY DATA ───────────────────────────────────────────

const mockPetsData = [
  {
    id: 1,
    name: 'Luna',
    species: 'Cat',
    breed: 'Persian',
    age: 3,
    gender: 'Female',
    weight: 4.2,
    color: 'White with grey patches',
    reproductiveStatus: 'Spayed',
    microchip: 'PH-001-2023-LUNA',
    allergies: 'None known yet',
    chronicConditions: 'None known yet',
    notes: 'Indoor cat. Slight sensitivity to certain flea treatments.',
    owner: { name: 'Maria Santos', phone: '0917-123-4567' },
    vaccines: [
      { name: 'FVRCP', date: '2026-05-22', nextDue: '2027-05-22', batchNo: 'FVR-2026-044', vet: 'Dr. Santos' },
      { name: 'Rabies', date: '2025-11-05', nextDue: '2026-11-05', batchNo: 'RAB-2025-118', vet: 'Dr. Santos' },
      { name: 'FVRCP (1st Dose)', date: '2025-06-10', nextDue: '2026-06-10', batchNo: 'FVR-2025-089', vet: 'Dr. Reyes' },
    ],
    visits: [
      {
        id: 'v001',
        date: '2026-08-10',
        service: 'Annual Check-up',
        vet: 'Dr. Reyes',
        notes: 'Routine physical exam. Weight stable. No abnormalities detected. Teeth in good condition. Recommended continued dental chews.',
      },
      {
        id: 'v002',
        date: '2026-05-22',
        service: 'Vaccination — FVRCP Booster',
        vet: 'Dr. Santos',
        notes: 'FVRCP booster administered. Mild lethargy for 24 hours post-vaccination is normal. No adverse reactions observed during 30-minute observation period.',
      },
      {
        id: 'v003',
        date: '2026-03-05',
        service: 'Deworming',
        vet: 'Dr. Reyes',
        notes: 'Panacur administered orally. No parasites observed in recent stool samples. Next deworming due in 3 months.',
      },
      {
        id: 'v004',
        date: '2025-12-18',
        service: 'Blood Test — CBC',
        vet: 'Dr. Santos',
        notes: 'Complete blood count within normal ranges. White blood cell count: 8.2 (ref 5.0–19.5). Hematocrit: 38% (ref 30–45%). Follow-up not needed.',
      },
      {
        id: 'v005',
        date: '2025-09-14',
        service: 'Consultation — Skin Irritation',
        vet: 'Dr. Reyes',
        notes: 'Mild dermatitis on left ear. Prescribed topical clotrimazole cream for 7 days. Advised to keep ears dry and clean weekly.',
      },
    ],
  },
  {
    id: 2,
    name: 'Buddy',
    species: 'Dog',
    breed: 'Golden Retriever',
    age: 5,
    gender: 'Male',
    weight: 31.5,
    color: 'Golden blonde',
    reproductiveStatus: 'Neutered',
    microchip: 'PH-002-2021-BUDD',
    allergies: 'None known yet',
    chronicConditions: 'Mild hip dysplasia',
    notes: 'Requires joint supplements. Avoid strenuous exercise.',
    owner: { name: 'Maria Santos', phone: '0917-123-4567' },
    vaccines: [
      { name: 'Rabies', date: '2025-11-05', nextDue: '2026-11-05', batchNo: 'RAB-2025-119', vet: 'Dr. Santos' },
      { name: 'DHPPiL', date: '2025-08-15', nextDue: '2026-08-15', batchNo: 'DHP-2025-067', vet: 'Dr. Reyes' },
      { name: 'Bordetella', date: '2025-08-15', nextDue: '2026-02-15', batchNo: 'BOR-2025-033', vet: 'Dr. Reyes' },
    ],
    visits: [
      {
        id: 'v006',
        date: '2026-07-30',
        service: 'Grooming + Nail Trim',
        vet: 'Dr. Cruz',
        notes: 'Full groom with deshedding treatment. Nails trimmed to appropriate length. Ears cleaned. Skin and coat in good condition.',
      },
      {
        id: 'v007',
        date: '2026-06-12',
        service: 'Fecalysis',
        vet: 'Dr. Santos',
        notes: 'Stool sample examined. No parasites, bacteria, or abnormalities detected. Result: Negative for roundworms, hookworms, and giardia.',
      },
      {
        id: 'v008',
        date: '2026-02-20',
        service: 'Dental Prophylaxis',
        vet: 'Dr. Reyes',
        notes: 'Dental cleaning under sedation. Grade 2 tartar removed from upper premolars. Two teeth showed mild wear — no extraction needed. Post-op recovery uneventful.',
      },
      {
        id: 'v009',
        date: '2025-11-05',
        service: 'Vaccination — Rabies',
        vet: 'Dr. Santos',
        notes: 'Rabies vaccine administered. Valid for 1 year. Certificate issued. No adverse reactions during observation.',
      },
    ],
  },
  {
    id: 3,
    name: 'Mochi',
    species: 'Cat',
    breed: 'Siamese',
    age: 2,
    gender: 'Male',
    weight: 3.8,
    color: 'Seal point (cream body, dark face/ears/tail)',
    reproductiveStatus: 'Neutered',
    microchip: '',
    allergies: 'Sensitive to poultry-based diets',
    chronicConditions: 'None known yet',
    notes: '',
    owner: { name: 'Maria Santos', phone: '0917-123-4567' },
    vaccines: [
      { name: 'FVRCP (1st Dose)', date: '2026-01-10', nextDue: '2026-02-10', batchNo: 'FVR-2026-012', vet: 'Dr. Santos' },
      { name: 'Rabies', date: '2026-01-10', nextDue: '2027-01-10', batchNo: 'RAB-2026-005', vet: 'Dr. Santos' },
    ],
    visits: [
      {
        id: 'v010',
        date: '2026-08-01',
        service: 'Consultation — Limping',
        vet: 'Dr. Cruz',
        notes: 'Mild right forelimb lameness. X-ray showed no fracture. Likely soft tissue strain. Prescribed rest and Metacam for 5 days. Recheck in 1 week.',
      },
      {
        id: 'v011',
        date: '2026-04-15',
        service: 'Castration',
        vet: 'Dr. Reyes',
        notes: 'Routine castration performed under general anesthesia. Surgery duration: 25 minutes. Recovery smooth. Suture removal not needed (absorbable sutures used).',
      },
      {
        id: 'v012',
        date: '2026-01-10',
        service: 'Initial Registration + Vaccination',
        vet: 'Dr. Santos',
        notes: 'First visit. Registered as new patient. FVRCP vaccine (1st dose) and Deworming administered. Microchip implanted. Estimated DOB: Nov 2023.',
      },
    ],
  },
];


// ─── PET MEDICAL HISTORY RENDERER ────────────────────────────────────────────

// renderPetHistory(pet) — accepts a pet object: { name, visits[] }
// Each visit: { date, service, vet, notes }
// Fully decoupled from data source; caller resolves the pet.
function renderPetHistory(pet, containerId) {
  var container = document.getElementById(containerId || 'profileTimeline') || document.getElementById('medHistoryTimeline');
  if (!container) return;

  if (!pet) {
    container.innerHTML = '<p class="med-hist-empty">No pet selected.</p>';
    return;
  }

  var visits = (pet.visits || []).slice().sort(function (a, b) {
    return new Date(b.date) - new Date(a.date);
  });

  if (!visits.length) {
    container.innerHTML = '<p class="med-hist-empty">No visit history found for ' + escapeHtml(pet.name) + '.</p>';
    return;
  }

  // Build timeline HTML
  var html = '<div class="med-timeline">';

  visits.forEach(function (visit) {
    var d = new Date(visit.date + 'T00:00:00');
    var formattedDate = d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long', day: 'numeric'
    });
    var dateShort = d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric'
    });

    html += '<div class="med-timeline-item">'
      + '<div class="med-timeline-date">'
      + '<span class="med-timeline-date-full">' + formattedDate + '</span>'
      + '<span class="med-timeline-date-short">' + dateShort + '</span>'
      + '</div>'
      + '<div class="med-timeline-marker"></div>'
      + '<div class="med-timeline-card">'
      + '<div class="med-timeline-card-header">'
      + '<span class="med-timeline-service">' + escapeHtml(visit.service) + '</span>'
      + '</div>'
      + '<div class="med-timeline-card-body">'
      + '<div class="med-timeline-vet">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
      + escapeHtml(visit.vet)
      + '</div>'
      + '<p class="med-timeline-notes">' + escapeHtml(visit.notes) + '</p>'
      + '</div>'
      + '</div>'
      + '</div>';
  });

  html += '</div>';
  container.innerHTML = html;
}


function escapeHtml(text) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}


// ─── FULL PET PROFILE MODAL ──────────────────────────────────────────────────

var _currentProfilePet = null;
var _activeProfileTab = 'profile-medical';

function showPetProfile(petId) {
  var pet = _currentPets.find(function (p) { return p.id === petId; });
  if (!pet) pet = mockPetsData.find(function (p) { return p.id === petId; });
  if (!pet) return;
  _currentProfilePet = pet;
  _currentPrintPet = pet;
  _activeProfileTab = 'profile-medical';

  // Set header
  document.getElementById('profileModalTitle').textContent = pet.name;
  document.getElementById('profileModalSubtitle').textContent = (pet.species || pet.type || '') + (pet.breed ? ' / ' + pet.breed : '');

  // Build pet info header
  var sp = pet.species || pet.type || '';
  var photo = pet.photo
    ? '<img src="' + pet.photo + '" alt="' + escapeHtml(pet.name) + '">'
    : petEmoji(sp);
  var owner = pet.owner || {};
  var noneTag = '<span class="profile-notes-tag profile-none-tag">None known yet</span>';

  document.getElementById('profilePetHeader').innerHTML = ''
    + '<div class="profile-pet-avatar">' + photo + '</div>'
    + '<div style="flex:1;min-width:0">'
    + '<div class="profile-pet-info-grid">'
    + '<div class="profile-pet-stat"><div class="profile-pet-stat-label">Species / Breed</div><div class="profile-pet-stat-val">' + escapeHtml(sp) + (pet.breed ? ' / ' + escapeHtml(pet.breed) : '') + '</div></div>'
    + '<div class="profile-pet-stat"><div class="profile-pet-stat-label">Age</div><div class="profile-pet-stat-val">' + (pet.age ? pet.age + ' years' : '\u2014') + '</div></div>'
    + '<div class="profile-pet-stat"><div class="profile-pet-stat-label">Weight</div><div class="profile-pet-stat-val">' + (pet.weight ? pet.weight + ' kg' : '\u2014') + '</div></div>'
    + '<div class="profile-pet-stat"><div class="profile-pet-stat-label">Gender</div><div class="profile-pet-stat-val">' + escapeHtml(pet.gender || '\u2014') + '</div></div>'
    + '<div class="profile-pet-stat"><div class="profile-pet-stat-label">Color / Markings</div><div class="profile-pet-stat-val">' + escapeHtml(pet.color || '\u2014') + '</div></div>'
    + '<div class="profile-pet-stat"><div class="profile-pet-stat-label">Reproductive Status</div><div class="profile-pet-stat-val">' + escapeHtml(pet.reproductiveStatus || '\u2014') + '</div></div>'
    + '<div class="profile-pet-stat"><div class="profile-pet-stat-label">Microchip ID</div><div class="profile-pet-stat-val">' + escapeHtml(pet.microchip || '\u2014') + '</div></div>'
    + '<div class="profile-pet-stat"><div class="profile-pet-stat-label">Owner</div><div class="profile-pet-stat-val">' + escapeHtml(owner.name || '\u2014') + '</div></div>'
    + '</div>'
    + '<div class="profile-health-alerts">'
    + '<div class="profile-health-row">'
    + '<span class="profile-health-label">Known Allergies</span>'
    + '<span class="profile-health-val">' + (pet.allergies && pet.allergies.toLowerCase() !== 'none known yet' ? escapeHtml(pet.allergies) : '<span class="profile-none-tag">None known yet</span>') + '</span>'
    + '</div>'
    + '<div class="profile-health-row">'
    + '<span class="profile-health-label">Chronic Conditions</span>'
    + '<span class="profile-health-val">' + (pet.chronicConditions && pet.chronicConditions.toLowerCase() !== 'none known yet' ? escapeHtml(pet.chronicConditions) : '<span class="profile-none-tag">None known yet</span>') + '</span>'
    + '</div>'
    + (pet.notes ? '<div class="profile-health-row">'
    + '<span class="profile-health-label">Additional Notes</span>'
    + '<span class="profile-health-val">' + escapeHtml(pet.notes) + '</span>'
    + '</div>' : '')
    + '</div>'
    + '</div>';

  // Render tabs
  switchProfileTab('profile-medical');
  openModal('petProfileModal');
}


function switchProfileTab(tabId) {
  _activeProfileTab = tabId;
  document.querySelectorAll('.profile-tab').forEach(function (t) {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
  document.querySelectorAll('.profile-tab-content').forEach(function (c) {
    c.classList.toggle('active', c.id === 'tab-' + tabId);
  });
  // Toggle export buttons
  var medBtn = document.getElementById('profileExportMedBtn');
  var vaxBtn = document.getElementById('profileExportVaxBtn');
  if (medBtn) medBtn.style.display = tabId === 'profile-medical' ? '' : 'none';
  if (vaxBtn) vaxBtn.style.display = tabId === 'profile-vaccines' ? '' : 'none';

  // Render content for the active tab
  if (tabId === 'profile-medical' && _currentProfilePet) {
    renderPetHistory(_currentProfilePet);
  } else if (tabId === 'profile-vaccines' && _currentProfilePet) {
    renderVaccinePassport(_currentProfilePet);
  }
}


function renderVaccinePassport(pet) {
  var container = document.getElementById('profileVaccineTable');
  if (!container) return;
  if (!pet) { container.innerHTML = '<p class="med-hist-empty">No pet selected.</p>'; return; }

  var vaccines = pet.vaccines || [];
  if (!vaccines.length) {
    container.innerHTML = '<p class="med-hist-empty">No vaccination records found for ' + escapeHtml(pet.name) + '.</p>';
    return;
  }

  var rows = vaccines.map(function (v) {
    var d = new Date(v.date + 'T00:00:00');
    var dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    var nextDue = v.nextDue ? new Date(v.nextDue + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '\u2014';
    return '<tr>'
      + '<td>' + escapeHtml(dateStr) + '</td>'
      + '<td>' + escapeHtml(v.name) + '</td>'
      + '<td>' + escapeHtml(nextDue) + '</td>'
      + '<td>' + escapeHtml(v.batchNo || '\u2014') + '</td>'
      + '<td>' + escapeHtml(v.vet || '\u2014') + '</td>'
      + '</tr>';
  }).join('');

  container.innerHTML = '<table class="vaccine-table">'
    + '<thead><tr><th>Date Administered</th><th>Vaccine</th><th>Next Due</th><th>Batch No.</th><th>Administered By</th></tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>';
}


// ─── PRINT / EXPORT PDF ──────────────────────────────────────────────────────

function printPetHistory() {
  var pet = _currentPrintPet;
  if (!pet) return;

  var timeline = document.getElementById('medHistoryTimeline');
  var now = new Date();
  var datePrinted = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  var owner = pet.owner || {};

  // Sort visits newest-first for the table
  var visits = (pet.visits || []).slice().sort(function (a, b) {
    return new Date(b.date) - new Date(a.date);
  });

  // Build visit rows
  var rows = visits.map(function (v) {
    var d = new Date(v.date + 'T00:00:00');
    var dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    return '<tr>'
      + '<td>' + escapeHtml(dateStr) + '</td>'
      + '<td>' + escapeHtml(v.service) + '</td>'
      + '<td>' + escapeHtml(v.notes) + '</td>'
      + '<td>' + escapeHtml(v.vet) + '</td>'
      + '</tr>';
  }).join('');

  var logoPath = '../web-page/image/vhs-assets/vhs-logo.png';

  var html = ''
    // ── LETTERHEAD ──
    + '<div class="print-letterhead">'
    + '<div class="print-letterhead-row">'
    + '<img src="' + logoPath + '" alt="VHS Logo" class="print-logo" />'
    + '<div class="print-clinic-info">'
    + '<h1 class="print-clinic-name">VHS Animal Wellness Center</h1>'
    + '<p class="print-clinic-detail">834 Aurora Blvd cor Driod St, Kaunlaran, Cubao, Quezon City, 1111</p>'
    + '<p class="print-clinic-detail">Tel: (0917) 108-4174 &nbsp;|&nbsp; vhs.animalwellness@gmail.com</p>'
    + '</div>'
    + '</div>'
    + '<div class="print-doc-title">Official Pet Medical &amp; Vaccination Record</div>'
    + '<div class="print-meta-row">'
    + '<span>Date Printed: ' + datePrinted + '</span>'
    + '<span>Document Ref: VHS-MR-' + pet.id + '-' + now.getFullYear() + '</span>'
    + '</div>'
    + '</div>'

    // ── PET & OWNER INFO ──
    + '<div class="print-section">'
    + '<div class="print-section-title">Patient &amp; Owner Information</div>'
    + '<div class="print-info-grid">'
    + '<div class="print-info-item"><span class="print-info-label">Pet Name</span><span class="print-info-value">' + escapeHtml(pet.name) + '</span></div>'
    + '<div class="print-info-item"><span class="print-info-label">Species / Breed</span><span class="print-info-value">' + escapeHtml(pet.species || pet.type || '') + ' / ' + escapeHtml(pet.breed || '') + '</span></div>'
    + '<div class="print-info-item"><span class="print-info-label">Age</span><span class="print-info-value">' + (pet.age ? pet.age + ' years' : '\u2014') + '</span></div>'
    + '<div class="print-info-item"><span class="print-info-label">Gender</span><span class="print-info-value">' + escapeHtml(pet.gender || '') + '</span></div>'
    + '<div class="print-info-item"><span class="print-info-label">Weight</span><span class="print-info-value">' + (pet.weight ? pet.weight + ' kg' : '\u2014') + '</span></div>'
    + '<div class="print-info-item"><span class="print-info-label">Owner Name</span><span class="print-info-value">' + escapeHtml(owner.name || '\u2014') + '</span></div>'
    + '<div class="print-info-item"><span class="print-info-label">Contact Number</span><span class="print-info-value">' + escapeHtml(owner.phone || '\u2014') + '</span></div>'
    + '<div class="print-info-item"><span class="print-info-label">Medical Notes</span><span class="print-info-value">' + escapeHtml(pet.notes || 'None on file') + '</span></div>'
    + '</div>'
    + '</div>'

    // ── VISIT HISTORY TABLE ──
    + '<div class="print-section">'
    + '<div class="print-section-title">Visit History</div>'
    + '<table class="print-table">'
    + '<thead><tr>'
    + '<th>Date</th>'
    + '<th>Service / Reason for Visit</th>'
    + '<th>Clinical Notes &amp; Diagnosis</th>'
    + '<th>Attending Veterinarian</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '</div>'

    // ── SIGNATURE FOOTER ──
    + '<div class="print-footer">'
    + '<div class="print-sig-block">'
    + '<div class="print-sig-line"></div>'
    + '<div class="print-sig-label">Attending Veterinarian Signature</div>'
    + '<div class="print-sig-sub">Over printed name &amp; License No.</div>'
    + '</div>'
    + '<div class="print-sig-block">'
    + '<div class="print-sig-line"></div>'
    + '<div class="print-sig-label">License No.</div>'
    + '<div class="print-sig-sub">PRC / Vet Board ID</div>'
    + '</div>'
    + '</div>'

    // ── CONFIDENTIALITY NOTICE ──
    + '<div class="print-notice">'
    + 'This document is an official record of VHS Animal Wellness Center. '
    + 'Unauthorized reproduction or distribution is prohibited. '
    + 'For verification, contact (0917) 108-4174.'
    + '</div>';

  var printWrapper = document.createElement('div');
  printWrapper.className = 'print-area';
  printWrapper.innerHTML = html;
  document.body.appendChild(printWrapper);

  window.print();

  setTimeout(function () {
    if (printWrapper.parentNode) printWrapper.parentNode.removeChild(printWrapper);
  }, 1500);
}


// ─── PRINT VACCINE CERTIFICATE ───────────────────────────────────────────────

function printVaccineCertificate() {
  var pet = _currentProfilePet || _currentPrintPet;
  if (!pet) return;

  var now = new Date();
  var datePrinted = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  var owner = pet.owner || {};
  var vaccines = (pet.vaccines || []).slice().sort(function (a, b) {
    return new Date(b.date) - new Date(a.date);
  });

  var rows = vaccines.map(function (v) {
    var d = new Date(v.date + 'T00:00:00');
    var dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    var nextDue = v.nextDue ? new Date(v.nextDue + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '\u2014';
    return '<tr>'
      + '<td>' + escapeHtml(dateStr) + '</td>'
      + '<td>' + escapeHtml(v.name) + '</td>'
      + '<td>' + escapeHtml(nextDue) + '</td>'
      + '<td>' + escapeHtml(v.batchNo || '\u2014') + '</td>'
      + '<td>' + escapeHtml(v.vet || '\u2014') + '</td>'
      + '</tr>';
  }).join('');

  var logoPath = '../web-page/image/vhs-assets/vhs-logo.png';
  var sp = pet.species || pet.type || '';

  var html = ''
    + '<div class="print-letterhead">'
    + '<div class="print-letterhead-row">'
    + '<img src="' + logoPath + '" alt="VHS Logo" class="print-logo" />'
    + '<div class="print-clinic-info">'
    + '<h1 class="print-clinic-name">VHS Animal Wellness Center</h1>'
    + '<p class="print-clinic-detail">834 Aurora Blvd cor Driod St, Kaunlaran, Cubao, Quezon City, 1111</p>'
    + '<p class="print-clinic-detail">Tel: (0917) 108-4174 &nbsp;|&nbsp; vhs.animalwellness@gmail.com</p>'
    + '</div>'
    + '</div>'
    + '</div>'

    + '<div class="print-vax-title">Official Vaccination Certificate</div>'
    + '<div class="print-vax-subtitle">This certifies that the following vaccinations have been administered at VHS Animal Wellness Center.</div>'

    + '<div class="print-meta-row">'
    + '<span>Pet: ' + escapeHtml(pet.name) + ' &mdash; ' + escapeHtml(sp) + (pet.breed ? ' / ' + escapeHtml(pet.breed) : '') + '</span>'
    + '<span>Owner: ' + escapeHtml(owner.name || '\u2014') + '</span>'
    + '<span>Date Printed: ' + datePrinted + '</span>'
    + '</div>'

    + '<div class="print-section">'
    + '<table class="print-vax-table">'
    + '<thead><tr>'
    + '<th>Date Administered</th>'
    + '<th>Vaccine</th>'
    + '<th>Next Due Date</th>'
    + '<th>Batch No.</th>'
    + '<th>Administered By</th>'
    + '</tr></thead>'
    + '<tbody>' + (rows || '<tr><td colspan="5" style="text-align:center;color:#888;">No vaccination records.</td></tr>') + '</tbody>'
    + '</table>'
    + '</div>'

    + '<div class="print-vax-cert-notice">'
    + 'This certificate is issued by VHS Animal Wellness Center. For verification, contact (0917) 108-4174. '
    + 'This document does not replace the official government-issued vaccination tag.'
    + '</div>'

    + '<div class="print-footer">'
    + '<div class="print-sig-block">'
    + '<div class="print-sig-line"></div>'
    + '<div class="print-sig-label">Attending Veterinarian Signature</div>'
    + '<div class="print-sig-sub">Over printed name &amp; License No.</div>'
    + '</div>'
    + '<div class="print-sig-block">'
    + '<div class="print-sig-line"></div>'
    + '<div class="print-sig-label">License No.</div>'
    + '<div class="print-sig-sub">PRC / Vet Board ID</div>'
    + '</div>'
    + '</div>'

    + '<div class="print-notice">'
    + 'This document is an official record of VHS Animal Wellness Center. '
    + 'Unauthorized reproduction or distribution is prohibited. '
    + 'For verification, contact (0917) 108-4174.'
    + '</div>';

  var printWrapper = document.createElement('div');
  printWrapper.className = 'print-area';
  printWrapper.innerHTML = html;
  document.body.appendChild(printWrapper);

  window.print();

  setTimeout(function () {
    if (printWrapper.parentNode) printWrapper.parentNode.removeChild(printWrapper);
  }, 1500);
}


// ─── PET SPECIES ICON MAP (SVG) ───────────────────────────────────────────────

function petEmoji(type) {

  var icons = {

    Dog: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 3.656 2.261"/><path d="M14.267 5.172c0-1.39 1.577-2.493 3.5-2.172 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 2.261"/><path d="M8 14v.5"/><path d="M16 14v.5"/><path d="M11.25 16.25h1.5L12 17l-.75-.75z"/><path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444c0-1.061-.162-2.2-.493-3.309m-9.243-6.082A8.801 8.801 0 0 1 12 5c.78 0 1.5.108 2.161.306"/></svg>',

    Cat: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5z"/><path d="M8 14v.5"/><path d="M16 14v.5"/><path d="M11.25 16.25h1.5L12 17l-.75-.75z"/></svg>',

    Bird: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/></svg>',

    Rabbit:

      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3c0 0 0 5 0 7"/><path d="M18 3c0 0 0 5 0 7"/><ellipse cx="12" cy="15" rx="6" ry="5"/><circle cx="9.5" cy="14" r="0.5" fill="currentColor"/><circle cx="14.5" cy="14" r="0.5" fill="currentColor"/><path d="M10 17c0.5 0.8 1 1 2 1s1.5-0.2 2-1"/><path d="M6 10c-1.5 0.5-3 2-3 4s1.5 3 3 3"/><path d="M18 10c1.5 0.5 3 2 3 4s-1.5 3-3 3"/></svg>',

  };

  return (

    icons[type] ||

    '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>'

  );

}



// ─── MOCK APPOINTMENTS DATA ─────────────────────────────────────────────────

var mockAppointmentsData = [
  {
    id: 'apt001', pet_id: 1, pet_name: 'Luna', pet_type: 'Cat', pet_breed: 'Persian',
    service: 'General Consultation', date: '2026-09-15', time: '10:30 AM',
    status: 'scheduled', notes: 'Annual wellness check',
    reference_no: 'VHS-2026-0915-001'
  },
  {
    id: 'apt002', pet_id: 2, pet_name: 'Buddy', pet_type: 'Dog', pet_breed: 'Golden Retriever',
    service: 'Grooming', date: '2026-09-20', time: '02:00 PM',
    status: 'scheduled', notes: 'Full groom package',
    reference_no: 'VHS-2026-0920-002'
  },
  {
    id: 'apt003', pet_id: 1, pet_name: 'Luna', pet_type: 'Cat', pet_breed: 'Persian',
    service: 'Vaccination — FVRCP Booster', date: '2026-10-05', time: '11:00 AM',
    status: 'pending', notes: '',
    reference_no: 'VHS-2026-1005-003'
  },
  {
    id: 'apt004', pet_id: 3, pet_name: 'Mochi', pet_type: 'Cat', pet_breed: 'Siamese',
    service: 'Blood Test — CBC', date: '2026-08-28', time: '09:00 AM',
    status: 'completed', notes: 'Routine bloodwork',
    reference_no: 'VHS-2026-0828-004'
  },
  {
    id: 'apt005', pet_id: 2, pet_name: 'Buddy', pet_type: 'Dog', pet_breed: 'Golden Retriever',
    service: 'Dental Prophylaxis', date: '2026-07-10', time: '08:30 AM',
    status: 'completed', notes: 'Dental cleaning under sedation',
    reference_no: 'VHS-2026-0710-005'
  },
  {
    id: 'apt006', pet_id: 1, pet_name: 'Luna', pet_type: 'Cat', pet_breed: 'Persian',
    service: 'Deworming', date: '2026-06-01', time: '03:30 PM',
    status: 'completed', notes: '',
    reference_no: 'VHS-2026-0601-006'
  },
  {
    id: 'apt007', pet_id: 3, pet_name: 'Mochi', pet_type: 'Cat', pet_breed: 'Siamese',
    service: 'Consultation — Limping', date: '2026-05-15', time: '01:00 PM',
    status: 'canceled', notes: 'Owner rescheduled then cancelled',
    reference_no: 'VHS-2026-0515-007'
  },
  {
    id: 'apt008', pet_id: 2, pet_name: 'Buddy', pet_type: 'Dog', pet_breed: 'Golden Retriever',
    service: 'Vaccination — Rabies', date: '2026-11-05', time: '10:00 AM',
    status: 'scheduled', notes: '',
    reference_no: 'VHS-2026-1105-008'
  },
];


// ─── APPOINTMENTS RENDERER ───────────────────────────────────────────────────

function _fmtApptDateShort(dateStr) {
  if (!dateStr) return '\u2014';
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function _apptStatusBadge(status) {
  var map = { pending: 'pending', scheduled: 'confirmed', completed: 'completed', canceled: 'cancelled', cancelled: 'cancelled' };
  var cls = map[status] || 'pending';
  var label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '\u2014';
  if (status === 'scheduled') label = 'Confirmed';
  return '<span class="status-badge ' + cls + '">' + label + '</span>';
}

function renderAppointmentCards() {
  var now = new Date();
  var upcoming = mockAppointmentsData.filter(function(a) {
    return a.status === 'pending' || a.status === 'scheduled';
  }).sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
  var past = mockAppointmentsData.filter(function(a) {
    return a.status === 'completed' || a.status === 'canceled' || a.status === 'cancelled';
  }).sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

  // Update dashboard stat
  var statEl = document.getElementById('statUpcoming');
  if (statEl) statEl.textContent = upcoming.length;
  var badge = document.getElementById('apptBadge');
  if (badge) { badge.textContent = upcoming.length; badge.style.display = upcoming.length > 0 ? '' : 'none'; }

  _renderApptList('apptUpcoming', upcoming, 'upcoming');
  _renderApptList('apptPast', past, 'past');
}

function _renderApptList(containerId, appts, mode) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!appts.length) {
    container.innerHTML = '<div class="appt-empty"><p>' + (mode === 'upcoming' ? 'No upcoming appointments. Book one to get started!' : 'No past appointments.') + '</p></div>';
    return;
  }
  container.innerHTML = appts.map(function(a) {
    var dateStr = _fmtApptDateShort(a.date);
    var canAct = a.status === 'pending' || a.status === 'scheduled';
    var within2h = canAct && _isWithinTwoHours(a.date, a.time);
    var disabledCls = within2h ? ' disabled' : '';
    var disabledAttr = within2h ? ' disabled' : '';
    return (
      '<div class="appt-card">'
      + '<div class="appt-card-header">'
      + '<span class="appt-datetime">' + dateStr + ' \u2022 ' + escapeHtml(a.time || '\u2014') + '</span>'
      + _apptStatusBadge(a.status)
      + '</div>'
      + '<div class="appt-card-body">'
      + '<div class="appt-card-pet">'
      + '<div class="appt-pet-avatar">' + petEmoji(a.pet_type) + '</div>'
      + '<div><div class="appt-pet-name">' + escapeHtml(a.pet_name) + '</div>'
      + '<div class="appt-pet-breed">' + escapeHtml(a.pet_type) + (a.pet_breed ? ' / ' + escapeHtml(a.pet_breed) : '') + '</div></div>'
      + '</div>'
      + '<div class="appt-card-service">' + escapeHtml(a.service) + '</div>'
      + (a.notes ? '<div class="appt-card-notes">' + escapeHtml(a.notes) + '</div>' : '')
      + (a.reference_no ? '<div class="appt-card-ref">Ref: ' + escapeHtml(a.reference_no) + '</div>' : '')
      + (within2h ? '<div class="appt-card-cutoff-note">Within 2-hour window — contact clinic for changes</div>' : '')
      + '</div>'
      + '<div class="appt-card-footer">'
      + (canAct
        ? '<button class="btn-small' + disabledCls + '" onclick="openRescheduleModal(\'' + a.id + '\')"' + disabledAttr + '>Reschedule</button>'
        + '<button class="btn-small btn-danger' + disabledCls + '" onclick="openCancelModal(\'' + a.id + '\')"' + disabledAttr + '>Cancel</button>'
        : '')
      + '<button class="btn-small btn-link" onclick="viewAppt(\'' + a.id + '\')">View Details</button>'
      + '</div>'
      + '</div>'
    );
  }).join('');
}

function switchApptTab(tab) {
  document.querySelectorAll('.appt-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.getElementById('apptUpcoming').classList.toggle('active', tab === 'upcoming');
  document.getElementById('apptPast').classList.toggle('active', tab === 'past');
}

// ─── 2-HOUR CUT-OFF LOGIC ────────────────────────────────────────────────────

// Returns true if the appointment is within 2 hours of now (or already past)
function _isWithinTwoHours(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false;
  // Parse time string like "10:30 AM" into hours/minutes
  var parts = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!parts) return false;
  var hours = parseInt(parts[1], 10);
  var minutes = parseInt(parts[2], 10);
  var ampm = parts[3].toUpperCase();
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  // Build a Date object for the appointment
  var apptParts = dateStr.split('-');
  var apptDate = new Date(parseInt(apptParts[0]), parseInt(apptParts[1]) - 1, parseInt(apptParts[2]), hours, minutes);
  var now = new Date();
  var diffMs = apptDate.getTime() - now.getTime();
  var diffHours = diffMs / (1000 * 60 * 60);
  return diffHours <= 2;
}

// Returns time slots filtered to exclude those within 2 hours of now (same-day only)
function _filterPastSlots(slots, dateStr) {
  var today = new Date().toISOString().split('T')[0];
  if (dateStr !== today) return slots;
  var now = new Date();
  var cutoffHour = now.getHours() + 2;
  var cutoffMin = now.getMinutes();
  return slots.filter(function(slot) {
    var parts = slot.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!parts) return true;
    var h = parseInt(parts[1], 10);
    var m = parseInt(parts[2], 10);
    var ampm = parts[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    if (h > cutoffHour) return true;
    if (h === cutoffHour && m > cutoffMin) return true;
    return false;
  });
}

function _showCutoffModal() {
  openModal('cutoffModal');
}

// ─── RESCHEDULE ──────────────────────────────────────────────────────────────

function openRescheduleModal(apptId) {
  var appt = mockAppointmentsData.find(function(a) { return a.id === apptId; });
  if (!appt) return;
  if (_isWithinTwoHours(appt.date, appt.time)) {
    _showCutoffModal();
    return;
  }
  document.getElementById('rescheduleApptId').value = apptId;
  document.getElementById('rescheduleDate').value = '';
  document.getElementById('rescheduleTime').value = '';
  document.getElementById('rescheduleReason').value = '';
  var info = document.getElementById('rescheduleInfo');
  if (info) {
    info.innerHTML = '<div class="reschedule-current">'
      + '<div class="reschedule-current-label">Current Appointment</div>'
      + '<div class="reschedule-current-row"><span>Date</span><span>' + _fmtApptDateShort(appt.date) + '</span></div>'
      + '<div class="reschedule-current-row"><span>Time</span><span>' + escapeHtml(appt.time) + '</span></div>'
      + '<div class="reschedule-current-row"><span>Pet</span><span>' + escapeHtml(appt.pet_name) + ' (' + escapeHtml(appt.pet_type) + ')</span></div>'
      + '<div class="reschedule-current-row"><span>Service</span><span>' + escapeHtml(appt.service) + '</span></div>'
      + '</div>';
  }
  var today = new Date().toISOString().split('T')[0];
  var dateInput = document.getElementById('rescheduleDate');
  dateInput.setAttribute('min', today);
  dateInput.value = '';
  dateInput.onchange = _onRescheduleDateChange;
  _populateRescheduleSlots();
  openModal('rescheduleModal');
}

function _populateRescheduleSlots(dateStr) {
  var timeSelect = document.getElementById('rescheduleTime');
  if (!timeSelect) return;
  var targetDate = dateStr || new Date().toISOString().split('T')[0];
  var slots = getVHSTimeSlots(targetDate);
  slots = _filterPastSlots(slots, targetDate);
  timeSelect.innerHTML = '<option value="">Select time</option>' + slots.map(function(s) {
    return '<option value="' + s + '">' + s + '</option>';
  }).join('');
  if (!slots.length) {
    timeSelect.innerHTML = '<option value="">No available slots today</option>';
  }
}

function _onRescheduleDateChange() {
  var dateInput = document.getElementById('rescheduleDate');
  if (dateInput && dateInput.value) {
    _populateRescheduleSlots(dateInput.value);
  }
}

// ─── OTHER CONDITIONAL INPUT TOGGLE ─────────────────────────────────────────
// Shows a text input when 'Other' is selected in any dropdown.
// { selectId, inputId } pairs are registered below.
var _otherInputPairs = [
  { selectId: 'rescheduleReason', inputId: 'rescheduleReasonOther' },
  { selectId: 'cancelReason', inputId: 'cancelReasonOther' },
  { selectId: 'petSpecies', inputId: 'petSpeciesOther' }
];

function _initOtherInputs() {
  _otherInputPairs.forEach(function(pair) {
    var sel = document.getElementById(pair.selectId);
    var inp = document.getElementById(pair.inputId);
    if (!sel || !inp) return;
    sel.addEventListener('change', function() {
      var isOther = sel.value === 'Other' || sel.value === 'Others';
      inp.style.display = isOther ? '' : 'none';
      inp.value = '';
      if (isOther) {
        inp.required = true;
        inp.focus();
      } else {
        inp.required = false;
      }
    });
  });
}

// Returns the resolved value for a select+Other pair
function _getResolvedValue(selectId, otherInputId) {
  var sel = document.getElementById(selectId);
  var inp = document.getElementById(otherInputId);
  if (!sel) return '';
  if ((sel.value === 'Other' || sel.value === 'Others') && inp && inp.value.trim()) {
    return inp.value.trim();
  }
  return sel.value;
}

function submitReschedule(e) {
  e.preventDefault();
  var apptId = document.getElementById('rescheduleApptId').value;
  var newDate = document.getElementById('rescheduleDate').value;
  var newTime = document.getElementById('rescheduleTime').value;
  var reason = _getResolvedValue('rescheduleReason', 'rescheduleReasonOther');
  if (!newDate || !newTime) { showToast('Please select a new date and time.', 'warning'); return; }
  var appt = mockAppointmentsData.find(function(a) { return a.id === apptId; });
  if (appt) {
    appt.date = newDate;
    appt.time = newTime;
    appt.notes = (appt.notes ? appt.notes + ' | ' : '') + 'Rescheduled' + (reason ? ' — ' + reason : '');
  }
  closeModal('rescheduleModal');
  showToast('Appointment rescheduled to ' + _fmtApptDateShort(newDate) + ' at ' + newTime + '.', 'success');
  renderAppointmentCards();
}

// ─── CANCEL ──────────────────────────────────────────────────────────────────

function openCancelModal(apptId) {
  var appt = mockAppointmentsData.find(function(a) { return a.id === apptId; });
  if (!appt) return;
  if (_isWithinTwoHours(appt.date, appt.time)) {
    _showCutoffModal();
    return;
  }
  document.getElementById('cancelApptId').value = apptId;
  document.getElementById('cancelReason').value = '';
  var info = document.getElementById('cancelInfo');
  if (info) {
    info.innerHTML = '<div class="cancel-current">'
      + '<div class="cancel-current-row"><span>Pet</span><span>' + escapeHtml(appt.pet_name) + ' (' + escapeHtml(appt.pet_type) + ')</span></div>'
      + '<div class="cancel-current-row"><span>Service</span><span>' + escapeHtml(appt.service) + '</span></div>'
      + '<div class="cancel-current-row"><span>Date & Time</span><span>' + _fmtApptDateShort(appt.date) + ' \u2022 ' + escapeHtml(appt.time) + '</span></div>'
      + '</div>';
  }
  openModal('cancelModal');
}

function submitCancel(e) {
  e.preventDefault();
  var apptId = document.getElementById('cancelApptId').value;
  var reason = _getResolvedValue('cancelReason', 'cancelReasonOther');
  if (!reason) { showToast('Please select a cancellation reason.', 'warning'); return; }
  var appt = mockAppointmentsData.find(function(a) { return a.id === apptId; });
  if (appt) {
    appt.status = 'canceled';
    appt.notes = (appt.notes ? appt.notes + ' | ' : '') + 'Cancelled — ' + reason;
  }
  closeModal('cancelModal');
  showToast('Appointment cancelled.', 'warning');
  renderAppointmentCards();
}


// ─── LOAD PETS FROM DB ────────────────────────────────────────────────────────


function _renderPetCards(pets, grid, dashGrid, petCount) {
  _currentPets = pets;
  if (petCount) petCount.textContent = pets.length;
  var statPets = document.getElementById('statPets');
  if (statPets) statPets.textContent = pets.length;

  // ── Dashboard quick view (compact cards) ──
  if (dashGrid) {
    dashGrid.innerHTML = pets.length
      ? pets.map(function (p) {
          var subtitle = [p.breed, p.species || p.type, p.age ? p.age + ' yrs' : ''].filter(Boolean).join(' \u00b7 ');
          return (
            '<div class="pet-card" style="cursor:pointer" onclick="showSection(\'pets\')">'
            + '<div class="pet-avatar">' + petEmoji(p.species || p.type) + '</div>'
            + '<div class="pet-info" style="flex:1"><h3>' + escapeHtml(p.name) + '</h3><p>' + subtitle + '</p></div>'
            + '<button class="btn-small" onclick="event.stopPropagation();showSection(\'pets\')">View</button>'
            + '</div>'
          );
        }).join('')
      : '<p style="color:var(--text-muted,#888);padding:1rem 0">No pets registered yet. Add your first pet!</p>';
  }

  // ── My Pets full view ──
  if (!grid) return;
  if (!pets.length) {
    grid.innerHTML = '<p style="color:var(--text-muted,#888);padding:1rem 0">No pets registered yet. Click "Add New Pet" to get started!</p>';
    return;
  }

  grid.innerHTML = pets.map(function (p) {
    var sp = p.species || p.type || '';
    var photo = p.photo
      ? '<img src="' + p.photo + '" alt="' + escapeHtml(p.name) + '" style="width:100%;height:100%;object-fit:cover;border-radius:0.75rem;">'
      : petEmoji(sp);
    // reproBadge rendered inline below species/breed

    return (
      '<div class="pet-full-card content-section">'
      + '<div class="pet-full-header">'
      + '<div class="pet-big-avatar">' + photo + '</div>'
      + '<div style="flex:1;min-width:0">'
      + '<h3 style="font-size:1.25rem;font-weight:700;color:var(--text-dark);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(p.name) + '</h3>'
      + '<div style="margin-top:0.2rem">'
      + '<span class="pet-card-species-badge">' + escapeHtml(sp) + '</span>'
      + (p.breed ? '<p style="font-size:0.85rem;color:var(--text-dim);margin:0.15rem 0 0;line-height:1.35">' + escapeHtml(p.breed) + '</p>' : '')
      + (p.reproductiveStatus ? '<span class="pet-card-badge" style="margin-top:0.2rem;display:inline-block">' + escapeHtml(p.reproductiveStatus) + '</span>' : '')
      + '</div>'
      + '</div>'
      + '<button class="btn-small" onclick="openEditPetModal(' + p.id + ')">Edit Profile</button>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:0.75rem">'
      + '<div class="pet-stat-box"><div class="pet-stat-label">AGE</div><div class="pet-stat-val">' + (p.age ? p.age + ' yrs' : '\u2014') + '</div></div>'
      + '<div class="pet-stat-box"><div class="pet-stat-label">WEIGHT</div><div class="pet-stat-val">' + (p.weight ? p.weight + ' kg' : '\u2014') + '</div></div>'
      + '</div>'
      + '<div style="border-top:1px solid var(--border);padding-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap">'
      + '<button class="btn-primary" style="font-size:0.82rem;padding:0.55rem 1rem;flex:1;justify-content:center" onclick="showPetProfile(' + p.id + ')">\ud83d\udcc4 View Full Profile & Records</button>'
      + '</div>'
      + '</div>'
    );
  }).join('');
}



function loadPets() {
  var user = _getSessionUser();
  var userId = user.id || user.userId;

  var grid = document.getElementById('petsGrid');
  var dashGrid = document.getElementById('dashPetsGrid');
  var petCount = document.getElementById('statPetCount');

  // If no session (e.g. GitHub Pages), render mock data directly
  if (!userId) {
    _renderPetCards(mockPetsData, grid, dashGrid, petCount);
    return;
  }

  if (grid) grid.innerHTML = '<p style="color:#888;padding:1rem 0">Loading pets...</p>';

  fetch('get_pets_user.php?user_id=' + userId)
    .then(function (r) { return r.json(); })
    .then(function (pets) {
      _renderPetCards(pets, grid, dashGrid, petCount);
    })
    .catch(function () {
      // Fallback to mock data on error
      _renderPetCards(mockPetsData, grid, dashGrid, petCount);
    });
}



function submitPet(e) {

  e.preventDefault();



  var form = e.target;

  var formData = new FormData(form);

  // Override species if 'Other' was selected with custom text
  var speciesOther = _getResolvedValue('petSpecies', 'petSpeciesOther');
  if (speciesOther) formData.set('petSpecies', speciesOther);

  var editId = form.dataset.editId;



  // If editing, add the pet_id so PHP knows to UPDATE

  if (editId) formData.append("pet_id", editId);



  fetch("petDB.php", {

    method: "POST",

    body: formData,

  })

    .then(function (r) {

      return r.text();

    })

    .then(function (data) {

      if (data.trim() === "Success") {

        closeModal("petModal");

        showToast(

          editId ? "Pet updated successfully!" : "Pet added successfully!",

          "success",

        );

        loadPets();

      } else {

        showToast("Error: " + data, "error");

      }

    })

    .catch(function () {

      showToast("Server error", "error");

    });

}



// ─── PROFILE ──────────────────────────────────────────────────────────────────



let _profileSnapshot = null; // saved state before editing



function _getInitials(name) {

  if (!name) return "VHS";

  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

  return parts[0] ? parts[0].slice(0, 2).toUpperCase() : "VHS";

}



function _setAvatarDisplay(src, show) {

  const pImg = document.getElementById("avatarPreviewImg");

  const pEmoji = document.getElementById("avatarPreviewEmoji");

  const sImg = document.getElementById("sidebarAvatarImg");

  const sEmoji = document.getElementById("sidebarAvatarEmoji");

  const sInitials = document.getElementById("sidebarAvatarInitials");

  const sName = document.querySelector(".sidebar-user-name");

  if (show && src) {

    pImg.src = src;

    pImg.style.display = "block";

    pEmoji.style.display = "none";

    sImg.src = src;

    sImg.style.display = "block";

    sEmoji.style.display = "none";

    if (sInitials) sInitials.style.display = "none";

  } else {

    pImg.style.display = "none";

    pEmoji.style.display = "";

    sImg.style.display = "none";

    sEmoji.style.display = "flex";

    if (sInitials) sInitials.style.display = "none";

  }

}



function toggleEditProfile() {

  // Snapshot current committed state

  const pImg = document.getElementById("avatarPreviewImg");

  _profileSnapshot = {

    lastName: document.getElementById("profileLastName").value,

    firstName: document.getElementById("profileFirstName").value,

    middleName: document.getElementById("profileMiddleName").value,

    email: document.getElementById("profileEmail").value,

    phone: document.getElementById("profilePhone").value,

    address: document.getElementById("profileAddress").value,

    avatarSrc: pImg.src,

    avatarShow: pImg.style.display !== "none",

  };



  // Name fields are read-only (can't change name after registration)

  ["profilePhone", "profileAddress"].forEach((id) => {

    document.getElementById(id).disabled = false;

  });

  document.getElementById("profileFormActions").classList.remove("hidden");

  document.getElementById("editProfileBtn").style.display = "none";

  document.getElementById("avatarActions").style.display = "";

  document.getElementById("passwordSection").style.display = "";

}



function cancelEditProfile() {

  // Revert everything to snapshot

  if (_profileSnapshot) {

    document.getElementById("profileLastName").value =

      _profileSnapshot.lastName;

    document.getElementById("profileFirstName").value =

      _profileSnapshot.firstName;

    document.getElementById("profileMiddleName").value =

      _profileSnapshot.middleName;

    document.getElementById("profileEmail").value = _profileSnapshot.email;

    document.getElementById("profilePhone").value = _profileSnapshot.phone;

    document.getElementById("profileAddress").value = _profileSnapshot.address;

    const pImg = document.getElementById("avatarPreviewImg");

    const pEmoji = document.getElementById("avatarPreviewEmoji");

    if (_profileSnapshot.avatarShow && _profileSnapshot.avatarSrc) {

      pImg.src = _profileSnapshot.avatarSrc;

      pImg.style.display = "block";

      pEmoji.style.display = "none";

    } else {

      pImg.style.display = "none";

      pEmoji.style.display = "";

    }

  }

  document.getElementById("avatarInput").value = "";

  _profileSnapshot = null;



  ["profilePhone", "profileAddress"].forEach((id) => {

    document.getElementById(id).disabled = true;

  });

  document.getElementById("profileFormActions").classList.add("hidden");

  document.getElementById("editProfileBtn").style.display = "";

  document.getElementById("avatarActions").style.display = "none";

  document.getElementById("passwordSection").style.display = "none";

  document.getElementById("passwordForm").reset();

}



function saveProfile() {

  const current = document.getElementById("currentPassword").value;

  const newPass = document.getElementById("newPassword").value;

  const confirm = document.getElementById("confirmPassword").value;

  if (current || newPass || confirm) {

    if (!current || !newPass || !confirm) {

      showToast("Fill in all password fields.", "error");

      return;

    }

    if (newPass !== confirm) {

      showToast("New passwords do not match.", "error");

      return;

    }

    if (newPass.length < 8) {

      showToast("Password must be at least 8 characters.", "error");

      return;

    }

  }



  const raw = sessionStorage.getItem("user");

  if (!raw) {

    showToast("Session expired. Please log in again.", "error");

    return;

  }

  const user = JSON.parse(raw);

  const phone = document.getElementById("profilePhone").value.trim();

  const address = document.getElementById("profileAddress").value.trim();



  // Use FormData so we can include the photo file

  const fd = new FormData();

  fd.append("id", user.id);

  fd.append("phone", phone);

  fd.append("address", address);

  if (newPass) fd.append("new_password", newPass);



  // Attach photo file if one was selected

  const avatarInput = document.getElementById("avatarInput");

  if (avatarInput && avatarInput.files[0]) {

    fd.append("profile_photo", avatarInput.files[0]);

  }



  fetch("../php_files/update_profile.php", { method: "POST", body: fd })

    .then((r) => r.json())

    .then((res) => {

      if (res.status === "success") {

        user.phone = phone;

        user.address = address;



        // If a new photo was saved, store its URL in session

        if (res.photo) {

          user.photo = "../user/" + res.photo;

          const pImg = document.getElementById("avatarPreviewImg");

          _setAvatarDisplay("../user/" + res.photo, true);

        } else {

          const pImg = document.getElementById("avatarPreviewImg");

          _setAvatarDisplay(pImg.src, pImg.style.display !== "none");

        }



        sessionStorage.setItem("user", JSON.stringify(user));

        _profileSnapshot = null;

        avatarInput.value = "";



        ["profilePhone", "profileAddress"].forEach((id) => {

          document.getElementById(id).disabled = true;

        });

        document.getElementById("profileFormActions").classList.add("hidden");

        document.getElementById("editProfileBtn").style.display = "";

        document.getElementById("avatarActions").style.display = "none";

        document.getElementById("passwordSection").style.display = "none";

        document.getElementById("passwordForm").reset();



        showToast("Profile saved!", "success");

      } else {

        showToast(

          "Failed to save: " + (res.message || "Unknown error"),

          "error",

        );

      }

    })

    .catch(() => showToast("Connection error. Please try again.", "error"));

}



function handleAvatarUpload(e) {

  const file = e.target.files[0];

  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {

    showToast("Image must be under 5MB.", "error");

    return;

  }

  const reader = new FileReader();

  reader.onload = function (ev) {

    // Only update the preview circle — not committed until Save

    const pImg = document.getElementById("avatarPreviewImg");

    const pEmoji = document.getElementById("avatarPreviewEmoji");

    pImg.src = ev.target.result;

    pImg.style.display = "block";

    pEmoji.style.display = "none";

  };

  reader.readAsDataURL(file);

}



function removeAvatar() {

  // Only clear preview — not committed until Save

  const pImg = document.getElementById("avatarPreviewImg");

  const pEmoji = document.getElementById("avatarPreviewEmoji");

  pImg.style.display = "none";

  pEmoji.style.display = "";

  document.getElementById("avatarInput").value = "";

}



// ─── UTILITIES ────────────────────────────────────────────────────────────────



function autoLabelTables() {

  document.querySelectorAll(".compact-table").forEach((table) => {

    const headers = [...table.querySelectorAll("thead th")].map((th) =>

      th.textContent.trim(),

    );

    table.querySelectorAll("tbody tr").forEach((row) => {

      [...row.querySelectorAll("td")].forEach((td, i) => {

        if (!td.getAttribute("data-label") && headers[i])

          td.setAttribute("data-label", headers[i]);

      });

    });

  });

}



// ─── USER DATA ────────────────────────────────────────────────────────────────



function loadUserData() {

  const raw = sessionStorage.getItem("user");

  if (!raw) return;



  const user = JSON.parse(raw);

  const fullName = `${user.firstName} ${user.lastName}`.trim();



  const welcomeEl = document.querySelector(

    "#section-dashboard .page-header h1",

  );

  if (welcomeEl) welcomeEl.textContent = `Welcome back, ${user.firstName}!`;



  const sidebarName = document.querySelector(".sidebar-user-name");

  if (sidebarName) sidebarName.textContent = fullName || "Pet Owner";



  const sidebarRole = document.querySelector(".sidebar-user-role");

  if (sidebarRole) sidebarRole.textContent = "Pet Owner";



  const sInitials = document.getElementById("sidebarAvatarInitials");

  if (sInitials) sInitials.textContent = _getInitials(fullName);



  const el = (id) => document.getElementById(id);

  if (el("profileLastName")) el("profileLastName").value = user.lastName || "";

  if (el("profileFirstName"))

    el("profileFirstName").value = user.firstName || "";

  if (el("profileMiddleName"))

    el("profileMiddleName").value = user.middleName || "";

  if (el("profileEmail")) el("profileEmail").value = user.email || "";

  if (el("profilePhone")) el("profilePhone").value = user.phone || "";

  if (el("profileAddress")) el("profileAddress").value = user.address || "";



  // Restore saved profile photo

  if (user.photo) {

    _setAvatarDisplay(user.photo, true);

  }

}



// ─── INIT ─────────────────────────────────────────────────────────────────────



// ─── CUSTOM SEARCHABLE DROPDOWN ─────────────────────────────────────────────

var _cdAllPanels = [];  // global registry of all custom dropdowns

function initCustomDropdown(selectId, opts) {
  opts = opts || {};
  var select = document.getElementById(selectId);
  if (!select) return;
  var placeholder = opts.placeholder || select.options[0]?.text || 'Select...';
  var searchPlaceholder = opts.searchPlaceholder || 'Search...';
  var emptyText = opts.emptyText || 'No options found';

  var trigger = document.createElement('div');
  trigger.className = 'cd-trigger';
  trigger.tabIndex = 0;
  trigger.innerHTML = '<span class="cd-trigger-text">' + placeholder + '</span><svg class="cd-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
  select.parentNode.insertBefore(trigger, select.nextSibling);
  select.style.display = 'none';

  var panel = document.createElement('div');
  panel.className = 'cd-panel';
  panel.innerHTML = '<div class="cd-search-wrap"><input type="text" class="cd-search" placeholder="' + searchPlaceholder + '" /></div><div class="cd-options"></div>';
  trigger.parentNode.insertBefore(panel, trigger.nextSibling);

  var searchInput = panel.querySelector('.cd-search');
  var optionsWrap = panel.querySelector('.cd-options');
  var isOpen = false;

  function renderOptions(filter) {
    optionsWrap.innerHTML = '';
    var filterLower = (filter || '').toLowerCase();
    var groups = [];
    var currentGroup = { label: '', options: [] };

    Array.from(select.options).forEach(function(opt) {
      if (opt.parentElement.tagName === 'OPTGROUP') {
        if (opt.parentElement !== (currentGroup._optgroup || null)) {
          if (currentGroup.options.length) groups.push(currentGroup);
          currentGroup = { label: opt.parentElement.label, options: [], _optgroup: opt.parentElement };
        }
      } else {
        if (currentGroup.options.length || currentGroup.label) {
          groups.push(currentGroup);
          currentGroup = { label: '', options: [] };
        }
      }
      if (opt.value && opt.text.toLowerCase().indexOf(filterLower) !== -1) {
        currentGroup.options.push(opt);
      }
    });
    if (currentGroup.options.length || (!currentGroup.label && groups.length === 0)) groups.push(currentGroup);

    groups.forEach(function(grp) {
      if (grp.options.length === 0) return;
      if (grp.label) {
        var gh = document.createElement('div');
        gh.className = 'cd-group-label';
        gh.textContent = grp.label;
        optionsWrap.appendChild(gh);
      }
      grp.options.forEach(function(opt) {
        var item = document.createElement('div');
        item.className = 'cd-option';
        item.textContent = opt.text;
        item.dataset.value = opt.value;
        if (opt.value === select.value) item.classList.add('selected');
        item.addEventListener('click', function() {
          select.value = opt.value;
          trigger.querySelector('.cd-trigger-text').textContent = opt.text;
          closePanel();
          select.dispatchEvent(new Event('change'));
        });
        optionsWrap.appendChild(item);
      });
    });

    if (optionsWrap.children.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'cd-option cd-empty';
      empty.textContent = emptyText;
      optionsWrap.appendChild(empty);
    }
  }

  function syncDisplay() {
    var selOpt = select.options[select.selectedIndex];
    if (selOpt && selOpt.value) {
      trigger.querySelector('.cd-trigger-text').textContent = selOpt.text;
    } else {
      trigger.querySelector('.cd-trigger-text').textContent = placeholder;
    }
  }

  function openPanel() {
    _cdAllPanels.forEach(function(other) {
      if (other.panel !== panel && other.isOpen()) other.close();
    });
    isOpen = true;
    panel.classList.add('open');
    trigger.classList.add('active');
    renderOptions('');
    searchInput.value = '';
    setTimeout(function() { searchInput.focus(); }, 50);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('open');
    trigger.classList.remove('active');
  }

  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    isOpen ? closePanel() : openPanel();
  });
  trigger.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isOpen ? closePanel() : openPanel(); }
    if (e.key === 'Escape') closePanel();
  });
  searchInput.addEventListener('input', function() { renderOptions(searchInput.value); });
  searchInput.addEventListener('keydown', function(e) { if (e.key === 'Escape') { closePanel(); trigger.focus(); } });
  document.addEventListener('click', function(e) {
    if (!trigger.contains(e.target) && !panel.contains(e.target)) closePanel();
  });

  syncDisplay();
  var observer = new MutationObserver(function() { syncDisplay(); });
  observer.observe(select, { childList: true });
  select._cdRefresh = syncDisplay;
}

document.addEventListener("DOMContentLoaded", () => {

  // ── Virtual keyboard scroll-into-view for mobile inputs ──
  // When the virtual keyboard opens on iOS/Android, ensure the focused
  // input scrolls into view without being hidden behind sticky headers.
  document.querySelectorAll('.form-input, .form-select, .form-textarea, .search-input').forEach(function(el) {
    el.addEventListener('focus', function() {
      var self = this;
      setTimeout(function() {
        self.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300); // wait for keyboard animation
    });
  });

  loadUserData();

  initLogout();

  loadPets();

  loadUserAppointments();

  showSection("dashboard");

  autoLabelTables();  // Initialize custom searchable dropdown for service select

  initCustomDropdown('bookServiceSelect', { searchPlaceholder: 'Search services...', emptyText: 'No services found' });
  initCustomDropdown('bookPetSelect', { placeholder: 'Choose a pet', searchPlaceholder: 'Search pets...', emptyText: 'No pets found' });
  initCustomDropdown('bookTimeSelect', { placeholder: 'Select time', searchPlaceholder: 'Search time...', emptyText: 'No slots available' });

  // ── Initialize 'Other' conditional text inputs ──
  _initOtherInputs();

  // ── Profile field input restrictions ──────────────────────────────────────

  // Block digits from name fields

  ["profileLastName", "profileFirstName", "profileMiddleName"].forEach(

    function (id) {

      const el = document.getElementById(id);

      if (!el) return;

      el.addEventListener("keydown", function (e) {

        if (e.key >= "0" && e.key <= "9") e.preventDefault();

      });

      el.addEventListener("input", function () {

        const pos = el.selectionStart;

        const cleaned = el.value.replace(/[0-9]/g, "");

        if (cleaned !== el.value) {

          el.value = cleaned;

          el.setSelectionRange(pos - 1, pos - 1);

        }

      });

    },

  );



  // Block non-digits from phone field

  const profilePhone = document.getElementById("profilePhone");

  if (profilePhone) {

    profilePhone.addEventListener("keydown", function (e) {

      const allowed = [

        "Backspace",

        "Delete",

        "ArrowLeft",

        "ArrowRight",

        "Tab",

        "Home",

        "End",

      ];

      if (allowed.includes(e.key)) return;

      if (e.key < "0" || e.key > "9") e.preventDefault();

    });

    profilePhone.addEventListener("input", function () {

      const cleaned = profilePhone.value.replace(/[^0-9]/g, "").slice(0, 11);

      if (cleaned !== profilePhone.value) profilePhone.value = cleaned;

    });

  }

});



// ============================================================

// VHS ASSISTANT CHATBOT (ported from web-page)

// ============================================================

const chatbotBubble = document.getElementById("chatbotBubble");

const chatbotWindow = document.getElementById("chatbotWindow");

const chatbotClose = document.getElementById("chatbotClose");

const chatbotInput = document.getElementById("chatbotInput");

const chatbotSend = document.getElementById("chatbotSend");

const chatbotMessages = document.getElementById("chatbotMessages");



function toggleChatbot() {

  if (chatbotBubble) chatbotBubble.classList.toggle("active");

  if (chatbotWindow) chatbotWindow.classList.toggle("active");

  if (chatbotWindow && chatbotWindow.classList.contains("active") && chatbotInput) {

    setTimeout(() => chatbotInput.focus(), 400);

  }

}



if (chatbotBubble) chatbotBubble.addEventListener("click", toggleChatbot);

if (chatbotClose) chatbotClose.addEventListener("click", toggleChatbot);



// Simple canned assistant — answers common clinic questions

function getAssistantReply(text) {

  const q = text.toLowerCase();

  if (/(hours|open|time|schedule|closing)/.test(q)) {

    return "Our clinic hours are:\n• Monday – Saturday: 8:00 AM – 6:00 PM\n• Sunday: 9:00 AM – 4:00 PM\n• Holidays: by appointment\nWe also offer 24/7 emergency care.";

  }

  if (/(book|appointment|schedule|reserve)/.test(q)) {

    return "You can book an appointment from the \"My Appointments\" section in the sidebar — just click \"+ Book Appointment\", pick your pet, service, and preferred date & time.";

  }

  if (/(service|vaccinat|groom|check|consult|surgery|spay|deworm|test)/.test(q)) {

    return "We offer 26 services across 5 categories: Preventive & Wellness (consultation, vaccination, deworming, feline preventive care, health certificate, microchipping), Diagnostics (blood test, fecalysis, microscopy, urinalysis), Surgery & Procedures (spay, castration, C-section, cystotomy, cherry eye correction, wound repair, dental prophylaxis, catheterization, euthanasia, whelping assistance), Pet Care (dog grooming, cat grooming, boarding, confinement), and Specialized Care (chemotherapy, home service). Check the \"Services\" section for prices!";

  }

  if (/(location|address|where|find|map)/.test(q)) {

    return "We're located at 834 Aurora Boulevard cor Driod Street, Kaunlaran, Cubao, Quezon City, Philippines 1111. You can see a map in the \"Clinic Info\" section.";

  }

  if (/(contact|phone|email|call|reach)/.test(q)) {

    return "You can reach us at:\n• Phone: 0917 108 4174\n• Email: vhs.animalwellness@gmail.com\nWe respond as quickly as we can during clinic hours.";

  }

  if (/(pet|register|add)/.test(q)) {

    return "To add a new pet, go to the \"My Pets\" section and click \"+ Add Pet\" — you can upload a photo and record their breed, age, and medical notes.";

  }

  if (/(price|cost|fee|payment|how much)/.test(q)) {

    return "Prices depend on the service and your pet's size. For an accurate quote, please call 0917 108 4174 or visit us — our staff will be happy to help!";

  }

  if (/(emergency|urgent)/.test(q)) {

    return "We provide 24/7 emergency care! If it's urgent, please call us right away at 0917 108 4174 so we can prepare for your arrival.";

  }

  if (/(thank|thanks|ok|great)/.test(q)) {

    return "You're very welcome! Is there anything else I can help you with? 😊";

  }

  if (/(hi|hello|hey|good)/.test(q)) {

    return "Hello! 👋 I'm the VHS Assistant. Ask me about our hours, services, booking, location, or anything else about the clinic!";

  }

  return "I'm not sure about that yet, but our team would love to help! Call us at 0917 108 4174 or visit the Clinic Info section for more details.";

}



function addMessage(text, sender) {

  const messageDiv = document.createElement("div");

  messageDiv.className = "chatbot-message " + sender + "-message";



  const avatar = document.createElement("div");

  avatar.className = "message-avatar";

  avatar.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>';



  const content = document.createElement("div");

  content.className = "message-content";

  content.innerHTML = "<p>" + text.replace(/\n/g, "<br>") + "</p>";



  messageDiv.appendChild(avatar);

  messageDiv.appendChild(content);

  chatbotMessages.appendChild(messageDiv);

  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;

}



function addTypingIndicator() {

  const typingDiv = document.createElement("div");

  typingDiv.className = "chatbot-message bot-message typing-indicator-message";

  typingDiv.innerHTML = '<div class="message-avatar"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg></div><div class="message-content typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';

  chatbotMessages.appendChild(typingDiv);

  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;

}



function removeTypingIndicator() {

  const t = chatbotMessages.querySelector(".typing-indicator-message");

  if (t) t.remove();

}



function sendMessage() {

  const message = chatbotInput.value.trim();

  if (!message) return;

  addMessage(message, "user");

  chatbotInput.value = "";

  setTimeout(() => {

    addTypingIndicator();

    setTimeout(() => {

      removeTypingIndicator();

      addMessage(getAssistantReply(message), "bot");

    }, 1000);

  }, 400);

}



if (chatbotSend) chatbotSend.addEventListener("click", sendMessage);

if (chatbotInput) {

  chatbotInput.addEventListener("keypress", (e) => {

    if (e.key === "Enter") sendMessage();

  });

}



// ============================================================

// ANNOUNCEMENT CAROUSEL — auto-swipe (3s interval)

// ============================================================

(function initAnnouncementCarousel() {

  const track = document.getElementById("announcementTrack");

  const slides = track ? track.querySelectorAll(".announcement-slide") : [];

  const dots = document.querySelectorAll(".announcement-dots .dot");

  if (!track || !slides.length) return;



  const SWIPE_INTERVAL = 3000; // 3 seconds per announcement

  let current = 0;

  let timer = null;



  function showSlide(index) {

    current = (index + slides.length) % slides.length;

    track.style.transform = "translateX(-" + current * 100 + "%)";

    dots.forEach((d, i) => d.classList.toggle("active", i === current));

    restartTimer();

  }



  function nextSlide() {

    showSlide(current + 1);

  }



  function restartTimer() {

    if (timer) clearInterval(timer);

    timer = setInterval(nextSlide, SWIPE_INTERVAL);

  }



  dots.forEach((dot) => {

    dot.addEventListener("click", () => showSlide(parseInt(dot.dataset.slide, 10)));

  });



  // Pause rotation while hovering the carousel

  const carousel = document.querySelector(".dashboard-announcements");

  if (carousel) {

    carousel.addEventListener("mouseenter", () => {

      if (timer) clearInterval(timer);

    });

    carousel.addEventListener("mouseleave", restartTimer);

  }



  restartTimer();

})();

