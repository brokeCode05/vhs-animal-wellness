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

  var user = _getSessionUser();

  var userId = user.id || user.userId;

  if (!userId) return;



  fetch("get_user_appointments.php?user_id=" + userId)

    .then(function (r) {

      return r.json();

    })

    .then(function (data) {

      if (data.status !== "success") return;

      var appts = data.appointments;



      // Update stat counter on dashboard

      var upcoming = appts.filter(function (a) {

        return a.status === "pending" || a.status === "scheduled";

      });

      var statEl = document.getElementById("statUpcoming");

      if (statEl) statEl.textContent = upcoming.length;



      var badge = document.getElementById("apptBadge");

      if (badge) {

        badge.textContent = upcoming.length;

        badge.style.display = upcoming.length > 0 ? "" : "none";

      }



      // Render dashboard upcoming table (pending/scheduled only)

      renderApptRows("dashApptBody", upcoming, 5 /* cols */);



      // Render full My Appointments table

      renderApptRows("apptTableBody", appts, 7 /* cols */);

    })

    .catch(function (err) {

      console.error("loadUserAppointments error:", err);

    });

}



function _apptStatusBadge(status) {

  var map = {

    pending: "info",

    scheduled: "info",

    completed: "completed",

    canceled: "rejected",

    cancelled: "rejected",

  };

  var cls = map[status] || "info";

  // Show "Scheduled" for both pending and scheduled since booking is now auto-confirmed

  var label =

    status === "pending" ? "Scheduled"

    : status ? status.charAt(0).toUpperCase() + status.slice(1)

    : "—";

  return '<span class="status-badge ' + cls + '">' + label + "</span>";

}



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

});



