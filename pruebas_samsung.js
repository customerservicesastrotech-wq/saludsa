// Pruebas de la v2.8: conexión con Samsung (Calendar y Reloj) y modo dormir automático hasta la alarma.
const { chromium } = require(process.env.NODE_PATH_PW || 'playwright');
const URL = process.env.PLAN20_URL || 'http://localhost:8765/index.html';
const res = []; const ok = (n, c, i = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + (typeof i === 'string' ? i : JSON.stringify(i)) : '')); };
const MOCK = (dev, perm = true) => `window.__n = {}; window.__ev = {}; window.__evN = 100; window.__alarms = []; window.__del = []; window.__cfg = null; window.__sleep = [];
window.Capacitor = { isNativePlatform: () => false, Plugins: Object.assign({
  App: { L: {}, addListener(ev, cb) { (this.L[ev] = this.L[ev] || []).push(cb); }, minimizeApp() {} },
  LocalNotifications: { checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
    cancel: async ({ notifications }) => { notifications.forEach(n => delete window.__n[n.id]); },
    schedule: async ({ notifications }) => { notifications.forEach(n => { window.__n[n.id] = { body: n.body }; }); } },
  Shield: { getStatus: async () => ({ usage: true, overlay: true, battery: true, running: true, enabled: false, sleeping: false, nextAlarm: window.__nextAlarm || 0 }), configure: async ({ config }) => { window.__cfg = config; return {}; },
    sleepNow: async (o) => { window.__sleep.push(o.until); return { until: o.until || 1 }; }, popEvents: async () => ({ events: [], usage: {} }), listApps: async () => ({ apps: [] }), addListener: () => {} }
}, ${dev ? `{ Dispositivo: {
    calendarPermission: async () => ({ granted: ${perm} }),
    listCalendars: async () => ({ calendars: [{ id: 1, name: 'Mi calendario', account: 'Mi calendario', type: 'LOCAL', primary: false }, { id: 7, name: 'Calendario', account: 'yo@gmail.com', type: 'com.google', primary: true }, { id: 3, name: 'Mi calendario', account: 'Cuenta Samsung', type: 'com.osp.app.signin', primary: false }, { id: 4, name: 'Samsung Calendar', account: 'Cuenta Samsung', type: 'com.samsung.android.calendar', primary: true }] }),
    saveEvent: async (e) => { const id = e.eventId && window.__ev[e.eventId] ? e.eventId : ++window.__evN; window.__ev[id] = Object.assign({}, e, { id, updates: ((window.__ev[id] || {}).updates || 0) + (e.eventId ? 1 : 0) }); return { eventId: id }; },
    deleteEvents: async ({ ids }) => { ids.forEach(i => { window.__del.push(i); delete window.__ev[i]; }); return { deleted: ids.length }; },
    setAlarm: async (a) => { window.__alarms.push(a); return { ok: true }; },
    showAlarms: async () => { window.__showAlarms = 1; }, nextAlarm: async () => ({ at: 0 }) } }` : '{}'}) };`;
async function open(b, when, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1152, height: 720 }, timezoneId: 'America/Bogota' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  if (opts.pre) await p.addInitScript(opts.pre);
  await p.addInitScript(MOCK(opts.dev !== false, opts.perm !== false)); await p.clock.install({ time: new Date(when) });
  const bodies = [];
  await p.route('https://api.anthropic.com/**', async (r) => { const body = JSON.parse(r.request().postData()); bodies.push(body); const out = (opts.ai || (() => ({ content: [{ type: 'text', text: 'Ok.' }] })))(body, bodies.length); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({ usage: { input_tokens: 1000, output_tokens: 200 }, stop_reason: 'end_turn' }, out)) }); });
  await p.goto(URL);
  if (!opts.noUnlock) { await p.click('#ack'); for (let r = 0; r < 2; r++) { for (const n of '1234') await p.click(`.pad button[data-n="${n}"]`); await p.click('.pad button[data-ok]'); } }
  await p.clock.runFor(800);
  await p.evaluate(() => { if (typeof mindDay === 'function') { mindDay(today()).flags.brief = 'test'; save(); } });
  if (opts.ai) await p.evaluate(() => { localStorage.setItem('plan20.apikey', 'sk-ant-test'); });
  return { p, ctx, errs, bodies };
}
const settle = async (p) => { for (let i = 0; i < 40; i++) { await p.clock.runFor(300); await p.waitForTimeout(80); if (await p.evaluate(() => !agentBusy)) { await p.clock.runFor(300); return; } } };
const say = async (p, t) => { await p.evaluate(() => { tab = 'hoy'; route(); }); await p.fill('#cin', t); await p.click('[data-a="csend"]'); await p.clock.runFor(1500); await p.waitForTimeout(50); return p.evaluate(() => S.ai.chat[S.ai.chat.length - 1].content); };
const TU = (name, input) => ({ type: 'tool_use', id: 't' + Math.random().toString(36).slice(2, 7), name, input });
const flush = async (p) => { for (let i = 0; i < 4; i++) { await p.clock.runFor(1000); await p.waitForTimeout(30); } };

