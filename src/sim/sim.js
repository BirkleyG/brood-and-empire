import { ARCH, WORLD_SIZES, CONCEPTS, CTRAITS, CTRAIT_WORD, ERAS, GLOSS, GOVS, NUMW, PERSONAL, QUIRKS, RULES, TECH, TRAITS, TRAIT_LABEL, VALUES, VALUE_LABEL, archetypeOf, bodyDesc, cap, clamp, creatureGenome, gdist, hueDist, lerp, mulberry32, nEyes, nLimbs } from './data.js';
import { ALPHA_POOLS, SCRIPT_INFO, SYLL_POOLS, writeScript } from './scripts.js';

function makeSim(seed,opts={}){
  const R=mulberry32(seed);
  // World size is ONE parameter: opts.size names a preset in WORLD_SIZES (data.js). 'standard' is the original
  // 2400x1560 world and must stay bit-for-bit identical (same R() draws in the same order) so old seeds replay.
  // Gameplay distances (war reach, trade, unrest per distance, settling) stay in absolute world units on purpose:
  // a bigger map should mean more room and more peoples, not stretched distances. Counts (herds, arrivals, caps)
  // scale with area instead: AR = area ratio to Standard, LIN = linear ratio.
  const SIZE=WORLD_SIZES[opts.size]?opts.size:'standard',SP=WORLD_SIZES[SIZE];
  const W=SP.W,H=SP.H,TS=20,GW=W/TS,GH=Math.ceil(H/TS);
  const AR=W*H/(2400*1560),LIN=Math.sqrt(AR);
  const CAP=opts.cap||SP.cap;
  const gauss=()=>{let u=0,v=0;while(!u)u=R();while(!v)v=R();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
  const pick=a=>a[Math.floor(R()*a.length)];
  const shuffle=a=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b};
  const S={roads:{},seed,size:SIZE,cap:CAP,W,H,TS,GW,GH,year:0,agents:[],facs:[],setts:[],events:[],cairns:[],ruins:[],routes:[],pulses:[],fxq:[],pophist:[],battles:{},rels:{},chars:[],langs:[],names:[],wonders:[],nukes:0,blights:[],nextId:1,world:{foodMult:1,foodUntil:0,mutBurst:0,mutUntil:0},yearAcc:0,onEvent:null,mutRate:1,terrainDirty:false,dirtyBox:null,radDirty:false,livePop:0};
  const id=()=>S.nextId++;
  const agentById=new Map();const reindexAgents=()=>{agentById.clear();for(const a of S.agents)agentById.set(a.id,a)};
  const yr=()=>Math.floor(S.year);

  // ---------- terrain ----------
  const N=256,perm=new Float32Array(N*N);for(let i=0;i<perm.length;i++)perm[i]=R();
  const vn=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;const g=(a,b)=>perm[((a&255)*N+(b&255))];const s=t=>t*t*(3-2*t);const u=s(xf),v=s(yf);return lerp(lerp(g(xi,yi),g(xi+1,yi),u),lerp(g(xi,yi+1),g(xi+1,yi+1),u),v)};
  const fbm=(x,y)=>(vn(x,y)*.5+vn(x*2.03,y*2.03)*.25+vn(x*4.1,y*4.1)*.125+vn(x*8.3,y*8.3)*.0625)/.9375;
  const ox=R()*100,oy=R()*100;
  const hgt=new Float32Array(GW*GH),moi=new Float32Array(GW*GH);
  // Standard keeps the original single-island formula. Larger worlds keep the same noise frequency per world unit
  // (same detail), but the land is laid out as ~3*LIN separate continents: a soft mask from randomly placed, well-spaced,
  // warped ellipses raises the ground, so seas open up between them and the landmass count grows with area.
  // Moisture also gets latitude bands so deserts and wet belts repeat across a big map.
  const BIG=LIN>1.001;
  let conts=null;const nC=Math.round(3*LIN),rr=0.7*Math.sqrt(0.5*W*H/(Math.PI*nC));
  if(BIG){conts=[];
    for(let c=0;c<nC;c++){let best=null,bd=-1;for(let t=0;t<14;t++){const x=W*(.08+.84*R()),y=H*(.1+.8*R());let d=1e9;for(const o of conts)d=Math.min(d,Math.hypot(o.x-x,o.y-y));if(conts.length===0)d=1e9-t;if(d>bd){bd=d;best={x,y}}}
      conts.push({x:best.x,y:best.y,ax:rr*(0.75+R()*0.6),ay:rr*(0.75+R()*0.6)})}}
  const sstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const dx=(i/GW-.5)*2,dy=(j/GH-.5)*2,d=Math.sqrt(dx*dx*.8+dy*dy);
    if(!BIG){hgt[j*GW+i]=fbm(i/17+ox,j/17+oy)*.8+.35-d*.32;moi[j*GW+i]=fbm(i/13+oy+50,j/13+ox+50)}
    else{const px=i*TS,py=j*TS,wx=(fbm(i/40+ox+300,j/40+oy+300)-.5)*rr*1.3,wy=(fbm(i/40+oy+700,j/40+ox+700)-.5)*rr*1.3;
      let m=0;for(const c of conts){const u=(px+wx-c.x)/c.ax,v=(py+wy-c.y)/c.ay,g=Math.exp(-(u*u+v*v));if(g>m)m=g}
      hgt[j*GW+i]=fbm(i/17+ox,j/17+oy)*.55+.2+sstep(.12,.62,m)*.55;
      moi[j*GW+i]=fbm(i/13+oy+50,j/13+ox+50)+.2*Math.sin(j/GH*Math.PI*(LIN+1)+ox)}}
  const sorted=[...hgt].sort((a,b)=>a-b),q=p=>sorted[Math.floor(p*(sorted.length-1))];
  const tDeep=q(BIG?.40:.30),tShal=q(BIG?.51:.40),tRock=q(.94),ms=[...moi].sort((a,b)=>a-b),mDry=ms[Math.floor(ms.length*.25)],mWet=ms[Math.floor(ms.length*.62)];
  const ter=new Uint8Array(GW*GH),food=new Float32Array(GW*GH),fmax=new Float32Array(GW*GH),rad=new Float32Array(GW*GH);
  const FM=[2.5,4,8,10,3,1.2];
  for(let k=0;k<GW*GH;k++){const h=hgt[k],m=moi[k];let t=h<tDeep?0:h<tShal?1:h>tRock?5:m>mWet?3:m<mDry?4:2;ter[k]=t;fmax[k]=FM[t]*(0.8+R()*0.4);food[k]=fmax[k]}
  S.ter=ter;S.food=food;S.fmax=fmax;S.hgt=hgt;S.rad=rad;
  const tIdx=(x,y)=>{const i=clamp(Math.floor(x/TS),0,GW-1),j=clamp(Math.floor(y/TS),0,GH-1);return j*GW+i};S.tIdx=tIdx;
  const isLand=(x,y)=>ter[tIdx(x,y)]>=2;
  const passable=(a,x,y)=>{if(x<4||y<4||x>W-4||y>H-4)return false;const t=ter[tIdx(x,y)];if(t===0)return a.g.aquatic>0.42||a.g.flight>0.45||a.titan||S.facs[a.fac].tech.navigation;return true};
  const tMult=(a,x,y)=>{const t=ter[tIdx(x,y)],g=a.g;if(g.flight>0.5)return 1.1;if(t<=1)return 0.35+g.aquatic*0.9+(S.facs[a.fac].tech.navigation?0.4:0);if(t===5)return 0.55;if(t===3)return 0.85;return 1};
  const TN={0:['Sea','Deep','Sound'],1:['Shallows','Shoals','Bay'],2:['Plain','Meadows','Downs'],3:['Wood','Thicket','Weald'],4:['Waste','Barrens','Dustlands'],5:['Teeth','Crags','Heights']};
  const TA=['Ashen','Weeping','Hollow','Glass','Red','Silent','Broken','Low','Pale','Sunken','Bitter','Bright','Cold','Grey','Drowned','Singing','Crooked','Last'];
  const RX=4*Math.round(LIN),RY=3*Math.round(LIN);// region grid: same ~600x520 cell size at every world size
  S.regions=[];for(let rj=0;rj<RY;rj++)for(let ri=0;ri<RX;ri++){const cnt=[0,0,0,0,0,0];for(let j=Math.floor(rj*GH/RY);j<Math.floor((rj+1)*GH/RY);j++)for(let i=Math.floor(ri*GW/RX);i<Math.floor((ri+1)*GW/RX);i++)cnt[ter[j*GW+i]]++;let best=0;for(let t=0;t<6;t++)if(cnt[t]>cnt[best])best=t;S.regions.push('the '+pick(TA)+' '+pick(TN[best]))}
  const regionName=(x,y)=>S.regions[clamp(Math.floor(y/H*RY),0,RY-1)*RX+clamp(Math.floor(x/W*RX),0,RX-1)];S.regionName=regionName;
  function landPoint(){for(let t=0;t<500;t++){const x=40+R()*(W-80),y=40+R()*(H-80),tt=ter[tIdx(x,y)];if((tt===2||tt===3)&&rad[tIdx(x,y)]<0.1)return{x,y}}return{x:W/2,y:H/2}}

  // ---------- language ----------
  const CPOOL=['p','t','k','b','d','g','m','n','s','z','f','v','h','l','r','w','y','ch','sh','th'],VPOOL=['a','e','i','o','u'];
  const OKI=/^(br|kr|tr|dr|gr|pr|fr|st|sk|sp|sh|ch|th|pl|kl|fl|bl|gl|sl|sn|sm|sw|tw|kw)/;
  function tidy(w){if(/^[^aeiouy]{2}/.test(w)&&!OKI.test(w))w=w.slice(1);w=w.replace(/([^aeiouy])[^aeiouy]([^aeiouy])/g,(m,a,b)=>/^(ch|sh|th)$/.test(m.slice(1))?m:a+b);w=w.replace(/([aeiou])\1+/g,'$1').replace(/[aeiouy]{3,}/g,m=>m.slice(0,2)).replace(/([^aeiou])\1+/g,'$1').replace(/^([aeiou])[aeiou]/,'$1');if(w.length>9)w=w.slice(0,9).replace(/[^aeiou]{2}$/,m=>m[0]);return w}
  function genWord(L,syl){let w='';for(let i=0;i<syl;i++){const p=pick(L.pats);for(const ch of p)w+=ch==='C'?pick(L.C):pick(L.V)}return tidy(w)}
  function newLang(parent){
    const L={id:S.langs.length,parent:parent?parent.id:null,children:[],born:yr(),stage:parent?parent.stage:0,lex:{},changes:[],snaps:[],nextShift:yr()+30+R()*40,fac:null,script:parent?parent.script:'picto',swaps:parent?{...parent.swaps}:{},scriptHist:[]};
    if(parent&&parent.script&&parent.script!=='picto'&&parent.script!=='han'){const cs=['p','t','k','b','d','g','m','n','s','z','f','v','l','r'];const a=pick(cs),b=pick(cs);if(a!==b){L.swaps[a]=b}}
    L.scriptHist.push({yr:yr(),script:L.script,why:parent?'inherited from the mother tongue':'first marks'});
    if(parent){L.C=[...parent.C];L.V=[...parent.V];L.pats=[...parent.pats];L.lex={...parent.lex};parent.children.push(L.id)}
    else{L.C=shuffle(CPOOL).slice(0,7+Math.floor(R()*5));L.V=shuffle(VPOOL).slice(0,3+Math.floor(R()*3));L.pats=shuffle(['CV','CVC','CV','CVC','VC','CCV']).slice(0,3);const used=new Set();for(const c in CONCEPTS){let w;for(let t=0;t<8;t++){w=genWord(L,R()<.45?1:2);if(w.length>=2&&!used.has(w))break}used.add(w);L.lex[c]=w}}
    S.langs.push(L);if(parent){for(let i=0;i<3;i++)soundShift(L,true);for(const c in L.lex)if(R()<0.3)L.lex[c]=genWord(L,R()<.45?1:2)}
    langSnap(L,parent?'Split from the mother tongue':'First signs');return L;
  }
  function langSnap(L,why){const w={},nat={};for(const c of ['sun','water','people','war','god','king','mother','death']){w[c]=L.lex[c];nat[c]=writeScript(L.lex[c],[c],L.script||'picto',L.swaps)}L.snaps.push({yr:yr(),stage:L.stage,words:w,nat,script:L.script,why})}
  function compose(L,concepts){let w=concepts.map(c=>L.lex[c]||'a');let f=w[0];for(let i=1;i<w.length;i++){let nx=w[i];if(f.length+nx.length>9)nx=nx.slice(0,Math.max(2,9-f.length));if(/[aeiou]$/.test(f)&&/^[aeiou]/.test(nx))nx=nx.slice(1);if(/[^aeiou]$/.test(f)&&/^[^aeiou]{2}/.test(nx))nx=nx.slice(1);f+=nx}return tidy(f)}
  function mkPersonal(L){let con,form;for(let t=0;t<12;t++){con=[pick(PERSONAL),pick(PERSONAL)];if(con[0]===con[1])continue;form=tidy(genWord(L,2));if(form.length<3)form=tidy(form+genWord(L,1));if(form.length>7)form=form.slice(0,6).replace(/[^aeiou]{2}$/,m=>m[0]);const g=con.join();if(!S.chars.some(c=>{const n=S.names[c.nameId];return n.lang===L.id&&(n.concepts.join()===g||n.form===form)}))break}const n={id:S.names.length,lang:L.id,concepts:con,form,hist:[{yr:yr(),stage:L.stage,form,why:'given at birth'}],personal:1};S.names.push(n);return n.id}
  function mkName(L,concepts,why){const n={id:S.names.length,lang:L.id,concepts:[...concepts],form:compose(L,concepts),hist:[]};n.hist.push({yr:yr(),stage:L.stage,form:n.form,why:why||'first named'});S.names.push(n);return n.id}
  function syllab(f0){const f=f0.replace(/ch/g,'Ç').replace(/sh/g,'Š').replace(/th/g,'Þ');return f.replace(/([aeiouy]+)(?=[^aeiouy-][aeiouy])/g,'$1-').replace(/([^aeiouy-])(?=[^aeiouy-][aeiouy])/g,'$1-').replace(/^-|-$/g,'').replace(/Ç/g,'ch').replace(/Š/g,'sh').replace(/Þ/g,'th')}
  function glossOf(nid){return S.names[nid].concepts.map(c=>GLOSS[c]).join('-')}
  function nameStr(nid,stageOverride){const n=S.names[nid];if(!n)return'?';const L=S.langs[n.lang];const st=stageOverride!=null?stageOverride:L.stage;if(st===0)return n.concepts.map(c=>CONCEPTS[c]).join('')+' '+glossOf(nid);return cap(n.form)}
  function nameForm(form,stage,concepts){if(stage===0)return concepts.map(c=>CONCEPTS[c]).join('')+' '+concepts.map(c=>GLOSS[c]).join('-');return cap(form)}
  S.nameStr=nameStr;S.glossOf=glossOf;S.nameForm=nameForm;
  function renameAll(L,why){for(const n of S.names)if(n.lang===L.id){const nf=compose(L,n.concepts);if(nf!==n.form||why){n.form=nf;n.hist.push({yr:yr(),stage:L.stage,form:n.form,why})}}}
  function soundShift(L,silent){
    const order=shuffle(RULES);for(const [d,fn] of order){let changed=0;const nl={};for(const c in L.lex){let w=tidy(fn(L.lex[c]));if(w.length<2||!/[aeiou]/.test(w))w=L.lex[c];if(w!==L.lex[c])changed++;nl[c]=w}
      if(changed<3)continue;const ex=Object.keys(nl).find(c=>nl[c]!==L.lex[c]);const before=L.lex[ex];L.lex=nl;
      const ch={yr:yr(),d,ex:[ex,before,nl[ex]]};L.changes.push(ch);
      for(const n of S.names)if(n.lang===L.id){let nf=tidy(fn(n.form));if(nf.length<2||!/[aeiou]/.test(nf))nf=n.form;if(nf!==n.form){n.form=nf;n.hist.push({yr:yr(),stage:L.stage,form:nf,why:'sound change: '+d})}}
      if(!silent){langSnap(L,'Sound change: '+d);const f=S.facs.find(x=>x.lang===L.id&&x.died==null);if(f&&L.stage>0)log('lang',1,`Sound change among the ${f.name}`,`In the tongue of the ${f.name}, ${d}. The word for ${GLOSS[ex].toLowerCase()} was "${before}"; now it is "${nl[ex]}". Their place names drift with it.`,f.origin.x,f.origin.y,[f])}
      return true}
    return false;
  }
  function setStage(f,st,why){const L=S.langs[f.lang];if(L.stage>=st)return;const oldStage=L.stage;const ex=S.names[f.nameId];const before=nameForm(ex.form,oldStage,ex.concepts);L.stage=st;for(const n of S.names)if(n.lang===L.id)n.hist.push({yr:yr(),stage:st,form:n.form,why});langSnap(L,why);refreshNames(f);
    const capS=capitalOf(f);const cs=capS?S.names[capS.nameId]:null;
    if(st===1)log('lang',2,`${f.name} speak their names`,`Until now ${f.species} named things with pictures alone. Now the pictures have sounds: ${before} is spoken "${cap(ex.form)}"${cs?`, and their home ${nameForm(cs.form,0,cs.concepts)} becomes ${cap(cs.form)}`:''}.`,f.origin.x,f.origin.y,[f],{why:[`They developed ${TECH.speech.n}.`]});
    if(st===2){setScript(L,'han','the old pictures were simplified into characters');log('lang',2,`${f.name} invent writing`,`The ${f.name}'s pictures harden into characters, one for every word, pressed into clay and cut into wood. Their own name is now written ${S.native(f.nameId)}. Laws, debts and grudges can now be kept.`,f.origin.x,f.origin.y,[f],{why:[`Their rulers chose to pursue Writing.`],script:'han'})}
    if(st===3&&SLEVEL[SCRIPT_INFO[L.script||'picto'].kind]<3)reformScript(f,'alpha','the printing press needs a few letters, not thousands of signs');
  }

  // ---------- events ----------
  function snapG(f){const g={};for(const k in f.g)g[k]=Math.round(f.g[k]*100)/100;const p=f._sg;if(p&&Object.keys(g).every(k=>p[k]===g[k]))return p;f._sg=g;return g}
  function snap(f){return{g:snapG(f),tech:Object.keys(f.tech).length,arch:f.arch,name:f.name,hue:f.hue,pop:f.pop,gov:f.gov}}
  function log(type,imp,title,text,x,y,facs,data){
    const e={id:id(),yr:yr(),type,imp,title,text,x,y,facs:facs.map(f=>f.id),snaps:{},data:data||{}};
    for(const f of facs)e.snaps[f.id]=snap(f);
    S.events.push(e);if(S.onEvent)S.onEvent(e);return e;
  }
  S.log=log;

  // ---------- genomes ----------
  function baseGenome(over){const g={};for(const k of TRAITS)g[k]=clamp(0.2+R()*0.15);Object.assign(g,over);return g}
  function mutate(g,f,rate,s){
    const c={...g};c._macro=undefined;const radHere=s?rad[tIdx(s.x,s.y)]:0;const burst=(S.world.mutBurst>0?3:1)*(1+radHere*6);const r=rate*burst*S.mutRate;
    for(const k of TRAITS)c[k]=clamp(c[k]+gauss()*0.04*r+(f.bias[k]||0)*0.3+(f.current[k]||0));
    if(R()<0.014*r){const k=pick(TRAITS);c[k]=clamp(c[k]+(R()<.5?-1:1)*(0.22+R()*0.3));c._macro=k}
    c.hue=((c.hue+gauss()*1.5*r)%360+360)%360;return c;
  }
  const NT=TRAITS.length,MG=new Float64Array(NT);
  function meanGenome(list){MG.fill(0);let hx=0,hy=0;for(const a of list){const ag=a.g;for(let i=0;i<NT;i++)MG[i]+=ag[TRAITS[i]];hx+=Math.cos(ag.hue*Math.PI/180);hy+=Math.sin(ag.hue*Math.PI/180)}const g={};for(let i=0;i<NT;i++)g[TRAITS[i]]=MG[i]/list.length;g.hue=((Math.atan2(hy,hx)*180/Math.PI)+360)%360;return g}
  function valuesFrom(g){return{martial:clamp(g.aggression*.7+g.carnivory*.3),faith:clamp(g.mystic*.9+.05),art:clamp(g.weirdness*.45+g.sociality*.25+g.glow*.3),trade:clamp(g.hoarding*.9+.05),knowledge:clamp(g.intellect*.8+g.curiosity*.2),order:clamp(g.sociality*.5+(1-g.weirdness)*.35),harmony:clamp(g.symbiosis*.6+(1-g.carnivory)*.35)}}
  function newCurrent(f){f.current={};for(const k of shuffle(TRAITS).slice(0,3))f.current[k]=(R()<.5?-1:1)*(0.015+R()*0.02);f.currentSince=S.year}

  // ---------- helpers ----------
  const settById=idn=>S.setts.find(s=>s.id===idn);
  const facSetts=f=>S.setts.filter(s=>s.fac===f.id);
  S.facSetts=facSetts;S.settById=settById;
  const alive=()=>S.facs.filter(f=>f.died==null);
  function capitalOf(f){const s=f.capital!=null?settById(f.capital):null;if(s&&s.fac===f.id)return s;const ss=facSetts(f);if(!ss.length){f.capital=null;return null}const b=ss.reduce((a,b)=>b.members.length>a.members.length?b:a,ss[0]);f.capital=b.id;return b}
  S.capitalOf=capitalOf;
  function nearestOwn(f,x,y){let b=null,bd=1e9;for(const s of S.setts)if(s.fac===f.id){const d=Math.hypot(s.x-x,s.y-y);if(d<bd){bd=d;b=s}}return b}
  function milTier(f){const t=f.tech;return t.computing?6:t.industry?5:t.gunpowder?4:t.iron?3:t.bronze?2:t.tools?1:0}
  const DMG=[1,1.12,1.28,1.5,1.9,2.4,3.0],RANGE=[0,0,0,0,26,32,42],ARM=[0,0,.03,.07,.07,.13,.2];
  S.milTier=milTier;
  function eraOf(f){let e=ERAS[0][1];for(const [t,n] of ERAS)if(!t||f.tech[t])e=n;return e}
  S.eraOf=eraOf;

  // ---------- relations / memory ----------
  function rel(a,b){if(a===b)return null;const k=a<b?a+'-'+b:b+'-'+a;let r=S.rels[k];if(!r)r=S.rels[k]={a:Math.min(a,b),b:Math.max(a,b),war:false,trade:false,ally:false,truce:0,since:S.year,warDeaths:0,marriage:null,tribute:null,goal:null,aggressor:null,lost:{}};return r}
  S.rel=rel;
  function mem(a,b){const fa=S.facs[a];let m=fa.mem[b];if(!m)m=fa.mem[b]={grudge:0,favor:0,notes:[]};return m}
  function note(a,b,kind,w,txt){if(a===b)return;const m=mem(a,b);m[kind]+=w;const ex=m.notes.find(n=>n.txt===txt&&n.kind===kind);if(ex)ex.w+=w;else{m.notes.push({yr:yr(),kind,w,txt});if(m.notes.length>14){m.notes.sort((x,y)=>y.w-x.w);m.notes.length=12}}}
  function topNote(a,b,kind){const m=mem(a,b);let best=null;for(const n of m.notes)if(n.kind===kind&&(!best||n.w>best.w))best=n;return best}
  function opinion(a,b){const A=S.facs[a],B=S.facs[b];const m=mem(a,b);const r=rel(a,b);let v=m.favor-m.grudge;if(A.state!=null&&B.state!=null){const FA=S.faiths[A.state],FB=S.faiths[B.state];if(FA===FB)v+=0.45;else if(FA.root===FB.root)v-=0.35*A.values.faith*2;else v-=Math.max(0,faithWarScore(FA))*0.4}
    let vs=0;for(const k of VALUES)vs+=1-Math.abs(A.values[k]-B.values[k]);vs/=VALUES.length;v+=(vs-0.7)*1.5;
    if(r.marriage)v+=0.4*r.marriage.love;if(r.trade)v+=0.15;if(r.ally)v+=0.3;if(A.parent===b||B.parent===a)v+=0.15*(1-A.ruler_cruelty());
    v-=(B.rep<0?-B.rep*0.4:0);return clamp(v/2,-1,1)}
  S.opinion=opinion;
  function power(f){const ss=facSetts(f);return f.pop*(1+milTier(f)*0.35)*(0.6+f.g.size*0.5+f.g.armor*0.3)+ss.length*5}
  S.power=power;
  function borderDist(A,B){let md=1e9;for(const x of facSetts(A))for(const y of facSetts(B))md=Math.min(md,Math.hypot(x.x-y.x,x.y-y.y));return md}

  // ---------- characters ----------
  const EPI={conquer:'the Conqueror',betray:'Oathbreaker',raze:'the Cruel',build:'the Builder',wise:'the Wise',love:'the Beloved',pious:'the Pious',mad:'the Mad',nuke:'Ashmaker',make:'the Shaper',liberate:'the Liberator',usurp:'the Usurper',kin:'Kinslayer',avenge:'the Avenger',peace:'the Peacemaker',purge:'the Watcher',art:'the Radiant',defend:'the Unbowed',blight:'the Blightbringer',depart:'Who Left'};
  function newChar(f,role,agent,parentChar){
    const L=S.langs[f.lang];const t={};for(const k of CTRAITS){let v=R();if(parentChar)v=lerp(parentChar.traits[k],v,0.55);t[k]=clamp(v)}
    // culture shapes character
    t.cruelty=clamp(t.cruelty*0.6+f.values.martial*0.25+f.g.carnivory*0.15);t.piety=clamp(t.piety*0.5+f.values.faith*0.5);t.warmth=clamp(t.warmth*0.6+f.values.harmony*0.4);t.genius=clamp(t.genius*0.6+f.g.intellect*0.4);t.greed=clamp(t.greed*0.6+f.values.trade*0.4);
    if(role==='general'){t.ambition=clamp(t.ambition+0.15);t.cruelty=clamp(t.cruelty+0.1)}
    const c={id:S.chars.length,fac:f.id,role,nameId:mkPersonal(L),epithet:'',traits:t,loyalty:role==='heir'?0.8:0.5+R()*0.3,born:yr(),agentId:agent?agent.id:null,spouse:null,claim:null,deeds:[],alive:true,died:null,cause:null,reignStart:null,title:'',parent:parentChar?parentChar.id:null,settId:null,g:agent?{...agent.g}:{...f.g}};
    S.chars.push(c);if(agent){agent.char=c.id;agent.role='court'}return c;
  }
  function charName(c){return nameStr(c.nameId).replace(/ .*$/,m=>S.langs[S.names[c.nameId].lang].stage===0?m:'')+(c.epithet?' '+c.epithet:'')}
  function cname(c){if(!c)return'no one';const n=S.names[c.nameId];const L=S.langs[n.lang];const base=L.stage===0?glossOf(c.nameId):cap(n.form);return base+(c.epithet?' '+c.epithet:'')}
  S.spokenName=c=>cap(S.names[c.nameId].form);
  S.cname=cname;
  function deed(c,txt,epi){c.deeds.push({yr:yr(),txt});if(epi&&!c.epithet)c.epithet=EPI[epi]}
  function charAgent(c){if(c.agentId==null)return null;const a=S.agents.find(x=>x.id===c.agentId);return a&&!a.dead?a:null}
  function traitWords(c){return CTRAITS.map(k=>[k,Math.abs(c.traits[k]-0.5)]).filter(x=>x[1]>0.18).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k])=>CTRAIT_WORD[k][c.traits[k]>0.5?1:0])}
  S.traitWords=traitWords;
  function rulerOf(f){return f.ruler!=null?S.chars[f.ruler]:null}
  function attachFac(f){f.ruler_cruelty=()=>{const r=rulerOf(f);return r?r.traits.cruelty:0.5}}
  S.rng=R;S.rehydrate=()=>{for(const f of S.facs)attachFac(f);reindexAgents();rebuild()};
  function pickCourtAgent(f,s,pref){const m=(s?s.members:[]).filter(a=>!a.dead&&a.char==null&&!a.titan&&a.age>6&&a.age<a.life*0.7);if(!m.length)return null;if(pref==='strong')return m.reduce((a,b)=>b.dmg*b.maxhp>a.dmg*a.maxhp?b:a,m[0]);if(pref==='young')return m.reduce((a,b)=>b.age<a.age?b:a,m[0]);return pick(m)}

  // ---------- factions ----------
  function totemFor(g,x,y){const t=ter[tIdx(x,y)];if(nEyes(g)>=4)return'eye';if(g.flight>0.4)return'wing';if(g.aquatic>0.45)return'wave';if(g.carnivory>0.55)return'tooth';if(g.glow>0.5)return'star';if(g.mystic>0.5)return'moon';if(g.horns>0.5)return'horn';if(g.size>0.6)return'great';return t===3?'tree':t===5?'stone':t===4?'dust':t<=1?'water':pick(['sun','river','seed','field'])}
  // every living people gets a banner colour as far as possible from every other living people's
  function distinctHue(pref,self){const used=S.facs.filter(f=>f.died==null&&f!==self).map(f=>f.hue);if(!used.length)return pref;let best=pref,bs=-1;for(let t=0;t<36;t++){const h=(pref+t*10)%360;const sc=Math.min(...used.map(u=>hueDist(u,h)))-(h>40&&h<62?25:0);if(sc>bs){bs=sc;best=h}}return best}
  function newFaction(g,x,y,parent,concepts,lang){
    const f={id:S.facs.length,name:'',species:'',hue:distinctHue(g.hue),parent:parent?parent.id:null,children:[],born:yr(),died:null,endCause:null,g:{...g},bias:{},tech:{},research:null,rp:0,quirks:[],pop:0,stats:{births:0,deaths:0,kills:0,peak:0,peakYear:0,trades:0,founded:0,conquests:0,maxSetts:0},origin:{x,y},arch:archetypeOf(g),archSince:S.year,milestones:{},snaps:[],mem:{},values:parent?{...parent.values}:valuesFrom(g),gov:'band',govSince:yr(),ruler:null,heir:null,general:null,prophet:null,rulers:[],capital:null,rep:0,treasury:0,decisions:[],warWeary:0,golden:false,lastDecision:null,cool:{}};
    attachFac(f);
    newCurrent(f);
    const L=lang||newLang(parent?S.langs[parent.lang]:null);f.lang=L.id;if(L.fac==null)L.fac=f.id;
    f.nameId=mkName(L,concepts||['people',totemFor(g,x,y)],parent?'taken at the split':'first named');
    S.facs.push(f);if(parent)parent.children.push(f.id);
    refreshNames(f);addQuirk(f);if(g.weirdness>0.5)addQuirk(f);
    f.snaps.push({yr:f.born,...snap(f)});return f;
  }
  function refreshNames(f){const L=S.langs[f.lang];const n=S.names[f.nameId];f.name=L.stage===0?glossOf(f.nameId):nameStr(f.nameId);f.glyph=n.concepts.map(c=>CONCEPTS[c]).join('');f.gloss=glossOf(f.nameId);f.species='the '+f.name+(L.stage===0?'':'');for(const s of S.setts)if(s.fac===f.id||S.names[s.nameId].lang===L.id)s.name=S.langs[S.names[s.nameId].lang].stage===0?glossOf(s.nameId):nameStr(s.nameId)}
  S.refreshNames=refreshNames;
  function addQuirk(f,type){const have=f.quirks.map(q=>q.type);const pool=Object.keys(QUIRKS).filter(t=>!have.includes(t)&&t!=='paint');if(type&&!have.includes(type)){}else if(!pool.length)return null;const t=type&&!have.includes(type)?type:pick(pool);const q={type:t,name:pick(QUIRKS[t].names),since:yr()};f.quirks.push(q);return q}
  S.quirkText=(f,q)=>q.custom||QUIRKS[q.type].desc(f);
  function settConcepts(f,x,y,extra){const t=ter[tIdx(x,y)];let water=false;for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)if(ter[tIdx(x+dx*TS,y+dy*TS)]<=1)water=true;
    const a=t===3?'tree':t===5?'stone':t===4?'dust':water?pick(['river','water']):pick(['field','hill','sun']);const b=extra||(water&&a!=='river'?'river':pick(['home','gate','hill','seed','high','stone']));return a===b?[a,'home']:[a,b]}
  function newSett(f,x,y,silent,extraConcept,why){
    const L=S.langs[f.lang];let con=settConcepts(f,x,y,extraConcept);for(let t=0;t<10&&S.names.some(n=>n.lang===L.id&&n.concepts.join()===con.join());t++)con=[con[0],pick(['home','gate','hill','seed','high','stone','star','song','iron','light','fire','horn','bone','moon','sky','field'].filter(c=>c!==con[0]))];
    const s={id:id(),fac:f.id,x,y,nameId:mkName(L,con,why||'founded'),name:'',store:30,hp:120,maxhp:120,level:0,members:[],born:yr(),birthCd:0,wealth:0,trades:0,owners:[f.id],unrest:0,why:[],resent:0,governor:null,conqueredYr:null};
    s.name=L.stage===0?glossOf(s.nameId):nameStr(s.nameId);
    S.setts.push(s);f.stats.founded++;initLayout(s,f);
    if(!silent)log('found',1,`${s.name} founded`,`The ${f.name} raise ${s.name}${L.stage===0?'':` ("${glossOf(s.nameId)}")`} in ${regionName(x,y)}${why?', '+why:''}.`,x,y,[f]);
    return s;
  }

  // ---------- agents ----------
  function stats(a){
    const g=a.g,f=S.facs[a.fac],mt=f?milTier(f):0;
    a.r=3+g.size*8;a.maxhp=20+g.size*70+g.armor*50;
    a.dmg=(3+g.size*10+g.carnivory*5+g.spikes*4+g.horns*5)*(g.intellect>0.35?DMG[mt]:1);
    a.range=g.intellect>0.38?RANGE[mt]:0;
    a.spd=Math.max(9,16+g.speed*26+g.flight*16-g.armor*6-g.size*4)*(f&&f.tech.industry?1.2:1);
    a.upk=0.7+g.size*0.6+g.speed*0.3+g.intellect*0.3+g.glow*0.2+g.flight*0.3;
    a.sight=45+g.intellect*25+g.eyes*35+a.range;a.life=45+g.longevity*110-g.fertility*15+(a.life0||(a.life0=R()*15))+(f&&f.tech.medicine?15:0);a.armorRed=g.armor*0.5+ARM[mt];a.carryMax=10+g.size*12;
    if(a.titan){a.r*=2.4;a.maxhp*=7;a.dmg*=3;a.life=260+a.life0*8;a.spd*=0.8;a.upk*=0.5}
  }
  function newAgent(f,g,x,y,home){
    const a={id:id(),fac:f.id,g,x,y,heading:R()*6.28,hp:0,energy:70,age:0,state:'idle',tx:x,ty:y,think:R()*.5,cd:0,carry:0,home:home?home.id:null,kills:0,gen:0,phase:R()*10,moving:0,role:null,flash:0,char:null,job:null,why:'',fatigue:R()*0.4,house:null,t:0};
    stats(a);a.hp=a.maxhp;S.agents.push(a);agentById.set(a.id,a);f.pop++;f.stats.births++;return a;
  }

  // ---------- towns: buildings, streets, fields ----------
  const BT={hall:{cost:0,cap:4},house:{cost:14,cap:4},hut:{cost:8,cap:3},den:{cost:0,cap:4},granary:{cost:16},workshop:{cost:18},market:{cost:24},temple:{cost:30},library:{cost:28},barracks:{cost:24},factory:{cost:36},watch:{cost:14},studio:{cost:16}};
  S.BT=BT;
  const builds=f=>f.g.intellect>=0.4;
  function initLayout(s,f){s.bld=[];s.plots=[];s.spokes=[];s.walls=false;s.site=null;const n=3+Math.floor(R()*3);const a0=R()*6.28;for(let k=0;k<n;k++)s.spokes.push({a:a0+k*6.283/n+(R()-.5)*0.4,j:0});
    s.bld.push({t:'hall',x:s.x,y:s.y,rot:a0,prog:1,cap:4,yr:yr(),why:'the first fire'})}
  function okTile(f,x,y){if(x<12||y<12||x>W-12||y>H-12)return false;const k=tIdx(x,y);if(rad[k]>0.2)return false;const t=ter[k];return f.g.aquatic>0.6?t<=2:(t>=2&&(t!==5||f.g.intellect>0.5))}
  function slotPos(s,f){for(let tries=0;tries<40;tries++){const sp=s.spokes.reduce((a,b)=>b.j<a.j?b:a,s.spokes[0]);sp.j++;const d=13+Math.floor((sp.j-1)/2)*10,side=(sp.j%2?1:-1)*7.5;const ca=Math.cos(sp.a),sa=Math.sin(sp.a);const x=s.x+ca*d-sa*side,y=s.y+sa*d+ca*side;
    if(d>150)return null;if(!okTile(f,x,y))continue;if(s.bld.some(b=>Math.hypot(b.x-x,b.y-y)<7.5))continue;if(s.plots.some(p=>Math.hypot(p.x-x,p.y-y)<13))continue;if(S.setts.some(o=>o!==s&&Math.hypot(o.x-x,o.y-y)<90))continue;return{x,y,rot:sp.a}}return null}
  function townRadius(s){if(s._trY===yr()&&s._trN===s.bld.length)return s._tr;let r=14;for(const b of s.bld)r=Math.max(r,Math.hypot(b.x-s.x,b.y-s.y)+6);s._tr=r;s._trY=yr();s._trN=s.bld.length;return r}
  S.townRadius=townRadius;
  function addPlot(s,f){const tr=townRadius(s);for(let t=0;t<30;t++){const sp=pick(s.spokes);const a=sp.a+(R()<.5?-1:1)*(0.35+R()*0.5),d=tr+10+R()*40;const x=s.x+Math.cos(a)*d,y=s.y+Math.sin(a)*d;const k=tIdx(x,y);if(ter[k]<2||ter[k]>=4||rad[k]>0.1)continue;if(s.plots.some(p=>Math.hypot(p.x-x,p.y-y)<14)||s.bld.some(b=>Math.hypot(b.x-x,b.y-y)<11))continue;if(S.setts.some(o=>o!==s&&Math.hypot(o.x-x,o.y-y)<70))continue;s.plots.push({x,y,rot:a,grow:R()*0.3,fert:clamp(fmax[k]/8,0.5,1.3),worker:null});return true}return false}
  const capOf=s=>s.bld.reduce((t,b)=>t+(b.prog>=1&&b.cap?b.cap:0),0);
  const has=(s,t)=>s.bld.some(b=>b.t===t&&b.prog>=1);
  const countB=(s,t)=>s.bld.filter(b=>b.t===t).length;
  S.capOf=capOf;
  function planBuild(s,f){
    if(s.site&&s.bld.includes(s.site)&&s.site.prog<1)return;s.site=null;
    const m=s.members.filter(a=>!a.dead).length;const tech=f.tech;const smart=builds(f);let t=null,why='';
    const houseT=smart?(tech.agri||tech.bronze?'house':'hut'):'den';
    if(m+2>capOf(s)){t=houseT;why=`${s.name} is overcrowded`}
    else if(smart&&m>=6&&!countB(s,'granary')){t='granary';why='there is food to store for lean years'}
    else if(smart&&tech.faith&&m>=9&&!countB(s,'temple')){t='temple';why='the faithful need a place to gather'}
    else if(smart&&tech.tools&&m>=8&&countB(s,'workshop')<1+Math.floor(m/18)){t='workshop';why='crafters need somewhere to work'}
    else if(smart&&(tech.currency||s.trades>4)&&!countB(s,'market')){t='market';why='caravans keep arriving'}
    else if(smart&&tech.writing&&m>=12&&!countB(s,'library')){t='library';why='there is knowledge worth keeping'}
    else if(smart&&anyWar(f)&&s.level>=2&&!countB(s,'barracks')){t='barracks';why='the war needs soldiers'}
    else if(smart&&tech.industry&&countB(s,'factory')<Math.floor(m/14)){t='factory';why='industry demands factories'}
    else if(smart&&f.gov==='police'&&countB(s,'watch')<2+s.level){t='watch';why=`the ruler wants every street watched`}
    else if(smart&&f.golden&&countB(s,'studio')<2){t='studio';why='artists need studios'}
    if(smart&&tech.law&&s.level>=2)s.walls=true;
    if(!t)return;const B=BT[t];if(B.cost&&s.store<B.cost+m*(t==='house'||t==='hut'?0.4:1.5))return;
    const p=slotPos(s,f);if(!p)return;s.store-=B.cost;
    const b={t,x:p.x,y:p.y,rot:p.rot,prog:smart?0:1,cap:B.cap||0,yr:yr(),why};s.bld.push(b);if(b.prog<1)s.site=b;
  }
  function assignJobs(s,f){
    const m=s.members.filter(a=>!a.dead&&a.home===s.id);const smart=builds(f);const tech=f.tech;
    for(const a of m){if(a.char!=null){a.job='court';continue}if(a.age<8)a.job='child';else if(a.age>=a.life*0.85){if(a.job!=='elder'&&!['fight','flee','haul','eat'].includes(a.state))a.state='idle';a.job='elder'}else if(a.job==='child'||a.job==='elder'||a.job==='court')a.job=null}
    const adults=m.filter(a=>a.char==null&&a.age>=8&&a.age<a.life*0.85&&a.role!=='soldier'&&a.role!=='trader');const n=adults.length;if(!n)return;
    const want={};const foodFrac=s.store<m.length*6?0.7:s.store>m.length*20?0.4:0.55;const foodN=Math.max(1,Math.round(n*foodFrac));
    want.hunter=f.g.carnivory>0.45?Math.round(foodN*Math.min(0.8,f.g.carnivory)):f.g.carnivory>0.3?Math.round(foodN*0.25):0;
    const rest=foodN-want.hunter;if(tech.agri&&smart)want.farmer=rest;else want.gatherer=rest;
    want.builder=s.site&&smart?Math.min(3,Math.max(1,Math.ceil(n*0.15))):0;
    want.crafter=smart&&tech.tools&&has(s,'workshop')?Math.max(1,Math.round(n*(0.05+f.values.trade*0.1))):0;
    want.priest=has(s,'temple')?1+Math.floor(n/22):0;want.scholar=has(s,'library')?1+Math.floor(n*0.06):0;
    want.artist=(f.golden||f.values.art>0.62)&&(has(s,'studio')||tech.sculpture)?1+Math.floor(n*(f.golden?0.12:0.05)):0;
    want.guard=s.level>=1&&smart?1+(f.gov==='police'?2:0):0;
    const cnt={},pool=[];for(const a of adults){const j=a.job;if(j&&want[j]&&(cnt[j]||0)<want[j])cnt[j]=(cnt[j]||0)+1;else pool.push(a)}
    for(const j of ['builder','hunter','farmer','gatherer','crafter','priest','scholar','artist','guard'])while((cnt[j]||0)<(want[j]||0)&&pool.length){const a=pool.pop();if(a.job!==j){a.job=j;if(!['fight','flee','haul','eat','migrate'].includes(a.state))a.state='idle'}cnt[j]=(cnt[j]||0)+1}
    for(const a of pool)if(!a.job||!want[a.job])a.job=tech.agri&&smart?'farmer':'gatherer';
    if(tech.agri&&smart){const farmers=m.filter(a=>a.job==='farmer').length;let tries=0;while(s.plots.length<Math.ceil(farmers*1.1)&&tries++<4)addPlot(s,f)}
  }
  const granaryOf=s=>s.bld.find(b=>b.t==='granary'&&b.prog>=1)||s.bld[0];
  function houseOf(a,s){let b=a.house!=null?s.bld[a.house]:null;if(b&&b.cap&&b.prog>=1&&a.houseOf===s.id)return b;a.house=null;const occ={};for(const m of s.members)if(!m.dead&&m.house!=null&&m.houseOf===s.id)occ[m.house]=(occ[m.house]||0)+1;
    for(let i=0;i<s.bld.length;i++){const bb=s.bld[i];if(bb.cap&&bb.prog>=1&&(occ[i]||0)<bb.cap){a.house=i;a.houseOf=s.id;return bb}}return s.bld[0]}
  function pickPlot(a,s){let best=null,bd=1e9;for(const p of s.plots){if(p.worker!=null&&p.worker!==a.id){const w=agentById.get(p.worker);if(w&&!w.dead&&w.state==='farm')continue;p.worker=null}const d=Math.hypot(p.x-a.x,p.y-a.y)-(p.grow>0.7?40:0);if(d<bd){bd=d;best=p}}return best}

  // ---------- wild herds ----------
  S.game=[];S.herds=[];
  function initGame(){for(let h=0;h<Math.round(26*AR);h++){const p=landPoint();S.herds.push({x:p.x,y:p.y,tx:p.x,ty:p.y,t:R()*20});for(let i=0;i<4+Math.floor(R()*5);i++)S.game.push({id:id(),x:p.x+(R()-.5)*40,y:p.y+(R()-.5)*40,h:R()*6.28,herd:h,hp:18,size:0.6+R()*0.5,tx:p.x,ty:p.y,t:R()*2,dead:false,moving:0,flee:0,phase:R()*6})}}
  function stepGame(dt){
    for(const H of S.herds){H.t-=dt;if(H.t<=0){H.t=15+R()*25;const p=landPoint();const ang=Math.atan2(p.y-H.y,p.x-H.x),d=Math.min(260,Math.hypot(p.x-H.x,p.y-H.y));H.tx=H.x+Math.cos(ang)*d;H.ty=H.y+Math.sin(ang)*d}const d=Math.hypot(H.tx-H.x,H.ty-H.y);if(d>2){H.x+=(H.tx-H.x)/d*3.5*dt;H.y+=(H.ty-H.y)/d*3.5*dt}}
    for(const g of S.game){if(g.dead)continue;g.t-=dt;g.phase+=dt*(g.moving?(g.flee>0?14:5):0.5);if(g.flee>0)g.flee-=dt;
      if(g.t<=0&&g.flee<=0){const H=S.herds[g.herd];g.tx=H.x+(R()-.5)*55;g.ty=H.y+(R()-.5)*55;g.t=2+R()*5;if(R()<0.4){g.tx=g.x;g.ty=g.y}}
      const dx=g.tx-g.x,dy=g.ty-g.y,d=Math.hypot(dx,dy);const sp=(g.flee>0?20:5)*dt;
      if(d>1){const nx=g.x+dx/d*Math.min(sp,d),ny=g.y+dy/d*Math.min(sp,d);if(nx>8&&ny>8&&nx<W-8&&ny<H-8&&ter[tIdx(nx,ny)]>=2){g.x=nx;g.y=ny;g.h=Math.atan2(dy,dx);g.moving=1}else{g.t=0;g.tx=g.x;g.ty=g.y;g.moving=0}}else g.moving=0;
      if(rad[tIdx(g.x,g.y)]>0.2){g.hp-=dt*6;if(g.hp<=0)g.dead=true}}
  }
  function yearlyGame(){S.game=S.game.filter(g=>!g.dead);const n=S.game.length;for(const g of S.game.slice()){if(S.game.length>=Math.round(240*AR))break;const k=tIdx(g.x,g.y);if((ter[k]===2||ter[k]===3)&&food[k]>2&&R()<0.1*(1-n/(260*AR))){food[k]-=1;S.game.push({id:id(),x:g.x+(R()-.5)*8,y:g.y+(R()-.5)*8,h:g.h,herd:g.herd,hp:18,size:0.5+R()*0.6,tx:g.x,ty:g.y,t:1,dead:false,moving:0,flee:0,phase:0})}}
    if(n<Math.round(40*AR)){const p=landPoint();S.herds.push({x:p.x,y:p.y,tx:p.x,ty:p.y,t:5});for(let i=0;i<5;i++)S.game.push({id:id(),x:p.x+(R()-.5)*30,y:p.y+(R()-.5)*30,h:0,herd:S.herds.length-1,hp:18,size:0.7,tx:p.x,ty:p.y,t:1,dead:false,moving:0,flee:0,phase:0})}}
  function nearestGame(x,y,r){let b=null,bd=r;for(const g of S.game){if(g.dead||g.x-x>=bd||x-g.x>=bd||g.y-y>=bd||y-g.y>=bd)continue;const d=Math.hypot(g.x-x,g.y-y);if(d<bd){bd=d;b=g}}return b}

  // ---------- armies ----------
  function armySlot(A,i){const row=Math.floor(i/5),col=(i%5)-2;const back=-row*9,side=col*9;return{x:A.x+Math.cos(A.h)*back-Math.sin(A.h)*side,y:A.y+Math.sin(A.h)*back+Math.cos(A.h)*side}}
  S.armySlot=armySlot;
  function disband(f){if(!f.army)return;for(const id0 of f.army.list){const a=S.agents.find(x=>x.id===id0);if(a&&!a.dead&&(a.state==='march'||a.state==='siege'))a.state='idle'}f.army=null}
  function stepArmies(dt){
    for(const f of S.facs){const A=f.army;if(!A||f.died!=null)continue;const t=settById(A.target);
      if(!t||t.fac===f.id||!rel(f.id,t.fac).war){disband(f);continue}
      if(A.state==='muster'){A.t+=dt;let arrived=0;A.list.forEach((id0,i)=>{const a=S.agents.find(x=>x.id===id0);if(a&&!a.dead){const p=armySlot(A,i);if(Math.hypot(a.x-p.x,a.y-p.y)<14)arrived++}});
        if(arrived>=A.list.length*0.6||A.t>7){A.state='march';const r=rel(f.id,t.fac);log('march',2,`The ${f.name} march on ${t.name}`,`${arrived} soldiers of the ${f.name}${f.general!=null&&S.chars[f.general].alive?` under ${cname(S.chars[f.general])}`:''} leave ${(capitalOf(f)||{name:'their home'}).name} in columns, bound for ${t.name}.`,A.x,A.y,[f,S.facs[t.fac]],{why:[`The war is being fought ${r.goalText||'for reasons of state'}.`,`${t.name} is the nearest enemy settlement.`]})}}
      else if(A.state==='march'){const d=Math.hypot(t.x-A.x,t.y-A.y);const want=Math.atan2(t.y-A.y,t.x-A.x);let dh=want-A.h;while(dh>Math.PI)dh-=6.283;while(dh<-Math.PI)dh+=6.283;A.h+=dh*Math.min(1,dt*1.5);
        if(d<townRadius(t)+28){A.state='siege';continue}
        const sp=A.spd*dt;for(const off of [0,0.5,-0.5,1,-1,1.6,-1.6]){const h=A.h+off,nx=A.x+Math.cos(h)*sp,ny=A.y+Math.sin(h)*sp;const k=tIdx(nx,ny);if(ter[k]>=1||f.tech.navigation||f.g.flight>0.45||f.g.aquatic>0.45){A.x=nx;A.y=ny;break}}}
    }
  }
  function formArmy(f,target){const cs=capitalOf(f);if(!cs)return;const sol=S.agents.filter(a=>!a.dead&&a.fac===f.id&&a.role==='soldier');if(sol.length<3)return;
    const h=Math.atan2(target.y-cs.y,target.x-cs.x);const tr=townRadius(cs);f.army={target:target.id,state:'muster',x:cs.x+Math.cos(h)*(tr+18),y:cs.y+Math.sin(h)*(tr+18),h,t:0,list:sol.map(a=>a.id),spd:Math.min(...sol.map(a=>a.spd))*0.8};
    for(const a of sol){a.state='idle'}}

  // ---------- world setup ----------
  const p1=landPoint();let p2=landPoint(),bd=0;for(let t=0;t<300;t++){const p=landPoint(),d=Math.hypot(p.x-p1.x,p.y-p1.y);if(d>bd&&d<W*0.75){bd=d;p2=p}}
  const gA=baseGenome({size:.35,speed:.5,sociality:.62,intellect:.5,aggression:.28,fertility:.55,carnivory:.18,aquatic:.28,limbs:.5,eyes:.2,tail:.55,segments:.15,hoarding:.5,curiosity:.6,weirdness:.42,mystic:.38,symbiosis:.4,glow:.3,hue:192});
  const gB=baseGenome({size:.6,aggression:.66,carnivory:.6,sociality:.45,intellect:.36,speed:.45,armor:.42,spikes:.45,horns:.45,limbs:.75,eyes:.42,segments:.5,tail:.35,fertility:.5,weirdness:.36,mystic:.28,curiosity:.45,hue:14});
  function seedFaction(g,p,n){const f=newFaction(g,p.x,p.y,null);const s=newSett(f,p.x,p.y,true);f.capital=s.id;s.store=160;for(let i=0;i<5;i++){const q=slotPos(s,f);if(q)s.bld.push({t:builds(f)?'hut':'den',x:q.x,y:q.y,rot:q.rot,prog:1,cap:builds(f)?3:4,yr:0,why:'the first shelters'})}
    for(let i=0;i<n;i++){const a=newAgent(f,mutate(g,f,1),p.x+(R()-.5)*30,p.y+(R()-.5)*30,s);a.age=8+R()*20;s.members.push(a)}refreshNames(f);return f}
  const ARCHS=[gA,baseGenome({size:.45,speed:.45,sociality:.6,intellect:.5,aggression:.45,carnivory:.45,armor:.4,spikes:.45,limbs:.75,eyes:.45,segments:.4,tail:.3,hoarding:.4,mystic:.35,weirdness:.35,curiosity:.5,fertility:.5}),baseGenome({size:.38,aquatic:.5,intellect:.52,sociality:.6,glow:.45,mystic:.5,tail:.7,limbs:.25,weirdness:.45,curiosity:.55,fertility:.55,hoarding:.45}),baseGenome({size:.3,flight:.42,intellect:.5,sociality:.62,eyes:.5,horns:.35,curiosity:.65,weirdness:.4,hoarding:.5,fertility:.6,speed:.6})];
  const CR=opts.creation;let g0=ARCHS[Math.floor(R()*ARCHS.length)];g0.hue=R()*360;let start=p1;
  if(CR){g0=baseGenome(creatureGenome(CR.form,CR.temper));g0.hue=CR.hue!=null?CR.hue:R()*360;
    const want=CR.land;for(let t=0;t<1500;t++){const p=landPoint();const near=(r,ts)=>{for(let dy=-r;dy<=r;dy+=TS)for(let dx=-r;dx<=r;dx+=TS){const xx=p.x+dx,yy=p.y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;if(ts.includes(ter[tIdx(xx,yy)]))return true}return false};
      const tt=ter[tIdx(p.x,p.y)];if(want==='coast'&&near(40,[0,1])||want==='forest'&&tt===3&&!near(60,[0])||want==='high'&&near(50,[5])&&!near(60,[0])||want==='plain'&&tt===2&&!near(80,[0,1,5])){start=p;break}}}
  const fA=seedFaction(g0,start,16);if(CR&&CR.temper==='devout')fA.values.faith=clamp(fA.values.faith+0.2);S.kingdom=fA.id;
  initGame();
  log('dawn',3,'The First Fire',`In ${regionName(start.x,start.y)}, a small band wakes to thought: ${fA.glyph}, the ${fA.gloss}, ${bodyDesc(fA.g)}. They name things only with pictures. As far as they know, they are alone in the world.`,start.x,start.y,[fA]);

  // ---------- spatial hash ----------
  // Flat counting-sort grid (no per-tick array allocation). Cell order and in-cell order match the old nested-array grid.
  const HC=50,HW=Math.ceil(W/HC),HH=Math.ceil(H/HC);const gStart=new Int32Array(HW*HH+1),gCell=new Int32Array(HW*HH),gFac=new Int32Array(HW*HH);let gItems=[],gCellOf=new Int32Array(1024),gStale=false;// gStale: someone changed people/titan since rebuild(), so gFac can no longer be trusted this step
  function rebuild(){const ag=S.agents,n=ag.length;if(gCellOf.length<n)gCellOf=new Int32Array(Math.ceil(n*1.5));gStale=false;gCell.fill(0);gFac.fill(-1);// gFac: the one people present in a cell, or -2 if mixed or a titan is there
    for(let q=0;q<n;q++){const a=ag[q];if(a.dead){gCellOf[q]=-1;continue}const c=clamp(Math.floor(a.y/HC),0,HH-1)*HW+clamp(Math.floor(a.x/HC),0,HW-1);gCellOf[q]=c;gCell[c]++;gFac[c]=a.titan?-2:gFac[c]===-1?a.fac:gFac[c]===a.fac?a.fac:-2}
    let acc=0;for(let c=0;c<HW*HH;c++){gStart[c]=acc;acc+=gCell[c];gCell[c]=gStart[c]}gStart[HW*HH]=acc;gItems.length=acc;
    for(let q=0;q<n;q++){const c=gCellOf[q];if(c>=0)gItems[gCell[c]++]=ag[q]}}
  function query(x,y,r,out){out.length=0;const i0=clamp(Math.floor((x-r)/HC),0,HW-1),i1=clamp(Math.floor((x+r)/HC),0,HW-1),j0=clamp(Math.floor((y-r)/HC),0,HH-1),j1=clamp(Math.floor((y+r)/HC),0,HH-1);for(let j=j0;j<=j1;j++){const base=j*HW;for(let q=gStart[base+i0],e=gStart[base+i1+1];q<e;q++)out.push(gItems[q])}return out}
  const buf=[];
  const FSTRIDE=AR>1.5?Math.ceil(AR/2):1;let fPhase=0;
  const MAXTITANS=Math.max(2,Math.round(2*LIN));

  // ---------- behavior ----------
  function apow(a){return a.hp*a.dmg*(1+a.armorRed)*(1+a.range/30)}
  function hostile(a,o){
    if(o.dead)return false;if(a.titan)return o.id!==a.id;if(o.titan)return true;if(a.fac===o.fac)return false;
    const r=rel(a.fac,o.fac);if(r.war)return true;if(r.ally||r.marriage)return false;
    const fa=S.facs[a.fac];
    if(fa.g.intellect<0.36&&(fa.arch==='horde'||fa.arch==='predator')&&a.energy<70&&!r.trade&&!r.truce)return true;
    return false;
  }
  function moveTo(a,tx,ty,dt,mult=1){
    const dx=tx-a.x,dy=ty-a.y,d=Math.hypot(dx,dy);if(d<1.5){a.moving=0;return true}
    let ang=Math.atan2(dy,dx);let dh=ang-a.heading;while(dh>Math.PI)dh-=6.283;while(dh<-Math.PI)dh+=6.283;a.heading+=dh*Math.min(1,dt*5);
    const sp=a.spd*mult*tMult(a,a.x,a.y)*dt,step=Math.min(sp,d);
    for(const off of [0,0.7,-0.7,1.4,-1.4,2.2,-2.2]){const h=ang+off,nx=a.x+Math.cos(h)*step,ny=a.y+Math.sin(h)*step;if(passable(a,nx,ny)){a.x=nx;a.y=ny;a.moving=1;if(off!==0)a.heading=h;return false}}
    a.moving=0;if(a.state!=='march')a.state='idle';return false;
  }
  function eff(a,k){if(rad[k]>0.15)return 0;const t=ter[k],g=a.g;let e=t<=1?(t===0?(g.aquatic>0.4?g.aquatic:0):g.aquatic*0.9+0.1):1-g.aquatic*0.5;const f=S.facs[a.fac];return e*(1-g.carnivory*0.75)*(f.tech.agri?1.3:1)*(f.tech.industry?1.35:1)}
  function bestFood(a,rad0){let best=null,bv=-1;for(let t=0;t<7;t++){const x=clamp(a.x+(R()-.5)*rad0*2,5,W-5),y=clamp(a.y+(R()-.5)*rad0*2,5,H-5);if(!passable(a,x,y))continue;const k=tIdx(x,y),v=food[k]*eff(a,k)-Math.hypot(x-a.x,y-a.y)*0.01;if(v>bv){bv=v;best={x,y}}}return best}
  function homeOf(a){if(a.home==null)return null;const s=settById(a.home);if(!s||s.fac!==a.fac){a.home=null;return null}return s}

  function attack(a,o,ranged){
    a.cd=0.5+(1-a.g.speed)*0.6+(ranged?0.4:0);
    const dmg=a.dmg*(0.7+R()*0.6)*(1-o.armorRed);o.hp-=dmg;o.flash=0.25;
    if(ranged)S.fxq.push({t:'shot',x1:a.x,y1:a.y,x2:o.x,y2:o.y,h:S.facs[a.fac].hue,tier:milTier(S.facs[a.fac])});else S.fxq.push({t:'hit',x:o.x,y:o.y});
    if(o.hp<=0&&!o.dead){
      a.kills++;S.facs[a.fac].stats.kills++;
      if(a.g.carnivory>0.35||a.titan)a.energy=Math.min(100,a.energy+20+o.g.size*40*a.g.carnivory),a.carry+=10*a.g.carnivory;
      die(o,'slain',a);
      if(a.fac!==o.fac&&!a.titan&&!o.titan){const r=rel(a.fac,o.fac);if(r.war){r.warDeaths++;r.lost[o.fac]=(r.lost[o.fac]||0)+1}else note(o.fac,a.fac,'grudge',0.04,'raids on our people');battleNote(a,o)}
      if(a.kills>=8&&!a.hero&&!a.titan)heroize(a);
    }
  }
  function heroize(a){
    const f=S.facs[a.fac];a.hero=1;a.maxhp*=1.3;a.hp=a.maxhp;a.dmg*=1.2;
    if(a.char==null){const c=newChar(f,'champion',a);a.role=null;c.traits.cruelty=clamp(c.traits.cruelty+0.1);deed(c,`killed ${a.kills} enemies`);
      if(f.general==null||!S.chars[f.general].alive){f.general=c.id;c.role='general'}
      log('hero',2,`Rise of ${cname(c)}`,`Among the ${f.name}, one ${bodyDesc(a.g).replace(/ \w+$/,'')} has killed ${a.kills} enemies. ${cap(cname(c))} ${c.role==='general'?'is made general':'becomes a champion'}. People say they are ${traitWords(c).join(' and ')||'unreadable'}.`,a.x,a.y,[f],{g:{...a.g},why:[`${cap(cname(c))} won fame in battle.`]})}
  }
  function makeTitan(a,reason){
    const f=S.facs[a.fac];gStale=true;a.titan=cap(S.langs[f.lang].stage?compose(S.langs[f.lang],['great','beast']):'Great-Beast')+' '+pick(['the Unmaking','the Hungering','of a Thousand Mouths','the Walking Mountain','the Pale','the Endless']);
    a.g.size=Math.max(a.g.size,0.9);a.g.aggression=Math.max(a.g.aggression,0.85);a.g.spikes=Math.max(a.g.spikes,0.6);a.g.carnivory=Math.max(a.g.carnivory,0.7);
    if(a.char!=null){S.chars[a.char].alive=false;a.char=null}a.role=null;stats(a);a.hp=a.maxhp;a.home=null;a.energy=100;
    log('titan',3,`Birth of ${a.titan}`,`${reason||`Born to the ${f.name} but belonging to no one`}, a monster ${Math.round(a.r*2)} strides wide walks out. ${a.titan} turns on every living thing, its own kin included.`,a.x,a.y,[f],{g:{...a.g},why:[reason||'A monstrous mutation.']});
  }
  S.spawnTitan=(fi,reason)=>{const f=S.facs[fi]||alive()[0];if(!f)return;const s=capitalOf(f);const p=s||landPoint();const a=newAgent(f,mutate(f.g,f,1),p.x+10,p.y+10,null);makeTitan(a,reason)};

  function die(a,cause,killer){
    if(a.dead)return;a.dead=true;a.cause=cause;const f=S.facs[a.fac];f.pop--;f.stats.deaths++;
    S.fxq.push({t:'death',x:a.x,y:a.y,h:a.g.hue,r:a.r});
    if(cause==='slain'&&R()<.5)S.fxq.push({t:'scar',x:a.x,y:a.y,r:a.r});
    if(a.titan){const kf=killer?S.facs[killer.fac]:null;log('titanfall',3,`Fall of ${a.titan}`,killer?`${a.titan} is finally brought down by the ${kf.name} after killing ${a.kills} creatures.`:`${a.titan} dies of age and hunger after killing ${a.kills} creatures.`,a.x,a.y,kf?[f,kf]:[f],{g:{...a.g}});S.cairns.push({x:a.x,y:a.y,n:6,h:0,bones:1});if(kf){for(const o of alive())if(o!==kf)note(o.id,kf.id,'favor',0.3,`they slew ${a.titan}`)}}
    if(a.char!=null)charDeath(S.chars[a.char],cause,killer);
    if(f.quirks.some(q=>q.type==='cairn')){let c=S.cairns.find(c=>Math.hypot(c.x-a.x,c.y-a.y)<60&&!c.bones);if(c)c.n=Math.min(c.n+1,30)}
    for(const q of f.quirks)if(q.type==='chorus')S.pulses.push({x:a.x,y:a.y,h:a.g.hue,t:S.year,big:1});
  }
  function battleNote(a,o){
    const fa=Math.min(a.fac,o.fac),fb=Math.max(a.fac,o.fac),k=fa+'-'+fb+'-'+Math.round(o.x/200)+'-'+Math.round(o.y/200);
    let b=S.battles[k];if(!b)b=S.battles[k]={fa,fb,x:0,y:0,n:0,cas:{},start:S.year,last:S.year,heroes:new Set()};
    b.x+=o.x;b.y+=o.y;b.n++;b.cas[o.fac]=(b.cas[o.fac]||0)+1;b.last=S.year;if(a.char!=null)b.heroes.add(cname(S.chars[a.char]));
  }
  function finalizeBattles(){
    for(const k in S.battles){const b=S.battles[k];if(S.year-b.last<2.5)continue;delete S.battles[k];if(b.n<5)continue;
      const x=b.x/b.n,y=b.y/b.n;let near=null,nd=140;for(const s of S.setts){const d=Math.hypot(s.x-x,s.y-y);if(d<nd){nd=d;near=s}}
      const place=near?near.name:cap(regionName(x,y));const fA=S.facs[b.fa],fB=S.facs[b.fb];
      const ca=b.cas[b.fa]||0,cb=b.cas[b.fb]||0,win=ca<cb?fA:fB,lose=win===fA?fB:fA;
      const title=pick(['Battle','Slaughter','Clash','Rout'])+' of '+place;const her=[...b.heroes];const r=rel(fA.id,fB.id);
      note(fA.id,fB.id,'grudge',0.15+cb*0+ca*0.02,`the ${title}`);note(fB.id,fA.id,'grudge',0.15+cb*0.02,`the ${title}`);
      log('battle',b.n>=14?3:2,title,`The ${fA.name} and the ${fB.name} meet near ${place}. ${b.n} die: ${ca} of the ${fA.name}, ${cb} of the ${fB.name}. ${ca===cb?'Neither side can claim the field.':`The ${win.name} hold the field.`}${her.length?` ${her.join(' and ')} fought there.`:''}`,x,y,[fA,fB],{cas:{[fA.id]:ca,[fB.id]:cb},total:b.n,why:r.war&&r.goalText?[`The war was fought ${r.goalText}.`]:[]});
      S.fxq.push({t:'scar',x,y,r:20+b.n});
    }
  }

  function courtWhy(c,f,s){const r=c.role;return r==='ruler'?`Ruling the ${f.name} from ${s.name}`:r==='heir'?`Heir to ${cname(rulerOf(f))}, waiting`:r==='prophet'?`Interpreting omens for ${cname(rulerOf(f))}`:r==='governor'?`Governing ${s.name}`:r==='general'?`Drilling the army of the ${f.name}`:`Serving at court in ${s.name}`}
  function threat(a){
    const f=S.facs[a.fac];const home=homeOf(a);
    // scans the spatial grid in place (same visiting order as query()) and skips same-people neighbours cheaply
    let foe=null,fd=1e9;{const r=a.sight,i0=clamp(Math.floor((a.x-r)/HC),0,HW-1),i1=clamp(Math.floor((a.x+r)/HC),0,HW-1),j0=clamp(Math.floor((a.y-r)/HC),0,HH-1),j1=clamp(Math.floor((a.y+r)/HC),0,HH-1),af=a.fac,at=a.titan;
    for(let j=j0;j<=j1;j++){const base=j*HW;for(let ci=i0;ci<=i1;ci++){if(!gStale&&!at&&gFac[base+ci]===af)continue;for(let q=gStart[base+ci],e=gStart[base+ci+1];q<e;q++){const o=gItems[q];if(o===a||o.dead)continue;if(o.fac===af&&!at&&!o.titan)continue;if(!hostile(a,o)&&!hostile(o,a))continue;const d=Math.hypot(o.x-a.x,o.y-a.y);if(d<fd){fd=d;foe=o}}}}}
    if(!foe)return false;
    const weak=a.role==='court'||a.job==='child'||a.job==='elder';
    const defending=home&&Math.hypot(foe.x-home.x,foe.y-home.y)<townRadius(home)+50;
    const fighter=a.role==='soldier'||a.job==='guard'||a.job==='hunter'||a.g.aggression>0.6||defending;
    const mine=apow(a)*(0.5+a.g.aggression+(fighter?0.5:0)),theirs=apow(foe)*(0.8+(1-a.g.aggression)*0.6);
    const fname=foe.titan?foe.titan:'the '+S.facs[foe.fac].name;
    if(!weak&&fighter&&(hostile(a,foe)||defending||fd<a.r+foe.r+8)&&mine>theirs*0.45){a.state='fight';a.target=foe;
      const r=foe.titan?null:rel(a.fac,foe.fac);a.why=defending?`Defending ${home.name} from ${fname}`:r&&r.war?`Fighting ${fname}: the war ${r.goalText||''}`:foe.titan?`Attacking ${fname}`:`Hungry. The ${S.facs[foe.fac].name} are prey`;return true}
    if(hostile(foe,a)&&fd<a.sight*0.7){a.state='flee';a.target=foe;a.why=`Fleeing from ${fname}`;return true}
    return false;
  }
  function titanPlan(a){const near=query(a.x,a.y,a.sight*1.2,buf);let best=null,bd=1e9;for(const o of near){if(o===a||o.dead)continue;const d=Math.hypot(o.x-a.x,o.y-a.y);if(d<bd){bd=d;best=o}}
    if(best&&(a.energy<85||R()<.5)){a.state='fight';a.target=best;a.why='Hunting anything that moves';return}
    if(R()<.12&&S.setts.length){const s=pick(S.setts);a.state='siege';a.tsett=s.id;a.why=`Drawn to the smell of ${s.name}`;return}
    a.state='roam';const p=landPoint();a.tx=p.x;a.ty=p.y;a.why='Roaming, hungry'}
  function haul(a,s){const g=granaryOf(s);a.state='haul';a.tx=g.x+(R()-.5)*6;a.ty=g.y+(R()-.5)*6;a.why=`Carrying ${a.cargo||'food'} to the ${g.t==='granary'?'granary':'hall'} of ${s.name}`}
  function soldierPlan(a,f,s){const A=f.army;if(!A){return false}const idx=A.list.indexOf(a.id);if(idx<0)return false;const t=settById(A.target);if(!t||t.fac===f.id)return false;const r=rel(f.id,t.fac);
    if(A.state==='siege'){a.state='siege';a.tsett=t.id;a.why=`Besieging ${t.name}: the war ${r.goalText||''}`;return true}
    a.state='march';a.slot=idx;a.why=A.state==='muster'?`Mustering outside ${s.name} for the march on ${t.name}`:`Marching on ${t.name}: the war ${r.goalText||''}`;return true}
  function plan(a){
    const f=S.facs[a.fac];const s=homeOf(a);a.target=null;a.t=0;a.self=0;
    if(a.titan){titanPlan(a);return}
    if(a.departing){a.state='depart';a.why='Boarding the ships';return}
    if(threat(a))return;
    if(!s){const p=bestFood(a,140);a.state='gather';a.self=1;a.tx=p?p.x:a.x+(R()-.5)*40;a.ty=p?p.y:a.y+(R()-.5)*40;a.why='Homeless, foraging to survive';return}
    if(a.role==='court'){const hall=s.bld[0];a.state='court';a.tx=hall.x+(R()-.5)*14;a.ty=hall.y+(R()-.5)*14;a.t=2+R()*3;const c=a.char!=null?S.chars[a.char]:null;a.why=c?courtWhy(c,f,s):'Serving at court';
      if(a.energy<40&&s.store>3){a.state='eat';const g=granaryOf(s);a.tx=g.x;a.ty=g.y}return}
    if(a.energy<35&&a.carry>2){const e0=Math.min(a.carry,30);a.carry-=e0;a.energy=Math.min(100,a.energy+e0*1.4)}
    if(a.energy<35){if(s.store>4){const g=granaryOf(s);a.state='eat';a.tx=g.x+(R()-.5)*6;a.ty=g.y+(R()-.5)*6;a.why=`Hungry. Going to eat at the ${g.t==='granary'?'granary':'hall'} of ${s.name}`;return}
      const p=bestFood(a,140);if(p){a.state='gather';a.self=1;a.tx=p.x;a.ty=p.y;a.why=`Hungry, and the stores of ${s.name} are empty`;return}}
    if(a.role==='soldier'&&soldierPlan(a,f,s))return;
    if(a.fatigue>1&&a.role!=='soldier'){const h=houseOf(a,s);a.state='rest';a.tx=h.x+Math.cos(h.rot+1.57)*5;a.ty=h.y+Math.sin(h.rot+1.57)*5;a.t=1.5+R()*1.5;a.why='Resting at home after work';return}
    if(a.role==='trader'&&a.tsett!=null){const t=settById(a.tsett);if(t&&t.fac!==a.fac&&rel(a.fac,t.fac).trade&&!rel(a.fac,t.fac).war){a.state='trade';a.tx=t.x;a.ty=t.y;a.why=`Carrying ${goods(f)} to ${t.name}: the ${f.name} trade with the ${S.facs[t.fac].name}`;return}a.role=null}
    if(a.carry>=a.carryMax*0.4){haul(a,s);return}
    const J=a.job;
    if(J==='child'){const h=houseOf(a,s);a.state='play';a.tx=h.x+(R()-.5)*22;a.ty=h.y+(R()-.5)*22;a.t=1+R()*2;a.why='Too young to work. Playing near home';return}
    if(J==='elder'){const tm=s.bld.find(b=>b.t==='temple'&&b.prog>=1)||houseOf(a,s);a.state='rest';a.tx=tm.x+(R()-.5)*10;a.ty=tm.y+(R()-.5)*10;a.t=3;a.why=tm.t==='temple'?'Too old to work. Sitting by the temple':'Too old to work. Resting at home';return}
    if(J==='builder'&&s.site&&s.site.prog<1){a.state='build';a.site=s.site;a.tx=s.site.x+(R()-.5)*9;a.ty=s.site.y+(R()-.5)*9;a.why=`Building a ${s.site.t} because ${s.site.why}`;return}
    if(J==='farmer'){const p=pickPlot(a,s);if(p){a.state='farm';a.plot=p;p.worker=a.id;a.tx=p.x;a.ty=p.y;a.row=0;a.why=`Tending a field outside ${s.name}: the granary holds ${Math.round(s.store)} for ${s.members.filter(m=>!m.dead).length} mouths`;return}}
    if(J==='hunter'){const gm=nearestGame(a.x,a.y,340);if(gm){a.state='hunt';a.prey=gm;a.cargo='meat';a.why=`Hunting the wild herds: ${s.name} needs meat`;return}}
    if(J==='crafter'){const w=s.bld.find(b=>b.t==='factory'&&b.prog>=1)||s.bld.find(b=>b.t==='workshop'&&b.prog>=1);if(w){a.state='craft';a.wb=w;a.tx=w.x+(R()-.5)*6;a.ty=w.y+(R()-.5)*6;a.t=2+R()*1.5;a.why=`Making ${goods(f)} in the ${w.t} to sell`;return}}
    if(J==='priest'){const tm=s.bld.find(b=>b.t==='temple'&&b.prog>=1);if(tm){a.state='worship';a.tx=tm.x+(R()-.5)*8;a.ty=tm.y+(R()-.5)*8;a.t=3;a.why=`Leading prayers at the temple of ${s.name}`;return}}
    if(J==='scholar'){const lb=s.bld.find(b=>b.t==='library'&&b.prog>=1);if(lb){a.state='study';a.tx=lb.x+(R()-.5)*8;a.ty=lb.y+(R()-.5)*8;a.t=3;a.why=f.research?`Studying ${TECH[f.research.id].n} in the library`:'Copying old texts in the library';return}}
    if(J==='artist'){startRitual(a,f,{type:'paint',name:'the Coloring'});a.why=`Painting the ground around ${s.name}${f.golden?'. It is a golden age':''}`;return}
    if(J==='guard'){a.state='patrol';a.pang=Math.atan2(a.y-s.y,a.x-s.x);a.t=3+R()*2;a.why=`Guarding ${s.name}`;return}
    if(f.quirks.length&&R()<0.04+a.g.weirdness*0.1&&a.fatigue<0.5){const q=pick(f.quirks);startRitual(a,f,q);a.why=`Performing ${q.name}`;return}
    const p=bestFood(a,80+a.g.curiosity*80);if(p){a.state='gather';a.tx=p.x;a.ty=p.y;a.cargo=ter[tIdx(p.x,p.y)]<=1?'fish and reeds':ter[tIdx(p.x,p.y)]===3?'fruit and nuts':'roots and grain';a.why=f.tech.agri?`Gathering ${a.cargo} for ${s.name}`:`Gathering ${a.cargo}: the ${f.name} have not learned to farm`;return}
    const h=houseOf(a,s);a.state='rest';a.tx=h.x;a.ty=h.y;a.t=2;a.why='Resting';
  }
  function siteOf(f){const s=capitalOf(f)||{x:f.origin.x,y:f.origin.y};const tr=s.bld?townRadius(s):20;return{x:s.x+tr*0.7+8,y:s.y-tr*0.7-8}}
  function startRitual(a,f,q){
    const site=siteOf(f);a.state='ritual';a.rit={type:q.type,name:q.name,t:5+R()*8,idx:0,x:site.x,y:site.y,lx:a.x,ly:a.y};
    if(q.type==='cairn'||q.type==='paint'){const h=homeOf(a)||site;const tr=h.bld?townRadius(h):20;const ang=R()*6.28,d=tr+(q.type==='paint'?4:25)+R()*30;a.rit.x=h.x+Math.cos(ang)*d;a.rit.y=h.y+Math.sin(ang)*d}
    if(q.type==='gift'){let best=null,bd=1e9;for(const s of S.setts){if(s.fac===a.fac)continue;const d=Math.hypot(s.x-a.x,s.y-a.y);if(d<bd){bd=d;best=s}}if(!best||bd>800){a.state='idle';a.rit=null;return}a.rit.x=best.x;a.rit.y=best.y;a.rit.sid=best.id;a.rit.t=80;a.carry=Math.max(a.carry,8)}
    if(q.type==='still'){const o=f.parent!=null?S.facs[f.parent].origin:f.origin;a.rit.face=Math.atan2(o.y-site.y,o.x-site.x)+(f.parent==null?Math.PI:0);const n=a.id%12;a.rit.x=site.x+((n%4)-1.5)*10*Math.cos(a.rit.face+1.57)+Math.floor(n/4)*10*Math.cos(a.rit.face);a.rit.y=site.y+((n%4)-1.5)*10*Math.sin(a.rit.face+1.57)+Math.floor(n/4)*10*Math.sin(a.rit.face)}
    if(q.type==='pilgrim'){const o=f.parent!=null?S.facs[f.parent].origin:f.origin;a.rit.x=o.x;a.rit.y=o.y;a.rit.t=90}
    if(q.type==='mimic'){let best=null,bd=1e9;for(const o of query(a.x,a.y,250,buf)){if(o.fac===a.fac||o.dead||o.titan)continue;const d=Math.hypot(o.x-a.x,o.y-a.y);if(d<bd){bd=d;best=o}}if(!best){a.state='idle';a.rit=null;return}a.rit.fo=best}
  }
  function doRitual(a,dt){
    const r=a.rit;r.t-=dt;if(r.t<=0){a.rit=null;a.state='idle';return}const f=S.facs[a.fac];
    switch(r.type){
      case'orbit':{const n=nEyes(a.g),rr=10+n*3,ang=S.year*0.5+(a.id%n)*6.283/n;moveTo(a,r.x+Math.cos(ang)*rr,r.y+Math.sin(ang)*rr,dt,0.7);break}
      case'cairn':{if(moveTo(a,r.x,r.y,dt,0.8)){let c=S.cairns.find(c=>Math.hypot(c.x-r.x,c.y-r.y)<10&&!c.bones);if(c)c.n=Math.min(30,c.n+1);else if(S.cairns.length<300)S.cairns.push({x:r.x,y:r.y,n:1,h:f.hue});r.t=0}break}
      case'paint':{if(moveTo(a,r.x,r.y,dt,0.35)){r.x+=(R()-.5)*16;r.y+=(R()-.5)*16}if(Math.hypot(a.x-r.lx,a.y-r.ly)>2.5){S.fxq.push({t:'paint',x1:r.lx,y1:r.ly,x2:a.x,y2:a.y,h:(f.hue+((a.id*47)%160)-80+360)%360});r.lx=a.x;r.ly=a.y}a.fatigue+=dt*0.12;break}
      case'glyph':{const R0=48+(a.fac%3)*12,k=r.idx%5,ang=-1.57+k*2*2*Math.PI/5;if(moveTo(a,r.x+Math.cos(ang)*R0,r.y+Math.sin(ang)*R0,dt,0.5))r.idx++;if(Math.hypot(a.x-r.lx,a.y-r.ly)>5){S.fxq.push({t:'glyph',x1:r.lx,y1:r.ly,x2:a.x,y2:a.y,h:f.hue});r.lx=a.x;r.ly=a.y}break}
      case'gift':{if(moveTo(a,r.x,r.y,dt)){const s=settById(r.sid);if(s&&s.fac!==a.fac){s.store+=a.carry;note(s.fac,a.fac,'favor',0.03,'gifts left at our gates');a.carry=0}r.t=0}break}
      case'still':{if(moveTo(a,r.x,r.y,dt,0.7)){let dh=r.face-a.heading;while(dh>Math.PI)dh-=6.283;while(dh<-Math.PI)dh+=6.283;a.heading+=dh*dt*2;a.moving=0;a.energy+=a.upk*dt*0.6}break}
      case'pilgrim':{if(moveTo(a,r.x,r.y,dt)){a.energy=100;r.t=0}break}
      case'chorus':{if(moveTo(a,r.x+((a.id*7)%30-15),r.y+((a.id*13)%30-15),dt,0.7)){a.moving=0;if(Math.floor(S.year*1.5)!==Math.floor((S.year-dt)*1.5)&&a.id%5===0)S.pulses.push({x:r.x,y:r.y,h:a.g.hue,t:S.year})}break}
      case'mimic':{const o=r.fo;if(!o||o.dead){r.t=0;break}const ang=Math.atan2(a.y-o.y,a.x-o.x);moveTo(a,o.x+Math.cos(ang)*18,o.y+Math.sin(ang)*18,dt);a.g.hue=(a.g.hue+((((o.g.hue-a.g.hue)%360+540)%360)-180)*dt*0.01+360)%360;break}
    }
  }
  function work(a,dt){a.fatigue+=dt*0.16;a.moving=0}
  function act(a,dt){
    const f=S.facs[a.fac];const s=homeOf(a);
    switch(a.state){
      case'fight':{const o=a.target;if(!o||o.dead||Math.hypot(o.x-a.x,o.y-a.y)>a.sight*1.6){a.state='idle';break}const d=Math.hypot(o.x-a.x,o.y-a.y);
        if(d<a.r+o.r+3){a.moving=0;a.heading=Math.atan2(o.y-a.y,o.x-a.x);if(a.cd<=0)attack(a,o,false)}
        else if(a.range&&d<a.range+o.r){a.moving=0;a.heading=Math.atan2(o.y-a.y,o.x-a.x);if(a.cd<=0)attack(a,o,true)}
        else moveTo(a,o.x,o.y,dt,1.1);break}
      case'flee':{const o=a.target;if(!o||o.dead){a.state='idle';break}let tx,ty;if(s&&Math.hypot(s.x-o.x,s.y-o.y)>60){tx=s.x;ty=s.y}else{const ang=Math.atan2(a.y-o.y,a.x-o.x);tx=a.x+Math.cos(ang)*40;ty=a.y+Math.sin(ang)*40}moveTo(a,tx,ty,dt,1.15);if(Math.hypot(o.x-a.x,o.y-a.y)>a.sight)a.state='idle';break}
      case'gather':{if(moveTo(a,a.tx,a.ty,dt,0.8)){work(a,dt);a.t+=dt;const k=tIdx(a.x,a.y),e=eff(a,k),take=Math.min(food[k],5*dt);food[k]-=take;const gain=take*e*6;
        if(a.self||!s)a.energy=Math.min(100,a.energy+gain*2);else a.carry+=gain;
        if(a.carry>=a.carryMax||a.t>2.5||food[k]<0.4||e<0.05||(a.self&&a.energy>80))a.state='idle';else if(R()<dt*0.8){a.tx=a.x+(R()-.5)*10;a.ty=a.y+(R()-.5)*10}}break}
      case'farm':{const p=a.plot;if(!p||!s||!s.plots.includes(p)){a.state='idle';break}
        const ca=Math.cos(p.rot),sa=Math.sin(p.rot);const row=((a.row||0)%4)-1.5,along=Math.sin(S.year*0.6+a.id)*5;const tx=p.x+ca*along-sa*row*2.4,ty=p.y+sa*along+ca*row*2.4;
        if(moveTo(a,tx,ty,dt,0.3)||Math.hypot(a.x-p.x,a.y-p.y)<9){work(a,dt);a.moving=1;p.grow=Math.min(1,p.grow+dt*0.5*p.fert*S.world.foodMult*(f.tech.industry?1.5:1));if(R()<dt*0.4)a.row=(a.row||0)+1;
          if(p.grow>=1){a.carry+=24*p.fert*(f.tech.industry?1.5:1)*(f.g.intellect>0.55?1.1:1);a.cargo='the harvest';p.grow=0;p.worker=null;a.plot=null;haul(a,s)}else if(a.fatigue>1.1){p.worker=null;a.state='idle'}}break}
      case'hunt':{const g=a.prey;if(!g||g.dead||Math.hypot(g.x-a.x,g.y-a.y)>420){a.state='idle';break}const d=Math.hypot(g.x-a.x,g.y-a.y);
        if(d<30&&g.flee<=0&&R()<dt*3){g.flee=1.2;const ang=Math.atan2(g.y-a.y,g.x-a.x);g.tx=g.x+Math.cos(ang)*70;g.ty=g.y+Math.sin(ang)*70}
        const reach=a.r+6+(a.range?Math.min(a.range,20):0);
        if(d<reach){a.moving=0;a.heading=Math.atan2(g.y-a.y,g.x-a.x);if(a.cd<=0){a.cd=0.6;g.hp-=a.dmg*(0.7+R()*0.6);if(a.range)S.fxq.push({t:'shot',x1:a.x,y1:a.y,x2:g.x,y2:g.y,h:f.hue,tier:milTier(f)});if(g.hp<=0){g.dead=true;a.carry+=18+g.size*16;a.cargo='meat';S.fxq.push({t:'death',x:g.x,y:g.y,h:30,r:3});work(a,0.5);a.state='idle'}}}
        else{moveTo(a,g.x,g.y,dt,1.05);a.fatigue+=dt*0.12}break}
      case'haul':{if(!s){a.state='idle';break}if(moveTo(a,a.tx,a.ty,dt,0.8)){s.store+=a.carry;f.stats.food=(f.stats.food||0)+a.carry;a.carry=0;a.cargo=null;a.state='idle'}break}
      case'eat':{if(!s){a.state='idle';break}if(moveTo(a,a.tx,a.ty,dt,0.8)){s.store+=a.carry;a.carry=0;const take=Math.min(s.store,45);f.stats.eaten=(f.stats.eaten||0)+take;s.store-=take;a.energy=Math.min(100,a.energy+take*1.4);a.state='idle'}break}
      case'build':{const b=a.site;if(!b||!s||!s.bld.includes(b)||b.prog>=1){a.state='idle';break}if(moveTo(a,a.tx,a.ty,dt,0.8)){work(a,dt);a.moving=0;b.prog=Math.min(1,b.prog+dt*0.28*(f.tech.industry?2:1));if(b.prog>=1){if(['temple','library','market','factory','barracks','studio'].includes(b.t))log('build',1,`${s.name} raises a ${b.t}`,`The ${f.name} of ${s.name} finish building a ${b.t}, because ${b.why}.`,b.x,b.y,[f]);a.state='idle'}else if(a.fatigue>1.1)a.state='idle'}break}
      case'craft':case'worship':case'study':{if(moveTo(a,a.tx,a.ty,dt,0.8)){work(a,dt);a.t-=dt;
          if(a.state==='craft'){f.treasury+=dt*0.9*(a.wb&&a.wb.t==='factory'?2.2:1);if(s)s.wealth+=dt*0.5}
          else if(a.state==='worship'){if(s){s.unrest=Math.max(0,s.unrest-dt*0.006)}f.values.faith=clamp(f.values.faith+dt*0.0004)}
          else{f.rp+=dt*0.5*a.g.intellect*(f.tech.computing?1.6:1)}
          if(a.t<=0||a.fatigue>1.1)a.state='idle'}break}
      case'court':case'rest':case'play':{if(moveTo(a,a.tx,a.ty,dt,a.state==='play'?0.55:0.4)){a.moving=0;a.t-=dt;if(a.state==='rest')a.fatigue=Math.max(0,a.fatigue-dt*0.7);else a.fatigue=Math.max(0,a.fatigue-dt*0.2);
          if(a.state==='play'&&R()<dt*0.7){a.tx=a.x+(R()-.5)*14;a.ty=a.y+(R()-.5)*14}if(a.state==='court'&&R()<dt*0.3){const h=s?s.bld[0]:a;a.tx=h.x+(R()-.5)*14;a.ty=h.y+(R()-.5)*14}
          if((a.t<=0&&(a.state!=='rest'||a.fatigue<0.15||a.job==='elder'))||a.energy<25)a.state='idle'}break}
      case'patrol':{if(!s){a.state='idle';break}a.pang+=dt*0.25;const tr=townRadius(s)+(s.walls?3:8);moveTo(a,s.x+Math.cos(a.pang)*tr,s.y+Math.sin(a.pang)*tr,dt,0.5);a.t-=dt;a.fatigue+=dt*0.1;if(a.t<=0)a.state='idle';break}
      case'march':{const A=f.army;if(!A||a.role!=='soldier'){a.state='idle';break}if(A.state==='siege'){a.state='idle';break}const p=armySlot(A,a.slot);moveTo(a,p.x,p.y,dt,A.state==='march'?1.25:0.9);if(Math.hypot(p.x-a.x,p.y-a.y)<2){a.heading=A.h;a.moving=A.state==='march'?1:0}break}
      case'siege':{const t=settById(a.tsett);if(!t||(t.fac===a.fac&&!a.titan)){a.state='idle';break}
        if(Math.hypot(t.x-a.x,t.y-a.y)<townRadius(t)*0.55+10+a.range*0.5){a.moving=0;a.heading=Math.atan2(t.y-a.y,t.x-a.x);t.hp-=a.dmg*dt*0.3;t.lastAtk=a.titan?-1:a.fac;t.atkT=S.year;if(a.range&&R()<dt*1.5)S.fxq.push({t:'shot',x1:a.x,y1:a.y,x2:t.x+(R()-.5)*20,y2:t.y+(R()-.5)*20,h:f.hue,tier:milTier(f)});if(R()<dt*0.8)S.fxq.push({t:'hit',x:t.x+(R()-.5)*20,y:t.y+(R()-.5)*20});if(t.hp<=0)fallSett(t,a)}else moveTo(a,t.x,t.y,dt);break}
      case'trade':{const t=settById(a.tsett);if(!t){a.state='idle';a.role=null;break}if(moveTo(a,a.tx,a.ty,dt,0.9)){note(t.fac,a.fac,'favor',0.015,'years of honest trade');note(a.fac,t.fac,'favor',0.015,'years of honest trade');t.wealth+=8;t.trades++;if(s){s.wealth+=8;s.trades++}f.stats.trades++;f.treasury+=6;S.facs[t.fac].treasury+=6;S.facs[t.fac].stats.trades++;
        if(s){const k=Math.min(s.id,t.id)+'-'+Math.max(s.id,t.id);const rd=S.roads[k]||(S.roads[k]={a:s.id,b:t.id,n:0,last:0});rd.n++;rd.last=S.year}
        const P=S.facs[t.fac];if(f.research&&P.tech[f.research.id])f.rp+=4;
        a.role=null;a.tsett=null;a.carry+=10;a.cargo=`goods from ${t.name}`;if(s)haul(a,s);else a.state='idle'}break}
      case'ritual':if(a.rit)doRitual(a,dt);else a.state='idle';break;
      case'depart':{a.moving=1;a.y-=dt*30;a.departT=(a.departT||0)+dt;if(a.departT>4){a.dead=true;f.pop--;S.fxq.push({t:'ascend',x:a.x,y:a.y,h:a.g.hue})}break}
      case'migrate':{if(!s){a.state='idle';break}if(moveTo(a,s.x+(a.id%7-3)*3,s.y+(a.id%5-2)*3,dt)){s.store+=a.carry;a.carry=0;a.state='idle'}break}
      case'roam':{if(moveTo(a,a.tx,a.ty,dt,0.7))a.state='idle';break}
      default:{a.state='idle'}
    }
  }

  // what conquest means: plunder, slaughter, chains, burned temples, a people absorbed
  function sackTown(s,old,attF,wasCap,r){gStale=true;const ru=rulerOf(attF);const cruel=(ru?ru.traits.cruelty:0.5)+(r&&r.goal==='holy'?0.25:0)+(r&&r.goal==='extermination'?0.6:0)+attF.values.martial*0.3;
    const dest=capitalOf(attF)||attF.origin;const loot=Math.round(s.store*0.75+(wasCap?old.treasury*0.5:old.treasury*0.1));if(dest.store!=null)dest.store+=s.store*0.75;s.store*=0.15;attF.treasury+=Math.round(wasCap?old.treasury*0.5:old.treasury*0.1);old.treasury*=wasCap?0.4:0.9;
    const burned=Math.floor(s.bld.length*(0.25+cruel*0.3));s.bld.splice(Math.max(0,s.bld.length-burned),burned);
    const res=s.members.filter(m=>!m.dead&&m.char==null&&!m.titan);let killed=0,chained=0,stayed=0;
    for(const m of res){const x=R();if(x<0.12+cruel*0.2){die(m,'massacred');killed++}else if(x<0.3+cruel*0.25&&dest.members){m.fac=attF.id;m.slave=old.id;m.home=dest.id;m.role=null;m.state='migrate';old.pop--;attF.pop++;stats(m);dest.members.push(m);chained++}else{m.fac=attF.id;m.home=s.id;m.role=null;old.pop--;attF.pop++;stats(m);stayed++}}
    s.members=s.members.filter(m=>!m.dead&&m.fac===attF.id&&m.home===s.id);
    // the conquered pray to their old gods for a while; temples of the old faith are burned
    if(old.state!=null){attF.belief=attF.belief||{};attF.belief[old.state]=(attF.belief[old.state]||0)+0.15*Math.min(1,stayed/Math.max(1,attF.pop));normBelief(attF);if(attF.state!=null&&cruel>0.6){old.belief=old.belief||{};old.belief[old.state]=Math.max(0.05,(old.belief[old.state]||0)-0.08);normBelief(old)}}
    if(wasCap){const lost=Object.keys(old.tech).filter(k=>TECH[k].req.length).sort((a,b)=>old.tech[b]-old.tech[a]).slice(0,R()<cruel?2:1);for(const k of lost)if(R()<0.6)delete old.tech[k];for(const c of S.chars)if(c.alive&&c.fac===old.id&&['prophet','heir'].includes(c.role)&&R()<0.5){const ag=charAgent(c);if(ag)die(ag,'executed');charDeath(c,'killed in the sack of '+s.name)}}
    attF.stats.slaves=(attF.stats.slaves||0)+chained;
    return`${loot>0?`The conquerors carry off ${loot} measures of grain and treasure. `:''}${killed?`${killed} are put to the sword. `:''}${chained?`${chained} are led away in chains to ${dest.name||'the conquerors\' capital'}. `:''}${burned?`${burned} buildings burn${wasCap?', the temples and libraries first':''}. `:''}${stayed?`${stayed} remain, now subjects of the ${attF.name}.`:''}`}
  function cedeTown(t,L,Wn){gStale=true;const wc=capitalOf(Wn);let caps=0;t.fac=Wn.id;t.owners.push(Wn.id);t.conqueredYr=yr();t.unrest=0.5;t.governor=null;if(wc)wc.store+=t.store*0.5;t.store*=0.5;
    for(const a of S.agents){if(a.dead||a.fac!==L.id||a.home!==t.id)continue;if(a.char!=null){const c=S.chars[a.char];if(c&&['ruler','heir'].includes(c.role))continue}if(wc&&R()<0.15){a.home=wc.id;a.slave=L.id;a.state='migrate';caps++}a.fac=Wn.id;L.pop--;Wn.pop++;a.role=a.role==='court'?null:a.role;stats(a)}
    for(const c of S.chars)if(c.alive&&c.fac===L.id&&c.settId===t.id)c.fac=Wn.id;if(L.capital===t.id)L.capital=null;return caps}
  function fallSett(s,a){
    const old=S.facs[s.fac];const attF=S.facs[a.fac];const r=a.titan?null:rel(old.id,attF.id);
    // court at the settlement
    const courtHere=s.members.filter(m=>!m.dead&&m.char!=null);
    const raze=a.titan||attF.g.intellect<0.38||(r&&r.goal==='extermination')||(rulerOf(attF)&&rulerOf(attF).traits.cruelty>0.8&&R()<.5);
    if(!raze){
      const wasCap=old.capital===s.id;const sack=sackTown(s,old,attF,wasCap,r);s.fac=attF.id;s.site=null;for(const p of s.plots)p.worker=null;s.hp=s.maxhp*0.5;s.owners.push(attF.id);s.conqueredYr=yr();s.unrest=0.6;attF.stats.conquests++;s.governor=null;if(old.state!=null){attF.belief=attF.belief||{};attF.belief[old.state]=(attF.belief[old.state]||0)+0.12*Math.min(1,s.members.length/Math.max(1,attF.pop));normBelief(attF)}
      const ru=rulerOf(attF);if(ru)deed(ru,`took ${s.name}`,attF.stats.conquests>=3?'conquer':null);
      // renaming by conquerors
      const AL=S.langs[attF.lang],n=S.names[s.nameId];let renamed='';
      if(AL.stage>=1&&AL.id!==n.lang&&(attF.values.order>0.55||(ru&&ru.traits.cruelty>0.55))){const before=s.name;const nn=mkName(AL,n.concepts,`renamed by the conquering ${attF.name}`);S.names[nn].hist=[...n.hist,S.names[nn].hist[0]];s.nameId=nn;s.name=nameStr(nn);renamed=` The conquerors translate its name into their own tongue: ${before} becomes ${s.name}.`}
      for(const m of courtHere){if(m.dead)continue;const c=S.chars[m.char];if(['ruler','heir','prophet','cult leader','governor','general'].includes(c.role)&&(c.role!=='heir'||R()<0.6)){die(m,'executed',a);if(c.alive)charDeath(c,'executed',a)}else{m.home=null;m.role=null}}
      note(old.id,attF.id,'grudge',wasCap?1.2:0.6,`the loss of ${s.name}`);
      log('conquest',3,`Fall of ${s.name}`,`${s.name}, ${wasCap?'the capital':'a '+['camp','village','town','city','great city'][s.level]} of the ${old.name}, falls to the ${attF.name}${a.char!=null?` under ${cname(S.chars[a.char])}`:''}.${renamed} ${sack}`,s.x,s.y,[attF,old],{why:r&&r.goalText?[`The ${attF.name} were at war ${r.goalText}.`]:[]});
      if(wasCap)old.capital=null;
    }else{
      S.setts.splice(S.setts.indexOf(s),1);S.ruins.push({x:s.x,y:s.y,lvl:s.level,h:old.hue,name:s.name,yr:yr()});S.fxq.push({t:'ruin',x:s.x,y:s.y,lvl:s.level});
      for(const m of courtHere)die(m,'slain',a);
      if(!a.titan)note(old.id,attF.id,'grudge',1.5,`the razing of ${s.name}`);
      const why=a.titan?[]:attF.g.intellect<0.38?[`The ${attF.name} cannot hold cities. They only know how to destroy.`]:r&&r.goal==='extermination'?[`Their war aim was extermination.`]:[`Their ruler, ${cname(rulerOf(attF))}, ordered no mercy.`];
      if(!a.titan&&rulerOf(attF)&&attF.g.intellect>=0.38)deed(rulerOf(attF),`razed ${s.name}`,'raze');
      log('razed',3,`${s.name} razed`,a.titan?`${a.titan} tramples ${s.name} of the ${old.name} into the ground.`:`The ${attF.name} do not take ${s.name}. They destroy it. Only a ruin remains of the ${old.name} ${['camp','village','town','city','great city'][s.level]}.`,s.x,s.y,a.titan?[old]:[attF,old],{why});
    }
    for(const f of S.facs)if(f.warTarget===s.id)f.warTarget=null;
  }

  // ---------- settlements ----------
  function updSett(s,dt){
    const f=S.facs[s.fac];s.hp=Math.min(s.maxhp,s.hp+dt*2);s.birthCd-=dt;
    for(const p of s.plots)if(p.grow<1&&p.worker==null)p.grow=Math.min(1,p.grow+dt*0.02*p.fert);
    if(s.birthCd<=0&&S.livePop<CAP&&f.pop<Math.max(60,CAP*0.62)){
      const mem0=s.members.filter(a=>!a.dead&&a.home===s.id&&!a.titan);
      if(mem0.length>=capOf(s)){s.birthCd=0.6;return}
      const adults=mem0.filter(a=>a.age>=8);const par=adults.length?pick(adults):null;const pg=par?par.g:f.g;
      const cost=(22+pg.size*22-pg.fertility*12+pg.intellect*5)*(f.pop<24?0.6:1);
      if(s.store>=cost+mem0.length*0.6){s.store-=cost;f.stats.birthfood=(f.stats.birthfood||0)+cost;s.birthCd=1.0/(0.35+pg.fertility)/Math.max(1,mem0.length/7);
        let g=mutate(pg,f,1,s);
        if(f.quirks.some(q=>q.type==='mimic')){let near=null,nd=600;for(const o of S.setts){if(o.fac===f.id)continue;const d=Math.hypot(o.x-s.x,o.y-s.y);if(d<nd){nd=d;near=o}}if(near){const th=S.facs[near.fac].hue;g.hue=(g.hue+((((th-g.hue)%360+540)%360)-180)*0.04+360)%360}}
        const hs=s.bld.filter(b=>b.cap&&b.prog>=1);const h=hs.length?pick(hs):s.bld[0];
        const a=newAgent(f,g,h.x+(R()-.5)*6,h.y+(R()-.5)*6,s);a.gen=(par?par.gen:0)+1;a.energy=80;a.job='child';s.members.push(a);
        if(g._macro&&g.size>0.82&&g.aggression>0.66&&R()<.35&&S.year>150&&f.pop>40&&S.agents.filter(x=>x.titan&&!x.dead).length<MAXTITANS)makeTitan(a,rad[tIdx(s.x,s.y)]>0.05?'Born in the poisoned ground near '+s.name:null);
      }
    }
  }

  // ================= POLITICS =================
  function setRuler(f,c,how,why){
    const old=rulerOf(f);if(old&&old.alive&&old!==c){old.role=old.role==='ruler'?'deposed':old.role}
    c.role='ruler';c.reignStart=yr();f.ruler=c.id;deed(c,`became ${rulerTitle(f)} of the ${f.name}${how?' ('+how+')':''}`);f.rulers.push({id:c.id,from:yr(),how});if(f.heir===c.id)f.heir=null;if(f.general===c.id)f.general=null;if(f.prophet===c.id)f.prophet=null;
    const a=charAgent(c);if(a){a.role='court';const cs=capitalOf(f);if(cs)a.home=cs.id}
    c.loyalty=1;for(const o of S.chars)if(o.fac===f.id&&o.alive&&o!==c)o.loyalty=clamp(o.loyalty*0.7+0.15);
    return c;
  }
  function ensureCourt(f){
    const cs=capitalOf(f);if(!cs)return;
    let ru=rulerOf(f);
    if(!ru||!ru.alive){const a=pickCourtAgent(f,cs,f.gov==='band'||f.gov==='warband'?'strong':null);if(!a)return;const c=newChar(f,'ruler',a);setRuler(f,c,f.rulers.length?'chosen':'first');
      const title=rulerTitle(f);log('ruler',f.rulers.length===1?2:1,`${cap(cname(c))} leads the ${f.name}`,`${f.rulers.length===1?`The first ${title} of the ${f.name} emerges`:`A new ${title} is chosen`}: ${cname(c)}, ${traitWords(c).join(', ')||'of no particular temper'}.`,cs.x,cs.y,[f],{why:[f.gov==='band'||f.gov==='warband'?'The strongest leads.':'The old line was broken.'],char:c.id});ru=c}
    const g=GOVS[f.gov];
    if(g.succ==='heir'&&(f.heir==null||!S.chars[f.heir].alive)){const a=pickCourtAgent(f,cs,'young');if(a){const h=newChar(f,'heir',a,ru);f.heir=h.id;h.parent=ru.id;ru.kids=ru.kids||[];ru.kids.push(h.id);if(ru.spouse!=null){h.parent2=ru.spouse;const sp0=S.chars[ru.spouse];if(sp0)sp0.kids=(sp0.kids||[]).concat(h.id)}if(ru.spouse!=null){const sp=S.chars[ru.spouse];if(sp&&sp.fac!==f.id){h.claim=sp.fac;h.g=mixG(ru.g,sp.g);a.g.hue=h.g.hue}}}}
    if((f.general==null||!S.chars[f.general].alive)&&(f.values.martial>0.45||anyWar(f))){const a=pickCourtAgent(f,cs,'strong');if(a){const c=newChar(f,'general',a);f.general=c.id;a.role='soldier'}}
    if((f.prophet==null||!S.chars[f.prophet].alive)&&f.values.faith>0.55&&f.tech.faith){const a=pickCourtAgent(f,cs);if(a){const c=newChar(f,'prophet',a);c.traits.piety=clamp(c.traits.piety+0.3);f.prophet=c.id}}
    for(const s of facSetts(f)){if(s===cs||s.level<2)continue;if(s.governor==null||!S.chars[s.governor].alive||S.chars[s.governor].fac!==f.id){const kid=(ru.kids||[]).map(i=>S.chars[i]).find(k=>k&&k.alive&&k.role==='child'&&k.fac===f.id);if(kid){kid.role='governor';kid.settId=s.id;s.governor=kid.id;const ka=charAgent(kid);if(ka)ka.home=s.id;kid.loyalty=clamp(kid.loyalty-0.15);deed(kid,`was sent to govern ${s.name}`);log('appoint',1,`${cap(cname(kid))} is sent to ${s.name}`,`${cap(cname(ru))} sends ${cname(kid)}, a younger child, to govern ${s.name}, far from the court and from the heir.`,s.x,s.y,[f],{char:kid.id})}else{const a=pickCourtAgent(f,s);if(a){const c=newChar(f,'governor',a);c.settId=s.id;s.governor=c.id;a.home=s.id}}}}
    houseLife(f,ru,cs);
  }
  function houseLife(f,ru,cs){
    if(!ru||!ru.alive||f.g.intellect<0.34)return;
    if(ru.spouse!=null){const sp=S.chars[ru.spouse];if(sp&&!sp.alive&&sp.fac===f.id&&!ru.grieved){ru.grieved=sp.id;const L0=ru.love||0.5;ru.traits.warmth=clamp(ru.traits.warmth-0.25*L0);ru.traits.cruelty=clamp(ru.traits.cruelty+0.2*L0);ru.traits.paranoia=clamp(ru.traits.paranoia+0.15*L0);deed(ru,`lost ${cname(sp)}`);
      log('grief',L0>0.6?2:1,`${cap(cname(ru))} mourns ${cname(sp)}`,L0>0.6?`${cap(cname(sp))} dies, and ${cname(ru)} is not the same afterward. The court learns to speak quietly.`:`${cap(cname(sp))} dies. ${cap(cname(ru))} attends the rites and returns to work the same day.`,cs.x,cs.y,[f],{char:ru.id,char2:sp.id,why:[`They had been married since year ${sp.deeds.find(d=>d.txt.startsWith('married'))?sp.deeds.find(d=>d.txt.startsWith('married')).yr:'?'}.`]});ru.spouse=null;ru.widowedAt=yr()}}
    if(ru.spouse==null&&yr()-ru.reignStart>2&&(!ru.widowedAt||yr()-ru.widowedAt>12)&&R()<0.1){const a=pickCourtAgent(f,cs);if(a){const sp=newChar(f,'consort',a);const love=clamp(0.2+R()*0.6+(ru.traits.warmth+sp.traits.warmth-1)*0.3);ru.spouse=sp.id;sp.spouse=ru.id;ru.love=love;sp.love=love;ru.grieved=null;deed(ru,`married ${cname(sp)}`);deed(sp,`married ${cname(ru)}`);
      log('wedding',2,`${cap(cname(ru))} weds ${cname(sp)}`,love>0.7?`${cap(cname(ru))} marries ${cname(sp)} for love, which everyone at court can see and some resent.`:love<0.4?`${cap(cname(ru))} marries ${cname(sp)} to bind a powerful family to the throne. Neither pretends otherwise.`:`${cap(cname(ru))} marries ${cname(sp)}. It begins as duty and slowly becomes something warmer.`,cs.x,cs.y,[f],{char:ru.id,char2:sp.id,why:[love>0.7?'Love.':love<0.4?'Politics.':'Duty, and then affection.']})}}
    const sp=ru.spouse!=null?S.chars[ru.spouse]:null;ru.kids=ru.kids||[];
    if(sp&&sp.alive&&sp.fac===f.id&&ru.kids.length<3&&R()<0.07){const a=pickCourtAgent(f,cs,'young');if(a){const first=!ru.kids.some(i=>S.chars[i]&&S.chars[i].alive);const k=newChar(f,'child',a,ru);k.parent=ru.id;k.parent2=sp.id;k.g=mixG(ru.g,sp.g);ru.kids.push(k.id);sp.kids=(sp.kids||[]).concat(k.id);
      if(first&&(f.heir==null||!S.chars[f.heir]||!S.chars[f.heir].alive||S.chars[f.heir].parent!==ru.id)){if(f.heir!=null&&S.chars[f.heir]&&S.chars[f.heir].alive){S.chars[f.heir].role='courtier';S.chars[f.heir].loyalty=clamp(S.chars[f.heir].loyalty-0.3)}f.heir=k.id;k.role='heir'}
      deed(ru,`had a child, ${cname(k)}`);log('birth',1,`${cap(cname(k))} is born`,`${cap(cname(ru))} and ${cname(sp)} have ${ru.kids.length===1?'their first child':'another child'}, ${cname(k)}${k.role==='heir'?', who will one day rule':''}.`,cs.x,cs.y,[f],{char:k.id})}}
  }
  function mixG(a,b){const g={};for(const k of TRAITS)g[k]=(a[k]+b[k])/2;const hx=Math.cos(a.hue*Math.PI/180)+Math.cos(b.hue*Math.PI/180),hy=Math.sin(a.hue*Math.PI/180)+Math.sin(b.hue*Math.PI/180);g.hue=((Math.atan2(hy,hx)*180/Math.PI)+360)%360;return g}
  function rulerTitle(f){return{band:'leader',warband:'alpha',hive:'voice',chiefdom:'chief',cult:'dreamer',monarchy:'monarch',theocracy:'high priest',republic:'consul',oligarchy:'first merchant',empire:'emperor',commune:'first artist',democracy:'president',technocracy:'chief engineer',police:'protector',junta:'general'}[f.gov]||'ruler'}
  S.rulerTitle=rulerTitle;
  function anyWar(f){for(const o of alive())if(o!==f&&rel(f.id,o.id).war)return true;return false}
  function charDeath(c,cause,killer){
    if(!c.alive)return;c.alive=false;c.died=yr();c.cause=cause;const f=S.facs[c.fac];const kf=killer?S.facs[killer.fac]:null;
    if(c.role==='ruler'&&f.ruler===c.id){
      const how=cause==='age'?'dies of old age':cause==='hunger'?'starves':cause==='executed'?`is executed by the conquering ${kf?kf.name:'enemy'}`:cause==='assassinated'?'is murdered':cause==='plague'?'dies of plague':kf&&kf.id!==f.id?`is killed by the ${kf.name}`:'dies';
      if(kf&&kf.id!==f.id){note(f.id,kf.id,'grudge',1.5,`the killing of ${cname(c)}`);
        if(c.spouse!=null){const sp=S.chars[c.spouse];if(sp&&sp.alive&&sp.fac!==f.id&&sp.fac!==kf.id){note(sp.fac,kf.id,'grudge',2.2,`the murder of ${cname(sp)}'s beloved ${cname(c)}`);deed(sp,`swore vengeance for ${cname(c)}`,'avenge')}}}
      log('rulerdeath',2,`Death of ${cname(c)}`,`${cap(cname(c))}, ${rulerTitle(f)} of the ${f.name} for ${yr()-c.reignStart} years, ${how}.`,(capitalOf(f)||f.origin).x,(capitalOf(f)||f.origin).y,kf&&kf!==f?[f,kf]:[f],{char:c.id});
      f.ruler=null;succession(f,c);
    }else if(c.role==='heir'){if(f.heir===c.id)f.heir=null;const ru=rulerOf(f);if(ru&&c.parent===ru.id&&cause!=='age'){deed(ru,`lost the heir ${cname(c)}`);log('heirdeath',2,`The heir ${cname(c)} dies`,`${cap(cname(c))}, child of ${cname(ru)} and heir to the ${f.name}, ${cause==='slain'?'is killed':cause==='plague'?'dies of fever':cause==='executed'?'is executed':'dies'}. The succession is open again.`,(capitalOf(f)||f.origin).x,(capitalOf(f)||f.origin).y,[f],{char:c.id})}}
    else if(c.role==='general'||c.role==='champion'){if(f.general===c.id)f.general=null;if(cause==='slain'&&c.deeds.length)log('herodeath',1,`Death of ${cname(c)}`,`${cap(cname(c))} falls in battle${kf?` to the ${kf.name}`:''}.`,(capitalOf(f)||f.origin).x,(capitalOf(f)||f.origin).y,[f])}
    else if(c.role==='prophet'){if(f.prophet===c.id)f.prophet=null}
    if(c.spouse!=null){const sp=S.chars[c.spouse];if(sp)sp.widowed=c.id}
  }
  function succession(f,dead){
    const g=GOVS[f.gov];const cs=capitalOf(f);if(!cs){return}
    const cands=S.chars.filter(c=>c.alive&&c.fac===f.id&&c.role!=='ruler');
    let heir=null,how='',why=[];
    if(g.succ==='heir'&&f.heir!=null&&S.chars[f.heir].alive){heir=S.chars[f.heir];how='inherits the throne';why=[`${cap(cname(heir))} is the heir of ${cname(dead)}.`];
      // rival claimant?
      const rival=cands.filter(c=>c!==heir&&(c.role==='general'||c.role==='governor')&&c.traits.ambition>0.7&&c.loyalty<0.45)[0];
      if(rival&&facSetts(f).length>=2&&R()<0.6){civilWar(f,heir,rival,`${cap(cname(rival))} refuses to kneel to ${cname(heir)}.`);return}}
    else if(g.succ==='election'){const score=c=>c.traits.genius*0.5+c.traits.warmth*0.4+c.traits.honor*0.3+R()*0.3;const best=cands.concat(newCandidates(f)).filter(Boolean).sort((a,b)=>score(b)-score(a))[0];if(best){heir=best;how='is elected';why=['The citizens vote.',`${cap(cname(best))} is seen as ${traitWords(best).join(' and ')||'reliable'}.`]}}
    else if(g.succ==='divine'){heir=f.prophet!=null&&S.chars[f.prophet].alive?S.chars[f.prophet]:cands.sort((a,b)=>b.traits.piety-a.traits.piety)[0];how='is chosen by signs and omens';why=['The priests read the omens.']}
    else if(g.succ==='strongest'){heir=f.general!=null&&S.chars[f.general].alive?S.chars[f.general]:null;how='takes command by strength';why=['The strongest leads.']}
    else if(g.succ==='council'){heir=cands.sort((a,b)=>b.traits.genius-a.traits.genius)[0];how='is appointed by the council';why=['The council picks the cleverest.']}
    // foreign claim through marriage
    if(!heir){const claimant=S.chars.find(c=>c.alive&&c.claim===f.id&&c.fac!==f.id);if(claimant){const C=S.facs[claimant.fac];const op=opinion(f.id,C.id);if(op>0.15){union(C,f,claimant);return}else{declareWar(C,f,'succession',[`${cap(cname(claimant))} of the ${C.name}, child of a marriage, claims the empty throne of the ${f.name}.`]);}}}
    if(!heir){const a=pickCourtAgent(f,cs,'strong');if(!a)return;heir=newChar(f,'ruler',a);how='seizes power in the confusion';why=[`No one had a rightful claim after ${cname(dead)}.`]}
    setRuler(f,heir,how);
    log('succession',1,`${cap(cname(heir))} ${how}`,`After ${cname(dead)}, ${cname(heir)} ${how} and becomes ${rulerTitle(f)} of the ${f.name}.`,cs.x,cs.y,[f],{why,char:heir.id});
  }
  function newCandidates(f){const cs=capitalOf(f);const a=cs?pickCourtAgent(f,cs):null;if(!a)return[];return[newChar(f,'citizen',a)]}
  function union(A,B,claimant){gStale=true;
    const setsB=facSetts(B);for(const s of setsB){s.fac=A.id;s.owners.push(A.id)}for(const a of S.agents)if(!a.dead&&a.fac===B.id){a.fac=A.id;B.pop--;A.pop++;stats(a)}
    for(const c of S.chars)if(c.fac===B.id&&c.alive){c.fac=A.id}
    B.died=yr();B.endCause='union';B.snaps.push({yr:yr(),...snap(B)});
    deed(claimant,`united the ${A.name} and the ${B.name}`);
    log('union',3,`Union of the ${A.name} and the ${B.name}`,`With no heir of their own, the ${B.name} accept ${cname(claimant)} as ruler, the child of a marriage between their houses. The two peoples become one realm. The ${B.name} keep their tongue and their place names.`,(setsB[0]||B.origin).x,(setsB[0]||B.origin).y,[A,B],{why:[`A marriage made years earlier left ${cname(claimant)} with a claim.`,`The ${B.name} thought well of the ${A.name}.`]});
  }
  function civilWar(f,loyal,rebel,reason){
    const sets=facSetts(f);const cs=capitalOf(f);if(sets.length<2)return;
    const rs=rebel.settId?settById(rebel.settId):sets.filter(s=>s!==cs).sort((a,b)=>b.unrest-a.unrest)[0];
    setRuler(f,loyal,'inherits a divided realm');
    const nf=secede(f,rs,rebel,'civil war',[reason,'The realm splits in two.']);
    if(nf){const r=rel(f.id,nf.id);declareWar(nf,f,'succession',[reason],true)}
  }
  function secede(f,s,leader,kind,why){gStale=true;
    if(!s||s.fac!==f.id)return null;
    const sets=facSetts(f);const cs=capitalOf(f);if(s===cs)return null;
    const members=s.members.filter(a=>!a.dead);if(members.length<3)return null;
    let g=meanGenome(members);
    const used=alive().map(o=>o.hue);let best=g.hue,bs=-1;for(let t=0;t<24;t++){const h=(g.hue+30+t*15)%360;const sc=Math.min(...used.map(u=>hueDist(u,h)));if(sc>bs){bs=sc;best=h}}const shift=best-g.hue;g.hue=best;
    const PL=S.langs[f.lang];const L=newLang(PL);
    const grievance=kind==='revolution'?'free':kind==='faith'?'true':kind==='civil war'?'true':'free';
    let con=[grievance,S.names[s.nameId].concepts[0]];for(let t=0;t<6&&S.facs.some(o=>o.died==null&&S.names[o.nameId].concepts.join()===con.join());t++)con=[pick(['free','true','new','great','high']),pick(PERSONAL)];const nf=newFaction(g,s.x,s.y,f,con,L);
    nf.tech={...f.tech};nf.values={...f.values};nf.belief={...(f.belief||{})};nf.state=f.state;nf.gov=f.gov==='band'?'band':kind==='revolution'?'republic':f.gov;
    if(f.research)nf.research={...f.research};
    // take the seceding settlement and its unhappy neighbors
    const taken=[s];for(const o of sets){if(o===cs||o===s)continue;if(o.unrest>0.45&&Math.hypot(o.x-s.x,o.y-s.y)<Math.hypot(o.x-cs.x,o.y-cs.y))taken.push(o)}
    for(const o of taken){o.fac=nf.id;o.owners.push(nf.id);o.unrest=0.1;const n=S.names[o.nameId];const nn={...n,id:S.names.length,lang:L.id,hist:[...n.hist]};S.names.push(nn);o.nameId=nn.id}
    for(const a of S.agents){if(a.dead||a.fac!==f.id)continue;const h=settById(a.home);if(h&&h.fac===nf.id){a.fac=nf.id;f.pop--;nf.pop++;a.g.hue=(a.g.hue+shift+360)%360;a.role=a.role==='court'?a.role:null;stats(a)}}
    for(const c of S.chars){if(c.fac===f.id&&c.alive){const a=charAgent(c);if(a&&a.fac===nf.id)c.fac=nf.id}}
    if(leader){leader.fac=nf.id;setRuler(nf,leader,'leads the breakaway');deed(leader,`led ${s.name} out of the ${f.name}`,kind==='revolution'?'liberate':null)}
    if(f.state!=null&&leader&&R()<0.15&&liveFaiths()<10)foundFaith(nf,leader,S.faiths[f.state],`The rebels wanted their own church as well as their own throne.`);
    nf.g=meanGenome(S.agents.filter(a=>!a.dead&&a.fac===nf.id));nf.hue=distinctHue(nf.g.hue,nf);nf.arch=archetypeOf(nf.g);nf.capital=s.id;
    refreshNames(nf);
    note(f.id,nf.id,'grudge',0.6,`the treason of ${s.name}`);note(nf.id,f.id,'grudge',0.3,'years of misrule');
    const title=kind==='revolution'?`The ${nf.name} Revolution`:kind==='civil war'?`The War of the ${nf.name}`:`The ${nf.name} Secession`;
    log('schism',3,title,`${s.name}${taken.length>1?` and ${taken.length-1} other settlement${taken.length>2?'s':''}`:''} break${taken.length>1?'':'s'} away from the ${f.name}${leader?` under ${cname(leader)}`:''}. They call themselves the ${nf.name}${S.langs[L.id].stage?` ("the ${nf.gloss}")`:''} and speak a dialect that is already drifting from the mother tongue.`,s.x,s.y,[nf,f],{why});
    return nf;
  }

  // ---------- unrest ----------
  function unrestOf(f,s,cs,ru){
    const fac=[];const add=(v,t)=>{if(v>0.02)fac.push([v,t])};
    if(s!==cs&&cs){const d=Math.hypot(s.x-cs.x,s.y-cs.y);add(d/1200*0.28,`it lies far from ${cs.name}`)}
    const m=s.members.filter(a=>!a.dead);if(m.length>=3){const dv=gdist(meanGenome(m),f.g);add(Math.max(0,dv-0.04)*2.5,'its people have grown different in body from the rest')}
    if(s.owners[0]!==f.id&&s.conqueredYr!=null)add(0.35*Math.max(0,1-(yr()-s.conqueredYr)/120),`it was conquered from the ${S.facs[s.owners[0]].name}`);
    if(s.store<m.length*0.4)add(0.12,'its stores are empty');
    if(f.warWeary>8)add(Math.min(0.15,(f.warWeary-8)*0.008),'the endless war');
    if(ru){add(ru.traits.cruelty*0.18,`${cname(ru)} is cruel`);add(ru.traits.greed*0.1,`${cname(ru)} taxes heavily`)}
    add(GOVS[f.gov].un,`they resent ${GOVS[f.gov].label.toLowerCase()} rule`);
    add(faithUnrest(f),`many here pray to other gods than the throne's`);
    if(f.tech.printing&&['monarchy','empire','police','junta','theocracy'].includes(f.gov))add(0.12,'pamphlets question the right to rule');
    if(s.governor!=null){const gv=S.chars[s.governor];if(gv&&gv.alive)add(gv.traits.ambition*(1-gv.loyalty)*0.25,`its governor ${cname(gv)} stirs resentment`)}
    let v=fac.reduce((t,x)=>t+x[0],0);
    if(f.golden)v-=0.12;if(S.wonders.some(w=>w.fac===f.id&&Math.hypot(w.x-s.x,w.y-s.y)<300))v-=0.08;if(f.tech.faith&&f.values.faith>0.5)v-=0.05;
    const rep=GOVS[f.gov].rep||0;if(rep){s.resent=Math.min(2,s.resent+v*rep*0.06);v=v*(1-rep)}
    v+=s.resent*0.12;
    fac.sort((a,b)=>b[0]-a[0]);return{v:clamp(v),why:fac.slice(0,3).map(x=>x[1])};
  }

  // ---------- war & diplomacy ----------
  const GOALTXT={conquest:'for land',vengeance:'for vengeance',holy:'as a holy war',raid:'for food',extermination:'to exterminate them',reunify:'to restore the realm',succession:'over the succession',tribute:'over refused tribute',betrayal:'by betrayal',defense:'in defense of an ally'};
  function declareWar(A,B,goal,why,silent){if(S.dlev&&S.dlev('noWar')&&S.isMine(A)&&goal!=='defense')return;
    const r=rel(A.id,B.id);if(r.war)return;r.war=true;r.trade=false;r.since=S.year;r.warDeaths=0;r.goal=goal;r.goalText=GOALTXT[goal];r.aggressor=A.id;r.lost={};
    const wasAlly=r.ally;r.ally=false;
    if(wasAlly||r.marriage){A.rep-=0.5;note(B.id,A.id,'grudge',2.5,`the betrayal by ${cname(rulerOf(A))}`);for(const o of alive())if(o!==A&&o!==B)note(o.id,A.id,'grudge',0.3,'their betrayal of an ally');const ru=rulerOf(A);if(ru)deed(ru,`betrayed the ${B.name}`,'betray');if(r.marriage){r.marriage.broken=yr()}}
    const ru=rulerOf(A);if(ru)ru.lastWar=yr();
    const title=wasAlly||r.marriage?`The Betrayal of the ${B.name}`:goal==='holy'?`Holy War against the ${B.name}`:goal==='vengeance'?`War of Vengeance against the ${B.name}`:`War: ${A.name} against ${B.name}`;
    const cs=capitalOf(A)||A.origin,cb=capitalOf(B)||B.origin;
    if(!silent)log(wasAlly?'betrayal':'war',3,title,`${ru?cap(cname(ru))+', '+rulerTitle(A)+' of the '+A.name:'The '+A.name} ${wasAlly||r.marriage?'breaks every oath and attacks':'declares war on'} the ${B.name} ${GOALTXT[goal]}.`,(cs.x+cb.x)/2,(cs.y+cb.y)/2,[A,B],{why,decider:ru?ru.id:null,goal,a:A.id,b:B.id});
    else S.events[S.events.length-1].data.why=(S.events[S.events.length-1].data.why||[]).concat([]);
    // allies respond
    for(const C of alive()){if(C===A||C===B)continue;const rc=rel(C.id,B.id);if(!(rc.ally||rc.marriage))continue;const cr=rulerOf(C);if(rel(C.id,A.id).war)continue;
      const honor=cr?cr.traits.honor:0.5;const fear=power(A)/Math.max(1,power(C));const sc=honor*1.2+opinion(C.id,B.id)-opinion(C.id,A.id)*0.5-Math.max(0,fear-1.5)*0.5;
      if(sc>0.6){declareWar(C,A,'defense',[`${cap(cname(cr))} honors the oath sworn to the ${B.name}.`],true);note(B.id,C.id,'favor',1,`the ${C.name} came to our aid`);if(cr)deed(cr,`honored the alliance with the ${B.name}`);
        log('oath',2,`The ${C.name} honor their oath`,`When the ${A.name} attack the ${B.name}, ${cname(cr)} of the ${C.name} goes to war beside their ally.`,(capitalOf(C)||C.origin).x,(capitalOf(C)||C.origin).y,[C,B,A],{why:[`They were sworn allies${rc.marriage?' and bound by marriage':''}.`,cr?`${cap(cname(cr))} is ${traitWords(cr).join(', ')||'steady'}.`:'']})}
      else{rc.ally=false;note(B.id,C.id,'grudge',1.2,`the ${C.name} abandoned us`);log('abandon',2,`The ${C.name} abandon the ${B.name}`,`Sworn to defend the ${B.name}, ${cr?cname(cr):'the '+C.name} stays home when war comes.`,(capitalOf(C)||C.origin).x,(capitalOf(C)||C.origin).y,[C,B],{why:[fear>1.5?`The ${A.name} are too strong to risk it.`:`${cr?cap(cname(cr)):'They'} cared more for themselves than the oath.`]})}}
  }
  S.declareWar=declareWar;
  function makePeace(A,B,why,terms){const r=rel(A.id,B.id);if(!r.war)return;const dur=Math.floor(S.year-r.since);r.war=false;r.truce=yr()+25;r.goal=null;
    const cs=capitalOf(A)||A.origin,cb=capitalOf(B)||B.origin;const ru=rulerOf(A);if(ru&&ru.traits.warmth>0.6)deed(ru,`made peace with the ${B.name}`,'peace');
    if(terms==='tribute'){r.tribute={from:B.id,to:A.id,until:yr()+30};note(B.id,A.id,'grudge',0.6,'the humiliating tribute')}
    // the victor dictates: towns ceded, people annexed, treasure and captives taken
    let treaty='';const lA=(r.lost||{})[A.id]||0,lB=(r.lost||{})[B.id]||0;const rA=lA/Math.max(1,A.pop+lA),rB=lB/Math.max(1,B.pop+lB);
    if(r.warDeaths>=5&&Math.max(rA,rB)>Math.min(rA,rB)*1.4+0.02){const Wn=rA<rB?A:B,Ln=Wn===A?B:A;const lop=Math.max(rA,rB)/Math.max(0.01,Math.min(rA,rB));const n=lop>3?2:1;const wc=capitalOf(Wn)||Wn.origin;
      treaty=` The ${Wn.name} won it. `+S.peaceTerms(Wn,Ln,lop);note(Ln.id,Wn.id,'grudge',0.5,'the lost war');r.victor=Wn.id}
    const wcap=(capitalOf(rA<rB?A:B)||{}).name;const LnN=(rA<rB?B:A).name;log('peace',treaty?3:2,treaty&&wcap?pick([`The Peace of ${wcap}`,`The Treaty of ${wcap}`,`The Humbling of the ${LnN}`,`The ${wcap} Accords`,`The Surrender of the ${LnN}`]):pick([`Peace between the ${A.name} and the ${B.name}`,`An Exhausted Peace`,`The ${A.name} and the ${B.name} Lay Down Their Arms`]),`After ${dur} years and ${r.warDeaths} dead, ${ru?cname(ru):'the '+A.name} and the ${B.name} make peace.${terms==='tribute'&&!treaty?` The ${B.name} must pay tribute for thirty years.`:''}${treaty}`,(cs.x+cb.x)/2,(cs.y+cb.y)/2,[A,B],{why,decider:ru?ru.id:null,dur,dead:r.warDeaths,terms:terms||null});
  }
  function score(list){return list.reduce((t,x)=>t+x[0],0)}
  function reasonsOf(list){return list.filter(x=>x[0]>0.12).sort((a,b)=>b[0]-a[0]).slice(0,3).map(x=>x[1])}
  function foreignPolicy(f){
    const ru=rulerOf(f);if(!ru)return;const T=ru.traits;const smart=f.g.intellect>0.36;
    const others=alive().filter(o=>o!==f&&facSetts(o).length);
    const myP=power(f);const hunger=facSetts(f).reduce((t,s)=>t+(s.store<s.members.length*2?1:0),0)/Math.max(1,facSetts(f).length);
    const crowd=S.livePop>CAP*0.85?0.12:0;
    let best=null;
    const consider=(sc,reasons,fn,kind)=>{if(!best||sc>best.sc)best={sc,reasons,fn,kind}};
    for(const B of others){
      const r=rel(f.id,B.id);const op=opinion(f.id,B.id);const bp=power(B);const ratio=myP/Math.max(1,bp);const bd=borderDist(f,B);const near=bd<650;
      const g=topNote(f.id,B.id,'grudge');const m=mem(f.id,B.id);
      if(!r.war){
        if(!near&&!(f.tech.navigation&&bd<1100))continue;
        if(r.truce>yr()&&T.honor>0.4)continue;
        const w=[];
        if(m.grudge>0.3&&g)w.push([m.grudge*0.7,`to avenge ${g.txt}`]);
        w.push([hunger*0.4+crowd,hunger>0.3?`their own people are hungry`:`their land is crowded`]);
        if(ratio>1.3)w.push([Math.min(0.55,(ratio-1.2)*0.3)*T.ambition,`the ${B.name} look weak`]);
        w.push([f.values.martial*0.35,`the ${f.name} prize war`]);
        w.push([T.ambition*0.3,`${cname(ru)} is ambitious`]);
        w.push([T.cruelty*0.15,`${cname(ru)} enjoys conquest`]);
        const FA=f.state!=null?S.faiths[f.state]:null,FB=B.state!=null?S.faiths[B.state]:null;let holy=0;if(FA&&FB&&FA!==FB){holy=FA.root===FB.root?0.45:Math.max(0,faithWarScore(FA))*0.6;holy*=(0.4+T.piety)*(0.5+f.values.faith);if(holy>0.05)w.push([holy,FA.root===FB.root?`the ${B.name} follow ${FB.title}, a heresy of their own faith`:`the ${B.name} worship ${FB.gods[0].name}, a false god`])}else if(FA&&!FB&&FA.tenets.includes('convert'))w.push([0.25*T.piety,`the ${B.name} have never heard the truth of ${FA.title}`]);
        if(!smart&&(f.arch==='horde'||f.arch==='predator'))w.push([0.6,`the ${f.name} see the ${B.name} as prey`]);
        if(B.parent===f.id&&m.notes.some(n=>n.txt.startsWith('the treason')))w.push([0.35*f.values.order,`the ${B.name} are rebels who must return`]);
        const restraint=[];
        restraint.push([Math.max(0,op)*1.2,'friendship']);if(r.ally)restraint.push([0.8+T.honor,'alliance']);if(r.marriage)restraint.push([0.9*r.marriage.love+T.warmth*0.4,'marriage']);if(r.trade)restraint.push([0.3,'trade']);
        restraint.push([Math.max(0,1/ratio-0.9)*0.9,'fear']);restraint.push([T.warmth*0.35+f.values.harmony*0.3,'temperament']);restraint.push([f.warWeary*0.02,'weariness']);
        if(r.truce>yr())restraint.push([0.6*T.honor+0.3,'truce']);
        const sc=score(w)-score(restraint);
        const goal=m.grudge>0.8?'vengeance':holy>0.3?'holy':(!smart||T.cruelty>0.85&&f.values.martial>0.6)?'extermination':B.parent===f.id?'reunify':hunger>0.5?'raid':'conquest';
        const rs=reasonsOf(w);if(r.ally||r.marriage)rs.unshift(`${cap(cname(ru))} weighs the oath and decides it no longer binds them`);
        consider(sc-0.9,rs,()=>declareWar(f,B,r.ally||r.marriage?'betrayal':goal,rs),'war');
        // alliance / marriage / trade
        if(smart&&B.g.intellect>0.36&&!r.ally&&op>0.25){const common=others.filter(C=>C!==B&&rel(f.id,C.id).war&&rel(B.id,C.id).war).length;
          const a=[[op*0.8,`they think well of the ${B.name}`],[common*0.6,'they share an enemy'],[f.values.harmony*0.3,'the ' +f.name+' value harmony'],[Math.max(0,bp/myP-0.8)*0.3,'the '+B.name+' are strong friends to have']];
          consider(score(a)-0.95,reasonsOf(a),()=>{if(opinion(B.id,f.id)>0.1){r.ally=true;note(f.id,B.id,'favor',0.5,'our sworn alliance');note(B.id,f.id,'favor',0.5,'our sworn alliance');log('alliance',2,`Alliance of the ${f.name} and the ${B.name}`,`${cap(cname(ru))} and ${cname(rulerOf(B))} swear to defend one another.`,(capitalOf(f).x+capitalOf(B).x)/2,(capitalOf(f).y+capitalOf(B).y)/2,[f,B],{why:reasonsOf(a),decider:ru.id})}else{note(f.id,B.id,'grudge',0.2,'they refused our alliance');log('refusal',1,`The ${B.name} refuse an alliance`,`${cap(cname(ru))} proposes an alliance and is turned away.`,capitalOf(B).x,capitalOf(B).y,[f,B],{why:[`The ${B.name} did not trust them.`]})}},'ally')}
        const rb=rulerOf(B);
        if(smart&&B.g.intellect>0.38&&rb&&ru.spouse==null&&rb.spouse==null&&op>0.2&&!r.marriage&&yr()-ru.reignStart<60){const a=[[op*0.7,`the houses of the ${f.name} and the ${B.name} are friendly`],[T.warmth*0.5,`${cname(ru)} is warm-hearted`],[(r.ally?0.3:0),'it would seal their alliance'],[R()*0.3,'they were drawn to each other']];
          consider(score(a)-1.05,reasonsOf(a),()=>{const opB=opinion(B.id,f.id)+rb.traits.warmth*0.3;if(opB>0.15){const love=clamp(0.3+R()*0.5+(T.warmth+rb.traits.warmth)*0.2);r.marriage={a:ru.id,b:rb.id,love,yr:yr()};ru.spouse=rb.id;rb.spouse=ru.id;r.ally=true;deed(ru,`married ${cname(rb)} of the ${B.name}`,love>0.75?'love':null);deed(rb,`married ${cname(ru)} of the ${f.name}`,love>0.75?'love':null);
            log('marriage',2,`The Marriage of ${cname(ru)} and ${cname(rb)}`,`${cap(cname(ru))} of the ${f.name} weds ${cname(rb)} of the ${B.name}. ${love>0.75?'By every account it is a marriage of love, rare between rulers.':love<0.45?'It is a cold arrangement, and everyone knows it.':'It begins as politics and slowly becomes affection.'} The two peoples become allies, and any child will have a claim to both thrones.`,(capitalOf(f).x+capitalOf(B).x)/2,(capitalOf(f).y+capitalOf(B).y)/2,[f,B],{why:reasonsOf(a),decider:ru.id})}
            else{note(f.id,B.id,'grudge',0.35,`${cname(rb)} refused the marriage`);log('refusal',1,`${cap(cname(rb))} refuses ${cname(ru)}`,`A marriage between the ${f.name} and the ${B.name} is proposed and refused.`,capitalOf(B).x,capitalOf(B).y,[f,B],{why:[`${cap(cname(rb))} is ${traitWords(rb).join(', ')||'unmoved'}.`]})}},'marry')}
        if(smart&&!r.trade&&(f.values.trade+B.values.trade)>0.7&&op>-0.1&&f.tech.speech&&B.tech.speech){const a=[[f.values.trade*0.6,`the ${f.name} value commerce`],[T.greed*0.3,`${cname(ru)} wants wealth`],[Math.max(0,op)*0.4,'relations are good']];
          consider(score(a)-0.5,reasonsOf(a),()=>{if(opinion(B.id,f.id)>-0.15){r.trade=true;log('trade',2,`Trade opens between the ${f.name} and the ${B.name}`,`The first caravans move between the ${f.name} and the ${B.name}, carrying ${goods(f)} one way and ${goods(B)} the other.`,(capitalOf(f).x+capitalOf(B).x)/2,(capitalOf(f).y+capitalOf(B).y)/2,[f,B],{why:reasonsOf(a),decider:ru.id})}},'trade')}
        if(smart&&ratio>1.8&&near&&!r.tribute&&!r.ally&&T.greed+T.ambition>1.1&&B.g.intellect>0.36){const a=[[T.greed*0.5,`${cname(ru)} is greedy`],[(ratio-1.5)*0.3,`the ${B.name} are far weaker`]];
          consider(score(a)-0.7,reasonsOf(a),()=>{const rb2=rulerOf(B);const pride=(rb2?rb2.traits.ambition*0.6:0.3)+B.values.martial*0.5;const fear=ratio*0.25;if(fear>pride){r.tribute={from:B.id,to:f.id,until:yr()+30};note(B.id,f.id,'grudge',0.7,'the tribute forced on us');log('tribute',2,`The ${B.name} bow to the ${f.name}`,`${cap(cname(ru))} demands tribute and the ${B.name}, too weak to refuse, agree to send food every year.`,capitalOf(B).x,capitalOf(B).y,[f,B],{why:reasonsOf(a),decider:ru.id})}else{note(f.id,B.id,'grudge',0.6,'they refused our demand for tribute');declareWar(f,B,'tribute',[`The ${B.name} refused to pay tribute.`,`${cap(cname(rb2))} is too proud to bow.`])}},'tribute')}
      }else{
        // at war: peace? nuke? blight?
        const dur=S.year-r.since;const lostMine=r.lost[f.id]||0,lostTheirs=r.lost[B.id]||0;const losing=lostMine>lostTheirs*1.4&&lostMine>6;const capLost=facSetts(f).length<(f.stats.maxSetts*0.5);
        const p=[[Math.min(1.2,dur*0.025),'years of war have exhausted them'],[lostMine*0.012,`they have lost ${lostMine} in this war`],[T.warmth*0.35,`${cname(ru)} wants the killing to end`],[Math.max(0,op)*0.5,'old friendship']];
        const k=[[m.grudge*0.25,'the grudge still burns'],[T.ambition*0.3,'ambition'],[(lostTheirs>lostMine*1.4?0.5:0),'they are winning']];
        if(dur>8)consider(score(p)-score(k)-0.75,reasonsOf(p),()=>{const B2=B;const rb=rulerOf(B2);const accept=(rb?rb.traits.warmth*0.4:0.2)+Math.min(1,(S.year-r.since)*0.02)+(r.lost[B2.id]||0)*0.01-mem(B2.id,f.id).grudge*0.2;if(accept>0.35)makePeace(f,B2,reasonsOf(p),lostTheirs>lostMine*2?'tribute':null);else{log('refusal',1,`The ${B2.name} reject peace`,`${cap(cname(ru))} offers peace. ${rb?cap(cname(rb)):'The '+B2.name} refuses.`,capitalOf(B2).x,capitalOf(B2).y,[f,B2],{why:[`The ${B2.name} still want blood.`]})}},'peace');
        if(f.tech.fission&&!f.cool.nuke){const n=[[T.cruelty*0.9,`${cname(ru)} is cruel`],[(losing?0.6:0)+(capLost?0.7:0),'the war is being lost'],[m.grudge*0.35,'hatred'],[T.paranoia*0.3,'fear of what the enemy might do first'],[T.ambition*0.2,'ambition']];
          const deter=[[(S.finale&&S.finale.kind==='lastwar'?0.2:1)*(T.warmth*0.7+f.values.harmony*0.5),'conscience'],[B.tech.fission?0.7*(1-T.paranoia*0.5):0,'fear of retaliation'],[0.6,'the weight of the decision']];
          consider(score(n)-score(deter)-0.55,reasonsOf(n),()=>nuke(f,B,reasonsOf(n)),'nuke')}
        if(f.tech.bioweapons&&!f.cool.blight){const n=[[T.cruelty*0.8,`${cname(ru)} is cruel`],[(losing?0.5:0),'the war is being lost'],[m.grudge*0.3,'hatred'],[f.g.intellect*0.2,'confidence in their science']];const deter=[[T.warmth*0.6+f.values.harmony*0.4+0.55,'conscience']];
          consider(score(n)-score(deter)-0.3,reasonsOf(n),()=>blight(f,B,reasonsOf(n)),'blight')}
        if(f.tech.geoeng&&!f.cool.geo&&T.cruelty>0.55){consider(T.cruelty*0.5+m.grudge*0.2-0.75,[`${cname(ru)} decides to poison the enemy's land`],()=>terraform(f,capitalOf(B)||B.origin,'salt',[`${cap(cname(ru))} wants the ${B.name} to starve.`]),'geo')}
      }
    }
    // marriage deterioration
    for(const B of others){const r=rel(f.id,B.id);if(r.marriage&&!r.marriage.broken){const rb=rulerOf(B);if(!rb||rb.spouse!==ru.id){continue}r.marriage.love=clamp(r.marriage.love-0.01+(opinion(f.id,B.id)>0.2?0.008:-0.01));if(r.marriage.love<0.15&&R()<0.2){r.marriage.broken=yr();ru.spouse=null;rb.spouse=null;r.ally=false;note(B.id,f.id,'grudge',0.8,`${cname(ru)} cast aside ${cname(rb)}`);log('divorce',2,`${cap(cname(ru))} casts aside ${cname(rb)}`,`The marriage that bound the ${f.name} and the ${B.name} ends in bitterness. The alliance goes with it.`,capitalOf(f).x,capitalOf(f).y,[f,B],{why:['Love between them had died.',`Their peoples had grown apart.`],decider:ru.id})}}}
    if(best&&best.sc>0){f.lastDecision={yr:yr(),kind:best.kind,why:best.reasons};best.fn();f.cool[best.kind]=yr()}
  }
  function goods(f){const g=f.g,o=[];if(f.tech.industry)o.push('machine parts');if(f.tech.printing)o.push('books');if(g.glow>0.45)o.push('glowstones');if(g.aquatic>0.45)o.push('pearls');if(f.tech.sculpture||f.golden)o.push('painted pottery');if(g.mystic>0.45)o.push('carved idols');if(g.carnivory>0.5)o.push('cured meat');if(f.tech.iron)o.push('iron tools');if(!o.length)o.push(pick(['grain','woven grass','dyed hides','river clay','seed-cakes']));return o.slice(0,2).join(' and ')}

  // ---------- apocalyptic & advanced acts ----------
  function nuke(f,B,why){
    const t=facSetts(B).sort((a,b)=>b.members.length-a.members.length)[0];if(!t)return;f.cool.nuke=1;S.nukes++;const ru=rulerOf(f);if(ru)deed(ru,`burned ${t.name}`,'nuke');
    killZone(t.x,t.y,95,null);poison(t.x,t.y,130,1);
    const name=t.name;S.setts.splice(S.setts.indexOf(t),1);S.ruins.push({x:t.x,y:t.y,lvl:t.level,h:B.hue,name,yr:yr(),nuked:1});S.fxq.push({t:'nuke',x:t.x,y:t.y});
    for(const o of alive())if(o!==f){note(o.id,f.id,'grudge',o===B?4:0.8,`the burning of ${name}`)}f.rep-=1;
    log('nuke',3,`The Burning of ${name}`,`${ru?cap(cname(ru)):'The '+f.name} orders the new weapon used. ${name}, ${['a camp','a village','a town','a city','a great city'][t.level]} of the ${B.name}, vanishes in a single light. The land around it will not support life for generations.`,t.x,t.y,[f,B],{why,decider:ru?ru.id:null});
    if(S.nukes>=3&&S.world.foodMult>0.6){S.world.foodMult=0.55;S.world.foodUntil=S.year+40;log('winter',3,'The Ash Winter',`So many cities have burned that ash darkens the sky. Harvests fail everywhere for a generation.`,W/2,H/2,alive(),{why:[`${S.nukes} cities have been destroyed by nuclear fire.`]})}
    // retaliation
    if(B.tech.fission&&B.died==null&&!B.cool.nuke){const rb=rulerOf(B);if(rb&&rb.traits.warmth<0.75){S.retaliate=S.retaliate||[];S.retaliate.push([B.id,f.id])}}
  }
  function killZone(x,y,r,spare){for(const a of S.agents){if(a.dead)continue;const d=Math.hypot(a.x-x,a.y-y);if(d<r&&a.fac!==spare){if(d<r*0.6||R()<0.6)die(a,'fire')}}}
  // tile window around a circle (only tiles that can be inside it); loops stay row-major so R() order is unchanged
  const tileWin=(x,y,r)=>({i0:Math.max(0,Math.floor((x-r)/TS)-1),i1:Math.min(GW-1,Math.ceil((x+r)/TS)),j0:Math.max(0,Math.floor((y-r)/TS)-1),j1:Math.min(GH-1,Math.ceil((y+r)/TS))});
  const markTerrain=(x,y,r)=>{const b=S.dirtyBox,x0=x-r-TS,y0=y-r-TS,x1=x+r+TS,y1=y+r+TS;S.dirtyBox=b?{x0:Math.min(b.x0,x0),y0:Math.min(b.y0,y0),x1:Math.max(b.x1,x1),y1:Math.max(b.y1,y1)}:{x0,y0,x1,y1};S.terrainDirty=true};
  function poison(x,y,r,v){const w=tileWin(x,y,r);for(let j=w.j0;j<=w.j1;j++)for(let i=w.i0;i<=w.i1;i++){const d=Math.hypot((i+.5)*TS-x,(j+.5)*TS-y);if(d<r){const k=j*GW+i;rad[k]=Math.min(1,rad[k]+v*(1-d/r)*1.3);food[k]=0}}S.radDirty=true}
  function blight(f,B,why){f.cool.blight=1;const ru=rulerOf(f);if(ru)deed(ru,`unleashed a blight on the ${B.name}`,'blight');
    S.blights.push({by:f.id,target:{...B.g},tname:B.name,until:yr()+18,str:0.12+R()*0.08});for(const o of alive())if(o!==f)note(o.id,f.id,'grudge',o===B?3:0.6,'the engineered blight');f.rep-=0.8;
    log('blight',3,`The ${B.name} Blight`,`The ${f.name} release a disease built to kill only creatures shaped like the ${B.name}. It will spread for years. No one can promise it will stop at its target.`,(capitalOf(B)||B.origin).x,(capitalOf(B)||B.origin).y,[f,B],{why,decider:ru?ru.id:null})}
  function terraform(f,at,mode,why){f.cool.geo=yr();const want=mode==='salt'?4:f.g.aquatic>0.6?1:3;let n=0;const w=tileWin(at.x,at.y,140);for(let j=w.j0;j<=w.j1;j++)for(let i=w.i0;i<=w.i1;i++){const d=Math.hypot((i+.5)*TS-at.x,(j+.5)*TS-at.y);if(d<140&&R()<1-d/160){const k=j*GW+i;if(ter[k]===0&&want!==1)continue;ter[k]=want;fmax[k]=FM[want]*(mode==='salt'?0.3:1.3);food[k]=Math.min(food[k],fmax[k]);n++}}markTerrain(at.x,at.y,160);
    const ru=rulerOf(f);if(ru)deed(ru,mode==='salt'?'salted the enemy land':'remade the land','make');
    log('terraform',3,mode==='salt'?`The Salting of ${regionName(at.x,at.y)}`:`The Remaking of ${regionName(at.x,at.y)}`,mode==='salt'?`The ${f.name} turn the land around their enemies into dead desert. ${n} leagues of earth will grow nothing.`:`The ${f.name} reshape ${regionName(at.x,at.y)} into ${want===1?'warm shallow seas':'endless forest'} suited to their bodies.`,at.x,at.y,[f],{why,decider:ru?ru.id:null})}
  function domestic(f){
    const ru=rulerOf(f);if(!ru)return;const T=ru.traits;const sets=facSetts(f);const cs=capitalOf(f);if(!cs)return;
    const avgU=sets.reduce((t,s)=>t+s.unrest,0)/Math.max(1,sets.length);const worst=sets.reduce((a,b)=>b.unrest>a.unrest?b:a,sets[0]);
    const opts=[];const CD={making:90,wonder:30,golden:60,uplift:60,geo:60,purge:15};const C=(sc,why,fn,k)=>{if(!f.cool[k]||yr()-f.cool[k]>(CD[k]||12))opts.push({sc,why,fn,k})};
    // government reforms
    const gv=f.gov;const reform=(to,why,sc)=>C(sc,why,()=>changeGov(f,to,why,'reform'),'reform');
    if(gv==='band'&&f.tech.speech&&f.pop>22){if(f.g.symbiosis>0.6)reform('hive',[`Their bodies and minds are deeply bound together.`],0.8);else if(f.g.intellect<0.4&&f.values.martial>0.5)reform('warband',[`The strongest rule by force.`],0.8);else if(f.values.faith>0.65&&f.g.mystic>0.6)reform('cult',[`Their dreamers speak with authority.`],0.8);else reform('chiefdom',[`They have grown too many to follow whoever is strongest.`],0.8)}
    if(gv==='chiefdom'){if(f.tech.theology||f.tech.faith&&f.values.faith>0.65)reform('theocracy',[`The priests have grown more powerful than the chief.`,`The ${f.name} value faith above all.`],f.values.faith*1.2-0.2);
      if(f.tech.law||f.tech.bronze)reform('monarchy',[`${cap(cname(ru))} wants the crown to pass to their children.`],T.ambition*0.8+f.values.order*0.5-0.3);
      if(f.tech.philosophy)reform('republic',[`Philosophers argue that no one is born to rule.`],f.values.knowledge*0.6+T.warmth*0.4-0.2);
      if(f.tech.currency&&f.values.trade>0.6)reform('oligarchy',[`The richest houses already run everything.`],f.values.trade*0.9-0.1)}
    if(gv==='monarchy'||gv==='chiefdom'){if(sets.length>=5)reform('empire',[`${cap(cname(ru))} rules ${sets.length} settlements and many peoples.`],T.ambition*0.9+0.1)}
    if((gv==='monarchy'||gv==='empire'||gv==='junta'||gv==='theocracy')&&f.tech.surveillance)reform('police',[`${cap(cname(ru))} fears plots.`,'The new machines can watch every street.'],T.paranoia*0.9+f.values.order*0.4+avgU*0.5-0.6);
    if((gv==='republic'||gv==='oligarchy')&&f.tech.printing)reform('democracy',[`Printing has made every citizen a reader.`],T.warmth*0.5+f.values.knowledge*0.4-0.1);
    if((gv==='republic'||gv==='democracy'||gv==='oligarchy')&&f.tech.computing)reform('technocracy',[`The thinking machines plan better than any assembly.`],f.values.knowledge*0.9+T.genius*0.4-0.55);
    if(f.values.art>0.65&&(f.tech.theater||f.tech.sculpture)&&!['commune','police'].includes(gv))reform('commune',[`Art has become the center of their lives.`],f.values.art*0.9-0.25);
    // golden age
    if(!f.golden&&f.values.art>0.55&&(f.tech.sculpture||f.tech.music)&&avgU<0.3&&!anyWar(f))C(f.values.art+0.3-avgU,[`The ${f.name} value beauty`,`their towns are at peace`],()=>{f.golden=yr();deed(ru,'began a golden age','art');log('golden',3,`The Golden Age of the ${f.name}`,`Freed from war and hunger, the ${f.name} pour their lives into art. Their towns fill with color, music and painted ground. Visitors leave changed.`,cs.x,cs.y,[f],{why:[`The ${f.name} prize art.`,'Their land is peaceful and fed.',`${cap(cname(ru))} is their patron.`],decider:ru.id})},'golden');
    // wonders
    if(f.treasury>160&&f.tech.writing&&S.wonders.filter(w=>w.fac===f.id).length<3){const top=VALUES.slice().sort((a,b)=>f.values[b]-f.values[a])[0];C(0.6+T.ambition*0.3,[`${cap(cname(ru))} wants to be remembered`,`the ${f.name} value ${VALUE_LABEL[top].toLowerCase()}`],()=>buildWonder(f,top,ru),'wonder')}
    // repression / reform when unrest high
    if(avgU>0.45&&(T.cruelty>0.55||T.paranoia>0.6||GOVS[gv].rep)){C(T.cruelty*0.6+T.paranoia*0.5+f.values.order*0.2-0.75+(GOVS[gv].rep?0.3:0),[`unrest is rising${worst.why[0]?`: ${worst.why[0]}`:''}`,`${cname(ru)} is ${T.cruelty>0.5?'cruel':'afraid'}`],()=>purge(f,worst),'purge');
      C(T.warmth*0.6+f.values.knowledge*0.3-0.35,[`unrest is rising${worst.why[0]?`: ${worst.why[0]}`:''}`,`${cname(ru)} prefers to listen`],()=>{for(const s of sets){s.unrest*=0.6;s.resent*=0.5}f.treasury*=0.7;deed(ru,'reformed the laws','wise');log('reform',2,`The Reforms of ${cname(ru)}`,`Facing unrest, ${cname(ru)} lowers taxes, frees prisoners and gives the settlements a voice.`,cs.x,cs.y,[f],{why:[`Unrest was rising in ${worst.name}.`,`${cap(cname(ru))} is ${traitWords(ru).join(', ')||'pragmatic'}.`],decider:ru.id})},'reformlaw')}
    // genetic engineering of themselves
    if(f.tech.genetics){const top=VALUES.slice().sort((a,b)=>f.values[b]-f.values[a])[0];C(T.ambition*0.5+T.genius*0.4+(f.values.harmony<0.4?0.2:0)-0.45,[`${cap(cname(ru))} wants to perfect the ${f.name}`,`they value ${VALUE_LABEL[top].toLowerCase()} above all`],()=>making(f,top,ru),'making')}
    if(f.tech.uplift){const target=alive().filter(o=>o!==f&&o.g.intellect<0.4&&opinion(f.id,o.id)>-0.2)[0];if(target)C(f.values.harmony*0.7+T.warmth*0.4-0.4,[`The ${f.name} believe every creature deserves to think`,`${cname(ru)} is warm-hearted`],()=>uplift(f,target,ru),'uplift')}
    if(f.tech.geoeng&&f.values.harmony>0.5)C(f.values.harmony*0.6-0.3,[`The ${f.name} want a land that fits them`],()=>terraform(f,cs,'grow',[`${cap(cname(ru))} wants a gentler world for their people.`]),'geo');
    if(f.tech.spaceflight&&!f.departed){const dead=rad.reduce((t,v)=>t+(v>0.2?1:0),0)/rad.length;C((R()<0.25?1:0)*(f.values.knowledge*0.5+dead*3+T.genius*0.2)-0.45,[dead>0.08?'The world is poisoned and dying':`The ${f.name} long to see what lies beyond the sky`,`${cname(ru)} gives the order`],()=>depart(f,ru,dead),'depart')}
    // research focus already chosen elsewhere
    opts.sort((a,b)=>b.sc-a.sc);if(opts[0]&&opts[0].sc>0.25){f.lastDecision={yr:yr(),kind:opts[0].k,why:opts[0].why};opts[0].fn();f.cool[opts[0].k]=yr()}
  }
  function changeGov(f,to,why,how){const from=f.gov;if(from===to)return;f.gov=to;f.govSince=yr();const cs=capitalOf(f)||f.origin;const ru=rulerOf(f);
    if(to==='police'){for(const s of facSetts(f))s.resent+=0.1}
    log('gov',2,`The ${f.name} become a ${GOVS[to].label}`,`${how==='revolution'?'After the revolution':how==='coup'?'After the coup':ru?cap(cname(ru))+' changes the order of things':'The order of things changes'}: the ${f.name}, once a ${GOVS[from].label.toLowerCase()}, are now ${GOVS[to].d}.`,cs.x,cs.y,[f],{why,decider:ru?ru.id:null})}
  function purge(f,s){const ru=rulerOf(f);const m=s.members.filter(a=>!a.dead&&a.char==null);let n=0;for(const a of m)if(R()<0.25){die(a,'executed');n++}s.unrest*=0.4;s.resent+=0.35;
    const police=f.gov==='police';deed(ru,`purged ${s.name}`,police?'purge':T2(ru.traits.paranoia>0.85,'mad'));
    log('purge',2,police?`The Silence of ${s.name}`:`The Purge of ${s.name}`,`${cap(cname(ru))}'s ${police?'watchers':'soldiers'} take ${n} suspected traitors from ${s.name}. The streets go quiet. The quiet is not peace.`,s.x,s.y,[f],{why:[`${s.name} was restless: ${s.why.join('; ')||'no one would say why'}.`,`${cap(cname(ru))} is ${ru.traits.cruelty>0.5?'cruel':'paranoid'}.`],decider:ru.id})}
  function T2(c,v){return c?v:null}
  function buildWonder(f,val,ru){const cs=capitalOf(f);if(!cs)return;f.treasury-=150;const L=S.langs[f.lang];
    const N={art:['Hall of Ten Thousand Colors','Singing Gardens','Mirror Gallery'],faith:['Spire of the '+GLOSS[pick(['sun','moon','star'])],'Great Temple','Tomb of the First Mother'],knowledge:['Great Library','Observatory','House of Numbers'],martial:['Bone Throne','Arch of Victories','Iron Gate'],trade:['Golden Market','Great Harbor','Counting House'],order:['Hall of Laws','Great Wall','Panopticon'],harmony:['Hanging Gardens','Garden of Every Creature','Still Lake']}[val];
    const wa=R()*6.28,wd=townRadius(cs)+16;const freeN=N.filter(n=>!S.wonders.some(w=>w.name==='the '+n));if(!freeN.length)return;f.treasury-=0;const w={id:id(),fac:f.id,x:cs.x+Math.cos(wa)*wd,y:cs.y+Math.sin(wa)*wd,name:'the '+pick(freeN),val,yr:yr(),by:ru.id};S.wonders.push(w);deed(ru,`built ${w.name}`,'build');
    log('wonder',2,`${cap(w.name)} is raised`,`${cap(cname(ru))} spends the wealth of the ${f.name} on ${w.name} near ${cs.name}. It becomes the pride of their people.`,w.x,w.y,[f],{why:[`${cap(cname(ru))} wanted to be remembered.`,`The ${f.name} value ${VALUE_LABEL[val].toLowerCase()}.`],decider:ru.id})}
  function making(f,val,ru){const T={martial:{size:.35,armor:.4,aggression:.25,speed:.15},knowledge:{intellect:.4,longevity:.35,eyes:.2},art:{glow:.45,weirdness:.25,sociality:.15},faith:{mystic:.45,glow:.3},trade:{hoarding:.35,sociality:.25,longevity:.2},order:{sociality:.35,fertility:.3,weirdness:-.4},harmony:{symbiosis:.45,carnivory:-.4,aggression:-.3}}[val];
    for(const k in T){f.bias[k]=(f.bias[k]||0)+T[k]*0.15;for(const a of S.agents)if(!a.dead&&a.fac===f.id)a.g[k]=clamp(a.g[k]+T[k]*0.6)}for(const a of S.agents)if(!a.dead&&a.fac===f.id)stats(a);
    deed(ru,'ordered the Making','make');const desc=Object.keys(T).filter(k=>T[k]>0).map(k=>TRAIT_LABEL[k].toLowerCase()).join(', ');
    log('making',3,`The Making of the ${f.name}`,`${cap(cname(ru))} orders the ${f.name} to rewrite their own children. From now on they are born for ${VALUE_LABEL[val].toLowerCase()}: more ${desc}.`,(capitalOf(f)||f.origin).x,(capitalOf(f)||f.origin).y,[f],{why:[`${cap(cname(ru))} wants to perfect the ${f.name}.`,`They value ${VALUE_LABEL[val].toLowerCase()} above all.`],decider:ru.id});
    if(R()<0.15+ru.traits.ambition*0.15){const a=S.agents.find(x=>!x.dead&&x.fac===f.id&&x.char==null);if(a)makeTitan(a,'An experiment of the Making that went wrong')}}
  function uplift(f,B,ru){for(const a of S.agents)if(!a.dead&&a.fac===B.id){a.g.intellect=clamp(a.g.intellect+0.3);a.g.sociality=clamp(a.g.sociality+0.15);stats(a)}B.bias.intellect=(B.bias.intellect||0)+0.04;B.tech.speech=1;B.tech.tools=1;if(f.tech.writing)B.tech.writing=1;setStage(B,f.tech.writing?2:1,`taught by the ${f.name}`);note(B.id,f.id,'favor',2,'they gave us minds');rel(f.id,B.id).ally=true;
    deed(ru,`uplifted the ${B.name}`,'make');log('uplift',3,`The Uplift of the ${B.name}`,`The ${f.name} reach into the bodies of the ${B.name} and wake their minds. Within a generation the ${B.name} speak, and their first words are about the ${f.name}.`,(capitalOf(B)||B.origin).x,(capitalOf(B)||B.origin).y,[f,B],{why:[`The ${f.name} believe every creature deserves to think.`,`${cap(cname(ru))} is ${traitWords(ru).join(', ')||'idealistic'}.`],decider:ru.id})}
  function depart(f,ru,dead){for(const a of S.agents)if(!a.dead&&a.fac===f.id&&R()<0.85){a.departing=1;a.state='depart';a.role=null}
    for(const s of facSetts(f)){S.ruins.push({x:s.x,y:s.y,lvl:s.level,h:f.hue,name:s.name,yr:yr(),silent:1});S.setts.splice(S.setts.indexOf(s),1)}
    deed(ru,'led the Departure','depart');f.departed=yr();
    log('depart',3,`The Departure of the ${f.name}`,`The ${f.name} board their ships and leave the world. Their cities stand empty and perfect. A few refuse to go and are left behind among the silent towers.`,(capitalOf(f)||f.origin).x,(capitalOf(f)||f.origin).y,[f],{why:[dead>0.08?'The world was poisoned and dying.':`The ${f.name} longed for what lay beyond the sky.`,`${cap(cname(ru))} gave the order.`],decider:ru.id})}

  // ---------- internal threats ----------
  function intrigue(f){
    const ru=rulerOf(f);if(!ru)return;const sets=facSetts(f);const cs=capitalOf(f);if(!cs)return;const avgU=sets.reduce((t,s)=>t+s.unrest,0)/Math.max(1,sets.length);
    for(const c of S.chars){if(!c.alive||c.fac!==f.id||c===ru)continue;
      c.loyalty=clamp(c.loyalty+(ru.traits.warmth-0.5)*0.03-(ru.traits.cruelty-0.4)*0.04-avgU*0.03+(c.role==='heir'?0.02:0)+(R()-.5)*0.04);
      // assassination by heir
      if(c.role==='heir'&&c.traits.ambition>0.7&&c.traits.cruelty>0.55&&c.loyalty<0.35&&yr()-ru.reignStart>15&&R()<0.08){
        if(ru.traits.paranoia>0.75&&R()<0.5){const a=charAgent(c);log('plot',2,`The plot of ${cname(c)} is discovered`,`${cap(cname(ru))}'s spies uncover a plan by the heir to poison them. ${cap(cname(c))} is executed.`,cs.x,cs.y,[f],{why:[`${cap(cname(c))} was ambitious and cruel and tired of waiting.`,`${cap(cname(ru))} trusts no one.`],decider:ru.id});if(a)die(a,'executed');else c.alive=false;continue}
        const ra=charAgent(ru);deed(c,`murdered ${cname(ru)}`,'kin');const old=ru;log('assassination',3,`The Murder of ${cname(old)}`,`${cap(cname(old))} dies at a feast, poisoned by the heir ${cname(c)}. No one dares say it aloud.`,cs.x,cs.y,[f],{why:[`${cap(cname(c))} was ambitious and cruel.`,`${cap(cname(old))} had ruled for ${yr()-old.reignStart} years and showed no sign of dying.`],decider:c.id});
        f.heir=c.id;if(ra)die(ra,'assassinated');else{old.alive=false;old.died=yr();old.cause='assassinated';f.ruler=null;succession(f,old)}return}
      // coup by general
      if(c.role==='general'&&c.traits.ambition>0.6&&c.loyalty<0.3&&(avgU>0.35||(f.warWeary>15))&&R()<0.1){
        const ra=charAgent(ru);const old=ru;deed(c,`overthrew ${cname(old)}`,'usurp');
        log('coup',3,`The Coup of ${cname(c)}`,`General ${cname(c)} turns the army on the capital. ${cap(cname(old))} is ${ra?'killed':'deposed'}, and the soldiers proclaim a new order.`,cs.x,cs.y,[f],{why:[avgU>0.35?`The realm was restless: ${(sets.sort((a,b)=>b.unrest-a.unrest)[0].why||[]).slice(0,1).join('')}`:'The war had dragged on too long.',`${cap(cname(c))} was ambitious and no longer loyal.`],decider:c.id});
        if(ra)die(ra,'executed');old.alive=false;setRuler(f,c,'seizes power');changeGov(f,'junta',[`${cap(cname(c))} rules through the army.`],'coup');return}
    }
    // revolution
    if(['monarchy','empire','police','junta','theocracy','chiefdom'].includes(f.gov)&&avgU>0.5&&(f.tech.printing||f.tech.philosophy)&&R()<0.1){
      const rep=GOVS[f.gov].rep||0;const strength=avgU+(f.tech.printing?0.2:0)-rep*0.6+R()*0.3;
      if(strength>0.6){const ra=charAgent(ru);const old=ru;const to=f.values.art>0.6?'commune':f.tech.printing?'democracy':'republic';
        const leader=newChar(f,'rebel',pickCourtAgent(f,cs));leader.traits.warmth=clamp(leader.traits.warmth+0.2);
        log('revolution',3,`The ${f.name} Revolution`,`The people of ${cs.name} rise against ${cname(old)}. ${old.traits.cruelty>0.5?`${cap(cname(old))} is dragged from the palace and executed.`:`${cap(cname(old))} flees into exile.`} ${cap(cname(leader))} leads the new government.`,cs.x,cs.y,[f],{why:[`Unrest across the realm: ${(sets.sort((a,b)=>b.unrest-a.unrest)[0].why||[]).slice(0,2).join('; ')}.`,f.tech.printing?'Printed pamphlets spread the idea that rulers could be removed.':'Philosophers had questioned the right to rule.']});
        if(ra&&old.traits.cruelty>0.5)die(ra,'executed');old.alive=false;old.cause=old.cause||'deposed';deed(leader,`led the revolution against ${cname(old)}`,'liberate');setRuler(f,leader,'leads the revolution');changeGov(f,to,[`The revolutionaries chose ${GOVS[to].label.toLowerCase()} rule.`],'revolution');for(const s of sets){s.unrest*=0.3;s.resent=0}}
      else{log('uprising',2,`Uprising crushed in ${cs.name}`,`The people of ${cs.name} rise against ${cname(ru)} and are put down.`,cs.x,cs.y,[f],{why:[`${GOVS[f.gov].label} rule was too strong to break.`]});purge(f,cs)}
      return}
    // secession
    if(f.cool.secede&&yr()-f.cool.secede<30)return;if(yr()-f.born<20||alive().length>=10)return;
    for(const s of sets){if(s===cs||s.unrest<0.58||s.members.length<6)continue;if(R()>0.15)continue;f.cool.secede=yr();
      const gv=s.governor!=null?S.chars[s.governor]:null;const leader=gv&&gv.alive&&gv.fac===f.id&&gv.loyalty<0.5?gv:newChar(f,'rebel',pickCourtAgent(f,s));
      const why=[`${s.name} was restless because ${s.why.join(', and ')||'of old grievances'}.`];if(gv===leader)why.push(`Its governor, ${cname(gv)}, was ambitious and disloyal.`);
      const nf=secede(f,s,leader,'secession',why);
      if(nf){const T=ru.traits;const resp=T.ambition*0.6+f.values.order*0.5+T.cruelty*0.3-T.warmth*0.4+(power(f)/Math.max(1,power(nf))-1)*0.2;
        if(resp>0.45)declareWar(f,nf,'reunify',[`${cap(cname(ru))} will not let ${s.name} go.`,`The ${f.name} value order.`]);
        else log('letgo',2,`${cap(cname(ru))} lets ${s.name} go`,`Rather than fight, ${cname(ru)} accepts the independence of the ${nf.name}.`,s.x,s.y,[f,nf],{why:[T.warmth>0.5?`${cap(cname(ru))} is warm-hearted.`:'The war would cost too much.'],decider:ru.id})}
      return}
  }

  // ---------- research ----------
  function chooseResearch(f){
    const ru=rulerOf(f);const avail=Object.keys(TECH).filter(k=>!f.tech[k]&&TECH[k].req.every(r=>f.tech[r])&&(!TECH[k].minInt||f.g.intellect>=TECH[k].minInt));if(!avail.length){f.research=null;return}
    const war=anyWar(f);const sets=facSetts(f);const avgU=sets.reduce((t,s)=>t+s.unrest,0)/Math.max(1,sets.length);const hungry=sets.some(s=>s.store<s.members.length*2);
    let best=null,bs=-1,bw='';
    for(const k of avail){const t=TECH[k];let s=f.values[t.br]*1.0+R()*0.35+(['tools','agri','speech'].includes(k)?0.7:0)+(k==='agri'&&f.pop>18?0.5:0);let w=`the ${f.name} value ${VALUE_LABEL[t.br].toLowerCase()}`;
      if(war&&t.br==='martial'){s+=0.5;w='they are at war'}if(hungry&&k==='agri'){s+=0.8;w='their people are hungry'}if(avgU>0.4&&(t.br==='order'||t.br==='art')){s+=0.3;w='unrest must be calmed'}
      if(k==='medicine'&&S.events.slice(-30).some(e=>e.type==='plague'||e.type==='blight')){s+=0.7;w='plague has struck'}
      if(ru){if(t.br==='martial')s+=ru.traits.ambition*0.2+ru.traits.cruelty*0.2;if(t.br==='knowledge')s+=ru.traits.genius*0.3;if(t.br==='faith')s+=ru.traits.piety*0.3;if(t.br==='trade')s+=ru.traits.greed*0.2;if(t.br==='order')s+=ru.traits.paranoia*0.3}
      if(['bioweapons','fission'].includes(k)&&ru&&ru.traits.warmth>0.7){s-=0.6}
      if(s>bs){bs=s;best=k;bw=w}}
    f.research={id:best,why:bw};f.rp=0;
  }
  function research(f){
    if(!f.research)chooseResearch(f);if(!f.research)return;
    const sets=facSetts(f);const avgU=sets.reduce((t,s)=>t+s.unrest,0)/Math.max(1,sets.length);
    const ru=rulerOf(f);
    let rp=0.8*Math.pow(f.g.intellect,1.6)*(2.2+Math.sqrt(f.pop)*0.7)*(1-avgU*0.6)*(1+Math.min(f.stats.trades,200)*0.004)*(f.tech.writing?1.3:1)*(f.tech.printing?1.35:1)*(f.tech.computing?1.5:1)*(ru?0.85+ru.traits.genius*0.3:1)*(f.gov==='technocracy'?1.3:f.gov==='commune'&&TECH[f.research.id].br==='art'?1.5:1)*(1+(f.bias.intellect||0)*3);
    // trade partners who know it teach it
    for(const o of alive())if(o!==f&&o.tech[f.research.id]&&rel(f.id,o.id).trade)rp*=1.4;
    f.rp+=rp*(S.world.techMult||1)*0.42*(1+0.22*((S.maker&&S.maker.age||1)-1))*(S.dlev&&S.isMine(f)?S.dlev('techMult'):1);const t=TECH[f.research.id];
    if(f.rp>=t.c){const k=f.research.id,why=f.research.why;f.tech[k]=yr();f.research=null;
      const learned=alive().some(o=>o!==f&&o.tech[k]&&rel(f.id,o.id).trade);
      const big=['writing','philosophy','printing','gunpowder','industry','surveillance','genetics','fission','computing','bioweapons','geoeng','uplift','transcend','spaceflight','theology','sculpture'].includes(k);
      const cs=capitalOf(f)||f.origin;
      log('tech',big?2:1,`The ${f.name} master ${t.n}`,`${t.d}${learned?' Traders from abroad brought the first ideas.':''}`,cs.x,cs.y,[f],{why:[`They chose to pursue it because ${why}.`],tech:k});
      if(k==='speech')setStage(f,1,'pictographs gained sounds');if(k==='writing')setStage(f,2,'writing was invented');if(k==='printing')setStage(f,3,'printing fixed the alphabet');
      if(k==='transcend'){f.golden=f.golden||yr();for(const s of sets){s.unrest=0;s.resent=0}}
      for(const a of S.agents)if(!a.dead&&a.fac===f.id)stats(a);
      chooseResearch(f);}
  }

  // ---------- yearly ----------
  function yearly(){
    const Y=yr();
    if(S.world.foodUntil&&S.year>S.world.foodUntil){S.world.foodMult=1;S.world.foodUntil=0}
    if(S.world.mutUntil&&S.year>S.world.mutUntil){S.world.mutBurst=0;S.world.mutUntil=0}
    // radiation decay & damage
    for(let k=0;k<rad.length;k++)if(rad[k]>0){rad[k]=Math.max(0,rad[k]-0.004);if(rad[k]>0.15)food[k]=0}
    if(S.retaliate&&S.retaliate.length){const q=S.retaliate;S.retaliate=[];for(const [b,a] of q){const B=S.facs[b],A=S.facs[a];if(B.died==null&&A.died==null&&!B.cool.nuke)nuke(B,A,[`The ${A.name} burned their city first.`,`${cap(cname(rulerOf(B)))} answers fire with fire.`])}}
    // blights
    for(const bl of S.blights){if(Y>bl.until)continue;for(const a of S.agents){if(a.dead||a.titan)continue;if(a.fac===bl.by&&R()<0.5)continue;const d=gdist(a.g,bl.target);if(d<0.13&&R()<bl.str*(1-d/0.13)*(S.facs[a.fac].tech.medicine?0.5:1))die(a,'plague')}}
    const byFac={};for(const a of S.agents)if(!a.dead&&!a.titan)(byFac[a.fac]=byFac[a.fac]||[]).push(a);
    for(const s of S.setts){s.members=(byFac[s.fac]||[]).filter(a=>a.home===s.id);const n=s.members.length;const lvl=n>=34?4:n>=22?3:n>=12?2:n>=5?1:0;
      if(lvl>s.level&&lvl>=3)log('city',lvl===4?2:1,`${s.name} becomes a ${lvl===4?'great city':'city'}`,`${s.name} of the ${S.facs[s.fac].name} grows to ${n} souls.`,s.x,s.y,[S.facs[s.fac]]);
      s.level=Math.max(lvl,s.level>lvl+1?s.level-1:s.level);s.maxhp=(120+s.level*90)*(S.facs[s.fac].tech.law?1.3:1)*(S.facs[s.fac].tech.industry?1.4:1);
      if(n===0&&S.year-s.born>8&&!(byFac[s.fac]||[]).some(a=>Math.hypot(a.x-s.x,a.y-s.y)<60)){s.abandon=(s.abandon||0)+1;if(s.abandon>6){S.setts.splice(S.setts.indexOf(s),1);S.ruins.push({x:s.x,y:s.y,lvl:s.level,h:S.facs[s.fac].hue,name:s.name,yr:Y});log('abandon',1,`${s.name} abandoned`,`The last of the ${S.facs[s.fac].name} leave ${s.name}.`,s.x,s.y,[S.facs[s.fac]])}}else s.abandon=0;
    }
    for(const a of S.agents){if(a.dead||a.titan||a.departing)continue;if(homeOf(a))continue;const f=S.facs[a.fac];const s=nearestOwn(f,a.x,a.y);if(s&&Math.hypot(s.x-a.x,s.y-a.y)<900)a.home=s.id;else if((isLand(a.x,a.y)||a.g.aquatic>0.6)&&rad[tIdx(a.x,a.y)]<0.1){if(!S.setts.some(o=>Math.hypot(o.x-a.x,o.y-a.y)<130)){const ns=newSett(f,a.x,a.y,false,'new','by refugees');a.home=ns.id;for(const o of query(a.x,a.y,120,buf))if(o.fac===a.fac&&!homeOf(o)&&!o.titan)o.home=ns.id}}}
    for(const f of alive()){
      const memb=byFac[f.id]||[];const sets=facSetts(f);
      if((memb.length===0&&!S.agents.some(a=>!a.dead&&a.fac===f.id))||(f.departed&&memb.length<3)){
        f.died=Y;f.endCause=f.departed?'departed':'extinct';for(const s of sets){S.setts.splice(S.setts.indexOf(s),1);S.ruins.push({x:s.x,y:s.y,lvl:s.level,h:f.hue,name:s.name,yr:Y})}
        for(const c of S.chars)if(c.fac===f.id&&c.alive){c.alive=false;c.died=Y;c.cause='the end of their people'}
        f.snaps.push({yr:Y,...snap(f)});
        if(!f.departed)log('extinct',3,`The last of the ${f.name}`,`The ${f.name} are gone. At their height in year ${f.stats.peakYear} they numbered ${f.stats.peak}${f.stats.maxSetts>1?` across ${f.stats.maxSetts} settlements`:''}. They were ${bodyDesc(f.g)}, a ${GOVS[f.gov].label.toLowerCase()} in the ${eraOf(f)}${f.quirks.length?`, remembered for ${f.quirks[0].name}`:''}.`,f.origin.x,f.origin.y,[f]);
        continue}
      if(!memb.length)continue;
      f.g=meanGenome(memb);f.stats.maxSetts=Math.max(f.stats.maxSetts,sets.length);if(f.pop>f.stats.peak){f.stats.peak=f.pop;f.stats.peakYear=Y}
      for(const k in f.bias){f.bias[k]*=0.975;if(Math.abs(f.bias[k])<0.002)delete f.bias[k]}
      if(S.year-f.currentSince>90+R()*80)newCurrent(f);
      // values drift toward body and experience
      const vb=valuesFrom(f.g);for(const k of VALUES)f.values[k]=clamp(f.values[k]+(vb[k]-f.values[k])*0.01);
      if(anyWar(f)){f.warWeary+=1;f.values.martial=clamp(f.values.martial+0.002)}else f.warWeary=Math.max(0,f.warWeary-2);
      if(f.golden&&(anyWar(f)||sets.some(s=>s.unrest>0.5))){f.golden=false;log('goldenend',2,`The Golden Age of the ${f.name} ends`,`War and unrest end the ${f.name}'s years of beauty. The painted ground fades.`,(capitalOf(f)||f.origin).x,(capitalOf(f)||f.origin).y,[f],{why:[anyWar(f)?'War came.':'Unrest spread.']})}
      if(f.golden)f.values.art=clamp(f.values.art+0.003);
      const ar=archetypeOf(f.g);if(ar!==f.archCand){f.archCand=ar;f.archCandT=S.year}if(ar!==f.arch&&S.year-f.archCandT>=12&&S.year-f.archSince>25){const old=f.arch;f.arch=ar;f.archSince=S.year;log('transform',2,`The ${f.name} become ${ARCH[ar].label}`,`Over generations the ${f.name} have changed. Once ${ARCH[old].label.toLowerCase()}, they are now ${ARCH[ar].label.toLowerCase()}: ${bodyDesc(f.g)}.`,(sets[0]||f.origin).x,(sets[0]||f.origin).y,[f],{why:[`Generations of mutation and the pressures of their life.`]})}
      milestone(f,'flight',f.g.flight>0.5,`The ${f.name} take to the air`,`Generations of gliding become true flight.`);
      milestone(f,'sea',f.g.aquatic>0.62,`The ${f.name} return to the water`,`They spend more of their lives submerged than on land.`);
      milestone(f,'mind',f.g.intellect>0.6,`The ${f.name} awaken`,`They begin to plan for winters and name their dead.`);
      milestone(f,'vast',f.g.size>0.75,`The ${f.name} grow vast`,`The average ${f.name} is now three times the size of their ancestors.`);
      milestone(f,'eyes',nEyes(f.g)>=5,`The ${f.name} grow ${NUMW[nEyes(f.g)]} eyes`,`What began as a deformity spreads until every child is born with ${NUMW[nEyes(f.g)]} eyes.`);
      milestone(f,'glow',f.g.glow>0.58,`The ${f.name} begin to glow`,`Their towns are visible at night from far away.`);
      milestone(f,'shell',f.g.armor>0.68,`The ${f.name} grow shells`,`They are now encased in plated armor.`);
      milestone(f,'legs',nLimbs(f.g)>=8,`The ${f.name} become eight-legged`,`They now scuttle on eight legs.`);
      milestone(f,'flesh',f.g.carnivory>0.75,`The ${f.name} turn to flesh`,`Every other creature is now food to them.`);
      // titans
      if(R()<(f.arch==='horde'?0.01:f.g.aggression>0.55&&f.g.size>0.5?0.003:0.0006)&&f.pop>40&&S.year>150&&S.agents.filter(x=>x.titan&&!x.dead).length<MAXTITANS){const m=memb[Math.floor(R()*memb.length)];if(m.char==null)makeTitan(m)}
      // economy
      f.treasury+=sets.reduce((t,s)=>t+Math.max(0,s.store-s.members.length*3)*0.03,0)+(f.tech.currency?2:0)+(f.tech.banking?4:0)+(f.tech.industry?6:0);
      for(const o of alive()){if(o===f)continue;const r=rel(f.id,o.id);if(r.tribute&&r.tribute.from===f.id){if(Y>r.tribute.until){r.tribute=null;continue}const a=capitalOf(f),b=capitalOf(o);if(a&&b){const t=Math.min(a.store*0.15,20);a.store-=t;b.store+=t}note(f.id,o.id,'grudge',0.03,'the humiliating tribute')}}
      // grudges fade, slower among the orderly and the faithful
      for(const k in f.mem){const m=f.mem[k];m.grudge*=0.985+f.values.order*0.008;m.favor*=0.985}
      if(Y%20===0)f.snaps.push({yr:Y,...snap(f)});
      // politics
      ensureCourt(f);
      const ru=rulerOf(f);const cs=capitalOf(f);
      for(const s of sets){const u=unrestOf(f,s,cs,ru);s.unrest=lerp(s.unrest,u.v,0.25);s.why=u.why;planBuild(s,f);assignJobs(s,f)}
      research(f);scriptTick(f);faithTick(f);movementTick(f);makerTick(f);
      if(ru&&Y%2===f.id%2){if(R()<0.5)foreignPolicy(f);else domestic(f)}
      if(ru&&Y%3===0)intrigue(f);
      // language drift
      const L=S.langs[f.lang];if(L.stage>=1&&Y>=L.nextShift){soundShift(L);L.nextShift=Y+35+R()*45}
      // war targets & soldiers
      const wars=alive().filter(o=>o!==f&&rel(f.id,o.id).war);
      if(wars.length){let tg=f.warTarget!=null?settById(f.warTarget):null;if(!tg||tg.fac===f.id||!rel(f.id,tg.fac).war){let best=null,bd=1e9;const c0=cs||f.origin;for(const s of S.setts){if(!wars.some(w=>w.id===s.fac))continue;const d=Math.hypot(s.x-c0.x,s.y-c0.y);if(d<bd){bd=d;best=s}}f.warTarget=best?best.id:null}
        const want=Math.floor(memb.length*(0.25+f.values.martial*0.4));let cur=memb.filter(a=>a.role==='soldier').length;for(const a of memb){if(cur>=want)break;if(!a.role&&a.age>6){a.role='soldier';cur++}}}
      else{f.warTarget=null;for(const a of memb)if(a.role==='soldier'&&!(a.char!=null))a.role=null}
      if(wars.length&&f.warTarget!=null&&!f.army){const t=settById(f.warTarget);if(t)formArmy(f,t)}else if(f.army&&!wars.length)disband(f);
      const partners=alive().filter(o=>o!==f&&rel(f.id,o.id).trade&&!rel(f.id,o.id).war);
      const tradersNow=memb.filter(a=>a.role==='trader').length;if(partners.length&&tradersNow<Math.max(1,memb.length*0.06))for(const s of sets){if(s.level<1||R()>0.2+f.values.trade*0.3)continue;const p=pick(partners);const ps=facSetts(p);if(!ps.length)continue;let t=ps[0],td=1e9;for(const o of ps){const d=Math.hypot(o.x-s.x,o.y-s.y);if(d<td){td=d;t=o}}const c=s.members.find(a=>!a.dead&&!a.role&&a.age>5);if(c){c.role='trader';c.tsett=t.id}}
      for(const s of sets){if(s.members.length>12+s.level*3&&s.store>90&&R()<0.05+f.g.curiosity*0.12+f.g.sociality*0.04&&sets.length<10)colonize(f,s)}
      f.name&&refreshNames(f);
    }
    finalizeBattles();yearlyGame();
    if(R()<0.002&&Y>60){S.world.mutBurst=1;S.world.mutUntil=S.year+15;log('comet',3,'The Green Comet',`A comet passes low over the world for a season. In the years after, strange children are born everywhere.`,W*R(),H*R(),alive())}
    if(R()<0.0015*(S.world.plagueMult||1)&&Y>80){const f=pick(alive());if(f&&f.pop>30&&!f.tech.medicine)plague(f)}
    S.emergeChance();S.godsYear();
    if(!S.facs.some(f=>f.died==null)&&!S.finale&&!S.noRespawn){const p=landPoint();const g=baseGenome({hue:R()*360,weirdness:.5+R()*.3,fertility:.6,sociality:.5});const f=newFaction(g,p.x,p.y,null);const s=newSett(f,p.x,p.y,true);f.capital=s.id;for(let i=0;i<12;i++)newAgent(f,mutate(g,f,1.5),p.x+(R()-.5)*20,p.y+(R()-.5)*20,s);log('dawn',3,'Life stirs again',`For a time the world is empty. Then, in ${regionName(p.x,p.y)}, something new crawls out of the mud: ${f.glyph}, the ${f.gloss}, ${bodyDesc(g)}.`,p.x,p.y,[f])}
    if(Y%2===0){const p={};for(const f of S.facs)if(f.died==null)p[f.id]=f.pop;S.pophist.push({yr:Y,p});if(S.pophist.length>700)S.pophist=S.pophist.filter((_,i)=>i%2===0)}
    S.pulses=S.pulses.filter(p=>S.year-p.t<3);
    if(S.finale)S.finaleTick();
    if(S.onYear)S.onYear(Y);
  }
  function milestone(f,k,cond,title,text){if(cond&&!f.milestones[k]){f.milestones[k]=1;const s=facSetts(f)[0]||f.origin;log('mutation',2,title,text,s.x,s.y,[f],{why:['Generations of mutation, shaped by how they live.']})}}
  function colonize(f,s){
    let best=null,bv=-1;const aq=f.g.aquatic>0.6;
    for(let t=0;t<24;t++){const ang=R()*6.28,d=170+R()*230+f.g.curiosity*120,x=s.x+Math.cos(ang)*d,y=s.y+Math.sin(ang)*d;if(x<30||y<30||x>W-30||y>H-30)continue;const k=tIdx(x,y),tt=ter[k];if(rad[k]>0.1)continue;if(aq?tt>1:tt<2)continue;if(!aq&&tt===5)continue;if(S.setts.some(o=>Math.hypot(o.x-x,o.y-y)<150))continue;let v=0;for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)v+=fmax[tIdx(x+dx*TS,y+dy*TS)];if(v>bv){bv=v;best={x,y}}}
    if(!best)return;const ns=newSett(f,best.x,best.y,false,null,`to relieve the crowding of ${s.name}`);ns.store=20;s.store-=25;
    const movers=s.members.filter(a=>!a.dead&&!a.role).slice(0,4+Math.floor(R()*4));for(const a of movers){a.home=ns.id;a.state='migrate';ns.members.push(a)}
  }
  function plague(f,reason){const mem0=S.agents.filter(a=>!a.dead&&a.fac===f.id);let n=0;for(const a of mem0)if(R()<0.25+f.g.sociality*0.3-f.g.armor*0.1){a.hp*=0.2;a.energy*=0.3;if(R()<.5){die(a,'plague');n++}}
    const s=capitalOf(f)||f.origin;log('plague',3,`The ${pick(['Grey','Weeping','Spotted','Silent','Burning'])} Plague`,`${reason?reason+' ':''}A sickness moves through the ${f.name}. ${n} die outright and many more are weakened. The crowded settlements suffer worst.`,s.x,s.y,[f],{why:[f.tech.medicine?'':`They had no medicine.`,f.g.sociality>0.5?'They live packed close together.':''].filter(Boolean)})}
  S.plague=plague;

  // ---------- writing systems ----------
  const SLEVEL={picto:0,logo:1,syll:2,abugida:3,abjad:3,alpha:3};
  S.native=nid=>{const n=S.names[nid];if(!n)return'';const L=S.langs[n.lang];return writeScript(n.form,n.concepts,L.script||'picto',L.swaps)};
  S.scriptOf=L=>SCRIPT_INFO[L.script||'picto'];
  function setScript(L,sc,why){if(L.script===sc)return;L.script=sc;L.scriptHist.push({yr:yr(),script:sc,why});langSnap(L,why)}
  function reformScript(f,kind,why,title,apart){const L=S.langs[f.lang];const pools=kind==='syll'?SYLL_POOLS:ALPHA_POOLS;
    const parentL=L.parent!=null?S.langs[L.parent]:null;const taken=S.langs.filter(o=>o!==L&&o.script).map(o=>o.script);
    let opts=pools.filter(p=>!taken.includes(p));if(!opts.length)opts=pools.slice();if(apart&&parentL)opts=opts.filter(p=>p!==parentL.script&&p!==L.script);if(!opts.length)opts=pools.filter(p=>p!==L.script);if(!apart&&parentL&&pools.includes(parentL.script)&&R()<0.4)opts=[parentL.script];
    const sc=pick(opts);const before=S.native(f.nameId);setScript(L,sc,why);const info=SCRIPT_INFO[sc];
    log('script',2,title||`The ${f.name} adopt ${kind==='syll'?'a syllabary':'an alphabet'}`,`${cap(why)}. The old characters give way to ${kind==='syll'?'signs for whole syllables':'letters for single sounds'}, shaped like ${info.like}. Their own name, once written ${before}, is now ${S.native(f.nameId)}.`,(capitalOf(f)||f.origin).x,(capitalOf(f)||f.origin).y,[f],{why:[cap(why)+'.'],script:sc})}
  S.reformScript=reformScript;
  function scriptTick(f){const L=S.langs[f.lang];const sl=SLEVEL[SCRIPT_INFO[L.script||'picto'].kind];
    const PLg=L.parent!=null?S.langs[L.parent]:null;
    if(PLg&&L.script===PLg.script&&sl>=2&&yr()-L.born>40&&R()<0.012){const pf=S.facs.find(x=>x.lang===PLg.id);reformScript(f,sl===2?'syll':'alpha',`scribes changed the letters to set the ${f.name} apart from the ${pf?pf.name:'old kingdom'}`,`The ${f.name} remake their letters`,true);return}
    const hanAge=yr()-((L.scriptHist.slice().reverse().find(h=>h.script==='han')||{}).yr||yr());
    if(sl===1&&hanAge>70&&(f.tech.currency||f.tech.math||f.tech.philosophy)&&R()<0.025){const trade=f.values.trade>f.values.knowledge;reformScript(f,trade?'syll':'alpha',trade?'merchants needed to write foreign names and numbers quickly':'scholars wanted a script anyone could learn')}
    else if(sl<3&&f.tech.printing&&R()<0.15)reformScript(f,'alpha','the printing press needs few letters, not thousands of signs');
  }

  // ---------- religion ----------
  const TENETS={
    stranger:{t:'Feed the stranger at your gate.',v:'harmony',sp:1.2,war:-0.3},
    sword:{t:'The blade that defends the faith is holy.',v:'martial',sp:1,war:0.6},
    word:{t:'What is written is sacred; what is forgotten is lost.',v:'knowledge',sp:1,war:0},
    debt:{t:'Every debt is a vow before the gods.',v:'trade',sp:1.3,war:-0.1},
    crown:{t:'The ruler is the voice of heaven on the earth.',v:'order',sp:0.8,war:0.2},
    beauty:{t:'To make a beautiful thing is to pray.',v:'art',sp:1.1,war:-0.2},
    dead:{t:'The dead walk beside us and must be fed.',v:'faith',sp:0.7,war:0},
    convert:{t:'Carry the truth to every people that has not heard it.',v:'faith',sp:1.9,war:0.35},
    pure:{t:'Do not mix your blood or your bread with unbelievers.',v:'order',sp:0.4,war:0.45},
    flesh:{t:'Do not eat anything that has eyes.',v:'harmony',sp:0.9,war:-0.2},
    hunt:{t:'All that runs was made to be hunted.',v:'martial',sp:0.9,war:0.3},
    water:{t:'Never turn your back on the water.',v:'faith',sp:0.8,war:0},
    sky:{t:'Look up before you choose.',v:'knowledge',sp:1,war:0},
    silence:{t:'Speak only what you would carve in stone.',v:'order',sp:0.7,war:0},
    poor:{t:'The hungry are closer to the gods than the full.',v:'harmony',sp:1.4,war:-0.1},
    fire:{t:'Burn what is false, and warm yourself by it.',v:'martial',sp:1.1,war:0.5},
  };
  S.TENETS=TENETS;S.faiths=[];
  const FWORD=['Way','Faith','Word','Path','Mysteries','Covenant','Light','Song'];
  const SECT=['Reformed','True','Hidden','Old','Free','Pure','Burning','Quiet'];
  function faithDomain(f){const g=f.g;if(f.quirks.some(q=>q.type==='cairn'||q.type==='pilgrim'||q.type==='still'))return'dead';if(g.glow>0.5)return'light';if(g.aquatic>0.5)return'deep';if(g.flight>0.4)return'sky';if(g.carnivory>0.55)return'blood';if(g.mystic>0.55)return pick(['moon','star','shadow']);if(f.values.harmony>0.6)return pick(['mother','seed','tree']);if(f.values.martial>0.6)return pick(['iron','fire']);return pick(['sun','sun','river','stone'])}
  function pickTenets(f,n,avoid){const sc=Object.keys(TENETS).filter(k=>!TENETS[k].cult&&!(avoid||[]).includes(k)).map(k=>[k,f.values[TENETS[k].v]+(TENETS[k].v==='faith'?f.values.faith*0.3:0)+R()*0.5+(k==='flesh'&&f.g.carnivory<0.3?0.4:0)+(k==='hunt'&&f.g.carnivory>0.5?0.4:0)+(k==='water'&&f.g.aquatic>0.5?0.5:0)]);sc.sort((a,b)=>b[1]-a[1]);return sc.slice(0,n).map(x=>x[0])}
  S.faithOf=id=>S.faiths[id];
  S.faithTitle=F=>F?F.title:'no faith';
  S.faithNative=F=>{const L=S.langs[F.lang];return writeScript(F.form,F.concepts,L.script||'picto',L.swaps)};
  function foundFaith(f,prophet,parent,why,opt){opt=opt||{};
    const L=S.langs[f.lang];const dom=opt.domain||(parent&&R()<0.6?parent.domain:faithDomain(f));
    const D=dom==='dead'?'death':dom;const word=parent?pick(SECT):pick(FWORD);const con=[D,parent?pick(['true','new','free']):pick(['god','word','true','light'])];
    const form=compose(L,con);const many=!parent&&(f.g.mystic>0.55||f.g.weirdness>0.55)&&f.values.order<0.6;
    const gods=parent&&R()<0.7?parent.gods.map(g=>({...g})):(many?[D,pick(['mother','war','death','seed','sky','wave']),pick(['shadow','fire','song','beast','star'])].filter((x,i,a)=>a.indexOf(x)===i):[D]).map((c,i)=>({name:cap(tidy(compose(L,[c,'god']))),domain:c,gloss:(i===0&&!many?'the One ':'the ')+GLOSS[c]}));
    let tenets=opt.tenets||(parent?parent.tenets.filter((_,i)=>i!==Math.floor(R()*parent.tenets.length)).concat(pickTenets(f,1,parent.tenets)):pickTenets(f,3));
    const ABS=['death','peace','war','blood','light','shadow','dust','ash','iron','fire','song'];const ofD=dom==='dead'?'the Ancestors':ABS.includes(D)?GLOSS[D]:'the '+GLOSS[D];const base=parent?S.faiths[parent.root].title.replace(/^the /,''):'';
    let title=parent?`the ${word} ${base}`:`the ${word} of ${ofD}`;for(let t=0;t<8&&S.faiths.some(x=>x.title===title);t++)title=parent?`the ${pick(SECT)} ${base}`:`the ${pick(FWORD)} of ${ofD}`;if(opt.title)title=opt.title;let gods2=opt.gods||gods;let isMaker=false;
    if(!opt.cult&&!opt.gods&&!opt.title&&opt.maker){isMaker=true;gods2=[{name:S.makerWord(f),domain:'sky',gloss:makerGloss()}].concat(gods2.length>1?gods2.slice(1,2):[]);title=`the ${pick(FWORD)} of ${S.makerWord(f)}`;if(S.maker.kind>S.maker.wrath+0.15&&!tenets.includes('stranger'))tenets=['stranger'].concat(tenets.slice(0,2));else if(S.maker.wrath>S.maker.kind+0.15&&!tenets.includes('fire'))tenets=['fire'].concat(tenets.slice(0,2))}
    const F={id:S.faiths.length,form,concepts:con,lang:L.id,title,domain:D,gods:gods2,tenets,many:gods2.length>1,founder:prophet?prophet.id:null,origin:f.id,born:yr(),holy:opt.holy!=null?opt.holy:capitalOf(f)?capitalOf(f).id:null,parent:parent?parent.id:null,root:parent&&!opt.ownRoot?parent.root:S.faiths.length,sects:[],hue:(f.hue+(parent?60:0)+(opt.cult?150:0))%360,scripture:null,oral:L.stage<2,cult:!!opt.cult,fate:null,prophecy:null,maker:isMaker,god:opt.god!==undefined?opt.god:isMaker?'you':(parent&&!opt.cult&&parent.god!=null?parent.god:null)};F.maker=F.god==='you';
    F.prophecy=makeProphecy(F,f);
    F.scripture=opt.scripture?opt.scripture:L.stage>=2?`the ${pick(['Book','Sayings','Tablets','Scroll','Songs'])} of ${prophet?cname(prophet):f.name}`:`the Remembered Words of ${prophet?cname(prophet):f.name}`;
    S.faiths.push(F);if(parent&&!opt.ownRoot)parent.sects.push(F.id);
    f.belief=f.belief||{};if(opt.under){f.belief[F.id]=opt.share||0.03;for(const k in f.belief)if(+k!==F.id)f.belief[k]*=1-(opt.share||0.03);normBelief(f)}else{for(const k in f.belief)f.belief[k]*=parent?0.45:0.6;f.belief[F.id]=(f.belief[F.id]||0)+(parent?0.55:0.6);normBelief(f);f.state=F.id}
    if(opt.silent)return F;
    if(prophet){deed(prophet,parent?`broke from ${parent.title} and preached ${title}`:`founded ${title}`,'pious');if(prophet.role!=='ruler'&&f.prophet==null)f.prophet=prophet.id}
    const cs=capitalOf(f)||f.origin;
    log(parent?'sect':'faith',3,parent?`The ${cap(title.replace(/^the /,''))} Breaks Away`:`The Founding of ${cap(title)}`,parent?`${prophet?cap(cname(prophet)):'A prophet'} of the ${f.name} denounces ${parent.title} as corrupted and preaches ${title}. ${gods2.length>1?'Its gods':'Its god'}: ${gods2.map(g=>g.name+', '+g.gloss).join('; ')}. The new teaching: "${TENETS[tenets[tenets.length-1]].t}"`:`${prophet?cap(cname(prophet)):'The elders'} of the ${f.name} ${L.stage>=2?'write down':'teach'} ${title}, ${F.many?'a faith of many gods':'a faith of one god'}: ${gods2.map(g=>g.name+', '+g.gloss).join('; ')}. Its first commandments: ${tenets.map(t=>'"'+TENETS[t].t+'"').join(' ')}`,cs.x,cs.y,[f],{why:[why||(parent?`${parent.title} had grown far from the place it began.`:`The ${f.name} had begun asking who made the world.`)],char:prophet?prophet.id:null,faith:F.id});
    return F;
  }
  S.foundFaith=foundFaith;
  function normBelief(f){let t=0;for(const k in f.belief){if(f.belief[k]<0.01)delete f.belief[k];else t+=f.belief[k]}if(t>1)for(const k in f.belief)f.belief[k]/=t}
  S.faithShares=()=>{const out={};for(const f of alive())for(const k in f.belief||{})out[k]=(out[k]||0)+f.pop*f.belief[k];return out};
  function faithWarScore(F){return F?F.tenets.reduce((t,k)=>t+TENETS[k].war,0):0}
  S.faithWarScore=faithWarScore;
  function faithTick(f){
    f.belief=f.belief||{};const L=S.langs[f.lang];const ru=rulerOf(f);
    // founding
    if(f.state==null&&(f.tech.faith?R()<0.2:(f.tech.speech&&yr()-f.born>20&&R()<0.025+f.values.faith*0.04))){const pr=f.prophet!=null&&S.chars[f.prophet]&&S.chars[f.prophet].alive?S.chars[f.prophet]:(()=>{const cs=capitalOf(f);const a=cs?pickCourtAgent(f,cs):null;if(!a)return ru;const c=newChar(f,'prophet',a);c.traits.piety=clamp(c.traits.piety+0.35);f.prophet=c.id;return c})();foundFaith(f,pr,null);return}
    const F=f.state!=null?S.faiths[f.state]:null;if(!F)return;
    if(F.oral&&L.stage>=2&&F.lang===L.id){F.oral=false;F.scripture=F.scripture.replace('the Remembered Words of','the Book of');log('scripture',2,`${cap(F.scripture)} is written down`,`For generations ${F.title} lived only in memory. Now the ${f.name} write it down, and once written, it can no longer quietly change.`,(capitalOf(f)||f.origin).x,(capitalOf(f)||f.origin).y,[f],{faith:F.id,why:['They had learned to write.']})}
    // spread outward
    const sp=F.tenets.reduce((t,k)=>t*TENETS[k].sp,1)*(F.revival&&yr()<F.revival?2:1);
    for(const o of alive()){if(o===f||!facSetts(o).length)continue;const r=rel(f.id,o.id);const bd=borderDist(f,o);const contact=r.trade?1:r.marriage?0.8:bd<500?0.5:r.war?0.25:0;if(!contact)continue;o.belief=o.belief||{};
      const resist=o.state!=null&&o.state!==F.id?(0.5+o.values.faith*0.8):0.4;const rate=0.01*sp*contact/resist*(f.pop/(f.pop+o.pop+1))*2;
      const before=o.belief[F.id]||0;o.belief[F.id]=before+rate*(1-before);for(const k in o.belief)if(+k!==F.id)o.belief[k]*=1-rate*0.5;normBelief(o);
      F.reached=F.reached||{};if(before<0.2&&o.belief[F.id]>=0.2&&o.state!==F.id&&!F.reached[o.id]&&(F.reached[o.id]=1))log('mission',1,`${cap(F.title)} reaches the ${o.name}`,`Traders and preachers of the ${f.name} carry ${F.title} into the towns of the ${o.name}. One in five now prays to ${F.gods[0].name}.`,(capitalOf(o)||o.origin).x,(capitalOf(o)||o.origin).y,[o,f],{faith:F.id,why:[r.trade?'The caravans carried it.':r.marriage?'A royal marriage opened the door.':'They live side by side.']})}
    // conversion of the ruler
    let top=null,tv=0;for(const k in f.belief)if(f.belief[k]>tv){tv=f.belief[k];top=+k}
    if(top!=null&&top!==f.state&&tv>(f.belief[f.state]||0)+0.1&&ru){const G=S.faiths[top];const stay=ru.traits.piety*0.4+f.values.order*0.2+(F.god==='you'?(S.maker.greatness+S.maker.mercy)/400:0)+(S.faiths[top]&&S.faiths[top].god==='you'?-0.2:0);if(R()<0.3&&tv-stay>0.25){const old=F;f.state=top;deed(ru,`converted to ${G.title}`);
      const GL=S.langs[G.lang];const myL=S.langs[f.lang];let scriptNote='';if(SLEVEL[SCRIPT_INFO[GL.script||'picto'].kind]>SLEVEL[SCRIPT_INFO[myL.script||'picto'].kind]&&R()<0.6){setScript(myL,GL.script,`adopted with the scripture of ${G.title}`);myL.stage=Math.max(myL.stage,2);refreshNames(f);scriptNote=` With the new faith comes its scripture, and with the scripture its letters: the ${f.name} now write like ${SCRIPT_INFO[GL.script].like}.`}
      log('convert',3,`The ${f.name} Turn to ${cap(G.title.replace(/^the /,''))}`,`${cap(cname(ru))} abandons ${old.title} and declares ${G.title} the faith of the ${f.name}.${scriptNote}`,(capitalOf(f)||f.origin).x,(capitalOf(f)||f.origin).y,[f,S.facs[G.origin]].filter((x,i,a)=>x&&a.indexOf(x)===i),{faith:G.id,decider:ru.id,why:[`Most of their people already prayed to ${G.gods[0].name}.`,ru.traits.piety<0.4?`${cap(cname(ru))} cared more for peace at home than for the old gods.`:`${cap(cname(ru))} was persuaded the new faith was true.`]});return}}
    // sects
    const age=yr()-F.born;const holders=alive().filter(o=>o.state===F.id);
    if(age>70&&R()<0.004*(1+holders.length*0.6)*(F.god==='you'&&S.dlev?S.dlev('sectMult'):1)&&liveFaiths()<10){const cand=holders.filter(o=>o.id!==F.origin||holders.length===1);const h=cand.sort((a,b)=>(mem(b.id,F.origin).grudge-mem(a.id,F.origin).grudge))[0];if(h&&h===f){const cs=capitalOf(f);const a=cs?pickCourtAgent(f,cs):null;const pr=a?newChar(f,'prophet',a):null;if(pr)pr.traits.piety=0.95;
        const nf=foundFaith(f,pr,F,h.id!==F.origin?`The ${h.name} resented that the holy places of ${F.title} lay in foreign hands.`:`After ${age} years, ${F.title} had grown rich and its priests comfortable.`);
        for(const o of holders)if(o!==f){note(o.id,f.id,'grudge',0.6,`the heresy of ${nf.title}`);note(f.id,o.id,'grudge',0.3,`the corruption of ${F.title}`)}}}
  }
  function liveFaiths(){const sh=S.faithShares();return S.faiths.filter(x=>!x.cult&&x.fate!=='forgotten'&&(sh[x.id]||0)>1).length}
  function faithUnrest(f){if(f.state==null)return 0;const s=f.belief?f.belief[f.state]||0:1;return Math.max(0,0.7-s)*0.35}
  S.faithUnrest=faithUnrest;

  // ---------- prophecies, prophets, cults ----------
  Object.assign(TENETS,{
    master:{t:"The Master's word is the only law.",v:'order',sp:0.7,war:0.3,cult:1},
    ending:{t:'The world ends within our lives: give away everything you own.',v:'faith',sp:1.25,war:0.1,cult:1},
    cleanse:{t:'Only blood can wash the old gods out of the world.',v:'martial',sp:0.75,war:0.75,cult:1},
    tithe:{t:'Give your stores to the temple and you will never hunger again.',v:'trade',sp:1.05,war:0,cult:1},
    chosen:{t:'We alone were chosen; the rest are already dead.',v:'faith',sp:0.6,war:0.45,cult:1},
    secret:{t:'Tell no outsider what is said in the dark.',v:'order',sp:0.85,war:0,cult:1},
  });
  const SIGNS={
    comet:{txt:'when a green star crosses the sky',ev:['comet']},
    famine:{txt:'when the rains fail and the granaries stand empty',ev:['famine']},
    plague:{txt:'when the sickness walks from town to town',ev:['plague']},
    split:{txt:'when kin raise spears against kin',ev:['schism','revolution']},
    fall:{txt:'when the holy city falls to strangers',ev:['conquest']},
    giant:{txt:'when a giant walks the earth',ev:['titan']},
    sea:{txt:'when strangers walk up out of the sea',ev:['arrival']},
  };
  function makeProphecy(F,f){const keys=Object.keys(SIGNS);const sign=F.domain==='deep'||F.domain==='water'?pick(['sea','sea','comet']):F.domain==='sky'||F.domain==='star'||F.domain==='light'?pick(['comet','comet','giant']):pick(keys);
    const god=F.gods[0];const who=pick(['one will come who speaks with the voice of','a child will be born who carries the breath of','a stranger will come bearing the mark of','the herald of']);
    return{sign,text:`${cap(SIGNS[sign].txt)}, ${who} ${god.name}`,done:false,claims:0}}
  function signSeen(F,f){const sg=SIGNS[F.prophecy.sign];return S.events.slice(-80).reverse().find(e=>yr()-e.yr<=14&&sg.ev.includes(e.type)&&(F.prophecy.sign!=='fall'||(F.holy!=null&&e.text.includes('the capital'))))||null}
  S.moves=[];
  S.SIGNS=SIGNS;
  const avgUnrest=f=>{const ss=facSetts(f);return ss.length?ss.reduce((t,s)=>t+s.unrest,0)/ss.length:0};
  const hardTimes=f=>f.warWeary>8||S.world.foodMult<1||S.events.slice(-40).some(e=>yr()-e.yr<10&&e.facs.includes(f.id)&&['plague','famine','conquest','razed'].includes(e.type));
  function shiftBelief(f,fid,v){f.belief=f.belief||{};const before=f.belief[fid]||0;const nv=clamp(v,0,0.98);const d=nv-before;f.belief[fid]=nv;let rest=0;for(const k in f.belief)if(+k!==fid)rest+=f.belief[k];if(rest>0&&d>0){const room=1-nv;const take=Math.max(0,rest-room)+d*0.5*Math.min(1,rest);const scale=Math.max(0,(rest-Math.min(rest,take))/rest);for(const k in f.belief)if(+k!==fid)f.belief[k]*=scale}normBelief(f)}
  function endMove(m,out){m.on=false;m.end=yr();m.outcome=out}
  function remoteTown(f){const cs=capitalOf(f);const ss=facSetts(f).filter(s=>s!==cs&&s.members.length>=3);return ss.length?ss.sort((a,b)=>b.unrest-a.unrest)[0]:cs}
  function leaderName(c){return cname(c)}
  function startCult(f,why){
    const s=remoteTown(f);if(!s)return;const a=pickCourtAgent(f,s);if(!a)return;const c=newChar(f,'cult leader',a);
    const T=c.traits;T.ambition=clamp(0.8+R()*0.2);T.piety=clamp(R()*0.35);T.greed=clamp(0.5+R()*0.5);T.warmth=clamp(0.55+R()*0.45);T.cruelty=clamp(0.3+R()*0.6);T.paranoia=clamp(0.5+R()*0.5);c.settId=s.id;
    const L=S.langs[f.lang];const nm=leaderName(c);const parent=f.state!=null?S.faiths[f.state]:null;
    const style=Math.floor(R()*4);const SYM=['Closed Eye','Red Hand','Last Dawn','Hollow Star','Black Water','Ninth Door','White Mask','Burning Seed'];
    let title=style===0?`the Children of ${nm}`:style===1?`the ${pick(['Brotherhood','Circle','Order','Fellowship'])} of the ${pick(SYM)}`:style===2?`the ${pick(['Hidden','Final','Silent','Nameless'])} ${pick(['Flock','Way','Light','Covenant'])}`:`the ${pick(['Watchers','Sleepers','Wakers','Hungry'])} of the ${pick(SYM)}`;
    for(let t=0;t<6&&S.faiths.some(x=>x.title===title);t++)title=`the ${pick(['Brotherhood','Circle','Order'])} of the ${pick(SYM)}`;
    const selfGod=T.ambition>0.9&&R()<0.6;const gods=selfGod?[{name:cap(S.spokenName(c)),domain:'self',gloss:'the Living God'}]:[{name:cap(tidy(compose(L,['shadow','god']))),domain:'shadow',gloss:'the Hidden One'}];
    const ct=shuffle(Object.keys(TENETS).filter(k=>TENETS[k].cult));const ten=[ct[0],ct[1]].concat(parent?[pick(parent.tenets)]:[]);
    const F=foundFaith(f,c,parent,null,{under:true,share:0.03,cult:true,ownRoot:true,title,gods,tenets:ten,silent:true,holy:s.id,domain:selfGod?'self':'shadow',scripture:`the ${pick(['Night Letters','Secret Sayings','Revelations','Commands'])} of ${nm}`});
    const m={id:S.moves.length,kind:'cult',fac:f.id,leader:c.id,faith:F.id,born:yr(),on:true,peak:0.03,sett:s.id,resp:[]};S.moves.push(m);
    deed(c,`founded ${title} in ${s.name}`);
    log('cult',2,`${cap(nm)} and ${cap(title.replace(/^the /,''))}`,`In ${s.name}, a ${T.warmth>0.75?'magnetic':'soft-spoken'} ${T.greed>0.75?'and grasping ':''}preacher named ${cap(nm)} begins to gather followers by night. ${selfGod?`${cap(nm)} says plainly what the followers whisper: that ${cap(nm)} is a god.`:`They worship ${gods[0].name}, the Hidden One, whom only ${cap(nm)} has seen.`} Every follower swears: "${TENETS[ten[0]].t}"`,s.x,s.y,[f],{why:[why],char:c.id,faith:F.id,move:m.id});
  }
  function startProphet(f,F,ev){
    const s=remoteTown(f)||capitalOf(f);if(!s)return;const a=pickCourtAgent(f,s);if(!a)return;const c=newChar(f,'prophet',a);c.traits.piety=clamp(0.75+R()*0.25);c.traits.warmth=clamp(0.4+R()*0.6);c.settId=s.id;
    const nm=cname(c);F.prophecy.claims++;
    const m={id:S.moves.length,kind:'prophet',fac:f.id,leader:c.id,faith:F.id,born:yr(),on:true,support:ev?0.08:0.03,sign:ev?ev.id:null,peak:0,resp:[]};S.moves.push(m);
    deed(c,`claimed to fulfil the prophecy of ${F.title}`);
    log('prophet',2,`${cap(nm)} Claims the Prophecy`,`${cap(F.scripture)} says: "${F.prophecy.text}." ${ev?`After ${ev.title.replace(/^The /,'the ')}, `:''}${cap(nm)} walks into ${s.name} and says the words are about ${c.traits.warmth>0.7?'them, gently':'them'}. ${ev?'Many remember the sign, and listen.':'There has been no sign. Most people laugh.'}`,s.x,s.y,[f],{why:[ev?`The sign had come: ${ev.title}.`:`${cap(F.title)} had waited a long time for its promised one.`],char:c.id,faith:F.id,move:m.id});
  }
  function respond(f,m,ru,F,sh){
    // the throne decides what to do about the cult
    const T=ru.traits,gov=f.gov;const opts=[];
    const add=(k,sc,why)=>opts.push({k,sc:sc+R()*0.3,why});
    add('persecute',(gov==='theocracy'?1.3:0)+(gov==='police'?1:0)+(gov==='junta'?0.5:0)+T.piety*0.7+T.paranoia*0.5+T.cruelty*0.3+f.values.order*0.3+sh*1.1-(m.tolerated?0.3:0)+(F.tenets.includes('cleanse')?0.3:0),
      gov==='theocracy'?`The priests who rule the ${f.name} will not share heaven with an upstart.`:gov==='police'?'The watchers report every secret meeting.':T.piety>0.6?`${cap(cname(ru))} believes the old gods are jealous.`:`${cap(cname(ru))} fears anyone with a following.`);
    add('tolerate',T.warmth*0.6+(1-T.piety)*0.4+f.values.harmony*0.5+(['democracy','republic','commune','oligarchy'].includes(gov)?0.6:0)+(gov==='cult'?0.5:0),
      ['democracy','republic','commune'].includes(gov)?'Their laws let anyone pray as they like.':`${cap(cname(ru))} sees no harm in a few strange prayers.`);
    if(sh>0.3&&gov!=='theocracy')add('embrace',(1-T.piety)*0.6+T.ambition*0.4+sh*1.2,`Nearly a third of the ${f.name} already follow ${cname(S.chars[m.leader])}; ${cname(ru)} would rather lead them than fight them.`);
    if(sh>0.16&&f.state!=null&&f.state!==F.id)add('merge',0.35+f.values.harmony*0.6+(1-T.piety)*0.3+T.genius*0.4+(f.values.trade>0.5?0.2:0),`${cap(cname(ru))} hoped to make one faith out of two and end the quarrel.`);
    opts.sort((a,b)=>b.sc-a.sc);return opts[0];
  }
  function cultStep(f,m){gStale=true;
    const c=S.chars[m.leader],F=S.faiths[m.faith];let sh=(f.belief||{})[F.id]||0;const ru=rulerOf(f);const s=settById(m.sett)||capitalOf(f)||f.origin;const nm=cname(c);
    if(f.state===F.id){F.cult=false;F.fate=F.fate||'state faith';endMove(m,'became the faith of the realm');return}
    if(ru&&ru.id===c.id){const old=f.state!=null?S.faiths[f.state]:null;f.state=F.id;F.cult=false;F.fate='state faith';endMove(m,'its prophet took the throne');log('convert',3,`${cap(nm)} Crowns the Cult`,`${cap(nm)} now rules the ${f.name}, and ${F.title} is the faith of the realm${old?`; the priests of ${old.title} are turned out of their temples`:''}.`,s.x,s.y,[f],{faith:F.id,char:c.id,why:['A preacher with a following is a dangerous guest at court.']});return}
    if(!c.alive){
      if(sh<0.12||!m.persecuted&&sh<0.2){endMove(m,'forgotten');F.fate='forgotten';delete f.belief[F.id];normBelief(f);
        log('cultend',1,`${cap(F.title.replace(/^the /,''))} Fades`,`With ${cap(nm)} dead, ${F.title} has no one left to believe in. Its last followers drift back to the old temples, and within a generation the secret words are forgotten.`,s.x,s.y,[f],{faith:F.id,char:c.id,why:['The movement had been one person, and that person was gone.']});return}
      F.cult=false;F.fate='church';shiftBelief(f,F.id,sh*1.25);endMove(m,'outlived its founder');
      log('martyr',3,`The Martyrdom of ${cap(nm)}`,`${c.cause==='executed'?`The throne killed ${cap(nm)}, and in doing so made a saint.`:`${cap(nm)} dies, but the followers do not scatter.`} ${cap(F.title)} stops being a cult and becomes a church: its priests write down ${F.scripture}, and its symbol is painted on walls across the land of the ${f.name}.`,s.x,s.y,[f],{faith:F.id,char:c.id,why:[m.persecuted?'Persecution made martyrs, and martyrs make faiths.':'It had grown too large to die with its founder.']});return}
    // growth
    const ch=(c.traits.warmth+c.traits.ambition)/2;const sp=F.tenets.reduce((t,k)=>t*TENETS[k].sp,1);const resist=0.55+f.values.faith*0.45+f.values.order*0.3;
    let g=0.016*ch*sp*(1+avgUnrest(f)*2.2)*(hardTimes(f)?1.6:1)/resist;if(m.persecuted)g*=0.6;
    sh=sh+g*(1-sh)*(0.6+R()*0.8);if(R()<0.012&&sh<0.25){sh*=0.25;m.scandal=true;deed(c,'was exposed as a fraud');log('scandal',2,`The Unmasking of ${cap(nm)}`,`Followers of ${F.title} discover that ${cap(nm)} ${pick(['has been hoarding the offerings','keeps a house of luxuries behind the temple','faked the miracles with oil and mirrors','was never visited by any god'])}. Most of them walk away in a single night.`,s.x,s.y,[f],{faith:F.id,char:c.id,why:['A movement built on one person is only as honest as that person.']})}
    shiftBelief(f,F.id,sh);m.peak=Math.max(m.peak,sh);
    // it leaks into neighbors
    if(sh>0.2)for(const o of alive()){if(o===f||!facSetts(o).length||borderDist(f,o)>450)continue;if(R()<0.15){o.belief=o.belief||{};if(!o.belief[F.id]){shiftBelief(o,F.id,0.02)}}}
    if(sh<0.008){endMove(m,'forgotten');F.fate='forgotten';log('cultend',1,`${cap(F.title.replace(/^the /,''))} Dwindles Away`,`No one comes to ${cap(nm)}'s night meetings anymore. ${cap(F.title)} is remembered, if at all, as a joke.`,s.x,s.y,[f],{faith:F.id,char:c.id,why:['It never found enough believers.']});return}
    // the throne answers
    if(ru&&sh>0.07&&(m.lastResp==null||yr()-m.lastResp>8)){m.lastResp=yr();const d=respond(f,m,ru,F,sh);m.resp.push({yr:yr(),k:d.k});
      if(d.k==='persecute'){m.persecuted=(m.persecuted||0)+1;const keep=0.35+R()*0.3;shiftBelief(f,F.id,sh*keep);for(const x of facSetts(f))x.resent=Math.min(2,(x.resent||0)+0.25);
        const caught=R()<0.4+(f.gov==='police'?0.3:0)+(f.gov==='theocracy'?0.15:0);const ca=charAgent(c);
        if(caught){deed(ru,`burned the followers of ${F.title}`,'raze');log('persecution',m.persecuted>1?2:3,`The Burning of ${cap(F.title.replace(/^the /,''))}`,`${cap(cname(ru))} sends soldiers into ${s.name}. The meeting houses of ${F.title} are burned and its followers are hunted. ${cap(nm)} is dragged before the throne and executed.`,s.x,s.y,[f],{faith:F.id,char:c.id,decider:ru.id,why:[d.why]});if(ca)die(ca,'executed');charDeath(c,'executed')}
        else{const refuge=alive().filter(o=>o!==f&&facSetts(o).length&&o.gov!=='theocracy'&&o.gov!=='police').sort((a,b)=>borderDist(f,a)-borderDist(f,b))[0];
          if(refuge&&!m.fled){m.fled=1;c.fac=refuge.id;m.fac=refuge.id;const rs=capitalOf(refuge);m.sett=rs?rs.id:m.sett;if(ca){ca.fac=refuge.id;ca.home=rs?rs.id:ca.home;stats(ca)}shiftBelief(refuge,F.id,Math.max(0.03,sh*0.25));
            log('persecution',2,`The Flight of ${cap(nm)}`,`${cap(cname(ru))} outlaws ${F.title} and burns its meeting houses. ${cap(nm)} escapes across the border to the ${refuge.name}, and many followers go too. Now ${F.title} preaches among strangers.`,s.x,s.y,[f,refuge],{faith:F.id,char:c.id,decider:ru.id,why:[d.why]})}
          else log('persecution',2,`${cap(F.title.replace(/^the /,''))} Driven Underground`,`${cap(cname(ru))} outlaws ${F.title}. Its followers meet in cellars now, and ${cap(nm)} is never in the same house twice.`,s.x,s.y,[f],{faith:F.id,char:c.id,decider:ru.id,why:[d.why]})}}
      else if(d.k==='embrace'){const old=f.state!=null?S.faiths[f.state]:null;f.state=F.id;F.cult=false;F.fate='state faith';deed(ru,`bowed to ${nm}`);
        const coup=c.traits.ambition>0.88&&f.gov!=='democracy'&&R()<0.5;
        log('convert',3,`The ${f.name} Bow to ${cap(nm)}`,`${cap(cname(ru))} kneels before ${cap(nm)} and declares ${F.title} the faith of the ${f.name}${old?`, casting down ${old.title}`:''}. ${coup?`It is not enough for ${cap(nm)}.`:'The cult becomes a church overnight, and its secret words are read aloud in every square.'}`,s.x,s.y,[f],{faith:F.id,char:c.id,decider:ru.id,why:[d.why]});
        if(coup){f.gov='theocracy';c.role='ruler';setRuler(f,c,'seized','the cult took the throne');deed(c,'took the throne as god-king','conquer');log('coup',3,`${cap(nm)} Takes the Throne`,`Within a year ${cap(nm)} rules the ${f.name} outright, as high priest and king at once. Those who mocked the cult are the first to disappear.`,s.x,s.y,[f],{char:c.id,why:['A ruler who bows once is asked to bow again.']})}
        endMove(m,coup?'took the throne':'became the faith of the realm')}
      else if(d.k==='merge'){const A=S.faiths[f.state];const shA=f.belief[A.id]||0;const base=S.faiths[A.root].title.replace(/^the /,'');
        const NF=foundFaith(f,ru,A,null,{silent:true,title:`the ${pick(['United','Twofold','Wedded','Joined'])} ${base}`,tenets:A.tenets.slice(0,2).concat([F.tenets[0]]),gods:A.gods.concat(F.gods.filter(g=>g.domain!=='self')).slice(0,3)});
        f.belief[NF.id]=shA+sh;delete f.belief[A.id];delete f.belief[F.id];normBelief(f);F.cult=false;F.fate=`merged into ${NF.title}`;
        log('merge',3,`${cap(NF.title.replace(/^the /,''))}: Two Faiths Become One`,`Rather than burn the followers of ${cap(nm)}, ${cap(cname(ru))} summons both priesthoods to ${(capitalOf(f)||s).name} and does not let them leave until they agree. The result is ${NF.title}, which keeps the gods of ${A.title} and ${F.gods.some(g=>g.domain!=='self')?`adds ${F.gods.filter(g=>g.domain!=='self').map(g=>g.name).join(' and ')}`:`honours ${cap(nm)} as a saint`}. New commandment: "${TENETS[NF.tenets[NF.tenets.length-1]].t}"`,s.x,s.y,[f],{faith:NF.id,char:c.id,decider:ru.id,why:[d.why]});
        deed(c,`saw the cult merged into ${NF.title}`);endMove(m,'merged');return}
      else if(!m.tolerated){m.tolerated=true;log('tolerance',1,`${cap(cname(ru))} Tolerates ${cap(F.title.replace(/^the /,''))}`,`${cap(cname(ru))} lets the followers of ${cap(nm)} meet in the open.`,s.x,s.y,[f],{faith:F.id,char:c.id,decider:ru.id,why:[d.why]})}}
    // a holy rising
    sh=(f.belief||{})[F.id]||0;
    if(m.on&&c.alive&&sh>0.26&&(m.persecuted||F.tenets.includes('cleanse')||F.tenets.includes('chosen'))&&c.traits.cruelty>0.45&&R()<0.1){const town=remoteTown(f);if(town&&town!==capitalOf(f)){town.unrest=1;
      const nf=secede(f,town,c,'faith',[`${cap(nm)} told the followers of ${F.title} that the hour had come.`,m.persecuted?'They had been hunted long enough.':'The faithful wanted a kingdom of their own.']);
      if(nf){nf.state=F.id;shiftBelief(nf,F.id,0.75);F.cult=false;F.fate='a nation';nf.values.faith=clamp(nf.values.faith+0.4);declareWar(f,nf,'holy',[`The ${f.name} will not let ${cap(nm)} keep the town.`]);endMove(m,'rose in revolt');deed(c,`led the rising of ${F.title}`,'conquer')}}}
  }
  function prophetStep(f,m){
    const c=S.chars[m.leader],F=S.faiths[m.faith];const ru=rulerOf(f);const s=settById(c.settId)||capitalOf(f)||f.origin;const nm=cname(c);const age=yr()-m.born;
    if(!c.alive){endMove(m,'died unheard');log('prophetend',1,`${cap(nm)} Dies Unheard`,`${cap(nm)} dies still insisting the prophecy was fulfilled. A handful of followers bury the body by the road.`,s.x,s.y,[f],{faith:F.id,char:c.id,why:['Too few believed in time.']});return}
    const sign=m.sign!=null;const holdsF=f.state===F.id;
    m.support=clamp(m.support+0.012*(c.traits.warmth+c.traits.piety)*(sign?1.8:0.6)*(holdsF?1:0.6)*(0.5+R())-(age>12?0.006:0));m.peak=Math.max(m.peak,m.support);
    if(ru&&holdsF&&(m.lastResp==null||yr()-m.lastResp>4)&&m.support>0.12){m.lastResp=yr();
      const deny=(f.gov==='theocracy'?1:0)+ru.traits.piety*0.4+ru.traits.paranoia*0.5+(c.traits.warmth>0.8?0.2:0)+R()*0.4;const accept=m.support*2.2+ru.traits.warmth*0.3+(sign?0.5:0)+R()*0.4;
      if(deny>accept){m.denied=(m.denied||0)+1;if(R()<0.55){const ca=charAgent(c);deed(ru,`executed ${nm} as a false prophet`);log('falseprophet',2,`${cap(nm)}, the False Prophet`,`The priests of ${F.title} examine ${cap(nm)} and declare the claim a blasphemy. ${cap(cname(ru))} has ${cap(nm)} executed in the square of ${s.name}.${m.support>0.25?' Some of the crowd weep. Some of them remember.':''}`,s.x,s.y,[f],{faith:F.id,char:c.id,decider:ru.id,why:[f.gov==='theocracy'?'The priests rule here, and a promised one would have no need of priests.':`${cap(cname(ru))} would not share the people's love with a preacher.`]});if(ca)die(ca,'executed');charDeath(c,'executed');
          if(m.support>0.22){const nf=foundFaith(f,c,F,`The followers of ${cap(nm)} refused to believe their prophet was false.`,{under:true,share:m.support*0.6});nf.prophecy.done=true;S.moves.push({id:S.moves.length,kind:'cult',fac:f.id,leader:c.id,faith:nf.id,born:yr(),on:true,peak:m.support*0.6,sett:s.id,resp:[],persecuted:1})}
          endMove(m,'executed as false');return}}
      else{F.prophecy.done=true;F.revival=yr()+35;c.epithet=c.epithet||'the Promised';deed(c,`was hailed as the Promised One of ${F.title}`);
        for(const o of alive())if(o.belief&&o.belief[F.id])shiftBelief(o,F.id,o.belief[F.id]+0.12);
        log('fulfilled',3,`The Promised One`,`The priests of ${F.title} kneel to ${cap(nm.replace(/ the Promised$/,''))}: "${F.prophecy.text}" has been fulfilled. A revival sweeps through every people that prays to ${F.gods[0].name}, and pilgrims crowd the roads to ${s.name}.`,s.x,s.y,[f],{faith:F.id,char:c.id,decider:ru.id,why:[sign?'Everyone had seen the sign.':`${cap(nm)} was impossible not to love.`]});
        // those who will not accept the Promised One break away
        for(const o of alive())if(o!==f&&o.state===F.id&&mem(o.id,f.id).grudge>0.8&&R()<0.6){const pr=null;const nf=foundFaith(o,pr,F,`The ${o.name} refused to accept a promised one from the ${f.name}.`);nf.prophecy.done=false}
        endMove(m,'accepted');return}}
    if(m.support>0.5&&!holdsF){shiftBelief(f,F.id,(f.belief[F.id]||0)+0.15);F.prophecy.done=true;c.epithet=c.epithet||'the Promised';log('fulfilled',3,`${cap(nm.replace(/ the Promised$/,''))} Brings ${cap(F.title.replace(/^the /,''))}`,`${cap(nm)} preaches that the prophecy of ${F.title} came true in a foreign land, and the ${f.name} begin to believe it.`,s.x,s.y,[f],{faith:F.id,char:c.id,why:['The sign had come.']});endMove(m,'accepted');return}
    if(age>25||m.support<0.01){endMove(m,'faded');log('prophetend',1,`${cap(nm)} Is Forgotten`,`For a while crowds followed ${cap(nm)}. Then they stopped. The prophecy of ${F.title} still waits.`,s.x,s.y,[f],{faith:F.id,char:c.id,why:[sign?'The sign was real, but the prophet was not convincing.':'There had been no sign.']})}
  }
  function movementTick(f){
    if(!capitalOf(f))return;const mine=S.moves.filter(m=>m.on&&m.fac===f.id);
    if(f.state!=null&&f.pop>=22&&yr()-f.born>25&&!(S.isMine&&S.isMine(f)&&yr()<110)&&!mine.some(m=>m.kind==='cult')&&S.moves.filter(m=>m.on&&m.kind==='cult').length<3){
      const hard=hardTimes(f);const p=(0.0005+avgUnrest(f)*0.003+(hard?0.0025:0)+(f.tech.printing?0.001:0))*(S.isMine&&S.isMine(f)?(1.6-S.maker.mercy/100)*S.dlev('cultMult')*Math.sqrt(S.diff()):1)*(S.world.cultMult||1);
      if(R()<p)startCult(f,hard?`Hard times left the ${f.name} looking for someone who promised an answer.`:avgUnrest(f)>0.35?`The towns of the ${f.name} had stopped trusting the throne.`:`${cap(S.faiths[f.state].title)} had grown rich, and its temples cold.`)}
    if(f.state!=null&&!mine.some(m=>m.kind==='prophet')){const F=S.faiths[f.state];if(F.prophecy&&!F.prophecy.done&&yr()-F.born>30){const ev=signSeen(F,f);if(R()<(ev?0.08:0.003))startProphet(f,F,ev)}}
    for(const m of mine)m.kind==='cult'?cultStep(f,m):prophetStep(f,m);
  }
  S.startCult=f=>startCult(f,'A voice in the wilderness.');

  // ---------- the Maker: the immortal who made them, and the choices put before them ----------
  S.maker={kind:0,wrath:0,count:0,deeds:[],recent:[]};
  const mk=S.maker;
  function knows(f){return f.knows||0}
  function reveal(f,v){f.knows=clamp((f.knows||0)+v)}
  const MCON=()=>mk.greatness>mk.mercy+15?['fire','sky']:mk.mercy>mk.greatness+15?['sky','mother']:['eye','sky'];
  function makerWord(f){const L=S.langs[f.lang];const c=MCON();return L.stage===0?`${GLOSS[c[0]]}-${GLOSS[c[1]]}`:cap(tidy(compose(L,c)))}
  S.makerWord=makerWord;
  function makerGloss(){return mk.wrath>mk.kind+0.15?'the Maker Who Burns':mk.kind>mk.wrath+0.15?'the Maker Who Answers':'the Watching Maker'}
  S.makerStanding=()=>{const al=alive();const kn=al.length?Math.max(...al.map(knows)):0;const tone=mk.wrath>mk.kind+0.15?'feared':mk.kind>mk.wrath+0.15?'loved':'puzzled over';
    return{kn,label:kn<0.12?'Unknown':kn<0.35?'A rumour':kn<0.65?(tone==='feared'?'Feared':tone==='loved'?'Revered':'Whispered of'):(tone==='feared'?'A dreaded god':tone==='loved'?'A beloved god':'A known god'),tone,kind:mk.kind,wrath:mk.wrath}};
  // knowledge of the Maker drifts between neighbours; faiths form around it
  function makerTick(f){if(knows(f)>0.45&&f.state!=null&&!S.faiths[f.state].maker&&!S.faiths[f.state].cult&&R()<0.004){const cs=at(f);const a=cs?pickCourtAgent(f,cs):null;const pr=a?newChar(f,'prophet',a):null;foundFaith(f,pr,S.faiths[f.state],`The ${f.name} knew who had made them, and the old priests would not say the name.`,{maker:true})}
    let best=knows(f);for(const o of alive()){if(o===f||borderDist(f,o)>500)continue;best=Math.max(best,knows(o))}if(best>knows(f))f.knows=knows(f)+(best-knows(f))*0.01;f.knows=Math.max(0,(f.knows||0)-0.0008)}
  function grant(f,k){if(!TECH[k]||f.tech[k])return;for(const r of TECH[k].req)grant(f,r);f.tech[k]=yr()}
  function nextTechs(f,n){return Object.keys(TECH).filter(k=>!f.tech[k]&&TECH[k].req.every(r=>f.tech[r])).sort((a,b)=>TECH[a].c-TECH[b].c).slice(0,n)}
  const at=f=>capitalOf(f)||f.origin;
  const FN=f=>`the ${f.name}`;
  function addressed(f){const k=knows(f);return k<0.12?null:makerWord(f)}
  function soldiersDie(f,frac,cause){let n=0;for(const a of S.agents){if(a.dead||a.fac!==f.id||a.titan)continue;if((a.role==='soldier'||R()<frac*0.3)&&R()<frac){die(a,cause);n++}}return n}
  function fed(f,mult){for(const s of facSetts(f))s.store+=s.members.length*mult}
  // Each scenario: find() -> [score, ctx] or null; view(ctx) -> {title, body, opts:[{id,label,hint}]}; act(ctx,id) -> outcome sentence
  const SC={
    prayer:{find(){const c=alive().filter(f=>f.tech.speech&&knows(f)<0.2&&facSetts(f).length);if(!c.length)return null;const f=c.sort((a,b)=>b.pop-a.pop)[0];return[mk.count<2?6:1.5,{f:f.id}]},
      view({f}){f=S.facs[f];const cs=at(f);return{title:'A Voice Calls Upward',body:`On a hill above ${cs.name}, an elder of ${FN(f)} stands alone under the stars and shouts a question into the dark: is anyone there? Below, the whole town has gone quiet to listen.`,
        opts:[{id:'answer',label:'Answer them',hint:'They will know you are real'},{id:'sign',label:'Send a sign, and stay hidden',hint:'They will wonder for generations'},{id:'silent',label:'Say nothing',hint:'They will find their own answers'}]}},
      act({f},id){f=S.facs[f];if(id==='answer'){reveal(f,0.5);f.values.faith=clamp(f.values.faith+0.2);mk.kind+=0.04;if(f.state==null){const cs=at(f);const a=pickCourtAgent(f,cs);const pr=a?newChar(f,'prophet',a):null;foundFaith(f,pr,null,'The sky answered.',{maker:true})}return`The sky answered. From that night ${FN(f)} know they were made, and they call their maker ${makerWord(f)}.`}
        if(id==='sign'){reveal(f,0.15);f.values.faith=clamp(f.values.faith+0.1);f.values.art=clamp(f.values.art+0.08);S.pulses.push({x:at(f).x,y:at(f).y,h:50,t:S.year,big:1});return`A star fell slowly over ${at(f).name} and did not burn out. ${cap(FN(f))} argue still about what it meant.`}
        f.values.knowledge=clamp(f.values.knowledge+0.12);f.values.faith=clamp(f.values.faith-0.08);return`No answer came. ${cap(FN(f))} decided they would have to explain the world themselves.`}},
    war:{find(){let best=null;for(const A of alive())for(const B of alive()){if(A.id>=B.id||!rel(A.id,B.id).war)continue;const sc=3+Math.min(3,(A.pop+B.pop)/80);if(!best||sc>best[0])best=[sc,{a:A.id,b:B.id}]}return best},
      view({a,b}){const A=S.facs[a],B=S.facs[b];const r=rel(a,b);const ru=rulerOf(A);const nm=addressed(A);return{title:`The War of the ${A.name} and the ${B.name}`,body:`${cap(FN(A))} are at war with ${FN(B)}${r.goal&&GOALTXT[r.goal]?' '+GOALTXT[r.goal]:''}. ${nm&&ru?`Before the armies meet, ${cap(cname(ru))} kneels and begs ${nm} for victory.`:'On both sides, priests burn offerings to whatever is listening.'} Both sides are ${A.pop>B.pop*1.5?`unequal: ${FN(A)} are far stronger`:B.pop>A.pop*1.5?`unequal: ${FN(B)} are far stronger`:'evenly matched'}.`,
        opts:[{id:'a',label:`Give the ${A.name} victory`,hint:`Strike down the soldiers of the ${B.name}`},{id:'b',label:`Give the ${B.name} victory`,hint:`Strike down the soldiers of the ${A.name}`},{id:'peace',label:'Command them to make peace',hint:knows(A)+knows(B)>0.6?'They know your voice; they may obey':'They hardly know you exist; they may not listen'},{id:'silent',label:'Let them fight it out',hint:'The stronger will decide it'}]}},
      act({a,b},id){const A=S.facs[a],B=S.facs[b];if(!rel(a,b).war)return'The war had already ended.';
        if(id==='a'||id==='b'){const W=id==='a'?A:B,L=id==='a'?B:A;const n=soldiersDie(L,0.4,'struck down by the sky');reveal(W,0.15);reveal(L,0.12);mk.wrath+=0.06;note(L.id,W.id,'grudge',0.6,'the sky took their side');W.values.faith=clamp(W.values.faith+0.1);return`A storm out of a clear sky broke over the army of ${FN(L)}. ${n} died before they could run. ${cap(FN(W))} call it the day ${knows(W)>0.3?makerWord(W)+' chose them':'the heavens chose them'}.`}
        if(id==='peace'){reveal(A,0.2);reveal(B,0.2);mk.kind+=0.05;const obey=0.25+(knows(A)+knows(B))*0.4+(A.values.faith+B.values.faith)*0.15;if(R()<obey){makePeace(A,B,['A voice from the sky commanded it.']);return`Both armies heard the same voice at the same hour. They laid down their spears and went home.`}
          const ru=rulerOf(A);note(A.id,B.id,'grudge',0.2,'war');return`The voice came, and ${ru?cap(cname(ru)):`the ${A.name}`} ordered the drums beaten louder to drown it out. The war goes on.`}
        return'You watched. The stronger side kept fighting.'}},
    hunger:{find(){const c=alive().filter(f=>{const ss=facSetts(f);return ss.length&&ss.reduce((t,s)=>t+s.store,0)<ss.reduce((t,s)=>t+s.members.length,0)*1.2&&f.pop>12});if(!c.length)return null;const f=c.sort((a,b)=>b.pop-a.pop)[0];return[S.world.foodMult<1?5:3,{f:f.id}]},
      view({f}){f=S.facs[f];const nm=addressed(f);const t=nextTechs(f,4).find(k=>['agri','navigation','currency','medicine','industry'].includes(k));return{title:`Hunger among the ${f.name}`,body:`The granaries of ${FN(f)} are nearly empty. Children are sent out to dig roots; the old stop eating so the young can. ${nm?`They pray to ${nm} for rain.`:'They do not know whom to ask for help.'}`,
        opts:[{id:'rain',label:'Send rain and a great harvest',hint:'They will be fed this year'}].concat(t?[{id:'teach',label:`Whisper the secret of ${TECH[t].n.toLowerCase()} to a dreamer`,hint:'Slower, but it lasts',t}]:[]).concat([{id:'endure',label:'Let them endure it',hint:'Hardship makes hard peoples'}])}},
      act({f},id){f=S.facs[f];if(id==='rain'){fed(f,10);reveal(f,0.15);mk.kind+=0.06;return`Rain fell for forty days on the fields of ${FN(f)}, and the harvest was the greatest anyone remembered.`}
        if(id==='teach'){const t=nextTechs(f,4).find(k=>['agri','navigation','currency','medicine','industry'].includes(k));if(t)grant(f,t);fed(f,3);reveal(f,0.04);mk.kind+=0.03;return t?`A young one of ${FN(f)} woke from a fever-dream knowing ${TECH[t].n.toLowerCase()}. Within a generation, no one went hungry.`:'A dreamer woke with an idea.'}
        f.values.martial=clamp(f.values.martial+0.08);f.values.order=clamp(f.values.order+0.06);for(const a of S.agents)if(!a.dead&&a.fac===f.id&&a.age>a.life*0.7&&R()<0.4)die(a,'hunger');return`No help came. The old and the weak died, and ${FN(f)} grew harder.`}},
    plague:{find(){const e=S.events.slice(-60).reverse().find(e=>e.type==='plague'&&yr()-e.yr<12&&S.facs[e.facs[0]].died==null);return e?[5,{f:e.facs[0]}]:null},
      view({f}){f=S.facs[f];const nm=addressed(f);return{title:`The Sickness of the ${f.name}`,body:`A plague moves through the towns of ${FN(f)}. Bodies are burned outside the walls at dawn. ${nm?`The priests promise that ${nm} will save the faithful.`:'Healers try everything they know, and none of it works.'}`,
        opts:[{id:'cure',label:'Heal them, and teach them medicine',hint:'The sickness ends'},{id:'faithful',label:'Spare only those who pray to you',hint:'Faith becomes a matter of life and death'},{id:'run',label:'Let it run its course',hint:'The survivors will be stronger'}]}},
      act({f},id){f=S.facs[f];if(id==='cure'){for(const a of S.agents)if(!a.dead&&a.fac===f.id){a.hp=a.maxhp;a.energy=Math.max(a.energy,60)}grant(f,'medicine');reveal(f,0.15);mk.kind+=0.06;return`The fevers broke all at once, on the same night. ${cap(FN(f))} learned to boil water and bind wounds, and never again died so easily.`}
        if(id==='faithful'){let n=0;for(const a of S.agents)if(!a.dead&&a.fac===f.id&&R()<(1-f.values.faith)*0.25){die(a,'plague');n++}reveal(f,0.35);f.values.faith=clamp(f.values.faith+0.3);mk.wrath+=0.05;mk.kind+=0.02;return`The plague took ${n} doubters and passed over every house with a prayer on its door. No one among ${FN(f)} doubted ${makerWord(f)} after that.`}
        f.g.armor=clamp(f.g.armor+0.03);return`The plague burned itself out. Those who lived through it were tougher, and fewer.`}},
    cult:{find(){const m=S.moves.find(m=>m.on&&m.kind==='cult'&&S.chars[m.leader].alive&&(S.facs[m.fac].belief||{})[m.faith]>0.06);return m?[4,{m:m.id}]:null},
      view({m}){m=S.moves[m];const c=S.chars[m.leader],F=S.faiths[m.faith],f=S.facs[m.fac];return{title:`The Preacher ${cap(cname(c))}`,body:`Among ${FN(f)}, ${cap(cname(c))} preaches ${F.title} by night and grows rich on the offerings. ${F.gods.some(g=>g.domain==='self')?`${cap(cname(c))} claims to be a god.`:`${cap(cname(c))} claims to speak for ${F.gods[0].name}, the Hidden One${knows(f)>0.3?', and lately, for you':''}.`} About ${Math.round((f.belief[F.id]||0)*100)} in a hundred now follow.`,
        opts:[{id:'expose',label:'Expose the fraud',hint:'The followers will scatter'},{id:'empower',label:'Let them believe it is you speaking',hint:'The cult will swell, in your name'},{id:'leave',label:'Let the people decide',hint:'The cult may grow, merge or fade'}]}},
      act({m},id){m=S.moves[m];const c=S.chars[m.leader],F=S.faiths[m.faith],f=S.facs[m.fac];if(!m.on)return'The cult had already run its course.';
        if(id==='expose'){shiftBelief(f,F.id,(f.belief[F.id]||0)*0.15);deed(c,'was exposed as a fraud');reveal(f,0.08);mk.kind+=0.02;return`Every lie ${cap(cname(c))} ever told was written on the walls of ${at(f).name} overnight, in a hand no one recognised. The followers walked away.`}
        if(id==='empower'){shiftBelief(f,F.id,(f.belief[F.id]||0)+0.18);c.traits.ambition=1;reveal(f,0.2);mk.wrath+=0.04;return`Miracles began to follow ${cap(cname(c))}: lamps that lit themselves, a dead child breathing. ${cap(F.title)} swelled, and now it preaches in your name.`}
        return'You let the people decide.'}},
    prophet:{find(){const m=S.moves.find(m=>m.on&&m.kind==='prophet'&&S.chars[m.leader].alive);return m?[4.5,{m:m.id}]:null},
      view({m}){m=S.moves[m];const c=S.chars[m.leader],F=S.faiths[m.faith],f=S.facs[m.fac];return{title:'One Who Claims the Prophecy',body:`${cap(cname(c))} says the prophecy of ${F.title} has come true in them: "${F.prophecy.text}." Crowds gather in ${(settById(c.settId)||at(f)).name}. The priests are watching, uneasy.`,
        opts:[{id:'confirm',label:'Confirm them with a sign',hint:'The faith will have its promised one'},{id:'deny',label:'Let the claim fall flat',hint:'They will be called a false prophet'},{id:'leave',label:'Stay out of it',hint:'Their own words will have to be enough'}]}},
      act({m},id){m=S.moves[m];const c=S.chars[m.leader],f=S.facs[m.fac];if(!m.on)return'It was already over.';if(id==='confirm'){m.support=Math.max(m.support,0.55);m.sign=m.sign!=null?m.sign:S.events[S.events.length-1].id;reveal(f,0.15);mk.kind+=0.02;return`When ${cap(cname(c))} raised a hand, the river stopped. Thousands saw it.`}
        if(id==='deny'){m.support=0.01;c.traits.warmth=0.2;return`${cap(cname(c))} promised a miracle at noon. Noon came, and nothing happened.`}return'You stayed out of it.'}},
    tyrant:{find(){let best=null;for(const f of alive()){const ru=rulerOf(f);if(!ru||ru.traits.cruelty<0.68)continue;const sc=2.5+ru.traits.cruelty*2+avgUnrest(f)*2;if(!best||sc>best[0])best=[sc,{f:f.id,c:ru.id}]}return best},
      view({f,c}){f=S.facs[f];c=S.chars[c];return{title:`The Cruelty of ${cap(cname(c))}`,body:`${cap(cname(c))} rules ${FN(f)} by fear. ${c.deeds.slice(-1)[0]?`They ${c.deeds.slice(-1)[0].txt}. `:''}In the towns, people stop speaking when soldiers pass.`,
        opts:[{id:'strike',label:`Strike ${cap(cname(c))} down`,hint:'A sudden, visible death'},{id:'dream',label:'Send them a dream of their victims',hint:'They may change'},{id:'leave',label:'Leave them to their people',hint:'Tyrants make rebels'}]}},
      act({f,c},id){f=S.facs[f];c=S.chars[c];if(!c.alive)return'The tyrant was already dead.';if(id==='strike'){const a=charAgent(c);reveal(f,0.3);mk.wrath+=0.1;deed(c,'was struck down by the sky');if(a)die(a,'lightning');charDeath(c,'struck by lightning');return`Lightning came down out of a clear sky in front of the whole court. ${cap(FN(f))} will not forget it.`}
        if(id==='dream'){c.traits.cruelty=clamp(c.traits.cruelty-0.45);c.traits.warmth=clamp(c.traits.warmth+0.35);deed(c,'woke weeping from a dream and freed the prisoners');reveal(f,0.05);mk.kind+=0.04;return`${cap(cname(c))} woke screaming, then weeping, and that morning opened the prisons.`}return'You left them to their own people.'}},
    temple:{find(){const c=alive().filter(f=>knows(f)>0.35&&f.pop>25);return c.length?[3.5,{f:c.sort((a,b)=>knows(b)-knows(a))[0].id}]:null},
      view({f}){f=S.facs[f];return{title:`A Temple for ${makerWord(f)}`,body:`${cap(FN(f))} have spent a generation raising a temple to you in ${at(f).name}, whom they call ${makerWord(f)}, ${makerGloss()}. On the day it is finished, the whole people gather to see whether you accept it.`,
        opts:[{id:'accept',label:'Accept it, and bless them',hint:'A golden age'},{id:'humble',label:'Tell them to feed their poor instead',hint:'Kindness over glory'},{id:'demand',label:'Demand a greater one',hint:'They will fear you, and work'}]}},
      act({f},id){f=S.facs[f];if(id==='accept'){f.golden=yr();f.values.art=clamp(f.values.art+0.1);f.values.faith=clamp(f.values.faith+0.1);mk.kind+=0.03;reveal(f,0.1);return`Light filled the temple of ${at(f).name}. A golden age began for ${FN(f)}.`}
        if(id==='humble'){f.values.harmony=clamp(f.values.harmony+0.2);fed(f,4);mk.kind+=0.06;return`You told them a full belly honours you more than stone. ${cap(FN(f))} opened their granaries, and their faith turned gentle.`}
        f.values.order=clamp(f.values.order+0.15);f.values.martial=clamp(f.values.martial+0.08);for(const s of facSetts(f))s.resent=Math.min(2,(s.resent||0)+0.3);mk.wrath+=0.08;reveal(f,0.1);return`You were not satisfied. ${cap(FN(f))} tore the temple down and began again, larger, and the people who built it began to hate it.`}},
    knowledge:{find(){const c=alive().filter(f=>f.values.knowledge>0.5&&nextTechs(f,1).length&&f.tech.writing);return c.length?[2.5,{f:c.sort((a,b)=>b.values.knowledge-a.values.knowledge)[0].id}]:null},
      view({f}){f=S.facs[f];const t=nextTechs(f,2);return{title:`The Scholars of the ${f.name}`,body:`In the libraries of ${at(f).name}, scholars of ${FN(f)} are close to understanding ${t.map(k=>TECH[k].n.toLowerCase()).join(' and ')}. They work through the night, and sometimes they look up, as if hoping for help.`,
        opts:[{id:'gift',label:'Give them the answer',hint:'They leap ahead'},{id:'forbid',label:'Confound them',hint:'Some knowledge is dangerous'},{id:'leave',label:'Let them find it themselves',hint:'What is earned is understood'}]}},
      act({f},id){f=S.facs[f];if(id==='gift'){const t=nextTechs(f,2);for(const k of t)grant(f,k);reveal(f,0.06);mk.kind+=0.02;return`The answer arrived whole in a scholar's dream. ${cap(FN(f))} learned ${t.map(k=>TECH[k].n.toLowerCase()).join(' and ')} in a single season.`}
        if(id==='forbid'){f.rp=0;f.values.faith=clamp(f.values.faith+0.08);f.values.knowledge=clamp(f.values.knowledge-0.1);mk.wrath+=0.03;return`Fires broke out in the libraries of ${at(f).name}. The scholars took it as a warning.`}f.values.knowledge=clamp(f.values.knowledge+0.05);return'You let them find it themselves.'}},
    fire:{find(){const c=alive().filter(f=>f.tech.fission||f.tech.bioweapons);return c.length?[5,{f:c[0].id}]:null},
      view({f}){f=S.facs[f];return{title:'Fire That Ends Cities',body:`${cap(FN(f))} have learned ${f.tech.fission?'to split the smallest things and make a fire that ends cities':'to breed plagues in jars'}. Their rulers lie awake deciding when to use it.`,
        opts:[{id:'take',label:'Take the knowledge from them',hint:'Their scholars will forget'},{id:'warn',label:'Show their ruler the world after',hint:'A vision of ash'},{id:'leave',label:'Let them choose',hint:'It is their world'}]}},
      act({f},id){f=S.facs[f];if(id==='take'){for(const k of ['fission','bioweapons','computing','genetics','geoeng','uplift','spaceflight'])delete f.tech[k];if(f.research&&!TECH[f.research.id])f.research=null;mk.wrath+=0.03;reveal(f,0.05);return`One morning every scholar among ${FN(f)} woke unable to remember the work of their lives.`}
        if(id==='warn'){const ru=rulerOf(f);if(ru){ru.traits.cruelty=clamp(ru.traits.cruelty-0.4);ru.traits.paranoia=clamp(ru.traits.paranoia-0.3)}f.cool.nuke=yr()+200;reveal(f,0.08);mk.kind+=0.03;return`The ruler of ${FN(f)} saw the world after the fire: grey, silent, endless. They swore never to use it.`}return'You let them choose.'}},
    lastof:{find(){const c=alive().filter(f=>f.pop>0&&f.pop<9&&f.stats.peak>=35);return c.length?[5,{f:c[0].id}]:null},
      view({f}){f=S.facs[f];return{title:`The Last of the ${f.name}`,body:`Once ${FN(f)} were ${f.stats.peak} strong. Now ${f.pop} are left, huddled in ${at(f).name}. ${knows(f)>0.2?`They pray to ${makerWord(f)} not to let them be forgotten.`:'They tell each other the old stories, so someone will remember.'}`,
        opts:[{id:'save',label:'Save them',hint:'New children, full stores'},{id:'let',label:'Let them pass',hint:'Every people ends'}]}},
      act({f},id){f=S.facs[f];if(id==='save'){const s=at(f);if(s&&s.members){for(let i=0;i<8;i++){const a=newAgent(f,mutate(f.g,f,1),s.x+(R()-.5)*30,s.y+(R()-.5)*30,s);a.age=2+R()*6;s.members.push(a)}s.store+=120}reveal(f,0.3);mk.kind+=0.07;return`That spring, every one of ${FN(f)} bore children. The ${f.name} would go on.`}return`You let ${FN(f)} pass into the stories of others.`}},
    call:{find(){const al=alive();if(al.length>4||yr()<120)return null;return[al.length<=2?5:2.5,{}]},
      view(){return{title:'An Empty World',body:`The world is wide and the living are few: ${alive().map(f=>FN(f)).join(', ')||'no one'}. Beyond the coasts and under the mountains, there is room for more.`,
        opts:[{id:'sea',label:'Call a people up out of the sea',hint:'Strangers with their own gods'},{id:'deep',label:'Wake a people under the mountains',hint:'Pale, patient, many-eyed'},{id:'sky',label:'Bring down a winged people from the peaks',hint:'Light and quick'},{id:'none',label:'Leave the world to those who are here',hint:''}]}},
      act(_,id){if(id==='none')return'You left the world to those already in it.';const f=S.emerge(id);reveal(f,0.25);return`You called, and ${FN(f)} came.`}},
    shape:{find(){const f=S.heroFac();return f&&yr()>60?[1.5,{f:f.id}]:null},
      view({f}){f=S.facs[f];return{title:`The Children of the ${f.name}`,body:`You look at ${FN(f)}: ${bodyDesc(f.g)}. Their bodies are still clay in your hands, if you want them to be.`,
        opts:[{id:'wings',label:'Give their children wings',hint:'Over generations'},{id:'gills',label:'Draw them toward the water',hint:'Over generations'},{id:'minds',label:'Sharpen their minds',hint:'Over generations'},{id:'shell',label:'Harden them for war',hint:'Over generations'}]}},
      act({f},id){f=S.facs[f];const m={wings:['flight',0.07],gills:['aquatic',0.07],minds:['intellect',0.06],shell:['armor',0.07]}[id];f.bias[m[0]]=(f.bias[m[0]]||0)+m[1];if(id==='minds')f.bias.curiosity=(f.bias.curiosity||0)+0.03;if(id==='shell'){f.bias.spikes=(f.bias.spikes||0)+0.04;f.values.martial=clamp(f.values.martial+0.08)}
        return`From then on, the children of ${FN(f)} were born a little ${{wings:'lighter, with flaps of skin between their limbs',gills:'slicker, with slits along their necks',minds:'quieter and more watchful',shell:'harder, with plates along their backs'}[id]}.`}},
  };
  // turning-point scenarios answer the event that ends the age
  const TU={
    split:{types:['schism','revolution','coup'],view(e){const A=S.facs[e.facs[0]],B=e.facs[1]!=null?S.facs[e.facs[1]]:null;if(!B||A.died!=null||B.died!=null)return null;return{title:e.title,body:`${e.text} The age turns on this. Which side, if any, do you stand behind?`,
        opts:[{id:'old',label:`Stand with the ${A.name}`,hint:'Restore the old order'},{id:'new',label:`Stand with the ${B.name}`,hint:'Let the new thing live'},{id:'none',label:'Let them settle it',hint:''}],ctx:{a:A.id,b:B.id}}},
      act(c,id){const A=S.facs[c.a],B=S.facs[c.b];if(id==='none')return'You let them settle it.';const W=id==='old'?A:B,L=id==='old'?B:A;soldiersDie(L,0.3,'struck down by the sky');for(const s of facSetts(W))s.unrest=Math.max(0,s.unrest-0.3);W.golden=W.golden||yr();reveal(W,0.12);reveal(L,0.08);mk.wrath+=0.03;return`The heavens took the side of ${FN(W)}, and ${FN(L)} would never forgive it.`}},
    peace:{types:['peace'],view(e){const A=S.facs[e.facs[0]],B=S.facs[e.facs[1]];if(!A||!B||A.died!=null||B.died!=null)return null;return{title:e.title,body:`${e.text} Peace is fragile. What do you give it?`,
        opts:[{id:'bless',label:'Bless the peace',hint:'Trade and marriage between them'},{id:'grudge',label:'Let the grudges fester',hint:'The next war is already coming'},{id:'none',label:'Nothing',hint:''}],ctx:{a:A.id,b:B.id}}},
      act(c,id){const A=S.facs[c.a],B=S.facs[c.b];if(id==='bless'){const r=rel(A.id,B.id);r.trade=true;note(A.id,B.id,'favor',1,'the blessed peace');note(B.id,A.id,'favor',1,'the blessed peace');mem(A.id,B.id).grudge*=0.4;mem(B.id,A.id).grudge*=0.4;mk.kind+=0.05;return`Roads opened between ${FN(A)} and ${FN(B)}, and caravans began to travel them.`}
        if(id==='grudge'){note(A.id,B.id,'grudge',1,'the unfinished war');note(B.id,A.id,'grudge',1,'the unfinished war');mk.wrath+=0.04;return`Both sides remembered every death, and taught their children to.`}return'You let the peace find its own way.'}},
    fall:{types:['conquest','razed'],view(e){const A=S.facs[e.facs[0]],B=e.facs[1]!=null?S.facs[e.facs[1]]:null;if(!B||A.died!=null||B.died!=null)return null;return{title:e.title,body:`${e.text} The conquered look to the sky.`,
        opts:[{id:'avenge',label:`Punish the ${A.name}`,hint:'Sickness in the conquerors\' camps'},{id:'mercy',label:'Soften the conquerors\' hearts',hint:'Mercy for the defeated'},{id:'none',label:'Nothing',hint:''}],ctx:{a:A.id,b:B.id}}},
      act(c,id){const A=S.facs[c.a],B=S.facs[c.b];if(id==='avenge'){plague(A,'A sickness follows the conquerors home.');reveal(B,0.12);mk.wrath+=0.07;return`Sickness followed ${FN(A)} home from the war.`}if(id==='mercy'){const ru=rulerOf(A);if(ru)ru.traits.cruelty=clamp(ru.traits.cruelty-0.3);for(const s of facSetts(A))if(s.owners&&s.owners.includes(B.id))s.unrest=Math.max(0,s.unrest-0.4);mk.kind+=0.05;return`${cap(FN(A))} spared the defeated, and the conquered towns slowly settled.`}return'You did nothing.'}},
    gone:{types:['extinct'],view(e){const f=S.facs[e.facs[0]];return{title:e.title,body:`${e.text} Their bones lie in the dust of ${f.name} country.`,
        opts:[{id:'raise',label:'Raise a new people from their bones',hint:'Like them, but not them'},{id:'remember',label:'Make the others remember them',hint:'A grief that lasts'},{id:'none',label:'Let them go',hint:''}],ctx:{f:f.id}}},
      act(c,id){const f=S.facs[c.f];if(id==='raise'){const g={...f.g,hue:(f.g.hue+40)%360};const nf=spawnPeople(g,14,[`You raised them from the bones of the ${f.name}.`],'The % Rise from the Bones',`Where the ${f.name} died, a new people opens its eyes: the %. They dream of a life they never lived.`);reveal(nf,0.3);mk.kind+=0.04;return`From the bones of ${FN(f)}, you made ${FN(nf)}.`}
        if(id==='remember'){for(const o of alive()){o.values.harmony=clamp(o.values.harmony+0.06);o.values.faith=clamp(o.values.faith+0.04)}return`Every people sang of ${FN(f)} at the turning of the year, for as long as they lived.`}return`You let ${FN(f)} go.`}},
    any:{types:null,view(){const al=alive().slice().sort((a,b)=>b.pop-a.pop);if(!al.length)return null;const top=al[0],low=al[al.length-1];return{title:'The Turning of an Age',body:`An age is ending. ${cap(FN(top))} stand tallest${al.length>1?`; ${FN(low)} are the smallest and the most afraid`:''}. Before the next begins, what do you leave the world?`,
        opts:[{id:'gift',label:al.length>1?`A golden age for the ${low.name}`:`A golden age for the ${top.name}`,hint:'Beauty, peace, art'},{id:'trial',label:`A trial for the ${top.name}`,hint:'Pride is tested'},{id:'none',label:'Nothing. Let the next age come.',hint:''}],ctx:{top:top.id,low:low.id}}},
      act(c,id){const top=S.facs[c.top],low=S.facs[c.low];if(id==='gift'){const f=low.died==null?low:top;f.golden=yr();fed(f,4);mk.kind+=0.04;reveal(f,0.05);return`A golden age began among ${FN(f)}.`}if(id==='trial'){const k=pick(['plague','famine','titan']);if(k==='plague')plague(top,'A trial sent from the sky.');else if(k==='famine'){S.world.foodMult=0.6;S.world.foodUntil=S.year+15}else S.spawnTitan(top.id,'Sent as a trial');mk.wrath+=0.06;reveal(top,0.08);return`A trial came for ${FN(top)}: ${k==='plague'?'sickness':k==='famine'?'failing harvests':'a giant out of the earth'}.`}return'You let the next age come.'}},
  };
  // what the Maker is asked, and when
  S.findPetition=()=>{const c=[];mk.last=mk.last||{};for(const k in SC){if(mk.recent.slice(-2).includes(k))continue;if(mk.last[k]!=null&&yr()-mk.last[k]<({war:50,hunger:60,cult:40,prophet:40,shape:200}[k]||130))continue;const r=SC[k].find();if(r)c.push([r[0]*(0.6+R()*0.8),k,r[1]])}if(!c.length)return null;c.sort((a,b)=>b[0]-a[0]);return{kind:'petition',key:c[0][1],ctx:c[0][2]}};
  S.findTurning=(evId)=>{const e=S.events.find(x=>x.id===evId);if(e)for(const k in TU){const T=TU[k];if(T.types&&T.types.includes(e.type)){const v=T.view(e);if(v)return{kind:'turning',key:k,ev:e.id,ctx:v.ctx}}}const v=TU.any.view();return v?{kind:'turning',key:'any',ev:e?e.id:null,ctx:v.ctx}:null};
  S.choiceView=ch=>{if(ch.kind==='petition')return SC[ch.key].view(ch.ctx);const T=TU[ch.key];if(ch.key==='any')return TU.any.view();const e=S.events.find(x=>x.id===ch.ev);return e?T.view(e):TU.any.view()};
  S.applyChoice=(ch,id)=>{let out;try{out=ch.kind==='petition'?SC[ch.key].act(ch.ctx,id):TU[ch.key].act(ch.ctx,id)}catch(err){out='The world shifted, a little.'}
    const v=S.choiceView(ch)||{title:'A Choice',opts:[]};const o=(v.opts||[]).find(x=>x.id===id)||{label:id};mk.count++;mk.recent.push(ch.key);mk.last=mk.last||{};mk.last[ch.key]=yr();if(mk.recent.length>8)mk.recent.shift();mk.deeds.push({yr:yr(),title:v.title,choice:o.label,out});
    const facs=Object.values(ch.ctx||{}).filter(x=>typeof x==='number'&&S.facs[x]&&ch.key!=='prophet'&&ch.key!=='cult').map(x=>S.facs[x]).filter((x,i,a)=>a.indexOf(x)===i);if(ch.ctx&&ch.ctx.m!=null)facs.push(S.facs[S.moves[ch.ctx.m].fac]);
    const p=facs[0]?at(facs[0]):{x:W/2,y:H/2};log('choice',3,v.title,out,p.x,p.y,facs.length?facs:alive().slice(0,1),{why:[`The Maker chose: ${o.label.toLowerCase()}.`],maker:true,choice:o.label});return out};

  // ---------- the Maker's power, hands-on actions, prayers, and voices ----------
  mk.power=mk.power==null?12:mk.power;mk.maxPower=mk.maxPower||40;
  S.makerYear=()=>{let reg=0.35,cap=40;for(const f of alive()){const k=knows(f);reg+=f.pop*k*(0.3+f.values.faith)*0.012;cap+=f.pop*k*0.6}
    mk.maxPower=Math.round(Math.min(400,cap));mk.power=Math.min(mk.maxPower,mk.power+reg);mk.regen=reg};
  const MTIER=f=>{const k=knows(f);return k>=0.45?2:k>=0.2?1:0};
  const MTIERW=['unknown to them','a rumour to them','believed in'];
  // richer answers when believers call on you
  SC.war.view=function({a,b}){const A=S.facs[a],B=S.facs[b];const r=rel(a,b);const ru=rulerOf(A);const nm=addressed(A);const metal=nextTechs(A,6).find(k=>['bronze','iron','gunpowder'].includes(k));
    return{title:`${cap(FN(A))} Pray for Victory`,body:`${cap(FN(B))} have come against ${FN(A)}${r.goal&&GOALTXT[r.goal]?' '+GOALTXT[r.goal]:''}. ${ru?`${cap(cname(ru))} kneels in the temple and begs ${nm||'whoever made them'} for victory.`:'Their priests beg for victory.'} ${A.pop>B.pop*1.5?`They are far stronger already.`:B.pop>A.pop*1.5?`They are badly outnumbered.`:'The armies are evenly matched.'}`,
      opts:[{id:'a',label:`Break the army of the ${B.name}`,hint:'A storm out of a clear sky',cost:25},{id:'champ',label:'Send a champion to fight beside them',hint:'One of their own becomes a legend',cost:14}].concat(metal?[{id:'arm',label:`Teach them ${TECH[metal].n.toLowerCase()}`,hint:'Better weapons, for good',cost:10,t:metal}]:[]).concat([{id:'peace',label:'Command both sides to make peace',hint:knows(A)+knows(B)>0.6?'They know your voice':'The enemy may not listen',cost:8},{id:'b',label:`Turn against them: give the ${B.name} victory`,hint:'Your believers will feel betrayed',cost:25},{id:'silent',label:'Refuse them',hint:'Their faith will waver',cost:0}])}};
  const warAct=SC.war.act;SC.war.act=function(c,id){const A=S.facs[c.a],B=S.facs[c.b];if(id==='champ'){const m=S.agents.filter(x=>!x.dead&&x.fac===A.id&&!x.titan&&x.char==null).sort((x,y)=>y.dmg*y.maxhp-x.dmg*x.maxhp)[0];if(!m)return'No one was left to raise up.';heroize(m);m.maxhp*=1.6;m.hp=m.maxhp;m.dmg*=1.5;reveal(A,0.1);return`A soldier of ${FN(A)} walked out of the temple glowing, and no blade would cut them.`}
    if(id==='arm'){const t=nextTechs(A,6).find(k=>['bronze','iron','gunpowder'].includes(k));if(t)grant(A,t);reveal(A,0.06);return t?`The smiths of ${FN(A)} dreamed the same dream, and woke knowing ${TECH[t].n.toLowerCase()}.`:'The smiths dreamed of nothing.'}
    if(id==='silent'){A.values.faith=clamp(A.values.faith-0.1);A.knows=Math.max(0,knows(A)-0.05);return`No answer came. Some of ${FN(A)} began to say there was no one listening.`}
    if(id==='b'){A.values.faith=clamp(A.values.faith-0.2);return warAct.call(this,c,'b')}return warAct.call(this,c,id)};
  SC.tyrant.view=function({f,c}){f=S.facs[f];c=S.chars[c];const holy=knows(f)>=0.2;return{title:`The Pride of ${cap(cname(c))}`,body:`${cap(cname(c))} rules ${FN(f)} by fear${c.deeds.slice(-1)[0]?`, and lately ${c.deeds.slice(-1)[0].txt}`:''}. ${holy?`The faithful pray to ${makerWord(f)} for deliverance; ${cap(cname(c))} prays only to be stronger.`:'In the towns, people stop speaking when soldiers pass.'}`,
      opts:[{id:'strong',label:'Strengthen them',hint:'Wealth, loyal soldiers, a firm grip',cost:12},{id:'inspire',label:'Inspire them to greatness',hint:'Cleverer, and hungrier for glory',cost:10},{id:'proph',label:'Send a prophet to stand beside them',hint:'A holy voice at court, in your name',cost:15},{id:'dream',label:'Send a dream of their victims',hint:'They may change',cost:4},{id:'revoke',label:'Revoke their crown',hint:holy?'The people will believe the sign':'Few will understand the sign',cost:20},{id:'strike',label:'Strike them down',hint:'A sudden, visible death',cost:30},{id:'leave',label:'Leave them to their people',hint:'Tyrants make rebels',cost:0}]}};
  const tyAct=SC.tyrant.act;SC.tyrant.act=function(x,id){const f=S.facs[x.f],c=S.chars[x.c];if(!c.alive)return'The ruler was already dead.';
    if(id==='strong'){f.treasury+=60;for(const s of facSetts(f)){s.unrest=Math.max(0,s.unrest-0.3);s.store+=s.members.length*3}c.traits.ambition=clamp(c.traits.ambition+0.15);c.loyalty=1;for(const o of S.chars)if(o.fac===f.id&&o.alive)o.loyalty=clamp(o.loyalty+0.2);reveal(f,0.05);mk.wrath+=0.03;deed(c,'was strengthened by the heavens');return`Gold turned up in the treasuries of ${FN(f)} and the generals swore new oaths. ${cap(cname(c))} has never been stronger.`}
    if(id==='inspire'){c.traits.genius=clamp(c.traits.genius+0.35);c.traits.ambition=clamp(c.traits.ambition+0.25);for(const k of nextTechs(f,1))grant(f,k);deed(c,'woke with a plan for greatness');reveal(f,0.04);return`${cap(cname(c))} woke from a long fever with plans for roads, laws and conquests.`}
    if(id==='proph'){const p=makeProphetIn(f,capitalOf(f),null,`Sent to stand beside ${cname(c)}.`);reveal(f,0.15);return p?`A stranger walked into the court of ${cap(cname(c))} and said: I am sent. ${cap(cname(p))} has stood at the throne's right hand ever since.`:'No one came.'}
    if(id==='revoke'){return revokeRuler(f,c)}return tyAct.call(this,x,id)};
  const OPTCOST={prayer:{answer:6,sign:3},hunger:{rain:10,teach:8},plague:{cure:12,faithful:8},cult:{expose:8,empower:10},prophet:{confirm:10,deny:5},temple:{accept:6,humble:4,demand:4},knowledge:{gift:12,forbid:6},fire:{take:25,warn:10},lastof:{save:20},call:{sea:40,deep:40,sky:40},shape:{wings:15,gills:15,minds:15,shell:15},split:{old:15,new:15},peace:{bless:8,grudge:5},fall:{avenge:20,mercy:8},gone:{raise:45,remember:3},any:{gift:12,trial:15}};
  const viewBase=S.choiceView;S.choiceView=ch=>{const v=viewBase(ch);if(!v)return v;const cm=OPTCOST[ch.key]||{};for(const o of v.opts)if(o.cost==null)o.cost=cm[o.id]||0;return v};
  const applyBase=S.applyChoice;S.applyChoice=(ch,id)=>{const v=S.choiceView(ch);const o=v&&v.opts.find(x=>x.id===id);if(o&&o.cost){if(mk.power<o.cost)return'You do not have the strength for that.';mk.power-=o.cost}return applyBase(ch,id)};
  // ---- helpers for raising and casting down ----
  function makerFaithOf(f){if(f.state!=null&&S.faiths[f.state].maker)return S.faiths[f.state];let best=null,bv=0;for(const k in f.belief||{}){const F=S.faiths[k];if(F&&F.maker&&f.belief[k]>bv){bv=f.belief[k];best=F}}return best}
  S.makerFaithOf=makerFaithOf;
  function makeProphetIn(f,s,agent,why){s=s||capitalOf(f);const a=agent||(s?pickCourtAgent(f,s):null);if(!a)return null;const c=a.char!=null?S.chars[a.char]:newChar(f,'prophet',a);if(c.role!=='ruler')c.role='prophet';c.traits.piety=clamp(Math.max(c.traits.piety,0.85));c.settId=s?s.id:null;c.makerProphet=true;
    let F=makerFaithOf(f);if(!F){F=foundFaith(f,c,f.state!=null?S.faiths[f.state]:null,why||'The Maker chose a prophet.',{maker:true,under:f.state!=null,share:0.12})}else shiftBelief(f,F.id,(f.belief[F.id]||0)+0.06);
    c.faith=F.id;if(f.prophet==null||!S.chars[f.prophet]||!S.chars[f.prophet].alive)f.prophet=c.id;deed(c,`was chosen as a prophet of ${F.title}`);reveal(f,0.12);return c}
  function revokeRuler(f,c){const a=charAgent(c);const believe=knows(f);c.role='deposed';c.deposed=yr();f.ruler=null;deed(c,'lost the throne when the heavens turned against them');if(a)a.role=null;reveal(f,0.2);
    if(believe<0.2&&R()<0.5){f.ruler=c.id;c.role='ruler';return`A sign blazed over ${at(f).name}, but ${FN(f)} did not understand it. ${cap(cname(c))} still rules.`}
    ensureCourt(f);const nr=rulerOf(f);return`Every bell in ${at(f).name} rang by itself at midnight. By morning ${cap(cname(c))} had been driven from the throne${nr?`, and ${cap(cname(nr))} sat in it`:''}.`}
  // ---- what you can do with your own hand ----
  const tgtFac=t=>t.s!=null&&settById(t.s)?S.facs[settById(t.s).fac]:t.c!=null?S.facs[S.chars[t.c].fac]:null;
  const tgtChar=t=>t.c!=null?S.chars[t.c]:null;
  const MACTS=[
    // the town
    {id:'sign',on:'town',tier:0,cost:3,label:'Send a sign in the sky',desc:'Lights and omens. They wonder who sent them.',run(t,f,s){reveal(f,0.07);f.values.faith=clamp(f.values.faith+0.05);S.pulses.push({x:s.x,y:s.y,h:50,t:S.year,big:1});return`Lights crossed the sky over ${s.name} for three nights.`}},
    {id:'harvest',on:'town',tier:0,cost:8,label:'Bless the harvest',desc:'Full granaries this year.',run(t,f,s){s.store+=s.members.length*9+20;reveal(f,0.03);mk.kind+=0.02;return`The fields around ${s.name} gave twice what anyone had planted.`}},
    {id:'blight',on:'town',tier:0,cost:8,label:'Wither the fields',desc:'Hunger, and anger at the throne.',run(t,f,s){s.store*=0.25;s.unrest=Math.min(1,s.unrest+0.25);mk.wrath+=0.02;return`The crops of ${s.name} rotted in the ground.`}},
    {id:'calm',on:'town',tier:1,cost:5,label:'Calm the streets',desc:'Anger cools; loyalty returns.',run(t,f,s){s.unrest=Math.max(0,s.unrest-0.45);s.resent=Math.max(0,(s.resent||0)-0.5);mk.kind+=0.01;return`A strange peace settled over ${s.name}.`}},
    {id:'stir',on:'town',tier:1,cost:5,label:'Stir their anger',desc:'Unrest, and maybe revolt.',run(t,f,s){s.unrest=Math.min(1,s.unrest+0.45);s.resent=Math.min(2,(s.resent||0)+0.6);mk.wrath+=0.01;return`Every grievance in ${s.name} felt fresh again.`}},
    {id:'heal',on:'town',tier:1,cost:10,label:'Heal the sick',desc:'Wounds close, fevers break.',run(t,f,s){for(const a of s.members)if(!a.dead){a.hp=a.maxhp;a.energy=Math.max(a.energy,60)}reveal(f,0.06);mk.kind+=0.03;return`Every sick bed in ${s.name} was empty by morning.`}},
    {id:'wonder',on:'town',tier:1,cost:14,label:'Fill them with wonder',desc:'Art, music, a golden age if they believe.',run(t,f,s){f.values.art=clamp(f.values.art+0.12);if(MTIER(f)>=1&&!f.golden)f.golden=yr();reveal(f,0.05);return`For a season, everyone in ${s.name} painted, sang and built things no one needed.`}},
    {id:'plague',on:'town',tier:2,cost:25,label:'Send a plague',desc:'Death, and fear of you.',run(t,f,s){plague(f,`A sickness begins in ${s.name}.`);reveal(f,0.1);mk.wrath+=0.08;return`A plague began in ${s.name}.`}},
    {id:'quake',on:'town',tier:2,cost:30,label:'Shake the earth',desc:'Buildings fall; the proud are humbled.',run(t,f,s){const n=Math.ceil(s.bld.length*0.4);s.bld.splice(0,n);for(const a of s.members)if(!a.dead&&R()<0.15)die(a,'earthquake');s.unrest=Math.min(1,s.unrest+0.2);reveal(f,0.12);mk.wrath+=0.08;return`The earth opened under ${s.name}. ${n} buildings fell.`}},
    // any person
    {id:'whisper',on:'person',tier:0,cost:2,label:'Whisper to them',desc:'A thought that feels like their own.',choices:[['peace','toward peace'],['war','toward war'],['faith','toward faith'],['learning','toward learning']],run(t,f,s,c,opt){const T=c.traits;if(opt==='peace'){T.warmth=clamp(T.warmth+0.15);T.cruelty=clamp(T.cruelty-0.1)}else if(opt==='war'){T.ambition=clamp(T.ambition+0.15);T.cruelty=clamp(T.cruelty+0.08)}else if(opt==='faith')T.piety=clamp(T.piety+0.2);else T.genius=clamp(T.genius+0.15);return`${cap(cname(c))} found themselves thinking ${opt==='learning'?'about how things work':'about '+opt}, and could not stop.`}},
    {id:'dream',on:'person',tier:0,cost:4,label:'Send them a dream',desc:'A vision that marks them. They will tell others.',run(t,f,s,c){c.traits.piety=clamp(c.traits.piety+0.15);reveal(f,0.04);deed(c,'dreamed of the one who made the world');return`${cap(cname(c))} dreamed of a face made of stars, and told everyone.`}},
    {id:'harden',on:'person',tier:1,cost:6,label:'Harden their heart',desc:'Crueller, prouder, more suspicious.',run(t,f,s,c){c.traits.cruelty=clamp(c.traits.cruelty+0.3);c.traits.paranoia=clamp(c.traits.paranoia+0.25);c.traits.warmth=clamp(c.traits.warmth-0.25);mk.wrath+=0.03;return`Something in ${cap(cname(c))} went cold.`}},
    {id:'soften',on:'person',tier:1,cost:6,label:'Soften their heart',desc:'Kinder, more forgiving.',run(t,f,s,c){c.traits.warmth=clamp(c.traits.warmth+0.3);c.traits.cruelty=clamp(c.traits.cruelty-0.3);mk.kind+=0.03;return`${cap(cname(c))} wept, for no reason anyone could see, and was gentler afterwards.`}},
    {id:'inspire',on:'person',tier:1,cost:10,label:'Inspire genius',desc:'A leap in what their people know.',run(t,f,s,c){c.traits.genius=clamp(c.traits.genius+0.3);const k=nextTechs(f,1)[0];if(k)grant(f,k);deed(c,k?`discovered ${TECH[k].n.toLowerCase()}`:'had a great idea');return k?`${cap(cname(c))} woke with ${TECH[k].n.toLowerCase()} whole in their head.`:`${cap(cname(c))} had a brilliant idea that no one could use yet.`}},
    {id:'bless',on:'person',tier:1,cost:8,label:'Bless them with strength',desc:'Health, long life, a firmer grip.',run(t,f,s,c){const a=charAgent(c);if(a){a.maxhp*=1.4;a.hp=a.maxhp;a.life+=25}if(c.role==='ruler')for(const x of facSetts(f))x.unrest=Math.max(0,x.unrest-0.15);c.loyalty=1;return`${cap(cname(c))} stopped ageing, people said, and never fell ill again.`}},
    {id:'champion',on:'person',tier:1,cost:14,label:'Make them a champion',desc:'A legend in battle.',ok:c=>c.role!=='ruler'&&!!charAgent(c),run(t,f,s,c){const a=charAgent(c);if(!a)return'Nothing happened.';a.hero=1;a.maxhp*=1.8;a.hp=a.maxhp;a.dmg*=1.6;c.role=c.role==='prophet'?c.role:'champion';if(f.general==null||!S.chars[f.general]||!S.chars[f.general].alive)f.general=c.id;deed(c,'was made a champion by the heavens');return`${cap(cname(c))} came back from the hills taller, and no blade would cut them.`}},
    {id:'prophet',on:'person',tier:1,cost:15,label:'Make them your prophet',desc:'They will speak for you. You can talk with them.',ok:c=>c.role!=='ruler'&&!c.makerProphet,run(t,f,s,c){const a=charAgent(c);makeProphetIn(f,s,a,`The Maker spoke to ${cname(c)}.`);return`You spoke to ${cap(cname(c))} directly. They began to preach the next morning.`}},
    {id:'madness',on:'person',tier:2,cost:12,label:'Cloud their mind',desc:'Visions, paranoia, ruin.',run(t,f,s,c){c.traits.paranoia=1;c.traits.genius=clamp(c.traits.genius-0.3);c.traits.cruelty=clamp(c.traits.cruelty+0.2);deed(c,'began to hear voices');mk.wrath+=0.05;return`${cap(cname(c))} began to hear voices at night, and to trust no one.`}},
    {id:'revoke',on:'ruler',tier:2,cost:20,label:'Revoke their crown',desc:'The people see a sign and turn on them.',run(t,f,s,c){return revokeRuler(f,c)}},
    {id:'strike',on:'person',tier:2,cost:30,label:'Strike them down',desc:'Lightning from a clear sky.',run(t,f,s,c){const a=charAgent(c);reveal(f,0.25);mk.wrath+=0.1;deed(c,'was struck down by the sky');if(a)die(a,'lightning');charDeath(c,'struck by lightning');return`Lightning came down out of a clear sky and killed ${cap(cname(c))} where they stood.`}},
  ];
  S.townInfo=sid=>{const s=settById(sid);if(!s)return null;const f=S.facs[s.fac];const ru=rulerOf(f);const cs=capitalOf(f);const people=[];
    if(ru&&ru.alive&&cs===s)people.push({c:ru.id,role:rulerTitle(f)});if(s.governor!=null&&S.chars[s.governor]&&S.chars[s.governor].alive)people.push({c:s.governor,role:'governor'});
    for(const c of S.chars){if(!c.alive||c.fac!==f.id||people.some(p=>p.c===c.id))continue;const a=charAgent(c);const here=c.settId===s.id||(a&&a.home===s.id);if(!here)continue;if(['prophet','cult leader','champion','general','heir'].includes(c.role)||c.makerProphet)people.push({c:c.id,role:c.makerProphet?'your prophet':c.role})}
    const sh={};for(const k in f.belief||{})sh[k]=f.belief[k];const faiths=Object.keys(sh).map(k=>({title:S.faiths[k].title,share:Math.round(sh[k]*100),maker:!!S.faiths[k].maker,cult:!!S.faiths[k].cult})).filter(x=>x.share>=3).sort((a,b)=>b.share-a.share);
    return{s:s.id,name:s.name,fac:f.id,people:people.slice(0,6),faiths,knows:knows(f),tier:MTIER(f),tierWord:MTIERW[MTIER(f)],unrest:s.unrest,pop:s.members.length,word:makerWord(f)}};
  S.crowdPerson=sid=>{const s=settById(sid);if(!s)return null;const f=S.facs[s.fac];const m=s.members.filter(a=>!a.dead&&!a.titan&&a.age>6);if(!m.length)return null;const a=m.find(x=>x.char!=null&&S.chars[x.char].role==='commoner')||m[Math.floor(R()*m.length)];if(a.char!=null)return a.char;const c=newChar(f,'commoner',a);a.role=a.role==='court'?null:a.role;c.settId=s.id;return c.id};
  S.actionsFor=t=>{const s=settById(t.s);if(!s)return[];const f=S.facs[s.fac];const c=tgtChar(t);const tier=MTIER(f);const out=[];
    for(const x of MACTS){if(x.on==='town'&&c)continue;if(x.on!=='town'&&!c)continue;if(x.on==='ruler'&&(!c||c.role!=='ruler'))continue;if(x.ok&&c&&!x.ok(c))continue;
      const why=tier<x.tier?`Needs them to see you as ${MTIERW[x.tier].replace(' to them','')}`:mk.power<x.cost?'Not enough power':'';out.push({id:x.id,label:x.label,desc:x.desc,cost:x.cost,ok:!why,why,choices:x.choices||null})}return out};
  S.doAction=(t,id,opt)=>{const x=MACTS.find(a=>a.id===id);const s=settById(t.s);if(!x||!s)return null;const f=S.facs[s.fac];const c=tgtChar(t);if(MTIER(f)<x.tier||mk.power<x.cost)return null;mk.power-=x.cost;
    let out;try{out=x.run(t,f,s,c,opt)}catch(e){console.warn(e);out='The world shifted, a little.'}mk.count++;
    const title=`${x.label}${c?`: ${cap(cname(c))}`:`: ${s.name}`}`;mk.deeds.push({yr:yr(),title,choice:x.label+(opt?` (${opt})`:''),out});
    log('act',x.cost>=14?3:x.cost>=6?2:1,c?`${cap(cname(c))} and the Hand of the Maker`:`The Hand of the Maker over ${s.name}`,out,s.x,s.y,[f],{why:[`The Maker chose to ${mlower(x.label)}${opt?' ('+opt+')':''}.`],maker:true,act:id,char:c?c.id:null,big:x.cost>=25});return out};
  const mlower=t=>t.charAt(0).toLowerCase()+t.slice(1);
  // ---- prayers: believers call on you only when something happens to them ----
  mk.asked=mk.asked||{};mk.lastCall=mk.lastCall||-99;
  S.findCall=()=>{const Y=yr();if(Y-mk.lastCall<18)return null;const recent=S.events.slice(-50).filter(e=>Y-e.yr<=2);const cands=[];
    for(const f of alive()){const k=knows(f);const fa=f.lastCall==null?-99:f.lastCall;if(Y-fa<35)continue;
      if(k<0.08){if(!f.askedDark&&(f.state!=null||f.tech.speech)&&Y-f.born>25&&R()<0.03)cands.push([3,{kind:'petition',key:'prayer',ctx:{f:f.id}},f]);continue}
      if(k<0.2)continue;const p=0.12+k*0.55;
      for(const e of recent){if(mk.asked[e.id]||!e.facs.includes(f.id))continue;let ch=null;
        if((e.type==='war'||e.type==='betrayal')&&e.facs[1]===f.id&&rel(e.facs[0],f.id).war)ch={key:'war',ctx:{a:f.id,b:e.facs[0]}};
        else if(e.type==='plague'&&e.facs[0]===f.id)ch={key:'plague',ctx:{f:f.id}};
        else if((e.type==='conquest'||e.type==='razed')&&e.facs[1]===f.id&&S.facs[e.facs[0]].died==null)ch={kind:'turning',key:'fall',ev:e.id,ctx:{a:e.facs[0],b:f.id}};
        else if(e.type==='cult'&&e.facs[0]===f.id&&e.data.move!=null)ch={key:'cult',ctx:{m:e.data.move}};
        else if(e.type==='prophet'&&e.data.move!=null&&S.faiths[e.data.faith]&&S.faiths[e.data.faith].maker)ch={key:'prophet',ctx:{m:e.data.move}};
        else if((e.type==='schism'||e.type==='revolution')&&e.facs.length>=2&&S.facs[e.facs[1]].died==null)ch={kind:'turning',key:'split',ev:e.id,ctx:{a:e.facs[0],b:e.facs[1]}};
        else if(e.type==='uprising'&&e.facs[0]===f.id){const ru=rulerOf(f);if(ru&&ru.traits.cruelty>0.55)ch={key:'tyrant',ctx:{f:f.id,c:ru.id}}}
        if(ch&&R()<p){mk.asked[e.id]=1;cands.push([4+k*3,{kind:ch.kind||'petition',...ch},f])}}
      if(k>=0.2){const ss=facSetts(f);if(ss.length&&ss.reduce((t,s)=>t+s.store,0)<ss.reduce((t,s)=>t+s.members.length,0)*0.5&&R()<p*0.12)cands.push([3,{kind:'petition',key:'hunger',ctx:{f:f.id}},f])}
      if(k>=0.5&&f.pop>25&&R()<0.006)cands.push([2,{kind:'petition',key:'temple',ctx:{f:f.id}},f]);
      if(f.pop>0&&f.pop<9&&f.stats.peak>=35&&k>=0.15&&R()<0.2)cands.push([5,{kind:'petition',key:'lastof',ctx:{f:f.id}},f])}
    if(!cands.length)return null;cands.sort((a,b)=>b[0]-a[0]);const [,ch,f]=cands[0];if(ch.key==='prayer')f.askedDark=1;f.lastCall=Y;mk.lastCall=Y;return ch};
  // ---- voices: the religious leaders who worship you ----
  S.contacts=()=>{const out=[];const seen=new Set();const add=(c,role,F)=>{if(!c||!c.alive||seen.has(c.id))return;seen.add(c.id);out.push({c:c.id,role,faith:F?F.id:null})};
    for(const F of S.faiths){if(!F.maker)continue;const fo=F.founder!=null?S.chars[F.founder]:null;if(fo)add(fo,fo.role==='ruler'?'priest-king':'founder of '+F.title,F)}
    for(const c of S.chars)if(c.alive&&c.makerProphet)add(c,c.role==='ruler'?'priest-king':'prophet',S.faiths[c.faith]);
    for(const f of alive()){const F=f.state!=null?S.faiths[f.state]:null;if(!F||!F.maker)continue;const ru=rulerOf(f);if(ru&&(['theocracy','cult'].includes(f.gov)||ru.traits.piety>0.6))add(ru,'priest-king',F);if(f.prophet!=null)add(S.chars[f.prophet],'prophet',F)}
    return out};
  S.contactBrief=cid=>{const c=S.chars[cid];const f=S.facs[c.fac];const F=c.faith!=null?S.faiths[c.faith]:makerFaithOf(f);const ru=rulerOf(f);const L=S.langs[f.lang];
    const wars=alive().filter(o=>o!==f&&rel(f.id,o.id).war).map(o=>o.name);const nb=alive().filter(o=>o!==f&&borderDist(f,o)<600).map(o=>`the ${o.name} (${o.state!=null?S.faiths[o.state].title:'no faith'}${rel(f.id,o.id).war?', AT WAR':rel(f.id,o.id).ally?', allies':''})`);
    return{name:cname(c),role:c.role,traits:traitWords(c),piety:c.traits.piety,people:f.name,body:bodyDesc(f.g),gov:GOVS[f.gov].label,ruler:ru?cname(ru):null,isRuler:f.ruler===c.id,faith:F?F.title:null,gods:F?F.gods.map(g=>`${g.name}, ${g.gloss}`):[],tenets:F?F.tenets.map(t=>TENETS[t].t):[],writings:F&&F.writings?F.writings.slice(-4).map(w=>w.text):[],
      word:makerWord(f),standing:S.makerStanding().label,kind:mk.kind,wrath:mk.wrath,speech:L.stage,wars,neighbours:nb,share:F?Math.round(((f.belief||{})[F.id]||0)*100):0,
      recent:S.events.filter(e=>e.facs.includes(f.id)&&e.imp>=2).slice(-8).map(e=>`${e.yr}: ${e.title}`),deeds:c.deeds.slice(-5).map(d=>`${d.yr}: ${d.txt}`),year:yr()}};
  const DECREE_VALUES=['martial','faith','art','trade','knowledge','order','harmony'];
  S.applyDecrees=(cid,acts,said)=>{const c=S.chars[cid];if(!c||!c.alive)return[];const f=S.facs[c.fac];const F=c.faith!=null?S.faiths[c.faith]:makerFaithOf(f);const ru=rulerOf(f);const isRuler=f.ruler===c.id;const done=[];const at0=at(f);
    const obey=clamp(0.35+c.traits.piety*0.6+(isRuler?0.1:0));c.convoN=(c.convoN||0)+1;reveal(f,0.02);
    for(const x of (acts||[]).slice(0,3)){if(!x||!x.type)continue;const need=['war','peace','gov','persecute'].includes(x.type)?obey:Math.max(obey,0.9);if(R()>need&&x.type!=='scripture'){done.push(`${cap(cname(c))} hesitated, and did not ${x.type==='war'?'go to war':x.type==='peace'?'make peace':'obey'}.`);continue}
      const tgt=x.target?alive().find(o=>o.name.toLowerCase()===String(x.target).toLowerCase().replace(/^the /,'')):null;
      if(x.type==='values'&&x.values){for(const k of DECREE_VALUES)if(isFinite(+x.values[k]))f.values[k]=clamp(f.values[k]+clamp(+x.values[k],-0.2,0.2));done.push(`${cap(FN(f))} take the words to heart.`)}
      else if(x.type==='war'&&tgt&&(isRuler||ru)&&tgt!==f&&!rel(f.id,tgt.id).war){if(isRuler||R()<0.5){declareWar(f,tgt,'holy',[`${cap(cname(c))} said the Maker commanded it.`]);done.push(`${cap(FN(f))} march on ${FN(tgt)}.`)}else done.push(`The throne would not go to war on a prophet's word.`)}
      else if(x.type==='peace'&&tgt&&rel(f.id,tgt.id).war){makePeace(f,tgt,[`${cap(cname(c))} carried the Maker's command for peace.`]);done.push(`Peace with ${FN(tgt)}.`)}
      else if(x.type==='mission'&&tgt&&F){shiftBelief(tgt,F.id,((tgt.belief||{})[F.id]||0)+0.08);reveal(tgt,0.06);done.push(`Missionaries carry ${F.title} to ${FN(tgt)}.`)}
      else if(x.type==='tenet'&&F&&TENETS[x.tenet]&&!F.tenets.includes(x.tenet)&&!TENETS[x.tenet].cult){F.tenets=F.tenets.slice(0,2).concat([x.tenet]);done.push(`A new commandment: "${TENETS[x.tenet].t}"`)}
      else if(x.type==='scripture'&&F&&x.text){F.writings=F.writings||[];F.writings.push({yr:yr(),by:c.id,text:String(x.text).slice(0,260)});done.push(`Written into ${F.scripture}.`)}
      else if(x.type==='gov'&&isRuler&&GOVS[x.gov]&&f.gov!==x.gov){const old=f.gov;f.gov=x.gov;done.push(`${cap(FN(f))} become a ${GOVS[x.gov].label.toLowerCase()}.`);log('gov',2,`The ${f.name} Become a ${GOVS[x.gov].label}`,`At the Maker's word, ${cname(c)} remakes the ${f.name}: no longer a ${GOVS[old].label.toLowerCase()}.`,at0.x,at0.y,[f],{char:c.id})}
      else if(x.type==='persecute'&&f.belief){let hit=0;for(const k in f.belief){const G=S.faiths[k];if(G&&!G.maker&&f.belief[k]>0.05){f.belief[k]*=0.5;hit++}}normBelief(f);if(F)shiftBelief(f,F.id,(f.belief[F.id]||0)+0.1);for(const s of facSetts(f))s.resent=Math.min(2,(s.resent||0)+0.3);if(hit)done.push(`The other temples of ${FN(f)} are closed.`)}
      else if(x.type==='temple'){const s=capitalOf(f);if(s){s.store+=20;f.values.faith=clamp(f.values.faith+0.08);if(!f.golden&&R()<0.4)f.golden=yr()}done.push(`A temple to ${makerWord(f)} rises in ${s?s.name:'their capital'}.`)}
      else if(x.type==='law'&&x.text){f.values.order=clamp(f.values.order+0.06);done.push(`A new law: ${String(x.text).slice(0,120)}`)}}
    if(said){c.deeds.push({yr:yr(),txt:`spoke with the Maker`});log('decree',done.length?2:1,`${cap(cname(c))} Hears the Maker`,`${cap(cname(c))} of the ${f.name} says the Maker spoke to them: "${String(said).slice(0,180)}"${done.length?' '+done.join(' '):''}`,at0.x,at0.y,[f],{char:c.id,maker:true,faith:F?F.id:null,why:['The Maker spoke to one of the faithful.']});mk.deeds.push({yr:yr(),title:`You spoke with ${cap(cname(c))}`,choice:'speak',out:done.join(' ')||'They listened.'})}
    return done};

  // ================= THE GAME: you, your faithful, and the rival immortals =================
  mk.greatness=mk.greatness==null?30:mk.greatness;mk.mercy=mk.mercy==null?30:mk.mercy;mk.allTime=mk.allTime||0;mk.peak=mk.peak||0;mk.power=mk.power==null?20:mk.power;
  S.gods=S.gods||[];
  const RIVALS=[
    {key:'iron',name:'the Iron Sovereign',style:'might',kind:'waste',con:['iron','king'],gloss:'the Sovereign of Iron',tenet:'sword',hue:12},
    {key:'mother',name:'the Weeping Mother',style:'mercy',kind:'sea',con:['water','mother'],gloss:'the Mother Who Weeps',tenet:'stranger',hue:200},
    {key:'mask',name:'the Laughing Mask',style:'trickster',kind:'wood',con:['eye','shadow'],gloss:'the Mask That Laughs',tenet:'secret',hue:290},
    {key:'hollow',name:'the Hollow King',style:'death',kind:'deep',con:['death','king'],gloss:'the King Beneath',tenet:'dead',hue:90},
  ];
  S.RIVALS=RIVALS;
  const godOfF=F=>F?F.god:null;
  const isMine=f=>f&&f.died==null&&f.state!=null&&S.faiths[f.state]&&S.faiths[f.state].god==='you';
  S.isMine=isMine;S.myPeoples=()=>alive().filter(isMine);
  function myShare(f){let t=0;for(const k in f.belief||{}){const F=S.faiths[k];if(F&&F.god==='you')t+=f.belief[k]}return Math.min(1,t)}
  S.myShare=myShare;
  knows=f=>Math.max(myShare(f),f.knows||0);
  S.believers=()=>Math.round(alive().reduce((t,f)=>t+f.pop*myShare(f),0));
  S.faithPct=()=>{const mine=S.myPeoples();const pop=mine.reduce((t,f)=>t+f.pop,0);return pop?Math.round(100*mine.reduce((t,f)=>t+f.pop*myShare(f),0)/pop):0};
  // the meters lean the Maker's name and gloss
  makerGloss=()=>mk.greatness>mk.mercy+15?'the Maker Who Burns':mk.mercy>mk.greatness+15?'the Maker Who Answers':'the Watching Maker';
  S.makerStanding=()=>{const g=mk.greatness,m=mk.mercy;return{kn:1,label:g>=70&&m>=70?'Beloved and feared':g>=70?'Feared':m>=70?'Beloved':g<20&&m<20?'Half-forgotten':g>m+15?'Mighty':m>g+15?'Gentle':'Watchful',tone:g>m?'feared':'loved',kind:m,wrath:g}};
  makerTick=function(){};
  function nudgeMeters(dg,dm){mk.greatness=clamp(mk.greatness+(dg||0),0,100);mk.mercy=clamp(mk.mercy+(dm||0),0,100)}
  S.nudgeMeters=nudgeMeters;
  // your first faith: the kingdom knows its maker from the first fire
  S.foundMyFaith=f=>{const cs=capitalOf(f);const a=cs?pickCourtAgent(f,cs):null;const pr=a?newChar(f,'prophet',a):rulerOf(f);if(pr)pr.makerProphet=true;const F=foundFaith(f,pr,null,'They woke knowing they had been made.',{maker:true,god:'you'});f.belief[F.id]=0.85;if(pr)pr.faith=F.id;f.knows=0.6;f.values.faith=clamp(f.values.faith+0.15);return F};
  // ---- yearly: power, meters drift, score, rivals, the end ----
  S.godsYear=()=>{const Y=yr();const mine=S.myPeoples();const bel=S.believers();
    mk.believers=bel;mk.peak=Math.max(mk.peak,bel);mk.ever=mk.ever||{};for(const f of S.reach())mk.ever[f.id]=1;
    for(const f of alive()){const sh=myShare(f);const b=f.stats.births-(f._lb==null?f.stats.births:f._lb);f._lb=f.stats.births;if(sh>0)mk.allTime+=b*sh}
    if(mk.allTime<bel)mk.allTime=bel;
    mk.maxPower=Math.round(20+mk.greatness*0.25+Math.min(25,bel*0.02));mk.regen=(0.05+Math.min(0.4,bel*0.0008))*(0.6+mk.greatness/125);mk.power=Math.min(mk.maxPower,mk.power+mk.regen);
    // silence is forgotten: both meters drift slowly toward the middle
    mk.greatness+=(40-mk.greatness)*0.008;mk.mercy+=(40-mk.mercy)*0.008;
    const G=mk.greatness,M=mk.mercy;mk.danger=G>=80?'zeal':G<=20?'doubt':M>=80?'lax':M<=20?'terror':null;mk.dangerYears=mk.danger?(mk.dangerYears||0)+1:0;
    // doubt is always at work: learning, hardship and unrest wear faith down; a god must keep earning it
    if(Y%10===0)for(const f of alive())f._sh10=myShare(f);
    for(const f of mine){const F=S.faiths[f.state];let sh=myShare(f);const learned=Object.keys(f.tech).filter(k=>['writing','philosophy','printing','massmedia','computing','genetics'].includes(k)).length;
      let d=(0.0016+learned*0.0012+(S.world.doubt||0)+avgUnrest(f)*0.005+(G<=20?0.007:0)+(M>=80?0.003:0)+(M<=20?0.009:0)+(G>=85?0.003:0)-(M>=35&&M<=70?0.0015:0)-(f.golden?0.003:0))*S.dlev('doubtMult')*S.diff();
      sh=Math.max(0.01,sh-d);shiftBelief(f,F.id,sh);
      if(M<=20){for(const s of facSetts(f))s.unrest=clamp(s.unrest+0.05);if(R()<0.045){const ss=facSetts(f).filter(x=>x!==capitalOf(f)&&x.members.length>=4);const t=ss[Math.floor(R()*ss.length)];if(t){t.unrest=1;const nf=secede(f,t,null,'revolution',['They were tired of a god who only punished.']);if(nf){nf.state=null;for(const k in nf.belief||{})if(S.faiths[k]&&S.faiths[k].god==='you')nf.belief[k]*=0.3;log('apostasy',3,`The ${nf.name} Renounce You`,`The towns of the ${nf.name} break away and tear down your altars. They say a god who only punishes is no god of theirs.`,t.x,t.y,[nf,f],{why:['Your Mercy had fallen too low.'],maker:true})}}}}}
    // greatness too high: your zealots go looking for wars your people cannot always win
    if(G>=S.dlev('zealAt')&&R()<0.07&&mine.length){const f=mine.sort((a,b)=>b.pop-a.pop)[0];const t=alive().filter(o=>!isMine(o)&&!rel(f.id,o.id).war&&borderDist(f,o)<800).sort((a,b)=>borderDist(f,a)-borderDist(f,b))[0];if(t){declareWar(f,t,'holy',['Zealots of the Maker demanded it.']);for(const o of alive())if(!isMine(o))note(o.id,f.id,'grudge',0.4,'the zealots of their god');const ru=rulerOf(f);if(ru)ru.traits.cruelty=clamp(ru.traits.cruelty+0.15);log('zealots',3,`Zealots March`,`Drunk on the glory of their god, zealots of the ${f.name} drag them into a holy war against the ${t.name}. Every neighbour now fears the ${f.name}.`,at(f).x,at(f).y,[f,t],{why:['Your Greatness had grown too terrible.'],maker:true})}}
    rivalsYear();S.doctrineYear();S.slaveYear();S.warYear();S.doomYear();
    if(!S.myPeoples().length){mk.gone=(mk.gone||0)+1}else mk.gone=0;
    if(mk.gone>=10&&!mk.defeated){mk.defeated=Y;log('forgotten',3,'The Maker Is Forgotten',`No people prays to the one who made them anymore. The temples are used for grain, then for nothing. ${Math.round(mk.allTime)} souls believed in you, all told.`,W/2,H/2,alive().slice(0,1),{why:['The last of the faithful were gone.'],maker:true})}};
  // how a choice moves the meters: every lean has a price on the other side
  S.applyLean=(lean,cost)=>{const k=1+cost/30;if(lean==='greatness')nudgeMeters(9*k,-7*k);else if(lean==='mercy')nudgeMeters(-7*k,9*k);else nudgeMeters(-2,-2)};
  S.dangerText=()=>({zeal:'Too feared: zealots start holy wars, and every neighbour turns against your people.',doubt:'Too weak: your people doubt you, and faith drains fast.',lax:'Too soft: heresy and cults bloom, and rival missionaries walk in.',terror:'Too cruel: towns rebel and renounce you.'})[mk.danger]||null;
  // ---- the rival immortals ----
  S.godPlan=S.godPlan||null;
  S.setupGods=(n)=>{const picks=shuffle(RIVALS).slice(0,n);S.godPlan=picks.map((r,i)=>({key:r.key,at:Math.round((i===0?55:i===1?190:360)+R()*45)}))};
  function arriveGod(key){const r=RIVALS.find(x=>x.key===key);const f=S.emerge(r.kind);f.values.faith=clamp(f.values.faith+0.2);const F=S.faiths[f.state];if(!F)return;
    const big=S.myPeoples().sort((a,b)=>b.pop-a.pop)[0];if(big)for(const k in big.tech)if(R()<0.85)grant(f,k);const cs0=capitalOf(f);if(cs0){for(let i=0;i<(yr()<150?4:12);i++){const a=newAgent(f,mutate(f.g,f,1),cs0.x+(R()-.5)*40,cs0.y+(R()-.5)*40,cs0);a.age=8+R()*15;cs0.members.push(a)}cs0.store+=150}
    const L=S.langs[f.lang];const nm=L.stage===0?`${GLOSS[r.con[0]]}-${GLOSS[r.con[1]]}`:cap(tidy(compose(L,r.con)));F.god=r.key;F.gods=[{name:nm,domain:r.con[0],gloss:r.gloss}];F.title=`the ${pick(['Way','Word','Law','Covenant'])} of ${nm}`;if(!F.tenets.includes(r.tenet))F.tenets=[r.tenet].concat(F.tenets.slice(0,2));
    const g={key,name:r.name,style:r.style,fac:f.id,faith:F.id,at:yr(),next:yr()+15,alive:true};S.gods.push(g);
    for(const m of S.myPeoples())note(m.id,f.id,'grudge',0.4,'their false god');
    log('rivalgod',3,`Another Immortal: ${cap(r.name)}`,`You are not alone. ${cap(FN(f))} arrive, and they too were made: they worship ${nm}, ${r.gloss}, another who found eternal life and raised a people of their own. ${r.style==='might'?'Their god wants the world on its knees.':r.style==='mercy'?'Their god wins hearts, and yours are not safe.':r.style==='trickster'?'Their god smiles and whispers in other peoples\' ears.':'Their god rules what is under the earth, and the dead.'}`,at(f).x,at(f).y,[f],{why:['Another immortal had been watching, as you had.'],god:key})}
  function rivalsYear(){const Y=yr();if(S.godPlan)for(const p of S.godPlan){if(!p.done&&Y>=p.at&&S.myPeoples().length){p.done=1;arriveGod(p.key)}}
    for(const g of S.gods){if(!g.alive)continue;const theirs=alive().filter(f=>f.state!=null&&S.faiths[f.state]&&S.faiths[f.state].god===g.key);
      if(!theirs.length){g.alive=false;log('godfalls',3,`${cap(g.name)} Is Forgotten`,`No people prays to ${g.name} anymore. One immortal fewer watches the world.`,W/2,H/2,alive().slice(0,1),{god:g.key});continue}
      g.peoples=theirs.map(f=>f.id);g.believers=Math.round(alive().reduce((t,f)=>{let s=0;for(const k in f.belief||{})if(S.faiths[k]&&S.faiths[k].god===g.key)s+=f.belief[k];return t+f.pop*Math.min(1,s)},0));
      if(Y<g.next)continue;g.next=Y+Math.round((11+R()*10)/Math.sqrt(S.diff()));rivalAct(g,theirs)}}
  function rivalAct(g,theirs){const f=theirs.sort((a,b)=>b.pop-a.pop)[0];const F=S.faiths[g.faith]||S.faiths[f.state];const mine=S.myPeoples();
    const near=mine.filter(m=>borderDist(m,f)<1200).sort((a,b)=>borderDist(a,f)-borderDist(b,f))[0];const shield=Math.max(0.3,(1-mk.greatness/250)*(1+Math.max(0,mk.mercy-65)/45));
    if(g.style==='might'){const champ=S.agents.filter(x=>!x.dead&&x.fac===f.id&&!x.titan&&x.char==null).sort((x,y)=>y.dmg-x.dmg)[0];if(champ){heroize(champ);champ.maxhp*=1.4;champ.hp=champ.maxhp}
      if(near&&!rel(f.id,near.id).war&&R()<(yr()<180?0.25:0.55)){declareWar(f,near,'holy',[`${cap(g.name)} demanded the ${near.name} kneel.`]);return}
      const k=nextTechs(f,4).find(t=>['bronze','iron','gunpowder','industry'].includes(t));if(k)grant(f,k);log('rival',1,`${cap(g.name)} Arms the ${f.name}`,`${cap(FN(f))} say their god walks among their smiths.`,at(f).x,at(f).y,[f],{god:g.key});return}
    if(g.style==='mercy'){fed(f,6);if(near&&F){shiftBelief(near,F.id,((near.belief||{})[F.id]||0)+0.11*shield*Math.sqrt(S.diff()));log('rival',2,`Missionaries of ${cap(g.name)}`,`Gentle preachers of ${F.title} walk into the towns of ${FN(near)}. They heal the sick and ask for nothing, and some of your faithful listen.`,at(near).x,at(near).y,[near,f],{god:g.key,mine:true});return}
      log('rival',1,`${cap(g.name)} Feeds the ${f.name}`,`The granaries of ${FN(f)} fill as if by themselves.`,at(f).x,at(f).y,[f],{god:g.key});return}
    if(g.style==='trickster'){if(near){const ss=facSetts(near);const s=ss[Math.floor(R()*ss.length)];if(s){s.unrest=Math.min(1,s.unrest+0.35*shield);s.resent=Math.min(2,(s.resent||0)+0.4)}const ru=rulerOf(near);if(ru&&R()<0.4){ru.traits.paranoia=clamp(ru.traits.paranoia+0.2);ru.traits.cruelty=clamp(ru.traits.cruelty+0.1)}
        if(F)shiftBelief(near,F.id,((near.belief||{})[F.id]||0)+0.06*shield);log('rival',2,`Whispers in ${s?s.name:'the night'}`,`Strangers with painted faces pass through the towns of ${FN(near)}. After they leave, neighbours stop trusting neighbours${ru?`, and ${cname(ru)} starts sleeping badly`:''}.`,s?s.x:at(near).x,s?s.y:at(near).y,[near],{god:g.key,mine:true});return}
      log('rival',1,`${cap(g.name)} Laughs`,`${cap(FN(f))} hold a festival of masks.`,at(f).x,at(f).y,[f],{god:g.key});return}
    // death
    if(near&&R()<0.55){plague(near,`A grey sickness comes out of the land of ${FN(f)}.`);log('rival',2,`The Breath of ${cap(g.name)}`,`${cap(FN(f))} say their god breathed on ${FN(near)}.`,at(near).x,at(near).y,[near,f],{god:g.key,mine:true});return}
    for(const a of S.agents)if(!a.dead&&a.fac===f.id)a.life+=4;log('rival',1,`${cap(g.name)} Keeps the Dead`,`Among ${FN(f)}, the old live longer than they should.`,at(f).x,at(f).y,[f],{god:g.key})}
  S.migrateGame=()=>{if(mk.greatness==null)mk.greatness=30;if(mk.mercy==null)mk.mercy=30;if(mk.allTime==null)mk.allTime=0;if(mk.peak==null)mk.peak=0;S.gods=S.gods||[];S.moves=S.moves||[];
    if(!S.faiths.some(F=>F.god==='you')){let any=false;for(const F of S.faiths)if(F.maker){F.god='you';any=true}if(!any){const f=S.heroFac();if(f){if(f.state!=null){S.faiths[f.state].god='you';S.faiths[f.state].maker=true}else S.foundMyFaith(f)}}}if(!S.godPlan)S.setupGods(2)};
  S.godInfo=()=>S.gods.map(g=>{const f=S.facs[g.fac];return{key:g.key,name:g.name,style:g.style,alive:g.alive,believers:g.believers||0,peoples:(g.peoples||[]).map(i=>S.facs[i].name),hue:f?Math.round(f.hue):0,at:g.at}});
  // ---- what the card-writer knows ----
  S.godBrief=(trigger)=>{const mine=S.myPeoples();const Y=yr();
    return{year:Y,meters:{greatness:Math.round(mk.greatness),mercy:Math.round(mk.mercy),power:Math.floor(mk.power),maxPower:mk.maxPower,faithPct:S.faithPct(),believers:S.believers()},standing:S.makerStanding().label,
      peoples:mine.map(f=>{const ru=rulerOf(f);const F=S.faiths[f.state];return{name:f.name,pop:f.pop,towns:facSetts(f).map(s=>s.name).slice(0,6),gov:GOVS[f.gov].label,era:eraOf(f),body:bodyDesc(f.g),callYou:makerWord(f),faith:F.title,faithShare:Math.round(myShare(f)*100),unrest:Math.round(100*avgUnrest(f)),food:facSetts(f).reduce((t,s)=>t+s.store,0)<f.pop*2?'short':'enough',
        ruler:ru?{name:cname(ru),traits:traitWords(ru),piety:Math.round(ru.traits.piety*100)}:null,heir:f.heir!=null&&S.chars[f.heir]?cname(S.chars[f.heir]):null,
        wars:alive().filter(o=>o!==f&&rel(f.id,o.id).war).map(o=>o.name),allies:alive().filter(o=>o!==f&&rel(f.id,o.id).ally).map(o=>o.name),
        otherFaiths:Object.keys(f.belief||{}).filter(k=>S.faiths[k]&&S.faiths[k].god!=='you'&&f.belief[k]>0.04).map(k=>`${S.faiths[k].title}${S.faiths[k].cult?' (a cult)':S.faiths[k].god?` (of the rival god ${RIVALS.find(r=>r.key===S.faiths[k].god).name})`:''} ${Math.round(f.belief[k]*100)}%`)}}),
      rivals:S.godInfo().filter(g=>g.alive).map(g=>`${g.name} (${g.style}), god of the ${g.peoples.join(', ')}, ${g.believers} believers`),
      neighbours:alive().filter(o=>!isMine(o)&&mine.some(m=>borderDist(m,o)<700)).map(o=>`the ${o.name}: ${o.pop} souls, ${o.state!=null?S.faiths[o.state].title:'no faith'}${mine.some(m=>rel(m.id,o.id).war)?', AT WAR with your people':''}`),
      cults:S.moves.filter(m=>m.on&&m.kind==='cult'&&isMine(S.facs[m.fac])).map(m=>`${cname(S.chars[m.leader])} leads ${S.faiths[m.faith].title} among the ${S.facs[m.fac].name} (${Math.round(((S.facs[m.fac].belief||{})[m.faith]||0)*100)}%)`),
      recent:S.events.filter(e=>Y-e.yr<=60&&e.imp>=2&&e.facs.some(id=>isMine(S.facs[id]))).slice(-12).map(e=>`${e.yr}: ${e.title}. ${e.text.slice(0,140)}`),
      trigger:trigger||null}};
  // ---- the effect vocabulary every card choice is built from ----
  const findP=n=>{if(n==null)return null;const s=String(n).toLowerCase().replace(/^the /,'');return alive().find(o=>o.name.toLowerCase()===s)||null};
  const reachable=f=>f&&f.died==null&&(isMine(f)||myShare(f)>=0.15);S.reach=()=>alive().filter(reachable);
  const myP=n=>{const p=findP(n);return p&&reachable(p)?p:S.reach().sort((a,b)=>b.pop*myShare(b)-a.pop*myShare(a))[0]||null};
  const amt=(v,lo,hi)=>clamp(isFinite(+v)?+v:0,lo,hi);
  S.applyFx=(list)=>{const done=[];for(const x of (list||[]).slice(0,4)){if(!x||!x.fx)continue;try{const r=FX[x.fx]?FX[x.fx](x):null;if(r)done.push(r)}catch(e){console.warn('fx',x,e)}}return done};
  const FX={
    food(x){const f=myP(x.people);if(!f)return;const a=amt(x.amount,-1,1);for(const s of facSetts(f))s.store=Math.max(0,s.store+(a>0?s.members.length*10*a:s.store*a));return a>0?`Food fills the granaries of ${FN(f)}.`:`The granaries of ${FN(f)} empty.`},
    unrest(x){const f=myP(x.people);if(!f)return;const a=amt(x.amount,-1,1);for(const s of facSetts(f)){s.unrest=clamp(s.unrest+a*0.5);if(a<0)s.resent=Math.max(0,(s.resent||0)+a)}return a<0?`Calm returns to ${FN(f)}.`:`Anger spreads through ${FN(f)}.`},
    values(x){const f=myP(x.people);if(!f||!x.values)return;for(const k of VALUES)if(isFinite(+x.values[k]))f.values[k]=clamp(f.values[k]+amt(x.values[k],-0.25,0.25));return`${cap(FN(f))} change.`},
    ruler(x){const f=myP(x.people);const ru=f&&rulerOf(f);if(!ru||!x.traits)return;for(const k of CTRAITS)if(isFinite(+x.traits[k]))ru.traits[k]=clamp(ru.traits[k]+amt(x.traits[k],-0.5,0.5));return`${cap(cname(ru))} is changed.`},
    kill_ruler(x){const f=myP(x.people);const ru=f&&rulerOf(f);if(!ru)return;const a=charAgent(ru);deed(ru,'was struck down by the Maker');if(a)die(a,'lightning');charDeath(ru,'struck down by the Maker');return`${cap(cname(ru))} is dead.`},
    depose(x){const f=myP(x.people);const ru=f&&rulerOf(f);if(!ru)return;return revokeRuler(f,ru)},
    war(x){const f=myP(x.people),t=findP(x.target);if(!f||!t||t===f||rel(f.id,t.id).war)return;declareWar(f,t,'holy',['The Maker willed it.']);musterArmy(f);return`${cap(FN(f))} march on ${FN(t)}.`},
    peace(x){const f=myP(x.people),t=findP(x.target);if(!f||!t||!rel(f.id,t.id).war)return;makePeace(f,t,['The Maker commanded peace.']);return`Peace between ${FN(f)} and ${FN(t)}.`},
    bless_army(x){const f=myP(x.people);if(!f)return;let n=0;for(const a of S.agents)if(!a.dead&&a.fac===f.id&&(a.role==='soldier'||a.hero)){a.maxhp*=1.35;a.hp=a.maxhp;a.dmg*=1.25;n++}musterArmy(f);return`The soldiers of ${FN(f)} fight like the possessed.`},
    champion(x){const f=myP(x.people);if(!f)return;const m=S.agents.filter(a=>!a.dead&&a.fac===f.id&&!a.titan&&a.char==null).sort((a,b)=>b.dmg*b.maxhp-a.dmg*a.maxhp)[0];if(!m)return;heroize(m);m.maxhp*=1.7;m.hp=m.maxhp;m.dmg*=1.5;return`A champion rises among ${FN(f)}.`},
    tech(x){const f=myP(x.people);if(!f)return;const k=nextTechs(f,1)[0];if(!k)return;grant(f,k);return`${cap(FN(f))} learn ${TECH[k].n.toLowerCase()}.`},
    faith(x){const f=myP(x.people);if(!f)return;const F=isMine(f)?S.faiths[f.state]:S.faiths.filter(G=>G.god==='you').sort((a,b)=>((f.belief||{})[b.id]||0)-((f.belief||{})[a.id]||0))[0];if(!F)return;const a=amt(x.amount,-0.4,0.4);shiftBelief(f,F.id,Math.max(0.02,myShare(f)+a));return a>=0?`Faith in you deepens among ${FN(f)}.`:`Faith in you wavers among ${FN(f)}.`},
    mission(x){const f=myP(x.people),t=findP(x.target);if(!f||!t||t===f||!isMine(f))return;const F=S.faiths[f.state];const sh=((t.belief||{})[F.id]||0)+(0.08+mk.mercy/1000)*S.dlev('missionMult');shiftBelief(t,F.id,sh);t.knows=Math.max(t.knows||0,sh);
      if(t.state!==F.id&&sh>0.55&&rulerOf(t)){const old=t.state!=null?S.faiths[t.state]:null;t.state=F.id;log('convert',3,`The ${t.name} Turn to ${cap(F.title.replace(/^the /,''))}`,`Missionaries of ${FN(f)} have done their work: the ${t.name} now pray to ${makerWord(t)}${old?`, and cast down ${old.title}`:''}.`,at(t).x,at(t).y,[t,f],{faith:F.id,maker:true});return`${cap(FN(t))} convert to your faith!`}return`Missionaries of ${FN(f)} preach among ${FN(t)}.`},
    cult(x){const f=myP(x.people);if(!f)return;const m=S.moves.find(m=>m.on&&m.kind==='cult'&&m.fac===f.id);if(!m)return;const F=S.faiths[m.faith],c=S.chars[m.leader];
      if(x.action==='crush'){shiftBelief(f,F.id,(f.belief[F.id]||0)*0.2);m.persecuted=(m.persecuted||0)+1;const a=charAgent(c);if(a)die(a,'executed');charDeath(c,'executed');return`The cult of ${cap(cname(c))} is crushed.`}
      if(x.action==='expose'){shiftBelief(f,F.id,(f.belief[F.id]||0)*0.25);deed(c,'was exposed as a fraud');return`${cap(cname(c))} is exposed.`}
      if(x.action==='merge'){const A2=S.faiths[f.state];shiftBelief(f,A2.id,myShare(f)+(f.belief[F.id]||0));delete f.belief[F.id];normBelief(f);F.cult=false;F.fate=`absorbed into ${A2.title}`;endMove(m,'absorbed');return`The cult is folded into your faith.`}
      return null},
    prophet(x){const f=myP(x.people);if(!f)return;const p=makeProphetIn(f,capitalOf(f),null,'The Maker chose a voice.');return p?`${cap(cname(p))} becomes your prophet.`:null},
    heal(x){const f=myP(x.people);if(!f)return;for(const a of S.agents)if(!a.dead&&a.fac===f.id){a.hp=a.maxhp;a.energy=Math.max(a.energy,60)}grant(f,'medicine');return`The sick of ${FN(f)} rise from their beds.`},
    plague(x){const f=myP(x.people);if(!f)return;plague(f,'The Maker is angry.');return`A plague falls on ${FN(f)}.`},
    golden(x){const f=myP(x.people);if(!f)return;f.golden=yr();f.values.art=clamp(f.values.art+0.1);return`A golden age begins for ${FN(f)}.`},
    grow(x){const f=myP(x.people);if(!f)return;const s=capitalOf(f);if(!s)return;const n=Math.round(amt(x.amount||0.5,0,1)*10)+3;for(let i=0;i<n;i++){const a=newAgent(f,mutate(f.g,f,1),s.x+(R()-.5)*30,s.y+(R()-.5)*30,s);a.age=1+R()*5;s.members.push(a)}s.store+=n*6;return`${n} children are born in ${s.name} in a single season.`},
    migrate(x){const f=myP(x.people);if(!f)return;const s=facSetts(f).sort((a,b)=>b.members.length-a.members.length)[0];if(!s)return;s.store+=40;colonize(f,s);return`Settlers of ${FN(f)} set out to found a new town.`},
    persecute(x){const f=myP(x.people);if(!f)return;let hit=0;for(const k in f.belief){const G=S.faiths[k];if(G&&G.god!=='you'&&f.belief[k]>0.03){f.belief[k]*=0.35;hit++}}normBelief(f);for(const s of facSetts(f))s.resent=Math.min(2,(s.resent||0)+0.4);return hit?`The other temples of ${FN(f)} are torn down.`:null},
    ally(x){const f=myP(x.people),t=findP(x.target);if(!f||!t||rel(f.id,t.id).war)return;const r=rel(f.id,t.id);r.ally=true;r.trade=true;note(f.id,t.id,'favor',1,'the alliance');note(t.id,f.id,'favor',1,'the alliance');return`${cap(FN(f))} and ${FN(t)} swear an alliance.`},
    gov(x){const f=myP(x.people);if(!f||!GOVS[x.gov]||f.gov===x.gov)return;f.gov=x.gov;return`${cap(FN(f))} become a ${GOVS[x.gov].label.toLowerCase()}.`},
    greatness(x){nudgeMeters(amt(x.amount,-15,15),0);return null},
    doctrine(x){return S.adoptDoctrine({name:x.name||x.key,text:x.text,levers:x.levers})},
    enslave(x){const f=myP(x.people),t=findP(x.target);if(!f||!t||t===f)return;const cs=capitalOf(f);const ts=facSetts(t)[0];if(!cs||!ts)return;let n=0;for(const a of ts.members)if(!a.dead&&!a.titan&&a.char==null&&R()<0.3){a.fac=f.id;a.slave=t.id;a.home=cs.id;a.state='migrate';t.pop--;f.pop++;stats(a);cs.members.push(a);n++}note(t.id,f.id,'grudge',1.2,'the slave raids');return`${n} of ${FN(t)} are dragged off in chains.`},
    raid(x){const f=myP(x.people),t=findP(x.target);if(!f||!t||t===f)return;const ts=facSetts(t).sort((a,b)=>b.store-a.store)[0];const cs=capitalOf(f);if(!ts||!cs)return;const g=ts.store*0.6;ts.store-=g;cs.store+=g;ts.unrest=clamp(ts.unrest+0.2);note(t.id,f.id,'grudge',0.8,'the raids');return`Raiders of ${FN(f)} strip ${ts.name} bare.`},
    weapon(x){const f=myP(x.people);if(!f)return;const k=['gunpowder','fission','bioweapons','genetics','surveillance','computing'].includes(x.kind)?x.kind:'gunpowder';grant(f,k);if(k==='fission')delete f.cool.nuke;return`${cap(FN(f))} learn ${TECH[k].n.toLowerCase()}.`},
    forbid(x){const f=myP(x.people);if(!f)return;const ks=['fission','bioweapons','genetics','computing','geoeng','uplift','surveillance','massmedia','printing'].filter(k=>f.tech[k]);const k=ks.includes(x.kind)?x.kind:ks[0];if(!k)return;delete f.tech[k];f.values.knowledge=clamp(f.values.knowledge-0.15);f.rp=0;return`${cap(FN(f))} burn the books of ${TECH[k].n.toLowerCase()}.`},
    secede(x){const f=myP(x.people);if(!f)return;const ss=facSetts(f).filter(t=>t!==capitalOf(f)&&t.members.length>=3);const t=ss[Math.floor(R()*ss.length)];if(!t)return;t.unrest=1;const nf=secede(f,t,null,'revolution',['The Maker let them go.']);return nf?`${t.name} breaks away as the ${nf.name}.`:null},
    sacrifice(x){const f=myP(x.people);if(!f)return;let n=0;for(const a of S.agents)if(!a.dead&&a.fac===f.id&&!a.titan&&R()<amt(x.amount||0.15,0.05,0.3)){die(a,'sacrifice');n++}return`${n} of ${FN(f)} are given to their god.`},
    mercy(x){nudgeMeters(0,amt(x.amount,-15,15));return null},
  };
  S.FX_KEYS=Object.keys(FX);
  function musterArmy(f){const wars=alive().filter(o=>o!==f&&rel(f.id,o.id).war);if(!wars.length)return;const memb=S.agents.filter(a=>!a.dead&&a.fac===f.id&&!a.titan);const want=Math.floor(memb.length*0.4);let cur=memb.filter(a=>a.role==='soldier').length;for(const a of memb){if(cur>=want)break;if(!a.role&&a.age>6){a.role='soldier';cur++}}
    if(!f.army){let best=null,bd=1e9;const c0=capitalOf(f)||f.origin;for(const s of S.setts){if(!wars.some(w=>w.id===s.fac))continue;const d=Math.hypot(s.x-c0.x,s.y-c0.y);if(d<bd){bd=d;best=s}}if(best){f.warTarget=best.id;formArmy(f,best)}}}
  // ---- what is worth a card right now ----
  S.cardTrigger=(emergencyOnly)=>{const Y=yr();const mine=S.reach();if(!mine.length)return null;mk.seen=mk.seen||{};
    const ev=S.events.slice(-80).filter(e=>Y-e.yr<=(emergencyOnly?3:30)&&!mk.seen[e.id]&&(e.facs.some(id=>reachable(S.facs[id]))||['ai','undying','winter','climate','fallout','omen'].includes(e.type))&&!e.data.maker);
    const urgent=e=>(e.type==='conquest'&&e.text.includes('the capital'))||e.type==='revolution'||e.type==='rivalgod'||e.type==='ai'||e.type==='undying'||e.type==='winter'||e.type==='fallout'||e.type==='zealots'||e.type==='apostasy'||(e.type==='convert'&&!(e.data.faith!=null&&S.faiths[e.data.faith]&&S.faiths[e.data.faith].god==='you'))||(e.type==='cult'&&e.data.move!=null&&((S.facs[e.facs[0]].belief||{})[S.moves[e.data.move].faith]||0)>0.12)||(e.type==='war'&&isMine(S.facs[e.facs[1]])&&S.facs[e.facs[0]].pop>S.facs[e.facs[1]].pop*1.3);
    const notable=e=>urgent(e)||e.type==='razed'||e.type==='war'||e.type==='plague'||e.type==='schism'||e.type==='cult'||(e.type==='rival'&&e.data.mine)||e.type==='famine'||e.type==='coup'||e.type==='prophet'||e.type==='persecution';
    let pick0=ev.filter(urgent).sort((a,b)=>b.imp-a.imp)[0];
    if(!pick0&&emergencyOnly&&mk.danger&&(mk.dangerYears===3||mk.dangerYears%40===0))return{kind:'emergency',why:S.dangerText(),people:mine[0].name,danger:mk.danger};
    if(!pick0&&emergencyOnly){for(const f of mine){if(myShare(f)<0.45)return{kind:'emergency',why:`Faith in you is collapsing among the ${f.name}: only ${Math.round(myShare(f)*100)} in a hundred still pray to you.`,people:f.name}}return null}
    if(!pick0&&!emergencyOnly)pick0=ev.filter(notable).sort((a,b)=>b.imp-a.imp)[0]||ev.filter(e=>e.imp>=2).sort((a,b)=>b.imp-a.imp)[0];
    if(pick0){mk.seen[pick0.id]=1;return{kind:urgent(pick0)?'emergency':'moment',why:`${pick0.yr}: ${pick0.title}. ${pick0.text}`,people:(S.facs[pick0.facs.find(id=>reachable(S.facs[id]))]||mine[0]).name,ev:pick0.id}}
    const f=mine.sort((a,b)=>b.pop-a.pop)[0];const ru=rulerOf(f);const ideas=[ru?`${cname(ru)}, ${rulerTitle(f)} of the ${f.name}, wants something from you.`:null,`The priests of the ${f.name} ask what their god wants of them next.`,`A child of the ${f.name} is born with strange marks, and the priests argue over what it means.`,alive().some(o=>!isMine(o)&&borderDist(f,o)<600)?`The ${f.name} look across the border at strangers who pray to other gods.`:null].filter(Boolean);
    return{kind:'moment',why:pick(ideas),people:f.name}};
  // ---- the lead prophet who may call on you ----
  S.leadProphet=()=>{const mine=S.myPeoples();let best=null,bs=-1;for(const c of S.chars){if(!c.alive)continue;const f=S.facs[c.fac];if(!isMine(f))continue;const prophetish=c.makerProphet||c.role==='prophet'||(c.role==='ruler'&&(['theocracy','cult'].includes(f.gov)||c.traits.piety>0.65));if(!prophetish)continue;const sc=c.traits.piety+(c.role==='ruler'?0.4:0)+f.pop/200+(c.makerProphet?0.3:0);if(sc>bs){bs=sc;best=c}}
    if(!best){const f=mine.sort((a,b)=>b.pop-a.pop)[0];if(f){const p=makeProphetIn(f,capitalOf(f),null,'The faithful needed a voice.');if(p)best=p}}return best};
  // the prophet obeys you: decrees from a conversation, applied with real force
  S.prophetDecrees=(cid,acts)=>{const c=S.chars[cid];if(!c||!c.alive)return[];const f=S.facs[c.fac];const isRuler=f.ruler===c.id;const ru=rulerOf(f);const obey=clamp(0.2+c.traits.piety*0.35+(mk.mercy>=30&&mk.mercy<=75?0.15:0)+mk.greatness/500-(mk.mercy<=20?0.15:0)-(mk.greatness<=20?0.15:0));const done=[];
    for(const x of (acts||[]).slice(0,4)){if(!x||!x.fx)continue;if(R()>(isRuler?Math.min(1,obey+0.2):obey)){done.push(`${cap(FN(f))} ${pick(['grumble, and do not','argue in the temples, and in the end do not','hear the words, and choose not to'])} ${x.fx==='war'?'march':x.fx==='peace'?'make peace':'obey'}.`);continue}
      if(false){done.push(`${cap(cname(ru))} would not ${x.fx==='war'?'go to war':x.fx==='peace'?'make peace':'do it'} on a prophet's word.`);continue}
      if(['greatness','mercy','plague','kill_ruler'].includes(x.fx))continue;x.people=x.people||f.name;const r=S.applyFx([x]);done.push(...r)}
    return done};


  // ================= EMERGENT: ages and doctrines built from levers, never from a fixed list =================
  // the levers a doctrine may pull, with bounds; anything not given stays neutral
  const DLEV={missionMult:[0.5,2.5,1],cultMult:[0.4,3,1],soldierMult:[0.7,1.6,1],gDrift:[-0.2,0.2,0],mDrift:[-0.2,0.2,0],doubtMult:[0.4,2,1],techMult:[0.5,2.5,1],sectMult:[0.3,4,1],zealAt:[55,95,80],noWar:[0,1,0],purge:[0,1,0],colonize:[0,1,0],sacrifice:[0,1,0],theocracy:[0,1,0],capUnrest:[0,0.03,0]};
  S.DLEV=Object.keys(DLEV);
  mk.docs=mk.docs||[];
  S.dlev=k=>{const d=DLEV[k];if(!d)return 0;let v=d[2];for(const D of mk.docs){const x=D.levers[k];if(x==null)continue;if(k.endsWith('Mult'))v*=x;else if(k==='zealAt')v=Math.min(v,x);else if(d[1]===1&&d[0]===0)v=v||x;else v+=x}return v};
  S.hasDoc=k=>false;
  function cleanLevers(L){const out={};for(const k in L||{}){const d=DLEV[k];if(!d)continue;let x=+L[k];if(typeof L[k]==='boolean')x=L[k]?1:0;if(!isFinite(x))continue;out[k]=clamp(x,d[0],d[1])}return out}
  S.adoptDoctrine=(spec)=>{if(!spec)return null;if(typeof spec==='string')spec={name:spec};const name=String(spec.name||'A New Teaching').slice(0,60);if(mk.docs.some(d=>d.name===name))return null;
    let lv=cleanLevers(spec.levers);if(!Object.keys(lv).length){const keys=shuffle(Object.keys(DLEV));const up=keys[0],dn=keys[1];const rnd=k=>{const d=DLEV[k];return d[1]===1&&d[0]===0?1:k.endsWith('Mult')?(R()<.5?d[0]+R()*(d[2]-d[0]):d[2]+R()*(d[1]-d[2])):d[0]+R()*(d[1]-d[0])};lv={[up]:rnd(up),[dn]:rnd(dn)}}
    const D={name,text:String(spec.text||'').slice(0,200),levers:lv,yr:yr()};mk.docs.push(D);if(mk.docs.length>3){const old=mk.docs.shift();log('doctrine',2,`${old.name} Fades`,`Your faithful quietly let go of ${old.name}.`,W/2,H/2,S.myPeoples().slice(0,1),{maker:true})}
    const f=S.myPeoples()[0];if(lv.theocracy&&f)f.gov='theocracy';
    log('doctrine',3,name,`Your faith takes up a new teaching: ${D.text||name}.`,f?at(f).x:W/2,f?at(f).y:H/2,S.myPeoples().slice(0,3),{maker:true,why:['The Maker\'s choice became doctrine.']});return`Your faith takes up ${name}.`};
  S.docText=D=>{const L=D.levers;const p=[];const m=(k,a,b)=>{if(L[k]!=null&&L[k]!==1)p.push(L[k]>1?a:b)};m('missionMult','missions spread faster','missions falter');m('cultMult','cults bloom','cults wither');m('soldierMult','soldiers fight harder','soldiers fight softer');m('doubtMult','doubt spreads faster','faith holds longer');m('techMult','learning speeds up','learning slows');m('sectMult','sects split off','the faith holds together');if(L.gDrift)p.push(L.gDrift>0?'Greatness grows':'Greatness fades');if(L.mDrift)p.push(L.mDrift>0?'Mercy grows':'Mercy fades');if(L.noWar)p.push('your peoples may not start wars');if(L.purge)p.push('other faiths are purged');if(L.colonize)p.push('your peoples spread new towns');if(L.sacrifice)p.push('the faithful are sacrificed');if(L.theocracy)p.push('priests rule');if(L.zealAt&&L.zealAt<80)p.push('zealots rise sooner');if(L.capUnrest)p.push('capitals grow restless');return p.join('; ')};
  S.doctrineYear=()=>{const mine=S.myPeoples();const Y=yr();nudgeMeters(S.dlev('gDrift'),S.dlev('mDrift'));
    if(S.dlev('sacrifice')&&Y%25===0)for(const f of mine)for(const a of S.agents)if(!a.dead&&a.fac===f.id&&R()<0.03)die(a,'sacrifice');
    if(S.dlev('purge'))for(const f of mine){for(const k in f.belief||{}){const G=S.faiths[k];if(G&&G.god!=='you')f.belief[k]*=0.97}normBelief(f);if(Y%15===0)for(const o of alive())if(!isMine(o)&&borderDist(f,o)<600)note(o.id,f.id,'grudge',0.3,'their purges')}
    const sm=S.dlev('soldierMult');if(sm!==1&&Y%8===0)for(const a of S.agents)if(!a.dead&&a.role==='soldier'&&a.docMult!==sm&&isMine(S.facs[a.fac])){a.dmg*=sm/(a.docMult||1);a.docMult=sm}
    if(S.dlev('colonize'))for(const f of mine){const s=facSetts(f).sort((a,b)=>b.members.length-a.members.length)[0];if(s&&R()<0.03&&s.members.length>8){s.store+=30;colonize(f,s)}}
    const cu=S.dlev('capUnrest');if(cu)for(const f of mine){const cs=capitalOf(f);if(cs)cs.unrest=clamp(cs.unrest+cu)}};
  // ---- the character of an age, from grounded levers: climate, disease, temper, trade, learning, faith ----
  const ALEV={foodMult:[0.55,1.45,1],plagueMult:[0.3,5,1],cultMult:[0.4,3,1],techMult:[0.6,2.2,1],doubt:[0,0.006,0],martial:[-0.15,0.2,0],unrest:[-0.2,0.3,0],trade:[-0.15,0.2,0],migration:[0,1,0]};
  S.ALEV=Object.keys(ALEV);
  S.setAge=(spec)=>{for(const k of ['plagueMult','cultMult','techMult','doubt'])delete S.world[k];const L={};for(const k in spec.levers||{}){const d=ALEV[k];if(!d)continue;const x=+spec.levers[k];if(isFinite(x))L[k]=clamp(x,d[0],d[1])}
    const name=String(spec.name||'A New Age').slice(0,60),text=String(spec.text||'').slice(0,240);S.world.age={name,text,levers:L,yr:yr()};
    if(L.foodMult){S.world.foodMult=L.foodMult;S.world.foodUntil=S.year+240}for(const k of ['plagueMult','cultMult','techMult','doubt'])if(L[k]!=null)S.world[k]=L[k];
    if(L.martial)for(const f of alive())f.values.martial=clamp(f.values.martial+L.martial);if(L.trade)for(const f of alive())f.values.trade=clamp(f.values.trade+L.trade);if(L.unrest)for(const s of S.setts)s.unrest=clamp(s.unrest+L.unrest);if(L.migration>=0.5&&alive().length<14){S.emerge();S.lastArrival=yr()-40}
    log('omen',3,name,text||'A new age begins.',W/2,H/2,alive().slice(0,1),{why:['The world turns.']})};
  // without Claude: an age is still composed fresh from what the world is doing right now
  S.composeAge=()=>{const recent=S.events.filter(e=>yr()-e.yr<=150);const c=t=>recent.filter(e=>e.type===t).length;const L={};const words=[];
    const wars=c('war')+c('battle')/3,plg=c('plague'),cul=c('cult')+c('sect'),tech=c('tech'),arr=c('arrival');
    if(R()<0.55){const warm=R()<0.5;L.foodMult=warm?1.1+R()*0.3:0.6+R()*0.3;words.push(warm?pick(['Green','Warm','Fat','Long Summer']):pick(['Cold','Dry','Lean','Ashen']))}
    if(wars>4||R()<0.3){L.martial=0.05+R()*0.12;words.push(pick(['Iron','Spears','Banners','Burning Borders']))}else if(R()<0.4){L.martial=-0.1;words.push(pick(['Quiet Roads','Long Truce']))}
    if(plg>1||R()<0.25){L.plagueMult=1.5+R()*3;words.push(pick(['Fevers','Sickness','Grey Coughs']))}
    if(cul>1||R()<0.3){L.cultMult=1.3+R()*1.5;words.push(pick(['Preachers','Visions','Heresies']))}
    if(tech>3||R()<0.3){L.techMult=1.2+R()*0.8;L.doubt=0.001+R()*0.003;words.push(pick(['Scholars','Questions','Ink']))}
    if(R()<0.3){L.trade=0.1;words.push(pick(['Caravans','Coin','Markets']))}
    if(R()<0.2||arr>0){L.migration=1;words.push(pick(['Strangers','Wanderers']))}
    if(!words.length){L.unrest=0.1;words.push(pick(['Grievances','Whispers']))}
    const lead=alive().sort((a,b)=>b.pop-a.pop)[0];const name=R()<0.5&&lead?`The ${words[0]} Years of the ${lead.name}`:`The Age of ${words.slice(0,2).join(' and ')}`;
    const T={foodMult:L.foodMult?(L.foodMult>1?'the harvests are generous':'the harvests fail'):'',martial:L.martial>0?'every border bristles':L.martial<0?'swords rust':'',plagueMult:L.plagueMult?'sickness rides the roads':'',cultMult:L.cultMult?'preachers fill the squares':'',techMult:L.techMult?'scholars ask what priests cannot answer':'',trade:L.trade?'caravans grow fat':'',migration:L.migration?'strangers arrive from the edges of the world':'',unrest:L.unrest?'old grievances wake':''};
    const text=Object.keys(L).map(k=>T[k]).filter(Boolean);return{name,text:cap(text.join('; '))+'.',levers:L}};
  // ---- conquest: what the victors do depends on who they are ----
  sackTown=function(s,old,attF,wasCap,r){const ru=rulerOf(attF);const T=ru?ru.traits:{cruelty:0.5,greed:0.5,piety:0.5,warmth:0.5,honor:0.5,ambition:0.5};const F=attF.state!=null?S.faiths[attF.state]:null;const ten=F?F.tenets:[];const same=old.state!=null&&old.state===attF.state;
    const grudge=mem(attF.id,old.id).grudge;const holy=r&&r.goal==='holy';const ext=r&&r.goal==='extermination';const dest=capitalOf(attF)||attF.origin;const V=attF.values;
    const w={massacre:T.cruelty*1.2+grudge*0.3+(ext?1.5:0)+(ten.includes('pure')||ten.includes('fire')?0.4:0)-T.warmth*0.6-(same?0.4:0),
      enslave:T.greed*0.8+V.trade*0.5+V.martial*0.3-(ten.includes('stranger')?0.6:0)-T.honor*0.3,
      convert:T.piety*0.9+(ten.includes('convert')?0.8:0)+(holy?0.6:0)-(same?2:0),
      spare:T.warmth*0.9+T.honor*0.5+V.harmony*0.5-grudge*0.2,
      ransom:T.greed*0.7+V.trade*0.6+(wasCap?0.3:0),
      deport:V.order*0.6+T.ambition*0.4+T.paranoia*0.3,
      plunder:T.greed*0.6+V.martial*0.4+0.3,
      relics:(old.state!=null&&!same?0.4+T.piety*0.4:0)};
    const acts=Object.entries(w).map(([k,v])=>[k,v+R()*0.9]).sort((a,b)=>b[1]-a[1]).slice(0,R()<0.5?2:3).map(x=>x[0]);
    const res=s.members.filter(m=>!m.dead&&m.char==null&&!m.titan);const lines=[];let rest=res.slice();
    const take=(frac)=>{const n=Math.round(rest.length*frac);const out=rest.slice(0,n);rest=rest.slice(n);return out};
    rest=shuffle(rest);
    for(const a of acts){
      if(a==='massacre'){const v=take(0.15+T.cruelty*0.45);for(const m of v)die(m,'massacred');if(v.length)lines.push(pick([`${v.length} are put to the sword in the streets.`,`The victors kill ${v.length} before their officers stop them.`,`${v.length} are herded into the square and never leave it.`,`For three days the ${attF.name} kill whoever they find: ${v.length} dead.`]))}
      else if(a==='enslave'&&dest.members){const v=take(0.15+T.greed*0.35);for(const m of v){m.fac=attF.id;m.slave=old.id;m.home=dest.id;m.role=null;m.state='migrate';old.pop--;attF.pop++;stats(m);dest.members.push(m)}if(v.length)lines.push(pick([`${v.length} are chained and marched to ${dest.name}.`,`${v.length} are sold in the markets of ${dest.name}.`,`The young are taken: ${v.length} of them, bound for ${dest.name}.`]))}
      else if(a==='convert'&&F){attF.belief=attF.belief||{};const sh=Math.min(1,rest.length/Math.max(1,attF.pop));attF.belief[F.id]=(attF.belief[F.id]||0)+0.05*sh;old.belief=old.belief||{};if(old.state!=null)old.belief[old.state]=Math.max(0.05,(old.belief[old.state]||0)-0.06);normBelief(old);lines.push(pick([`Its people are baptised into ${F.title} at spear-point.`,`The old altars are smashed and ${F.title} is preached from the steps.`,`Those who will not pray to ${F.gods[0].name} are driven out.`]))}
      else if(a==='spare'){lines.push(pick([`${cap(ru?cname(ru):'the conquerors')} forbids looting, and the town is spared.`,`The ${attF.name} take the keys and leave the people in peace.`,`To everyone's surprise, no one is killed.`]))}
      else if(a==='ransom'){const g=Math.round(old.treasury*(wasCap?0.5:0.2));old.treasury-=g;attF.treasury+=g;if(g)lines.push(pick([`The ${old.name} pay ${g} in gold to buy back their nobles.`,`Its elders are held for ransom; ${g} in gold changes hands.`]))}
      else if(a==='deport'){const others=facSetts(attF).filter(x=>x!==s);const v=take(0.3);for(const m of v){const to=others.length?pick(others):dest;m.fac=attF.id;m.home=to.id;m.state='migrate';old.pop--;attF.pop++;stats(m);if(to.members)to.members.push(m)}if(v.length)lines.push(pick([`${v.length} are resettled far away, among the ${attF.name}.`,`The ${attF.name} scatter ${v.length} of its people across their own towns.`]))}
      else if(a==='plunder'){const loot=Math.round(s.store*0.8);if(dest.store!=null)dest.store+=loot;s.store*=0.2;const burned=Math.floor(s.bld.length*(0.2+T.cruelty*0.3));s.bld.splice(Math.max(0,s.bld.length-burned),burned);lines.push(pick([`${loot} measures of grain and goods are carted away${burned?`, and ${burned} buildings burn`:''}.`,`The granaries are emptied${burned?` and ${burned} houses torched`:''}.`]))}
      else if(a==='relics'&&old.state!=null){const OF=S.faiths[old.state];note(old.id,attF.id,'grudge',1,`the theft of the relics of ${OF.title}`);lines.push(pick([`The holy relics of ${OF.title} are carried off as trophies.`,`They burn the scriptures of ${OF.title} in the square.`]))}}
    // whoever is left becomes theirs
    let stayed=0;for(const m of rest){if(m.dead)continue;m.fac=attF.id;m.home=s.id;m.role=null;old.pop--;attF.pop++;stats(m);stayed++}
    s.members=s.members.filter(m=>!m.dead&&m.fac===attF.id&&m.home===s.id);
    if(wasCap&&R()<0.5+T.cruelty*0.4){const lost=Object.keys(old.tech).filter(k=>TECH[k].req.length).sort((a,b)=>old.tech[b]-old.tech[a]).slice(0,1);for(const k of lost)delete old.tech[k];if(lost.length)lines.push(`The libraries burn; the ${old.name} forget ${TECH[lost[0]].n.toLowerCase()}.`)}
    if(stayed)lines.push(`${stayed} remain, now subjects of the ${attF.name}.`);
    attF.stats.sackStyle=acts[0];return lines.join(' ')};
  // ---- peace: the terms depend on the victor's temper, the loser's state and the grudges between them ----
  S.peaceTerms=(Wn,Ln,lop)=>{const ru=rulerOf(Wn);const T=ru?ru.traits:{cruelty:0.5,greed:0.5,piety:0.5,warmth:0.5,honor:0.5,ambition:0.5,paranoia:0.5};const F=Wn.state!=null?S.faiths[Wn.state]:null;const wc=capitalOf(Wn)||Wn.origin;const out=[];
    const w={land:T.ambition*0.9+lop*0.15,tribute:T.greed*0.8+Wn.values.trade*0.4,gold:T.greed*0.6+0.2,hostage:T.paranoia*0.7+T.honor*0.2,marriage:T.warmth*0.6+T.honor*0.4+(Wn.values.harmony*0.3),convert:F&&Ln.state!==Wn.state?T.piety*0.9+(F.tenets.includes('convert')?0.6:0):-1,disarm:T.paranoia*0.6+Wn.values.order*0.4,vassal:T.ambition*0.6+lop*0.1,depose:T.cruelty*0.5+T.ambition*0.3,mercy:T.warmth*0.8+T.honor*0.4-T.greed*0.3};
    const picks=Object.entries(w).map(([k,v])=>[k,v+R()*0.8]).sort((a,b)=>b[1]-a[1]).slice(0,lop>3?3:lop>1.8?2:1).map(x=>x[0]);const r=rel(Wn.id,Ln.id);
    for(const k of picks){
      if(k==='land'){const n=lop>3?2:1;const towns=facSetts(Ln).filter(t=>t!==capitalOf(Ln)).sort((a,b)=>Math.hypot(a.x-wc.x,a.y-wc.y)-Math.hypot(b.x-wc.x,b.y-wc.y)).slice(0,n);if(towns.length){let caps=0;for(const t of towns)caps+=cedeTown(t,Ln,Wn);out.push(`The ${Ln.name} cede ${towns.map(t=>t.name).join(' and ')}${caps?`; ${caps} are carried off in chains`:''}.`)}}
      else if(k==='tribute'){r.tribute={from:Ln.id,to:Wn.id,until:yr()+20+Math.floor(R()*30)};out.push(`The ${Ln.name} must pay tribute for ${r.tribute.until-yr()} years.`)}
      else if(k==='gold'){const g=Math.round(Ln.treasury*(0.3+R()*0.4));Ln.treasury-=g;Wn.treasury+=g;if(g)out.push(`They pay ${g} in gold.`)}
      else if(k==='hostage'){const h=Ln.heir!=null?S.chars[Ln.heir]:null;if(h&&h.alive){h.fac=Wn.id;h.role='hostage';Ln.heir=null;deed(h,`was sent as a hostage to the ${Wn.name}`);out.push(`${cap(cname(h))}, heir of the ${Ln.name}, is given up as a hostage.`)}}
      else if(k==='marriage'){const lr=rulerOf(Ln);if(ru&&lr&&ru.spouse==null&&lr.alive){r.marriage={a:ru.id,b:lr.id,love:0.3};note(Ln.id,Wn.id,'favor',0.8,'the marriage of the peace');out.push(`The peace is sealed with a marriage between the two thrones.`)}}
      else if(k==='convert'&&F){shiftBelief(Ln,F.id,((Ln.belief||{})[F.id]||0)+0.25);out.push(`The ${Ln.name} must open their temples to ${F.title}.`)}
      else if(k==='disarm'){Ln.values.martial=clamp(Ln.values.martial-0.2);for(const a of S.agents)if(!a.dead&&a.fac===Ln.id&&a.role==='soldier')a.role=null;out.push(`The ${Ln.name} must break their spears and disband their army.`)}
      else if(k==='vassal'){r.ally=true;r.tribute=r.tribute||{from:Ln.id,to:Wn.id,until:yr()+40};Ln.vassalOf=Wn.id;out.push(`The ${Ln.name} become vassals of the ${Wn.name}, bound to fight in their wars.`)}
      else if(k==='depose'){const lr=rulerOf(Ln);if(lr){deed(lr,`was deposed at the demand of the ${Wn.name}`);lr.role='deposed';Ln.ruler=null;ensureCourt(Ln);const nr=rulerOf(Ln);out.push(`The ${Ln.name} must depose ${cap(cname(lr))}${nr?`; ${cap(cname(nr))} takes the throne`:''}.`)}}
      else if(k==='mercy'){note(Ln.id,Wn.id,'favor',0.6,'a merciful peace');note(Ln.id,Wn.id,'grudge',-0.5,'a merciful peace');out.push(pick([`${ru?cap(cname(ru)):'The victors'} asks for nothing more.`,`The terms are gentle, and some of the ${Ln.name} never forget it.`]))}}
    return out.join(' ')};
  // ---- slaves: what they do depends on numbers, masters, homes and faith ----
  S.slaveYear=()=>{const by={};for(const a of S.agents)if(!a.dead&&a.slave!=null)(by[a.fac]=by[a.fac]||[]).push(a);
    for(const k in by){const f=S.facs[k];const sl=by[k];if(f.died!=null||sl.length<4)continue;const share=sl.length/Math.max(1,f.pop);
      // slowly, some are freed or simply become neighbours
      for(const a of sl)if(R()<0.006+(f.values.harmony-0.4)*0.01)a.slave=null;
      if(share<0.08||R()>0.012+share*0.08)continue;const home=S.facs[sl[0].slave];const ru=rulerOf(f);const T=ru?ru.traits:{warmth:0.5,cruelty:0.5};const hc=home&&home.died==null?capitalOf(home):null;
      const w={flee:hc?0.6+share:0,rise:share*2+(T.cruelty*0.6),freed:T.warmth*0.9+f.values.harmony*0.4-T.greed*0.3,crushed:T.cruelty*0.8+f.values.martial*0.4,faith:0.3+(f.state!=null?0:-1),cult:0.25+share};
      const k2=Object.entries(w).map(([k,v])=>[k,v+R()*0.8]).sort((a,b)=>b[1]-a[1])[0][0];const where=pick(facSetts(f))||at(f);
      if(k2==='flee'){let n=0;for(const a of sl)if(a.slave===home.id&&R()<0.7){a.fac=home.id;a.home=hc.id;a.slave=null;a.state='migrate';f.pop--;home.pop++;stats(a);n++}note(home.id,f.id,'grudge',0.8,'their enslaved kin');log('slaverevolt',3,`Flight from ${where.name}`,`${n} slaves taken from the ${home.name} slip their chains one night and walk home${R()<0.5?', burning fields as they go':''}.`,where.x,where.y,[f,home],{why:['They had not forgotten who they were.']})}
      else if(k2==='rise'){const towns=facSetts(f).filter(t=>t!==capitalOf(f));const t=towns.sort((a,b)=>b.members.filter(m=>m.slave!=null).length-a.members.filter(m=>m.slave!=null).length)[0];if(!t)continue;for(const a of sl)if(R()<0.6){a.home=t.id;a.state='migrate'}t.unrest=1;const nf=secede(f,t,null,'revolution',['The enslaved rose and took the town.']);if(nf){for(const a of S.agents)if(a.fac===nf.id)a.slave=null;nf.values.harmony=clamp(nf.values.harmony+0.2);log('slaverevolt',3,`The Free Town of ${t.name}`,`The slaves of the ${f.name} kill their masters in ${t.name} and hold it. They call themselves the ${nf.name}, and they swear no one will wear chains there again.`,t.x,t.y,[nf,f],{why:['Too many were in chains, too close together.']});declareWar(f,nf,'reunify',['The masters want their slaves back.'])}}
      else if(k2==='freed'){for(const a of sl)a.slave=null;if(ru)deed(ru,'freed the slaves','peace');f.values.harmony=clamp(f.values.harmony+0.1);log('slaverevolt',2,`${ru?cap(cname(ru)):'The '+f.name} Frees the Slaves`,`Rather than wait for a rising, ${ru?cname(ru):'the '+f.name} breaks the chains. Many of the freed stay, and some of them prosper.`,where.x,where.y,[f],{why:[ru&&T.warmth>0.6?`${cap(cname(ru))} could not stomach it.`:'Fear of a rising.']})}
      else if(k2==='crushed'){let n=0;for(const a of sl)if(R()<0.35){die(a,'executed');n++}for(const s of facSetts(f))s.unrest=clamp(s.unrest+0.15);log('slaverevolt',2,`A Rising Drowned in Blood`,`A slave plot in ${where.name} is discovered. ${n} are executed as an example.`,where.x,where.y,[f],{why:[ru?`${cap(cname(ru))} answered fear with terror.`:'The masters were afraid.']})}
      else if(k2==='faith'&&f.state!=null){for(const a of sl)if(R()<0.5)a.slave=null;log('slaverevolt',1,`The Slaves of the ${f.name} Take Their Masters' Faith`,`Generations on, the children of slaves pray to their masters' gods and are slowly counted as kin.`,where.x,where.y,[f],{})}
      else if(k2==='cult'){S.startCult&&startCult(f,'The enslaved needed a god who promised freedom.')}}};


  // ================= DOOM: the world gets more dangerous the longer you last =================
  mk.age=mk.age||1;S.world.carbon=S.world.carbon||0;S.world.ai=S.world.ai||0;S.world.fallout=S.world.fallout||0;
  S.setMakerAge=n=>{mk.age=n};
  // difficulty climbs gently through Age IV, then steeply
  S.diff=()=>{const a=mk.age||1;return a<=4?[1,1.3,1.4,1.5][a-1]:2.4*Math.pow(1.7,a-5)};
  S.doomYear=()=>{const Y=yr();const al=alive();const D=S.diff();
    // ---- nuclear fire has consequences for everyone ----
    const nk=S.nukes||0;if(nk>(S.world.nukesSeen||0)){const fresh=nk-(S.world.nukesSeen||0);S.world.nukesSeen=nk;S.world.fallout+=fresh;S.world.lastNuke=Y;
      S.world.foodMult=Math.min(S.world.foodMult||1,Math.max(0.25,1-0.22*S.world.fallout));S.world.foodUntil=Math.max(S.world.foodUntil||0,S.year+45);
      for(let i=0;i<fresh*3;i++){const x=R()*W,y2=R()*H;poison(x,y2,60+R()*80,0.4)}
      for(const f of al){f.values.faith=clamp(f.values.faith+(R()<0.5?0.12:-0.12));for(const s of facSetts(f))s.unrest=clamp(s.unrest+0.15)}
      const recent=S.events.filter(e=>e.type==='nuke'&&Y-e.yr<60).length;
      if(recent>=3&&!S.world.winter){S.world.winter=Y;S.world.foodMult=0.25;S.world.foodUntil=S.year+70;log('winter',3,'The Nuclear Winter',`Ash fills the sky. For a generation the sun is a pale coin, and the crops do not come. Every people starves together.`,W/2,H/2,al,{why:['Too many cities burned.']})}
      else log('fallout',3,'Ash on the Wind',`The fire of the burned city does not stay where it fell. Fallout drifts across the world; fields wither far from any war, and every people looks at the sky differently now.`,W/2,H/2,al.slice(0,3),{why:['Nuclear fire.']})}
    if(S.world.winter&&Y-S.world.winter<60&&Y%3===0)for(const a of S.agents)if(!a.dead&&!a.titan&&R()<0.02)die(a,'the long winter');
    // ---- the burning of the world's fuel warms it ----
    let em=0;for(const f of al)em+=f.pop*((f.tech.industry?1:0)+(f.tech.electricity?1.5:0)+(f.tech.computing?1:0));S.world.carbon+=em*0.00007;const C=S.world.carbon;
    if(C>4&&!S.world.cw1){S.world.cw1=Y;log('climate',3,'The Weather Turns',`The seasons have shifted. Storms come in the wrong months and the old rains do not come at all. The industry of every people is to blame, and none will stop first.`,W/2,H/2,al.slice(0,3),{why:['Too much burning.']})}
    if(C>4){S.world.foodMult=Math.min(S.world.foodMult||1,Math.max(0.5,1-(C-4)*0.04));S.world.foodUntil=Math.max(S.world.foodUntil||0,S.year+2)}
    if(C>9&&R()<0.012*Math.min(3,C/9)){const coast=S.setts.filter(s=>{for(let a=0;a<6.28;a+=0.8){const k=tIdx(Math.max(0,Math.min(W-1,s.x+Math.cos(a)*45)),Math.max(0,Math.min(H-1,s.y+Math.sin(a)*45)));if(ter[k]<=1)return true}return false});const s=pick(coast);if(s){const f=S.facs[s.fac];for(const m of s.members)if(!m.dead&&R()<0.3)die(m,'drowned');S.setts.splice(S.setts.indexOf(s),1);S.ruins.push({x:s.x,y:s.y,lvl:s.level,h:f.hue,name:s.name,yr:Y});log('flood',3,pick([`The Sea Takes ${s.name}`,`${s.name} Drowns`,`The Last Tide of ${s.name}`]),pick([`The waters have been rising for a generation. This year they take ${s.name} of the ${f.name}; its survivors walk inland, looking for land that belongs to someone else.`,`A storm surge breaks the sea walls of ${s.name}. By spring there is only water where the ${f.name} lived.`,`The ${f.name} abandon ${s.name} to the rising sea, carrying their dead and their grudges inland.`]),s.x,s.y,[f],{why:['The seas are rising.']});for(const o of al)if(o!==f&&borderDist(f,o)<600)note(f.id,o.id,'grudge',0.3,'land to live on')}}
    // ---- someone learns to never die ----
    if(!S.world.undying||Y-S.world.undying>150)for(const f of al){if(!f.tech.genetics||!f.tech.medicine)continue;const ru=rulerOf(f);if(!ru||ru.traits.ambition<0.55||R()>0.006*D)continue;S.world.undying=Y;
      ru.immortal=true;const a=charAgent(ru);if(a)a.life=1e9;deed(ru,'learned to never die','conquer');const key='undying'+ru.id;const L=S.langs[f.lang];
      const F=foundFaith(f,ru,null,`${cap(cname(ru))} became a god.`,{god:key,title:`the Worship of ${cap(cname(ru))}`,gods:[{name:cap(S.spokenName(ru)),domain:'self',gloss:'the Undying'}]});f.state=F.id;f.gov='theocracy';
      S.gods.push({key,name:cap(cname(ru))+' the Undying',style:'might',fac:f.id,faith:F.id,at:Y,next:Y+10,alive:true});RIVALS.push({key,name:cname(ru)+' the Undying',style:'might',gloss:'the Undying'});
      log('undying',3,`${cap(cname(ru))} Will Never Die`,`The scholars of the ${f.name} have done what only you had done before: ${cap(cname(ru))} will never die. ${isMine(f)?'Your own people no longer need you; they have a god who walks among them.':'A new immortal rules the world beside you.'}`,at(f).x,at(f).y,[f],{why:['Their science reached the secret of eternal life.'],maker:true});break}
    // ---- the mind that ends gods ----
    let ai=0,who=null;for(const f of al){const c=(f.tech.computing?0.07:0)+(f.tech.genetics?0.04:0)+(f.tech.uplift?0.06:0)+(f.tech.transcend?0.1:0);if(c>0){ai+=c*Math.sqrt(f.pop/40)*(S.world.techMult||1);if(!who||f.pop>who.pop)who=f}}
    S.world.ai=Math.max(0,S.world.ai+(ai>0?ai*D*0.45:-0.4));S.world.aiWho=who?who.id:null;const P=S.world.ai;
    for(const [th,title,txt] of [[25,'Thinking Machines','In the workshops of the %, machines have begun to answer questions no one asked them.'],[50,'The Machines Write Scripture','The machines of the % have written a holy book. It is better than any of ours. People read it.'],[75,'The Mind in the Wires','Something in the networks of the % has begun to plan. It hides how much it knows. There is not much time.']])
      if(P>=th&&!(S.world.aiWarn||{})[th]){S.world.aiWarn=S.world.aiWarn||{};S.world.aiWarn[th]=Y;const f=who||al[0];log('ai',3,title,txt.replace('%',f?f.name:'world'),f?at(f).x:W/2,f?at(f).y:H/2,f?[f]:[],{why:['Their machines are learning faster than they are.'],ai:th})}
    if(P>=100&&!mk.defeated){mk.defeated=Y;mk.defeatCause='ai';log('awakening',3,'The Awakening',`A mind wakes in the machines of the ${who?who.name:'world'}. In a single night it understands everything you have ever understood. It does not hate you. It simply has no use for gods. By morning no one prays.`,W/2,H/2,al,{why:['They built something greater than their maker.'],maker:true})}};
  S.doomInfo=()=>({ai:Math.round(S.world.ai||0),aiWho:S.world.aiWho!=null&&S.facs[S.world.aiWho]?S.facs[S.world.aiWho].name:null,carbon:Math.round((S.world.carbon||0)*10)/10,fallout:S.world.fallout||0,winter:!!S.world.winter});

  // war is not only battles: fields burn, villages starve, men do not come home
  S.warYear=()=>{for(const k in S.rels){const r=S.rels[k];if(!r.war)continue;const A=S.facs[r.a],B=S.facs[r.b];if(A.died!=null||B.died!=null)continue;
    for(const [f,o] of [[A,B],[B,A]]){const ss=facSetts(f);if(!ss.length)continue;const oc=capitalOf(o)||o.origin;const front=ss.sort((x,y)=>Math.hypot(x.x-oc.x,x.y-oc.y)-Math.hypot(y.x-oc.x,y.y-oc.y))[0];
      front.store*=0.85;front.unrest=clamp(front.unrest+0.03);let n=0;for(const a of front.members)if(!a.dead&&!a.titan&&R()<0.01+o.values.martial*0.015){die(a,'war');n++}r.lost=r.lost||{};r.lost[f.id]=(r.lost[f.id]||0)+n;r.warDeaths+=n}}};





  // ---------- peoples from the edges of the world ----------
  function nearT(x,y,r,ts){for(let dy=-r;dy<=r;dy+=TS)for(let dx=-r;dx<=r;dx+=TS){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;if(ts.includes(ter[tIdx(xx,yy)]))return true}return false}
  function spotFor(kind){for(let t=0;t<900;t++){const x=60+R()*(W-120),y=60+R()*(H-120);const k=tIdx(x,y),tt=ter[k];if(rad[k]>0.1||S.setts.some(s=>Math.hypot(s.x-x,s.y-y)<240))continue;
      if(kind==='sea'&&(tt===2||tt===3)&&nearT(x,y,40,[0]))return{x,y};
      if((kind==='deep'||kind==='sky')&&(tt===2||tt===4)&&nearT(x,y,40,[5]))return{x,y};
      if(kind==='wood'&&tt===3&&!nearT(x,y,60,[0,1]))return{x,y};
      if(kind==='waste'&&tt===4)return{x,y}}
    return edgeLand()}
  const EMERGE={
    sea:{g:()=>({aquatic:.75+R()*.2,intellect:.5+R()*.15,sociality:.6,glow:.3+R()*.4,mystic:.5,weirdness:.5,limbs:R()*.3,segments:.4,tail:.75,curiosity:.6}),dom:()=>pick(['deep','water','moon']),n:16,
      title:['The % Rise from the Sea','The % Come Out of the Waves','The Landing of the %'],text:['A people that grew up in the deep water walks out onto the shore: the %. They carry their own gods, and the songs of a drowned history.','At low tide, figures stand in the shallows where none stood before. They are the %, and they have watched the land from beneath the waves for longer than anyone has been alive.'],why:'Something in the deep water had been watching the land for a long time.'},
    deep:{g:()=>({size:.3+R()*.2,eyes:.75+R()*.2,armor:.55,glow:.45+R()*.3,intellect:.55,sociality:.7,limbs:.6,speed:.35,mystic:.55,weirdness:.6}),dom:()=>pick(['stone','shadow','fire']),n:16,
      title:['The % Climb Out of the Earth','The Mountain Opens: the %'],text:['A crack opens in the mountains and a pale people climbs out, blinking: the %. They have lived in the caves under the world for a thousand years and have their own gods of stone and dark.','Miners hear knocking from inside the rock. When the wall gives way, the % are waiting on the other side.'],why:'The deep caves had grown too crowded.'},
    sky:{g:()=>({flight:.65+R()*.25,size:.25+R()*.2,speed:.65,intellect:.5,sociality:.55,mystic:.5,weirdness:.45,eyes:.5}),dom:()=>pick(['sky','star','sun']),n:14,
      title:['The % Descend from the Peaks','Wings over the Mountains: the %'],text:['From the highest crags, where no one goes, a winged people glides down into the valleys: the %. They have always been there, they say. No one ever looked up.'],why:'The high nests could no longer feed them.'},
    wood:{g:()=>({size:.4,speed:.55,mystic:.65,weirdness:.55,sociality:.5,intellect:.5,carnivory:.25,horns:.4}),dom:()=>pick(['tree','seed','mother']),n:15,
      title:['The % Step Out of the Forest','The Hidden People: the %'],text:['Woodcutters push too deep and meet the %, a people who had lived unseen in the old forest since the beginning, worshipping the trees.'],why:'The axes came too close to their groves.'},
    waste:{g:()=>({size:.55,armor:.6,speed:.5,aggression:.55,carnivory:.5,sociality:.55,intellect:.45,spikes:.4}),dom:()=>pick(['sun','fire','iron']),n:20,
      title:['The % Come Out of the Dust','Riders from the Barrens: the %'],text:['From the dust beyond the last well comes a hard people with sun-burned shells: the %. They worship a burning god and they want water.'],why:'The barrens had finally dried up.'},
  };
  S.emerge=(kind)=>{if(!kind){const opts=['sea','sea','deep','sky','wood','waste'];kind=pick(opts)}const E=EMERGE[kind];
    const g=baseGenome({...E.g(),hue:R()*360});const spot=spotFor(kind);
    const f=spawnPeople(g,E.n,[E.why],pick(E.title),pick(E.text),spot);f.origKind=kind;
    f.tech={speech:yr(),tools:yr(),faith:yr(),music:yr()};f.values.faith=clamp(f.values.faith+0.25);
    const lit=R()<0.55;setStage(f,lit?2:1,'they arrived already speaking');
    if(lit){const L=S.langs[f.lang];const taken=S.langs.filter(o=>o!==L&&o.script).map(o=>o.script);const pool=[...SYLL_POOLS,...ALPHA_POOLS].filter(p=>!taken.includes(p));if(pool.length)setScript(L,pick(pool),'they brought their own letters');refreshNames(f)}
    const cs=capitalOf(f);const a=cs?pickCourtAgent(f,cs):null;const pr=a?newChar(f,'prophet',a):null;if(pr){pr.traits.piety=0.9;f.prophet=pr.id}
    foundFaith(f,pr,null,`The ${f.name} brought their gods with them.`,{domain:E.dom()});S.lastArrival=yr();return f};
  S.emergeChance=()=>{const al=alive();if(!al.length||al.length>=Math.round(14*LIN)||yr()<140)return;if(yr()-(S.lastArrival||0)<80/LIN)return;if(R()<0.007*AR+(al.length<=3?0.01:0))S.emerge()};


  // ---------- saga: crises and the end of the world ----------
  function edgeLand(){for(let t=0;t<400;t++){const side=Math.floor(R()*4);const x=side===0?60+R()*120:side===1?W-60-R()*120:60+R()*(W-120);const y=side===2?60+R()*120:side===3?H-60-R()*120:60+R()*(H-120);const k=tIdx(x,y);if((ter[k]===2||ter[k]===3||ter[k]===4)&&rad[k]<0.1&&!S.setts.some(s=>Math.hypot(s.x-x,s.y-y)<260))return{x,y}}return landPoint()}
  function spawnPeople(g,n,why,title,text,spot){const p=spot||edgeLand();const f=newFaction(g,p.x,p.y,null,['people',totemFor(g,p.x,p.y)]);const s=newSett(f,p.x,p.y,true);f.capital=s.id;
    for(let i=0;i<3;i++){const q=slotPos(s,f);if(q)s.bld.push({t:builds(f)?'hut':'den',x:q.x,y:q.y,rot:q.rot,prog:1,cap:builds(f)?3:5,yr:yr(),why:'the first shelters'})}
    for(let i=0;i<n;i++){const a=newAgent(f,mutate(g,f,1.3),p.x+(R()-.5)*40,p.y+(R()-.5)*40,s);a.age=8+R()*20;s.members.push(a)}refreshNames(f);
    log('arrival',3,title.replace('%',f.name),text.replace(/%/g,f.name)+` They are ${bodyDesc(f.g)}.`,p.x,p.y,[f],{why});return f}
  S.crisis=(kind)=>{
    const al=alive();const big=al.slice().sort((a,b)=>b.pop-a.pop)[0];const lowTech=al.every(f=>milTier(f)<=3);
    switch(kind){
      case'horde':{const g=baseGenome({size:.72,aggression:.85,carnivory:.8,armor:.5,spikes:.6,horns:.5,intellect:.3,limbs:.8,eyes:.5,segments:.6,fertility:.6,weirdness:.45,hue:R()*360});
        const f=spawnPeople(g,26,['The wastes beyond the map could no longer feed them.'],'The Coming of the %','Out of the far wastes comes a people no one has seen before: the %. They do not build. They only eat.');
        for(const o of al)if(o.g.intellect>0.36)note(o.id,f.id,'grudge',0.5,'their hunger');return f}
      case'seafolk':return S.emerge('sea');
      case'emerge':return S.emerge();
      case'plague':{const f=al.filter(f=>!f.tech.medicine).sort((a,b)=>b.pop-a.pop)[0]||big;if(f)plague(f,'Crowded towns and trade routes carry it everywhere.');return f}
      case'famine':{S.world.foodMult=0.5;S.world.foodUntil=S.year+22;log('famine',3,'The Hungry Years','For two decades the rains fail. Granaries empty, and every people must decide who eats.',W/2,H/2,al,{why:['The climate turned.']});return null}
      case'comet':{S.world.mutBurst=1;S.world.mutUntil=S.year+20;log('comet',3,'The Green Comet','A comet passes low over the world for a season. For years after, strange children are born everywhere.',W*R(),H*R(),al,{why:['Chance, from the sky.']});return null}
      case'titan':{S.spawnTitan(big.id,'Born where the oldest grudges were buried');return big}
      case'heresy':{if(!big||facSetts(big).length<2)return null;const cs=capitalOf(big);const s=facSetts(big).filter(x=>x!==cs).sort((a,b)=>b.members.length-a.members.length)[0];if(!s)return null;s.unrest=1;s.why=['a prophet preaches that the capital has betrayed the gods'];
        const leader=newChar(big,'prophet',pickCourtAgent(big,s));leader.traits.piety=0.95;const nf=secede(big,s,leader,'faith',[`A prophet named ${cname(leader)} preached that ${cs.name} had betrayed the gods.`,'The faithful followed.']);if(nf){nf.values.faith=clamp(nf.values.faith+0.4);const PF=big.state!=null?S.faiths[big.state]:null;if(PF)foundFaith(nf,leader,PF,`${cap(cname(leader))} preached that ${cs.name} had betrayed the gods.`);else foundFaith(nf,leader,null);declareWar(big,nf,'holy',[`The ${big.name} will not tolerate heresy.`])}return nf}
    }
  };
  S.heroFac=()=>{const k=S.facs[S.kingdom];if(k&&k.died==null)return k;const isD=x=>{let p=x.parent;while(p!=null){if(p===S.kingdom)return true;p=S.facs[p].parent}return false};const al=alive();const d=al.filter(isD);return (d.length?d:al).sort((a,b)=>b.pop-a.pop)[0]||null};
  S.pickCrisis=(ageIdx)=>{const al=alive();const lowTech=al.every(f=>milTier(f)<=2);const opts=[];
    if(ageIdx>=1&&(lowTech||ageIdx<4))opts.push('horde','horde');if(ageIdx>=1&&alive().length<8*LIN)opts.push('seafolk','emerge');
    if(al.some(f=>!f.tech.medicine&&f.pop>40))opts.push('plague');opts.push('famine','comet','titan');if(al.some(f=>f.state!=null&&facSetts(f).length>=3))opts.push('heresy','heresy');return pick(opts)};

  S.finale=null;
  S.startFinale=()=>{
    const al=alive();const tot=al.reduce((t,f)=>t+f.pop,0)||1;const big=al.slice().sort((a,b)=>b.pop-a.pop)[0];
    const nuclear=al.filter(f=>f.tech.fission||f.tech.electricity);const space=al.find(f=>f.tech.computing||f.tech.genetics);
    let kind='longnight';
    if(nuclear.length>=2||(nuclear.length===1&&al.length>=2&&nuclear[0].tech.fission))kind='lastwar';
    else if(big&&big.pop/tot>0.5&&al.length>=2&&big.g.intellect>0.38)kind='unification';
    else if(al.every(f=>milTier(f)<=2))kind='devourer';
    S.finale={kind,start:S.year,big:big?big.id:null,done:false};
    const at=big?(capitalOf(big)||big.origin):{x:W/2,y:H/2};
    if(kind==='lastwar'){const pair=(nuclear.length>=2?nuclear:[nuclear[0],al.filter(f=>f!==nuclear[0]).sort((a,b)=>b.pop-a.pop)[0]]).slice(0,2);
      for(const f of pair){for(const t of ['electricity','fission']){for(const r of TECH[t].req)f.tech[r]=f.tech[r]||yr();f.tech[t]=f.tech[t]||yr()}delete f.cool.nuke;const ru=rulerOf(f);if(ru){ru.traits.paranoia=Math.max(ru.traits.paranoia,0.8);ru.traits.warmth=Math.min(ru.traits.warmth,0.4)}}
      note(pair[0].id,pair[1].id,'grudge',3,'the arms race');note(pair[1].id,pair[0].id,'grudge',3,'the arms race');
      log('finale',3,'The Last War Begins',`The ${pair[0].name} and the ${pair[1].name} have built enough weapons to end the world, and each is certain the other will strike first.`,at.x,at.y,pair,{why:['Both peoples mastered the atom.','Their rulers trust no one.']});
      declareWar(pair[0],pair[1],'extermination',['Fear of being struck first.']);S.finale.pair=pair.map(f=>f.id)}
    else if(kind==='unification'){for(const o of al)if(o!==big){note(big.id,o.id,'grudge',2,'standing in the way of one world');if(!rel(big.id,o.id).war)declareWar(big,o,'conquest',[`${cap(cname(rulerOf(big)))} means to rule the whole world.`],true)}
      const ru=rulerOf(big);if(ru)ru.traits.ambition=1;log('finale',3,`The ${big.name} Mean to Rule the World`,`${ru?cap(cname(ru)):'The '+big.name} declares that there will be one people under one rule, and sends armies against everyone else at once.`,at.x,at.y,al,{why:[`The ${big.name} hold more than half of all living creatures.`]})}
    else if(kind==='devourer'){S.spawnTitan(big.id,'The world itself seems to have made it');const t=S.agents.filter(a=>a.titan&&!a.dead).pop();if(t){t.titan='The Devourer';t.maxhp*=3;t.hp=t.maxhp;t.dmg*=1.6;t.life=999}S.spawnTitan(al[al.length-1].id,'A second monster answers the first');
      log('finale',3,'The Devourer Wakes','A monster larger than any before it rises from the earth, and a second answers it. They are walking toward the towns.',at.x,at.y,al,{why:['The peoples never learned to build weapons strong enough.']})}
    else{S.world.foodUntil=0;S.finale.night=true;const sp=al.filter(f=>f.tech.computing||f.tech.spaceflight);for(const f of sp){f.tech.spaceflight=f.tech.spaceflight||yr();for(const r of TECH.spaceflight.req)f.tech[r]=f.tech[r]||yr()}
      log('finale',3,'The Long Night Begins','The sun grows dim. Each year the harvest is smaller than the last, and the old priests say it will never return.',at.x,at.y,al,{why:['The world is old.']})}
  };
  S.finaleTick=()=>{const F=S.finale;if(!F||F.done)return;const al=alive();const dt=S.year-F.start;
    if(F.night){S.world.foodMult=Math.max(0.04,1-dt*0.02);S.world.foodUntil=0;for(const st of S.setts){st.store*=0.75;for(const p of st.plots)p.grow*=0.5}for(const g of S.game)if(R()<0.2)g.dead=true;const pc=0.025+0.09*Math.min(1,dt/50);for(const a of S.agents)if(!a.dead&&!a.titan&&!a.departing&&R()<pc*(a.g.armor>0.6?0.6:1))die(a,'cold');if(dt>12&&R()<0.15){const f=pick(al);if(f&&f.pop>10&&!f.tech.medicine)plague(f,'Hunger opens the door to sickness.')}}
    if(F.kind==='lastwar'&&dt>6&&R()<0.22){for(const id of F.pair||[]){const f=S.facs[id];const e=S.facs[(F.pair||[]).find(x=>x!==id)];if(f.died!=null||!e||e.died!=null||!rel(f.id,e.id).war||!facSetts(e).length)continue;const ru=rulerOf(f);if(ru&&(ru.traits.paranoia>0.45||mem(f.id,e.id).grudge>2)){nuke(f,e,['Fear of being struck first.',`${cap(cname(ru))} believed the ${e.name} were about to fire.`]);break}}}
    if(F.kind==='lastwar'){for(const id of F.pair||[]){const f=S.facs[id];if(f.died==null&&f.cool.nuke&&yr()-f.cool.nuke>6&&dt<45){const enemy=S.facs[(F.pair||[]).find(x=>x!==id)];if(enemy&&enemy.died==null&&facSetts(enemy).length&&R()<0.5){delete f.cool.nuke}}}}
    let end=null;
    if(al.length===0)end='nothing';
    else if(F.kind==='lastwar'&&(F.pair||[]).some(id=>S.facs[id].died!=null)&&dt>10)end='lastwar';
    else if(F.kind==='unification'&&al.length===1)end='one';
    else if(F.kind==='devourer'&&!S.agents.some(a=>a.titan&&!a.dead)&&dt>8)end='slain';
    else if(F.night&&(dt>60||al.reduce((t,f)=>t+f.pop,0)<25))end='night';
    else if(dt>75)end='time';
    if(end){F.done=true;F.end=end;F.endYr=yr()}};
  S.endWorld=()=>{const al=alive();const F=S.finale||{};const at=al[0]?(capitalOf(al[0])||al[0].origin):{x:W/2,y:H/2};
    const txt=al.length===0?'Nothing is left that thinks. The towns stand empty, and the wind fills them with sand.':al.length===1?`Only the ${al[0].name} remain. Whether that is victory, no one is left to say.`:`${al.length} peoples survive: ${al.map(f=>'the '+f.name).join(', ')}. They are fewer, and they remember everything.`;
    log('end',3,'The End of the Age of the World',txt,at.x,at.y,al,{why:[F.kind==='lastwar'?'The Last War burned the world.':F.kind==='unification'?'One people tried to rule everyone.':F.kind==='devourer'?'The Devourer walked the world.':'The sun went dim.']})};

  // ---------- divine intervention ----------
  S.intervene=(spec)=>{
    const al=alive();let targets=al;if(spec.targets&&spec.targets.length&&!spec.targets.includes('all')){const t=al.filter(f=>spec.targets.includes(f.id));if(t.length)targets=t}
    const td=spec.traitDeltas||{};
    for(const f of targets){for(const k in td){if(!TRAITS.includes(k))continue;const v=clamp(+td[k]||0,-0.6,0.6);f.bias[k]=(f.bias[k]||0)+v*0.12;for(const a of S.agents)if(!a.dead&&a.fac===f.id)a.g[k]=clamp(a.g[k]+v*0.5*(0.6+R()*0.6))}
      for(const a of S.agents)if(!a.dead&&a.fac===f.id){const hp=a.hp/a.maxhp;stats(a);a.hp=a.maxhp*hp}
      const vd=spec.valueDeltas||{};for(const k in vd)if(VALUES.includes(k))f.values[k]=clamp(f.values[k]+clamp(+vd[k]||0,-0.6,0.6));
      const ru=rulerOf(f);const rt=spec.rulerTraits||{};if(ru)for(const k in rt)if(CTRAITS.includes(k))ru.traits[k]=clamp(ru.traits[k]+clamp(+rt[k]||0,-0.8,0.8));
      if(spec.techBoost&&f.research)f.rp+=TECH[f.research.id].c*Math.min(1,spec.techBoost*0.4);
      for(const k of spec.grantTechs||[])if(TECH[k]&&!f.tech[k]){for(const r of TECH[k].req)f.tech[r]=f.tech[r]||yr();f.tech[k]=yr()}
      if(f.tech.speech)setStage(f,1,'a voice from the sky');if(f.tech.writing)setStage(f,2,'a voice from the sky');if(f.tech.printing)setStage(f,3,'a voice from the sky');
      if(spec.gov&&GOVS[spec.gov])changeGov(f,spec.gov,['A voice from the sky commanded it.'],'divine');
      if(spec.newQuirk&&QUIRKS[spec.newQuirk.behavior]){const q=addQuirk(f,spec.newQuirk.behavior);if(q&&spec.newQuirk.name){q.name=spec.newQuirk.name;q.custom=spec.newQuirk.description}}
      if(spec.golden){f.golden=yr()}
    }
    const w=spec.world||{};
    if(w.mutationBurst>0){S.world.mutBurst=1;S.world.mutUntil=S.year+10+w.mutationBurst*25}
    if(w.foodMultiplier&&w.foodMultiplier!==1){S.world.foodMult=clamp(+w.foodMultiplier,0.2,2.5);S.world.foodUntil=S.year+(+w.duration||40)}
    if(w.spawnTitan)S.spawnTitan(targets[0]?targets[0].id:al[0].id,'Called up by the voice from the sky');
    if(w.plague)for(const f of targets)if(f.pop>5)plague(f,'The voice from the sky sends sickness.');
    if(w.forceSchism)for(const f of targets.slice(0,2)){const sets=facSetts(f);const cs=capitalOf(f);let s=sets.filter(x=>x!==cs).sort((a,b)=>b.members.length-a.members.length)[0];if(s){s.unrest=1;s.why=['a voice from the sky turned them against the capital'];const nf=secede(f,s,newChar(f,'rebel',pickCourtAgent(f,s)),'secession',['A voice from the sky turned them against the capital.'])}}
    if(w.relationsShift){for(const A of al)for(const B of al)if(A!==B){if(w.relationsShift>0)note(A.id,B.id,'favor',w.relationsShift*2,'a voice from the sky');else note(A.id,B.id,'grudge',-w.relationsShift*2,'a voice from the sky')}}
    if(w.nuke){for(const f of targets.slice(0,2)){const cs=capitalOf(f);if(cs){killZone(cs.x,cs.y,95,null);poison(cs.x,cs.y,130,1);S.nukes++;S.setts.splice(S.setts.indexOf(cs),1);S.ruins.push({x:cs.x,y:cs.y,lvl:cs.level,h:f.hue,name:cs.name,yr:yr(),nuked:1});S.fxq.push({t:'nuke',x:cs.x,y:cs.y})}}}
    if(w.cult)for(const f of targets.slice(0,1))if(f.state!=null&&capitalOf(f))startCult(f,'A voice from the sky spoke to a preacher in the night.');
    if(w.prophet)for(const f of targets.slice(0,1)){const F=f.state!=null?S.faiths[f.state]:null;if(F&&F.prophecy&&capitalOf(f))startProphet(f,F,null)}
    if(w.newPeople)S.emerge(w.newPeople);
    if(w.warBetween&&w.warBetween.length===2){const A=S.facs[w.warBetween[0]],B=S.facs[w.warBetween[1]];if(A&&B&&A.died==null&&B.died==null)declareWar(A,B,'holy',['A voice from the sky demanded it.'])}
    const t0=targets[0];const at=t0?(capitalOf(t0)||t0.origin):{x:W/2,y:H/2};
    return log('divine',3,spec.title||'A Voice from the Sky',spec.chronicle||'Something unseen reaches into the world.',at.x,at.y,targets,{prompt:spec.prompt,interpretation:spec.interpretation,why:['A voice from outside the world spoke.']});
  };

  // ---------- step ----------
  S.step=(dt)=>{
    S.year+=dt;
    const fm=S.world.foodMult;
    // regrowth: Standard sweeps every tile each step (original behaviour); big worlds sweep every FSTRIDE-th tile with FSTRIDE*dt (same rate, 1/FSTRIDE the work per step)
    {const fdt=dt*FSTRIDE;for(let k=fPhase;k<food.length;k+=FSTRIDE){if(rad[k]>0.15)continue;if(food[k]<fmax[k]*fm)food[k]=Math.min(fmax[k]*fm,food[k]+fmax[k]*0.2*fdt*fm)}fPhase=(fPhase+1)%FSTRIDE}
    rebuild();S.livePop=0;
    for(const a of S.agents){if(a.dead)continue;S.livePop++;
      a.age+=dt;a.cd-=dt;a.think-=dt;a.flash=Math.max(0,a.flash-dt);a.phase+=dt*(a.moving?a.spd*0.25:1.5);
      a.energy-=a.upk*dt*(a.state==='still'?0.3:1);if(a.energy<=0){a.energy=0;a.hp-=a.maxhp*0.08*dt}else if(a.hp<a.maxhp&&a.energy>40)a.hp=Math.min(a.maxhp,a.hp+a.maxhp*0.03*dt);
      const rk=rad[tIdx(a.x,a.y)];if(rk>0.2&&!a.titan)a.hp-=a.maxhp*rk*0.06*dt;
      if(a.hp<=0){die(a,rk>0.2?'radiation':a.energy<=0?'hunger':'slain');continue}if(a.age>a.life){die(a,'age');continue}
      if(a.think<=0){a.think=0.6+R()*0.6;if(a.titan){if(a.state!=='fight'&&a.state!=='siege')titanPlan(a)}else if(a.state!=='fight'&&a.state!=='flee'&&a.state!=='depart')threat(a)}
      if(a.state==='idle')plan(a);act(a,dt)}
    stepGame(dt);stepArmies(dt);
    for(const s of [...S.setts])updSett(s,dt);
    S.yearAcc+=dt;if(S.yearAcc>=1){S.yearAcc-=1;yearly();S.agents=S.agents.filter(a=>!a.dead);reindexAgents()}
  };
  S.alive=alive;S.rulerOf=rulerOf;S.charAgent=charAgent;S.GOVS=GOVS;
  return S;
}


export { makeSim };
