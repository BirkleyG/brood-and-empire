# Brood & Empire: improvement brief

You are working on **Brood & Empire**, my god-game / history simulator. It is a single self-contained HTML file (about 4,300 lines, ~620 KB) published as a Claude artifact. A seeded simulation grows creature peoples from one campfire; they found towns, faiths and tongues, split, fight, invent, and eventually end the world. I play an immortal Maker who acts only through believers. Claude writes the history book chapter by chapter.

The game file is attached to this message (or linked as an artifact). If you can't see it, ask me for it before doing anything else.

This brief lists **86 improvements**. Each has an ID, what to change, the evidence from a real run, where it lives in the code, a suggested approach, and a "done when" check. Work through them in the roadmap order below unless I say otherwise.

## How I want you to work

1. **Read before editing.** Search the file for the function names given in each item; they are exact.
2. **One phase at a time.** Finish a phase, run the checks, summarise what changed, then wait for me before the next phase.
3. **Keep the game one file.** No build step. External scripts only from cdnjs/jsdelivr/unpkg; fonts only from Google Fonts.
4. **Determinism.** All randomness inside the sim must use the seeded `R()` (mulberry32) from `makeSim`, never `Math.random()`, so the same seed replays the same history.
5. **Saves must keep loading.** Worlds are saved with `snapshotSim` / `restoreSim` (a generic graph packer). Store new state as plain data on `S` or on existing objects (no functions, no class instances). Give every new field a default when missing (`f.blocs = f.blocs || {...}`) so old saves still load. Re-attach any functions in `S.rehydrate`.
6. **Performance.** The sim runs up to ~520 agents at 40× speed. Anything per-agent per-tick must be cheap; put heavy logic in the once-a-year `yearly()` pass.
7. **Explain causes.** Every new event goes through `log(type, importance, title, text, x, y, facs, {why:[...]})` with a `why` list, like existing events. The chronicle and Claude's chapters depend on it.
8. **Claude-facing effects.** Decision cards and visions change the world through the `FX` map applied by `S.applyFx`. Any new effect must be added to `FX`, documented in `FX_DOC`, and accepted by `validCard`.
9. **Writing style for event text:** short, concrete, past or present tense, like the existing log lines. No modern jargon in pre-industrial ages.

## Map of the code

| System | Where to look |
|---|---|
| World creation, terrain, RNG | `makeSim(seed)` (everything sim-side is a closure inside it) |
| Per-frame step | `S.step(dt)` → agents `plan`/`act`, `stepArmies`, `updSett` |
| Once-a-year pass | `yearly()` → `research`, `scriptTick`, `faithTick`, `movementTick`, `foreignPolicy`/`domestic`, `intrigue`, `soundShift`, colonisation, then `S.emergeChance`, `S.godsYear` |
| Peoples (factions) | `newFaction`, `secede`, `union`, `civilWar`, `archetypeOf`, `bodyDesc`, `f.snaps` |
| Unrest and secession | `unrestOf`, `intrigue` |
| War and diplomacy | `foreignPolicy`, `declareWar`, `makePeace`, `S.peaceTerms`, `S.warYear`, `formArmy`, `stepArmies`, `armySlot`, `attack`, `finalizeBattles`, `nuke`, `blight` |
| Domestic decisions | `domestic`, `changeGov`, `purge`, `buildWonder`, `making`, `uplift`, `depart` |
| Tech | `TECH`, `ERAS`, `chooseResearch`, `research`, `milTier` |
| Language and scripts | `newLang`, `soundShift`, `RULES`, `CONCEPTS`, `compose`, `setStage`, `reformScript`, `scriptTick`, `writeScript` |
| Faith | `TENETS`, `foundFaith`, `faithTick`, `makeProphecy`, `SIGNS`, `startCult`, `cultStep`, `startProphet`, `prophetStep`, `respond` |
| The player (Maker) | `S.maker` (`mk`): greatness, mercy, power; `S.godsYear`, `nudgeMeters`, `MACTS`, `S.applyDecrees`, doctrines `DLEV` / `S.adoptDoctrine` |
| Rival gods | `RIVALS`, `arriveGod`, `rivalsYear`, `rivalAct` |
| Doom (nukes, climate, AI) | `S.doomYear`, `S.diff()`, `S.world.ai`, `S.world.carbon` |
| New peoples arriving | `EMERGE`, `S.emerge`, `spawnPeople`, `S.emergeChance` |
| Finale | `S.crisis`, `S.finaleTick`, `S.endWorld` |
| Decision cards (Claude) | `cardTick`, `cardPrompt`, `validCard`, `requestCard`, `applyGameChoice`, `FX` / `S.applyFx`, `FX_DOC` |
| Visions and voices (Claude) | `visionPrompt`, `visionSpeak`, `voicePrompt`, `speakTo` |
| Chapters (Claude) | `chapterBrief`, `chapterPrompt0`, `parseChapter`, `writeChapter`, `tabHistory`, `tabReligions`, `tabLanguages`, `tabPeoples`, `tabWars` |
| Map rendering | `render`, `drawTown`, `drawBuilding`, `drawCreature`, `drawRuin`, `buildTerrainCanvas` |
| Side panels / book | `renderPeoples`, `showInspect`, `renderChronicle`, `buildBook`, `peopleCard` |
| Saves | `snapshotSim`, `restoreSim`, `buildSave`, `saveNow`, `loadWorld` |

## The run these notes come from

Seed 11428278, years 0–1094, six ages. 45 peoples (11 arrivals, 34 breakaways), 66 faiths (43 churches, 23 cults), 44 tongues. It ended with "The Awakening": a machine mind woke in 1094 and no one prayed again. My choices included smashing the thinking engines of Nowon in 1077, which changed nothing about that ending. That run is the evidence cited below.

## Roadmap

Do the phases in order. Within a phase, items marked ★ first.


**Phase 1: Fixes and the 1,000-people scale:** 1★ Let your choices touch the machine, 2★ Stop the late game from being scripted, 8★ Count every creature as 1,000 people, 3 Fix "you chose to said" and the cut-off visions, 4 Give every sect and people a unique name, 5 Describe bodies as they were in that year, 6 Make population read like history, 7 Replace the hard caps with soft pressure, 9 Rename town sizes for the new scale, 10 Draw crowds, not individuals, when zoomed out, 11 Tell the historian the scale.

**Phase 2: Armies, battles and destructive war:** 12★ Show campaigns, not a marching block, 20★ Make industrial war total, 13 Field several armies with their own generals, 14 Choose targets like a commander, 15 Make armies eat, 16 Let bodies decide how a people fights, 17 Make battles events, 18 Give sieges stages, 19 Add fleets, 21 Let alliances drag the world into war, 22 Add occupation and resistance, 23 Fight wars for goals, 24 Hire mercenaries.

**Phase 3: Money, markets and trade:** 25★ Give goods prices, 26 Let money evolve and break, 27 Add banks, loans and default, 28 Add exchanges, bubbles and crashes, 29 Make trade routes physical, 30 Make taxes a real lever, 31 Split rich and poor, 32 Add embargoes, sanctions and trade wars, 33 Let one coin rule the world, 34 Make famines partly man-made.

**Phase 4: Hegemony and stability:** 35★ Recognise great powers and a hegemon, 37★ Give realms legitimacy, 36 Add spheres, clients and puppets, 38 Let institutions build up, 39 Allow long peaces, 40 Model overextension and collapse, 41 Add world institutions.

**Phase 5: Technology and flight:** 42★ Add powered flight, 43 Make winged peoples matter in the air, 44 Fill in the industrial and modern tree, 45 Let infrastructure tame distance, 46 Add spies and stolen secrets, 47 Make space a race, 48 Make AI a branch, not a timer.

