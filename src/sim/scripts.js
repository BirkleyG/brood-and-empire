import { CONCEPTS } from './data.js';

// ================= WRITING SYSTEMS =================
// Romanized forms are written into real-world scripts phonetically.
const HAN={sun:'日',moon:'月',water:'水',river:'川',stone:'石',hill:'丘',tree:'木',fire:'火',eye:'目',home:'家',people:'人',blood:'血',sky:'天',mother:'母',war:'戰',peace:'和',god:'神',king:'王',free:'由',true:'真',new:'新',great:'大',death:'死',star:'星',beast:'獸',tooth:'牙',wing:'羽',wave:'波',field:'田',gate:'門',song:'歌',iron:'鐵',word:'言',dust:'塵',light:'光',shadow:'影',bone:'骨',seed:'種',horn:'角',deep:'深',high:'高',ash:'灰'};
const ALPHA={
  cyrillic:{p:'п',t:'т',k:'к',b:'б',d:'д',g:'г',m:'м',n:'н',s:'с',z:'з',f:'ф',v:'в',h:'х',l:'л',r:'р',w:'ў',y:'й',ch:'ч',sh:'ш',th:'ѳ',a:'а',e:'е',i:'и',o:'о',u:'у'},
  greek:{p:'π',t:'τ',k:'κ',b:'β',d:'δ',g:'γ',m:'μ',n:'ν',s:'σ',z:'ζ',f:'φ',v:'β',h:'χ',l:'λ',r:'ρ',w:'ϝ',y:'ι',ch:'χ',sh:'σ',th:'θ',a:'α',e:'ε',i:'ι',o:'ο',u:'υ'},
  georgian:{p:'პ',t:'ტ',k:'კ',b:'ბ',d:'დ',g:'გ',m:'მ',n:'ნ',s:'ს',z:'ზ',f:'ფ',v:'ვ',h:'ჰ',l:'ლ',r:'რ',w:'ვ',y:'ჲ',ch:'ჩ',sh:'შ',th:'თ',a:'ა',e:'ე',i:'ი',o:'ო',u:'უ'},
  armenian:{p:'պ',t:'տ',k:'կ',b:'բ',d:'դ',g:'գ',m:'մ',n:'ն',s:'ս',z:'զ',f:'ֆ',v:'վ',h:'հ',l:'լ',r:'ր',w:'ւ',y:'յ',ch:'չ',sh:'շ',th:'թ',a:'ա',e:'ե',i:'ի',o:'ո',u:'ու'},
  runic:{p:'ᛈ',t:'ᛏ',k:'ᚲ',b:'ᛒ',d:'ᛞ',g:'ᚷ',m:'ᛗ',n:'ᚾ',s:'ᛊ',z:'ᛉ',f:'ᚠ',v:'ᚹ',h:'ᚺ',l:'ᛚ',r:'ᚱ',w:'ᚹ',y:'ᛃ',ch:'ᛇ',sh:'ᛋ',th:'ᚦ',a:'ᚨ',e:'ᛖ',i:'ᛁ',o:'ᛟ',u:'ᚢ'},
  arabic:{p:'پ',t:'ت',k:'ك',b:'ب',d:'د',g:'گ',m:'م',n:'ن',s:'س',z:'ز',f:'ف',v:'ڤ',h:'ه',l:'ل',r:'ر',w:'و',y:'ي',ch:'چ',sh:'ش',th:'ث',a:'ا',e:'ي',i:'ي',o:'و',u:'و'},
  hebrew:{p:'פ',t:'ת',k:'כ',b:'ב',d:'ד',g:'ג',m:'מ',n:'נ',s:'ס',z:'ז',f:'פ',v:'ו',h:'ה',l:'ל',r:'ר',w:'ו',y:'י',ch:'צ',sh:'ש',th:'ת',a:'א',e:'י',i:'י',o:'ו',u:'ו'},
};
const HEB_FINAL={'כ':'ך','מ':'ם','נ':'ן','פ':'ף','צ':'ץ'};
const DEVA_C={p:'प',t:'त',k:'क',b:'ब',d:'द',g:'ग',m:'म',n:'न',s:'स',z:'ज़',f:'फ़',v:'व',h:'ह',l:'ल',r:'र',w:'व',y:'य',ch:'च',sh:'श',th:'थ'};
const DEVA_V={a:'अ',e:'ए',i:'इ',o:'ओ',u:'उ'},DEVA_M={a:'',e:'े',i:'ि',o:'ो',u:'ु'};
const KANA={'':'アイウエオ',k:'カキクケコ',g:'ガギグゲゴ',s:'サシスセソ',z:'ザジズゼゾ',t:'タチツテト',d:'ダヂヅデド',n:'ナニヌネノ',h:'ハヒフヘホ',b:'バビブベボ',p:'パピプペポ',m:'マミムメモ',y:'ヤイユエヨ',r:'ラリルレロ',l:'ラリルレロ',w:'ワヰウヱヲ',f:'ハヒフヘホ',v:'バビブベボ',ch:'チチチチチ',sh:'シシシシシ',th:'サシスセソ'};
const KANA_EXT={ch:['チャ','チ','チュ','チェ','チョ'],sh:['シャ','シ','シュ','シェ','ショ'],f:['ファ','フィ','フ','フェ','フォ'],v:['ヴァ','ヴィ','ヴ','ヴェ','ヴォ']};
const VI={a:0,i:1,u:2,e:3,o:4};
const ETH_BASE={'':0x12A0,h:0x1200,l:0x1208,m:0x1218,r:0x1228,s:0x1230,sh:0x1238,k:0x12A8,b:0x1260,v:0x1268,t:0x1270,ch:0x1278,n:0x1290,w:0x12C8,z:0x12D8,y:0x12E8,d:0x12F0,g:0x1308,th:0x1320,p:0x1350,f:0x1348};
const ETH_OFF={a:3,u:1,i:2,e:4,o:6,'':5};
const CANS={'':'ᐁᐃᐅᐊ',p:'ᐯᐱᐳᐸ',t:'ᑌᑎᑐᑕ',k:'ᑫᑭᑯᑲ',ch:'ᒉᒋᒍᒐ',m:'ᒣᒥᒧᒪ',n:'ᓀᓂᓄᓇ',s:'ᓭᓯᓱᓴ',y:'ᔦᔨᔪᔭ',l:'ᓓᓕᓗᓚ',r:'ᕃᕆᕈᕋ',f:'ᕓᕕᕗᕙ',sh:'ᔐᔑᔓᔕ',w:'ᐌᐎᐒᐗ'};
const CANS_ALIAS={b:'p',d:'t',g:'k',z:'s',v:'f',th:'t',h:'k'};
const CANS_FIN={p:'ᑉ',t:'ᑦ',k:'ᒃ',m:'ᒻ',n:'ᓐ',s:'ᔅ',l:'ᓪ',r:'ᕐ',y:'ᔾ',sh:'ᔥ',ch:'ᒡ',w:'ᐤ',f:'ᕝ',h:'ᐦ'};
const CHEROKEE='ᎠᎡᎢᎣᎤᎦᎨᎩᎪᎫᎭᎮᎯᎰᎱᎳᎴᎵᎶᎷᎹᎺᎻᎼᎽᎾᏁᏂᏃᏄᏆᏇᏈᏉᏊᏌᏎᏏᏐᏑᏓᏕᏗᏙᏚᏜᏞᏟᏠᏡᏣᏤᏥᏦᏧᏩᏪᏫᏬᏭᏯᏰᏱᏲᏳᎧᏍᎬᏀᏅᏒᏔᏛᏢᏨᏮᏴ';
const SCRIPT_INFO={
  picto:{kind:'picto',label:'Pictographs',like:'cave paintings'},
  han:{kind:'logo',label:'Logograms',like:'Chinese characters'},
  kana:{kind:'syll',label:'Syllabary',like:'Japanese kana'},
  ethiopic:{kind:'syll',label:'Syllabary',like:'Ge’ez (Ethiopic)'},
  cans:{kind:'syll',label:'Syllabics',like:'Canadian syllabics'},
  cherokee:{kind:'syll',label:'Syllabary',like:'Cherokee'},
  cyrillic:{kind:'alpha',label:'Alphabet',like:'Cyrillic'},
  greek:{kind:'alpha',label:'Alphabet',like:'Greek'},
  georgian:{kind:'alpha',label:'Alphabet',like:'Georgian'},
  armenian:{kind:'alpha',label:'Alphabet',like:'Armenian'},
  runic:{kind:'alpha',label:'Runes',like:'Norse runes'},
  arabic:{kind:'abjad',label:'Abjad',like:'Arabic',rtl:1},
  hebrew:{kind:'abjad',label:'Abjad',like:'Hebrew',rtl:1},
  devanagari:{kind:'abugida',label:'Abugida',like:'Devanagari'},
};
const SYLL_POOLS=['kana','ethiopic','cans','cherokee'],ALPHA_POOLS=['cyrillic','greek','georgian','armenian','runic','arabic','hebrew','devanagari'];
function phonemes(w){const out=[];w=String(w).toLowerCase();for(let i=0;i<w.length;i++){const d=w.slice(i,i+2);if(d==='ch'||d==='sh'||d==='th'){out.push(d);i++}else if(/[a-z]/.test(w[i]))out.push(w[i])}return out}
const isV=p=>/^[aeiou]$/.test(p);
function sylls(ps){const out=[];let i=0;while(i<ps.length){let c='',v='',coda='';if(!isV(ps[i])){c=ps[i];i++}if(i<ps.length&&isV(ps[i])){v=ps[i];i++;if(i<ps.length&&isV(ps[i])&&ps[i]!==v){out.push({c,v,coda:''});c='';v=ps[i];i++}}
    if(i<ps.length&&!isV(ps[i])&&(i+1>=ps.length||!isV(ps[i+1]))){coda=ps[i];i++}
    if(!v&&c){coda=c;c=''}out.push({c,v,coda})}return out}
