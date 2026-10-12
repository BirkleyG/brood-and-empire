import { ARCH, clamp, lerp, mulberry32 } from '../sim/data.js';
import { CURYEAR, S } from '../app/game.js';

// ================= RENDERING =================
const TCOL=[[24,40,62],[40,72,98],[78,95,60],[50,74,48],[122,106,74],[96,92,90]];
function buildTerrain(S,scale){
  const c=document.createElement('canvas');c.width=S.W*scale;c.height=S.H*scale;const x=c.getContext('2d');
  const sm=document.createElement('canvas');sm.width=S.GW;sm.height=S.GH;const sx=sm.getContext('2d');const id=sx.createImageData(S.GW,S.GH);
  for(let k=0;k<S.GW*S.GH;k++){const t=S.ter[k],h=S.hgt[k];const col=TCOL[t];const sh=t>=2?(h-0.5)*60:(h-0.3)*40;id.data[k*4]=clamp(col[0]+sh,0,255);id.data[k*4+1]=clamp(col[1]+sh,0,255);id.data[k*4+2]=clamp(col[2]+sh,0,255);id.data[k*4+3]=255}
  sx.putImageData(id,0,0);x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(sm,0,0,c.width,c.height);
  // texture
  const rr=mulberry32(S.seed+9);
  for(let k=0;k<S.GW*S.GH;k++){const t=S.ter[k],i=k%S.GW,j=Math.floor(k/S.GW);const n=t===3?7:t===5?4:t===2?3:t===4?3:t===1?1:0;
    for(let m=0;m<n;m++){const px=(i+rr())*S.TS*scale,py=(j+rr())*S.TS*scale;
      if(t===3){x.fillStyle='rgba(20,36,22,.55)';x.beginPath();x.arc(px,py,(1.6+rr()*2.2)*scale,0,6.28);x.fill();x.fillStyle='rgba(120,150,90,.18)';x.beginPath();x.arc(px-0.8*scale,py-0.8*scale,1*scale,0,6.28);x.fill()}
      else if(t===5){x.strokeStyle='rgba(30,28,30,.45)';x.lineWidth=scale;x.beginPath();x.moveTo(px-3*scale,py+2*scale);x.lineTo(px,py-3*scale);x.lineTo(px+3*scale,py+2*scale);x.stroke();x.strokeStyle='rgba(220,220,225,.25)';x.beginPath();x.moveTo(px-1*scale,py-1.5*scale);x.lineTo(px,py-3*scale);x.stroke()}
      else if(t===2){x.fillStyle='rgba(150,170,100,.18)';x.fillRect(px,py,scale,2*scale)}
      else if(t===4){x.fillStyle='rgba(60,45,25,.25)';x.fillRect(px,py,1.5*scale,1.5*scale)}
      else if(t===1){x.strokeStyle='rgba(150,190,215,.12)';x.lineWidth=scale*.8;x.beginPath();x.arc(px,py,4*scale,3.6,5.8);x.stroke()}}}
  // coast line glow
  return c;
}

