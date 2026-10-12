import { connectGame } from '../ai';
import { b64ToU8, restoreSim, snapshotSim, taToB64 } from '../sim/persist.js';
import { makeSim } from '../sim/sim.js';
import { texScale, buildTerrainCanvas, drawBeast, drawCreature, drawGroundDetail, drawRuin, drawTown, drawWonder, portrait } from '../render/draw.js';
import { WORLD_SIZES, DEFAULT_WORLD_SIZE, ARCH, CONCEPTS, CTRAITS, CTRAIT_WORD, GLOSS, TECH, TRAITS, TRAIT_LABEL, VALUES, VALUE_LABEL, bodyDesc, cap, clamp, creatureGenome, lerp, mulberry32 } from '../sim/data.js';
import { SCRIPT_INFO, writeScript } from '../sim/scripts.js';

// ================= APP =================
var CURYEAR=0;
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cv=$('#cv'),ctx=cv.getContext('2d');
let S,terrainC,marksC,marksX,terrC,terrX,radC,radX,cam={x:1200,y:780,z:0.4},running=true,speed=1,T=0,sel=null,selSett=null,follow=false,parts=[],bookOpen=false,frameN=0,sampleFn=null,worldTitle='',autoSlow=true,effSpeed=1;

function hsl(h,s,l,a){return a==null?`hsl(${Math.round(h)},${s}%,${l}%)`:`hsla(${Math.round(h)},${s}%,${l}%,${a})`}
function colorWord(h){h=(h%360+360)%360;return h<15||h>=345?'red':h<40?'orange':h<65?'yellow':h<160?'green':h<195?'teal':h<255?'blue':h<290?'purple':'pink'}
const STAGE=['Pictographs','Spoken names','Syllabary','Alphabet'];
const techTier=f=>S.milTier(f)*1.5;
const BODY=0.34;

function newWorld(seed,P,creation,placeholder){
  S=P?restoreSim(P.sim,makeSim):makeSim(seed,creation?{creation,size:creation.size}:{});S.onEvent=onEvent;
  terrainC=buildTerrainCanvas(S);
  // layer canvases are capped near Standard's pixel count (texScale<1 on bigger worlds); marks are drawn in world units through a scale transform
  const ts=texScale(S);marksC=document.createElement('canvas');marksC.width=Math.round(S.W*ts);marksC.height=Math.round(S.H*ts);marksX=marksC.getContext('2d');marksX.setTransform(ts,0,0,ts,0,0);
  terrC=document.createElement('canvas');terrC.width=S.W/8;terrC.height=S.H/8;terrX=terrC.getContext('2d');
  radC=document.createElement('canvas');radC.width=S.GW;radC.height=S.GH;radX=radC.getContext('2d');
  const rr=mulberry32(seed+5);const sy=['Ka','Ve','Or','Thu','Mo','Ash','Ul','Sy','Dra','Ib','Xo','Pha','Lu'],en=['rim','thas','olon','ekka','uun','ria','gard','mere','vane'];
  worldTitle=sy[Math.floor(rr()*sy.length)]+en[Math.floor(rr()*en.length)];
  $('#worldName').textContent='The world of '+worldTitle+' · seed '+seed;
  sel=null;selSett=null;follow=false;parts=[];chronList.length=0;NEWS.length=0;newsDirty=true;openFac=null;lastPeoplesHTML='';
  if(P){chronFilter=P.chronFilter||2;if(P.marks){const im=new Image();im.onload=()=>marksX.drawImage(im,0,0,S.W,S.H);im.src=P.marks}updRad()}
  for(const e of S.events)chronList.push(e);renderChronicle();showInspect();startView();renderPeoples(true);if(typeof chapterOpen!=='undefined'){chapterOpen=false;$('#chapter').hidden=true}
  if(P)sagaRestore(P);else{sagaReset();SAVE.id=placeholder?null:newSaveId();SAVE.at=0;SAVE.where=''}skipping=false;choiceOpen=false;if($('#choice'))$('#choice').hidden=true;if(typeof renderHand==='function')renderHand();SAVE.lastLocal=performance.now();SAVE.dirty=true;saveUI();running=true;$('#play').textContent='Pause';
}
// ---------- chronicle ----------
const chronList=[];let chronFilter=2;
function onEvent(e){chronList.push(e);pushNews(e);if(e.imp>=chronFilter&&!$('#p-chron').hidden)prependEv(e)}
function evDots(e){return e.facs.map(id=>{const sn=e.snaps[id];return`<i style="background:${hsl(sn?sn.hue:S.facs[id].hue,60,55)}"></i>`}).join('')}
function evRow(e){const d=document.createElement('div');d.className='ev i'+e.imp;d.dataset.ev=e.id;const why=e.data&&e.data.why&&e.data.why.filter(Boolean)[0];d.innerHTML=`<div class="ey">${e.yr}</div><div><div class="et"><span class="dots">${evDots(e)}</span>${tagNames(esc(e.title))}</div><div class="ex">${tagNames(esc(e.text))}</div>${why?`<div class="why">Why: ${esc(why)}</div>`:''}</div>`;return d}
function prependEv(e){const list=$('#p-chron .evlist');if(!list)return;list.prepend(evRow(e));while(list.children.length>250)list.lastChild.remove();const em=list.querySelector('.empty');if(em)em.remove()}
function renderChronicle(){const p=$('#p-chron');p.innerHTML=`<div class="fil"><button type="button" class="btn${chronFilter===2?' on':''}" data-fil="2">Major events</button><button type="button" class="btn${chronFilter===1?' on':''}" data-fil="1">Everything</button></div><div class="evlist"></div>`;const list=p.querySelector('.evlist');const evs=chronList.filter(e=>e.imp>=chronFilter).slice(-250).reverse();for(const e of evs)list.append(evRow(e));if(!evs.length)list.innerHTML='<div class="empty">Nothing has happened yet. Give it a few years.</div>'}
$('#p-chron').addEventListener('click',ev=>{const f=ev.target.closest('[data-fil]');if(f){chronFilter=+f.dataset.fil;renderChronicle();return}const r=ev.target.closest('.ev');if(r){const e=S.events.find(x=>x.id==r.dataset.ev);if(e)flyTo(e.x,e.y,2.4)}});

// ---------- camera ----------
function vw(){return cv.clientWidth}function vh(){return cv.clientHeight}
function fitZ(){return Math.min(vw()/S.W,vh()/S.H)*0.98}
function fit(){cam.z=fitZ();cam.x=S.W/2;cam.y=S.H/2;follow=false}
function startView(){fit();const k=S.facs[S.kingdom];const cs=k&&S.capitalOf(k);if(cs){cam.z=Math.max(fitZ(),1.1);cam.x=cs.x;cam.y=cs.y;clampCam()}}
function clampCam(){const fz=fitZ();cam.z=clamp(cam.z,fz*0.85,28);const mx=Math.max(0,S.W/2-vw()/2/cam.z+100),my=Math.max(0,S.H/2-vh()/2/cam.z+100);cam.x=clamp(cam.x,S.W/2-mx,S.W/2+mx);cam.y=clamp(cam.y,S.H/2-my,S.H/2+my)}
let fly=null;function flyTo(x,y,z){fly={x,y,z:Math.max(z||cam.z,cam.z),t:0,sx:cam.x,sy:cam.y,sz:cam.z};follow=false}
function s2w(sx,sy){return{x:cam.x+(sx-vw()/2)/cam.z,y:cam.y+(sy-vh()/2)/cam.z}}
function zoomAt(sx,sy,f){const p=s2w(sx,sy);cam.z*=f;clampCam();const q=s2w(sx,sy);if(!follow){cam.x+=p.x-q.x;cam.y+=p.y-q.y}clampCam()}
$('#zin').onclick=()=>zoomAt(vw()/2,vh()/2,1.7);$('#zout').onclick=()=>zoomAt(vw()/2,vh()/2,1/1.7);$('#zfit').onclick=fit;
const ptrs=new Map();let down=null,pinch=null;
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.offsetX,y:e.offsetY});fly=null;
  if(ptrs.size===1)down={x:e.offsetX,y:e.offsetY,t:performance.now(),cx:cam.x,cy:cam.y,moved:false};
  else if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:cam.z};if(down)down.moved=true}cv.classList.add('drag')});
cv.addEventListener('pointermove',e=>{if(!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
  if(ptrs.size===2&&pinch){const [a,b]=[...ptrs.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;zoomAt(mx,my,pinch.z*d/pinch.d/cam.z);return}
  if(down){const dx=e.offsetX-down.x,dy=e.offsetY-down.y;if(Math.hypot(dx,dy)>5){down.moved=true;follow=false}if(down.moved){cam.x=down.cx-dx/cam.z;cam.y=down.cy-dy/cam.z;clampCam()}}});
function endPtr(e){if(!ptrs.has(e.pointerId))return;ptrs.delete(e.pointerId);
  if(down&&!down.moved&&ptrs.size===0&&performance.now()-down.t<500)tapAt(e.offsetX,e.offsetY);
  if(ptrs.size<2)pinch=null;if(ptrs.size===1){const p=[...ptrs.values()][0];down={x:p.x,y:p.y,t:0,cx:cam.x,cy:cam.y,moved:true}}else if(ptrs.size===0){down=null;cv.classList.remove('drag')}}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.offsetX,e.offsetY,Math.exp(-e.deltaY*0.0018))},{passive:false});
function tapAt(sx,sy){if(actMode&&actTap(sx,sy))return;const p=s2w(sx,sy);let best=null,bd=1e9;for(const a of S.agents){if(a.dead)continue;const d=Math.hypot(a.x-p.x,a.y-p.y)-a.r;if(d<bd){bd=d;best=a}}
  if(best&&bd<12/cam.z+1){sel=best;selSett=null;follow=false;showInspect();setTab('inspect');return}
  let bs=null,bsd=1e9;for(const s of S.setts){const d=Math.hypot(s.x-p.x,s.y-p.y)-S.townRadius(s);if(d<bsd){bsd=d;bs=s}}
  if(bs&&bsd<10/cam.z+4){selSett=bs;sel=null;showInspect();setTab('inspect');return}
  sel=null;selSett=null;showInspect()}

// ---------- fx ----------
function drainFx(){
  for(const f of S.fxq){
    if(f.t==='glyph'){marksX.strokeStyle=hsl(f.h,55,70,0.32);marksX.lineWidth=1.4;marksX.lineCap='round';marksX.beginPath();marksX.moveTo(f.x1,f.y1);marksX.lineTo(f.x2,f.y2);marksX.stroke()}
    else if(f.t==='paint'){marksX.strokeStyle=hsl(f.h,75,62,0.55);marksX.lineWidth=1.6;marksX.lineCap='round';marksX.beginPath();marksX.moveTo(f.x1,f.y1);marksX.lineTo(f.x2,f.y2);marksX.stroke()}
    else if(f.t==='scar'){const g=marksX.createRadialGradient(f.x,f.y,0,f.x,f.y,f.r*1.6+3);g.addColorStop(0,'rgba(45,18,12,.3)');g.addColorStop(1,'rgba(45,18,12,0)');marksX.fillStyle=g;marksX.beginPath();marksX.arc(f.x,f.y,f.r*1.6+3,0,6.28);marksX.fill()}
    else if(parts.length<600){
      if(f.t==='hit'){for(let i=0;i<2;i++)parts.push({x:f.x,y:f.y,vx:(Math.random()-.5)*20,vy:(Math.random()-.5)*20,life:.3,max:.3,c:'#f5d9a8',r:.7})}
      else if(f.t==='death')parts.push({ring:1,x:f.x,y:f.y,life:.9,max:.9,h:f.h,r:f.r});
      else if(f.t==='shot')parts.push({shot:1,x1:f.x1,y1:f.y1,x2:f.x2,y2:f.y2,life:.18,max:.18,tier:f.tier});
      else if(f.t==='nuke')parts.push({nuke:1,x:f.x,y:f.y,life:4,max:4});
      else if(f.t==='ascend')parts.push({ascend:1,x:f.x,y:f.y,life:2.5,max:2.5,h:f.h});
    }
  }
  S.fxq.length=0;
}

// ---------- render ----------
const DOTS=[new Array(360),new Array(360)];// cached fill strings for far-away creatures (no per-frame string churn)
function dotFill(h,flash){const k=((Math.round(h)%360)+360)%360,t=DOTS[flash?1:0];return t[k]||(t[k]=hsl(k,55,flash?85:58))}
const WORK_STATES={farm:1,craft:1,build:1,study:1,worship:1,gather:1};
function render(rdt){
  const dpr=Math.min(2,window.devicePixelRatio||1);const w=vw(),h=vh();if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr)}
  if(fly){fly.t=Math.min(1,fly.t+rdt*1.4);const e=1-Math.pow(1-fly.t,3);cam.x=lerp(fly.sx,fly.x,e);cam.y=lerp(fly.sy,fly.y,e);cam.z=lerp(fly.sz,fly.z,e);if(fly.t>=1)fly=null}
  if(follow&&sel&&!sel.dead){cam.x+=(sel.x-cam.x)*Math.min(1,rdt*4);cam.y+=(sel.y-cam.y)*Math.min(1,rdt*4)}
  clampCam();const Z=cam.z;
  if(S.terrainDirty){terrainC=buildTerrainCanvas(S,terrainC,S.dirtyBox);S.terrainDirty=false;S.dirtyBox=null;updRad()}
  if(S.radDirty){S.radDirty=false;updRad()}
  if(frameN%90===0)updRad();
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0b0e14';ctx.fillRect(0,0,cv.width,cv.height);
  const z=Z*dpr;ctx.setTransform(z,0,0,z,w*dpr/2-cam.x*z,h*dpr/2-cam.y*z);ctx.imageSmoothingEnabled=true;
  // only the visible part of each full-world layer is blitted (source-rect crop), so cost follows the viewport, not the world
  const vx0=Math.max(0,cam.x-w/2/Z-4),vx1=Math.min(S.W,cam.x+w/2/Z+4),vy0=Math.max(0,cam.y-h/2/Z-4),vy1=Math.min(S.H,cam.y+h/2/Z+4);
  const layer=im=>{if(vx1<=vx0||vy1<=vy0)return;const kx=im.width/S.W,ky=im.height/S.H;ctx.drawImage(im,vx0*kx,vy0*ky,(vx1-vx0)*kx,(vy1-vy0)*ky,vx0,vy0,vx1-vx0,vy1-vy0)};
  layer(terrainC);
  if(radAny){ctx.globalAlpha=0.9;layer(radC);ctx.globalAlpha=1}
  if(frameN%15===0){terrX.clearRect(0,0,terrC.width,terrC.height);for(const s of S.setts){const f=S.facs[s.fac];const rr=(S.townRadius(s)+70)/8;const g=terrX.createRadialGradient(s.x/8,s.y/8,0,s.x/8,s.y/8,rr);g.addColorStop(0,hsl(f.hue,70,55,0.55));g.addColorStop(0.75,hsl(f.hue,70,55,0.25));g.addColorStop(1,hsl(f.hue,70,55,0));terrX.fillStyle=g;terrX.beginPath();terrX.arc(s.x/8,s.y/8,rr,0,6.28);terrX.fill()}}
  ctx.globalAlpha=Z>2.5?0.18:0.38;layer(terrC);ctx.globalAlpha=1;
  const x0=cam.x-w/2/Z-30,x1=cam.x+w/2/Z+30,y0=cam.y-h/2/Z-30,y1=cam.y+h/2/Z+30;const inV=(x,y,m=0)=>x>x0-m&&x<x1+m&&y>y0-m&&y<y1+m;
  const visS=S.setts.filter(s=>inV(s.x,s.y,S.townRadius(s)+20));
  if(Z>2.2){const avoid=[];for(const s of visS){avoid.push({x:s.x,y:s.y,r:S.townRadius(s)+8});for(const p of s.plots)avoid.push({x:p.x,y:p.y,r:10})}drawGroundDetail(ctx,S,x0,y0,x1,y1,T,Z,avoid)}
  layer(marksC);
  // trade roads worn by caravans
  ctx.lineCap='round';for(const k in S.roads){const r=S.roads[k];const a=S.settById(r.a),b=S.settById(r.b);if(!a||!b)continue;if(!inV((a.x+b.x)/2,(a.y+b.y)/2,Math.hypot(a.x-b.x,a.y-b.y)/2))continue;const age=S.year-r.last;const al=age<40?0.55:0.25;ctx.strokeStyle=`rgba(120,100,70,${al})`;ctx.lineWidth=Math.min(3.5,1+r.n*0.06);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
  for(const r of S.ruins)if(inV(r.x,r.y,40))drawRuin(ctx,r);
  for(const c of S.cairns){if(!inV(c.x,c.y))continue;if(c.bones){ctx.strokeStyle='hsl(40,20%,82%)';ctx.lineWidth=1.4;for(let k=0;k<7;k++){const a=k*0.9;ctx.beginPath();ctx.moveTo(c.x+Math.cos(a)*3,c.y+Math.sin(a)*3);ctx.lineTo(c.x+Math.cos(a)*11,c.y+Math.sin(a)*8);ctx.stroke()}continue}
    const n=Math.min(c.n,12);for(let k=0;k<n;k++){const lvl=Math.floor(Math.sqrt(k*2));ctx.fillStyle=k===n-1?hsl(c.h,40,60):'hsl(30,6%,'+(52+k%3*6)+'%)';ctx.beginPath();ctx.arc(c.x+((k*7)%5-2)*1.1,c.y-lvl*1.6,1.5,0,6.28);ctx.fill()}}
  for(const p of S.pulses){const age=S.year-p.t;if(age<0||age>2.5)continue;ctx.strokeStyle=hsl(p.h,90,70,0.6*(1-age/2.5));ctx.lineWidth=p.big?2:1.3;ctx.beginPath();ctx.arc(p.x,p.y,6+age*(p.big?40:22),0,6.28);ctx.stroke()}
  for(const s of visS)drawTown(ctx,s,S.facs[s.fac],T,Z);
  for(const wd of S.wonders)if(inV(wd.x,wd.y,20))drawWonder(ctx,wd,S.facs[wd.fac],T,Z);
  if(selSett&&S.setts.includes(selSett)){ctx.strokeStyle='#f0c873';ctx.lineWidth=2/Z;ctx.setLineDash([4/Z,3/Z]);ctx.beginPath();ctx.arc(selSett.x,selSett.y,S.townRadius(selSett)+12,0,6.28);ctx.stroke();ctx.setLineDash([])}
  if(Z>=0.5)for(const g of S.game)if(!g.dead&&inV(g.x,g.y))drawBeast(ctx,g,Z,T);// under a pixel when zoomed far out
  // army standards
  for(const f of S.facs){const A=f.army;if(!A||f.died!=null||!inV(A.x,A.y,30))continue;ctx.strokeStyle='#2a2216';ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(A.x,A.y+6);ctx.lineTo(A.x,A.y-12);ctx.stroke();ctx.fillStyle=hsl(f.hue,70,48);ctx.beginPath();ctx.moveTo(A.x,A.y-12);ctx.lineTo(A.x+9,A.y-10+Math.sin(T*4)*0.8);ctx.lineTo(A.x,A.y-7);ctx.closePath();ctx.fill()}
  // creatures
  for(const a of S.agents){if(a.dead||!inV(a.x,a.y))continue;const f=S.facs[a.fac];const child=a.age<8&&!a.titan?0.5+a.age/16:1;const r=a.r*child*BODY;const sr=r*Z;
    if(sr<2.2&&!a.titan){ctx.fillStyle=dotFill(a.g.hue,a.flash>0);const dr=Math.max(r*0.9,1.3/Z);
      if(sr<1.1&&a.char==null){ctx.fillRect(a.x-dr,a.y-dr,dr*2,dr*2);continue}// tiny when zoomed far out: a square is much cheaper than an arc path
      ctx.beginPath();ctx.arc(a.x,a.y,dr,0,6.28);ctx.fill();if(a.char!=null){ctx.strokeStyle='#f0c873';ctx.lineWidth=1/Z;ctx.stroke()}continue}
    ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.heading);
    const c=a.char!=null?S.chars[a.char]:null;
    drawCreature(ctx,a.g,r,T,{moving:a.moving,phase:a.phase,seed:a.id%17,tech:techTier(f),carry:a.carry,banner:a.role==='soldier',bannerHue:f.hue,crown:!!(a.titan||(c&&c.role==='ruler')),flash:a.flash,fighting:a.state==='fight',noShadow:sr<4,job:a.role==='trader'?'trader':a.role==='soldier'?null:a.job,working:!!WORK_STATES[a.state]});
    ctx.restore()}
  // particles
  for(const p of parts){p.life-=rdt;const k=1-p.life/p.max;
    if(p.ring){ctx.strokeStyle=hsl(p.h,50,75,0.6*(1-k));ctx.lineWidth=0.8;ctx.beginPath();ctx.arc(p.x,p.y,p.r+k*8,0,6.28);ctx.stroke()}
    else if(p.shot){ctx.strokeStyle=p.tier>=6?'rgba(130,230,255,.9)':'rgba(255,225,150,.85)';ctx.lineWidth=p.tier>=6?1:0.6;ctx.beginPath();ctx.moveTo(p.x1,p.y1);ctx.lineTo(lerp(p.x1,p.x2,0.4+k*0.6),lerp(p.y1,p.y2,0.4+k*0.6));ctx.stroke()}
    else if(p.nuke){const r=20+k*140;const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,`rgba(255,250,220,${0.9*(1-k)})`);g.addColorStop(0.4,`rgba(255,170,80,${0.6*(1-k)})`);g.addColorStop(1,'rgba(120,40,20,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r,0,6.28);ctx.fill();ctx.strokeStyle=`rgba(255,230,190,${0.7*(1-k)})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,r*1.2,0,6.28);ctx.stroke()}
    else if(p.ascend){p.y-=rdt*60;ctx.fillStyle=hsl(p.h,80,80,1-k);ctx.beginPath();ctx.arc(p.x,p.y,1.5,0,6.28);ctx.fill();ctx.strokeStyle=hsl(p.h,80,80,0.4*(1-k));ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y+12);ctx.stroke()}
    else{p.x+=p.vx*rdt;p.y+=p.vy*rdt;ctx.fillStyle=p.c;ctx.globalAlpha=Math.max(0,1-k);ctx.fillRect(p.x,p.y,p.r,p.r);ctx.globalAlpha=1}}
  parts=parts.filter(p=>p.life>0);
  if(sel&&!sel.dead){ctx.strokeStyle='#f0c873';ctx.lineWidth=1.6/Z;ctx.setLineDash([4/Z,3/Z]);ctx.lineDashOffset=-T*10/Z;ctx.beginPath();ctx.arc(sel.x,sel.y,sel.r*BODY*2.2+3/Z,0,6.28);ctx.stroke();ctx.setLineDash([]);
    const tgt=sel.state==='fight'&&sel.target&&!sel.target.dead?sel.target:sel.state==='hunt'&&sel.prey&&!sel.prey.dead?sel.prey:null;const dest=tgt||(['haul','eat','farm','build','craft','study','worship','trade','migrate','rest','gather'].includes(sel.state)?{x:sel.tx,y:sel.ty}:null);
    if(dest){ctx.strokeStyle=tgt&&sel.state==='fight'?'rgba(207,88,67,.7)':'rgba(240,200,115,.5)';ctx.lineWidth=1/Z;ctx.setLineDash([2/Z,2/Z]);ctx.beginPath();ctx.moveTo(sel.x,sel.y);ctx.lineTo(dest.x,dest.y);ctx.stroke();ctx.setLineDash([])}}
  // labels in screen space
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.textAlign='center';ctx.lineJoin='round';
  const toS=(x,y)=>[(x-cam.x)*Z+w/2,(y-cam.y)*Z+h/2];
  if(Z<0.75){for(const f of S.alive()){const cs=S.capitalOf(f);if(!cs||!inV(cs.x,cs.y))continue;const [sx,sy]=toS(cs.x,cs.y);const L=S.langs[f.lang];const label=L.stage===0?`${f.glyph}  ${f.gloss}`:f.name+(L.script&&L.script!=='picto'?'  '+S.native(f.nameId):'');ctx.font='600 15px Grenze, Georgia, serif';ctx.strokeStyle='rgba(8,10,14,.9)';ctx.lineWidth=4;const mine=S.isMine&&S.isMine(f);const god=S.gods&&S.gods.find(g=>g.alive&&(g.peoples||[]).includes(f.id));const lab=(mine?'★ ':god?'⚔ ':'')+label;ctx.strokeText(lab,sx,sy-14);ctx.fillStyle=hsl(f.hue,78,70);ctx.fillText(lab,sx,sy-14);if(god){ctx.font='italic 600 11px Figtree, sans-serif';ctx.strokeText(cap(god.name),sx,sy-1);ctx.fillText(cap(god.name),sx,sy-1)}if(f.army){const [ax,ay]=toS(f.army.x,f.army.y);ctx.font='600 11px Figtree, sans-serif';ctx.strokeText('army',ax,ay-14);ctx.fillText('army',ax,ay-14)}}}
  for(const s of visS){const show=Z>1.0||(s.level>=3&&Z>0.6);if(!show)continue;const [sx,sy]=toS(s.x,s.y+S.townRadius(s)+8);ctx.font=`600 ${s.level>=3?12:11}px Figtree, system-ui, sans-serif`;ctx.strokeStyle='rgba(8,10,14,.85)';ctx.lineWidth=3;ctx.strokeText(s.name,sx,sy+8);ctx.fillStyle=hsl(S.facs[s.fac].hue,60,82);ctx.fillText(s.name,sx,sy+8)}
  if(Z>1.4)for(const a of S.agents){if(a.dead||!(a.titan||(a.char!=null&&['ruler','general','champion'].includes(S.chars[a.char].role)))||!inV(a.x,a.y))continue;const [sx,sy]=toS(a.x,a.y-a.r*BODY*2.5);const nm=a.titan||S.cname(S.chars[a.char]);ctx.font=`600 ${a.titan?13:11}px Grenze, Georgia, serif`;ctx.strokeStyle='rgba(8,10,14,.9)';ctx.lineWidth=3;ctx.strokeText(nm,sx,sy-4);ctx.fillStyle=a.titan?'#f4a896':'#f0c873';ctx.fillText(nm,sx,sy-4)}
  for(const wd of S.wonders){if(Z<1.6||!inV(wd.x,wd.y))continue;const [sx,sy]=toS(wd.x,wd.y+14);ctx.font='italic 600 11px Grenze, Georgia, serif';ctx.strokeStyle='rgba(8,10,14,.85)';ctx.lineWidth=3;ctx.strokeText(cap(wd.name),sx,sy);ctx.fillStyle='#f0c873';ctx.fillText(cap(wd.name),sx,sy)}
}
let radAny=true;
function updRad(){radAny=false;for(let k=0;k<S.rad.length;k++)if(S.rad[k]>0.02){radAny=true;break}if(!radAny){radX.clearRect(0,0,S.GW,S.GH);return}const id=radX.createImageData(S.GW,S.GH);for(let k=0;k<S.rad.length;k++){const v=S.rad[k];if(v<=0.02)continue;id.data[k*4]=48;id.data[k*4+1]=52+v*30;id.data[k*4+2]=36;id.data[k*4+3]=Math.min(235,v*260)}radX.putImageData(id,0,0)}

// ---------- peoples panel ----------
let openFac=null,lastPeoplesHTML='';const portraitCanvases=new Map();
function relPills(f){const out=[];for(const o of S.alive()){if(o===f)continue;const r=S.rel(f.id,o.id);if(r.war)out.push(`<span class="pill war">At war with ${esc(o.name)}</span>`);else if(r.marriage&&!r.marriage.broken)out.push(`<span class="pill ally">Wed to ${esc(o.name)}</span>`);else if(r.ally)out.push(`<span class="pill ally">Allied with ${esc(o.name)}</span>`);else if(r.trade)out.push(`<span class="pill trade">Trades with ${esc(o.name)}</span>`);if(r.tribute&&r.tribute.from===f.id)out.push(`<span class="pill war">Pays tribute to ${esc(o.name)}</span>`)}return out.join('')}
const SHOWN=['size','speed','armor','aggression','intellect','sociality','carnivory','aquatic','flight','mystic','hoarding','weirdness'];
function bars(keys,obj,labels,h){return`<div class="traits">${keys.map(k=>`<span>${labels[k]}</span><div class="tb"><i style="width:${Math.round(clamp(obj[k])*100)}%;background:${hsl(h,55,58)}"></i></div>`).join('')}</div>`}
function traitBars(g,h){return bars(SHOWN,g,TRAIT_LABEL,h)}
const DEC_WORD={war:'War',peace:'Peace',ally:'An alliance',marry:'A marriage',trade:'Trade',tribute:'A demand for tribute',nuke:'Nuclear fire',blight:'An engineered plague',geo:'Reshaping the land',reform:'A new government',golden:'A golden age',wonder:'A monument',purge:'A purge',reformlaw:'Reforms',making:'Rewriting their own bodies',uplift:'Uplifting another species',depart:'Leaving the world'};
function opinionWord(v){return v<-0.5?'hate':v<-0.15?'distrust':v<0.15?'are wary of':v<0.45?'like':'love'}
function charLine(c){if(!c)return'';return`<b class="nm">${esc(S.cname(c))}</b>${S.traitWords(c).length?` <span class="dim">(${esc(S.traitWords(c).join(', '))})</span>`:''}`}
function renderPeoples(force){
  const p=$('#p-peoples');const alive=S.alive().sort((a,b)=>b.pop-a.pop);const dead=S.facs.filter(f=>f.died!=null);
  let html=alive.map(f=>{const sets=S.facSetts(f);const L=S.langs[f.lang];const open=openFac===f.id;const ru=S.rulerOf(f);const res=f.research?`${TECH[f.research.id].n} ${Math.min(99,Math.round(f.rp/TECH[f.research.id].c*100))}%`:'nothing';
    const ld=f.lastDecision&&S.year-f.lastDecision.yr<40?`<div class="dec"><b>${esc(DEC_WORD[f.lastDecision.kind]||f.lastDecision.kind)}</b> (year ${f.lastDecision.yr}) because ${esc((f.lastDecision.why||[]).slice(0,2).join(', and '))}</div>`:'';
    let x=`<div class="civ${open?' sel':''}" data-f="${f.id}"><canvas data-pf="${f.id}" width="64" height="64"></canvas><div style="min-width:0"><h3><span class="sw" style="background:${hsl(f.hue,60,55)}"></span>${L.stage===0?`<span class="glyph">${esc(f.glyph)}</span> `:''}${esc(f.name)}${L.stage>0?` <bdi class="nat natsm">${esc(S.native(f.nameId))}</bdi>`:''}</h3>
    <div class="meta"><b>${f.pop}</b> living · <b>${sets.length}</b> ${sets.length===1?'town':'towns'} · ${esc(S.eraOf(f))}</div>
    <div class="meta">${esc(S.GOVS[f.gov].label)}${ru?` ruled by ${charLine(ru)}`:''}</div>
    <div class="meta">${f.state!=null?`Faith: ${esc(S.faiths[f.state].title)}`:'No faith yet'} · writes in ${esc(S.scriptOf(L).label.toLowerCase())}${L.script!=='picto'?` like ${esc(S.scriptOf(L).like)}`:''}</div>
    <div class="pills"><span class="pill arch">${ARCH[f.arch].label}</span>${f.golden?'<span class="pill emp">Golden Age</span>':''}${relPills(f)}</div>${ld}</div>`;
    if(open){const court=['heir','general','prophet'].map(k=>f[k]!=null&&S.chars[f[k]]&&S.chars[f[k]].alive?`<div><span class="dim">${cap(k)}:</span> ${charLine(S.chars[f[k]])}</div>`:'').join('');
      const ops=S.alive().filter(o=>o!==f).map(o=>{const v=S.opinion(f.id,o.id);const m=f.mem[o.id];let top=null;if(m)for(const n of m.notes)if(!top||n.w>top.w)top=n;return`<div>They ${opinionWord(v)} the <b>${esc(o.name)}</b>${top?` <span class="dim">· ${top.kind==='grudge'?'remembering':'grateful for'} ${esc(top.txt)}</span>`:''}</div>`}).join('');
      const unrest=sets.map(s=>`<div><b>${esc(s.name)}</b> <span class="meterinl"><i style="width:${Math.round(s.unrest*100)}%;background:${s.unrest>0.55?'var(--blood)':'var(--brass)'}"></i></span>${s.unrest>0.3&&s.why.length?` <span class="dim">${esc(s.why[0])}</span>`:''}</div>`).join('');
      const words=['sun','water','people','war','god','king','mother','death'];
      x+=`<div class="civx"><div class="body">${esc(cap(f.species))}: ${esc(bodyDesc(f.g))}.</div>${f.parent!=null?`<div class="meta">Broke away from the ${esc(S.facs[f.parent].name)} in year ${f.born}</div>`:`<div class="meta">One of the first peoples</div>`}
      <div class="sub">Court</div><div class="lines">${ru?`<div><span class="dim">${cap(S.rulerTitle(f))}:</span> ${charLine(ru)}${ru.spouse!=null&&S.chars[ru.spouse]&&S.chars[ru.spouse].alive?` <span class="dim">· wed to ${esc(S.cname(S.chars[ru.spouse]))}</span>`:''}</div>`:''}${court}</div>
      <div class="sub">What they value</div>${bars(VALUES,f.values,VALUE_LABEL,f.hue)}
      <div class="sub">How they see others</div><div class="lines">${ops||'<div class="dim">They know of no one else.</div>'}</div>
      <div class="sub">Towns and their mood</div><div class="lines">${unrest}</div>
      <div class="sub">Tongue · ${esc(S.scriptOf(L).label)}${L.script!=='picto'?' like '+esc(S.scriptOf(L).like):''}</div><div class="words">${words.map(c=>`<span><i class="nat">${esc(writeScript(L.lex[c],[c],L.script||'picto',L.swaps))}</i>${L.stage===0?esc(GLOSS[c]):esc(L.lex[c])}</span>`).join('')}</div>${f.state!=null?`<div class="sub">Faith</div><div class="lines"><div><b class="nm">${esc(cap(S.faiths[f.state].title))}</b> <span class="dim">${esc(S.faiths[f.state].gods.map(g=>g.name+', '+g.gloss).join('; '))}</span></div>${S.faiths[f.state].tenets.map(t=>`<div class="dim">“${esc(S.TENETS[t].t)}”</div>`).join('')}</div>`:''}${L.changes.length?`<div class="dim small">Recent shift: ${esc(L.changes[L.changes.length-1].d)}</div>`:''}
      <div class="sub">Researching · ${esc(res)}</div><div class="techs">${Object.keys(f.tech).map(k=>`<span>${esc(TECH[k].n)}</span>`).join('')||'<span>nothing yet</span>'}</div>
      <div class="sub">Body</div>${traitBars(f.g,f.hue)}
      ${f.quirks.map(q=>`<div class="quirk"><b>${esc(q.name)}</b><p>${esc(S.quirkText(f,q))}</p></div>`).join('')}
      <div class="row"><button type="button" class="btn" data-act="focus" data-f="${f.id}">Show on map</button><button type="button" class="btn" data-act="target" data-f="${f.id}">Speak to them</button></div></div>`}
    return x+'</div>'}).join('');
  if(dead.length)html+=`<div class="sub">Gone from the world</div>`+dead.slice().reverse().map(f=>`<div class="meta" style="padding:3px 0"><span class="sw" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${hsl(f.hue,40,45)}"></span> <b style="font-family:var(--f-disp);font-size:15px;color:var(--text)">${esc(f.name)}</b> · years ${f.born}–${f.died} · ${f.endCause==='departed'?'left the world':f.endCause==='union'?'joined another realm':'extinct'}</div>`).join('');
  if(html!==lastPeoplesHTML||force){const sc=p.scrollTop;p.innerHTML=html;p.scrollTop=sc;lastPeoplesHTML=html;portraitCanvases.clear();p.querySelectorAll('canvas[data-pf]').forEach(c=>portraitCanvases.set(+c.dataset.pf,c))}
}
$('#p-peoples').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b){const f=S.facs[+b.dataset.f];if(b.dataset.act==='focus'){const s=S.capitalOf(f)||f.origin;flyTo(s.x,s.y,2.2)}else{const t=$('#prompt');t.value=`The ${f.name} `;t.focus()}return}
  if(e.target.closest('.civx'))return;const c=e.target.closest('.civ');if(c){const id=+c.dataset.f;openFac=openFac===id?null:id;renderPeoples(true)}});

