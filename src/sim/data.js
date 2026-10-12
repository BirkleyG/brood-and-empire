// ================= SIMULATION CORE v2: choices =================
const TEMPER={gentle:{aggression:.16,sociality:.72,symbiosis:.55,carnivory:.12},curious:{intellect:.62,curiosity:.75,weirdness:.5},fierce:{aggression:.66,carnivory:.58,armor:.45},devout:{mystic:.68,glow:.45,sociality:.62}};
function creatureGenome(form,temper){const base={size:.3,speed:.35,armor:.2,aggression:.3,sociality:.55,intellect:.45,fertility:.55,carnivory:.3,aquatic:.15,flight:.08,limbs:.5,eyes:.3,spikes:.12,horns:.15,tail:.4,segments:.15,glow:.2,mystic:.35,hoarding:.45,symbiosis:.3,longevity:.3,curiosity:.5,weirdness:.4};
  const F=[{size:.24,speed:.62,intellect:.55,limbs:.45,tail:.65,eyes:.25,curiosity:.62,segments:.1},{size:.5,speed:.38,armor:.62,spikes:.55,horns:.45,limbs:.85,segments:.55,tail:.25,eyes:.4},{size:.36,aquatic:.56,glow:.6,mystic:.5,tail:.85,limbs:.12,segments:.35,weirdness:.5,eyes:.2},{size:.24,flight:.52,speed:.65,eyes:.55,horns:.3,curiosity:.65,limbs:.4,tail:.5}][form]||{};
  return Object.assign(base,F,TEMPER[temper]||{})}
