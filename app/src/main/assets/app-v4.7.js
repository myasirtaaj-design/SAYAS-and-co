'use strict';

/* Job Buddy v4.8 — repaired Android exports, flexible employer pay, payment follow-ups and reliable Drive backup setup. */
const JB47_VERSION='4.8';
const JB_PAY_BASIS={hourly:'per hour',daily:'per day',weekly:'per week',fortnightly:'per 15 days',monthly:'per month'};

function jb47Basis(e){return e?.payBasis||'hourly'}
function jb47Unit(e){return JB_PAY_BASIS[jb47Basis(e)]||'per hour'}
function jb47Amount(e){return Number(e?.defaultRate||0)}
function jb47RateText(e,amount=jb47Amount(e)){return money(amount)+' '+jb47Unit(e)}
function jb47PhoneDigits(value){
  let n=String(value||'').replace(/[^0-9+]/g,'');
  if(n.startsWith('+'))n=n.slice(1);
  if(n.startsWith('00'))n=n.slice(2);
  if(n.startsWith('0'))n='44'+n.slice(1);
  return n.replace(/\D/g,'');
}
function jb47OpenUrl(url){try{if(native()&&AndroidBridge.openUrl){AndroidBridge.openUrl(url);return}location.href=url}catch(e){toast('Could not open this link')}}
function jb47WhatsApp(phone,message){const n=jb47PhoneDigits(phone);if(!n){toast('Add a WhatsApp number first');return}jb47OpenUrl('https://wa.me/'+n+'?text='+encodeURIComponent(message||'Hello'))}
function jb47EmployerMessage(empId,month='all'){
  const e=employerById(empId),remaining=month==='all'?Math.max(0,employerAllTimeStats(empId).remaining):Math.max(0,remainingFor(empId,month));
  const promises=employerPromises(empId),next=promises[0];
  return `Hello ${e?.name||''}, I am following up regarding my outstanding payment of ${money(remaining)}${month!=='all'?' for '+salaryMonthLabel(month):''}.${next?' The promised date is '+niceDate(next.date)+(next.endDate?' to '+niceDate(next.endDate):'')+'.':''} Please confirm the payment update. Thank you.`;
}
function jb47DebtMessage(id){const d=debts.find(x=>x.id===id);if(!d)return'';const rem=Math.max(0,debtRemaining(d));return d.direction==='owed_to_me'?`Hello ${d.person}, this is a reminder about the remaining ${money(rem)} for ${d.title||'our payment record'}${d.dueDate?', promised for '+niceDate(d.dueDate):''}. Please let me know the payment update. Thank you.`:`Hello ${d.person}, I am contacting you about the remaining ${money(rem)} that I need to pay for ${d.title||'our payment record'}${d.dueDate?', due '+niceDate(d.dueDate):''}.`}
function whatsappEmployer(empId,month='all'){const e=employerById(empId);jb47WhatsApp(e?.phone,jb47EmployerMessage(empId,month))}
function whatsappDebt(id){const d=debts.find(x=>x.id===id);jb47WhatsApp(d?.phone,jb47DebtMessage(id))}

