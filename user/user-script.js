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

// ─── TOAST & CONFIRM ─────────────────────────────────────────────────────────
// Provided by shared/vhs-ui.js: showToast(), confirmAction(), showAlert(), showUnderWork()

// Legacy alias so existing calls to showConfirm() still work
function showConfirm(message, icon, title, onConfirm) {
  confirmAction(message, onConfirm, {
    title: title || "Confirm Action",
    icon: icon || "⚠️",
  });
}

// ─── MODAL HELPERS ────────────────────────────────────────────────────────────

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add("show");
  const today = new Date().toISOString().split("T")[0];
  modal
    .querySelectorAll('input[type="date"]')
    .forEach((i) => i.setAttribute("min", today));
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("show");
  modal.querySelector("form")?.reset();
}

document.querySelectorAll(".modal-overlay").forEach((m) => {
  m.addEventListener("click", (e) => {
    if (e.target === m) closeModal(m.id);
  });
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

function initLogout() {
  document.getElementById("logoutBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    showConfirm("Are you sure you want to logout?", "👋", "Logout", () => {
      sessionStorage.clear();
      const loader = document.createElement("div");
      loader.style.cssText =
        "position:fixed;inset:0;background:linear-gradient(135deg,#6d4ab1,#170741);display:flex;align-items:center;justify-content:center;z-index:99999;";
      loader.innerHTML = `
        <div style="text-align:center;">
          <div style="width:60px;height:60px;border:5px solid rgba(255,255,255,0.2);border-top-color:#ffaa00;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 1rem;"></div>
          <div style="color:white;font-size:1.1rem;font-weight:700;font-family:inherit;">Logging out...</div>
        </div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      `;
      document.body.appendChild(loader);
      setTimeout(() => {
        window.location.href = "../web-page/index.html";
      }, 1200);
    });
  });
}

// ─── APPOINTMENTS ─────────────────────────────────────────────────────────────

function loadUserAppointments() {
  var user   = JSON.parse(sessionStorage.getItem('vhs_user') || sessionStorage.getItem('user') || '{}');
  var userId = user.id || user.userId;
  if (!userId) return;

  fetch('get_user_appointments.php?user_id=' + userId)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.status !== 'success') return;
      var appts = data.appointments;

      // Update stat counter on dashboard
      var upcoming = appts.filter(function(a) {
        return a.status === 'pending' || a.status === 'scheduled';
      });
      var statEl = document.getElementById('statUpcoming');
      if (statEl) statEl.textContent = upcoming.length;

      var badge = document.getElementById('apptBadge');
      if (badge) {
        badge.textContent = upcoming.length;
        badge.style.display = upcoming.length > 0 ? '' : 'none';
      }

      // Render dashboard upcoming table (pending/scheduled only)
      renderApptRows('dashApptBody', upcoming, 5 /* cols */);

      // Render full My Appointments table
      renderApptRows('apptTableBody', appts, 7 /* cols */);
    })
    .catch(function(err) {
      console.error('loadUserAppointments error:', err);
    });
}

function _apptStatusBadge(status) {
  var map = {
    pending:   'warning',
    scheduled: 'info',
    completed: 'completed',
    canceled:  'rejected',
    cancelled: 'rejected'
  };
  var cls = map[status] || 'info';
  var label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
  return '<span class="status-badge ' + cls + '">' + label + '</span>';
}

function _fmtApptDate(date, time) {
  if (!date) return '—';
  var parts = date.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  var dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return time ? dateStr + ' · ' + time : dateStr;
}