function eyeCount(g){return 1+Math.round(g.eyes*6)}
function drawCreature(c,g,r,t,o){
  o=o||{};
  const h=Math.round(g.hue),sat=Math.round(32+g.weirdness*30+g.glow*14),L=Math.round(44+g.glow*8);
  const fill=`hsl(${h},${sat}%,${L}%)`,dark=`hsl(${h},${Math.round(sat*.7)}%,${L-24}%)`,lite=`hsl(${h},${sat}%,${Math.min(82,L+18)}%)`,head=`hsl(${h},${sat}%,${L+6}%)`;
  const acc=`hsl(${Math.round((h+150+g.weirdness*80)%360)},${sat+10}%,${L+8}%)`;
  const segs=1+Math.round(g.segments*3),el=0.78+g.speed*0.42,mv=o.moving?1:0.2,ph=o.phase!=null?o.phase:t*3;
  const lw=Math.max(0.5,r*0.11);
  const seg=[];let sx=0;for(let i=0;i<segs;i++){const sr=r*(1-i*0.15);seg.push({x:sx,r:sr});sx-=sr*1.12*el}
  const last=seg[segs-1];const tailX=last.x-last.r*el*0.75;
  c.lineJoin='round';c.lineCap='round';
  // aura
  if(g.mystic>0.6){const pr=r*(2.2+g.mystic*1.4)*(1+Math.sin(t*2)*0.08);const gr=c.createRadialGradient(0,0,r*0.5,0,0,pr);gr.addColorStop(0,`hsla(${(h+40)%360},70%,70%,${0.22*g.mystic})`);gr.addColorStop(1,`hsla(${(h+40)%360},70%,70%,0)`);c.fillStyle=gr;c.beginPath();c.arc(seg[0].x*0.5,0,pr,0,6.28);c.fill()}
  if(g.glow>0.42){const pr=r*2.4;const a=g.glow*0.3*(0.75+0.25*Math.sin(t*3+(o.seed||0)));const gr=c.createRadialGradient(0,0,0,0,0,pr);gr.addColorStop(0,`hsla(${h},90%,70%,${a})`);gr.addColorStop(1,`hsla(${h},90%,70%,0)`);c.fillStyle=gr;c.beginPath();c.arc(0,0,pr,0,6.28);c.fill()}
  // shadow
  if(!o.noShadow){c.fillStyle='rgba(0,0,0,.28)';c.beginPath();c.ellipse((seg[0].x+last.x)/2+r*0.15,r*0.3,(seg[0].x-last.x)/2+r*1.1,r*1.05,0,0,6.28);c.fill()}
  // wings
  if(g.flight>0.33){
    const span=r*(1.2+g.flight*2.8),fl=Math.sin(ph*2.4)*(o.moving?0.6:0.18);
    for(const s of [-1,1]){c.save();c.translate(seg[0].x-r*0.35,0);c.rotate(s*(0.2+fl*0.7));
      c.beginPath();c.moveTo(r*0.2,0);c.quadraticCurveTo(-span*0.15,s*span*1.0,-span*0.85,s*span*0.75);c.quadraticCurveTo(-span*0.55,s*span*0.45,-span*0.8,s*span*0.2);c.quadraticCurveTo(-span*0.4,s*span*0.12,-r*0.6,0);c.closePath();
      c.fillStyle=`hsla(${h},${sat}%,${L+12}%,0.5)`;c.fill();c.strokeStyle=dark;c.lineWidth=lw*0.9;c.stroke();
      c.lineWidth=lw*0.6;c.beginPath();c.moveTo(0,0);c.lineTo(-span*0.85,s*span*0.75);c.moveTo(0,0);c.lineTo(-span*0.8,s*span*0.2);c.moveTo(0,0);c.lineTo(-span*0.65,s*span*0.5);c.stroke();c.restore()}
  }
  // legs
  const nL=2*Math.round(g.limbs*4),pairs=nL/2;
  if(pairs>0){
    const len=r*(0.85+g.speed*0.55+(1-g.size)*0.25);
    for(let k=0;k<pairs;k++){const fr=pairs===1?0.35:k/(pairs-1);const lx=lerp(seg[0].x-r*0.05,last.x+last.r*0.3,fr);const si=Math.min(segs-1,Math.round(fr*(segs-1)));const sr=seg[si].r;
      for(const s of [-1,1]){const sw=Math.sin(ph*1.7+k*Math.PI+(s>0?Math.PI:0))*0.5*mv;const fwd=(0.5-fr)*0.8;
        const kx=lx+(fwd+sw)*len*0.45,ky=s*(sr*0.75+len*0.5),fx=lx+(fwd*1.4+sw*1.6-0.15)*len*0.55,fy=s*(sr*0.6+len*0.92);
        c.strokeStyle=dark;c.lineWidth=Math.max(0.6,r*0.17*(0.7+g.size*0.6));c.beginPath();c.moveTo(lx,s*sr*0.6);c.lineTo(kx,ky);c.lineTo(fx,fy);c.stroke();
        if(g.spikes>0.6&&r>4){c.lineWidth=lw*0.7;c.beginPath();c.moveTo(kx,ky);c.lineTo(kx-len*0.12,ky+s*len*0.12);c.stroke()}
        if(g.carnivory>0.6&&r>5){c.fillStyle=lite;c.beginPath();c.arc(fx,fy,lw*0.8,0,6.28);c.fill()}}}
  }else if(g.aquatic>0.4){
    const fs=Math.sin(ph*1.8)*0.4*(0.4+mv);for(const s of [-1,1]){c.save();c.translate(seg[0].x-r*0.2,s*seg[0].r*0.7);c.rotate(s*(0.8+fs));c.beginPath();c.moveTo(0,0);c.lineTo(-r*1.1,s*r*0.35);c.lineTo(-r*0.6,s*r*0.9);c.closePath();c.fillStyle=`hsla(${h},${sat}%,${L+10}%,.75)`;c.fill();c.strokeStyle=dark;c.lineWidth=lw*0.7;c.stroke();c.restore()}
  }
  // tail
  if(g.tail>0.18){
    const tl=r*(0.6+g.tail*3.3);const pts=[];for(let i=0;i<=6;i++){const f=i/6;pts.push([tailX+last.r*0.3-f*tl,Math.sin(ph*1.2-i*0.75)*r*0.42*f*(0.4+mv*0.8)])}
    c.strokeStyle=dark;for(let i=0;i<6;i++){c.lineWidth=Math.max(0.5,r*0.5*(1-i/6.5));c.beginPath();c.moveTo(pts[i][0],pts[i][1]);c.lineTo(pts[i+1][0],pts[i+1][1]);c.stroke()}
    c.strokeStyle=fill;for(let i=0;i<5;i++){c.lineWidth=Math.max(0.3,r*0.32*(1-i/6));c.beginPath();c.moveTo(pts[i][0],pts[i][1]);c.lineTo(pts[i+1][0],pts[i+1][1]);c.stroke()}
    const tp=pts[6];
    if(g.aquatic>0.55){c.fillStyle=lite;c.beginPath();c.moveTo(tp[0]+r*0.2,tp[1]);c.lineTo(tp[0]-r*0.7,tp[1]-r*0.7);c.lineTo(tp[0]-r*0.4,tp[1]);c.lineTo(tp[0]-r*0.7,tp[1]+r*0.7);c.closePath();c.fill();c.strokeStyle=dark;c.lineWidth=lw*0.6;c.stroke()}
    else if(g.spikes>0.55){c.fillStyle='hsl(40,15%,78%)';c.beginPath();for(let i=0;i<6;i++){const a=i*1.047+t;c.lineTo(tp[0]+Math.cos(a)*r*0.55,tp[1]+Math.sin(a)*r*0.55);c.lineTo(tp[0]+Math.cos(a+0.52)*r*0.25,tp[1]+Math.sin(a+0.52)*r*0.25)}c.closePath();c.fill();c.strokeStyle=dark;c.lineWidth=lw*0.5;c.stroke()}
    else if(g.glow>0.55){c.fillStyle=`hsl(${h},90%,75%)`;c.beginPath();c.arc(tp[0],tp[1],r*0.28,0,6.28);c.fill()}
  }
  // body segments
  const pat=Math.round(g.weirdness*2.9+g.spikes*0.5)%4;
  for(let i=segs-1;i>=0;i--){const s=seg[i];const rx=s.r*el*0.98,ry=s.r;
    // spines
    if(g.spikes>0.3){c.fillStyle='hsl(40,14%,80%)';c.strokeStyle=dark;c.lineWidth=lw*0.5;const sl=r*0.62*g.spikes;const n=i===0?2:3;for(const sd of [-1,1])for(let m=0;m<n;m++){const a=(m+0.5)/n*Math.PI*0.9-Math.PI*0.45-Math.PI/2*sd*0;const px=s.x+Math.sin(a)*rx*0.8,py=sd*Math.cos(a)*ry*0.95;c.beginPath();c.moveTo(px-sl*0.3,py);c.lineTo(px-sl*0.15,py+sd*sl);c.lineTo(px+sl*0.25,py);c.closePath();c.fill();c.stroke()}}
    c.fillStyle=fill;c.strokeStyle=dark;c.lineWidth=lw*(1+g.armor*1.6);c.beginPath();c.ellipse(s.x,0,rx,ry,0,0,6.28);c.fill();c.stroke();
    if(r>3.2){
      c.save();c.beginPath();c.ellipse(s.x,0,rx,ry,0,0,6.28);c.clip();
      if(pat===1){c.strokeStyle=`hsla(${h},${sat}%,${L-28}%,.55)`;c.lineWidth=r*0.16;for(let m=-2;m<=2;m++){c.beginPath();c.moveTo(s.x+m*rx*0.38,-ry);c.quadraticCurveTo(s.x+m*rx*0.38-rx*0.15,0,s.x+m*rx*0.38,ry);c.stroke()}}
      else if(pat===2){c.fillStyle=acc;for(let m=0;m<5;m++){const a=m*2.4+i,d=0.5;c.beginPath();c.arc(s.x+Math.cos(a)*rx*d,Math.sin(a)*ry*d,r*0.13,0,6.28);c.fill()}}
      else if(pat===3){c.fillStyle=acc;c.strokeStyle=dark;c.lineWidth=lw*0.6;for(const sd of [-1,1]){c.beginPath();c.arc(s.x-rx*0.1,sd*ry*0.45,r*0.22,0,6.28);c.fill();c.stroke();c.fillStyle=dark;c.beginPath();c.arc(s.x-rx*0.1,sd*ry*0.45,r*0.08,0,6.28);c.fill();c.fillStyle=acc}}
      if(g.armor>0.45){c.strokeStyle=`hsla(${h},${sat}%,${L-30}%,.75)`;c.lineWidth=lw*1.1;for(let m=1;m<=2;m++){c.beginPath();c.ellipse(s.x+rx*0.9,0,rx*(0.5*m),ry*1.2,0,Math.PI*0.6,Math.PI*1.4);c.stroke()}}
      c.fillStyle='rgba(255,255,255,.13)';c.beginPath();c.ellipse(s.x+rx*0.15,-ry*0.35,rx*0.55,ry*0.3,0,0,6.28);c.fill();
      c.restore();
    }
  }
  // tech gear on body
  if(o.tech>=5.5&&g.intellect>0.35&&r>3){c.strokeStyle='hsl(45,45%,62%)';c.lineWidth=lw*1.3;c.beginPath();c.ellipse(seg[0].x,0,seg[0].r*el*0.75,seg[0].r*0.75,0,0,6.28);c.stroke()}
  if(o.carry>3&&r>3){c.fillStyle='hsl(32,40%,42%)';c.strokeStyle='hsl(32,40%,22%)';c.lineWidth=lw*0.6;c.beginPath();c.arc(seg[0].x-seg[0].r*0.5,0,r*0.38,0,6.28);c.fill();c.stroke()}
  // head
  const hx=seg[0].x+seg[0].r*el*0.82,hr=r*(0.46+g.intellect*0.3);
  if(g.horns>0.3){const hl=r*(0.35+g.horns*1.35);c.fillStyle='hsl(38,22%,82%)';c.strokeStyle=dark;c.lineWidth=lw*0.6;
    if(g.weirdness>0.72){c.beginPath();c.moveTo(hx+hr*0.5,-hr*0.25);c.lineTo(hx+hr+hl,0);c.lineTo(hx+hr*0.5,hr*0.25);c.closePath();c.fill();c.stroke()}
    else for(const s of [-1,1]){c.beginPath();c.moveTo(hx,s*hr*0.35);c.quadraticCurveTo(hx-hl*0.2,s*(hr+hl*0.9),hx-hl*0.8,s*(hr+hl*0.55));c.quadraticCurveTo(hx-hl*0.1,s*(hr+hl*0.35),hx+hr*0.25,s*hr*0.75);c.closePath();c.fill();c.stroke()}}
  if(g.carnivory>0.5){const op=0.25+Math.sin(t*6+(o.seed||0))*0.15*(o.fighting?2:0.5);c.strokeStyle=dark;c.lineWidth=lw*1.5;for(const s of [-1,1]){c.beginPath();c.moveTo(hx+hr*0.4,s*hr*0.45);c.quadraticCurveTo(hx+hr*1.5,s*hr*(0.7+op),hx+hr*1.55,s*hr*0.05);c.stroke()}}
  c.fillStyle=head;c.strokeStyle=dark;c.lineWidth=lw*(1+g.armor);c.beginPath();c.ellipse(hx,0,hr*1.05,hr,0,0,6.28);c.fill();c.stroke();
  if(g.intellect>0.62&&r>4){c.strokeStyle=`hsla(${h},${sat}%,${L-20}%,.7)`;c.lineWidth=lw*0.6;c.beginPath();c.arc(hx-hr*0.2,0,hr*0.55,-1,1);c.stroke();c.beginPath();c.arc(hx-hr*0.45,0,hr*0.4,-0.9,0.9);c.stroke()}
  // eyes
  if(r>2.4){const n=eyeCount(g);const ec=g.glow>0.5?`hsl(${(h+60)%360},95%,72%)`:'#f1eee4';
    const er=Math.max(0.5,hr*Math.max(0.13,0.36-n*0.035));const blink=(Math.sin(t*0.9+(o.seed||0)*3)>0.985)?0.15:1;
    for(let i=0;i<n;i++){const a=n===1?0:-0.95+1.9*i/(n-1);const ex=hx+Math.cos(a)*hr*0.55,ey=Math.sin(a)*hr*0.62;
      c.fillStyle=ec;c.beginPath();c.ellipse(ex,ey,er,er*blink,0,0,6.28);c.fill();
      if(blink>0.5){c.fillStyle='#10131a';c.beginPath();c.arc(ex+er*0.35,ey,er*0.5,0,6.28);c.fill()}}}
  // weapons & crowns
  if(o.tech>=1.2&&g.intellect>0.4&&r>3){c.strokeStyle='hsl(30,35%,38%)';c.lineWidth=Math.max(0.6,r*0.12);c.beginPath();c.moveTo(seg[0].x-r*0.6,r*0.95);c.lineTo(hx+r*1.5,r*0.7);c.stroke();c.fillStyle=o.tech>=3?'hsl(210,10%,78%)':'hsl(30,20%,60%)';c.beginPath();c.moveTo(hx+r*1.95,r*0.68);c.lineTo(hx+r*1.4,r*0.48);c.lineTo(hx+r*1.4,r*0.9);c.closePath();c.fill()}
  if(o.banner&&r>2.5){c.strokeStyle='#2a2318';c.lineWidth=Math.max(0.5,r*0.1);c.beginPath();c.moveTo(last.x,0);c.lineTo(last.x-r*0.4,-r*2.2);c.stroke();c.fillStyle=`hsl(${o.bannerHue!=null?o.bannerHue:h},70%,50%)`;c.beginPath();c.moveTo(last.x-r*0.4,-r*2.2);c.lineTo(last.x-r*1.6,-r*2.0+Math.sin(t*5)*r*0.15);c.lineTo(last.x-r*0.35,-r*1.45);c.closePath();c.fill()}
  if(o.crown){c.strokeStyle='hsl(46,80%,62%)';c.lineWidth=Math.max(0.7,r*0.14);c.beginPath();c.arc(hx-hr*0.1,0,hr*1.45,0,6.28);c.stroke()}
  if(o.job&&r>2.2)drawTool(c,o.job,hx,hr,r,t,o);
  if(o.flash>0){c.fillStyle=`rgba(255,240,220,${o.flash*2})`;c.beginPath();c.arc(seg[0].x*0.5,0,r*1.2,0,6.28);c.fill()}
}
function creatureExtent(g,r){const segs=1+Math.round(g.segments*3),el=0.78+g.speed*0.42;let len=r*1.1;for(let i=0;i<segs;i++)len+=r*(1-i*0.15)*1.12*el;len+=g.tail>0.18?r*(0.6+g.tail*3.3):0;len+=g.carnivory>0.5?r*0.6:0;len+=g.horns>0.3&&g.weirdness>0.72?r*1.5:0;const wide=Math.max(r*(0.9+0.95+g.speed*0.45),g.flight>0.33?r*(1.2+g.flight*2.8)*0.95:0);return{len,wide,front:r*(1.6),segs,el}}
function portrait(cv,g,t,o){
  const dpr=Math.min(2,window.devicePixelRatio||1);const w=cv.clientWidth||cv.width,h=cv.clientHeight||cv.height;if(cv.width!==Math.round(w*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr)}
  const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  if(o&&o.bg){c.fillStyle=o.bg;c.fillRect(0,0,w,h)}
  const ex=creatureExtent(g,10);const sc=Math.min((w*0.9)/ex.len,(h*0.9)/(ex.wide*2));const r=10*sc;
  const front=ex.front*sc;const cx=w/2+(ex.len*sc)/2-front*1.2,cy=h/2;
  c.save();c.translate(cx,cy+Math.sin(t*1.5)*r*0.04);c.rotate(-0.12);drawCreature(c,g,r,t,Object.assign({moving:true,phase:t*2.2,seed:3},o||{}));c.restore();
}