// ---------- inspect ----------
const STATE_LABEL={idle:'Deciding what to do',gather:'Gathering',farm:'Farming',hunt:'Hunting',haul:'Hauling to the stores',eat:'Going to eat',build:'Building',craft:'Crafting',worship:'Praying',study:'Studying',rest:'Resting',play:'Playing',court:'At court',patrol:'On patrol',march:'Marching',siege:'Besieging',trade:'On a caravan',fight:'Fighting',flee:'Fleeing',migrate:'Moving to a new town',ritual:'Performing a ritual',roam:'Roaming',depart:'Leaving the world'};
const JOB_LABEL={farmer:'Farmer',gatherer:'Gatherer',hunter:'Hunter',builder:'Builder',crafter:'Crafter',priest:'Priest',scholar:'Scholar',artist:'Artist',guard:'Guard',child:'Child',elder:'Elder',court:'Court'};
function showInspect(){
  const p=$('#p-inspect');
  if(sel){const a=sel,f=S.facs[a.fac];
    p.innerHTML=`<div class="spec"><canvas id="specCv"></canvas><div><h2 id="spName"></h2><div class="meta" id="spSub"></div></div><div class="whybox" id="spWhy"></div><div class="body" id="spBody"></div>
    <div class="stat" id="spStat"></div><div id="spChar"></div><div class="row"><button type="button" class="btn" id="spFollow">${follow?'Stop following':'Follow'}</button><button type="button" class="btn" id="spFac">About the ${esc(f.name)}</button></div><div class="sub">Genome</div>${traitBars(a.g,a.g.hue)}</div>`;
    $('#spFollow').onclick=()=>{follow=!follow;$('#spFollow').textContent=follow?'Stop following':'Follow';if(follow&&cam.z<3){flyTo(a.x,a.y,4);setTimeout(()=>follow=true,800)}};
    $('#spFac').onclick=()=>{openFac=f.id;setTab('peoples');renderPeoples(true)};updInspect(true);return}
  if(selSett&&S.setts.includes(selSett)){const s=selSett,f=S.facs[s.fac];const own=s.owners.map(i=>S.facs[i].name).filter((v,i,a)=>a.indexOf(v)===i);const n=S.names[s.nameId];const L=S.langs[n.lang];
    const counts={};for(const b of s.bld)if(b.prog>=1)counts[b.t]=(counts[b.t]||0)+1;const ripe=s.plots.filter(p=>p.grow>0.85).length;const gv=s.governor!=null?S.chars[s.governor]:null;
    const hist=n.hist.filter((h,i,arr)=>i===0||h.form!==arr[i-1].form||h.stage!==arr[i-1].stage).slice(-6);
    p.innerHTML=`<div class="spec"><h2>${esc(s.name)}</h2><div class="meta">“${esc(S.glossOf(s.nameId))}” · ${['Camp','Village','Town','City','Great city'][s.level]} of the ${esc(f.name)} · founded year ${s.born}</div>
    <div class="stat"><span>Residents</span><span></span><b>${s.members.filter(a=>!a.dead).length} / ${S.capOf(s)} beds</b><span>Food stores</span><span></span><b>${Math.round(s.store)}</b><span>Fields</span><span></span><b>${s.plots.length}${ripe?` (${ripe} ripe)`:''}</b><span>Unrest</span><div class="meter"><i style="width:${Math.round(s.unrest*100)}%;background:${s.unrest>0.55?'var(--blood)':'var(--brass)'}"></i></div><b>${Math.round(s.unrest*100)}%</b><span>Defenses</span><div class="meter"><i style="width:${Math.round(s.hp/s.maxhp*100)}%;background:var(--sea)"></i></div><b>${Math.round(s.hp)}</b></div>
    ${s.why.length&&s.unrest>0.2?`<div class="whybox">Restless because ${esc(s.why.join('; '))}.</div>`:''}
    ${gv&&gv.alive?`<div class="meta">Governor: ${charLine(gv)} · loyalty ${Math.round(gv.loyalty*100)}%</div>`:''}
    <div class="sub">Buildings</div><div class="techs">${Object.keys(counts).map(k=>`<span>${counts[k]} ${k}${counts[k]>1?(k.endsWith('y')?'':'s'):''}</span>`).join('')}${s.site?`<span class="on">building a ${esc(s.site.t)} (${Math.round(s.site.prog*100)}%)</span>`:''}</div>
    <div class="sub">How its name changed</div><div class="lines">${hist.map(h=>`<div><span class="yr2">${h.yr}</span> <b>${esc(S.nameForm(h.form,h.stage,n.concepts))}</b> <span class="dim">${esc(h.why)}</span></div>`).join('')}</div>
    ${own.length>1?`<div class="meta">Held in turn by: ${own.map(esc).join(' → ')}</div>`:''}<div class="row"><button type="button" class="btn" id="spFac">About the ${esc(f.name)}</button></div></div>`;
    $('#spFac').onclick=()=>{openFac=f.id;setTab('peoples');renderPeoples(true)};return}
  p.innerHTML='<div class="empty">Tap any creature or town on the map to examine it. Zoom in close to watch people farm, build, trade and march. Time slows down as you zoom in so you can follow them.</div>';
}
function updInspect(full){if(!sel||$('#p-inspect').hidden)return;const a=sel,f=S.facs[a.fac];const n=$('#spName');if(!n)return;const c=a.char!=null?S.chars[a.char]:null;
  n.textContent=a.titan||(c?cap(S.cname(c)):`A ${f.name} ${a.role==='soldier'?'soldier':a.role==='trader'?'trader':JOB_LABEL[a.job]?JOB_LABEL[a.job].toLowerCase():'wanderer'}`);
  $('#spSub').textContent=a.dead?`Died in year ${Math.floor(S.year)} (${a.cause||'unknown'})`:`${a.titan?'Titan, enemy of all life':c?`${cap(c.role==='ruler'?S.rulerTitle(f):c.role)} of the ${f.name}`:`${a.role==='soldier'?'Soldier':a.role==='trader'?'Caravan trader':JOB_LABEL[a.job]||'Wanderer'} of the ${f.name}`} · ${a.state==='ritual'&&a.rit?'Performing '+a.rit.name:STATE_LABEL[a.state]||a.state}`;
  $('#spWhy').textContent=a.dead?'':a.why?a.why+'.':'';
  if(full)$('#spBody').textContent=cap(bodyDesc(a.g))+'.';
  const home=a.home!=null?S.settById(a.home):null;
  $('#spStat').innerHTML=`<span>Health</span><div class="meter"><i style="width:${Math.max(0,a.hp/a.maxhp*100)}%;background:var(--blood)"></i></div><b>${Math.max(0,Math.round(a.hp))}</b><span>Fed</span><div class="meter"><i style="width:${a.energy}%;background:var(--moss)"></i></div><b>${Math.round(a.energy)}</b><span>Tired</span><div class="meter"><i style="width:${Math.min(100,a.fatigue*90)}%;background:#8a7fb0"></i></div><b>${Math.round(Math.min(1.1,a.fatigue)*90)}</b><span>Age</span><div class="meter"><i style="width:${Math.min(100,a.age/a.life*100)}%;background:var(--sea)"></i></div><b>${Math.floor(a.age)}/${Math.floor(a.life)}</b><span>Carrying</span><span></span><b>${Math.round(a.carry)}</b><span>Home</span><span></span><b style="font-family:var(--f-ui)">${home?esc(home.name):'none'}</b>`;
  if(full&&c){$('#spChar').innerHTML=`<div class="sub">Character</div><div class="pills">${S.traitWords(c).map(w=>`<span class="pill">${esc(w)}</span>`).join('')}</div><div class="lines">${c.spouse!=null&&S.chars[c.spouse]?`<div>Married to <b>${esc(S.cname(S.chars[c.spouse]))}</b>${S.chars[c.spouse].alive?'':' <span class="dim">(dead)</span>'}</div>`:''}${c.role!=='ruler'?`<div>Loyalty to the ruler: <b>${Math.round(c.loyalty*100)}%</b></div>`:''}${c.claim!=null?`<div>Has a claim to the throne of the <b>${esc(S.facs[c.claim].name)}</b></div>`:''}${c.deeds.slice(-5).map(d=>`<div><span class="yr2">${d.yr}</span> ${esc(d.txt)}</div>`).join('')}</div>`}}
function setTab(t){const wasV=!$('#p-voices').hidden;document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.t===t));for(const k of ['peoples','chron','inspect','voices'])$('#p-'+k).hidden=k!==t;if(t==='voices'&&!wasV){voicesWas=running;running=false;$('#play').textContent='Resume';renderVoices()}if(t!=='voices'&&wasV&&voicesWas!=null){running=voicesWas;voicesWas=null;$('#play').textContent=running?'Pause':'Resume'}if(t==='inspect')updInspect(true);if(t==='peoples')renderPeoples(true);if(t==='chron')renderChronicle()}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setTab(b.dataset.t)});

// ---------- world chips ----------
function chips(){const out=[];const w=S.world;if(effSpeed<speed*0.95)out.push(`<span class="chip slow">Close view: time at ${effSpeed<1?effSpeed.toFixed(2):effSpeed.toFixed(1)}×</span>`);
  if(w.foodMult<0.9)out.push('<span class="chip cold">Hard years: food scarce</span>');if(w.foodMult>1.1)out.push('<span class="chip">Years of plenty</span>');if(w.mutBurst)out.push('<span class="chip weird">Mutation storm</span>');
  let wars=0;for(const k in S.rels){const r=S.rels[k];if(r.war&&S.facs[r.a].died==null&&S.facs[r.b].died==null)wars++}if(wars)out.push(`<span class="chip warn">${wars} ${wars>1?'wars':'war'}</span>`);
  for(const a of S.agents)if(a.titan&&!a.dead)out.push(`<span class="chip warn">${esc(a.titan)} walks</span>`);
  out.push(`<span class="chip">${S.livePop} alive</span>`);$('#worldChips').innerHTML=out.join('')}

// ---------- oracle ----------
const SUGG=['the blue ones discover fire','the king goes mad','give the red ones nuclear weapons','they fall in love with art','an ice age','the strongest people split in two','everyone learns to write','a great plague','make them build a police state','something lives in the sea','the monsters learn to think'];
$('#sugg').innerHTML=SUGG.sort(()=>Math.random()-.5).slice(0,4).map(s=>`<button type="button">${esc(s)}</button>`).join('');
$('#sugg').addEventListener('click',e=>{const b=e.target.closest('button');if(b){$('#prompt').value=b.textContent;$('#prompt').focus()}});
$('#prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#oracle').requestSubmit()}});
// [pattern, trait deltas, verb, extra]
const KW=[
 [/wing|fly|flight|bird|soar/,{flight:.5},'take to the air'],
 [/sea|ocean|water|swim|fish|tide|aquatic/,{aquatic:.5},'turn toward the water'],
 [/fire|tech|science|smart|clever|intellig|learn|wis|invent|wheel|tool|think/,{intellect:.4},'grow cleverer',{techBoost:2,values:{knowledge:.25}}],
 [/writ|read|book|letter|literat/,{intellect:.2},'learn letters',{grant:['speech','writing'],values:{knowledge:.2}}],
 [/war|blood|rage|angr|violen|kill|fight|hate|conquer/,{aggression:.4},'grow warlike',{relationsShift:-0.35,values:{martial:.35},ruler:{ambition:.3,cruelty:.25}}],
 [/peace|love|kind|gentle|friend|hug|forgive|calm/,{aggression:-.35,sociality:.25,symbiosis:.2},'soften',{relationsShift:0.4,values:{harmony:.35,martial:-.3},ruler:{warmth:.4,cruelty:-.3}}],
 [/\bmad|insane|crazy|paranoi/,{},'',{ruler:{paranoia:.6,cruelty:.4,honor:-.3}}],
 [/betray|treacher|backstab|liar/,{},'',{ruler:{honor:-.6,ambition:.4}}],
 [/honou?r|loyal|oath|noble/,{},'',{ruler:{honor:.5},values:{order:.15}}],
 [/greed|gold|rich|money|market|econom|merchant|coin|bank|capital/,{hoarding:.45},'take up trade',{values:{trade:.4},ruler:{greed:.3},grant:['tools','writing','currency']}],
 [/huge|giant|\bbig|large|enormous|tall/,{size:.45},'grow larger'],
 [/tiny|small|little|shrink/,{size:-.45},'shrink'],
 [/armou?r|shell|hard|iron|metal|turtle/,{armor:.45},'harden into shells'],
 [/fast|speed|quick|swift/,{speed:.45},'quicken'],
 [/magic|god|relig|worship|dream|spirit|pray|holy|cult|faith|church|priest/,{mystic:.45},'turn to the gods',{values:{faith:.4},grant:['speech','faith']}],
 [/eye|see|vision/,{eyes:.5},'sprout more eyes'],
 [/leg|limb|spider|crawl|insect|bug|\bant/,{limbs:.45,segments:.25},'grow more legs'],
 [/spike|thorn|spine|sharp/,{spikes:.5},'bristle with spines'],
 [/horn|antler|unicorn/,{horns:.55},'grow horns'],
 [/glow|shine|neon|lumin/,{glow:.55},'begin to glow'],
 [/meat|carniv|predator|hunt|cannibal|teeth|fang/,{carnivory:.45,aggression:.15},'hunger for flesh'],
 [/plant|vegan|vegetar|graze|herb/,{carnivory:-.45},'give up meat'],
 [/snake|worm|serpent|centipede/,{segments:.5,limbs:-.4},'stretch into serpents'],
 [/immortal|long life|ancient|forever/,{longevity:.5},'live longer'],
 [/breed|fertil|children|babies|multiply|swarm/,{fertility:.45},'breed faster'],
 [/hive|collective|one mind|merge|symbio/,{symbiosis:.5,sociality:.3},'draw together',{gov:'hive'}],
 [/explore|wander|curious|adventure|nomad/,{curiosity:.5},'grow restless'],
 [/weird|strange|chaos|absurd|alien|eldritch|bizarre/,{weirdness:.5},'grow strange'],
 [/art|paint|beaut|music|song|danc|poet|sculpt/,{glow:.15,weirdness:.15},'fall in love with beauty',{values:{art:.5},grant:['speech','music','sculpture'],golden:1,quirk:'chorus'}],
 [/police|surveil|tyrann|dictat|totalitar|oppress|repress|big brother/,{},'',{values:{order:.5},ruler:{paranoia:.4,cruelty:.3},grant:['tools','writing','law','surveillance','industry'],gov:'police'}],
 [/democra|vote|freedom|liberty|republic/,{},'',{grant:['writing','philosophy'],gov:'democracy',values:{knowledge:.2}}],
 [/nuke|nuclear|atom|bomb/,{},'',{grant:['fission'],values:{martial:.3},ruler:{cruelty:.3}}],
 [/gene|engineer|perfect|designer/,{},'',{grant:['genetics']}],
 [/rocket|space|stars|leave the world|depart/,{},'',{grant:['spaceflight']}],
 [/monster|beast|titan|kaiju|dragon|colossus/,{size:.25,aggression:.3},'breed monsters',{spawnTitan:1}],
 [/comet|meteor|radiat|mutat|cosmic|asteroid|evolve/,{},'',{mutationBurst:1}],
 [/ice age|winter|cold|freez|drought|famine/,{},'',{food:0.45}],
 [/spring|feast|abundan|plenty|rain|harvest|paradise/,{},'',{food:1.8}],
 [/plague|disease|sick|virus|pestil/,{},'',{plague:1}],
 [/split|rebel|civil war|schism|divide|revolt|seced/,{},'',{forceSchism:1}],
 [/cult|false god|sect leader|charlatan|messiah complex/,{},'',{cult:1}],
 [/prophet|prophecy|chosen one|messiah|promised/,{},'',{prophet:1}],
 [/from the sea|sea people|out of the (sea|ocean|water)|merfolk|deep ones/,{},'',{newPeople:'sea'}],
 [/underground|from the (earth|caves|mountain)|cave people|mole/,{},'',{newPeople:'deep'}],
 [/from the sky|sky people|winged people|from the peaks/,{},'',{newPeople:'sky'}],
 [/new people|strangers arrive|newcomers|invaders|migrants/,{},'',{newPeople:'sea'}],
 [/cairn|pile|monument|grave|tomb/,{},'',{quirk:'cairn'}],
 [/gift|generous|charity/,{},'',{quirk:'gift',relationsShift:0.15}],
 [/copy|mimic|imitat|mirror/,{},'',{quirk:'mimic'}],
 [/circle|spin|orbit|clock/,{},'',{quirk:'orbit'}],
];
const HUE={red:[345,15],orange:[15,40],yellow:[40,65],green:[65,160],teal:[160,195],cyan:[160,195],blue:[195,255],purple:[255,290],violet:[255,290],pink:[290,345],magenta:[290,345]};
function inHue(h,r){return r[0]>r[1]?(h>=r[0]||h<r[1]):(h>=r[0]&&h<r[1])}
function findTargets(t){const alive=S.alive();const out=new Set();for(const f of alive){if(t.includes(f.name.toLowerCase())||t.includes(f.gloss.toLowerCase()))out.add(f.id)}
  for(const k in HUE)if(new RegExp('\\b'+k).test(t))for(const f of alive)if(inHue(f.hue,HUE[k]))out.add(f.id);
  if(/strongest|biggest|largest|most powerful|dominant/.test(t)){const f=alive.slice().sort((a,b)=>b.pop-a.pop)[0];if(f)out.add(f.id)}
  if(/weakest|smallest|fewest|underdog/.test(t)){const f=alive.slice().sort((a,b)=>a.pop-b.pop)[0];if(f)out.add(f.id)}
  if(/monster|horde/.test(t))for(const f of alive)if(f.g.intellect<0.4)out.add(f.id);
  return out.size&&!/\b(everyone|everything|all|world|every)\b/.test(t)?[...out]:['all']}
function localInterpret(text){
  const t=text.toLowerCase();const td={},w={},vd={},rt={};let verbs=[],quirk=null,tech=0,grant=[],gov=null,golden=0;
  for(const [re,d,v,x] of KW){if(!re.test(t))continue;for(const k in d)td[k]=(td[k]||0)+d[k];if(v)verbs.push(v);if(x){if(x.techBoost)tech+=x.techBoost;if(x.relationsShift)w.relationsShift=(w.relationsShift||0)+x.relationsShift;if(x.spawnTitan)w.spawnTitan=true;if(x.mutationBurst)w.mutationBurst=1;if(x.food){w.foodMultiplier=x.food;w.duration=45}if(x.plague)w.plague=true;if(x.forceSchism)w.forceSchism=true;if(x.cult)w.cult=true;if(x.prophet)w.prophet=true;if(x.newPeople)w.newPeople=x.newPeople;if(x.quirk)quirk=x.quirk;if(x.values)for(const k in x.values)vd[k]=(vd[k]||0)+x.values[k];if(x.ruler)for(const k in x.ruler)rt[k]=(rt[k]||0)+x.ruler[k];if(x.grant)grant.push(...x.grant);if(x.gov)gov=x.gov;if(x.golden)golden=1}}
  if(/\b(not|no|less|lose|without|stop)\b/.test(t))for(const k in td)td[k]=-td[k]*0.8;
  const targets=findTargets(t);const names=targets[0]==='all'?'every people':targets.map(i=>'the '+S.facs[i].name).join(' and ');
  const understood=Object.keys(td).length||Object.keys(w).length||quirk||grant.length||Object.keys(rt).length||gov;
  if(!understood){let hsh=0;for(const ch of t)hsh=(hsh*31+ch.charCodeAt(0))>>>0;const k1=TRAITS[hsh%TRAITS.length],k2=TRAITS[(hsh>>5)%TRAITS.length];td[k1]=((hsh>>3)%2?1:-1)*0.35;td[k2]=((hsh>>7)%2?1:-1)*0.3;td.weirdness=0.25}
  const bits=[];if(verbs.length)bits.push(`${names} ${verbs.slice(0,3).join(', ')}`);if(Object.keys(rt).length)bits.push(`their rulers become ${Object.keys(rt).filter(k=>rt[k]>0).map(k=>CTRAIT_WORD[k][1]).join(' and ')||'gentler'}`);if(grant.length)bits.push(`they learn ${[...new Set(grant)].slice(-2).map(k=>TECH[k].n).join(' and ')}`);if(gov)bits.push(`they become a ${S.GOVS[gov].label.toLowerCase()}`);if(w.spawnTitan)bits.push('a monster is born among them');if(w.mutationBurst)bits.push('strange children are born for years after');if(w.foodMultiplier<1)bits.push('the land turns hard and hungry');if(w.foodMultiplier>1)bits.push('the land overflows with food');if(w.plague)bits.push('sickness follows');if(w.forceSchism)bits.push('a people breaks in two');if(quirk)bits.push('a new custom takes hold');
  const chron=understood?`A voice from the sky says, “${text}”. ${cap(bits.join('; ')||'The world shifts')}.`:`A voice from the sky says, “${text}”. No one understands. The children are born different anyway.`;
  return{targets,traitDeltas:td,valueDeltas:vd,rulerTraits:rt,grantTechs:[...new Set(grant)],gov,golden,techBoost:tech,world:w,newQuirk:quirk?{behavior:quirk}:null,title:understood?pickTitle(text):'The Incomprehensible Word',chronicle:chron,interpretation:understood?cap(bits.join('; '))+'.':'Not understood, so it nudged their evolution at random.'}}
function pickTitle(t){const w=t.replace(/[^\w\s]/g,'').split(/\s+/).filter(x=>x.length>3);const k=w.sort((a,b)=>b.length-a.length)[0]||'Word';return'The '+cap(k.toLowerCase())+' '+['Decree','Omen','Whisper','Command','Visitation'][t.length%5]}
function claudePrompt(text){const alive=S.alive();
  return`You are the physics of a simulated world where creature species evolve, build civilizations, and are ruled by characters who make choices. A player has spoken into the world. Translate their words into concrete changes.

Current year: ${Math.floor(S.year)}.
Living peoples:
${alive.map(f=>{const ru=S.rulerOf(f);return`- id ${f.id}: ${f.name} ("${f.gloss}"), ${colorWord(f.hue)}, ${ARCH[f.arch].label}, ${S.GOVS[f.gov].label}, ${S.eraOf(f)}, pop ${f.pop}, ${bodyDesc(f.g)}; ruler ${ru?S.cname(ru)+' ('+S.traitWords(ru).join(', ')+')':'none'}; values `+VALUES.map(k=>`${k} ${f.values[k].toFixed(2)}`).join(', ')+`; knows ${Object.keys(f.tech).join(', ')||'nothing'}`}).join('\n')}

Body traits (deltas -0.6..0.6): ${TRAITS.join(', ')}.
Cultural values (deltas -0.6..0.6): ${VALUES.join(', ')}.
Ruler personality (deltas -0.8..0.8): ${CTRAITS.join(', ')}.
Technologies you may grant (ids): ${Object.keys(TECH).join(', ')}.
Governments: ${Object.keys(S.GOVS).join(', ')}.
Custom behaviors (pick at most one): orbit, cairn, glyph, gift, still, pilgrim, chorus, mimic.

Player said: "${text.replace(/"/g,"'")}"

Interpret it creatively but faithfully. Prefer changing values, rulers and technology so the creatures' own choices produce the outcome, rather than forcing it. If it names a color or a people, target them; otherwise "all". Reply with only JSON:
{"targets":["all"] or [ids],"traitDeltas":{},"valueDeltas":{},"rulerTraits":{},"grantTechs":[],"gov":null or id,"golden":false,"techBoost":0-4,"world":{"mutationBurst":0,"foodMultiplier":1,"duration":40,"spawnTitan":false,"plague":false,"forceSchism":false,"relationsShift":0,"warBetween":null or [id,id],"nuke":false,"cult":false,"prophet":false,"newPeople":null or "sea"|"deep"|"sky"|"wood"|"waste"},"newQuirk":null or {"behavior":"...","name":"...","description":"one sentence like an anthropologist describing a puzzling custom"},"title":"2-5 word history-book name","chronicle":"1-2 sentences in the voice of a history book, naming who was affected","interpretation":"one short plain sentence telling the player what will change"}`}
function normalize(j){if(!j||typeof j!=='object')return null;const alive=S.alive().map(f=>f.id);const out={};const num=(o,keys,lo,hi)=>{const r={};if(o&&typeof o==='object')for(const k in o)if(keys.includes(k)&&isFinite(+o[k]))r[k]=clamp(+o[k],lo,hi);return r};
  out.targets=Array.isArray(j.targets)?j.targets.map(x=>x==='all'?'all':+x).filter(x=>x==='all'||alive.includes(x)):['all'];if(!out.targets.length)out.targets=['all'];
  out.traitDeltas=num(j.traitDeltas,TRAITS,-0.6,0.6);out.valueDeltas=num(j.valueDeltas,VALUES,-0.6,0.6);out.rulerTraits=num(j.rulerTraits,CTRAITS,-0.8,0.8);
  out.grantTechs=Array.isArray(j.grantTechs)?j.grantTechs.filter(k=>TECH[k]):[];out.gov=S.GOVS[j.gov]?j.gov:null;out.golden=!!j.golden;
  out.techBoost=clamp(+j.techBoost||0,0,4);const w=j.world||{};out.world={mutationBurst:+w.mutationBurst?1:0,foodMultiplier:isFinite(+w.foodMultiplier)&&+w.foodMultiplier>0?+w.foodMultiplier:1,duration:clamp(+w.duration||40,10,80),spawnTitan:!!w.spawnTitan,plague:!!w.plague,forceSchism:!!w.forceSchism,relationsShift:clamp(+w.relationsShift||0,-0.5,0.5),nuke:!!w.nuke,cult:!!w.cult,prophet:!!w.prophet,newPeople:['sea','deep','sky','wood','waste'].includes(w.newPeople)?w.newPeople:null,warBetween:Array.isArray(w.warBetween)&&w.warBetween.length===2&&w.warBetween.every(x=>alive.includes(+x))?w.warBetween.map(Number):null};
  if(j.newQuirk&&j.newQuirk.behavior)out.newQuirk={behavior:String(j.newQuirk.behavior),name:String(j.newQuirk.name||'').slice(0,40),description:String(j.newQuirk.description||'').slice(0,240)};
  out.title=String(j.title||'A Voice from the Sky').slice(0,60);out.chronicle=String(j.chronicle||'').slice(0,400);out.interpretation=String(j.interpretation||'').slice(0,200);return out}
let speaking=false;
$('#oracle').addEventListener('submit',async e=>{e.preventDefault();const text=$('#prompt').value.trim();if(!text||speaking)return;speaking=true;$('#speak').disabled=true;const st=$('#ostat');let spec=null;
  if(sampleFn){st.textContent='The world is listening…';try{spec=normalize(await sampleFn.json(claudePrompt(text),{modelTier:'quick',cache:false}))}catch(err){if(['not_granted','sampling_disabled','not_declared','capability_disabled','capability_removed'].includes(err&&err.code)){sampleFn=null;$('#oracleMode').textContent='interpreted by keyword'}}}
  if(!spec)spec=localInterpret(text);
  spec.prompt=text;const ev=S.intervene(spec);
  st.innerHTML=`<b>${esc(spec.title)}</b> · ${esc(spec.interpretation||'')}`;$('#prompt').value='';speaking=false;$('#speak').disabled=false;
  renderPeoples(true);if(ev)flyTo(ev.x,ev.y,Math.max(cam.z,0.9))});

// ---------- controls ----------
$('#play').onclick=()=>{running=!running;$('#play').textContent=running?'Pause':'Resume'};
$('#speed').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;speed=+b.dataset.s;document.querySelectorAll('#speed button').forEach(x=>x.setAttribute('aria-pressed',x===b))});
$('#newWorld').onclick=async()=>{if(SAVE.id)await saveNow(true);beginNewWorld()};
$('#slowZoom').onchange=e=>{autoSlow=e.target.checked};

// ---------- loop ----------
let lastT=performance.now(),simAcc=0,uiAcc=0;
function frame(now){
  const rdt=Math.min(0.1,(now-lastT)/1000);lastT=now;T+=rdt;frameN++;
  effSpeed=autoSlow&&cam.z>1.3?Math.max(0.05,speed/Math.pow(cam.z/1.3,1.45)):speed;
  if(actMode)effSpeed=Math.min(effSpeed,0.15);
  const blocked=bookOpen||chapterOpen||choiceOpen||introOn||actOpen||!$('#create').hidden||!$('#worlds').hidden||!$('#defeat').hidden;
  if(S.maker&&S.maker.defeated&&!saga.defeatShown&&!blocked)showDefeat();
  if(running&&!blocked&&skipping&&!saga.cardBusy){const t0=performance.now();while(performance.now()-t0<45){S.step(1/4);if(saga.pending||saga.choice)break}simAcc=0}
  else if(running&&!blocked&&!saga.choice&&!saga.cardBusy){simAcc+=rdt*effSpeed*YPS;const dt=effSpeed<=1.2?1/20:effSpeed<=5?1/12:effSpeed<=(S.cap>1000?10:45)?1/6:1/4;const t0=performance.now();while(simAcc>=dt){S.step(dt);simAcc-=dt;if(saga.pending||saga.choice){simAcc=0;break}if(performance.now()-t0>22){simAcc=0;break}}}
  if(!blocked&&saga.choice)openChoice(saga.choice);
  else if(!blocked&&saga.pending)openChapter();
  CURYEAR=S.year;
  drainFx();if(!bookOpen&&!chapterOpen)render(rdt);
  uiAcc+=rdt;if(uiAcc>0.3){uiAcc=0;$('#year').textContent=Math.floor(S.year);updInspect();chips();sagaUI();skipUI();renderNews();if(frameN%10===0)renderHand()}
  if(frameN%60===0&&!$('#p-peoples').hidden)renderPeoples();
  if(!bookOpen&&!$('#p-peoples').hidden)for(const [id,c] of portraitCanvases){const f=S.facs[id];if(f)portrait(c,f.g,T+id,{tech:techTier(f),noShadow:true})}
  if(!bookOpen&&sel){const c=$('#specCv');if(c){const ch=sel.char!=null?S.chars[sel.char]:null;portrait(c,sel.g,T,{tech:techTier(S.facs[sel.fac]),carry:sel.carry,crown:!!(sel.titan||(ch&&ch.role==='ruler')),flash:sel.flash,fighting:sel.state==='fight',moving:!!sel.moving,job:sel.role==='trader'?'trader':sel.role==='soldier'?null:sel.job,working:!!WORK_STATES[sel.state],banner:sel.role==='soldier',bannerHue:S.facs[sel.fac].hue})}}
  requestAnimationFrame(frame);
}

