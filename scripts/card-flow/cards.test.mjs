// Decision-card pipeline test (stub AI, headless chromium). NOT part of the build.
// 1. playwright-core is not a repo dependency: `npm i playwright-core` in a temp dir OUTSIDE the repo and run this
//    script from there (copy it next to that node_modules) so `import 'playwright-core'` resolves.
// 2. From the repo root: `npx vite --config scripts/card-flow/vite.test.config.mjs` (dev server on :5199 that exposes window.__g).
// 3. `CHROME=/path/to/chromium node cards.test.mjs`
// Headless check of the decision-card pipeline with a stub AI (mock OpenAI-compatible endpoint via page.route).
// Needs: playwright-core (npm i --no-save in a temp dir), chromium, and a dev server exposing window.__g (see header of vite.test.config.mjs).
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:5199/';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

function deferred() { let r; const p = new Promise(x => (r = x)); p.release = r; return p; }

async function boot(opts = {}) {
  for (let i = 0; i < 6; i++) { const r = await boot1(opts); if (await r.page.evaluate(() => __g.S.reach().length > 0 && (__g.S.year < 50 || __g.S.alive().length > 1))) return r; console.log('  (retry: world without a playable people)'); await r.page.close(); }
  throw new Error('no playable world');
}
async function boot1({ ai = true, untilYear = 300 } = {}) {
  const page = await browser.newPage();
  const mock = { gate: null, calls: [], mode: 'normal', targetName: null };
  page.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
  await page.addInitScript(ai => {
    try { localStorage.setItem('brood_prologue', '1'); } catch (e) {}
    if (ai) try { localStorage.setItem('brood-and-empire.ai.v1', JSON.stringify({ provider: 'custom', customBaseUrl: 'http://mock.test/v1', keys: {}, models: { custom: { default: 'stub' } } })); } catch (e) {}
  }, ai);
  await page.route('http://mock.test/**', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    const prompt = (body.messages && body.messages[0] && body.messages[0].content) || '';
    mock.calls.push(prompt);
    if (mock.gate) await mock.gate;
    // the card writer: pick the peoples the prompt allows, and (in 'target' mode) lean on a named target
    const m = /Use ONLY these peoples by exact name: ([^\n]*?)\.(?:\n|$)/.exec(prompt);
    const names = m ? m[1].split(', ') : [];
    const P = mock.people || names[0];
    const card = { title: 'The Stub Speaks', scene: `Right now, ${P} look to the sky.`, speaker: null, options: [
      { label: 'Feed them', hint: 'grain for mercy', lean: 'mercy', weight: 6, outcome: 'Grain fills the stores.', effects: [{ fx: 'food', people: P, amount: 0.6 }, { fx: 'unrest', people: P, amount: 0.1 }] },
      { label: 'Strike the enemy', hint: 'force', lean: 'greatness', weight: 6, outcome: 'The spears are raised.', effects: mock.mode === 'target' ? [{ fx: 'peace', people: P, target: mock.targetName }, { fx: 'faith', people: P, amount: -0.05 }] : [{ fx: 'bless_army', people: P }, { fx: 'faith', people: P, amount: -0.05 }] },
      { label: 'Say nothing', hint: 'silence', lean: 'none', weight: 0, outcome: 'Nothing.', effects: mock.mode === 'target' ? [{ fx: 'peace', people: P, target: mock.targetName }] : [{ fx: 'faith', people: P, amount: -0.1 }] },
    ] };
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(card) }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.goto(URL);
  await page.waitForSelector('#crGo', { state: 'visible' });
  await page.click('#crGo');
  await page.waitForTimeout(400);
  // advance to a world with several peoples, with cards suppressed
  await page.evaluate(untilYear => {
    const g = __g, S = g.S, sg = g.saga;
    sg.cardsThisAge = 99; sg.emergThisAge = 99; sg.convoDone = true; sg.nextCard = 1e9;
    let n = 0; while (S.year < untilYear && n < 400000) { S.step(1 / 4); n++; }
    sg.choice = null; sg.cardBusy = false; sg.pending = false; sg.closingAt = null; sg.closing = null; sg.ageStart = Math.floor(S.year);
    sg.cardsThisAge = 99; sg.emergThisAge = 99;
  }, untilYear);
  return { page, mock };
}
const ev = (page, types) => page.evaluate(types => __g.S.events.filter(e => types.includes(e.type)).map(e => ({ type: e.type, title: e.title, text: e.text, why: e.data.why, ok: e.data.ok, yr: e.yr })), types);
const year = page => page.evaluate(() => __g.S.year);