// ---------- job tools ----------
function drawTool(c,job,hx,hr,r,t,o){
  const lw=Math.max(0.4,r*0.12);c.lineCap='round';
  const sw=Math.sin(t*5+(o.seed||0))*0.5;
  switch(job){
    case'farmer':{c.save();c.translate(hx-r*0.2,r*0.85);c.rotate(-0.6+(o.working?sw:0));c.strokeStyle='#7a5a34';c.lineWidth=lw;c.beginPath();c.moveTo(0,0);c.lineTo(r*1.7,0);c.stroke();c.strokeStyle='#9aa0a6';c.lineWidth=lw*1.4;c.beginPath();c.moveTo(r*1.7,0);c.lineTo(r*1.7,-r*0.45);c.stroke();c.restore();break}
    case'builder':{c.fillStyle='#b8925a';c.strokeStyle='#6d5230';c.lineWidth=lw*0.5;c.save();c.translate(-r*0.2,-r*0.2);c.rotate(0.3);c.fillRect(-r*1.1,-r*0.22,r*2.2,r*0.44);c.strokeRect(-r*1.1,-r*0.22,r*2.2,r*0.44);c.restore();break}
    case'crafter':{c.save();c.translate(hx,r*0.8);c.rotate(-1+(o.working?Math.abs(sw)*1.6:0));c.strokeStyle='#6a4a2a';c.lineWidth=lw;c.beginPath();c.moveTo(0,0);c.lineTo(r*1.1,0);c.stroke();c.fillStyle='#8b9096';c.fillRect(r*0.9,-r*0.3,r*0.35,r*0.6);c.restore();if(o.working&&Math.sin(t*10+(o.seed||0))>0.8){c.fillStyle='#ffd27a';c.beginPath();c.arc(hx+r*1.2,r*0.4,r*0.18,0,6.28);c.fill()}break}
    case'scholar':{c.fillStyle='#efe6cf';c.strokeStyle='#8a7a55';c.lineWidth=lw*0.5;c.fillRect(hx+hr*0.6,-r*0.5,r*0.8,r*1.0);c.strokeRect(hx+hr*0.6,-r*0.5,r*0.8,r*1.0);break}
    case'priest':{c.strokeStyle='#d9c27a';c.lineWidth=lw;c.beginPath();c.moveTo(hx-r*0.3,-r*0.9);c.lineTo(hx+r*1.3,-r*1.1);c.stroke();c.fillStyle=`rgba(255,230,140,${0.5+Math.sin(t*3)*0.3})`;c.beginPath();c.arc(hx+r*1.35,-r*1.12,r*0.3,0,6.28);c.fill();break}
    case'artist':{c.strokeStyle='#6a4a2a';c.lineWidth=lw*0.8;c.beginPath();c.moveTo(hx,r*0.7);c.lineTo(hx+r*1.3,r*0.5+sw*r*0.4);c.stroke();c.fillStyle=`hsl(${(t*60+(o.seed||0)*40)%360},80%,60%)`;c.beginPath();c.arc(hx+r*1.35,r*0.5+sw*r*0.4,r*0.25,0,6.28);c.fill();break}
    case'hunter':case'guard':{c.strokeStyle='#6d5230';c.lineWidth=lw;c.beginPath();c.moveTo(-r*0.4,r*0.95);c.lineTo(hx+r*1.4,r*0.75);c.stroke();c.fillStyle='#b9bec4';c.beginPath();c.moveTo(hx+r*1.8,r*0.72);c.lineTo(hx+r*1.3,r*0.55);c.lineTo(hx+r*1.3,r*0.95);c.closePath();c.fill();if(job==='guard'){c.fillStyle=`hsl(${o.bannerHue||0},35%,40%)`;c.beginPath();c.ellipse(0,-r*0.95,r*0.55,r*0.32,0,0,6.28);c.fill()}break}
    case'trader':{c.fillStyle='#8a6a3a';c.strokeStyle='#4d3a1f';c.lineWidth=lw*0.6;c.beginPath();c.ellipse(-r*0.4,0,r*0.7,r*0.6,0,0,6.28);c.fill();c.stroke();c.strokeStyle='#c9a35a';c.beginPath();c.moveTo(-r*0.9,0);c.lineTo(r*0.1,0);c.stroke();break}
  }
}