// ================= HISTORY BOOK =================
let wasRunning=true,bookEras=[],showMinor=false;
function computeEras(){
  const H=S.pophist;const end=Math.floor(S.year);if(!H.length)return[{a:0,b:end,dom:0}];
  let runs=[];for(const h of H){let best=null,bv=-1;for(const id in h.p)if(h.p[id]>bv){bv=h.p[id];best=+id}if(best==null)continue;const last=runs[runs.length-1];if(last&&last.dom===best)last.b=h.yr;else runs.push({a:h.yr,b:h.yr,dom:best})}
  if(!runs.length)return[{a:0,b:end,dom:0}];
  runs[0].a=0;runs[runs.length-1].b=end;for(let i=1;i<runs.length;i++)runs[i].a=runs[i-1].b;
  const minLen=Math.max(40,end/14);let changed=true;
  while(changed&&runs.length>1){changed=false;let si=-1,sl=1e9;for(let i=0;i<runs.length;i++){const l=runs[i].b-runs[i].a;if(l<sl){sl=l;si=i}}
    if(sl<minLen||runs.length>8){const i=si;const j=i===0?1:i===runs.length-1?i-1:((runs[i-1].b-runs[i-1].a)<(runs[i+1].b-runs[i+1].a)?i-1:i+1);const lo=Math.min(i,j),hi=Math.max(i,j);const keep=(runs[lo].b-runs[lo].a)>=(runs[hi].b-runs[hi].a)?runs[lo]:runs[hi];runs.splice(lo,2,{a:runs[lo].a,b:runs[hi].b,dom:keep.dom});changed=true}}
  const maxLen=Math.max(110,end/5);let guard=0;
  while(runs.length<8&&guard++<20){const i=runs.findIndex(r=>r.b-r.a>maxLen);if(i<0)break;const r=runs[i],mid=(r.a+r.b)/2;
    const cands=S.events.filter(e=>e.imp>=3&&e.yr>r.a+35&&e.yr<r.b-35);let sp=cands.sort((x,y)=>Math.abs(x.yr-mid)-Math.abs(y.yr-mid))[0];const at=sp?sp.yr:Math.round(mid);
    let dom2=r.dom;for(const h of S.pophist){if(h.yr<at)continue;let bv=-1;for(const id in h.p)if(h.p[id]>bv){bv=h.p[id];dom2=+id}break}
    runs.splice(i,1,{a:r.a,b:at,dom:r.dom},{a:at,b:r.b,dom:dom2})}
  return runs;
}
const _eraNames=new Map();function eraName(era,evs,i){const key=era.a+'-'+era.b;if(_eraNames.has(key))return _eraNames.get(key);const nm=eraName0(era,evs,i);let out=nm;const used=[..._eraNames.values()];if(used.includes(out))out=nm.replace('The ','The Second ').replace('Second First','Later');if(used.includes(out))out=nm.replace('The ','The Last ');_eraNames.set(key,out);return out}
function eraName0(era,evs,i){const f=S.facs[era.dom];const c=t=>evs.filter(e=>t.includes(e.type)).length;
  const war=c(['war','battle','razed','conquest']),ti=c(['titan','titanfall']),tr=c(['trade','coin','alliance']),sc=c(['schism']),pl=c(['plague','comet']),dv=c(['divine']),em=c(['empire']);
  let adj=i===0?'First':ti?'Monstrous':war>=6?'Burning':sc>=2?'Sundering':pl?'Fevered':dv>=2?'Haunted':em?'Imperial':tr>=3?'Golden':war>=3?'Iron':'Quiet';
  return`The ${adj} Age of the ${f?f.name:'Unknown'}`}
function firstSentence(t){const m=t.match(/^.*?[.!?](\s|$)/);return(m?m[0]:t).trim()}
function lowerFirst(s){return s.charAt(0).toLowerCase()+s.slice(1)}
const CONN=['Then','Soon after','Not long after','Meanwhile','In the same age','Later','Afterward','Within a generation'];
function evLink(e){return`<a class="evl" data-ev="${e.id}">${esc(e.title)}</a>`}
function eraParagraphs(era,evs,i){
  const out=[];const f=S.facs[era.dom];
  const pr={nuke:10,blight:9,betrayal:9,revolution:8,coup:8,assassination:8,union:8,depart:9,golden:7,making:7,uplift:7,marriage:6,oath:5,gov:5,wonder:4,rulerdeath:3,lang:3,tech:3,dawn:9,schism:8,empire:8,collapse:8,extinct:8,titan:8,titanfall:7,war:7,razed:7,conquest:6,battle:5,divine:9,plague:6,comet:6,transform:6,mutation:5,trade:4,coin:4,alliance:4,age:3,hero:4,herodeath:3,peace:4,thaw:2,city:2};
  const chosen=evs.filter(e=>e.imp>=2).sort((a,b)=>(pr[b.type]||1)*b.imp-(pr[a.type]||1)*a.imp).slice(0,9).sort((a,b)=>a.yr-b.yr);
  const born=S.facs.filter(x=>x.born>=era.a&&x.born<era.b);
  let open=i===0?`In the beginning the world of ${esc(worldTitle)} was empty of thought. `:'';
  open+=`${eraName(era,evs,i)} runs from year ${era.a} to year ${era.b}. For most of it, ${esc(f?f.species:'no one')} were the most numerous creatures alive${f?`: ${esc(bodyDesc(f.g))}`:''}.`;
  if(born.length>1)open+=` ${born.length} new peoples appear in these years.`;
  out.push(`<p class="drop">${open}</p>`);
  let p=[];chosen.forEach((e,k)=>{const lead=k===0?`In year ${e.yr}`:`${CONN[(e.id+k)%CONN.length]}, in year ${e.yr}`;const body=e.text.split(/(?<=\.)\s/).slice(0,2).join(' ');const why=(e.data&&e.data.why||[]).filter(Boolean)[0];p.push(`${lead}: ${evLink(e)}. ${esc(body)}${why?` <span class="because">Why? ${esc(why.replace(/\.$/,''))}.</span>`:''}`);if(p.length===3){out.push('<p>'+p.join(' ')+'</p>');p=[]}});
  if(p.length)out.push('<p>'+p.join(' ')+'</p>');
  const battles=evs.filter(e=>e.type==='battle');if(battles.length>2){const dead=battles.reduce((s,e)=>s+(e.data.total||0),0);out.push(`<p>Across the age, ${battles.length} recorded battles killed at least ${dead} creatures.</p>`)}
  return out.join('');
}
function bookStats(){const c=t=>S.events.filter(e=>t.includes(e.type)).length;return[[S.facs.length,'peoples'],[c(['war']),'wars'],[c(['battle']),'battles'],[S.events.filter(e=>e.type==='found').length+S.facs.length,'settlements'],[S.chars.filter(x=>x.reignStart!=null).length,'rulers'],[c(['betrayal','assassination','coup']),'betrayals'],[c(['nuke']),'cities burned'],[c(['divine']),'divine words']]}
function buildBook(){
  const pg=$('#bpage');_eraNames.clear();bookEras=computeEras();const yr=Math.floor(S.year);const alive=S.facs.filter(f=>f.died==null);
  const evIn=(era)=>S.events.filter(e=>e.yr>=era.a&&(e.yr<era.b||era===bookEras[bookEras.length-1]));
  let h=`<div class="btitle"><div class="kick">A history in ${bookEras.length} ${bookEras.length===1?'age':'ages'}</div><h1>The Chronicle of ${esc(worldTitle)}</h1><p>Being an account of years 0 to ${yr}, of the peoples who lived, the wars they made, and what they became</p>
    <div class="bstats">${bookStats().map(([n,l])=>`<div><b>${n}</b>${l}</div>`).join('')}</div></div>`;
  h+=`<h2>The World, Replayed</h2><div id="replayBox"></div><h2>The Ages</h2>${sagaBookHTML()}<h2>The Annals</h2><p style="font-size:16px;color:var(--vmuted)">The plain record, age by age.</p>`;
  bookEras.forEach((era,i)=>{h+=`<h3>${eraName(era,evIn(era),i)} <span class="yr">years ${era.a}–${era.b}</span></h3>`+eraParagraphs(era,evIn(era),i)});
  h+=`<p>${alive.length?`In year ${yr} the story is still being written. ${alive.length} ${alive.length===1?'people survives':'peoples survive'}: ${alive.sort((a,b)=>b.pop-a.pop).map(f=>`the ${esc(f.name)} (${f.pop})`).join(', ')}.`:'In the end, nothing was left.'}</p>`;
  h+=`<h2>The Shape of the Ages</h2><p style="font-size:15px;color:var(--vmuted);margin-bottom:0">Population of every people over time. Each band is one people; the rules mark the turning of the ages.</p><div class="chartbox"><canvas id="popchart"></canvas></div>`;
  h+=`<h2>Timeline of Great Events</h2><div class="row" style="font-family:var(--f-ui)"><button type="button" class="tbtn" id="minorBtn">${showMinor?'Show only great events':'Include minor events'}</button></div>`;
  bookEras.forEach((era,i)=>{const evs=evIn(era).filter(e=>e.imp>=(showMinor?1:2));h+=`<div class="era" id="era${i}"><div class="eh"><h3>${eraName(era,evIn(era),i)}</h3><span>years ${era.a}–${era.b}</span></div>${evs.map(e=>`<div class="tev${e.imp>=3?' big':''}" data-ev="${e.id}"><button type="button" aria-expanded="false"><span class="ty">${e.yr}</span><span class="gl" style="background:${e.facs.length?hsl(e.snaps[e.facs[0]]?e.snaps[e.facs[0]].hue:0,55,55):'#999'}"></span><span class="tt">${esc(e.title)}</span><span class="car">›</span></button></div>`).join('')||'<p style="font-family:var(--f-ui);font-size:14px;color:var(--vmuted)">No great events. The peoples simply lived.</p>'}</div>`});
  h+=`<h2>The Peoples</h2><div class="peoples">${S.facs.map(f=>peopleCard(f)).join('')}</div>`;
  h+=`<h2>Rulers and Their Choices</h2>${rulersHTML()}`;
  h+=`<h2>The Tongues</h2><p style="font-size:16px;color:var(--vmuted)">Every people began naming things with pictures. Some learned to speak those names, then to write them, then to print them. Every few generations the sounds shift, and the names of places drift with them.</p>${tonguesHTML()}`;
  if(S.wonders.length)h+=`<h2>Wonders</h2><div class="lines" style="font-family:var(--f-ui);font-size:15px">${S.wonders.map(w=>`<div><span class="ty">${w.yr}</span> <b>${esc(cap(w.name))}</b>, raised by ${esc(S.cname(S.chars[w.by]))} of the ${esc(S.facs[w.fac].name)}</div>`).join('')}</div>`;
  h+=`<h2>The Family Tree</h2><div class="tree">${treeHTML()}</div>`;
  pg.innerHTML=h;
  drawPopChart();mountReplay();wireTabs(pg);paintCast(pg);
  pg.querySelectorAll('canvas[data-pg]').forEach(c=>{const f=S.facs[+c.dataset.pg];const sn=c.dataset.which==='a'?f.snaps[0]:f.died!=null?f.snaps[f.snaps.length-1]:{g:f.g,tech:Object.keys(f.tech).length};portrait(c,sn.g,1.3,{tech:Math.min(9,(sn.tech||0)/3),noShadow:true})});
}
function peopleCard(f){
  const tr=S.events.filter(e=>e.type==='transform'&&e.facs[0]===f.id);const path=[ARCH[f.snaps[0].arch]?ARCH[f.snaps[0].arch].label:'',...tr.map(e=>e.title.split(' to ').pop())].filter(Boolean);
  const kids=f.children.map(i=>S.facs[i].name);
  return`<div class="pcard"><h4><span style="width:12px;height:12px;border-radius:50%;background:${hsl(f.hue,60,50)};display:inline-block"></span>${esc(f.name)}</h4>
  <div class="d">${f.died!=null?`Years ${f.born}–${f.died}`:`Year ${f.born} to the present`} · peak ${f.stats.peak} in year ${f.stats.peakYear||f.born}</div>
  <div class="pp"><div><canvas data-pg="${f.id}" data-which="a"></canvas><span>at their birth, year ${f.born}</span></div><div><canvas data-pg="${f.id}" data-which="b"></canvas><span>${f.died!=null?`at their end, year ${f.died}`:`now, year ${Math.floor(S.year)}`}</span></div></div>
  <i class="bd">${esc(cap(bodyDesc(f.died!=null?f.snaps[f.snaps.length-1].g:f.g)))}.</i>
  ${path.length>1?`<div><b>Became:</b> ${path.map(esc).join(' → ')}</div>`:`<div><b>${esc(path[0]||'')}</b></div>`}
  ${f.parent!=null?`<div class="d">Broke away from the ${esc(S.facs[f.parent].name)}</div>`:''}<div class="d">${esc(S.GOVS[f.gov].label)} · ${esc(S.eraOf(f))}${f.endCause==='departed'?' · left the world':f.endCause==='union'?' · joined another realm':''}</div>
  ${kids.length?`<div class="d">Gave rise to: ${kids.map(esc).join(', ')}</div>`:''}
  ${f.quirks.map(q=>`<div><b>${esc(q.name)}.</b> <span class="d">${esc(S.quirkText(f,q))}</span></div>`).join('')}
  <div class="d">${f.stats.births} born · ${f.stats.kills} kills · ${f.stats.founded} settlements founded${f.stats.trades?` · ${f.stats.trades} caravans`:''}</div></div>`}
function rulersHTML(){
  let h='';for(const f of S.facs){const rs=f.rulers.map(r=>S.chars[r.id]).filter(Boolean);if(!rs.length)continue;
    h+=`<h3>The ${esc(f.name)}</h3><div class="rulers">${f.rulers.map(r=>{const c=S.chars[r.id];if(!c)return'';const end=c.died!=null?c.died:c.alive?'now':'?';const how=c.cause?{age:'died of old age',slain:'killed in battle',executed:'executed',assassinated:'murdered',plague:'died of plague',hunger:'starved',radiation:'killed by poison in the land',cold:'froze in the Long Night',fire:'burned with their city',deposed:'deposed'}[c.cause]||c.cause:'';
      const deeds=c.deeds.filter(d=>!/^killed \d+ enemies$/.test(d.txt)).slice(0,6).map(d=>esc(d.txt)).join('; ');
      return`<div class="rl"><div class="ry">${r.from}–${end}</div><div><b>${esc(S.cname(c))}</b> <span class="d">${esc(r.how||'')}${S.traitWords(c).length?` · ${esc(S.traitWords(c).join(', '))}`:''}</span>${deeds?`<div>${deeds}.</div>`:''}${how?`<div class="d">${how}.</div>`:''}</div></div>`}).join('')}</div>`}
  return h||'<p>No one has ruled yet.</p>'}
function tonguesHTML(){
  const C=['sun','water','people','war','god','king','mother','death'];
  return S.langs.map(L=>{const f=S.facs.find(x=>x.lang===L.id)||S.facs[L.fac];if(!f)return'';const par=L.parent!=null?S.facs.find(x=>x.lang===L.parent):null;
    const snaps=L.snaps.filter((s,i,a)=>i===0||i===a.length-1||i%Math.max(1,Math.ceil(a.length/6))===0).slice(-7);
    const stageName=['pictographs','spoken','syllabary','alphabet'];
    return`<div class="tongue"><b style="font-family:var(--f-disp);font-size:20px">The tongue of the ${esc(f.name)}</b>${par?` <span class="d">· a daughter of the ${esc(par.name)} tongue</span>`:''}<div class="d" style="margin:4px 0 8px">${stageName[L.stage]} · ${L.changes.length} sound changes since year ${L.born}</div>
    <table><tr><th>Meaning</th>${snaps.map(s=>`<th>${s.yr}</th>`).join('')}</tr>${C.map(c=>`<tr><td class="gl">${CONCEPTS[c]} ${GLOSS[c]}</td>${snaps.map(s=>`<td>${s.stage===0?'<span class="d">'+CONCEPTS[c]+'</span>':esc(s.words[c])}</td>`).join('')}</tr>`).join('')}</table>
    ${L.changes.length?`<div style="margin-top:8px">${L.changes.slice(-5).map(ch=>`<div class="d"><span class="ty">${ch.yr}</span> ${esc(ch.d)}: “${esc(ch.ex[1])}” became “${esc(ch.ex[2])}” (${esc(GLOSS[ch.ex[0]].toLowerCase())})</div>`).join('')}</div>`:''}</div>`}).join('')}
function treeHTML(){const node=f=>`<li><span class="n"><i style="background:${hsl(f.hue,60,50)}"></i>${esc(f.name)} <small>${f.born}–${f.died!=null?f.died:'now'}</small></span>${f.children.length?`<ul>${f.children.map(i=>node(S.facs[i])).join('')}</ul>`:''}</li>`;return`<ul>${S.facs.filter(f=>f.parent==null).map(node).join('')}</ul>`}
function drawPopChart(){
  const c=$('#popchart');if(!c)return;const dpr=Math.min(2,window.devicePixelRatio||1);const w=c.clientWidth,hgt=c.clientHeight;c.width=w*dpr;c.height=hgt*dpr;const x=c.getContext('2d');x.scale(dpr,dpr);
  const H=S.pophist;if(H.length<2){x.fillStyle='#4d5463';x.font='14px Figtree';x.fillText('Not enough years have passed to chart.',10,30);return}
  const pad={l:34,r:8,t:10,b:24};const yrMax=Math.max(1,H[H.length-1].yr);let mx=1;for(const h of H){let s=0;for(const k in h.p)s+=h.p[k];mx=Math.max(mx,s)}
  const X=y=>pad.l+y/yrMax*(w-pad.l-pad.r),Y=v=>hgt-pad.b-v/mx*(hgt-pad.t-pad.b);
  x.strokeStyle='rgba(26,30,41,.12)';x.fillStyle='#4d5463';x.font='11px IBM Plex Mono, monospace';x.textAlign='right';
  const step=mx>400?200:mx>200?100:50;for(let v=0;v<=mx;v+=step){x.beginPath();x.moveTo(pad.l,Y(v));x.lineTo(w-pad.r,Y(v));x.stroke();x.fillText(v,pad.l-4,Y(v)+4)}
  const ids=S.facs.map(f=>f.id);const base=H.map(()=>0);
  for(const id of ids){const f=S.facs[id];if(!H.some(h=>h.p[id]))continue;x.beginPath();H.forEach((h,i)=>{const v=base[i]+(h.p[id]||0);i?x.lineTo(X(h.yr),Y(v)):x.moveTo(X(h.yr),Y(v))});for(let i=H.length-1;i>=0;i--)x.lineTo(X(H[i].yr),Y(base[i]));x.closePath();x.fillStyle=hsl(f.hue,48,52,0.88);x.fill();x.strokeStyle='rgba(217,220,207,.5)';x.lineWidth=0.6;x.stroke();H.forEach((h,i)=>base[i]+=h.p[id]||0)}
  x.textAlign='left';x.font='600 11px Figtree, sans-serif';
  bookEras.forEach((e,i)=>{if(i>0){x.strokeStyle='#8f2b22';x.lineWidth=1.2;x.setLineDash([3,3]);x.beginPath();x.moveTo(X(e.a),pad.t);x.lineTo(X(e.a),hgt-pad.b);x.stroke();x.setLineDash([])}x.fillStyle='#1a1e29';x.fillText(String(e.a),X(e.a)+3,hgt-8)});
}
function evDetail(e){
  const wrap=document.createElement('div');wrap.className='tdet';
  let h=`<p>${esc(e.text)}</p>`;
  const whys=(e.data&&e.data.why||[]).filter(Boolean);const dec=e.data&&e.data.decider!=null?S.chars[e.data.decider]:null;
  if(whys.length||dec)h+=`<div class="whyl">${dec?`<div>Decided by <b>${esc(S.cname(dec))}</b>${S.traitWords(dec).length?`, who was ${esc(S.traitWords(dec).join(', '))}`:''}.</div>`:''}${whys.map(x=>`<div>Because ${esc(lowerFirst(x.replace(/\.$/,'')))}.</div>`).join('')}</div>`;
  if(e.data&&e.data.prompt)h+=`<p><i>The words spoken were: “${esc(e.data.prompt)}”</i></p>`;
  const ports=e.facs.map(id=>{const sn=e.snaps[id];return sn?`<div class="port"><canvas data-g="${id}"></canvas><b>${esc(sn.name)}</b>${ARCH[sn.arch]?ARCH[sn.arch].label:''} · ${sn.pop} living</div>`:''}).join('');
  const indiv=e.data&&e.data.g?`<div class="port"><canvas data-gi="1"></canvas><b>${esc(e.title.replace(/^(Rise|Death|Birth|Fall) of /,''))}</b>as they looked</div>`:'';
  if(ports||indiv)h+=`<div class="ports">${indiv}${ports}</div>`;
  if(e.type==='battle'&&e.data.cas){const tot=e.data.total||1;h+=`<div style="font-family:var(--f-ui);font-size:13px">Casualties</div><div class="casb">${e.facs.map(id=>`<i style="flex:${e.data.cas[id]||0};background:${hsl(e.snaps[id].hue,55,50)}"></i>`).join('')}</div><div style="font-family:var(--f-ui);font-size:12.5px;color:var(--vmuted)">${e.facs.map(id=>`${esc(e.snaps[id].name)}: ${e.data.cas[id]||0}`).join(' · ')}</div>`}
  h+=`<button type="button" class="tbtn" data-map="${e.id}">Show where it happened</button>`;
  wrap.innerHTML=h;
  setTimeout(()=>{wrap.querySelectorAll('canvas[data-g]').forEach(c=>{const sn=e.snaps[+c.dataset.g];portrait(c,sn.g,1.1,{tech:Math.min(9,(sn.tech||0)/3),noShadow:true})});const ci=wrap.querySelector('canvas[data-gi]');if(ci)portrait(ci,e.data.g,1.1,{crown:true,noShadow:true})},0);
  return wrap;
}
function openEv(id,scroll){const el=document.querySelector(`.tev[data-ev="${id}"]`);if(!el){if(!showMinor){showMinor=true;buildBook();return openEv(id,scroll)}return}
  if(!el.classList.contains('open'))toggleEv(el);if(scroll)el.scrollIntoView({behavior:'smooth',block:'center'})}
function toggleEv(el){const e=S.events.find(x=>x.id==el.dataset.ev);const open=el.classList.toggle('open');el.querySelector('button').setAttribute('aria-expanded',open);if(open)el.append(evDetail(e));else{const d=el.querySelector('.tdet');if(d)d.remove()}}
$('#bpage').addEventListener('click',ev=>{
  const m=ev.target.closest('[data-map]');if(m){const e=S.events.find(x=>x.id==m.dataset.map);closeBook();flyTo(e.x,e.y,2.4);return}
  if(ev.target.id==='minorBtn'){showMinor=!showMinor;buildBook();document.getElementById('minorBtn').scrollIntoView({block:'center'});return}
  const l=ev.target.closest('a.evl');if(l){openEv(+l.dataset.ev,true);return}
  const t=ev.target.closest('.tev>button');if(t)toggleEv(t.parentElement)});
function openBook(){wasRunning=running;bookOpen=true;$('#book').hidden=false;document.body.style.overflow='hidden';buildBook();$('#book').scrollTop=0}
function closeBook(){bookOpen=false;$('#book').hidden=true;document.body.style.overflow='';if(narrCtl){narrCtl.abort();narrCtl=null}}
$('#bookBtn').onclick=openBook;$('#bookResume').onclick=closeBook;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&bookOpen)closeBook()});
let narrCtl=null;
$('#narrateBtn').onclick=async()=>{
  if(!sampleFn)return;const box=$('#claudeNarr');if(!box)return;
  if(narrCtl){narrCtl.abort();narrCtl=null;$('#narrateBtn').textContent='Have Claude narrate this history';return}
  box.innerHTML='<div class="claude"><div class="cst">Claude is reading the annals…</div></div>';const inner=box.firstChild;
  const evs=S.events.filter(e=>e.imp>=2).slice(-160);
  const prompt=`You are the court historian of an invented world called ${worldTitle}, where creature species evolve, split into new peoples, build or devour civilizations, and are occasionally changed by a voice from the sky (the player). Below is the raw record of its history and its peoples.

Write the history as a short, vivid book: 5 to 8 chapters, one per great age, in chronological order. Start each chapter with a line beginning "## " that names the age and its years. Each chapter is two short paragraphs. Be specific: name peoples, places, rulers, titans and years from the record. Explain the choices: why rulers went to war, married, betrayed, rebelled or built, using the reasons in the record. Note how their languages and names changed. Describe what the creatures looked like and how their bodies and customs changed. Offer plausible interpretations of their stranger customs, the way a historian would of a lost culture. Do not invent events that contradict the record. End with a chapter "## Afterword" on what this world might become. Plain text only, no other markdown.

PEOPLES:
${S.facs.map(f=>`${f.name} (years ${f.born}-${f.died!=null?f.died:'now'}${f.parent!=null?', split from '+S.facs[f.parent].name:''}): ${ARCH[f.arch].label}; ${bodyDesc(f.died!=null?f.snaps[f.snaps.length-1].g:f.g)}; customs: ${f.quirks.map(q=>q.name).join(', ')||'none'}; peak ${f.stats.peak}`).join('\n')}

RULERS:
${S.chars.filter(c=>c.reignStart!=null).slice(-60).map(c=>`${S.cname(c)} of the ${S.facs[c.fac].name}, from ${c.reignStart}${c.died!=null?' to '+c.died+' ('+(c.cause||'')+')':''}; ${S.traitWords(c).join(', ')}; ${c.deeds.slice(0,4).map(d=>d.txt).join('; ')}`).join('\n')}

RECORD (with the reasons the peoples had):
${evs.map(e=>`${e.yr}: ${e.title}. ${e.text}${e.data&&e.data.why&&e.data.why.length?' WHY: '+e.data.why.filter(Boolean).join(' '):''}`).join('\n')}

It is now year ${Math.floor(S.year)}.`;
  narrCtl=new AbortController();$('#narrateBtn').textContent='Stop';
  const renderText=t=>{inner.innerHTML=t.split(/\n+/).filter(Boolean).map(l=>l.startsWith('## ')?`<h3>${esc(l.slice(3))}</h3>`:`<p>${esc(l)}</p>`).join('')};
  try{const r=await sampleFn(prompt,{cache:false,signal:narrCtl.signal,onText:({text})=>renderText(text)});renderText(r.text);if(r.truncated)inner.insertAdjacentHTML('beforeend','<p class="cst">The historian ran out of pages here.</p>')}
  catch(err){if(err&&err.code==='cancelled'){if(err.text)renderText(err.text)}else{inner.innerHTML=(err&&err.text?'':'')+`<div class="cst">${err&&err.code==='not_granted'?'Claude was not allowed for this page, so only the annals below are available.':err&&err.code==='rate_limited'?'Too many requests right now. Try again in a little while.':'The narration could not be finished. Try again.'}</div>`;if(err&&['not_granted','sampling_disabled'].includes(err.code)){sampleFn=null;$('#narrateBtn').hidden=true}}}
  narrCtl=null;if(sampleFn)$('#narrateBtn').textContent='Narrate again';
};

// ================= SAGA: a historian's history of the world =================
function roman(n){const T=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];let o='';for(const [v,r] of T)while(n>=v){o+=r;n-=v}return o}
const ROMAN=['',...Array.from({length:300},(_,i)=>roman(i+1))];
let saga={};
let chapterOpen=false,downloadsFn=null,rec=null;
function sagaReset(){
  saga={on:$('#sagaOn')?$('#sagaOn').checked:true,target:+($('#ages')?$('#ages').value:0),endRequested:false,ch:[],ageStart:0,crisisDone:false,pending:false,ended:false,finaleStarted:false,closing:null};
  setListening(false);rec={frames:[],ruins:[]};S.onYear=onYear;S.noRespawn=saga.on;recordFrame(0);sagaUI();
}
function recordFrame(y){const f={y,s:S.setts.map(s=>[Math.round(s.x),Math.round(s.y),s.fac,s.level]),a:S.facs.filter(f=>f.army&&f.died==null).map(f=>[Math.round(f.army.x),Math.round(f.army.y),f.id]),p:{}};for(const fa of S.facs)if(fa.died==null)f.p[fa.id]=fa.pop;rec.frames.push(f)}
function popAt(fid,y){let best=null;for(const fr of rec.frames){if(fr.y>y)break;best=fr}return best?best.p[fid]||0:0}
function topFacIds(){return S.alive().slice().sort((a,b)=>b.pop-a.pop).slice(0,2).map(f=>f.id)}
// How strongly does an event divide history?
function divWeight(e){const w=divWeight0(e);if(e.type==='rivalgod'||e.type==='forgotten'||e.type==='godfalls')return Math.max(w,8);const ever=(S.maker&&S.maker.ever)||{};return e.facs.some(id=>ever[id])?w:Math.min(w,3)}
function divWeight0(e){const top=topFacIds();const ever=(S.maker&&S.maker.ever)||{};const big=e.facs.some(id=>ever[id]);const mid=big||e.facs.some(id=>top.includes(id));
  switch(e.type){
    case'schism':{const p=e.facs[1]!=null?popAt(e.facs[1],e.yr-1)||S.facs[e.facs[1]].pop:0;return big&&p>=30?8:mid&&p>=30?6:4}
    case'revolution':return big?8:mid?6:4;case'coup':return big?6:3;case'union':return 9;
    case'peace':return((e.data.dur||0)>=30||(e.data.dead||0)>=40)&&mid?8:(e.data.dur||0)>=15?6:2;
    case'extinct':{const f=S.facs[e.facs[0]];return f&&f.stats.peak>=80?8:f&&f.stats.peak>=35?6:3}
    case'conquest':return e.text.includes('the capital')?(mid?8:6):2;
    case'faith':return big?6:3;case'sect':return big?6:4;case'convert':return big?8:mid?6:4;
    case'cult':return 3;case'persecution':return big?5:3;case'martyr':return 6;case'merge':return big?8:6;case'fulfilled':return big?8:6;case'falseprophet':return 4;case'scandal':return 2;case'prophet':return 2;
    case'uprising':return e.title.includes('crushed')?(big?8:4):4;
    case'arrival':return 8;case'plague':return big?6:4;case'famine':return 6;case'comet':return 3;
    case'golden':return big?6:3;case'nuke':return S.events.some(x=>x.type==='nuke'&&x.id<e.id&&e.yr-x.yr<150)?6:10;case'blight':return 8;case'making':return 7;case'uplift':return 7;case'depart':return 9;case'winter':return 9;
    case'titan':return 4;case'titanfall':return 6;case'script':return big?4:2;case'betrayal':return big?7:5;case'assassination':return big?7:3;
    case'war':return big&&e.data.goal==='holy'?5:mid?4:2;
    case'choice':return 4;case'act':return e.data.big?7:2;case'decree':return 3;
    case'tech':return big&&['writing','iron','philosophy','gunpowder','industry','electricity','fission','computing','genetics'].includes(e.data.tech)&&!S.events.some(x=>x.type==='tech'&&x.data.tech===e.data.tech&&x.yr<e.yr)?5:0;
    case'finale':case'end':return 12;
  }return 0}
function ageLimits(){const base=150;return{min:Math.round(base*0.6),max:Math.round(base*1.5),base}}
function onYear(Y){
  if(Y%3===0)recordFrame(Y);
  if(!saga.pending)cardTick(Y);
  if(!saga.on||saga.ended||saga.pending)return;
  const n=saga.ch.length,len=Y-saga.ageStart;
  const finalPhase=saga.target?n>=saga.target-1:saga.endRequested;
  if(!finalPhase&&!S.alive().length&&!saga.final){S.endWorld();saga.closing=S.events[S.events.length-1].id;saga.pending=true;saga.final=true;return}
  if(finalPhase){if(!saga.finaleStarted){saga.finaleStarted=true;S.startFinale()}if(S.finale&&S.finale.done){S.endWorld();saga.closing=S.events[S.events.length-1].id;saga.pending=true;saga.final=true}return}
  // an age ends a few years AFTER a world-dividing event, so the chapter can show what it changed
  if(saga.closingAt!=null){if(Y>=saga.closingAt){saga.pending=true;saga.closingAt=null}return}
  const minLen=n===0?120:(saga.ageMin||150);
  if(len>=minLen){const recent=S.events.filter(e=>e.yr>=Y-1&&e.yr>=saga.ageStart).map(e=>[e,divWeight(e)]).filter(x=>x[1]>=8).sort((a,b)=>b[1]-a[1]);
    const acc=recent.length?S.events.filter(e=>e.yr>=saga.ageStart).reduce((t,e)=>{const w=divWeight(e);return t+(w>=5?w:0)},0):0;
    if(recent.length&&(acc>=(saga.ageAcc||35)||recent[0][1]>=9)){saga.closing=recent[0][0].id;saga.closingAt=Y+(recent[0][1]>=9?2:4);return}}
  // a long quiet invites trouble from outside; a very long one ends on its biggest moment
  if(!saga.crisisDone&&len>=230&&!S.events.some(e=>e.yr>=Y-120&&divWeight(e)>=6)){saga.crisisDone=true;S.crisis(S.pickCrisis(Math.max(1,n)))}
  if(len>=(saga.ageMin||150)+320){const best=S.events.filter(e=>e.yr>=Y-120).map(e=>[e,divWeight(e)]).sort((a,b)=>b[1]-a[1])[0];saga.closing=best&&best[1]>=3?best[0].id:null;saga.pending=true}
}
function sagaUI(){const el=$('#sagaChip');if(!el)return;if(!saga.on){el.textContent='Free play';return}
  const n=saga.ch.length;const fin=saga.target?n>=saga.target-1:saga.endRequested;const eb=$('#endBtn');if(eb)eb.hidden=!!(saga.target||saga.ended||saga.endRequested);el.textContent=saga.ended?'The end':fin?`Final age${S.finale?': '+({lastwar:'the Last War',unification:'one world',devourer:'the Devourer',longnight:'the Long Night'}[S.finale.kind]):''}`:saga.target?`Age ${ROMAN[n+1]} of ${saga.target}`:`Age ${ROMAN[n+1]} · endless`}

