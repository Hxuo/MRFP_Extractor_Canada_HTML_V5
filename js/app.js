/* Standalone browser UI — no server, npm, Python or Node.js at runtime. */
(function(global){
'use strict';
const $=id=>document.getElementById(id);
const store=global.MRFP_STORAGE,engine=global.MRFP_ENGINE,reader=global.MRFP_PDF,out=global.MRFP_EXPORT;
let selectedFile=null,active=null,previewUrl=null,stagedRescan=null,busy=false;
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>x===null||x===undefined||x===''?'—':Number(x).toFixed(2);
function status(message,percent){$('status').textContent=message;if(percent!==undefined)$('progressBar').style.width=Math.max(0,Math.min(100,percent))+'%';}
function error(e){status(e?.message||String(e));$('libnotice').textContent=(e?.message||String(e));$('libnotice').className='libnotice error';console.error(e);}
function setBusy(b){busy=b;$('extract').disabled=b;$('rescan').disabled=b;$('extractText').disabled=b;$('pdf').disabled=b;$('settingsOpen').disabled=b;document.querySelectorAll('.nav-btn').forEach(n=>n.disabled=b);updateBatchDisplay();}
function notices(message,good=false){$('libnotice').textContent=message;$('libnotice').className='libnotice '+(good?'good':'');}
async function ensureLibrary(){
 try{await reader.ensurePdf();notices('PDF.js ready. PDFs are processed in this browser; no document is uploaded to a server.',true);return true;}
 catch(e){notices('PDF.js unavailable — check the bundled vendor files or use the paste-text fallback.');$('fallback').classList.remove('hidden');return false;}
}
function viewPdf(blob){
 // v5 retains the original browser iframe as a reliable fallback only.
 // PDF.js source browsing is isolated from the financial extraction engine.
 global.MRFP_EVIDENCE_VIEWER.open(blob,active).catch(error);
}

function stageSelectedFile(file){
 if(busy)return;
 selectedFile=file||null;
 $('filename').textContent=selectedFile?.name||'No PDF selected';
 viewPdf(selectedFile); // Preview must not wait for the Extract button or PDF.js.
 // The previous document's ratios must not be shown next to a newly selected PDF.
 active=null;stagedRescan=null;
 $('result').replaceChildren();$('details').replaceChildren();
 $('download').classList.add('hidden');$('actions').classList.add('hidden');
 $('rescanPanel').classList.add('hidden');$('overview').classList.remove('hidden');
 status(selectedFile?'PDF selected — preview ready; click Extract ratios':'Ready',0);
 history().catch(error);
}
function inspectDoc(d){
 active=d;$('filename').textContent=d.filename||'Saved report';
 $('download').classList.toggle('hidden',!(d.results||[]).length);
 $('overview').classList.add('hidden');$('actions').classList.remove('hidden');
 const results=d.results||[];
 const scanInfo=(d.diagnostics||[]).find(x=>x&&x.fmc_detection?.status==='matched')||{};
 const funds=[...new Set(results.map(r=>r.fund_name).filter(Boolean))],fmcs=[...new Set(results.map(r=>r.fmc||r.fmc_key).filter(Boolean))];
 if(!funds.length&&scanInfo.fund_name)funds.push(scanInfo.fund_name);
 if(!fmcs.length&&(scanInfo.fmc_label||scanInfo.fmc_detection?.fmc_key)){
  const key=scanInfo.fmc_detection?.fmc_key;
  fmcs.push(scanInfo.fmc_label||engine.REGISTRY.find(p=>p.key===key)?.label||key);
 }
 const nMissing=results.reduce((s,r)=>s+['MER','TER','PTR'].filter(k=>r[k]===null||r[k]===undefined).length,0);
 $('result').innerHTML=`
  <div class="stats">
   <div class="stat"><b>${results.length}</b><small>Classes / series</small></div>
   <div class="stat"><b>${results.length*3-nMissing}</b><small>Values extracted</small></div>
   <div class="stat"><b>${nMissing}</b><small>Missing values</small></div>
   <div class="stat"><b>${d.verified?'Verified':'Unverified'}</b><small>Review status</small></div>
  </div>
  <div class="fund-info"><strong>FMC:</strong><span>${html(fmcs.join(', ')||'Unrecognized')}</span> <strong>Fund:</strong><span>${html(funds.join(' · ')||'Not detected')}</span></div>
  ${!results.length?'<div class="notice">No confident financial ratios found. Verify the PDF table manually; missing values were not invented.</div>':
  `<div class="scroller"><table aria-label="Extracted financial ratios">
   <thead><tr><th>Class / Series</th><th>MER</th><th>TER</th><th>PTR</th><th>MRFP date</th><th>Action</th></tr></thead>
   <tbody>${results.map((r,i)=>`<tr id="resultrow${i}" data-index="${i}">
     <td>${html(r.class_name)}<div class="unit">${html(r.fund_name)}</div></td>
     <td class="number">${fmt(r.MER)}</td><td class="number">${fmt(r.TER)}</td><td class="number">${fmt(r.PTR)}</td>
     <td class="small">${html(displayDate(r.report_date))}</td>
     <td><span class="result-actions"><button class="ghost locate" data-index="${i}" title="Locate values in PDF" aria-label="Locate PDF evidence for ${html(r.class_name)}" ${!d.blob?'disabled':''}><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><button class="ghost edit" data-index="${i}">Edit</button></span></td></tr>`).join('')}</tbody></table></div>`}
  ${d.notes?.length?`<p class="notice">${html(d.notes.join(' | '))}</p>`:''}
 `;
 $('verify').textContent=d.verified?'✓ Verified':'Mark results as verified';
 $('details').innerHTML=`<details><summary>Extraction details</summary><p class="muted">Source: ${html(d.filename)} · Last scanned: ${html(new Date(d.updated||Date.now()).toLocaleString())} · ${html(d.source||'PDF.js native text')}</p><p class="muted">Empty PDF values remain blank. OCR may be less accurate and should be reviewed against the source tables.</p></details>`;
 $('rescanPanel').classList.add('hidden');stagedRescan=null;
 $('result').querySelectorAll('button.edit').forEach(b=>b.addEventListener('click',()=>beginEdit(Number(b.dataset.index))));
 $('result').querySelectorAll('button.locate').forEach(b=>b.addEventListener('click',()=>global.MRFP_EVIDENCE_VIEWER.focusRow(active?.results?.[Number(b.dataset.index)]).catch(error)));
 global.MRFP_EVIDENCE_VIEWER.updateDoc(d);
}
function displayDate(v){if(!v)return '—';const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(v);return m?`${m[2]}/${m[3]}/${m[1]}`:v;}
function beginEdit(i){
 if(!active||busy)return;
 const row=active.results[i],tr=$('resultrow'+i);if(!tr)return;
 tr.classList.add('editing');
 const numeric=x=>x===null||x===undefined?'':x;
 tr.innerHTML=`<td><strong>${html(row.class_name)}</strong><div class="unit">${html(row.fund_name)}</div></td>
 ${['MER','TER','PTR'].map(k=>`<td><input aria-label="${k}" class="editInput" type="text" inputmode="decimal" data-metric="${k}" value="${html(numeric(row[k]))}" placeholder="blank"></td>`).join('')}
 <td><input class="textInput" aria-label="Report date" id="editDate${i}" type="date" value="${html(row.report_date||'')}"></td>
 <td><button class="secondary doSave">Save</button> <button class="ghost doCancel">Cancel</button></td>`;
 tr.querySelector('.doCancel').onclick=()=>inspectDoc(active);
 tr.querySelector('.doSave').onclick=()=>saveEdit(i,tr);
 tr.querySelectorAll('input').forEach(inp=>inp.onkeydown=e=>{if(e.key==='Enter')saveEdit(i,tr);if(e.key==='Escape')inspectDoc(active);});
 tr.querySelector('input')?.focus();
}


function confirmManualEdit(previous, fields, date) {
  const modal = $('editConfirmModal');

  if (modal.open) return Promise.resolve(false);

  $('editConfirmSubject').textContent =
    previous.class_name || 'Selected class / series';

  const list = $('editChangeList');
  list.replaceChildren();

  const changes = [
    ['MER', previous.MER, fields.MER, fmt],
    ['TER', previous.TER, fields.TER, fmt],
    ['PTR', previous.PTR, fields.PTR, fmt],
    [
      'MRFP Date',
      previous.report_date || null,
      date || null,
      displayDate
    ]
  ];

  for (const [name, before, after, format] of changes) {
    if (before === after) continue;

    const row = document.createElement('div');
    row.className = 'edit-change-row';

    const label = document.createElement('span');
    label.className = 'edit-change-label';
    label.textContent = name;

    const values = document.createElement('div');
    values.className = 'edit-change-values';

    const oldVal = document.createElement('span');
    oldVal.className = 'edit-change-before';
    oldVal.textContent = format(before);

    const arrow = document.createElement('span');
    arrow.className = 'edit-change-arrow';
    arrow.textContent = '→';

    const newVal = document.createElement('span');
    newVal.className = 'edit-change-after';
    newVal.textContent = format(after);

    values.append(oldVal, arrow, newVal);
    row.append(label, values);
    list.appendChild(row);
  }

  if (!list.childElementCount) {
    const note = document.createElement('p');
    note.className = 'edit-no-changes';

    note.textContent =
      'No value differences detected. Saving will still ' +
      'mark the document Unverified.';

    list.appendChild(note);
  }

  return new Promise(resolve => {
    let approved = false;

    modal.onclose = () => resolve(approved);

    $('editConfirmSave').onclick = () => {
      approved = true;
      modal.close();
    };

    $('editConfirmCancel').onclick = () => modal.close();
    $('editConfirmClose').onclick = () => modal.close();

    modal.onclick = event => {
      if (event.target === modal) modal.close();
    };

    modal.showModal();
    $('editConfirmCancel').focus();
  });
}

async function saveEdit(i,tr){
 try{
  const fields={};for(const inp of tr.querySelectorAll('[data-metric]')){
   const value=inp.value.trim();
   if(!value){fields[inp.dataset.metric]=null;continue;}
   if(!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/.test(value))throw Error('Enter a valid number or leave blank: '+inp.dataset.metric);
   fields[inp.dataset.metric]=Number(value.replace(/[,%]/g,''));
  }
  const date=$('editDate'+i).value;
  if(!await confirmManualEdit(active.results[i],fields,date))return;
  const updated=structuredClone(active),row=updated.results[i];
  Object.assign(row,fields,{report_date:date||null,year:date?Number(date.slice(0,4)):null,needs_review:!date});
  // Keep source evidence and original scanned values distinct from manual corrections.
  if(!row.originalValues)row.originalValues={MER:active.results[i].MER,TER:active.results[i].TER,PTR:active.results[i].PTR};
  row.manualCorrections=row.manualCorrections||{};
  for(const k of ['MER','TER','PTR'])if(fields[k]!==active.results[i][k])row.manualCorrections[k]=true;
  row.evidence=row.evidence||{}; // Do not discard original source page/coordinates.
  updated.verified=false;updated.has_corrections=true;updated.updated=Date.now();
  await store.put(updated);active=updated;inspectDoc(updated);await history();updateHistoryReturn();
  status('Correction saved',100);
 }catch(e){alert(e.message);}
}
async function history(){
 const list=await store.listed();
 $('exportListed').classList.toggle('hidden',!list.length);
 $('recentCount').textContent=`${list.length} listed`;
 $('clearList').disabled=busy||!list.length;
 $('history').innerHTML=list.map(d=>`<button type="button" class="item ${active?.hash===d.hash?'active':''}" data-hash="${html(d.hash)}" title="Open saved results for ${html(d.filename)}"><span class="recent-item-name">${html(docFundName(d))}</span><span class="recent-item-file">${html(d.filename)}</span><span class="meta">${(d.results||[]).length} classes · ${html(docMRFPDate(d))} · ${html(new Date(d.updated||0).toLocaleString())} · ${d.verified?'Verified':'Unverified'}</span></button>`).join('')||'<p class="muted recent-empty">No recent documents yet. Extract a PDF or restore a saved fund from History.</p>';
 $('history').querySelectorAll('button.item').forEach(b=>b.onclick=async()=>{
  if(busy)return;
  currentBatchSelection=null;openedFromHistory=false;updateHistoryReturn();
  await loadSaved(b.dataset.hash);updateBatchDisplay();
 });
 await renderHistoryPage(); if(pageName==='reports')await renderReports();
 for(const entry of batchEntries){if(entry.hash){const latest=await store.get(entry.hash);if(latest)entry.snapshot=latest;}}
 updateBatchDisplay();
}
async function loadSaved(hash){
 const d=await store.get(hash);if(!d)throw Error('Document missing from local browser storage');
 // History selection overrides a pending upload, including the native file input.
 selectedFile=null;$('pdf').value='';
 inspectDoc(d);viewPdf(d.blob);status(d.blob?'Loaded from history':'History loaded — original PDF not available.',100);await history();
}
async function runAnalysis(file,{previewOnly=false}={}){
 const data=await reader.readFile(file,{onProgress:(p,n,message)=>{status(message);const entry=batchEntries.find(e=>e.state==='processing');if(entry){entry.message=message;updateBatchDisplay();}},ocrEnabled:prefs.ocr!==false});
 const extracted=engine.analyzePages(data.pages);
 if(extracted?.results?.length && extracted?.results.some(x=>!x.row_id))console.warn('Missing row identifiers');
 // Evidence location is a read-only post-processing step. It NEVER edits
 // financial values or the existing FMC-specific parsing logic.
 let evidenceMap=null;
 try{evidenceMap=global.MRFP_EVIDENCE.locate(data.pages,extracted.results||[]);}
 catch(e){console.warn('v5 evidence location unavailable; extraction was preserved',e);}
 return {...extracted,notes:data.notes,evidenceMap};
}
async function legacyScanFile(){
 if(!selectedFile){alert('Choose a PDF file first.');return;}
 if(busy)return;setBusy(true);status('Checking browser history…',3);
 try{
  if(!/^application\/pdf$/i.test(selectedFile.type)&&!selectedFile.name.toLowerCase().endsWith('.pdf'))throw Error('Please select a PDF');
  const hash=await store.fingerprint(selectedFile);
  let doc=await store.get(hash);
  if(!doc){
   const analysis=await runAnalysis(selectedFile);
   doc={hash,filename:selectedFile.name,blob:selectedFile,results:analysis.results,diagnostics:analysis.diagnostics,notes:analysis.notes,evidenceMap:analysis.evidenceMap,verified:false,has_corrections:false,source:'PDF.js native / optional OCR',created:Date.now()};
   await store.put(doc);status(analysis.results.length?'Scan saved':'No confident ratio tables detected',100);
  } else{
   // Never overwrite existing successful, manually corrected or verified data.
   // Empty scans from an older parser are safe to retry on a fresh upload;
   // otherwise a cached 0-row result could mask the updated Global X fix.
   if(!(doc.results||[]).length && !doc.has_corrections && !doc.verified){
    const analysis=await runAnalysis(selectedFile);
    if(analysis.results.length){
     doc.results=analysis.results;doc.diagnostics=analysis.diagnostics;
     doc.notes=analysis.notes;doc.evidenceMap=analysis.evidenceMap;doc.source='PDF.js native / optional OCR';
     doc.blob=selectedFile;await store.put(doc);
     status('Previous empty scan replaced with newly detected results',100);
    }else{
     if(!doc.blob){doc.blob=selectedFile;await store.put(doc);}
     status('No confident ratio tables detected — prior empty record kept',100);
    }
   }else{
    if(!doc.blob){doc.blob=selectedFile;await store.put(doc);}
    status('Existing saved extraction loaded; use Re-scan to replace',100);
   }
  }
  await store.addToWorkspace(hash);inspectDoc(doc);viewPdf(doc.blob);await history();
 }catch(e){error(e);}finally{setBusy(false);}
}
async function scanPasted(){
 const text=$('manualText').value.trim();if(!text){alert('Paste your MRFP text first.');return;}
 if(busy)return;setBusy(true);
 try{
  const pages=reader.fromPastedText(text),analysis=engine.analyzePages(pages);
  const bytes=new TextEncoder().encode(text),blob=new Blob([bytes],{type:'text/plain'});
  const hash='manual-'+[...bytes.slice(0,32)].reduce((a,b)=>((a*31+b)>>>0),bytes.length).toString(16)+'-'+bytes.length;
  let doc={hash,filename:'Pasted MRFP text',blob:null,results:analysis.results,diagnostics:analysis.diagnostics,notes:['Text-paste fallback: check results carefully; PDF geometry is unavailable.'],verified:false,has_corrections:false,source:'Manual text pasted',created:Date.now()};
  await store.put(doc);await store.addToWorkspace(hash);inspectDoc(doc);viewPdf(null);await history();status('Pasted text analyzed',100);
 }catch(e){error(e);}finally{setBusy(false);}
}
async function rescan(){
 if(!active)return;if(!active.blob){alert('Original PDF not retained in browser storage. Re-upload the file to scan again.');return;}
 if(busy)return;setBusy(true);status('Re-scanning saved PDF…',4);
 try{
  const analysis=await runAnalysis(active.blob);
  if(!analysis.results.length)throw Error('No confident results in re-scan; original saved data preserved.');
  stagedRescan={results:analysis.results,diagnostics:analysis.diagnostics,notes:analysis.notes,evidenceMap:analysis.evidenceMap,originalHash:active.hash,token:active.updated};
  const before=new Map((active.results||[]).map(r=>[r.row_id,r]));
  $('rescanComparison').innerHTML=`<table><thead><tr><th>Class</th><th>Previous MER / TER / PTR</th><th>New MER / TER / PTR</th><th>Change</th></tr></thead><tbody>${analysis.results.map(r=>{
   const old=before.get(r.row_id)||active.results.find(x=>x.class_name===r.class_name),change=!old||['MER','TER','PTR'].some(k=>old[k]!==r[k]);
   return `<tr class="${change?'diff':''}"><td>${html(r.class_name)}</td><td>${old?['MER','TER','PTR'].map(k=>fmt(old[k])).join(' / '):'New class'}</td><td>${['MER','TER','PTR'].map(k=>fmt(r[k])).join(' / ')}</td><td>${change?'Changed':'Same'}</td></tr>`;
  }).join('')}</tbody></table>`;
  $('rescanMessage').textContent=`Found ${analysis.results.length} classes. Existing manual edits will be replaced only if you click Yes, Replace Results.`;
  $('rescanPanel').classList.remove('hidden');status('Re-scan preview ready — review changes',100);
 }catch(e){error(e);}finally{setBusy(false);}
}

function askRescanReplace() {
  const dialog = $('rescanReplaceDialog');

  if (!dialog) {
    console.error('Re-scan confirmation dialog not found.');
    return Promise.resolve(false);
  }

  if (dialog.open) {
    return Promise.resolve(false);
  }

  $('rescanReplaceSummary').textContent =
    `${stagedRescan?.results?.length || 0} proposed classes · ` +
    `${active?.results?.length || 0} currently saved`;

  // Reset any decision from the previous opening.
  dialog.returnValue = 'cancel';

  return new Promise(resolve => {
    const onClose = () => {
      resolve(dialog.returnValue === 'replace');
    };

    // Only one close listener per opening.
    dialog.addEventListener('close', onClose, { once: true });

    try {
      dialog.showModal();
    } catch (err) {
      dialog.removeEventListener('close', onClose);
      console.error('Cannot open Re-scan modal:', err);
      resolve(false);
    }
  });
}

async function confirmRescan(){
 if(!stagedRescan||!active||stagedRescan.originalHash!==active.hash)return;
 if (!await askRescanReplace()) return;
 const original=await store.get(active.hash);
 if(!original||original.updated!==stagedRescan.token){alert('Saved document has changed. Run Re-scan again.');return;}
 original.results=stagedRescan.results;original.diagnostics=stagedRescan.diagnostics;original.notes=stagedRescan.notes;original.evidenceMap=stagedRescan.evidenceMap;original.verified=false;original.has_corrections=false;
 await store.put(original);inspectDoc(original);viewPdf(original.blob);await history();updateHistoryReturn();status('Re-scan saved; verification reset',100);
}
function download(blob,filename){
 const link=document.createElement('a'),url=URL.createObjectURL(blob);
 link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),15000);
}
async function exportDocs(scope,type='xlsx'){
 try{
  const docs=scope==='current'?(active?[await store.get(active.hash)||active]:[]):scope==='all'?await store.all():await store.listed();
  if(!docs.length){alert('No documents available to export.');return;}
  const basename=scope==='current'?'Current_Document':scope==='all'?'All_Funds':'Listed_Funds';
  download(type==='csv'?out.csv(docs):out.excel(docs),`MRFP_${basename}.${type}`);
 }catch(e){error(e);}
}
function clearDisplayedDocument(){
 selectedFile=null;active=null;stagedRescan=null;$('pdf').value='';
 $('filename').textContent='No PDF selected';viewPdf(null);
 $('result').replaceChildren();$('details').replaceChildren();
 $('download').classList.add('hidden');$('actions').classList.add('hidden');
 $('rescanPanel').classList.add('hidden');$('overview').classList.remove('hidden');
}

