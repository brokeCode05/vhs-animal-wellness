/* ============================================
   VHS ADMIN DASHBOARD — Self-contained script
   No external API dependency.
============================================ */

// ─── MOBILE SIDEBAR ───────────────────────────────────────────────────────────

let _overlay = null;

function getSidebarOverlay() {
  if (!_overlay) {
    _overlay = document.createElement("div");
    _overlay.className = "sidebar-overlay";
    document.body.appendChild(_overlay);
    _overlay.addEventListener("click", closeMobileSidebar);
  }
  return _overlay;
}

function openMobileSidebar() {
  document.querySelector(".sidebar")?.classList.add("open");
  getSidebarOverlay().classList.add("show");
  document.querySelector(".hamburger-menu")?.classList.add("active");
}

function closeMobileSidebar() {
  document.querySelector(".sidebar")?.classList.remove("open");
  getSidebarOverlay().classList.remove("show");
  document.querySelector(".hamburger-menu")?.classList.remove("active");
}

function toggleSidebar() {
  document.querySelector(".sidebar")?.classList.contains("open") ?
    closeMobileSidebar()
  : openMobileSidebar();
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

function initLogout() {
  document.getElementById("logoutBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    confirmAction(
      "Are you sure you want to logout?",
      () => {
        sessionStorage.clear();
        const loader = document.createElement("div");
        loader.className = "page-loader";
        loader.innerHTML =
          '<div class="loader-content"><div class="loader-spinner"></div><div class="loader-text">Logging out...</div></div>';
        document.body.appendChild(loader);
        setTimeout(() => {
          window.location.href = "../web-page/index.html";
        }, 1000);
      },
      { title: "Logout", icon: "👋" },
    );
  });
}

// ─── ROW REMOVAL ─────────────────────────────────────────────────────────────

function removeRow(id) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  if (row) {
    row.style.transition = "opacity 0.3s";
    row.style.opacity = "0";
    setTimeout(() => row.remove(), 300);
  }
}

function updateBadge(selector, delta) {
  const badge = document.querySelector(selector);
  if (!badge) return;
  const n = Math.max(0, (parseInt(badge.textContent) || 0) + delta);
  badge.textContent = n;
  badge.style.display = n === 0 ? "none" : "";
}

// ─── ACCOUNT ACTIONS ─────────────────────────────────────────────────────────

function activateClient(id) {
  confirmAction(
    "Activate this client account?",
    () => showToast("Account activated.", "success"),
    { title: "Activate Account", icon: "✅", accent: "success" },
  );
}
function deactivateClient(id) {
  confirmAction(
    "Deactivate this client account?",
    () => showToast("Account deactivated.", "warning"),
    { title: "Deactivate Account", icon: "⚠️", danger: true },
  );
}
function viewClient(id) {
  showUnderWork("Client profile view");
}
function editClient(id) {
  showUnderWork("Edit client");
}
function viewStaff(id) {
  showUnderWork("Staff profile view");
}
function editStaff(id) {
  showUnderWork("Edit staff");
}
function deactivateStaff(id) {
  confirmAction(
    "Deactivate this staff account?",
    () => showToast("Staff account deactivated.", "warning"),
    { title: "Deactivate Staff", icon: "⚠️", danger: true },
  );
}

function openCreateStaffModal() {
  document.getElementById("createStaffModal")?.classList.add("show");
}
function closeCreateStaffModal() {
  document.getElementById("createStaffModal")?.classList.remove("show");
  document.getElementById("createStaffForm")?.reset();
}