function renderApptRows(tbodyId, appts, cols) {
  var tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (!appts.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="' + cols + '" style="text-align:center;padding:2rem;color:var(--text-muted,#888);">No appointments found.</td></tr>';
    return;
  }

  tbody.innerHTML = appts.map(function(a, i) {
    var petLabel  = a.pet_name + (a.pet_type ? ' (' + a.pet_type + ')' : '');
    var dateTime  = _fmtApptDate(a.date, a.time);
    var statusBadge = _apptStatusBadge(a.status);
    var canCancel = (a.status === 'pending' || a.status === 'scheduled');

    if (cols === 5) {
      // Dashboard compact view: Pet | Service | Date & Time | Status | Actions
      return '<tr data-id="' + a.id + '">' +
        '<td>' + petLabel + '</td>' +
        '<td>' + (a.service || '—') + '</td>' +
        '<td>' + dateTime + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' +
          '<button class="btn-small" onclick="viewAppt(' + a.id + ')">View</button>' +
          (canCancel ? ' <button class="btn-small btn-danger" onclick="cancelAppt(' + a.id + ')">Cancel</button>' : '') +
        '</td>' +
      '</tr>';
    } else {
      // Full view: # | Pet | Service | Date & Time | Notes | Status | Actions
      return '<tr data-id="' + a.id + '">' +
        '<td>#' + String(i + 1).padStart(2, '0') + '</td>' +
        '<td>' + petLabel + '</td>' +
        '<td>' + (a.service || '—') + '</td>' +
        '<td>' + dateTime + '</td>' +
        '<td>' + (a.notes || '—') + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' +
          '<button class="btn-small" onclick="viewAppt(' + a.id + ')">View</button>' +
          (canCancel ? ' <button class="btn-small btn-danger" onclick="cancelAppt(' + a.id + ')">Cancel</button>' : '') +
        '</td>' +
      '</tr>';
    }
  }).join('');
}

function openBookModal() {
  openModal("bookModal");

  var user = JSON.parse(sessionStorage.getItem('vhs_user') || sessionStorage.getItem('user') || '{}');
  var userId = user.id || user.userId;

  // Load user's pets
  var petSelect = document.getElementById('bookPetSelect');
  if (petSelect && userId) {
    petSelect.innerHTML = '<option value="">Loading pets...</option>';
    fetch('get_pets_user.php?user_id=' + userId)
      .then(function(r) { return r.json(); })
      .then(function(pets) {
        petSelect.innerHTML = pets.length
          ? '<option value="">Choose a pet</option>' + pets.map(function(p) {
              return '<option value="' + p.id + '">' + p.name + ' (' + p.type + ')</option>';
            }).join('')
          : '<option value="">No pets registered yet</option>';
      })
      .catch(function() { petSelect.innerHTML = '<option value="">Failed to load pets</option>'; });
  }

  // Load veterinarians from staff
  var vetSelect = document.getElementById('bookVetSelect');
  if (vetSelect) {
    vetSelect.innerHTML = '<option value="">Loading veterinarians...</option>';
    fetch('../_backend/php_files/get_staff.php?role=veterinarian')
      .then(function(r) { return r.json(); })
      .then(function(vets) {
        vetSelect.innerHTML = vets.length
          ? '<option value="">No preference</option>' + vets.map(function(v) {
              return '<option value="' + v.id + '">Dr. ' + v.fullName + '</option>';
            }).join('')
          : '<option value="">No veterinarians available</option>';
      })
      .catch(function() { vetSelect.innerHTML = '<option value="">No preference</option>'; });
  }
}