// ---------- terrain ----------
function buildTerrainCanvas(S){
  const c=document.createElement('canvas');c.width=S.W;c.height=S.H;const x=c.getContext('2d');
  const sm=document.createElement('canvas');sm.width=S.GW;sm.height=S.GH;const sx=sm.getContext('2d');const id=sx.createImageData(S.GW,S.GH);
  for(let k=0;k<S.GW*S.GH;k++){const t=S.ter[k],h=S.hgt[k];const col=TCOL[t];const sh=t>=2?(h-0.5)*60:(h-0.3)*40;id.data[k*4]=clamp(col[0]+sh,0,255);id.data[k*4+1]=clamp(col[1]+sh,0,255);id.data[k*4+2]=clamp(col[2]+sh,0,255);id.data[k*4+3]=255}
  sx.putImageData(id,0,0);x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(sm,0,0,c.width,c.height);
  const rr=mulberry32(S.seed+9);
  for(let k=0;k<S.GW*S.GH;k++){const t=S.ter[k],i=k%S.GW,j=Math.floor(k/S.GW);const n=t===3?9:t===5?4:t===2?2:t===4?2:0;
    for(let m=0;m<n;m++){const px=(i+rr())*S.TS,py=(j+rr())*S.TS;
      if(t===3){x.fillStyle='rgba(18,34,20,.55)';x.beginPath();x.arc(px,py,1.6+rr()*2.2,0,6.28);x.fill()}
      else if(t===5){x.strokeStyle='rgba(30,28,30,.45)';x.lineWidth=1;x.beginPath();x.moveTo(px-4,py+3);x.lineTo(px,py-4);x.lineTo(px+4,py+3);x.stroke();x.strokeStyle='rgba(230,230,235,.3)';x.beginPath();x.moveTo(px-1.2,py-2);x.lineTo(px,py-4);x.stroke()}
      else if(t===2){x.fillStyle='rgba(150,170,100,.16)';x.fillRect(px,py,1,2)}
      else if(t===4){x.fillStyle='rgba(60,45,25,.22)';x.fillRect(px,py,1.5,1.5)}}}
  return c;
}
function hash2(i,j,k){let h=(i*374761393+j*668265263+(k||0)*2147483647)|0;h=(h^(h>>>13))*1274126177|0;return((h^(h>>>16))>>>0)/4294967296}
// close-up ground detail, only for the visible tiles
function drawGroundDetail(c,S,x0,y0,x1,y1,t,z,avoid){
  const TS=S.TS;const i0=Math.max(0,Math.floor(x0/TS)),i1=Math.min(S.GW-1,Math.floor(x1/TS)),j0=Math.max(0,Math.floor(y0/TS)),j1=Math.min(S.GH-1,Math.floor(y1/TS));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const k=j*S.GW+i,ter=S.ter[k];const cx=(i+.5)*TS,cy=(j+.5)*TS;
    let skip=false;for(const a of avoid)if(Math.hypot(a.x-cx,a.y-cy)<a.r){skip=true;break}
    if(S.rad[k]>0.15){for(let m=0;m<4;m++){const px=i*TS+hash2(i,j,m)*TS,py=j*TS+hash2(i,j,m+9)*TS;c.strokeStyle='rgba(30,30,28,.6)';c.lineWidth=0.5;c.beginPath();c.moveTo(px,py);c.lineTo(px+2,py-3);c.lineTo(px+3.2,py-1);c.stroke()}continue}
    if(ter<=1){if(z>3){c.strokeStyle=ter===0?'rgba(140,180,210,.13)':'rgba(170,205,225,.2)';c.lineWidth=0.4;for(let m=0;m<3;m++){const px=i*TS+hash2(i,j,m)*TS,py=j*TS+hash2(i,j,m+4)*TS+Math.sin(t*0.8+m+i)*0.8;c.beginPath();c.arc(px,py,2.2,3.5,5.9);c.stroke()}}continue}
    if(skip)continue;
    if(ter===3){for(let m=0;m<6;m++){const px=i*TS+hash2(i,j,m)*TS,py=j*TS+hash2(i,j,m+7)*TS,rr=1.6+hash2(i,j,m+3)*1.8;c.fillStyle='rgba(0,0,0,.25)';c.beginPath();c.arc(px+0.6,py+0.8,rr,0,6.28);c.fill();c.fillStyle=`hsl(${105+hash2(i,j,m+5)*30},${28+hash2(i,j,m+1)*14}%,${20+hash2(i,j,m+2)*10}%)`;c.beginPath();c.arc(px,py,rr,0,6.28);c.fill();c.fillStyle='rgba(170,200,120,.18)';c.beginPath();c.arc(px-rr*0.3,py-rr*0.35,rr*0.45,0,6.28);c.fill()}}
    else if(ter===2){c.strokeStyle='rgba(150,175,95,.45)';c.lineWidth=0.35;for(let m=0;m<7;m++){const px=i*TS+hash2(i,j,m)*TS,py=j*TS+hash2(i,j,m+11)*TS;c.beginPath();c.moveTo(px,py);c.lineTo(px-0.5,py-1.4);c.moveTo(px,py);c.lineTo(px+0.6,py-1.2);c.stroke()}if(hash2(i,j,99)<0.25){const px=i*TS+hash2(i,j,98)*TS,py=j*TS+hash2(i,j,97)*TS;c.fillStyle='rgba(20,40,20,.6)';c.beginPath();c.arc(px,py,2.4,0,6.28);c.fill()}}
    else if(ter===4){c.fillStyle='rgba(70,55,35,.4)';for(let m=0;m<4;m++){const px=i*TS+hash2(i,j,m)*TS,py=j*TS+hash2(i,j,m+5)*TS;c.beginPath();c.ellipse(px,py,0.9,0.6,0,0,6.28);c.fill()}}
    else if(ter===5){for(let m=0;m<3;m++){const px=i*TS+hash2(i,j,m)*TS,py=j*TS+hash2(i,j,m+5)*TS,s=2+hash2(i,j,m+8)*2;c.fillStyle='#6d6966';c.beginPath();c.moveTo(px-s,py+s*0.6);c.lineTo(px-s*0.3,py-s);c.lineTo(px+s,py+s*0.5);c.closePath();c.fill();c.fillStyle='rgba(255,255,255,.18)';c.beginPath();c.moveTo(px-s*0.3,py-s);c.lineTo(px-s*0.6,py+s*0.2);c.lineTo(px,py);c.closePath();c.fill()}}
  }
}