**Phase 6: Politics, faith and tongues:** 49★ Make wars cost something and escalate, 57★ Rebalance "Carry the truth", 65★ Give each tongue its own habits, 50 Give rulers dynasties, 51 Add power blocs inside each realm, 52 Let revolutions spread, 53 Add leagues, federations and multi-people empires, 54 Add succession crises, 55 Give money more to do, 56 Make treaty clauses last, 58 Grow new tenets out of events, 59 Make sects disagree about something, 60 Make holy places matter, 61 Remember saints and martyrs, 62 Let failed prophecies bite, 63 Absorb the gods of the conquered, 64 Let forgotten gods come back, 66 Carry loanwords on contact, 67 Keep dead tongues alive in scripture, 68 Add exonyms, 69 Measure how well tongues understand each other, 70 Show the etymologies.

**Phase 7: Peoples, the god, and the chronicle:** 71★ Spread disease by contact, 82★ Give the historian threads to pay off, 72 Keep minorities alive inside a realm, 73 Let peoples mix, 74 Put real resources on the map, 75 Make refugees arrive somewhere, 76 Lower birth rates as peoples urbanise, 77 Add natural shocks before industry, 78 Warn before low Mercy breaks the realm, 79 Make rival gods adapt, 80 Bring old choices back decades later, 81 Add more ways for your story to end, 83 Add an optional family-line view, 84 Let some grudges last for centuries, 85 Dig up the past, 86 Allow dark ages.

---


## 1. Fix first

Things this run exposed that undercut the rest of the game.


### 1. ★ Let your choices touch the machine

*ID `ai-hook` · Fix, Emergence · effort S*

- **What:** Add an AI effect to decision cards and visions, and let smashing engines remove the Thinking Machines tech. Today nothing you do can lower the AI meter.
- **Evidence:** **Your run:** you smashed the engines of Nowon in 1077; the Awakening still came in 1094. **Code:** `S.world.ai` is only changed in `S.doomYear`; `FX_DOC` has no AI effect.
- **Approach:** Add an `ai` effect to the `FX` map used by `S.applyFx` (`{fx:'ai', amount:-30..+30}` changes `S.world.ai`), document it in `FX_DOC`, and accept it in `validCard`. Add a `untech` effect that deletes a tech (and its dependants) from one people. When a card or vision destroys machines, apply both to the people named in `S.world.aiWho`.
- **Done when:** Replaying the 1077 'smash the engines' choice lowers `S.world.ai` and removes Thinking Machines from that people; the Awakening is delayed or avoided.

### 2. ★ Stop the late game from being scripted

*ID `late-game` · Fix, Emergence, Story · effort M*

- **What:** AI growth is multiplied by a difficulty that climbs 1.7× per age after Age IV, so by Age VI the Awakening is close to certain. Add counter-forces: machine bans, treaties between peoples, a faith that teaches the machine to pray. Give the machine more than one ending: it joins your faith, leaves, splits, or rules.
- **Evidence:** **Code:** `S.diff()` = 2.4 × 1.7^(age − 5), applied inside `S.doomYear`.
- **Approach:** In `S.doomYear`, stop multiplying AI growth by `S.diff()` (or cap the factor at ~1.5). Add brakes that subtract from AI growth: a machine-ban law per people, a treaty between peoples, a doctrine lever `aiMult` in `DLEV`. Replace the single Awakening with weighted outcomes picked from the world state: the mind joins the largest faith, departs, splits in two, or rules. Log each with its own event text.
- **Done when:** Across 10 seeds that reach Age VI, at least 3 do not end in the default Awakening; at least one alternative ending appears.

### 3. Fix "you chose to said" and the cut-off visions

*ID `said` · Fix · effort S*

- **What:** Change the template wording and stop trimming your vision text in the "Your hand" lists.
- **Evidence:** **Your run:** "you chose to said: “Do as you have said and I will watch over you. Also. Send your people out to est”". **Code:** `visionSpeak` saves the choice as `said: "…"` with the text trimmed, and `tabHistory` prints "you chose to" in front of it.
- **Approach:** In `visionSpeak`, save the deed as `choice:'spoke to them'` and keep the full vision text in a separate field (`said`). In `tabHistory`, render `you spoke to X: “full text”` instead of prefixing 'you chose to'.
- **Done when:** The book shows complete vision quotes with correct grammar.

### 4. Give every sect and people a unique name

*ID `names` · Fix, Story · effort S*

- **What:** Add founders, places or ordinals to titles ("the Path of Valbava", "the Liemhih Rite", "the Second True Path") instead of retrying the same 8 sect words.
- **Evidence:** **Your run:** three "Reformed Path of Eye-Sky", four "True Path", two Ownofawie. **Code:** the title loop in `foundFaith` retries 8 times from `SECT`.
- **Approach:** In `foundFaith`, when a title collides, try in order: founder's name ('the Path of Valbava'), holy town ('the Liemhih Rite'), then an ordinal ('the Second True Path'). Do the same in `secede` for people names: if the name already exists among living or dead peoples, add a distinguishing concept or ordinal.
- **Done when:** No two faiths or peoples in a full run share a title.

### 5. Describe bodies as they were in that year

*ID `snaps` · Fix, Realism · effort S*

- **What:** Chapters and death notices should read a people’s body from the snapshot nearest the event, not the current average.
- **Evidence:** **Your run:** the Mivekmam are three-eyed in Age I and "winged, six-eyed, horned" in the peoples list. **Code:** `f.snaps` already stores a snapshot every 20 years.
- **Approach:** Add a helper `snapAt(f, year)` returning the nearest entry in `f.snaps`. Use it wherever `bodyDesc(f.g)` describes a people at a past time: extinction notices, `chapterBrief`, `peopleCard`.
- **Done when:** Age I chapters describe the Mivekmam with their Age I body, not their final one.

### 6. Make population read like history

*ID `scale` · Fix, Realism · effort S*

- **What:** Retune city thresholds and battle tolls so numbers feel like history. See the new section on counting every creature as 1,000 people.
- **Evidence:** **Your run:** Sun-Stone becomes "a great city of 34 souls"; a 26-year holy war costs one life. **Code:** the agent cap is 520; a great city is 34 agents in `yearly`.
- **Approach:** Retune settlement level thresholds and war-casualty wording together with the 1,000x display scale (see section 8).
- **Done when:** City names and battle reports read as plausible history.

### 7. Replace the hard caps with soft pressure

*ID `caps` · Fix, Emergence · effort S*

- **What:** Secessions stop once 10 peoples are alive, new sects stop at 10 faiths, cults at 3 and arrivals at 14. Hard stops make history plateau. Make crowding raise the bar instead.
- **Evidence:** **Code:** `alive().length>=10` in `intrigue`, `liveFaiths()<10` in `faithTick`, `al.length>=14` in `S.emergeChance`.
- **Approach:** Remove the hard gates `alive().length>=10` (in `intrigue`), `liveFaiths()<10` (in `faithTick` and `secede`), the 3-cult cap (in `movementTick`) and `al.length>=14` (in `S.emergeChance`). Replace each with a probability multiplier that falls smoothly as the count rises, e.g. `p *= 1/(1+Math.max(0,n-8)*0.35)`.
- **Done when:** Runs keep producing occasional secessions and sects after 10 peoples/faiths, at a lower rate; performance stays fine.

## 2. Scale: every creature is a thousand

The cheapest way to make the world feel ten times bigger.


### 8. ★ Count every creature as 1,000 people

*ID `thousand` · Realism, Story · effort S*

