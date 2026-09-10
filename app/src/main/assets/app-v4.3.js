'use strict';

/* Job Buddy v4.5 — shift reminders and complete dated Drive backups. */
const V43K='msr_app_settings_v43';
let app43=read(V43K,{shiftReminderMinutes:60,backupDays:1,lastDriveBackup:'',nextDriveBackup:''});
app43={shiftReminderMinutes:60,backupDays:1,lastDriveBackup:'',nextDriveBackup:'',...(app43&&typeof app43==='object'?app43:{})};

function persist43(){put(V43K,app43)}
function reminderLabel43(minutes){const n=Number(minutes);if(n===0)return'At shift start';if(n===15)return'15 minutes before';if(n===30)return'30 minutes before';if(n===60)return'1 hour before';if(n===120)return'2 hours before';if(n===1440)return'1 day before';return n+' minutes before'}
function backupStamp43(date=new Date()){
  const p=n=>String(n).padStart(2,'0');
  return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
}
async function fullBackupBundle43(){
  const files=await allDocFiles();
  const cvSourceFile=files.find(f=>f.id===CV_SOURCE_FILE_ID)||null;
  return {...dataBundle(),version:'4.8',exportedAt:new Date().toISOString(),documentFiles:files.filter(f=>f.id!==CV_SOURCE_FILE_ID),cvSourceFile,fullDocumentBackup:true,app43:clone(app43)};
}
async function fullBackupJson43(){return JSON.stringify(await fullBackupBundle43(),null,2)}

const baseDataBundle43=dataBundle;
dataBundle=function(){return{...baseDataBundle43(),version:'4.8',app43:clone(app43)}};

const basePrepareRestore43=prepareRestore;
prepareRestore=function(text){
  basePrepareRestore43(text);
  try{
    const raw=JSON.parse(String(text).replace(/^\uFEFF/,''));
    if(pendingRestore){pendingRestore.app43=raw.app43&&typeof raw.app43==='object'?raw.app43:null;const box=document.getElementById('restoreDetails');if(box&&raw.fullDocumentBackup)box.innerHTML+='<br><strong>Complete backup:</strong> uploaded document files are included.'}
  }catch(e){}
};
const baseApplyRestore43=applyRestore;
applyRestore=function(mode){
  const restored43=pendingRestore?.app43?clone(pendingRestore.app43):null;
  baseApplyRestore43(mode);
  if(restored43){app43={...app43,...restored43};persist43()}
  setTimeout(()=>{loadV43Settings();backupNow(false)},700);
};

const baseOpenSchedule43=openSchedule;
openSchedule=function(id){
  baseOpenSchedule43(id);
  if(!id){const el=document.getElementById('schReminder');if(el)el.value=String(Number(app43.shiftReminderMinutes)||0)}
};

function saveReminderDefaults(){
  const el=document.getElementById('defaultShiftReminder');
  app43.shiftReminderMinutes=Number(el?.value??60);
  persist43();
  updateReminderLabels43();
  toast('Default shift reminder saved');
}
function updateReminderLabels43(){
  const text=reminderLabel43(app43.shiftReminderMinutes);
  const label=document.getElementById('shiftReminderDefaultLabel');if(label)label.textContent=text;
  const el=document.getElementById('defaultShiftReminder');if(el)el.value=String(app43.shiftReminderMinutes);
}

async function stageFullBackup43(){
  if(!(native()&&AndroidBridge.stageBackup))return false;
  try{return !!AndroidBridge.stageBackup(await fullBackupJson43())}catch(e){return false}
}
function scheduleAutomaticBackup43(){
  const days=[1,7,15,30].includes(Number(app43.backupDays))?Number(app43.backupDays):1;
  const when=Date.now()+days*86400000;
  app43.nextDriveBackup=new Date(when).toISOString();persist43();
  scheduleNativeReminder('backup_auto',when,'AUTO_BACKUP',String(days));
  updateBackupScheduleSummary43();
}
function saveBackupFrequency(){
  const days=Number(document.getElementById('backupFrequency')?.value||1);
  app43.backupDays=[1,7,15,30].includes(days)?days:1;
  persist43();
  scheduleAutomaticBackup43();
  toast(app43.backupDays===1?'Automatic backup set to every day':`Automatic backup set to every ${app43.backupDays} days`);
}
function updateBackupScheduleSummary43(){
  const el=document.getElementById('backupScheduleSummary');if(!el)return;
  const connected=native()&&AndroidBridge.isBackupConnected&&AndroidBridge.isBackupConnected();
  const frequency=app43.backupDays===1?'Every day':`Every ${app43.backupDays} days`;
  const next=app43.nextDriveBackup?new Date(app43.nextDriveBackup).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'after connection';
  const last=app43.lastDriveBackup?new Date(app43.lastDriveBackup).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'No Drive backup created yet';
  el.innerHTML=`<strong>${connected?'Drive folder connected':'Drive folder not connected'}</strong><br>${frequency} • Next: ${esc(next)}<br>Last: ${esc(last)}`;
}