function jb47PeriodKey(date,basis){
  if(basis==='daily')return date;
  if(basis==='monthly')return String(date).slice(0,7);
  if(basis==='fortnightly'){const d=Number(String(date).slice(8,10));return String(date).slice(0,7)+'-'+(d<=15?'01-15':'16-end')}
  if(basis==='weekly'){
    const dt=new Date(date+'T12:00:00'),day=(dt.getDay()+6)%7;dt.setDate(dt.getDate()-day);
    return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
  }
  return date;
}
function jb47RecalculateEmployer(empId){
  const e=employerById(empId);if(!e||jb47Basis(e)==='hourly')return;
  const ss=shifts.filter(s=>s.employerId===empId).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)),groups={};
  ss.forEach(s=>{const key=jb47PeriodKey(s.date,jb47Basis(e));(groups[key]||(groups[key]=[])).push(s)});
  Object.entries(groups).forEach(([key,list])=>{
    list.sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
    list.forEach((s,i)=>{const periodAmount=Number((list.find(x=>x.periodPayAmount!==undefined&&x.periodPayAmount!==null)?.periodPayAmount)??e.defaultRate??0),base=i===0?periodAmount:0;s.payBasis=jb47Basis(e);s.payPeriodKey=key;s.basePay=Number(base.toFixed(2));s.total=Number((base+Number(s.additional||0)-Number(s.deduction||0)).toFixed(2))});
  });
}
function jb47RecalculateAll(){employers.forEach(e=>{e.payBasis=e.payBasis||'hourly';e.phone=e.phone||'';jb47RecalculateEmployer(e.id)});debts.forEach(d=>{d.phone=d.phone||''})}
function updateEmployerPayLabel47(){
  const basis=document.getElementById('ePayBasis')?.value||'hourly',label=document.getElementById('eRateLabel'),help=document.getElementById('ePayBasisHelp');
  const names={hourly:'Standard hourly rate (£)',daily:'Standard daily pay (£)',weekly:'Standard weekly pay (£)',fortnightly:'Standard 15-day pay (£)',monthly:'Standard monthly pay (£)'};
  if(label)label.textContent=names[basis];
  if(help)help.textContent=basis==='hourly'?'Hours × rate calculates each shift. You can still change the rate on an individual shift.':`Job Buddy counts one standard amount ${JB_PAY_BASIS[basis]} for each pay period containing recorded shifts. Partial payments and previous balances remain separate.`;
}
function jb47ShiftPayHint(empId,prefix='m'){
  const e=employerById(empId),basis=jb47Basis(e),input=document.getElementById(prefix==='m'?'mRate':'schRate');if(!input)return;
  const field=input.closest('.field'),label=field?.querySelector('label');if(label)label.textContent=basis==='hourly'?'Rate per hour (£)':`Pay amount ${JB_PAY_BASIS[basis]} (£)`;
  let hint=document.getElementById(prefix+'PayBasisHint47');if(!hint&&field){hint=document.createElement('div');hint.id=prefix+'PayBasisHint47';hint.className='small jb47-pay-hint';field.appendChild(hint)}
  if(hint)hint.textContent=basis==='hourly'?'Calculated from paid hours.':`Only the first recorded shift in each ${JB_PAY_BASIS[basis].replace('per ','')} period carries the standard amount; later shifts remain listed without duplicating salary.`;
}

const jb47OpenEmployerBase=openEmployer;
openEmployer=function(id){jb47OpenEmployerBase(id);const e=id?employerById(id):null;document.getElementById('ePhone').value=e?.phone||'';document.getElementById('ePayBasis').value=jb47Basis(e);updateEmployerPayLabel47()};
const jb47SaveEmployerBase=saveEmployer;
saveEmployer=function(){
  const id=document.getElementById('eId').value||'',previous=id?employerById(id):null,oldBasis=jb47Basis(previous),basis=document.getElementById('ePayBasis').value||'hourly',phone=document.getElementById('ePhone').value.trim();
  jb47SaveEmployerBase();
  const saved=id?employerById(id):employers[employers.length-1];if(!saved)return;
  saved.payBasis=basis;saved.phone=phone;
  if(previous&&oldBasis!==basis)shifts.filter(x=>x.employerId===saved.id).forEach(x=>{delete x.periodPayAmount;delete x.payPeriodKey;delete x.basePay});
  jb47RecalculateEmployer(saved.id);persist(true);backupNow(false);toast('Employer and pay arrangement saved');
};

