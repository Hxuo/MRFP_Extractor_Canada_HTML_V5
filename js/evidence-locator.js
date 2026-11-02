/* v5 source-evidence locator. Independent of the financial parser.
 * Reject ambiguous matches: equal numeric values are NOT source coordinates.
 * Coordinates use PDF.js unscaled PDF user-space (origin at bottom left).
 */
(function(global){
'use strict';
const METRICS=['MER','TER','PTR'];
const LABELS={
 MER:/\b(?:management\s+(?:expense|expenses)\s+ratio|management\s+expense|MER)\b/i,
 TER:/\b(?:trading\s+(?:expense|expenses)\s+ratio|trading\s+expenses?|TER)\b/i,
 PTR:/\b(?:portfolio\s+turnover(?:\s+(?:rate|ratio))?|turnover\s+(?:rate|ratio)|PTR)\b/i
};
const RATIO_SECTION=/ratios?\s+(?:and|&)\s+supplemental|financial\s+(?:highlights|ratios)|management\s+expense|trading\s+expense|portfolio\s+turnover|\bMER\b|\bTER\b/i;
const clean=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
const almost=(a,b)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<.000001;
const category=s=>/ETF|Units/i.test(s||'')?'units':'series';
function clsPatterns(s){
 const name=clean(s).replace(/[–—]/g,'-'), escape=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const patterns=[new RegExp('(?:^|[^a-z0-9])'+escape(name).replace(/\s+/g,'\\s+')+'(?=$|[^a-z0-9])','i')];
 if(/^series\s+/i.test(name))patterns.push(new RegExp('(?:^|[^a-z0-9])'+escape(name.replace(/^series\s+/,''))+'(?=$|[^a-z0-9])','i'));
 return patterns;
}
function textLines(items){
 const arr=[];
 for(const it of (items||[])){
  if(typeof it.str!=='string'||!it.str.trim()||!Number.isFinite(it.x)||!Number.isFinite(it.y))continue;
  const h=Math.max(5,Number(it.h)||8);
  let line=arr.find(l=>Math.abs(l.y-it.y)<Math.max(1.5,Math.min(2.8,h*.25)));
  if(!line){line={y:it.y,items:[]};arr.push(line);}
  line.items.push({...it,h});
 }
 arr.sort((a,b)=>b.y-a.y);
 for(const line of arr){line.items.sort((a,b)=>a.x-b.x);line.text=line.items.map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();line.minX=Math.min(...line.items.map(i=>i.x));line.maxX=Math.max(...line.items.map(i=>i.x+i.w));}
 return arr;
}
// Individual PDF.js fragments may contain "23 . 46%", "0 . 10%" or "23.46%".
// Match entire decimal and percent, NEVER the prefix 23 from 23 . 46.
function numbers(line){
 const items=line.items, chars=[];
 // Bridge only typographic gaps within a plausible decimal number; keep wide columns separate.
 for(let i=0;i<items.length;i++){
  const it=items[i],text=String(it.str||'');
  const width=Math.max(0.1,Number(it.w)||text.length*it.h*.45);
  for(let j=0;j<text.length;j++)chars.push({c:text[j],x:it.x+width*j/Math.max(1,text.length),right:it.x+width*(j+1)/Math.max(1,text.length),y:it.y,h:it.h,item:i});
  if(i+1<items.length){const next=items[i+1],gap=next.x-(it.x+it.w);
   chars.push({c:gap<=Math.max(4,it.h*.85)?' ':'|',x:it.x+it.w,right:next.x,y:it.y,h:it.h,item:-1});
  }
 }
 const s=chars.map(c=>c.c).join(''),out=[];
 // Captures decimals separated by whitespace and punctuation without swallowing adjacent columns.
 const re=/(^|[^\w.])(-?\d{1,3}(?:,\d{3})*(?:\s*\.\s*\d+)?|-?\d+(?:\s*\.\s*\d+)?)(?:\s*%)?(?![\w.])/g;
 let m;while((m=re.exec(s))){
  const raw=m[2],val=Number(raw.replace(/[\s,]/g,''));if(!Number.isFinite(val))continue;
  const start=m.index+m[1].length,stop=start+raw.length;
  const span=chars.slice(start,stop).filter(c=>c.item>=0);if(!span.length)continue;
  const x=Math.min(...span.map(c=>c.x)),right=Math.max(...span.map(c=>c.right)),h=Math.max(...span.map(c=>c.h));
  // Some PDF.js glyphs use the same x position, or number is part of a combined run;
  // never promise a box if width or coordinates are unusable.
  if(!(right>x&&h>0))continue;
  out.push({value:val,box:{x:Math.max(0,x-1),y:line.y-1,w:right-x+2,h:h+2},x,raw});
 }
 // Some PDFs omit the decimal glyph from PDF.js text entirely: "23" + "46%".
 // A glued pair (<4pt gap) with a percent suffix is usable ONLY after a
 // date-column/metric-row validation by a caller; the candidate is not proof.
 for(let i=0;i<items.length-1;i++){
  const a=items[i],b=items[i+1],left=a.str.trim(),right=b.str.trim();
  const gap=b.x-(a.x+a.w);
  if(!/^\d{1,3}$/.test(left)||!/^\d{1,2}%$/.test(right)||gap<-.5||gap>4.5)continue;
  const val=Number(left+'.'+right.replace('%',''));
  out.push({value:val,x:a.x,raw:left+'.'+right,box:{x:a.x-1,y:line.y-1,w:b.x+b.w-a.x+2,h:Math.max(a.h,b.h)+2},fragmented:true});
 }
 return out;
}
// Printed em/en dashes, double hyphens and standalone hyphens are a
// *visible missing-data cell*, not numeric zero and not a fabricated value.
// Use PDF.js glyph coordinates only; never create boxes for blank cells.
function missingMarks(line){
 const parts=[];
 for(const it of line.items){
  const str=String(it.str||'');
  // A PDF.js item may hold several separated cells. Accept only dash runs
  // bounded by whitespace, or standalone dash items.
  const re=/(^|\s)([-–—−]{1,})(?=\s|$)/g;
  let match;
  while((match=re.exec(str))){
   const raw=match[2],start=match.index+match[1].length;
   const glyphWidth=Math.max(.1,Number(it.w)||str.length*it.h*.45);
   const x=it.x+glyphWidth*start/Math.max(1,str.length);
   const width=Math.max(1,glyphWidth*raw.length/Math.max(1,str.length));
   if(!Number.isFinite(x)||!Number.isFinite(width)||width<=0)continue;
   parts.push({raw,x,right:x+width,h:it.h});
  }
 }
 parts.sort((a,b)=>a.x-b.x);
 const out=[];
 for(let i=0;i<parts.length;i++){
  let p={...parts[i]};
  // PDF.js sometimes splits "--" into two distinct, touching text items.
  // Merge ONLY adjacent literal hyphens so they don't become two ambiguous
  // candidates for one actual source cell.
  while(p.raw.endsWith('-')&&i+1<parts.length&&parts[i+1].raw.startsWith('-')
   &&parts[i+1].x-p.right>=-0.5&&parts[i+1].x-p.right<=3.5){
   const next=parts[++i];p.raw+=next.raw;p.right=next.right;p.h=Math.max(p.h,next.h);
  }
  // A standalone minus glyph immediately before numeric characters is a
  // signed number, not a missing-value marker.
  if(p.raw==='-'&&line.items.some(it=>/^\s*\d/.test(String(it.str||''))
   &&it.x-p.right>=-0.5&&it.x-p.right<3.5))continue;
  out.push({value:null,isMissing:true,raw:p.raw,x:p.x,box:{x:Math.max(0,p.x-1),y:line.y-1,w:p.right-p.x+2,h:p.h+2}});
 }
 return out;
}
function cells(line){return [...numbers(line),...missingMarks(line)].sort((a,b)=>a.x-b.x);}
function matchesCell(cell,value){return value===null||value===undefined ? cell.isMissing===true : !cell.isMissing&&almost(cell.value,value);}
function classLine(line,row){
 const t=clean(line.text),p=clsPatterns(row.class_name||'');
 if(p[0].test(t))return true;
 // An abbreviated single-letter column heading is not sufficient to establish a class.
 return false;
}
function nearestClassAbove(lines,target,row){
 const earlier=lines.filter(l=>l.y>=target.y-.75&&l.y-target.y<245).sort((a,b)=>a.y-b.y);
 const matching=earlier.filter(l=>classLine(l,row));
 if(!matching.length)return null;
 const best=matching[0];
 // A closer DIFFERENT class heading prevents assigning all subsequent metrics to one class.
 for(const candidate of earlier){
  if(candidate.y>=best.y-1)break;
  if(/\b(?:series|class)\s+[A-Z][A-Z0-9-]*\b|\b(?:ETF|CAD|USD)\s+(?:series|units)\b/i.test(candidate.text)&&!classLine(candidate,row))return null;
 }
 return best;
}
function pageContext(page,lines){
 const header=(page.text||lines.map(x=>x.text).join('\n')).slice(0,22000);
 return RATIO_SECTION.test(header);
}
// FMC-aware dated ratio-table adapters. Each adapter must validate the actual
// PDF header structure before choosing a cell. A matching number alone is not
// evidence, especially where MER and MER Before Absorption are identical.
// Reusable geometric utilities are shared by all adapters.
function tokenCenter(item){return item.x+(Number(item.w)||0)/2;}
function ratioHeader(lines,rowY,fmc){
 // Each PDF page/table must supply the header. Never inherit coordinates
 // across pages or use a known value to infer a missing heading.
 const sections=lines.filter(l=>l.y>rowY&&l.y-rowY<590&&/ratios?\s+(?:and|&)\s+supplemental\s+data/i.test(l.text))
  .sort((a,b)=>a.y-b.y);
 for(const section of sections){
  const top=lines.filter(l=>l.y<section.y&&section.y-l.y<70&&l.y>rowY+6);
  if(!top.length)continue;
  if(fmc==='rbc'){
   const heads=top.filter(l=>l.items.some(i=>/^Management$/i.test(i.str.trim()))&&l.items.some(i=>/^MER Before$/i.test(i.str.trim()))&&l.items.some(i=>/^Portfolio$/i.test(i.str.trim()))&&l.items.some(i=>/^Trading$/i.test(i.str.trim())));
   if(heads.length!==1)continue;
   const h=heads[0],a=h.items.find(i=>/^Management$/i.test(i.str.trim())),b=h.items.find(i=>/^MER Before$/i.test(i.str.trim())),c=h.items.find(i=>/^Portfolio$/i.test(i.str.trim())),d=h.items.find(i=>/^Trading$/i.test(i.str.trim()));
   if(!(a.x<b.x&&b.x<c.x&&c.x<d.x))continue;
   const lower=top.filter(l=>l.y<h.y&&h.y-l.y<18).flatMap(l=>l.items);
   const close=(rx,head)=>lower.some(i=>rx.test(i.str.trim())&&Math.abs(i.x-head.x)<33);
   if(!(close(/^Expense Ratio\s*\(%\)/i,a)&&close(/^Absorption\s*\(%\)/i,b)&&close(/^Turnover Rate/i,c)&&close(/^Expense Ratio\s*\(%\)/i,d)))continue;
   return {MER:tokenCenter(a),before:tokenCenter(b),PTR:tokenCenter(c),TER:tokenCenter(d),section:section.y};
  }
  if(fmc==='ci'){
   const mgmt=top.flatMap(l=>l.items.filter(i=>/^Management$/i.test(i.str.trim())));
   const before=top.flatMap(l=>l.items.filter(i=>/^ratio before$/i.test(i.str.trim())));
   const after=top.flatMap(l=>l.items.filter(i=>/^ratio after$/i.test(i.str.trim())));
   const trade=top.flatMap(l=>l.items.filter(i=>/^Trading$/i.test(i.str.trim())));
   const turnover=top.flatMap(l=>l.items.filter(i=>/^Portfolio$/i.test(i.str.trim())));
   if(mgmt.length!==2||before.length!==1||after.length!==1||trade.length!==1||turnover.length!==1)continue;
   const sorted=mgmt.sort((x,y)=>x.x-y.x);
   if(!(sorted[0].x<before[0].x+13&&sorted[1].x<after[0].x+13&&
     sorted[1].x<trade[0].x&&trade[0].x<turnover[0].x&&
     Math.abs(sorted[0].x-before[0].x)<24&&Math.abs(sorted[1].x-after[0].x)<24))continue;
   const lower=top.flatMap(l=>l.items);
   const near=(rx,head)=>lower.some(i=>rx.test(i.str.trim())&&Math.abs(i.x-head.x)<25);
   if(!(near(/^expense$/i,sorted[0])&&near(/^expense$/i,sorted[1])&&near(/^expense$/i,trade[0])&&near(/^turnover$/i,turnover[0])))continue;
   // CI reports 'MER before taxes' alongside 'MER after taxes'. The financial
   // extractor's management expense ratio is the after-tax figure.
   return {MER:tokenCenter(sorted[1]),before:tokenCenter(sorted[0]),TER:tokenCenter(trade[0]),PTR:tokenCenter(turnover[0]),section:section.y};
  }
 }
 return null;
}
function datedFmcCell(lines,row,key,value,fmc){
 const iso=/^(\d{4})-(\d\d)-(\d\d)$/.exec(row.report_date||'');
 if(!iso)return null;
 const month={1:'Jan',2:'Feb',3:'Mar',4:'Apr',5:'May',6:'Jun',7:'Jul',8:'Aug',9:'Sep',10:'Oct',11:'Nov',12:'Dec'}[Number(iso[2])];
 const dateRx=new RegExp('^'+month+'[a-z]*\\.?\\s+'+Number(iso[3])+'[,\\s]+'+Number(iso[1])+'\\b','i');
 const results=[];
 for(const line of lines){
  if(!dateRx.test(line.text)||!nearestClassAbove(lines,line,row))continue;
  const header=ratioHeader(lines,line.y,fmc);if(!header)continue;
  const target=header[key];
  const markers=cells(line).filter(c=>c.x>Math.max(120,line.minX+100));
  if(!markers.length)continue;
  // Find a cell using the ACTUAL labelled-column center, not a fixed numeric
  // array index. Use neighboring columns as mutually exclusive boundaries.
  const anchors=Object.entries(header).filter(([k,v])=>k!=='section'&&Number.isFinite(v)).sort((a,b)=>a[1]-b[1]);
  const idx=anchors.findIndex(([k])=>k===key);if(idx<0)continue;
  const left=idx>0?(anchors[idx-1][1]+target)/2:-Infinity;
  const right=idx+1<anchors.length?(target+anchors[idx+1][1])/2:Infinity;
  const candidates=markers.filter(n=>n.x>left&&n.x<right&&Math.abs(n.x-target)<29&&matchesCell(n,value));
  if(candidates.length===1)results.push(candidates[0]);
 }
 const unique=new Map(results.map(n=>[`${n.box.x.toFixed(1)}:${n.box.y.toFixed(1)}`,n]));
 return unique.size===1?[...unique.values()][0]:null;
}
// Fidelity's native-text MRFPs use repeating per-series Financial Highlights
// blocks: fund + exact Series heading -> dated columns -> Ratios and
// Supplemental Data -> labelled MER / TER / PTR rows. Columns are identified
// from the CURRENT document, not from hardcoded x positions or fund names.
// No fallback to a matching number in a different class or reporting period.
function fidelityCell(lines,row,key,value){
 const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(row.report_date||''));
 if(!iso)return null;
 const year=Number(iso[1]),month=Number(iso[2]),day=Number(iso[3]);
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 if(month<1||month>12||day<1||day>31)return null;
 const series=clean(row.class_name);
 const fund=clean(row.fund_name).replace(/[^\p{L}\p{N} ]/gu,'').replace(/\s+/g,' ').trim();
 if(!fund||!series)return null;
 // Exact suffix match avoids Series F being confused with F5, F8 or FT5.
 const validTitle=(l)=>{
  const s=clean(l.text).replace(/[®™]/g,'').replace(/\s+/g,' ');
  if(!s.endsWith(' '+series))return false;
  const prefix=s.slice(0,-series.length).trim();
  // Some headings append the legal share-class corporation description.
  const normalized=prefix.replace(/[^\p{L}\p{N} ]/gu,'').replace(/\s+/g,' ').trim();
  return normalized.startsWith(fund);
 };
 const titles=lines.filter(validTitle).sort((a,b)=>b.y-a.y);
 if(titles.length!==1)return null;
 const title=titles[0];
 const nextTitle=lines.filter(l=>l.y<title.y&&l.y>title.y-580&&/\b(?:series\s+[A-Z][A-Z0-9-]*|ETF Series)\s*$/i.test(l.text)&&/fidelity/i.test(l.text))
  .sort((a,b)=>b.y-a.y)[0];
 const lowerBound=nextTitle?nextTitle.y:title.y-580;
 const inside=lines.filter(l=>l.y<title.y&&l.y>lowerBound);
 const section=inside.filter(l=>/^Ratios\s+(?:and|&)\s+Supplemental\s+Data\b/i.test(l.text));
 if(section.length!==1)return null;
 const ratioY=section[0].y;
 const headArea=inside.filter(l=>l.y>ratioY&&l.y<title.y);
 const allYearLines=headArea.filter(l=>l.items.some(i=>/^20\d{2}$/.test(i.str.trim()))).sort((a,b)=>a.y-b.y);
 if(allYearLines.length!==1)return null;
 const years=allYearLines[0].items.filter(i=>/^20\d{2}$/.test(i.str.trim())).sort((a,b)=>a.x-b.x);
 if(!years.length||years.some((it,i)=>i>0&&it.x<=years[i-1].x))return null;
 // Require actual printed reporting-month and day, not just year equality.
 const dateLines=headArea.filter(l=>new RegExp('\\b'+months[month-1]+'\\s+'+day+'\\s*,?', 'i').test(l.text));
 if(dateLines.length===0)return null;
 const matchingYears=years.filter(i=>Number(i.str.trim())===year);
 if(!matchingYears.length)return null;
 let yearItem=null;
 if(matchingYears.length===1){
  // In normal tables the year headings share one date heading. In mixed
  // annual/semiannual tables, the month/day heading must also cover the cell.
  yearItem=matchingYears[0];
 }else{
  // A year can appear twice (e.g. Dec 31, 2025 and Jun 30, 2025).
  // Compare the actual date-heading x location to each year heading, and
  // decline ambiguous/tied matches instead of guessing the left column.
  const candidates=dateLines.flatMap(l=>l.items.filter(i=>new RegExp('\\b'+months[month-1]+'\\s+'+day+'\\s*,?', 'i').test(i.str)));
  if(!candidates.length)return null;
  const distances=matchingYears.map(yr=>({yr,d:Math.min(...candidates.map(h=>Math.abs(h.x-yr.x)))})).sort((a,b)=>a.d-b.d);
  if(distances.length>1&&distances[1].d-distances[0].d<9)return null;
  yearItem=distances[0].yr;
 }
 // The labelled metric row must belong to the current class/table block.
 const ratioRows=inside.filter(l=>l.y<ratioY&&ratioY-l.y<115);
 const exactLabel={MER:/^Management\s+expense\s+ratio\s*$/i,TER:/^Trading\s+expense\s+ratio\s*$/i,PTR:/^Portfolio\s+turnover\s+rates?\s*$/i}[key];
 const metricRows=ratioRows.filter(l=>l.items.some(it=>it.x<225&&exactLabel.test(it.str.trim())));
 if(metricRows.length!==1)return null;
 const metricLine=metricRows[0];
 // Parse literal PDF glyphs including leading-dot decimals (.35%) and
 // printed missing markers (–%, -%, —, --). Never turn null into zero.
 const metricCells=metricLine.items.filter(it=>it.x>250).flatMap(it=>{
  const raw=String(it.str).trim().replace(/\s+/g,'');
  if(!raw)return [];
  const dash=/^[-–—−]{1,2}%?$/.test(raw);
  const number=/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(raw);
  if(!dash&&!number)return [];
  const parsed=dash?null:Number(raw.replace('%',''));
  if(!dash&&!Number.isFinite(parsed))return [];
  const w=Number(it.w),h=Number(it.h);
  if(!Number.isFinite(w)||w<=0||!Number.isFinite(h)||h<=0)return [];
  return [{value:parsed,isMissing:dash,raw,x:it.x,box:{x:Math.max(0,it.x-1),y:metricLine.y-1,w:w+2,h:h+2}}];
 }).sort((a,b)=>a.x-b.x);
 // The ratio row and the printed years must have exactly the same number of
 // year-columns; align ordinally, not by repeated numeric values. This also
 // handles same-valued TER/PTR across all series/years.
 if(metricCells.length!==years.length)return null;
 const idx=years.indexOf(yearItem);
 const selected=metricCells[idx];
 if(!selected||!matchesCell(selected,value))return null;
 // Guard against accidental column shifts if the PDF has unusual spacing.
 const yx=yearItem.x;
 if(selected.x<yx-13||Math.abs(selected.x-yx)>60)return null;
 for(let i=1;i<metricCells.length;i++){
  if(metricCells[i].x<=metricCells[i-1].x||metricCells[i].x<years[i-1].x) return null;
 }
 return selected;
}


// DYNAMIC: actual dated series rows, with required PDF column headings.
// These rules depend on table structure, NOT fund name, date, page or x-coordinate.
function dynamicCell(page,lines,row,key,value){
 const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(row.report_date||'');
 if(!iso)return null;
 const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const mon=months[Number(iso[2])-1];if(!mon)return null;
 const dateRx=new RegExp('^'+mon+'(?:e)?\\.?\\s+'+Number(iso[3])+'[,\\s]+'+iso[1]+'\\b','i');
 const expected=clean(row.class_name).replace(/\s+/g,' ');
 const hasFund=clean(page.text||'').includes(clean(row.fund_name));
 if(!hasFund)return null; // protects against highlights on a different fund
 const output=[];
 // Header is the source of truth, not the positions of identical numbers.
 const headers=lines.filter(l=>l.items.some(i=>/^As at$/i.test(i.str.trim()))
   &&l.items.some(i=>/MER[”")]*\s*\(%\)/i.test(i.str.trim()))
   &&l.items.some(i=>/TER[”")]*\s*\(%\)/i.test(i.str.trim())));
 for(const head of headers){
  // Continuation pages may repeat the lower two header lines but not the
  // 'Management / MER before / Trading' top line. Both are sufficient when
  // explicit MER, absorptions, TER, PTR, NAV and date labels are present.
  const label=i=>head.items.find(t=>i.test(t.str.trim()));
  const merLabel=label(/MER[”")]*\s*\(%\)/i),beforeLabel=label(/^absorptions\s*\(%\)$/i),
        terLabel=label(/TER[”")]*\s*\(%\)/i);
  const upper=lines.filter(l=>l.y>head.y&&l.y-head.y<20);
  const upperItems=upper.flatMap(l=>l.items);
  const pt=upperItems.find(i=>/^Portfolio turnover$/i.test(i.str.trim()));
  const nav=upperItems.find(i=>/^Net asset value$/i.test(i.str.trim()));
  const hasWaivers=upperItems.some(i=>/^waivers or$/i.test(i.str.trim()));
  const hasRatios=upperItems.filter(i=>/^expense ratio$/i.test(i.str.trim())).length>=2;
  if(!merLabel||!beforeLabel||!terLabel||!pt||!nav||!hasWaivers||!hasRatios
   ||!(merLabel.x<beforeLabel.x&&beforeLabel.x<terLabel.x&&terLabel.x<pt.x&&pt.x<nav.x))continue;
  const bounds={MER:[merLabel.x,beforeLabel.x],TER:[terLabel.x,pt.x],PTR:[pt.x,nav.x]};
  for(const l of lines){
   if(l.y>=head.y||head.y-l.y>520||!dateRx.test(l.text))continue;
   const titles=lines.filter(t=>t.y>l.y&&t.y<head.y&&/^(?:Series\s+[A-Z][A-Z0-9]*(?:\s*\(USD\))?|ETF Series)$/i.test(t.text.trim()))
     .sort((x,y)=>x.y-y.y);
   if(/^ETF\s+Units$/i.test(row.class_name||'')){
    // One dated ETF table with no per-series headings; never assign an ETF
    // highlight to the table of a mutual-fund series.
    if(titles.length)continue;
   }else{
    if(!titles.length||clean(titles[0].text)!==expected)continue;
   }
   const [left,right]=bounds[key];
   const candidates=cells(l).filter(n=>n.x>left&&n.x<right&&matchesCell(n,value));
   if(candidates.length===1)output.push(candidates[0]);
  }
 }
 const unique=new Map(output.map(n=>[n.box.x.toFixed(1)+':'+n.box.y.toFixed(1),n]));
 return unique.size===1?[...unique.values()][0]:null;
}
// NBI: repeating per-series tables with Accounting Period Ended year and
// month/day columns. Match the exact printed ratio label and date column.
// Do not use 'before waivers' as MER; do not inherit periods between blocks.
function nbiCell(page,lines,row,key,value){
 const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(row.report_date||'');if(!iso)return null;
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 const month=months[Number(iso[2])-1];if(!month)return null;
 if(!clean(page.text||'').includes(clean(row.fund_name)))return null;
 const canonical=s=>clean(s).replace(/[†*®™]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
 const expected=canonical(row.class_name);
 const seriesHeading=t=>/^(?:(?:investor(?:-\d+)?\s*\/\s*advisor(?:-\d+)?\s+series)|(?:(?:investor|advisor)(?:-\d+)?\s+series)|(?:private\s+series)|(?:series\s+[a-z][a-z0-9-]*)|(?:etfh?\s+series))$/i.test(t.trim().replace(/[†*]/g,''));
 const headings=lines.filter(l=>seriesHeading(l.text));
 const label={MER:/^Management\s+expense\s+ratio\s*\(%\)$/i,TER:/^Trading\s+expense\s+ratio\s*\(%\)$/i,PTR:/^Portfolio\s+turnover\s+rate\s*\(%\)$/i}[key];
 const output=[];
 for(const section of lines.filter(l=>/^Ratios\s+(?:and|&)\s+Supplemental\s+Data\s*$/i.test(l.text))){
  const prev=headings.filter(l=>l.y>section.y&&l.y-section.y<520).sort((a,b)=>a.y-b.y)[0];
  if(!prev||canonical(prev.text)!==expected)continue;
  const end=Math.max(section.y-130,0);
  const block=lines.filter(l=>l.y<section.y&&l.y>end);
  const periods=block.filter(l=>/\bAccounting\s+Period\s+Ended\b/i.test(l.text));
  if(periods.length!==1)continue;
  const period=periods[0];
  const years=period.items.filter(i=>/^20\d{2}$/.test(i.str.trim())).sort((a,b)=>a.x-b.x);
  if(!years.length)continue;
  const dates=block.filter(l=>l.y<period.y&&period.y-l.y<14).flatMap(l=>l.items)
   .filter(i=>/^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}$/i.test(i.str.trim())).sort((a,b)=>a.x-b.x);
  if(dates.length!==years.length)continue;
  const yearIndexes=years.map((i,n)=>Number(i.str.trim())===Number(iso[1])&&new RegExp('^'+month+'\\s+'+Number(iso[3])+'$','i').test(dates[n].str.trim())&&Math.abs(i.x-dates[n].x)<28?n:-1).filter(n=>n>=0);
  if(yearIndexes.length!==1)continue;
  const matching=block.filter(l=>l.items.some(i=>i.x<265&&label.test(i.str.trim())));
  if(matching.length!==1)continue;
  const line=matching[0];
  const rowCells=line.items.filter(i=>i.x>265).flatMap(i=>{
    const raw=i.str.trim();const dash=/^[-–—−]{1,2}%?$/.test(raw);
    if(!dash&&!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(raw))return [];
    const n=dash?null:Number(raw.replace('%',''));
    if(!dash&&!Number.isFinite(n))return [];
    if(!(Number(i.w)>0&&Number(i.h)>0))return [];
    return [{value:n,raw,isMissing:dash,x:i.x,box:{x:Math.max(0,i.x-1),y:line.y-1,w:i.w+2,h:i.h+2}}];
  }).sort((a,b)=>a.x-b.x);
  if(rowCells.length!==years.length)continue;
  const index=yearIndexes[0],selected=rowCells[index];
  if(!selected||!matchesCell(selected,value)||Math.abs(selected.x-years[index].x)>32)continue;
  output.push(selected);
 }
 const unique=new Map(output.map(n=>[n.box.x.toFixed(1)+':'+n.box.y.toFixed(1),n]));
 return unique.size===1?[...unique.values()][0]:null;
}


// TD Asset Management: Year headings are aligned with one or two class
// headings per ratio block. Locate the ORIGINAL metric row and the report-
// period year inside the selected class band. Never use the before-waivers row.
// All x positions and column counts are read from the active PDF page.
const compactName=s=>clean(s).replace(/[^a-z0-9]+/g,'');
function fundOnPage(page,row){
 const name=compactName(row.fund_name),header=compactName((page.text||'').slice(0,650));
 return name.length>12&&header.includes(name);
}
function labelledMetricLine(line,key,style){
 const labels=style==='td'?{
  MER:/^Management Expense Ratio\s*\(%\)/i,
  TER:/^Trading Expense Ratio\s*\(%\)/i,
  PTR:/^Portfolio Turnover Rate\s*\(%\)/i
 }:{MER:/^Management expense ratio\b/i,TER:/^Trading expense ratio\b/i,PTR:/^Portfolio turnover rate\b/i};
 // Must be an explicit row label in the LEFT label column, not explanatory
 // footnotes or a generic mention of MER/TER/PTR elsewhere on the page.
 return labels[key].test(line.items.filter(t=>t.x<195).map(t=>t.str.trim()).join(' ').replace(/\s+/g,' ').trim());
}
function yearTokens(line){
 return line.items.filter(i=>/^20\d{2}$/.test(i.str.trim())).sort((a,b)=>a.x-b.x);
}
function tdCell(page,lines,row,key,value){
 if(!fundOnPage(page,row))return null;
 const iso=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(row.report_date||'');if(!iso)return null;
 const targetYear=Number(iso[1]),expected=compactName(row.class_name);
 if(!expected)return null;
 // TD MRFPs may continue Ratios and Supplemental Data onto a following page.
 const sections=lines.filter(l=>/^Ratios\s+(?:and|&)\s+Supplemental\s+Data\b/i.test(l.text));
 const found=[];
 for(const section of sections){
  // Dated report period must occur on this PDF page; do not mistake a 2025
  // year column for a 2025 report when the actual latest report is June 2026.
  const period=(iso[2]==='06'?'June':iso[2]==='12'?'December':null);
  if(!period||!new RegExp('\\b'+period+'\\s+'+Number(iso[3])+'\\s*,?\\s*'+targetYear+'\\b','i').test(page.text||''))continue;
  const below=lines.filter(l=>l.y<section.y&&section.y-l.y<550);
  for(const yearsLine of below){
   const years=yearTokens(yearsLine);
   if(years.length<2||years.length>14||years.some((i,k)=>k&&i.x<=years[k-1].x))continue;
   const header=below.filter(l=>l.y>yearsLine.y&&l.y-yearsLine.y<25).sort((a,b)=>a.y-b.y)[0];
   // ETF-only tables have no class heading between section and year labels.
   // Class-bearing tables must still match an explicit printed heading.
   if(!header&& !/^ETF\s+Units$/i.test(row.class_name||''))continue;
   // Each year's sequence MUST be decreasing, restarting only when a new
   // horizontally adjacent class starts (e.g. 2025...2021, 2025...2021).
   const groups=[];let current=[];
   for(const yr of years){
    if(current.length&&Number(yr.str)>=Number(current[current.length-1].str)){groups.push(current);current=[];}
    current.push(yr);
   }
   if(current.length)groups.push(current);
   if(groups.some(g=>g.some((t,i)=>i&&Number(t.str)>=Number(g[i-1].str))))continue;
   const titles=(header?.items||[]).filter(i=>i.str.trim()&&i.x>=150&&i.x<Math.max(...years.map(t=>t.x))+12)
     .sort((a,b)=>a.x-b.x);
   let group=null;
   if(header&&titles.length===groups.length){
    const matches=titles.map((h,i)=>compactName(h.str)===expected?i:-1).filter(i=>i>=0);
    if(matches.length!==1)continue;
    group=groups[matches[0]];
    if(Math.abs(titles[matches[0]].x-group[0].x)>95)continue;
   }else if(groups.length===1&&/^ETF\s+Units$/i.test(row.class_name||'')&&
    (!header||!header.items.some(i=>/\b(?:SERIES|UNITS)\b/i.test(i.str)))){
    group=groups[0];
   }else continue;
   const columns=group.filter(i=>Number(i.str)===targetYear);
   if(columns.length!==1)continue;
   const year=columns[0];
   const ratioRows=below.filter(l=>l.y<yearsLine.y&&yearsLine.y-l.y<90&&labelledMetricLine(l,key,'td'));
   if(ratioRows.length!==1)continue;
   const metricLine=ratioRows[0];
   const n=cells(metricLine).filter(c=>c.x>=group[0].x-17&&c.x<group[group.length-1].x+40);
   // A series may start later than the oldest year: older TD columns print
   // literal N/A instead of a number. Validate every printed column against
   // the year header; never shift the remaining values left by ordinal.
   const byYear=new Map();let aligned=true;
   for(const y of group){
    const candidates=n.filter(c=>Math.abs(c.x-y.x)<18);
    const na=metricLine.items.filter(i=>i.x>group[0].x-17&&Math.abs(i.x-y.x)<18&&/^(?:N\/A|N\.A\.)$/i.test(i.str.trim()));
    if(candidates.length===1&&na.length===0)byYear.set(y,candidates[0]);
    else if(candidates.length===0&&na.length===1)continue;
    else{aligned=false;break;}
   }
   if(!aligned)continue;
   const chosen=byYear.get(year);
   if(!chosen||!matchesCell(chosen,value))continue;
   found.push(chosen);
  }
 }
 const uniq=new Map(found.map(c=>[c.box.x.toFixed(2)+':'+c.box.y.toFixed(2),c]));
 return uniq.size===1?[...uniq.values()][0]:null;
}
// BlackRock / iShares: verify full report period, exact fund header, optional
// CAD/USD unit heading, current year, and the original labelled financial-
// highlights metric row. The dotted-leader text is NOT a numeric source cell.
function blackrockCell(page,lines,row,key,value){
 const iso=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(row.report_date||'');if(!iso)return null;
 const reportMonth=({ '06':'June','12':'December'})[iso[2]];
 if(!reportMonth)return null;
 // Some PDFs duplicate text glyphs, but the fund name tokens still appear.
 const firstLines=lines.slice(0,3).map(l=>l.text).join(' '),fundWords=clean(row.fund_name).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>1);
 if(!fundWords.length||fundWords.filter(w=>new RegExp('(?:^|\\W)'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|\\W)','i').test(firstLines)).length<Math.ceil(fundWords.length*.85))return null;
 const periodText=lines.slice(0,6).map(l=>l.text).join(' ');
 if(!new RegExp('\\b'+reportMonth+'\\s+'+Number(iso[3])+'\\s*,?\\s*'+iso[1]+'\\b','i').test(periodText))return null;
 const section=lines.filter(l=>/^Ratios\s+(?:and|&)\s+Supplemental\s+Data\b/i.test(l.text));
 const found=[];
 for(const sec of section){
  const yearLines=lines.filter(l=>l.y>sec.y&&l.y-sec.y<260&&yearTokens(l).length>=2).sort((a,b)=>a.y-b.y);
  if(!yearLines.length)continue;
  const yearLine=yearLines[0],years=yearTokens(yearLine);
  if(years.some((yr,i)=>i&&Number(yr.str)>=Number(years[i-1].str)))continue;
  const targetIndex=years.findIndex(i=>Number(i.str)===Number(iso[1]));
  if(targetIndex<0)continue;
  // Require the date headings from THIS table, not only the page report date.
  const aboveYear=lines.filter(l=>l.y>yearLine.y&&l.y-yearLine.y<40);
  if(!aboveYear.some(l=>new RegExp('\\b'+reportMonth+'\\s+'+Number(iso[3])+'\\b','i').test(l.text)))continue;
  const units=yearLine.items.filter(i=>i.x<250).map(i=>i.str.trim()).join(' ').match(/\b(CAD|USD)\s+Units\b/i);
  if(/^\s*(?:CAD|USD)\s+Units\s*$/i.test(row.class_name||'')){
   if(!units||compactName(units[0])!==compactName(row.class_name))continue;
  }else if(units)continue; // A single ETF row must not steal CAD/USD evidence.
  else if(compactName(row.class_name)!==compactName(row.fund_name)&&!/^ETF\s+Units$/i.test(row.class_name||''))continue;
  const ratioRows=lines.filter(l=>l.y<sec.y&&sec.y-l.y<90&&labelledMetricLine(l,key,'blackrock'));
  if(ratioRows.length!==1)continue;
  const metric=ratioRows[0];
  const candidates=cells(metric).filter(n=>n.x>years[0].x-35);
  if(candidates.length!==years.length)continue;
  const chosen=candidates[targetIndex];
  if(!chosen||Math.abs(chosen.x-years[targetIndex].x)>25||!matchesCell(chosen,value))continue;
  found.push(chosen);
 }
 const uniq=new Map(found.map(c=>[c.box.x.toFixed(2)+':'+c.box.y.toFixed(2),c]));
 return uniq.size===1?[...uniq.values()][0]:null;
}


// Mackenzie / IG Mackenzie financial-highlight evidence: each page may have
// two independent, side-by-side series tables. Read the *printed* class,
// year/date headings and the labelled ratio row within that same column band.
// No fixed year, page, fund, series or ratio-coordinate mapping.
function mackenzieCell(page,row,key,value){
 if(!fundOnPage(page,row))return null;
 const match=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(row.report_date||'');
 if(!match||!/RATIOS\s+AND\s+SUPPLEMENTAL\s+DATA/i.test(page.text||''))return null;
 const targetYear=Number(match[1]),targetMonth=Number(match[2]),targetDay=Number(match[3]);
 const monthNames=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const expected=clean(row.class_name).replace(/\s+/g,' ');
 const width=Number(page.width)||612,split=width/2;
 const source=[];
 const labelRe={
  MER:/^Management expense ratio\s*\(%\)/i,
  TER:/^Trading expense ratio\s*\(%\)/i,
  PTR:/^Portfolio turnover rate\s*\(%\)/i
 }[key];
 for(const [minX,maxX] of [[0,split-3],[split-3,width+3]]){
  const column=textLines(page.items.filter(i=>i.x>=minX&&i.x<maxX));
  const headings=column.filter(line=>line.items.some(i=>/^20\d{2}$/.test(i.str.trim()))
    &&line.items.some(i=>{
      const title=clean(i.str).replace(/[\u00ae\u2122]/g,'').replace(/\s+/g,' ');
      return title===expected || (/^cad units$|^usd units$|^etf units$/i.test(expected)&&title.startsWith(expected+' (ticker:'));
    }));
  for(const title of headings){
   let years=title.items.filter(i=>/^20\d{2}$/.test(i.str.trim())).sort((a,b)=>a.x-b.x);
   if(years.length<2||years.length>8)continue;
   // Date labels can be printed in their own line directly above the year
   // headings. Require a real date, especially when the year is repeated
   // (September and March 2025 in interim reports).
   const dates=column.filter(l=>l.y>=title.y&&l.y-title.y<45).flatMap(l=>l.items)
     .filter(it=>/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{1,2}\b/i.test(it.str));
   let dateTokens=dates.sort((a,b)=>a.x-b.x);
   // IG continuation-table variation: the *header* can omit the first
   // reporting year while the first numeric ratio column is still printed.
   // Infer its location only from an adjacent same-band series with an
   // explicit target-year heading at the same X column. A year alone in
   // the page footer or an older-year value never qualifies.
   if(row.fmc_key==='ig_mackenzie'&&years.length>=2&&years.length===dateTokens.length
      &&Number(years[0].str.trim())===targetYear-1
      &&years.every((it,j)=>Number(it.str.trim())===targetYear-1-j)){
    const gaps=years.slice(1).map((it,j)=>it.x-years[j].x);
    const step=gaps.reduce((a,b)=>a+b,0)/gaps.length;
    const virtualX=years[0].x-step;
    const preceding=column.some(other=>other.y>title.y&&other.y-title.y<200
      &&other.items.some(it=>/^Series\s+[A-Z]/i.test(it.str.trim()))
      &&other.items.some(it=>it.str.trim()===String(targetYear)&&Math.abs(it.x-virtualX)<5)
      &&other.items.some(it=>it.str.trim()===String(targetYear-1)&&Math.abs(it.x-years[0].x)<5));
    const validDates=dateTokens.every(it=>{
      const d=/\b([A-Za-z]+)\.?\s*(\d{1,2})\b/.exec(it.str);
      return !!d&&d[1].toLowerCase().startsWith(monthNames[targetMonth-1])&&Number(d[2])===targetDay;
    });
    if(step>=15&&step<=45&&virtualX>minX+110&&preceding&&validDates){
      years=[{str:String(targetYear),x:virtualX},...years];
      dateTokens=[{str:dateTokens[0].str,x:virtualX},...dateTokens];
    }
   }
   const yearsWanted=years.map((it,i)=>Number(it.str.trim())===targetYear?i:-1).filter(i=>i>=0);
   if(!yearsWanted.length)continue;
   const dateValid=(yearIndex)=>{
    if(dateTokens.length!==years.length)return false;
    const yr=years[yearIndex],d=dateTokens[yearIndex];
    if(Math.abs(d.x-yr.x)>27)return false;
    const date=/\b([A-Za-z]+)\.?\s*(\d{1,2})\b/.exec(d.str);
    return !!date&&date[1].toLowerCase().startsWith(monthNames[targetMonth-1])&&Number(date[2])===targetDay;
   };
   const indices=yearsWanted.filter(dateValid);
   if(indices.length!==1)continue;
   const index=indices[0];
   const next=column.filter(l=>l.y<title.y&&l.y>title.y-230&&l.items.some(i=>/^(?:Series\s+[A-Z][A-Z0-9-]*(?:\s+[A-Z0-9-]+)*|(?:CAD|USD|ETF)\s+Units(?:\s*\(Ticker:.*?)?)$/i.test(i.str.trim())&&l.items.some(y=>/^20\d{2}$/.test(y.str.trim())))).sort((a,b)=>b.y-a.y)[0];
   const lower=next?next.y:title.y-175;
   const metrics=column.filter(l=>l.y<title.y-5&&l.y>lower+2&&l.items.some(i=>i.x<minX+155&&labelRe.test(i.str.trim())));
   if(metrics.length!==1)continue;
   const line=metrics[0];
   const rawValues=line.items.filter(it=>it.x>years[0].x-17).flatMap(it=>{
    const raw=it.str.trim(), missing=/^(?:n\s*\/\s*a|[-–—−]{1,2})$/i.test(raw);
    const numeric=/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(raw);
    if(!missing&&!numeric)return [];
    const number=missing?null:Number(raw.replace('%',''));
    if(!missing&&!Number.isFinite(number))return [];
    const w=Number(it.w),h=Number(it.h);if(!(w>0&&h>0))return [];
    return [{value:number,isMissing:missing,x:it.x,raw,box:{x:Math.max(0,it.x-1),y:line.y-1,w:w+2,h:h+2}}];
   }).sort((a,b)=>a.x-b.x);
   if(rawValues.length!==years.length)continue;
   const chosen=rawValues[index];
   if(chosen&&matchesCell(chosen,value)&&Math.abs(chosen.x-years[index].x)<24)source.push(chosen);
  }
 }
 const unique=new Map(source.map(c=>[c.box.x.toFixed(1)+':'+c.box.y.toFixed(1),c]));
 return unique.size===1?[...unique.values()][0]:null;
}

// BMO and AGF: locate values within an actual Class/Series + reporting-year
// ratio table band. Both issuers print two independent side-by-side tables,
// so page-wide year/value matching is unsafe. This routine discovers the
// current layout from the PDF, not from fixed pages, fund names or ratios.
function issuerPeriodBandCell(page,row,key,value,issuer){
 if(!fundOnPage(page,row))return null;
 const iso=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(row.report_date||'');
 if(!iso)return null;
 const targetYear=Number(iso[1]), width=page.width||612,mid=width/2;
 const target=clean(row.class_name).replace(/\s*[-–—]\s*/g,'-');
 if(!target)return null;
 const possible=[];
 for(const [lo,hi] of [[0,mid-3],[mid-3,width+5]]){
  const lines=textLines(page.items.filter(it=>it.x>=lo&&it.x<hi));
  // Headers are read from THIS page and from one physical table column.
  const titles=[];
  for(const l of lines){
   const normalized=clean(l.text).replace(/\s*[-–—]\s*/g,'-');
   if(issuer==='agf'){
    if(normalized===target+'-ratios/supplemental data')titles.push(l);
   }else{
    // BMO has plain Series headings, sometimes followed on the same line
    // by a current-date heading (e.g. "Listed CAD Units Jun. 30, 2026").
    if(normalized===target||normalized.startsWith(target+' ')
       &&/^(?:20\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?\s|period\b)/i.test(normalized.slice(target.length).trim()))titles.push(l);
   }
  }
  for(const title of titles){
   const dateLines=lines.filter(l=>l.y<=title.y+1&&title.y-l.y<67);
   // Prefer the nearest row with at least two distinct date columns.
   const yearLists=dateLines.map(l=>({line:l,years:l.items.filter(it=>/(?:19|20)\d{2}/.test(it.str))
    .map(it=>({it,year:Number((it.str.match(/(?:19|20)\d{2}/)||[])[0])}))
    .filter(it=>it.year>=1990&&it.year<=2100)}))
    .filter(x=>x.years.some(it=>it.year===targetYear)&&
     // New-launch series can legitimately have only the current-year column.
     (new Set(x.years.map(it=>it.year)).size>=2||x.years.length===1))
    .sort((a,b)=>b.line.y-a.line.y);
   // Date/year labels must belong to this series, not another table lower down.
   const heading=yearLists[0];if(!heading)continue;
   const targetHeader=heading.years.find(it=>it.year===targetYear);
   const headX=tokenCenter(targetHeader.it);
   const nextHeads=lines.filter(l=>l.y<title.y-5&&l.y>=title.y-280&&
     (issuer==='agf'?/\b-ratios\s*\/\s*supplemental\s+data\b/i.test(l.text)
        :/^(?:(?:advisor|classic|active\s+etf|listed\s+cad|listed\s+accumulating|series\s+\S+)(?:\s+series)?\s+(?:shares|units)\b)/i.test(l.text)))
     .sort((a,b)=>b.y-a.y);
   const bottom=nextHeads.length?nextHeads[0].y:title.y-280;
   // Each candidate metric row is *physically* between the matching title
   // and next series. Reject "MER before waivers/absorptions" completely.
   const labelRx={MER:/^management\s+expense\s+ratio\b/i,TER:/^trading\s+expense\s+ratio\b/i,PTR:/^portfolio\s+turnover\s+rate\b/i}[key];
   const metricLines=lines.filter(l=>l.y<heading.line.y-3&&l.y>bottom+2&&labelRx.test(l.text)
      &&(key!=='MER'||!/\bbefore\b|\bwaivers\b|\babsorptions\b/i.test(l.text)));
   for(const metricLine of metricLines){
    const firstLabel=metricLine.items.find(it=>/management|trading|portfolio/i.test(it.str));
    if(!firstLabel)continue;
    const sourceCells=cells(metricLine).concat(metricLine.items.filter(it=>/^n\s*\/?\s*a$/i.test(it.str.trim()))
     .map(it=>({value:null,isMissing:true,raw:it.str,x:it.x,box:{x:it.x-1,y:it.y-1,w:it.w+2,h:it.h+2}})));
    const matches=sourceCells.filter(cell=>cell.x>firstLabel.x+65&&matchesCell(cell,value)
      &&Math.abs(cell.x+cell.box.w/2-headX)<17);
    for(const hit of matches)possible.push(hit);
   }
  }
 }
 const unique=new Map(possible.map(m=>[m.box.x.toFixed(2)+':'+m.box.y.toFixed(2),m]));
 return unique.size===1?[...unique.values()][0]:null;
}

// Desjardins: each Class has its own Ratios and Supplemental Data block.
// The period header can contain either five annual columns or only the
// current-period column for newly launched classes. Locate the physical cell
// by the labelled ratio row AND actual date-column RIGHT EDGE. Never accept
// matching ratios from a neighboring class or MER-before-waivers row.
function desjardinsCell(page,lines,row,key,value){
 if(!fundOnPage(page,row))return null;
 const iso=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(String(row.report_date||''));
 if(!iso)return null;
 const year=Number(iso[1]),month=Number(iso[2]),day=Number(iso[3]);
 const mon=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][month-1];
 if(!mon||day<1||day>31)return null;
 const className=clean(row.class_name).replace(/[–—]/g,'-');
 if(!/^[a-z][a-z0-9]{0,3}-class$/.test(className))return null;
 const datePattern=new RegExp('^'+mon+'[a-z]*\\.?\\s+'+day+'\\s*,?\\s*'+year+'$','i');
 const segments=lines.filter(l=>/^Ratios\s+(?:and|&)\s+Supplemental\s+Data$/i.test(l.text.trim()))
  .sort((a,b)=>b.y-a.y);
 const found=[];
 for(let j=0;j<segments.length;j++){
  const start=segments[j],bottom=segments[j+1]?.y??start.y-320;
  const block=lines.filter(l=>l.y<start.y-1&&l.y>bottom+1);
  const classes=block.filter(l=>l.items.some(it=>it.x<170&&
    /^[A-Z][A-Z0-9]{0,3}[-–—]CLASS$/i.test(it.str.trim())));
  if(classes.length!==1)continue;
  const classItem=classes[0].items.find(it=>it.x<170&&
    /^[A-Z][A-Z0-9]{0,3}[-–—]CLASS$/i.test(it.str.trim()));
  if(clean(classItem.str).replace(/[–—]/g,'-')!==className)continue;
  // Header must belong to this block and be above its Class label.
  const headers=block.filter(l=>l.y>classes[0].y&&l.y-classes[0].y<55);
  const tokens=headers.flatMap(l=>l.items.filter(it=>datePattern.test(it.str.trim())));
  if(tokens.length!==1)continue;
  const headRight=tokens[0].x+tokens[0].w;
  const rx={MER:/^Management expense ratio\s*\(\s*%\s*\)/i,
   TER:/^Trading expense ratio\s*\(\s*%\s*\)/i,
   PTR:/^Portfolio turnover rate\s*\(\s*%\s*\)/i}[key];
  if(!rx)continue;
  const rows=block.filter(l=>l.y<classes[0].y-2&&l.items.some(it=>it.x<200&&rx.test(it.str.trim()))
   &&(key!=='MER'||!/before\s+(?:waivers|absorptions)|before\s+waivers/i.test(l.text)));
  if(rows.length!==1)continue;
  const line=rows[0];
  // Cell right edges align with the PDF's printed period-header right edge.
  const marks=cells(line).concat(line.items.filter(it=>/^n\s*\/?\s*a$/i.test(it.str.trim()))
   .map(it=>({value:null,isMissing:true,raw:it.str,x:it.x,box:{x:it.x-1,y:it.y-1,w:it.w+2,h:it.h+2}})));
  const candidates=marks.filter(c=>c.x>250&&matchesCell(c,value)
   &&Math.abs(c.x+c.box.w-2-headRight)<7);
  if(candidates.length===1)found.push(candidates[0]);
 }
 const unique=new Map(found.map(c=>[c.box.x.toFixed(2)+':'+c.box.y.toFixed(2),c]));
 return unique.size===1?[...unique.values()][0]:null;
}


// Brandes: group consecutive current-year rows into physical Series bands. The
// Series label is printed in the middle of its year block, not before its first
// row. Derive ratio columns from PDF headers, never from matching numbers alone.
function brandesCell(page,lines,row,key,value){
 // Brandes ratio pages identify the fund in a letter-spaced footer, not a title.
 // Verify the entire page's printed fund identifier, never assume a filename.
 if(!compactName(page.text).includes(compactName(row.fund_name)))return null;
 const targetYear=Number((row.report_date||'').slice(0,4));
 if(!targetYear||!/^Series\s+[A-Za-z0-9-]+$/i.test(row.class_name||''))return null;
 const section=lines.find(l=>/^Ratios\s+(?:and|&)\s+Supplemental\s+Data$/i.test(l.text.trim()));
 if(!section)return null;
 const headerItems=lines.filter(l=>l.y<section.y&&section.y-l.y<65).flatMap(l=>l.items);
 const findUnique=rx=>headerItems.filter(i=>rx.test(i.str.trim()));
 const mer=findUnique(/^ratio\s*\(MER\)$/i),before=findUnique(/^MER before waivers$/i);
 const turn=findUnique(/^turnover rate$/i),trading=findUnique(/^expense ratio$/i);
 if([mer,before,turn,trading].some(a=>a.length!==1))return null;
 const anchors={MER:tokenCenter(mer[0]),PTR:tokenCenter(turn[0]),TER:tokenCenter(trading[0])};
 if(!(anchors.MER<tokenCenter(before[0])&&tokenCenter(before[0])<anchors.PTR&&anchors.PTR<anchors.TER))return null;
 const current=lines.filter(l=>l.y<section.y-20&&l.items.some(i=>i.x<180&&i.x>65&&i.str.trim()===String(targetYear)))
  .sort((a,b)=>b.y-a.y);
 const found=[];
 for(let j=0;j<current.length;j++){
  const top=current[j],bottom=current[j+1]?.y??top.y-100;
  // A full series contains its own physical Series caption, usually beside
  // the third historical year. Never infer a class from a prior page.
  const captions=lines.filter(l=>l.y<top.y&&l.y>bottom&&l.items.some(i=>i.x<125&&/^Series\s+[A-Za-z0-9-]+$/i.test(i.str.trim())));
  if(captions.length!==1||clean(captions[0].text)!==clean(row.class_name))continue;
  const years=lines.filter(l=>l.y<=top.y&&l.y>bottom&&l.items.some(i=>i.x<180&&i.x>65&&/^20\d{2}$/.test(i.str.trim())))
   .sort((a,b)=>b.y-a.y);
  if(years.length<1||!years[0].items.some(i=>i.x<180&&i.str.trim()===String(targetYear)))continue;
  // Historical rows must be chronologically descending when present.
  if(!years.every((l,i)=>l.items.some(it=>it.x<180&&it.str.trim()===String(targetYear-i))))continue;
  // Require the target-year printed cell to be inside the metric's header
  // column band, excluding adjacent MER-before-waivers even if identical.
  const targetX=anchors[key];
  const marks=cells(top);
  const selected=marks.filter(c=>matchesCell(c,value)&&c.x>290&&Math.abs(c.x+c.box.w/2-targetX)<28);
  // A tighter band excludes the neighboring MER-before-waivers value.
  const restrict=key==='MER'?selected.filter(c=>c.x<tokenCenter(before[0])-12):
   key==='PTR'?selected.filter(c=>c.x>tokenCenter(before[0])+15&&c.x<anchors.TER-20):
   selected.filter(c=>c.x>anchors.PTR+25);
  if(restrict.length===1)found.push(restrict[0]);
 }
 const unique=new Map(found.map(c=>[c.box.x.toFixed(2)+':'+c.box.y.toFixed(2),c]));
 return unique.size===1?[...unique.values()][0]:null;
}

// NEI: date/class live in one physical row, while the actual MER and the
// before-waivers MER have separate adjacent header columns. Derive anchors
// from printed column titles; missing N/A is a real source glyph, not zero.
function neiCell(page,lines,row,key,value){
 if(!fundOnPage(page,row))return null;
 const date=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(row.report_date||'');
 const cls=/^Series\s+([A-Za-z0-9-]+)$/i.exec(row.class_name||'');
 if(!date||!cls)return null;
 const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][Number(date[2])-1];
 if(!month)return null;
 const section=lines.find(l=>/^Ratios\s+(?:and|&)\s+Supplemental\s+Data$/i.test(l.text.trim()));
 if(!section)return null;
 const allHeader=lines.filter(l=>l.y<section.y&&section.y-l.y<70).flatMap(l=>l.items);
 const find=rx=>allHeader.filter(i=>rx.test(i.str.trim()));
 const mgmt=find(/^Management$/i),expense=find(/^Expense Ratio$/i),before=find(/^before Waivers$/i);
 const trading=find(/^Trading Expense$/i),turn=find(/^Turnover Rate$/i);
 if(mgmt.length!==2||expense.length!==2||before.length!==1||trading.length!==1||turn.length!==1)return null;
 const e=expense.sort((a,b)=>a.x-b.x),a={MER:tokenCenter(e[0]),TER:tokenCenter(trading[0]),PTR:tokenCenter(turn[0])};
 if(!(a.MER<tokenCenter(before[0])&&tokenCenter(before[0])<a.TER&&a.TER<a.PTR))return null;
 if(!mgmt.some(it=>Math.abs(it.x-e[0].x)<14)||!mgmt.some(it=>Math.abs(it.x-e[1].x)<14))return null;
 // PDF headers here print a month/year, not the day. The exact report date
 // is still supplied independently by the extractor; only matching month and
 // year may be treated as current-period source evidence.
 const rxDate=new RegExp('^'+month+'[a-z]*\\.?\\s+'+date[1]+'$','i');
 const target=lines.filter(l=>l.y<section.y-42&&l.y>section.y-520&&
  l.items.some(i=>i.x<70&&i.str.trim().toUpperCase()===cls[1].toUpperCase())&&
  l.items.some(i=>i.x>60&&i.x<140&&rxDate.test(i.str.trim())));
 const found=[];
 for(const line of target){
  const marks=cells(line).concat(line.items.filter(i=>/^N\s*\/?\s*A$/i.test(i.str.trim())).map(i=>({value:null,isMissing:true,raw:i.str,x:i.x,box:{x:i.x-1,y:i.y-1,w:i.w+2,h:i.h+2}})));
  const match=marks.filter(c=>matchesCell(c,value)&&Math.abs(c.x+c.box.w/2-a[key])<28&&
   (key==='MER'?c.x<tokenCenter(before[0])-12:key==='TER'?c.x>a.MER+75&&c.x<a.PTR-15:c.x>a.TER+38));
  if(match.length===1)found.push(match[0]);
 }
 const unique=new Map(found.map(c=>[c.box.x.toFixed(2)+':'+c.box.y.toFixed(2),c]));
 return unique.size===1?[...unique.values()][0]:null;
}


// Pender: financial-ratio data are printed in one independent Class block per
// physical page band, under annual year columns. Reject the before-absorptions
// row even when it has the same value as the true MER.
function penderCell(page,lines,row,key,value){
 if(!fundOnPage(page,row))return null;
 const iso=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(row.report_date||'');
 if(!iso||!/^Class\s+[A-Za-z0-9]+(?:\s*\(USD\))?$/i.test(row.class_name||''))return null;
 const year=Number(iso[1]);
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 const month=months[Number(iso[2])-1];if(!month)return null;
 const periodRx=new RegExp('For\\s+the\\s+(?:year|period)\\s+ended\\s+'+month+'\\s+'+Number(iso[3])+',?\\s*'+year,'i');
 if(!periodRx.test((page.text||'').slice(0,500)))return null;
 const section=lines.find(l=>/^Ratios?\s+(?:and|&)\s+Supplemental\s+Data\b/i.test(l.text.trim()));
 if(!section)return null;
 // Read current-year coordinate directly from the header immediately below section.
 const yearLines=lines.filter(l=>l.y<section.y&&section.y-l.y<44)
  .filter(l=>l.items.some(it=>it.str.trim()===String(year)));
 if(yearLines.length!==1)return null;
 const yearTokens=yearLines[0].items.filter(it=>/^20\d{2}$/.test(it.str.trim())).sort((a,b)=>a.x-b.x);
 if(yearTokens.length<1||Number(yearTokens[0].str.trim())!==year||
  !yearTokens.every((it,i)=>Number(it.str.trim())===year-i))return null;
 const targetX=tokenCenter(yearTokens[0]);
 const classes=lines.filter(l=>l.y<yearLines[0].y&&l.items.some(it=>it.x<120&&
  /^Class\s+[A-Za-z0-9]+(?:\s*\(USD\))?$/i.test(it.str.trim())))
  .sort((a,b)=>b.y-a.y);
 const found=[];
 for(let i=0;i<classes.length;i++){
  const cls=classes[i],label=cls.items.find(it=>it.x<120&&/^Class\s+/i.test(it.str.trim()));
  if(clean(label?.str)!==clean(row.class_name))continue;
  const lower=classes[i+1]?.y??Math.max(35,cls.y-140);
  const band=lines.filter(l=>l.y<cls.y-1&&l.y>lower+1);
  const rx={MER:/^Management expense ratio\s*\(\w+\)/i,
   TER:/^Trading expense ratio\s*\(\w+\)/i,
   PTR:/^Portfolio turnover rate\s*\(\w+\)/i}[key];
  const matching=band.filter(l=>l.items.some(it=>it.x<250&&rx.test(it.str.trim())) &&
   (key!=='MER'||!/before\s+(?:waivers|absorptions)/i.test(l.text)));
  if(matching.length!==1)continue;
  const marks=cells(matching[0]).concat(matching[0].items.filter(it=>/^n\s*\/?\s*a$/i.test(it.str.trim())).map(it=>({value:null,isMissing:true,raw:it.str,x:it.x,box:{x:it.x-1,y:it.y-1,w:it.w+2,h:it.h+2}})));
  const hits=marks.filter(c=>c.x>225&&Math.abs(c.x+c.box.w/2-targetX)<22&&matchesCell(c,value));
  if(hits.length===1)found.push(hits[0]);
 }
 const uniq=new Map(found.map(c=>[c.box.x.toFixed(2)+':'+c.box.y.toFixed(2),c]));
 return uniq.size===1?[...uniq.values()][0]:null;
}

// Scotia: the header has MER, MER-before-waivers, TER, and PTR in adjacent
// columns. Use the physical column header alignment AND the exact dated row
// under the selected Series, never just equal numeric text.
function scotiaCell(page,lines,row,key,value){
 if(!compactName(page.text).includes(compactName(row.fund_name)))return null;
 const iso=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(row.report_date||'');
 if(!iso||!/^Series\s+[A-Za-z0-9-]+$/i.test(row.class_name||''))return null;
 const year=Number(iso[1]),month=Number(iso[2]),day=Number(iso[3]);
 const mon=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][month-1];
 if(!mon||day<1||day>31)return null;
 const dateRx=new RegExp('^'+mon+'[a-z]*\\.?\\s+'+day+',?\\s*'+year+'$','i');
 const sections=lines.filter(l=>/^Ratios\s+(?:and|&)\s+Supplemental\s+Data\s*$/i.test(l.text.trim()));
 const found=[];
 for(const section of sections){
  const headers=lines.filter(l=>l.y<section.y&&section.y-l.y<55).flatMap(l=>l.items);
  const find=rx=>headers.filter(it=>rx.test(it.str.trim()));
  const mgmt=find(/^Management$/i),before=find(/^MER before$/i),trading=find(/^Trading$/i),ptr=find(/^Portfolio turnover$/i);
  const expense=find(/^expense ratio$/i);
  if(mgmt.length!==1||before.length!==1||trading.length!==1||ptr.length!==1||expense.length!==2)continue;
  const anchors={MER:tokenCenter(mgmt[0]),TER:tokenCenter(trading[0]),PTR:tokenCenter(ptr[0])};
  if(!(anchors.MER<tokenCenter(before[0])&&tokenCenter(before[0])<anchors.TER&&anchors.TER<anchors.PTR))continue;
  if(!expense.some(it=>Math.abs(it.x-mgmt[0].x)<12)||!expense.some(it=>Math.abs(it.x-trading[0].x)<24))continue;
  const series=lines.filter(l=>l.y<section.y-22&&l.y>Math.max(section.y-410,40)&&
   l.items.some(it=>it.x<140&&/^Series\s+[A-Za-z0-9-]+$/i.test(it.str.trim())))
   .sort((a,b)=>b.y-a.y);
  for(let i=0;i<series.length;i++){
   const label=series[i].items.find(it=>it.x<140&&/^Series\s+/i.test(it.str.trim()));
   if(clean(label?.str)!==clean(row.class_name))continue;
   const bottom=series[i+1]?.y??Math.max(section.y-410,40);
   const dated=lines.filter(l=>l.y<series[i].y-1&&l.y>bottom+1&&
    l.items.some(it=>it.x<140&&dateRx.test(it.str.trim())));
   if(dated.length!==1)continue;
   const marks=cells(dated[0]).concat(dated[0].items.filter(it=>/^n\s*\/?\s*a$/i.test(it.str.trim())).map(it=>({value:null,isMissing:true,raw:it.str,x:it.x,box:{x:it.x-1,y:it.y-1,w:it.w+2,h:it.h+2}})));
   const targetX=anchors[key],otherX=tokenCenter(before[0]);
   const hits=marks.filter(c=>matchesCell(c,value)&&
    Math.abs(c.x+c.box.w/2-targetX)<24&&
    (key!=='MER'||c.x+c.box.w/2<(targetX+otherX)/2));
   if(hits.length===1)found.push(hits[0]);
  }
 }
 const uniq=new Map(found.map(c=>[c.box.x.toFixed(2)+':'+c.box.y.toFixed(2),c]));
 return uniq.size===1?[...uniq.values()][0]:null;
}

// Hamilton and Vanguard annual ETF tables: a single explicitly labelled
// financial-ratio block with year columns, independent of fund-specific pages
// or numerical values. Never identify MER by matching the adjacent waiver row.
function annualEtfCell(page,lines,row,key,value){
 if(row.fmc_key==='hamilton'&&!clean(page.text).includes(clean(row.fund_name)))return null;
 const iso=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(row.report_date||'');
 if(!iso||iso[2]!=='12'||iso[3]!=='31')return null;
 const yr=Number(iso[1]);
 if(row.fmc_key==='hamilton'&&!/^Class E$/i.test(row.class_name||''))return null;
 if(row.fmc_key==='vanguard'&&!/^ETF Units$/i.test(row.class_name||''))return null;
 const sections=lines.filter(l=>/^Ratios and Supplemental Data\s*$/i.test(l.text));
 if(sections.length!==1)return null;
 const section=sections[0];
 const years=lines.filter(l=>l.y<section.y&&section.y-l.y<55)
  .filter(l=>l.items.filter(it=>/^20\d{2}$/.test(it.str.trim())).length>=2);
 if(years.length!==1)return null;
 const headers=years[0].items.filter(it=>/^20\d{2}$/.test(it.str.trim())).sort((a,b)=>a.x-b.x);
 if(headers.filter(it=>Number(it.str)===yr).length!==1||Number(headers[0].str)!==yr)return null;
 if(!headers.every((it,i)=>i===0||Number(it.str)===Number(headers[i-1].str)-1))return null;
 const center=tokenCenter(headers[0]);
 const limit=(tokenCenter(headers[0])+tokenCenter(headers[1]))/2;
 const rx={MER:/^Management expense ratio\s*$/i,
           TER:/^Trading expense ratio\s*$/i,
           PTR:/^Portfolio turnover rate\s*$/i}[key];
 const band=lines.filter(l=>l.y<years[0].y-1&&years[0].y-l.y<175);
 const rowLines=band.filter(l=>l.items.some(it=>rx.test(it.str.trim())));
 if(rowLines.length!==1)return null;
 const metric=rowLines[0];
 // Require all three explicitly labelled ratio rows in this one table band.
 const distinct=['Management expense ratio','Trading expense ratio','Portfolio turnover rate'];
 if(!distinct.every(label=>band.filter(l=>l.items.some(it=>clean(it.str)===clean(label))).length===1))return null;
 const vals=cells(metric).filter(c=>c.x>center-21&&c.x<limit&&matchesCell(c,value));
 if(vals.length!==1)return null;
 // On multi-year annual tables, the candidate must sit inside the labelled
 // first-year column (not on the adjacent MER-before-waivers line).
 if(Math.abs(vals[0].x-center)>26)return null;
 return vals[0];
}

// Franklin semi-annual series blocks. The current date is printed inside
// the 'Ratios and supplemental data' header, not as a bare year token.
function franklinCell(page,lines,row,key,value){
 if(!clean(page.text).includes(clean(row.fund_name)))return null;
 const iso=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(row.report_date||'');
 if(!iso)return null;
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const date=months[Number(iso[2])-1]+' '+Number(iso[3])+', '+iso[1];
 const heads=lines.filter(l=>l.items.some(i=>/^Ratios and supplemental data:?$/i.test(i.str.trim())) &&
  l.items.some(i=>clean(i.str)===clean(date)));
 if(heads.length!==1)return null;
 const h=heads[0],dateCell=h.items.find(i=>clean(i.str)===clean(date));
 const laterYears=h.items.filter(i=>/^20\d{2}$/.test(i.str.trim())).sort((a,b)=>a.x-b.x);
 if(!dateCell||laterYears.length<1||Number(laterYears[0].str)!==Number(iso[1])-1||
    dateCell.x>=laterYears[0].x||!laterYears.every((i,j)=>Number(i.str)===Number(iso[1])-1-j))return null;
 const headings=lines.filter(l=>l.y>h.y&&l.y-h.y<250 && l.items.some(i=>clean(i.str)===clean(row.class_name)));
 if(headings.length!==1)return null;
 const band=lines.filter(l=>l.y<h.y&&h.y-l.y<95);
 const patterns={MER:/^Management expense ratio(?:\s*\(\d+\))?$/i,
                 TER:/^Trading expense ratio(?:\s*\(\d+\))?$/i,
                 PTR:/^Portfolio turnover rate(?:\s*\(\d+\))?$/i};
 if(!Object.values(patterns).every(rx=>band.filter(l=>l.items.some(i=>rx.test(i.str.trim()))).length===1))return null;
 const targetRows=band.filter(l=>l.items.some(i=>patterns[key].test(i.str.trim())));
 if(targetRows.length!==1)return null;
 const targetX=tokenCenter(dateCell);
 const rightBound=(targetX+tokenCenter(laterYears[0]))/2;
 const hits=cells(targetRows[0]).filter(c=>c.x>targetX-25&&c.x<rightBound&&matchesCell(c,value));
 return hits.length===1?hits[0]:null;
}

// Lysander-Canso: per-Series ratios with full or single-year columns.
// The current year is identified independently inside each physical Series
// band, even when its location differs (ETF Series starts in a far-right band).
function lysanderCell(page,lines,row,key,value){
 if(!clean(page.text).includes(clean(row.fund_name)))return null;
 const year=Number((row.report_date||'').slice(0,4));
 if(!Number.isInteger(year)||year<2000)return null;
 const cls=clean(row.class_name).replace(/\*+$/,'');
 const normalizeHeading=s=>clean(s).replace(/\*+$/,'');
 const heads=lines.filter(l=>/^((?:ETF|Series)\s+(?:Series|[A-Z][A-Z0-9-]*))\*?$/i.test(l.text.trim())||/^Series\s+[A-Z][A-Z0-9-]*\*?$/i.test(l.text.trim()));
 const matchingHeads=heads.filter(l=>normalizeHeading(l.text)===cls);
 if(matchingHeads.length!==1)return null;
 const title=matchingHeads[0];
 const next=heads.filter(l=>l.y<title.y-1).sort((a,b)=>b.y-a.y)[0];
 const minY=next?next.y:title.y-230;
 const segment=lines.filter(l=>l.y<title.y&&l.y>minY);
 const sections=segment.filter(l=>/^Ratios and supplemental data$/i.test(l.text));
 if(sections.length!==1)return null;
 const section=sections[0];
 const yearLines=segment.filter(l=>l.y>section.y&&l.y-section.y<57&&l.items.some(i=>new RegExp('\\b'+year+'\\b').test(i.str.trim())));
 if(yearLines.length!==1)return null;
 const years=yearLines[0].items.filter(i=>/^20\d{2}$/.test(i.str.trim())).sort((a,b)=>a.x-b.x);
 const yearIndex=years.findIndex(i=>Number(i.str)===year);
 if(yearIndex===-1||years.filter(i=>Number(i.str)===year).length!==1)return null;
 const current=years[yearIndex],currentX=tokenCenter(current);
 if(years.length>1&&yearIndex!==0)return null;
 const lower=segment.filter(l=>l.y<section.y&&section.y-l.y<115);
 const rx={MER:/^Management expense ratio[⁰¹²³⁴⁵⁶⁷⁸⁹\d]*$/i,
           TER:/^Trading expense ratio[⁰¹²³⁴⁵⁶⁷⁸⁹\d]*$/i,
           PTR:/^Portfolio turnover rate[⁰¹²³⁴⁵⁶⁷⁸⁹\d]*$/i}[key];
 const labels=lower.filter(l=>rx.test(l.text.split(/\s{2,}/)[0].trim())||
  l.items.some(i=>rx.test(i.str.trim())) ||
  // Layout splits 'Management expense' / 'ratio⁵' into separate PDF.js tokens.
  new RegExp('^'+(key==='MER'?'Management expense ratio':key==='TER'?'Trading expense ratio':'Portfolio turnover rate'),'i').test(l.text));
 const valid=labels.filter(l=>key!=='MER'||!/\bbefore\b/i.test(l.text));
 if(valid.length!==1)return null;
 // The available years determine mutually-exclusive column boundaries.
 const nextX=years[yearIndex+1]&&tokenCenter(years[yearIndex+1]);
 const right=nextX?(currentX+nextX)/2:currentX+29;
 const hits=cells(valid[0]).filter(c=>matchesCell(c,value)&&c.x>currentX-24&&c.x<right&&Math.abs(c.x-currentX)<25);
 return hits.length===1?hits[0]:null;
}


// Manulife, NewGen, Purpose and Leith Wheeler: table-bound, current-year
// source-cell location. All series, years, panels and cells are read from the
// current PDF; no fund-specific numbers, filenames or page positions are used.
function nextBatchFmcCell(page,lines,row,key,value){
 const fmc=row.fmc_key;
 if(!['manulife','newgen','purpose','leith_wheeler'].includes(fmc))return null;
 // Some Purpose title fonts emit a '2' separator between uppercase words.
 // Only normalize the printed FIRST title line; all other FMCs keep the
 // ordinary strict fund-on-page test.
 const titleLine=compactName((page.text||'').split('\n')[0]);
 const purposeTitle=fmc==='purpose'&&titleLine.replace(/2(?=[a-z])/g,'')===compactName(row.fund_name);
 if(!fundOnPage(page,row)&&!purposeTitle)return null;
 const iso=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(row.report_date||'');
 if(!iso)return null;
 const year=Number(iso[1]);
 const targetClass=compactName(row.class_name).replace(/units?$/,'');
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const month=months[Number(iso[2])-1];if(!month)return null;
 const day=Number(iso[3]);
 const body=page.text||'';
 // Require an independently printed period reference. In Manulife's layout
 // April 30 and its year may occupy distinct text items/lines.
 const periodRx=new RegExp(month+'\\s+'+day+',?\\s*'+year,'i');
 const splittedRx=new RegExp(month+'\\s+'+day+',?\\s*(?:\\n[^\\n]{0,70})?\\s*'+year,'i');
 if(fmc!=='manulife'&&!periodRx.test(body))return null;
 if(fmc==='manulife'&&!((new RegExp(month+'\\s+'+day,'i')).test(body)&&body.includes(String(year))))return null;
 const panelWidths=fmc==='purpose'?[[0,page.width/2],[page.width/2,page.width+1]]:[[0,page.width+1]];
 const chosen=[];
 const metricRx={MER:/^Management\s+expense\s+ratio\b/i,TER:/^Trading\s+expense\s+ratio\b/i,PTR:/^Portfolio\s+turnover\s+rate\b/i}[key];
 for(const [left,right] of panelWidths){
  const panelLines=lines.map(l=>{
   const items=l.items.filter(i=>i.x>=left&&i.x<right);
   return {...l,items,text:items.map(i=>i.str).join(' ').replace(/\s+/g,' ').trim()};
  }).filter(l=>l.items.length);
  const headings=[];
  for(const l of panelLines){
   let name=null;
   if(fmc==='newgen'){
    // The full NAV heading is the scope of each separate Class ratio table.
    const m=/\bper\s+(Class\s+[A-Z][A-Z0-9]*(?:\s*\(\s*USD\s*\))?)\s+Unit\b/i.exec(l.text);
    name=m?.[1]||null;
   }else if(fmc==='purpose'){
    const m=/\b((?:Class\s+[A-Z][A-Z0-9]*|ETF)\s*Units?)\b/i.exec(l.text);
    if(m&&l.items.some(i=>new RegExp('\\b'+year+'\\b').test(i.str.trim())))name=m[1];
   }else{
    const raw=l.items.filter(i=>i.x<left+170).map(i=>i.str).join(' ').trim();
    if(/^(?:Series\s+[A-Za-z0-9-]+|Advisor\s+Series)$/i.test(raw))name=raw;
   }
   if(!name)continue;
   name=name.replace(/\s*Units?\s*$/i,'');
   headings.push({y:l.y,line:l,name});
  }
  headings.sort((a,b)=>b.y-a.y);
  for(let h=0;h<headings.length;h++){
   const head=headings[h],next=headings[h+1];
   if(compactName(head.name)!==targetClass)continue;
   const low=next?.y??Math.max(20,head.y-(fmc==='manulife'?155:265));
   const band=panelLines.filter(l=>l.y<=head.y+1&&l.y>low+1);
   // A table has its own printed year header. In Leith Wheeler the latest
   // year is on a SECOND line beneath the series heading, unlike 2024..2020.
   const yearHeaders=band.filter(l=>head.y-l.y<37).flatMap(l=>l.items.filter(it=>/^20\d{2}$/.test(it.str.trim()))).sort((a,b)=>a.x-b.x);
   if(!yearHeaders.length||Number(yearHeaders[0].str.trim())!==year||
    !yearHeaders.every((it,i)=>Number(it.str.trim())===year-i))continue;
   const yearX=tokenCenter(yearHeaders[0]);
   const matching=band.filter(l=>{
    const label=l.items.filter(it=>it.x<yearX-35).map(it=>it.str).join(' ').replace(/\s+/g,' ').replace(/^P\s+ortfolio\b/i,'Portfolio').trim();
    if(!metricRx.test(label))return false;
    if(key==='MER'&&/\bbefore\b|\bexcluding\b|allocation/i.test(label))return false;
    if(key==='MER'&&fmc==='newgen'&&!/including\s+performance\s+fees/i.test(label))return false;
    return true;
   });
   if(matching.length!==1)continue;
   const metric=matching[0];
   const marks=cells(metric).concat(metric.items.filter(it=>/^n\s*\/?\s*a$/i.test(it.str.trim())).map(it=>({value:null,isMissing:true,raw:it.str,x:it.x,box:{x:it.x-1,y:it.y-1,w:it.w+2,h:Math.max(6,it.h)+2}})));
   const found=marks.filter(c=>c.x>yearX-29&&c.x<yearX+21&&c.x>=left&&c.x<right&&matchesCell(c,value));
   if(found.length===1)chosen.push(found[0]);
  }
 }
 const unique=new Map(chosen.map(c=>[c.box.x.toFixed(2)+':'+c.box.y.toFixed(2),c]));
 return unique.size===1?[...unique.values()][0]:null;
}

const FMC_DATED_LOCATORS={rbc:datedFmcCell,ci:datedFmcCell};
function locateInPage(page,row,key,value,{hint=false}={}){
 if(!Array.isArray(page.items)||!page.items.length||page.ocrUsed)return null;
 const lines=textLines(page.items),year=Number((row.report_date||'').slice(0,4))||row.year;
 const fundTitle=clean(row.fund_name),headerText=clean((page.text||'').slice(0,1300));
 const namedEtf=/^(?:ETF|CAD|USD)\s+Units$/i.test(row.class_name||'')&&fundTitle.length>13&&headerText.includes(fundTitle);
 if(!year||!pageContext(page,lines))return null;
 const matches=[];
 function choose(candidates,kind){
  const unique=new Map(candidates.map(m=>[`${m.box.x.toFixed(1)}:${m.box.y.toFixed(1)}`,{...m,page:page.page,metric:key,kind}]));
  return unique.size===1?[...unique.values()][0]:null;
 }
 // Specialized current-year ratio bands for these four FMCs. Any unknown
 // layout fails closed rather than falling through to numeric matching.
 if(['manulife','purpose','newgen','leith_wheeler'].includes(row.fmc_key)){
  const selected=nextBatchFmcCell(page,lines,row,key,value);
  return selected?{...selected,page:page.page,metric:key,kind:row.fmc_key+'-verified-series-year-metric-cell'}:null;
 }
 // Lysander series- and period-specific source bands.
 if(row.fmc_key==='lysander'){
  const selected=lysanderCell(page,lines,row,key,value);
  return selected?{...selected,page:page.page,metric:key,kind:'lysander-verified-series-year-metric-cell'}:null;
 }
 // Franklin series/period-specific ratios, without same-value fallback.
 if(row.fmc_key==='franklin'){
  const selected=franklinCell(page,lines,row,key,value);
  return selected?{...selected,page:page.page,metric:key,kind:'franklin-verified-series-date-ratio-cell'}:null;
 }
 // Header-validated annual ETF blocks; do not use generic repeated-number fallback.
 if(row.fmc_key==='hamilton'||row.fmc_key==='vanguard'){
  const selected=annualEtfCell(page,lines,row,key,value);
  return selected?{...selected,page:page.page,metric:key,kind:row.fmc_key+'-verified-year-ratio-cell'}:null;
 }
 // FMC-specific Pender and Scotia source layouts must fail closed.
 if(row.fmc_key==='pender'||row.fmc_key==='scotia'){
  const selected=row.fmc_key==='pender'?penderCell(page,lines,row,key,value):scotiaCell(page,lines,row,key,value);
  return selected?{...selected,page:page.page,metric:key,kind:row.fmc_key+'-verified-series-period-header-cell'}:null;
 }
 // Dedicated Brandes/NEI adapters preserve strictly checked column and date positions.
 if(row.fmc_key==='brandes'||row.fmc_key==='nei'){
  const selected=row.fmc_key==='brandes'?brandesCell(page,lines,row,key,value):neiCell(page,lines,row,key,value);
  return selected?{...selected,page:page.page,metric:key,kind:row.fmc_key+'-verified-class-period-column'}:null;
 }
 // Fidelity-specific source validation is deliberately closed to generic
 // number-matching fallbacks. Unknown Fidelity layouts remain unhighlighted.
 if(row.fmc_key==='fidelity'){
  const selected=fidelityCell(lines,row,key,value);
  return selected?{...selected,page:page.page,metric:key,kind:'fidelity-period-series-labelled-column'}:null;
 }
 if(row.fmc_key==='dynamic'||row.fmc_key==='nbi'){
  const selected=row.fmc_key==='dynamic'?dynamicCell(page,lines,row,key,value):nbiCell(page,lines,row,key,value);
  return selected?{...selected,page:page.page,metric:key,kind:row.fmc_key+'-verified-period-series-column'}:null;
 }
 // TD and BlackRock/iShares fail closed: an unsupported source layout never
 // silently falls through to generic same-number matches.
 if(row.fmc_key==='td'||row.fmc_key==='blackrock'){
  const selected=row.fmc_key==='td'?tdCell(page,lines,row,key,value):blackrockCell(page,lines,row,key,value);
  return selected?{...selected,page:page.page,metric:key,kind:row.fmc_key+'-verified-fund-period-series-header-cell'}:null;
 }
 // Mackenzie and IG Mackenzie layouts are validated per physical table band.
 // An unrecognized variation must not fall back to same-number guessing.
 if(row.fmc_key==='mackenzie'||row.fmc_key==='ig_mackenzie'){
  const selected=mackenzieCell(page,row,key,value);
  return selected?{...selected,page:page.page,metric:key,kind:'mackenzie-verified-series-date-ratio-cell'}:null;
 }
 // Desjardins per-Class period blocks must never fall back to same-number matching.
 if(row.fmc_key==='desjardins'){
  const selected=desjardinsCell(page,lines,row,key,value);
  return selected?{...selected,page:page.page,metric:key,kind:'desjardins-verified-class-period-ratio-cell'}:null;
 }
 // BMO and AGF tables use dedicated, date-column-aware Class/Series
 // bands; unsupported layouts must not fall back to guessed numbers.
 if(row.fmc_key==='bmo'||row.fmc_key==='agf'){
  const selected=issuerPeriodBandCell(page,row,key,value,row.fmc_key);
  return selected?{...selected,page:page.page,metric:key,kind:row.fmc_key+'-verified-series-year-metric-cell'}:null;
 }
 // A. Specialized dated tables use the original PDF column headers and
 // exact Class/Series + report date; never rely on positional indices alone.
 // A. RP Investment Advisors: a dated Class row has seven financial columns.
 // Its MER/before-waivers/TER/PTR columns are identified by actual table
 // headings, not by repeated percentage values (TER/PTR repeat across classes).
 if(row.fmc_key==='rpia'){
  const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(row.report_date||'');
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateRx=iso?new RegExp('^'+months[Number(iso[2])-1]+'(?:e)?\\.?\\s+'+Number(iso[3])+'[,\\s]+'+year+'\\b','i'):null;
  const normalizeClass=s=>clean(s).replace(/\*+$/,'').trim();
  const found=[];
  for(const l of lines){
   if(!dateRx||!dateRx.test(l.text))continue;
   // Only the closest class heading applies to a dated row; importantly,
   // "Class A" is not the same as "Class A-USD**".
   const heading=lines.filter(x=>x.y>l.y&&x.y-l.y<245&&/^class\s+[a-z][a-z0-9]*(?:-usd)?\**$/i.test(x.text.trim()))
     .sort((a,b)=>a.y-b.y)[0];
   if(!heading||normalizeClass(heading.text)!==normalizeClass(row.class_name))continue;
   const main=lines.filter(x=>x.y>l.y&&x.y-l.y<570&&x.items.some(i=>/^management expense$/i.test(i.str.trim()))&&x.items.some(i=>/^trading$/i.test(i.str.trim()))&&x.items.some(i=>/^portfolio$/i.test(i.str.trim())))
     .sort((a,b)=>a.y-b.y)[0];
   if(!main)continue;
   const xBefore=main.items.find(i=>/^management expense$/i.test(i.str.trim()))?.x;
   const xTrade=main.items.find(i=>/^trading$/i.test(i.str.trim()))?.x;
   const xTurn=main.items.find(i=>/^portfolio$/i.test(i.str.trim()))?.x;
   const xNAV=main.items.find(i=>/^net asset$/i.test(i.str.trim()))?.x;
   const firstHeader=lines.some(x=>x.y<=main.y&&main.y-x.y<20&&x.items.some(i=>/^management$/i.test(i.str.trim())&&i.x<xBefore-15));
   if(!firstHeader||![xBefore,xTrade,xTurn,xNAV].every(Number.isFinite)||!(xBefore<xTrade&&xTrade<xTurn&&xTurn<xNAV))continue;
   const values=cells(l);
   const candidates=values.filter(n=>{
    if(key==='MER')return n.x>xBefore-95&&n.x<xBefore-1;
    if(key==='TER')return n.x>xTrade-5&&n.x<xTurn-1;
    return n.x>xTurn-5&&n.x<xNAV-1;
   }).filter(n=>matchesCell(n,value));
   if(candidates.length===1)found.push(candidates[0]);
  }
  const selected=choose(found,'rpia-dated-class-column');if(selected)return selected;
 }
 // Known FMC dated tables use header-validated adapters, with no unsafe
 // numerical-index fallback. An unrecognized variation fails closed.
 if(FMC_DATED_LOCATORS[row.fmc_key]){
  const cell=FMC_DATED_LOCATORS[row.fmc_key](lines,row,key,value,row.fmc_key);
  return cell?{...cell,page:page.page,metric:key,kind:`${row.fmc_key}-header-validated-dated-cell`}:null;
 }
 // B. Current-period multi-year ratios with the year above the numeric cells.
 // The year must be printed in a financial highlights table and cell x aligned
 // with the LATEST year, rather than merely appearing somewhere on the page.
 const yearHeaders=lines.filter(l=>/\b(?:period|financial|20\d{2})\b/i.test(l.text)).flatMap(l=>numbers(l).filter(n=>n.value===year).map(n=>({x:n.x,y:l.y})));
 const metricLines=lines.filter(l=>LABELS[key].test(l.text));
 if(yearHeaders.length){
  const found=[];
  for(const lab of metricLines){
   if(key==='MER'&&/\bbefore\b/i.test(lab.text))continue;
   // Ignore a second, separately labelled "MER before waivers" row when
   // its heading is split over multiple PDF.js lines (BMO ETF tables).
   if(key==='MER'&&/management\s+expense/i.test(lab.text)&&!/\bratio\b/i.test(lab.text)
      &&lines.some(next=>next.y<lab.y&&lab.y-next.y<22&&/\bratio\s+before\b/i.test(next.text)))continue;
   const rightSide=lab.items.some(i=>i.x>310&&LABELS[key].test(i.str));
   // Reassembled labels may span 2–3 lines. The value row can be below the
   // metric heading, but cannot be under the next ratio type heading.
   const candidates=lines.filter(l=>l.y<=lab.y+1&&lab.y-l.y<23);
   for(const line of candidates){
    // Do not extend one metric's cell onto a different ratio heading/table row.
    if(lines.some(mid=>mid!==lab&&mid.y<lab.y-.5&&mid.y>line.y+.5&&LABELS[key].test(mid.text)))continue;
    const nums=cells(line).filter(n=>matchesCell(n,value));
    for(const n of nums){
     // Restrict to matching latest-year column AND same column band as label.
     const headers=yearHeaders.filter(h=>h.y>=line.y&&h.y-line.y<310&&Math.abs(h.x-n.x)<15);
     if(!headers.length)continue;
     const nearestYear=Math.min(...headers.map(h=>h.y-line.y));
     if(!Number.isFinite(nearestYear))continue;
     if(rightSide){
      if(n.x<315)continue;
      const heading=lines.filter(l=>l.y>=line.y&&l.y-line.y<240&&l.items.some(i=>i.x>300&&clsPatterns(row.class_name)[0].test(clean(i.str)))).sort((a,b)=>a.y-b.y)[0];
      if(!heading&&!(namedEtf||(/^ETF\s+Units$/i.test(row.class_name)&&hint)))continue;
      const inBetween=lines.some(l=>l.y>line.y+1&&l.y<(heading?.y||line.y+240)-1&&l.items.some(i=>i.x>300&&/\b(?:series|class)\s+[A-Z](?:\d+)?\b/i.test(i.str)&&!clsPatterns(row.class_name)[0].test(clean(i.str))));
      if(inBetween)continue;
     }else if(!(namedEtf||(/^(?:ETF|CAD|USD)\s+Units$/i.test(row.class_name)&&hint))){
      const heading=nearestClassAbove(lines,line,row);if(!heading)continue;
     }
     found.push(n);
    }
   }
  }
  const uniqueCandidates=found.some(n=>n.fragmented)?found.filter(n=>n.fragmented):found;
  const selected=choose(uniqueCandidates,'latest-year-ratio-cell');if(selected)return selected;
 }
 // C. General series-by-metric single-current-period row. Only one candidate
 // and class heading immediately preceding the matched metric row is accepted.
 if(!hint)return null;
 const found=[];
 for(const lab of metricLines){
  const header=nearestClassAbove(lines,lab,row);if(!header)continue;
  for(const l of lines.filter(x=>x.y<=lab.y+1&&lab.y-x.y<12)){
   const vals=cells(l).filter(n=>matchesCell(n,value)&&n.x>lab.minX+20);
   if(vals.length===1)found.push(vals[0]);
  }
 }
 return choose(found,'class-metric-row');
}


// Last-gap adapters: used ONLY if the established FMC locator returned no cell.
// Match the original metric label, source reporting-year column, and physical
// series block. Never choose another column merely because its value matches.
const GAP_FMCS=new Set(['ninepoint','harvest','rbc','middlefield','global_x','first_trust','ci','sun_life']);
function exactGapLabel(line,key,fmc){
 const t=clean(line.items.filter(i=>i.x<190).map(i=>i.str).join(' '));
 if(key==='MER'){
  if(/before|excluding|waivers|absorptions|taxes|financing/i.test(t))return false;
  if(fmc==='middlefield')return /^management expense ratio/.test(t);
  return /^management expense ratio/.test(t);
 }
 if(key==='TER')return /^trading expense ratio(?:\s*\(\d+\))?$/.test(t);
 return /^(?:portfolio turnover (?:rate|ratio))/.test(t);
}
function gapValueRow(lines,label,key,fmc){
 // Middlefield's quoted ("MER") is on the next line; all other ratio
 // labels already contain the associated latest-year cells on the same line.
 if(fmc==='middlefield'&&key==='MER')return lines.filter(l=>l.y<=label.y+.8&&label.y-l.y<17);
 return [label];
}
function gapYearColumn(lines,ratio,year,contextFloor){
 // Find a printed year header just above the ratio, not an unrelated year
 // in the footnote, performance section, or on another page.
 const head=lines.filter(l=>l.y>ratio.y+3&&l.y-ratio.y<190&&l.y<contextFloor)
  .filter(l=>l.items.some(i=>new RegExp('\\b'+year+'\\b').test(i.str.trim())))
  .sort((a,b)=>a.y-b.y)[0];
 if(!head)return null;
 const years=head.items.filter(i=>/^20\d{2}$/.test(i.str.trim())).sort((a,b)=>a.x-b.x);
 const current=years.filter(i=>+i.str.trim()===year);
 if(!current.length&&head.items.some(i=>new RegExp('\\b'+year+'\\b').test(i.str.trim()))){
  const dateToken=head.items.filter(i=>new RegExp('\\b'+year+'\\b').test(i.str.trim()));
  if(dateToken.length===1)return dateToken[0].x;
 }
 if(current.length!==1||years.some(i=>+i.str.trim()>year))return null;
 return current[0].x;
}
function gapSeriesYearCell(page,lines,row,key,value){
 const fmc=row.fmc_key,year=Number(row.report_date?.slice(0,4));
 const titles=lines.filter(l=>{
  const t=clean(l.items.filter(i=>i.x<180).map(i=>i.str).join(' '));
  if(fmc==='first_trust')return /^(?:fhq(?:\.f)?)$/.test(t);
  return /^(?:series\s+\w+(?:\s+\w+)?|class\s+[a-z](?:\s*\(cad\))?)$/.test(t);
 });
 const target=clean(row.class_name);
 const candidates=[];
 for(const label of lines.filter(l=>exactGapLabel(l,key,fmc))){
  const title=titles.filter(t=>t.y>label.y&&t.y-label.y<260).sort((a,b)=>a.y-b.y)[0];
  if(!title||clean(title.items.filter(i=>i.x<180).map(i=>i.str).join(' '))!==target)continue;
  // Require actual Ratios and Supplemental Data heading, with either a
  // dedicated heading per series or a shared one on the same source page.
  if(!lines.some(l=>/ratios?\s+(?:and|&)\s+supplemental/i.test(l.text)&&l.y>label.y))continue;
  const headerX=gapYearColumn(lines,label,year,title.y+3);
  if(headerX===null)continue;
  const matches=[];
  for(const metricLine of gapValueRow(lines,label,key,fmc)){
   for(const cell of cells(metricLine)){
    if(Math.abs(cell.x-headerX)<25&&matchesCell(cell,value)&&cell.x>180)matches.push(cell);
   }
  }
  const unique=new Map(matches.map(c=>[c.box.x.toFixed(2)+':'+c.box.y.toFixed(2),c]));
  if(unique.size===1)candidates.push(...unique.values());
 }
 const unique=new Map(candidates.map(c=>[c.box.x.toFixed(2)+':'+c.box.y.toFixed(2),c]));
 return unique.size===1?[...unique.values()][0]:null;
}
function gapEtfYearCell(page,lines,row,key,value){
 const fmc=row.fmc_key,year=Number(row.report_date?.slice(0,4));
 if(!/^(?:ETF|CAD|USD)\s+Units$/i.test(row.class_name))return null;
 const sections=lines.filter(l=>/ratios?\s+(?:and|&)\s+supplemental/i.test(l.text));
 const candidates=[];
 for(const section of sections){
  const labels=lines.filter(l=>l.y<section.y&&section.y-l.y<220&&exactGapLabel(l,key,fmc));
  if(labels.length!==1)continue;
  const label=labels[0];
  const h=gapYearColumn(lines,label,year,section.y+1);
  if(h===null)continue;
  const found=[];
  for(const l of gapValueRow(lines,label,key,fmc)){
   for(const c of cells(l))if(c.x>170&&Math.abs(c.x-h)<25&&matchesCell(c,value))found.push(c);
  }
  const unique=new Map(found.map(c=>[c.box.x.toFixed(2)+':'+c.box.y.toFixed(2),c]));
  if(unique.size===1)candidates.push(...unique.values());
 }
 const unique=new Map(candidates.map(c=>[c.box.x.toFixed(2)+':'+c.box.y.toFixed(2),c]));
 return unique.size===1?[...unique.values()][0]:null;
}
function gapRbcEtfCell(page,lines,row,key,value){
 if(!/^(?:ETF|CAD|USD)\s+Units$/i.test(row.class_name))return null;
 const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(row.report_date||'');if(!iso)return null;
 const header=lines.find(l=>l.items.some(i=>i.str.trim()==='Management')&&l.items.some(i=>i.str.trim()==='MER Before')&&l.items.some(i=>i.str.trim()==='Portfolio')&&l.items.some(i=>i.str.trim()==='Trading'));
 if(!header||!lines.some(l=>/ratios and supplemental data/i.test(l.text)&&l.y>header.y&&l.y-header.y<40))return null;
 const labels={MER:'Management',TER:'Trading',PTR:'Portfolio'};
 const target=header.items.find(i=>i.str.trim()===labels[key]);const before=header.items.find(i=>i.str.trim()==='MER Before');
 if(!target||!before||!(header.items.find(i=>i.str.trim()==='Management').x<before.x))return null;
 const lower=lines.filter(l=>l.y<header.y&&header.y-l.y<19).flatMap(l=>l.items);
 if(!lower.some(i=>(key==='PTR'?/Turnover Rate/:/Expense Ratio/).test(i.str)&&Math.abs(i.x-target.x)<35))return null;
 const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+iso[2]-1];
 const date=new RegExp('^'+month+'[a-z]*\\.?\\s+'+Number(iso[3])+'[,\\s]+'+iso[1]+'\\b','i');
 const vals=[];
 const x=target.x;
 for(const l of lines.filter(l=>date.test(l.text)&&l.y<header.y&&header.y-l.y<55)){
  const found=cells(l).filter(c=>Math.abs(c.x-x)<38&&matchesCell(c,value));
  if(found.length===1)vals.push(found[0]);
 }
 return vals.length===1?vals[0]:null;
}
function gapCiMissingCell(page,lines,row,key,value){
 if(key!=='MER'||value!=null)return null;
 const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(row.report_date||'');if(!iso)return null;
 const section=lines.find(l=>/ratios? and supplemental data/i.test(l.text));
 const header=section?ratioHeader(lines,section.y-110,'ci'):null;
 if(!header)return null;
 const mon=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+iso[2]-1];
 const rx=new RegExp('^'+mon+'[a-z]*\\.?\\s+'+Number(iso[3])+'[,\\s]+'+iso[1]+'\\b','i');
 const result=[];
 for(const l of lines.filter(l=>rx.test(l.text)&&l.y<header.section)){
  const title=lines.filter(h=>h.y>l.y&&h.y-l.y<45&&/^series\s+[a-z0-9]+$/i.test(h.text.trim())).sort((a,b)=>a.y-b.y)[0];
  if(!title||clean(title.text)!==clean(row.class_name))continue;
  const after=header.MER;
  // The after-tax management-expense column is immediately left of HST.
  const cs=cells(l).filter(c=>c.isMissing&&Math.abs(c.x-after)<23&&c.x>header.before+20);
  if(cs.length===1)result.push(cs[0]);
 }
 return result.length===1?result[0]:null;
}
function gapSunLifeCell(page,lines,row,key,value){
 const yr=Number(row.report_date?.slice(0,4));
 const target=clean(row.class_name),fund=clean(row.fund_name),out=[];
 if(!['MER','PTR'].includes(key))return null;
 const heads=lines.filter(l=>l.items.some(it=>it.x<330&&clean(it.str)===fund+' - '+target));
 for(const head of heads){
  const next=lines.filter(l=>l.y<head.y&&l.y>head.y-260&&l.items.some(i=>i.x<330&&clean(i.str).startsWith(fund+' - series '))).sort((a,b)=>b.y-a.y)[0];
  const low=next?.y??Math.max(0,head.y-260);
  const yearLine=lines.filter(l=>l.y<head.y&&l.y>low&&l.items.some(i=>i.str.trim()===String(yr)&&i.x<330)).sort((a,b)=>b.y-a.y)[0];
  if(!yearLine)continue;
  const yearX=yearLine.items.find(i=>i.str.trim()===String(yr)&&i.x<330).x;
  for(const label of lines.filter(l=>l.y<yearLine.y&&l.y>low)){
   const t=clean(label.items.filter(i=>i.x<330).map(i=>i.str).join(' '));
   if(key==='MER'&&t!=='management expense')continue;
   if(key==='PTR'&&t!=='portfolio turnover')continue;
   const nexts=lines.filter(l=>l.y<label.y&&label.y-l.y<13&&l.items.some(i=>i.x<330&&/^(?:ratio|rate)\s*\(%\)/i.test(i.str.trim())));
   if(nexts.length!==1)continue;
   const candidates=cells(nexts[0]).filter(c=>Math.abs(c.x-yearX)<14&&matchesCell(c,value));
   if(candidates.length===1)out.push(candidates[0]);
  }
 }
 return out.length===1?out[0]:null;
}
function gapDocIdentity(pages,row){
 if(!Array.isArray(pages)||!pages.length||!row.fund_name)return false;
 const simplify=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
 const name=simplify(row.fund_name);
 if(name.length<10)return false;
 if(!pages.some(p=>simplify(p.text).includes(name)))return false;
 const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(row.report_date||'');
 if(!iso)return false;
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 const nameMonth=months[Number(iso[2])-1];if(!nameMonth)return false;
 const monthRx=nameMonth.slice(0,3)+'(?:'+nameMonth.slice(3)+')?';
 const dateRx=new RegExp('\\b'+monthRx+'\\.?\\s*'+Number(iso[3])+'\\s*[,]?[\\s]+('+iso[1]+')\\b','i');
 const reverseRx=new RegExp('\\b'+Number(iso[3])+'\\s+'+monthRx+'\\.?[,]?\\s*'+iso[1]+'\\b','i');
 return pages.some(p=>dateRx.test(p.text)||reverseRx.test(p.text));
}
function locateLastGap(page,row,key,value,pages){
 if(!gapDocIdentity(pages,row))return null;
 if(!GAP_FMCS.has(row.fmc_key)||!Array.isArray(page.items)||page.ocrUsed)return null;
 const lines=textLines(page.items);
 let c=null;
 if(['ninepoint','harvest','first_trust'].includes(row.fmc_key))c=gapSeriesYearCell(page,lines,row,key,value);
 else if(['middlefield','global_x'].includes(row.fmc_key))c=gapEtfYearCell(page,lines,row,key,value);
 else if(row.fmc_key==='rbc')c=gapRbcEtfCell(page,lines,row,key,value);
 else if(row.fmc_key==='ci')c=gapCiMissingCell(page,lines,row,key,value);
 else if(row.fmc_key==='sun_life')c=gapSunLifeCell(page,lines,row,key,value);
 return c?{...c,page:page.page,metric:key,kind:row.fmc_key+'-strict-source-gap-v1'}:null;
}

function sourcePages(row){return [...new Set(METRICS.map(k=>row.evidence?.[k]?.page).filter(p=>Number.isInteger(p)&&p>0))];}
function locate(pages,rows){
 const output={version:4,rows:{}};
 for(const row of rows||[]){
  const key=row.row_id||row.class_name;
  const record={locatorVersion:4,...(['manulife','purpose','newgen','leith_wheeler'].includes(row.fmc_key)?{nextFmcLocatorVersion:1}:{}),...(GAP_FMCS.has(row.fmc_key)?{lastGapLocatorVersion:1}:{}),...(row.fmc_key==='fidelity'?{fidelityLocatorVersion:1}:{}),...(row.fmc_key==='desjardins'?{desjardinsLocatorVersion:1}:{}),...(['pender','scotia'].includes(row.fmc_key)?{penderScotiaLocatorVersion:1}:{}),...(['hamilton','vanguard'].includes(row.fmc_key)?{annualEtfLocatorVersion:1}:{}),...(row.fmc_key==='franklin'?{franklinLocatorVersion:1}:{}),...(row.fmc_key==='lysander'?{lysanderLocatorVersion:1}:{}),...(['brandes','nei'].includes(row.fmc_key)?{brandesNeiLocatorVersion:1}:{}),...(['td','blackrock'].includes(row.fmc_key)?{tdBlackrockLocatorVersion:1}:{}),...(['dynamic','nbi'].includes(row.fmc_key)?{fmcEvidenceVersion:1}:{}),...(['mackenzie','ig_mackenzie'].includes(row.fmc_key)?{mackenzieLocatorVersion:1}:{}),...(['bmo','agf'].includes(row.fmc_key)?{bmoAgfLocatorVersion:1}:{}),pages:sourcePages(row),metrics:{},originalValues:{}};
  for(const metric of METRICS){
   const value=Object.hasOwn(row.originalValues||{},metric)?row.originalValues[metric]:row[metric];
   record.originalValues[metric]=value??null;
   if(row.evidence?.[metric]?.method==='manual'&&!Object.hasOwn(row.originalValues||{},metric))continue;
   const hinted=row.evidence?.[metric]?.page;
   const candidates=Number.isInteger(hinted)&&hinted>0?pages.filter(p=>p.page===hinted):pages;
   const found=[];
   for(const p of candidates){const hit=locateInPage(p,row,metric,value,{hint:!!hinted})||locateLastGap(p,row,metric,value,pages);if(hit)found.push(hit);}
   // When hints are absent, page ambiguity must also fail closed.
   if(found.length===1){const f=found[0];record.metrics[metric]={page:f.page,box:f.box,kind:f.kind,value:value??null,sourceText:f.raw,isMissing:!!f.isMissing};record.pages.push(f.page);}
  }
  record.pages=[...new Set(record.pages)].sort((a,b)=>a-b);
  output.rows[key]=record;
 }
 return output;
}
function initialPage(doc){
 const all=[];for(const row of doc?.results||[]){
  const record=doc.evidenceMap?.rows?.[row.row_id||row.class_name];
  if(record?.locatorVersion===4&&record?.pages?.length)all.push(...record.pages);
  else all.push(...sourcePages(row));
 }
 return all.length?Math.min(...all.filter(Number.isInteger)):null;
}
global.MRFP_EVIDENCE={GAP_FMCS:[...GAP_FMCS],locateLastGap,locate,locateInPage,textLines,numbers,missingMarks,cells,sourcePages,initialPage};
})(globalThis);
