'use strict';

/* Job Buddy v4.5 — professional glass UI and saved-CV workflow. */
const CV_SOURCE_FILE_ID='__master_cv_source_v42__';
let cvFilePickMode=false;
let cvSourceLoading=false;
let cvRelevantRefreshTimer=null;

const CV_SAFE_TYPES=new Set([
  'sia','sia_training','door_supervisor','security_guard','cctv','first_aid','first_aid_full',
  'act_awareness','scan','conflict_management','physical_intervention','fire_marshal','traffic_marshal',
  'safe_city','safeguarding','dbs','driving_licence','cscs','forklift','manual_handling','health_safety',
  'coshh','food_hygiene','education','employment_reference'
]);
const CV_SENSITIVE_TYPES=new Set([
  'passport','evisa','brp','share_code','birth_certificate','ni','bank_details','bank_statement',
  'utility_bill','council_tax','p45','p60','payslip','hmrc','vehicle_insurance','mot'
]);
const CV_RELEVANCE_RULES={
  sia:['security','door supervisor','guarding','retail security','loss prevention','event security'],
  sia_training:['security','door supervisor','guarding'],
  door_supervisor:['door supervisor','security','licensed premises','event security'],
  security_guard:['security guard','security officer','guarding'],
  cctv:['cctv','surveillance','control room','monitoring'],
  first_aid:['first aid','emergency','safety','security','warehouse','event'],
  first_aid_full:['first aid','emergency','safety','security','warehouse','event'],
  act_awareness:['counter terrorism','counter-terrorism','act awareness','security','public safety'],
  scan:['scan','see check and notify','security','suspicious behaviour'],
  conflict_management:['conflict','de-escalation','customer service','security','challenging behaviour'],
  physical_intervention:['physical intervention','restraint','door supervisor','security'],
  fire_marshal:['fire marshal','fire warden','evacuation','health and safety'],
  traffic_marshal:['traffic marshal','banksman','vehicle movement','construction','logistics'],
  safe_city:['safe city','city centre security','public safety'],
  safeguarding:['safeguarding','vulnerable','children','public-facing'],
  dbs:['dbs','background check','children','vulnerable','school','care'],
  driving_licence:['driving licence','driver','mobile patrol','vehicle','delivery'],
  cscs:['cscs','construction','site operative','building site'],
  forklift:['forklift','mhe','warehouse','counterbalance','reach truck','logistics'],
  manual_handling:['manual handling','warehouse','stock','lifting','logistics'],
  health_safety:['health and safety','warehouse','construction','security','risk assessment'],
  coshh:['coshh','chemical','cleaning','warehouse','manufacturing'],
  food_hygiene:['food hygiene','food safety','catering','hospitality','kitchen'],
  education:['degree','graduate','administration','public administration','education'],
  employment_reference:['reference','employment history','experience']
};

