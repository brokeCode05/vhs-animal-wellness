/* VHS DOCUMENT STORE — Laravel-backed compatibility API. */
(function (global) {
  'use strict';
  var TYPE_LABELS = { consultation_summary:'Consultation Summary', prescription:'Prescription', lab_request:'Lab Request', lab_result:'Lab Result', receipt:'Receipt' };
  var cache = [];
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function request(url){
    var xhr=new XMLHttpRequest();
    try{xhr.open('GET',url,false);xhr.setRequestHeader('Accept','application/json');xhr.send();var data=null;try{data=xhr.responseText?JSON.parse(xhr.responseText):null;}catch(e){}
      return {ok:xhr.status>=200&&xhr.status<300,data:data};
    }catch(e){return{ok:false,data:null};}
  }
  function refresh(){
    var r=request('/api/documents');
    if(r.ok&&r.data&&r.data.data&&Array.isArray(r.data.data.documents))cache=r.data.data.documents;
    return clone(cache);
  }
  function all(){return refresh();}
  global.SharedDocuments={
    typeLabel:function(type){return TYPE_LABELS[type]||type;},
    getAll:all,
    forUser:function(userId){return all().filter(function(d){return String(d.userId)===String(userId);});},
    forPet:function(petId){return all().filter(function(d){return String(d.petId)===String(petId);});},
    forAppointment:function(id){return all().filter(function(d){return String(d.appointmentId)===String(id);});},
    byId:function(id){return all().find(function(d){return String(d.docId||d.id)===String(id);})||null;},
    // Explicit user-visible document open. Unlike byId(), this calls the
    // document show endpoint so Laravel can enforce authorization and record
    // the semantic `document_viewed` audit event.
    viewById:function(id){
      var r=request('/api/documents/'+encodeURIComponent(id));
      var doc=r.ok&&r.data&&r.data.data?r.data.data.document:null;
      if(!doc)return null;
      var i=cache.findIndex(function(d){return String(d.docId||d.id)===String(doc.docId||doc.id);});
      if(i>=0)cache[i]=doc;else cache.unshift(doc);
      return clone(doc);
    },
    // Clinical completion now creates finalized documents server-side.
    add:function(){return null;},
    finalizeFromConsultation:function(){refresh();return[];},
    clearDemoData:function(){return false;},
    refresh:refresh
  };
})(window);