// ---------- towns ----------
function roofCol(f,b){const h=Math.round(f.hue),tc=f.tech;if(tc.industry)return`hsl(${h},18%,34%)`;if(tc.bronze||tc.agri)return`hsl(${(h+10)%360},42%,40%)`;return'#8f7748'}
function wallCol(f){return f.tech.industry?'#7d5a4c':f.tech.law?'#9a958a':'#6f5a3e'}
function streetCol(f){return f.tech.electricity?'#3a3c43':f.tech.law?'#8b877e':'#77684c'}
function drawPlot(c,p,z){c.save();c.translate(p.x,p.y);c.rotate(p.rot);c.fillStyle='#5a4730';c.fillRect(-7,-5,14,10);
  const g=p.grow;const col=g<0.12?'#6b5638':g>0.88?'hsl(46,62%,52%)':`hsl(${85-g*10},${35+g*20}%,${22+g*22}%)`;
  if(z>1.1){c.strokeStyle=col;c.lineWidth=1.2+g*0.6;for(let r=-3.6;r<=3.7;r+=2.4){c.beginPath();c.moveTo(-6.3,r);c.lineTo(6.3,r);c.stroke()}
    if(z>4&&g>0.3){c.fillStyle=col;for(let r=-3.6;r<=3.7;r+=2.4)for(let x=-6;x<=6;x+=1.5){c.beginPath();c.arc(x,r+Math.sin(x*3+r)*0.2,0.35+g*0.35,0,6.28);c.fill()}}}
  else{c.fillStyle=col;c.globalAlpha=0.7;c.fillRect(-6.5,-4.5,13,9);c.globalAlpha=1}
  c.strokeStyle='rgba(40,30,18,.6)';c.lineWidth=0.5;c.strokeRect(-7,-5,14,10);c.restore()}
