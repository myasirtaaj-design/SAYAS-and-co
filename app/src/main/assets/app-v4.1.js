'use strict';

/* Job Buddy v4.5 — private on-device document reading and expiry confirmation. */
let currentDocAnalysis=null;
let documentOcrWorker=null;
let documentAnalysisRunning=false;

function assetUrl(path){return new URL(path,window.location.href).href}
function setDocScanStatus(message,kind=''){
  const box=document.getElementById('docScanStatus');
  if(!box)return;
  box.className='notice'+(kind?' '+kind:'');
  box.innerHTML=message;
}
function resetDocumentAnalysis(existing=null){
  currentDocAnalysis=existing?.scanSummary||null;
  const result=document.getElementById('docScanResult');
  const preview=document.getElementById('docExtractedPreview');
  if(result)result.classList.add('hidden');
  if(preview)preview.textContent='';
  setDocScanStatus(existing?.scanMethod?
    '<strong>Previously read:</strong> '+esc(existing.scanMethod)+'. Replace the file to scan again.':
    '<strong>Automatic reading:</strong> choose a PDF, JPG or PNG. The app reads it privately on this phone and asks you to confirm any detected date.');
}

const baseOpenDocumentEditor41=openDocumentEditor;
openDocumentEditor=function(id='',preset=''){
  baseOpenDocumentEditor41(id,preset);
  resetDocumentAnalysis(documents.find(x=>x.id===id)||null);
};
const baseCloseDocumentEditor41=closeDocumentEditor;
closeDocumentEditor=function(){baseCloseDocumentEditor41();currentDocAnalysis=null;documentAnalysisRunning=false};