function writeScript(form,concepts,sc,swaps){
  if(!sc||sc==='picto')return concepts?concepts.map(c=>CONCEPTS[c]).join(''):'';
  if(sc==='han')return concepts?concepts.map(c=>HAN[c]||'言').join(''):'';
  let ps=phonemes(form);if(swaps)ps=ps.map(p=>swaps[p]||p);
  if(ALPHA[sc]&&sc!=='arabic'&&sc!=='hebrew')return ps.map(p=>ALPHA[sc][p]||'').join('');
  if(sc==='arabic'||sc==='hebrew'){const T=ALPHA[sc];let out=ps.map((p,i)=>{if(isV(p)){if(i===0||i===ps.length-1||p==='a'&&sc==='arabic'&&i%2===1)return T[p];return(p==='o'||p==='u')&&i%2?T[p]:''}return T[p]||''}).join('');if(sc==='hebrew'){const l=out.slice(-1);if(HEB_FINAL[l])out=out.slice(0,-1)+HEB_FINAL[l]}return out}
  if(sc==='devanagari'){let out='';for(let i=0;i<ps.length;i++){const p=ps[i];if(isV(p)){out+=DEVA_V[p];continue}const c=DEVA_C[p]||'';const nx=ps[i+1];if(nx&&isV(nx)){out+=c+DEVA_M[nx];i++}else out+=c+'्'}return out}
  const sy=sylls(ps);let out='';
  for(const s of sy){
    if(sc==='kana'){if(s.v){const ext=KANA_EXT[s.c];out+=ext?ext[VI[s.v]]:(KANA[s.c]||KANA[''])[VI[s.v]]}if(s.coda){out+=s.coda==='n'||s.coda==='m'?'ン':s.coda==='t'||s.coda==='d'?'ト':(KANA[s.coda]||'ウウウウウ')[2]}}
    else if(sc==='ethiopic'){const base=c=>ETH_BASE[c]!=null?ETH_BASE[c]:ETH_BASE[''];if(s.v)out+=String.fromCodePoint(base(s.c)+(s.c===''?({a:0,u:1,i:2,e:4,o:6}[s.v]):ETH_OFF[s.v]));if(s.coda)out+=String.fromCodePoint(base(s.coda)+5)}
    else if(sc==='cans'){const row=c=>CANS[c]||CANS[CANS_ALIAS[c]]||CANS[''];const vi={e:0,i:1,o:2,u:2,a:3};if(s.v)out+=row(s.c)[vi[s.v]];if(s.coda)out+=CANS_FIN[s.coda]||CANS_FIN[CANS_ALIAS[s.coda]]||'ᐦ'}
    else if(sc==='cherokee'){const C=['','g','h','l','m','n','kw','s','d','dl','j','w','y','k','t','r','b','p','f','v','z','ch','sh','th'];const idx=(c,v)=>{let ci=C.indexOf(c);if(ci<0)ci=(c.charCodeAt(0)*7)%C.length;return(ci*5+VI[v])%CHEROKEE.length};if(s.v)out+=CHEROKEE[idx(s.c,s.v)];if(s.coda)out+=CHEROKEE[idx(s.coda,'u')]}
  }
  return out;
}


export { ALPHA_POOLS, SCRIPT_INFO, SYLL_POOLS, writeScript };
