/*
 * VHS LIVE DATA BRIDGE
 * --------------------
 * Production/defense runtime data source for the frozen frontend.
 * NO seeded users, pets, doctors or appointments live in this file.
 * Data is read/written through Laravel + MySQL.
 *
 * Compatibility note: the existing finished portal scripts historically call
 * SharedMockUsers / SharedMockDoctors / SharedMockAppointments.  To avoid
 * redesigning those files, this bridge exposes compatibility aliases with the
 * same method names, but every record comes from Laravel.  The old seeded
 * fixtures are kept separately under shared/demo/ and are not loaded by the
 * live portals.
 */
(function (global) {
  'use strict';

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[$()*+.?[\\\]^{|}-]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function csrfHeaders() {
    var h = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    var token = cookie('XSRF-TOKEN');
    if (token) h['X-XSRF-TOKEN'] = token;
    return h;
  }
  function request(method, url, body) {
    var xhr = new XMLHttpRequest();
    try {
      xhr.open(method, url, false); // deliberate compatibility preload for frozen portal scripts
      xhr.setRequestHeader('Accept', 'application/json');
      if (body !== undefined && body !== null) {
        xhr.setRequestHeader('Content-Type', 'application/json');
        var xsrf = cookie('XSRF-TOKEN');
        if (xsrf) xhr.setRequestHeader('X-XSRF-TOKEN', xsrf);
      }
      xhr.send(body === undefined || body === null ? null : JSON.stringify(body));
      var parsed = null;
      try { parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (e) { parsed = null; }
      if (xhr.status >= 200 && xhr.status < 300) return { ok: true, status: xhr.status, data: parsed };
      return { ok: false, status: xhr.status, data: parsed, error: (parsed && (parsed.message || parsed.status)) || ('HTTP ' + xhr.status) };
    } catch (e) {
      return { ok: false, status: 0, data: null, error: e && e.message ? e.message : 'Network error' };
    }
  }
  function payload(r, key, fallback) {
    if (!r || !r.ok || !r.data) return fallback;
    if (r.data.data && key && r.data.data[key] !== undefined) return r.data.data[key];
    if (key && r.data[key] !== undefined) return r.data[key];
    return fallback;
  }
  function sessionUser() {
    try {
      var u = JSON.parse(sessionStorage.getItem('user') || sessionStorage.getItem('vhs_user') || 'null');
      return u || null;
    } catch (e) { return null; }
  }
  function role() {
    var u = sessionUser();
    return String((u && u.role) || '').toLowerCase();
  }

  var state = { users: [], pets: [], doctors: [], services: [], appointments: [], me: sessionUser() };

  function normalizeUser(u) {
    if (!u) return null;
    var id = u.id || u.userId || u.user_id || null;
    var rawName = String(u.name || u.fullName || u.full_name || '').trim();
    var nameParts = rawName ? rawName.split(/\s+/) : [];
    var firstName = u.firstName || u.first_name || (nameParts[0] || '');
    var lastName = u.lastName || u.last_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');
    var middleName = u.middleName || u.middle_name || '';
    var fullName = rawName || [firstName, lastName].filter(Boolean).join(' ');
    return Object.assign({}, u, {
      userId: id,
      user_id: id,
      id: id,
      firstName: firstName,
      first_name: firstName,
      middleName: middleName,
      middle_name: middleName,
      lastName: lastName,
      last_name: lastName,
      name: fullName,
      fullName: fullName,
      employeeId: u.employeeId || u.employee_id || '',
      employee_id: u.employee_id || u.employeeId || '',
      address: u.address || '',
      birthdate: u.birthdate || u.bday || '',
      bday: u.bday || u.birthdate || '',
      status: u.status || 'active'
    });
  }
  function normalizePet(p) {
    if (!p) return null;
    return Object.assign({}, p, {
      petId: p.petId || p.id,
      id: p.id || p.petId,
      ownerId: p.ownerId || p.owner_id || p.user_id,
      species: p.species || p.type || '',
      type: p.type || p.species || '',
      speciesCustom: p.speciesCustom || p.species_custom || '',
      breedCustom: p.breedCustom || p.breed_custom || '',
      weightKg: p.weightKg !== undefined ? p.weightKg : (p.weight_kg !== undefined ? p.weight_kg : p.weight),
      weight: p.weight !== undefined ? p.weight : (p.weightKg !== undefined ? p.weightKg : p.weight_kg),
      reproductiveStatus: p.reproductiveStatus || p.reproductive_status || '',
      microchipId: p.microchipId || p.microchip_id || p.microchip || '',
      chronicConditions: p.chronicConditions || p.chronic_conditions || ''
    });
  }
  function normalizeDoctor(d) {
    if (!d) return null;
    return Object.assign({}, d, {
      doctorId: d.doctorId || d.id,
      id: d.id || d.doctorId,
      userId: d.userId || d.user_id,
      firstName: d.firstName || d.first_name || '',
      middleName: d.middleName || d.middle_name || '',
      lastName: d.lastName || d.last_name || '',
      name: d.name || d.displayName || d.display_name || '',
      employeeId: d.employeeId || d.employee_id || '',
      employee_id: d.employee_id || d.employeeId || '',
      specialization: d.specialization || '',
      accountStatus: d.accountStatus || d.account_status || 'active',
      availabilityStatus: d.availabilityStatus || d.availability_status || 'on_duty'
    });
  }
  function normalizeService(s) {
    if (!s) return null;
    return Object.assign({}, s, {
      serviceId: s.serviceId || s.id,
      id: s.id || s.serviceId,
      group: s.group || s.category || 'Other',
      category: s.category || s.group || 'Other',
      active: s.active !== false
    });
  }
  function normalizeAppointment(a) {
    if (!a) return null;
    var ownerName = a.owner_name || (a.owner && a.owner.name) || '';
    var ownerPhone = a.owner_phone || (a.owner && a.owner.phone) || '';
    var petName = a.pet_name || (a.pet && a.pet.name) || '';
    var petSpecies = a.pet_type || (a.pet && a.pet.species) || '';
    var petBreed = a.pet_breed || (a.pet && a.pet.breed) || '';
    return Object.assign({}, a, {
      appointmentId: a.appointmentId || a.appointment_id || a.id,
      id: a.id || a.appointmentId || a.appointment_id,
      referenceNo: a.referenceNo || a.reference_no || '',
      reference_no: a.reference_no || a.referenceNo || '',
      userId: a.userId || a.user_id,
      petId: a.petId || a.pet_id,
      assignedVetId: a.assignedVetId || a.staff_id || a.assigned_vet_id,
      service: a.service || a.service_value || a.serviceLabelAtBooking || a.service_label_at_booking || '',
      appointmentDate: a.appointmentDate || a.appointment_date || a.date || '',
      appointmentTime: a.appointmentTime || a.appointment_time || a.time || '',
      date: a.date || a.appointmentDate || a.appointment_date || '',
      time: a.time || a.appointmentTime || a.appointment_time || '',
      visitContext: a.visitContext || a.visit_context || '',
      customVisitContext: a.customVisitContext || a.custom_visit_context || '',
      checkedInAt: a.checkedInAt || a.checked_in_at || null,
      owner: { name: ownerName, phone: ownerPhone },
      pet: { name: petName, species: petSpecies, breed: petBreed },
      pet_name: petName, pet_type: petSpecies, pet_breed: petBreed,
      owner_name: ownerName, owner_phone: ownerPhone
    });
  }

  function hydrate() {
    var rMe = request('GET', '/api/auth/me');
    var me = payload(rMe, 'user', null);
    if (me) {
      state.me = normalizeUser(me);
      try {
        var old = sessionUser() || {};
        var merged = Object.assign({}, old, state.me);
        sessionStorage.setItem('user', JSON.stringify(merged));
        sessionStorage.setItem('vhs_user', JSON.stringify({
          id: state.me.id,
          userId: state.me.userId,
          firstName: state.me.firstName,
          lastName: state.me.lastName,
          fullName: state.me.fullName,
          email: state.me.email,
          role: state.me.role
        }));
      } catch (e) { /* ignore */ }
      try {
        document.querySelectorAll('.sidebar-user-name').forEach(function (el) {
          if (state.me && state.me.fullName) el.textContent = state.me.fullName;
        });
      } catch (e) { /* ignore */ }
    } else {
      state.me = null;
      state.users = [];
      state.pets = [];
      state.doctors = [];
      state.appointments = [];
    }

    var rSvc = request('GET', '/api/services');
    state.services = (payload(rSvc, 'services', []) || []).map(normalizeService);

    if (!state.me) return;

    var rDocs = request('GET', '/api/doctors');
    state.doctors = (payload(rDocs, 'doctors', []) || []).map(normalizeDoctor);

    var rr = String(state.me.role || '').toLowerCase();
    if (rr === 'admin') {
      var rUsers = request('GET', '/api/users');
      state.users = (payload(rUsers, 'users', []) || []).map(normalizeUser);
      var rPets = request('GET', '/php_files/get_pets.php');
      state.pets = (rPets.ok && Array.isArray(rPets.data) ? rPets.data : []).map(normalizePet);
    } else if (rr === 'user') {
      state.users = [normalizeUser(state.me)];
      var myPets = request('GET', '/api/users/me/pets');
      state.pets = (payload(myPets, 'pets', []) || []).map(normalizePet);
    } else if (rr === 'doctor') {
      state.users = [];
      var docPets = request('GET', '/php_files/get_pets.php');
      state.pets = (docPets.ok && Array.isArray(docPets.data) ? docPets.data : []).map(normalizePet);
    }

    var rAppts = request('GET', '/api/appointments');
    state.appointments = (payload(rAppts, 'appointments', []) || []).map(normalizeAppointment);
  }

  function enforcePortalRole() {
    var path = String(location.pathname || '').toLowerCase();
    var r = String((state.me && state.me.role) || '').toLowerCase();
    var required = path.indexOf('/admin/') !== -1 ? 'admin' : (path.indexOf('/doctor/') !== -1 ? 'doctor' : (path.indexOf('/user/') !== -1 ? 'user' : ''));
    if (required && r !== required) {
      location.replace('/web-page/index.html');
      return false;
    }
    return true;
  }
  function refreshAll() { hydrate(); enforcePortalRole(); return state; }
  hydrate();
  enforcePortalRole();

  var UsersCompat = {
    users: function () { return clone(state.users); },
    byId: function (id) { return clone(state.users.find(function (u) { return String(u.userId) === String(id); }) || null); },
    currentUserId: state.me ? (state.me.userId || state.me.id) : null,
    currentUser: function () { return clone(state.me); },
    pets: function () { return clone(state.pets); },
    petById: function (id) { return clone(state.pets.find(function (p) { return String(p.petId) === String(id); }) || null); },
    petsOfOwner: function (id) { return clone(state.pets.filter(function (p) { return String(p.ownerId) === String(id); })); },
    petsForCurrentUser: function () { var id = state.me && (state.me.userId || state.me.id); return this.petsOfOwner(id); },
    updateUser: function (id, fields) {
      var body = {};
      if (fields.firstName !== undefined) body.firstName = fields.firstName;
      if (fields.middleName !== undefined) body.middleName = fields.middleName;
      if (fields.lastName !== undefined) body.lastName = fields.lastName;
      if (fields.email !== undefined) body.email = fields.email;
      if (fields.phone !== undefined) body.phone = fields.phone;
      if (fields.address !== undefined) body.address = fields.address;
      if (fields.birthdate !== undefined) body.birthdate = fields.birthdate;
      var r = request('PATCH', '/api/users/' + encodeURIComponent(id), body);
      if (!r.ok) return { ok: false, error: r.error };
      var u = normalizeUser(payload(r, 'user', null));
      state.users = state.users.filter(function (x) { return String(x.userId) !== String(id); });
      if (u) state.users.push(u);
      if (state.me && String(state.me.id) === String(id)) state.me = u;
      return { ok: true, user: clone(u) };
    },
    addUser: function (f) {
      var r = request('POST', '/api/users', { firstName:f.firstName, middleName:f.middleName||'', lastName:f.lastName, email:f.email, phone:f.phone||'', address:f.address||'', birthdate:f.birthdate||null });
      if (!r.ok) return { ok:false, error:r.status===422?'invalid':r.error };
      var u=normalizeUser(payload(r,'user',null)); if(u) state.users.push(u); return {ok:true,user:clone(u)};
    },
    setUserStatus: function (id, status) {
      var r=request('PATCH','/api/users/'+encodeURIComponent(id)+'/status',{status:status==='inactive'?'inactive':'active'});
      if(!r.ok)return {ok:false,error:r.error}; var u=normalizeUser(payload(r,'user',null));
      state.users=state.users.map(function(x){return String(x.userId)===String(id)?u:x;}); return {ok:true,user:clone(u)};
    },
    updatePet: function (id, f) {
      var body=Object.assign({},f); if(body.weightKg!==undefined) body.weight_kg=body.weightKg; if(body.reproductiveStatus!==undefined) body.reproductive_status=body.reproductiveStatus; if(body.microchipId!==undefined) body.microchip_id=body.microchipId; if(body.chronicConditions!==undefined) body.chronic_conditions=body.chronicConditions;
      var r=request('PATCH','/api/pets/'+encodeURIComponent(id),body); if(!r.ok)return {ok:false,error:r.error}; var p=normalizePet(payload(r,'pet',null)); state.pets=state.pets.map(function(x){return String(x.petId)===String(id)?p:x;}); return {ok:true,pet:clone(p)};
    },
    addPet: function (f) {
      var body=Object.assign({},f,{owner_id:f.ownerId}); if(body.weightKg!==undefined) body.weight_kg=body.weightKg; if(body.reproductiveStatus!==undefined) body.reproductive_status=body.reproductiveStatus; if(body.microchipId!==undefined) body.microchip_id=body.microchipId; if(body.chronicConditions!==undefined) body.chronic_conditions=body.chronicConditions;
      var r=request('POST','/api/pets',body); if(!r.ok)return {ok:false,error:r.error}; var p=normalizePet(payload(r,'pet',null)); if(p)state.pets.unshift(p); return {ok:true,pet:clone(p)};
    },
    services: function(){return clone(state.services);},
    activeServices:function(){return clone(state.services.filter(function(s){return s.active!==false;}));},
    serviceById:function(id){return clone(state.services.find(function(s){return String(s.serviceId)===String(id);})||null);},
    serviceByValue:function(v){v=String(v||'').toLowerCase();return clone(state.services.find(function(s){return String(s.value||'').toLowerCase()===v||String(s.label||'').toLowerCase()===v;})||null);},
    serviceInUse:function(v){var target=String(v||'').toLowerCase();return state.appointments.some(function(a){return String(a.service||'').toLowerCase()===target||String(a.serviceLabelAtBooking||'').toLowerCase()===target;});},
    addService:function(f){var r=request('POST','/api/services',{value:f.value||undefined,label:f.label,group:f.group||'Other',price:parseFloat(f.price)||0,active:f.active!==false});if(!r.ok)return{ok:false,error:r.status===409?'duplicate':r.error};var s=normalizeService(payload(r,'service',null));if(s)state.services.push(s);return{ok:true,service:clone(s)};},
    updateService:function(id,f){var body={};if(f.label!==undefined)body.label=f.label;if(f.group!==undefined)body.group=f.group;if(f.price!==undefined)body.price=parseFloat(f.price)||0;var r=request('PATCH','/api/services/'+encodeURIComponent(id),body);if(!r.ok)return{ok:false,error:r.error};var s=normalizeService(payload(r,'service',null));state.services=state.services.map(function(x){return String(x.serviceId)===String(id)?s:x;});if(f.active!==undefined&&s&&s.active!==f.active)this.setServiceStatus(id,f.active);return{ok:true,service:this.serviceById(id)};},
    setServiceStatus:function(id,active){var r=request('PATCH','/api/services/'+encodeURIComponent(id)+'/status',{active:active!==false});if(!r.ok)return{ok:false,error:r.error};var s=normalizeService(payload(r,'service',null));state.services=state.services.map(function(x){return String(x.serviceId)===String(id)?s:x;});return{ok:true,service:clone(s)};},
    deleteService:function(id){var r=request('DELETE','/api/services/'+encodeURIComponent(id));if(!r.ok)return{ok:false,error:r.status===409?'in_use':r.error};state.services=state.services.filter(function(x){return String(x.serviceId)!==String(id);});return{ok:true};},
    canDeleteService:function(id){var s=this.serviceById(id);return !!s&&!this.serviceInUse(s.value)&&!this.serviceInUse(s.label);},
    serviceLabel:function(v){var s=this.serviceByValue(v);return s?s.label:String(v||'');},
    serviceValue:function(v){var s=this.serviceByValue(v);return s?s.value:String(v||'');},
    _refresh:refreshAll
  };

  var AVAILABILITY={ON_DUTY:'on_duty',ON_BREAK:'on_break',OFF_DUTY:'on_break',ON_LEAVE:'on_leave'};
  var DoctorCompat={
    AVAILABILITY:AVAILABILITY,
    AVAILABILITY_LABELS:{on_duty:'On Duty',on_break:'On Break',on_leave:'On Leave'},
    doctors:function(){return clone(state.doctors);},
    byId:function(id){return clone(state.doctors.find(function(d){return String(d.doctorId)===String(id);})||null);},
    byUserId:function(id){return clone(state.doctors.find(function(d){return String(d.userId)===String(id);})||null);},
    currentDoctor:function(){var me=state.me||sessionUser();var id=me&&(me.id||me.userId);return this.byUserId(id)||clone(state.doctors.length===1?state.doctors[0]:null);},
    activeDoctors:function(){return clone(state.doctors.filter(function(d){return d.accountStatus!=='inactive';}));},
    availabilityLabel:function(v){return this.AVAILABILITY_LABELS[v]||v||'';},
    addDoctor:function(f){var r=request('POST','/api/doctors',{firstName:f.firstName,middleName:f.middleName||'',lastName:f.lastName,email:f.email,phone:f.phone||'',specialization:f.specialization||''});if(!r.ok)return{ok:false,error:r.status===422?'invalid':r.error};var d=normalizeDoctor(payload(r,'doctor',null));if(d)state.doctors.push(d);return{ok:true,doctor:clone(d)};},
    updateDoctor:function(id,f){var body={};['firstName','middleName','lastName','email','phone','specialization'].forEach(function(k){if(f[k]!==undefined)body[k]=f[k];});var r=request('PATCH','/api/doctors/'+encodeURIComponent(id),body);if(!r.ok)return{ok:false,error:r.error};var d=normalizeDoctor(payload(r,'doctor',null));state.doctors=state.doctors.map(function(x){return String(x.doctorId)===String(id)?d:x;});return{ok:true,doctor:clone(d)};},
    setAccountStatus:function(id,status){var r=request('PATCH','/api/doctors/'+encodeURIComponent(id)+'/status',{account_status:status==='inactive'?'inactive':'active'});if(!r.ok)return{ok:false,error:r.error};var d=normalizeDoctor(payload(r,'doctor',null));state.doctors=state.doctors.map(function(x){return String(x.doctorId)===String(id)?d:x;});return{ok:true,doctor:clone(d)};},
    setAvailability:function(id,value){var backendValue=value==='off_duty'?'on_break':value;var r=request('PATCH','/api/doctors/'+encodeURIComponent(id)+'/availability',{availability_status:backendValue});if(!r.ok)return{ok:false,error:r.error};var d=normalizeDoctor(payload(r,'doctor',null));state.doctors=state.doctors.map(function(x){return String(x.doctorId)===String(id)?d:x;});return{ok:true,doctor:clone(d)};},
    _refresh:refreshAll
  };

  function findAppt(id){return state.appointments.find(function(a){return String(a.appointmentId)===String(id)||String(a.id)===String(id);})||null;}
  var AppointmentCompat={
    today:(function(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})(),
    all:function(){return clone(state.appointments);},getAll:function(){return this.all();},
    byId:function(id){return clone(findAppt(id));},getById:function(id){return this.byId(id);},
    byReference:function(ref){var v=String(ref||'').trim().toLowerCase();return clone(state.appointments.find(function(a){return String(a.referenceNo||'').toLowerCase()===v;})||null);},getByReference:function(ref){return this.byReference(ref);},
    todays:function(date){var d=date||this.today;return clone(state.appointments.filter(function(a){return a.appointmentDate===d;}));},
    lookup:function(v){return this.byReference(v)||this.byId(v);},
    add:function(a){refreshAll();var id=a&&(a.appointmentId||a.id);var hit=id?findAppt(id):null;return hit?{ok:true,appointment:clone(hit)}:{ok:false,error:'use_backend_booking'};},
    update:function(id,f){if(f.status!==undefined)return this.setStatus(id,f.status);if(f.appointmentDate||f.appointmentTime)return this.reschedule(id,f.appointmentDate,f.appointmentTime,f.notes);return{ok:false,error:'unsupported'};},
    reschedule:function(id,date,time,notes){var r=request('PATCH','/api/appointments/'+encodeURIComponent(id),{appointment_date:date,appointment_time:time,notes:notes||null});if(!r.ok)return{ok:false,error:r.error};var a=normalizeAppointment(payload(r,'appointment',null));state.appointments=state.appointments.map(function(x){return String(x.appointmentId)===String(id)?a:x;});return{ok:true,appointment:clone(a)};},
    setStatus:function(id,next){var r=request('PATCH','/api/appointments/'+encodeURIComponent(id)+'/status',{status:next});if(!r.ok)return{ok:false,error:r.error};var a=normalizeAppointment(payload(r,'appointment',null));state.appointments=state.appointments.map(function(x){return String(x.appointmentId)===String(id)?a:x;});return{ok:true,appointment:clone(a)};},
    updateStatus:function(id,next){return this.setStatus(id,next);},checkIn:function(id){return this.setStatus(id,'checked_in');},
    takenSlots:function(date,exclude){
      var url='/api/availability?date='+encodeURIComponent(date||'');
      if(exclude)url+='&exclude_id='+encodeURIComponent(exclude);
      var r=request('GET',url);
      if(r.ok){
        var booked=payload(r,'booked_slots',[]);
        return (booked||[]).map(function(t){return window.AppointmentContract?window.AppointmentContract.timeToHHMM(t):String(t||'').slice(0,5);});
      }
      // Fail closed: if the server cannot confirm availability, return every
      // generated slot as occupied rather than incorrectly offering a slot.
      var generated=(window.VHSClinicSettings&&window.VHSClinicSettings.slotsFor)?window.VHSClinicSettings.slotsFor(date):[];
      return generated.map(function(t){return window.AppointmentContract?window.AppointmentContract.timeToHHMM(t):t;});
    },
    availableSlots:function(date,exclude){
      var url='/api/availability?date='+encodeURIComponent(date||'');
      if(exclude)url+='&exclude_id='+encodeURIComponent(exclude);
      var r=request('GET',url); if(!r.ok)return [];
      return clone(payload(r,'display_slots',[])||[]);
    },
    isSlotAvailable:function(date,time,exclude){var hh=window.AppointmentContract?window.AppointmentContract.timeToHHMM(time):time;return this.takenSlots(date,exclude).indexOf(hh)<0;},
    _refresh:refreshAll
  };

  global.VHSLiveData={state:state,refresh:refreshAll,request:request};
  global.VHSUsers=UsersCompat;
  global.VHSDoctors=DoctorCompat;
  global.VHSAppointments=AppointmentCompat;
  // Compatibility aliases only: these names no longer contain seeded mock records.
  global.SharedMockUsers=UsersCompat;
  global.SharedMockDoctors=DoctorCompat;
  global.SharedMockAppointments=AppointmentCompat;
})(window);