// ---------- snapshot of the age (for the tabs) ----------
const natH=s=>`<bdi class="nat">${esc(s)}</bdi>`;
function snapshotAge(a,b){
  const evs=S.events.filter(e=>e.yr>=a&&e.yr<=b);
  const facs=S.facs.filter(f=>f.born<=b&&(f.died==null||f.died>=a));
  const peoples=facs.map(f=>{const L=S.langs[f.lang];const ru=S.rulerOf(f);const F=f.state!=null?S.faiths[f.state]:null;return{id:f.id,name:f.name,nat:S.native(f.nameId),gloss:f.gloss,hue:Math.round(f.hue),pop0:popAt(f.id,a),pop:f.died!=null?0:f.pop,towns:f.died!=null?0:S.facSetts(f).length,gov:S.GOVS[f.gov].label,era:S.eraOf(f),faith:F?F.title:null,ruler:ru&&f.died==null?S.cname(ru):null,born:f.born,died:f.died,parent:f.parent!=null?S.facs[f.parent].name:null,body:bodyDesc(f.g),g:{...f.g},
    rulers:f.rulers.filter(r=>{const c=S.chars[r.id];return c&&(c.died==null||c.died>=a)&&r.from<=b}).map(r=>{const c=S.chars[r.id];return{name:S.cname(c),nat:S.native(c.nameId),from:r.from,to:c.died,cause:c.cause,how:r.how,traits:S.traitWords(c)}})}}).sort((x,y)=>(y.pop||0)-(x.pop||0));
  const shares=S.faithShares();
  const faiths=S.faiths.filter(F=>F.born<=b&&((shares[F.id]||0)>0.5||(F.born>=a))).map(F=>{const holders=S.alive().filter(f=>f.state===F.id).map(f=>f.name);const fol=[];for(const f of S.alive())if(f.belief&&f.belief[F.id]>0.05)fol.push({name:f.name,share:Math.round(f.belief[F.id]*100),hue:Math.round(f.hue)});
    return{id:F.id,title:F.title,nat:S.faithNative(F),gods:F.gods,tenets:F.tenets.map(t=>S.TENETS[t].t),scripture:F.scripture,oral:F.oral,founder:F.founder!=null?S.cname(S.chars[F.founder]):null,origin:S.facs[F.origin].name,born:F.born,parent:F.parent!=null?S.faiths[F.parent].title:null,followers:Math.round(shares[F.id]||0),holders,fol,symbol:F.cult?'◬':CONCEPTS[F.domain]||'✶',hue:Math.round(F.hue),newHere:F.born>=a,cult:!!F.cult,maker:!!F.maker,writings:(F.writings||[]).filter(w=>w.yr<=b).slice(-3).map(w=>w.text),fate:F.fate||null,prophecy:F.prophecy?{text:F.prophecy.text,done:F.prophecy.done}:null}}).sort((x,y)=>y.followers-x.followers);
  const moves=(S.moves||[]).filter(m=>m.born<=b&&(m.end==null||m.end>=a)).map(m=>{const c=S.chars[m.leader];const F=S.faiths[m.faith];const f=S.facs[m.fac];return{kind:m.kind,who:S.cname(c),faith:F.title,people:f.name,born:m.born,end:m.end!=null&&m.end<=b?m.end:null,outcome:m.end!=null&&m.end<=b?m.outcome:'still preaching',peak:Math.round(100*(m.peak||m.support||0)),hue:Math.round(F.hue)}});
  const langs=S.langs.filter(Lg=>{const f=S.facs.find(x=>x.lang===Lg.id);return f&&f.born<=b&&(f.died==null||f.died>=a)}).map(Lg=>{const f=S.facs.find(x=>x.lang===Lg.id);const info=S.scriptOf(Lg);const words=['sun','water','people','god','king','war','death','mother'].map(c=>({c,g:GLOSS[c],w:Lg.lex[c],n:writeScript(Lg.lex[c],[c],Lg.script||'picto',Lg.swaps)}));
    const parent=Lg.parent!=null?S.facs.find(x=>x.lang===Lg.parent):null;
    return{fac:f.name,hue:Math.round(f.hue),script:Lg.script,label:info.label,like:info.like,rtl:!!info.rtl,stage:Lg.stage,words,name:f.name,nameNat:S.native(f.nameId),parent:parent?parent.name:null,
      changes:Lg.changes.filter(c=>c.yr>=a&&c.yr<=b).map(c=>({yr:c.yr,d:c.d,ex:c.ex})),scriptHist:Lg.scriptHist.filter(h=>h.yr>=a&&h.yr<=b).map(h=>({yr:h.yr,like:SCRIPT_INFO[h.script].like,label:SCRIPT_INFO[h.script].label,why:h.why}))}});
  // wars from events
  const wars=[];for(const e of evs.filter(e=>e.type==='war'||e.type==='betrayal')){const A=e.facs[0],B=e.facs[1];const end=S.events.find(x=>x.yr>=e.yr&&x.id>e.id&&((x.type==='peace'&&x.facs.includes(A)&&x.facs.includes(B))||(x.type==='extinct'&&(x.facs[0]===A||x.facs[0]===B))||(x.type==='union'&&x.facs.includes(A)&&x.facs.includes(B))));
    const dead0=end&&end.type==='peace'?end.data.dead||0:0;const dead1=S.events.filter(x=>x.type==='battle'&&x.yr>=e.yr&&(!end||x.yr<=end.yr)&&x.facs.includes(A)&&x.facs.includes(B)).reduce((t,x)=>t+(x.data.total||0),0);const dead=Math.max(dead0,dead1);
    const towns=S.events.filter(x=>(x.type==='conquest'||x.type==='razed')&&x.yr>=e.yr&&(!end||x.yr<=end.yr)&&x.facs.includes(A)&&x.facs.includes(B)).map(x=>x.title);
    wars.push({title:e.title,from:e.yr,to:end?end.yr:null,a:S.facs[A].name,b:S.facs[B].name,ha:Math.round(S.facs[A].hue),hb:Math.round(S.facs[B].hue),why:(e.data.why||[]).filter(Boolean)[0]||'',goal:e.data.goal,betrayal:e.type==='betrayal',dead,towns,end:end?(end.type==='peace'?`Peace${end.data.terms==='tribute'?', with tribute':''}`:end.type==='extinct'?`The ${S.facs[end.facs[0]].name} were destroyed`:'Union'):'Still being fought'})}
  const pacts=evs.filter(e=>['alliance','marriage','oath','abandon','tribute','trade','union','letgo','refusal','divorce'].includes(e.type)&&e.facs.length>=2).map(e=>({yr:e.yr,type:e.type,title:e.title,why:(e.data.why||[]).filter(Boolean)[0]||''}));
  const M=S.maker||{deeds:[]};const st=S.makerStanding?S.makerStanding():{label:'Unknown'};
  const maker={standing:st.label,deeds:M.deeds.filter(d=>d.yr>=a&&d.yr<=b),known:S.alive().filter(f=>(f.knows||0)>0.12).map(f=>({name:f.name,word:S.makerWord(f),k:Math.round(f.knows*100)}))};
  return{peoples,faiths,langs,wars,pacts,moves,maker};
}

// ---------- the historian's brief ----------
function charLinePlain(c){const f=S.facs[c.fac];return`${S.cname(c)} (${c.role==='ruler'?S.rulerTitle(f):c.role} of the ${f.name}; ${S.traitWords(c).join(', ')||'hard to read'}): ${c.deeds.slice(-6).map(d=>d.yr+' '+d.txt).join('; ')}${c.alive?'':`; died ${c.died} (${c.cause})`}`}
function keyChars(evs){const sc=new Map();for(const e of evs){const w=divWeight(e)+e.imp;for(const k of ['char','char2','decider'])if(e.data[k]!=null){const c=S.chars[e.data[k]];if(c)sc.set(c,(sc.get(c)||0)+w)}}return[...sc.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7).map(x=>x[0])}
function nameFixer(){const map=[];for(const n of S.names){const cur=cap(n.form);const forms=new Set(n.hist.map(h=>cap(h.form)));for(const fm of forms)if(fm!==cur&&fm.length>=4)map.push([fm,cur])}
  for(const c of S.chars){const L=S.langs[S.names[c.nameId].lang];if(L.stage>0){const g=S.glossOf(c.nameId);if(g.length>=4)map.push([g,S.spokenName(c)])}}
  for(const f of S.facs){const L=S.langs[f.lang];if(L.stage>0&&f.gloss.length>=4)map.push([f.gloss,f.name])}
  map.sort((a,b)=>b[0].length-a[0].length);const esc2=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return t=>{for(const [a,b] of map)t=t.replace(new RegExp('\\b'+esc2(a)+'\\b','g'),b);return t}}
function chapterBrief(ch){
  const ever=(S.maker&&S.maker.ever)||{};const evs=S.events.filter(e=>e.yr>=ch.a&&e.yr<=ch.b&&(e.data.maker||e.type==='rivalgod'||e.type==='godfalls'||e.facs.some(id=>ever[id])));
  const key=evs.filter(e=>e.imp>=2||divWeight(e)>=4).map(e=>[e,divWeight(e)*2+e.imp+(e.type==='mission'?-2:0)]).sort((a,b)=>b[1]-a[1]).slice(0,34).map(x=>x[0]).sort((a,b)=>a.yr-b.yr);
  return{evs:key,chars:keyChars(evs),prev:saga.ch.filter(c=>c.n<ch.n),closing:ch.closing!=null?S.events.find(e=>e.id===ch.closing):null};
}
const PG=g=>String(g).replace(/-/g,'\u2060-');
function chapterPrompt(ch,B){const fix=nameFixer();return fix(chapterPrompt0(ch,B)).replace(/\u2060/g,'')}
function chapterPrompt0(ch,B){
  const T=ch.tab,fin=ch.final,F=S.finale,prev=B.prev;
  return`You are the great historian of an invented world called ${worldTitle}, where non-human creatures rose from a single campfire into many peoples, faiths and tongues. A simulation produced the facts below. You are writing the volume that covers ONE AGE of this world's history, in the voice of a historian looking back (think Gibbon or a Dune epigraph), broken by short close-up scenes.

This is AGE ${ROMAN[ch.n]}${saga.target?` of ${saga.target}`:' (this history has no planned end: it runs until every people is gone)'}: years ${ch.a}-${ch.b}.${fin?' It is the LAST age: this world ends here.':''} Historians divide the ages at events that split history in two; this age ends with the dividing event given below.

THIS IS THE HISTORY OF THE MAKER'S OWN PEOPLE: ${(ch.score&&ch.score.peoples.length?ch.score.peoples:S.reach().map(f=>f.name)).map(n=>'the '+n).join(', ')||'a people who have forgotten their maker'}. Tell the age from their side, as the chronicle of a chosen people. Other peoples, and the rival immortals who made them, appear only as they touch the Maker's people: as enemies, temptations, converts or threats.

HOW TO WRITE IT
- Grip from the first line, for a reader who has read nothing before.
- HISTORY: the wide view, 3 short paragraphs, at most 170 words. What defined this age, who rose and who fell, what they believed, how it felt to live in it. Name at most 4 peoples.
- SCENES: 2 or 3 close-ups at the age's decisive moments, each headed "Place · year · who", each 2-3 short paragraphs in present tense, at most 110 words: one moment, sensory detail, a line of dialogue. Choose different peoples or sides for different scenes when you can.
- TURNING: 1-2 sentences naming the event that ends this age and why later historians draw the line here.
- Use the names given, exactly and consistently. No more than 6 named characters in total.
- No numbers in prose except the years in scene headers. Never list temperament words; show them. No simulation words ("settlement", "values", "population", "unrest").
- The facts are true; the feelings are yours. Do not inflate small wars.
- Their bodies are not human; use the body descriptions.
- Cults, prophets and peoples who arrive from the sea, the earth or the sky are the stuff of legend: if the facts hold one, it deserves a scene or a line.
- ${prev.length?'Continue the history: refer back to earlier ages, show consequences, keep threads alive.':'This is the first age: from the first fire to the first great division.'}
- ${fin?'This is the end of the world. Show it fully, then close the whole history with a last image that echoes the first fire.':'End the TURNING on a hook into the next age.'}

THE MAKER (the reader): the reader of this history is the immortal who made these creatures and now watches over them. Speak to the reader as "you" only when describing their own choices ("you sent rain"; "you let them burn"). The creatures experienced those choices as they understood them: a people that knows the Maker names them and fears or loves them; a people that does not sees only luck, omen, storm or dream. Give each of the reader's choices this age its consequence in the history, briefly; do not flatter the reader.

THE EPIGRAPH: a 1-3 sentence quote, Dune-style, from something made in this age by one of these peoples: a scripture verse, a law, a letter, a chronicle, a song, an inscription, a pamphlet. It must fit what they could make (a people that cannot yet write only carves or remembers). It should quietly foreshadow or ironically comment on this age. The SOURCE names the work, its maker or people, and the year.

THE TABS: the reader can open tabs on religions, languages, peoples and wars, which already show the data. For each, write a 1-2 sentence historian's note on what mattered in this age. Also write SCRIPTURE: 2-4 short lines from the holy text of the most important faith of this age, in that faith's voice, consistent with its gods and commandments.

REPLY IN EXACTLY THIS FORMAT
TITLE: <the name later historians give this age, 3-6 words, e.g. "The Age of Salt and Schism">
EPIGRAPH: <quote>
SOURCE: <attribution>
DEK: <one sentence: what this age was>
HISTORY:
<paragraphs>
SCENE: <Place> · <year> · <who>
<paragraphs>
SCENE: <Place> · <year> · <who>
<paragraphs>
TURNING: <1-2 sentences>
SCRIPTURE: <2-4 lines separated by " / ">
SCRIPTURE_SOURCE: <book and verse>
RELIGIONS: <1-2 sentences>
LANGUAGES: <1-2 sentences>
PEOPLES: <1-2 sentences>
WARS: <1-2 sentences>
RECAP: <one plain sentence for continuity>

====== THE FACTS ======
EARLIER AGES:
${prev.map(c=>`Age ${ROMAN[c.n]} "${(c.parsed||{}).title||''}" (${c.a}-${c.b}): ${(c.parsed||{}).recap||''}`).join('\n')||'None. This is the dawn.'}

PEOPLES OF THIS AGE (living at its end unless marked):
${T.peoples.map(p=>`- the ${p.name}${p.gloss&&p.gloss!==p.name?` (picture-name "${PG(p.gloss)}")`:''}: ${p.body}; ${p.died!=null?`GONE in ${p.died}`:`${p.pop} souls (was ${p.pop0}), ${p.towns} towns, ${p.gov}, ${p.era}`}; faith: ${p.faith||'none'}; ${p.parent?`broke away from the ${p.parent} in ${p.born}`:p.born>ch.a?`arrived in ${p.born}`:'an old people'}; rulers this age: ${p.rulers.map(r=>`${r.name} (${r.from}-${r.to||'now'}${r.cause?', '+r.cause:''})`).join(', ')||'none'}`).join('\n')}

FAITHS:
${T.faiths.map(f=>`- ${f.title}${f.cult?' [A CULT around a living leader]':''}${f.maker?' [WORSHIPS THE MAKER, the reader]':''}${f.fate?` [became: ${f.fate}]`:''}${f.parent?` (${f.cult?'grew out of':'a sect of'} ${f.parent})`:''}: founded ${f.born} by ${f.founder||'unknown'} of the ${f.origin}; gods: ${f.gods.map(g=>g.name+', '+g.gloss).join('; ')}; commandments: ${f.tenets.join(' ')}; scripture: ${f.scripture}${f.oral?' (still oral)':''}; state faith of: ${f.holders.join(', ')||'no one'}; followers about ${f.followers}${f.prophecy?`; prophecy: "${f.prophecy.text}"${f.prophecy.done?' (FULFILLED)':' (unfulfilled)'}`:''}`).join('\n')||'none yet'}
${(T.moves||[]).length?`\nCULTS AND PROPHETS OF THIS AGE:\n${T.moves.map(m=>`- ${m.who}, ${m.kind==='cult'?'cult leader':'self-proclaimed prophet'} of ${m.faith} among the ${m.people}, from ${m.born}: ${m.outcome}`).join('\n')}`:''}

TONGUES AND SCRIPTS:
${T.langs.map(l=>`- the ${l.fac}: ${l.label.toLowerCase()} like ${l.like}${l.parent?`, a daughter of the ${l.parent} tongue`:''}; words: ${l.words.slice(0,5).map(w=>`${w.g.toLowerCase()}=${w.w}`).join(', ')}${l.scriptHist.length?`; script changes this age: ${l.scriptHist.map(h=>`${h.yr} ${h.like} (${h.why})`).join('; ')}`:''}${l.changes.length?`; ${l.changes.length} sound shifts this age`:''}`).join('\n')}

WARS:
${T.wars.map(w=>`- ${w.title} (${w.from}-${w.to||'ongoing'}): ${w.a} vs ${w.b}; cause: ${w.why}; ${w.dead} died in battle; ${w.towns.length?'towns lost: '+w.towns.join(', ')+'; ':''}outcome: ${w.end}`).join('\n')||'none'}

KEY FIGURES:
${B.chars.map(charLine).join('\n')||'none recorded'}
${fin&&F?`\nTHE END OF THE WORLD: ${({lastwar:'the Last War, fought with weapons that end cities',unification:'one people tried to conquer every other',devourer:'a world-eating monster rose',longnight:'the sun went dim and the harvests failed'})[F.kind]}. It ended ${({nothing:'with no thinking creature left alive',lastwar:'when one of the two powers was destroyed',one:'with only one people left',slain:'when the monsters were finally killed',night:'with a small cold remnant',time:'in exhaustion, without a victor'})[F.end]||'in silence'}.`:''}
THE MAKER'S CHOICES THIS AGE: ${(T.maker&&T.maker.deeds.length)?T.maker.deeds.map(d=>`${d.yr}: ${d.title}. You chose: ${d.choice}. What happened: ${d.out}`).join(' | '):'none; you only watched'}
HOW THEY SEE YOU: ${T.maker?T.maker.standing:'Unknown'}${T.maker&&T.maker.known.length?'; '+T.maker.known.map(k=>`the ${k.name} call you ${k.word}`).join('; '):'; no people knows you exist'}
THE DIVIDING EVENT THAT ENDS THIS AGE: ${B.closing?`${B.closing.yr}: ${B.closing.title}. ${B.closing.text}`:'a slow change rather than one event'}

CHRONICLE (year: event. WHY: reasons the creatures had):
${B.evs.map(e=>`${e.yr}: ${e.title}. ${e.text}${(e.data.why||[]).filter(Boolean).length?' WHY: '+e.data.why.filter(Boolean).join(' '):''}${e.data.prompt?` (A voice from the sky had said: "${e.data.prompt}")`:''}`).join('\n')}`;
}
function parseChapter(t){
  const KEYS=['TITLE','EPIGRAPH','SOURCE','DEK','HISTORY','SCENE','TURNING','SCRIPTURE','SCRIPTURE_SOURCE','RELIGIONS','LANGUAGES','PEOPLES','WARS','RECAP'];
  const re=new RegExp('^('+KEYS.join('|')+'):[ \\t]*','gm');const parts=[];let m;const idx=[];while((m=re.exec(t)))idx.push([m.index,m[1],m.index+m[0].length]);
  for(let i=0;i<idx.length;i++){parts.push([idx[i][1],t.slice(idx[i][2],i+1<idx.length?idx[i+1][0]:t.length).trim()])}
  const o={scenes:[],notes:{}};for(const [k,v] of parts){if(k==='SCENE'){const nl=v.indexOf('\n');o.scenes.push(nl<0?{head:v,text:''}:{head:v.slice(0,nl).trim(),text:v.slice(nl+1).trim()})}
    else if(['RELIGIONS','LANGUAGES','PEOPLES','WARS'].includes(k))o.notes[k.toLowerCase()]=v;else o[k.toLowerCase()]=v}
  if(o.epigraph)o.epigraph=o.epigraph.replace(/^["“]|["”]$/g,'');if(o.source)o.source=o.source.replace(/^[—–-]\s*/,'');return o}

// ---------- the plain writer, used when Claude is unavailable ----------
function localChapter(ch,B){
  const T=ch.tab;const rr=mulberry32(S.seed+ch.n*97);const pk=a=>a[Math.floor(rr()*a.length)];
  const alive=T.peoples.filter(p=>p.died==null);const top=alive[0];const gone=T.peoples.filter(p=>p.died!=null);const rising=alive.filter(p=>p.pop>p.pop0*1.5&&p.pop>30);const F=T.faiths[0];
  const used=saga.ch.filter(x=>x!==ch).map(x=>(x.parsed||{}).title);const ct=B.closing?B.closing.type:'';
  const title=[ch.final?'The End of All Ages':null,ch.n===1?'The Age of the First Fire':null,ct==='schism'||ct==='sect'?'The Age of Sundering':null,ct==='peace'?'The Long War':null,ct==='convert'||ct==='faith'?'The Age of Prophets':null,ct==='arrival'?'The Age of Strangers':null,ct==='extinct'?'The Age of Endings':null,ct==='revolution'?'The Age of Crowns Falling':null,top?`The Age of the ${top.name}`:null,'The Age of Many Crowns','The Middle Kingdoms','The Age of Iron and Ash','The Quiet Centuries','The Age of Long Roads'].filter(Boolean).find(t=>!used.includes(t))||`Age ${ROMAN[ch.n]}`;
  const hist=[`In these years the world belonged to ${top?`the **${top.name}**, ${top.body}, who grew to ${top.towns} towns`:'no one'}.${rising.length>1?` The ${rising.slice(1,3).map(p=>p.name).join(' and the ')} rose beside them.`:''}`,
    F?`Most prayed to ${F.gods[0].name}, ${F.gods[0].gloss}, under ${F.title}. Its first law was simple: "${F.tenets[0]}"`:`They had no gods yet, only fear of the dark.`,
    gone.length?`By the age's end the ${gone.map(p=>p.name).join(' and the ')} were gone.`:T.wars.length?`${T.wars.length===1?'One war was':T.wars.length+' wars were'} fought.`:'It was, by the standards of what came after, a quiet age.'];
  const scenes=B.evs.filter(e=>divWeight(e)>=5&&!['tech','script'].includes(e.type)).slice(-2).map(e=>({head:`${S.capitalOf(S.facs[e.facs[0]])?S.capitalOf(S.facs[e.facs[0]]).name:'Somewhere'} · ${e.yr} · ${S.facs[e.facs[0]].name}`,text:e.text+((e.data.why||[]).filter(Boolean)[0]?' '+e.data.why.filter(Boolean)[0]:'')}));
  const lines={faith:'We are not the first. We will not be the last. We are the ones who remember.',martial:'A town is a promise. A spear is how you keep it.',art:'We made it beautiful because we knew it would not last.',trade:'Nothing is given. Everything is lent.',knowledge:'A people that writes nothing down will be written about by others.',order:'The law is a wall. Inside it, children sleep.',harmony:'Feed the stranger. Tomorrow you are the stranger.'};
  const tf=top?S.facs[top.id]:S.facs[0];const tv=VALUES.slice().sort((a,b)=>tf.values[b]-tf.values[a])[0];
  return{title,epigraph:lines[tv],source:`a saying of the ${tf.name}, year ${ch.a+Math.floor(rr()*(ch.b-ch.a))}`,dek:`Years ${ch.a} to ${ch.b}.`,history:hist.join('\n\n'),scenes,turning:B.closing?`The age ended with ${lowerFirst(B.closing.title)}.`:'The age ended slowly.',scripture:F?F.tenets.join(' / '):'',scripture_source:F?F.scripture:'',notes:{},recap:`${title}: ${B.evs.filter(e=>divWeight(e)>=6).slice(0,2).map(e=>e.title).join('; ')}.`};
}

