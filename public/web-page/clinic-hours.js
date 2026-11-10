(function () {
  'use strict';
  var container = document.getElementById('clinic-public-hours');
  if (!container) return;
  var days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  function displayTime(value) {
    var m = /^(\d{2}):(\d{2})$/.exec(value || '');
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    var hour = +m[1];
    return (hour % 12 || 12) + ':' + m[2] + (hour < 12 ? ' AM' : ' PM');
  }
  fetch('/api/clinic-settings', {headers: {'Accept':'application/json'}, cache:'no-store'})
    .then(function (response) { if (!response.ok) throw new Error('unavailable'); return response.json(); })
    .then(function (response) {
      var schedule = response && response.data && response.data.settings && response.data.settings.operatingHours;
      if (!schedule || typeof schedule !== 'object') return;
      var lines = days.map(function(day) {
        var row = schedule[day] || {}, label = day[0].toUpperCase() + day.slice(1);
        if (row.status === 'closed') return label + ': Closed';
        if (row.status === 'open') {
          var from = displayTime(row.open), to = displayTime(row.close);
          if (from && to && row.close > row.open) return label + ': ' + from + ' – ' + to;
        }
        return label + ': Contact clinic';
      });
      container.textContent = lines.join('\n');
      container.style.whiteSpace = 'pre-line';
    }).catch(function () { /* Keep the safe contact-clinic message. */ });
})();
