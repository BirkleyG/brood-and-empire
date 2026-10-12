import { anthropicSampler } from './providers/anthropic';
import { PROVIDERS, providerInfo } from './providers/index';
import { compatSampler } from './providers/openai-compatible';
import { cachedModels, fetchModels, staticModels, type ModelOption } from './models';
import { clearSettings, defaultSettings, loadSettings, saveSettings } from './settings';
import { AIError, type AISettings, type ProviderId, type Sampler } from './types';

export type { Sampler } from './types';

// The claude.ai artifact runtime, when the game is running inside one.
declare const claude: { use(name: string): Promise<any> } | undefined;
const IN_ARTIFACT = typeof claude !== 'undefined' && !!claude && typeof claude.use === 'function';

let gameListener: ((s: Sampler | null) => void) | null = null;
let current: Sampler | null = null;
let artifactSample: Sampler | null = null;
let settings: AISettings = defaultSettings();
let lastError = '';

/** The game registers here to receive the active sampler (or null for keyword mode). */
export function connectGame(fn: (s: Sampler | null) => void) {
  gameListener = fn;
  fn(current);
}

export function initAI() {
  settings = loadSettings() ?? { ...defaultSettings(), provider: IN_ARTIFACT ? 'claude-artifact' : 'off' };
  buildPanel();
  apply();
  if (IN_ARTIFACT) {
    claude!
      .use('sample')
      .then((s) => {
        if (!s) return;
        const fn = ((input, opts) => s(input, opts)) as Sampler;
        fn.json = (input, opts) => s.json(input, opts);
        fn.label = 'Claude';
        artifactSample = fn;
        apply();
      })
      .catch(() => {});
  }
}

function buildSampler(s: AISettings): Sampler | null {
  const info = providerInfo(s.provider);
  const key = s.keys[s.provider]?.trim();
  const models = { ...info.defaultModels, ...stripEmpty(s.models[s.provider]) };
  switch (s.provider) {
    case 'claude-artifact':
      return artifactSample;
    case 'anthropic':
      return key ? anthropicSampler(key, models) : null;
    case 'off':
      return null;
    default: {
      const baseUrl = s.provider === 'custom' ? s.customBaseUrl?.trim() : info.baseUrl;
      if (!baseUrl || (info.needsKey && !key) || !(models.default || models.quick)) return null;
      return compatSampler({ label: info.short, baseUrl, apiKey: key, models });
    }
  }
}

function apply() {
  const raw = buildSampler(settings);
  current = raw ? watchErrors(raw) : null;
  gameListener?.(current);
  renderBadge();
}

// Surface provider failures in the AI button; the game itself falls back to keywords quietly.
function watchErrors(s: Sampler): Sampler {
  const report = (err: unknown) => {
    if (err instanceof AIError && err.code === 'cancelled') return;
    lastError = err instanceof Error ? err.message : String(err);
    renderBadge();
  };
  const ok = () => {
    if (lastError) {
      lastError = '';
      renderBadge();
    }
  };
  const fn = (async (input, opts) => {
    try {
      const r = await s(input, opts);
      ok();
      return r;
    } catch (e) {
      report(e);
      throw e;
    }
  }) as Sampler;
  fn.json = async (input, opts) => {
    try {
      const r = await s.json(input, opts);
      ok();
      return r;
    } catch (e) {
      report(e);
      throw e;
    }
  };
  fn.label = s.label;
  return fn;
}

function stripEmpty(m?: { quick?: string; default?: string }) {
  const out: { quick?: string; default?: string } = {};
  if (m?.quick?.trim()) out.quick = m.quick.trim();
  if (m?.default?.trim()) out.default = m.default.trim();
  return out;
}

// ---------------------------------------------------------------- settings panel

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let btn: HTMLButtonElement;
let modal: HTMLDivElement;

