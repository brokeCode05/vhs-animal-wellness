(function(global){
  'use strict';
  function describe(data,time){
    if(!data || !data.duration_estimate)return '';
    var e=data.duration_estimate, parts=[];
    if(e.minutes==null)parts.push('Duration unknown; the clinic may need to adjust timing.');
    else {
      parts.push('Estimated visit: '+e.minutes+' min'+(e.buffer_minutes>0?' + '+e.buffer_minutes+' min buffer':'')+'.');
      var index=(data.display_slots||[]).indexOf(time);
      var hhmm=index<0?time:(data.slots||[])[index];
      var slot=(data.slot_details||[]).find(function(s){return s.time===hhmm;});
      if(slot && slot.estimated_end){var date=new Date(slot.estimated_end);if(!isNaN(date.getTime()))parts.push('Estimated end '+date.toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'})+'.');}
    }
    if(data.closing_warning)parts.push('Clinic closing time is unverified.');
    return parts.join(' ');
  }
  function show(select,data){
    if(!select)return;
    var id=select.id+'-duration-info',node=document.getElementById(id);
    if(!node){node=document.createElement('p');node.id=id;node.className='helper';node.setAttribute('role','status');select.insertAdjacentElement('afterend',node);}
    select._schedulingData=data||null;node.textContent=describe(data,select.value);
    if(!select._schedulingListener){select._schedulingListener=true;select.addEventListener('change',function(){node.textContent=describe(select._schedulingData,select.value);});}
  }
  global.VHSSchedulingDisplay={describe:describe,show:show};
})(window);
