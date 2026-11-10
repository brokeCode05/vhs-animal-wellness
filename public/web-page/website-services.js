/* ============================================================
   VHS WEBSITE SERVICE CATALOG ADAPTER (public pages)

   Binds the public service displays to the SAME shared catalog
   the portals use (shared/mock-users.js), so Admin service edits
   surface here after reload. Static markup is the fallback and
   SEO source; it is updated in place, never duplicated.

   Requires ../shared/mock-users.js (loads before this file).
   TODO(BACKEND): GET /api/services replaces the shared module.
   ============================================================ */
(function (window) {
  'use strict';

  function catalogServices() {
    var smu = window.SharedMockUsers;
    if (!smu || !smu.services) return null;
    var list = smu.activeServices ? smu.activeServices() : smu.services();
    return list && list.length ? list : null;
  }

  // ── services.html: refresh card faces + modal data from the catalog ──
  async function enhanceDetailedCards(root) {
    var cards = root.querySelectorAll('.svc-card[data-title]');
    var container = root.querySelector('#serviceCatalog');
    function showPrice(card, price) {
      var el = card.querySelector('.svc-price');
      if (el) el.textContent = price;
      card.setAttribute('data-cost', price);
    }
    cards.forEach(function(card) { showPrice(card, 'Contact us for pricing'); });
    try {
      var response = await fetch('/api/services?active=1', {credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'}});
      var body = await response.json();
      if (!response.ok || !body.success || !body.data || !Array.isArray(body.data.services)) throw new Error('unavailable');
      var byLabel = {};
      body.data.services.filter(function(s) { return s.active === true && typeof s.label === 'string'; }).forEach(function(s) { byLabel[s.label.toLowerCase()] = s; });
      var existing = {};
      cards.forEach(function(card) {
        var svc = byLabel[(card.getAttribute('data-title') || '').toLowerCase()];
        if (!svc) { card.style.display = 'none'; return; }
        existing[svc.label.toLowerCase()] = true;
        card.style.display = '';
        var min = Number(svc.publicPriceMin), max = Number(svc.publicPriceMax);
        var valid = svc.publicPriceMin != null && Number.isFinite(min) && min >= 0;
        var money = function(n) { return '₱' + n.toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2}); };
        var price = 'Contact us for pricing';
        if (valid && svc.publicPricingType === 'single') price = money(min);
        else if (valid && svc.publicPricingType === 'starting') price = 'Starts at ' + money(min);
        else if (valid && svc.publicPricingType === 'range' && svc.publicPriceMax != null && Number.isFinite(max) && max >= min) price = money(min) + ' – ' + money(max);
        showPrice(card, price);
      });
      if (container) {
        var sections = {};
        container.querySelectorAll('.svc-category').forEach(function(section) {
          var h = section.querySelector('.svc-cat-title');
          if (h) sections[h.textContent.trim().toLowerCase()] = section;
        });
        function categoryGrid(name) {
          var label = (typeof name === 'string' && name.trim()) ? name.trim() : 'Other services';
          var key = label.toLowerCase(), section = sections[key];
          if (!section) {
            section = root.createElement('div'); section.className = 'svc-category is-visible';
            var heading = root.createElement('h2'); heading.className = 'svc-cat-title'; heading.textContent = label;
            var newGrid = root.createElement('div'); newGrid.className = 'svc-grid';
            section.append(heading, newGrid); container.appendChild(section); sections[key] = section;
          }
          return section.querySelector('.svc-grid');
        }
        cards.forEach(function(card) {
          var svc = byLabel[(card.getAttribute('data-title') || '').toLowerCase()];
          if (svc) { card.dataset.category = svc.category || svc.group || ''; categoryGrid(card.dataset.category).appendChild(card); }
        });
        body.data.services.filter(function(s) { return s.active === true && typeof s.label === 'string' && !existing[s.label.toLowerCase()]; }).forEach(function(s) {
          var card = root.createElement('div'); card.className = 'svc-card is-visible';
          card.dataset.title = s.label; card.dataset.category = s.category || s.group || '';
          card.dataset.desc = 'Please contact the clinic for details about this service.';
          card.dataset.time = 'Contact the clinic'; card.dataset.includes = 'Contact the clinic';
          var head = root.createElement('div'); head.className = 'svc-card-head';
          var heading = root.createElement('h4'); heading.textContent = s.label; head.appendChild(heading);
          var description = root.createElement('p'); description.textContent = card.dataset.desc;
          var priceEl = root.createElement('div'); priceEl.className = 'svc-price';
          var button = root.createElement('button'); button.type = 'button'; button.className = 'btn-learn'; button.textContent = 'Learn More';
          card.append(head, description, priceEl, button); categoryGrid(card.dataset.category).appendChild(card);
          var min = Number(s.publicPriceMin), max = Number(s.publicPriceMax), price = 'Contact us for pricing';
          var valid = s.publicPriceMin != null && Number.isFinite(min) && min >= 0;
          var money = function(n) { return '₱' + n.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}); };
          if (valid && s.publicPricingType === 'single') price = money(min);
          else if (valid && s.publicPricingType === 'starting') price = 'Starts at ' + money(min);
          else if (valid && s.publicPricingType === 'range' && s.publicPriceMax != null && Number.isFinite(max) && max >= min) price = money(min) + ' – ' + money(max);
          showPrice(card, price);
        });
        Object.keys(sections).forEach(function(key) {
          var section = sections[key], visible = Array.from(section.querySelectorAll('.svc-card')).some(function(card) { return card.style.display !== 'none'; });
          section.style.display = visible ? '' : 'none';
        });
      }
    } catch (_) {
      cards.forEach(function(card) { card.style.display = 'none'; });
      if (container) container.textContent = 'Services are unavailable right now. Please contact the clinic.';
    }
  }

  // ── index.html: lightweight name sync for static teaser cards ──
  // Teasers are marketing copy without prices; only headings are aligned
  // with the catalog. Full current pricing/availability lives on services.html.
  async function enhanceTeaserCards(root) {
    var grid = root.querySelector('#services .services-grid');
    if (!grid) return;
    grid.textContent = 'Loading services…';
    try {
      var response = await fetch('/api/services?active=1', {credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      var body = await response.json();
      if (!response.ok || !body.success || !body.data || !Array.isArray(body.data.services)) throw new Error('unavailable');
      var list = body.data.services.filter(function(s) { return s.active === true && typeof s.label === 'string' && s.label.trim(); });
      grid.replaceChildren();
      if (!list.length) { grid.textContent = 'No services are currently listed. Please contact the clinic.'; return; }
      list.forEach(function(s) {
        var card = root.createElement('div'); card.className = 'service-card';
        var heading = root.createElement('h3'); heading.textContent = s.label;
        var category = root.createElement('p'); category.textContent = s.category || s.group || 'Clinic service';
        card.append(heading, category); grid.appendChild(card);
      });
    } catch (_) {
      grid.textContent = 'Services are unavailable right now. Please contact the clinic.';
    }
  }

  window.VHSWebsiteServices = { enhanceDetailedCards: enhanceDetailedCards, enhanceTeaserCards: enhanceTeaserCards };
})(window);