- **What:** Multiply every number the player and the historian see: populations, war dead, plague tolls, believers. Sun-Stone becomes a great city of 34,000, and a battle with 75 dead becomes 75,000. Keep the agents as they are underneath.
- **Evidence:** **Code:** one display constant used by `log` text, the peoples panel, `bookStats` and `chapterBrief`. The sim itself does not change.
- **Approach:** Add `const SCALE=1000` and `fmtPop(n)` ('34,000'). Use it in every user-facing number: `log` texts that print counts, peoples panel, `bookStats`, `chapterBrief`, news ticker. Do not change sim values.
- **Done when:** Every displayed population and casualty number is multiplied by 1,000.

### 9. Rename town sizes for the new scale

*ID `tiers` · Realism · effort S*

- **What:** Hamlet, town, city, metropolis, megacity, with thresholds that make sense at 1,000 per creature.
- **Evidence:** **Code:** levels 0–4 at 5, 12, 22 and 34 agents in `yearly`.
- **Approach:** Rename level labels: hamlet, village, town, city, metropolis, adjusted to the scaled counts in the `yearly` town-level code and event titles.
- **Done when:** Town labels match their scaled population.

### 10. Draw crowds, not individuals, when zoomed out

*ID `crowds` · Story · effort M*

- **What:** At world zoom, show towns as dense lit districts and armies as columns of thousands. Show individual creatures only when zoomed in.
- **Evidence:** **Code:** `drawTown` and the agent loop in `render`.
- **Approach:** In `render`, below a zoom threshold, skip drawing individual agents and draw towns as dense lit districts sized by population and armies as columns.
- **Done when:** Zoomed-out map reads as a world of cities and armies.

### 11. Tell the historian the scale

*ID `scalebrief` · Story · effort S*

- **What:** Pass scaled numbers into the chapter prompt so the chronicle says "forty thousand fell at Shokism" instead of "32 die".
- **Evidence:** **Your run:** "Battle of Shokism. 32 die." **Code:** `chapterPrompt0`.
- **Approach:** Pass scaled numbers into `chapterBrief` and say in `chapterPrompt0` that each count is in thousands.
- **Done when:** Chapters cite numbers like 'forty thousand fell'.

## 3. Armies, battles and destructive war

Armies today are one block that walks straight at the nearest town. Make war bigger, smarter and much worse.


### 12. ★ Show campaigns, not a marching block

*ID `visuals` · Story · effort M*

- **What:** Draw campaign arrows from muster to target, columns that follow roads, dust trails, siege camps ringing towns, banners with each people’s sigil, battle flashes with casualty counts, and shaded front lines as land changes hands.
- **Evidence:** **Code:** `armySlot` packs soldiers 5 across; `render` labels the army with the word "army".
- **Approach:** Rework army drawing in `render`: campaign arrow from muster to target, column formation following roads (`S.roads`), dust trail particles, banner with the people's sigil (`f.glyph`, `f.hue`), siege camp ring around targeted towns, battle flashes with a floating casualty count (scaled), and shaded front lines between warring territories.
- **Done when:** A war is readable at a glance from the map without opening the chronicle.

### 13. Field several armies with their own generals

*ID `multiarmy` · Realism, Emergence · effort M*

- **What:** Main army, raiders and garrisons, each led by a named general whose traits shape how it fights.
- **Evidence:** **Code:** one `f.army` per people, built in `formArmy`.
- **Approach:** Change `f.army` to `f.armies = []`. Each army has a general (char), size, target and stance. Split soldiers among main army, raiders and garrisons in `yearly`.
- **Done when:** Large peoples field several armies at once.

### 14. Choose targets like a commander

*ID `targets` · Realism, Emergence · effort M*

- **What:** Pick the capital, the richest town, the holy city or a mountain pass by war aim, not the nearest town. Feint, flank and retreat.
- **Evidence:** **Code:** `f.warTarget` is the nearest enemy settlement.
- **Approach:** Pick targets by war goal: capital for conquest, holy city for holy wars, richest town for raids, nearest rebel town for reunify. Allow retreat when outnumbered.
- **Done when:** Armies march at meaningful targets and sometimes retreat.

### 15. Make armies eat

*ID `supply` · Realism · effort M*

- **What:** Supply lines, foraging that strips the land, winter attrition and starving sieges. Far campaigns melt away.
- **Evidence:** **Code:** marching costs nothing in `stepArmies`.
- **Approach:** Armies carry supply; each day away from friendly towns consumes it and strips food from tiles. Out of supply, soldiers lose hp; winter doubles attrition.
- **Done when:** Long campaigns lose strength without fighting.

### 16. Let bodies decide how a people fights

*ID `unittypes` · Emergence, Story · effort M*

- **What:** Fliers as scouts and raiders, swimmers as marines, armored giants as shock troops, many-eyed archers. Formations and tactics that match.
- **Evidence:** **Code:** genomes already set damage, armor, speed and sight in `stats`; soldiers all march the same way.
- **Approach:** Derive unit roles from genome: flight→scouts/raiders, aquatic→marines, armor+size→shock troops, eyes+intellect→ranged. Give each a formation and behaviour in `stepArmies`.
- **Done when:** Armies of different peoples look and fight differently.

### 17. Make battles events

*ID `battles` · Story, Realism · effort L*

- **What:** Two armies meet in the field with morale, routs, pursuit and named commanders. Save a small battle map to the chronicle.
- **Evidence:** **Code:** fights are individual duels in `attack`, totalled by `finalizeBattles`.
- **Approach:** When two armies come within range, create a battle object with morale per side, resolve over several ticks (morale break → rout → pursuit), and log a named battle with commanders, numbers and a small saved map snapshot.
- **Done when:** Field battles appear as named events with clear winners.

### 18. Give sieges stages

*ID `sieges` · Realism, Story · effort M*

- **What:** Encirclement, bombardment, breaches, sallies, starvation and surrender terms. Walls and tech change how long a city holds.
- **Evidence:** **Code:** armies switch to "siege" and grind town hit points.
- **Approach:** Stage sieges: encircle (supplies cut), bombard (walls hp), breach, assault or starvation surrender. Defenders may sally. Duration depends on walls and tech.
- **Done when:** Sieges take time and can end in surrender.

### 19. Add fleets

*ID `navy` · Realism, Story · effort L*

- **What:** Ships, sea battles, blockades and landings. Today Navigation lets armies simply walk across water.
- **Evidence:** **Code:** `tech.navigation` makes water passable in `passable` and `stepArmies`.
- **Approach:** Add fleets for peoples with navigation: ships move on water tiles, fight fleets, blockade ports (trade cut), and land armies. Remove armies walking on water.
- **Done when:** Sea battles and landings appear.

### 20. ★ Make industrial war total

*ID `total` · Realism, Story · effort M*

- **What:** After Industry, mobilise a large share of the population, bomb cities, and draw allies into chains of war. Wars should leave towns in ruins and peoples halved, not 1–2% losses a year.
- **Evidence:** **Code:** `S.warYear` kills 1–2.5% of the front town a year; soldiers are 25–65% of members.
- **Approach:** After industry, raise soldier share and civilian deaths: bombardment of towns near the front, industrial mobilisation, conscription unrest. Scale war deaths in `S.warYear` by mil tier.
- **Done when:** Industrial wars kill a large share of a people and ruin towns.

### 21. Let alliances drag the world into war

*ID `worldwar` · Emergence, Story · effort S*

- **What:** Alliance chains, ultimatums and mobilisation timetables that turn a border clash into a world war.
- **Evidence:** **Code:** allies answer one declaration in `declareWar`; their allies don’t.
- **Approach:** When a war starts between members of different alliance blocs, propagate declarations through allies' allies with honour/fear checks; add ultimatums before war.
- **Done when:** Occasional world wars involve most peoples.