employerCard=function(e){
  const basis=jb47Basis(e),sites=(e.sites||[]).length?(e.sites||[]).map(s=>{const gps=s.latitude!==null&&s.longitude!==null?'GPS '+Number(s.latitude).toFixed(5)+', '+Number(s.longitude).toFixed(5):'',siteAmount=s.rateOverride!==null&&s.rateOverride!==''?Number(s.rateOverride):jb47Amount(e);return`<div class="site-row"><div><div class="site-name">${esc(s.name)}</div><div class="site-rate">${s.address?esc(s.address)+' • ':''}${jb47RateText(e,siteAmount)}${gps?' • <span class="coord">'+gps+'</span>':''}</div></div><div><button class="mini" onclick="openSite('${e.id}','${s.id}')">Edit</button> <button class="mini" onclick="deleteSite('${e.id}','${s.id}')">Delete</button></div></div>`}).join(''):'<div class="small" style="padding:8px 0">No saved sites.</div>';
  const payText='Usually paid '+(Number(e.payOffset)===0?'in the same month':Number(e.payOffset)===1?'the following month':'two months later')+' on day '+e.payDay;
  return`<div class="employer"><div class="employerhead"><div><h3>${esc(e.name)}</h3><div class="meta">Standard ${jb47RateText(e)}${e.payrollRef?' • Ref '+esc(e.payrollRef):''}${e.phone?'<br>WhatsApp '+esc(e.phone):''}<br>${esc(payText)}</div></div><div class="actions" style="margin-top:0"><button class="mini" onclick="openEmployer('${e.id}')">Edit</button><button class="mini" onclick="deleteEmployer('${e.id}')">Delete</button></div></div><div class="actions"><button class="mini" onclick="openSite('${e.id}')">＋ Add site</button><button class="mini" onclick="openPayroll('${e.id}','${currentMonth()}','adjustment')">＋ Previous balance</button><button class="mini" onclick="openPayroll('${e.id}','${currentMonth()}','promise')">＋ Promise date</button>${e.phone?`<button class="mini jb47-wa" onclick="whatsappEmployer('${e.id}','all')">WhatsApp</button>`:''}</div><div class="site-list">${sites}</div></div>`;
};

const jb47ManualEmployerBase=onManualEmployerChange;
onManualEmployerChange=function(){jb47ManualEmployerBase();jb47ShiftPayHint(document.getElementById('mEmployer').value,'m')};
const jb47ManualSiteBase=onManualSiteChange;
onManualSiteChange=function(){jb47ManualSiteBase();jb47ShiftPayHint(document.getElementById('mEmployer').value,'m')};
const jb47ScheduleEmployerBase=onScheduleEmployerChange;
onScheduleEmployerChange=function(){jb47ScheduleEmployerBase();jb47ShiftPayHint(document.getElementById('schEmployer').value,'sch')};
const jb47ScheduleSiteBase=onScheduleSiteChange;
onScheduleSiteChange=function(){jb47ScheduleSiteBase();jb47ShiftPayHint(document.getElementById('schEmployer').value,'sch')};
const jb47OpenManualBase=openManual;
openManual=function(id){jb47OpenManualBase(id);jb47ShiftPayHint(document.getElementById('mEmployer').value,'m')};
const jb47OpenScheduleBase=openSchedule;
openSchedule=function(id){jb47OpenScheduleBase(id);jb47ShiftPayHint(document.getElementById('schEmployer').value,'sch')};
const jb47SaveManualBase=saveManual;
saveManual=function(){
  const empId=document.getElementById('mEmployer').value,shiftId=document.getElementById('mId').value,enteredAmount=Number(document.getElementById('mRate').value);
  jb47SaveManualBase();
  if(!document.getElementById('shiftModal').classList.contains('open')){
    const e=employerById(empId),saved=shiftId?shifts.find(x=>x.id===shiftId):[...shifts].filter(x=>x.employerId===empId).sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start))[0];
    if(saved&&jb47Basis(e)!=='hourly')saved.periodPayAmount=Number.isFinite(enteredAmount)?enteredAmount:jb47Amount(e);
    jb47RecalculateEmployer(empId);persist(true);backupNow(false)
  }
};
const jb47DeleteShiftBase=deleteShift;
deleteShift=function(id){const empId=shifts.find(s=>s.id===id)?.employerId;jb47DeleteShiftBase(id);if(empId){jb47RecalculateEmployer(empId);persist(true)}};