// ---------- the chapter page with tabs ----------
function mdLite(s){return esc(s||'').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*(.+?)\*/g,'<i>$1</i>')}
const paras=t=>(t||'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean).map(x=>`<p>${tagNames(mdLite(x),true)}</p>`).join('');
function findChar(name){if(!name)return null;const n=name.toLowerCase();for(const c of S.chars){const a=S.cname(c).toLowerCase(),s=S.spokenName(c).toLowerCase();if(n.includes(a)||(s.length>2&&new RegExp('\\b'+s+'\\b').test(n)))return c}return null}
function tnoteH(ch,k){const t=ch.parsed&&ch.parsed.notes&&ch.parsed.notes[k];return t?`<p class="tnote">${mdLite(t)}</p>`:''}
function tabHistory(ch,mode){const P=ch.parsed||{};
  return`${P.epigraph?`<blockquote class="epi"><p>${mdLite(P.epigraph)}</p>${P.source?`<cite>— ${esc(P.source)}</cite>`:''}</blockquote>`:''}
  ${P.dek?`<p class="dek">${mdLite(P.dek)}</p>`:''}
  ${ch.score&&mode!=='export'?`<div class="ascore"><span>✦ ${ch.score.bel} believers</span><span>${ch.score.faith}% faithful</span><span>☀ Greatness ${ch.score.g}</span><span>❦ Mercy ${ch.score.m}</span><span>${ch.score.all.toLocaleString()} all time</span></div>`:''}
  ${P.history?`<div class="open">${paras(P.history)}</div>`:''}
  ${(P.scenes||[]).map((s,i)=>{const c=findChar(s.head);const pic=c?(mode==='export'?`<img src="${portraitURL(c.g,96,64)}" alt="">`:`<canvas data-scg="${c.id}"></canvas>`):'';return`<div class="scene"><div class="shead">${pic}<span>${esc(s.head)}</span></div>${paras(s.text)}</div>`}).join('')}
  ${P.turning?`<p class="close">${mdLite(P.turning)}</p>`:''}
  ${ch.tab.maker&&ch.tab.maker.deeds.length?`<div class="yourhand"><div class="lbl">Your hand in this age</div>${ch.tab.maker.deeds.map(d=>`<div><span class="ty">${d.yr}</span> <b>${esc(d.title)}</b>: you chose to ${esc(lowerFirst(d.choice))}. <span class="d">${esc(d.out)}</span></div>`).join('')}</div>`:''}
  ${ch.map?`<div class="realm"><img src="${ch.map}" alt="The world at the end of the age"><div class="rtiles">${ch.tab.peoples.filter(p=>p.died==null).slice(0,4).map(p=>`<div><b style="color:hsl(${p.hue},45%,32%)">${esc(p.name)}</b>${p.pop} living · ${p.towns} towns</div>`).join('')}</div></div>`:''}`}
function tabReligions(ch){const P=ch.parsed||{};const T=ch.tab;
  return`${tnoteH(ch,'religions')}${P.scripture?`<blockquote class="scrip"><p>${mdLite(P.scripture).split(' / ').join('<br>')}</p>${P.scripture_source?`<cite>— ${esc(P.scripture_source)}</cite>`:''}</blockquote>`:''}
  ${T.faiths.length?T.faiths.map(f=>`<div class="fcard"><div class="fhd"><span class="fsym" style="background:hsl(${f.hue},45%,40%)">${esc(f.symbol)}</span><div><b>${esc(cap(f.title))}</b>${f.nat?` <span class="natsm">${natH(f.nat)}</span>`:''}${f.cult?' <b class="newb">cult</b>':''}${f.maker?' <b class="newb">worships you</b>':''}<div class="d">${f.parent?`${f.cult?'Grew out of':'A sect of'} ${esc(f.parent)}, `:''}founded ${f.born}${f.founder?` by ${esc(f.founder)}`:''} among the ${esc(f.origin)}${f.newHere?' · <b class="newb">new this age</b>':''}</div></div></div>
    <div class="fgrid"><div><div class="lbl">${f.gods.length>1?'Gods':'God'}</div>${f.gods.map(g=>`<div>${esc(g.name)} <span class="d">${esc(g.gloss)}</span></div>`).join('')}</div><div><div class="lbl">Commandments</div>${f.tenets.map(t=>`<div>“${esc(t)}”</div>`).join('')}</div></div>
    <div class="lbl">Scripture</div><div>${esc(cap(f.scripture))}${f.oral?' <span class="d">(not yet written)</span>':''}</div>${f.writings&&f.writings.length?`<div class="lbl">Holy writings</div>${f.writings.map(w=>`<div>“${esc(w)}”</div>`).join('')}`:''}${f.prophecy&&!f.cult?`<div class="lbl">Prophecy</div><div>“${esc(f.prophecy.text)}” <span class="d">${f.prophecy.done?'· fulfilled':'· still awaited'}</span></div>`:''}${f.fate&&f.fate!=='state faith'?`<div class="lbl">Fate</div><div>${esc(cap(f.fate))}</div>`:''}
    ${f.fol.length?`<div class="lbl">Followers by people</div><div class="fbars">${f.fol.map(x=>`<div><span>${esc(x.name)}</span><i><em style="width:${x.share}%;background:hsl(${x.hue},45%,45%)"></em></i><b>${x.share}%</b></div>`).join('')}</div>`:''}</div>`).join(''):'<p class="d">No faiths yet. The creatures fear the dark but have not yet named it.</p>'}
  ${(T.moves||[]).length?`<div class="lbl" style="margin-top:14px">Cults and prophets</div><ul class="pacts">${T.moves.map(m=>`<li><span class="ty">${m.born}</span> <b>${esc(m.who)}</b>, ${m.kind==='cult'?'cult leader':'claimed the prophecy'} of ${esc(m.faith)} among the ${esc(m.people)} <span class="d">· ${esc(m.outcome)}${m.end?` (${m.end})`:''}</span></li>`).join('')}</ul>`:''}`}
function tabLanguages(ch){const T=ch.tab;
  return`${tnoteH(ch,'languages')}${T.langs.map(l=>`<div class="lcard"><div class="fhd"><div><b style="color:hsl(${l.hue},45%,32%)">The tongue of the ${esc(l.fac)}</b> <span class="natlg">${natH(l.nameNat)}</span><div class="d">${esc(l.label)}, like ${esc(l.like)}${l.parent?` · a daughter of the ${esc(l.parent)} tongue`:''}</div></div></div>
    <div class="wgrid">${l.words.map(w=>`<div><span class="wn">${natH(w.n)}</span><span class="wr">${esc(l.stage===0?w.g.toLowerCase():w.w)}</span><span class="wg">${esc(w.g)}</span></div>`).join('')}</div>
    ${l.scriptHist.length?l.scriptHist.map(h=>`<div class="lchg"><span class="ty">${h.yr}</span> New script: ${esc(h.label.toLowerCase())} like ${esc(h.like)}. <span class="d">${esc(cap(h.why))}.</span></div>`).join(''):''}
    ${l.changes.slice(-3).map(c=>`<div class="lchg"><span class="ty">${c.yr}</span> ${esc(cap(c.d))}: “${esc(c.ex[1])}” became “${esc(c.ex[2])}” <span class="d">(${esc(GLOSS[c.ex[0]].toLowerCase())})</span></div>`).join('')}</div>`).join('')}`}
function tabPeoples(ch){const T=ch.tab;
  return`${tnoteH(ch,'peoples')}${ch.map?`<img class="tmap" src="${ch.map}" alt="Map of the world at the end of the age">`:''}
  <div class="ptable">${T.peoples.map(p=>{const d=p.died!=null?'gone':p.pop0===0?'new':p.pop>p.pop0*1.15?'up':p.pop<p.pop0*0.85?'down':'flat';return`<div class="prow"><span class="sw" style="background:hsl(${p.hue},50%,48%)"></span><div class="pn"><b>${esc(p.name)}</b> <span class="natsm">${natH(p.nat)}</span><div class="d">${p.died!=null?`Gone in ${p.died}`:`${esc(p.gov)} · ${esc(p.era)} · ${p.faith?esc(cap(p.faith)):'no faith'}`}</div></div><div class="pp"><b>${p.died!=null?'—':p.pop}</b><span class="trend ${d}">${d==='up'?'▲ rising':d==='down'?'▼ falling':d==='new'?'✦ new':d==='gone'?'✝ gone':'steady'}</span></div></div>
    ${p.rulers.length?`<div class="rlist">${p.rulers.map(r=>`<span><b>${esc(r.name)}</b> ${r.from}–${r.to||'…'}${r.cause&&r.cause!=='age'?` <i>(${esc(r.cause)})</i>`:''}</span>`).join('')}</div>`:''}`}).join('')}</div>`}
function tabWars(ch){const T=ch.tab;
  return`${tnoteH(ch,'wars')}${T.wars.length?T.wars.map(w=>`<div class="wcard"><div class="whd"><b>${esc(w.title)}</b><span class="ty">${w.from}–${w.to||'…'}</span></div><div class="wside"><span style="color:hsl(${w.ha},50%,35%)">${esc(w.a)}</span> against <span style="color:hsl(${w.hb},50%,35%)">${esc(w.b)}</span>${w.betrayal?' · <b class="newb">betrayal</b>':''}${w.goal==='holy'?' · <b class="newb">holy war</b>':''}</div>${w.why?`<div><span class="lbl">Cause</span> ${esc(w.why)}</div>`:''}<div><span class="lbl">Cost</span> ${w.dead?w.dead+' fell in battle':'skirmishes, no great battles'}${w.towns.length?`; ${esc(w.towns.join(', '))}`:''}</div><div><span class="lbl">Outcome</span> ${esc(w.end)}</div></div>`).join(''):'<p class="d">No wars were declared in this age.</p>'}
  ${T.pacts.length?`<div class="lbl" style="margin-top:14px">Treaties, marriages and broken oaths</div><ul class="pacts">${T.pacts.slice(0,14).map(p=>`<li><span class="ty">${p.yr}</span> ${esc(p.title)}${p.why?` <span class="d">· ${esc(p.why)}</span>`:''}</li>`).join('')}</ul>`:''}`}
const TABS=[['history','History'],['religions','Religions'],['languages','Languages'],['peoples','Peoples & rulers'],['wars','Wars & treaties']];
function chapterHTML(ch,mode){mode=mode||'live';const P=ch.parsed||{};const id='c'+ch.n+'_'+mode;
  const bodies={history:tabHistory(ch,mode),religions:tabReligions(ch),languages:tabLanguages(ch),peoples:tabPeoples(ch),wars:tabWars(ch)};
  return`<div class="kchap">Age ${ROMAN[ch.n]}${ch.final?' · The End':''}</div><h2 class="ctitle">${esc(P.title||'…')}</h2><div class="cyrs">Years ${ch.a}–${ch.b}</div>
  <div class="ctabs" role="tablist">${TABS.map(([k,l],i)=>`<button type="button" role="tab" data-ctab="${k}" aria-selected="${i===0}">${l}</button>`).join('')}</div>
  ${TABS.map(([k],i)=>`<div class="cpane" data-cpane="${k}"${i?' hidden':''}>${bodies[k]}</div>`).join('')}`}
function wireTabs(root){root.querySelectorAll('.ctabs').forEach(bar=>{if(bar._w)return;bar._w=1;bar.addEventListener('click',e=>{const b=e.target.closest('[data-ctab]');if(!b)return;const sec=bar.parentElement;bar.querySelectorAll('[data-ctab]').forEach(x=>x.setAttribute('aria-selected',x===b));sec.querySelectorAll(':scope > [data-cpane]').forEach(p=>p.hidden=p.dataset.cpane!==b.dataset.ctab)})})}
function paintCast(root){root.querySelectorAll('canvas[data-scg]').forEach(cv=>{const c=S.chars[+cv.dataset.scg];if(c)portrait(cv,c.g,1.2,{noShadow:true,bg:'#1b2130'})})}
function realmMap(){const W2=520,H2=Math.round(520*S.H/S.W);const c=document.createElement('canvas');c.width=W2;c.height=H2;const x=c.getContext('2d');x.drawImage(terrainC,0,0,W2,H2);x.drawImage(radC,0,0,W2,H2);x.fillStyle='rgba(10,12,16,.3)';x.fillRect(0,0,W2,H2);const s=W2/S.W;
  for(const st of S.setts){const f=S.facs[st.fac];const r=(S.townRadius(st)+60)*s;const g=x.createRadialGradient(st.x*s,st.y*s,0,st.x*s,st.y*s,r);g.addColorStop(0,`hsla(${f.hue},70%,58%,.75)`);g.addColorStop(1,`hsla(${f.hue},70%,58%,0)`);x.fillStyle=g;x.beginPath();x.arc(st.x*s,st.y*s,r,0,6.28);x.fill()}
  for(const st of S.setts){const f=S.facs[st.fac];x.fillStyle=`hsl(${f.hue},60%,80%)`;x.beginPath();x.arc(st.x*s,st.y*s,1.6+st.level*0.5,0,6.28);x.fill()}
  x.font='600 11px Georgia,serif';x.textAlign='center';for(const f of S.alive()){const cs=S.capitalOf(f);if(!cs)continue;x.strokeStyle='rgba(8,10,14,.9)';x.lineWidth=3;x.strokeText(f.name,cs.x*s,cs.y*s-6);x.fillStyle=`hsl(${f.hue},70%,82%)`;x.fillText(f.name,cs.x*s,cs.y*s-6)}
  return c.toDataURL('image/jpeg',0.82)}
let chCtl=null;
function openChapter(){
  const Y=Math.floor(S.year);
  const ch={n:saga.ch.length+1,a:saga.ageStart,b:Y,closing:saga.closing,final:!!saga.final,status:'writing',raw:'',parsed:{}};
  ch.tab=snapshotAge(ch.a,ch.b);ch.map=realmMap();
  saga.ch.push(ch);saga.ageStart=Y;saga.crisisDone=false;saga.pending=false;saga.closing=null;saga.closingAt=null;saga.nextCard=null;saga.convoAt=null;saga.convoDone=false;saga.cardsThisAge=0;saga.emergThisAge=0;if(!ch.final){S.setMakerAge(saga.ch.length+1);saga.ageMin=60+Math.floor(Math.random()*200);saga.ageAcc=22+Math.floor(Math.random()*36);beginAge()}ch.score={g:Math.round(S.maker.greatness),m:Math.round(S.maker.mercy),faith:S.faithPct(),bel:S.believers(),all:Math.round(S.maker.allTime),peoples:S.reach().map(f=>f.name)};endSkip();
  if(ch.final){saga.ended=true;running=false;$('#play').textContent='Resume'}
  sagaUI();chapterOpen=true;$('#chapter').hidden=false;document.body.style.overflow='hidden';$('#chapter').scrollTop=0;
  const B=chapterBrief(ch);renderChapter(ch);writeChapter(ch,B);
}
function renderChapter(ch){if($('#chapter').hidden)return;const cur=saga.ch[saga.ch.length-1];if(ch!==cur)return;
  const pg=$('#cpage');const open=pg.querySelector('.ctabs [aria-selected="true"]');const tab=open?open.dataset.ctab:'history';
  pg.innerHTML=chapterHTML(ch)+`<div class="cstat">${ch.status==='writing'?'<span class="pulse"></span> Claude is writing this age…':ch.status==='local'?'Written plainly from the record (Claude was not available for this age).':''}</div>`;
  wireTabs(pg);if(tab!=='history'){const b=pg.querySelector(`[data-ctab="${tab}"]`);if(b)b.click()}paintCast(pg);
  $('#cNext').textContent=ch.final?'Read the book':'Continue';$('#cWait').hidden=ch.status!=='writing';$('#cExport').hidden=!ch.final;$('#cReplay').hidden=!ch.final}
async function writeChapter(ch,B){
  if(sampleFn){chCtl=new AbortController();let lastR=0;try{
      const r=await sampleFn(chapterPrompt(ch,B),{cache:false,signal:chCtl.signal,onText:({text})=>{ch.raw=text;ch.parsed=parseChapter(text);const now=performance.now();if(now-lastR>300){lastR=now;renderChapter(ch)}}});
      ch.raw=r.text;ch.parsed=parseChapter(r.text);if(!ch.parsed.history&&!ch.parsed.scenes.length)throw{code:'empty_completion'};ch.status='done';renderChapter(ch);markDirty();saveNow(true);return}
    catch(err){if(err&&['not_granted','sampling_disabled','not_declared','capability_disabled','capability_removed'].includes(err.code)){sampleFn=null;$('#oracleMode').textContent='interpreted by keyword'}}}
  ch.parsed=localChapter(ch,B);ch.status='local';renderChapter(ch);markDirty();saveNow(true);
}
$('#cNext').onclick=()=>{const ch=saga.ch[saga.ch.length-1];$('#chapter').hidden=true;chapterOpen=false;document.body.style.overflow='';if(ch&&ch.final)openBook()};
$('#cExport').onclick=()=>exportBook();
$('#cReplay').onclick=()=>{$('#chapter').hidden=true;chapterOpen=false;document.body.style.overflow='';openBook();setTimeout(()=>{const r=$('#replayBox');if(r)r.scrollIntoView({block:'start'})},50)};
$('#ages').onchange=e=>{saga.target=+e.target.value;if(saga.target&&saga.ch.length>=saga.target-1)saga.target=0,e.target.value='0';sagaUI();markDirty()};
if($('#endBtn'))$('#endBtn').onclick=()=>{if(saga.ended||!saga.on)return;saga.endRequested=true;sagaUI();markDirty()};
$('#sagaOn').onchange=e=>{saga.on=e.target.checked;S.noRespawn=saga.on;sagaUI()};
function sagaRestore(P){
  saga=P.saga;saga.target=0;saga.cardBusy=false;setListening(false);if(S.migrateGame)S.migrateGame();rec=P.rec||{frames:[],ruins:[]};S.onYear=onYear;S.noRespawn=saga.on;
  SAVE.id=P.meta.id;SAVE.at=P.meta.savedAt;SAVE.where='';
  if(P.cam){cam.x=P.cam.x;cam.y=P.cam.y;cam.z=P.cam.z;clampCam()}
  speed=P.speed||1;document.querySelectorAll('#speed button').forEach(x=>x.setAttribute('aria-pressed',+x.dataset.s===speed));
  if($('#ages'))$('#ages').value=String(saga.target);if($('#sagaOn'))$('#sagaOn').checked=saga.on;sagaUI();
  const last=saga.ch[saga.ch.length-1];
  for(const c of saga.ch)if(c.status==='writing'&&c!==last){c.status='local';if(!c.parsed||!c.parsed.history)c.parsed=localChapter(c,chapterBrief(c))}
  if(last&&(P.chapterOpen||last.status==='writing')){chapterOpen=true;$('#chapter').hidden=false;document.body.style.overflow='hidden';
    if(last.status==='writing'){renderChapter(last);writeChapter(last,chapterBrief(last))}else renderChapter(last)}
}

// ---------- replay ----------
function replayData(forExport){
  const img=document.createElement('canvas');const sc=Math.min(0.5,1200/S.W);img.width=S.W*sc;img.height=S.H*sc;const x=img.getContext('2d');x.drawImage(terrainC,0,0,img.width,img.height);
  if(forExport)x.drawImage(radC,0,0,img.width,img.height);
  return{W:S.W,H:S.H,img:forExport?img.toDataURL('image/jpeg',0.82):img,end:Math.floor(S.year),
    facs:S.facs.map(f=>({n:f.name,h:Math.round(f.hue),b:f.born,d:f.died})),frames:rec.frames,
    ruins:S.ruins.map(r=>[Math.round(r.x),Math.round(r.y),r.yr||0,r.nuked?1:0]),
    events:S.events.filter(e=>e.imp>=3&&!['rulerdeath','city'].includes(e.type)).map(e=>[e.yr,e.title,Math.round(e.x),Math.round(e.y)]),
    chapters:saga.ch.map(c=>[c.a,c.b,(c.parsed&&c.parsed.title)||('Chapter '+c.n)])};
}
function ReplayPlayer(root,D){
  const KW=Math.max(1,D.W/2400);// world-unit marker sizes grow with the map so they stay readable
  root.innerHTML='';const wrap=document.createElement('div');wrap.style.cssText='position:relative;border-radius:8px;overflow:hidden;background:#0b0e14';root.appendChild(wrap);
  const cv=document.createElement('canvas');cv.style.cssText='display:block;width:100%;aspect-ratio:'+D.W+'/'+D.H;wrap.appendChild(cv);
  const cap=document.createElement('div');cap.style.cssText='position:absolute;left:10px;bottom:10px;right:10px;color:#f0e6c8;font:600 14px Georgia,serif;text-shadow:0 1px 3px #000;pointer-events:none';wrap.appendChild(cap);
  const yr=document.createElement('div');yr.style.cssText='position:absolute;left:10px;top:8px;color:#f0c873;font:600 22px Georgia,serif;text-shadow:0 1px 3px #000';wrap.appendChild(yr);
  const bar=document.createElement('div');bar.style.cssText='display:flex;gap:8px;align-items:center;margin-top:8px';root.appendChild(bar);
  const btn=document.createElement('button');btn.type='button';btn.textContent='Play';btn.style.cssText='font:600 13px system-ui,sans-serif;padding:6px 14px;border-radius:6px;border:1px solid #8f2b22;background:#8f2b22;color:#f6eee6;cursor:pointer';bar.appendChild(btn);
  const spd=document.createElement('select');spd.innerHTML='<option value="15">Slow</option><option value="40" selected>Normal</option><option value="100">Fast</option>';spd.style.cssText='font:13px system-ui,sans-serif;padding:5px;border-radius:6px';bar.appendChild(spd);
  const tl=document.createElement('canvas');tl.style.cssText='display:block;width:100%;height:64px;margin-top:6px;cursor:pointer;border-radius:6px';root.appendChild(tl);
  let img=D.img;if(typeof img==='string'){const im=new Image();im.onload=()=>draw();im.src=img;img=im}
  let y=0,playing=false,last=0;const end=D.end||1;
  const frameAt=t=>{let lo=0,hi=D.frames.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(D.frames[m].y<=t)lo=m;else hi=m-1}return D.frames[lo]};
  function drawTL(){const w=tl.clientWidth,h=64,dpr=Math.min(2,window.devicePixelRatio||1);if(tl.width!==w*dpr){tl.width=w*dpr;tl.height=h*dpr}const x=tl.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.fillStyle='#1b2130';x.fillRect(0,0,w,h);
    const X=t=>t/end*w;let mx=1;for(const f of D.frames){let s=0;for(const k in f.p)s+=f.p[k];mx=Math.max(mx,s)}
    const base=new Array(D.frames.length).fill(0);for(let id=0;id<D.facs.length;id++){if(!D.frames.some(f=>f.p[id]))continue;x.beginPath();D.frames.forEach((f,i)=>{const v=base[i]+(f.p[id]||0);const px=X(f.y),py=h-14-v/mx*(h-24);i?x.lineTo(px,py):x.moveTo(px,py)});for(let i=D.frames.length-1;i>=0;i--)x.lineTo(X(D.frames[i].y),h-14-base[i]/mx*(h-24));x.closePath();x.fillStyle='hsla('+D.facs[id].h+',50%,55%,.85)';x.fill();D.frames.forEach((f,i)=>base[i]+=f.p[id]||0)}
    x.font='600 10px system-ui,sans-serif';D.chapters.forEach((c,i)=>{x.fillStyle=i%2?'rgba(255,255,255,.06)':'rgba(255,255,255,0)';x.fillRect(X(c[0]),h-14,X(c[1])-X(c[0]),14);x.strokeStyle='rgba(240,200,115,.6)';x.beginPath();x.moveTo(X(c[0]),0);x.lineTo(X(c[0]),h);x.stroke();x.fillStyle='#e9dcb5';x.save();x.beginPath();x.rect(X(c[0]),h-14,X(c[1])-X(c[0]),14);x.clip();x.fillText((i+1)+'. '+c[2],X(c[0])+3,h-3);x.restore()});
    x.fillStyle='#f0c873';x.fillRect(X(y)-1,0,2,h)}
  function draw(){const w=cv.clientWidth,h=Math.round(w*D.H/D.W),dpr=Math.min(2,window.devicePixelRatio||1);if(cv.width!==Math.round(w*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr)}const x=cv.getContext('2d');const s=w/D.W*dpr;x.setTransform(1,0,0,1,0,0);x.fillStyle='#0b0e14';x.fillRect(0,0,cv.width,cv.height);
    if(img&&(img.complete===undefined||img.complete))x.drawImage(img,0,0,cv.width,cv.height);x.setTransform(s,0,0,s,0,0);
    const F=frameAt(y);
    for(const r of D.ruins){if(r[2]>y)continue;if(r[3]){const g=x.createRadialGradient(r[0],r[1],0,r[0],r[1],90*KW);g.addColorStop(0,'rgba(10,10,8,.75)');g.addColorStop(1,'rgba(10,10,8,0)');x.fillStyle=g;x.beginPath();x.arc(r[0],r[1],90*KW,0,6.28);x.fill()}const v=3/s*dpr;x.strokeStyle='rgba(200,190,175,.6)';x.lineWidth=v*0.5;x.beginPath();x.moveTo(r[0]-v,r[1]-v);x.lineTo(r[0]+v,r[1]+v);x.moveTo(r[0]+v,r[1]-v);x.lineTo(r[0]-v,r[1]+v);x.stroke()}
    for(const st of F.s){const f=D.facs[st[2]];const rr=(70+st[3]*28)*KW;const g=x.createRadialGradient(st[0],st[1],0,st[0],st[1],rr);g.addColorStop(0,'hsla('+f.h+',70%,55%,.5)');g.addColorStop(1,'hsla('+f.h+',70%,55%,0)');x.fillStyle=g;x.beginPath();x.arc(st[0],st[1],rr,0,6.28);x.fill()}
    const u=1/s*dpr;for(const st of F.s){const f=D.facs[st[2]];x.fillStyle='hsl('+f.h+',60%,62%)';x.strokeStyle='#0b0e14';x.lineWidth=1.2*u;x.beginPath();x.arc(st[0],st[1],(2.5+st[3]*1.3)*u,0,6.28);x.fill();x.stroke()}
    for(const a of F.a){const f=D.facs[a[2]];x.fillStyle='hsl('+f.h+',75%,50%)';x.beginPath();x.moveTo(a[0],a[1]-6*u);x.lineTo(a[0]+5*u,a[1]+4*u);x.lineTo(a[0]-5*u,a[1]+4*u);x.closePath();x.fill();x.strokeStyle='#000';x.lineWidth=1*u;x.stroke()}
    const big={};for(const st of F.s){if(!big[st[2]]||st[3]>big[st[2]][3])big[st[2]]=st}x.textAlign='center';x.font='600 '+(13*u)+'px Georgia,serif';x.lineJoin='round';for(const id in big){const st=big[id];const f=D.facs[id];x.strokeStyle='rgba(8,10,14,.9)';x.lineWidth=3.5*u;x.strokeText(f.n,st[0],st[1]-9*u);x.fillStyle='hsl('+f.h+',70%,80%)';x.fillText(f.n,st[0],st[1]-9*u)}
    let capt='';for(const e of D.events){const dt=y-e[0];if(dt>=0&&dt<7){const k=dt/7;x.strokeStyle='rgba(255,230,170,'+(1-k)+')';x.lineWidth=2/s*dpr;x.beginPath();x.arc(e[2],e[3],(6+k*40)/s*dpr,0,6.28);x.stroke();capt=e[0]+' · '+e[1]}}
    cap.textContent=capt;yr.textContent='Year '+Math.floor(y);drawTL()}
  function loop(t){if(!playing)return;const dt=Math.min(0.1,(t-last)/1000);last=t;y+=dt*+spd.value;if(y>=end){y=end;playing=false;btn.textContent='Replay'}draw();if(playing)requestAnimationFrame(loop)}
  btn.onclick=()=>{if(y>=end)y=0;playing=!playing;btn.textContent=playing?'Pause':'Play';last=performance.now();if(playing)requestAnimationFrame(loop)};
  const seek=e=>{const r=tl.getBoundingClientRect();y=Math.max(0,Math.min(end,(e.clientX-r.left)/r.width*end));draw()};
  let dragging=false;tl.addEventListener('pointerdown',e=>{dragging=true;tl.setPointerCapture(e.pointerId);seek(e)});tl.addEventListener('pointermove',e=>{if(dragging)seek(e)});tl.addEventListener('pointerup',()=>{dragging=false});
  window.addEventListener('resize',draw);setTimeout(draw,30);return{draw}
}

// ---------- book integration ----------
function sagaBookHTML(){if(!saga.ch.length)return`<div class="claude"><div class="cst">${saga.on?'The first chapter will be written when the first age ends.':'Saga mode is off, so no chapters are being written.'}</div></div>`;
  return saga.ch.map(ch=>`<section class="schap">${chapterHTML(ch,'live')}</section>`).join('<div class="orn">✦</div>')}
function mountReplay(){const r=$('#replayBox');if(!r||!rec||rec.frames.length<2)return;ReplayPlayer(r,replayData(false))}

// ---------- export ----------
function portraitURL(g,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;c.style.width=w+'px';c.style.height=h+'px';document.body.appendChild(c);portrait(c,g,1.2,{noShadow:true,bg:'#1b2130'});const u=c.toDataURL('image/png');c.remove();return u}
function bookMarkdown(){let m=`# The Chronicle of ${worldTitle}\n\nYears 0 to ${Math.floor(S.year)} · seed ${S.seed}\n\n`;for(const ch of saga.ch){const P=ch.parsed||{};m+=`## Age ${ROMAN[ch.n]}: ${P.title||''}\n\n*Years ${ch.a}–${ch.b}*\n\n> ${P.epigraph||''}\n>\n> — ${P.source||''}\n\n${P.dek?'_'+P.dek+'_\n\n':''}${P.history||''}\n\n${(P.scenes||[]).map(s=>`### ${s.head}\n\n${s.text}`).join('\n\n')}\n\n*${P.turning||''}*\n\n`}return m}
function bookMarkdownOld(){let m=`# The Chronicle of ${worldTitle}\n\nYears 0 to ${Math.floor(S.year)} · seed ${S.seed}\n\n`;for(const ch of saga.ch){const P=ch.parsed||{};m+=`## Chapter ${ROMAN[ch.n]}: ${P.title||''}\n\n*Years ${ch.a}–${ch.b}*\n\n> ${P.epigraph||''}\n>\n> — ${P.source||''}\n\n${(P.cast||[]).map(c=>`**${c.name}**: ${c.desc}`).join('  \n')}\n\n${P.open||''}\n\n${(P.beats||[]).map(b=>`**${b.label}.** ${b.text}`).join('\n\n')}\n\n*${P.close||''}*\n\n`}return m}
function exportHTML(){
  const D=replayData(true);const chapters=saga.ch.map(ch=>`<section class="schap">${chapterHTML(ch,'export')}</section>`).join('<div class="orn">✦</div>');
  const peoples=S.facs.map(f=>`<div class="pc"><img src="${portraitURL(f.died!=null?f.snaps[f.snaps.length-1].g:f.g,200,120)}" alt=""><div><b>${esc(f.name)}</b> <span class="d">“${esc(f.gloss)}” · years ${f.born}–${f.died!=null?f.died:'the end'}</span><div class="d">${esc(cap(bodyDesc(f.died!=null?f.snaps[f.snaps.length-1].g:f.g)))}. ${esc(S.GOVS[f.gov].label)}, ${esc(S.eraOf(f))}.${f.parent!=null?` Broke away from the ${esc(S.facs[f.parent].name)}.`:''}</div></div></div>`).join('');
  const tl=S.events.filter(e=>e.imp>=3&&e.type!=='rulerdeath').map(e=>`<li><span class="ty">${e.yr}</span> <b>${esc(e.title)}</b>. ${esc(e.text)}${e.data&&e.data.why&&e.data.why.filter(Boolean)[0]?` <i class="d">Why: ${esc(e.data.why.filter(Boolean)[0])}</i>`:''}</li>`).join('');
  const css=`:root{--vellum:#e6e4d8;--ink:#1a1e29;--muted:#555b68;--rub:#8f2b22}*{box-sizing:border-box}body{margin:0;background:#2a2620;color:var(--ink);font:18px/1.6 'Crimson Pro',Georgia,serif}main{max-width:820px;margin:0 auto;background:var(--vellum);padding:40px clamp(18px,6vw,64px) 80px}h1,h2,h3{font-family:'Grenze',Georgia,serif;line-height:1.05;text-wrap:balance}.cover{text-align:center;padding:40px 0 30px}.cover h1{font-size:clamp(40px,8vw,68px);margin:.2em 0}.kick{font:700 11px/1 system-ui,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}.kchap{font:700 12px system-ui,sans-serif;letter-spacing:.26em;text-transform:uppercase;color:var(--rub);text-align:center;margin-top:30px}.ctitle{font-size:clamp(30px,5vw,44px);text-align:center;margin:.2em 0 .1em}.cyrs{text-align:center;font:13px ui-monospace,monospace;color:var(--muted)}.epi{margin:26px auto;max-width:30em;font-style:italic;text-align:center}.epi p{margin:0}.epi cite{display:block;margin-top:8px;font-style:normal;font-size:15px;color:var(--muted)}.dek{font-size:20px;text-align:center;color:var(--muted);max-width:32em;margin:0 auto 18px}.open p{margin:0 0 14px;font-size:19px}.open p:first-child:first-letter{float:left;font:700 3.1em/.85 Grenze,Georgia,serif;margin:4px 6px 0 0;color:var(--rub)}.open b,.scene b,.close b{color:var(--rub);font-weight:600}.scene{margin:22px 0;padding:14px 16px;background:#dcdccf;border-radius:8px}.shead{display:flex;gap:10px;align-items:center;font:700 11px system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--rub);margin-bottom:8px}.shead img{width:64px;height:43px;border-radius:5px}.scene p{margin:0 0 10px}.close{font-style:italic;font-size:20px;text-align:center;margin:24px auto;max-width:30em}.realm{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:12px;align-items:center;margin-top:20px;border-top:1px solid #b9bcae;padding-top:14px}.realm img,.tmap{width:100%;border-radius:6px}.rtiles{display:grid;gap:8px;font:12px system-ui,sans-serif;color:var(--muted)}.rtiles b{display:block;font:600 17px Grenze,Georgia,serif}.ctabs{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin:18px 0 20px;border-bottom:1px solid #b9bcae}.ctabs button{font:600 13px system-ui,sans-serif;background:none;border:0;padding:8px 10px;color:var(--muted);border-bottom:2px solid transparent;cursor:pointer}.ctabs button[aria-selected=true]{color:var(--ink);border-bottom-color:var(--rub)}.tnote{font-style:italic;font-size:18px;border-left:3px solid var(--rub);padding-left:12px}.scrip{margin:16px auto;max-width:30em;text-align:center;font-style:italic}.scrip cite{display:block;font-style:normal;font-size:14px;color:var(--muted);margin-top:6px}.fcard,.lcard,.wcard{border:1px solid #b9bcae;border-radius:8px;padding:12px 14px;margin:12px 0;font:14px/1.5 system-ui,sans-serif;background:#e2e2d7}.fhd{display:flex;gap:10px;align-items:center;margin-bottom:8px}.fhd b{font:600 19px Grenze,Georgia,serif}.fsym{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:18px;flex:none}.fgrid{display:grid;grid-template-columns:1fr 1.6fr;gap:12px}.lbl{font:700 10.5px system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--rub);margin-top:8px}.fbars div{display:grid;grid-template-columns:110px 1fr 40px;gap:8px;align-items:center}.fbars i{height:6px;background:#cfd1c4;border-radius:3px;overflow:hidden}.fbars em{display:block;height:100%}.nat{unicode-bidi:isolate;font-family:'Noto Sans TC','Noto Sans JP','Noto Sans Runic','Noto Sans Cherokee','Noto Sans Canadian Aboriginal','Noto Sans Ethiopic','Noto Sans Georgian','Noto Sans Armenian','Noto Sans Devanagari','Noto Sans Hebrew','Noto Sans Arabic',system-ui,sans-serif}.natlg{font-size:20px}.natsm{color:var(--muted)}.wgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;margin:8px 0}.wgrid div{background:#d6d7cb;border-radius:6px;padding:6px 8px;display:grid}.wn{font-size:20px}.wr{font:12px ui-monospace,monospace}.wg{font-size:11px;color:var(--muted)}.lchg{font-size:13px;margin-top:4px}.prow{display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #c6c9bb;font:14px system-ui,sans-serif}.sw{width:10px;height:10px;border-radius:50%}.pn b{font:600 17px Grenze,Georgia,serif}.pp{text-align:right}.pp b{display:block;font:600 17px Grenze,Georgia,serif}.trend{font-size:11px;color:var(--muted)}.trend.up{color:#3e6b2c}.trend.down,.trend.gone{color:var(--rub)}.rlist{display:flex;flex-wrap:wrap;gap:4px 12px;font:12.5px system-ui,sans-serif;color:var(--muted);padding:0 0 8px 22px}.whd{display:flex;justify-content:space-between;gap:8px}.whd b{font:600 18px Grenze,Georgia,serif}.newb{color:var(--rub);font-weight:700}ul.pacts{font:13.5px system-ui,sans-serif;padding-left:18px}@media(max-width:560px){.realm,.fgrid{grid-template-columns:1fr}}.orn{text-align:center;color:var(--rub);margin:36px 0;font-size:20px}h2.sec{font-size:32px;color:var(--rub);margin-top:56px;border-top:2px solid var(--ink);padding-top:12px}.pc{display:grid;grid-template-columns:200px minmax(0,1fr);gap:14px;margin:14px 0;font:14px/1.45 system-ui,sans-serif}.pc img{width:200px;height:120px;border-radius:6px}.pc b{font:600 20px Grenze,Georgia,serif}.d{color:var(--muted)}ol.tl{list-style:none;padding:0;font:14px/1.5 system-ui,sans-serif}ol.tl li{margin:8px 0}.ty{font:12px ui-monospace,monospace;color:var(--muted);display:inline-block;min-width:3.5em}.rulers .rl{display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;border-bottom:1px solid #c6c9bb;padding:8px 0;font:14px system-ui,sans-serif}.rulers b{font:600 17px Grenze,Georgia,serif}.ry{font:12px ui-monospace,monospace;color:var(--muted)}.tongue{border:1px solid #b2b6a6;border-radius:8px;padding:12px;margin:10px 0;overflow-x:auto;font:14px system-ui,sans-serif}.tongue table{border-collapse:collapse}.tongue td,.tongue th{padding:3px 8px;border-bottom:1px solid #cfd1c4;text-align:left;font-family:ui-monospace,monospace;font-size:13px}.tongue td.gl{color:var(--rub);font-family:system-ui}@media(max-width:560px){.pc{grid-template-columns:1fr}.pc img{width:100%;height:auto}}`;
  return`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Chronicle of ${esc(worldTitle)}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Grenze:wght@600;700&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Runic&family=Noto+Sans+Cherokee&family=Noto+Sans+Canadian+Aboriginal&family=Noto+Sans+Ethiopic&family=Noto+Sans+Georgian&family=Noto+Sans+Armenian&family=Noto+Sans+Devanagari&family=Noto+Sans+Hebrew&family=Noto+Sans+Arabic&family=Noto+Sans+JP&family=Noto+Sans+TC&display=swap"><style>${css}[hidden]{display:none!important}</style></head><body><main>
<div class="cover"><div class="kick">A history in ${saga.ch.length} ages</div><h1>The Chronicle of ${esc(worldTitle)}</h1><p class="d">Being the history of a world from its first thought to its end, years 0 to ${Math.floor(S.year)}.<br>Simulated by Brood &amp; Empire · seed ${S.seed}${saga.ch.some(c=>c.status==='done')?' · chapters written by Claude':''}</p></div>
<h2 class="sec">The World, Replayed</h2><p class="d" style="font-size:15px">Press play to watch every town rise and fall. Click the timeline to jump to any age.</p><div id="replay"></div>
<h2 class="sec">The Ages</h2>${chapters}
<h2 class="sec">The Peoples</h2>${peoples}
<h2 class="sec">Rulers and Their Choices</h2>${rulersHTML()}
<h2 class="sec">The Tongues</h2>${tonguesHTML()}
<h2 class="sec">Timeline of Great Events</h2><ol class="tl">${tl}</ol>
</main><script>document.querySelectorAll('.ctabs').forEach(bar=>bar.addEventListener('click',e=>{const b=e.target.closest('[data-ctab]');if(!b)return;bar.querySelectorAll('[data-ctab]').forEach(x=>x.setAttribute('aria-selected',x===b));bar.parentElement.querySelectorAll(':scope > [data-cpane]').forEach(p=>p.hidden=p.dataset.cpane!==b.dataset.ctab)}))<\/script><script type="application/json" id="rdata">${JSON.stringify(D).replace(/</g,'\\u003c')}<\/script><script>${ReplayPlayer.toString()}\nReplayPlayer(document.getElementById('replay'),JSON.parse(document.getElementById('rdata').textContent));<\/script></body></html>`;
}
async function exportBook(){const st=$('#exportStat');const say=t=>{if(st)st.textContent=t;const c=$('#cExportStat');if(c)c.textContent=t};
  if(!saga.ch.length){say('Nothing to export yet. The book fills as each age ends.');return}
  say('Binding the book…');let html;try{html=exportHTML()}catch(e){say('Could not build the book file.');return}
  const name=`The Chronicle of ${worldTitle}.html`;
  if(downloadsFn){try{await downloadsFn.save({filename:name,data:new Blob([html],{type:'text/html'})});say('Saved. Open the file in any browser to read the saga and watch the replay.');return}catch(err){if(err&&err.code==='declined'){say('Save cancelled.');return}if(err&&err.code==='rate_limited'){say('A save prompt is already open.');return}}}
  try{await navigator.clipboard.writeText(bookMarkdown());say('Saving files is not available here, so the saga text was copied to your clipboard instead.')}catch(e){say('Saving files is not available in this view.')}}

// ================= SAVING: worlds and sagas survive reloads =================
// Two places, belt and braces: this browser (IndexedDB, fast, large) and the viewer's private
// space in the artifact's database (follows them to other devices; split into chunks).
const SAVE={id:null,dirty:true,lastLocal:0,lastCloud:0,busy:false,where:'',at:0,suspended:false};
const LOCAL_KEEP=8,CLOUD_KEEP=4,CHUNK=180000;
function newSaveId(){return'w'+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36)}
function markDirty(){SAVE.dirty=true}
async function gz(str){if(typeof CompressionStream==='undefined')return'J'+str;const st=new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));const buf=await new Response(st).arrayBuffer();return'G'+taToB64(new Uint8Array(buf))}
async function gunz(s){if(s[0]==='J')return s.slice(1);const u=b64ToU8(s.slice(1));const st=new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'));return await new Response(st).text()}
// ---- IndexedDB key-value ----
const IDB={db:null,
  open(){if(IDB.db)return Promise.resolve(IDB.db);return new Promise(res=>{try{const r=indexedDB.open('brood-worlds',1);r.onupgradeneeded=()=>{try{r.result.createObjectStore('kv')}catch(e){}};r.onsuccess=()=>{IDB.db=r.result;res(IDB.db)};r.onerror=()=>res(null);r.onblocked=()=>res(null)}catch(e){res(null)}})},
  async op(mode,fn,read){const d=await IDB.open();if(!d)return null;return new Promise(res=>{try{const tx=d.transaction('kv',mode);const q=fn(tx.objectStore('kv'));tx.oncomplete=()=>res(read?(q.result===undefined?null:q.result):true);tx.onerror=()=>res(null);tx.onabort=()=>res(null)}catch(e){res(null)}})},
  get(k){return IDB.op('readonly',s=>s.get(k),true)},put(k,v){return IDB.op('readwrite',s=>s.put(v,k))},del(k){return IDB.op('readwrite',s=>s.delete(k))}};
// ---- the viewer's private cloud space ----
const CLOUD={col:null,ready:false,tried:false};
async function cloudInit(){if(CLOUD.tried)return CLOUD.ready;CLOUD.tried=true;try{if(typeof claude==='undefined'||!claude.use)return false;const db=await claude.use('db');if(!db)return false;const user=await claude.use('user');const uid=user?await user.id():null;if(!uid)return false;CLOUD.col=db.collection('data/users/'+uid);CLOUD.ready=true}catch(e){CLOUD.ready=false}return CLOUD.ready}
async function cloudIndex(){if(!CLOUD.ready)return[];try{const d=await CLOUD.col.doc('index').get();return d.exists?(d.data().worlds||[]):[]}catch(e){return[]}}
async function cloudPut(meta,blob){
  const ver=Date.now().toString(36);const n=Math.ceil(blob.length/CHUNK);
  for(let k=0;k<n;k++)await CLOUD.col.doc(`${meta.id}_${ver}_${k}`).set({d:blob.slice(k*CHUNK,(k+1)*CHUNK)});
  const idx=await cloudIndex();const old=idx.find(w=>w.id===meta.id);let list=idx.filter(w=>w.id!==meta.id);list.unshift({...meta,ver,chunks:n});
  const drop=list.slice(CLOUD_KEEP);list=list.slice(0,CLOUD_KEEP);
  await CLOUD.col.doc('index').set({worlds:list});
  for(const w of (old?[old]:[]).concat(drop))for(let k=0;k<w.chunks;k++)CLOUD.col.doc(`${w.id}_${w.ver}_${k}`).delete().catch(()=>{});
}
async function cloudGet(meta){const parts=[];for(let k=0;k<meta.chunks;k++){const d=await CLOUD.col.doc(`${meta.id}_${meta.ver}_${k}`).get();if(!d.exists)return null;parts.push(d.data().d)}return parts.join('')}
async function cloudDel(id){const idx=await cloudIndex();const w=idx.find(x=>x.id===id);if(!w)return;await CLOUD.col.doc('index').set({worlds:idx.filter(x=>x.id!==id)});for(let k=0;k<w.chunks;k++)CLOUD.col.doc(`${w.id}_${w.ver}_${k}`).delete().catch(()=>{})}
// ---- what a save holds ----
function marksSmall(){try{const c=document.createElement('canvas');c.width=Math.min(S.W/2,1200);c.height=c.width*S.H/S.W;c.getContext('2d').drawImage(marksC,0,0,c.width,c.height);return c.toDataURL('image/webp',0.7)}catch(e){return null}}
function saveMeta(){const k=S.heroFac?S.heroFac():null;return{id:SAVE.id,title:worldTitle,seed:S.seed,size:S.size||'standard',year:Math.floor(S.year),age:saga.on?saga.ch.length+(saga.ended?0:1):0,ended:!!saga.ended,alive:S.alive().length,lead:k?k.name:'',savedAt:Date.now(),endless:!saga.target}}
function buildSave(){return{v:1,meta:saveMeta(),sim:snapshotSim(S),saga:{...saga,ch:saga.ch.map(c=>({...c}))},rec,cam:{x:cam.x,y:cam.y,z:cam.z},speed,chronFilter,marks:marksSmall(),chapterOpen:!!chapterOpen}}
async function saveNow(cloudToo){
  if(!S||SAVE.busy||SAVE.suspended||!SAVE.id)return;if(S.year<12&&!saga.ch.length)return;SAVE.busy=true;
  try{const P=buildSave();const meta=P.meta;const blob=await gz(JSON.stringify(P));
    const okL=await IDB.put('w:'+meta.id,blob);if(okL){let idx=await IDB.get('index');if(!Array.isArray(idx))idx=[];idx=[meta].concat(idx.filter(w=>w.id!==meta.id));for(const w of idx.slice(LOCAL_KEEP))IDB.del('w:'+w.id);await IDB.put('index',idx.slice(0,LOCAL_KEEP));SAVE.where='this device'}
    SAVE.lastLocal=performance.now();
    if(cloudToo&&await cloudInit()){try{await cloudPut(meta,blob);SAVE.lastCloud=performance.now();SAVE.where='your account'}catch(e){if(e&&e.code==='quota_exceeded')SAVE.where=okL?'this device (account storage is full)':'nowhere: storage is full'}}
    if(okL||SAVE.lastCloud)SAVE.at=Date.now();SAVE.dirty=false}
  catch(e){console.warn('save failed',e)}finally{SAVE.busy=false;saveUI()}}
function ago(t){const s=(Date.now()-t)/1000;return s<60?'just now':s<3600?Math.round(s/60)+' min ago':s<86400?Math.round(s/3600)+' h ago':Math.round(s/86400)+' days ago'}
function saveUI(){const el=$('#saveStat');if(!el)return;el.textContent=SAVE.at?`Saved ${ago(SAVE.at)}${SAVE.where?' · '+SAVE.where:''}`:''}
// autosave: this device every 30s of play, the account every 3 min, and whenever the page is hidden
function saveTick(){const now=performance.now();if(!S||SAVE.suspended)return;
  if(now-SAVE.lastLocal>30000&&(running||SAVE.dirty)){const cloud=now-SAVE.lastCloud>180000;saveNow(cloud)}saveUI()}
setInterval(saveTick,5000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveNow(true)});
window.addEventListener('pagehide',()=>{saveNow(false)});
// ---- loading ----
async function listWorlds(){const L=(await IDB.get('index'))||[];const C=await cloudIndex();const m=new Map();
  for(const w of L)m.set(w.id,{...w,local:true});for(const w of C){const e=m.get(w.id);if(!e||w.savedAt>e.savedAt+1000)m.set(w.id,{...w,local:!!e&&e.savedAt>=w.savedAt,cloud:true,cmeta:w});else e.cloud=true,e.cmeta=w}
  return[...m.values()].sort((a,b)=>b.savedAt-a.savedAt)}