### 22. Add occupation and resistance

*ID `occupation` · Realism, Emergence · effort M*

- **What:** Conquered towns rise as partisans, sabotage and guerrillas until assimilated or freed.
- **Evidence:** **Code:** conquest adds unrest for 120 years in `unrestOf` but no fighting.
- **Approach:** Conquered towns get `s.occupied` with resistance strength from grudge and minority share; resistance kills garrison soldiers and can free the town.
- **Done when:** Partisans and liberations appear.

### 23. Fight wars for goals

*ID `warscore` · Realism · effort M*

- **What:** A war score from battles, towns held and blockades. Peace comes when the goal is won or lost, not mainly from exhaustion.
- **Evidence:** **Code:** peace weighs duration and losses in `foreignPolicy`.
- **Approach:** Track war score from battles, towns held and blockades. Peace offered when one side reaches its goal or collapses; terms scale with score.
- **Done when:** Peace terms match how the war went.

### 24. Hire mercenaries

*ID `mercs` · Emergence, Story · effort S*

- **What:** Rich peoples buy armies. Unpaid mercenaries turn on their employers or found kingdoms of their own.
- **Evidence:** **Why:** connects the treasury to war and makes debt dangerous.
- **Approach:** Allow peoples with treasury to hire mercenary bands (spawned agents of a nearby people). Unpaid mercs revolt or seize a town.
- **Done when:** Mercenary betrayals happen.

## 4. Money, markets and trade

Today the economy is one treasury number fed by spare grain. Give it prices, credit and crashes.


### 25. ★ Give goods prices

*ID `prices` · Realism, Emergence · effort L*

- **What:** Each town produces and consumes goods. Local prices come from supply and demand, and caravans move goods from cheap towns to dear ones.
- **Evidence:** **Code:** `goods` names glowstones, pearls and iron tools only as flavour; trade is a yes/no flag on `rel`.
- **Approach:** Add per-settlement stocks for a few goods (grain, tools, luxuries, resource goods) and a price = base * demand/supply. Caravans (`role==='trader'`) carry goods from cheap to dear towns and earn profit for their people's treasury.
- **Done when:** Prices differ by town and converge along trade routes.

### 26. Let money evolve and break

*ID `money` · Realism, Story · effort M*

- **What:** Barter, then shells or metal, then coin, paper and credit. Rulers can debase the coin to pay for wars, causing inflation, unrest and revolts.
- **Evidence:** **Code:** Currency adds +2 a year to the treasury in `yearly`; nothing else.
- **Approach:** Add `f.money = {stage:'barter'|'coin'|'paper'|'credit', debasement:0}`. Rulers short of treasury may debase, giving cash now and inflation later (unrest, falling trade).
- **Done when:** Debasement events lead to inflation unrest.

### 27. Add banks, loans and default

*ID `credit` · Realism, Emergence, Story · effort M*

- **What:** Banking houses lend to rulers for wars and wonders. Defaults ruin houses, raise rates and topple governments. Creditors can demand towns or tribute.
- **Evidence:** **Code:** Banking adds +4 a year to the treasury; there is no debt.
- **Approach:** Add `S.banks` (owned by a people or house). Rulers borrow for wars and wonders with interest; inability to pay triggers default: lender grudge, higher future rates, unrest, possible seizure of towns.
- **Done when:** Defaults and debt wars appear in the chronicle.

### 28. Add exchanges, bubbles and crashes

*ID `markets` · Emergence, Story · effort L*

- **What:** After banking and printing, trading companies and exchanges appear. Manias (a glowstone bubble) inflate and burst, wiping out savings and starting cults and revolutions.
- **Evidence:** **Why:** crashes are among history’s best story engines, and the cult system already feeds on hard times (`hardTimes`).
- **Approach:** After banking + printing, create an exchange in the richest town. Track an index driven by trade, war and resources. Random manias inflate a good; crashes wipe treasuries and set `hardTimes`, feeding cults and revolutions.
- **Done when:** Bubbles and crashes occur in industrial runs and have political consequences.

### 29. Make trade routes physical

*ID `routes` · Realism, Emergence · effort M*

- **What:** Draw caravan and sea routes, with chokepoints, tolls, piracy and blockades. Controlling a pass or strait becomes a reason for war.
- **Evidence:** **Code:** `S.roads` counts traffic between towns and draws it, but a road carries no value, toll or risk.
- **Approach:** Give `S.roads` entries value (goods moved per year). Add tolls for the owner of towns on a route, piracy risk, and blockades during war. Use control of high-value routes as a war reason.
- **Done when:** Map shows busy routes; wars cite them.

### 30. Make taxes a real lever

*ID `taxes` · Realism · effort S*

- **What:** A tax rate per realm: high taxes fill war chests and anger towns, low taxes win love and leave the treasury empty. Tax farmers and tax revolts follow.
- **Evidence:** **Code:** a greedy ruler adds unrest as "taxes heavily" in `unrestOf`, but no rate exists.
- **Approach:** Add `f.tax` (0..1) chosen by ruler traits. Tax raises treasury and unrest in `unrestOf`. Add tax revolt events.
- **Done when:** Tax rates vary by ruler and drive unrest.

### 31. Split rich and poor

*ID `classes` · Realism, Story · effort M*

- **What:** Track wealth classes in each town. Inequality feeds revolutions, cults and the "hungry are closer to the gods" faiths.
- **Evidence:** **Your run:** the Biliem filled their granaries from Dakamay tribute while Dakamay children starved (539).
- **Approach:** Track per-town wealth spread (`s.inequality`) from trade, tribute and slavery. High inequality raises revolution and cult chances.
- **Done when:** Revolutions and cults correlate with inequality.

### 32. Add embargoes, sanctions and trade wars

*ID `sanctions` · Realism, Emergence · effort S*

- **What:** Cut trade as punishment, ban a rival’s goods, or blockade a port. Interdependence should make war costlier between big traders.
- **Evidence:** **Code:** trade only ends when war starts (`declareWar`).
- **Approach:** Allow embargo as a foreign-policy action short of war: cuts trade, raises grudge, hurts both economies. Make war less likely between deep trade partners.
- **Done when:** Embargoes appear; big traders fight less.

### 33. Let one coin rule the world

*ID `reserve` · Realism, Story · effort M*

- **What:** The biggest trader’s money becomes everyone’s money, giving it cheap credit and the power to sanction, until it overreaches.
- **Evidence:** **Why:** ties economics to the hegemony items below.
- **Approach:** Track the people with the largest trade volume; after banking its coin becomes the reserve. It borrows cheaper and can sanction effectively; overspending triggers a currency crisis.
- **Done when:** One people's currency dominates for a period and then has a crisis.

### 34. Make famines partly man-made

*ID `famineprice` · Realism, Story · effort S*

- **What:** Price spikes, hoarding merchants and export bans turn a bad harvest into a famine, or a good ruler softens it.
- **Evidence:** **Code:** hunger is only grain in store vs mouths (`s.store`).
- **Approach:** During bad harvests, raise grain prices; greedy rulers or merchants hoard (worsening deaths), warm rulers open granaries (mercy events).
- **Done when:** Famines vary in severity with policy.

## 5. Hegemony and stability

The world today is a churn of small states that rarely last. Let great powers rise, keep order for a while, and fall hard.


### 35. ★ Recognise great powers and a hegemon

*ID `hegemon` · Realism, Emergence, Story · effort M*