function bindSettings(){
 const settings=$('settingsDialog'),confirmBox=$('confirmDialog');
 let action=null;
 $('settingsOpen').onclick=()=>{if(!busy)settings.showModal();};
 $('settingsClose').onclick=()=>settings.close();
 $('confirmClose').onclick=()=>confirmBox.close();
 $('confirmCancel').onclick=()=>confirmBox.close();
 settings.addEventListener('click',e=>{if(e.target===settings)settings.close();});
 confirmBox.addEventListener('click',e=>{if(e.target===confirmBox)confirmBox.close();});
 function ask(which){
  if(busy)return;
  action=which;
  $('confirmTitle').textContent=which==='pdfs'?'Clear Stored PDFs?':'Reset ALL Saved Data?';
  $('confirmMessage').textContent=which==='pdfs'
   ?'This removes the PDF copies stored in this browser. Your extraction results, history, edits and verification will remain. PDF preview and re-scanning will require re-uploading the originals. Continue?'
   :'This permanently deletes ALL saved PDFs, extraction results, history, edits and verification records in this browser. This cannot be undone. Your source files on your computer are not affected. Continue?';
  $('confirmProceed').textContent=which==='pdfs'?'Yes, Clear Stored PDFs':'Yes, Reset All Saved Data';
  $('confirmProceed').className=which==='pdfs'?'secondary':'danger-button';
  confirmBox.showModal();
 }
 $('settingsClearPdfs').onclick=()=>ask('pdfs');
 $('settingsResetAll').onclick=()=>ask('all');
 $('confirmProceed').onclick=async()=>{
  if(busy||!action)return;
  const requested=action;action=null;
  $('confirmProceed').disabled=true;
  try{
   if(requested==='pdfs'){
    const count=await store.clearStoredPDFs();
    // Avoid an in-memory object URL keeping a deleted PDF available.
    selectedFile=null;$('pdf').value='';viewPdf(null);batchEntries=[];currentBatchSelection=null;updateBatchDisplay();
    if(active){const saved=await store.get(active.hash);if(saved)inspectDoc(saved);}
    await history();updateHistoryReturn();
    status(`Removed ${count} stored PDF ${count===1?'copy':'copies'}; results and history kept`,0);
   }else{
    const count=await store.resetAllSavedData();
    clearDisplayedDocument();batchEntries=[];currentBatchSelection=null;updateBatchDisplay();await history();
    status(`Reset complete — ${count} saved ${count===1?'document':'documents'} deleted`,0);
   }
   confirmBox.close();settings.close();
  }catch(e){error(e);alert('Nothing was intentionally reset after this storage error. '+(e?.message||e));}
  finally{$('confirmProceed').disabled=false;}
 };
}

