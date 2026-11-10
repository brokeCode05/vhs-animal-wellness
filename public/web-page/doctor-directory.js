/* REQ016 — public staff directory. All doctor records come from Laravel.
   Existing vetted biography/photo is reused for the same doctor by name;
   unconfirmed or inactive doctors never show when API succeeds.
   No personnel contact, employee ID, or private data is sent to the page. */
(function (window, document) {
  'use strict';
  function normalized(name) {
    return String(name || '').toLowerCase().replace(/\bdr\.?\b/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function matches(existing, fresh) {
    var a = normalized(existing).split(' ').filter(Boolean);
    var b = normalized(fresh).split(' ').filter(Boolean);
    if (!a.length || !b.length) return false;
    return a.join(' ') === b.join(' ') || (a.length >= 2 && b.length >= 1 && a[a.length-1] === b[b.length-1] && (b.length === 1 || a[0] === b[0]));
  }
  function newCard(item) {
    var card = document.createElement('div'); card.className='vet-card';
    var photo=document.createElement('div'); photo.className='vet-card__photo';
    var avatar=document.createElement('div'); avatar.className='vet-card__photo-placeholder';
    avatar.textContent='👩‍⚕️'; avatar.setAttribute('aria-hidden','true');
    photo.appendChild(avatar);
    var info=document.createElement('div'); info.className='vet-card__info';
    var title=document.createElement('h3'); title.textContent=item.name || 'Veterinarian';
    var role=document.createElement('p'); role.className='vet-card__role'; role.textContent='Attending Veterinarian';
    info.append(title,role); card.append(photo,info);
    return card;
  }
  function setSpecialization(card, specialty) {
    var target=card.querySelector('.vet-card__info') || card;
    var para=card.querySelector('[data-vhs-specialization]');
    if (!para) { para=document.createElement('p'); para.className='vet-card__bio'; para.dataset.vhsSpecialization='1'; target.appendChild(para); }
    para.textContent='Specialization: '+(specialty && String(specialty).trim() ? specialty : 'Not specified');
  }
  var originals=[];
  function render(directory) {
    document.querySelectorAll('[data-vhs-doctor-grid]').forEach(function(grid,index) {
      var original=originals[index] || [];
      var nodes=[];
      directory.forEach(function(doctor) {
        if (!doctor || !doctor.name) return;
        var found=original.find(function(card) {
          var nameNode=card.querySelector('.vet-card__info h3');
          return nameNode && matches(nameNode.textContent,doctor.name);
        });
        var card=found ? found.cloneNode(true) : newCard(doctor);
        if (found) { // Use Laravel's authoritative current display name.
          var title=card.querySelector('.vet-card__info h3');
          if(title) title.textContent=doctor.name;
        }
        setSpecialization(card,doctor.specialization);
        nodes.push(card);
      });
      if (!nodes.length) {
        var empty=document.createElement('p'); empty.className='vet-empty-state';
        empty.textContent='No active veterinarians are currently listed.';
        nodes.push(empty);
      }
      grid.replaceChildren.apply(grid,nodes);
    });
  }
  async function load() {
    var grids=Array.prototype.slice.call(document.querySelectorAll('[data-vhs-doctor-grid]'));
    if (!grids.length) return;
    if (!originals.length) originals=grids.map(function(g){return Array.prototype.slice.call(g.querySelectorAll('.vet-card')).map(function(node){return node.cloneNode(true);});});
    try {
      var r=await fetch('/api/public/doctors',{credentials:'same-origin',headers:{Accept:'application/json'}});
      if (!r.ok) throw new Error('Doctor directory unavailable');
      var payload=await r.json();
      var doctors=payload && payload.data && payload.data.doctors;
      if (!Array.isArray(doctors)) throw new Error('Invalid doctors response');
      render(doctors);
    } catch (error) {
      // Keep existing approved bio/photos if offline; do not claim live data.
      grids.forEach(function(grid){
        if (grid.querySelector('[data-vhs-staff-offline]')) return;
        var msg=document.createElement('p'); msg.dataset.vhsStaffOffline='1';
        msg.className='vet-empty-state';
        msg.textContent='Doctor directory could not be refreshed. Please contact the clinic for current staff details.';
        grid.appendChild(msg);
      });
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',load);
  else load();
  window.VHSWebsiteStaff={reload:load};
})(window, document);