function submitStaffAccount(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (fd.get("staffPassword") !== fd.get("staffConfirmPassword")) {
    showToast("Passwords do not match!", "error");
    return;
  }
  const fullName = [
    fd.get("staffLastName"),
    fd.get("staffFirstName"),
    fd.get("staffMiddleName"),
  ]
    .filter(Boolean)
    .join(", ");

  fetch("../php_files/create_staff.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lastName: fd.get("staffLastName"),
      firstName: fd.get("staffFirstName"),
      middleName: fd.get("staffMiddleName"),
      email: fd.get("staffEmail"),
      phone: fd.get("staffPhone"),
      role: fd.get("staffRole"),
      password: fd.get("staffPassword"),
    }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (data.status === "success") {
        showToast("Staff account created successfully!", "success");
        closeCreateStaffModal();
        // Reload the page to reflect new staff in tables
        setTimeout(function() { window.location.reload(); }, 800);
      } else {
        showToast(
          "Error: " + (data.message || "Failed to create account"),
          "error",
        );
      }
    })
    .catch(function () {
      showToast("Server error.", "error");
    });
}

// ─── APPOINTMENT DATA LOADING ─────────────────────────────────────────────────

/**
 * Fetch all appointments from the backend and populate:
 *  - Pending section table
 *  - All Appointments table
 *  - Calendar dots
 *  - Sidebar badge
 */
function loadAppointments() {
  fetch("/_backend/get_appointments.php")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.status !== "success") {
        showToast("Failed to load appointments.", "error");
        return;
      }

      var all     = data.appointments;

      // Populate all-appointments table
      renderAllAppointmentsTable(all);

      // Feed calendar
      CalendarState.appointments = all.map(function (a) {
        return {
          date:    a.date,
          owner:   a.owner_name,
          pet:     a.pet_name,
          service: a.service,
          status:  a.status,
          type:    a.status   // used for CSS class on calendar dot
        };
      });
      generateCalendar();
    })
    .catch(function (err) {
      console.error("loadAppointments error:", err);
    });
}

function formatDateTime(date, time) {
  if (!date) return "—";
  // Parse date parts directly to avoid UTC timezone shift
  var parts = date.split("-");
  var year  = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10) - 1;
  var day   = parseInt(parts[2], 10);
  var d     = new Date(year, month, day);
  var dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (!time) return dateStr;

  // Time may already be formatted (e.g. "3:00 PM") or be HH:MM:SS
  var timeStr = time;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(time)) {
    // Convert 24h HH:MM or HH:MM:SS to 12h
    var timeParts = time.split(":");
    var hours   = parseInt(timeParts[0], 10);
    var minutes = parseInt(timeParts[1], 10);
    var ampm    = hours >= 12 ? "PM" : "AM";
    var h12     = hours % 12 || 12;
    timeStr = h12 + ":" + String(minutes).padStart(2, "0") + " " + ampm;
  }
  return dateStr + "<br><small>" + timeStr + "</small>";
}