const TRAITS=['size','speed','armor','aggression','sociality','intellect','fertility','carnivory','aquatic','flight','limbs','eyes','spikes','horns','tail','segments','glow','mystic','hoarding','symbiosis','longevity','curiosity','weirdness'];
const TRAIT_LABEL={size:'Size',speed:'Speed',armor:'Armor',aggression:'Aggression',sociality:'Sociality',intellect:'Intellect',fertility:'Fertility',carnivory:'Carnivory',aquatic:'Aquatic',flight:'Flight',limbs:'Limbs',eyes:'Eyes',spikes:'Spines',horns:'Horns',tail:'Tail',segments:'Segments',glow:'Glow',mystic:'Mysticism',hoarding:'Commerce',symbiosis:'Symbiosis',longevity:'Longevity',curiosity:'Curiosity',weirdness:'Strangeness'};
const ARCH={
  civil:{label:'Thinking Folk',style:'town'},merchant:{label:'Traders',style:'town'},theocracy:{label:'Devout Folk',style:'temple'},warstate:{label:'Warrior Folk',style:'fort'},
  sky:{label:'Sky-Folk',style:'spire'},deep:{label:'Deep-Dwellers',style:'dome'},horde:{label:'Monstrous Horde',style:'lair'},predator:{label:'Predator Packs',style:'lair'},
  mystic:{label:'Mystic Brood',style:'stones'},symbiote:{label:'Symbiotes',style:'nest'},tribal:{label:'Clans',style:'huts'},herd:{label:'Grazing Herds',style:'nest'},strange:{label:'Incomprehensibles',style:'stones'},
};
const VALUES=['martial','faith','art','trade','knowledge','order','harmony'];
const VALUE_LABEL={martial:'War',faith:'Faith',art:'Art',trade:'Commerce',knowledge:'Knowledge',order:'Order',harmony:'Harmony'};
const CTRAITS=['ambition','cruelty','honor','piety','greed','paranoia','warmth','genius'];
const CTRAIT_WORD={ambition:['content','ambitious'],cruelty:['gentle','cruel'],honor:['faithless','honorable'],piety:['skeptical','pious'],greed:['generous','greedy'],paranoia:['trusting','paranoid'],warmth:['cold','warm-hearted'],genius:['dull','brilliant']};
const TECH={
  speech:{n:'Spoken Names',c:16,req:[],br:'knowledge',minInt:0.3,d:'They begin to give their pictures sounds.'},
  tools:{n:'Toolmaking',c:16,req:[],br:'martial',d:'Sharpened stone and bone.'},
  agri:{n:'Cultivation',c:35,req:['tools'],br:'harmony',d:'Planted fields feed more mouths.'},
  music:{n:'Music and Dance',c:32,req:['speech'],br:'art',d:'Rhythm, chant and the first instruments.'},
  faith:{n:'Organized Faith',c:38,req:['speech'],br:'faith',d:'Shrines, priests, and a calendar of holy days.'},
  bronze:{n:'Bronze',c:48,req:['tools'],br:'martial',d:'Metal weapons and armor.'},
  writing:{n:'Writing',c:57,req:['speech'],br:'knowledge',minInt:0.38,d:'Marks that hold words.'},
  currency:{n:'Currency',c:54,req:['writing'],br:'trade',d:'Tokens worth more than themselves.'},
  law:{n:'Law Codes',c:57,req:['writing'],br:'order',d:'Rules written down and enforced.'},
  sculpture:{n:'Great Art',c:70,req:['music'],br:'art',d:'Statues, murals and painted walls.'},
  iron:{n:'Iron',c:83,req:['bronze'],br:'martial',d:'Harder blades for larger armies.'},
  math:{n:'Mathematics',c:83,req:['writing'],br:'knowledge',d:'Counting beyond fingers.'},
  philosophy:{n:'Philosophy',c:96,req:['writing'],br:'knowledge',d:'Questions about rulers and gods.'},
  theology:{n:'Theology',c:89,req:['faith','writing'],br:'faith',d:'Scripture and doctrine.'},
  medicine:{n:'Medicine',c:112,req:['math'],br:'knowledge',d:'Plagues kill fewer.'},
  navigation:{n:'Navigation',c:102,req:['math'],br:'trade',d:'Boats that cross open water.'},
  printing:{n:'Printing',c:144,req:['philosophy'],br:'knowledge',d:'Ideas spread faster than rulers can stop them.'},
  banking:{n:'Banking',c:134,req:['currency','math'],br:'trade',d:'Debt becomes power.'},
  theater:{n:'Theater and Novels',c:134,req:['sculpture','writing'],br:'art',d:'Stories that make strangers weep.'},
  gunpowder:{n:'Gunpowder',c:176,req:['iron','math'],br:'martial',d:'Killing at a distance.'},
  industry:{n:'Industry',c:384,req:['gunpowder','banking'],br:'trade',d:'Factories, smoke and machines.'},
  surveillance:{n:'Surveillance',c:384,req:['industry','law'],br:'order',d:'Every street watched.'},
  electricity:{n:'Electricity',c:435,req:['industry'],br:'knowledge',d:'Light without fire.'},
  massmedia:{n:'Mass Media',c:435,req:['electricity','theater'],br:'art',d:'One voice speaking to millions.'},
  genetics:{n:'Genetic Engineering',c:563,req:['electricity','medicine'],br:'knowledge',d:'They can now choose what their children become.'},
  fission:{n:'Nuclear Fission',c:588,req:['electricity'],br:'martial',d:'A weapon that ends cities.'},
  computing:{n:'Thinking Machines',c:614,req:['electricity','math'],br:'knowledge',d:'Machines that calculate and decide.'},
  bioweapons:{n:'Engineered Plagues',c:512,req:['genetics'],br:'martial',d:'Diseases that kill only chosen bloodlines.'},
  geoeng:{n:'Geoengineering',c:665,req:['genetics','industry'],br:'harmony',d:'Reshaping the land itself.'},
  uplift:{n:'Uplift',c:665,req:['genetics','computing'],br:'harmony',d:'Raising lesser creatures to thought.'},
  transcend:{n:'Transcendent Art',c:716,req:['massmedia','computing'],br:'art',d:'Art that rewires whoever sees it.'},
  spaceflight:{n:'The Departure',c:1075,req:['computing','fission'],br:'knowledge',d:'Ships that leave the world.'},
};
const ERAS=[['','Stone Age'],['bronze','Bronze Age'],['iron','Iron Age'],['philosophy','Classical Age'],['gunpowder','Gunpowder Age'],['industry','Industrial Age'],['electricity','Electric Age'],['fission','Atomic Age'],['computing','Machine Age'],['genetics','Age of Engineering']];
const GOVS={
  band:{label:'Band',succ:'strongest',un:0,d:'a loose band that follows whoever is strongest'},
  warband:{label:'Warband',succ:'strongest',un:0.02,d:'a war-pack led by its fiercest'},
  hive:{label:'Hive',succ:'council',un:-0.15,d:'a collective where no one rules alone'},
  chiefdom:{label:'Chiefdom',succ:'heir',un:0,d:'a chief and their kin'},
  cult:{label:'Dream-Cult',succ:'divine',un:-0.05,d:'ruled by whoever dreams the truest dreams'},
  monarchy:{label:'Monarchy',succ:'heir',un:0.02,d:'a crowned ruler and an heir'},
  theocracy:{label:'Theocracy',succ:'divine',un:-0.03,d:'priests rule in the name of the gods'},
  republic:{label:'Republic',succ:'election',un:-0.04,d:'leaders chosen by citizens'},
  oligarchy:{label:'Merchant Oligarchy',succ:'council',un:0.03,d:'ruled by the richest houses'},
  empire:{label:'Empire',succ:'heir',un:0.06,d:'an emperor ruling many towns from one throne'},
  commune:{label:"Artists' Commune",succ:'election',un:-0.1,d:'a society organized around making beautiful things'},
  democracy:{label:'Democracy',succ:'election',un:-0.08,d:'everyone votes'},
  technocracy:{label:'Technocracy',succ:'council',un:-0.02,d:'ruled by experts and machines'},
  police:{label:'Surveillance State',succ:'heir',un:0.0,rep:0.45,d:'every citizen watched, every dissent punished'},
  junta:{label:'Military Junta',succ:'strongest',un:0.08,rep:0.25,d:'generals rule by force'},
};
const QUIRKS={
  orbit:{names:['The Turning','The Slow Wheel'],desc:f=>`Groups of them walk in tight circles at their sacred site. The number of circlers always equals the number of their eyes. It may be a calendar.`},
  cairn:{names:['The Stone-Counting','The Heaping of Names'],desc:f=>`They pile stones at the edges of their land. Every cairn grows after a death, so each stone is probably a person remembered.`},
  glyph:{names:['The Long Lines','The Star-Walk'],desc:f=>`They walk perfectly straight paths, wearing star-shaped scars into the ground that can only be read from the sky.`},
  gift:{names:['The Feeding of Strangers','The Gate-Offering'],desc:f=>`In peace and in war they carry food to rival towns and leave it at the gates. Their enemies cannot decide whether it is an insult or an apology. It softens them anyway.`},
  still:{names:['The Watching','The Long Stare'],desc:f=>`Rows of them stand motionless for years, all facing the land of their ancestors.`},
  pilgrim:{names:['The Return','The Walk Back'],desc:f=>`They walk back to where their kind first stirred, touch the ground once, and walk home.`},
  chorus:{names:['The Hum','The Pulse-Song'],desc:f=>`They gather and pulse with light in unison. The rhythm changes each time one of them dies.`},
  mimic:{names:['The Mirroring','The Borrowed Walk'],desc:f=>`They follow strangers at a polite distance, copying their walk. Over generations their colors drift toward their neighbors'.`},
  paint:{names:['The Coloring','The Endless Mural'],desc:f=>`They cover the ground around their towns in colored patterns, then start again. Nothing is ever finished, and that seems to be the point.`},
};
const CONCEPTS={sun:'☉',moon:'☾',water:'≈',river:'∿',stone:'▲',hill:'⌒',tree:'♣',fire:'Δ',eye:'◉',home:'⌂',people:'☥',blood:'◆',sky:'○',mother:'Ω',war:'✕',peace:'∞',god:'✶',king:'♔',free:'✧',true:'◇',new:'✚',great:'◎',death:'☠',star:'✦',beast:'♞',tooth:'∨',wing:'⋎',wave:'〰',field:'⁘',gate:'∏',song:'♪',iron:'⊥',word:'≡',dust:'∴',light:'☼',shadow:'◐',bone:'‡',seed:'∘',horn:'⋀',deep:'▽',high:'△',ash:'⁂'};
const GLOSS={sun:'Sun',moon:'Moon',water:'Water',river:'River',stone:'Stone',hill:'Hill',tree:'Tree',fire:'Fire',eye:'Eye',home:'Home',people:'Folk',blood:'Blood',sky:'Sky',mother:'Mother',war:'War',peace:'Peace',god:'God',king:'King',free:'Free',true:'True',new:'New',great:'Great',death:'Death',star:'Star',beast:'Beast',tooth:'Tooth',wing:'Wing',wave:'Wave',field:'Field',gate:'Gate',song:'Song',iron:'Iron',word:'Word',dust:'Dust',light:'Light',shadow:'Shadow',bone:'Bone',seed:'Seed',horn:'Horn',deep:'Deep',high:'High',ash:'Ash'};
const PERSONAL=['sun','moon','stone','tree','fire','eye','blood','sky','star','tooth','wing','wave','song','iron','light','shadow','bone','seed','horn','deep','high','river','dust'];
const RULES=[
  ['k before i or e becomes ch',s=>s.replace(/k(?=[ie])/g,'ch')],
  ['final vowels fall silent',s=>s.length>4?s.replace(/([^aeiou])[aeiou]$/,'$1'):s],
  ['p softens to f',s=>s.replace(/p/g,'f')],
  ['t between vowels becomes d',s=>s.replace(/([aeiou])t(?=[aeiou])/g,'$1d')],
  ['a darkens to o',s=>s.replace(/a(?=[^aeiou]|$)/g,'o')],
  ['doubled vowels merge',s=>s.replace(/([aeiou])\1/g,'$1')],
  ['initial h is dropped',s=>s.replace(/^h(?=[aeiou])/,'')],
  ['r and l merge into l',s=>s.replace(/r/g,'l')],
  ['g between vowels weakens to y',s=>s.replace(/([aeiou])g(?=[aeiou])/g,'$1y')],
  ['th hardens to t',s=>s.replace(/th/g,'t')],
  ['s before consonants is lost',s=>s.replace(/s(?=[bdfgklmnprtvz])/g,'')],
  ['v becomes w',s=>s.replace(/v/g,'w')],
  ['b between vowels softens to v',s=>s.replace(/([aeiou])b(?=[aeiou])/g,'$1v')],
  ['final e rises to i',s=>s.replace(/e$/,'i')],
  ['initial k becomes h',s=>s.replace(/^k/,'h')],
  ['n before p or b becomes m',s=>s.replace(/n(?=[pb])/g,'m')],
  ['u fronts to i',s=>s.replace(/u/g,'i')],
  ['z devoices to s',s=>s.replace(/z/g,'s')],
  ['sh simplifies to s',s=>s.replace(/sh/g,'s')],
  ['d between vowels becomes r',s=>s.replace(/([aeiou])d(?=[aeiou])/g,'$1r')],
  ['e breaks into ie',s=>s.replace(/^([^aeiou]*)e/,'$1ie')],
  ['ch hardens to k',s=>s.replace(/ch/g,'k')],
  ['an ending -a is added to names',s=>/[^aeiou]$/.test(s)&&s.length<7?s+'a':s],
];

