# Brood & Empire

A god game where creature species evolve, split into peoples, and build or devour
civilizations, while you speak to the world as its Maker. AI interprets your words,
writes the chronicle and the saga chapters, and gives your creatures their voices.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck + production build in dist/
```

## AI: bring your own key

Open **AI** in the header to choose a provider. Keys are saved only in the player's
browser (localStorage) and sent only to the provider they picked.

| Provider | Key | Notes |
|---|---|---|
| Claude on claude.ai | none | Uses the viewer's Claude plan. Only inside a claude.ai artifact. |
| Claude (Anthropic API key) | yes | Official SDK. Quick model `claude-haiku-5-5` for the Oracle, writing model `claude-opus-5-5` for the chronicle, chapters and voices. Both are editable. |
| OpenRouter, Groq, Gemini, Kimi | yes | OpenAI-compatible endpoint. The player fills in a model id. |
| Ollama | no | Local and free. Start Ollama with `OLLAMA_ORIGINS` set to the game's address. |
| Other OpenAI-compatible server | optional | LM Studio, vLLM and similar. |
| No AI | none | The world still runs; the Oracle falls back to keyword reading. |

Every provider implements one interface (`src/ai/types.ts`), shaped like the artifact
`sample` capability: `sampler(prompt, {modelTier, signal, onText})` returns
`{text, truncated}`, and `sampler.json(prompt)` returns parsed JSON. To add a provider,
write a sampler in `src/ai/providers/` and list it in `src/ai/providers/index.ts`.

A claude.ai artifact can only talk to Claude, so API-key providers work when the game is
served from your own machine or website, not inside the artifact.

## Publish as a claude.ai artifact

```sh
npm run build:artifact
```

This writes `dist/artifact.html` (page content without the outer `<html>` shell, which the
artifact host adds) and `dist/artifact-files.json`, the map of bundle files to publish
alongside it. The artifact declares the `sample`, `downloads`, `db` and `user` capabilities.

## Layout

```
index.html              markup for the whole UI
src/main.ts             entry: styles, AI layer, game
src/ai/                 provider-agnostic AI layer and the settings panel
src/sim/data.js         genomes, traits, techs, governments, shared helpers
src/sim/scripts.js      writing systems (romanized names into real scripts)
src/sim/sim.js          makeSim(): the world simulation
src/sim/persist.js      snapshot / restore of a running world
src/render/draw.js      canvas drawing for terrain, creatures, towns
src/app/game.js         app: camera, panels, oracle, book, saves, cards
src/styles/             game.css and the AI panel styles
```

The `src/sim`, `src/render` and `src/app` files were split mechanically from the original
single-file game with scope analysis, so each one imports exactly what it uses. `game.js`
is still large; splitting it further (camera, panels, book, saves) is the next cleanup.