function statusBadge(status) {
  var map = {
    pending:   "warning",
    scheduled: "info",
    completed: "completed",
    canceled:  "rejected"
  };
  var cls = map[status] || "info";
  return '<span class="status-badge ' + cls + '">' + capitalize(status) + '</span>';
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

function renderAllAppointmentsTable(all) {
  var tbody = document.getElementById("allAppointmentsTable");
  if (!tbody) return;

  if (!all.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;">No appointments yet.</td></tr>';
    return;
  }

  tbody.innerHTML = all.map(function (a) {
    var actions = "";
    if (a.status === "pending") {
      actions =
        '<button class="btn-small btn-success" onclick="approveAppointment(' + a.id + ')">Approve</button> ' +
        '<button class="btn-small btn-danger"  onclick="rejectAppointment(' + a.id + ')">Reject</button>';
    } else if (a.status === "scheduled") {
      actions =
        '<button class="btn-small btn-success" onclick="markComplete(' + a.id + ')">Complete</button> ' +
        '<button class="btn-small btn-danger"  onclick="cancelAppointment(' + a.id + ')">Cancel</button>';
    } else {
      actions = '<button class="btn-small" onclick="viewAppointment(' + a.id + ')">View</button>';
    }

    return (
      '<tr data-id="' + a.id + '" data-status="' + a.status + '">' +
      "<td>#A" + String(a.id).padStart(3, "0") + "</td>" +
      "<td>" + formatDateTime(a.date, a.time) + "</td>" +
      "<td>" + (a.owner_name || "—") + "</td>" +
      "<td>" + (a.pet_name || "—") + "</td>" +
      "<td>" + (a.service || "—") + "</td>" +
      "<td><span class='status-badge info'>Registered</span></td>" +
      "<td>" + statusBadge(a.status) + "</td>" +
      "<td class='action-cell'>" + actions + "</td>" +
      "</tr>"
    );
  }).join("");

  // Don't auto-filter after a reload — show all rows fresh
  // User can still use the filter controls manually
}

function applyAllAppointmentsFilter() {
  var statusVal = (document.getElementById("filterStatus")?.value || "all").toLowerCase();
  var dateVal   = document.getElementById("filterDate")?.value || "";
  var searchVal = (document.getElementById("searchAppointments")?.value || "").toLowerCase();

  document.querySelectorAll("#allAppointmentsTable tr[data-id]").forEach(function (row) {
    var rowStatus = (row.getAttribute("data-status") || "").toLowerCase();
    var rowText   = row.textContent.toLowerCase();

    var statusOk = statusVal === "all" || rowStatus === statusVal;
    var dateOk   = !dateVal  || row.textContent.includes(
      new Date(dateVal).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    );
    var searchOk = !searchVal || rowText.includes(searchVal);

    row.style.display = (statusOk && dateOk && searchOk) ? "" : "none";
  });
}

// ─── APPOINTMENT ACTIONS ──────────────────────────────────────────────────────

function _updateAppointmentStatus(id, newStatus, successMsg, onSuccess) {
  fetch("../php_files/update_appointment_status.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: id, status: newStatus }),
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.status === "success") {
        showToast(successMsg, newStatus === "canceled" ? "warning" : "success");
        if (onSuccess) onSuccess();
        loadAppointments(); // refresh all tables
      } else {
        showToast("Error: " + (data.message || "Update failed"), "error");
      }
    })
    .catch(function () {
      showToast("Network error.", "error");
    });
}

function approveAppointment(id) {
  confirmAction(
    "Approve this appointment?",
    function () {
      _updateAppointmentStatus(id, "scheduled", "Appointment approved!", function () {
        updateBadge('.nav-item[href="appointments.html"] .badge-count', -1);
      });
    },
    { title: "Approve Appointment", icon: "📅", accent: "success" },
  );
}

function rejectAppointment(id) {
  showPrompt(
    "Reason for rejection (optional):",
    "",
    function (reason) {
      if (reason === null) return;
      _updateAppointmentStatus(id, "canceled", "Appointment rejected.", function () {
        updateBadge('.nav-item[href="appointments.html"] .badge-count', -1);
      });
    },
    {
      title: "Reject Appointment",
      icon: "❌",
      accent: "error",
      placeholder: "Enter reason (optional)...",
    },
  );
}

function markComplete(id) {
  confirmAction(
    "Mark this appointment as completed?",
    function () {
      _updateAppointmentStatus(id, "completed", "Marked as completed!");
    },
    { title: "Mark Complete", icon: "✅", accent: "success" },
  );
}

function cancelAppointment(id) {
  confirmAction(
    "Cancel this appointment?",
    function () {
      _updateAppointmentStatus(id, "canceled", "Appointment cancelled.");
    },
    { title: "Cancel Appointment", icon: "⚠️", danger: true },
  );
}

function viewAppointment(id) {
  showUnderWork("Appointment detail view");
}
function editAppointment(id) {
  showUnderWork("Edit appointment");
}
function reschedule(id) {
  showUnderWork("Reschedule appointment");
}
function addNewAppointment() {
  showUnderWork("Add new appointment");
}

// ─── PET & OWNER ACTIONS ─────────────────────────────────────────────────────