function buildPanel() {
  btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn grow aibtn';
  btn.id = 'aiBtn';
  btn.addEventListener('click', openPanel);
  const anchor = document.getElementById('worldsBtn');
  anchor?.parentElement?.insertBefore(btn, anchor);

  modal = document.createElement('div');
  modal.id = 'aiModal';
  modal.className = 'aimodal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'aiTitle');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePanel();
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });
  document.body.appendChild(modal);
}

function renderBadge() {
  if (!btn) return;
  const info = providerInfo(settings.provider);
  const live = !!current;
  btn.dataset.state = lastError ? 'error' : live ? 'on' : 'off';
  btn.innerHTML = `<i aria-hidden="true"></i>AI: ${esc(live ? info.short : 'off')}`;
  btn.title = lastError || (live ? `${info.name} is telling the story` : 'No AI connected. Click to set one up.');
}


// Draft edited in the panel; only written to `settings` on Save.
let draft: AISettings;

// Per-tier "Other…" state, so an empty custom field stays open across re-renders.
let otherOpen = { quick: false, default: false };
let modelsNote = '';

function openPanel() {
  draft = JSON.parse(JSON.stringify(settings));
  otherOpen = { quick: false, default: false };
  modelsNote = '';
  renderPanel();
  modal.hidden = false;
  $<HTMLSelectElement>('#aiProv', modal).focus();
  loadModels();
}

function closePanel() {
  modal.hidden = true;
  btn.focus();
}

