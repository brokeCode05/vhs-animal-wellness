/* REQ017 — show only active announcements from Laravel, not stale fixtures. */
(function(window,document){
  'use strict';
  var track=document.getElementById('announcementsLiveTrack');
  var dots=document.getElementById('announcementsLiveDots');
  if(!track||!dots)return;
  var slides=[],current=0,timer=null;
  function show(index){if(!slides.length)return;current=(index+slides.length)%slides.length;track.style.transform='translateX(-'+(current*100)+'%)';Array.prototype.forEach.call(dots.children,function(b,i){b.classList.toggle('active',i===current);});}
  function resume(){window.clearInterval(timer);if(slides.length>1)timer=window.setInterval(function(){show(current+1);},4000);}
  function build(items){
    window.clearInterval(timer);current=0;track.replaceChildren();dots.replaceChildren();
    if(!items.length){items=[{title:'No clinic announcements',message:'No active announcements are available at this time.',badgeType:'info'}];}
    items.forEach(function(item,i){
      var slide=document.createElement('div');slide.className='announcement-slide';
      var badge=document.createElement('span');badge.className='announcement-badge '+(item.badgeType==='new'?'new':'info');badge.textContent=item.badgeType==='new'?'New':'Info';
      var body=document.createElement('div');body.className='announcement-slide-body';
      var title=document.createElement('strong');title.textContent=item.title||'Clinic notice';
      var msg=document.createElement('p');msg.textContent=item.message||'';body.append(title,msg);slide.append(badge,body);track.appendChild(slide);
      if(items.length>1){var btn=document.createElement('button');btn.type='button';btn.className='dot'+(i===0?' active':'');btn.setAttribute('aria-label','Announcement '+(i+1));btn.addEventListener('click',function(){show(i);resume();});dots.appendChild(btn);}
    });
    slides=Array.prototype.slice.call(track.children);show(0);resume();
  }
  async function load(){
    try{
      var r=await fetch('/api/announcements',{credentials:'same-origin',headers:{Accept:'application/json'}});
      if(!r.ok)throw new Error('Could not load notices.');
      var body=await r.json();if(!body||!body.data||!Array.isArray(body.data.announcements))throw new Error('Unexpected response');
      build(body.data.announcements.filter(function(a){return a.active===true;}));
    }catch(error){build([{title:'Announcements unavailable',message:'Clinic announcements could not be retrieved. Please try again later.',badgeType:'info'}]);}
  }
  var carousel=document.querySelector('.dashboard-announcements');
  if(carousel){carousel.addEventListener('mouseenter',function(){window.clearInterval(timer);});carousel.addEventListener('mouseleave',resume);}
  document.addEventListener('visibilitychange',function(){if(document.hidden)window.clearInterval(timer);else resume();});
  load();
  window.VHSUserAnnouncements={reload:load};
})(window,document);