backupNow=async function(show=false){
  const connected=native()&&AndroidBridge.isBackupConnected&&AndroidBridge.isBackupConnected();
  let json='';
  try{
    json=await fullBackupJson43();
    if(native()&&AndroidBridge.stageBackup)AndroidBridge.stageBackup(json);
    if(show){
      if(!connected){toast('Choose a Google Drive folder first');refreshBackupStatus();return false}
      const ok=!!AndroidBridge.backup(json);
      if(ok){app43.lastDriveBackup=new Date().toISOString();scheduleAutomaticBackup43();persist43();toast('Complete dated backup saved to Google Drive')}else toast('Backup could not be saved. Check Drive access.');
      refreshBackupStatus();updateBackupScheduleSummary43();return ok;
    }
    return true;
  }catch(e){if(show)toast('Backup failed: '+e.message);return false}
};

downloadFullBackupWithDocuments=async function(){
  toast('Preparing complete backup with all documents…');
  const json=await fullBackupJson43();
  saveFile('Job_Buddy_Full_Backup_'+backupStamp43()+'.json','application/json',json);
};
saveJson=downloadFullBackupWithDocuments;

const baseConnectBackup43=connectBackup;
connectBackup=function(){
  if(native()&&AndroidBridge.connectBackup){AndroidBridge.connectBackup();return}
  baseConnectBackup43();
};
window.onBackupFileConnected=async function(){
  refreshBackupStatus();refreshGoogleAccountStatus();
  await stageFullBackup43();scheduleAutomaticBackup43();
  await backupNow(true);
};
const baseDisconnectBackup43=disconnectBackup;
disconnectBackup=function(){cancelNativeReminder('backup_auto');baseDisconnectBackup43();app43.nextDriveBackup='';persist43();updateBackupScheduleSummary43()};

const baseRefreshBackupStatus43=refreshBackupStatus;
refreshBackupStatus=function(){
  let connected=false;try{connected=!!(native()&&AndroidBridge.isBackupConnected&&AndroidBridge.isBackupConnected())}catch(e){}
  const el=document.getElementById('backupStatus');if(el)el.innerHTML='<span class="backup-dot '+(connected?'on':'')+'"></span>'+(connected?'Google Drive folder connected':'Google Drive folder not connected');
  updateBackupScheduleSummary43();
};

function loadV43Settings(){
  const reminder=document.getElementById('defaultShiftReminder');if(reminder)reminder.value=String(app43.shiftReminderMinutes);
  const frequency=document.getElementById('backupFrequency');if(frequency)frequency.value=String(app43.backupDays);
  updateReminderLabels43();refreshBackupStatus();updateBackupScheduleSummary43();
}

const baseLoadSettings43=loadSettings;
loadSettings=function(){baseLoadSettings43();loadV43Settings()};
const baseGo43=go;
go=function(p){baseGo43(p);if(p==='settings'||p==='history')loadV43Settings()};

/* Stage a complete payload whenever the existing app saves a record. */
const baseBackupNowReference43=backupNow;
setTimeout(async()=>{
  loadV43Settings();
  await stageFullBackup43();
  const connected=native()&&AndroidBridge.isBackupConnected&&AndroidBridge.isBackupConnected();
  if(connected)scheduleAutomaticBackup43();
  document.querySelectorAll('.version').forEach(x=>x.textContent='Job Buddy v4.8');
},500);
