// PassMark syllabus parser test (pdf.js, no AI). Usage: node syllabus-parser-test.mjs file1.pdf file2.pdf
// Reads IE syllabi: course name, sessions, credits, evaluation table (names + weights), minimum final-exam grade, sub-parts like "Assignment #1 (5%)", and "best X of Y" quizzes.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";
const NUM = "(\\d+(?:[.,]\\d+)?)";
const num = s => parseFloat(s.replace(",", "."));
async function load(path){
  const doc = await getDocument({data:new Uint8Array(fs.readFileSync(path)), verbosity:0}).promise;
  const items=[];
  for(let p=1;p<=doc.numPages;p++){
    const c=await (await doc.getPage(p)).getTextContent();
    for(const it of c.items){const s=it.str.trim(); if(!s) continue;
      items.push({s, page:p, x:it.transform[4], y:it.transform[5], w:it.width, h:it.height||10});}
  }
  return items;
}
function header(items){
  const first = items.filter(i=>i.page===1).map(i=>i.s);
  const txt = first.join(" | ");
  const title=[]; for(let i=first.indexOf(first.find(s=>/^Edited by Documentation$/.test(s)))+2;i<first.length && !/^Grado en|^Bachelor/.test(first[i]);i++) title.push(first[i]);
  const g=(re)=>{const m=txt.match(re); return m?m[1]:null;};
  return {course:title.join(" ").replace(/\s+/g," "), sessions:g(/Number of sessions:\s*(\d+)/), credits:g(/Number of credits:\s*([\d.]+)/)};
}
function parse(items){
  const start=items.findIndex(i=>/^EVALUATION CRITERIA$/i.test(i.s));
  if(start<0) return {error:"No EVALUATION CRITERIA section"};
  let end=items.findIndex((i,k)=>k>start && /^(RE-?SIT|RE-?TAKE)/i.test(i.s)); if(end<0) end=items.length;
  const sec=items.slice(start,end);
  const hIdx=sec.findIndex(i=>/^criteria$/i.test(i.s));
  if(hIdx<0) return {error:"No criteria table"};
  const hdr=sec[hIdx];
  const hdrPct=sec.find(i=>/^percentage$/i.test(i.s) && i.page===hdr.page);
  const hdrCom=sec.find(i=>/^comments$/i.test(i.s) && i.page===hdr.page);
  const body=sec.slice(hIdx+1).filter(i=>!(/^\d+$/.test(i.s)||/^Edited by Documentation$/i.test(i.s)||/^\d{1,2}(st|nd|rd|th) \w+ \d{4}$/.test(i.s)));
  const pcts=body.filter(i=>new RegExp("^"+NUM+"\\s*%$").test(i.s));
  // stop at first item clearly after table: a line starting at left margin that is long prose after last pct is handled by nearest-row + distance limit
  const rows=pcts.map(p=>({p, name:[], comments:[]}));
  const lineH = 14;
  for(const it of body){
    if(pcts.includes(it)) continue;
    const same=rows.filter(r=>r.p.page===it.page);
    if(!same.length) continue;
    let best=null,bd=1e9; for(const r of same){const d=Math.abs(r.p.y-it.y); if(d<bd){bd=d;best=r;}}
    if(it.x+it.w <= best.p.x+1){ if(bd<=lineH*1.6) best.name.push(it); }
    else if(bd<=lineH*4 && !(it.page===hdr.page && Math.abs(it.y-hdr.y)<3)) best.comments.push(it);
  }
  const out=rows.map(r=>{
    const name=r.name.sort((a,b)=>b.y-a.y||a.x-b.x).map(i=>i.s).join(" ").replace(/\s+/g," ").trim();
    const comment=r.comments.sort((a,b)=>(Math.round(a.x/30)-Math.round(b.x/30))||(b.y-a.y)).map(i=>i.s).join(" ").replace(/\s+/g," ").trim();
    const row={name, weight:num(r.p.s.match(new RegExp(NUM))[1])};
    const m=comment.match(new RegExp("minimum(?: passing)?(?: grade)?(?: of)?:?\\s*"+NUM,"i")); if(m) row.minGrade=num(m[1]);
    const parts=[...comment.matchAll(new RegExp(NUM+"\\s*%","g"))].map(x=>num(x[1]));
    if(parts.length>1 && Math.abs(parts.reduce((a,b)=>a+b,0)-row.weight)<0.01){
      const segs=comment.split(new RegExp("\\(?\\s*"+NUM+"\\s*%[^)]*\\)?"));
      let last=""; row.suggestedSplit=parts.map((w,k)=>{let lab=(segs[k*2]||"").replace(/\b(and|or|the)\b/gi," ").trim().split(/\s+/).slice(-2).join(" ");
        if(/^#/.test(lab)&&last) lab=last.split(" ")[0]+" "+lab; if(!lab) lab=row.name+" part "+(k+1); last=lab; return {name:lab, weight:w};});
    }
    return row;
  });
  // rebuild real lines from positions (pdf.js item order can be scrambled), then read the prose after EVALUATION CRITERIA
  const after=items.slice(start);
  const lines=[]; for(const it of after){let L=lines.find(l=>l.page===it.page&&Math.abs(l.y-it.y)<3); if(!L){L={page:it.page,y:it.y,its:[]};lines.push(L);} L.its.push(it);}
  lines.sort((a,b)=>a.page-b.page||b.y-a.y);
  const prose=lines.map(l=>l.its.sort((a,b)=>a.x-b.x).map(i=>i.s).join(" ")).join(" ").replace(/\s+/g," ");
  const fe=out.find(r=>/final exam/i.test(r.name));
  const pm=prose.match(new RegExp("minimum(?: passing)?(?: grade| threshold)?(?: of)?\\s*"+NUM+"\\s*(?:is required )?(?:in|on) the final exam","i"));
  if(pm && fe && fe.minGrade==null) fe.minGrade=num(pm[1]);
  const W={two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
  const toN=x=>W[x.toLowerCase()]??parseInt(x);
  const bm=prose.match(/(?:the\s+)?(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+best\s+(quizzes|tests|quiz|assignments)/i)||prose.match(/best\s+(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(quizzes|tests|assignments)/i);
  const cm=prose.match(/(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(quizzes|tests)\b/i);
  const tr=out.find(r=>/test|quiz/i.test(r.name));
  if(tr && cm){tr.count=toN(cm[1]); if(bm) tr.bestOf=toN(bm[1]);}
  const total=Math.round(out.reduce((a,r)=>a+r.weight,0)*100)/100;
  return {rows:out,total,ok:total===100};
}
for(const f of process.argv.slice(2)){const items=await load(f); console.log("\n### "+f.split("/").pop()); console.log(JSON.stringify({...header(items),...parse(items)},null,1));}