function viewOwnerProfile(id) {
  var modal = document.getElementById("ownerProfileModal");
  if (!modal) return;

  // Reset to loading state
  [
    "ownerName",
    "ownerEmail",
    "ownerPhone",
    "ownerDob",
    "ownerAddress",
    "ownerRegDate",
    "ownerVisits",
  ].forEach(function (elId) {
    var el = document.getElementById(elId);
    if (el) el.textContent = "Loading...";
  });
  var petsBody = document.getElementById("ownerPetsTable");
  if (petsBody)
    petsBody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:#888;">Loading...</td></tr>';
  var apptBody = document.getElementById("ownerAppointmentsTable");
  if (apptBody)
    apptBody.innerHTML =
      '<tr><td colspan="4" style="text-align:center;color:#888;">No appointments yet.</td></tr>';

  modal.classList.add("show");

  fetch("../php_files/get_user_profile.php?id=" + id)
    .then(function (r) {
      return r.json();
    })
    .then(function (u) {
      function set(elId, val) {
        var el = document.getElementById(elId);
        if (el) el.textContent = val || "—";
      }
      set("ownerName", u.fullName);
      set("ownerEmail", u.email);
      set("ownerPhone", u.phone);
      set("ownerDob", u.bday);
      set("ownerAddress", u.address);
      set(
        "ownerRegDate",
        u.created_at ?
          new Date(u.created_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "—",
      );
      set("ownerVisits", "—");

      // Pets table
      if (petsBody) {
        petsBody.innerHTML =
          u.pets.length ?
            u.pets
              .map(function (p) {
                return (
                  "<tr>" +
                  "<td>" +
                  p.name +
                  "</td>" +
                  "<td>" +
                  p.type +
                  "</td>" +
                  "<td>" +
                  p.breed +
                  "</td>" +
                  "<td>" +
                  p.age +
                  "</td>" +
                  "<td>—</td>" +
                  '<td><button class="btn-small" onclick="viewPetProfile(' +
                  p.id +
                  ')">View</button></td>' +
                  "</tr>"
                );
              })
              .join("")
          : '<tr><td colspan="6" style="text-align:center;color:#888;">No pets registered.</td></tr>';
      }
    })
    .catch(function () {
      showToast("Failed to load owner profile.", "error");
      modal.classList.remove("show");
    });
}
function closeOwnerProfile() {
  document.getElementById("ownerProfileModal")?.classList.remove("show");
}
function editOwner(id) {
  showUnderWork("Edit owner");
}
function addNewOwner() {
  showUnderWork("Add new owner");
}
function viewPetProfile(id) {
  document.getElementById("petProfileModal")?.classList.add("show");
}
function closePetProfile() {
  document.getElementById("petProfileModal")?.classList.remove("show");
}
function editPet(id) {
  showUnderWork("Edit pet");
}
function addNewPet() {
  showUnderWork("Register new pet");
}
function viewHistory(id) {
  showUnderWork("Pet history");
}
function uploadDocument() {
  showUnderWork("Document upload");
}

// ─── WEBSITE CONTENT ACTIONS ─────────────────────────────────────────────────

function addAnnouncement() {
  showUnderWork("Add announcement");
}
function editAnnouncement(id) {
  showUnderWork("Edit announcement");
}
function deleteAnnouncement(id) {
  confirmAction(
    "Delete this announcement permanently?",
    () => showToast("Announcement deleted.", "success"),
    { title: "Delete Announcement", icon: "🗑️", danger: true },
  );
}
function addNewService() {
  showUnderWork("Add new service");
}
function editService(id) {
  showUnderWork("Edit service");
}
function toggleService(id) {
  confirmAction(
    "Toggle this service status?",
    () => showToast("Service status updated.", "success"),
    { title: "Toggle Service", icon: "🔄" },
  );
}

// Website forms
document.addEventListener("DOMContentLoaded", () => {
  [
    "clinicInfoForm",
    "operatingHoursForm",
    "aboutUsForm",
    "socialMediaForm",
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener("submit", (e) => {
      e.preventDefault();
      showToast("Changes saved!", "success");
    });
  });
});

