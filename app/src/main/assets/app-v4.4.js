'use strict';

/* Job Buddy v4.5 — dashboard-first home experience. */
function homeDocumentSummary44(){
  if(typeof documents==='undefined'||!Array.isArray(documents))return{alerts:0,text:'Open Documents to add files'};
  const expired=documents.filter(d=>typeof docStatus==='function'&&docStatus(d).key==='expired').length;
  const expiring=documents.filter(d=>typeof docStatus==='function'&&docStatus(d).key==='expiring').length;
  if(expired)return{alerts:expired+expiring,text:expired+' need replacement'+(expiring?' • '+expiring+' expiring soon':'')};
  if(expiring)return{alerts:expiring,text:expiring+' expiring soon'};
  return{alerts:0,text:documents.length?'All saved documents current':'No documents uploaded'};
}
function homeDriveState44(){
  try{return native()&&AndroidBridge.isBackupConnected&&AndroidBridge.isBackupConnected()?'Connected':'Not connected'}catch(e){return'Not connected'}
}
function homeGreeting44(){
  const hour=new Date().getHours(),g=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
  return profile?.name?g+', '+String(profile.name).trim().split(/\s+/)[0]:g;
}
renderDashboard=function(){
  const now=new Date(),today=localDate(now),month=currentMonth(),bounds=monthBounds(month),m=sumRange(bounds.from,today);
  const totalMins=shifts.reduce((n,s)=>n+Number(s.paidMinutes||0),0),totalPay=shifts.reduce((n,s)=>n+Number(s.total||0),0);
  const future=scheduled.filter(s=>s.status==='planned'&&(s.date+s.start)>=today+'00:00').sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  const reminders=upcomingReminderItems(),due=reminders.filter(r=>r.date<=today||dateTimeMs(r.date,r.time)<=Date.now()+7*86400000);
  const receivedThis=payrolls.flatMap(p=>p.receipts||[]).filter(r=>String(r.date).slice(0,7)===month).reduce((n,r)=>n+Number(r.amount||0),0);
  const docs=homeDocumentSummary44();
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val};
  set('homeGreeting',homeGreeting44());set('homeTotalHours',hm(totalMins));set('homeShiftCount',shifts.length+' completed shift'+(shifts.length===1?'':'s'));
  set('homeTotalEarnings',money(totalPay));set('homeMonthEarnings',money(m.pay)+' earned this month');
  set('monthHours',hm(m.mins));set('monthPay',money(m.pay));set('salaryRemaining',money(allSalaryRemaining()));set('salaryReceivedMonth',money(receivedThis)+' received this month');
  set('scheduledCount',String(future.length));set('nextShiftText',future[0]?niceDate(future[0].date)+' • '+future[0].start:'No future shift');set('reminderCount',String(due.length));
  set('homeDocumentAlerts',String(docs.alerts));set('homeDocumentText',docs.text);set('homeBackupState',homeDriveState44());
  const upcoming=document.getElementById('upcomingShiftList');if(upcoming)upcoming.innerHTML=future.length?scheduledCard(future[0]):'<div class="empty">No upcoming shift. Tap Schedule to create one with a notification.</div>';
  const reminderBox=document.getElementById('dashboardReminderList');if(reminderBox)reminderBox.innerHTML=reminders.length?reminders.slice(0,2).map(reminderCard).join(''):'<div class="empty">No urgent shift or payment reminders.</div>';
  const recent=[...shifts].sort((x,y)=>(y.date+y.start).localeCompare(x.date+x.start)).slice(0,2),recentBox=document.getElementById('recentList');if(recentBox)recentBox.innerHTML=recent.length?recent.map(shiftCard).join(''):'<div class="empty">No completed shifts yet. Tap Add shift to begin.</div>';
};

const baseGo44=go;
go=function(p){baseGo44(p);if(p==='dashboard')renderDashboard()};
const baseRenderAll44=renderAll;
renderAll=function(){baseRenderAll44();renderDashboard()};
setTimeout(()=>{renderDashboard();document.querySelectorAll('.version').forEach(x=>x.textContent='Job Buddy v4.5')},650);