function renderPanel(status = '') {
  const info = providerInfo(draft.provider);
  const m = draft.models[draft.provider] ?? {};
  const isCompat = !['claude-artifact', 'anthropic', 'off'].includes(draft.provider);
  const showKey = info.needsKey || draft.provider === 'custom';
  const showModels = draft.provider === 'anthropic' || isCompat;
  const artifactBlocked = IN_ARTIFACT && draft.provider !== 'claude-artifact' && draft.provider !== 'off';
  const artifactMissing = draft.provider === 'claude-artifact' && !IN_ARTIFACT;
  const options = PROVIDERS.map(
    (p) => `<option value="${p.id}"${p.id === draft.provider ? ' selected' : ''}>${esc(p.name)}</option>`,
  ).join('');

  modal.innerHTML = `<form class="aibox" id="aiForm" novalidate>
    <div class="aihd"><h2 id="aiTitle">AI storyteller</h2><button type="button" class="aix" id="aiClose" aria-label="Close">×</button></div>
    <p class="aid">Pick who interprets your words, writes the chronicle and speaks for your creatures. Everything else in the world runs without AI.</p>
    <label class="ail" for="aiProv">Provider</label>
    <select id="aiProv">${options}</select>
    <p class="aiblurb">${esc(info.blurb)}</p>
    ${artifactBlocked ? `<p class="aiwarn">Inside claude.ai this page can only talk to Claude, so API keys can't connect here. They work when you run the game on your own computer or website. Choose "Claude on claude.ai" to play here.</p>` : ''}
    ${artifactMissing ? `<p class="aiwarn">This option only works when the game is opened as a claude.ai artifact.</p>` : ''}
    ${draft.provider === 'custom' ? `<label class="ail" for="aiBase">Server address</label><input id="aiBase" type="url" placeholder="http://localhost:1234/v1" value="${esc(draft.customBaseUrl ?? '')}" autocomplete="off">` : ''}
    ${showKey ? `<label class="ail" for="aiKey">API key${info.needsKey ? '' : ' (optional)'}</label>
    <div class="airow"><input id="aiKey" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your key" value="${esc(draft.keys[draft.provider] ?? '')}"><button type="button" class="btn" id="aiShow">Show</button></div>
    <p class="aismall">Saved only in this browser and sent only to ${esc(info.name)}.${info.keyUrl ? ` <a href="${info.keyUrl}" target="_blank" rel="noopener">Get a key</a>` : ''}</p>` : ''}
    ${showModels ? `<div class="aigrid">
      ${modelField('quick', 'Quick model', m.quick ?? '')}
      ${modelField('default', 'Writing model', m.default ?? '')}
    </div>
    <p class="aismall">${esc(modelsNote || (info.defaultModels ? 'The quick model reads your words to the Oracle; the writing model tells the story.' : 'If you choose only one, it is used for everything.'))}</p>` : ''}
    <div class="aistat" id="aiStat" role="status" aria-live="polite">${status}</div>
    <div class="aift">
      <button type="button" class="btn" id="aiForget">Forget saved keys</button>
      <span class="aisp"></span>
      <button type="button" class="btn" id="aiTest"${draft.provider === 'off' ? ' disabled' : ''}>Test</button>
      <button type="submit" class="btn primary">Save</button>
    </div>
  </form>`;

  $('#aiClose', modal).addEventListener('click', closePanel);
  $<HTMLSelectElement>('#aiProv', modal).addEventListener('change', (e) => {
    readFields();
    draft.provider = (e.target as HTMLSelectElement).value as ProviderId;
    otherOpen = { quick: false, default: false };
    modelsNote = '';
    renderPanel();
    loadModels();
    $<HTMLSelectElement>('#aiProv', modal).focus();
  });
  for (const tier of ['quick', 'default'] as const) {
    $<HTMLSelectElement>(`#${tierId(tier)}Sel`, modal)?.addEventListener('change', (e) => {
      const other = (e.target as HTMLSelectElement).value === OTHER;
      otherOpen[tier] = other;
      const input = $<HTMLInputElement>(`#${tierId(tier)}`, modal);
      input.hidden = !other;
      if (other) input.focus();
    });
  }
  $('#aiKey', modal)?.addEventListener('change', () => {
    readFields();
    loadModels();
  });
  $('#aiBase', modal)?.addEventListener('change', () => {
    readFields();
    loadModels();
  });
  $('#aiShow', modal)?.addEventListener('click', (e) => {
    const k = $<HTMLInputElement>('#aiKey', modal);
    const show = k.type === 'password';
    k.type = show ? 'text' : 'password';
    (e.target as HTMLButtonElement).textContent = show ? 'Hide' : 'Show';
  });
  $('#aiForget', modal).addEventListener('click', () => {
    draft.keys = {};
    settings.keys = {};
    if (!saveSettings(settings)) clearSettings();
    apply();
    renderPanel('Saved keys removed from this browser.');
  });
  $('#aiTest', modal).addEventListener('click', testDraft);
  $<HTMLFormElement>('#aiForm', modal).addEventListener('submit', (e) => {
    e.preventDefault();
    readFields();
    settings = JSON.parse(JSON.stringify(draft));
    const stored = saveSettings(settings);
    lastError = '';
    apply();
    if (!stored) {
      renderPanel('Saved for this session. This browser blocks storage, so you will need to enter it again next time.');
      return;
    }
    closePanel();
  });
}

function readFields() {
  const p = draft.provider;
  const key = $<HTMLInputElement>('#aiKey', modal);
  if (key) draft.keys[p] = key.value.trim();
  if ($('#aiMQSel', modal)) draft.models[p] = { quick: readModel('quick'), default: readModel('default') };
  const base = $<HTMLInputElement>('#aiBase', modal);
  if (base) draft.customBaseUrl = base.value.trim();
}

async function testDraft() {
  readFields();
  const stat = $('#aiStat', modal);
  const s = buildSampler(draft);
  if (!s) {
    const info = providerInfo(draft.provider);
    stat.textContent =
      draft.provider === 'claude-artifact'
        ? 'Claude on claude.ai is not available on this page.'
        : info.needsKey && !draft.keys[draft.provider]
          ? 'Paste an API key first.'
          : 'Fill in a model (and a server address for a custom server) first.';
    return;
  }
  stat.textContent = 'Asking the model to say hello…';
  try {
    const r = await s('In five words or fewer, greet the Maker of a newborn world.', { modelTier: 'quick', cache: false });
    stat.textContent = `Connected. It said: “${r.text.trim().slice(0, 120)}”`;
  } catch (e) {
    stat.textContent = e instanceof Error ? e.message : String(e);
  }
}