- **What:** Rank peoples by power. When one holds a large share, others balance against it in coalitions or bandwagon with it, and great-power wars decide the order.
- **Evidence:** **Code:** `power` is computed per people but never compared across the world.
- **Approach:** Each year rank peoples by `power`. If one holds >40% of world power, others form coalitions (alliances against it) or become clients. Log 'great power' and 'hegemon' events.
- **Done when:** Runs show the rise and challenge of a hegemon.

### 36. Add spheres, clients and puppets

*ID `spheres` · Realism, Emergence · effort M*

- **What:** A hegemon sets the rules in its sphere: protects clients, installs friendly rulers, punishes defectors.
- **Evidence:** **Code:** vassals exist (`Ln.vassalOf`) but only pay tribute.
- **Approach:** Hegemons can install friendly rulers, protect clients (auto-join their defence) and punish defectors.
- **Done when:** Client states appear and switch sides.

### 37. ★ Give realms legitimacy

*ID `legit` · Realism, Emergence · effort M*

- **What:** A stability score from dynasty age, victories, prosperity, faith and institutions. Legitimate realms shrug off unrest; illegitimate ones shatter.
- **Evidence:** **Your run:** 34 of 45 peoples were breakaways. **Code:** any town above 0.58 unrest has a 15% yearly chance to secede (`intrigue`).
- **Approach:** Add `f.legit` (0..1) from dynasty age, recent victories, prosperity, state-faith share and institutions. Multiply secession and revolution chances in `intrigue` by `(1.5 - legit)`.
- **Done when:** Long-lived stable realms appear; breakaways drop well below 34 of 45.

### 38. Let institutions build up

*ID `institutions` · Realism · effort M*

- **What:** Courts, bureaucracy, schools and roads accumulate over centuries and make a state sturdier. Losing them in a collapse sets it back.
- **Evidence:** **Code:** only Law (+30% town hit points) and government type affect stability.
- **Approach:** Add `f.inst` that grows slowly with law, writing and peace and drops in collapse. It lowers unrest and raises research.
- **Done when:** Old states are sturdier than new ones.

### 39. Allow long peaces

*ID `pax` · Realism, Story · effort S*

- **What:** Under a strong hegemon, deterrence or deep trade, centuries of peace with golden ages should be possible, and their end should matter.
- **Evidence:** **Why:** contrast makes destructive wars land harder.
- **Approach:** When a hegemon exists and no great-power war has happened for 50 years, lower war chance among its sphere and raise golden-age chance.
- **Done when:** Century-long peaces occur.

### 40. Model overextension and collapse

*ID `collapse` · Realism, Story · effort M*

- **What:** Big empires pay rising costs for distance, garrisons and debt. Past a limit, a fiscal crisis cascades into secessions and a dark age.
- **Evidence:** **Code:** empires form at 5 towns (`domestic`) with no upkeep.
- **Approach:** Empire upkeep grows with towns and distance; if treasury goes negative for years, trigger a fiscal crisis: secessions cascade and institutions fall.
- **Done when:** Overextended empires collapse.

### 41. Add world institutions

*ID `council` · Emergence, Story · effort L*

- **What:** A council or league of peoples that settles disputes, sets trade rules and sometimes fails spectacularly.
- **Evidence:** **Why:** late-game diplomacy beyond pairs.
- **Approach:** Late game, create a world council when 3+ peoples have printing and trade; it votes on disputes and sanctions, and can fail.
- **Done when:** A council forms and influences at least one war.

## 6. Technology and flight

32 technologies take a people from stone to the stars. Widen the tree and make each step change how the world works.


### 42. ★ Add powered flight

*ID `aviation` · Realism, Emergence · effort M*

- **What:** Balloons, aircraft, jets. Flight should shrink the world: distant peoples become neighbours, trade and war reach anywhere, and air raids hit cities behind the front.
- **Evidence:** **Code:** wars only start between peoples within 650 units (1,100 with Navigation) in `foreignPolicy`; no tech raises it.
- **Approach:** Add techs: balloons → powered flight → jets. Each raises the 'near' distance in `foreignPolicy` (650 → 1,500 → whole map) and trade reach, and enables air raids on towns behind the front.
- **Done when:** After aviation, distant peoples go to war and trade.

### 43. Make winged peoples matter in the air

*ID `fliers` · Emergence, Story · effort M*

- **What:** Natural fliers nest on peaks, scout, raid over walls and dominate before aircraft exist. When everyone can fly, they lose that edge.
- **Evidence:** **Code:** flight only lets agents cross water and move faster (`passable`, `tMult`).
- **Approach:** Give peoples with `g.flight>0.5` scouting range, raids over walls, and peak settlements. Their edge fades once others have aviation.
- **Done when:** Winged peoples dominate early and lose ground later.

### 44. Fill in the industrial and modern tree

*ID `moretech` · Realism · effort M*

- **What:** Steam, railways, telegraph, radio, vaccines and antibiotics, fertilisers, rockets, satellites, networks, renewables, fusion. Each with a visible game effect.
- **Evidence:** **Code:** `TECH` jumps from Industry to Electricity to Computing.
- **Approach:** Add to `TECH`: steam, railways, telegraph, radio, vaccines, antibiotics, fertiliser, rockets, satellites, networks, renewables, fusion; each with a concrete effect hooked into existing systems.
- **Done when:** Each new tech changes a number the player can see.

### 45. Let infrastructure tame distance

*ID `logistics` · Realism · effort S*

- **What:** Roads, railways and telegraph cut the "far from the capital" unrest, so big realms hold together longer.
- **Evidence:** **Code:** distance unrest is fixed at 0.28 per 1,200 units in `unrestOf`.
- **Approach:** Reduce the distance term in `unrestOf` with roads, railways and telegraph.
- **Done when:** Large realms hold together better after logistics techs.

### 46. Add spies and stolen secrets

*ID `espionage` · Emergence, Story · effort M*

- **What:** Peoples steal tech, sabotage rivals and run agents in foreign courts. Secrecy can keep a weapon to yourself for a while.
- **Evidence:** **Code:** tech spreads only through trade partners (+40% in `research`).
- **Approach:** Add a spy action: steal a tech the target has, sabotage research, or plant an agent at court. Caught spies add grudges.
- **Done when:** Tech theft events occur.

### 47. Make space a race

*ID `space` · Story, Emergence · effort M*

- **What:** Satellites, orbital weapons and prestige before the Departure, so the endgame has more than one way out.
- **Evidence:** **Code:** `spaceflight` only triggers `depart`.
- **Approach:** Add satellites (sight, prestige) and orbital weapons before spaceflight; prestige raises legitimacy.
- **Done when:** Space race events precede the Departure.

### 48. Make AI a branch, not a timer

*ID `aitree` · Emergence, Fix · effort M*

- **What:** Compute, alignment research and machine bans as techs and laws, so peoples choose how fast to go.
- **Evidence:** **Code:** AI danger grows from Computing, Genetics, Uplift and Transcendent Art in `S.doomYear`.
- **Approach:** Make AI growth come from an explicit `compute` tech level per people, and add alignment research and machine-ban laws that reduce it.
- **Done when:** Peoples can choose to slow or speed AI.

## 7. War, power and politics

Make conflict cost more, last longer in memory, and come from inside states as well as between them.


### 49. ★ Make wars cost something and escalate

*ID `wars` · Realism, Story · effort M*

