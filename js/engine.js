/* MRFP Extractor Canada — browser-only financial ratio engine.
   Ported from the Node.js V1 extractor; zero Node runtime dependencies.
   Tables are dynamically parsed. No financial metric values are hardcoded.
*/
(function(global){
'use strict';
function createHash() {
  let text='';
  return {
    update(input){text+=String(input);return this;},
    digest(){
      let hashes=[2166136261,2246822519,3266489917,668265263,374761393];
      for (let i=0;i<text.length;i++){
        const ch=text.charCodeAt(i);
        hashes=hashes.map((h,j)=>Math.imul(h ^ (ch + j*17),[16777619,2246822519,3266489917,374761393,2654435761][j])>>>0);
      }
      return hashes.map(x=>x.toString(16).padStart(8,'0')).join('');
    }
  }
}

// ---- src/fmc/nbi.mjs ----
// Generalized NBI fund title and expanded class headings (SmartData update).
const nbi={
  key:'nbi',label:'National Bank Investments',style:'nbi',
  signatures:[/National Bank Investments|National Bank Investments Advisory Service/i,/www\.nbinvestments\.ca|www\.nbinvestments\.ca/i,/\bNBI Sustainable\b/i],
  title:/^\s*(NBI(?:\s+[A-Za-z][A-Za-z0-9&'’.-]*){2,12}\s+(?:Fund|Portfolio|Class))\s*$/im
};
const nbiClass=/^\s*(Investor\s*\*?\s*\/\s*Advisor\s+Series|Investor(?:-\d+)?\s+Series|Advisor(?:-\d+)?\s+Series|Series\s+[A-Z][A-Z0-9-]*|ETF(?:H)?\s+Series|Private\s+Series)\s*\*{0,5}\s*$/i;


// ---- src/fmc/profiles.mjs ----
const desjardins={key:'desjardins',label:'Desjardins Investments',style:'desjardins',signatures:[/\bDESJARDINS FUNDS\b/i,/Desjardins Investments Inc\./i,/desjardinsfunds\.com/i],title:/^\s*(Desjardins\s+[^\n]{4,110}(?:Fund|Portfolio))\s*$/im};
const sunLife={key:'sun_life',label:'Sun Life Global Investments',style:'sun_life',signatures:[/SLGI ASSET MANAGEMENT INC/i,/sunlifeglobalinvestments\.com/i,/Sun Life Granite/i],title:/^\s*(Sun Life\s+[^\n]{3,120}(?:Fund|Class|Portfolio))\s*$/im};
const franklin={key:'franklin',label:'Franklin Templeton',style:'franklin',signatures:[/franklintempleton\.ca/i,/Franklin Templeton Investments Corp/i,/\bFRANKLIN CANADIAN\b/i],title:/^\s*(FRANKLIN\s+[^\n]{3,130}(?:FUND|PORTFOLIO))\s*$/im};
const middlefield={key:'middlefield',label:'Middlefield',style:'middlefield',signatures:[/MIDDLEFIELD CORPORATE PROFILE/i,/\bMIDDLEFIELD\s+(?:MUTUAL FUNDS|GLOBAL|LIMITED)\b/i,/Middlefield Limited/i],title:/^\s*(MIDDLEFIELD\s+[A-Z\s.]{4,100}(?:FUND|CLASS|ETF))\s*$/im};
const manulife={key:'manulife',label:'Manulife Investment Management',style:'manulife',signatures:[/Manulife Investment Management Limited/i,/manulifeim\.ca/i,/\bManulife\b/i],title:/^\s*(Manulife\s+[^\n]{3,120}(?:Fund|Class|Portfolio))\s*$/im};
const dynamic={key:'dynamic',label:'1832 Asset Management (Dynamic)',style:'dynamic',signatures:[/1832 Asset Management L\.P\./i,/www\.dynamic\.ca/i,/\bDynamic Dividend\b/i],title:/^\s*(Dynamic\s+[^\n]{3,110}(?:Fund|Class|Portfolio))\s*$/im};
const purpose={key:'purpose',label:'Purpose Investments',style:'purpose',signatures:[/www\.purposeinvest\.com|www\.purposeinvest\.com/i,/PURPOSE ACTIVE BALANCED FUND/i,/Purpose Investments/i],title:/^\s*(PURPOSE\s+[^\n]{3,100}(?:FUND|PORTFOLIO))\s*$/im};
const blackrock={key:'blackrock',label:'BlackRock / iShares',style:'blackrock',signatures:[/BlackRock Asset Management Canada Limited/i,/www\.blackrock\.com\/ca/i,/\biShares\b/i],title:/\b(iShares\s+.{5,110}?(?:ETF Portfolio|Index ETF|ETF))\b/i};
const rbc={key:'rbc',label:'RBC Global Asset Management',style:'rbc',signatures:[/RBC Global Asset Management Inc/i,/rbcgam\.com/i,/RBC CANADIAN/i],title:/^\s*(RBC\s+[^\n]{3,120}?(?:FUND|PORTFOLIO|SOLUTION\s*[–-]\s*ENHANCED(?:\s+PLUS)?))\s*$/im};
// BMO issues two independent financial-table templates: mutual funds and exchange-traded funds.
const bmo={key:'bmo',label:'BMO',style:'bmo',signatures:[/BMO (?:Asset Management|Investments) Inc\./i,/\bbmogam\.com\b/i,/\bBMO (?:Mutual Funds|Exchange Traded Funds)\b/i],title:/^\s*(BMO\s+[^\n]{4,110}?(?:Fund(?:\s+Ltd\.)?|ETF|Portfolio))\s*$/im};
// BMG bullion reports may be scanned as landscape two-page spreads with rotated PDF text.
const bmg={key:'bmg',label:'BMG Management Services Inc.',style:'bmg_rotated',
 signatures:[/\bBMG\s+(?:Management Services Inc\.|Gold|Silver|BullionFund)/i,/\bBMG\s+(?:Silver|Gold|Bullion)\s+Bullion\s*Fund\b/i,/\bbmg-group\.com\b/i],
 title:/^\s*(BMG\s+[^\n]{3,110}?Bullion\s*Fund)\s*$/im};


// ---- src/fmc/index.mjs ----
// Independent issuer signatures; adding an FMC must be performed here and in its dedicated module.


const firstTrust={key:'first_trust',label:'First Trust Canada',style:'first_trust_b3',
  signatures:[/FT Portfolios Canada Co\./i,/First Trust AlphaDEX[^\n]{0,160}ETF/i,/www\.firsttrust\.ca/i],
  title:/^\s*(First Trust\s+[^\n]{8,180}?ETF)\s*$/im};
const REGISTRY=[desjardins,sunLife,franklin,middlefield,manulife,dynamic,purpose,blackrock,rbc,nbi,bmo,bmg,firstTrust];
// Issuer-specific titles are evidence only when they occupy a full line near
// the beginning of an MRFP. This also gives newly named fund families a narrow
// fallback without weakening ratio/series parsing for any FMC.
const ISSUER_TITLE_PREFIX={
  nbi:/^NBI\s/i, desjardins:/^Desjardins\s/i, sun_life:/^Sun Life\s/i,
  franklin:/^Franklin\s/i, middlefield:/^Middlefield\s/i, first_trust:/^First Trust\s/i, manulife:/^Manulife\s/i,
  dynamic:/^Dynamic\s/i, purpose:/^Purpose\s/i, blackrock:/^iShares\s/i,
  rbc:/^RBC\s/i, bmo:/^BMO\s/i, bmg:/^BMG\s/i, td:/^TD\s/i, lysander:/^Lysander\s/i,
  nei:/^NEI\s/i, mackenzie:/^Mackenzie\s/i, ig_mackenzie:/^IG Mackenzie\s/i,
  fidelity:/^Fidelity\s/i, pender:/^Pender\s/i, brandes:/^Brandes\s/i,
  agf:/^AGF\s/i, harvest:/^Harvest\s/i, vanguard:/^Vanguard\s/i,
  ninepoint:/^Ninepoint\s/i, global_x:/^Global X\s/i, cibc:/^CIBC\s/i, hamilton:/^Hamilton\s/i, newgen:/^NewGen\s/i, rpia:/^RP\s/i, leith_wheeler:/^Leith Wheeler\s/i, ci:/^CI\s/i, scotia:/^Scotia\s/i
};
// Many issuers append an explanatory alias to the printed product title,
// e.g. 'Portfolio (the “Fund”)'. Normalize ONLY a trailing alias, never
// arbitrary report prose or securities mentioned in the holdings section.
function reportTitleLine(raw){
  return String(raw||'').trim().replace(/\s+/g,' ')
    .replace(/\s*\(\s*(?:the|this)\s+[“”"'‘’]?(?:Fund|ETF|Portfolio|Pool)[“”"'‘’]?\s*\)\s*$/i,'')
    .trim();
}
function issuerTitleCandidate(pages,profile){
  const re=profile.title&&new RegExp(profile.title.source,profile.title.flags.replace(/g/g,''));
  const prefix=ISSUER_TITLE_PREFIX[profile.key];
  const genericEnd=/(?:\bFund|\bPortfolio|\bETF|\bClass|\bPool)(?:[®™]|\.)?$/i;
  for(const pg of pages.slice(0,3)){
    for(const raw of String(pg.text||'').split(/\r?\n/).slice(0,100)){
      const line=reportTitleLine(raw);
      if(line.length<12||line.length>190)continue;
      const m=re&&re.exec(line);
      if(m&&m[1]&&m[0].trim().length===line.length&&m[1].trim().length>=12)
        return {text:m[1].trim(),kind:'profile'};
      // The generic path insists on a complete branded product title, never
      // arbitrary mention of an issuer or a generic manager address.
      if(prefix?.test(line)&&genericEnd.test(line)&&!/(?:management\s+report|fund\s+performance|fund\s+facts|(?:the|this)\s+fund)/i.test(line))
        return {text:line,kind:'branded-title'};
    }
  }
  return null;
}
function detectFmc(pages){
  const head=pages.slice(0,3).map(p=>p.text).join('\n');
  const scores=REGISTRY.map(p=>({profile:p,signatureScore:p.signatures.reduce((s,x,i)=>s+(x.test(head)?(i?2:5):0),0)}));
  const strongOwners=scores.filter(s=>s.signatureScore>=5);
  const sorted=scores.map(({profile,signatureScore})=>{
    // A standalone issuer-branded product title is strong supporting evidence.
    // If a different manager is already strongly identified, don't let a
    // fund mentioned in its portfolio falsely take ownership of the report.
    const hasTitle=Boolean(issuerTitleCandidate(pages,profile));
    const titleScore=hasTitle&&(signatureScore>0||!strongOwners.some(x=>x.profile.key!==profile.key))?5:0;
    return {profile,score:signatureScore+titleScore};
  }).sort((a,b)=>b.score-a.score);
  return sorted[0].score>=5 && sorted[0].score!==sorted[1]?.score ? sorted[0].profile : null;
}


// ---- src/shared/period.mjs ----
const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function reportDate(pages){
 const head=pages.slice(0,9).map(p=>p.text).join('\n').slice(0,40000);
 const re=/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(20\d\d)\b/gi;
 const rows=head.split(/\r?\n/);
 for(const preference of [/(?:period|year)\s+ended|as\s+at|as\s+of|for\s+the\s+(?:financial\s+)?period/i,/(?:202[0-9]\s+interim\s+report|report\s+of\s+fund)/i,/.*/]){
  for(const line of rows){if(!preference.test(line))continue;const matches=[...line.matchAll(re)];if(matches.length){const m=matches[0];return `${m[3]}-${String(months[m[1].slice(0,3).toLowerCase()]).padStart(2,'0')}-${m[2].padStart(2,'0')}`;}}
 }
 const m=/(?:June|December|April|September)\s+\d{1,2},?\s+20\d{2}/i.exec(head);if(m)return reportDate([{text:m[0]}]);return null;
}
const ratioMetric=(line)=>/management\s+expense\s+ratio\b(?!\s+before)/i.test(line)?'MER':/trading\s+expense\s+ratio\b/i.test(line)?'TER':/portfolio\s+turnover\s+(?:rate|ratio)\b/i.test(line)?'PTR':null;
function toNumber(token){if(token==null)return null;const s=String(token).trim().replace(/[,％%]/g,'').replace(/[\u200b\u00ad]/g,'').replace(/\([a-z0-9]{1,3}\)$/i,'').replace(/\*+$/,'');if(/^[—–-]+$/.test(s)||!s)return null;let n=Number(s);return Number.isFinite(n)?n:null;}
function metricValues(line){
 const label=/management\s+expense\s+ratio\b(?!\s+before)|trading\s+expense\s+ratio\b|portfolio\s+turnover\s+(?:rate|ratio)\b/i.exec(line);if(!label)return null;
 const metric=ratioMetric(label[0]);if(/\bmanagement\s+expense\s+ratio\s+before\b/i.test(line)||/\bFER\b/i.test(line))return null;
 // Look after metric label; skip footnote markers and (%) units, but don't pick monetary totals from elsewhere.
 let tail=line.slice(label.index+label[0].length).replace(/^\s*(?:\([^)]{1,10}\)\s*){0,3}/,'');
 const values=(tail.match(/(?:^|\s)(?:\(?-?\d[\d,]*(?:\.\d+)?\)?%?(?:\([a-z0-9]\))?|[—–-])(?=\s|$)/gi)||[]).map(s=>s.trim());
 return {metric,values};
}


// ---- src/shared/table-stream.mjs ----


function classHeading(line,style){
 const s=line.replace(/\u00a0/g,' ').replace(/\*+/g,'').trim();let m;
 if(style==='nbi'){m=nbiClass.exec(s);return m?m[1].replace(/\s+/g,' ').trim():null;}
 if(style==='desjardins'){m=/^([A-Z][A-Z0-9]{0,3})[–-]CLASS$/i.exec(s);return m?m[1].toUpperCase()+'-Class':null;}
 if(style==='sun_life'){m=/(?:^|\s[-–]\s)(Series\s+[A-Z][A-Z0-9-]*)$/i.exec(s);return m?m[1]:null;}
 if (style === 'purpose') { m = /^(ETF Units|Class\s+[A-Z]\s*Units)(?:\s+\d+)?(?:\s*\([^)]*\))?(?=\s|$)/i.exec(s); return m ? (m[1].toLowerCase() === 'etf units' ? 'ETF Units': m[1].replace(/\s*Units$/i, '')): null;}
 if(style==='franklin'){m=/^(?:SERIES\s+([AFO])|ETF\s+SERIES)\s*\(AS AT /i.exec(s);return m?(s.toUpperCase().startsWith('ETF')?'ETF Series':'Series '+m[1]):null;}
 if(style==='middlefield'){m=/^Ratios\s+and\s+Supplemental\s+Data\s*[-–]\s*Series\s+([A-Z])/i.exec(s);return m?'Series '+m[1]:null;}
 if(style==='manulife'){m=/^(Advisor Series|Series\s+[A-Z][A-Z0-9]*)$/i.exec(s);return m?m[1]:null;}
 if(style==='dynamic'){m=/^((?:Series\s+[A-Z][A-Z0-9]*|ETF(?:H)?\s+Series)(?:\s*\(USD\))?)$/i.exec(s);return m?m[1].replace(/\s+/g,' '):null;}
 if(style==='rbc'){m=/^((?:Series\s+[A-Z][A-Z0-9]*|ETF(?:H)?\s+Series))$/i.exec(s);return m?m[1]:null;}
 return null;
}
function parseMetricLine(line,metric){
 const label=ratioMetric(line); if(label!==metric)return {seen:false,value:null};
 const firstLabel=/management\s+expense\s+ratio\b/i.exec(line);
 if(metric==='MER'&&firstLabel && /^(?:\s+before\b)/i.test(line.slice(firstLabel.index+firstLabel[0].length)))return {seen:false,value:null};
 let tail=line.slice(line.search(/management\s+expense\s+ratio|trading\s+expense\s+ratio|portfolio\s+turnover\s+(?:rate|ratio)/i)).replace(/^(?:management\s+expense\s+ratio|trading\s+expense\s+ratio|portfolio\s+turnover\s+(?:rate|ratio))\b/i,'');
 // Skip parenthesized footnotes, MER abbreviation, (%) units and integer footnotes.
 tail=tail.replace(/^\s*\(\s*[“"']?(?:MER|TER)[”"']?\s*\)/i,'');
 tail=tail.replace(/^\s*(?:(?:\(\s*%\s*\))|(?:\(\d+\))|(?:\d+\s*\(%\))|(?:\d+\s*\(\d+\))|(?:\(\d+\)\s*\(%\))|(?:\(\d+\)\s*\(\d+\))|(?:\(\d+\)\s*\d+))*\s*/,'');
 tail=tail.replace(/^\s*\d{1,2}(?=\s+\d|\s*\n|$)/,'');
 const values=tail.match(/(?:\d[\d,]*(?:\.\d+)?%?(?:\([a-z]\))?|[—–-])(?=\s|$)/gi)||[];
 return {seen:true,value:values.length?toNumber(values[0]):null};
}


// ---- src/extractor.mjs ----




const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
function identifyFund(pages,p){
  let head=pages.slice(0,5).map(x=>x.text).join('\n');
  
  if(p.key==='bmg'){
    // PDF.js can concatenate a BMG cover title with neighboring spread text;
    // the original individual PDF text item retains the real full fund title.
    const name=/^(BMG\s+(?!Fund\b)[A-Za-z0-9 &.'’-]{3,120}?\s*Bullion\s*Fund)$/i;
    for(const pg of pages.slice(0,6)){
      for(const item of pg.items||[]){const m=name.exec(clean(item.str));if(m)return m[1];}
      for(const line of String(pg.text||'').split(/\r?\n/)){
        const m=name.exec(clean(line));if(m)return m[1];
      }
    }
  }
  // Ninepoint fund-name detection.
  // Handles split cover titles and dated page headings.
  if(p.key==='ninepoint'){
    const datedTitle=/^(Ninepoint\s+.{4,130}?\bFund)(?:\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2})?$/i;

    for(const pg of pages.slice(0,3)){
      for(const raw of String(pg.text||'').split(/\r?\n/).slice(0,25)){
        const m=datedTitle.exec(reportTitleLine(raw));

        if(m)return clean(m[1]);
      }
    }

    const cover=String(pages[0]?.text||'')
      .split(/\r?\n/)
      .slice(0,15)
      .map(reportTitleLine);

    for(let i=0;i<cover.length;i++){
      if(!/^Ninepoint$/i.test(cover[i]))continue;

      for(let n=3;n<=6 && i+n<=cover.length;n++){
        const m=/^(Ninepoint\s+.{4,130}?\bFund)$/i.exec(
          clean(cover.slice(i,i+n).join(' '))
        );

        if(m)return clean(m[1]);
      }
    }
  }

  if(p.key==='rbc'){
    // Phillips, Hager & North is managed by RBC GAM. Its fund title is
    // frequently broken into 2-3 lines on the cover's RIGHT column.
    // Restrict this to the cover and an explicit PH&N issuer prefix.
    const cover=String(pages[0]?.rightText||pages[0]?.text||'').split(/\r?\n/).map(clean);
    for(let i=0;i<Math.min(cover.length,45);i++){
      if(!/^Phillips,?\s+Hager\s*&\s*North\b/i.test(cover[i]))continue;
      for(let n=0;n<=2 && i+n<cover.length;n++){
        const candidate=clean(cover.slice(i,i+n+1).join(' '));
        if(/^Phillips,?\s+Hager\s*&\s*North\s+[A-Za-z0-9 &',.()-]+\s+(?:Fund|ETF|Portfolio)$/i.test(candidate))return candidate;
      }
    }
  }
  if(p.key==='bmo'){
    // Only standalone BMO product titles, never ETFs mentioned as holdings.
    // BMO uses Fund, Fund Ltd., ETF and Portfolio naming families.
    for(const page of pages.slice(0,4)){
      for(const raw of page.text.split(/\r?\n/)){
        const line=reportTitleLine(raw);
        const match=/^\s*(BMO(?:\s+[A-Za-z0-9][A-Za-z0-9.&'’/-]*){1,14}\s+(?:Fund(?:\s+Ltd\.)?|ETF|Portfolio))\s*$/i.exec(line);
        if(match)return clean(match[1]);
      }
    }
  }
  if(['td','lysander','nei','mackenzie','ig_mackenzie','fidelity','pender','brandes','agf','harvest'].includes(p.key)){
    for(const line of pages.slice(0,3).flatMap(pg=>pg.text.split(/\r?\n/))){
      const m=p.title&&new RegExp(p.title.source,p.title.flags).exec(line);
      if(m)return clean(m[1]);
    }
  }
  if(p.key==='ig_mackenzie'){
    for(const pg of pages.slice(0,2))for(const raw of pg.text.split(/\r?\n/)){
      const line=raw.trim().replace(/\s+/g,' ');
      if(/^IG\s+(?:Core\s+)?Portfolio\s*[–-]\s*[A-Za-z ]{3,70}$/i.test(line))return line;
    }
  }
  if(p.key==='vanguard'){
    const lines=pages.slice(0,2).flatMap(pg=>pg.text.split(/\r?\n/));
    for(let i=0;i<lines.length;i++){
      let line=lines[i].trim();if(!/^Vanguard\s+FTSE\b/i.test(line))continue;
      if(!/\bETF\b/i.test(line))line+=' '+(lines[i+1]||'').trim();
      const found=/(Vanguard\s+[^\n]{5,160}?ETF(?:\s*\(CAD-hedged\))?)/i.exec(line);
      if(found)return clean(found[1]);
    }
  }
  if(p.key==='global_x'){
    for(const pg of pages.slice(0,9))for(const raw of pg.text.split(/\r?\n/)){
      const line=raw.replace(/[\u00a0\u202f]/g,' ').replace(/\s+/g,' ').trim();
      const m=/^(Global\s*X\s+[^\n]{8,160}?ETF)\s*$/i.exec(line);
      if(m)return clean(m[1]).replace(/^Global\s*X/i,'Global X');
    }
  }
  if(p.key==='blackrock'){
    for(const pg of pages.slice(0,5))for(const raw of pg.text.split(/\r?\n/)){
      const line=raw.trim();
      if(/^iShares[A-Za-z0-9-]{12,130}ETF$/.test(line)){
        return line.replace(/^iShares/,'iShares ').replace(/(\d)([A-Za-z])/g,'$1 $2')
          .replace(/([A-Z]{2,})([A-Z][a-z])/g,'$1 $2')
          .replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^i Shares\s+/i,'iShares ').replace(/\s+/g,' ').trim();
      }
    }
    let match=head.match(/(?:for the|for an?)\s+(iShares\s+[^\n]{5,130}?(?:ETF Portfolio|Index ETF|ETF))\s*(?:\(|for\s+the)/i);
    if(!match)match=head.match(/\b(iShares\s+[^\n]{5,130}?(?:ETF Portfolio|Index ETF|ETF))\b/i);
    return clean(match?.[1]||'').replace(/ETFPortfolio/g,'ETF Portfolio').replace(/1-5Year/g,'1-5 Year');
  }
  if(p.key==='middlefield'){
    const m=head.match(/\b(MIDDLEFIELD\s+(?:GLOBAL\s+)?(?:[A-Z]+\s+){0,6}FUND)\b/i);
    if(m)return clean(m[1]).toUpperCase();
    // Middlefield covers often print the official name across 3-4 lines.
    // Only inspect the actual cover, not fund mentions in annual-report prose.
    const cover=String(pages[0]?.text||'').split(/\r?\n/).map(clean);
    for(let i=0;i<Math.min(cover.length,18);i++){
      if(!/^MIDDLEFIELD$/i.test(cover[i]))continue;
      for(let n=1;n<=5;n++){
        const candidate=clean(cover.slice(i,i+n+1).join(' '));
        if(/^MIDDLEFIELD\s+[A-Z0-9 .&'-]{5,120}\s+(?:FUND|CLASS|ETF)$/i.test(candidate))return candidate.toUpperCase();
      }
    }
  }
  if(p.key==='first_trust'){
    for(const pg of pages.slice(0,4))for(const raw of String(pg.text||'').split(/\r?\n/)){
      const line=raw.replace(/^[\s®™]+/,'').replace(/\s+/g,' ').trim();
      const m=/^(First Trust\s+.{8,170}?ETF)(?:\s*[•(]|$)/i.exec(line);
      if(m)return clean(m[1]);
    }
  }
  if(p.key==='purpose'){
    for(const line of head.split(/\r?\n/)){const m=/^\s*(PURPOSE[ \t]+(?:[A-Z]+[ \t]+){1,10}FUND)[ \t]*$/.exec(line);if(m)return clean(m[1]);}
  }
  // Prefer a full-line title; never concatenate preceding sector/category labels.
  const titleRe=p.title?new RegExp(p.title.source, p.title.flags.includes('g')?p.title.flags:p.title.flags+'g'):/(?!)/g;
  const matches=head.split(/\r?\n/).flatMap(line=>[...line.matchAll(titleRe)].map(m=>clean(m[1]))).filter(s=>s.length>7);
  matches.sort((a,b)=>b.length-a.length);
  if(matches[0])return matches[0];
  if(p.key==='nbi'){
    const names=[...head.matchAll(/\b(NBI\s+[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,5}\s+(?:Fund|Portfolio|Class))\b/g)].map(x=>x[1]);
    names.sort((a,b)=>a.length-b.length);
    if(names.length)return clean(names[0]);
  }
  // For a known issuer with an unfamiliar new product naming convention,
  // use the branded full-line title instead of reporting an Unknown Fund.
  return issuerTitleCandidate(pages,p)?.text||'Unknown Fund';
}
function makeRow(cls,p,fund,date,vals,ev,needsReview=false){
 const year=date?Number(date.slice(0,4)):null;
 const fid=createHash('sha256').update(p.key+'\0'+fund.toLowerCase()).digest('hex').slice(0,20);
 const cid=createHash('sha256').update(fid+'\0'+cls.toLowerCase()).digest('hex').slice(0,20);
 return {class_name:cls,fund_name:fund,fmc:p.label,fmc_key:p.key,fund_id:fid,class_id:cid,row_id:cid+':'+(date||year||'unknown'),report_date:date,year,MER:vals.MER??null,TER:vals.TER??null,PTR:vals.PTR??null,evidence:ev,needs_review:needsReview||!date};
}
function findMetric(block,metric){
 const lines=block.split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
   const t=lines[i].replace(/\u00a0/g,' ');
   const m=parseMetricLine(t,metric);
   if(m.seen){
      if(m.value!==null || /[—–-]\s*$/.test(t))return {found:true,value:m.value};
      const continuation=parseMetricLine(lines.slice(i,i+7).join(' '),metric);
      return {found:true,value:continuation.value};
   }
   // Labels with line breaks like "Management expense" + "ratio (%)"
   if(/\b(?:management|trading)\s+expense\s*$|\bportfolio\s+turnover\s*$/i.test(t)){
     const merged=parseMetricLine(lines.slice(i,i+8).join(' '),metric);
     if(merged.seen)return {found:true,value:merged.value};
   }
 }
 return {found:false,value:null};
}
function tableBlocks(pages,p,opts={}){
 const rows=[];const styles=p.style; let ratioSeen=false;
 for(const page of pages){
   let variants=['sun_life','purpose'].includes(p.key)?[page.leftText||page.text,page.rightText||page.text]:[page.text];
   if(styles==='manulife'){if(/Ratios?\s+and\s+Supplemental\s+Data/i.test(page.text))ratioSeen=true;if(!ratioSeen)continue; if(/Past Performance/i.test(page.text))variants=[page.text.split(/Past Performance/i)[0]];}
   for(let text of variants){
     if(['purpose','middlefield'].includes(styles)){const q=text.search(/Ratios?\s+and\s+Supplemental\s+Data/i);if(q<0)continue;text=text.slice(q);}
     if(styles==='manulife'){const q=text.search(/Ratios?\s+and\s+Supplemental\s+Data/i);if(q>=0)text=text.slice(q);}
     const lines=text.split(/\r?\n/);const headings=[];
     for(let i=0;i<lines.length;i++){const cls=classHeading(lines[i],styles);if(cls)headings.push({cls,index:i});}
     for(let i=0;i<headings.length;i++){
       const h=headings[i];let block=lines.slice(h.index,headings[i+1]?.index??lines.length).join('\n');
       if(styles==='desjardins'){
         const prev=lines.slice(Math.max(0,h.index-6),h.index).join('\n');
         if(!/Ratios?\s+and\s+Supplemental\s+Data/i.test(prev))continue;
       }else if(!opts.allowWithoutRatio && !/Ratios?\s+and\s+Supplemental\s+Data/i.test(block) && !(styles==='sun_life'&&/Management\s+expense/i.test(block)))continue;
       if(styles==='nbi' && !/Ratios?\s+and\s+Supplemental\s+Data/i.test(block))continue;
       const vals={MER:null,TER:null,PTR:null},ev={};let count=0;
       // Isolate financial ratio section whenever it exists, avoiding older financial tables.
       const ratioIndex=block.search(/Ratios?\s+and\s+Supplemental\s+Data/i);
       if(ratioIndex>=0 && !['desjardins','purpose'].includes(styles)) block=block.slice(ratioIndex);
       for(const metric of ['MER','TER','PTR']){
         const r=findMetric(block,metric);
         if(r.found){count++;vals[metric]=r.value;if(r.value!==null)ev[metric]={page:page.page,source:metric+' (ratio table)',method:'native-js',date_source:'report-header'};}
       }
       if(count<2)continue;
       rows.push({cls:h.cls,values:vals,evidence:ev,page:page.page,quality:count});
     }
   }
 }
 return rows;
}

// Sun Life two-column position-based supplement; only for pages with PDF text items.


function parseSunLifePositioned(pages) {
  const out = new Map();
  const normalized = s => String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const reportYear = reportDate(pages)?.slice(0, 4);
  if (!reportYear) return [];

  const metrics = {
    MER: {
      start: /^management\s+expense(?:\s+ratio)?\b/i,
      finish: /\bratio\s*\(\s*%\s*\)/i
    },
    TER: {
      start: /^trading\s+expense(?:\s+ratio)?\b/i,
      finish: /\bratio\s*\(\s*%\s*\)/i
    },
    PTR: {
      start: /^portfolio\s+turnover(?:\s+rate)?\b/i,
      finish: /\brate\s*\(\s*%\s*\)/i
    }
  };

  function readMetric(lines, metric) {
    const rule = metrics[metric];

    for (let i = 0; i < lines.length; i++) {
      if (!rule.start.test(lines[i])) continue;

      if (metric === 'MER' &&
          /\b(?:before|waivers?|absorption)\b/i.test(lines[i])) {
        continue;
      }

      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        const line = lines[j];

        if (j > i &&
            /^(?:management\s+expense|trading\s+expense|portfolio\s+turnover|net\s+asset\s+value)/i.test(line)) {
          break;
        }

        if (!rule.finish.test(line)) continue;
        if (/\b(?:before|waivers?|absorption)\b/i.test(line)) break;

        const tail = line.slice(
          line.search(rule.finish) + line.match(rule.finish)[0].length
        ).replace(
          /^\s*(?:\(\s*\d+\s*\)|[¹²³⁴⁵⁶⁷⁸⁹])+/,
          ''
        ).trim();

        const found =
          /^([—–−-]|\d+(?:\.\d+)?|\.\d+)(?=\s|%|$)/.exec(tail);

        if (found) {
          return {
            seen: true,
            value: toNumber(found[1])
          };
        }
      }
    }

    return { seen: false, value: null };
  }

  for (const page of pages) {
    
    // Rebuild Sun Life right column using actual PDF.js positions.
    // Exclude left-column values that leak into rightText.
    let cleanRight = page.rightText;

    if (Array.isArray(page.items) &&
        page.items.length &&
        Number.isFinite(page.width)) {

      const filtered = page.items.filter(t =>
        typeof t.str === 'string' &&
        t.str.trim() &&
        Number.isFinite(t.x) &&
        Number.isFinite(t.y) &&
        t.x >= page.width / 2 + 20
      );

      const groups = [];

      for (const t of filtered) {
        let g = groups.find(r =>
          Math.abs(r.y - t.y) <
          Math.max(2, Math.min(3, (t.h || 7) * 0.28))
        );

        if (!g) {
          g = { y: t.y, items: [] };
          groups.push(g);
        }

        g.items.push(t);
      }

      groups.sort((a, b) => b.y - a.y);

      cleanRight = groups.map(g => {
        const sorted = g.items.sort((a, b) => a.x - b.x);
        let text = '';
        let end = 0;

        for (const part of sorted) {
          const gap = part.x - end;

          if (text &&
              gap > Math.max(1.5, (part.h || 7) * 0.20)) {
            text += ' '.repeat(
              Math.max(1, Math.min(12,
                Math.round(
                  gap / Math.max(3, (part.h || 7) * 0.32)
                )
              ))
            );
          }

          text += part.str;
          end = Math.max(end, part.x + (part.w || 0));
        }

        return text.trimEnd();
      }).join('\n');
    }

    const cols = [page.leftText, cleanRight]
      .filter(t => typeof t === 'string' && t.trim());

    for (const col of cols) {
      const lines = col.split(/\r?\n/).map(normalized);
      const heads = [];

      for (let i = 0; i < lines.length; i++) {
        const m =
          /^sun\s+life\s+.+?\s*[-–]\s*series\s+([a-z][a-z0-9-]*)\s*$/i
          .exec(lines[i]);

        if (m) {
          heads.push({
            index: i,
            cls: 'Series ' + m[1].toUpperCase()
          });
        }
      }

      for (let i = 0; i < heads.length; i++) {
        const h = heads[i];
        const block = lines.slice(
          h.index + 1,
          heads[i + 1]?.index ?? lines.length
        );

        const yearLine = block.slice(0, 8)
          .find(t => /\b20\d{2}\b/.test(t));

        if (!yearLine ||
            (yearLine.match(/20\d{2}/g) || [])[0] !== reportYear) {
          continue;
        }

        const values = {};
        const evidence = {};
        let count = 0;

        for (const metric of ['MER', 'TER', 'PTR']) {
          const result = readMetric(block, metric);
          values[metric] = result.value;

          if (result.seen) {
            count++;
            evidence[metric] = {
              page: page.page,
              source: metric + ' (Sun Life current-period ratio table)',
              method: 'native-pdfjs'
            };
          }
        }

        if (count !== 3) continue;

        out.set(h.cls.toLowerCase(), {
          cls: h.cls,
          values,
          evidence,
          page: page.page,
          quality: count
        });
      }
    }
  }

  return [...out.values()];
}

function simpleTable(pages,p){
 // In a class-sliced ratio table, figures for the newest reporting year appear first.
 const blocks=tableBlocks(pages,p);
 const byClass=new Map();
 for(const b of blocks){const prev=byClass.get(b.cls);if(!prev || b.quality>prev.quality)byClass.set(b.cls,b);}
 return [...byClass.values()];
}
function middlefieldTable(pages){
 const parsed=[];for(const page of pages){const lines=page.text.split(/\r?\n/);for(let i=0;i<lines.length;i++){if(!/Ratios?\s+and\s+Supplemental\s+Data\s*[-–]/i.test(lines[i]))continue;const cls=/Series\s+([AF])\b/i.exec(lines[i]+' '+(lines[i+1]||''));if(!cls)continue;let end=i+100;for(let j=i+1;j<Math.min(i+100,lines.length);j++){if(/Ratios?\s+and\s+Supplemental\s+Data\s*[-–]/i.test(lines[j])){end=j;break;}}const block=lines.slice(i+1,end).join('\n');const raw={};const ev={};let n=0;for(const key of ['MER','TER','PTR']){const m=findMetric(block,key);if(m.found){n++;raw[key]=m.value;if(m.value!==null)ev[key]={page:page.page,source:key+' (ratio table)',method:'native-js'};}}if(n>=2)parsed.push({cls:'Series '+cls[1],values:raw,evidence:ev,quality:n});}}return parsed;
}
// Batch 3 extension: Middlefield mutual-class and single ETF report layouts.
// The original middlefieldTable() remains the primary parser; this supplements
// only missing sections, never overrides an existing verified series row.
function middlefieldReportDate(pages){
 // Cover art states only the report year. The repeated official report
 // heading on later pages carries the exact six-month/year end date.
 const pattern=/\bFOR\s+THE\s+(?:SIX\s+MONTHS|YEAR)\s+ENDED\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/i;
 for(const pg of pages.slice(0,12)){
  const m=pattern.exec(String(pg.text||''));if(!m)continue;
  const month=months[m[1].slice(0,3).toLowerCase()];
  return `${m[3]}-${String(month).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
 }
 return reportDate(pages);
}
function middlefieldFallback(pages,fund,date){
 const out=new Map();if(!date)return [];
 const year=date.slice(0,4);
 const percent=/([—–−-]|\d+(?:\.\d+)?|\.\d+)\s*%/;
 function readMetric(lines,metric){
  const re=metric==='MER'?/^\s*Management\s+Expense\s+Ratio\b(?!\s+before)/i:
    metric==='TER'?/^\s*Trading\s+Expense\s+Ratio\b/i:/^\s*Portfolio\s+Turnover\s+(?:Rate|Ratio)\b/i;
  for(let i=0;i<lines.length;i++){
   if(!re.test(lines[i]))continue;
   for(let j=i;j<Math.min(i+5,lines.length);j++){
    // Do not borrow a number from a different metric or the next table.
    if(j>i && /^(?:\s*(?:Management|Trading)\s+Expense\s+Ratio|\s*Portfolio\s+Turnover|\s*MER\s*\()/i.test(lines[j]))break;
    const m=percent.exec(lines[j]);if(m)return {seen:true,value:toNumber(m[1])};
   }
   return {seen:false,value:null};
  }
  return {seen:false,value:null};
 }
 for(const pg of pages){
  const lines=String(pg.text||'').split(/\r?\n/),headings=[];
  for(let i=0;i<lines.length;i++){
   if(!/^\s*Ratios?\s+and\s+Supplemental\s+Data\b(?!\s+are)/i.test(lines[i]))continue;
   // Require actual ratio table context, not narrative mentioning the heading.
   const follow=lines.slice(i+1,i+12).join(' ');
   if(!new RegExp('\\b'+year+'\\b').test(follow))continue;
   const joined=lines.slice(i,i+4).join(' ');
   const series=/\b(Series\s+[A-Z][A-Z0-9]*)\b/i.exec(joined);
   if(!series && !/\bETF\b/i.test(fund))continue;
   headings.push({idx:i,cls:series?clean(series[1]):'ETF Units'});
  }
  for(let j=0;j<headings.length;j++){
   const h=headings[j];const end=headings[j+1]?.idx??lines.length;
   const block=lines.slice(h.idx,end);
   const vals={},evidence={};let quality=0;
   for(const metric of ['MER','TER','PTR']){
    const r=readMetric(block,metric);vals[metric]=r.value;
    if(r.seen){quality++;evidence[metric]={page:pg.page,source:metric+' (Middlefield current-period ratio table)',method:'native-js'};}
   }
   if(quality>=2&&!out.has(h.cls))out.set(h.cls,{cls:h.cls,values:vals,evidence,quality});
  }
 }
 return [...out.values()];
}

// First Trust U.S. technology MRFP has two ticker-specific blocks on the
// same page. The first financial column is the current reported year.
function parseFirstTrust(pages){
 const date=reportDate(pages);if(!date)return [];
 const year=date.slice(0,4),out=new Map();
 const percent=/([—–−-]|\d+(?:\.\d+)?|\.\d+)\s*%/;
 for(const pg of pages){
  const text=String(pg.text||'');const ix=text.search(/Ratios?\s+and\s+Supplemental\s+Data/i);
  if(ix<0)continue;
  const lines=text.slice(ix).split(/\r?\n/),headers=[];
  for(let i=0;i<lines.length;i++){
   const m=/^\s*([A-Z]{2,7}(?:\.[A-Z])?)\s+(20\d{2})\b/i.exec(lines[i]);
   if(m&&m[2]===year)headers.push({idx:i,cls:m[1]});
  }
  for(let k=0;k<headers.length;k++){
   const h=headers[k],block=lines.slice(h.idx,headers[k+1]?.idx??lines.length);
   const vals={MER:null,TER:null,PTR:null},evidence={};let quality=0;
   for(const metric of ['MER','TER','PTR']){
    const re=metric==='MER'?/^\s*Management\s+expense\s+ratio\b/i:
     metric==='TER'?/^\s*Trading\s+expense\s+ratio\b/i:/^\s*Portfolio\s+turnover\s+rate\b/i;
    for(let i=0;i<block.length;i++){
     const m=re.exec(block[i]);if(!m)continue;
     if(metric==='MER'&&/\bbefore\s+(?:waivers|absorption)/i.test(block[i]))continue;
     const tail=block.slice(i,i+3).join(' '),numeric=percent.exec(tail);
     if(numeric){vals[metric]=toNumber(numeric[1]);quality++;evidence[metric]={page:pg.page,source:metric+' (First Trust current-period ratio table)',method:'native-js'};}
     break;
    }
   }
   if(quality>=2)out.set(h.cls,{cls:h.cls,values:vals,evidence,quality});
  }
 }
 return [...out.values()];
}

// RBC ETF financial table has no Series subheading. This is a guarded
// complement to the existing RBC mutual-fund dated-table implementation.
function parseRbcEtfFallback(pages,reportFund){
 if(!/\bETF\b/i.test(reportFund))return [];
 const date=reportDate(pages);if(!date)return [];
 const [yr,mm,dd]=date.split('-').map(Number);
 const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 for(const pg of pages){
  const text=String(pg.text||'');const ix=text.search(/Ratios?\s+and\s+Supplemental\s+Data/i);
  if(ix<0)continue;
  const block=text.slice(ix,ix+4500);
  if(!/As\s+at/i.test(block)||!/Expense\s+Ratio/i.test(block)||!/Turnover\s+Rate/i.test(block))continue;
  const rowRe=/^\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\s+(.+)$/gm;
  for(const m of block.matchAll(rowRe)){
   const month=monthNames.findIndex(x=>m[1].slice(0,3).toLowerCase()===x.toLowerCase())+1;
   if(month!==mm||Number(m[2])!==dd||Number(m[3])!==yr)continue;
   const tokens=m[4].match(/(?:n\/?a|[—–−-]|\d[\d,]*(?:\.\d+)?)/gi)||[];
   // 8 columns: unit NAV, fund NAV, outstanding units, MER, before
   // absorption MER, PTR, TER and closing price, in that order.
   if(tokens.length!==8)continue;
   return [{cls:'ETF Units',values:{MER:toNumber(tokens[3]),TER:toNumber(tokens[6]),PTR:toNumber(tokens[5])},quality:3,evidence:{}}];
  }
 }
 return [];
}

function scanSingleFund(pages,p){
 const text=pages.map(x=>x.text).join('\n');
 const vals={},ev={};let recognizedMetricLabels=0;
 for(const metric of ['MER','TER','PTR']){
   let found=false;
   for(const page of pages){const region=page.text.search(/Ratios?\s+and\s+Supplemental\s+Data/i);if(region<0)continue;
     const result=findMetric(page.text.slice(region,region+4500),metric);if(result.found){recognizedMetricLabels++;vals[metric]=result.value;if(result.value!==null)ev[metric]={page:page.page,source:metric+' (ratio table)',method:'native-js'};found=true;}if(found)break;
   }
 }
 return [{cls:null,values:vals,evidence:ev,quality:recognizedMetricLabels}];
}
function rowTable(pages,p){
 const output=[];
 for(const page of pages){let started=false,cls=null;const allLines=page.text.split(/\r?\n/);
  for(let li=0;li<allLines.length;li++){const line=allLines[li];
    if(/Ratios?\s+and\s+Supplemental\s+Data/i.test(line))started=true;
    if(!started)continue;
    const heading=classHeading(line,p.style);if(heading){cls=heading;continue;}
    if(!cls)continue;
    const m=/^\s*(?:Jun(?:e)?\.?\s+30|Dec(?:ember)?\.?\s+31)[,\s]+(20\d{2})\b/i.exec(line);
    if(!m)continue;
    const tail=line.slice(m[0].length).trim();
    let nums=tail.match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\*?|[—–-]/g)||[];
    if(nums.length<6){const lines2=allLines;for(let j=li+1;j<Math.min(li+12,lines2.length)&&nums.length<7;j++){if(/^\s*(?:Series\s|Jun|Dec)/i.test(lines2[j]))break;const bits=lines2[j].trim().match(/^(?:\d[\d,]*(?:\.\d+)?|[—–-])$/);if(bits)nums.push(bits[0]);}}
    const latest=Number(m[1]);if(latest!==Number(reportDate(pages)?.slice(0,4)))continue;
    const raw=p.key==='rbc'?{MER:nums[3],TER:nums[6],PTR:nums[5]}:{MER:nums[2],TER:nums[4],PTR:nums[5]};
    const values=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,toNumber(v)]));
    // A complete dated current-period row is still a real series even when
    // its MER, TER and PTR are all dashes (null), not numeric zero.
    if(nums.length<(p.key==='rbc'?7:6))continue;
    const evidence={};for(const [k,v] of Object.entries(values))if(v!==null)evidence[k]={page:page.page,source:k+' (dated ratio row)',method:'native-js'};
    output.push({cls,values,evidence,quality:3});
  }
 }
 return [...new Map(output.map(r=>[r.cls,r])).values()];
}
// ---- BMO-specific extraction (Mutual Funds and ETFs) ----
// Both report types use BMO issuer signatures, but their ratio tables differ:
// Mutual funds have separate sections for each class and can use two columns;
// ETFs have a single "Listed CAD Units" ratio section, sometimes on the right.
// Read the period's *first* column only, and never substitute prior-year figures.
function bmoColumns(page){
  // In the PDF.js reader, columns are reconstructed independently by position.
  // This avoids merging the left and right ratio tables on the same physical line.
  const a=[page.leftText,page.rightText].filter(x=>typeof x==='string' && x.trim());
  return a.length?a:[page.text||''];
}
function bmoMetricValue(lines,key){
  const re=key==='MER'?/^\s*Management\s+expense\s+ratio\b/i:key==='TER'?/^\s*Trading\s+expense\s+ratio\b/i:/^\s*Portfolio\s+turnover\s+(?:rate|ratio)\b/i;
  for(let i=0;i<lines.length;i++){
    const line=lines[i].replace(/\u00a0/g,' ').trim();
    const match=re.exec(line);
    if(!match)continue;
    let tail=line.slice(match[0].length).trim();
    // "Management expense ratio before waivers" is not the reported MER.
    if(key==='MER' && /^before\s+waivers\b/i.test(tail))continue;
    if(key==='MER' && !tail && /^\s*before\s+waivers\b/i.test(lines[i+1]||''))continue;
    // Footnote markers such as (2), superscripts or + precede the % column.
    tail=tail.replace(/^(?:\s*(?:\(\d+\)|[+*]|%|\(%\)))+\s*/,'').trim();
    if(!tail || /^%\s*$/.test(tail)){
      for(let j=i+1;j<Math.min(i+4,lines.length);j++){
        const next=lines[j].trim();
        if(!next || /^(?:\(\d+\)|[+*])$/.test(next))continue;
        if(/before\s+waivers/i.test(next))break;
        if(/^(?:Management|Trading|Portfolio)\s+/i.test(next))break;
        tail+=' '+next;
        if(/(?:[—–-]|\d+\.\d+)/.test(next))break;
      }
    }
    tail=tail.replace(/^(?:\s*(?:\(\d+\)|[+*]|%|\(%\)))+\s*/,'').trim();
    // Expected first value is a decimal percentage or a missing-value dash.
    // Ignore integers in footnote markers and year headers.
    const token=/^(?:%\s*)?([—–-]|\d+(?:\.\d+)?)(?=\s|$)/.exec(tail);
    if(token)return {seen:true,value:toNumber(token[1])};
    if(/^[—–-]$/.test(tail))return {seen:true,value:null};
  }
  return {seen:false,value:null};
}
function bmoCollectRatios(lines,page){
  const values={MER:null,TER:null,PTR:null},evidence={};let quality=0;
  for(const metric of ['MER','TER','PTR']){
    const res=bmoMetricValue(lines,metric);
    if(!res.seen)continue;
    quality++;values[metric]=res.value;
    if(res.value!==null)evidence[metric]={page,source:metric+' (BMO ratio table)',method:'native-js',date_source:'report-header'};
  }
  return {values,evidence,quality};
}
function bmoMutualRows(pages){
  const results=new Map();
  const heading=/^\s*(Advisor\s+Series|Active\s+ETF\s+Series|Series\s+[A-Z][A-Z0-9-]*|Classic\s+Series)\s+(Units|Shares)(?:\s*\(\d+\))?\s*$/i;
  for(const page of pages){
    // BMO mutual ratio tables place some series in the left column, others on
    // the right; the "Ratios and Supplemental Data" title may be on only one.
    for(const col of bmoColumns(page)){
      const lines=col.split(/\r?\n/);let curr=null;
      const sections=[];
      for(let i=0;i<lines.length;i++){
        const m=heading.exec(lines[i].replace(/\u00a0/g,' ').trim());
        if(!m)continue;
        if(curr)curr.end=i;
        curr={cls:m[1].replace(/\s+/g,' ').trim()+' '+m[2],start:i,end:lines.length};
        sections.push(curr);
      }
      for(const sec of sections){
        const sliced=lines.slice(sec.start,sec.end);
        const r=bmoCollectRatios(sliced,page.page);
        if(r.quality<3)continue;
        // Inclusion rule: every explicitly reported series in the current
        // Ratios and Supplemental Data section gets a row, even when its
        // current-year financial values (and total assets) are all dashes.
        // A dash is null, while a reported 0.00 is numeric zero; never
        // substitute a previous-year value to fill a missing latest year.
        // r.quality counts recognized metric labels, not non-null values.
        const old=results.get(sec.cls);
        if(!old||r.quality>old.quality)results.set(sec.cls,{cls:sec.cls,...r});
      }
    }
  }
  return [...results.values()];
}
function bmoEtfRows(pages){
  for(const page of pages){
    for(const col of bmoColumns(page)){
      const start=col.search(/Ratios?\s+and\s+Supplemental\s+Data/i);
      if(start<0)continue;
      let section=col.slice(start);
      const stop=section.slice(25).search(/\b(?:Management Fees|Past Performance|Summary of Investment Portfolio)\b/i);
      if(stop>=0)section=section.slice(0,25+stop);
      if(!/Listed\s+(?:CAD|USD)\s+Units/i.test(section))continue;
      const r=bmoCollectRatios(section.split(/\r?\n/),page.page);
      if(r.quality===3)return [{cls:(section.match(/Listed\s+(?:CAD|USD)\s+Units/i)||['Listed CAD Units'])[0].replace(/\s+/g,' '),...r}];
    }
  }
  return [];
}
// Reusable routing strategy for issuers with multiple report layouts:
// first validate the actual financial-ratio sections, then use the standalone
// cover-title type ONLY as a tie-breaker. ETF names mentioned in holdings,
// management discussion, or sub-fund allocations are not layout evidence.
function chooseTemplateByFinancialEvidence(candidates,preferredKind){
  const usable=candidates.filter(x=>x.rows.length>0);
  if(usable.length===1)return usable[0].rows;
  if(!usable.length)return [];
  const preferred=usable.find(x=>x.kind===preferredKind);
  if(preferred)return preferred.rows;
  usable.sort((a,b)=>{
    const quality=x=>x.rows.reduce((n,r)=>n+(r.quality||0),0);
    return quality(b)-quality(a)||b.rows.length-a.rows.length;
  });
  return usable[0].rows;
}
function bmoTable(pages){
  const cover=issuerTitleCandidate(pages.slice(0,2),bmo)?.text || '';
  const preferredKind=/\bETF\b/i.test(cover)?'etf':/\b(?:Fund|Portfolio)\b/i.test(cover)?'mutual':null;
  return chooseTemplateByFinancialEvidence([
    {kind:'mutual',rows:bmoMutualRows(pages)},
    {kind:'etf',rows:bmoEtfRows(pages)}
  ],preferredKind);
}

// ------- Additional FMC financial-table templates (unseen PDF batch) -------
const NEW_FMCS=[
 {key:'td',label:'TD Asset Management',style:'td',signatures:[/TD (?:Mutual Funds|Exchange-Traded Funds)/i,/TD Asset Management Inc\./i],title:/^\s*(TD\s+[^\n]{3,130}?(?:Fund|ETF))(?:\s*\([A-Z0-9.]+\))?\s*$/im},
 {key:'lysander',label:'Lysander Funds',style:'lysander',signatures:[/Lysander-Canso\s+U\.S\.\s+Corporate/i,/Lysander Funds Limited/i],title:/^\s*(Lysander-Canso\s+[^\n]+?Fund)\s*$/im},
 {key:'nei',label:'NEI Investments',style:'nei',signatures:[/NEI Global Total Return Bond Fund/i,/Northwest\s*&\s*Ethical Investments/i],title:/^\s*(NEI\s+[^\n]+?Fund)\s*$/im},
 {key:'mackenzie',label:'Mackenzie Investments',style:'mackenzie_new',signatures:[/MACKENZIE PRECIOUS METALS FUND/i,/Mackenzie Financial Corporation/i],title:/^\s*(MACKENZIE\s+[^\n]+?FUND)\s*$/im},
 {key:'ig_mackenzie',label:'IG Wealth Management',style:'mackenzie_new',signatures:[/IG MACKENZIE (?:GLOBAL|[^\n]+) (?:FUND|OF CANADA)/i,/I\.G\. Investment Management/i],title:/^\s*(IG\s+MACKENZIE\s+[^\n]+?(?:FUND|OF CANADA))\s*$/im},
 {key:'fidelity',label:'Fidelity Investments',style:'fidelity_new',signatures:[/Fidelity Investments Canada ULC|Fidelity Management & Research Canada ULC/i,/Fidelity Investments/i],title:/^\s*(Fidelity\s+[^\n]{4,180}?(?:Fund|ETF|Portfolio|Class)(?:\s+of\s+the\s+Fidelity\s+Capital\s+Structure\s+Corp\.?)?)[®™]?\s*$/im},
 {key:'pender',label:'PenderFund Capital Management',style:'pender_new',signatures:[/Pender Corporate Bond Fund/i,/PenderFund Capital Management/i],title:/^\s*(Pender\s+[^\n]+?Fund)\s*$/im},
 {key:'brandes',label:'Bridgehouse / Brandes',style:'brandes_new',signatures:[/Brandes (?:International|Global Small Cap|Emerging Markets).*Fund/i,/Bridgehouse Asset Managers/i],title:/^\s*(Brandes\s+[^\n]+?Fund)\s*$/im},
 {key:'agf',label:'AGF Investments',style:'agf_new',signatures:[/AGF (?:Global Convertible Bond Fund|European Equity Class)/i,/AGF Investments Inc\./i],title:/^\s*(AGF\s+[^\n]+?(?:Fund|Class))\s*$/im},
 {key:'harvest',label:'Harvest ETFs',style:'harvest_new',signatures:[/Harvest Healthcare Leaders Income ETF/i,/Harvest Portfolios Group Inc\./i],title:/^\s*(Harvest\s+[^\n]+?ETF)\s*$/im}
];
const V2_FMCS=[
 {key:'vanguard',label:'Vanguard Investments Canada',style:'vanguard_new',signatures:[/Vanguard Investments Canada Inc/i,/Vanguard FTSE Canadian/i],title:/^\s*(Vanguard[^\n]{5,150}?ETF)\s*$/im},
 {key:'ninepoint',label:'Ninepoint Partners',style:'ninepoint_new',signatures:[/Ninepoint Partners LP/i,/Ninepoint Silver Bullion Fund/i],title:/^\s*(Ninepoint[^\n]{5,140}?Fund)\s*$/im},
 {key:'global_x',label:'Global X Investments Canada',style:'globalx_new',signatures:[/GLOBAL X INVESTMENTS CANADA INC/i,/Global X Canadian Oil and Gas/i],title:/^\s*(Global X[^\n]{5,180}?ETF)\s*$/im}
];
const V22_FMCS=[
 {key:'cibc',label:'CIBC Asset Management',style:'cibc_v22',signatures:[/CIBC Core Fixed Income Pool/i,/CIBC Asset Management Inc\./i],title:/^\s*(CIBC\s+[^\n]{3,140}?(?:Pool|Fund|ETF))\s*$/im},
 {key:'hamilton',label:'Hamilton ETFs',style:'hamilton_v22',signatures:[/Hamilton Capital Partners Inc\./i,/hamiltonetfs\.com/i],title:/^\s*(Hamilton\s+[^\n]{4,140}?ETF)\s*$/im},
 {key:'newgen',label:'NewGen Asset Management',style:'newgen_v22',signatures:[/NewGen Asset Management Limited/i,/newgenfunds\.com/i],title:/^\s*(NewGen\s+[^\n]{4,140}?Fund)\s*$/im},
 {key:'rpia',label:'RP Investment Advisors',style:'rpia_v22',signatures:[/RP Investment Advisors LP/i,/\brpia\.ca\b/i],title:/^\s*(RP\s+[^\n]{4,150}?Fund)\s*$/im},
 {key:'leith_wheeler',label:'Leith Wheeler',style:'leith_v22',signatures:[/Leith Wheeler Investment Counsel Ltd\./i,/leithwheeler\.com/i],title:/^\s*(Leith Wheeler\s+[^\n]{4,140}?Fund)\s*$/im}
];
const B2_ISSUERS=[
 {key:'ci',label:'CI Global Asset Management',style:'ci_b2',signatures:[/CI Investments Inc\./i,/www\.ci\.com/i],title:/^\s*(CI\s+[^\n]{4,150}?Fund)\s*$/im},
 {key:'scotia',label:'ScotiaFunds / 1832 Asset Management',style:'scotia_b2',signatures:[/www\.scotiafunds\.com/i,/Scotia\s+U\.S\.\s*\$\s*Balanced Fund/i],title:/^\s*(Scotia\s+[^\n]{5,150}?Fund)\s*$/im}
];
REGISTRY.push(...NEW_FMCS,...V2_FMCS,...V22_FMCS,...B2_ISSUERS);
const EXTRA_STYLES=new Set([...NEW_FMCS,...V2_FMCS,...V22_FMCS,...B2_ISSUERS].map(p=>p.style));
function normalizeExtraText(s){return String(s||'').replace(/\u00a0/g,' ').replace(/\u00ad/g,'').replace(/[ﬁﬂ]/g,c=>c==='ﬁ'?'fi':'fl');}
function firstRatioValue(t){
  t=normalizeExtraText(t).replace(/^[\s+*%():0-9,]*?(?=(?:\d+\.\d+|\.\d+|n\/?a|[—–−-]))/i,'').trim();
  // All reported percentage ratios in supported sample tables contain a decimal.
  // Avoid selecting numeric footnote identifiers preceding the first ratio.
  const m=/(?:^|\s)(n\/?a|[—–−-]|\d+\.\d+|\.\d+)(?=\s|%|$)/i.exec(t);
  return m?toNumber(m[1]):null;
}
function extraRatios(section){
 const lines=normalizeExtraText(section).split(/\r?\n/);let v={MER:null,TER:null,PTR:null},quality=0;
 for(const metric of ['MER','TER','PTR']){
  let match=null;
  for(let i=0;i<lines.length;i++){
   let s=lines[i].trim();
   const r=metric==='MER'?/^(?:Management\s+expense\s+ratio|Management\s+expense\s+ratios?)\b/i:metric==='TER'?/^Trading\s+expense\s+ratio\b/i:/^Portfolio\s+turnover\s+(?:rate|rates|ratio)\b/i;
   const a=r.exec(s);if(!a)continue;
   if(metric==='MER'&&/\bbefore\b/i.test(s))continue;
   const tail=s.slice(a[0].length).replace(/^[⁰¹²³⁴⁵⁶⁷⁸⁹]+/,'').trim();
   const tok=/(?:^|\s)(N\/A|n\/a|[—–−-]|\d+\.\d+|\.\d+)(?=\s|%|$)/i.exec(tail);
   // A blank metric label is allowed as long as the ratio isn't from a footnote.
   if(tok){match=toNumber(tok[1]);quality++;break;}
   if(/^\s*(?:\-\-|n\/a|[—–−-])\s*$/.test(tail)){match=null;quality++;break;}
   // Some labels and values split across PDF text lines.
   if(i+1<lines.length && !/^\s*(?:Management|Trading|Portfolio)/i.test(lines[i+1])){
    const cont=/(?:^|\s)(N\/A|n\/a|[—–−-]|\d+\.\d+|\.\d+)(?=\s|%|$)/i.exec(lines[i+1]);
    if(cont){match=toNumber(cont[1]);quality++;break;}
   }
  }
  v[metric]=match;
 }
 return {values:v,quality,evidence:{}};
}
function tdHeading(line){
 const m=/^\s*((?:(?:Investor|Advisor|Institutional|Private|Premium(?:\s+F)?|F|O|D|H\d*|FT\d*|T\d*)\s*[- ]?\s*Series)|(?:TUSB(?:\.U)?\s*\((?:C|US)\$\)))\s*$/i.exec(normalizeExtraText(line).trim());
 return m?m[1].replace(/\s+/g,' ').replace(/\s*[- ]?\s*Series$/i,' Series').replace(/^([A-Z0-9]+)\s+Series$/,(m,p)=>p.toUpperCase()==='F'?'F-Series':m):null;
}
function parseClassColumns(pages, opts){
 const out=new Map();
 for(const pg of pages){
  const candidates=opts.splitColumns?[pg.leftText,pg.rightText]:[pg.text];
  for(const txt of candidates){
   if(!txt)continue;
   const lines=normalizeExtraText(txt).split(/\r?\n/),heads=[];
   for(let i=0;i<lines.length;i++){
    const cls=opts.heading(lines[i],pg,i,lines);
    if(cls)heads.push({idx:i,cls});
   }
   for(let j=0;j<heads.length;j++){
    const h=heads[j],last=heads[j+1]?.idx??lines.length;
    let text=lines.slice(h.idx,last).join('\n');
    if(opts.requireRatioHeading && !/Ratios?\s+and\s+Supplemental\s+Data|Ratios\/Supplemental\s+Data/i.test(txt))continue;
    // Limit to the Ratio section if financial highlights precedes it.
    if(opts.ratiosAfterHeading){const pos=text.search(/Ratios?\s+and\s+Supplemental\s+Data|Ratios\/Supplemental\s+Data/i);if(pos>=0)text=text.slice(pos);else continue;}
    const vals=extraRatios(text);if(vals.quality<2)continue;
    const old=out.get(h.cls);if(!old||vals.quality>old.quality)out.set(h.cls,{cls:h.cls,...vals});
   }
  }
 }
 return [...out.values()];
}
function parseTd(pages){
 const isEtf=pages.slice(0,2).some(p=>/TD Exchange-Traded Funds/i.test(p.text));
 if(isEtf){
  // The currencies are parallel tables. Use the entire page's aligned rows.
  const p=pages.find(p=>/Ratios and Supplemental Data/i.test(p.text));if(!p)return [];
  const lines=normalizeExtraText(p.text).split('\n');const start=lines.findIndex(s=>/Ratios and Supplemental Data/i.test(s));
  if(start<0)return [];
  const s=lines.slice(start);const indices={};
  const tickerLine=s.find(z=>/\b[A-Z]{2,7}(?:\.U)?\s*\((?:C|US)\$\)/.test(z))||'';
  const tickers=[...tickerLine.matchAll(/([A-Z]{2,7}(?:\.U)?\s*\((?:C|US)\$\))/g)].map(m=>m[1]);
  const y=reportDate(pages)?.slice(0,4);
  const yearLine=s.find(z=>(z.match(/20\d{2}/g)||[]).length>=4)||'';
  const allYears=yearLine.match(/20\d{2}/g)||[];
  const perTicker=tickers.length?Math.floor(allYears.length/tickers.length):0;
  if(!tickers.length||!perTicker||!y)return [];
 
  for(const metric of ['MER','TER','PTR']){
   const regex=metric==='MER'?/^Management Expense Ratio \(%\)/i:metric==='TER'?/^Trading Expense Ratio \(%\)/i:/^Portfolio Turnover Rate \(%\)/i;
   const row=s.find(z=>regex.test(z));if(!row)continue;
   let nums=(row.match(/\d+\.\d+|N\/A|[—–−]/gi)||[]).map(toNumber);
   // Years for each ticker are adjacent, 5 per ticker.
   indices[metric]=nums;
  }
  const out=[];
  for(let i=0;i<tickers.length;i++){
    const ix=allYears.findIndex((val,j)=>j>=perTicker*i && j<perTicker*(i+1)&&val===y);
    if(ix<0)continue;
    let vals={},q=0;for(const m of ['MER','TER','PTR'])if(indices[m]?.length>ix){vals[m]=indices[m][ix];q++;}else vals[m]=null;
    if(q===3)out.push({cls:tickers[i],values:vals,quality:q,evidence:{}});
  }
  return out;
 }
 const main=parseClassColumns(pages,{splitColumns:true,requireRatioHeading:true,heading:(line)=>tdHeading(line)});
 const right=[];
 for(const p of pages){
   if(!/Ratios and Supplemental Data/i.test(p.text))continue;
   const ls=normalizeExtraText(p.rightText).split('\n');const year=reportDate(pages)?.slice(0,4);
   for(let i=0;i<ls.length;i++){
     const cls=tdHeading(ls[i]);if(!cls)continue;
     const years=(ls[i+1]||'').match(/20\d{2}/g)||[],ix=years.indexOf(year);
     if(ix<0)continue;
     const read=(offset)=>{
       const t=ls[i+offset]||'';
       const num=t.match(/N\/?A|[—–−]|\d[\d,]*(?:\.\d+)?/gi)||[];
       return ix<num.length?toNumber(num[ix]):null;
     };
     // After the year header: assets, units, MER, MER before, TER, PTR.
     if(i+7>=ls.length)continue;
     right.push({cls,values:{MER:read(4),TER:read(6),PTR:read(7)},quality:3,evidence:{}});
   }
 }
 const map=new Map([...main,...right].map(r=>[r.cls,r]));
 return [...map.values()];
}
function parseFidelity(pages){
 return parseClassColumns(pages,{heading:(line)=>{
  const m=/^\s*Fidelity\s+[^\n]{5,190}?\s+(ETF Series|Series\s+[A-Z][A-Z0-9]*)\s*$/i.exec(line.replace(/[®™]/g,''));return m?m[1].replace(/\s+/g,' '):null;
 },ratiosAfterHeading:true});
}
function parseLysander(pages){
 return parseClassColumns(pages.filter(p=>p.page>=6),{heading:(line)=>{const m=/^\s*(Series\s+[A-Z]|ETF Series)\s*\**\s*$/i.exec(line);return m?m[1]:null;},ratiosAfterHeading:true});
}
function parsePender(pages){
 return parseClassColumns(pages.filter(p=>p.page>=8 && /Ratios and Supplemental Data/i.test(p.text)),{heading:(line)=>{
 const m=/^\s*(Class\s+[A-Z](?:\s*\((?:USD|CAD)\))?)\s*$/i.exec(line);return m?m[1]:null;},requireRatioHeading:true});
}
function parseHarvest(pages){
 return parseClassColumns(pages,{heading:(line)=>{const m=/^\s*(Class\s+[A-Z](?:\s*\((?:USD|CAD)\))?)\s*$/i.exec(line);return m?m[1]:null;},ratiosAfterHeading:true});
}
function parseAGF(pages){
 return parseClassColumns(pages,{splitColumns:true,heading:(line)=>{const m=/^\s*((?:Mutual Fund|Series\s*[A-Z]{1,3})\s+(?:Units|Shares))\s*[-–]\s*Ratios\/Supplemental Data/i.exec(line);return m?m[1].replace(/^Series(?=[A-Z])/i,'Series '):null;}});
}
function parseMackenzie(pages){
 const out=[];const targetYear=reportDate(pages)?.slice(0,4);for(const p of pages){
  if(p.page<6)continue;
  for(const col of [p.leftText,p.rightText]){
   if(!col)continue;
   const lines=normalizeExtraText(col).split('\n');
   for(let i=0;i<lines.length;i++){
    const m=/^\s*(Series\s+[A-Z][A-Z0-9]*(?:\s+[A-Z]{2,4})?)\s+(20\d{2})\s+(20\d{2})\b/i.exec(lines[i]);if(!m||m[2]!==targetYear)continue;
    const end=lines.findIndex((s,j)=>j>i&&/^\s*Series\s+[A-Z][A-Z0-9]*(?:\s+[A-Z]{2,4})?\s+20\d{2}\s+20\d{2}\b/i.test(s));
    const text=lines.slice(i,end>i?end:i+25).join('\n');const v=extraRatios(text);
    if(v.quality>=2)out.push({cls:m[1].replace(/\s+/g,' '),...v});
   }
  }
 }
 return [...new Map(out.map(x=>[x.cls,x])).values()];
}
// v3-1: Mackenzie ETFs publish a right-hand ratios table, while mutual
// funds use the existing multi-Series parser. Use this only after the
// mutual-fund parser returns no rows, and only with a titled ETF document.
function parseMackenzieEtfColumns(pages,fund,date){
 if(!/\bETF\b/i.test(fund)||!date)return [];
 const year=date.slice(0,4);
 for(const pg of pages){
  for(const column of [pg.rightText,pg.text]){
   const txt=normalizeExtraText(column||'');
   const ix=txt.search(/Ratios?\s+and\s+Supplemental\s+Data/i);if(ix<0)continue;
   const lines=txt.slice(ix).split(/\r?\n/);
   const head=lines.slice(0,8).join(' ');
   const clsMatch=/\b((?:CAD|USD)\s+Units)(?:\s*\(Ticker:[^)]+\))?\s+(20\d{2})\b/i.exec(head);
   if(!clsMatch || clsMatch[2]!==year)continue;
   // Confirm the time axis: the first year belongs to this report.
   const listedYears=head.match(/20\d{2}/g)||[];
   if(listedYears[0]!==year)continue;
   const values={MER:null,TER:null,PTR:null},evidence={};let quality=0;
   for(const metric of ['MER','TER','PTR']){
    const label=metric==='MER'?/^\s*Management\s+expense\s+ratio\s*\(\s*%\s*\)/i:
      metric==='TER'?/^\s*Trading\s+expense\s+ratio\s*\(\s*%\s*\)/i:
      /^\s*Portfolio\s+turnover\s+rate\s*\(\s*%\s*\)/i;
    for(const line of lines){
     const m=label.exec(line);if(!m)continue;
     const tail=line.slice(m[0].length);
     const token=/^\s*([—–−-]|\d+(?:\.\d+)?)(?=\s|%|$)/.exec(tail);
     if(!token)break;
     values[metric]=toNumber(token[1]);quality++;
     evidence[metric]={page:pg.page,source:'Mackenzie ETF first-period ratio column',method:'native-js'};
     break;
    }
   }
   if(quality===3)return [{cls:clsMatch[1].replace(/\s+/g,' '),values,evidence,quality}];
  }
 }
 return [];
}

function parseBrandes(pages){
 const out=new Map();const year=brandesDate(pages)?.slice(0,4);for(const p of pages){
  if(!/Ratios and Supplemental Data/i.test(p.text))continue;
  const lines=normalizeExtraText(p.text).split('\n');
  for(let i=0;i<lines.length;i++){
   const m=/^\s*(Series\s+[A-Z][A-Z0-9]*)\s*$/i.exec(lines[i]);if(!m)continue;
   // For this tabular layout, a series name is centered vertically among
   // the six-year data rows; its 2026 line appears immediately above it.
   let latest=null;
   for(let j=i-1;j>=Math.max(0,i-12);j--){if(year&&lines[j].startsWith(year+' ')){latest=lines[j];break;}if(/^Series\s/i.test(lines[j]))break;}
   if(!latest)continue;
   let parts=(latest.match(/\b\d[\d,]*(?:\.\d+)?\b|[—–−-]/g)||[]);
   // Year, net assets, units, MER, MER before, PTR, TER, NAV.
   if(parts.length<7)continue;
   const v={MER:toNumber(parts[3]),PTR:toNumber(parts[5]),TER:toNumber(parts[6])};
   out.set(m[1],{cls:m[1],values:v,quality:3,evidence:{}});
  }
 }
 return [...out.values()];
}
function parseNEI(pages){
 const out=[];const date=reportDate(pages);const year=date?.slice(0,4),month=date?.slice(5,7);
 for(const p of pages){
  if(!/Ratios and Supplemental Data/i.test(p.text))continue;
  for(const line of normalizeExtraText(p.text).split('\n')){
   const m=/^\s*([A-Z]{1,3})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(20\d{2})\s+(.+)/i.exec(line);if(!m||m[3]!==year||String(months[m[2].slice(0,3).toLowerCase()]).padStart(2,'0')!==month)continue;
   const parts=m[4].trim().split(/\s{2,}/).map(z=>z.trim()).filter(Boolean);
   // asset value, units, MER, MER before, TER, PTR, NAV
   if(parts.length<6)continue;
   const v={MER:toNumber(parts[2]),TER:toNumber(parts[4]),PTR:toNumber(parts[5])};
   out.push({cls:'Series '+m[1],values:v,quality:3,evidence:{}});
  }
 }
 return out;
}
function brandesDate(pages){
 const head=normalizeExtraText(pages.slice(0,5).map(x=>x.text).join('\n'));
 const m=/Results\s+of\s+Operations\s+from[\s\S]{0,160}?\bto[\s\S]{0,170}?\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})/i.exec(head);
 if(m){const mm=months[m[1].slice(0,3).toLowerCase()];return `${m[3]}-${String(mm).padStart(2,'0')}-${m[2].padStart(2,'0')}`;}
 return reportDate(pages);
}
// v2-1: New issuer formats. Ratios are read from the latest period's first
// published table column; no amounts are hardcoded for any named fund.
function parseVanguard(pages){
 for(const page of pages){
  const pos=page.text.search(/Ratios and Supplemental Data/i);
  if(pos<0)continue;
  const block=page.text.slice(pos,pos+4500);
  const r=extraRatios(block);
  if(r.quality>=3)return [{cls:'ETF Units',...r}];
 }
 return [];
}
function parseNinepoint(pages){
 const results=new Map();
 for(const page of pages){
  if(!/Ratios and Supplemental Data/i.test(page.text))continue;
  const txt=normalizeExtraText(page.text),lines=txt.split(/\r?\n/),headings=[];
  for(let i=0;i<lines.length;i++){
   const m=/^\s*(Series\s+(?:ETF|[A-Z]))(?:\s+20\d{2}(?:\s+20\d{2})*)?\s*$/i.exec(lines[i]);
   if(m)headings.push({cls:m[1].replace(/\s+/g,' '),idx:i});
  }
  for(let i=0;i<headings.length;i++){
   const h=headings[i];
   const r=extraRatios(lines.slice(h.idx,headings[i+1]?.idx??lines.length).join('\n'));
   if(r.quality>=3)results.set(h.cls,{cls:h.cls,...r});
  }
 }
 return [...results.values()];
}
function parseGlobalX(pages){
 // Global X financial statements sometimes render digits split after a
 // decimal point ('104. 36%'); join those spans only inside ratio-table rows.
 const labels={MER:/^Management expense ratio\s+(?!before)/i,TER:/^Trading expense ratio\s+/i,PTR:/^Portfolio turnover rate\s+/i};
 for(const page of pages){
  const block=page.text.split(/\r?\n/);
  if(!block.some(s=>/^Ratios and Supplemental Data/i.test(s.trim())))continue;
  const vals={MER:null,TER:null,PTR:null};const seen=new Set();
  for(const s of block){
   const line=normalizeExtraText(s).trim();
   for(const [metric,re] of Object.entries(labels)){
    const match=re.exec(line);if(!match)continue;
    const tail=line.slice(match[0].length).trim();
    const token=/^(\d+)\.\s*(\d+)%?|^([—–−-])(?=\s|$)/.exec(tail);
    if(token){vals[metric]=token[3]?null:toNumber(token[1]+'.'+token[2]);seen.add(metric);}
   }
  }
  if(seen.size===3)return [{cls:'ETF Units',values:vals,quality:3,evidence:{}}];
 }
 return [];
}
// IG financial highlights sometimes omit the *printed* latest-year header
// for the final series on a continuation page. The current-period numeric
// column can still exist to the left of all labelled historical columns.
// Recognize it only when the same physical half-page has a normal series
// header for this report's year AND exactly one extra ratio value for each
// metric. Never substitute the historical first-labelled-year value.
function parseIgUnlabelledLatestColumn(pages){
 const year=Number(reportDate(pages)?.slice(0,4));
 if(!Number.isInteger(year)||year<2000)return [];
 const out=[];
 const heading=/^\s*(Series\s+[A-Z][A-Z0-9]*(?:\s+[A-Z]{2,4})?)\s+((?:20\d{2}\s+){1,7}20\d{2})\s*$/i;
 const ratioRe={
  MER:/^Management\s+expense\s+ratio\s*\(%\)/i,
  TER:/^Trading\s+expense\s+ratio\s*\(%\)/i,
  PTR:/^Portfolio\s+turnover\s+rate\s*\(%\)/i
 };
 for(const pg of pages){
  if(!/RATIOS\s+AND\s+SUPPLEMENTAL\s+DATA/i.test(pg.text||''))continue;
  for(const col of [pg.leftText,pg.rightText]){
   const lines=normalizeExtraText(col||'').split(/\r?\n/);
   const heads=[];
   for(let i=0;i<lines.length;i++){
    const m=heading.exec(lines[i].trim());
    if(!m)continue;
    heads.push({index:i,cls:m[1].replace(/\s+/g,' '),years:m[2].trim().split(/\s+/).map(Number)});
   }
   const normal=heads.some(h=>h.years[0]===year&&h.years[1]===year-1);
   if(!normal)continue;
   for(let k=0;k<heads.length;k++){
    const h=heads[k],oldYears=h.years;
    if(oldYears[0]!==year-1||oldYears.length<2||oldYears.some((y,i)=>i>0&&y!==oldYears[i-1]-1))continue;
    const tail=lines.slice(h.index+1,heads[k+1]?.index??lines.length);
    const metrics={};let valid=true;
    for(const [metric,re] of Object.entries(ratioRe)){
     const matching=tail.filter(line=>re.test(line.trim()));
     if(matching.length!==1){valid=false;break;}
     const label=re.exec(matching[0].trim());
     const cells=matching[0].trim().slice(label[0].length).trim()
      .match(/(?:n\s*\/\s*a|[—–−-]{1,2}|\d+(?:\.\d+)?|\.\d+)(?=\s|$)/gi)||[];
     if(cells.length!==oldYears.length+1){valid=false;break;}
     metrics[metric]=toNumber(cells[0]);
    }
    if(valid)out.push({cls:h.cls,values:metrics,quality:3,evidence:{}});
   }
  }
 }
 return [...new Map(out.map(r=>[r.cls,r])).values()];
}
function parseIgHistorical(pages,p){
 // Include a historically listed series only if no validated current-period
 // source exists; older-year ratios must not masquerade as current values.
 const found=parseMackenzie(pages), existing=new Set(found.map(x=>x.cls));
 for(const candidate of parseIgUnlabelledLatestColumn(pages)){
  if(!existing.has(candidate.cls)){found.push(candidate);existing.add(candidate.cls);}
 }
 for(const pg of pages){
  if(!/RATIOS AND SUPPLEMENTAL DATA/i.test(pg.text))continue;
  for(const col of [pg.leftText,pg.rightText]){
   const lines=normalizeExtraText(col||'').split(/\r?\n/);
   const start=lines.findIndex(x=>/RATIOS AND SUPPLEMENTAL DATA/i.test(x));
   for(const l of lines.slice(Math.max(0,start))){
    const m=/^\s*(Series\s+[A-Z][A-Z0-9]*(?:\s+[A-Z]{2,4})?)\s+(20\d\d)(?=\s)/i.exec(l);
    if(!m||existing.has(m[1])||Number(m[2])>=Number(reportDate(pages)?.slice(0,4)))continue;
    // Evidence must be a metric table, not a footnote sentence.
    found.push({cls:m[1],values:{MER:null,TER:null,PTR:null},quality:3,evidence:{}});
    existing.add(m[1]);
   }
  }
 }
 return found;
}

// New issuer formats (batch 10) are scoped to their own profiles. No ratio
// constants or document filenames are used. A dash/N/A remains a null cell.
function v22FirstRatio(line){
 const m=/(?:\d+(?:\.\d+)?|\.\d+)(?:\*+)?%?|[—–−-](?:%)?|n\/?a/i.exec(line);
 return m?toNumber(m[0].replace(/[%*]/g,'')):null;
}
function v22Metrics(text, {includePerformance=false}={}){
 const lines=normalizeExtraText(text).split(/\r?\n/),v={MER:null,TER:null,PTR:null};let quality=0;
 const re={MER:/^\s*Management\s+expense\s+ratio(?:\d+)?\b/i,TER:/^\s*Trading\s+expense\s+ratio(?:\d+)?\b/i,PTR:/^\s*Portfolio\s+turnover\s+(?:rate|ratio)(?:\d+)?\b/i};
 for(const key of ['MER','TER','PTR']){
  for(const line of lines){const m=re[key].exec(line);if(!m)continue;
   const tail=line.slice(m[0].length);
   if(key==='MER' && /^(?:\s+before\b|\s*\(excluding\b)/i.test(tail))continue;
   if(key==='MER' && /\(including\s+performance\s+fees\)/i.test(tail) && !includePerformance)continue;
   const idx=key==='MER'&&includePerformance?tail.search(/\(including\s+performance\s+fees\)/i):-1;
   if(key==='MER'&&includePerformance&&idx<0)continue;
   // Restrict ratios to the current table row. Ignore its footnotes/labels;
   // numbers in the ratio column always have a decimal point in these layouts.
   const percentages=tail.match(/(?:\d*\.\d+)\*?%?|[—–−-]%?|n\/?a/gi)||[];
   if(percentages.length){v[key]=toNumber(percentages[0].replace(/[\*%]/g,''));quality++;break;}
  }
 }
 return {values:v,quality,evidence:{}};
}
function parseCibc(pages){
 const out=new Map();
 for(const pg of pages){const lines=pg.text.split(/\r?\n/);for(let i=0;i<lines.length;i++){
  const m=/^\s*Ratios\s+and\s+Supplemental\s+Data\s*[-–]\s*((?:ETF\s+Series|Series\s+[A-Z][A-Z0-9-]*)\s+Units)\b/i.exec(lines[i]);
  if(!m)continue;
  let end=i+1;while(end<lines.length && !/^\s*(?:Ratios\s+and\s+Supplemental\s+Data\s*[-–]|The\s+Pool.s\s+Net\s+Assets\s+per\s+Unit|Past\s+Performance)/i.test(lines[end]))end++;
  const r=v22Metrics(lines.slice(i+1,end).join('\n'));if(r.quality===3)out.set(m[1],{cls:m[1],...r});
 }}return [...out.values()];
}
function parseHamilton(pages){
 for(const pg of pages){let text=pg.text;const pos=text.search(/Ratios\s+and\s+Supplemental\s+Data/i);if(pos<0)continue;
  text=text.slice(pos);const lines=text.split(/\r?\n/);
  const yrLine=lines.find(x=>/^\s*Year\b.*\b20\d{2}\b/i.test(x))||'';
  const count=(yrLine.match(/20\d\d/g)||[]).length;if(count<1)continue;
  const v={MER:null,TER:null,PTR:null};let quality=0;
  for(const metric of ['MER','TER','PTR']){
   const re=metric==='MER'?/^\s*Management\s+expense\s+ratio\b(?!\s+before)/i:metric==='TER'?/^\s*Trading\s+expense\s+ratio\b/i:/^\s*Portfolio\s+turnover\s+rate\b/i;
   const row=lines.find(x=>re.test(x));if(!row)continue;
   // Hamilton annotates rows with long 'Footnote' text embedded in a
   // single PDF.js line. Only the rightmost N year-column percentages
   // belong to the table; earlier figures may be in the annotation.
   const pct=[...row.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(x=>x[1]);
   if(pct.length<count)continue;
   v[metric]=toNumber(pct[pct.length-count]);quality++;
  }
  if(quality===3)return [{cls:'Class E',values:v,quality,evidence:{}}];
 }return [];
}
function parseNewGen(pages){
 const out=new Map();
 for(const pg of pages){const lines=pg.text.split(/\r?\n/);const positions=[];
  for(let i=0;i<lines.length;i++){let m=/The\s+Fund.s\s+Net\s+Asset\s+Value\s*\(NAV\)\s+per\s+(Class\s+[FGI](?:\s*\(USD\))?)\s+Unit/i.exec(lines[i]);if(m)positions.push({cls:m[1],i});}
  for(let k=0;k<positions.length;k++){const h=positions[k];let t=lines.slice(h.i,positions[k+1]?.i??lines.length).join('\n');
   if(!/Ratios\s+and\s+Supplemental\s+Data/i.test(t))continue;
   t=t.slice(t.search(/Ratios\s+and\s+Supplemental\s+Data/i));const r=v22Metrics(t,{includePerformance:true});
   if(r.quality===3)out.set(h.cls,{cls:h.cls,...r});
  }
 }return [...out.values()];
}
function parseRP(pages){
 const out=new Map(),target=reportDate(pages);
 for(const pg of pages){const txt=pg.text;const pos=txt.search(/Ratios\s+and\s+supplemental\s+data/i);if(pos<0)continue;
  const lines=txt.slice(pos).split(/\r?\n/);let cls=null;
  for(const raw of lines){const heading=/^\s*(Class\s+[A-Z][A-Z0-9]*(?:-USD)?)(?:\*+)?\s*$/i.exec(raw);if(heading){cls=heading[1];continue;}
   if(!cls||!/\bJun(?:e)?\.?\s+30,?\s+20\d{2}/i.test(raw))continue;
   const m=/^\s*Jun(?:e)?\.?\s+30,?\s+(20\d{2})\*{0,8}\s*(.*)$/i.exec(raw);if(!m||target&&m[1]!==target.slice(0,4))continue;
   const matches=m[2].match(/(?:\d[\d,]*\.\d+|\d[\d,]*|[—–−-])%?/g)||[];
   if(matches.length<7)continue;
   out.set(cls,{cls,values:{MER:toNumber(matches[2]),TER:toNumber(matches[4]),PTR:toNumber(matches[5])},quality:3,evidence:{}});
  }
 }return [...out.values()];
}
function parseLeith(pages){
 const out=new Map();for(const pg of pages){const pos=pg.text.search(/Ratios\s+and\s+Supplemental\s+Data/i);if(pos<0)continue;
  const lines=pg.text.slice(pos).split(/\r?\n/);let heads=[];
  for(let i=0;i<lines.length;i++){const m=/^\s*(Series\s+[A-Z][A-Z0-9]*)(?:\s*\(\d+\))?\s+(?:(?:202[0-9]|\bJune\b)|$)/i.exec(lines[i]);if(m)heads.push({cls:m[1],i});}
  for(let j=0;j<heads.length;j++){const h=heads[j],text=lines.slice(h.i,heads[j+1]?.i??lines.length).join('\n');const r=v22Metrics(text);
   if(r.quality===3)out.set(h.cls,{cls:h.cls,...r});
  }
 }return [...out.values()];
}
function parseTdEtfFallback(pages){
 const header=pages.slice(0,3).map(x=>x.text).join('\n');if(!/TD\s+[^\n]*ETF\b/i.test(header))return [];
 for(const pg of pages){const start=pg.text.search(/Ratios\s+and\s+Supplemental\s+Data/i);if(start<0)continue;
  let t=pg.text.slice(start);const stop=t.search(/\bNet\s+Asset\s+Value\s+per\s+Unit/i);if(stop>=0)t=t.slice(0,stop);
  const r=v22Metrics(t);if(r.quality===3)return [{cls:'ETF Units',...r}];
 }return [];
}
// Batch 2: CI has a dated *row table* (NOT the typical column MER/TER/PTR
// labels). Use MER AFTER taxes, preserve nil values; never read fee schedules.
function parseCI(pages){
 const out=new Map(),date=reportDate(pages);if(!date)return [];
 const year=date.slice(0,4),month=Number(date.slice(5,7)),day=Number(date.slice(8,10));
 // CI prints the footnotes beside a series name, but PDF.js sometimes
 // orders those fragments as TWO lines (footnotes BEFORE the series).
 // Accept either order without relying on the sample's series count.
 const seriesHeading=/^\s*(Series\s+[A-Z][A-Z0-9]*)(?:\s*\(\d+\))*\s*$/i;
 const dateRow=/^\s*(Mar(?:ch)?\.?\s+31|Sept?(?:ember)?\.?\s+30|Jun(?:e)?\.?\s+30|Dec(?:ember)?\.?\s+31),?\s+(20\d{2})(?:\s+|$)(.*)$/i;
 for(const pg of pages){
  const pos=String(pg.text||'').search(/Ratios\s+and\s+Supplemental\s+Data/i);
  if(pos<0)continue; // Never harvest figures from non-financial tables.
  const lines=pg.text.slice(pos).split(/\r?\n/);let series=null;
  for(let i=0;i<lines.length;i++){
   const heading=seriesHeading.exec(lines[i]);
   if(heading){
    // Within a CI ratio table, the next line normally gives the start
    // date. Requiring that context avoids accepting prose references.
    const next=lines.slice(i+1,i+4).join(' ');
    series=/\bCommencement\s+of\s+operations\b/i.test(next)?heading[1].replace(/\s+/g,' ').trim():null;
    continue;
   }
   if(!series)continue;
   const row=dateRow.exec(lines[i]);if(!row||row[2]!==year)continue;
   const mm=/^Mar/i.test(row[1])?3:/^Sept?/i.test(row[1])?9:/^Jun/i.test(row[1])?6:12;
   const dd=mm===3||mm===12?31:30;
   if(mm!==month||dd!==day)continue;
   // Eight columns: net assets, units, MER before tax, sales tax,
   // MER AFTER tax, effective HST, TER, PTR. Dashes stay null.
   // Some PDFs wrap the numeric cells onto the next physical text line.
   let data=row[3];let tokens=[];
   for(let j=0;j<3;j++){
    tokens=data.match(/(?:n\/?a|[—–−-]|\d[\d,]*(?:\.\d+)?)/gi)||[];
    if(tokens.length>=8)break;
    const cont=lines[i+j+1]||'';
    if(!cont.trim()||seriesHeading.test(cont)||dateRow.test(cont)||/\b(?:Commencement|Footnotes|Financial\s+Highlights|Ratios\s+and)\b/i.test(cont))break;
    data+=' '+cont;
   }
   if(tokens.length!==8)continue; // No guesses from partial/shifted columns.
   out.set(series,{cls:series,values:{MER:toNumber(tokens[4]),TER:toNumber(tokens[6]),PTR:toNumber(tokens[7])},quality:3,evidence:{}});
  }
 }
 return [...out.values()];
}
// Recover a current-year row from a Dynamic/Scotia ratio table even when the
// table carries on to the next page without repeating 'Ratios and ...'.
// USD identifiers and new 2-letter series are not collapsed into Series A.
function parse1832Complete(pages){
 const out=new Map(),date=reportDate(pages);if(!date)return [];
 const year=date.slice(0,4), month=Number(date.slice(5,7));let started=false;
 for(const pg of pages){
  let txt=pg.text;
  const at=txt.search(/Ratios?\s+and\s+Supplemental\s+Data/i);
  if(at>=0){started=true;txt=txt.slice(at);}
  else if(!started)continue;
  // Continuing table pages use the same numeric column headings.
  else if(!/\b(?:As\s+at|Portfolio\s+turnover)\b/i.test(txt.slice(0,1200)))continue;
  let series=null;
  for(const raw of txt.split(/\r?\n/)){
   const m=/^\s*(Series\s+[A-Z][A-Z0-9]*|ETF(?:H)?\s+Series)(\s*\(USD\))?(?:\s*[–-]\s*The\s+start\s+date.*)?\s*$/i.exec(raw);
   if(m){series=m[1]+(m[2]||'');continue;}
   if(!series)continue;
   const row=/^\s*(Jun(?:e)?\.?\s+30|Dec(?:ember)?\.?\s+31|Mar(?:ch)?\.?\s+31|Sept?(?:ember)?\.?\s+30),?\s+(20\d{2})\s+(.+)$/i.exec(raw);
   if(!row||row[2]!==year)continue;
   const mm=/^Jun/i.test(row[1])?6:/^Dec/i.test(row[1])?12:/^Mar/i.test(row[1])?3:9;
   if(mm!==month)continue;
   const tokens=row[3].match(/(?:n\/?a|[—–−-]|\d[\d,]*(?:\.\d+)?)/gi)||[];
   if(tokens.length<7)continue;
   out.set(series,{cls:series,values:{MER:toNumber(tokens[2]),TER:toNumber(tokens[4]),PTR:toNumber(tokens[5])},quality:3,evidence:{}});
  }
 }
 return [...out.values()];
}
// v3-1: Dynamic single-class ETFs have 8 financial columns but do not
// have a Series heading. Never invoke this on multi-Series funds.
function parseDynamicSingleEtf(pages,fund,date){
 if(!/\bETF\b/i.test(fund)||!date)return [];
 const [yr,mm,dd]=date.split('-').map(Number);
 for(const pg of pages){
  const txt=String(pg.text||'');const ix=txt.search(/Ratios?\s+and\s+Supplemental\s+Data/i);
  if(ix<0)continue;
  const section=txt.slice(ix,ix+8500);
  if(!/\bAs\s+at\b/i.test(section)||!/MER\b/i.test(section)||!/TER\b/i.test(section)||!/Portfolio\s+turnover/i.test(section))continue;
  const re=/^\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(20\d{2})\s+(.+)$/gim;
  for(const row of section.matchAll(re)){
   const mo=months[row[1].slice(0,3).toLowerCase()];
   if(mo!==mm||Number(row[2])!==dd||Number(row[3])!==yr)continue;
   // NAV, units outstanding, MER, MER-before-waivers, TER, PTR,
   // unit NAV, closing price. Numeric stars indicate annualization.
   const tokens=row[4].match(/(?:n\/?a|[—–−-]|\d[\d,]*(?:\.\d+)?\*?)/gi)||[];
   if(tokens.length!==8)continue;
   const values={MER:toNumber(tokens[2]),TER:toNumber(tokens[4]),PTR:toNumber(tokens[5])};
   const evidence={};for(const m of ['MER','TER','PTR'])evidence[m]={page:pg.page,source:'Dynamic ETF dated current-period ratio row',method:'native-js'};
   return [{cls:'ETF Units',values,evidence,quality:3}];
  }
 }
 return [];
}

// Vanguard's ratio tables sometimes print footnote digits next to row labels.
// Limit percentages to the actual latest-period table, ignoring citations.
function parseVanguardB2(pages){
 for(const pg of pages){let pos=pg.text.search(/Ratios\s+and\s+Supplemental\s+Data/i);if(pos<0)continue;
  const lines=pg.text.slice(pos).split(/\r?\n/);let v={},seen=0;
  for(const m of ['MER','TER','PTR']){
   const re=m==='MER'?/^\s*Management\s+expense\s+ratio(?!\s+before)/i:m==='TER'?/^\s*Trading\s+expense\s+ratio/i:/^\s*Portfolio\s+turnover\s+rate/i;
   const row=lines.find(x=>re.test(x));if(!row)continue;
   const label=re.exec(row),tail=row.slice(label[0].length).replace(/^(?:\d+|\s|\([^)]*\))*(?=\s+\d+\.\d+%|\s+[—–−-])/,'');
   const values=[...tail.matchAll(/(?:\d*\.\d+|[—–−-])%?/g)];
   if(!values.length)continue;
   v[m]=toNumber(values[0][0].replace(/%/g,''));seen++;
  }
  if(seen===3)return [{cls:'ETF Units',values:v,quality:3,evidence:{}}];
 }
 return [];
}
// BlackRock has a family of condensed text PDFs, with collapsed spaces like
// 'RatiosandSupplementalData(g)' and separate CAD/USD units per page.
function parseBlackrockB2(pages){
 const out=new Map();
 for(const pg of pages){const text=pg.text.replace(/\u00a0/g,' ');
  if(!/Ratios\s*and\s*Supplemental\s*Data/i.test(text))continue;
  const start=text.search(/Ratios\s*and\s*Supplemental\s*Data/i);
  const first=text.slice(0,start);const cls=/\b(CAD|USD)\s*Units\b/i.exec(first)?.[0]||null;
  if(!cls)continue;
  const section=text.slice(start).split(/\r?\n/);
  const vals={};let quality=0;
  for(const metric of ['MER','TER','PTR']){
    const re=metric==='MER'?/Management\s*expense\s*ratio/i:metric==='TER'?/Trading\s*expense\s*ratio/i:/Portfolio\s*turnover\s*rate/i;
    const row=section.find(s=>re.test(s));if(!row)continue;
    const cut=row.slice(re.exec(row).index+re.exec(row)[0].length);
    // Skip footnote (h) and dot leaders; take first reported decimal.
    const m=/\b(\d*\.\d+)\s*%/i.exec(cut);
    if(!m)continue;
    vals[metric]=toNumber(m[1]);quality++;
  }
  if(quality===3){const name=/^CAD/i.test(cls)?'CAD Units':'USD Units';out.set(name,{cls:name,values:vals,quality,evidence:{}});}
 }
 return [...out.values()];
}
// v3-1: Single-class iShares ETFs with dotted-leader metric rows.
// In contrast, currency-specific CAD/USD Units reports continue through
// parseBlackrockB2() unchanged. Dashes in the current column stay null.
function parseBlackrockDottedEtf(pages,fund,date){
 if(!/\bETF\b/i.test(fund)||!date)return [];
 const year=date.slice(0,4);
 for(const pg of pages){
  const txt=normalizeExtraText(pg.text||'');const pos=txt.search(/Ratios?\s+and\s+Supplemental\s+Data/i);
  if(pos<0)continue;
  const before=txt.slice(Math.max(0,pos-1200),pos);
  if(/\b(?:CAD|USD)\s+Units\b/i.test(before))continue;
  if(!new RegExp('\\b'+year+'\\b').test(before) && !new RegExp('\\b'+year+'\\b').test(pages.slice(0,2).map(x=>x.text).join(' ')))continue;
  const lines=txt.slice(pos,pos+3500).split(/\r?\n/);const vals={MER:null,TER:null,PTR:null},evidence={};let seen=0;
  for(const metric of ['MER','TER','PTR']){
   const re=metric==='MER'?/^\s*Management\s+expense\s+ratio\b/i:
     metric==='TER'?/^\s*Trading\s+expense\s+ratio\b/i:/^\s*Portfolio\s+turnover\s+(?:rate|ratio)\b/i;
   for(const line of lines){
    const m=re.exec(line);if(!m)continue;
    const tail=line.slice(m[0].length);
    // Dotted leaders identify the layout and keep the first financial
    // cell distinct from footnote markers and descriptive prose.
    const lead=/\.{6,}/.exec(tail);if(!lead)break;
    const valueText=tail.slice(lead.index+lead[0].length).trim();
    const tok=/^(?:\$\s*)?([—–−-]|\d+(?:\.\d+)?)(?=\s|%|$)/.exec(valueText);
    if(!tok)break;
    vals[metric]=toNumber(tok[1]);seen++;
    evidence[metric]={page:pg.page,source:'iShares dotted-leader latest-period ratio table',method:'native-js'};
    break;
   }
  }
  if(seen===3)return [{cls:'ETF Units',values:vals,evidence,quality:3}];
 }
 return [];
}

// Global X runs several financial report templates. Handle both '0.10%'
// and '0. 10%' for numeric fields, not just its legacy narrow regex.
function parseGlobalXB2(pages){
 for(const pg of pages){const start=pg.text.search(/Ratios\s+and\s+Supplemental\s+Data/i);if(start<0)continue;
  const lines=pg.text.slice(start).split(/\r?\n/),vals={};let quality=0;
  for(const metric of ['MER','TER','PTR']){
   const re=metric==='MER'?/^\s*Management\s+expense\s+ratio\b(?!\s+before)/i:metric==='TER'?/^\s*Trading\s+expense\s+ratio/i:/^\s*Portfolio\s+turnover\s+rate/i;
   const row=lines.find(t=>re.test(t));if(!row)continue;
   const tail=row.slice(re.exec(row)[0].length).replace(/^\s*(?:\(\d+\)|[¹²³⁴⁵])\s*/,'');
   const m=/([—–−-]|\d+\.\s*\d+|\d+\.\d+)\s*%/i.exec(tail);if(!m)continue;
   vals[metric]=toNumber(m[1].replace(/\.\s+/g,'.'));quality++;
  }
  if(quality===3)return [{cls:'ETF Units',values:vals,quality,evidence:{}}];
 }
 return [];
}
// v3-1: secondary Global X ratio reader. Runs only when the primary
// Global X table parser returned nothing. Restrict to financial tables,
// exact metric names (not 'excluding' or 'before') and current-year column.
function parseGlobalXWrappedRatios(pages,date){
 if(!date)return [];
 const year=date.slice(0,4);
 for(const pg of pages){
  const txt=normalizeExtraText(pg.text||'');const pos=txt.search(/Ratios?\s+and\s+Supplemental\s+Data/i);if(pos<0)continue;
  const lines=txt.slice(pos,pos+6500).split(/\r?\n/);
  const header=lines.slice(0,8).join(' ');
  const years=header.match(/20\d{2}/g)||[];if(years[0]!==year)continue;
  const vals={MER:null,TER:null,PTR:null},evidence={};let seen=0;
  for(const metric of ['MER','TER','PTR']){
   const re=metric==='MER'?/^\s*Management\s+expense\s+ratio\b/i:
    metric==='TER'?/^\s*Trading\s+expense\s+ratio\b/i:/^\s*Portfolio\s+turnover\s+(?:rate|ratio)\b/i;
   for(let i=0;i<lines.length;i++){
    const match=re.exec(lines[i]);if(!match)continue;
    let after=lines[i].slice(match[0].length);
    // Exclude alternate ratios that are not the reporting MER/TER/PTR.
    if(/^\s*(?:before|excluding)\b/i.test(after))continue;
    if(!after.trim()){
     const next=lines[i+1]||'';
     if(/^\s*(?:before|excluding)\b/i.test(next))continue;
     after=next;
    }
    const token=/^\s*([—–−-]|\d+\.\s*\d+)\s*%/.exec(after);
    if(!token)continue;
    vals[metric]=toNumber(token[1].replace(/\.\s+/g,'.'));seen++;
    evidence[metric]={page:pg.page,source:'Global X wrapped current-year ratio table',method:'native-js'};
    break;
   }
  }
  if(seen===3)return [{cls:'ETF Units',values:vals,evidence,quality:3}];
 }
 return [];
}

// Layout-only fallback for Global X reports. PDF.js may keep label, footnote
// and first-year cell in separate text runs or even separate lines. Read the
// physical first reporting column, never an arbitrary percentage in prose.
// This runs AFTER all existing Global X text parsers and only for its issuer.

function parseGlobalXPositionedRatios(pages, date) {
  if (!date) return [];

  const targetYear = date.slice(0, 4);
  const normalize = s => String(s || '').replace(/\s+/g, ' ').trim();

  for (const pg of pages) {
    const items = Array.isArray(pg.items)
      ? pg.items.filter(it =>
          it &&
          typeof it.str === 'string' &&
          it.str.trim() &&
          Number.isFinite(it.x) &&
          Number.isFinite(it.y)
        )
      : [];

    if (!items.length) continue;

    const rows = [];

    for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
      let row = rows.find(r => Math.abs(r.y - it.y) <= 3.4);

      if (!row) {
        row = { y: it.y, parts: [] };
        rows.push(row);
      }

      row.parts.push(it);
    }

    rows.sort((a, b) => b.y - a.y);

    for (const row of rows) {
      row.parts.sort((a, b) => a.x - b.x);
      row.label = normalize(
        row.parts.filter(x => x.x < 270).map(x => x.str).join(' ')
      );
    }

    const idx = rows.findIndex(r =>
      /Ratios?\s+and\s+Supplemental\s+Data/i.test(r.label)
    );

    if (idx < 0) continue;

    let firstYear = null;
    let secondYear = null;
    let yearIdx = -1;

    for (let i = idx + 1; i < Math.min(rows.length, idx + 9); i++) {
      const dateBits = rows[i].parts
        .filter(x => x.x > 260 && /^\d+$/.test(normalize(x.str)))
        .sort((a, b) => a.x - b.x);

      const merged = [];

      for (const bit of dateBits) {
        const str = normalize(bit.str);
        const last = merged[merged.length - 1];

        if (
          last &&
          last.str.length < 4 &&
          bit.x >= last.x &&
          bit.x - (last.x + last.w) <= 8
        ) {
          last.str += str;
          last.w = Math.max(last.w, bit.x + (bit.w || 0) - last.x);
        } else {
          merged.push({ str, x: bit.x, w: bit.w || 0 });
        }
      }

      const years = merged.filter(x => /^20\d{2}$/.test(x.str));

      if (years.length >= 2) {
        firstYear = years[0];
        secondYear = years[1];
        yearIdx = i;
        break;
      }
    }

    if (!firstYear || firstYear.str.trim() !== targetYear) continue;

    const vals = { MER: null, TER: null, PTR: null };
    const evidence = {};
    let seen = 0;

    const specs = {
      MER: /^Management\s+expense\s+ratio\b(?!\s+before)/i,
      TER: /^Trading\s+expense\s+ratio\b/i,
      PTR: /^Portfolio\s+turnover\s+(?:rate|ratio)\b/i
    };

    for (const metric of ['MER', 'TER', 'PTR']) {
      for (let i = yearIdx + 1; i < Math.min(rows.length, yearIdx + 25); i++) {
        const row = rows[i];

        if (!specs[metric].test(row.label)) continue;

        if (
          metric === 'MER' &&
          /^Management\s+expense\s+ratio\s+(?:excluding|before)\b/i.test(row.label)
        ) continue;

        const boundary = (firstYear.x + secondYear.x) / 2;

        const column = items.filter(x =>
          x.x >= firstYear.x - 57 &&
          x.x < boundary + 1
        );

        const seed = column
          .filter(x =>
            Math.abs(x.y - row.y) <= 6 &&
            /[\d.\u2014\u2013\u2212-]/.test(x.str)
          )
          .sort((a, b) =>
            Math.abs(a.y - row.y) - Math.abs(b.y - row.y) ||
            a.x - b.x
          )[0];

        if (!seed) break;

        
        const pieces = row.parts
        .filter(x =>
        x.x >= firstYear.x - 57 &&
        x.x < (firstYear.x + secondYear.x) / 2 + 1
        )
        .sort((a, b) => a.x - b.x);


        
        const tokens = [...pieces].sort((a, b) => a.x - b.x);

        let value = normalize(tokens.map(x => x.str).join(' '))
        .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2');

        // Reconstruct split decimals from PDF.js fragments.
        if (
          tokens.length === 2 &&
          /^\d{1,3}$/.test(normalize(tokens[0].str)) &&
          /^\d{2}%$/.test(normalize(tokens[1].str))
        ) {
        const gap = tokens[1].x -
        (tokens[0].x + (tokens[0].w || 0));

        if (Number.isFinite(gap) && gap >= -0.5 && gap <= 4) {
          value = normalize(tokens[0].str) +
           '.' + normalize(tokens[1].str);
        }
}

        const m = /^([—–−-]|\d+(?:\.\d+)?|\.\d+)\s*%?$/.exec(value);


        if (!m) break;

        vals[metric] = toNumber(m[1]);

        evidence[metric] = {
          page: pg.page,
          source: 'Global X positioned latest-year ratio table',
          method: 'native-pdfjs-geometry'
        };

        seen++;
        break;
      }
    }

    if (seen === 3) {
      return [{
        cls: 'ETF Units',
        values: vals,
        quality: 3,
        evidence
      }];
    }
  }

  return [];
}

// Include Listed Accumulating Units alongside Listed CAD/USD Units.
// Inspect the right financial-ratio column only, not unrelated left-side
// Net Assets per Unit tables or future period announcements.
function parseBmoAccumulating(pages){
 const out=new Map();for(const pg of pages){
  for(const col of [pg.rightText,pg.leftText]){
   if(!col||!/Listed\s+Accumulating\s+Units/i.test(col)||!/Portfolio\s+turnover\s+rate/i.test(col))continue;
   const lines=col.split(/\r?\n/),start=lines.findIndex(s=>/Listed\s+Accumulating\s+Units/i.test(s));
   if(start<0)continue;const r=bmoCollectRatios(lines.slice(start),pg.page);
   if(r.quality===3)out.set('Listed Accumulating Units',{cls:'Listed Accumulating Units',...r});
  }
 }return [...out.values()];
}
function parseAdditional(pages,p){
 if(p.key==='ci')return parseCI(pages);
 if(p.key==='first_trust')return parseFirstTrust(pages);
 if(p.key==='scotia')return parse1832Complete(pages);
 if(p.key==='td'){const r=parseTd(pages);return r.length?r:parseTdEtfFallback(pages);}
 if(p.key==='fidelity')return parseFidelity(pages);
 if(p.key==='lysander')return parseLysander(pages);
 if(p.key==='pender')return parsePender(pages);
 if(p.key==='harvest')return parseHarvest(pages);
 if(p.key==='agf')return parseAGF(pages);
 if(p.key==='ig_mackenzie')return parseIgHistorical(pages,p);
 if(p.key==='mackenzie'){const main=parseMackenzie(pages);return main.length?main:parseMackenzieEtfColumns(pages,identifyFund(pages,p),reportDate(pages));}
 if(p.key==='brandes')return parseBrandes(pages);
 if(p.key==='nei')return parseNEI(pages);
 if(p.key==='vanguard'){const r=parseVanguard(pages);return r.length?r:parseVanguardB2(pages);}
 if(p.key==='ninepoint')return parseNinepoint(pages);
 if(p.key==='global_x'){const r=parseGlobalX(pages);if(r.length)return r;const b=parseGlobalXB2(pages);if(b.length)return b;const w=parseGlobalXWrappedRatios(pages,reportDate(pages));return w.length?w:parseGlobalXPositionedRatios(pages,reportDate(pages));}
 if(p.key==='cibc')return parseCibc(pages);
 if(p.key==='hamilton')return parseHamilton(pages);
 if(p.key==='newgen')return parseNewGen(pages);
 if(p.key==='rpia')return parseRP(pages);
 if(p.key==='leith_wheeler')return parseLeith(pages);
 return [];
}

// Completeness indicator is informational: it does NOT invent data or
// suppress valid all-dash rows. It compares printed ratio-table headings
// against extracted rows for recognized multi-class formats.
function ratioHeadingAudit(pages,p,parsed){
 const potential=new Set(),actual=new Set(parsed.map(r=>String(r.cls||'').toLowerCase()));
 for(const pg of pages){
  let text=pg.text;const ix=text.search(/Ratios?\s+and\s+Supplemental\s+Data/i);
  if(p.key==='ci'){
   if(ix<0)continue;
   for(const line of text.slice(ix).split(/\r?\n/)){
    const m=/^\s*(Series\s+[A-Z][A-Z0-9]*)(?:\s*\(\d+\))*\s*$/i.exec(line);
    if(m)potential.add(m[1]);
   }
  }else if(p.key==='dynamic'||p.key==='scotia'){
   // Pages without the ratio heading may continue the dated table with
   // 'As at' and a row of management/trading expense labels.
   if(ix<0 && !/\bAs\s+at\b/i.test(text.slice(0,650)))continue;
   if(ix>=0)text=text.slice(ix);
   for(const line of text.split(/\r?\n/)){
    const m=/^\s*(Series\s+[A-Z][A-Z0-9]*(?:\s*\(USD\))?|ETF(?:H)?\s+Series)(?:\s*[–-].*)?\s*$/i.exec(line);
    if(m)potential.add(m[1].replace(/\s+/g,' '));
   }
  }else if(p.key==='bmo'){
   if(ix<0)continue;
   for(const line of text.slice(ix).split(/\r?\n/)){
    const m=/\b(Listed\s+(?:(?:CAD|USD|Accumulating)\s+)?Units)\b/i.exec(line);
    if(m)potential.add(m[1].replace(/\s+/g,' '));
   }
  }
 }
 const missing=[...potential].filter(x=>!actual.has(x.toLowerCase()));
 return potential.size ? {seen:potential.size,extracted:parsed.length,possibleMissing:missing} : null;
}
// BMG's landscape two-page MRFP spreads store the text rotated 90 degrees
// in PDF coordinates. Never use the generic line scanner for these tables:
// row identity is a native PDF x band, while year/value columns run along y.
function bmgRotatedTables(pages){
 const date=reportDate(pages),year=Number(date?.slice(0,4));
 if(!year)return [];
 const metricRe={MER:/^Management expense ratio\s*\(%\)/i,
                 TER:/^Trading expense ratio\s*\(%\)/i,
                 PTR:/^Portfolio turnover rate\s*\(%\)/i};
 const out=[];
 for(const pg of pages){
  if(pg.ocrUsed||!Array.isArray(pg.items)||!pg.items.length)continue;
  const items=pg.items.filter(it=>Number.isFinite(it.x)&&Number.isFinite(it.y));
  const heads=items.map(it=>{const m=/^THE FUND[’']S NET ASSETS PER (CLASS\s+[A-Z][A-Z0-9-]*)\s+UNITS?$/i.exec(clean(it.str));
    return m?{cls:m[1],at:it}:null;}).filter(Boolean);
  for(const h of heads){
   const sect=items.filter(it=>/^RATIOS AND SUPPLEMENTAL DATA\s*:/i.test(clean(it.str))
    &&it.x>h.at.x+45&&it.x<h.at.x+230&&Math.abs(it.y-h.at.y)<9);
   if(sect.length!==1)continue;
   const yearHeads=items.filter(it=>clean(it.str)===String(year)&&Math.abs(it.x-h.at.x)<3.5
     &&it.y>h.at.y+80&&it.y<h.at.y+360);
   if(yearHeads.length!==1)continue;
   const yearY=yearHeads[0].y,values={},evidence={};let quality=0,valid=true;
   for(const [key,re] of Object.entries(metricRe)){
    const labels=items.filter(it=>re.test(clean(it.str))&&it.x>sect[0].x+8&&it.x<sect[0].x+56
      &&Math.abs(it.y-sect[0].y)<5);
    if(labels.length!==1){valid=false;break;}
    const label=labels[0];
    // 2020 data lies below that year's printed heading, no fixed pixel positions.
    const candidates=items.filter(it=>Math.abs(it.x-label.x)<1.6&&it.y>=yearY-3&&it.y<yearY+18
      &&/^(?:\d+(?:\.\d+)?|[—–−-]{1,2}|n\/?a)$/i.test(clean(it.str)));
    if(candidates.length!==1){valid=false;break;}
    values[key]=toNumber(candidates[0].str);quality++;
    evidence[key]={page:pg.page,source:key+' (BMG latest-year ratio table)',method:'native-js'};
   }
   if(valid&&quality===3)out.push({cls:h.cls.replace(/^class/i,'Class'),values,evidence,quality});
  }
 }
 return [...new Map(out.map(r=>[r.cls.toLowerCase(),r])).values()];
}
// BMG also publishes upright (single-page) Financial Highlights reports.
// Parse by actual Class heading, current-year column and ratio-row coordinates;
// PDF.js may split years, class headings and decimals into adjacent glyph runs.
function bmgUprightTables(pages){
 const date=reportDate(pages),year=Number(date?.slice(0,4));
 if(!year)return [];
 const norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const definitions={MER:/^MANAGEMENTEXPENSERATIO(?!BEFORE)/,
  TER:/^TRADINGEXPENSERATIO/,PTR:/^PORTFOLIOTURNOVERRATE/};
 const result=[];
 for(const page of pages){
  if(page.ocrUsed||!Array.isArray(page.items)||!page.items.length)continue;
  const lines=[];
  for(const it of page.items){
   if(typeof it.str!=='string'||!it.str.trim()||!Number.isFinite(it.x)||!Number.isFinite(it.y))continue;
   let l=lines.find(x=>Math.abs(x.y-it.y)<2.4);
   if(!l){l={y:it.y,items:[]};lines.push(l);}l.items.push(it);
  }
  lines.forEach(l=>l.items.sort((a,b)=>a.x-b.x));
  lines.sort((a,b)=>b.y-a.y);
  const titleOf=l=>norm(l.items.filter(i=>i.x<300).map(i=>i.str).join(''));
  const heads=lines.map((l,idx)=>{
   const m=/^THEFUNDSNETASSETSPERCLASS([A-Z][A-Z0-9]*)UNITS?$/.exec(titleOf(l));
   return m?{cls:'Class '+m[1],index:idx,line:l}:null;
  }).filter(Boolean);
  for(let n=0;n<heads.length;n++){
   const h=heads[n],end=heads[n+1]?.index??lines.length,band=lines.slice(h.index+1,end);
   // Detect the first reporting-year column from the header, even if 2019
   // appears as two separately positioned PDF.js tokens: "201" + "9".
   const titleItems=h.line.items.filter(it=>it.x<300);
   const titleEnd=Math.max(...titleItems.map(it=>it.x+it.w));
   const yrItems=h.line.items.filter(it=>it.x>titleEnd+14&&/^\d/.test(it.str)).sort((a,b)=>a.x-b.x);
   if(!yrItems.length)continue;
   const yrStart=yrItems[0].x;
   const firstYearParts=[];let last=null,nextYearX=null;
   for(const it of yrItems){
    if(last&&it.x-(last.x+last.w)>13){nextYearX=it.x;break;}
    firstYearParts.push(it.str.replace(/\D/g,''));last=it;
   }
   if(firstYearParts.join('')!==String(year))continue;
   if(!nextYearX){ // Single-year tables also occur; no adjacent prior-year cell.
    nextYearX=yrStart+Math.max(42,Number(page.width||600)*.07);
   }
   const startX=yrStart-14,stopX=yrStart+(nextYearX-yrStart)/2;
   const section=band.filter(l=>/^RATIOSANDSUPPLEMENTALDATA/.test(titleOf(l)));
   if(section.length!==1)continue;
   const metrics={},evidence={};let valid=true;
   for(const [metric,re] of Object.entries(definitions)){
    const labelRows=band.filter(l=>l.y<section[0].y-4&&re.test(titleOf(l)));
    if(labelRows.length!==1){valid=false;break;}
    const l=labelRows[0];
    const parts=l.items.filter(it=>it.x>=startX&&it.x<stopX)
     .sort((a,b)=>a.x-b.x);
    if(!parts.length){valid=false;break;}
    // Join only the validated current-year cell; no cross-column joining.
    const literal=parts.map(it=>it.str.replace(/\s/g,'')).join('');
    if(!/^(?:\d+(?:\.\d+)?|\.\d+|[—–−-]{1,2}|n\/?a)$/i.test(literal)){
     valid=false;break;
    }
    metrics[metric]=toNumber(literal);
    evidence[metric]={page:page.page,source:metric+' (BMG upright latest-year table)',method:'native-js'};
   }
   if(valid)result.push({cls:h.cls,values:metrics,evidence,quality:3});
  }
 }
 return [...new Map(result.map(r=>[r.cls.toLowerCase(),r])).values()];
}
function analyzePages(pages,{onProgress=()=>{}}={}){
 const p=detectFmc(pages);if(!p)return {results:[],diagnostics:[{warning:'Unrecognized or ambiguous FMC; no financial values guessed.'}],raw:[],profile:null};
 const fund=identifyFund(pages,p);const date=p.key==='middlefield'?middlefieldReportDate(pages):p.key==='brandes'?brandesDate(pages):reportDate(pages);
 let parsed=[];
 if(p.key==='bmg'){
  const rotated=bmgRotatedTables(pages),upright=bmgUprightTables(pages);
  parsed=[...new Map([...rotated,...upright].map(r=>[r.cls.toLowerCase(),r])).values()];
 }
 else if(p.style==='bmo'){parsed=bmoTable(pages);
 const more=parseBmoAccumulating(pages);for(const r of more)if(!parsed.some(x=>x.cls===r.cls))parsed.push(r);}
 else if(p.key==='first_trust')parsed=parseFirstTrust(pages);
 else if(EXTRA_STYLES.has(p.style))parsed=parseAdditional(pages,p);
 else if(p.style==='blackrock'){parsed=parseBlackrockB2(pages);if(!parsed.length)parsed=parseBlackrockDottedEtf(pages,fund,date);if(!parsed.length)parsed=scanSingleFund(pages,p);}
 else if(p.style==='rbc'||p.style==='dynamic'){parsed=rowTable(pages,p);if(p.style==='rbc'&&!parsed.length)parsed=parseRbcEtfFallback(pages,fund);if(p.style==='dynamic'){if(!parsed.length)parsed=parseDynamicSingleEtf(pages,fund,date);const extra=parse1832Complete(pages);const map=new Map(parsed.map(x=>[x.cls,x]));for(const x of extra)if(!map.has(x.cls))map.set(x.cls,x);parsed=[...map.values()];}}
 else if(p.style==='middlefield'){parsed=middlefieldTable(pages);const extra=middlefieldFallback(pages,fund,date);const found=new Set(parsed.map(x=>x.cls.toLowerCase()));for(const row of extra)if(!found.has(row.cls.toLowerCase()))parsed.push(row);}
 else if(p.style==='manulife'||p.style==='purpose')parsed=tableBlocks(pages,p,{allowWithoutRatio:true});
 
else if(p.style==='sun_life'){
  const positioned = parseSunLifePositioned(pages);
  parsed = positioned.length
    ? positioned
    : tableBlocks(pages,p,{allowWithoutRatio:true});
}


 else parsed=simpleTable(pages,p);
 // Keep explicitly recognized iShares unit classes; only the legacy
 // generic scanSingleFund() path needs a missing class label.
 if(p.style==='blackrock' && !parsed.some(r=>/^(?:CAD|USD) Units$/i.test(r.cls||'')))parsed.forEach(r=>{if(!r.cls)r.cls=fund;});
 if(['manulife','purpose','sun_life'].includes(p.style))parsed=[...new Map(parsed.map(x=>[x.cls,x])).values()];
 // Additional fallback: if a regular class-sliced report has only a date-row table, try it.
 if(!parsed.length&&p.style!=='rbc'&&p.style!=='dynamic')parsed=rowTable(pages,p);
 const rows=parsed.filter(r=>r.cls&&r.quality>=2).map(r=>makeRow(r.cls,p,fund,date,r.values,r.evidence,fund==='Unknown Fund'));
 const audit=ratioHeadingAudit(pages,p,parsed);
 const diagnostics=[{fmc_detection:{status:'matched',fmc_key:p.key},report_date:date,extraction_method:'native-js',fund_name:fund,fmc_label:p.label,classes:rows.length,...(audit?{series_completeness:audit}:{})},...pages.map(x=>({page:x.page,mode:x.ocrUsed?'ocr-fallback':'native-pdfjs'}))];
 return {results:rows,diagnostics,raw:[],profile:p};
}


global.MRFP_ENGINE={analyzePages,detectFmc,reportDate,REGISTRY,groupLines:undefined};
})(globalThis);
