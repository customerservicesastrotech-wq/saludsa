// Pruebas del Escudo (componente nativo simulado)
const { chromium } = require(process.env.NODE_PATH_PW || 'playwright');
const res = []; const ok = (n, c, i = '') => { res.push(c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
const MOCK = (st) => `window.__sh = { calls: [], cfg: null, status: ${JSON.stringify(st)}, events: [], usage: {}, L: {} };
window.Capacitor = { isNativePlatform: () => false, Plugins: {
  App: { L: {}, addListener(ev, cb) { (this.L[ev] = this.L[ev] || []).push(cb); }, minimizeApp() {} },
  Shield: {
    getStatus: async () => Object.assign({}, window.__sh.status),
    configure: async ({ config }) => { window.__sh.cfg = config; window.__sh.calls.push('configure'); return {}; },
    lockNow: async (o) => { window.__sh.calls.push('lockNow:' + o.minutes + ':' + o.kind); },
    popEvents: async () => { const r = { events: window.__sh.events, usage: window.__sh.usage }; window.__sh.events = []; window.__sh.usage = {}; return r; },
    listApps: async () => ({ apps: [{ pkg: 'com.android.chrome', label: 'Chrome' }, { pkg: 'com.sec.android.app.sbrowser', label: 'Samsung Internet' }, { pkg: 'com.google.android.youtube', label: 'YouTube' }, { pkg: 'com.whatsapp', label: 'WhatsApp' }] }),
    openUsageSettings: async () => { window.__sh.calls.push('usage'); }, openOverlaySettings: async () => { window.__sh.calls.push('overlay'); },
    openBatterySettings: async () => { window.__sh.calls.push('battery'); }, openAppSettings: async () => { window.__sh.calls.push('appinfo'); },
    openDnsSettings: async () => { window.__sh.calls.push('dns'); }, copyText: async ({ text }) => { window.__sh.calls.push('copy:' + text); },
    addListener: (ev, cb) => { window.__sh.L[ev] = cb; }
  } } };`;
const PLAIN = `window.Capacitor = { isNativePlatform: () => false, Plugins: { App: { addListener() {}, minimizeApp() {} } } };`;
async function open(b, mock, hour = 9) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(mock); await p.clock.install({ time: new Date(`2026-10-15T${String(hour).padStart(2, '0')}:00:00-05:00`) });
  await p.goto((process.env.PLAN20_URL || 'http://localhost:8765/index.html')); await p.click('#ack');
  for (let r = 0; r < 2; r++) { for (const n of '1234') await p.click(`.pad button[data-n="${n}"]`); await p.click('.pad button[data-ok]'); }
  await p.clock.fastForward(1500);
  return { p, ctx, errs };
}
(async () => {
  const b = await chromium.launch();
  { const { p, ctx, errs } = await open(b, MOCK({ usage: false, overlay: false, battery: false, running: false, enabled: false, active: false, locked: false, sdk: 35, privateDns: null }));
    // Más → Escudo
    await p.click('.rail button[data-tab="mas"]'); await p.clock.fastForward(100);
    ok('Más muestra la tarjeta Escudo', await p.isVisible('.tile[data-x="escudo"]'));
    await p.click('.tile[data-x="escudo"]'); await p.clock.fastForward(300);
    let t = await p.innerText('#main');
    ok('Pantalla Escudo: permisos pendientes con botón Conceder', /Acceso a datos de uso/.test(t) && (await p.$$('[data-a="pusage"]')).length === 1 && (await p.$$('[data-a="poverlay"]')).length === 1, t.slice(0, 200));
    await p.click('[data-a="pusage"]'); await p.click('[data-a="poverlay"]'); await p.click('[data-a="pbat"]');
    let calls = await p.evaluate(() => window.__sh.calls);
    ok('Los botones abren los Ajustes correctos', calls.includes('usage') && calls.includes('overlay') && calls.includes('battery'), calls.join());
    // Encender
    await p.click('[data-a="son"]'); await p.clock.fastForward(300);
    let cfg = await p.evaluate(() => window.__sh.cfg);
    ok('Encender envía la configuración al nativo (navegadores, franja 22:30-06:00, 5 min)', cfg && cfg.enabled === true && cfg.apps.includes('com.android.chrome') && cfg.apps.includes('com.sec.android.app.sbrowser') && cfg.start === '22:30' && cfg.end === '06:00' && cfg.minutes === 5, JSON.stringify(cfg && { e: cfg.enabled, s: cfg.start, m: cfg.minutes }));
    ok('Mensajes de la pausa: protocolo del manual incluido', cfg.messages.some(m => /puedo elegir el siguiente paso/.test(m)) && cfg.messages.length >= 5);
    ok('Aviso si falta permiso al encender', /Faltan permisos/.test(await p.innerText('#main')));
    // Cambiar franja
    await p.fill('input[data-s="start"]', '23:00'); await p.dispatchEvent('input[data-s="start"]', 'change'); await p.clock.fastForward(200);
    cfg = await p.evaluate(() => window.__sh.cfg);
    ok('Cambiar la hora de inicio se sincroniza', cfg.start === '23:00' && (await p.evaluate(() => S.shield.cfg.start)) === '23:00');
    await p.click('[data-a="dur"][data-x="10"]'); await p.click('[data-a="grace"][data-x="0"]'); await p.clock.fastForward(200);
    cfg = await p.evaluate(() => window.__sh.cfg);
    ok('Duración 10 min y modo estricto se sincronizan', cfg.minutes === 10 && cfg.graceMin === 0);
    await p.click('[data-a="dur"][data-x="5"]'); await p.clock.fastForward(200);
    // Elegir apps
    await p.click('[data-a="eapps"][data-x="apps"]'); await p.clock.fastForward(300);
    ok('Selector de apps con las instaladas', (await p.$$('.apick input')).length === 4);
    await p.check('.apick input[value="com.whatsapp"]'); await p.uncheck('.apick input[value="com.sec.android.app.sbrowser"]');
    await p.click('.sheet [data-save]'); await p.clock.fastForward(300);
    cfg = await p.evaluate(() => window.__sh.cfg);
    ok('Guardar selección actualiza la lista frenada', cfg.apps.includes('com.whatsapp') && !cfg.apps.includes('com.sec.android.app.sbrowser') && !(await p.$('.sheet')), cfg.apps.join());
    // DNS
    await p.click('[data-a="dcopy"]'); await p.click('[data-a="dopen"]'); await p.clock.fastForward(100);
    calls = await p.evaluate(() => window.__sh.calls);
    ok('DNS: copiar el nombre y abrir Ajustes', calls.includes('copy:family.cloudflare-dns.com') && calls.includes('dns'));
    ok('DNS: estado “No activo” sin filtro', /No activo/.test(await p.innerText('#main')));
    await p.evaluate(() => { window.__sh.status = Object.assign(window.__sh.status, { usage: true, overlay: true, battery: true, privateDns: 'family.cloudflare-dns.com' }); });
    await p.click('.rail button[data-tab="mas"]'); await p.click('.tile[data-x="escudo"]'); await p.clock.fastForward(400);
    t = await p.innerText('#main');
    ok('Con permisos y DNS: todo marcado como listo y filtro Activo', !(await p.$('[data-a="pusage"]')) && /Activo/.test(t) && !/Faltan permisos/.test(t));
    // Probar pausa
    await p.click('[data-a="stest"]'); await p.clock.fastForward(200);
    ok('Probar: pausa de 1 min', (await p.evaluate(() => window.__sh.calls)).includes('lockNow:1:test'));
    // Ventanas de riesgo desde el historial
    await p.evaluate(() => { commit(() => { S.profile.porque = 'quiero sentirme dueño de mis noches'; S.profile.alternativas = ['Leer en la sala']; ['2026-10-01', '2026-10-08'].forEach(d => { addLog('impulso', d, 'done', { res: 'si', hora: '23:30', ctx: 'en la cama con la tablet' }); recomputeP(d); }); }); });
    const rw = await p.evaluate(() => riskWindows());
    ok('Automático por riesgo: ventana 22:30–01:00 el jueves (2 episodios en jueves a las 23:30)', rw.length >= 1 && rw[0].label === '22:30–01:00' && rw[0].day === '2026-10-15', JSON.stringify(rw.map(w => w.label + ' ' + w.day)));
    await p.evaluate(() => syncShield()); cfg = await p.evaluate(() => window.__sh.cfg);
    ok('Mensajes personalizados: su porqué, su alternativa y su hora de riesgo', cfg.messages.some(m => /dueño de mis noches/.test(m)) && cfg.messages.some(m => /Leer en la sala/.test(m)) && cfg.messages.some(m => /23:30/.test(m)) && cfg.riskWindows.length >= 1);
    // Eventos → el asistente pregunta
    await p.evaluate(() => { const t0 = new Date('2026-10-14T23:47:00-05:00').getTime(); window.__sh.events = [{ id: 'ev1', t: t0, kind: 'open', minutes: 5, pkg: 'com.android.chrome', app: 'Chrome', inAppMs: 20000, done: t0 + 300000, end: t0 + 310000, choice: 'talk' }]; window.__sh.usage = { '2026-10-14': { 'com.android.chrome': 180000, 'com.google.android.youtube': 2520000 } }; });
    await p.click('.rail button[data-tab="hoy"]');
    await p.evaluate(() => pullShield().then(() => route())); await p.clock.fastForward(300);
    t = await p.innerText('#msgs');
    ok('Tras una pausa, el asistente pregunta qué pasó (con app y hora)', /Anoche a las 23:47 frené Chrome/.test(t) && /Completaste la pausa de 5 min/.test(t) && (await p.$$('[data-a="shq"]')).length === 4, t.slice(-220));
    await p.evaluate(() => { window.__sh.usage = { '2026-10-14': { 'com.google.android.youtube': 60000 } }; }); await p.evaluate(() => pullShield());
    ok('Minutos por app se acumulan (no se sobrescriben)', (await p.evaluate(() => S.shield.usage['2026-10-14']['com.google.android.youtube'])) === 2580000);
    ok('No pregunta dos veces por la misma pausa', (await p.evaluate(() => S.ai.chat.filter(m => (m.cards || []).some(c => c.type === 'shieldq')).length)) === 1);
    await p.click('[data-a="shq"][data-x="ev1|ok"]'); await p.clock.fastForward(200);
    ok('“Lo superé” queda anotado sin gastar IA', (await p.evaluate(() => S.shield.events[0].outcome)) === 'ok' && /Frenaste a tiempo/.test(await p.innerText('#msgs')));
    await p.evaluate(() => { const t0 = new Date('2026-10-15T00:20:00-05:00').getTime(); window.__sh.events = [{ id: 'ev2', t: t0, kind: 'time', minutes: 5, pkg: 'com.google.android.youtube', app: 'YouTube', inAppMs: 1500000, done: t0 + 300000, end: t0 + 300000, choice: 'home' }]; });
    await p.evaluate(() => pullShield().then(() => route())); await p.clock.fastForward(300);
    ok('Pausa por rato largo: dice cuánto rato y en qué app', /te frené tras 25 min en YouTube/.test(await p.innerText('#msgs')));
    await p.click('[data-a="shq"][data-x="ev2|relapse"]'); await p.clock.fastForward(300);
    const sh = await p.evaluate(() => ({ title: document.querySelector('.sheet h2') && document.querySelector('.sheet h2').innerText, date: document.querySelector('.sheet [data-k="date"]') && document.querySelector('.sheet [data-k="date"]').value, hora: sheetOpen && sheetOpen.v.hora }));
    ok('“Hubo recaída” abre el registro con la fecha y hora de la pausa', sh.date === '2026-10-15' && sh.hora === '00:20', JSON.stringify(sh));
    await p.evaluate(() => closeSheet()); await p.clock.fastForward(100);
    // Inicio: botón de pausa
    ok('Inicio: botón “Pausa 5 min” junto a “Tengo un impulso”', await p.isVisible('[data-a="lock5"]'));
    await p.click('[data-a="lock5"]'); await p.clock.fastForward(200);
    ok('El botón bloquea 5 min', (await p.evaluate(() => window.__sh.calls)).includes('lockNow:5:manual'));
    // Protocolo
    await p.click('[data-a="proto"]'); await p.click('.proto [data-next]'); await p.click('.proto [data-next]'); await p.clock.fastForward(100);
    ok('Protocolo paso 3: botón para bloquear la tablet', /Bloquear la tablet 5 min/.test(await p.innerText('.proto')));
    await p.click('.proto button:has-text("Bloquear la tablet")'); await p.clock.fastForward(200);
    ok('…y funciona', (await p.evaluate(() => window.__sh.calls.filter(c => c === 'lockNow:5:manual').length)) === 2);
    await p.click('.proto [data-x]');
    // IA: herramienta
    const est = await p.evaluate(() => runTool('escudo', { accion: 'estado' }).result);
    ok('Herramienta IA “escudo estado”: resume configuración, pausas y minutos', /ENCENDIDO/.test(est) && /23:00-06:00/.test(est) && /YouTube 43 min/.test(est) && /lo superó/.test(est), est);
    await p.evaluate(() => runTool('escudo', { accion: 'pausa_ahora', minutos: 60 })); await p.clock.fastForward(2000);
    ok('IA “pausa_ahora” respeta el tope de 15 min', (await p.evaluate(() => window.__sh.calls)).includes('lockNow:15:manual'));
    ok('La IA ve el escudo en sus patrones (si comparte Meta P)', await p.evaluate(() => { S.ai.shareP = true; return /Escudo ENCENDIDO/.test(patternsBlock()) && /ESCUDO/.test(agentRules()) && TOOLS2.some(t => t.name === 'escudo'); }));
    ok('Sin errores JS (tablet)', !errs.length, JSON.stringify(errs));
    await ctx.close(); }
  { const { p, ctx, errs } = await open(b, PLAIN);
    ok('Sin componente nativo: no hay botón de pausa en Inicio', !(await p.$('[data-a="lock5"]')));
    await p.evaluate(() => { tab = 'escudo'; route(); }); await p.clock.fastForward(200);
    ok('Sin componente nativo: la pantalla avisa “Solo en la tablet”', /Solo en la tablet/.test(await p.innerText('#main')));
    ok('Sin errores JS (navegador)', !errs.length, JSON.stringify(errs));
    await ctx.close(); }
  { const { p, ctx, errs } = await open(b, MOCK({ usage: true, overlay: false, battery: true, privateDns: null }));
    await p.click('[data-a="lock5"]'); await p.clock.fastForward(400);
    ok('Pausa sin permiso de superposición: explica qué falta y lleva a Escudo', /Mostrar sobre otras apps/.test(await p.innerText('body')) && (await p.evaluate(() => tab)) === 'escudo' && !(await p.evaluate(() => window.__sh.calls)).some(c => c.startsWith('lockNow')));
    ok('Sin errores JS (sin permiso)', !errs.length, JSON.stringify(errs));
    await ctx.close(); }
  console.log(`${res.filter(Boolean).length}/${res.length}`); if (res.some(r => !r)) process.exitCode = 1; await b.close();
})();