async function fetchWorld(w){let blob=null;if(w.local)blob=await IDB.get('w:'+w.id);if(!blob&&w.cmeta&&CLOUD.ready)blob=await cloudGet(w.cmeta);if(!blob)return null;return JSON.parse(await gunz(blob))}
async function loadWorld(w){const st=$('#wsub');if(st)st.textContent='Waking the world…';
  try{const P=await fetchWorld(w);if(!P){if(st)st.textContent='That world could not be found. It may have been saved on another device before the account copy finished.';return false}
    if(S&&SAVE.id&&SAVE.id!==w.id)await saveNow(false);
    newWorld(P.meta.seed,P);closeWorlds();return true}
  catch(e){console.warn(e);if(st)st.textContent='That save is damaged and could not be opened.';return false}}
async function deleteWorld(id){await IDB.del('w:'+id);const idx=((await IDB.get('index'))||[]).filter(w=>w.id!==id);await IDB.put('index',idx);if(CLOUD.ready)await cloudDel(id).catch(()=>{});renderWorlds()}
// ---- the worlds dialog ----
let worldsWasRunning=true;
async function renderWorlds(first){const box=$('#wlist');if(!box)return;const list=await listWorlds();
  const cur=SAVE.id;$('#wsub').textContent=list.length?(first?'Pick up where you left off, or begin again.':'Worlds are saved as you watch them.'):'No saved worlds yet. Worlds save themselves as you watch.';
  box.innerHTML=list.map((w,i)=>`<div class="wcardx${w.id===cur?' cur':''}"><div class="wmain"><b>The world of ${esc(w.title)}</b><div class="d">${esc((WORLD_SIZES[w.size||'standard']||WORLD_SIZES.standard).label)} world · Year ${w.year}${w.age?` · ${w.ended?'ended':'Age '+ROMAN[w.age]}`:''} · ${w.alive} ${w.alive===1?'people':'peoples'} living${w.lead?` · the ${esc(w.lead)}`:''}</div><div class="d">Saved ${ago(w.savedAt)}${w.cloud?' · in your account':' · on this device'}</div></div><div class="wbtns">${w.id===cur?'<span class="d">playing now</span>':`<button type="button" class="btn${i===0&&first?' primary':''}" data-wload="${w.id}">${i===0&&first?'Continue':'Open'}</button><button type="button" class="btn ghost" data-wdel="${w.id}" aria-label="Delete the world of ${esc(w.title)}">Delete</button>`}</div></div>`).join('');
  box._list=list}
function openWorlds(first){worldsWasRunning=running;running=false;$('#worlds').hidden=false;SAVE.suspended=!!first;renderWorlds(first)}
function closeWorlds(){$('#worlds').hidden=true;if(SAVE.id==null){beginNewWorld();return}SAVE.suspended=false;running=worldsWasRunning||running;$('#play').textContent=running?'Pause':'Resume'}
$('#wlist').addEventListener('click',async e=>{const l=e.target.closest('[data-wload]');const box=$('#wlist');if(l){const w=box._list.find(x=>x.id===l.dataset.wload);if(w){worldsWasRunning=true;await loadWorld(w)}return}
  const d=e.target.closest('[data-wdel]');if(d){if(d.dataset.confirm){d.textContent='…';await deleteWorld(d.dataset.wdel)}else{d.dataset.confirm=1;d.textContent='Delete for good?'}}});
$('#wNew').onclick=async()=>{if(SAVE.id&&!SAVE.suspended)await saveNow(true);$('#worlds').hidden=true;beginNewWorld()};
$('#wPro').onclick=()=>{$('#worlds').hidden=true;const real=SAVE.id!=null;playPrologue(()=>{if(real){SAVE.suspended=false;running=worldsWasRunning;$('#play').textContent=running?'Pause':'Resume'}else openCreation()})};
$('#wClose').onclick=()=>closeWorlds();
$('#worldsBtn').onclick=()=>{saveNow(false);openWorlds(false)};
// on open: if a world was saved, offer to continue it before the new one goes anywhere
async function bootSaves(){let L=await IDB.get('index');if(!Array.isArray(L))L=[];if(L.length)openWorlds(true);else beginNewWorld();
  const ok=await cloudInit();if(!ok)return;const C=await cloudIndex();if(!$('#worlds').hidden)renderWorlds(true);else if(C.length&&SAVE.id==null&&!introOn){$('#create').hidden=true;openWorlds(true)}}

// ================= THE MAKER: prologue, creation, choices, skip =================
let choiceOpen=false,skipping=false,introOn=false;
function setSpeed(v){speed=v;document.querySelectorAll('#speed button').forEach(x=>x.setAttribute('aria-pressed',+x.dataset.s===v))}
function skipUI(){const b=$('#skipBtn');if(!b)return;b.textContent=skipping?'Skipping… (stop)':'Skip to next age';b.classList.toggle('on',skipping);b.hidden=!saga.on||saga.ended}
$('#skipBtn').onclick=()=>{skipping=!skipping;if(skipping){running=true;$('#play').textContent='Pause'}skipUI()};
function endSkip(){if(skipping){skipping=false;setSpeed(1)}skipUI()}

// ---------- choices ----------
function petitionTick(Y){if(saga.choice||saga.ended)return;if(saga.nextPet==null)saga.nextPet=saga.ageStart+Math.round(ageLimits().base*(0.4+Math.random()*0.25));
  if(Y>=saga.nextPet){saga.nextPet=saga.on?Infinity:Y+90+Math.round(Math.random()*40);const p=S.findPetition();if(p)saga.choice=p}}
function choicePortraits(ch){const ids=new Set();const c=ch.ctx||{};for(const k of ['f','a','b','top','low'])if(c[k]!=null&&S.facs[c[k]])ids.add(c[k]);if(c.m!=null&&S.moves[c.m])ids.add(S.moves[c.m].fac);return[...ids].slice(0,2).map(id=>S.facs[id])}
function openChoice(ch){if(ch.kind==='gen'){const chk=S.checkCard(ch.trigger,ch.card);if(!chk.ok){saga.choice=null;reissueCard(ch.trigger||{},chk,ch.regen);return}return openGameCard(ch)}if(ch.kind==='call')return openProphetCall(ch);const v=S.choiceView(ch);if(!v||!v.opts||!v.opts.length){finishChoice(ch);return}
  choiceOpen=true;const box=$('#choice');box.hidden=false;const fs=choicePortraits(ch);
  $('#chCard').innerHTML=`<div class="chk">${ch.kind==='turning'?'The age turns':'A petition'} · year ${Math.floor(S.year)}</div><h2 class="cht">${esc(v.title)}</h2>
  ${fs.length?`<div class="chp">${fs.map(f=>`<figure><canvas data-chf="${f.id}"></canvas><figcaption>${esc(f.name)}${(f.knows||0)>0.12?`<small>call you ${esc(S.makerWord(f))}</small>`:'<small>do not know you</small>'}</figcaption></figure>`).join('')}</div>`:''}
  <p class="chb">${esc(v.body)}</p><div class="cho">${v.opts.map(o=>{const no=o.cost>S.maker.power;return`<button type="button" class="chbtn" data-cho="${esc(o.id)}"${no?' disabled':''}><b>${esc(o.label)}${o.cost?`<em class="pw">✦ ${o.cost}</em>`:''}</b>${o.hint||no?`<span>${esc(no?'Not enough power':o.hint)}</span>`:''}</button>`}).join('')}<div class="chpow">Your power: ✦ ${Math.floor(S.maker.power)} of ${S.maker.maxPower}</div></div>`;
  box.querySelectorAll('canvas[data-chf]').forEach(c=>{const f=S.facs[+c.dataset.chf];portrait(c,f.g,1,{tech:techTier(f),noShadow:true})});
  const first=box.querySelector('.chbtn');if(first)first.focus({preventScroll:true});
  box.onclick=e=>{const b=e.target.closest('[data-cho]');if(!b||b.disabled)return;box.querySelectorAll('.chbtn').forEach(x=>x.disabled=true);const out=S.applyChoice(ch,b.dataset.cho);
    $('#chCard').querySelector('.cho').outerHTML=`<p class="chout">${esc(out)}</p><div class="chrow"><button type="button" class="btn primary" id="chGo">${ch.kind==='turning'?'Write the age':'Continue'}</button></div>`;$('#chGo').focus({preventScroll:true});$('#chGo').onclick=()=>finishChoice(ch);renderHand();markDirty()}}
function finishChoice(ch){$('#choice').hidden=true;choiceOpen=false;saga.choice=null;renderHand()}
// ---------- your hand (replaces the speak box) ----------
function renderHand(){const el=$('#hand');if(!el||!S.makerStanding)return;const st=S.makerStanding();const M=S.maker;const tot=M.kind+M.wrath||1;
  const names=S.alive().filter(f=>(f.knows||0)>0.12).sort((a,b)=>b.knows-a.knows).slice(0,3).map(f=>`<div><span class="sw" style="background:hsl(${f.hue},50%,50%)"></span>The ${esc(f.name)} call you <b>${esc(S.makerWord(f))}</b></div>`).join('');
  const last=M.deeds[M.deeds.length-1];
  el.innerHTML=`<div class="hhd"><span>How they see you</span><b>${esc(st.label)}</b></div>
  <div class="hpow" title="Power flows from worship: the more who believe, the faster it returns"><span>✦ Power</span><i><em style="width:${Math.round(100*M.power/(M.maxPower||1))}%"></em></i><b>${Math.floor(M.power)}/${M.maxPower}</b></div>
  <div class="hbal" title="Mercy and wrath in your deeds"><span>mercy</span><i><em style="width:${Math.round(100*M.kind/tot)}%"></em></i><span>wrath</span></div>
  ${names||'<div class="d">No people knows you exist. You watch from outside the world.</div>'}
  ${last?`<div class="hlast"><span class="ty">${last.yr}</span> ${esc(last.title)}: <i>${esc(last.choice)}</i></div>`:'<div class="d">Press <b>Act</b> to touch a town or a soul. Those who believe will call on you when they are in need.</div>'}`}
// ---------- prologue ----------
const PROLOGUE=[
  ['Many ages ago, or perhaps it was only a lifetime ago (your mind keeps time differently now)…','stars'],
  ['…you discovered the secret coveted by man for all of time: eternal life.','vial'],
  ['First you learned the essentials. How to disappear from mankind. How to stand apart from their happenings, yet always watch, and learn.','fade'],
  ['So you learned. Maths. Physics. Astronomy. Psychology. Philosophy. Theology. You practised, and honed, and became a master of knowledge.','glyphs'],
  ['But when you returned to mankind, it was gone. Destroyed or deserted, you could not tell. The earth was empty of life.','ruin'],
  ['So you decided to create your own.','seed'],
  ['You craft them. You breathe life into them. Now they are yours to govern. Do with them as you will.','life'],
];
let introI=0,introT0=0,introRAF=0,introDone=null,introStars=null;
function playPrologue(then){introOn=true;introDone=then;introI=0;introT0=performance.now();$('#intro').hidden=false;const cv2=$('#introCv');introStars=Array.from({length:260},()=>({x:Math.random(),y:Math.random(),z:Math.random()}));showIntroText();cancelAnimationFrame(introRAF);introRAF=requestAnimationFrame(introFrame)}
function showIntroText(){const t=$('#introText');t.classList.remove('in');setTimeout(()=>{t.textContent=PROLOGUE[introI][0];t.classList.add('in')},introI?350:50);$('#introDots').innerHTML=PROLOGUE.map((_,i)=>`<i${i===introI?' class="on"':''}></i>`).join('')}
function introNext(){introI++;introT0=performance.now();if(introI>=PROLOGUE.length){endPrologue();return}showIntroText()}
function endPrologue(){if(!introOn)return;introOn=false;cancelAnimationFrame(introRAF);$('#intro').hidden=true;try{localStorage.setItem('brood_prologue','1')}catch(e){}const f=introDone;introDone=null;if(f)f()}
$('#introSkip').onclick=e=>{e.stopPropagation();endPrologue()};
$('#intro').addEventListener('click',()=>introNext());
document.addEventListener('keydown',e=>{if(!introOn)return;if(e.key==='Escape')endPrologue();else if(e.key===' '||e.key==='Enter'||e.key==='ArrowRight'){e.preventDefault();introNext()}});
function introFrame(now){const cv2=$('#introCv');const dpr=Math.min(2,devicePixelRatio||1);const w=cv2.clientWidth,h=cv2.clientHeight;if(cv2.width!==Math.round(w*dpr)){cv2.width=Math.round(w*dpr);cv2.height=Math.round(h*dpr)}
  const c=cv2.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);const t=(now-introT0)/1000,T2=now/1000;const kind=PROLOGUE[introI]?PROLOGUE[introI][1]:'life';const cx=w/2,cy=h*0.42,R0=Math.min(w,h);
  c.fillStyle='#07080c';c.fillRect(0,0,w,h);
  const stars=a=>{for(const s of introStars){const tw=0.5+0.5*Math.sin(T2*2+s.z*40);c.fillStyle=`rgba(230,225,210,${a*(0.25+s.z*0.6)*tw})`;const x=((s.x+T2*0.004*s.z)%1)*w;c.fillRect(x,s.y*h,1+s.z*1.2,1+s.z*1.2)}};
  const glow=(x,y,r,col,a)=>{const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,col.replace('A',a));g.addColorStop(1,col.replace('A',0));c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,7);c.fill()};
  if(kind==='stars'){stars(1);c.save();c.translate(cx,cy);c.rotate(T2*0.05);c.strokeStyle='rgba(217,165,78,.25)';c.lineWidth=1;for(let i=0;i<3;i++){c.beginPath();c.arc(0,0,R0*(0.16+i*0.07),0,7);c.stroke()}for(let i=0;i<12;i++){const a=i/12*6.283;c.fillStyle='rgba(240,200,115,.5)';c.fillRect(Math.cos(a)*R0*0.3-1,Math.sin(a)*R0*0.3-1,2,2)}c.restore();
    for(let i=0;i<60;i++){const p=((T2*0.15+i/60)%1);c.fillStyle=`rgba(240,200,115,${0.5*(1-p)})`;c.fillRect(cx+Math.sin(i*7.1)*R0*0.02*p,cy-R0*0.08+p*R0*0.16,1.5,1.5)}}
  else if(kind==='vial'){stars(0.5);const pulse=0.75+0.25*Math.sin(T2*2.2);glow(cx,cy,R0*0.42*pulse,'rgba(240,200,115,A)',0.35);for(let i=0;i<14;i++){const a=i/14*6.283+T2*0.1;c.strokeStyle=`rgba(240,200,115,${0.08+0.06*Math.sin(T2+i)})`;c.lineWidth=2;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*R0,cy+Math.sin(a)*R0);c.stroke()}
    const s=R0*0.09;c.fillStyle='rgba(20,18,14,.9)';c.strokeStyle='rgba(255,230,170,.9)';c.lineWidth=2;c.beginPath();c.moveTo(cx-s*0.25,cy-s*1.3);c.lineTo(cx-s*0.25,cy-s*0.45);c.lineTo(cx-s*0.9,cy+s*0.8);c.quadraticCurveTo(cx,cy+s*1.15,cx+s*0.9,cy+s*0.8);c.lineTo(cx+s*0.25,cy-s*0.45);c.lineTo(cx+s*0.25,cy-s*1.3);c.closePath();c.fill();c.stroke();
    c.fillStyle=`rgba(255,215,120,${0.8*pulse})`;c.beginPath();c.moveTo(cx-s*0.62,cy+s*0.35);c.lineTo(cx+s*0.62,cy+s*0.35);c.lineTo(cx+s*0.88,cy+s*0.78);c.quadraticCurveTo(cx,cy+s*1.1,cx-s*0.88,cy+s*0.78);c.closePath();c.fill();
    for(let i=0;i<7;i++){const p=((T2*0.4+i/7)%1);c.fillStyle=`rgba(255,240,200,${1-p})`;c.beginPath();c.arc(cx+Math.sin(i*3+T2)*s*0.3,cy+s*0.6-p*s*2.4,2.2*(1-p)+0.5,0,7);c.fill()}}
  else if(kind==='fade'){stars(0.35);const GY=h*0.6;for(let i=0;i<40;i++){const x=(i/40)*w,bh=h*0.06+((i*37)%11)/11*h*0.1;c.fillStyle='rgba(30,34,46,1)';c.fillRect(x+w*0.25,GY-bh,w/60-2,bh);if((i*13)%3===0){c.fillStyle=`rgba(240,200,115,${0.4+0.3*Math.sin(T2*3+i)})`;c.fillRect(x+w*0.25+3,GY-bh+6,3,3)}}c.fillStyle='rgba(18,20,28,1)';c.fillRect(0,GY,w,h-GY);
    const a=Math.max(0,1-t/6);c.fillStyle=`rgba(10,10,14,${0.25+0.75*a})`;c.strokeStyle=`rgba(217,165,78,${0.2+0.6*a})`;c.lineWidth=1.5;const fx=w*0.18,fy=h*0.6,s=R0*0.15;c.beginPath();c.moveTo(fx,fy-s*1.6);c.quadraticCurveTo(fx+s*0.45,fy-s*1.55,fx+s*0.4,fy-s*1.1);c.lineTo(fx+s*0.55,fy);c.lineTo(fx-s*0.55,fy);c.lineTo(fx-s*0.4,fy-s*1.1);c.quadraticCurveTo(fx-s*0.45,fy-s*1.55,fx,fy-s*1.6);c.fill();c.stroke();
    glow(fx+s*0.1,fy-s*1.25,s*0.25,'rgba(240,200,115,A)',0.7)}
  else if(kind==='glyphs'){stars(0.4);const G=['∑','∫','π','☉','☾','Ψ','∴','✶','Ω','φ','∞','△'];glow(cx,cy,R0*0.12,'rgba(240,200,115,A)',0.5);c.textAlign='center';c.textBaseline='middle';
    G.forEach((g,i)=>{const ring=i%3,a=i/G.length*6.283+T2*(0.25+ring*0.12)*(ring%2?-1:1),r=R0*(0.14+ring*0.08);const ap=Math.min(1,Math.max(0,(t-i*0.25)/0.8));c.font=`${16+ring*5}px Georgia,serif`;c.fillStyle=`rgba(240,215,160,${0.85*ap})`;c.fillText(g,cx+Math.cos(a)*r,cy+Math.sin(a)*r*0.8)});
    c.strokeStyle='rgba(217,165,78,.18)';for(let r=1;r<=3;r++){c.beginPath();c.ellipse(cx,cy,R0*(0.06+r*0.08),R0*(0.06+r*0.08)*0.8,0,0,7);c.stroke()}}
  else if(kind==='ruin'){const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#2a1d1a');g.addColorStop(0.6,'#4a3326');g.addColorStop(1,'#151110');c.fillStyle=g;c.fillRect(0,0,w,h);glow(w*0.7,h*0.45,R0*0.25,'rgba(210,120,70,A)',0.35);
    c.fillStyle='#120e0d';let x=0;let k=0;while(x<w){const bw=20+((k*53)%40),bh=h*0.1+((k*29)%17)/17*h*0.3;c.beginPath();c.moveTo(x,h*0.78);c.lineTo(x,h*0.78-bh);c.lineTo(x+bw*0.3,h*0.78-bh-((k%3)*6));c.lineTo(x+bw*0.55,h*0.78-bh+10+((k*7)%14));c.lineTo(x+bw,h*0.78-bh*0.7);c.lineTo(x+bw,h*0.78);c.fill();x+=bw+4;k++}c.fillRect(0,h*0.78,w,h);
    for(let i=0;i<120;i++){const p=(T2*0.05*(1+(i%5))+i*0.137)%1;c.fillStyle=`rgba(200,170,140,${0.25*(i%3?0.6:1)})`;c.fillRect(p*w,(h*0.3+((i*71)%100)/100*h*0.6)+Math.sin(T2+i)*6,2,1)}}
  else{stars(kind==='life'?0.8:0.3);const grow=kind==='life'?Math.min(1,t/5):0.3+0.1*Math.sin(T2*2);glow(cx,cy,R0*(0.08+grow*0.3),'rgba(240,200,115,A)',0.55);glow(cx,cy,R0*0.03,'rgba(255,250,235,A)',0.95);
    c.strokeStyle='rgba(240,200,115,.35)';c.lineWidth=1.5;for(const sd of [-1,1]){c.beginPath();c.moveTo(cx+sd*R0*0.36,cy+R0*0.2);c.quadraticCurveTo(cx+sd*R0*0.16,cy+R0*0.16,cx+sd*R0*0.07,cy+R0*0.02);c.stroke()}
    if(kind==='life')for(let i=0;i<30;i++){const a=i/30*6.283+T2*0.3,r=R0*(0.05+grow*0.28)*(0.6+0.4*Math.sin(i*1.7+T2));c.fillStyle=`hsla(${(i*37)%360},60%,70%,${0.7*grow})`;c.beginPath();c.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r*0.7,1.5+grow*2,0,7);c.fill()}}
  introRAF=requestAnimationFrame(introFrame)}
// ---------- creation ----------
const FORMS=[['Nimble and clever','small, quick, many-fingered'],['Shelled and strong','plated, many-legged, hard to kill'],['Tide-born','glowing swimmers of the shallows'],['Winged','light gliders with keen eyes']];
const TEMPS=[['gentle','Gentle'],['curious','Curious'],['fierce','Fierce'],['devout','Devout']];
const LANDS=[['coast','By the sea'],['plain','On open plains'],['forest','In deep forest'],['high','Below the mountains']];
let CRE={form:0,temper:'curious',land:'coast',hue:190,rivals:2,size:DEFAULT_WORLD_SIZE},creRAF=0;
function openCreation(){running=false;SAVE.suspended=true;$('#create').hidden=false;CRE.hue=Math.floor(Math.random()*360);
  $('#crForms').innerHTML=FORMS.map((f,i)=>`<button type="button" class="crf" data-crf="${i}" aria-pressed="${i===CRE.form}"><canvas data-crc="${i}"></canvas><b>${f[0]}</b><span>${f[1]}</span></button>`).join('');
  $('#crTemp').innerHTML=TEMPS.map(([k,l])=>`<button type="button" data-crt="${k}" aria-pressed="${k===CRE.temper}">${l}</button>`).join('');
  $('#crLand').innerHTML=LANDS.map(([k,l])=>`<button type="button" data-crl="${k}" aria-pressed="${k===CRE.land}">${l}</button>`).join('');
  $('#crSize').innerHTML=Object.entries(WORLD_SIZES).map(([k,v])=>`<button type="button" data-crs="${k}" aria-pressed="${k===CRE.size}">${v.label}</button>`).join('');$('#crSizeD').textContent=sizeBlurb(CRE.size);
  $('#crHue').value=CRE.hue;cancelAnimationFrame(creRAF);creRAF=requestAnimationFrame(creFrame)}
function sizeBlurb(k){const v=WORLD_SIZES[k];return v?`${v.label}: ${v.blurb}`:''}
function creFrame(now){if($('#create').hidden)return;document.querySelectorAll('#crForms canvas').forEach(c=>{const i=+c.dataset.crc;const g=creatureGenome(i,CRE.temper);g.hue=CRE.hue;portrait(c,g,now/1000+i,{noShadow:true,moving:i===CRE.form})});creRAF=requestAnimationFrame(creFrame)}
$('#create').addEventListener('click',e=>{const f=e.target.closest('[data-crf]'),t=e.target.closest('[data-crt]'),l=e.target.closest('[data-crl]');
  if(f){CRE.form=+f.dataset.crf;document.querySelectorAll('[data-crf]').forEach(x=>x.setAttribute('aria-pressed',x===f))}
  if(t){CRE.temper=t.dataset.crt;document.querySelectorAll('[data-crt]').forEach(x=>x.setAttribute('aria-pressed',x===t))}
  const sz=e.target.closest('[data-crs]');if(sz){CRE.size=sz.dataset.crs;document.querySelectorAll('[data-crs]').forEach(x=>x.setAttribute('aria-pressed',x===sz));$('#crSizeD').textContent=sizeBlurb(CRE.size)}
  const rv=e.target.closest('[data-crr]');if(rv){CRE.rivals=+rv.dataset.crr;document.querySelectorAll('[data-crr]').forEach(x=>x.setAttribute('aria-pressed',x===rv))}
  if(l){CRE.land=l.dataset.crl;document.querySelectorAll('[data-crl]').forEach(x=>x.setAttribute('aria-pressed',x===l))}});
$('#crHue').oninput=e=>{CRE.hue=+e.target.value};
$('#crGo').onclick=()=>{$('#create').hidden=true;cancelAnimationFrame(creRAF);SAVE.suspended=false;newWorld(Math.floor(Math.random()*1e9),null,{...CRE});S.foundMyFaith(S.facs[S.kingdom]);S.setupGods(CRE.rivals||2);renderPeoples(true);setSpeed(1);running=true;$('#play').textContent='Pause';renderHand()};
function beginNewWorld(){if(!$('#worlds').hidden){$('#worlds').hidden=true}let seen=false;try{seen=!!localStorage.getItem('brood_prologue')}catch(e){}if(seen)openCreation();else playPrologue(openCreation)}

// ---------- the hand of the Maker: act on a town or a person ----------
let actMode=false,actOpen=false,actT=null,actWas=true;
function setActMode(on){actMode=on;$('#actBtn').classList.toggle('on',on);$('#actBanner').hidden=!on}
$('#actBtn').onclick=()=>{if(actOpen)return;setActMode(!actMode);if(actMode){running=true;$('#play').textContent='Pause'}};
$('#actCancel').onclick=()=>setActMode(false);
function actTap(sx,sy){const p=s2w(sx,sy);let bs=null,bd=1e9;for(const s of S.setts){const d=Math.hypot(s.x-p.x,s.y-p.y)-S.townRadius(s);if(d<bd){bd=d;bs=s}}if(bs&&bd<40/cam.z+20){setActMode(false);openAct(bs.id);return true}return false}
function openAct(sid){actOpen=true;actWas=running;running=false;actT={s:sid};$('#act').hidden=false;renderAct()}
function closeAct(){actOpen=false;$('#act').hidden=true;running=actWas||running;$('#play').textContent=running?'Pause':'Resume';renderHand()}
$('#act').addEventListener('click',e=>{if(e.target.id==='act'||e.target.closest('#actClose')){closeAct();return}
  const w=e.target.closest('[data-who]');if(w){const v=w.dataset.who;if(v==='town')actT={s:actT.s};else if(v==='crowd'){const c=S.crowdPerson(actT.s);if(c!=null)actT={s:actT.s,c}}else actT={s:actT.s,c:+v};actT.out=null;renderAct();return}
  const a=e.target.closest('[data-act]');if(a&&!a.disabled){const opt=a.dataset.opt||null;const out=S.doAction({s:actT.s,c:actT.c},a.dataset.act,opt);actT.out=out;markDirty();renderAct();return}});
