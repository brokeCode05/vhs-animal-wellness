/* VHS AUDIT STORE — Laravel-backed compatibility API. */
(function (global) {
  'use strict';
  var cache=[];
  function sessionUser(){try{return JSON.parse(sessionStorage.getItem('user')||sessionStorage.getItem('vhs_user')||'null');}catch(e){return null;}}
  function request(){
    var xhr=new XMLHttpRequest();
    try{xhr.open('GET','/api/audit-logs',false);xhr.setRequestHeader('Accept','application/json');xhr.send();var data=null;try{data=xhr.responseText?JSON.parse(xhr.responseText):null;}catch(e){}
      if(xhr.status>=200&&xhr.status<300&&data&&data.data&&Array.isArray(data.data.auditLogs)){cache=data.data.auditLogs.map(function(e){return Object.assign({},e,{timestamp:e.timestamp||e.createdAt||e.created_at});});return true;}
    }catch(e){}
    return false;
  }
  function refresh(){request();return cache.slice();}
  global.AuditLog={
    adminActor:function(){var u=sessionUser()||{};return{actorType:u.role||'Admin',actorId:u.id||u.userId||'',actorName:u.name||u.fullName||[u.firstName,u.lastName].filter(Boolean).join(' ')||'Administrator'};},
    // Mutating audit entries are written by Laravel transaction code.  Keep
    // this method for frozen frontend callers but never persist browser audit.
    add:function(){return null;},
    getAll:function(){return refresh();},
    forEntity:function(type,id){return refresh().filter(function(e){return e.entityType===type&&(!id||String(e.entityId)===String(id));});},
    clearDemoData:function(){return false;},
    refresh:refresh
  };
})(window);