function drawStreets(c,s,f,z){
  if(!s.bld||s.bld.length<2)return;const col=streetCol(f);c.strokeStyle=col;c.lineCap='round';
  for(const sp of s.spokes){let md=0;const ca=Math.cos(sp.a),sa=Math.sin(sp.a);for(const b of s.bld){const dx=b.x-s.x,dy=b.y-s.y;const along=dx*ca+dy*sa,perp=Math.abs(-dx*sa+dy*ca);if(along>0&&perp<10)md=Math.max(md,along)}if(md<5)continue;
    c.lineWidth=3.2;c.beginPath();c.moveTo(s.x,s.y);c.lineTo(s.x+ca*(md+5),s.y+sa*(md+5));c.stroke();
    if(f.tech.industry&&z>2.5){c.strokeStyle='rgba(240,220,140,.5)';c.lineWidth=0.3;c.setLineDash([1.2,1.2]);c.beginPath();c.moveTo(s.x,s.y);c.lineTo(s.x+ca*(md+5),s.y+sa*(md+5));c.stroke();c.setLineDash([]);c.strokeStyle=col}}
  if(s.level>=2){const tr=S.townRadius(s);c.lineWidth=2.4;c.beginPath();c.arc(s.x,s.y,tr*0.55,0,6.28);c.stroke()}
}
function drawWalls(c,s,f){const tr=S.townRadius(s)+4;c.strokeStyle=f.tech.industry?'#6d6a66':'#958f84';c.lineWidth=2.4;const gaps=s.spokes.map(sp=>sp.a);
  const N=64;for(let k=0;k<N;k++){const a0=k/N*6.283,a1=(k+1)/N*6.283;const mid=(a0+a1)/2;if(gaps.some(g=>Math.abs(((mid-g+9.42)%6.283)-3.14)<0.12))continue;c.beginPath();c.arc(s.x,s.y,tr,a0,a1+0.01);c.stroke()}
  c.fillStyle='#a49e92';for(let k=0;k<8;k++){const a=k/8*6.283+0.2;c.beginPath();c.arc(s.x+Math.cos(a)*tr,s.y+Math.sin(a)*tr,1.6,0,6.28);c.fill()}}