- **What:** Add sieges, famine behind the lines and escalation: the third war over the same grievance should not end like the first. Repeated wars should end in absorption, a lasting border or annihilation.
- **Evidence:** **Your run:** seven Mivekmom–Hyatwahil holy wars ended "in peace" with 1 to 16 dead each. **Code:** `S.warYear`, `makePeace`.
- **Approach:** Track per-pair war history in `rel.wars` (count, dead, outcome). Each repeat of the same grievance raises the war's intensity: higher soldier share, sieges more likely to end in sack, peace terms harsher. After 3+ wars, peace terms favour annexation, a fixed border, or extermination.
- **Done when:** Seven repeated holy wars no longer each end with one death; later wars are visibly bloodier and more decisive.

### 50. Give rulers dynasties

*ID `houses` · Emergence, Story · effort M*

- **What:** Named houses that persist across succession, marry across peoples and claim the thrones of daughter peoples. Family lines become the spine of the story.
- **Evidence:** **Code:** characters have `parent` and `spouse` but no house; `succession` picks individuals.
- **Approach:** Add `S.houses` with `{id, nameId, founder, fac, seat}`. `newChar` inherits `house` from `parentChar`; rulers without a parent found a house. Marriage links houses across peoples. In `secede`, the leader founds a cadet branch. Show house names in `cname` when relevant and in the book's rulers tab.
- **Done when:** Rulers list shows dynasties; a house can rule two peoples at once.

### 51. Add power blocs inside each realm

*ID `blocs` · Realism, Emergence · effort L*

- **What:** Priests, army, merchants and commoners each hold a share of power. Coups, reforms and revolutions come from whichever bloc is strongest and angriest.
- **Evidence:** **Code:** `intrigue` only has the heir, the general and the crowd.
- **Approach:** Add `f.blocs = {priests, army, merchants, commons}` each with `power` and `mood`. Tech, government and events shift power (printing raises commons, banking merchants). Coups come from the army bloc, theocratic takeovers from priests, revolutions from commons. Feed bloc moods into `intrigue` instead of fixed heir/general rolls.
- **Done when:** Chronicle explains coups and reforms by which bloc acted.

### 52. Let revolutions spread

*ID `contagion` · Realism, Emergence · effort S*

- **What:** A successful revolution should raise the odds in neighbours who share printing, trade or a tongue.
- **Evidence:** **Your run:** four revolutions in Age V, each rolled separately.
- **Approach:** When a revolution succeeds in `intrigue`, add a temporary `revolutionHeat` to every people with printing that trades with or borders it, increasing their revolution chance for 30 years.
- **Done when:** Revolutions cluster in waves.

### 53. Add leagues, federations and multi-people empires

*ID `leagues` · Emergence · effort L*

- **What:** Collective defence pacts, councils of several peoples, and empires that rule many peoples and later break along them.
- **Evidence:** **Code:** relations are pairwise only (`rel`).
- **Approach:** Add `S.leagues = [{id, name, members[], kind:'defence'|'trade'|'faith'}]`. Members answer each other's wars in `declareWar`. Empires holding several peoples' towns record each group (see minorities) and fracture along them in a collapse.
- **Done when:** A named league fights together at least once in a long run.

### 54. Add succession crises

*ID `succession` · Story, Emergence · effort M*

- **What:** Child rulers, regents, rival claimants backed by foreign houses, and wars of succession that pull in allies.
- **Evidence:** **Code:** `civilWar` exists but is rare; regencies don’t.
- **Approach:** In `succession`, if the heir is young (`age < 16`), appoint a regent (ambitious courtier) who may usurp. Allow rival claimants from marriage ties (`r.marriage`) to be backed by foreign peoples, triggering a war of succession.
- **Done when:** Regencies and foreign-backed claimants appear in the chronicle.

### 55. Give money more to do

*ID `economy` · Realism, Emergence · effort M*

- **What:** Debt, trade routes with chokepoints, debased coin and merchant wars. The treasury today mostly buys wonders.
- **Evidence:** **Code:** `f.treasury` is spent in `buildWonder` and taken in peace terms.
- **Approach:** Superseded by section 9 (money, markets and trade). Implement there.
- **Done when:** See section 9.

### 56. Make treaty clauses last

*ID `treaties` · Realism, Story · effort M*

- **What:** Borders, demilitarised zones and protected minority faiths that can be broken later, with consequences.
- **Evidence:** **Code:** `S.peaceTerms` applies terms once; only tribute and vassalage persist.
- **Approach:** Store terms on `rel.treaty` (border towns, demilitarised zone, protected faith, expiry). Check violations yearly; breaking one counts as betrayal (`A.rep` loss, grudges) and can be a war reason.
- **Done when:** Broken treaties appear as causes of later wars.

## 8. Faith

Your faiths split often but differ little. Make them disagree about real things and carry their history.


### 57. ★ Rebalance "Carry the truth"

*ID `convert` · Emergence, Fix · effort S*

- **What:** Give the conversion tenet a cost (more holy wars, neighbours’ grudges) or cap the spread multiplier, so other teachings can win.
- **Evidence:** **Your run:** it appears in 42 of 66 faiths. **Code:** its spread multiplier is 1.9; every other tenet is 0.4 to 1.4 (`TENETS`).
- **Approach:** In `TENETS`, lower `convert.sp` from 1.9 to ~1.3, and raise its `war` value. Cap the spread product in `faithTick` at e.g. 1.8. Add a grudge from neighbours toward peoples whose state faith has `convert`.
- **Done when:** Across 10 seeds the conversion tenet appears in under 40% of faiths.

### 58. Grow new tenets out of events

*ID `scars` · Emergence, Story · effort M*

- **What:** Only 16 mainstream tenets exist. Write new ones from what happened: after a plague, a famine, a nuclear fire, an enslavement.
- **Evidence:** **Code:** `pickTenets` draws from a fixed list.
- **Approach:** Add a generator that writes a new tenet after major events affecting a people (plague, famine, nuke, enslavement, conquest): pick a template list per event (e.g. plague: 'Wash before you touch the dead'), with a value, spread and war score. Add it to `TENETS` at runtime (saved in `S`) and to that people's next sect.
- **Done when:** Late faiths carry commandments that reference their history.

### 59. Make sects disagree about something

*ID `axes` · Emergence, Story · effort M*

- **What:** Give each faith a few doctrine positions (afterlife, who may be a priest, mercy or judgement, are machines holy) and split sects along them.
- **Evidence:** **Code:** a sect drops one tenet and adds one at random in `foundFaith`.
- **Approach:** Give each faith `F.doctrine = {afterlife, clergy, godNature, machines}` each in -1..1. Sects in `foundFaith` flip or push one axis; describe the dispute in the schism text ('denies that priests may marry'). Use distance between doctrines in `opinion` instead of only same-root checks.
- **Done when:** Schism events state what the sects disagree about.

### 60. Make holy places matter

*ID `holy` · Realism, Story · effort M*

- **What:** Losing the holy city is a crisis, pilgrim roads double as trade routes, and recapture becomes a war goal.
- **Evidence:** **Code:** `F.holy` exists and only feeds one prophecy sign.
- **Approach:** Use `F.holy`. If a foreign or rival-faith people takes it, log a crisis, lower faith share, and add a 'reclaim' war goal. Pilgrims create trade value between the holy town and believers.
- **Done when:** Holy city captures cause crusade-like wars.

### 61. Remember saints and martyrs

*ID `martyrs` · Story · effort S*

- **What:** Keep martyrs as figures that later sects invoke, name temples after, and fight over.
- **Evidence:** **Your run:** Bavem was burned in 245 and became a martyr in one line, then was never mentioned again.
- **Approach:** Keep `S.saints` (char id, faith id, year, cause). Martyrdom (`cultStep`, `falseprophet`) adds one. Later sects and chapters can invoke them; `chapterBrief` lists saints of active faiths.
- **Done when:** A martyr from one age is named in a later chapter.

### 62. Let failed prophecies bite

