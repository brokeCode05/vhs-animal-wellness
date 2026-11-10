/* REQ017 — Admin announcement CRUD, using existing Laravel routes and role gate. */
(function(window,document){
  'use strict';
  var rows=[];
  function by(id){return document.getElementById(id);}
  function notify(msg,type){if(window.showToast)window.showToast(msg,type||'info');}
  function el(tag,content){var n=document.createElement(tag);if(content!=null)n.textContent=String(content);return n;}
  function clearForm(){by('announcementForm').reset();by('announcementId').value='';by('announcementSaveBtn').textContent='Publish Announcement';by('announcementCancelEditBtn').hidden=true;by('announcementActive').checked=true;}
  function btn(label,click,klass){var b=el('button',label);b.type='button';b.className=klass||'btn-small';b.addEventListener('click',click);return b;}
  function render(){
    var tbody=by('announcementsTable');if(!tbody)return;
    tbody.replaceChildren();
    if(!rows.length){var tr=el('tr');var td=el('td','No announcements yet.');td.colSpan=5;tr.appendChild(td);tbody.appendChild(tr);return;}
    rows.forEach(function(item){
      var tr=el('tr');
      tr.appendChild(el('td',item.active?'Published':'Inactive'));
      tr.appendChild(el('td',item.badgeType==='new'?'New':'Info'));
      var body=el('td');var strong=el('strong',item.title);var p=el('p',item.message);p.style.margin='4px 0';p.style.whiteSpace='pre-wrap';body.append(strong,p);tr.appendChild(body);
      tr.appendChild(el('td',item.updatedAt?new Date(item.updatedAt).toLocaleString('en-PH'):'—'));
      var actions=el('td');actions.style.whiteSpace='nowrap';
      actions.appendChild(btn('Edit',function(){edit(item);},'btn-small'));
      actions.appendChild(document.createTextNode(' '));
      actions.appendChild(btn('Delete',function(){remove(item);},'btn-danger btn-small'));
      tr.appendChild(actions);tbody.appendChild(tr);
    });
  }
  async function load(){
    if(!window.VHSAuth)return;
    try{
      var r=await window.VHSAuth.send('announcements/manage');
      if(!r.ok)throw new Error(r.message||'Announcement list could not be loaded.');
      rows=Array.isArray(r.data&&r.data.announcements)?r.data.announcements:[];
      render();
    }catch(error){
      by('announcementsTable').replaceChildren();
      var tr=el('tr');var cell=el('td','Could not load announcements from Laravel.');cell.colSpan=5;tr.appendChild(cell);by('announcementsTable').appendChild(tr);
      notify(error.message||'Could not load announcements.','error');
    }
  }
  function edit(item){
    by('announcementId').value=item.announcementId;
    by('announcementTitle').value=item.title||'';by('announcementMessage').value=item.message||'';
    by('announcementBadge').value=item.badgeType==='new'?'new':'info';by('announcementActive').checked=!!item.active;
    by('announcementSaveBtn').textContent='Save Announcement';by('announcementCancelEditBtn').hidden=false;
    by('announcementTitle').focus();by('announcementManagement').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function save(event){
    event.preventDefault();
    if(!window.VHSAuth){notify('You must be signed in as Admin.','error');return;}
    var id=by('announcementId').value.trim();var title=by('announcementTitle').value.trim();var message=by('announcementMessage').value.trim();
    if(!title||!message){notify('Enter a title and message.','warning');return;}
    var payload={title:title,message:message,badgeType:by('announcementBadge').value,active:by('announcementActive').checked};
    var button=by('announcementSaveBtn');button.disabled=true;
    try{
      var r=id ? await window.VHSAuth.patch('announcements/'+encodeURIComponent(id),payload) : await window.VHSAuth.send('announcements',payload);
      if(!r.ok)throw new Error(r.message||'Unable to save announcement.');
      notify(id?'Announcement updated.':'Announcement published.','success');clearForm();await load();
    }catch(error){notify(error.message||'Could not save announcement.','error');}
    finally{button.disabled=false;}
  }
  async function remove(item){
    if(!window.confirm('Delete "'+item.title+'" permanently?'))return;
    try{
      var r=await window.VHSAuth.del('announcements/'+encodeURIComponent(item.announcementId));
      if(!r.ok)throw new Error(r.message||'Unable to delete announcement.');
      clearForm();notify('Announcement deleted.','success');await load();
    }catch(error){notify(error.message||'Could not delete announcement.','error');}
  }
  function init(){if(!by('announcementForm'))return;by('announcementForm').addEventListener('submit',save);by('announcementCancelEditBtn').addEventListener('click',clearForm);load();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window,document);