function viewAppt(id) {

  showUnderWork("Appointment detail view");

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

function showMedicalHistory(petId) {
  var titleEl = document.getElementById('medHistModalTitle');
  var subtitleEl = document.getElementById('medHistModalSubtitle');
  var pet = _currentPets.find(function (p) { return p.id === petId; });
  if (!pet) pet = mockPetsData.find(function (p) { return p.id === petId; });
  if (titleEl) titleEl.textContent = 'Medical History';
  if (subtitleEl) subtitleEl.textContent = pet ? pet.name + ' — ' + (pet.type || pet.species || '') + ', ' + (pet.breed || '') : '';
  renderPetHistory(petId);
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

}



function openEditPetModal(id) {

  document.getElementById("petModalTitle").textContent = "Edit Pet";

  document.getElementById("petForm")?.reset();



  // Reset photo preview

  var preview = document.getElementById("petPhotoPreview");

  if (preview)

    preview.innerHTML =

      '<span class="upload-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span><span>Click to change photo</span>';



  // Set user ID

  var user = _getSessionUser();

  var hiddenId = document.getElementById("petUserId");

  if (hiddenId) hiddenId.value = user.id || user.userId || "";



  // Store pet ID on form for update

  var form = document.getElementById("petForm");

  if (form) form.dataset.editId = id;



  // Fetch pet data and populate form

  fetch("get_pets_user.php?user_id=" + (user.id || user.userId || 0))

    .then(function (r) {

      return r.json();

    })

    .then(function (pets) {

      var p = pets.find(function (x) {

        return x.id === id;

      });

      if (!p) {

        showToast("Pet not found.", "error");

        return;

      }



      document.getElementById("petName").value = p.name || "";

      document.getElementById("petSpecies").value = p.type || "";

      document.getElementById("petBreed").value = p.breed || "";

      document.getElementById("petAge").value = p.age || "";

      document.getElementById("petGender").value = p.gender || "";

      document.getElementById("petWeight").value = p.weight || "";

      document.getElementById("petNotes").value = p.notes || "";



      // Show existing photo if any

      if (p.photo && preview) {

        preview.innerHTML =

          '<img src="' +

          p.photo +

          '" alt="Pet photo" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">';

      }



      openModal("petModal");

    })

    .catch(function () {

      showToast("Failed to load pet data.", "error");

    });

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

function renderPetHistory(petId) {
  const container = document.getElementById('medHistoryTimeline');
  if (!container) return;

  if (!petId) {
    container.innerHTML = '<p class="med-hist-empty">No pet selected.</p>';
    return;
  }

  var pet = _currentPets.find(function (p) { return p.id === petId; });
  if (!pet) pet = mockPetsData.find(function (p) { return p.id === petId; });
  if (!pet) {
    container.innerHTML = '<p class="med-hist-empty">Pet record not found.</p>';
    return;
  }

  // Sort visits newest-first
  var visits = (pet.visits || []).slice().sort(function (a, b) {
    return new Date(b.date) - new Date(a.date);
  });

  if (!visits.length) {
    container.innerHTML = '<p class="med-hist-empty">No visit history found for ' + pet.name + '.</p>';
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



// ─── LOAD PETS FROM DB ────────────────────────────────────────────────────────


function _renderPetCards(pets, grid, dashGrid, petCount) {
  _currentPets = pets;
  // Update stat counters
  if (petCount) petCount.textContent = pets.length;
  var statPets = document.getElementById('statPets');
  if (statPets) statPets.textContent = pets.length;

  // ── Dashboard quick view (compact cards) ──
  if (dashGrid) {
    dashGrid.innerHTML = pets.length
      ? pets.map(function (p) {
          var subtitle = [p.breed, p.type, p.age ? p.age + ' yrs' : '', p.gender].filter(Boolean).join(' · ');
          return (
            '<div class="pet-card" style="cursor:pointer" onclick="showSection(\'pets\')">'
            + '<div class="pet-avatar">' + petEmoji(p.type) + '</div>'
            + '<div class="pet-info" style="flex:1"><h3>' + p.name + '</h3><p>' + subtitle + '</p></div>'
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
    var subtitle = [p.breed, p.type, p.gender].filter(Boolean).join(' · ');
    var photo = p.photo
      ? '<img src="' + p.photo + '" alt="' + p.name + '" style="width:100%;height:100%;object-fit:cover;border-radius:0.75rem;">'
      : petEmoji(p.type);
    return (
      '<div class="pet-full-card content-section">'
      + '<div class="pet-full-header">'
      + '<div class="pet-big-avatar">' + photo + '</div>'
      + '<div style="flex:1">'
      + '<h3 style="font-size:1.3rem;font-weight:700;color:var(--text-dark);margin:0 0 0.2rem">' + p.name + '</h3>'
      + '<p style="font-size:0.85rem;color:var(--text-dim);margin:0">' + (subtitle || '—') + '</p>'
      + '</div>'
      + '<button class="btn-small" onclick="openEditPetModal(' + p.id + ')">Edit</button>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem">'
      + '<div class="pet-stat-box"><div class="pet-stat-label">AGE</div><div class="pet-stat-val">' + (p.age ? p.age + ' years' : '—') + '</div></div>'
      + '<div class="pet-stat-box"><div class="pet-stat-label">WEIGHT</div><div class="pet-stat-val">' + (p.weight ? p.weight + ' kg' : '—') + '</div></div>'
      + '<div class="pet-stat-box"><div class="pet-stat-label">COLOR</div><div class="pet-stat-val">' + (p.color || '—') + '</div></div>'
      + '<div class="pet-stat-box"><div class="pet-stat-label">MICROCHIP</div><div class="pet-stat-val">' + (p.microchip || '—') + '</div></div>'
      + '</div>'
      + (p.notes ? '<div class="pet-notes-box"><div class="pet-stat-label" style="margin-bottom:0.35rem">MEDICAL NOTES</div><p style="font-size:0.85rem;color:var(--text-dim);margin:0;line-height:1.6">' + p.notes + '</p></div>' : '')
      + '<div style="border-top:1px solid var(--border);margin-top:1rem;padding-top:0.85rem">'
      + '<button class="btn-link" style="font-size:0.85rem;color:var(--primary);background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;gap:0.4rem" onclick="showMedicalHistory(' + p.id + ')">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
      + ' Medical History'
      + '</button>'
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

  loadUserData();

  initLogout();

  loadPets();

  loadUserAppointments();

  showSection("dashboard");

  autoLabelTables();  // Initialize custom searchable dropdown for service select

  initCustomDropdown('bookServiceSelect', { searchPlaceholder: 'Search services...', emptyText: 'No services found' });
  initCustomDropdown('bookPetSelect', { placeholder: 'Choose a pet', searchPlaceholder: 'Search pets...', emptyText: 'No pets found' });
  initCustomDropdown('bookTimeSelect', { placeholder: 'Select time', searchPlaceholder: 'Search time...', emptyText: 'No slots available' });



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