function cvSourceText(){return String(document.getElementById('cvMaster')?.value||cvWorkspace.master||'').trim()}
function cvSourceMeta(){return cvWorkspace.sourceMeta&&typeof cvWorkspace.sourceMeta==='object'?cvWorkspace.sourceMeta:null}
function cvSafeActiveDocuments(){
  return documents.filter(d=>CV_SAFE_TYPES.has(d.type)&&!CV_SENSITIVE_TYPES.has(d.type)&&d.hasFile&&docStatus(d).key!=='expired');
}
function docSearchText(d){return [d.type,docTypeLabel(d),d.title,d.notes,d.scanSummary?.preview].filter(Boolean).join(' ').toLowerCase()}
function cvJobText(){return [document.getElementById('cvJobTitle')?.value,document.getElementById('cvJobDescription')?.value].filter(Boolean).join(' ').toLowerCase()}
function relevantScore(d,jd){
  const rules=CV_RELEVANCE_RULES[d.type]||[];
  let score=0;
  for(const term of rules)if(jd.includes(term))score+=3;
  const docWords=docSearchText(d).match(/[a-z][a-z-]{3,}/g)||[];
  for(const w of [...new Set(docWords)])if(jd.includes(w))score++;
  if(/security|guard|door supervisor|cctv|loss prevention/.test(jd)&&['sia','door_supervisor','security_guard','cctv','act_awareness','conflict_management','physical_intervention','first_aid','first_aid_full'].includes(d.type))score+=2;
  if(/warehouse|operative|picker|packer|stock|logistics|fulfilment/.test(jd)&&['forklift','manual_handling','health_safety','first_aid','first_aid_full','coshh'].includes(d.type))score+=2;
  return score;
}
function selectedCvDocumentIds(){
  return Array.from(document.querySelectorAll('[data-cv-doc]:checked')).map(x=>x.value);
}
function selectedCvDocuments(){const ids=new Set(selectedCvDocumentIds());return cvSafeActiveDocuments().filter(d=>ids.has(d.id))}
function refreshCvRelevantDocumentsDebounced(){clearTimeout(cvRelevantRefreshTimer);cvRelevantRefreshTimer=setTimeout(()=>refreshCvRelevantDocuments(false),350)}
function refreshCvRelevantDocuments(manual=false){
  const box=document.getElementById('cvRelevantDocs');if(!box)return;
  const docs=cvSafeActiveDocuments(),jd=cvJobText(),saved=new Set(cvWorkspace.selectedDocIds||[]),current=new Set(selectedCvDocumentIds());
  const ranked=docs.map(d=>({d,score:relevantScore(d,jd)})).sort((a,b)=>b.score-a.score||String(a.d.title||'').localeCompare(String(b.d.title||'')));
  if(!ranked.length){
    box.innerHTML='<div class="empty">No safe CV qualifications are currently stored. Upload licences or certificates in Documents.</div>';
    const status=document.getElementById('cvDocStatus');if(status)status.textContent='No qualifications available';
    return;
  }
  box.innerHTML=ranked.map(({d,score})=>{
    const checked=current.has(d.id)||saved.has(d.id)||score>0;
    const why=score>0?'Suggested for this vacancy':'Available verified qualification';
    return `<label class="cv-document-item"><input type="checkbox" data-cv-doc value="${esc(d.id)}" ${checked?'checked':''} onchange="saveCvDocumentSelection()"><span><b>${esc(d.title||docTypeLabel(d))}</b><span>${esc(why)}${d.expiryDate?' • expires '+niceDate(d.expiryDate):''}</span></span></label>`;
  }).join('');
  saveCvDocumentSelection(false);
  if(manual)toast('Document suggestions refreshed');
}
function saveCvDocumentSelection(showToast=false){
  cvWorkspace.selectedDocIds=selectedCvDocumentIds();persistV4();
  const n=cvWorkspace.selectedDocIds.length,status=document.getElementById('cvDocStatus');if(status)status.textContent=n?`${n} verified qualification${n===1?'':'s'} selected`:'No qualifications selected';
  if(showToast)toast('CV document selection saved');
}
function cvDocumentFacts(){
  const docs=selectedCvDocuments();
  if(!docs.length)return 'None selected.';
  return docs.map(d=>{
    const label=d.title||docTypeLabel(d),parts=[label];
    if(d.issueDate)parts.push('issued '+niceDate(d.issueDate));
    if(d.expiryDate)parts.push('valid until '+niceDate(d.expiryDate));
    return '- '+parts.join(' — ');
  }).join('\n');
}

