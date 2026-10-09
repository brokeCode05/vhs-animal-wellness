/* ============================================================
   VHS WEBSITE STAFF ADAPTER — REQ016

   Public veterinarian information comes from Laravel/MySQL:
     GET /api/public/doctors

   Only public-safe fields are returned:
     - display name
     - specialization

   Email, phone, employee ID, availability and login/account details
   are intentionally not exposed on the public endpoint.

   Existing static veterinarian markup remains the fallback if the
   backend cannot be reached.
   ============================================================ */
(function (window, document) {
  'use strict';

  function makePlaceholder() {
    var placeholder = document.createElement('div');
    placeholder.className = 'vet-card__photo-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.innerHTML =
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>' +
      '<circle cx="12" cy="7" r="4"></circle>' +
      '</svg>';
    return placeholder;
  }

  function doctorCard(doctor) {
    var card = document.createElement('div');
    card.className = 'vet-card';

    var photo = document.createElement('div');
    photo.className = 'vet-card__photo';
    photo.appendChild(makePlaceholder());

    var info = document.createElement('div');
    info.className = 'vet-card__info';

    var name = document.createElement('h3');
    name.textContent = doctor.name || 'Veterinarian';

    var role = document.createElement('p');
    role.className = 'vet-card__role';
    role.textContent = 'Veterinarian';

    var specialization = document.createElement('p');
    specialization.className = 'vet-card__bio';
    specialization.textContent = doctor.specialization
      ? 'Specialization: ' + doctor.specialization
      : 'Specialization not specified.';

    info.appendChild(name);
    info.appendChild(role);
    info.appendChild(specialization);

    card.appendChild(photo);
    card.appendChild(info);

    return card;
  }

  function render(doctors) {
    if (!Array.isArray(doctors)) return;

    document.querySelectorAll('[data-vhs-doctor-grid]').forEach(function (grid) {
      var fragment = document.createDocumentFragment();

      if (!doctors.length) {
        var empty = document.createElement('p');
        empty.className = 'vet-empty-state';
        empty.textContent = 'No active veterinarians are currently listed.';
        fragment.appendChild(empty);
      } else {
        doctors.forEach(function (doctor) {
          fragment.appendChild(doctorCard(doctor));
        });
      }

      grid.replaceChildren(fragment);
    });
  }

  function load() {
    var xhr = new XMLHttpRequest();

    try {
      xhr.open('GET', '/api/public/doctors', true);
      xhr.setRequestHeader('Accept', 'application/json');

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4 || xhr.status < 200 || xhr.status >= 300) return;

        try {
          var payload = JSON.parse(xhr.responseText || '{}');
          var doctors = payload && payload.data ? payload.data.doctors : null;
          render(doctors);
        } catch (e) {
          // Keep the static fallback already present in the HTML.
        }
      };

      xhr.send();
    } catch (e) {
      // Keep the static fallback already present in the HTML.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }

  window.VHSWebsiteStaff = { reload: load };
})(window, document);