async function submitBooking(e) {
  e.preventDefault(); // Stop page reload

  // 1. Get the logged-in user from sessionStorage
  var user = JSON.parse(sessionStorage.getItem('vhs_user') || sessionStorage.getItem('user') || '{}');
  var userId = user.id || user.userId;

  if (!userId) {
    showToast("Session expired. Please log in again.", "error");
    return;
  }

  // 2. Safely extract values from dropdowns
  var petId    = document.getElementById("bookPetSelect").value;
  var staffId  = document.getElementById("bookVetSelect").value || "0";
  var service  = document.getElementById("bookServiceSelect").value;
  var appTime  = document.getElementById("bookTimeSelect").value;
  var form     = document.getElementById("bookForm");
  var appDate  = form.querySelector('input[type="date"]').value;
  var appNotes = form.querySelector('textarea').value.trim();

  // 3. Assemble submission payload 
  var appointmentPayload = {
    user_id:          parseInt(userId) || 0,
    pet_id:           parseInt(petId) || 0,
    staff_id:         parseInt(staffId) || 0,
    service:          service,
    appointment_date: appDate,
    appointment_time: appTime,
    notes:            appNotes
  };

  // 🔥 DEBUGGING LOG: Right-click page, click Inspect -> Console tab to see this printout!
  console.log("Submitting Appointment Payload:", appointmentPayload);

  // Frontend validation alert checks before firing request
  if (appointmentPayload.user_id === 0) {
    showToast("Invalid User Session ID.", "error");
    return;
  }
  if (appointmentPayload.pet_id === 0) {
    showToast("Please select a valid pet.", "warning");
    return;
  }
  if (appointmentPayload.staff_id === 0) {
    showToast("Please select a preferred veterinarian.", "warning");
    return;
  }
  if (!appointmentPayload.service) {
    showToast("Please select a service.", "warning");
    return;
  }
  if (!appointmentPayload.appointment_date) {
    showToast("Please select a date.", "warning");
    return;
  }
  if (!appointmentPayload.appointment_time) {
    showToast("Please select a time.", "warning");
    return;
  }

  try {
    // 4. Send JSON payload to backend path
    var response = await fetch("../_backend/php_files/book-appointment.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(appointmentPayload)
    });

    var data = await response.json();

    if (data.status === "success") {
      showToast(data.message, "success");
      form.reset(); 
      closeModal('bookModal');
      loadUserAppointments(); // refresh the appointments table
    } else {
      showToast("Booking Failed: " + data.message, "error");
    }
  } catch (error) {
    console.error("Transmission Failure:", error);
    showToast("Could not connect to the booking system server.", "error");
  }
}

function viewAppt(id) {
  showUnderWork("Appointment detail view");
}

function rescheduleAppt(id) {
  showConfirm(
    "Do you want to reschedule this appointment?",
    "📅",
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
    "❌",
    "Cancel Appointment",
    () => {
      const row = document.querySelector(`#apptTableBody tr[data-id="${id}"]`);
      if (row) {
        row.style.transition = "opacity 0.3s";
        row.style.opacity = "0";
        setTimeout(() => row.remove(), 300);
      }
      showToast("Appointment cancelled.", "warning");
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
    var rowStatus = (row.querySelector('.status-badge')?.textContent || '').toLowerCase();
    row.style.display =
      val === "all" || rowStatus.includes(val) ? "" : "none";
  });
});

// ─── PETS ─────────────────────────────────────────────────────────────────────

function toggleHistory(id) {
  document.getElementById(id)?.classList.toggle("hidden");
}

function openAddPetModal() {
  document.getElementById("petModalTitle").textContent = "Add New Pet";
  document.getElementById("petForm")?.reset();
  delete document.getElementById("petForm")?.dataset.editId;
  // Reset photo preview
  var preview = document.getElementById('petPhotoPreview');
  if (preview) preview.innerHTML = '<span class="upload-icon">📷</span><span>Click to upload photo</span>';
  // Inject user ID
  var user = JSON.parse(sessionStorage.getItem('vhs_user') || sessionStorage.getItem('user') || '{}');
  var hiddenId = document.getElementById('petUserId');
  if (hiddenId) hiddenId.value = user.id || user.userId || '';
  openModal("petModal");
}

function previewPetPhoto(input) {
  if (!input.files || !input.files[0]) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var preview = document.getElementById('petPhotoPreview');
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
  var preview = document.getElementById('petPhotoPreview');
  if (preview) preview.innerHTML = '<span class="upload-icon">📷</span><span>Click to change photo</span>';

  // Set user ID
  var user = JSON.parse(sessionStorage.getItem('vhs_user') || sessionStorage.getItem('user') || '{}');
  var hiddenId = document.getElementById('petUserId');
  if (hiddenId) hiddenId.value = user.id || user.userId || '';

  // Store pet ID on form for update
  var form = document.getElementById('petForm');
  if (form) form.dataset.editId = id;

  // Fetch pet data and populate form
  fetch('get_pets_user.php?user_id=' + (user.id || user.userId || 0))
    .then(function(r) { return r.json(); })
    .then(function(pets) {
      var p = pets.find(function(x) { return x.id === id; });
      if (!p) { showToast('Pet not found.', 'error'); return; }

      document.getElementById('petName').value    = p.name    || '';
      document.getElementById('petSpecies').value = p.type    || '';
      document.getElementById('petBreed').value   = p.breed   || '';
      document.getElementById('petAge').value     = p.age     || '';
      document.getElementById('petGender').value  = p.gender  || '';
      document.getElementById('petWeight').value  = p.weight  || '';
      document.getElementById('petNotes').value   = p.notes   || '';

      // Show existing photo if any
      if (p.photo && preview) {
        preview.innerHTML = '<img src="' + p.photo + '" alt="Pet photo" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">';
      }

      openModal('petModal');
    })
    .catch(function() { showToast('Failed to load pet data.', 'error'); });
}