function updateCvSourceCard(){
  const text=cvSourceText(),meta=cvSourceMeta(),saved=!!text;
  document.getElementById('cvSourceEmpty')?.classList.toggle('hidden',saved);
  document.getElementById('cvSourceSaved')?.classList.toggle('hidden',!saved);
  document.getElementById('cvClearSourceBtn')?.classList.toggle('hidden',!saved);
  document.getElementById('cvSourceCard')?.classList.toggle('empty-source',!saved);
  if(saved){
    const name=meta?.name||'Saved CV source';
    const method=meta?.method||'Saved text';
    const chars=text.length.toLocaleString('en-GB');
    const when=meta?.uploadedAt?new Date(meta.uploadedAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Previously saved';
    const n=document.getElementById('cvSourceName'),m=document.getElementById('cvSourceMeta');if(n)n.textContent=name;if(m)m.textContent=`${method} • ${chars} characters • ${when}`;
  }
  const status=document.getElementById('cvSourceStatus');if(status)status.textContent=saved?'Saved CV ready':'CV source required';
}
function setCvSourceProgress(message,working=true){
  const n=document.getElementById('cvSourceName'),m=document.getElementById('cvSourceMeta');
  document.getElementById('cvSourceEmpty')?.classList.add('hidden');document.getElementById('cvSourceSaved')?.classList.remove('hidden');
  if(n)n.textContent=working?'Reading CV…':'CV upload';if(m)m.textContent=message;
}
const basePickDocumentFile42=pickDocumentFile;
pickDocumentFile=function(){cvFilePickMode=false;return basePickDocumentFile42()};

function pickMasterCvFile(){
  if(cvSourceLoading)return;
  cvFilePickMode=true;
  if(native()&&AndroidBridge.pickDocument){AndroidBridge.pickDocument();return}
  const input=document.getElementById('cvUploadFallback');input.value='';input.click();
}
async function loadMasterCvFallback(event){
  const file=event.target.files?.[0];if(!file)return;const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(r.error);r.readAsDataURL(file)});
  await acceptMasterCvFile(file.name,file.type||'application/octet-stream',base64);
}
function decodeTextBytes(bytes){try{return new TextDecoder('utf-8',{fatal:false}).decode(bytes)}catch(e){return Array.from(bytes).map(x=>String.fromCharCode(x)).join('')}}
function stripXmlText(xml){return String(xml||'').replace(/<w:tab\/?\s*>/g,'\t').replace(/<w:br\/?\s*>/g,'\n').replace(/<\/w:p>/g,'\n').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/[ \t]+/g,' ').replace(/\n\s+/g,'\n').replace(/\n{3,}/g,'\n\n').trim()}
async function extractMasterCvText(file){
  const name=String(file.name||'').toLowerCase(),mime=String(file.mime||'').toLowerCase(),bytes=bytesFromB64(file.base64);
  if(mime==='application/pdf'||name.endsWith('.pdf')){const out=await readPdfDocument(bytes);return{text:out.text,method:out.method||'PDF text extraction'}}
  if(name.endsWith('.docx')||mime.includes('wordprocessingml')){const zip=await JSZip.loadAsync(bytes),entry=zip.file('word/document.xml');if(!entry)throw new Error('This DOCX file does not contain readable CV text');return{text:stripXmlText(await entry.async('string')),method:'DOCX text extraction'}}
  if(name.endsWith('.txt')||mime.startsWith('text/'))return{text:decodeTextBytes(bytes),method:'Text file reading'};
  if(mime.startsWith('image/')||/\.(png|jpe?g|webp|bmp)$/i.test(name))return{text:await ocrDataUrl(`data:${mime||'image/jpeg'};base64,${file.base64}`),method:'Private image OCR'};
  throw new Error('Please upload PDF, DOCX, TXT, JPG or PNG. Old .DOC files should first be saved as DOCX or PDF.');
}
async function acceptMasterCvFile(name,mime,base64){
  cvSourceLoading=true;cvFilePickMode=false;setCvSourceProgress('Preparing the file…');
  try{
    const size=Math.floor(String(base64||'').length*3/4);if(size>18*1024*1024)throw new Error('Please use a CV file smaller than 18 MB');
    const file={id:CV_SOURCE_FILE_ID,name:String(name||'CV').split('/').pop(),mime:mime||'application/octet-stream',base64,size};
    setCvSourceProgress('Extracting your factual CV content…');
    const result=await extractMasterCvText(file),text=String(result.text||'').replace(/\u0000/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
    if(text.length<80)throw new Error('Very little readable text was found. Try a clearer PDF or DOCX version.');
    await putDocFile(file);
    cvWorkspace.master=text;cvWorkspace.sourceMeta={name:file.name,mime:file.mime,size:file.size,method:result.method,uploadedAt:new Date().toISOString()};
    const master=document.getElementById('cvMaster');if(master)master.value=text;persistV4();updateCvSourceCard();refreshCvRelevantDocuments(false);backupNow(false);toast('CV saved. It will remain until you replace or clear it.');
  }catch(e){toast('CV could not be read: '+(e?.message||String(e)));updateCvSourceCard()}
  finally{cvSourceLoading=false}
}
async function clearMasterCv(){
  if(!confirm('Clear the saved CV source? Your generated CV output and job description will remain.'))return;
  await deleteDocFile(CV_SOURCE_FILE_ID).catch(()=>{});cvWorkspace.master='';delete cvWorkspace.sourceMeta;const master=document.getElementById('cvMaster');if(master)master.value='';persistV4();updateCvSourceCard();toast('Saved CV cleared');
}

const baseDocumentFileLoaded42=window.onDocumentFileLoaded;
window.onDocumentFileLoaded=async function(name,mime,base64){
  if(cvFilePickMode){await acceptMasterCvFile(name,mime,base64);return}
  return baseDocumentFileLoaded42?.(name,mime,base64);
};

const baseSaveCVWorkspace42=saveCVWorkspace;
saveCVWorkspace=function(){
  cvWorkspace={...cvWorkspace,
    jobTitle:document.getElementById('cvJobTitle')?.value.trim()||'',
    jobDescription:document.getElementById('cvJobDescription')?.value||'',
    master:cvSourceText(),facts:document.getElementById('cvFacts')?.value||'',
    template:document.getElementById('cvTemplate')?.value||'classic',mode:cvMode,
    model:document.getElementById('cvModel')?.value.trim()||'gemini-2.5-flash',
    output:document.getElementById('cvOutput')?.value||'',selectedDocIds:selectedCvDocumentIds()
  };
  persistV4();
  if(document.getElementById('cvRememberKey')?.checked&&document.getElementById('cvApiKey')?.value)localStorage.setItem(V4K.geminiKey,document.getElementById('cvApiKey').value);
  else if(document.getElementById('cvRememberKey')&&!document.getElementById('cvRememberKey').checked)localStorage.removeItem(V4K.geminiKey);
  toast('CV workspace saved');
};
loadCvWorkspace=function(){
  if(!document.getElementById('cvJobTitle'))return;
  document.getElementById('cvJobTitle').value=cvWorkspace.jobTitle||'';
  document.getElementById('cvJobDescription').value=cvWorkspace.jobDescription||'';
  document.getElementById('cvMaster').value=cvWorkspace.master||'';
  document.getElementById('cvFacts').value=cvWorkspace.facts||'';
  document.getElementById('cvTemplate').value=cvWorkspace.template||'classic';
  document.getElementById('cvModel').value=cvWorkspace.model||'gemini-2.5-flash';
  document.getElementById('cvOutput').value=cvWorkspace.output||'';
  const k=localStorage.getItem(V4K.geminiKey)||'';document.getElementById('cvApiKey').value=k;document.getElementById('cvRememberKey').checked=!!k;
  setCvMode(cvWorkspace.mode||'offline',false);updateCvSourceCard();refreshCvRelevantDocuments(false);
};

buildCvPrompt=function(){
  const title=document.getElementById('cvJobTitle').value.trim(),jd=document.getElementById('cvJobDescription').value.trim(),master=cvSourceText(),facts=document.getElementById('cvFacts').value.trim(),addr=selectedCvAddress?addressText(selectedCvAddress):'',verified=cvDocumentFacts();
  return `You are an expert UK CV writer and ATS optimisation specialist. Create a tailored UK-format CV for the vacancy below.\n\nNON-NEGOTIABLE ACCURACY AND PRIVACY RULES:\n- Use only facts explicitly contained in the saved CV, verified extra facts and the safe qualification list.\n- Never invent employers, dates, qualifications, licences, duties, achievements, numbers, software or responsibilities.\n- Preserve employment chronology and truthful job titles.\n- Do not include passport, immigration, share-code, National Insurance, bank, statement, date of birth, nationality, marital-status or protected-characteristic data.\n- Do not print licence or certificate reference numbers unless they already appear in the saved CV and are necessary.\n- Use British English and a natural professional tone.\n- Optimise genuinely relevant wording from the job description without keyword stuffing.\n- Use one column, standard ATS headings, no tables, icons, photographs or graphics.\n- Target approximately two pages and output only the finished CV in plain text.\n- Use headings where supported: Professional Profile, Core Skills, Employment History, Education, Licences & Certifications, Additional Information, References Available on Request.\n\nTARGET ROLE: ${title||'Use the vacancy title'}\nSELECTED CV ADDRESS: ${addr}\nPHONE: ${profile.phone||''}\nEMAIL: ${profile.email||''}\n\nJOB DESCRIPTION:\n${jd}\n\nSAVED CV — PRIMARY FACTUAL SOURCE:\n${master}\n\nSAFE VERIFIED LICENCES AND CERTIFICATES SELECTED FOR THIS VACANCY:\n${verified}\n\nVERIFIED EXTRA FACTS:\n${facts||'None provided'}\n\nNow produce the strongest truthful UK CV for this vacancy.`;
};
generateTailoredCV=function(){
  saveCVWorkspace();const jd=document.getElementById('cvJobDescription').value.trim(),master=cvSourceText();
  if(!master){toast('Upload your current CV first');return}
  if(!jd){toast('Paste the job description first');return}
  pendingCvGeneration=true;openAddressManager();
};
performCvGeneration=async function(){
  const prompt=buildCvPrompt(),verifiedDocs=selectedCvDocuments(),docFacts=cvDocumentFacts(),source=cvSourceText()+' '+document.getElementById('cvFacts').value+' '+docFacts,keys=cvKeywords(document.getElementById('cvJobDescription').value,source);
  document.getElementById('cvKeywords').innerHTML=keys.length?'<span class="small">Verified matching keywords</span><br>'+keys.map(k=>'<span class="keyword-chip">'+esc(k)+'</span>').join(''):'<span class="small">No strong factual keyword matches were found. Review the selected documents and source CV.</span>';
  if(cvMode==='offline'){
    const title=document.getElementById('cvJobTitle').value.trim()||'Target Role',addr=selectedCvAddress?addressText(selectedCvAddress):'',master=cvSourceText(),facts=document.getElementById('cvFacts').value.trim();
    const skills=keys.slice(0,12).map(k=>'• '+k.replace(/\b\w/g,c=>c.toUpperCase())).join('\n')||'• Add verified skills supported by your experience';
    const certs=verifiedDocs.length?verifiedDocs.map(d=>'• '+(d.title||docTypeLabel(d))+(d.expiryDate?' — valid until '+niceDate(d.expiryDate):'')).join('\n'):'• No verified certificates selected';
    const profileLine=`Dependable and adaptable candidate targeting ${title}, offering verified experience and qualifications aligned with ${keys.slice(0,5).join(', ')||'the advertised requirements'}. Recognised for professionalism, safety awareness, reliability and clear communication.`;
    const output=`${(profile.name||'YOUR NAME').toUpperCase()}\n${[addr,profile.phone,profile.email].filter(Boolean).join(' | ')}\n\nPROFESSIONAL PROFILE\n${profileLine}\n\nCORE SKILLS\n${skills}\n\nLICENCES & CERTIFICATIONS\n${certs}\n\nEMPLOYMENT HISTORY, EDUCATION & EXPERIENCE\n${master}\n${facts?'\n\nADDITIONAL VERIFIED INFORMATION\n'+facts:''}\n\nREFERENCES\nAvailable on request`;
    document.getElementById('cvOutput').value=output;cvWorkspace.output=output;persistV4();toast('Private ATS draft generated. Review and refine it before applying.');return;
  }
  const key=document.getElementById('cvApiKey').value.trim(),model=document.getElementById('cvModel').value.trim()||'gemini-2.5-flash';
  if(!key){toast('Create or paste your Gemini API key first');return}
  const btn=document.querySelector('#cvPage .btn.gold');btn?.classList.add('loading');
  try{
    const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(key),res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.22,topP:0.9,maxOutputTokens:6000}})}),json=await res.json();
    if(!res.ok)throw new Error(json?.error?.message||'Gemini request failed');
    const text=(json.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();if(!text)throw new Error('No CV text returned');
    document.getElementById('cvOutput').value=text;cvWorkspace={...cvWorkspace,output:text,model,mode:'gemini'};if(document.getElementById('cvRememberKey').checked)localStorage.setItem(V4K.geminiKey,key);persistV4();toast('Tailored CV generated. Check every fact before applying.');
  }catch(e){toast('AI connection failed: '+e.message+'. You can copy the expert prompt and use Gemini in your browser.')}finally{btn?.classList.remove('loading')}
};
copyCvPrompt=function(){
  if(!cvSourceText()){toast('Upload your current CV first');return}if(!document.getElementById('cvJobDescription').value.trim()){toast('Paste the job description first');return}if(!selectedCvAddress&&addresses.length)selectedCvAddress=addresses[0];copyText(buildCvPrompt());
};