// ─── SEARCH & FILTER ─────────────────────────────────────────────────────────

function setupSearch() {
  // Exclude appointment search — handled by applyAllAppointmentsFilter
  document.querySelectorAll('input[type="search"]').forEach((input) => {
    if (input.id === "searchAppointments") return;
    input.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase();
      e.target
        .closest("section")
        ?.querySelectorAll(".compact-table tbody tr")
        .forEach((row) => {
          row.style.display =
            row.textContent.toLowerCase().includes(term) ? "" : "none";
        });
    });
  });
}

function setupFilters() {
  // Exclude appointment-specific filters — those are handled by applyAllAppointmentsFilter
  const appointmentFilterIds = ["filterStatus", "filterDate", "filterType", "statusFilter"];
  document.querySelectorAll('select[id^="filter"]').forEach((select) => {
    if (appointmentFilterIds.includes(select.id)) return;
    select.addEventListener("change", (e) => {
      const val = e.target.value.toLowerCase();
      e.target
        .closest("section")
        ?.querySelectorAll(".compact-table tbody tr")
        .forEach((row) => {
          row.style.display =
            val === "all" || row.textContent.toLowerCase().includes(val) ?
              ""
            : "none";
        });
    });
  });
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(tab + "-tab")?.classList.add("active");
    });
  });
}

function setupModals() {
  document.querySelectorAll(".modal-overlay").forEach((modal) => {
    let startedInsideContent = false;

    // Track where the drag started
    modal.addEventListener("mousedown", (e) => {
      const content = modal.querySelector(".modal-content");
      startedInsideContent = content ? content.contains(e.target) : false;
    });

    // Only close if the entire click (down + up) was on the backdrop
    modal.addEventListener("click", (e) => {
      if (e.target === modal && !startedInsideContent) {
        modal.classList.remove("show");
      }
      startedInsideContent = false;
    });
  });

  document.querySelectorAll(".modal-close").forEach((btn) => {
    btn.addEventListener("click", () =>
      btn.closest(".modal-overlay")?.classList.remove("show"),
    );
  });
}

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

// ─── CALENDAR ─────────────────────────────────────────────────────────────────

const CalendarState = {
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  currentView: "month",
  appointments: [], // populated from real DB when appointment module is built
};

function _calDate(monthOffset, day) {
  const d = new Date();
  d.setMonth(d.getMonth() + monthOffset);
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(day).padStart(2, "0")
  );
}

function generateCalendar() {
  const { currentMonth, currentYear, appointments } = CalendarState;
  const grid = document.getElementById("calendarGrid");
  if (!grid) return;
  grid.innerHTML = "";

  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((d) => {
    const h = document.createElement("div");
    h.className = "calendar-day-header";
    h.textContent = d;
    grid.appendChild(h);
  });

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevLastDay = new Date(currentYear, currentMonth, 0).getDate();
  const today = new Date();

  for (let i = firstDay - 1; i >= 0; i--) {
    grid.appendChild(
      makeDayCell(prevLastDay - i, true, currentMonth - 1, currentYear, false),
    );
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday =
      d === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear();
    grid.appendChild(makeDayCell(d, false, currentMonth, currentYear, isToday));
  }
  const total = grid.children.length - 7;
  for (let d = 1; d <= 42 - total; d++) {
    grid.appendChild(
      makeDayCell(d, true, currentMonth + 1, currentYear, false),
    );
  }
}