function confirmClearList() {
  const modal = $('clearListModal');

  if (modal.open) return Promise.resolve(false);

  return new Promise(resolve => {
    let approved = false;

    modal.onclose = () => resolve(approved);

    $('clearListProceed').onclick = () => {
      approved = true;
      modal.close();
    };

    $('clearListCancel').onclick = () => modal.close();
    $('clearListClose').onclick = () => modal.close();

    modal.onclick = event => {
      if (event.target === modal) modal.close();
    };

    modal.showModal();
    $('clearListCancel').focus();
  });
}

// v4 UI orchestration: independent of the v3.1 PDF reader, FMC engine and Excel writer.
const MAX_BATCH=5;
let batchEntries=[],batchSerial=0,currentBatchSelection=null,openedFromHistory=false;
let pageName='extract',historyPageIndex=0,reportDocs=[];
let prefs=(()=>{try{return {...{theme:'light',landing:'extract',ocr:true},...JSON.parse(localStorage.getItem('mrfp_v4_preferences')||'{}')};}catch{return {theme:'light',landing:'extract',ocr:true};}})();
function savePrefs(){try{localStorage.setItem('mrfp_v4_preferences',JSON.stringify(prefs));}catch(e){notices('Settings could not be persisted in this browser: '+e.message);}}
function applyTheme(){document.documentElement.dataset.theme=prefs.theme==='dark'?'dark':prefs.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
function setPage(page){
 if(!['extract','history','reports','settings'].includes(page))page='extract';
 pageName=page;
 for(const name of ['extract','history','reports','settings']){
  $(name+'Page').classList.toggle('hidden',name!==page);
  const btn=document.querySelector('[data-page="'+name+'"]');
  btn.classList.toggle('is-active',name===page);
  if(name===page)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');
 }
 if(page==='history')renderHistoryPage().catch(error);
 if(page==='reports')renderReports().catch(error);
 if(page==='settings')renderStorageInfo().catch(error);
}
function updateBatchDisplay(){
 $('batchCount').textContent=`${batchEntries.length} / ${MAX_BATCH} files selected`;
 $('newBatch').disabled=busy||!batchEntries.length;
 $('batchList').innerHTML=batchEntries.map(entry=>{
  const state=entry.state==='partial'?'Completed · missing values':entry.state.charAt(0).toUpperCase()+entry.state.slice(1);
  const selected=currentBatchSelection===entry.id;
  return `<div class="batch-document ${selected?'selected':''}" data-entry="${entry.id}">
   <button type="button" class="batch-open" data-entry="${entry.id}" ${busy?'disabled':''} title="Review this document"><span class="batch-icon">PDF</span><span class="batch-file"><b>${html(entry.file.name)}</b><small>${html(entry.message||state)}</small></span></button>
   <span class="batch-status ${html(entry.state)}">${html(state)}</span>
   ${entry.state==='failed'?`<button class="ghost batch-retry" data-entry="${entry.id}" ${busy?'disabled':''}>Retry</button>`:''}
   <button class="batch-remove ghost" aria-label="Remove ${html(entry.file.name)}" data-entry="${entry.id}" title="Remove from queue" ${busy?'disabled':''}>×</button>
  </div>`;
 }).join('')||'<span class="muted">Choose PDF files to prepare a batch.</span>';
 $('batchList').querySelectorAll('.batch-open').forEach(el=>el.onclick=()=>selectBatchEntry(Number(el.dataset.entry)).catch(error));
 $('batchList').querySelectorAll('.batch-remove').forEach(el=>el.onclick=()=>removeBatchEntry(Number(el.dataset.entry)));
 $('batchList').querySelectorAll('.batch-retry').forEach(el=>el.onclick=()=>retryBatchEntry(Number(el.dataset.entry)));
 const completed=batchEntries.filter(e=>e.state==='completed'||e.state==='partial'),failed=batchEntries.filter(e=>e.state==='failed');
 let classes=0,mer=0,ter=0,ptr=0,missing=0;
 for(const entry of completed){const rows=entry.snapshot?.results||[];classes+=rows.length;
  for(const row of rows)for(const key of ['MER','TER','PTR']){
   if(row[key]===null||row[key]===undefined||row[key]==='')missing++;
   else if(key==='MER')mer++;else if(key==='TER')ter++;else ptr++;
  }
 }
 const hasSummary=completed.length||failed.length;
 $('batchSummary').classList.toggle('hidden',!hasSummary);
 $('batchSummary').innerHTML=hasSummary?[
  [completed.length,'PDFs completed'],[classes,'Classes / series'],[mer,'MER values'],[ter,'TER values'],[ptr,'PTR values'],[missing,'Missing values'],[failed.length,'Failed']
 ].map(([n,label])=>`<div class="batch-stat"><b>${n}</b><small>${label}</small></div>`).join(''):'';
}
function validPDF(file){return file&&/\.pdf$/i.test(file.name)&&(!file.type||file.type==='application/pdf'||file.type==='application/x-pdf');}
function addBatchFiles(files){
 if(busy)return;
 let invalid=0,duplicate=0,overflow=0,added=[];
 for(const file of [...files]){
  if(!validPDF(file)){invalid++;continue;}
  if(batchEntries.some(e=>e.file.name===file.name&&e.file.size===file.size&&e.file.lastModified===file.lastModified)){duplicate++;continue;}
  if(batchEntries.length>=MAX_BATCH){overflow++;continue;}
  const entry={id:++batchSerial,file,state:'queued',message:'Queued for extraction',hash:null,snapshot:null,error:null};
  batchEntries.push(entry);added.push(entry);
 }
 if(added.length && currentBatchSelection===null)selectBatchEntry(added[0].id).catch(error);
 updateBatchDisplay();
 const messages=[];
 if(invalid)messages.push(`${invalid} invalid/non-PDF file(s) skipped`);
 if(duplicate)messages.push(`${duplicate} duplicate selection(s) skipped`);
 if(overflow)messages.push(`${overflow} file(s) skipped: ${MAX_BATCH}-PDF maximum`);
 if(messages.length)notices(messages.join(' · '));
 else if(added.length)notices(`Ready: ${batchEntries.length} of ${MAX_BATCH} PDFs. Click Extract selected PDFs.`,true);
 $('pdf').value='';
}
async function selectBatchEntry(id){
 if(busy)return;
 const entry=batchEntries.find(e=>e.id===id);if(!entry)return;
 currentBatchSelection=id;openedFromHistory=false;updateHistoryReturn();
 selectedFile=entry.file;stagedRescan=null;$('rescanPanel').classList.add('hidden');
 $('filename').textContent=entry.file.name;
 if(entry.hash&&(entry.state==='completed'||entry.state==='partial')){
  const doc=await store.get(entry.hash);
  if(doc){entry.snapshot=doc;inspectDoc(doc);if(!doc.blob){$('result').querySelectorAll('button.locate').forEach(b=>b.disabled=false);}viewPdf(doc.blob||entry.file);status('Showing '+entry.file.name);updateBatchDisplay();return;}
 }
 active=null;$('result').replaceChildren();$('details').replaceChildren();
 $('download').classList.add('hidden');$('actions').classList.add('hidden');$('overview').classList.remove('hidden');
 $('overview').innerHTML=`<div class="emptyIcon">▤</div><b>${html(entry.file.name)}</b><br><small>${html(entry.error||entry.message||'Not yet processed')}</small>`;
 viewPdf(entry.file);status('Selected: '+entry.file.name,0);updateBatchDisplay();
}
function removeBatchEntry(id){
 if(busy)return;
 batchEntries=batchEntries.filter(e=>e.id!==id);
 if(currentBatchSelection===id){currentBatchSelection=null;
  clearDisplayedDocument();
  if(batchEntries.length)selectBatchEntry(batchEntries[0].id).catch(error);
 }
 updateBatchDisplay();
}
function clearBatch(){
 if(busy)return;batchEntries=[];currentBatchSelection=null;openedFromHistory=false;updateHistoryReturn();
 clearDisplayedDocument();$('overview').innerHTML='<div class="emptyIcon">▤</div>Choose one to five MRFP PDFs to begin.<br><small>Existing saved history remains unchanged.</small>';
 updateBatchDisplay();status('Batch cleared — saved history kept',0);
}
async function extractAndSave(file){
 if(!validPDF(file))throw Error('Only PDF documents are supported');
 const signature=new Uint8Array(await file.slice(0,8).arrayBuffer());
 if(String.fromCharCode(...signature.slice(0,5))!=='%PDF-')throw Error('Invalid PDF header — file is not a valid PDF document');
 const hash=await store.fingerprint(file);
 let doc=await store.get(hash);
 if(!doc){
  const analysis=await runAnalysis(file);
  doc={hash,filename:file.name,blob:file,results:analysis.results,diagnostics:analysis.diagnostics,notes:analysis.notes,evidenceMap:analysis.evidenceMap,verified:false,has_corrections:false,source:'PDF.js native / optional OCR',created:Date.now()};
  await store.put(doc);
 }else if(!(doc.results||[]).length&&!doc.has_corrections&&!doc.verified){
  const analysis=await runAnalysis(file);
  if(analysis.results.length){doc.results=analysis.results;doc.diagnostics=analysis.diagnostics;doc.notes=analysis.notes;doc.evidenceMap=analysis.evidenceMap;doc.source='PDF.js native / optional OCR';doc.blob=file;await store.put(doc);}
  else if(!doc.blob){doc.blob=file;await store.put(doc);}
 }else if(!doc.blob){doc.blob=file;await store.put(doc);}
 await store.addToWorkspace(hash);
 return doc;
}
async function processOne(entry,idx,total){
 entry.state='processing';entry.error=null;entry.message=`Document ${idx} of ${total} · Reading PDF`;
 status(`Processing ${idx}/${total}: ${entry.file.name}`);updateBatchDisplay();
 try{
  const doc=await extractAndSave(entry.file);
  entry.hash=doc.hash;entry.snapshot=doc;
  const missing=(doc.results||[]).some(r=>['MER','TER','PTR'].some(k=>r[k]===null||r[k]===undefined));
  entry.state=missing||!(doc.results||[]).length?'partial':'completed';
  entry.message=doc.results?.length?`${doc.results.length} classes · ${doc.verified?'Previously verified':'Review pending'}`:'No confident ratio rows · review needed';
  if(currentBatchSelection===entry.id){active=doc;inspectDoc(doc);if(!doc.blob){$('result').querySelectorAll('button.locate').forEach(b=>b.disabled=false);}viewPdf(doc.blob||entry.file);}
 }catch(e){entry.state='failed';entry.error=e.message||String(e);entry.message=entry.error;console.error('Batch document failed',entry.file.name,e);}
 updateBatchDisplay();
}
async function processBatch(){
 if(busy)return;
 const queue=batchEntries.filter(e=>e.state==='queued');
 if(!queue.length){notices(batchEntries.length?'No queued PDFs. Failed files have individual Retry controls.':'Select at least one PDF first.');return;}
 setBusy(true);const total=queue.length;
 try{
  for(let i=0;i<queue.length;i++){
   await processOne(queue[i],i+1,total);
   status(`Finished ${i+1}/${total} queued PDFs`,Math.round((i+1)/total*100));
  }
  const failed=queue.filter(e=>e.state==='failed').length;
  notices(`${total-failed} of ${total} scanned or loaded · ${failed} failed · extraction completion does not mean verified.`,failed===0);
  await history();
 }catch(e){error(e);}finally{setBusy(false);updateBatchDisplay();}
}
async function retryBatchEntry(id){
 if(busy)return;const entry=batchEntries.find(e=>e.id===id);if(!entry||entry.state!=='failed')return;
 setBusy(true);
 try{await processOne(entry,1,1);await history();status(entry.state==='failed'?'Retry failed: '+entry.error:'Retry complete',100);}
 finally{setBusy(false);updateBatchDisplay();}
}
function updateHistoryReturn(){
 $('historyReturn').classList.toggle('hidden',!openedFromHistory);
 if(openedFromHistory){$('historyStatus').textContent='Loaded from history: '+(active?.results?.[0]?.fund_name||active?.filename||'Saved document')+' · '+(active?.blob?'Original PDF available':'History loaded — original PDF not available.');}
}
function dateLabel(d){return new Date(d.created||d.updated||0).toLocaleString();}
function docFundName(d){return [...new Set((d.results||[]).map(r=>r.fund_name).filter(Boolean))].join(' · ')||d.filename||'Unnamed document';}
function docMRFPDate(d){return [...new Set((d.results||[]).map(r=>r.report_date).filter(Boolean))].map(displayDate).join(', ')||'—';}
function withinPeriod(doc,period){
 if(period==='all')return true;
 const when=doc.updated||doc.created||0,now=Date.now();
 if(period==='month'){const a=new Date(when),b=new Date(now);return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth();}
 return when>=now-Number(period)*86400000;
}
async function renderHistoryPage(){
 const listedHashes=new Set(await store.workspace());
 const docs=(await store.all()).filter(d=>withinPeriod(d,$('historyPeriod').value)).sort((a,b)=>(b.created||b.updated||0)-(a.created||a.updated||0));
 const term=$('historySearch').value.trim().toLowerCase();
 const filtered=docs.filter(d=>[d.filename,docFundName(d)].some(s=>String(s||'').toLowerCase().includes(term)));
 const limit=Number($('historyPageSize').value)||10,pages=Math.max(1,Math.ceil(filtered.length/limit));
 historyPageIndex=Math.max(0,Math.min(historyPageIndex,pages-1));
 const visible=filtered.slice(historyPageIndex*limit,(historyPageIndex+1)*limit);
 $('historyRows').innerHTML=visible.map(d=>`<tr><td class="small">${html(dateLabel(d))}</td><td><b>${html(docFundName(d))}</b><small class="row-file">${html(d.filename)}</small></td><td>${(d.results||[]).length}</td><td>${html(docMRFPDate(d))}</td><td><span class="verification-pill ${d.verified?'verified':'unverified'}">${d.verified?'✓ Verified':'Unverified'}</span></td><td class="history-actions"><button class="ghost view-saved" data-hash="${html(d.hash)}" type="button">View</button><button class="ghost restore-saved" data-hash="${html(d.hash)}" ${listedHashes.has(d.hash)?'disabled title="Already in Recent Documents"':''} type="button">${listedHashes.has(d.hash)?'In List':'Restore'}</button><button class="ghost rescan-saved" data-hash="${html(d.hash)}" ${d.blob?'':'disabled title="Original PDF unavailable"'} type="button">Re-scan</button><button class="ghost delete-saved" data-hash="${html(d.hash)}" type="button">Delete</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty-results">No matching saved documents.</td></tr>';
 $('historyTotal').textContent=`${filtered.length} saved record${filtered.length===1?'':'s'}`;
 $('historyPageNumber').textContent=`${historyPageIndex+1} of ${pages}`;
 $('historyPrevious').disabled=historyPageIndex===0;$('historyNext').disabled=historyPageIndex>=pages-1;
 $('historyRows').querySelectorAll('.view-saved').forEach(b=>b.onclick=()=>openFromHistory(b.dataset.hash,false).catch(error));
 $('historyRows').querySelectorAll('.restore-saved').forEach(b=>b.onclick=()=>restoreFromHistory(b.dataset.hash).catch(error));
 $('historyRows').querySelectorAll('.rescan-saved').forEach(b=>b.onclick=()=>openFromHistory(b.dataset.hash,true).catch(error));
 $('historyRows').querySelectorAll('.delete-saved').forEach(b=>b.onclick=()=>deleteHistory(b.dataset.hash).catch(error));
}
async function restoreFromHistory(hash){
 if(busy)return;
 const doc=await store.get(hash);if(!doc)throw Error('The saved document could not be found.');
 await store.addToWorkspace(hash);
 await history();
 status(`Restored to Recent Documents: ${docFundName(doc)}`,0);
}
async function openFromHistory(hash,retry){
 if(busy)return;
 await loadSaved(hash);
 currentBatchSelection=null;updateBatchDisplay();openedFromHistory=true;updateHistoryReturn();setPage('extract');
 if(retry)await rescan();
}
async function deleteHistory(hash){
 if(busy)return;const doc=await store.get(hash);if(!doc)return;
 if(!confirm(`Delete saved history for "${docFundName(doc)}"? This permanently removes its extraction and stored PDF. Other records are not affected.`))return;
 await store.remove(hash);
 for(const e of batchEntries)if(e.hash===hash){e.state='queued';e.hash=null;e.snapshot=null;e.message='Saved copy deleted · re-extract to save again';}
 if(active?.hash===hash)clearDisplayedDocument();
 await history();updateBatchDisplay();status('Saved record deleted',0);
}
function getValueCount(rows,key){return rows.reduce((n,r)=>n+(r[key]!==null&&r[key]!==undefined&&r[key]!==''?1:0),0);}
function ratioBar(label,value,total){const width=total?Math.round(value/total*100):0;return `<div class="bar-line"><span>${html(label)}</span><div class="bar-track"><i style="width:${width}%"></i></div><b>${value}</b></div>`;}
async function renderReports(){
 reportDocs=(await store.all()).filter(d=>withinPeriod(d,$('reportPeriod').value));
 const docs=reportDocs,rows=docs.flatMap(d=>d.results||[]);
 const fundNames=new Set(rows.map(r=>r.fund_name).filter(Boolean));
 let mer=getValueCount(rows,'MER'),ter=getValueCount(rows,'TER'),ptr=getValueCount(rows,'PTR');
 const missing=rows.length*3-mer-ter-ptr;
 const verified=docs.filter(d=>d.verified).length;
 $('reportStats').innerHTML=[
  [docs.length,'Saved documents'],[fundNames.size,'Unique fund names'],[rows.length,'Classes / series'],[`${mer}/${rows.length}`,'MER populated'],[`${ter}/${rows.length}`,'TER populated'],[`${ptr}/${rows.length}`,'PTR populated'],[missing,'Missing ratio cells'],[`${verified} / ${docs.length}`,'User-verified documents']
 ].map(([n,label])=>`<div class="report-stat"><b>${n}</b><small>${label}</small></div>`).join('');
 const funds=new Map();for(const r of rows){const name=r.fund_name||'Fund name missing';funds.set(name,(funds.get(name)||0)+1);}
 const sorted=[...funds].sort((a,b)=>b[1]-a[1]);const max=Math.max(0,...sorted.map(x=>x[1]));
 $('reportFundBars').innerHTML=sorted.length?sorted.slice(0,14).map(([name,n])=>ratioBar(name,n,max)).join(''):'<p class="muted">No saved classes in this period.</p>';
 $('reportVerifyBars').innerHTML=ratioBar('User-verified',verified,docs.length)+ratioBar('Unverified',docs.length-verified,docs.length)+ratioBar('Documents with missing ratios',docs.filter(d=>(d.results||[]).some(r=>['MER','TER','PTR'].some(k=>r[k]===null||r[k]===undefined))).length,docs.length);
 $('reportRows').innerHTML=docs.map(d=>{
  const r=d.results||[],m=getValueCount(r,'MER'),t=getValueCount(r,'TER'),p=getValueCount(r,'PTR');
  return `<tr><td>${html(docFundName(d))}<small class="row-file">${html(d.filename)}</small></td><td>${r.length}</td><td>${m}/${r.length}</td><td>${t}/${r.length}</td><td>${p}/${r.length}</td><td>${3*r.length-m-t-p}</td><td>${d.verified?'Verified':'Unverified'}</td></tr>`;
 }).join('')||'<tr><td colspan="7">No stored reports in selected period.</td></tr>';
}
function exportReport(){
 const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const lines=[['Fund name','Filename','Classes','MER populated','TER populated','PTR populated','Missing ratio cells','Verification']];
 for(const d of reportDocs){const r=d.results||[],m=getValueCount(r,'MER'),t=getValueCount(r,'TER'),p=getValueCount(r,'PTR');lines.push([docFundName(d),d.filename,r.length,m,t,p,3*r.length-m-t-p,d.verified?'Verified':'Unverified']);}
 download(new Blob(['\ufeff'+lines.map(line=>line.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'MRFP_v5_Report.csv');
}
async function renderStorageInfo(){
 const docs=await store.all(),pdfs=docs.filter(d=>d.blob).length;
 $('storageOverview').textContent=`${docs.length} saved documents · ${pdfs} original PDF copies · ${docs.length-pdfs} without original PDFs · ${store.isTemporary()?'Temporary (storage blocked; data may disappear on refresh)':'IndexedDB persistent storage'}.`;
}
function showSettingTab(name){
 document.querySelectorAll('.setting-tab').forEach(b=>b.classList.toggle('is-active',b.dataset.setting===name));
 for(const key of ['general','extraction','storage','about'])$('settings'+key[0].toUpperCase()+key.slice(1)).classList.toggle('hidden',key!==name);
 if(name==='storage')renderStorageInfo().catch(error);
}
async function backupHistory(){
 const docs=(await store.all()).map(store.slim);
 download(new Blob([JSON.stringify({schema:'MRFP-v4-results-backup',version:1,exportedAt:new Date().toISOString(),notice:'Original PDF files are not included.',docs},null,2)],{type:'application/json'}),`MRFP_History_Backup_${new Date().toISOString().slice(0,10)}.json`);
 status(`History backup exported (${docs.length} records; PDFs not included)`);
}
async function importHistory(file){
 if(!file)return;
 if(file.size>100*1024*1024)throw Error('Backup too large (100 MB maximum).');
 const data=JSON.parse(await file.text());
 if(data.schema!=='MRFP-v4-results-backup'||data.version!==1||!Array.isArray(data.docs))throw Error('Not a supported MRFP results backup.');
 if(!confirm(`Import ${data.docs.length} history records? Existing saved records will NOT be overwritten. Original PDFs are not included.`))return;
 let added=0,skipped=0;
 for(const item of data.docs){
  if(!item||typeof item.hash!=='string'||item.hash.length>200||!Array.isArray(item.results)||typeof item.filename!=='string'){skipped++;continue;}
  if(await store.get(item.hash)){skipped++;continue;}
  const safe={...item,blob:null};delete safe.blob;
  await store.importDoc(safe);added++;
 }
 await history();await renderStorageInfo();status(`Imported ${added} new records; skipped ${skipped}`,0);
}
function bindV4(){
 document.querySelectorAll('.nav-btn').forEach(btn=>btn.onclick=()=>{if(!busy)setPage(btn.dataset.page);});
 $('pdf').addEventListener('change',e=>addBatchFiles(e.target.files||[]));
 $('extract').onclick=processBatch;
 $('newBatch').onclick=clearBatch;
 const bar=$('uploadZone');
 bar.addEventListener('dragover',e=>{e.preventDefault();bar.classList.add('dragging');});
 bar.addEventListener('dragleave',()=>bar.classList.remove('dragging'));
 bar.addEventListener('drop',e=>{e.preventDefault();bar.classList.remove('dragging');if(!busy)addBatchFiles(e.dataTransfer.files);});
 $('backToHistory').onclick=()=>{openedFromHistory=false;updateHistoryReturn();setPage('history');};
 for(const id of ['historySearch','historyPeriod','historyPageSize']){
  $(id).addEventListener(id==='historySearch'?'input':'change',()=>{historyPageIndex=0;renderHistoryPage().catch(error);});
 }
 $('historyPrevious').onclick=()=>{historyPageIndex--;renderHistoryPage().catch(error);};
 $('historyNext').onclick=()=>{historyPageIndex++;renderHistoryPage().catch(error);};
 $('historyRefresh').onclick=()=>renderHistoryPage().catch(error);
 $('reportPeriod').onchange=()=>renderReports().catch(error);
 $('reportExport').onclick=exportReport;
 for(const b of document.querySelectorAll('.setting-tab'))b.onclick=()=>showSettingTab(b.dataset.setting);
 $('prefTheme').value=prefs.theme;$('prefLanding').value=prefs.landing;$('prefOCR').checked=prefs.ocr!==false;
 $('prefTheme').onchange=e=>{prefs.theme=e.target.value;savePrefs();applyTheme();};
 $('prefLanding').onchange=e=>{prefs.landing=e.target.value;savePrefs();};
 $('prefOCR').onchange=e=>{prefs.ocr=e.target.checked;savePrefs();};
 $('backupHistory').onclick=()=>backupHistory().catch(error);
 $('importHistory').onchange=e=>{const f=e.target.files?.[0];if(f)importHistory(f).catch(err=>{error(err);alert(err.message);});e.target.value='';};
 $('openLegacySettings').onclick=()=>{if(!busy)$('settingsDialog').showModal();};
 applyTheme();updateBatchDisplay();setPage(prefs.landing);
}

function bind(){
 bindSettings();bindV4();
 $('extractText').onclick=scanPasted;
 $('verify').onclick=async()=>{
  if(!active||busy)return;
  if(!(active.results||[]).length){alert('No results to verify.');return;}
  if(!confirm('Mark all extracted results as verified? Please check the original PDF first.'))return;
  const d=structuredClone(active);d.verified=true;await store.put(d);inspectDoc(d);await history();updateHistoryReturn();status('Marked verified',100);
 };
 $('rescan').onclick=rescan;
 $('rescanCancel').onclick=()=>{stagedRescan=null;$('rescanPanel').classList.add('hidden');status('Re-scan canceled',100);};
 $('rescanConfirm').onclick=()=>confirmRescan().catch(error);
 $('reloadHistory').onclick=()=>history().catch(error);
 $('clearList').onclick=async()=>{
  if(busy||!await confirmClearList())return;
  await store.clearWorkspace();
  await history();status('Recent Documents cleared — upload batch and saved History kept',0);
 };
 $('viewAllHistory').onclick=()=>{if(!busy)setPage('history');};
 for(const [id,scope] of [['download','current'],['exportAll','all'],['exportListed','listed']]){
  $(id).onclick=e=>{e.preventDefault();exportDocs(scope,'xlsx');};
 }
 const csvBtn=document.createElement('button');csvBtn.textContent='Export CSV';csvBtn.className='ghost';
 csvBtn.title='Export all saved results as CSV (single worksheet alternative)';
 csvBtn.onclick=()=>exportDocs('all','csv');
 $('actions').appendChild(csvBtn);
 const toggle=document.createElement('button');toggle.textContent='Paste PDF text';toggle.className='ghost';
 toggle.onclick=()=>$('fallback').classList.toggle('hidden');
 document.querySelector('.toolbar').appendChild(toggle);

}
async function startup(){
 bind();try{await store.db();await history();status(store.isTemporary()?'Ready — temporary history only':'Ready',0);}
 catch(e){error(Error('Browser storage unavailable: '+e.message+'. Use Chrome or Edge with IndexedDB enabled.'));}
 // PDF.js may still be loading asynchronously; do not block user interface.
 reader.ensurePdf().then(()=>notices('PDF.js ready — processing is local to this browser.',true))
 .catch(()=>{notices('Bundled PDF.js could not load. Paste-text fallback available.');$('fallback').classList.remove('hidden');});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startup);else startup();
})(globalThis);