function renderAct(){const I=S.townInfo(actT.s);if(!I){closeAct();return}const f=S.facs[I.fac];const c=actT.c!=null?S.chars[actT.c]:null;if(c&&!c.alive)actT.c=null;
  const acts=S.actionsFor({s:actT.s,c:actT.c});const who=[`<button type="button" data-who="town" aria-pressed="${actT.c==null}">The town itself</button>`].concat(I.people.map(p=>`<button type="button" data-who="${p.c}" aria-pressed="${actT.c===p.c}">${esc(cap(S.cname(S.chars[p.c])))} <small>${esc(p.role)}</small></button>`)).concat([`<button type="button" data-who="crowd" aria-pressed="${!!(c&&c.role==='commoner')}">Someone in the crowd</button>`]);
  const tg=c?`<div class="atgt"><canvas id="actPort"></canvas><div><b>${esc(cap(S.cname(c)))}</b><div class="d">${esc(c.role==='commoner'?'an ordinary '+f.name:c.role)}${S.traitWords(c).length?' · '+esc(S.traitWords(c).join(', ')):''}</div>${c.deeds.length?`<div class="d">${c.deeds.slice(-1)[0].yr}: ${esc(c.deeds.slice(-1)[0].txt)}</div>`:''}</div></div>`:'';
  $('#actCard').innerHTML=`<button type="button" class="btn ghost aclose" id="actClose">Done</button><div class="chk">The hand of the Maker</div><h2 class="cht">${esc(I.name)}</h2>
  <div class="d">A town of the ${esc(f.name)} · ${I.pop} souls · ${I.unrest>0.5?'seething':I.unrest>0.25?'restless':'calm'} · they ${I.knows<0.12?'do not know you exist':'call you <b>'+esc(I.word)+'</b>'} <span class="tierb t${I.tier}">${esc(I.tierWord)}</span></div>
  ${I.faiths.length?`<div class="afaith">${I.faiths.map(x=>`<span class="${x.maker?'mk':''}">${esc(cap(x.title))} ${x.share}%</span>`).join('')}</div>`:''}
  <div class="awho">${who.join('')}</div>${tg}
  ${actT.out?`<p class="chout">${esc(actT.out)}</p>`:''}
  <div class="agrid">${acts.map(a=>a.choices&&a.ok?a.choices.map(([k,l])=>`<button type="button" class="abtn" data-act="${a.id}" data-opt="${k}"><b>${esc(a.label)} ${esc(l)}</b><span>${esc(a.desc)}</span><em class="pw">✦ ${a.cost}</em></button>`).join(''):`<button type="button" class="abtn" data-act="${a.id}"${a.ok?'':' disabled'}><b>${esc(a.label)}</b><span>${esc(a.ok?a.desc:a.why)}</span><em class="pw">✦ ${a.cost}</em></button>`).join('')}</div>
  <div class="chpow">Your power: ✦ ${Math.floor(S.maker.power)} of ${S.maker.maxPower} · it returns faster the more they believe</div>`;
  const pc=$('#actPort');if(pc&&c)portrait(pc,c.g,1,{noShadow:true,crown:c.role==='ruler'})}
// ---------- voices: speak with those who worship you ----------
let voiceC=null,voiceBusy=false,voicesWas=null;
function renderVoices(){const el=$('#p-voices');if(!el)return;if(voiceC!=null&&S.chars[voiceC]&&S.chars[voiceC].alive){renderChat();return}voiceC=null;const L=S.contacts();
  el.innerHTML=`<div class="vhd"><b>Voices</b><span class="d">Only those whose faith is in you can hear you. Time stands still while you speak.</span></div>${L.length?L.map(x=>{const c=S.chars[x.c],f=S.facs[c.fac],F=x.faith!=null?S.faiths[x.faith]:null;return`<button type="button" class="vrow" data-vc="${c.id}"><canvas data-vg="${c.id}"></canvas><div><b>${esc(cap(S.cname(c)))}</b><div class="d">${esc(x.role)} · the ${esc(f.name)}</div>${F?`<div class="d">${esc(cap(F.title))}</div>`:''}${(c.convo||[]).length?`<div class="d">${(c.convo||[]).length} words exchanged</div>`:''}</div></button>`}).join(''):'<p class="d" style="padding:0 16px">No one hears you yet. Answer a prayer, or press <b>Act</b>, choose someone in a town that knows of you, and make them your prophet.</p>'}`;
  el.querySelectorAll('canvas[data-vg]').forEach(cv=>{const c=S.chars[+cv.dataset.vg];portrait(cv,c.g,1,{noShadow:true,crown:c.role==='ruler'})})}