(async () => {
  const b = await chromium.launch();

  /* 1. Horas dichas de muchas formas */
  { const { p, ctx } = await open(b, '2026-10-15T20:00:00-05:00');
    const r = await p.evaluate(() => ['6:30', '6 30', '6', '6 y media', '7 menos cuarto', '6 de la tarde', '6:30 pm', '12 am', '18:00', 'a las 5 y 10 de la mañana', '25:00', 'seis'].map(s => sam.time(s)));
    ok('1 «6 y media», «7 menos cuarto», «6 de la tarde», «12 am»… se entienden', r.join(',') === '06:30,06:30,06:00,06:30,06:45,18:00,18:30,00:00,18:00,05:10,,', r);
    await ctx.close(); }

  /* 2. Alarmas en el reloj de la tablet */
  { const { p, ctx, errs } = await open(b, '2026-10-15T21:00:00-05:00');
    let c = await say(p, 'ponme una alarma a las 6:30'); await flush(p);
    let a = await p.evaluate(() => window.__alarms.slice());
    ok('2 «ponme una alarma a las 6:30» crea la alarma en el reloj (sin abrirlo)', a.length === 1 && a[0].hour === 6 && a[0].minute === 30 && a[0].skipUi === true && a[0].days.length === 0 && /06:30/.test(c), { a, c });
    ok('2 Dice que el modo dormir se desbloquea con esa alarma', /modo dormir se desbloquea cuando suene/.test(c), c);
    await say(p, 'Despiértame mañana a las 7 y media'); await flush(p);
    await say(p, 'pon una alarma a las 6 de la tarde de lunes a viernes'); await flush(p);
    a = await p.evaluate(() => window.__alarms.map(x => `${x.hour}:${x.minute}/${x.days.join('')}`));
    ok('2 «despiértame mañana a las 7 y media» → 7:30', a[1] === '7:30/', a);
    ok('2 «de lunes a viernes» → alarma repetida L-V (días de Android 2-6)', a[2] === '18:0/23456', a);
    c = await say(p, 'ponme una alarma a las 30');
    ok('2 Hora imposible: no pone nada y lo explica', /No entendí la hora/.test(c) && a.length === 3, c);
    ok('2 Queda la lista de alarmas puestas por Plan 20', await p.evaluate(() => S.samsung.alarms.length === 3));
    ok('2 Sin errores', !errs.length, errs);
    await ctx.close(); }

  /* 3. La IA también pone alarmas */
  { const { p, ctx, errs } = await open(b, '2026-10-15T21:00:00-05:00', { ai: (body, n) => n === 1 ? { stop_reason: 'tool_use', content: [{ type: 'text', text: 'Hecho.' }, TU('alarma', { hora: '05:50', dias: 'lunes a viernes', texto: 'Gimnasio' })] } : { content: [{ type: 'text', text: 'Listo.' }] } });
    await p.evaluate(() => agentSend('necesito levantarme temprano para el gimnasio entre semana, a las 5:50')); await settle(p); await flush(p);
    const r = await p.evaluate(() => ({ a: window.__alarms, cards: [...document.querySelectorAll('.acard')].map(e => e.textContent).join('|'), tools: TOOLS2.map(t => t.name) }));
    ok('3 La herramienta «alarma» está disponible para la IA', r.tools.includes('alarma'));
    ok('3 La IA pone la alarma con días y etiqueta', r.a.length === 1 && r.a[0].hour === 5 && r.a[0].minute === 50 && r.a[0].label === 'Gimnasio' && r.a[0].days.join('') === '23456', r.a);
    ok('3 La conversación lo confirma', /Alarma en el reloj de la tablet: 05:50 · lunes a viernes/.test(r.cards), r.cards);
    ok('3 Sin errores', !errs.length, errs);
    await ctx.close(); }

  /* 4. Samsung Calendar: agenda, horarios y cumpleaños se copian y se mantienen al día */
  { const { p, ctx, errs } = await open(b, '2026-10-15T09:00:00-05:00');
    await p.evaluate(() => { tab = 'agenda'; route(); });
    ok('4 Más → Agenda muestra la tarjeta Samsung Calendar', /Samsung Calendar/.test(await p.textContent('#samcard')));
    await p.evaluate(() => { runTool('agenda', { accion: 'crear', items: [{ fecha: 'mañana', hora: '10:00', titulo: 'Cita médica', tipo: 'cita' }, { fecha: 'mañana', titulo: 'Comprar regalo' }, { fecha: 'hoy', momento: 'cena', titulo: 'Propuesta de cena', propuesta: true }] });
      runTool('horario', { accion: 'crear', horarios: [{ titulo: 'Cálculo', dias: 'martes y jueves', hora_inicio: '18:00', hora_fin: '20:00', hasta: '2026-12-15' }] });
      runTool('persona', { personas: [{ nombre: 'Ana', cumpleanos: '29/02/2004' }, { nombre: 'Juan', cumpleanos: '17/10/1998' }] }); });
    await p.click('[data-a="samon"][data-x="1"]'); await p.clock.runFor(300);
    ok('4 Elige por defecto el calendario de la cuenta Samsung', await p.evaluate(() => document.querySelector('.sheet .seg button.on').textContent.includes('Samsung Calendar')));
    await p.click('.sheet [data-save]'); await flush(p);
    let ev = await p.evaluate(() => Object.values(window.__ev));
    const byT = (t) => ev.find(e => e.title === t);
    ok('4 Se copian: cita con hora, cosa sin hora (todo el día), horario y cumpleaños — no las propuestas', ev.length === 5 && byT('Cita médica') && byT('Comprar regalo') && !byT('Propuesta de cena') && byT('Cálculo') && byT('🎂 Cumpleaños de Ana') && byT('🎂 Cumpleaños de Juan'), ev.map(e => e.title));
    ok('4 Todo en el calendario elegido (Samsung, id 4) y sin avisos duplicados', ev.every(e => e.calendarId === 4 && e.reminder === -1));
    const cita = byT('Cita médica');
    ok('4 La cita: mañana 10:00-11:00 hora local', new Date(cita.start).toString().includes('Oct 16 2026 10:00') && cita.end - cita.start === 3600e3 && !cita.allDay, new Date(cita.start).toString());
    ok('4 Sin hora → evento de todo el día', byT('Comprar regalo').allDay === true && new Date(byT('Comprar regalo').start).toISOString().startsWith('2026-10-16T00:00'));
    const calc = byT('Cálculo');
    ok('4 Horario fijo → evento que se repite (martes y jueves hasta el 15 dic), 2 h, desde hoy jueves', calc.rrule === 'FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261215T235959Z' && calc.end - calc.start === 2 * 3600e3 && new Date(calc.start).toString().includes('Thu Oct 15 2026 18:00'), calc);
    ok('4 Cumpleaños → evento anual (29-feb: último día de febrero)', byT('🎂 Cumpleaños de Juan').rrule === 'FREQ=YEARLY' && byT('🎂 Cumpleaños de Ana').rrule === 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
    const n0 = await p.evaluate(() => window.__evN);
    await p.evaluate(() => sam.sync()); await flush(p);
    ok('4 Volver a sincronizar sin cambios no duplica ni reescribe nada', await p.evaluate((n0) => window.__evN === n0 && Object.values(window.__ev).every(e => !e.updates), n0));
    await p.evaluate(() => { const it = S.agenda.items.find(x => x.title === 'Cita médica'); runTool('agenda', { accion: 'cambiar', items: [{ id: it.id, hora: '11:30' }] }); });
    await flush(p);
    ev = await p.evaluate(() => Object.values(window.__ev));
    ok('4 Cambiar la hora en Plan 20 actualiza el MISMO evento en Samsung', ev.length === 5 && byT('Cita médica').id === cita.id && new Date(byT('Cita médica').start).toString().includes('11:30'), byT('Cita médica'));
    await p.evaluate(() => { const it = S.agenda.items.find(x => x.title === 'Comprar regalo'); runTool('agenda', { accion: 'borrar', ids: [it.id] }); }); await flush(p);
    ev = await p.evaluate(() => Object.values(window.__ev));
    ok('4 Borrar en Plan 20 lo borra de Samsung', ev.length === 4 && !byT('Comprar regalo'));
    await p.evaluate(() => { const r = S.mind.routines[0]; runTool('horario', { accion: 'cambiar', horarios: [{ id: r.id, hora_inicio: '17:00', desde: '2026-11-02' }] }); }); await flush(p);
    ev = await p.evaluate(() => Object.values(window.__ev));
    ok('4 Un horario que cambia: la versión vieja termina el 1 nov y la nueva empieza el 2', ev.filter(e => e.title === 'Cálculo').length === 2 && ev.some(e => e.title === 'Cálculo' && /UNTIL=20261101/.test(e.rrule)) && ev.some(e => e.title === 'Cálculo' && new Date(e.start).toString().includes('Nov 03 2026 17:00')), ev.filter(e => e.title === 'Cálculo').map(e => e.rrule + ' ' + new Date(e.start)));
    await p.evaluate(() => { tab = 'agenda'; route(); });
    ok('4 La tarjeta dice a qué calendario copia', /Samsung Calendar · Cuenta Samsung/.test(await p.textContent('#samcard')));
    await p.click('[data-a="samoff"]'); await p.click('[data-a="samoff"]'); await flush(p);
    ok('4 «Dejar de copiar y quitar lo copiado» borra solo lo que creó Plan 20', await p.evaluate(() => Object.keys(window.__ev).length === 0 && !S.samsung.cal && !Object.keys(S.samsung.map).length));
    ok('4 Sin errores', !errs.length, errs);
    await ctx.close(); }

  /* 5. Sin permiso de calendario o fuera de la tablet */
  { const { p, ctx, errs } = await open(b, '2026-10-15T09:00:00-05:00', { perm: false });
    await p.evaluate(() => { tab = 'agenda'; route(); }); await p.click('[data-a="samon"][data-x="1"]'); await flush(p);
    ok('5 Sin permiso: explica dónde concederlo y no activa nada', await p.evaluate(() => /Sin permiso de calendario/.test((document.querySelector('.errbox') || {}).textContent || '') && !S.samsung.cal));
    await ctx.close(); }
  { const { p, ctx, errs } = await open(b, '2026-10-15T09:00:00-05:00', { dev: false });
    const c = await say(p, 'ponme una alarma a las 6');
    await p.evaluate(() => { tab = 'agenda'; route(); });
    ok('5 En el navegador: la alarma y Samsung Calendar dicen que solo funcionan en la tablet', /solo se pueden poner desde la app instalada/.test(c) && /Solo funciona en la app instalada/.test(await p.textContent('#samcard')), c);
    ok('5 Sin errores', !errs.length, errs);
    await ctx.close(); }

  /* 6. Modo dormir automático: una copia de la v2.6 (apagado, 23:00) pasa a 22:30 hasta la alarma */
  { const old = `(() => { if (localStorage.getItem('plan20.v1')) return; const s = { v: 1, settings: { start: '2026-09-23', pinHash: '', salt: '', discreet: true, streak: false, theme: 'system', remind: { on: true, open: '07:00', close: '21:30', review: '18:00' } }, profile: null, careAck: false, days: {}, logs: [], weekPlans: {}, reviews: {}, studyDue: [], shield: { cfg: { enabled: false, sleep: { on: false, start: '23:00', end: '06:30', days: [0,1,2,3,4,5,6], allow: [], pinExit: true, wait: 60, snooze: 15, warn: true } }, events: [], usage: {}, labels: {} } }; localStorage.setItem('plan20.v1', JSON.stringify(s)); })();`;
    const { p, ctx, errs } = await open(b, '2026-10-15T20:00:00-05:00', { pre: old, noUnlock: true });
    const r = await p.evaluate(() => S.shield.cfg.sleep);
    ok('6 Al actualizar, el modo dormir queda activado a las 22:30, termina con la alarma y sin salida con PIN', r.on === true && r.start === '22:30' && r.endMode === 'alarm' && r.pinExit === false && r.end === '06:30', r);
    await p.evaluate(() => { S.shield.cfg.sleep.start = '23:15'; save(); location.reload(); }); await p.waitForTimeout(500);
    ok('6 Si luego lo cambias, se respeta (la migración es una sola vez)', await p.evaluate(() => S.shield.cfg.sleep.start === '23:15'));
    ok('6 Sin errores', !errs.length, errs);
    await ctx.close(); }

  await b.close();
  const f = res.filter(x => !x).length;
  console.log(`\n${res.length - f}/${res.length}`);
  if (f) process.exitCode = 1;
})();
