// Pruebas del dictado continuo (componente nativo simulado)
const { chromium } = require(process.env.NODE_PATH_PW || 'playwright');
const res = []; const ok = (n, c, i = '') => { res.push(c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
const NATIVE = `window.__cs = { starts: 0, stops: 0, L: {} };
window.Capacitor = { isNativePlatform: () => false, Plugins: {
  App: { L: {}, addListener(ev, cb) { (this.L[ev] = this.L[ev] || []).push(cb); }, minimizeApp() {} },
  ContinuousSpeech: {
    removeAllListeners: async () => { window.__cs.L = {}; }, addListener: async (ev, cb) => { window.__cs.L[ev] = cb; },
    start: async () => { window.__cs.starts++; return { mode: 'continuous' }; },
    stop: async () => { window.__cs.stops++; setTimeout(() => { window.__cs.L.segment && window.__cs.L.segment({ text: 'de lunes a viernes' }); }, 300); }
  } } };
window.__partial = (t) => window.__cs.L.partial({ text: t }); window.__segment = (t) => window.__cs.L.segment({ text: t });`;
const FALLBACK = `window.__sr = { starts: 0, L: {} };
window.Capacitor = { isNativePlatform: () => false, Plugins: {
  App: { L: {}, addListener(ev, cb) { (this.L[ev] = this.L[ev] || []).push(cb); }, minimizeApp() {} },
  SpeechRecognition: { available: async () => ({ available: true }), checkPermissions: async () => ({ speechRecognition: 'granted' }), requestPermissions: async () => ({ speechRecognition: 'granted' }),
    removeAllListeners: async () => { window.__sr.L = {}; }, addListener: async (ev, cb) => { window.__sr.L[ev] = cb; }, start: async () => { window.__sr.starts++; }, stop: async () => {} } } };`;
async function open(b, mock) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(mock); await p.clock.install({ time: new Date('2026-10-15T09:00:00-05:00') });
  await p.goto((process.env.PLAN20_URL || 'http://localhost:8765/index.html')); await p.click('#ack');
  for (let r = 0; r < 2; r++) { for (const n of '1234') await p.click(`.pad button[data-n="${n}"]`); await p.click('.pad button[data-ok]'); }
  await p.clock.fastForward(1500);
  return { p, ctx, errs };
}
(async () => {
  const b = await chromium.launch();
  { const { p, ctx, errs } = await open(b, NATIVE);
    const nUser = () => p.evaluate(() => S.ai.chat.filter(m => m.role === 'user').length); const u0 = await nUser();
    await p.click('#micb'); await p.clock.fastForward(100);
    await p.evaluate(() => { window.__partial('Me despierto'); window.__segment('Me despierto a las seis'); });
    await p.clock.fastForward(10 * 60 * 1000); // 10 minutos callado
    let s = await p.evaluate(() => ({ on: micOn, starts: window.__cs.starts, stops: window.__cs.stops, val: document.querySelector('#cin').value, lbl: document.querySelector('#micl').innerText }));
    ok('10 minutos en silencio: el micrófono sigue activo, sin reinicios ni cortes', s.on && s.starts === 1 && s.stops === 0 && /sin cortes/.test(s.lbl), JSON.stringify(s));
    ok('Nada se envía solo', (await nUser()) === u0 && s.val === 'Me despierto a las seis');
    await p.evaluate(() => { window.__partial('y tengo clase'); }); await p.clock.fastForward(50);
    await p.evaluate(() => { window.__segment('y tengo clase de ocho a doce'); });
    await p.click('#micb'); await p.clock.fastForward(600);
    s = await p.evaluate(() => ({ on: micOn, val: document.querySelector('#cin').value, stops: window.__cs.stops }));
    ok('■ pausa: el texto (incluido el último tramo) queda en la caja sin enviarse', !s.on && s.stops === 1 && s.val === 'Me despierto a las seis y tengo clase de ocho a doce de lunes a viernes' && (await nUser()) === u0, JSON.stringify(s));
    await p.click('#micb'); await p.clock.fastForward(100); await p.evaluate(() => window.__segment('excepto el martes'));
    s = await p.evaluate(() => document.querySelector('#cin').value);
    ok('Volver a tocar el micrófono sigue añadiendo al mismo texto', /viernes excepto el martes$/.test(s), s);
    await p.click('[data-a="csend"]'); await p.clock.fastForward(1500);
    ok('➤ envía (y detiene el micrófono)', (await nUser()) === u0 + 1 && !(await p.evaluate(() => micOn)));
    await p.click('#micb'); await p.clock.fastForward(100); await p.evaluate(() => window.__segment('hola'));
    await p.evaluate(() => window.__cs.L.state({ status: 'stopped', reason: 'background' })); await p.clock.fastForward(100);
    s = await p.evaluate(() => ({ on: micOn, val: document.querySelector('#cin').value }));
    ok('Si Android corta al salir de la app: pausa y conserva el texto, sin enviar', !s.on && s.val === 'hola' && (await nUser()) === u0 + 1, JSON.stringify(s));
    ok('Sin errores JS (nativo)', !errs.length, JSON.stringify(errs));
    await ctx.close(); }
  { const { p, ctx, errs } = await open(b, FALLBACK);
    await p.click('#micb'); await p.clock.fastForward(200);
    for (let i = 0; i < 20; i++) { await p.evaluate(() => window.__sr.L.listeningState({ status: 'stopped' })); await p.clock.fastForward(30000); }
    const s = await p.evaluate(() => ({ on: micOn, starts: window.__sr.starts }));
    ok('Respaldo: 10 minutos de silencios, sigue activo y se reanuda solo (sin límite de tiempo)', s.on && s.starts >= 20, JSON.stringify(s));
    ok('Sin errores JS (respaldo)', !errs.length, JSON.stringify(errs));
    await ctx.close(); }
  console.log(`${res.filter(Boolean).length}/${res.length}`); if (res.some(r => !r)) process.exitCode = 1; await b.close();
})();