function makeDayCell(day, isOther, month, year, isToday) {
  const el = document.createElement("div");
  el.className =
    "calendar-day" +
    (isOther ? " other-month" : "") +
    (isToday ? " today" : "");
  const num = document.createElement("span");
  num.textContent = day;
  el.appendChild(num);
  if (!isOther) {
    const dateStr =
      year +
      "-" +
      String(month + 1).padStart(2, "0") +
      "-" +
      String(day).padStart(2, "0");
    CalendarState.appointments
      .filter((a) => a.date === dateStr)
      .forEach((apt) => {
        const item = document.createElement("div");
        // Color by status
        item.className = "appointment-item status-" + (apt.status || "pending");
        item.innerHTML =
          '<span class="appointment-dot"></span>' +
          '<span class="appointment-badge">' +
            '<strong>' + apt.owner + '</strong> · ' + apt.pet +
            '<em>' + apt.service + '</em>' +
          '</span>';
        item.onclick = () =>
          showToast(apt.owner + " · " + apt.pet + " · " + apt.service + " [" + apt.status + "]", "info");
        el.appendChild(item);
      });
  }
  return el;
}

function updateCalendarDisplay() {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const el = document.getElementById("calendarMonth");
  if (el)
    el.textContent =
      months[CalendarState.currentMonth] + " " + CalendarState.currentYear;
  generateCalendar();
}

function previousMonth() {
  if (--CalendarState.currentMonth < 0) {
    CalendarState.currentMonth = 11;
    CalendarState.currentYear--;
  }
  updateCalendarDisplay();
}
function nextMonth() {
  if (++CalendarState.currentMonth > 11) {
    CalendarState.currentMonth = 0;
    CalendarState.currentYear++;
  }
  updateCalendarDisplay();
}
function goToToday() {
  const t = new Date();
  CalendarState.currentMonth = t.getMonth();
  CalendarState.currentYear = t.getFullYear();
  updateCalendarDisplay();
  showToast("Showing current month", "info");
}
function setCalendarView(view) {
  CalendarState.currentView = view;
  document
    .querySelectorAll(".calendar-view-toggle .btn-small")
    .forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === view);
    });
}
function filterAppointments() {
  applyAllAppointmentsFilter();
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initLogout();
  setupSearch();
  setupFilters();
  setupTabs();
  setupModals();
  autoLabelTables();

  document
    .getElementById("hamburgerMenu")
    ?.addEventListener("click", toggleSidebar);
  document.querySelectorAll(".sidebar .nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      if (window.innerWidth <= 768) closeMobileSidebar();
    });
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) closeMobileSidebar();
  });

  if (document.getElementById("calendarGrid")) updateCalendarDisplay();

// ─── DYNAMIC DATA LOADING ─────────────────────────────────────────────────────

function loadAppointments() {
  const table = document.getElementById("allAppointmentsTable");
  if (!table) return;

  fetch('../php_files/get_appointments.php')
    .then(function(response) { 
      return response.json(); 
    })
    .then(function(data) {
      if (data.status !== "success") {
        console.error("Data status not success");
        return;
      }
      
      table.innerHTML = ''; 
      
      data.appointments.forEach(function(appt) {
        table.innerHTML += `
          <tr>
            <td>#A${String(appt.id).padStart(3, '0')}</td>
            <td>${appt.date}</td>
            <td>${appt.owner_name || '—'}</td>
            <td>${appt.pet_name || '—'}</td>
            <td>${appt.service}</td>
            <td>${appt.status}</td>
          </tr>`;
      });
    })
    .catch(function(error) {
      console.error("Error loading appointments:", error);
      table.innerHTML = '<tr><td colspan="6" style="text-align:center;">Error loading data.</td></tr>';
    });
}

// Ensure the page and the dashboard are ready before running
document.addEventListener("DOMContentLoaded", () => {
  initLogout();
  setupSearch();
  setupFilters();
  setupTabs();
  setupModals();
  autoLabelTables();

  // Load appointments if we are on the dashboard
  if (document.getElementById("allAppointmentsTable")) {
    loadAppointments();
  }
});