function mulberry32(a){const r=function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};r.get=()=>a;r.put=v=>{a=v};return r}
function clamp(v,a=0,b=1){return v<a?a:v>b?b:v}
function lerp(a,b,t){return a+(b-a)*t}
function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s}
function hueDist(a,b){const d=Math.abs(a-b)%360;return d>180?360-d:d}
function gdist(a,b){let s=0;for(const k of TRAITS){const d=a[k]-b[k];s+=d*d}return Math.sqrt(s/TRAITS.length)}
function nLimbs(g){return 2*Math.round(g.limbs*4)}
function nEyes(g){return 1+Math.round(g.eyes*6)}
function nSegs(g){return 1+Math.round(g.segments*3)}
const NUMW=['no','one','two','three','four','five','six','seven','eight'];
function archetypeOf(g){
  if(g.weirdness>0.74)return'strange';
  if(g.intellect>0.55&&g.sociality>0.48){if(g.mystic>0.6)return'theocracy';if(g.hoarding>0.55)return'merchant';if(g.aggression>0.62)return'warstate';return'civil'}
  if(g.flight>0.55)return'sky';if(g.aquatic>0.62)return'deep';if(g.size>0.68&&g.aggression>0.6)return'horde';if(g.carnivory>0.64)return'predator';
  if(g.mystic>0.62)return'mystic';if(g.symbiosis>0.6)return'symbiote';if(g.sociality>0.55)return'tribal';return'herd';
}
function bodyDesc(g){
  const p=[];p.push(g.size<0.2?'tiny':g.size<0.38?'small':g.size>0.85?'colossal':g.size>0.66?'huge':'');
  if(g.armor>0.6)p.push('armored');if(g.flight>0.45)p.push('winged');
  const L=nLimbs(g);p.push(L===0?(g.aquatic>0.45?'finned':'legless'):NUMW[L]+'-legged');
  const E=nEyes(g);p.push(E===2?'':NUMW[E]+'-eyed');
  if(g.horns>0.5)p.push('horned');if(g.spikes>0.55)p.push('spined');if(g.glow>0.55)p.push('glowing');if(g.tail>0.65)p.push('long-tailed');
  const noun=g.intellect>0.55?'folk':L===0&&g.aquatic>0.45?'swimmers':g.flight>0.55?'fliers':nSegs(g)>=3?'crawlers':L===2?'striders':g.carnivory>0.6?'hunters':'beasts';
  return p.filter(Boolean).join(', ')+' '+noun;
}


export { ARCH, CONCEPTS, CTRAITS, CTRAIT_WORD, ERAS, GLOSS, GOVS, NUMW, PERSONAL, QUIRKS, RULES, TECH, TRAITS, TRAIT_LABEL, VALUES, VALUE_LABEL, archetypeOf, bodyDesc, cap, clamp, creatureGenome, gdist, hueDist, lerp, mulberry32, nEyes, nLimbs };