function validIsoDate(y,m,d){
  y=Number(y);m=Number(m);d=Number(d);
  if(y<100)y+=(y<=60?2000:1900);
  if(y<1900||y>2100||m<1||m>12||d<1||d>31)return'';
  const dt=new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)return'';
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
const MONTH_INDEX={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
function datesInText(text){
  const found=[];
  function add(iso,raw,index){if(iso&&!found.some(x=>x.iso===iso&&Math.abs(x.index-index)<5))found.push({iso,raw,index})}
  let m;
  const numeric=/\b([0-3]?\d)[\/.\-]([01]?\d)[\/.\-]((?:19|20)?\d{2})\b/g;
  while((m=numeric.exec(text)))add(validIsoDate(m[3],m[2],m[1]),m[0],m.index);
  const iso=/\b((?:19|20)\d{2})[\/.\-]([01]?\d)[\/.\-]([0-3]?\d)\b/g;
  while((m=iso.exec(text)))add(validIsoDate(m[1],m[2],m[3]),m[0],m.index);
  const dayMonth=/\b([0-3]?\d)(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*,?\s*((?:19|20)\d{2})\b/gi;
  while((m=dayMonth.exec(text)))add(validIsoDate(m[3],MONTH_INDEX[m[2].toLowerCase()],m[1]),m[0],m.index);
  const monthDay=/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([0-3]?\d)(?:st|nd|rd|th)?\s*,?\s*((?:19|20)\d{2})\b/gi;
  while((m=monthDay.exec(text)))add(validIsoDate(m[3],MONTH_INDEX[m[1].toLowerCase()],m[2]),m[0],m.index);
  return found.sort((a,b)=>a.index-b.index);
}
function dateNearKeywords(text,keywords,preferFuture=false){
  const lower=text.toLowerCase(),dates=datesInText(text),today=localDate(),hits=[];
  for(const key of keywords){let pos=0;while((pos=lower.indexOf(key,pos))>=0){for(const d of dates){const distance=d.index-pos;if(distance>=-35&&distance<=110)hits.push({...d,distance:Math.abs(distance),keyword:key})}pos+=key.length}}
  hits.sort((a,b)=>{
    const af=preferFuture&&a.iso>=today?0:1,bf=preferFuture&&b.iso>=today?0:1;
    return af-bf||a.distance-b.distance;
  });
  return hits[0]||null;
}
function detectDocumentType(text){
  const t=text.toLowerCase();
  const rules=[
    ['sia',9,['security industry authority','sia licence','licence number','frontline licence']],
    ['passport',9,['passport','passport no','nationality','date of expiry']],
    ['driving_licence',9,['driving licence','driver licence','dvla','categories of vehicles']],
    ['dbs',9,['disclosure and barring service','dbs certificate','criminal record certificate']],
    ['first_aid_full',8,['first aid at work','first aid certificate']],
    ['first_aid',8,['emergency first aid at work','efaw']],
    ['traffic_marshal',8,['traffic marshal','banksman']],
    ['fire_marshal',8,['fire marshal','fire warden']],
    ['door_supervisor',8,['door supervisor']],
    ['cctv',8,['public space surveillance','cctv operator']],
    ['share_code',8,['right to work','share code','prove your right to work']],
    ['bank_statement',8,['bank statement','statement date','account summary']],
    ['ni',7,['national insurance number','national insurance']],
    ['act_awareness',7,['act awareness','action counters terrorism']],
    ['scan',7,['see check and notify','scan training']],
    ['physical_intervention',7,['physical intervention']],
    ['conflict_management',7,['conflict management']],
    ['safeguarding',7,['safeguarding']],
    ['cscs',7,['construction skills certification scheme','cscs']],
    ['forklift',7,['forklift','lift truck','mhe certificate']],
    ['manual_handling',7,['manual handling']],
    ['food_hygiene',7,['food hygiene','food safety']],
    ['education',5,['university','degree','transcript','certificate of completion']],
    ['vehicle_insurance',7,['certificate of motor insurance','motor insurance']],
    ['mot',7,['mot test certificate']],
    ['utility_bill',6,['electricity bill','gas bill','water bill','utility bill']],
    ['council_tax',6,['council tax']],
    ['p60',7,['p60 end of year certificate']],
    ['p45',7,['p45 details of employee leaving work']],
    ['payslip',6,['payslip','gross pay','net pay']],
    ['evisa',7,['immigration status','evisa','home office']],
    ['brp',7,['biometric residence permit','residence permit']]
  ];
  let best={type:'',score:0,matches:[]};
  for(const [type,weight,terms] of rules){const matches=terms.filter(k=>t.includes(k));const score=matches.length?weight+matches.length-1:0;if(score>best.score)best={type,score,matches}}
  return{...best,confidence:Math.min(0.98,best.score/10)};
}
function cleanReference(value){return String(value||'').replace(/\s{2,}/g,' ').replace(/^[\s:#-]+|[\s,.;]+$/g,'').slice(0,40)}
function detectReference(text,type){
  let m;
  if(type==='sia'&&(m=text.match(/\b\d{16}\b/)))return m[0];
  if(type==='ni'&&(m=text.match(/\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/i)))return m[0].replace(/\s/g,'').toUpperCase();
  const patterns=[
    /(?:licen[cs]e|certificate|passport|document|card|reference|ref)\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/ ]{4,28})/i,
    /(?:number|no\.?|reference)\s*[:\-]\s*([A-Z0-9][A-Z0-9\-/ ]{4,28})/i
  ];
  for(const p of patterns){m=text.match(p);if(m)return cleanReference(m[1])}
  return'';
}
function analyseExtractedText(text,method){
  const clean=String(text||'').replace(/\u0000/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  const type=detectDocumentType(clean);
  const expiryHit=dateNearKeywords(clean,['date of expiry','expiry date','expires on','expires','valid until','valid to','validity end','renewal due','licence expiry','expiration date'],true);
  const issueHit=dateNearKeywords(clean,['date of issue','issue date','issued on','issued','valid from','start date','certificate date','statement date'],false);
  const allDates=datesInText(clean);
  let expiryDate=expiryHit?.iso||'';
  if(!expiryDate){const future=allDates.filter(d=>d.iso>=localDate()&&d.iso<=addDays(localDate(),365*15));if(future.length===1)expiryDate=future[0].iso}
  return{
    method,text:clean,preview:clean.slice(0,900),type:type.type,typeConfidence:type.confidence,
    issueDate:issueHit?.iso||'',expiryDate,expiryConfidence:expiryHit?0.92:(expiryDate?0.55:0),
    reference:detectReference(clean,type.type),dateCandidates:allDates.map(x=>x.iso).filter((x,i,a)=>a.indexOf(x)===i).slice(0,12)
  };
}
async function getOcrWorker(){
  if(documentOcrWorker)return documentOcrWorker;
  if(!window.Tesseract)throw new Error('On-device OCR library did not load');
  documentOcrWorker=await Tesseract.createWorker('eng',1,{
    workerPath:assetUrl('tesseract-worker.min.js'),
    langPath:assetUrl('tessdata/'),
    corePath:assetUrl('tesseract-core-lstm.wasm.js'),
    logger:m=>{if(m&&m.status){const pct=typeof m.progress==='number'?' '+Math.round(m.progress*100)+'%':'';setDocScanStatus('<strong>Reading document:</strong> '+esc(m.status)+pct,'')}}
  });
  return documentOcrWorker;
}
function dataUrlForCurrentFile(){return `data:${currentDocFile.mime||'application/octet-stream'};base64,${currentDocFile.base64}`}
async function ocrDataUrl(dataUrl){const worker=await getOcrWorker();const result=await worker.recognize(dataUrl);return result?.data?.text||''}
async function readPdfDocument(bytes){
  if(!window.pdfjsLib)throw new Error('PDF reader did not load');
  try{pdfjsLib.GlobalWorkerOptions.workerSrc=assetUrl('pdf.worker.min.js')}catch(e){}
  let pdf;
  try{pdf=await pdfjsLib.getDocument({data:bytes}).promise}catch(first){
    pdf=await pdfjsLib.getDocument({data:bytes,disableWorker:true}).promise;
  }
  const pageLimit=Math.min(pdf.numPages,4);let text='';
  for(let i=1;i<=pageLimit;i++){
    setDocScanStatus(`<strong>Reading PDF text:</strong> page ${i} of ${pageLimit}`);
    const page=await pdf.getPage(i),content=await page.getTextContent();
    text+=content.items.map(x=>x.str||'').join(' ')+'\n';
  }
  if(text.replace(/\s/g,'').length>=80)return{text,method:'Private PDF text reading'};
  let ocr='';const ocrPages=Math.min(pdf.numPages,2);
  for(let i=1;i<=ocrPages;i++){
    setDocScanStatus(`<strong>Scanning PDF image:</strong> page ${i} of ${ocrPages}`);
    const page=await pdf.getPage(i),viewport=page.getViewport({scale:1.65}),canvas=document.createElement('canvas');
    canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    await page.render({canvasContext:ctx,viewport}).promise;
    ocr+='\n'+await ocrDataUrl(canvas.toDataURL('image/jpeg',0.88));
    canvas.width=canvas.height=1;
  }
  return{text:ocr,method:'Private OCR of PDF pages'};
}
async function extractDocumentText(file){
  const mime=String(file.mime||'').toLowerCase(),name=String(file.name||'').toLowerCase(),bytes=bytesFromB64(file.base64);
  if(mime==='application/pdf'||name.endsWith('.pdf'))return readPdfDocument(bytes);
  if(mime.startsWith('image/')||/\.(png|jpe?g|webp|bmp)$/i.test(name))return{text:await ocrDataUrl(dataUrlForCurrentFile()),method:'Private on-device image OCR'};
  throw new Error('Automatic reading currently supports PDF, JPG, PNG, WEBP and BMP files. Enter details manually for this file type.');
}
function renderDocumentAnalysis(a){
  currentDocAnalysis=a;
  const result=document.getElementById('docScanResult'),preview=document.getElementById('docExtractedPreview');
  if(!result||!preview)return;
  const detectedType=a.type?(DOC_LABELS[a.type]||a.type):'Not certain';
  const expiry=a.expiryDate?niceDate(a.expiryDate):'Not found';
  const issue=a.issueDate?niceDate(a.issueDate):'Not found';
  const ref=a.reference||'Not found';
  document.getElementById('docDetectedType').textContent=detectedType;
  document.getElementById('docDetectedIssue').textContent=issue;
  document.getElementById('docDetectedExpiry').textContent=expiry;
  document.getElementById('docDetectedReference').textContent=ref;
  preview.textContent=a.preview||'No readable text found.';
  result.classList.remove('hidden');
  const confidence=a.expiryDate?(a.expiryConfidence>=0.8?'high':'possible'):'none';
  setDocScanStatus(`<strong>Reading complete.</strong> Expiry-date confidence: ${confidence}. Review every field before saving.`,'success');
  applyDetectedDocumentDetails(true);
}
function applyDetectedDocumentDetails(automatic=false){
  const a=currentDocAnalysis;if(!a)return;
  const editId=document.getElementById('docEditId').value;
  const currentType=document.getElementById('docType').value;
  if(a.type&&a.typeConfidence>=0.75&&(!editId||currentType==='passport')){
    document.getElementById('docType').value=a.type;
    onDocumentTypeChange(false);
    if(!document.getElementById('docTitle').value||document.getElementById('docTitle').value==='Passport')document.getElementById('docTitle').value=DOC_LABELS[a.type]||a.type;
  }
  const type=document.getElementById('docType').value;
  if(AUTO_30_TYPES.has(type)){
    document.getElementById('docIssueDate').value=localDate();
    document.getElementById('docExpiryDate').value=addDays(localDate(),30);
  }else{
    if(a.issueDate)document.getElementById('docIssueDate').value=a.issueDate;
    if(a.expiryDate)document.getElementById('docExpiryDate').value=a.expiryDate;
  }
  if(a.reference&&!document.getElementById('docReference').value)document.getElementById('docReference').value=a.reference;
  if(!automatic)toast('Detected details applied. Check them before saving.')
}
async function analyseCurrentDocument(){
  if(!currentDocFile){toast('Choose a document first');return}
  if(documentAnalysisRunning)return;
  documentAnalysisRunning=true;
  const result=document.getElementById('docScanResult');if(result)result.classList.add('hidden');
  setDocScanStatus('<strong>Preparing private document reading…</strong> This can take a little longer the first time.');
  try{
    const extracted=await extractDocumentText(currentDocFile);
    const analysis=analyseExtractedText(extracted.text,extracted.method);
    renderDocumentAnalysis(analysis);
  }catch(e){
    currentDocAnalysis=null;
    setDocScanStatus('<strong>Automatic reading was not completed.</strong> '+esc(e?.message||String(e))+' You can still enter the dates manually.','warning');
  }finally{documentAnalysisRunning=false}
}

window.onDocumentFileLoaded=function(name,mime,base64){
  const size=Math.floor((base64||'').length*3/4);
  if(size>15*1024*1024){toast('Please choose a file smaller than 15 MB');return}
  currentDocFile={name:String(name||'document').split('/').pop(),mime:mime||'application/octet-stream',base64,size};
  document.getElementById('docFileMeta').textContent=currentDocFile.name+' • '+formatBytes(size);
  analyseCurrentDocument();
};

saveDocumentRecord=async function(){
  const id=document.getElementById('docEditId').value||uid(),existing=documents.find(x=>x.id===id),type=document.getElementById('docType').value,title=document.getElementById('docTitle').value.trim(),issue=document.getElementById('docIssueDate').value||localDate();
  if(!title){toast('Enter a document title');return}
  if(!existing&&!currentDocFile){toast('Choose the document file');return}
  let expiry=document.getElementById('docExpiryDate').value;
  if(AUTO_30_TYPES.has(type))expiry=addDays(issue,30);
  if(expiry&&expiry<issue&&!confirm('The expiry date is earlier than the issue/upload date. Save anyway?'))return;
  if(currentDocAnalysis?.expiryDate&&expiry!==currentDocAnalysis.expiryDate&&!AUTO_30_TYPES.has(type)){
    if(!confirm('You changed the detected expiry date. Confirm that '+(expiry?niceDate(expiry):'no expiry date')+' is correct.'))return;
  }
  const record={id,type,customType:document.getElementById('docCustomType').value.trim(),title,issueDate:issue,expiryDate:expiry,reminderDays:Number(document.getElementById('docReminderDays').value)||30,reference:document.getElementById('docReference').value.trim(),notes:document.getElementById('docNotes').value.trim(),uploadedAt:currentDocFile?new Date().toISOString():(existing?.uploadedAt||new Date().toISOString()),fileName:currentDocFile?.name||existing?.fileName||'',mime:currentDocFile?.mime||existing?.mime||'',fileSize:currentDocFile?.size||existing?.fileSize||0,hasFile:currentDocFile?true:(existing?.hasFile||false),needsUpdate:false,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),expiryConfirmedAt:expiry?new Date().toISOString():'',scanMethod:currentDocAnalysis?.method||existing?.scanMethod||'',scanSummary:currentDocAnalysis?{method:currentDocAnalysis.method,type:currentDocAnalysis.type,typeConfidence:currentDocAnalysis.typeConfidence,issueDate:currentDocAnalysis.issueDate,expiryDate:currentDocAnalysis.expiryDate,expiryConfidence:currentDocAnalysis.expiryConfidence,reference:currentDocAnalysis.reference,dateCandidates:currentDocAnalysis.dateCandidates,preview:currentDocAnalysis.preview.slice(0,350)}:(existing?.scanSummary||null)};
  if(currentDocFile)await putDocFile({id,name:currentDocFile.name,mime:currentDocFile.mime,base64:currentDocFile.base64,size:currentDocFile.size});
  const idx=documents.findIndex(x=>x.id===id);if(idx>=0)documents[idx]=record;else documents.push(record);
  persistV4();closeDocumentEditor();renderDocuments();syncAllReminders(false);backupNow(false);toast(existing?'Document updated':'Document saved');
};

enforceDocumentExpiry=async function(){
  let changed=false,removed=[];
  for(const d of documents){
    if(d.hasFile&&d.expiryDate&&d.expiryDate<=localDate()){
      await deleteDocFile(d.id).catch(()=>{});d.hasFile=false;d.fileDeletedAt=new Date().toISOString();d.needsUpdate=true;d.autoRemovedReason='Expired on '+d.expiryDate;removed.push(docTypeLabel(d));changed=true;
    }
  }
  if(changed){persistV4();renderDocuments();toast('Expired document file'+(removed.length===1?'':'s')+' removed. Upload updated: '+removed.slice(0,3).join(', ')+(removed.length>3?'…':''))}
};

const baseDataBundle41=dataBundle;
dataBundle=function(){return{...baseDataBundle41(),version:'4.1'}};

document.querySelectorAll('.version').forEach(x=>x.textContent='Job Buddy v4.5');
enforceDocumentExpiry().then(()=>renderDocuments());