function renderChat(){const el=$('#p-voices');const c=S.chars[voiceC],f=S.facs[c.fac];const b=S.contactBrief(c.id);const cv0=c.convo||[];
  el.innerHTML=`<div class="vchat"><div class="vtop"><button type="button" class="btn ghost" id="vBack">← Voices</button><canvas id="vPort"></canvas><div><b>${esc(cap(b.name))}</b><div class="d">${esc(b.role)} of the ${esc(b.people)} · ${esc(b.faith||'')}</div></div></div>
  <div class="vlog" id="vLog">${cv0.length?'':`<p class="d">${esc(cap(b.name))} kneels and waits. They call you ${esc(b.word)}.</p>`}${cv0.map(m=>`<div class="vm ${m.from==='you'?'you':'them'}"><span class="vy">${m.yr}</span>${esc(m.text)}${m.done&&m.done.length?`<div class="vdone">${m.done.map(esc).join(' ')}</div>`:''}</div>`).join('')}${voiceBusy?'<div class="vm them"><span class="pulse"></span> …</div>':''}</div>
  <form class="vform" id="vForm"><textarea id="vIn" maxlength="500" placeholder="Speak to ${esc(cap(b.name))}…" ${voiceBusy?'disabled':''}></textarea><button type="submit" class="btn primary" ${voiceBusy||S.maker.power<2?'disabled':''}>Speak <em class="pw">✦ 2</em></button></form></div>`;
  const pc=$('#vPort');if(pc)portrait(pc,c.g,1,{noShadow:true,crown:c.role==='ruler'});const lg=$('#vLog');lg.scrollTop=lg.scrollHeight;
  $('#vBack').onclick=()=>{voiceC=null;renderVoices()};$('#vForm').onsubmit=e=>{e.preventDefault();const t=$('#vIn').value.trim();if(t)speakTo(c.id,t)};
  $('#vIn').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#vForm').requestSubmit()}})}
$('#p-voices').addEventListener('click',e=>{const r=e.target.closest('[data-vc]');if(r){voiceC=+r.dataset.vc;renderChat()}});
const TENET_KEYS=()=>Object.keys(S.TENETS).filter(k=>!S.TENETS[k].cult);
function voicePrompt(c,b,text){const hist=(c.convo||[]).slice(-10).map(m=>`${m.from==='you'?'THE MAKER':b.name.toUpperCase()}: ${m.text}`).join('\n');
  return`You are ${b.name}, ${b.isRuler?'the ruler and high priest':b.role} of the ${b.people}, non-human creatures (${b.body}) in an invented world, year ${b.year}. Your people are a ${b.gov.toLowerCase()}${b.ruler&&!b.isRuler?`, ruled by ${b.ruler}`:''}.
You worship the Maker, the immortal who made your kind; your people call the Maker ${b.word}. Among the peoples the Maker is: ${b.standing}${b.wrath>b.kind+0.15?' (known for wrath)':b.kind>b.wrath+0.15?' (known for mercy)':''}.
Your faith: ${b.faith||'unnamed'}. Gods: ${b.gods.join('; ')||b.word}. Commandments: ${b.tenets.join(' ')}. ${b.writings.length?`Recent holy writings: ${b.writings.join(' / ')}`:''}
About ${b.share} in a hundred of your people share your faith.
Your temperament: ${b.traits.join(', ')||'steady'}; devotion ${Math.round(b.piety*100)}/100. Your deeds: ${b.deeds.join('; ')||'none yet'}.
Wars: ${b.wars.join(', ')||'none'}. Neighbours: ${b.neighbours.join('; ')||'none near'}.
Recent events of your people: ${b.recent.join('; ')||'quiet years'}.
HAPPENING RIGHT NOW (live, year ${b.year}): ${liveFor(c.fac).map(x=>x.why).join(' | ')||'nothing urgent'}. Everything above is current.

The Maker is speaking to you directly, in a vision. ${hist?`So far:\n${hist}\n`:''}THE MAKER NOW SAYS: "${text}"

Answer as yourself: 1-4 sentences, reverent but with your own temperament and judgement. You may ask questions, plead for your people, bargain, or refuse a command that goes against your nature or your people. Do not mention simulations, games, or numbers.
Then decide what you will actually DO because of this, as 0-3 actions chosen ONLY from this menu:
- {"type":"values","values":{"martial":0,"faith":0,"art":0,"trade":0,"knowledge":0,"order":0,"harmony":0}} (each between -0.2 and 0.2; how your people change)
- {"type":"war","target":"<exact people name>"}  - {"type":"peace","target":"<exact people name>"}  - {"type":"mission","target":"<exact people name>"}
- {"type":"tenet","tenet":"<one of: ${TENET_KEYS().join(', ')}>"}
- {"type":"scripture","text":"<a short holy verse you write down, in your voice>"}
- {"type":"law","text":"<a short law you proclaim>"}  - {"type":"temple"}  - {"type":"persecute"} (close the temples of other faiths)
${b.isRuler?`- {"type":"gov","gov":"<one of: ${Object.keys(S.GOVS).join(', ')}>"}`:''}
Only act if the conversation calls for it. Reply with JSON only: {"reply":"...","acts":[...]}`}
function fallbackVoice(b,text){const t=text.toLowerCase();const acts=[];const nm=S.alive().map(f=>f.name).find(n=>t.includes(n.toLowerCase()));
  if(/peace|stop|end the war|forgive/.test(t)&&nm)acts.push({type:'peace',target:nm});else if(/war|attack|destroy|conquer|smite/.test(t)&&nm)acts.push({type:'war',target:nm});
  if(/teach|preach|spread|convert/.test(t)&&nm)acts.push({type:'mission',target:nm});if(/temple|build/.test(t))acts.push({type:'temple'});
  if(/kind|love|feed|mercy|gentle/.test(t))acts.push({type:'values',values:{harmony:0.1}});if(/learn|study|know/.test(t))acts.push({type:'values',values:{knowledge:0.1}});if(/write|record|scripture/.test(t))acts.push({type:'scripture',text:text.slice(0,140)});
  return{reply:acts.length?`It will be done, ${b.word}. I will tell them what you have said.`:`I hear you, ${b.word}, though I do not understand all of it. I will pray on your words.`,acts}}
async function speakTo(cid,text){if(voiceBusy||S.maker.power<2)return;const c=S.chars[cid];if(!c)return;S.maker.power-=2;c.convo=c.convo||[];c.convo.push({from:'you',text,yr:Math.floor(S.year)});voiceBusy=true;renderChat();
  const b=S.contactBrief(cid);let res=null;
  if(sampleFn){try{res=await sampleFn.json(voicePrompt(c,b,text),{cache:false})}catch(e){if(e&&['not_granted','capability_disabled','capability_removed'].includes(e.code))sampleFn=null}}
  if(!res||typeof res.reply!=='string')res=fallbackVoice(b,text);
  if(!c.alive){S.maker.power+=2;c.convo.push({from:'them',text:'(no answer: they are gone, and your power returns to you)',yr:Math.floor(S.year),done:[]});voiceBusy=false;markDirty();if(voiceC===cid&&!$('#p-voices').hidden)renderChat();renderHand();return}
  const done=S.applyDecrees(cid,Array.isArray(res.acts)?res.acts:[],text);c.convo.push({from:'them',text:res.reply.slice(0,900),yr:Math.floor(S.year),done});voiceBusy=false;markDirty();if(voiceC===cid&&!$('#p-voices').hidden)renderChat();renderHand()}

// ================= THE GAME LAYER: cards, the prophet's call, the HUD, defeat =================
const YPS=0.4; // years per second at 1x: an age takes roughly 7-10 minutes
// Cards are about LIVE crises: S.cardTrigger(true) scans what is happening now (a siege, a plague, a rising cult, a collapsing faith...)
// and a card fires as the situation starts or escalates. Quiet 'moment' cards fill peaceful stretches.
const CARD_GAP_BIG=10,CARD_GAP_SMALL=16,CARD_GAP_MOMENT=22,EMERG_PER_AGE=5,MOMENTS_PER_AGE=3;
function cardTick(Y){if(saga.cardBusy||saga.choice||saga.ended||S.maker.defeated)return;
  if(saga.nextCard==null)saga.nextCard=saga.ageStart+30+Math.floor(Math.random()*20);
  if(saga.convoAt==null)saga.convoAt=saga.ageStart+80+Math.floor(Math.random()*50);
  // the lead prophet calls, once an age
  if(!saga.convoDone&&Y>=saga.convoAt){saga.convoDone=true;const c=S.leadProphet();if(c){saga.choice={kind:'call',c:c.id,yr:Y};return}}
  const since=Y-(saga.lastCard==null?-99:saga.lastCard);
  // a live crisis: short cooldown, bigger crises may cut in sooner
  if((saga.emergThisAge||0)<EMERG_PER_AGE&&since>=CARD_GAP_BIG){const t=S.cardTrigger(true);if(t&&(t.sev>=3||since>=CARD_GAP_SMALL)){requestCard(t);return}}
  // a quiet-time dilemma, only when nothing is burning
  if(Y>=saga.nextCard&&(saga.cardsThisAge||0)<MOMENTS_PER_AGE&&since>=CARD_GAP_MOMENT){saga.nextCard=Y+34+Math.floor(Math.random()*26);const t=S.cardTrigger(false);if(t)requestCard(t)}}
// the small 'the Maker listens...' marker shown while the world waits for a card to be written
function setListening(on){let el=document.getElementById('listen');if(!el){el=document.createElement('div');el.id='listen';el.setAttribute('role','status');el.hidden=true;el.innerHTML='<span class="pulse"></span> The Maker listens\u2026 time waits';document.body.appendChild(el)}el.hidden=!on}
const FX_DOC=`food {people, amount -1..1}; unrest {people, amount -1..1}; values {people, values:{martial,faith,art,trade,knowledge,order,harmony each -0.25..0.25}}; ruler {people, traits:{ambition,cruelty,honor,piety,greed,paranoia,warmth,genius each -0.5..0.5}}; kill_ruler {people}; depose {people}; war {people, target}; peace {people, target}; ally {people, target}; bless_army {people}; champion {people}; tech {people}; faith {people, amount -0.4..0.4}; mission {people, target}; cult {people, action:"crush"|"expose"|"merge"}; prophet {people}; heal {people}; plague {people}; golden {people}; grow {people, amount 0..1}; migrate {people}; persecute {people}; gov {people, gov}; greatness {amount -15..15}; mercy {amount -15..15}`;
const ERA_DILEMMAS={
 'Stone Age':['who keeps the fire','the first burial: burn, bury or eat the dead','a beast that could be tamed or worshipped','a chief who wants to be a god','twins born: one must be given to the forest','the first murder','a stranger band at the river','a rival tribe\'s stolen children'],
 'Bronze Age':['the first slaves','a wall around the city','a king and a priest who both claim to speak for you','tin from enemies','human sacrifice for the harvest','the first written law','a flood and who rebuilds','a palace or a granary'],
 'Iron Age':['iron swords for all, or only for the nobles','conquered peoples: chains, citizenship or death','a hero who wants to be a god','a city that worships the wrong face of you','a marriage that would unite two crowns'],
 'Classical Age':['philosophers who say you do not exist','an empire or a league of cities','gladiators and festivals','a mad emperor','the great library','citizenship for slaves','a republic or a dictator in a crisis'],
 'Gunpowder Age':['an inquisition','a printing press spreading heresy','cannons against city walls','a crusade to a holy city','plague doctors and quarantine','colonies across the sea','a schism over a single word of scripture'],
 'Industrial Age':['factories and child labour','a workers\' revolution','railways through holy ground','nationalism or faith','a famine while grain is exported','the first great machines of war'],
 'Electric Age':['mass newspapers and propaganda','universal suffrage','a dictator promising order','radio prophets','total war'],
 'Atomic Age':['scientists who can split the atom','a bomb to end the war','fallout over the faithful','an arms race with a rival god\'s people','a surveillance state'],
 'Machine Age':['thinking machines that answer prayers','a machine that claims to be you','perfect surveillance','automation and idle masses','an engineered plague'],
 'Age of Engineering':['remaking their own bodies','uplifting animals into people','immortality for the faithful, rivalling yours','leaving the world','terraforming the sky'],
};
const DILEMMAS=['a heretic or holy fool must be judged','a ruler wants to be worshipped as divine','two heirs feud','a town wants to break away and found its own sect','who eats in a famine','an alliance or marriage with a people who serve a rival god','a holy war the people want but may not win','a wonder that would bankrupt the people','the people want a sign or a sacrifice','refugees ask to settle','a prophet claims to speak for you','slaves or captives: free them, keep them, or make them convert','a conquered city: sack it, spare it, or convert it','a doctrine that would change your faith forever'];
function cardPrompt(b){const recentT=(saga.cardTitles||[]).slice(-8);const era=(b.peoples[0]||{}).era||'Stone Age';const eraD=ERA_DILEMMAS[era]||ERA_DILEMMAS['Stone Age'];const docs=(S.maker.docs||[]);
  return`You write the decision cards of a hard god game, in the spirit of Reigns, Crusader Kings and Frostpunk. The player is an immortal Maker; the creatures below are THEIR people, who worship them. Rival immortals and their peoples compete for the world. The player only touches the world through their own believers.

THE WORLD NOW (facts from the simulation):
${JSON.stringify(b)}

THE AGE: ${S.world.age?S.world.age.name+': '+S.world.age.text:'the dawn of the world'}. Era of the Maker's people: ${era}.
THE WORLD'S DANGERS: ${(()=>{const d=S.doomInfo();return[d.ai>0?`machines in the land of the ${d.aiWho} are ${d.ai}% of the way to a mind greater than the Maker's (if it wakes, the Maker is finished)`:'',d.carbon>4?`the climate is changing (${d.carbon})`:'',d.fallout?`${d.fallout} cities have burned in nuclear fire`:'',S.gods.filter(g=>g.key.startsWith('undying')&&g.alive).map(g=>g.name+' has become immortal').join(', ')].filter(Boolean).join('; ')||'none yet'})()}
YOUR FAITH'S DOCTRINES: ${docs.map(D=>D.name+' ('+S.docText(D)+')').join('; ')||'none yet'}.
WHY THIS CARD (LIVE: this is happening in year ${b.year} and is unresolved, it is not history): ${b.trigger?b.trigger.why:'a quiet moment'}
${b.trigger&&b.trigger.expires?`The matter will not wait past year ${b.trigger.expires}.`:''}
OTHER LIVE SITUATIONS: ${(b.live||[]).join(' | ')||'none'}
FRESHNESS RULES: the premise above is true right now and the people in it are alive. The card must open by stating that premise. Every option must act on it while it is still undecided, so never write it as already over, and never mention a people or person who is not listed in the facts above. Use ONLY these peoples by exact name: ${(()=>{const n=new Set();for(const p of b.peoples){n.add(p.name);(p.wars||[]).concat(p.allies||[]).forEach(x=>n.add(x))}(b.neighbours||[]).forEach(x=>{const m=/^the ([^:]+):/.exec(x);if(m)n.add(m[1])});if(b.trigger&&b.trigger.enemy)n.add(b.trigger.enemy);return[...n].join(', ')})()}.
${b.danger?`THE MAKER IS IN DANGER: ${b.danger}`:''}
Recent card titles (do NOT repeat their topic or shape): ${recentT.join(' | ')||'none'}
Dilemmas that fit this era (use one, combine two, or invent a better one that fits the facts): ${eraD.join('; ')}; and always possible: ${DILEMMAS.join('; ')}.

Write ONE decision card about this moment, specific to these names and facts. Make it feel like this world and this moment could only produce this card.
THIS GAME IS HARD. Every option is available, and every option hurts:
- No option is simply good. Each gives something and takes something: believers, a town, a ruler, food, peace, faith, lives, the people's love. Sometimes every option is terrible and the player must choose the least terrible.
- Show the cost in the effects: at least one effect in EVERY option must hurt.
- One option leans GREATNESS (might, fear, glory), one leans MERCY (gentleness, forgiveness, restraint), and one is a strange third path (lean "none") that branches somewhere unexpected: a doctrine, an exile, a sacrifice, a new government, a betrayal.
- "weight" (0-30) is how hard the choice swings the Maker's Greatness and Mercy. Make bigger choices heavier.
- About one card in four should offer, as one option, a lasting DOCTRINE that you invent for this faith from these facts: {"fx":"doctrine","name":"The ...","text":"what the faithful now believe, one sentence","levers":{...}} where levers are 1-3 of: missionMult 0.5-2.5, cultMult 0.4-3, soldierMult 0.7-1.6, doubtMult 0.4-2, techMult 0.5-2.5, sectMult 0.3-4, gDrift -0.2..0.2, mDrift -0.2..0.2, zealAt 55-95, noWar 1, purge 1, colonize 1, sacrifice 1, theocracy 1, capUnrest 0-0.03. Every doctrine must have a real upside AND a real downside. Ground it in this people's life: no magic.
- Outcomes should sometimes twist: a mercy that is exploited, a victory that costs the heir, a sacrifice that is not enough.
Each choice applies 1-3 effects from this exact menu (use the exact people names given; "people" must be one of the Maker's peoples; "target" any people named in the facts):
${FX_DOC}; weapon {people, kind:"gunpowder"|"fission"|"bioweapons"|"genetics"|"surveillance"|"computing"}; forbid {people, kind}; secede {people}; sacrifice {people, amount 0.05..0.3}; doctrine {key}; enslave {people, target}; raid {people, target}
Governments: ${Object.keys(S.GOVS).join(', ')}.

Reply with JSON only:
{"title":"3-6 words","scene":"2-3 vivid sentences, present tense, naming who and where","speaker":"who is asking, or null","options":[{"label":"imperative, under 9 words","hint":"what it costs and gains, under 12 words","lean":"greatness"|"mercy"|"none","weight":0-30,"outcome":"2 sentences: what actually happens, including the price paid","effects":[{"fx":"...", ...}]}]}`}
function validCard(j,b){if(!j||typeof j!=='object'||!Array.isArray(j.options))return null;const keys=new Set(S.FX_KEYS);
  const reach=new Set(S.reach().map(f=>f.name.toLowerCase())),live=new Set(S.alive().map(f=>f.name.toLowerCase()));const nm=n=>String(n).toLowerCase().replace(/^the /,'');
  const dflt=b&&b.trigger&&b.trigger.people;
  // an effect must name peoples that exist right now; anything else is dropped here, so no card can speak of the dead
  const okFx=e=>{if(!e||!keys.has(e.fx))return false;if(['greatness','mercy','doctrine'].includes(e.fx))return true;if(e.people==null&&dflt)e.people=dflt;if(e.people!=null&&!reach.has(nm(e.people)))return false;if(e.target!=null&&!live.has(nm(e.target)))return false;return true};
  const opts=j.options.slice(0,3).map((o,i)=>({id:'o'+i,label:String(o.label||'Do nothing').slice(0,80),hint:String(o.hint||'').slice(0,110),lean:['greatness','mercy'].includes(o.lean)?o.lean:'none',cost:Math.round(clamp(+(o.weight!=null?o.weight:o.cost)||0,0,30)),outcome:String(o.outcome||'').slice(0,400),effects:(Array.isArray(o.effects)?o.effects:[]).filter(okFx).slice(0,3)})).filter(o=>o.label);
  if(opts.length<2||!opts.some(o=>o.effects.some(e=>!['greatness','mercy'].includes(e.fx))))return null;
  return{title:String(j.title||'A Moment').slice(0,70),scene:String(j.scene||'').slice(0,600),speaker:j.speaker?String(j.speaker).slice(0,80):null,opts}}
// Writing a card pauses the world (saga.cardBusy stops the sim loop; `running` is untouched, so a player who had paused stays paused).
// When the card is ready it is checked against the world AS IT IS NOW; a stale card is regenerated once, else dropped with a message.
async function requestCard(t,regen){if(!t)return;const mine=saga;mine.cardBusy=true;setListening(true);S.markCard(t);mine.cardTitles=mine.cardTitles||[];mine.lastCard=Math.floor(S.year);
  if(!regen){if(t.kind==='emergency')mine.emergThisAge=(mine.emergThisAge||0)+1;else mine.cardsThisAge=(mine.cardsThisAge||0)+1}
  let card=null;
  try{const b=S.godBrief(t);b.danger=S.dangerText();
    if(sampleFn){let timer;try{const p=sampleFn.json(cardPrompt(b),{cache:false});const to=new Promise(r=>{timer=setTimeout(()=>r(null),20000)});card=validCard(await Promise.race([p,to]),b)}catch(e){if(e&&['not_granted','capability_disabled','capability_removed'].includes(e.code))sampleFn=null}finally{clearTimeout(timer)}}
    if(!card&&saga===mine)card=fallbackCard(t,S.godBrief(t))}
  catch(err){console.warn('card',err)}
  finally{if(saga===mine){mine.cardBusy=false;setListening(false)}}
  if(saga!==mine||S.maker.defeated)return; // the world was replaced or lost while we waited
  if(!card){dropCard(t,{msg:'The moment slipped away.'});return}
  const chk=S.checkCard(t,card);if(!chk.ok){reissueCard(t,chk,regen);return}
  mine.cardTitles.push(card.title);if(mine.cardTitles.length>10)mine.cardTitles.shift();
  saga.choice={kind:'gen',card,trigger:t,yr:Math.floor(S.year),regen:!!regen}}
// a card whose premise or people changed while it was being written or waiting: write it again once from fresh facts, or let it go
function reissueCard(t,chk,wasRegen){if(wasRegen){dropCard(t,chk);return}
  const t2=chk.stale==='target'&&t.why?S.freshTrigger(t):S.cardTrigger(true);
  if(t2){requestCard(t2,true);return}
  dropCard(t,chk)}
function dropCard(t,chk){const f=S.reach()[0];const p=f?(S.capitalOf(f)||f.origin):{x:S.W/2,y:S.H/2};
  S.log('cardvoid',1,'The Moment Passes',`${chk.msg||'The moment has passed.'} The Maker was about to be asked, but the matter is settled now. Nothing was asked of you, and nothing was spent.`,p.x,p.y,f?[f]:[],{maker:true,why:['A decision that would have come too late was set aside.']});
  // the card never reached the player: give back its slot
  if(t&&t.kind==='emergency')saga.emergThisAge=Math.max(0,(saga.emergThisAge||0)-1);else saga.cardsThisAge=Math.max(0,(saga.cardsThisAge||0)-1);
  if(t&&t.grp)S.unmarkCard(t);markDirty()}
// cards written without Claude, from the same effect menu
function fallbackCard(t,b){const P=b.peoples.find(p=>t&&p.name===t.people)||b.peoples[0]||{name:'',wars:[]};const pn=P.name;const why=(t&&t.why)||'';const W=(t&&t.enemy&&P.wars.includes(t.enemy)?t.enemy:null)||P.wars[0];const nb=(b.neighbours[0]||'').replace(/^the ([^:]+):.*/,'$1');const o=(label,hint,lean,cost,outcome,effects)=>({label,hint,lean,cost,outcome,effects:effects.concat(lean==='greatness'?[{fx:'unrest',people:pn,amount:0.25}]:lean==='mercy'?[{fx:'faith',people:pn,amount:-0.06}]:[{fx:'faith',people:pn,amount:-0.1}])});let title,scene,opts;
  const has=re=>re.test(why);
  if(has(/war|march|conquer|razed|capital|attack/i)&&W){title=`War with the ${W}`;scene=`${why} The people of the ${pn} look to the sky before the armies meet.`;opts=[o('Fill their soldiers with your fury','Victory through terror','greatness',15,`The army of the ${pn} fought as if possessed.`,[{fx:'bless_army',people:pn}]),o('Raise a champion among them','One hero, remembered forever','greatness',8,`A champion stepped out of the ranks of the ${pn}.`,[{fx:'champion',people:pn}]),o('Command them to make peace','Mercy, and a bitter truce','mercy',4,`The ${pn} laid down their spears.`,[{fx:'peace',people:pn,target:W}])]}
  else if(has(/plague|sickness/i)){title='The Sickness';scene=`${why} The priests of the ${pn} burn incense day and night.`;opts=[o('Heal them all','Mercy, at a price','mercy',14,`The fevers broke on the same night across the land of the ${pn}.`,[{fx:'heal',people:pn}]),o('Spare only the faithful','Faith becomes life or death','greatness',6,`The sickness passed over every house with a prayer on its door.`,[{fx:'faith',people:pn,amount:0.2}]),o('Let it run its course','They endure alone','none',0,`The plague burned itself out.`,[{fx:'faith',people:pn,amount:-0.05}])]}
  else if(has(/cult|preach|crown/i)){title='A False Voice';scene=`${why} Your priests demand that you act.`;opts=[o('Crush the cult','Fear keeps them faithful','greatness',10,`The cult's halls were burned and its leader killed.`,[{fx:'cult',people:pn,action:'crush'},{fx:'unrest',people:pn,amount:0.2}]),o('Fold them into your faith','Forgiveness, and a stranger creed','mercy',8,`The cult's followers were welcomed back into your temples.`,[{fx:'cult',people:pn,action:'merge'}]),o('Let the truth expose them','Cheap, and slow','none',4,`The preacher's lies came out one by one.`,[{fx:'cult',people:pn,action:'expose'}])]}
  else if(has(/missionar|whisper|strangers|rival|another immortal|turn to/i)){title='Other Gods at the Door';scene=`${why} Your faithful ask whether they are still yours.`;opts=[o('Tear down the foreign temples','Fear, and resentment','greatness',8,`The foreign shrines among the ${pn} were smashed.`,[{fx:'persecute',people:pn},{fx:'faith',people:pn,amount:0.1}]),o('Answer with kindness','Win them back gently','mercy',6,`Your priests fed the doubters, and many came home.`,[{fx:'faith',people:pn,amount:0.18},{fx:'food',people:pn,amount:0.3}])].concat(nb?[o(`Send missionaries to the ${nb}`,'Take the fight to them','none',10,`Your preachers crossed the border.`,[{fx:'mission',people:pn,target:nb}])]:[])}
  else if(has(/famine|hunger|rain/i)){title='Empty Granaries';scene=`${why} Children of the ${pn} dig for roots.`;opts=[o('Send rain and harvest','They will eat','mercy',10,`The rains came, and the fields overflowed.`,[{fx:'food',people:pn,amount:1}]),o('Teach them to take what they need','Raids on their neighbours','greatness',4,`The ${pn} learned to take from others.`,[{fx:'values',people:pn,values:{martial:0.15}},{fx:'food',people:pn,amount:0.3}]),o('Let the weak perish','Hard, and free','none',0,`The old and weak died.`,[])]}
  else if(Math.random()<0.5&&P.ruler){title=`The Ambition of ${P.ruler.name}`;scene=`${why} ${P.ruler.name}, who rules the ${pn}, burns offerings and asks for your favour.`;opts=[o(`Make ${P.ruler.name} mighty`,'A strong hand, a hard heart','greatness',12,`${P.ruler.name} grew bold, and the generals followed.`,[{fx:'ruler',people:pn,traits:{ambition:0.3,cruelty:0.15}},{fx:'bless_army',people:pn}]),o(`Teach ${P.ruler.name} humility`,'A gentler reign','mercy',6,`${P.ruler.name} woke from a dream and freed the prisoners.`,[{fx:'ruler',people:pn,traits:{warmth:0.35,cruelty:-0.3}},{fx:'unrest',people:pn,amount:-0.4}]),o('Raise a prophet to watch them','A holy voice beside the throne','none',12,`A prophet came to court and would not leave.`,[{fx:'prophet',people:pn}])]}
  else{title=`The ${pn} Wait for a Sign`;scene=`${why} The ${pn} number ${P.pop}, and their priests wonder what you want of them next.`;opts=[o('Grant them a golden age','Art, peace, plenty','mercy',14,`Music and colour filled the towns of the ${pn}.`,[{fx:'golden',people:pn}]),o('Give their scholars a revelation','Knowledge as power','greatness',10,`A scholar woke with a new idea whole.`,[{fx:'tech',people:pn}])].concat(nb?[o(`Send them to convert the ${nb}`,'Grow your faith','none',8,`Preachers of the ${pn} crossed the border.`,[{fx:'mission',people:pn,target:nb}])]:[o('Bless their families','More children','mercy',6,`A season of births.`,[{fx:'grow',people:pn,amount:0.5}])])}
  if(Math.random()<0.3){const NM=['Covenant','Teaching','Law','Vow','Rite','Discipline','Creed','Way'];const OF=['the Open Gate','Salt and Iron','the Empty Bowl','the Long Walk','the Closed Door','the Burning Book','the Shared Bread','the Silent Bell','Many Hands','the Single Flame'];const name=`The ${NM[Math.floor(Math.random()*NM.length)]} of ${OF[Math.floor(Math.random()*OF.length)]}`;opts[opts.length-1]=o(`Make it law: ${name}`,'A lasting change to your faith, for better and worse','none',12,`Your priests proclaim ${name}. Nothing will be quite the same.`,[{fx:'doctrine',name}])}
  return{title,scene,speaker:null,opts:opts.map((x,i)=>({...x,id:'o'+i}))}}
// ---------- showing a card ----------
const LEAN={greatness:['☀','Greatness'],mercy:['❦','Mercy'],none:['',''] };
function openGameCard(ch){choiceOpen=true;const box=$('#choice');box.hidden=false;const c=ch.card;const pw=S.maker.power;const emer=ch.trigger&&ch.trigger.kind==='emergency';
  $('#chCard').innerHTML=`<div class="chk">${emer?'Your people are in danger':'A moment of your people'} · year ${ch.yr}</div>${ch.trigger&&ch.trigger.why?`<div class="chprem">${tagNames(esc(ch.trigger.why.replace(/^\d+: /,'')))}${ch.trigger.deadline!=null?` <i>It will not wait past year ${ch.trigger.deadline}.</i>`:''}</div>`:''}<h2 class="cht">${esc(c.title)}</h2>${c.speaker?`<div class="chsp">${esc(c.speaker)}</div>`:''}
  <p class="chb">${tagNames(esc(c.scene))}</p><div class="cho">${c.opts.map(o=>{const no=false;return`<button type="button" class="chbtn lean-${o.lean}" data-cho="${o.id}"${no?' disabled':''}><b>${tagNames(esc(o.label))}</b><span>${tagNames(esc(no?'Not enough power':o.hint))}</span>${deltaChips(o)}</button>`}).join('')}</div><div class="chpow">☀ Greatness ${Math.round(S.maker.greatness)} · ❦ Mercy ${Math.round(S.maker.mercy)} · other consequences are hidden until you choose</div>`;
  const first=box.querySelector('.chbtn:not([disabled])');if(first)first.focus({preventScroll:true});
  box.onclick=e=>{const b=e.target.closest('[data-cho]');if(!b||b.disabled)return;box.querySelectorAll('.chbtn').forEach(x=>x.disabled=true);const o=c.opts.find(x=>x.id===b.dataset.cho);const ap=applyGameChoice(ch,o);const res=ap.res;
    $('#chCard').querySelector('.cho').outerHTML=`<p class="chout">${tagNames(esc(ap.outcome))}</p>${res.length?`<ul class="chfx">${res.map(r=>`<li>${tagNames(esc(r))}</li>`).join('')}</ul>`:''}<div class="chrow"><button type="button" class="btn primary" id="chGo">Continue</button></div>`;$('#chGo').focus({preventScroll:true});$('#chGo').onclick=()=>finishChoice(ch);renderHand();markDirty()}}
function applyGameChoice(ch,o){const M=S.maker;const low=o.label.charAt(0).toLowerCase()+o.label.slice(1);const mine0=S.reach();const f0=mine0[0];const p0=f0?(S.capitalOf(f0)||f0.origin):{x:S.W/2,y:S.H/2};
  // 1. the world may have moved since the card was shown: if the premise is gone, nothing is applied and nothing is spent
  const chk=S.checkCard(ch.trigger,ch.card,o);
  const voided=(msg,res)=>{S.log('cardvoid',1,'Your Word Comes Too Late',`${ch.card.title}: ${msg} You chose to ${low}, but it changes nothing, and it costs you nothing.`,p0.x,p0.y,f0?[f0]:[],{maker:true,why:[`Because you chose to ${low}, but the matter was already settled.`]});return{res:res||[msg],outcome:msg,voided:true}};
  if(!chk.ok&&chk.stale!=='target')return voided(chk.msg||'The moment has passed.');
  // 2. apply the effects: each one lands on a people that still exists, is logged as caused by this choice, and is followed up later
  const ctx={cause:`chose to ${low}`,premise:ch.trigger?ch.trigger.why.replace(/^\d+: /,''):'',prem:ch.trigger?ch.trigger.prem:null,label:o.label};
  const res=S.applyFx(o.effects,ctx);
  const needsPeople=o.effects.some(x=>x&&!['greatness','mercy','doctrine'].includes(x.fx));
  // every effect that needed a people failed (it died, or the world changed): report it and do not charge the Maker
  if(needsPeople&&!ctx.okCount&&!o.effects.some(x=>x&&['greatness','mercy','doctrine'].includes(x.fx)))return voided(res[0]||chk.msg||'The moment has passed.',res);
  const g0=M.greatness,m0=M.mercy;S.applyLean(o.lean,o.cost);
  const dg=Math.round(M.greatness-g0),dm=Math.round(M.mercy-m0);if(dg)res.push(`${dg>0?'+':''}${dg} Greatness`);if(dm)res.push(`${dm>0?'+':''}${dm} Mercy`);
  M.count++;M.deeds.push({yr:Math.floor(S.year),title:ch.card.title,choice:o.label,out:o.outcome});
  S.log('choice',3,ch.card.title,`${ch.card.scene} You chose: ${low}. ${o.outcome}`,p0.x,p0.y,mine0.slice(0,2),{why:[`Because you chose to ${low}.`].concat(ctx.premise?[`The trouble was: ${ctx.premise}`]:[]),maker:true,choice:o.label});
  return{res,outcome:o.outcome||'It is done.',voided:false}}
// ---------- the lead prophet calls ----------
function openProphetCall(ch){const c=S.chars[ch.c];if(!c||!c.alive){finishChoice(ch);return}choiceOpen=true;const f=S.facs[c.fac];const box=$('#choice');box.hidden=false;const pw=S.maker.power;const T=S.cardTrigger(true)||{why:''};
  const plea=T.why?`${T.why.replace(/^\d+: /,'')} `:'';
  $('#chCard').innerHTML=`<div class="chk">Your prophet calls · year ${ch.yr}</div><h2 class="cht">${esc(cap(S.cname(c)))} Calls to You</h2><div class="chp"><figure><canvas id="callPort"></canvas><figcaption>${esc(cap(S.cname(c)))}<small>${esc(c.role==='ruler'?S.rulerTitle(f)+' and high priest':'prophet')} of the ${esc(f.name)}</small></figcaption></figure></div>
  <p class="chb">In the high temple of ${esc((S.capitalOf(f)||f.origin).name)}, ${esc(cap(S.cname(c)))} kneels alone and speaks into the dark. "${esc(S.makerWord(f))}, ${plea?esc(plea.slice(0,220)):'your people are waiting.'} Tell me what you want of us."</p>
  <div class="cho"><button type="button" class="chbtn lean-none" data-call="speak"><b>Answer them</b><span>Speak directly, up to five times. Whatever you command, they will try to do, and you will own what follows.</span></button>
  <button type="button" class="chbtn lean-greatness" data-call="sign"><b>Send a sign</b><span><i class="lean">☀ Greatness</i> Awe and a little faith, but no instructions</span></button>
  <button type="button" class="chbtn lean-none" data-call="silent"><b>Stay silent</b><span>They will wonder if you are listening</span></button></div>`;
  const cp=$('#callPort');if(cp)portrait(cp,c.g,1,{noShadow:true,crown:c.role==='ruler'});
  box.onclick=e=>{const b=e.target.closest('[data-call]');if(!b||b.disabled)return;const k=b.dataset.call;const M=S.maker;
    if(k==='speak'){finishChoice(ch);c.visN=0;openVision(c.id);return}
    if(k==='sign'){S.nudgeMeters(6,-3);S.applyFx([{fx:'faith',people:f.name,amount:0.08}],{cause:`sent a sign to ${cap(S.cname(c))}`});M.deeds.push({yr:Math.floor(S.year),title:`${cap(S.cname(c))} called`,choice:'a sign',out:'Lights over the temple.'});S.log('choice',2,`A Sign for ${cap(S.cname(c))}`,`${cap(S.cname(c))} called to the Maker, and the sky over the temple burned with light. The faithful took it as an answer.`,(S.capitalOf(f)||f.origin).x,(S.capitalOf(f)||f.origin).y,[f],{maker:true})}
    else{S.nudgeMeters(-2,-1);S.applyFx([{fx:'faith',people:f.name,amount:-0.04}],{cause:`stayed silent when ${cap(S.cname(c))} called`});S.log('choice',1,`Silence for ${cap(S.cname(c))}`,`${cap(S.cname(c))} called to the Maker and heard nothing. Some began to doubt.`,(S.capitalOf(f)||f.origin).x,(S.capitalOf(f)||f.origin).y,[f],{maker:true})}
    finishChoice(ch);renderHand();markDirty()}}
// ---------- the vision: a conversation that steers a nation ----------
let visC=null,visBusy=false;
function openVision(cid){visC=cid;choiceOpen=true;$('#vision').hidden=false;renderVision()}
function closeVision(){$('#vision').hidden=true;choiceOpen=false;visC=null;renderHand();markDirty()}
$('#vision').addEventListener('click',e=>{if(e.target.closest('#visEnd'))closeVision()});
function renderVision(){const c=S.chars[visC];if(!c){closeVision();return}const f=S.facs[c.fac];const log0=c.convo||[];const pw=S.maker.power;
  $('#visCard').innerHTML=`<div class="vtop2"><canvas id="visPort"></canvas><div><div class="chk">A vision</div><b class="cht" style="font-size:24px">${esc(cap(S.cname(c)))}</b><div class="d">${esc(c.role==='ruler'?S.rulerTitle(f)+' and high priest':'prophet')} of the ${esc(f.name)} · they call you ${esc(S.makerWord(f))}</div></div><button type="button" class="btn ghost" id="visEnd">End the vision</button></div>
  <div class="vlog" id="visLog">${log0.length?'':`<p class="d">Whatever you tell ${esc(cap(S.cname(c)))}, they will carry to the ${esc(f.name)} as your word: war, peace, new laws, a new faith for their neighbours. Speak plainly.</p>`}${log0.map(m=>`<div class="vm ${m.from==='you'?'you':'them'}"><span class="vy">${m.yr}</span>${esc(m.text)}${m.done&&m.done.length?`<div class="vdone">${m.done.map(x=>'✦ '+esc(x)).join('<br>')}</div>`:''}</div>`).join('')}${visBusy?'<div class="vm them"><span class="pulse"></span> …</div>':''}</div>
  <form class="vform" id="visForm"><textarea id="visIn" maxlength="500" placeholder="${(c.visN||0)>=5?'The vision is fading.':'Speak to '+esc(cap(S.cname(c)))+'…'}" ${visBusy||(c.visN||0)>=5?'disabled':''}></textarea><button type="submit" class="btn primary" ${visBusy||(c.visN||0)>=5?'disabled':''}>Speak</button></form><div class="chpow">${5-(c.visN||0)} words left before the vision fades</div>`;
  const pc=$('#visPort');if(pc)portrait(pc,c.g,1,{noShadow:true,crown:c.role==='ruler'});const lg=$('#visLog');lg.scrollTop=lg.scrollHeight;
  $('#visForm').onsubmit=e=>{e.preventDefault();const t=$('#visIn').value.trim();if(t)visionSpeak(c.id,t)};$('#visIn').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#visForm').requestSubmit()}});if(!visBusy&&pw>=10)$('#visIn').focus({preventScroll:true})}
function liveFor(fid){const f=S.facs[fid];if(!f)return[];return S.liveSituations().filter(x=>x.people===f.name||x.enemy===f.name).sort((a,b)=>b.sev-a.sev).slice(0,3)}
const HUMAN_FX=['war','peace','ally','mission','persecute','gov','migrate','values','ruler','depose','cult','faith','champion','bless_army'];
function visionPrompt(c,b,text,hist){return`You are ${b.name}, ${b.isRuler?'ruler and high priest':'prophet'} of the ${b.people} (${b.body}), year ${b.year}, in an invented world. You worship the Maker, the immortal who made your kind, whom your people call ${b.word}. The Maker is known as: ${b.standing}. The Maker is speaking to you in a vision, which is rare and overwhelming.
Your faith: ${b.faith}. Commandments: ${b.tenets.join(' ')}. Your temperament: ${b.traits.join(', ')||'steady'}; devotion ${Math.round(b.piety*100)}/100. Your people: ${b.gov}${b.ruler&&!b.isRuler?`, ruled by ${b.ruler}`:''}. Wars: ${b.wars.join(', ')||'none'}. Neighbours: ${b.neighbours.join('; ')||'none near'}. Recent: ${b.recent.join('; ')||'quiet years'}.
HAPPENING RIGHT NOW (live, year ${b.year}; the Maker may be answering exactly this): ${liveFor(c.fac).map(x=>x.why).join(' | ')||'nothing urgent'}. Everything above is current: do not treat any of it as past.
${hist?`The vision so far:\n${hist}\n`:''}THE MAKER SAYS: "${text}"

Answer as yourself in 1-4 sentences: awed, devoted, but with your own judgement. You may ask for clarity, plead for your people, or warn of a cost, but you are the Maker's voice and you will carry out clear commands. Never mention games or numbers.
Then list what your people will now ACTUALLY DO because of the Maker's words: 0-4 actions from this menu (people = "${b.people}"; target = an exact people name from the neighbours or wars):
${FX_DOC.split('; ').filter(x=>HUMAN_FX.includes(x.split(' ')[0])).join('; ')}
Make the actions match the Maker's words strongly: a command to make war is a war; a call for gentleness changes their values; a command to spread the faith is a mission.
Reply with JSON only: {"reply":"...","acts":[{"fx":"...", ...}],"tone":"mighty"|"gentle"|"neutral"}`}
function fallbackVision(b,text){const t=text.toLowerCase();const acts=[];const nm=S.alive().map(f=>f.name).find(n=>t.includes(n.toLowerCase()));
  if(/peace|stop|forgive|end the war/.test(t)&&nm)acts.push({fx:'peace',target:nm});else if(/war|attack|destroy|conquer|smite|march/.test(t)&&nm)acts.push({fx:'war',target:nm});
  if(/convert|preach|spread|teach/.test(t)&&nm)acts.push({fx:'mission',target:nm});if(/kind|love|feed|mercy|gentle/.test(t))acts.push({fx:'values',values:{harmony:0.15}});if(/strong|fight|army|soldier/.test(t))acts.push({fx:'bless_army'});if(/heretic|false|burn|temple/.test(t))acts.push({fx:'persecute'});if(/settle|new land|expand/.test(t))acts.push({fx:'migrate'});
  return{reply:acts.length?`It will be done, ${b.word}. I will tell them your words tonight.`:`I hear you, ${b.word}. I do not understand all of it, but I will pray on it.`,acts,tone:/war|smite|burn|destroy/.test(t)?'mighty':/kind|love|mercy|peace/.test(t)?'gentle':'neutral'}}
async function visionSpeak(cid,text){const c=S.chars[cid];if(visBusy||(c.visN||0)>=5)return;c.visN=(c.visN||0)+1;c.convo=c.convo||[];const hist=c.convo.slice(-8).map(m=>`${m.from==='you'?'THE MAKER':'YOU'}: ${m.text}`).join('\n');c.convo.push({from:'you',text,yr:Math.floor(S.year)});visBusy=true;renderVision();
  const b=S.contactBrief(cid);let res=null;if(sampleFn){try{res=await sampleFn.json(visionPrompt(c,b,text,hist),{cache:false})}catch(e){if(e&&['not_granted','capability_disabled','capability_removed'].includes(e.code))sampleFn=null}}
  if(!res||typeof res.reply!=='string')res=fallbackVision(b,text);const acts=(Array.isArray(res.acts)?res.acts:[]).filter(x=>x&&HUMAN_FX.includes(x.fx));
  const lv=liveFor(c.fac)[0];if(!c.alive){c.convo.push({from:'them',text:'(no answer: the voice has fallen silent)',yr:Math.floor(S.year),done:[]});visBusy=false;if(visC===cid)renderVision();return}
  const done=S.prophetDecrees(cid,acts,lv?{text:lv.why,prem:lv.prem}:null);if(res.tone==='mighty')S.nudgeMeters(5,-4);else if(res.tone==='gentle')S.nudgeMeters(-4,5);
  c.convo.push({from:'them',text:String(res.reply).slice(0,900),yr:Math.floor(S.year),done});const f=S.facs[c.fac];const at0=S.capitalOf(f)||f.origin;
  S.log('decree',done.length?3:1,`${cap(S.cname(c))} Speaks for the Maker`,`${cap(S.cname(c))} tells the ${f.name} that the Maker has spoken: "${text.slice(0,180)}"${done.length?' '+done.join(' '):''}`,at0.x,at0.y,[f],{char:c.id,maker:true,why:[`Because you spoke to ${cap(S.cname(c))}.`]});
  S.maker.deeds.push({yr:Math.floor(S.year),title:`A vision for ${cap(S.cname(c))}`,choice:`said: "${text.slice(0,80)}"`,out:done.join(' ')||'They listened.'});visBusy=false;if(visC===cid)renderVision();renderHand();markDirty()}
// ---------- the HUD ----------
renderHand=function(){const el=$('#hand');if(!el||!S||!S.maker||!S.myPeoples)return;const M=S.maker;const mine=S.reach();const gods=S.godInfo().filter(g=>g.alive);
  el.innerHTML=`<div class="hhd"><span>Your faithful</span><b>${S.believers()}</b></div><div class="hsub">${S.faithPct()}% of your peoples pray to you · all-time ${Math.round(M.allTime).toLocaleString()} believers</div>
  <div class="hmet"><span>☀ Greatness</span><i class="zones"><em class="g" style="width:${Math.round(M.greatness)}%"></em></i><b>${Math.round(M.greatness)}</b></div>
  <div class="hmet"><span>❦ Mercy</span><i class="zones"><em class="m" style="width:${Math.round(M.mercy)}%"></em></i><b>${Math.round(M.mercy)}</b></div>
  ${S.dangerText()?`<div class="hdanger">⚠ ${esc(S.dangerText())}</div>`:''}
  ${(M.docs||[]).length?`<div class="hdoc">${M.docs.map(D=>`<span title="${esc(S.docText(D))}">✠ ${esc(D.name)}</span>`).join('')}</div>`:''}${S.world.age?`<div class="homen" title="${esc(S.world.age.text)}">◐ ${esc(S.world.age.name)}</div>`:''}${(()=>{const d=S.doomInfo();return(d.ai>0?`<div class="hdanger">⚙ The machines of the ${esc(d.aiWho||'world')}: ${d.ai}% awake</div>`:'')+(d.carbon>4?`<div class="hdanger" style="color:#9fd0ff;border-color:#2a4a6a;background:#0c1a2a">🌊 The climate is changing</div>`:'')})()}
  <div class="hpeo">${mine.map(f=>{const sh=S.myShare(f);const tr=f._sh10==null?'':sh>f._sh10+0.02?'<i class="tr up">▲</i>':sh<f._sh10-0.02?'<i class="tr down">▼</i>':'';return`<div><span class="sw" style="background:${pcol(f)}"></span><b style="color:${pcol(f)}">★${esc(f.name)}</b> ${f.pop} <small>${Math.round(sh*100)}% faithful ${tr}${S.isMine(f)?'':' · lost'}</small></div>`}).join('')||'<div class="d">No people prays to you.</div>'}</div>
  ${gods.length?`<div class="hgods"><span>Rival gods</span>${gods.map(g=>`<div><span class="sw" style="background:hsl(${g.hue},78%,68%)"></span>⚔ ${esc(cap(g.name))} <small>${g.believers} believers · ${tagNames(esc(g.peoples.map(n=>'the '+n).join(', ')))}</small></div>`).join('')}</div>`:''}
  ${saga.cardBusy?'<div class="hcall"><span class="pulse"></span> Your people are calling…</div>':''}`};
// ---------- defeat and the hall of ages ----------
async function showDefeat(){if(saga.defeatShown)return;saga.defeatShown=true;running=false;endSkip();const M=S.maker;const ages=saga.ch.length;const entry={title:worldTitle,score:Math.round(M.allTime),peak:M.peak,ages,years:Math.floor(S.year),date:Date.now()};
  let hall=await IDB.get('hall');if(!Array.isArray(hall))hall=[];if(!hall.some(h=>h.title===entry.title&&h.years===entry.years))hall.push(entry);hall.sort((a,b)=>b.score-a.score);hall=hall.slice(0,10);await IDB.put('hall',hall);
  const rank=hall.findIndex(h=>h.title===entry.title&&h.years===entry.years)+1;
  $('#defCard').innerHTML=`<div class="chk">The end of your worship</div><h2 class="cht">${M.defeatCause==='ai'?'A Greater Mind Wakes':'You Are Forgotten'}</h2><p class="chb">${M.defeatCause==='ai'?'Something your creatures built has woken, and it has no use for gods. No one prays to you now.':'No people prays to you anymore.'} For ${entry.years} years, across ${ages} ${ages===1?'age':'ages'}, the world of ${esc(worldTitle)} knew your name.</p>
  <div class="dscore"><div><b>${entry.score.toLocaleString()}</b><span>believers, all time</span></div><div><b>${entry.peak}</b><span>at the height of your worship</span></div><div><b>#${rank}</b><span>in your hall of ages</span></div></div>
  <div class="lbl">Hall of Ages</div><ol class="hall">${hall.map(h=>`<li${h===hall[rank-1]?' class="me"':''}><b>${h.score.toLocaleString()}</b> The world of ${esc(h.title)} <span class="d">${h.ages} ages · ${h.years} years</span></li>`).join('')}</ol>
  <div class="chrow"><button type="button" class="btn" id="defBook">Read the book</button><button type="button" class="btn primary" id="defNew">Make a new world</button></div>`;
  $('#defeat').hidden=false;$('#defBook').onclick=()=>{$('#defeat').hidden=true;openBook()};$('#defNew').onclick=()=>{$('#defeat').hidden=true;beginNewWorld()};markDirty();saveNow(true)}

// what a choice will do to your meters, shown before you pick (other consequences stay hidden)
function leanDelta(lean,cost){const k=1+cost/30;return lean==='greatness'?[9*k,-7*k]:lean==='mercy'?[-7*k,9*k]:[-2,-2]}
function deltaChips(o){const [dg,dm]=leanDelta(o.lean,o.cost);const G=S.maker.greatness,M=S.maker.mercy;const g1=Math.max(0,Math.min(100,G+dg)),m1=Math.max(0,Math.min(100,M+dm));
  const warn=g1>=80&&G<80?'zealots will stir':g1<=20&&G>20?'they will doubt you':m1>=80&&M<80?'heresy will bloom':m1<=20&&M>20?'towns will rebel':'';
  const ch=(icon,v)=>{const r=Math.round(v);return`<i class="dc ${r>0?'up':r<0?'down':''}">${icon} ${r>0?'+':''}${r}</i>`};
  return`<span class="dchips">${ch('☀',dg)}${ch('❦',dm)}<i class="dc q" title="Other consequences are only revealed when you choose">?</i>${warn?`<i class="dc warn">⚠ ${warn}</i>`:''}</span>`}

// ---------- the character of each age: invented from the world as it stands ----------
async function beginAge(){const fb=S.composeAge();const n=saga.ch.length+1;
  if(sampleFn){try{const recent=S.events.filter(e=>Math.floor(S.year)-e.yr<=200&&e.imp>=2).slice(-30).map(e=>`${e.yr}: ${e.title}`);
      const prompt=`You name and characterise the next age of an invented world's history, grounded only in what is happening: no magic, no gods acting, nothing supernatural. Climate, harvests, disease, trade, learning, faith, migration and the temper of peoples are the forces.
The world now (year ${Math.floor(S.year)}, the Maker's Age ${n}): peoples: ${S.alive().slice(0,10).map(f=>`the ${f.name} (${f.pop}, ${S.eraOf(f)}, ${S.GOVS[f.gov].label})`).join('; ')}. Recent events: ${recent.join('; ')}. Dangers: ${JSON.stringify(S.doomInfo())}.
Invent the character of the coming age from these facts: something that follows from them, specific to this world, not generic. Reply with JSON only:
{"name":"The Age of ... (3-7 words, specific to this world)","text":"2 sentences: what defines this age and why it follows from what came before","levers":{ pick 2-4 of: "foodMult" 0.55-1.45 (harvests), "plagueMult" 0.3-5 (disease), "cultMult" 0.4-3 (new preachers and sects), "techMult" 0.6-2.2 (learning), "doubt" 0-0.006 (faith eroding), "martial" -0.15..0.2 (warlike temper), "unrest" -0.2..0.3, "trade" -0.15..0.2, "migration" 0 or 1 (new peoples arrive) }}`;
      const r=await Promise.race([sampleFn.json(prompt,{cache:false}),new Promise(res=>setTimeout(()=>res(null),15000))]);if(r&&r.name&&r.levers){S.setAge(r);return}}catch(e){}}
  S.setAge(fb)}

// ================= CLARITY: banner colours in text, breaking news, alerts =================
const pcol=(f,dark)=>dark?`hsl(${Math.round(f.hue)},62%,34%)`:`hsl(${Math.round(f.hue)},78%,68%)`;
let _tagKey='',_tagRe=null,_tagMap=null;
function tagger(){const key=S.facs.length+':'+S.setts.length+':'+S.facs.map(f=>f.name).join('|').length+':'+Math.floor(S.year/3);if(key===_tagKey&&_tagRe)return;_tagKey=key;_tagMap=new Map();
  for(const f of S.facs){if(f.name&&f.name.length>=3&&!_tagMap.has(f.name))_tagMap.set(f.name,f);if(f.gloss&&f.gloss.length>=4&&!_tagMap.has(f.gloss))_tagMap.set(f.gloss,f)}
  for(const s of S.setts){if(s.name&&s.name.length>=3&&!_tagMap.has(s.name))_tagMap.set(s.name,{town:s})}
  const names=[..._tagMap.keys()].sort((a,b)=>b.length-a.length).map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));_tagRe=names.length?new RegExp('\\b('+names.join('|')+')\\b','g'):null}
// colour every people's name in already-escaped html; your peoples get a star
function tagNames(html,dark){if(!S||!html)return html;tagger();if(!_tagRe)return html;return html.replace(_tagRe,m=>{const v=_tagMap.get(m);if(!v)return m;if(v.town){const s=v.town;const f=S.facs[s.fac];if(!f)return m;return`<span class="pn town" data-pk="t${s.id}" style="color:${pcol(f,dark)}">${m}</span>`}const f=v;const mine=S.isMine&&S.isMine(f);const god=S.gods&&S.gods.find(g=>g.alive&&(g.peoples||[]).includes(f.id));
  return`<span class="pn${mine?' mine':''}" data-pk="f${f.id}" style="color:${pcol(f,dark)}">${mine?'★':god?'⚔':''}${m}</span>`})}
// ---------- breaking news ----------
const NEWS=[];let newsDirty=true;
function bigPeople(f){if(!f)return false;const al=S.alive().slice().sort((a,b)=>b.pop-a.pop);return al.indexOf(f)>-1&&al.indexOf(f)<3}
function newsworthy(e){const fs=e.facs.map(id=>S.facs[id]).filter(Boolean);const mine=fs.some(f=>S.isMine&&S.isMine(f))||fs.some(f=>S.maker&&S.maker.ever&&S.maker.ever[f.id]);const big=fs.some(bigPeople);
  switch(e.type){
    case'rulerdeath':return mine||big?2:0;case'succession':return 0;
    case'war':return mine?3:big?2:0;case'betrayal':return mine||big?3:0;
    case'peace':return (mine||big)&&((e.data.dur||0)>=10)?2:0;
    case'schism':case'revolution':case'coup':return mine?3:big?2:0;
    case'conquest':return e.text.includes('the capital')?(mine?3:2):0;case'razed':return mine?3:0;
    case'nuke':case'blight':case'winter':case'depart':case'making':case'uplift':return 3;
    case'arrival':case'rivalgod':case'godfalls':return 3;
    case'cult':return mine?3:0;case'convert':return mine?3:big?2:0;case'persecution':return mine?2:0;case'martyr':case'fulfilled':case'merge':return mine?2:0;
    case'extinct':{const f=fs[0];return f&&f.stats.peak>=30?(mine?3:2):0}
    case'plague':return mine?3:big?1:0;case'flood':return mine?3:1;case'famine':return 3;case'union':return 2;case'titan':return mine?2:1;
    case'zealots':case'apostasy':case'forgotten':case'ai':case'awakening':case'undying':case'climate':case'fallout':case'omen':case'doctrine':case'slaverevolt':return 3;case'rival':return e.data.mine?3:0;
  }return 0}
const NEWSICON={ai:'⚙',awakening:'⚙',undying:'∞',climate:'🌡',flood:'🌊',fallout:'☢',omen:'◐',doctrine:'✠',slaverevolt:'⛓',war:'⚔',betrayal:'🗡',peace:'☮',rulerdeath:'✝',schism:'⚡',revolution:'⚡',coup:'⚡',conquest:'🔥',razed:'🔥',nuke:'☢',blight:'☣',arrival:'✦',rivalgod:'👁',godfalls:'✧',cult:'◬',convert:'✚',extinct:'✝',plague:'☣',famine:'⌛',zealots:'⚔',apostasy:'✖',forgotten:'✖',rival:'👁',persecution:'🔥',martyr:'✝',fulfilled:'✦',merge:'⚭',union:'⚭',titan:'▲',winter:'❄',depart:'✦',making:'✦',uplift:'✦'};
function pushNews(e){const w=newsworthy(e);if(!w)return;const fs=e.facs.map(id=>S.facs[id]).filter(Boolean);const mine=fs.some(f=>S.isMine&&S.isMine(f));
  NEWS.unshift({id:e.id,yr:e.yr,title:e.title,w,mine,ic:NEWSICON[e.type]||'•',x:e.x,y:e.y,hue:fs[0]?fs[0].hue:40,t:performance.now()});if(NEWS.length>8)NEWS.length=8;newsDirty=true;
  if(w>=3&&(mine||['omen','doctrine','ai','awakening','undying','climate','fallout','winter'].includes(e.type)))flashAlert(e)}
function renderNews(){if(!newsDirty)return;newsDirty=false;const el=$('#newsTrack');if(!el)return;if(!NEWS.length){$('#news').hidden=true;return}$('#news').hidden=false;
  const items=NEWS.map(n=>`<button type="button" class="ni${n.mine?' mine':''}${performance.now()-n.t<8000?' fresh':''}" data-nx="${Math.round(n.x)}" data-ny="${Math.round(n.y)}"><span class="nic">${n.ic}</span><span class="ny">${n.yr}</span>${tagNames(esc(n.title))}</button>`).join('<span class="nsep">◆</span>');
  el.innerHTML=items+'<span class="nsep">◆</span>'+items;const dur=Math.max(30,NEWS.length*9);el.style.animationDuration=dur+'s'}
$('#news').addEventListener('click',e=>{const b=e.target.closest('[data-nx]');if(b)flyTo(+b.dataset.nx,+b.dataset.ny,2.2)});
let alertT=null;
function flashAlert(e){const el=$('#alert');el.innerHTML=`<span class="aic">${NEWSICON[e.type]||'!'}</span><div><b>${tagNames(esc(e.title))}</b><span>${tagNames(esc(e.text.length>140?e.text.slice(0,138)+'…':e.text))}</span></div>`;el.hidden=false;el.classList.remove('go');void el.offsetWidth;el.classList.add('go');clearTimeout(alertT);alertT=setTimeout(()=>{el.hidden=true},7000)}
$('#alert').addEventListener('click',()=>{$('#alert').hidden=true});

// ---------- peek: click any coloured name for a quick read ----------
function peekHTML(k){const id=+k.slice(1);if(k[0]==='t'){const s=S.setts.find(x=>x.id===id);if(!s)return'<b>Gone</b><div class="d">This town no longer stands.</div>';const f=S.facs[s.fac];const n=s.members.filter(a=>!a.dead).length;const sl=s.members.filter(a=>!a.dead&&a.slave!=null).length;
    return`<b style="color:${pcol(f)}">${esc(s.name)}</b><div class="d">${['camp','village','town','city','great city'][s.level]} of ${tagNames(esc('the '+f.name))}${S.capitalOf(f)===s?' · capital':''}</div><div>${n} souls${sl?` · ${sl} in chains`:''}</div><div>${s.unrest>0.5?'seething':s.unrest>0.25?'restless':'calm'} · stores ${Math.round(s.store)}</div>${s.owners.length>1?`<div class="d">once held by ${tagNames(esc(s.owners.slice(0,-1).map(i=>'the '+S.facs[i].name).join(', ')))}</div>`:''}`}
  const f=S.facs[id];if(!f)return'';const ru=S.rulerOf(f);const F=f.state!=null?S.faiths[f.state]:null;const god=S.gods.find(g=>g.alive&&(g.peoples||[]).includes(f.id));const wars=S.alive().filter(o=>o!==f&&S.rel(f.id,o.id).war);const sh=S.myShare(f);
  return`<b style="color:${pcol(f)}">${S.isMine(f)?'★ ':god?'⚔ ':''}The ${esc(f.name)}</b>${f.died!=null?`<div class="d">gone since ${f.died}</div>`:`<div>${f.pop} souls · ${S.facSetts(f).length} towns · ${esc(S.GOVS[f.gov].label)}</div>${ru?`<div class="d">ruled by ${esc(cap(S.cname(ru)))}</div>`:''}
  <div>${F?esc(cap(F.title)):'no faith'}${F&&F.god==='you'?' · <span class="mk">worships you</span>':god?` · <span class="rv">${esc(god.name)}</span>`:F&&F.cult?' · a cult':''}</div><div class="d">${Math.round(sh*100)}% pray to you</div>${wars.length?`<div class="d">at war with ${tagNames(esc(wars.map(o=>'the '+o.name).join(', ')))}</div>`:''}`}`}
document.addEventListener('click',e=>{const p=e.target.closest('[data-pk]');const pk=$('#peek');if(!p){if(!e.target.closest('#peek'))pk.hidden=true;return}e.stopPropagation();pk.innerHTML=peekHTML(p.dataset.pk);pk.hidden=false;const r=p.getBoundingClientRect();const w=240;pk.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left))+'px';pk.style.top=(r.bottom+6+180>innerHeight?r.top-6-pk.offsetHeight:r.bottom+6)+'px'},true);
// ---------- colour every name in any panel of text, wherever it was written ----------
function tagDom(root,dark){if(!root||!S)return;tagger();if(!_tagRe)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>{const p=n.parentElement;if(!p||p.closest('.pn,button.ni,script,style,canvas,textarea,h1'))return NodeFilter.FILTER_REJECT;_tagRe.lastIndex=0;return _tagRe.test(n.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT}});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const n of nodes){const span=document.createElement('span');span.innerHTML=tagNames(esc(n.nodeValue),dark);n.replaceWith(...span.childNodes)}}
const _tagObs=new Map();
function watchTags(sel,dark){const el=$(sel);if(!el)return;let t=null;const ob=new MutationObserver(()=>{if(t)return;t=setTimeout(()=>{t=null;ob.disconnect();tagDom(el,dark);ob.observe(el,{childList:true,subtree:true})},60)});ob.observe(el,{childList:true,subtree:true});_tagObs.set(sel,ob)}
watchTags('#p-peoples');watchTags('#p-inspect');watchTags('#cpage',true);watchTags('#bpage',true);

// ---------- boot ----------
newWorld(Math.floor(Math.random()*1e9),null,null,true);running=false;SAVE.suspended=true;bootSaves();
setTimeout(()=>{if(cv.clientWidth)startView()},50);
window.addEventListener('resize',()=>clampCam());
requestAnimationFrame(frame);
// AI comes from src/ai: the claude.ai plan inside an artifact, or the player's own API key.
connectGame(s=>{sampleFn=s;$('#oracleMode').textContent=s?`${s.label} interprets your words`:'interpreted by keyword'});
if(typeof claude!=='undefined'&&claude.use){claude.use('downloads').then(d=>{downloadsFn=d}).catch(()=>{})}
$('#exportBtn').onclick=()=>exportBook();


export { CURYEAR, S };