scheduledCard=function(s){
  const status=s.status==='completed'?'<span class="pill paid">Completed</span>':s.date<localDate()?'<span class="pill danger">Past</span>':'<span class="pill">Planned</span>',e=employerById(s.employerId);
  return`<div class="reminder-entry"><div class="entryhead"><div><h3>${esc(s.location)}</h3><div class="meta"><strong>${esc(employerName(s))}</strong><br>${niceDate(s.date)} (${dayName(s.date)}) • ${s.start}–${s.end}<br>${esc(s.role||'Shift')} • ${jb47RateText(e,Number(s.rate||0))} • reminder ${s.reminderMinutes?Math.round(s.reminderMinutes/60*10)/10+'h before':'at start'}</div></div>${status}</div><div class="actions">${s.status==='planned'?`<button class="mini" onclick="completeScheduledManually('${s.id}')">Add completed</button><button class="mini" onclick="openSchedule('${s.id}')">Edit</button>`:''}<button class="mini" onclick="deleteScheduledShift('${s.id}')">Delete</button></div></div>`;
};

const jb47OpenDebtBase=openDebt;
openDebt=function(id){jb47OpenDebtBase(id);const d=id?debts.find(x=>x.id===id):null;document.getElementById('debtPhone').value=d?.phone||''};
const jb47SaveDebtBase=saveDebt;
saveDebt=function(){const id=document.getElementById('debtId').value||'',phone=document.getElementById('debtPhone').value.trim();jb47SaveDebtBase();const d=id?debts.find(x=>x.id===id):debts[debts.length-1];if(d){d.phone=phone;persist(true);backupNow(false)}};

debtCard=function(d){
  const paid=(d.payments||[]).reduce((n,p)=>n+Number(p.amount||0),0),remaining=Math.max(0,debtRemaining(d)),pct=d.amount>0?Math.min(100,paid/d.amount*100):0,due=d.dueDate?reminderStatus(d.dueDate):'',label=d.direction==='owed_to_me'?'They owe me':'I owe them',status=remaining<=0.005?'<span class="pill paid">Settled</span>':due==='overdue'?'<span class="pill danger">Overdue</span>':due==='due'?'<span class="pill warn">Due today</span>':'<span class="pill">Open</span>';
  const payments=(d.payments||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)).map(p=>`<div class="detail-row"><strong>${money(p.amount)}</strong> • ${niceDate(p.date)}${p.note?' • '+esc(p.note):''} <button class="mini" onclick="deleteDebtPayment('${d.id}','${p.id}')">Delete</button></div>`).join('');
  return`<div class="money-entry"><div class="entryhead"><div><h3>${esc(d.person)}</h3><div class="meta"><strong>${label}</strong> • ${esc(d.title||'Personal record')}${d.phone?'<br>WhatsApp '+esc(d.phone):''}${d.dueDate?'<br>Due / promised '+niceDate(d.dueDate):''}</div></div>${status}</div><div class="amount-line"><span>Total</span><strong>${money(d.amount)}</strong></div><div class="amount-line"><span>Paid / received</span><strong>${money(paid)}</strong></div><div class="progress"><span style="width:${pct}%"></span></div><div class="amount-line"><span>Remaining</span><strong class="${remaining>0?'overdue':'paidline'}">${money(remaining)}</strong></div>${payments?'<div class="divider"></div><div class="detail-list">'+payments+'</div>':''}<div class="actions">${remaining>0?`<button class="mini" onclick="openDebtPayment('${d.id}')">＋ Partial payment</button>`:''}${remaining>0&&d.phone?`<button class="mini jb47-wa" onclick="whatsappDebt('${d.id}')">WhatsApp reminder</button>`:''}<button class="mini" onclick="openDebt('${d.id}')">Edit</button><button class="mini" onclick="deleteDebt('${d.id}')">Delete</button></div></div>`;
};