function puff(c,x,y,t,seed,dark){for(let k=0;k<3;k++){const ph=((t*0.35+k/3+seed*0.17)%1);c.fillStyle=dark?`rgba(70,70,72,${0.45*(1-ph)})`:`rgba(220,220,225,${0.4*(1-ph)})`;c.beginPath();c.arc(x+ph*5+Math.sin(ph*6+seed)*1.2,y-ph*10,1+ph*3.5,0,6.28);c.fill()}}
function drawBuilding(c,b,f,t,z,s){
  const h=Math.round(f.hue);const style=ARCH[f.arch]?ARCH[f.arch].style:'town';const roof=roofCol(f,b),wall=wallCol(f);
  c.save();c.translate(b.x,b.y);c.rotate(b.rot+Math.PI/2);
  if(z<0.9){c.fillStyle=b.t==='den'?'#2a221c':b.t==='hut'?'#8f7748':roof;c.fillRect(-3,-3,6,6);c.restore();return}
  if(b.prog<1){c.strokeStyle='#c9b48a';c.lineWidth=0.5;c.setLineDash([1,1]);c.strokeRect(-4.5,-4,9,8);c.setLineDash([]);c.fillStyle=wall;c.fillRect(-4.5,4-8*b.prog,9,8*b.prog);c.strokeStyle='#8a6a40';c.lineWidth=0.4;for(let k=-4;k<=4;k+=2.5){c.beginPath();c.moveTo(k,-4);c.lineTo(k,4);c.stroke()}c.restore();return}
  const shadow=()=>{c.fillStyle='rgba(0,0,0,.25)'};
  const box=(w,hh,rf,wl)=>{shadow();c.fillRect(-w/2+1,-hh/2+1.2,w,hh);c.fillStyle=wl;c.fillRect(-w/2,-hh/2,w,hh);c.fillStyle=rf;c.fillRect(-w/2-0.4,-hh/2-0.4,w+0.8,hh/2+0.4);c.fillStyle='rgba(0,0,0,.18)';c.fillRect(-w/2-0.4,0,w+0.8,hh/2+0.4);c.strokeStyle='rgba(20,15,10,.5)';c.lineWidth=0.35;c.strokeRect(-w/2,-hh/2,w,hh)};
  const lit=f.tech.electricity;
  const windows=(w,hh)=>{if(!lit||z<2.5)return;c.fillStyle='rgba(255,220,130,.85)';for(let x=-w/2+1.5;x<w/2-1;x+=2.2){c.fillRect(x,hh/2-1.6,0.8,0.8)}};
  if(b.t==='den'||(b.t==='hall'&&f.g.intellect<0.4)){const rr=b.t==='hall'?7:4.5;c.fillStyle='#2b231d';c.beginPath();for(let k=0;k<9;k++){const a=k/9*6.283;const d=rr*(0.8+hash2(b.x|0,b.y|0,k)*0.35);c.lineTo(Math.cos(a)*d,Math.sin(a)*d)}c.closePath();c.fill();c.fillStyle='#120e0b';c.beginPath();c.ellipse(0,rr*0.35,rr*0.35,rr*0.25,0,0,6.28);c.fill();
    c.strokeStyle='#d9cfbd';c.lineWidth=0.5;for(let k=0;k<3;k++){const a=hash2(b.x|0,k,7)*6.28;const d=rr+1+k;c.beginPath();c.moveTo(Math.cos(a)*d,Math.sin(a)*d);c.lineTo(Math.cos(a)*d+1.5,Math.sin(a)*d+0.6);c.stroke()}
    if(Math.sin(t*1.3+b.x)>0.3){c.fillStyle=`hsl(${(h+10)%360},90%,55%)`;c.fillRect(-1,rr*0.3,0.6,0.4);c.fillRect(0.6,rr*0.3,0.6,0.4)}c.restore();return}
  if(style==='dome'&&(b.t==='house'||b.t==='hut'||b.t==='hall')){const rr=b.t==='hall'?6:3.6;c.fillStyle=`hsla(${h},45%,62%,.85)`;c.beginPath();c.arc(0,0,rr,0,6.28);c.fill();c.strokeStyle=`hsl(${h},40%,30%)`;c.lineWidth=0.5;c.stroke();c.fillStyle='rgba(255,255,255,.4)';c.beginPath();c.arc(-rr*0.35,-rr*0.35,rr*0.3,0,6.28);c.fill();c.restore();return}
  if(style==='spire'&&(b.t==='house'||b.t==='hut'||b.t==='hall')){const hh=b.t==='hall'?14:8;c.fillStyle='rgba(0,0,0,.3)';c.beginPath();c.moveTo(-1.8,0);c.lineTo(hh*0.6,hh*0.3);c.lineTo(1.8,0);c.fill();c.fillStyle=`hsl(${h},20%,62%)`;c.beginPath();c.moveTo(-2.2,1);c.lineTo(0,-hh);c.lineTo(2.2,1);c.closePath();c.fill();c.fillStyle=roof;c.beginPath();c.arc(0,-hh*0.65,1,0,6.28);c.fill();c.restore();return}
  if(style==='stones'&&(b.t==='house'||b.t==='hut')){c.fillStyle='#7d8088';c.fillRect(-1.6,-3.2,3.2,6.4);c.fillStyle='rgba(0,0,0,.3)';c.fillRect(1.6,-3.2,1.2,6.4);c.fillStyle=`hsla(${h},80%,65%,${0.3+0.3*Math.sin(t+b.x)})`;c.beginPath();c.arc(0,0,1,0,6.28);c.fill();c.restore();return}
  switch(b.t){
    case'hut':{shadow();c.beginPath();c.arc(0.8,1,3.4,0,6.28);c.fill();c.fillStyle='#9a8150';c.beginPath();c.arc(0,0,3.4,0,6.28);c.fill();c.strokeStyle='#6b5530';c.lineWidth=0.4;for(let k=0;k<6;k++){const a=k*1.047;c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(a)*3.3,Math.sin(a)*3.3);c.stroke()}c.fillStyle='#3d3020';c.beginPath();c.arc(0,0,0.7,0,6.28);c.fill();break}
    case'house':box(7,6,roof,wall);windows(7,6);if(z>2.2){c.fillStyle='#3a2a1a';c.fillRect(-0.7,2.2,1.4,0.8)}if(!lit&&f.tech.agri&&hash2(b.x|0,b.y|0,1)<0.5)puff(c,2,-2,t,b.x,false);break;
    case'hall':box(13,10,f.tech.law?`hsl(${(h+10)%360},50%,38%)`:roof,wall);windows(13,10);c.strokeStyle='#2a2216';c.lineWidth=0.5;c.beginPath();c.moveTo(0,-5);c.lineTo(0,-11);c.stroke();c.fillStyle=`hsl(${h},70%,52%)`;c.beginPath();c.moveTo(0,-11);c.lineTo(5,-10+Math.sin(t*4+b.x)*0.5);c.lineTo(0,-8.5);c.closePath();c.fill();break;
    case'granary':{shadow();c.beginPath();c.arc(1,1,4.2,0,6.28);c.fill();c.fillStyle='#b59a62';c.beginPath();c.arc(0,0,4.2,0,6.28);c.fill();c.strokeStyle='#7d6538';c.lineWidth=0.4;for(let k=0;k<8;k++){const a=k*0.785;c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(a)*4.1,Math.sin(a)*4.1);c.stroke()}c.fillStyle=s&&s.store>s.members.length*4?'#e1c06a':'#6b5a3a';c.beginPath();c.arc(0,0,1.2,0,6.28);c.fill();break}
    case'workshop':box(9,7,'#6e6a64',wall);c.fillStyle='#4a4440';c.fillRect(2.5,-5,1.6,2.4);puff(c,3.3,-5,t,b.y,true);break;
    case'market':{box(12,9,'#8a7a5a','#c9b48a');const cols=[`hsl(${h},70%,55%)`,`hsl(${(h+40)%360},70%,55%)`,`hsl(${(h+200)%360},60%,55%)`];for(let k=0;k<4;k++){c.fillStyle=cols[k%3];c.fillRect(-5+k*2.6,-3.8,2,3);c.fillStyle='rgba(255,255,255,.4)';c.fillRect(-5+k*2.6,-3.8,2,0.6)}break}
    case'temple':{shadow();c.fillRect(-6,-6,13,14);c.fillStyle='#b8ad94';c.fillRect(-6.5,-7,13,14);c.fillStyle='#cfc4aa';c.fillRect(-4.5,-5,9,10);c.fillStyle='#e2d9c0';c.fillRect(-2.5,-3,5,6);c.fillStyle=f.gov==='theocracy'?'hsl(46,80%,60%)':`hsl(${h},60%,55%)`;c.beginPath();c.arc(0,0,1.4+0.3*Math.sin(t*2),0,6.28);c.fill();break}
    case'library':{box(12,8,'#7f7a70','#d6cfbd');c.fillStyle='#efe9da';for(let x=-5;x<=5;x+=2){c.fillRect(x-0.35,1,0.7,3)}break}
    case'barracks':{box(14,7,'#5d5248','#8a7d6a');c.fillStyle=`hsl(${h},70%,45%)`;c.fillRect(5,-6,0.5,3);c.fillRect(5.5,-6,2.5,1.4);break}
    case'factory':{box(15,10,'#4c4846','#7a5d50');c.fillStyle='#3a3534';c.fillRect(3,-8.5,2,4);c.fillRect(-1,-8,2,3.5);puff(c,4,-8.5,t,b.x,true);puff(c,0,-8,t,b.y+3,true);if(lit){c.fillStyle='rgba(255,210,120,.8)';c.fillRect(-6,2,2,1);c.fillRect(-2,2,2,1)}break}
    case'watch':{shadow();c.beginPath();c.arc(0.8,0.8,2.6,0,6.28);c.fill();c.fillStyle='#55585e';c.beginPath();c.arc(0,0,2.6,0,6.28);c.fill();c.fillStyle='#e8e2a0';c.beginPath();c.arc(0,0,0.9,0,6.28);c.fill();
      const a=t*0.7+b.x;const g=c.createRadialGradient(0,0,1,0,0,26);g.addColorStop(0,'rgba(255,245,180,.35)');g.addColorStop(1,'rgba(255,245,180,0)');c.fillStyle=g;c.beginPath();c.moveTo(0,0);c.arc(0,0,26,a-0.22,a+0.22);c.closePath();c.fill();break}
    case'studio':{box(9,8,`hsl(${(h+180)%360},50%,55%)`,'#e7dcc8');for(let k=0;k<5;k++){c.fillStyle=`hsl(${(h+k*70)%360},75%,58%)`;c.beginPath();c.arc(-3+k*1.5,2+Math.sin(k)*0.8,0.7,0,6.28);c.fill()}break}
  }
  c.restore();
}
function drawTown(c,s,f,t,z){
  const tr=S.townRadius(s);const h=Math.round(f.hue);
  c.fillStyle=`hsla(${h},14%,24%,.32)`;c.beginPath();c.arc(s.x,s.y,tr+6,0,6.28);c.fill();
  for(const p of s.plots)drawPlot(c,p,z);
  if(z>0.7)drawStreets(c,s,f,z);
  if(s.walls&&z>0.7)drawWalls(c,s,f);
  const bl=s.bld.slice().sort((a,b)=>a.y-b.y);for(const b of bl)drawBuilding(c,b,f,t,z,s);
  if(f.golden&&z>1){for(let k=0;k<6;k++){const a=k*1.05+t*0.05;c.fillStyle=`hsla(${(h+k*60)%360},80%,60%,.5)`;c.beginPath();c.arc(s.x+Math.cos(a)*(tr+2),s.y+Math.sin(a)*(tr+2),1.4,0,6.28);c.fill()}}
  if(s.atkT&&CURYEAR-s.atkT<1.5){for(let k=0;k<5;k++){const a=t*2+k*1.7;c.fillStyle=`hsla(${20+k*8},95%,${55+Math.sin(t*12+k)*10}%,.85)`;c.beginPath();c.arc(s.x+Math.cos(a+k)*tr*0.4,s.y+Math.sin(a*0.7+k)*tr*0.4,1.6+Math.sin(t*9+k)*0.6,0,6.28);c.fill()}
    c.strokeStyle='rgba(0,0,0,.5)';c.lineWidth=2;c.beginPath();c.arc(s.x,s.y,tr+9,0,6.28);c.stroke();c.strokeStyle=s.hp/s.maxhp>0.4?'#d9a54e':'#cf5843';c.beginPath();c.arc(s.x,s.y,tr+9,-1.57,-1.57+6.28*Math.max(0,s.hp/s.maxhp));c.stroke()}
}
function drawWonder(c,w,f,t,z){const h=Math.round(f?f.hue:30);c.save();c.translate(w.x,w.y);
  c.fillStyle='rgba(0,0,0,.3)';c.beginPath();c.ellipse(2,3,11,7,0,0,6.28);c.fill();
  switch(w.val){
    case'faith':c.fillStyle='#d8cfb4';c.beginPath();c.moveTo(-9,6);c.lineTo(0,-16);c.lineTo(9,6);c.closePath();c.fill();c.fillStyle='rgba(0,0,0,.2)';c.beginPath();c.moveTo(0,-16);c.lineTo(9,6);c.lineTo(0,6);c.closePath();c.fill();c.fillStyle='hsl(46,90%,62%)';c.beginPath();c.arc(0,-16,1.6+0.4*Math.sin(t*2),0,6.28);c.fill();break;
    case'knowledge':c.fillStyle='#cfc8b8';c.fillRect(-9,-2,18,8);c.fillStyle='#8a94a0';c.beginPath();c.arc(0,-2,6,Math.PI,0);c.fill();c.strokeStyle='#3a3f46';c.lineWidth=0.6;c.beginPath();c.moveTo(0,-4);c.lineTo(5,-10);c.stroke();break;
    case'martial':c.fillStyle='#8a7e70';c.fillRect(-9,-8,4,14);c.fillRect(5,-8,4,14);c.fillRect(-9,-10,18,4);c.fillStyle=`hsl(${h},70%,45%)`;c.fillRect(-1,-14,0.6,4);c.fillRect(-0.4,-14,4,2);break;
    case'trade':c.fillStyle='#c9a54e';c.fillRect(-10,-6,20,12);c.fillStyle='#e9cf7a';for(let k=0;k<5;k++)c.fillRect(-9+k*4,-5,3,3);c.strokeStyle='#7a6127';c.lineWidth=0.5;c.strokeRect(-10,-6,20,12);break;
    case'order':c.fillStyle='#5c5f66';c.beginPath();c.arc(0,0,9,0,6.28);c.fill();c.fillStyle='#3d4047';c.beginPath();c.arc(0,0,5,0,6.28);c.fill();c.fillStyle='#e8e2a0';c.beginPath();c.arc(0,0,1.5,0,6.28);c.fill();break;
    case'harmony':for(let k=0;k<9;k++){const a=k*0.7,d=3+k*0.7;c.fillStyle=`hsl(${100+k*8},40%,${28+k*3}%)`;c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d,2.6,0,6.28);c.fill()}c.fillStyle='#6fa7c4';c.beginPath();c.arc(0,0,2.6,0,6.28);c.fill();break;
    default:c.fillStyle=`hsl(${h},55%,58%)`;c.beginPath();c.arc(0,0,8,Math.PI,0);c.fill();c.fillRect(-8,0,16,5);for(let k=0;k<6;k++){c.fillStyle=`hsl(${(h+k*60)%360},80%,60%)`;c.fillRect(-7+k*2.4,1,1.6,3)}
  }c.restore()}
