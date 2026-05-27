/* ============================================
   VHS CLERK DASHBOARD — Self-contained script
   Clerk permissions:
     ✅ Approve / reject appointments
     ✅ Add new client accounts (forwarded to admin)
     ✅ View clients & pets
     ✅ Edit clients & pets
     ❌ Cannot delete/remove accounts
     ❌ Cannot create staff accounts
   showToast / confirmAction / showUnderWork
   are provided by shared/vhs-ui.js
============================================ */

// ─── MOBILE SIDEBAR ───────────────────────────────────────────────────────────

let _overlay = null;

function getSidebarOverlay() {
  if (!_overlay) {
    _overlay = document.createElement('div');
    _overlay.className = 'sidebar-overlay';
    document.body.appendChild(_overlay);
    _overlay.addEventListener('click', closeMobileSidebar);
  }
  return _overlay;
}

function openMobileSidebar() {
  document.querySelector('.sidebar')?.classList.add('open');
  getSidebarOverlay().classList.add('show');
  document.querySelector('.hamburger-menu')?.classList.add('active');
}

function closeMobileSidebar() {
  document.querySelector('.sidebar')?.classList.remove('open');
  getSidebarOverlay().classList.remove('show');
  document.querySelector('.hamburger-menu')?.classList.remove('active');
}

function toggleSidebar() {
  document.querySelector('.sidebar')?.classList.contains('open')
    ? closeMobileSidebar() : openMobileSidebar();
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

function initLogout() {
  document.getElementById('logoutBtn')?.addEventListener('click', e => {
    e.preventDefault();
    confirmAction('Are you sure you want to logout?', () => {
      sessionStorage.clear();
      const loader = document.createElement('div');
      loader.className = 'page-loader';
      loader.innerHTML = '<div class="loader-content"><div class="loader-spinner"></div><div class="loader-text">Logging out...</div></div>';
      document.body.appendChild(loader);
      setTimeout(() => { window.location.href = '../web-page/index.html'; }, 1000);
    }, { title: 'Logout', icon: '👋' });
  });
}

// ─── ROW REMOVAL ─────────────────────────────────────────────────────────────

function removeRow(id) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  if (row) {
    row.style.transition = 'opacity 0.3s';
    row.style.opacity = '0';
    setTimeout(() => row.remove(), 300);
  }
}

// ─── APPOINTMENT ACTIONS ──────────────────────────────────────────────────────

function approveAppointment(id) {
  confirmAction('Approve this appointment?', () => {
    removeRow(id);
    showToast('Appointment approved!', 'success');
  }, { title: 'Approve Appointment', icon: '📅', accent: 'success' });
}

function rejectAppointment(id) {
  showPrompt('Reason for rejection (optional):', '', reason => {
    if (reason === null) return;
    removeRow(id);
    showToast('Appointment rejected.', 'warning');
  }, { title: 'Reject Appointment', icon: '❌', accent: 'error', placeholder: 'Enter reason (optional)...' });
}

function markComplete(id)      { confirmAction('Mark this appointment as completed?', () => showToast('Marked as completed!', 'success'), { title: 'Mark Complete', icon: '✅', accent: 'success' }); }
function cancelAppointment(id) { confirmAction('Cancel this appointment?', () => showToast('Appointment cancelled.', 'warning'), { title: 'Cancel Appointment', icon: '⚠️', danger: true }); }
function viewAppointment(id)   { showUnderWork('Appointment detail view'); }
function reschedule(id)        { showUnderWork('Reschedule appointment'); }
function addNewAppointment()   { showUnderWork('Add new appointment'); }

// ─── CLIENT ACTIONS ───────────────────────────────────────────────────────────

function viewClientDetails(id) { showUnderWork('Client registration details'); }
function viewClient(id)        { showUnderWork('Client profile view'); }
function editClient(id)        { showUnderWork('Edit client'); }

// ─── PET & OWNER ACTIONS ─────────────────────────────────────────────────────

function viewOwnerProfile(id)  { document.getElementById('ownerProfileModal')?.classList.add('show'); }
function closeOwnerProfile()   { document.getElementById('ownerProfileModal')?.classList.remove('show'); }
function editOwner(id)         { showUnderWork('Edit owner'); }
function addNewOwner()         { window.location.href = 'clients.html'; }
function viewPetProfile(id)    { document.getElementById('petProfileModal')?.classList.add('show'); }
function closePetProfile()     { document.getElementById('petProfileModal')?.classList.remove('show'); }
function editPet(id)           { showUnderWork('Edit pet'); }
function addNewPet()           { showUnderWork('Register new pet'); }

// ─── SEARCH & FILTER ─────────────────────────────────────────────────────────

function setupSearch() {
  document.querySelectorAll('input[type="search"]').forEach(input => {
    input.addEventListener('input', e => {
      const term = e.target.value.toLowerCase();
      e.target.closest('section')?.querySelectorAll('.compact-table tbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
    });
  });
}

function setupFilters() {
  document.querySelectorAll('select[id^="filter"]').forEach(select => {
    select.addEventListener('change', e => {
      const val = e.target.value.toLowerCase();
      e.target.closest('section')?.querySelectorAll('.compact-table tbody tr').forEach(row => {
        row.style.display = (val === 'all' || row.textContent.toLowerCase().includes(val)) ? '' : 'none';
      });
    });
  });
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(tab + '-tab')?.classList.add('active');
    });
  });
}

function setupModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
  });
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.modal-overlay')?.classList.remove('show'));
  });
}

function autoLabelTables() {
  document.querySelectorAll('.compact-table').forEach(table => {
    const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach(row => {
      [...row.querySelectorAll('td')].forEach((td, i) => {
        if (!td.getAttribute('data-label') && headers[i]) td.setAttribute('data-label', headers[i]);
      });
    });
  });
}

// ─── CALENDAR ─────────────────────────────────────────────────────────────────

const CalendarState = {
  currentMonth: new Date().getMonth(),
  currentYear:  new Date().getFullYear(),
  currentView:  'month',
  appointments: []  // populated from real DB when appointment module is built
};

function _calDate(monthOffset, day) {
  const d = new Date();
  d.setMonth(d.getMonth() + monthOffset);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function generateCalendar() {
  const { currentMonth, currentYear, appointments } = CalendarState;
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.innerHTML = '';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'calendar-day-header';
    h.textContent = d;
    grid.appendChild(h);
  });
  const firstDay    = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevLastDay = new Date(currentYear, currentMonth, 0).getDate();
  const today       = new Date();
  for (let i = firstDay - 1; i >= 0; i--) grid.appendChild(makeDayCell(prevLastDay - i, true, currentMonth - 1, currentYear, false));
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
    grid.appendChild(makeDayCell(d, false, currentMonth, currentYear, isToday));
  }
  const total = grid.children.length - 7;
  for (let d = 1; d <= 42 - total; d++) grid.appendChild(makeDayCell(d, true, currentMonth + 1, currentYear, false));
}

function makeDayCell(day, isOther, month, year, isToday) {
  const el = document.createElement('div');
  el.className = 'calendar-day' + (isOther ? ' other-month' : '') + (isToday ? ' today' : '');
  const num = document.createElement('span');
  num.textContent = day;
  el.appendChild(num);
  if (!isOther) {
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    CalendarState.appointments.filter(a => a.date === dateStr).forEach(apt => {
      const item = document.createElement('div');
      item.className = 'appointment-item ' + apt.type;
      item.innerHTML = `<span class="appointment-badge">${apt.owner} — ${apt.service}</span>`;
      item.onclick = () => showToast(`${apt.owner} · ${apt.pet} · ${apt.service}`, 'info');
      el.appendChild(item);
    });
  }
  return el;
}

function updateCalendarDisplay() {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const el = document.getElementById('calendarMonth');
  if (el) el.textContent = months[CalendarState.currentMonth] + ' ' + CalendarState.currentYear;
  generateCalendar();
}

function previousMonth() {
  if (--CalendarState.currentMonth < 0) { CalendarState.currentMonth = 11; CalendarState.currentYear--; }
  updateCalendarDisplay();
}
function nextMonth() {
  if (++CalendarState.currentMonth > 11) { CalendarState.currentMonth = 0; CalendarState.currentYear++; }
  updateCalendarDisplay();
}
function goToToday() {
  const t = new Date();
  CalendarState.currentMonth = t.getMonth();
  CalendarState.currentYear  = t.getFullYear();
  updateCalendarDisplay();
  showToast('Showing current month', 'info');
}
function setCalendarView(view) {
  CalendarState.currentView = view;
  document.querySelectorAll('.calendar-view-toggle .btn-small').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === view);
  });
}
function filterAppointments() {
  const val = document.getElementById('statusFilter')?.value;
  if (val && val !== 'all') showToast('Filter applied: ' + val, 'info');
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initLogout();
  setupSearch();
  setupFilters();
  setupTabs();
  setupModals();
  autoLabelTables();

  document.getElementById('hamburgerMenu')?.addEventListener('click', toggleSidebar);
  document.querySelectorAll('.sidebar .nav-item').forEach(item => {
    item.addEventListener('click', () => { if (window.innerWidth <= 768) closeMobileSidebar(); });
  });
  window.addEventListener('resize', () => { if (window.innerWidth > 768) closeMobileSidebar(); });

  if (document.getElementById('calendarGrid')) updateCalendarDisplay();
});

// Replace the "Backend Required" block in clerkScriptJS.txt
function loadClerkData() {
  const table = document.getElementById("clerkAppointmentsTable"); // Use your actual table ID
  if (!table) return;

  fetch('/php_files/get_clerk_appointments.php') // Ensure this file exists
    .then(response => response.json())
    .then(data => {
      table.innerHTML = ''; 
      data.forEach(item => {
        table.innerHTML += `<tr><td>${item.pet_name}</td><td>${item.status}</td><td><button>Approve</button></td></tr>`;
      });
    });
}
document.addEventListener("DOMContentLoaded", loadClerkData);