payrollCard=function(e,month){
  const earned=earnedFor(e.id,month),received=receivedFor(e.id,month),remaining=Number((earned-received).toFixed(2)),p=getPayroll(e.id,month,false),promise=nextPromise(p),status=salaryStatus(e.id,month),percent=earned>0?Math.min(100,Math.max(0,received/earned*100)):0,statusHtml=status==='paid'?'<span class="pill paid">Paid</span>':status==='partial'?'<span class="pill warn">Part paid</span>':status==='unpaid'?'<span class="pill danger">Unpaid</span>':'<span class="pill">No shifts</span>';
  return`<div class="money-entry"><div class="entryhead"><div><h3>${esc(e.name)}</h3><div class="month-label">Salary earned ${esc(monthName(month))} • ${esc(jb47Unit(e))}</div></div>${statusHtml}</div><div class="amount-line"><span>Earned</span><strong>${money(earned)}</strong></div><div class="amount-line"><span>Received for this month</span><strong>${money(received)}</strong></div><div class="progress"><span style="width:${percent}%"></span></div><div class="amount-line"><span>Remaining for this month</span><strong class="${remaining>0?'overdue':'paidline'}">${money(Math.max(0,remaining))}</strong></div><div class="meta" style="margin-top:8px">Normal expected date: ${niceDate(expectedPayDate(e,month))}${promise?'<br>Next promised date: <strong>'+promiseRange(promise)+'</strong>'+(promise.amount?' • '+money(promise.amount):''):''}${receivedFor(e.id,'all')>received?'<br>Employer also has general/unallocated payments in the all-time account.':''}</div><div class="actions"><button class="mini" onclick="openPayroll('${e.id}','${month}','receive')">＋ Month payment</button><button class="mini" onclick="openPayroll('${e.id}','${month}','promise')">＋ Promise</button><button class="mini" onclick="openPayroll('${e.id}','${month}','adjustment')">＋ Adjustment</button><button class="mini" onclick="openPayrollDetail('${e.id}','${month}')">History</button>${e.phone?`<button class="mini jb47-wa" onclick="whatsappEmployer('${e.id}','${month}')">WhatsApp</button>`:''}</div></div>`;
};

employerAccountCard=function(e){
  const s=employerAllTimeStats(e.id),promises=employerPromises(e.id),promise=promises[0],percent=s.earned>0?Math.min(100,Math.max(0,s.received/s.earned*100)):0,months=monthBreakdown(e.id),status=s.remaining<=0.005&&s.earned>0?'<span class="pill paid">Paid</span>':s.received>0?'<span class="pill warn">Part paid</span>':'<span class="pill danger">Unpaid</span>';
  const monthly=months.length?'<div class="detail-list" style="margin-top:12px">'+months.map(m=>`<div class="detail-row"><strong>${esc(monthName(m.month))}</strong><br>${money(m.earned)} earned • ${money(m.received)} allocated received • ${money(Math.max(0,m.remaining))} remaining</div>`).join('')+'</div>':'<div class="small" style="margin-top:10px">No salary months yet.</div>';
  return`<div class="money-entry"><div class="entryhead"><div><h3>${esc(e.name)}</h3><div class="month-label">Complete employer account • ${s.shifts} shifts • ${decimal(s.mins)} hours • ${esc(jb47Unit(e))}</div></div>${status}</div><div class="amount-line"><span>Total earned</span><strong>${money(s.earned)}</strong></div><div class="amount-line"><span>Total received</span><strong>${money(s.received)}</strong></div><div class="progress"><span style="width:${percent}%"></span></div><div class="amount-line"><span>Total remaining</span><strong class="${s.remaining>0?'overdue':'paidline'}">${money(Math.max(0,s.remaining))}</strong></div>${s.adjustments?`<div class="meta">Includes salary adjustments/opening balances: ${money(s.adjustments)}</div>`:''}${promise?`<div class="meta" style="margin-top:8px">Next promised payment: <strong>${promiseRange(promise)}</strong>${promise.amount?' • '+money(promise.amount):''}<br>${esc(salaryMonthLabel(promise.earnedMonth))}</div>`:''}${monthly}<div class="actions"><button class="mini" onclick="openPayroll('${e.id}','all','receive')">＋ General payment</button><button class="mini" onclick="openPayroll('${e.id}','all','promise')">＋ General promise</button><button class="mini" onclick="openPayroll('${e.id}','all','adjustment')">＋ Opening balance</button><button class="mini" onclick="openPayrollDetail('${e.id}','all')">Full history</button>${e.phone?`<button class="mini jb47-wa" onclick="whatsappEmployer('${e.id}','all')">WhatsApp</button>`:''}</div></div>`;
};

