// Pruebas de Brújula (v2.5): el motor debe DESCUBRIR patrones plantados en un historial simulado.
const { chromium } = require(process.env.NODE_PATH_PW || 'playwright');
const URL = process.env.PLAN20_URL || 'http://localhost:8765/index.html';
const res = []; const ok = (n, c, i = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + (typeof i === 'string' ? i : JSON.stringify(i)) : '')); };
const MOCK = `window.__n = {}; window.__spoke = []; window.__stops = 0; window.__locks = []; window.__cancel = [];
window.Capacitor = { isNativePlatform: () => false, Plugins: {
  App: { L: {}, addListener(ev, cb) { (this.L[ev] = this.L[ev] || []).push(cb); }, minimizeApp() {} },
  LocalNotifications: { checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
    cancel: async ({ notifications }) => { notifications.forEach(n => { delete window.__n[n.id]; window.__cancel.push(n.id); }); },
    schedule: async ({ notifications }) => { notifications.forEach(n => { window.__n[n.id] = { body: n.body, at: n.schedule.at ? new Date(n.schedule.at).getTime() : null }; }); } },
  Shield: { getStatus: async () => ({ usage: true, overlay: true, battery: true, running: true, enabled: true }), configure: async () => ({}), lockNow: async (o) => { window.__locks.push(o.minutes); },
    popEvents: async () => ({ events: [], usage: {} }), listApps: async () => ({ apps: [] }), addListener: () => {} },
  Voz: { speak: async ({ text }) => { window.__spoke.push(text); return { id: 'v' }; }, stop: async () => { window.__stops++; }, addListener: async () => ({}) }
} };`;
async function open(b, when, opts = {}) {
  const ctx = await b.newContext({ viewport: opts.vp || { width: 1152, height: 720 }, timezoneId: 'America/Bogota' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(MOCK);
  await p.clock.install({ time: new Date(when) });
  let aiCalls = 0; await p.route('https://api.anthropic.com/**', async (r) => { aiCalls++; await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: { input_tokens: 100, output_tokens: 20 }, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Respuesta de la IA.' }] }) }); });
  await p.goto(URL); await p.click('#ack');
  for (let r = 0; r < 2; r++) { for (const n of '1234') await p.click(`.pad button[data-n="${n}"]`); await p.click('.pad button[data-ok]'); }
  await p.clock.runFor(800);
  await p.evaluate(() => { mindDay(today()).flags.brief = 'test'; save(); });
  return { p, ctx, errs, ai: () => aiCalls };
}
const relock = async (p) => { await p.evaluate(() => window.Capacitor.Plugins.App.L.appStateChange.forEach(f => f({ isActive: false }))); for (const n of '1234') await p.click(`.lock .pad button[data-n="${n}"]`); await p.clock.runFor(500); };

/* Persona A: recae los JUEVES tras dormir poco, cerca de medianoche; “Dejar el teléfono” le funciona, “Lectura” no. */
const PERSONA_A = () => {
  const horas = ['23:40', '23:55', '00:10', '00:05', '23:50', '00:15', '23:45'];
  let i = 0, t = 0;
  for (let k = '2026-09-23'; k < today(); k = addDays(k, 1), i++) {
    const dw = fromKey(k).getDay(), thu = dw === 4, extraSat = k === '2026-10-17';
    const sleep = thu || extraSat ? 5.5 : k === '2026-10-05' || k === '2026-10-26' ? 5.5 : 7.5;
    S.logs.push({ id: 's' + i, type: 'sueno', date: k, status: 'done', data: { horas: sleep }, ts: i });
    if (dw === 1 || dw === 3 || dw === 6) S.logs.push({ id: 'a' + i, type: 'aero', date: k, status: 'done', data: { min: 20, mod: 12, sens: 'Cómodo' }, ts: i });
    const ep = thu || extraSat;
    if (ep) S.logs.push({ id: 'e' + i, type: 'impulso', date: k, status: 'done', data: { res: 'si', usado: 'no', hora: horas[t++ % horas.length], ctx: 'en la cama con el teléfono' }, ts: i });
    const d = day(k); d.p = { manual: ep ? {} : { res: 'no' } }; recomputeP(k);
  }
  // Respuestas: Lectura 4 noches (3 con episodio: jueves), Teléfono fuera 6 noches (1 con episodio)
  const lect = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-13'], tel = ['2026-10-20', '2026-10-21', '2026-10-27', '2026-10-28', '2026-11-03', '2026-10-22'];
  const at2330 = (k) => fromKey(k).getTime() + 23.5 * 3600e3; // el protocolo se usó hacia las 23:30
  lect.forEach((k, j) => S.logs.push({ id: 'pl' + j, type: 'impulso', date: k, status: 'done', data: { usado: 'si', alt: 'Lectura', via: 'protocolo' }, ts: at2330(k) }));
  tel.forEach((k, j) => S.logs.push({ id: 'pt' + j, type: 'impulso', date: k, status: 'done', data: { usado: 'si', alt: 'Dejar el teléfono en otro lugar', via: 'protocolo' }, ts: at2330(k) }));
  Object.keys(S.days).forEach(k => recomputeP(k));
  S.profile.alternativas = ['Lectura', 'Dejar el teléfono en otro lugar'];
  save();
};

(async () => {
  const b = await chromium.launch();

  /* 1. Descubre el patrón plantado (jueves 12-nov con 5,5 h de sueño) */
  { const { p, ctx, errs } = await open(b, '2026-11-12T08:00:00-05:00');
    await p.evaluate(PERSONA_A);
    await p.evaluate(() => { S.logs.push({ id: 'hoy-s', type: 'sueno', date: today(), status: 'done', data: { horas: 5.5 }, ts: 9 }); save(); });
    const r = await p.evaluate(() => { const pr = bj.predict(), mon = bj.predict('2026-11-16'), w = bj.window(today()), cv = bj.curve(); return { p: pr.p, level: pr.level, mode: pr.mode, top: pr.factors.slice(0, 3).map(f => f.id + ':' + f.mult.toFixed(1)), mon: mon.p, win: w && w.label, peak: cv && cv.peak, from: w && w.from, to: w && w.to, mid: fromKey(addDays(today(), 1)).getTime(), model: bj.model().n1 }; });
    ok('1 Modo aprendido con 8+ episodios', r.mode === 'aprendido' && r.model >= 7, r);
    ok('1 Jueves con poco sueño: riesgo ALTO', r.level === 2 && r.p >= 0.45, r.p.toFixed(2));
    ok('1 Los factores principales son “jueves” y “sueño corto”', r.top.some(x => x.startsWith('dow4')) && r.top.some(x => x.startsWith('sueno')), r.top);
    ok('1 Un lunes normal tiene mucho menos riesgo', r.mon < r.p / 2, { jueves: r.p.toFixed(2), lunes: r.mon.toFixed(2) });
    ok('1 Reloj circular: pico cerca de medianoche (23:30–00:30) y ventana que cruza la medianoche', (r.peak >= 1410 || r.peak <= 30) && r.from < r.mid && r.to > r.mid, r);
    const w = await p.evaluate(() => ({ works: bj.works().map(x => `${x.name} ${x.s}/${x.n}`), best: bj.best().name }));
    ok('1 “Qué te funciona”: Teléfono fuera por encima de Lectura', w.best === 'Dejar el teléfono en otro lugar' && w.works[0].startsWith('Dejar el teléfono'), w);
    const rt = await p.evaluate(() => riskToday());
    ok('1 El resto de la app usa el riesgo aprendido (riskToday)', rt.level === 2 && typeof rt.p === 'number' && (rt.hora === '23:59' || /^(23:[3-5]\d|00:[0-2]\d)$/.test(rt.hora)), rt);
    // Orquestador: al desbloquear programa el aviso 30 min antes de la ventana con la mejor respuesta
    await relock(p);
    const n = await p.evaluate(() => ({ n301: window.__n[301], from: bj.window(today()).from }));
    ok('1 Aviso preventivo 30 min antes de la ventana, con la respuesta que funciona', n.n301 && Math.abs(n.n301.at - (n.from - 30 * 60000)) < 60000 && /tel[eé]fono/i.test(n.n301.body), n);
    const rw = await p.evaluate(() => riskWindows());
    ok('1 Escudo: ventanas dinámicas en las noches de riesgo', rw.length >= 1 && rw.some(x => x.day === '2026-11-12'), rw.map(x => x.day + ' ' + x.label + ' ' + x.p));
    // Interfaz
    await p.evaluate(() => { tab = 'hoy'; route(); }); await p.clock.runFor(200);
    const radar = await p.evaluate(() => (document.querySelector('.radar') || {}).textContent || '');
    ok('1 Inicio muestra el radar de esta noche', /Esta noche/.test(radar) && /alto/.test(radar), radar.slice(0, 120));
    await p.click('[data-a="bjwhy"]'); await p.clock.runFor(100);
    ok('1 “¿Por qué?” despliega los factores con su peso', await p.evaluate(() => /jueves/.test((document.querySelector('.radar .rwhy') || {}).textContent || '')));
    for (const vp of [{ width: 1152, height: 720 }, { width: 720, height: 1152 }]) {
      await p.setViewportSize(vp); await p.evaluate(() => { tab = 'brujula'; route(); }); await p.clock.runFor(200);
      const s = await p.evaluate(() => ({ alert: !!document.querySelector('#main .card.alert'), clock: !!document.querySelector('.bjclock'), gauge: !!document.querySelector('.bjgauge'), over: document.documentElement.scrollWidth > innerWidth + 1, cards: document.querySelectorAll('#main .card').length }));
      ok(`1 Pantalla Brújula sin errores ni desbordamiento (${vp.width}px)`, !s.alert && s.clock && s.gauge && !s.over && s.cards >= 7, s);
    }
    ok('1 Sin errores JS', !errs.length, errs);
    await ctx.close(); }

  /* 2. Arranque en frío: sin datos no inventa y no rompe nada */
  { const { p, ctx, errs } = await open(b, '2026-09-25T09:00:00-05:00');
    const r = await p.evaluate(() => { tab = 'hoy'; route(); const pr = bj.predict(); return { mode: pr.mode, p: pr.p, radar: (document.querySelector('.radar') || {}).textContent || '', best: bj.best().name, works: bj.works().length }; });
    ok('2 Usuario nuevo: modo inicial, radar “aprende tus patrones”', r.mode === 'inicial' && /aprende/.test(r.radar) && r.works === 0, r);
    await p.evaluate(() => { tab = 'brujula'; route(); });
    ok('2 Pantalla Brújula con historial vacío', await p.evaluate(() => !document.querySelector('#main .card.alert') && /Aprendiendo/.test(document.querySelector('#main').textContent)));
    ok('2 Sin errores JS', !errs.length, errs);
    await ctx.close(); }

  /* 3. Órdenes locales (sin IA) y respeto de la alarma */
  { const { p, ctx, ai } = await open(b, '2026-11-12T08:00:00-05:00');
    await p.evaluate(PERSONA_A);
    const say = async (t) => { await p.evaluate((t) => { tab = 'hoy'; route(); }, t); await p.fill('#cin', t); await p.click('[data-a="csend"]'); await p.clock.runFor(1500); return p.evaluate(() => { const m = S.ai.chat[S.ai.chat.length - 1]; return { c: m.content, bj: !!m.bj, tab }; }); };
    let r = await say('¿Cómo voy?'); ok('3 «¿Cómo voy?» responde al instante sin IA', r.bj && /Semana \d+/.test(r.c) && ai() === 0, r.c.slice(0, 90));
    r = await say('riesgo esta noche'); ok('3 «riesgo esta noche» da nivel, ventana y mejor respuesta', r.bj && /Esta noche/.test(r.c) && /tel[eé]fono/i.test(r.c), r.c.slice(0, 140));
    r = await say('¿qué me funciona?'); ok('3 «¿qué me funciona?» ordena las respuestas', r.bj && /Dejar el tel[eé]fono.*\n.*Lectura/s.test(r.c), r.c.slice(0, 140));
    r = await say('¿qué me toca hoy?'); ok('3 «¿qué me toca hoy?» resume el día', /Movimiento:/.test(r.c), r.c.slice(0, 80));
    r = await say('pausa 5 minutos'); await p.clock.runFor(1500); ok('3 «pausa 5 minutos» bloquea la tablet 5 min', await p.evaluate(() => window.__locks.includes(5)), await p.evaluate(() => window.__locks));
    r = await say('abre progreso'); await p.clock.runFor(800); ok('3 «abre progreso» navega', await p.evaluate(() => tab === 'progreso'));
    r = await say('Caminé 20 minutos en el parque'); ok('3 Un relato normal sin IA: explica y sugiere las órdenes disponibles', /IA activada/.test(r.c) && /«¿cómo voy\?»/.test(r.c), r.c.slice(-120));
    await p.evaluate(() => { localStorage.setItem('plan20.apikey', 'sk-ant-test'); });
    r = await say('Caminé 20 minutos en el parque'); ok('3 Con IA, un relato normal sí va a la IA', ai() >= 1 && /Respuesta de la IA/.test(r.c), { ai: ai(), c: r.c });
    const before = ai(); r = await say('¿Cómo voy?'); ok('3 Con IA, «¿cómo voy?» sigue siendo local (no gasta)', ai() === before && r.bj);
    r = await say('tengo un dolor fuerte en el pecho'); ok('3 Palabras de alarma nunca se interceptan: aviso de urgencia', await p.evaluate(() => S.ai.chat.some(m => /atención urgente/.test(m.content))), r.c.slice(0, 60));
    // La IA recibe las conclusiones de Brújula
    const sys = await p.evaluate(() => JSON.stringify(agentSystem()));
    ok('3 El contexto de la IA incluye el bloque BRÚJULA', /BRÚJULA/.test(sys) && /Qué le funciona/.test(sys));
    await ctx.close(); }

  /* 4. Voz y manos libres */
  { const { p, ctx } = await open(b, '2026-11-12T08:00:00-05:00');
    const say = async (t) => { await p.evaluate(() => { tab = 'hoy'; route(); }); await p.fill('#cin', t); await p.click('[data-a="csend"]'); await p.clock.runFor(600); };
    await say('¿Cómo voy?'); ok('4 Con la voz apagada no habla', await p.evaluate(() => window.__spoke.length === 0));
    await say('lee en voz alta'); ok('4 «lee en voz alta» activa la voz y responde hablando', await p.evaluate(() => S.bj.voice === true && window.__spoke.length === 1 && !/\*\*/.test(window.__spoke[0])), await p.evaluate(() => window.__spoke));
    await say('¿Cómo voy?'); ok('4 Las respuestas siguientes se leen', await p.evaluate(() => window.__spoke.length === 2));
    await say('silencio'); ok('4 «silencio» apaga la voz', await p.evaluate(() => S.bj.voice === false && window.__stops >= 1));
    await p.evaluate(() => { S.bj.handsFree = true; S.bj.voice = true; save(); micOn = true; micCommitted = ''; micSegment('¿qué me toca hoy? envía'); });
    await p.clock.runFor(2500);
    const hf = await p.evaluate(() => { const u = S.ai.chat.filter(m => m.role === 'user').pop(); return u && u.content; });
    ok('4 Manos libres: decir «envía» al final envía la frase (sin la palabra)', hf === '¿qué me toca hoy?', hf);
    await ctx.close(); }

  /* 5. Ajuste semanal con las reglas del manual */
  const doseCase = async (name, when, build, expect) => {
    const { p, ctx } = await open(b, when);
    await p.evaluate(build);
    const d = await p.evaluate(() => { const x = bj.dose(); return x && { rule: x.rule, week: x.week, target: x.target, action: x.action, apply: x.apply }; });
    ok(`5 ${name}: regla ${expect.rule}`, d && d.rule === expect.rule, d);
    if (expect.apply) {
      const before = await p.evaluate((t) => { const w = weekPlan(t); return { min: w.walkMin, walks: Object.values(w.days).filter(x => x.walk).length, str: Object.values(w.days).filter(x => x.str).length }; }, d.target);
      await p.evaluate(() => { tab = 'brujula'; route(); }); await p.click('[data-a="bjapply"]'); await p.clock.runFor(200);
      const after = await p.evaluate((t) => { const w = weekPlan(t); return { min: w.walkMin, walks: Object.values(w.days).filter(x => x.walk).length, str: Object.values(w.days).filter(x => x.str).length, done: !!S.bj.doseDone[bj.dose().week], thisWeek: weekPlan(cal().weekOf(today())).walkMin }; }, d.target);
      ok(`5 ${name}: aplicar cambia SOLO la semana siguiente`, expect.apply(before, after) && after.done && d.target === await p.evaluate(() => cal().weekOf(today()) + 1), { before, after, target: d.target });
    }
    await ctx.close();
  };
  const WEEK = (fn) => `(() => { const n = cal().weekOf(today()); const ks = daysOfWeek(n).filter(k => k <= today()); const wp = weekPlan(n); ${fn} save(); })()`;
  await doseCase('Todo cómodo y cabe → progresar una variable', '2026-10-17T20:00:00-05:00', new Function(WEEK(`ks.forEach((k, i) => { S.logs.push({ id: 's' + i, type: 'sueno', date: k, status: 'done', data: { horas: 7.5 }, ts: i }); if (wp.days[k] && wp.days[k].walk) S.logs.push({ id: 'a' + i, type: 'aero', date: k, status: 'done', data: { min: wp.walkMin, mod: 10, sens: 'Cómodo' }, ts: i }); });`)), { rule: 7, apply: (a, c) => c.min === a.min + 5 && c.walks === a.walks });
  await doseCase('No cabe (barrera tiempo) → quitar el día que más se cae', '2026-10-17T20:00:00-05:00', new Function(WEEK(`let j = 0; ks.forEach((k, i) => { S.logs.push({ id: 's' + i, type: 'sueno', date: k, status: 'done', data: { horas: 7 }, ts: i }); if (wp.days[k] && wp.days[k].walk) S.logs.push({ id: 'a' + i, type: 'aero', date: k, status: j++ ? 'no' : 'done', data: j > 1 ? { barrera: 'Tiempo' } : { min: 15, sens: 'Cómodo' }, ts: i }); });`)), { rule: 4, apply: (a, c) => c.walks === a.walks - 1 || c.min === a.min - 5 });
  await doseCase('Dolor o molestia → regla 3', '2026-10-17T20:00:00-05:00', new Function(WEEK(`ks.forEach((k, i) => { S.logs.push({ id: 's' + i, type: 'sueno', date: k, status: 'done', data: { horas: 7 }, ts: i }); }); S.logs.push({ id: 'f1', type: 'fuerza', date: ks[1], status: 'done', data: { com: 'molestia' }, ts: 1 }); S.logs.push({ id: 'a1', type: 'aero', date: ks[2], status: 'done', data: { min: 15, dolor: 'si' }, ts: 1 });`)), { rule: 3 });
  await doseCase('Duerme poco → regla 2 antes que progresar', '2026-10-17T20:00:00-05:00', new Function(WEEK(`ks.forEach((k, i) => { S.logs.push({ id: 's' + i, type: 'sueno', date: k, status: 'done', data: { horas: 5.5 }, ts: i }); if (wp.days[k] && wp.days[k].walk) S.logs.push({ id: 'a' + i, type: 'aero', date: k, status: 'done', data: { min: wp.walkMin, sens: 'Cómodo' }, ts: i }); });`)), { rule: 2 });
  await doseCase('Se olvida → activar recordatorio', '2026-10-17T20:00:00-05:00', new Function(WEEK(`ks.forEach((k, i) => { S.logs.push({ id: 's' + i, type: 'sueno', date: k, status: 'done', data: { horas: 7 }, ts: i }); S.logs.push({ id: 'c' + i, type: 'comida', date: k, status: 'done', data: {}, ts: i }); if (wp.days[k] && wp.days[k].walk) S.logs.push({ id: 'a' + i, type: 'aero', date: k, status: 'no', data: { barrera: 'Olvido' }, ts: i }); });`)), { rule: 5 });

  { const { p, ctx } = await open(b, '2026-10-22T20:00:00-05:00'); // jueves de la semana 5: evalúa la 4, aplica a la 6
    await p.evaluate(() => { const n = 4, ks = daysOfWeek(n), wp = weekPlan(n); ks.forEach((k, i) => { S.logs.push({ id: 's' + i, type: 'sueno', date: k, status: 'done', data: { horas: 7.5 }, ts: i }); if (wp.days[k] && wp.days[k].walk) S.logs.push({ id: 'a' + i, type: 'aero', date: k, status: 'done', data: { min: wp.walkMin, mod: 10, sens: 'Cómodo' }, ts: i }); }); save(); });
    const d = await p.evaluate(() => { const x = bj.dose(); return { week: x.week, target: x.target, cw: cal().weekOf(today()) }; });
    ok('5 A mitad de semana evalúa la semana anterior y aplica a la PRÓXIMA (nunca a la semana en curso)', d.week === 4 && d.target === 6 && d.cw === 5, d);
    await ctx.close(); }

  /* 6. En la revisión semanal aparece la propuesta y se aplica sin cerrar el formulario */
  { const { p, ctx } = await open(b, '2026-10-18T19:00:00-05:00');
    await p.evaluate(new Function(WEEK(`ks.forEach((k, i) => { S.logs.push({ id: 's' + i, type: 'sueno', date: k, status: 'done', data: { horas: 7.5 }, ts: i }); if (wp.days[k] && wp.days[k].walk) S.logs.push({ id: 'a' + i, type: 'aero', date: k, status: 'done', data: { min: wp.walkMin, mod: 10, sens: 'Cómodo' }, ts: i }); });`)));
    await p.evaluate(() => { tab = 'revision'; route(); }); await p.click('[data-a="rev"]'); await p.clock.runFor(200);
    const has = await p.evaluate(() => /Brújula propone/.test(document.querySelector('.sheet').textContent));
    await p.click('.sheet .bjdose button'); await p.clock.runFor(200);
    const r = await p.evaluate(() => ({ sheet: !!document.querySelector('.sheet'), applied: /Aplicado/.test(document.querySelector('.sheet .bjdose').textContent), done: Object.keys(S.bj.doseDone).length }));
    ok('6 La revisión muestra “Brújula propone” y se aplica sin cerrar la revisión', has && r.sheet && r.applied && r.done === 1, r);
    await ctx.close(); }

  /* 7. Presupuesto de avisos y recordatorio de movimiento */
  { const { p, ctx } = await open(b, '2026-11-11T08:00:00-05:00');  // miércoles: día de caminata
    await p.evaluate(PERSONA_A);
    await p.evaluate(() => { S.logs = S.logs.filter(l => !(l.date === today() && l.type === 'aero')); save(); });
    await relock(p);
    let n = await p.evaluate(() => Object.keys(window.__n));
    const walk = await p.evaluate(() => (weekPlan(cal().weekOf(today())).days[today()] || {}).walk);
    ok('7 Día de caminata sin hacer: recordatorio a las 18:30 (id 302)', walk ? n.includes('302') && new Date(await p.evaluate(() => window.__n[302].at)).getHours() === 18 : true, { n, walk });
    await p.evaluate(() => { tab = 'brujula'; route(); }); await p.click('[data-a="bjnud"][data-x="0"]'); await p.clock.runFor(200);
    n = await p.evaluate(() => ({ keys: Object.keys(window.__n).filter(k => k === '301' || k === '302'), cancel: window.__cancel }));
    ok('7 Con 0 avisos por día se cancelan los de Brújula', n.keys.length === 0 && n.cancel.includes(301) && n.cancel.includes(302), n);
    await ctx.close(); }

  /* 8. Acierto honesto (prueba retrospectiva) y modo prudente */
  { const { p, ctx } = await open(b, '2026-11-12T08:00:00-05:00');
    await p.evaluate(PERSONA_A);
    const good = await p.evaluate(() => { const s = bj.score(); return { n: s.n, skill: s.skill, mode: bj.predict().mode }; });
    ok('8 Con un patrón real, la prueba con su historial da acierto positivo', good.n >= 20 && good.skill > 0.15 && good.mode === 'aprendido', good);
    await ctx.close(); }
  { const { p, ctx } = await open(b, '2026-11-22T08:00:00-05:00');
    const r = await p.evaluate(() => {  // recaídas AL AZAR (20 %), sin relación con sueño ni día: no hay nada que aprender
      let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      let i = 0; for (let k = '2026-09-23'; k < today(); k = addDays(k, 1), i++) {
        S.logs.push({ id: 's' + i, type: 'sueno', date: k, status: 'done', data: { horas: [5.5, 6, 7, 7.5, 8][Math.floor(rnd() * 5)] }, ts: i });
        const ep = rnd() < 0.2; if (ep) S.logs.push({ id: 'e' + i, type: 'impulso', date: k, status: 'done', data: { res: 'si', hora: '23:40' }, ts: i });
        day(k).p = { manual: ep ? {} : { res: 'no' } }; recomputeP(k);
      }
      save(); const s = bj.score(), pr = bj.predict(); return { n: s.n, skill: s.skill, mode: pr.mode, p: pr.p, eps: bj.model().n1 };
    });
    ok('8 Con recaídas al azar no se inventa patrones: si no mejora a la tasa fija, pasa a modo prudente', r.n >= 20 && (r.skill < -0.02 ? r.mode === 'prudente' : r.mode === 'aprendido'), r);
    ok('8 En modo prudente/inicial la probabilidad está calibrada con la tasa real (no exagera)', r.mode !== 'prudente' || r.p <= 0.45, r);
    await ctx.close(); }

  /* 9. Privacidad y apagado */
  { const { p, ctx, errs } = await open(b, '2026-11-12T08:00:00-05:00');
    await p.evaluate(PERSONA_A);
    await p.evaluate(() => { S.ai.shareP = false; save(); tab = 'hoy'; route(); });
    const r = await p.evaluate(() => ({ radar: !!document.querySelector('.radar'), cmd: bj.command('riesgo esta noche'), brief: bj.brief() }));
    ok('9 Sin compartir la Meta P: no hay radar ni orden de riesgo, y la IA no recibe el riesgo', !r.radar && !r.cmd && !/Riesgo esta noche/.test(r.brief), r);
    await p.evaluate(() => { S.ai.shareP = true; S.bj.on = false; save(); tab = 'hoy'; route(); });
    const off = await p.evaluate(() => ({ radar: !!document.querySelector('.radar'), rt: riskToday().p, cmd: bj.command('¿cómo voy?') !== null }));
    ok('9 Brújula apagada: la app vuelve a las reglas simples', !off.radar && off.rt === undefined, off);
    ok('9 Sin errores JS', !errs.length, errs);
    await ctx.close(); }

  /* 10. Importar una copia antigua (sin Brújula) no rompe nada */
  { const { p, ctx, errs } = await open(b, '2026-10-15T09:00:00-05:00');
    await p.evaluate(() => { const d = JSON.parse(JSON.stringify(S)); delete d.bj; importBackup(JSON.stringify(d), true); });
    const r = await p.evaluate(() => { tab = 'brujula'; route(); return { mods: S.bj && S.bj.mods && S.bj.mods.riesgo, alert: !!document.querySelector('#main .card.alert') }; });
    ok('10 Copia sin datos de Brújula: se completa con valores por defecto', r.mods === true && !r.alert && !errs.length, { r, errs });
    await ctx.close(); }

  await b.close();
  const f = res.filter(x => !x).length;
  console.log(`\n${res.length - f}/${res.length}`);
  if (f) process.exitCode = 1;
})();
