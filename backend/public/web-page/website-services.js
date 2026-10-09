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
  function enhanceDetailedCards(root) {
    var list = catalogServices();
    if (!list) return;
    var byLabel = {};
    list.forEach(function (s) { byLabel[s.label.toLowerCase()] = s; });

    root.querySelectorAll('.svc-card[data-title]').forEach(function (card) {
      var svc = byLabel[(card.getAttribute('data-title') || '').toLowerCase()];
      if (!svc) {
        card.style.display = 'none'; // removed/inactive in Admin: hide it
        return;
      }
      var priceEl = card.querySelector('.svc-price');
      if (priceEl && svc.price) {
        priceEl.textContent = svc.price;
        card.setAttribute('data-cost', svc.price);
      }
      var headTitle = card.querySelector('.svc-card-head h4');
      if (headTitle) headTitle.textContent = svc.label;
      card.setAttribute('data-title', svc.label);
    });
  }

  // ── index.html: lightweight name sync for static teaser cards ──
  // Teasers are marketing copy without prices; only headings are aligned
  // with the catalog. Full current pricing/availability lives on services.html.
  function enhanceTeaserCards(root) {
    var list = catalogServices();
    if (!list) return;
    var byName = {};
    // Historic homepage headings the catalog has since split/renamed:
    // catalog label → the older heading that still appears on the page.
    var alias = {
      'dog grooming': 'dog & cat grooming',
      'spay': 'spay & neuter',
      'blood test': 'blood tests',
      'microchipping': 'pet microchipping',
      'boarding': 'boarding & confinement'
    };
    list.forEach(function (s) {
      byName[s.label.toLowerCase()] = s;
      var a = alias[s.label.toLowerCase()];
      if (a) byName[a] = s;
    });

    root.querySelectorAll('.service-card h3').forEach(function (h3) {
      var svc = byName[(h3.textContent || '').trim().toLowerCase()];
      if (!svc) return; // informational teaser card: leave untouched
      h3.textContent = svc.label;
    });
  }

  window.VHSWebsiteServices = { enhanceDetailedCards: enhanceDetailedCards, enhanceTeaserCards: enhanceTeaserCards };
})(window);