// ─── PET SPECIES EMOJI MAP ────────────────────────────────────────────────────
function petEmoji(type) {
  var map = { Dog:'🐶', Cat:'🐱', Bird:'🐦', Rabbit:'🐰' };
  return map[type] || '🐾';
}

// ─── LOAD PETS FROM DB ────────────────────────────────────────────────────────
function loadPets() {
  var user = JSON.parse(sessionStorage.getItem('vhs_user') || sessionStorage.getItem('user') || '{}');
  var userId = user.id || user.userId;
  if (!userId) return;

  var grid     = document.getElementById('petsGrid');
  var dashGrid = document.getElementById('dashPetsGrid');
  var petCount = document.getElementById('statPetCount');

  if (grid) grid.innerHTML = '<p style="color:#888;padding:1rem 0">Loading pets...</p>';

  fetch('get_pets_user.php?user_id=' + userId)
    .then(function(r) { return r.json(); })
    .then(function(pets) {

      // Update stat counter on dashboard
      if (petCount) petCount.textContent = pets.length;
      var statPets = document.getElementById('statPets');
      if (statPets) statPets.textContent = pets.length;

      // ── Dashboard quick view (compact cards) ──
      if (dashGrid) {
        dashGrid.innerHTML = pets.length ? pets.map(function(p) {
          var subtitle = [p.breed, p.type, p.age ? p.age + ' yrs' : '', p.gender].filter(Boolean).join(' · ');
          return '<div class="pet-card" style="cursor:pointer" onclick="showSection(\'pets\')">' +
            '<div class="pet-avatar">' + petEmoji(p.type) + '</div>' +
            '<div class="pet-info" style="flex:1">' +
              '<h3>' + p.name + '</h3>' +
              '<p>' + subtitle + '</p>' +
            '</div>' +
            '<button class="btn-small" onclick="event.stopPropagation();showSection(\'pets\')">View</button>' +
          '</div>';
        }).join('')
        : '<p style="color:var(--text-muted,#888);padding:1rem 0">No pets registered yet. Add your first pet!</p>';
      }

      // ── My Pets full view ──
      if (!grid) return;
      if (!pets.length) {
        grid.innerHTML = '<p style="color:var(--text-muted,#888);padding:1rem 0">No pets registered yet. Click "Add New Pet" to get started!</p>';
        return;
      }
      grid.innerHTML = pets.map(function(p) {
        var subtitle = [p.breed, p.type, p.gender].filter(Boolean).join(' · ');
        var photo = p.photo
          ? '<img src="' + p.photo + '" alt="' + p.name + '" style="width:100%;height:100%;object-fit:cover;border-radius:0.75rem;">'
          : petEmoji(p.type);
        return '<div class="pet-full-card content-section">' +
          '<div class="pet-full-header">' +
            '<div class="pet-big-avatar">' + photo + '</div>' +
            '<div style="flex:1">' +
              '<h3 style="font-size:1.3rem;font-weight:700;color:var(--text-dark);margin:0 0 0.2rem">' + p.name + '</h3>' +
              '<p style="font-size:0.85rem;color:var(--text-dim);margin:0">' + (subtitle || '—') + '</p>' +
            '</div>' +
            '<button class="btn-small" onclick="openEditPetModal(' + p.id + ')">Edit</button>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem">' +
            '<div class="pet-stat-box"><div class="pet-stat-label">AGE</div><div class="pet-stat-val">' + (p.age ? p.age + ' years' : '—') + '</div></div>' +
            '<div class="pet-stat-box"><div class="pet-stat-label">WEIGHT</div><div class="pet-stat-val">' + (p.weight ? p.weight + ' kg' : '—') + '</div></div>' +
            '<div class="pet-stat-box"><div class="pet-stat-label">COLOR</div><div class="pet-stat-val">' + (p.color || '—') + '</div></div>' +
            '<div class="pet-stat-box"><div class="pet-stat-label">MICROCHIP</div><div class="pet-stat-val">' + (p.microchip || '—') + '</div></div>' +
          '</div>' +
          (p.notes ? '<div class="pet-notes-box"><div class="pet-stat-label" style="margin-bottom:0.35rem">MEDICAL NOTES</div><p style="font-size:0.85rem;color:var(--text-dim);margin:0;line-height:1.6">' + p.notes + '</p></div>' : '') +
          '<div style="border-top:1px solid var(--border);margin-top:1rem;padding-top:0.85rem">' +
            '<button class="btn-link" style="font-size:0.85rem;color:var(--primary);background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;gap:0.4rem" onclick="showUnderWork(\'Appointment history\')">' +
              '📋 View Appointment History' +
            '</button>' +
          '</div>' +
        '</div>';
      }).join('');
    })
    .catch(function() {
      if (grid) grid.innerHTML = '<p style="color:red;padding:1rem 0">Failed to load pets.</p>';
    });
}