const baseGo42=go;
go=function(p){baseGo42(p);if(p==='cv'){loadCvWorkspace();updateCvSourceCard();refreshCvRelevantDocuments(false)}};

const baseDataBundle42=dataBundle;
dataBundle=function(){return{...baseDataBundle42(),version:'4.2',cvWorkspace:{...cvWorkspace,apiKey:undefined}}};
const baseFullBackup42=downloadFullBackupWithDocuments;
downloadFullBackupWithDocuments=async function(){
  toast('Preparing full backup with documents and CV source…');const files=await allDocFiles(),cvSourceFile=await getDocFile(CV_SOURCE_FILE_ID).catch(()=>null),bundle={...dataBundle(),documentFiles:files.filter(f=>f.id!==CV_SOURCE_FILE_ID),cvSourceFile:cvSourceFile||null,fullDocumentBackup:true};saveFile('Job_Buddy_Full_Backup_'+localDate()+'.json','application/json',JSON.stringify(bundle,null,2));
};
const basePrepareRestore42=prepareRestore;
prepareRestore=function(text){basePrepareRestore42(text);try{const raw=JSON.parse(String(text).replace(/^\uFEFF/,''));if(pendingRestore)pendingRestore.cvSourceFile=raw.cvSourceFile||null}catch(e){}};
const baseApplyRestore42=applyRestore;
applyRestore=function(mode){const cvFile=pendingRestore?.cvSourceFile||null;baseApplyRestore42(mode);if(mode==='replace'&&!cvFile)deleteDocFile(CV_SOURCE_FILE_ID).catch(()=>{});if(cvFile)putDocFile(cvFile).catch(()=>{});setTimeout(()=>{loadCvWorkspace();updateCvSourceCard()},100)};

/* Improve labels and visual hierarchy without changing stored data. */
document.querySelectorAll('.version').forEach(x=>x.textContent='Job Buddy v4.5');
const topTitle=document.querySelector('.top h1');if(topTitle)topTitle.textContent='Job Buddy';
loadCvWorkspace();updateCvSourceCard();refreshCvRelevantDocuments(false);
