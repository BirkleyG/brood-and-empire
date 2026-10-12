// ================= PERSISTENCE CORE: pack the whole living world into plain data =================
// A generic graph packer: keeps shared references and cycles (agents that point at agents, towns
// that point at factions), typed arrays, Sets and Maps. Functions are dropped and re-attached.
const PK_SKIP=new Set(['onEvent','onYear','TENETS','GOVS','BT','rng','fxq']);
function taToB64(v){const u=new Uint8Array(v.buffer,v.byteOffset,v.byteLength);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return(typeof btoa!=='undefined'?btoa(s):Buffer.from(s,'binary').toString('base64'))}
function b64ToU8(b){const s=typeof atob!=='undefined'?atob(b):Buffer.from(b,'base64').toString('binary');const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u}
const TA_CTORS={Float32Array,Float64Array,Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Uint8ClampedArray};
function packGraph(root,skip){
  const ids=new Map(),out=[],queue=[];
  const enc=v=>{
    if(v===null)return null;const t=typeof v;
    if(t==='function'||t==='undefined'||t==='symbol')return undefined;
    if(t==='number')return Number.isFinite(v)?(Number.isInteger(v)?v:Math.round(v*1e5)/1e5):{$n:String(v)};
    if(t!=='object')return v;
    let id=ids.get(v);if(id!=null)return{$r:id};
    id=out.length;ids.set(v,id);out.push(0);queue.push(v);return{$r:id}};
  enc(root);
  for(let q=0;q<queue.length;q++){const v=queue[q],id=ids.get(v);let rec;
    if(ArrayBuffer.isView(v))rec={$t:v.constructor.name,b:taToB64(v)};
    else if(v instanceof Set)rec={$s:[...v].map(x=>{const e=enc(x);return e===undefined?null:e})};
    else if(v instanceof Map)rec={$m:[...v].map(([k,x])=>[enc(k),enc(x)===undefined?null:enc(x)])};
    else if(Array.isArray(v))rec={$a:v.map(x=>{const e=enc(x);return e===undefined?null:e})};
    else{const o={};for(const k of Object.keys(v)){if(q===0&&skip&&skip.has(k))continue;const e=enc(v[k]);if(e!==undefined)o[k]=e}rec={$o:o}}
    out[id]=rec}
  return out}
function unpackGraph(recs){
  const objs=recs.map(r=>{
    if(r.$t){const u=b64ToU8(r.b);const C=TA_CTORS[r.$t]||Uint8Array;return new C(u.buffer,0,u.byteLength/(C.BYTES_PER_ELEMENT||1))}
    if(r.$s)return new Set();if(r.$m)return new Map();if(r.$a)return new Array(r.$a.length);return{}});
  const dec=e=>e===null||typeof e!=='object'?e:e.$r!=null?objs[e.$r]:e.$n!=null?Number(e.$n):e;
  recs.forEach((r,i)=>{const o=objs[i];
    if(r.$s)for(const x of r.$s)o.add(dec(x));
    else if(r.$m)for(const [k,x] of r.$m)o.set(dec(k),dec(x));
    else if(r.$a)for(let j=0;j<r.$a.length;j++)o[j]=dec(r.$a[j]);
    else if(r.$o)for(const k in r.$o)o[k]=dec(r.$o[k])});
  return objs[0]}

// Snapshot a running sim (closure-held state is reached through S; the RNG state is exposed).
function snapshotSim(S){return{v:1,seed:S.seed,size:S.size||'standard',rng:S.rng.get(),g:packGraph(S,PK_SKIP)}}
// Rebuild a fresh sim from the seed, then pour the saved state into it *in place*, so the
// sim's internal closures (which hold the same arrays and typed arrays) see the restored world.
function restoreSim(snap,makeSimFn){
  // older saves have no `size`: they were all made at the original (Standard) world size
  const S=makeSimFn(snap.seed,{size:snap.size||'standard'});const D=unpackGraph(snap.g);
  for(const k of Object.keys(D)){const cur=S[k],val=D[k];
    if(typeof cur==='function')continue;
    if(ArrayBuffer.isView(cur)&&ArrayBuffer.isView(val)&&cur.length===val.length){cur.set(val);continue}
    if(Array.isArray(cur)&&Array.isArray(val)){cur.length=0;for(const x of val)cur.push(x);
      // keep internal identity: any restored object pointing at the saved array now points at the live one
      continue}
    if(cur&&val&&typeof cur==='object'&&typeof val==='object'&&!(cur instanceof Set)&&!(cur instanceof Map)&&!ArrayBuffer.isView(cur)&&!Array.isArray(val)){for(const x of Object.keys(cur))delete cur[x];Object.assign(cur,val);continue}
    S[k]=val}
  S.rng.put(snap.rng);S.rehydrate();return S}


export { b64ToU8, restoreSim, snapshotSim, taToB64 };