// ---------------------------------------------------------------- model pickers

const OTHER = '__other';
const tierId = (tier: 'quick' | 'default') => (tier === 'quick' ? 'aiMQ' : 'aiMD');

function modelOptions(): ModelOption[] {
  return cachedModels(draft) ?? staticModels(draft.provider);
}

/** A dropdown of known models plus "Other…", which reveals a text field for any model id. */
function modelField(tier: 'quick' | 'default', label: string, value: string) {
  const info = providerInfo(draft.provider);
  const list = modelOptions();
  const def = info.defaultModels?.[tier];
  const known = !value || list.some((o) => o.id === value);
  const other = otherOpen[tier] || !known;
  const id = tierId(tier);
  const first = def
    ? `<option value="">Default (${esc(def)})</option>`
    : `<option value="">${list.length ? 'Choose a model…' : 'No list yet: choose Other'}</option>`;
  const opts = list
    .map((o) => `<option value="${esc(o.id)}"${!other && o.id === value ? ' selected' : ''}>${esc(o.label)}</option>`)
    .join('');
  return `<div><label class="ail" for="${id}Sel">${label}</label>
    <select id="${id}Sel">${first}${opts}<option value="${OTHER}"${other ? ' selected' : ''}>Other…</option></select>
    <input id="${id}" type="text" spellcheck="false" autocomplete="off" aria-label="${label} id" placeholder="${esc(info.modelHint ?? 'Type a model id')}" value="${esc(other ? value : '')}"${other ? '' : ' hidden'}></div>`;
}

function readModel(tier: 'quick' | 'default'): string {
  const sel = $<HTMLSelectElement>(`#${tierId(tier)}Sel`, modal);
  if (!sel) return '';
  if (sel.value === OTHER) return $<HTMLInputElement>(`#${tierId(tier)}`, modal).value.trim();
  return sel.value;
}

/** Fetch the provider's model list for the dropdowns. Typing a model via "Other…" always works. */
async function loadModels() {
  const info = providerInfo(draft.provider);
  const listable = draft.provider === 'anthropic' || !!info.baseUrl || (draft.provider === 'custom' && !!draft.customBaseUrl);
  if (!listable || cachedModels(draft)) return;
  if (info.needsKey && !draft.keys[draft.provider]) {
    setModelsNote(info.defaultModels ? '' : 'Paste your key to load this provider\'s models, or choose Other and type one.');
    return;
  }
  if (IN_ARTIFACT) {
    setModelsNote(info.defaultModels ? '' : 'The model list can\'t load inside claude.ai. Choose Other to type a model id.');
    return;
  }
  const want = JSON.stringify([draft.provider, draft.keys[draft.provider], draft.customBaseUrl]);
  setModelsNote('Loading models…');
  try {
    const list = await fetchModels(draft);
    if (want !== JSON.stringify([draft.provider, draft.keys[draft.provider], draft.customBaseUrl])) return;
    setModelsNote(`${list.length} models available from ${info.short}.`);
  } catch (e) {
    if (want !== JSON.stringify([draft.provider, draft.keys[draft.provider], draft.customBaseUrl])) return;
    setModelsNote(`Couldn't load the model list (${e instanceof Error ? e.message : e}). Choose Other to type a model id.`);
  }
}

function setModelsNote(note: string) {
  modelsNote = note;
  if (modal.hidden) return;
  readFields();
  const active = document.activeElement?.id;
  const status = $('#aiStat', modal)?.textContent ?? '';
  renderPanel(esc(status));
  if (active) document.getElementById(active)?.focus();
}