*ID `prophecy` · Emergence, Story · effort S*

- **What:** A prophecy that misses its sign can cause a crisis of faith, a reinterpretation, or a new sect.
- **Evidence:** **Code:** prophecies only resolve on success (`prophetStep`).
- **Approach:** When a sign event happens and no prophet claims it within ~20 years, or a prophet is executed as false with high support, roll a crisis: faith share drops, or a reinterpreting sect is founded.
- **Done when:** Failed prophecies sometimes create sects.

### 63. Absorb the gods of the conquered

*ID `syncretism` · Realism, Emergence · effort S*

- **What:** Conquerors adopt defeated gods as saints or lesser gods. Today only cults can merge.
- **Evidence:** **Code:** merging lives only inside `respond` for cults.
- **Approach:** After conquest of a people with a different faith, the victor's faith may add one defeated god as a lesser god (`F.gods.push`) with a log event.
- **Done when:** Victors' faiths gain foreign gods over time.

### 64. Let forgotten gods come back

*ID `dormant` · Emergence, Story · effort M*

- **What:** Ruins, old scripture or a heretic can revive a forgotten immortal, rival or your own.
- **Evidence:** **Your run:** the Hollow King and the Iron Sovereign were gone for good by 132 and 333.
- **Approach:** When a rival god is forgotten, keep its record. Later, digging a ruin, finding old scripture, or a cult can revive it (`arriveGod`-like, but on an existing people).
- **Done when:** A forgotten god returns in a long run.

## 9. Tongues and writing

The language system already produces real etymology. Push it further and show it off.


### 65. ★ Give each tongue its own habits

*ID `habits` · Realism, Emergence · effort M*

- **What:** Give each language family rules it prefers and rules it never takes, conditioned on its sounds, so daughters sound related and strangers sound strange.
- **Evidence:** **Your run:** "an ending -a is added to names" happened at least 23 times. **Code:** `soundShift` shuffles one global list of 23 rules.
- **Approach:** Give each root language `L.prefs` (weights over `RULES`, e.g. 6 favoured, 6 banned), inherited with small mutations by daughters. In `soundShift`, sample rules by weight instead of `shuffle(RULES)`. Condition rules on the language's sound inventory (`L.C`, `L.V`).
- **Done when:** Daughter tongues share recognisable habits; the '-a ending' change no longer dominates.

### 66. Carry loanwords on contact

*ID `loans` · Realism, Story · effort M*

- **What:** Trade, conquest and faith should move words between tongues, and new tech should bring the inventor’s word for it. The lexicon is fixed at about 40 concepts.
- **Evidence:** **Code:** `CONCEPTS` is fixed; `newLang` only copies from the parent.
- **Approach:** When peoples trade, fight or convert, copy 1–3 lexicon entries between languages (`L.lex[c]`) adjusted by the receiver's sound rules, and record `L.loans`. When a people learns a tech first, coin a word for it; others who learn it from them borrow the word.
- **Done when:** Language tables show borrowed words with their source.

### 67. Keep dead tongues alive in scripture

*ID `liturgy` · Realism, Story · effort S*

- **What:** When a people dies, its tongue can live on as the holy language of its faith.
- **Evidence:** **Your run:** the Mivekmom died in 405, but the True Path they founded outlived them.
- **Approach:** When a people dies, if its faith survives elsewhere, mark its language as liturgical (`L.liturgical=true`) and keep it frozen. Scripture and faith names keep using it.
- **Done when:** Dead tongues appear as holy languages in the book.

### 68. Add exonyms

*ID `exonyms` · Realism, Story · effort S*

- **What:** What neighbours call a people (and its towns) in their own tongue, alongside what it calls itself.
- **Evidence:** **Code:** `compose` already makes names from concepts in any tongue.
- **Approach:** Add `exonym(facId, viewerFacId)` that composes the target's concepts in the viewer's language. Show it in the peoples panel and in chronicle text written from a people's viewpoint.
- **Done when:** Peoples panel shows what neighbours call each people.

### 69. Measure how well tongues understand each other

*ID `intel` · Realism, Emergence · effort S*

- **What:** Distance between tongues decides whether daughters can still trade, marry or follow a sermon.
- **Evidence:** **Code:** lexicons are comparable word by word.
- **Approach:** Add `langDistance(L1,L2)` = share of the 8 core words that differ. Use it to scale trade, marriage and conversion odds, and in secession reasons.
- **Done when:** Close tongues trade and marry more.

### 70. Show the etymologies

*ID `etym` · Story · effort S*

- **What:** Names are compounds: Mivekmam is folk + moon, Lowileh is death + god in Biliem, Igdasnawe is death + god in Ownofon. Show this in tooltips and the book.
- **Evidence:** **Code:** every name keeps its `concepts`, so it’s a display change.
- **Approach:** Show `glossOf(nameId)` and god-name compounds (e.g. Lowileh = death + god) in tooltips, the peoples panel and the book's languages tab.
- **Done when:** Hovering a name shows its meaning.

## 10. Peoples, bodies and land

Make the creatures and their world push back harder on each other.


### 71. ★ Spread disease by contact

*ID `disease` · Realism, Emergence, Story · effort M*

- **What:** Send epidemics along trade routes, armies and pilgrim roads. Give survivors immunity, and make first contact with an arrival a "virgin soil" epidemic that can flip history.
- **Evidence:** **Your run:** the grey plague from the Hyatwahul (95) was the best early twist. **Code:** `plague` fires at 0.15% a year on a random people.
- **Approach:** Give each epidemic an object `{id, name, strain(genome target), lethality, born}`. Each year it spreads from infected peoples to others with probability scaled by trade (`rel.trade`), war (`rel.war`), shared borders and pilgrim roads. Survivors gain `f.immune[id]`. When an arrival (`S.emerge`) first meets a people, roll a 'virgin soil' epidemic that is far deadlier to whichever side has less exposure. Keep using `die(a,'plague')`.
- **Done when:** Plagues visibly travel along trade partners in the chronicle; first contact sometimes devastates one side.

### 72. Keep minorities alive inside a realm

*ID `minorities` · Realism, Emergence · effort L*

- **What:** Track conquered, enslaved and migrant groups per town, with their own tongue and faith, so later revolts follow old ethnic lines.
- **Evidence:** **Your run:** the Zishishi were marched to Liemhih in chains (417) and then vanish from the record.
- **Approach:** Add `s.groups = {[facId]: share}` to each settlement, seeded when a town is conquered (`cedeTown`, sacks), when slaves are taken, or when refugees arrive. Groups keep their own language id and faith. Add their discontent to `unrestOf` ('the X here were never one of us'). In `secede`, prefer towns whose largest minority differs from the ruling people, and name the new people from the minority.
- **Done when:** A conquered minority can rebel centuries later under its own name.

### 73. Let peoples mix

*ID `hybrids` · Emergence, Story · effort M*

- **What:** When two peoples share towns for generations, blend their genomes into a new hybrid people with a creole tongue.
- **Evidence:** **Code:** `meanGenome` and `newLang` already support it; nothing triggers it.
- **Approach:** When two peoples' agents share a town for 60+ years and relations are friendly, run a rare event that creates a new faction with `meanGenome` of both groups and a new language whose lexicon mixes both parents (50/50 per concept).
- **Done when:** A run occasionally produces a named hybrid people with a mixed tongue.

### 74. Put real resources on the map

*ID `resources` · Realism, Emergence · effort M*