function submitPet(e) {
  e.preventDefault();

  var form = e.target;
  var formData = new FormData(form);
  var editId = form.dataset.editId;

  // If editing, add the pet_id so PHP knows to UPDATE
  if (editId) formData.append('pet_id', editId);

  fetch('petDB.php', {
    method: 'POST',
    body: formData,
  })
    .then(function(r) { return r.text(); })
    .then(function(data) {
      if (data.trim() === 'Success') {
        closeModal('petModal');
        showToast(editId ? 'Pet updated successfully!' : 'Pet added successfully!', 'success');
        loadPets();
      } else {
        showToast('Error: ' + data, 'error');
      }
    })
    .catch(function() { showToast('Server error', 'error'); });
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────

// ─── PROFILE ──────────────────────────────────────────────────────────────────

let _profileSnapshot = null; // saved state before editing

function _setAvatarDisplay(src, show) {
  const pImg = document.getElementById("avatarPreviewImg");
  const pEmoji = document.getElementById("avatarPreviewEmoji");
  const sImg = document.getElementById("sidebarAvatarImg");
  const sEmoji = document.getElementById("sidebarAvatarEmoji");
  if (show && src) {
    pImg.src = src;
    pImg.style.display = "block";
    pEmoji.style.display = "none";
    sImg.src = src;
    sImg.style.display = "block";
    sEmoji.style.display = "none";
  } else {
    pImg.style.display = "none";
    pEmoji.style.display = "";
    sImg.style.display = "none";
    sEmoji.style.display = "";
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
    if (!current || !newPass || !confirm) { showToast("Fill in all password fields.", "error"); return; }
    if (newPass !== confirm) { showToast("New passwords do not match.", "error"); return; }
    if (newPass.length < 8) { showToast("Password must be at least 8 characters.", "error"); return; }
  }

  const raw = sessionStorage.getItem("user");
  if (!raw) { showToast("Session expired. Please log in again.", "error"); return; }
  const user = JSON.parse(raw);

  const phone   = document.getElementById("profilePhone").value.trim();
  const address = document.getElementById("profileAddress").value.trim();

  // Use FormData so we can include the photo file
  const fd = new FormData();
  fd.append("id",      user.id);
  fd.append("phone",   phone);
  fd.append("address", address);
  if (newPass) fd.append("new_password", newPass);

  // Attach photo file if one was selected
  const avatarInput = document.getElementById("avatarInput");
  if (avatarInput && avatarInput.files[0]) {
    fd.append("profile_photo", avatarInput.files[0]);
  }

  fetch("../_backend/php_files/update_profile.php", { method: "POST", body: fd })
    .then((r) => r.json())
    .then((res) => {
      if (res.status === "success") {
        user.phone   = phone;
        user.address = address;

        // If a new photo was saved, store its URL in session
        if (res.photo) {
          user.photo = '../user/' + res.photo;
          const pImg = document.getElementById("avatarPreviewImg");
          _setAvatarDisplay('../user/' + res.photo, true);
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
        showToast("Failed to save: " + (res.message || "Unknown error"), "error");
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

  const welcomeEl = document.querySelector("#section-dashboard .page-header h1");
  if (welcomeEl) welcomeEl.textContent = `Welcome back, ${user.firstName}! 👋`;

  const sidebarName = document.querySelector(".sidebar-user-name");
  if (sidebarName) sidebarName.textContent = fullName;

  const el = (id) => document.getElementById(id);
  if (el("profileLastName"))   el("profileLastName").value   = user.lastName   || "";
  if (el("profileFirstName"))  el("profileFirstName").value  = user.firstName  || "";
  if (el("profileMiddleName")) el("profileMiddleName").value = user.middleName || "";
  if (el("profileEmail"))      el("profileEmail").value      = user.email      || "";
  if (el("profilePhone"))      el("profilePhone").value      = user.phone      || "";
  if (el("profileAddress"))    el("profileAddress").value    = user.address    || "";

  // Restore saved profile photo
  if (user.photo) {
    _setAvatarDisplay(user.photo, true);
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initLogout();
  showSection("dashboard");
  autoLabelTables();

  // Demo mode — set empty states instead of fetching from backend
  var dashAppt = document.getElementById('dashApptBody');
  var apptBody = document.getElementById('apptTableBody');
  var petsGrid = document.getElementById('petsGrid');
  var dashPets = document.getElementById('dashPetsGrid');
  var statUpcoming = document.getElementById('statUpcoming');
  var statPets = document.getElementById('statPets');
  var statCompleted = document.getElementById('statCompleted');
  var statPending = document.getElementById('statPending');

  if (dashAppt) dashAppt.innerHTML = '<tr class="empty-row"><td colspan="5" style="text-align:center;padding:2rem;color:#888;">No data — backend required.</td></tr>';
  if (apptBody) apptBody.innerHTML = '<tr class="empty-row"><td colspan="7" style="text-align:center;padding:2rem;color:#888;">No data — backend required.</td></tr>';
  if (petsGrid) petsGrid.innerHTML = '<p style="color:#888;padding:1rem 0">No data — backend required.</p>';
  if (dashPets) dashPets.innerHTML = '<p style="color:#888;padding:1rem 0">No data — backend required.</p>';
  if (statUpcoming) statUpcoming.textContent = '—';
  if (statPets) statPets.textContent = '—';
  if (statCompleted) statCompleted.textContent = '—';
  if (statPending) statPending.textContent = '—';

  // Profile field input restrictions
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

  const profilePhone = document.getElementById("profilePhone");
  if (profilePhone) {
    profilePhone.addEventListener("keydown", function (e) {
      const allowed = ["Backspace","Delete","ArrowLeft","ArrowRight","Tab","Home","End"];
      if (allowed.includes(e.key)) return;
      if (e.key < "0" || e.key > "9") e.preventDefault();
    });
    profilePhone.addEventListener("input", function () {
      const cleaned = profilePhone.value.replace(/[^0-9]/g, "").slice(0, 11);
      if (cleaned !== profilePhone.value) profilePhone.value = cleaned;
    });
  }
});

// Replace the "Backend Required" block in user-csriptJS.txt
function loadUserAppointments() {
  const container = document.getElementById("userAppointmentsList"); 
  if (!container) return;

  fetch('/php_files/get_user_appointments.php')
    .then(response => response.json())
    .then(data => {
      container.innerHTML = '';
      data.forEach(appt => {
        container.innerHTML += `<div class="appt-card">${appt.date} - ${appt.service}</div>`;
      });
    });
}
document.addEventListener("DOMContentLoaded", loadUserAppointments);
