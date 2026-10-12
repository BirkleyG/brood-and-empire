// Test-only vite config: exposes game.js internals as window.__g without touching the repo.
export default {
  root: process.env.REPO || process.cwd(),
  base: './',
  server: { port: 5199, strictPort: true },
  plugins: [{
    name: 'expose-game',
    transform(code, id) {
      if (!id.endsWith('src/app/game.js')) return null;
      return code + `\n;window.__g={get S(){return S},get saga(){return saga},get running(){return running},set running(v){running=v},get speed(){return speed},setSpeed:v=>setSpeed(v),get choiceOpen(){return choiceOpen},requestCard,cardTick,applyGameChoice,validCard};\n`;
    },
  }],
};
