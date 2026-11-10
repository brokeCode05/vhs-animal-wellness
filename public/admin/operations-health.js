(function () {
  'use strict';
  async function load() {
    var notice=document.getElementById('operationsHealth');if (!notice || !window.VHSAuth) return;
    try {
      var result=await window.VHSAuth.send('operations/health');if (!result.ok) throw new Error();
      var data=result.data;
      if (!data.scheduler_reporting) {
        notice.textContent='Automatic no-show processing has not reported recently. '+data.overdue_confirmed_visits+' overdue confirmed visit(s) await reconciliation. Ask the administrator to run the clinic scheduler; clinical consultations are not automatically closed.';
        notice.hidden=false;
      } else notice.hidden=true;
    } catch (e) { notice.textContent='Automatic appointment processing status could not be checked.';notice.hidden=false; }
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',load);else load();
})();