function drawBeast(c,g,z,t){const s=g.size*1.6;c.save();c.translate(g.x,g.y);c.rotate(g.h);
  if(z<2){c.fillStyle='#a68a62';c.beginPath();c.arc(0,0,1.6*s,0,6.28);c.fill();c.restore();return}
  const sw=Math.sin(g.phase)*0.6*(g.moving?1:0);c.strokeStyle='#4d3d29';c.lineWidth=0.45*s;
  for(const [lx,side] of [[1.3,1],[1.3,-1],[-1.3,1],[-1.3,-1]]){const ph=lx>0?sw:-sw;c.beginPath();c.moveTo(lx*s,side*0.8*s);c.lineTo((lx+ph*side)*s,side*1.9*s);c.stroke()}
  c.fillStyle='#a68a62';c.beginPath();c.ellipse(0,0,2.4*s,1.3*s,0,0,6.28);c.fill();c.fillStyle='#8c7250';c.beginPath();c.arc(2.6*s,0,0.95*s,0,6.28);c.fill();
  c.strokeStyle='#5a4a33';c.lineWidth=0.3*s;c.beginPath();c.moveTo(2.6*s,-0.5*s);c.lineTo(3.4*s,-1.3*s);c.moveTo(2.6*s,0.5*s);c.lineTo(3.4*s,1.3*s);c.stroke();c.restore()}
function drawRuin(c,r){const rr=mulberry32(Math.round(r.x*31+r.y*17));c.save();c.translate(r.x,r.y);
  if(r.nuked){const g=c.createRadialGradient(0,0,4,0,0,40);g.addColorStop(0,'rgba(15,14,12,.85)');g.addColorStop(1,'rgba(15,14,12,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,40,0,6.28);c.fill()}
  c.fillStyle=r.silent?'rgba(200,210,225,.12)':'rgba(20,18,16,.45)';c.beginPath();c.arc(0,0,10+r.lvl*5,0,6.28);c.fill();c.strokeStyle=r.silent?'rgba(210,220,235,.6)':'rgba(170,160,150,.55)';c.lineWidth=0.8;for(let k=0;k<5+r.lvl*4;k++){const a=rr()*6.28,d=rr()*(7+r.lvl*5);const x=Math.cos(a)*d,y=Math.sin(a)*d;c.beginPath();c.moveTo(x-2,y-1.5);c.lineTo(x+2,y-1.5);c.lineTo(x+2,y+1);c.stroke()}c.restore()}


export { buildTerrainCanvas, drawBeast, drawCreature, drawGroundDetail, drawRuin, drawTown, drawWonder, portrait };
