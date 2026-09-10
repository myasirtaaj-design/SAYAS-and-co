'use strict';

/* Job Buddy v4.6 — clean sectioned home dashboard. */
function jbSet(id,value){const el=document.getElementById(id);if(el)el.textContent=value}
function jbHomeDocumentSummary(){
  if(typeof documents==='undefined'||!Array.isArray(documents))return{alerts:0,text:'No documents uploaded'};
  const expired=documents.filter(d=>typeof docStatus==='function'&&docStatus(d).key==='expired').length;
  const expiring=documents.filter(d=>typeof docStatus==='function'&&docStatus(d).key==='expiring').length;
  if(expired)return{alerts:expired+expiring,text:expired+' need replacement'+(expiring?' • '+expiring+' expiring soon':'')};
  if(expiring)return{alerts:expiring,text:expiring+' expiring soon'};
  return{alerts:0,text:documents.length?'All saved documents current':'No documents uploaded'};
}
function jbDriveState(){try{return native()&&AndroidBridge.isBackupConnected&&AndroidBridge.isBackupConnected()?'Connected':'Not connected'}catch(e){return'Not connected'}}
function jbGreeting(){const h=new Date().getHours(),g=h<12?'Good morning':h<18?'Good afternoon':'Good evening';return profile?.name?g+', '+String(profile.name).trim().split(/\s+/)[0]:g}
function jbDateLabel(){try{return new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long'}).format(new Date())}catch(e){return 'Today'}}
function jbHomeEmpty(text){return '<div class="jb-home-empty">'+esc(text)+'</div>'}
function jbNextShiftItem(s){
  if(!s)return jbHomeEmpty('No shift scheduled. Add one and choose when you want to be reminded.');
  return `<div class="jb-home-item"><span class="jb-home-item-icon">◷</span><div class="jb-home-item-main"><b>${esc(s.location||'Scheduled shift')}</b><small>${esc(employerName(s))} • ${niceDate(s.date)} • ${s.start}–${s.end}</small></div><div class="jb-home-item-value"><b>${money(s.rate)}/hr</b><small>${esc(s.role||'Shift')}</small></div></div>`;
}
function jbRecentItem(s){
  return `<div class="jb-home-item" onclick="openManual('${s.id}')"><span class="jb-home-item-icon">✓</span><div class="jb-home-item-main"><b>${esc(s.location||'Completed shift')}</b><small>${esc(employerName(s))} • ${niceDate(s.date)} • ${hm(s.paidMinutes)}</small></div><div class="jb-home-item-value"><b>${money(s.total)}</b><small>Edit</small></div></div>`;
}
function jbReminderItem(r){
  const status=reminderStatus(r.date),label=status==='overdue'?'Overdue':status==='due'?'Today':niceDate(r.date);
  return `<div class="jb-home-item"><span class="jb-home-item-icon">!</span><div class="jb-home-item-main"><b>${esc(r.title)}</b><small>${esc(r.text||'Reminder')}</small></div><div class="jb-home-item-value"><b>${esc(label)}</b><small>${r.type==='shift'?esc(r.time||''):''}</small></div></div>`;
}

/* Scheduled shifts remain editable and completable, without clock-in controls. */
scheduledCard=function(s){
  const status=s.status==='completed'?'<span class="pill paid">Completed</span>':s.date<localDate()?'<span class="pill danger">Past</span>':'<span class="pill">Planned</span>';
  return `<div class="reminder-entry"><div class="entryhead"><div><h3>${esc(s.location)}</h3><div class="meta"><strong>${esc(employerName(s))}</strong><br>${niceDate(s.date)} (${dayName(s.date)}) • ${s.start}–${s.end}<br>${esc(s.role||'Shift')} • ${money(s.rate)}/hr • reminder ${s.reminderMinutes?Math.round(s.reminderMinutes/60*10)/10+'h before':'at start'}</div></div>${status}</div><div class="actions">${s.status==='planned'?`<button class="mini" onclick="completeScheduledManually('${s.id}')">Add completed</button><button class="mini" onclick="openSchedule('${s.id}')">Edit</button>`:''}<button class="mini" onclick="deleteScheduledShift('${s.id}')">Delete</button></div></div>`;
};

renderDashboard=function(){
  const now=new Date(),today=localDate(now),month=currentMonth(),bounds=monthBounds(month),m=sumRange(bounds.from,today);
  const totalMins=shifts.reduce((n,s)=>n+Number(s.paidMinutes||0),0),totalPay=shifts.reduce((n,s)=>n+Number(s.total||0),0);
  const future=scheduled.filter(s=>s.status==='planned'&&(s.date+s.start)>=today+'00:00').sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  const reminders=upcomingReminderItems(),due=reminders.filter(r=>r.date<=today||dateTimeMs(r.date,r.time)<=Date.now()+7*86400000);
  const receivedThis=payrolls.flatMap(p=>p.receipts||[]).filter(r=>String(r.date).slice(0,7)===month).reduce((n,r)=>n+Number(r.amount||0),0);
  const docSummary=jbHomeDocumentSummary(),remaining=allSalaryRemaining(),drive=jbDriveState();
  jbSet('homeGreeting',jbGreeting());jbSet('homeDate',jbDateLabel());
  jbSet('homeTotalHours',hm(totalMins));jbSet('homeShiftCount',shifts.length+' completed shift'+(shifts.length===1?'':'s'));
  jbSet('homeTotalEarnings',money(totalPay));jbSet('homeMonthEarnings',money(m.pay)+' earned this month');
  jbSet('salaryRemaining',money(remaining));jbSet('salaryReceivedMonth',money(receivedThis)+' received this month');
  jbSet('monthHours',hm(m.mins));jbSet('monthPay',money(m.pay));jbSet('homeReceivedMonth',money(receivedThis));
  jbSet('scheduledCount',String(future.length));jbSet('nextShiftText',future[0]?niceDate(future[0].date)+' • '+future[0].start:'No future shift');
  jbSet('homeDocumentAlerts',String(docSummary.alerts));jbSet('homeDocumentText',docSummary.text);jbSet('reminderCount',String(due.length));jbSet('homeBackupState',drive);
  const attention=(remaining>0?1:0)+docSummary.alerts+due.length+(drive==='Connected'?0:1);jbSet('homeAttentionCount',String(attention));
  const upcoming=document.getElementById('upcomingShiftList');if(upcoming)upcoming.innerHTML=jbNextShiftItem(future[0]);
  const recent=[...shifts].sort((x,y)=>(y.date+y.start).localeCompare(x.date+x.start)).slice(0,2),recentBox=document.getElementById('recentList');if(recentBox)recentBox.innerHTML=recent.length?recent.map(jbRecentItem).join(''):jbHomeEmpty('No completed shifts yet. Tap Add shift to begin.');
  const reminderBox=document.getElementById('dashboardReminderList');if(reminderBox)reminderBox.innerHTML=reminders.length?reminders.slice(0,2).map(jbReminderItem).join(''):jbHomeEmpty('No upcoming payment or shift reminders.');
};

const jbBaseGo=go;go=function(page){jbBaseGo(page);if(page==='dashboard')renderDashboard()};
const jbBaseRenderAll=renderAll;renderAll=function(){jbBaseRenderAll();renderDashboard()};
setTimeout(()=>{renderDashboard();document.querySelectorAll('.version').forEach(x=>x.textContent='Job Buddy v4.6')},700);