// ---------- 1. the world waits while a card is written ----------
{
  const { page, mock } = await boot();
  await page.evaluate(() => { __g.setSpeed(40); __g.running = true; });
  await page.waitForFunction(() => !document.querySelector('#worlds').offsetParent || true);
  const a0 = await year(page); await page.waitForTimeout(1200); const a1 = await year(page);
  ok(a1 > a0 + 1, `control: with no card pending the sim runs at 40x (year ${a0.toFixed(1)} -> ${a1.toFixed(1)})`);
  mock.gate = deferred();
  await page.evaluate(() => { const S = __g.S; const t = S.cardTrigger(true) || S.cardTrigger(false); __g.requestCard(t); });
  const y0 = await year(page); await page.waitForTimeout(1500); const y1 = await year(page);
  const st = await page.evaluate(() => ({ busy: __g.saga.cardBusy, listen: !document.getElementById('listen').hidden, running: __g.running, speed: __g.speed }));
  ok(y1 === y0, `sim is paused while the card is being written (year ${y0.toFixed(2)} -> ${y1.toFixed(2)})`);
  ok(st.busy && st.listen, 'cardBusy set and the "Maker listens" marker is visible');
  ok(st.running && st.speed === 40, 'the player run/speed state is untouched during the wait');
  mock.gate.release();
  await page.waitForFunction(() => __g.saga.choice && __g.saga.choice.kind === 'gen', null, { timeout: 8000 });
  const st2 = await page.evaluate(() => ({ busy: __g.saga.cardBusy, listen: !document.getElementById('listen').hidden, running: __g.running, speed: __g.speed, prem: !!document.querySelector('.chprem') }));
  ok(!st2.busy && !st2.listen, 'marker hides and cardBusy clears when the card is ready');
  ok(st2.running && st2.speed === 40, 'speed and running state restored/unchanged after the card');
  ok(st2.prem, 'the card header shows the premise');
  await page.close();
}
// ---------- 1b. a player who had already paused stays paused ----------
{
  const { page, mock } = await boot();
  await page.evaluate(() => { __g.running = false; });
  mock.gate = deferred();
  await page.evaluate(() => { const S = __g.S; __g.requestCard(S.cardTrigger(true) || S.cardTrigger(false)); });
  await page.waitForTimeout(300); mock.gate.release();
  await page.waitForFunction(() => __g.saga.choice && __g.saga.choice.kind === 'gen', null, { timeout: 8000 });
  ok(await page.evaluate(() => __g.running === false), 'a player-paused game is still paused after the card is ready');
  await page.close();
}
// ---------- 1c. a failing/timeout provider also resumes ----------
{
  const { page } = await boot({ ai: false });
  await page.evaluate(() => { const S = __g.S; __g.requestCard(S.cardTrigger(true) || S.cardTrigger(false)); });
  await page.waitForFunction(() => __g.saga.choice, null, { timeout: 4000 });
  ok(await page.evaluate(() => !__g.saga.cardBusy && document.getElementById('listen').hidden), 'no-AI fallback card: cardBusy cleared, marker hidden');
  await page.close();
}
// ---------- 2. target killed while the card is pending ----------
{
  const { page, mock } = await boot();
  const info = await page.evaluate(() => {
    const S = __g.S; const P = S.reach()[0]; const E = S.alive().find(f => !S.isMine(f) && f !== P);
    if (!P || !E) return null;
    S.applyFx([{ fx: 'war', people: P.name, target: E.name }]);
    return { P: P.name, E: E.name, Pid: P.id, Eid: E.id, war: S.premise({ k: 'war', a: P.id, b: E.id }).ok };
  });
  if (!info) { console.log('SKIP no second people'); } else {
    ok(info.war, `setup: ${info.P} is at war with ${info.E}`);
    mock.mode = 'target'; mock.targetName = info.E; mock.people = info.P; mock.gate = deferred();
    await page.evaluate(info => { const S = __g.S, Y = Math.floor(S.year); __g.requestCard({ kind: 'emergency', tag: 'war', key: 'test', grp: 'war:test', sev: 3, why: `War, right now: the ${info.E} threaten the ${info.P}.`, people: info.P, enemy: info.E, prem: { k: 'war', a: info.Pid, b: info.Eid }, yr: Y, deadline: Y + 6 }); }, info);
    await page.waitForTimeout(200);
    await page.evaluate(info => { const E = __g.S.facs[info.Eid]; E.died = Math.floor(__g.S.year); }, info); // annihilated while Claude was writing
    mock.gate.release();
    await page.waitForFunction(() => !__g.saga.cardBusy, null, { timeout: 8000 });
    await page.waitForTimeout(500);
    const res = await page.evaluate(info => { const ch = __g.saga.choice; return { shown: !!ch, text: ch ? JSON.stringify(ch.card) : '', stale: ch ? !__g.S.checkCard(ch.trigger, ch.card).ok : null }; }, info);
    const voids = await ev(page, ['cardvoid']);
    ok(!res.shown || (!res.text.includes(info.E) && res.stale === false), `the stale card was not shown (${res.shown ? 'regenerated fresh without ' + info.E : 'discarded'}); stub calls=${mock.calls.length}`);
    if (!res.shown && !voids.length) console.log('DEBUG2', mock.calls.length, JSON.stringify(await page.evaluate(() => ({ busy: __g.saga.cardBusy, choice: __g.saga.choice, y: __g.S.year, live: __g.S.liveSituations().map(s => s.key), titles: __g.saga.cardTitles }))));
    ok(res.shown || voids.length >= 1, `a discard is announced in the chronicle (${voids.map(v => v.text.slice(0, 70)).join(' | ')})`);
  }
  await page.close();
}
// ---------- 3. choose: logged with 'because you', then followed up ----------
{
  const { page, mock } = await boot();
  const P = await page.evaluate(() => __g.S.reach()[0].name);
  mock.people = P;
  await page.evaluate(() => { const S = __g.S; __g.requestCard(S.cardTrigger(true) || S.cardTrigger(false)); });
  await page.waitForFunction(() => __g.saga.choice && __g.saga.choice.kind === 'gen', null, { timeout: 8000 });
  await page.waitForSelector('#choice:not([hidden]) [data-cho]');
  const m0 = await page.evaluate(() => ({ g: __g.S.maker.greatness, m: __g.S.maker.mercy }));
  const pop0 = await page.evaluate(P => { const S = __g.S; const f = S.alive().find(f => f.name === P); return S.setts.filter(s => s.fac === f.id).reduce((t, s) => t + s.store, 0); }, P);
  await page.click('#choice [data-cho="o0"]');
  await page.waitForSelector('#chGo');
  const fx = await ev(page, ['makerfx', 'choice']);
  const because = fx.filter(e => (e.why || []).some(w => /^Because you /.test(w)));
  ok(because.some(e => e.type === 'makerfx') && because.some(e => e.type === 'choice'), `choice and effects logged with a "Because you ..." why (${because.length} events; e.g. "${(because.find(e => e.type === 'makerfx') || {}).text}")`);
  const pop1 = await page.evaluate(P => { const S = __g.S; const f = S.alive().find(f => f.name === P); return S.setts.filter(s => s.fac === f.id).reduce((t, s) => t + s.store, 0); }, P);
  ok(pop1 > pop0, `the effect was immediate: stores ${Math.round(pop0)} -> ${Math.round(pop1)}`);
  const fol = await page.evaluate(() => __g.S.maker.follow.length);
  ok(fol >= 1, `a follow-up was scheduled (${fol})`);
  await page.click('#chGo');
  await page.evaluate(() => {
    const g = __g, S = g.S, sg = g.saga; const until = Math.max(...S.maker.follow.map(f => f.at)) + 1;
    sg.cardsThisAge = 99; sg.emergThisAge = 99; sg.convoDone = true; sg.nextCard = 1e9;
    let n = 0; while (S.year < until && n < 100000) { S.step(1 / 4); n++; }
  });
  const fu = await ev(page, ['followup']);
  ok(fu.length >= 1 && (fu[0].why || []).some(w => /^Because you /.test(w)), `follow-up outcome logged: "${fu[0] ? fu[0].title + ' - ' + fu[0].text : ''}"`);
  await page.close();
}
// ---------- 4. target dies after the card is shown, before the click ----------
{
  const { page, mock } = await boot();
  const info = await page.evaluate(() => { const S = __g.S; const P = S.reach()[0]; const E = S.alive().find(f => !S.isMine(f) && f !== P); return P && E ? { P: P.name, E: E.name, Eid: E.id } : null; });
  if (!info) console.log('SKIP no second people'); else {
    mock.mode = 'target'; mock.targetName = info.E; mock.people = info.P;
    await page.evaluate(() => { const S = __g.S; __g.requestCard(S.cardTrigger(false)); });
    await page.waitForFunction(() => __g.saga.choice && __g.saga.choice.kind === 'gen', null, { timeout: 8000 }).catch(async e => { console.log('DEBUG', JSON.stringify(await page.evaluate(() => ({ busy: __g.saga.cardBusy, choice: !!__g.saga.choice, voids: __g.S.events.filter(e => e.type === 'cardvoid').map(e => e.text) }))), mock.calls.length, info); throw e; });
    await page.waitForSelector('#choice:not([hidden]) [data-cho]');
    const cardHasE = await page.evaluate(E => JSON.stringify(__g.saga.choice.card).includes(E), info.E);
    await page.evaluate(info => { __g.S.facs[info.Eid].died = Math.floor(__g.S.year); }, info);
    const m0 = await page.evaluate(() => ({ g: __g.S.maker.greatness, m: __g.S.maker.mercy }));
    await page.click('#choice [data-cho="o2"]'); // only effect: peace with E, now gone
    await page.waitForSelector('#chGo');
    const txt = await page.textContent('#chCard .chfx') .catch(() => '') + ' ' + await page.textContent('#chCard .chout');
    const m1 = await page.evaluate(() => ({ g: __g.S.maker.greatness, m: __g.S.maker.mercy }));
    const mf = await ev(page, ['makerfx', 'cardvoid']);
    ok(cardHasE, 'setup: the card named the target when shown');
    ok(/no more/i.test(txt) && /too late/i.test(txt), `the player is told the target is gone: "${txt.replace(/\s+/g, ' ').slice(0, 160)}"`);
    ok(m0.g === m1.g && m0.m === m1.m, 'a void choice does not move Greatness/Mercy');
    ok(mf.some(e => /Because you/.test((e.why || [''])[0])), 'the void attempt is logged as caused by the Maker');
  }
  await page.close();
}
// ---------- 5. cadence of cards in a natural run (no AI), resolved automatically ----------
{
  const { page } = await boot({ ai: false, untilYear: 1 });
  const r = await page.evaluate(() => {
    const g = __g, S = g.S, sg = g.saga; const cards = []; const tags = {};
    const orig = S.onYear; S.onYear = Y => { for (const s of S.liveSituations()) tags[s.tag] = (tags[s.tag] || 0) + 1; orig(Y); };
    let n = 0;
    while (S.year < 700 && n < 600000) {
      S.step(1 / 4); n++;
      const ch = sg.choice;
      if (ch) { if (ch.kind === 'gen') { const o = ch.card.opts[0]; const ap = g.applyGameChoice(ch, o); cards.push({ yr: Math.floor(S.year), kind: ch.trigger.kind, tag: ch.trigger.tag, title: ch.card.title, voided: ap.voided }); } sg.choice = null; }
      if (sg.pending) { sg.pending = false; sg.ageStart = Math.floor(S.year); sg.nextCard = null; sg.convoAt = null; sg.convoDone = false; sg.cardsThisAge = 0; sg.emergThisAge = 0; }
    }
    return { year: S.year, cards, tags, follow: S.events.filter(e => e.type === 'followup').length, fx: S.events.filter(e => e.type === 'makerfx').length };
  });
  console.log(`cadence: ${r.cards.length} cards in ${Math.floor(r.year)} years; tags seen (years) ${JSON.stringify(r.tags)}; followups logged ${r.follow}; makerfx events ${r.fx}`);
  console.log('  ' + r.cards.map(c => `${c.yr}:${c.tag}${c.voided ? '(void)' : ''}`).join(' '));
  ok(r.cards.length >= 3, 'cards still appear in a natural run');
  await page.close();
}
// ---------- 6. old saves: missing new fields, and a card from before the change ----------
{
  const { page } = await boot();
  const r = await page.evaluate(() => {
    const S = __g.S; delete S.maker.cardMem; delete S.maker.follow; S.migrateGame();
    const P = S.reach()[0].name; S.liveSituations(); S.cardTrigger(true); S.followYear();
    const card = { title: 'Old card', scene: 'An old scene.', speaker: null, opts: [{ id: 'o0', label: 'A', hint: '', lean: 'none', cost: 0, outcome: 'ok', effects: [{ fx: 'food', people: P, amount: 0.5 }] }, { id: 'o1', label: 'B', hint: '', lean: 'none', cost: 0, outcome: 'ok', effects: [] }] };
    __g.saga.choice = { kind: 'gen', card, trigger: { kind: 'emergency', why: '12: Something old happened.', people: P }, yr: 300 };
    return { cardMem: typeof S.maker.cardMem, follow: Array.isArray(S.maker.follow) };
  });
  await page.waitForSelector('#choice:not([hidden]) [data-cho]');
  ok(r.cardMem === 'object' && r.follow, 'old-save defaults (cardMem, follow) are filled in by migrateGame');
  ok(true, 'a pre-change card (no premise/deadline) still opens');
  await page.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