jbReminderItem=function(r){
  const status=reminderStatus(r.date),label=status==='overdue'?'Overdue':status==='due'?'Today':niceDate(r.date);let action='';
  if(r.type==='salary'){const p=payrolls.find(x=>(x.promises||[]).some(z=>z.id===r.id)),e=p?employerById(p.employerId):null;if(e?.phone)action=`<button class="mini jb47-wa" onclick="event.stopPropagation();whatsappEmployer('${e.id}','${p.earnedMonth}')">WhatsApp</button>`}
  if(r.type==='debt'){const d=debts.find(x=>x.id===r.id);if(d?.phone)action=`<button class="mini jb47-wa" onclick="event.stopPropagation();whatsappDebt('${d.id}')">WhatsApp</button>`}
  return`<div class="jb-home-item"><span class="jb-home-item-icon">!</span><div class="jb-home-item-main"><b>${esc(r.title)}</b><small>${esc(r.text||'Reminder')}</small>${action}</div><div class="jb-home-item-value"><b>${esc(label)}</b><small>${r.type==='shift'?esc(r.time||''):''}</small></div></div>`;
};

/* Improve Drive setup feedback. Native v4.8 opens the folder picker on the Android UI thread. */
connectBackup=function(){
  if(native()&&AndroidBridge.connectBackup){toast('Opening Google Drive folder picker… Choose or create a private Job Buddy Backups folder.');AndroidBridge.connectBackup();return}
  toast('Google Drive folder selection is available in the Android app');
};

const jb47PrepareRestoreBase=prepareRestore;
prepareRestore=function(text){jb47PrepareRestoreBase(text);try{const raw=JSON.parse(String(text).replace(/^\uFEFF/,''));if(pendingRestore&&Array.isArray(raw.employers))pendingRestore.employers=raw.employers.map(e=>({...e,payBasis:e.payBasis||'hourly',phone:e.phone||''}));if(pendingRestore&&Array.isArray(raw.debts))pendingRestore.debts=raw.debts.map(d=>({...d,phone:d.phone||''}))}catch(e){}};

const jb47ApplyRestoreBase=applyRestore;
applyRestore=function(mode){jb47ApplyRestoreBase(mode);setTimeout(()=>{jb47RecalculateAll();persist(true);renderAll()},300)};

const jb47RenderAllBase=renderAll;
renderAll=function(){jb47RecalculateAll();jb47RenderAllBase()};

setTimeout(()=>{
  jb47RecalculateAll();persist(false);renderAll();
  document.querySelectorAll('.version').forEach(x=>x.textContent='Job Buddy v'+JB47_VERSION);
  updateEmployerPayLabel47();
},900);

const jb47UpdateBackupSummaryBase=updateBackupScheduleSummary43;
updateBackupScheduleSummary43=function(){
  try{
    if(native()&&AndroidBridge.getLastAutoBackup){const ms=Number(AndroidBridge.getLastAutoBackup());if(ms>0&&(!app43.lastDriveBackup||ms>new Date(app43.lastDriveBackup).getTime())){app43.lastDriveBackup=new Date(ms).toISOString();persist43()}}
  }catch(e){}
  jb47UpdateBackupSummaryBase();
};

const jb47DataBundleBase=dataBundle;
dataBundle=function(){return{...jb47DataBundleBase(),version:JB47_VERSION}};