- **What:** Iron, glowstone, pearls and salt as map deposits that set trade routes, wealth and war goals.
- **Evidence:** **Code:** `goods` already names glowstones, pearls and iron tools, but only as flavour text.
- **Approach:** At world creation, place deposits on tiles (`S.res[k]`: iron, glowstone, salt, pearls, timber) using the noise already in `makeSim`. Towns within range gain production. Use deposits in `foreignPolicy` as a war reason ('they hold the iron of X') and in `goods`.
- **Done when:** Wars cite resources; rich-deposit towns grow faster.

### 75. Make refugees arrive somewhere

*ID `refugees` · Realism, Emergence · effort S*

- **What:** Survivors of drowned or burned cities should move into neighbours, raising unrest and carrying their tongue and faith.
- **Evidence:** **Your run:** Migegofw drowns in 986 and its survivors "walk inland, looking for land that belongs to someone else". Nothing happens after.
- **Approach:** When a town drowns, burns (`nuke`), is razed, or starves, move surviving agents to the nearest friendly town of another people with probability by opinion; record them as a minority group (see minorities) and add unrest there.
- **Done when:** Drowning and burning events are followed by refugee arrival events in neighbours.

### 76. Lower birth rates as peoples urbanise

*ID `fertility` · Realism · effort S*

- **What:** Learning, cities and medicine should reduce fertility, so late peoples age and shrink instead of growing until a war.
- **Evidence:** **Code:** fertility is genetic only (`stats`, `mutate`).
- **Approach:** In `stats` or the birth code, multiply birth chance by `(1 - 0.35*urban - 0.15*tech.medicine - 0.15*tech.industry)` where `urban` is the share living in level-3+ towns.
- **Done when:** Late-game populations plateau and age instead of growing until war.

### 77. Add natural shocks before industry

*ID `shocks` · Realism, Story · effort S*

- **What:** Volcanic winters, droughts, locusts and earthquakes that topple capitals. Today pre-industrial shocks are just the comet and plague.
- **Evidence:** **Code:** `yearly` rolls only the Green Comet and plague before climate change.
- **Approach:** In `yearly`, add rare pre-industrial events: volcanic winter (global `foodMult` 0.6 for 5–10 years), regional drought (food 0.5 in one region), locusts (one people's stores halved), earthquake (capital `hp` halved, buildings lost). Make them prophecy signs in `SIGNS`.
- **Done when:** Pre-industrial ages contain natural disasters that cults and prophets react to.

## 11. Your role as the god

Your choices are the best part of the game. Make them easier to read and longer-lasting.


### 78. Warn before low Mercy breaks the realm

*ID `mercy` · Fix, Story · effort S*

- **What:** Show where Mercy is drifting and forecast the risk before towns start renouncing you.
- **Evidence:** **Your run:** the Ownofadg, Oyge and Ogosoda all broke away in 1079–1087. **Code:** Mercy at 20 or below gives each of your peoples a 4.5% yearly chance of a breakaway (`S.godsYear`).
- **Approach:** Expose Mercy and Greatness trend arrows and a forecast in `renderHand`; when Mercy is under 30 and falling, show a warning card before the 20 threshold triggers breakaways in `S.godsYear`.
- **Done when:** Players see a warning before towns renounce them.

### 79. Make rival gods adapt

*ID `rivals` · Emergence · effort M*

- **What:** Rivals act on a fixed timer with a fixed style. Let them gang up on you, copy what works, and court your heretics.
- **Evidence:** **Code:** `rivalAct` runs every 11–21 years per rival.
- **Approach:** Give rivals memory of what worked (wins, conversions) and let `rivalAct` choose actions by expected payoff. Let two rivals ally against the player when the player's believers exceed theirs combined.
- **Done when:** Rivals change tactics across a run.

### 80. Bring old choices back decades later

*ID `tails` · Story, Emergence · effort M*

- **What:** Track each choice and resurface it as a new card generations on ("the grandchildren of Tree-High ask…").
- **Evidence:** **Your run:** the best beats were delayed: striking down Favih led to "the Maker devours its own beloved".
- **Approach:** Store each player choice with its target ids. Every 30–80 years, `cardTrigger` can pick an old choice whose people still exist and build a callback card ('the grandchildren of Tree-High ask...').
- **Done when:** At least one callback card appears per long run.

### 81. Add more ways for your story to end

*ID `endings` · Story · effort M*

- **What:** Your faith outlives you, a successor god takes over, your believers leave for the stars, or the machine becomes your heir.
- **Evidence:** **Code:** defeat comes from being forgotten or from the AI; the finale kinds are last war, unification, devourer and long night.
- **Approach:** Add end states checked in `S.godsYear`/`S.finaleTick`: faith outlives worship, successor god (undying ruler or AI adopts your faith), believers depart with spaceflight, peaceful machine. Each with its own end screen text in `showDefeat`.
- **Done when:** Several distinct endings are reachable.

## 12. Story and chronicle

Help the historian connect ages, and let the world remember.


### 82. ★ Give the historian threads to pay off

*ID `threads` · Story · effort S*

- **What:** Keep a list of open threads (unfulfilled prophecies, exiled heirs, enslaved peoples, old grudges) and pass them to each chapter so later ages call back to earlier ones.
- **Evidence:** **Code:** `chapterPrompt0` sends only the previous chapter as context.
- **Approach:** Build `openThreads()` from the sim: unfulfilled prophecies, exiled heirs, hostages, enslaved groups, grudges above a threshold, forgotten gods. Pass the top 8 to `chapterPrompt0` with an instruction to call back to them.
- **Done when:** Later chapters refer to earlier events by name.

### 83. Add an optional family-line view

*ID `pov` · Story · effort M*

- **What:** Follow one ordinary bloodline through the ages as a recurring point of view in the book.
- **Evidence:** **Why:** this is what made the story of the counting cord work.
- **Approach:** Pick one ordinary agent's family at world start and follow its descendants (add a `parent` id to agents at birth if it isn't stored). Pass a short 'family thread' per age to the chapter prompt as an optional point of view.
- **Done when:** Book includes a recurring family across ages.

### 84. Let some grudges last for centuries

*ID `memory` · Emergence, Story · effort S*

- **What:** Grudges fade by half in about 45 to 100 years. Let scripture, songs and monuments keep a few alive for much longer.
- **Evidence:** **Code:** grudges decay by 0.7–1.5% a year in `yearly`.
- **Approach:** Mark some grudges as 'remembered in scripture' (when the people has writing and the grievance was large); these decay 5x slower in `yearly`.
- **Done when:** Old grievances resurface centuries later.

### 85. Dig up the past

*ID `dig` · Emergence, Story · effort M*

- **What:** Ruins can be excavated to recover lost tech, old scripture and forgotten gods.
- **Evidence:** **Code:** `S.ruins` keeps every abandoned, burned and drowned town.
- **Approach:** Add an excavation event when a people with writing settles near a `S.ruins` entry: recover a lost tech, scripture, or revive a forgotten faith.
- **Done when:** Ruins are rediscovered in long runs.

### 86. Allow dark ages

*ID `dark` · Realism, Story · effort S*

- **What:** Tech is only lost when a capital is sacked. Let collapses, plagues and fallen libraries cost knowledge too.
- **Evidence:** **Code:** tech loss is a single line inside the sacking code.
- **Approach:** When a capital falls, a great plague kills >30%, or a city is nuked, roll tech loss for the most recent non-basic tech(s) of that people.
- **Done when:** Collapses can push a people back an era.

---

## When you finish a phase

Report back with:
1. The item numbers you completed, and any you skipped or changed and why.
2. A list of new state fields and their defaults (for save compatibility).
3. New `log` event types you added.
4. Anything you noticed in the code that looks like a bug but was out of scope.

Effort tags are rough: **S** is an evening, **M** a weekend, **L** a real project.
