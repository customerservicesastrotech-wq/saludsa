// Pruebas de la v2.6: Agenda (arreglo de "no guarda lo que le digo"), saludo, respuestas rápidas, imágenes y modo dormir.
const { chromium } = require(process.env.NODE_PATH_PW || 'playwright');
const URL = process.env.PLAN20_URL || 'http://localhost:8765/index.html';
const res = []; const ok = (n, c, i = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + (typeof i === 'string' ? i : JSON.stringify(i)) : '')); };
const MOCK = `window.__n = {}; window.__cfg = null; window.__sleep = []; window.__locks = [];
window.Capacitor = { isNativePlatform: () => false, Plugins: {
  App: { L: {}, addListener(ev, cb) { (this.L[ev] = this.L[ev] || []).push(cb); }, minimizeApp() {} },
  LocalNotifications: { checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
    cancel: async ({ notifications }) => { notifications.forEach(n => delete window.__n[n.id]); },
    schedule: async ({ notifications }) => { notifications.forEach(n => { window.__n[n.id] = { body: n.body, at: n.schedule.at ? new Date(n.schedule.at).getTime() : null, on: n.schedule.on || null }; }); } },
  Shield: { getStatus: async () => ({ usage: true, overlay: true, battery: true, running: true, enabled: false, sleeping: false, nextAlarm: window.__nextAlarm || 0 }), configure: async ({ config }) => { window.__cfg = config; return {}; },
    lockNow: async (o) => { window.__locks.push(o.minutes); }, sleepNow: async (o) => { window.__sleep.push(o.until); return { until: o.until }; },
    popEvents: async () => ({ events: [], usage: {} }), listApps: async () => ({ apps: [{ pkg: 'com.sec.android.app.clockpackage', label: 'Reloj' }, { pkg: 'com.android.chrome', label: 'Chrome' }] }), addListener: () => {} }
} };`;
async function open(b, when, opts = {}) {
  const ctx = await b.newContext({ viewport: opts.vp || { width: 1152, height: 720 }, timezoneId: 'America/Bogota' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(MOCK); await p.clock.install({ time: new Date(when) });
  const bodies = [];
  await p.route('https://api.anthropic.com/**', async (r) => { const body = JSON.parse(r.request().postData()); bodies.push(body); const out = (opts.ai || (() => ({ content: [{ type: 'text', text: 'Ok.' }] })))(body, bodies.length); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({ usage: { input_tokens: 1000, output_tokens: 200 }, stop_reason: 'end_turn' }, out)) }); });
  await p.goto(URL); await p.click('#ack');
  for (let r = 0; r < 2; r++) { for (const n of '1234') await p.click(`.pad button[data-n="${n}"]`); await p.click('.pad button[data-ok]'); }
  await p.clock.runFor(800);
  if (!opts.keepBrief) await p.evaluate(() => { mindDay(today()).flags.brief = 'test'; save(); });
  if (opts.ai) await p.evaluate(() => { localStorage.setItem('plan20.apikey', 'sk-ant-test'); });
  return { p, ctx, errs, bodies };
}
/* Espera a que el asistente termine (la respuesta simulada de la IA llega en tiempo real, no con el reloj simulado) */
const settle = async (p) => { for (let i = 0; i < 40; i++) { await p.clock.runFor(300); await p.waitForTimeout(80); if (await p.evaluate(() => !agentBusy)) { await p.clock.runFor(300); return; } } };
const TU = (name, input) => ({ type: 'tool_use', id: 't' + Math.random().toString(36).slice(2, 7), name, input });

(async () => {
  const b = await chromium.launch();

  /* 1. Los cinco motivos por los que “no guardaba”: ahora se guarda donde corresponde */
  { const { p, ctx, errs } = await open(b, '2026-10-15T20:00:00-05:00');
    const r = await p.evaluate(() => {
      const t1 = addDays(today(), 1), t2 = addDays(today(), 2), out = {};
      out.a = runTool('agenda', { accion: 'crear', items: [{ fecha: 'mañana', momento: 'desayuno', titulo: 'Avena con banano', tipo: 'comida' }] });
      out.manana = ag.items(t1).map(x => x.title); out.hoy = ag.items(today()).map(x => x.title);
      runTool('agenda', { accion: 'crear', items: [{ fecha: 'pasado mañana', momento: 'cena', titulo: 'Pescado' }] });
      out.pasado = ag.items(t2).map(x => x.title);
      runTool('agenda', { accion: 'crear', items: [{ fecha: t1, hora: '07:00', titulo: 'Caminar 20 min', tipo: 'movimiento' }, { fecha: t1, hora: '6 pm', titulo: 'Fuerza', tipo: 'movimiento' }] });
      out.dos = ag.items(t1).filter(x => x.kind === 'movimiento').map(x => x.time + ' ' + x.title);
      runTool('agenda', { accion: 'crear', items: [{ fecha: 'jueves', hora: '10:00', titulo: 'Cita médica', tipo: 'cita' }] });
      out.cita = S.agenda.items.filter(x => x.title === 'Cita médica').map(x => x.date + ' ' + x.time);
      out.mala = runTool('agenda', { accion: 'crear', items: [{ fecha: 'el día 45', titulo: 'Algo' }] }).result;
      out.malaHoy = ag.items(today()).length;
      out.compat = runTool('plan_del_dia', { fecha: 'mañana', items: [{ area: 'almuerzo', intencion: 'Arroz con menestra' }] }).result;
      out.compatDonde = ag.items(t1).some(x => x.title === 'Arroz con menestra' && x.moment === 'almuerzo');
      out.ctx = dayPlanBlock();
      return out;
    });
    ok('1 «mañana» se guarda MAÑANA (antes caía en hoy)', r.manana.includes('Avena con banano') && !r.hoy.includes('Avena con banano'), r);
    ok('1 «pasado mañana» se guarda en su día (antes pisaba hoy)', r.pasado.includes('Pescado'), r.pasado);
    ok('1 Dos planes de movimiento el mismo día conviven (antes se pisaban)', r.dos.length === 2 && r.dos.includes('07:00 Caminar 20 min') && r.dos.includes('18:00 Fuerza'), r.dos);
    ok('1 Una cita (fuera de las 8 áreas) se guarda con su hora', r.cita.length === 1 && r.cita[0] === '2026-10-22 10:00', r.cita);
    ok('1 Una fecha que no se entiende NO se guarda en hoy: la IA recibe el error para corregir', /NO guardado/.test(r.mala) && r.malaHoy === 0, r.mala);
    ok('1 La herramienta antigua (plan_del_dia) también guarda en la fecha correcta', r.compatDonde, r.compat);
    ok('1 La IA ve la agenda de mañana con sus ids (antes solo veía hoy)', /\(mañana\): .*\[g\w+\].*Avena con banano/.test(r.ctx) && /Cita médica/.test(r.ctx), r.ctx.slice(0, 200));
    await p.reload(); for (const n of '1234') await p.click(`.lock .pad button[data-n="${n}"]`); await p.clock.runFor(600);
    ok('1 Lo agendado sigue ahí tras cerrar y abrir la app', await p.evaluate(() => ag.items(addDays(today(), 1)).length >= 4));
    ok('1 Sin errores JS', !errs.length, errs);
    await ctx.close(); }

  /* 2. Conversación real (IA simulada): contar planes de mañana → quedan en la agenda con recordatorio */
  { const { p, ctx, errs } = await open(b, '2026-10-15T20:00:00-05:00', { ai: (body, n) => {
      const last = body.messages[body.messages.length - 1];
      if (Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result')) return { content: [{ type: 'text', text: 'Listo, quedó agendado.' }] };
      return { content: [{ type: 'text', text: '¡Perfecto! Te lo dejo agendado para mañana.' }, TU('agenda', { accion: 'crear', items: [{ fecha: '2026-10-16', hora: '07:00', titulo: 'Desayuno: avena con banano', tipo: 'comida' }, { fecha: '2026-10-16', hora: '10:00', titulo: 'Cita médica', tipo: 'cita' }] }), TU('respuestas', { opciones: ['Gracias', 'Añade la cena', 'Muéstrame mañana'] })] };
    } });
    await p.fill('#cin', 'Mañana desayuno avena a las 7 y a las 10 tengo cita médica'); await p.click('[data-a="csend"]'); await settle(p);
    const r = await p.evaluate(() => ({ card: (document.querySelector('.acard .kicker') || {}).textContent || '', txt: [...document.querySelectorAll('.acard')].map(e => e.textContent).join(' | '), chips: [...document.querySelectorAll('.qchip')].map(e => e.textContent), items: ag.items('2026-10-16').map(x => x.time + ' ' + x.title), n: window.__n }));
    ok('2 La tarjeta “Agendé” muestra día y hora de cada cosa', /Agendé/.test(r.txt) && /Mañana.*07:00.*avena/.test(r.txt) && /10:00.*Cita/.test(r.txt), r.txt.slice(0, 160));
    ok('2 Quedan en la agenda de mañana', r.items.includes('07:00 Desayuno: avena con banano') && r.items.includes('10:00 Cita médica'), r.items);
    await p.clock.runFor(1000);
    const n = await p.evaluate(() => Object.values(window.__n).map(x => new Date(x.at).toTimeString().slice(0, 5) + ' ' + x.body));
    ok('2 Cada cosa con hora tiene su recordatorio (10 min antes)', n.some(x => x.startsWith('06:50') && /avena/.test(x)) && n.some(x => x.startsWith('09:50') && /Cita/.test(x)), n);
    ok('2 La IA ofrece respuestas rápidas como botones', r.chips.includes('Añade la cena'), r.chips);
    await p.click('[data-a="agday"][data-x="2026-10-16"]'); await p.clock.runFor(200);
    const panel = await p.evaluate(() => document.querySelector('.today').innerText);
    ok('2 “Ver en la agenda” abre el día de mañana en el calendario', /07:00[\s\S]*avena[\s\S]*10:00[\s\S]*Cita/.test(panel), panel.slice(0, 160));
    ok('2 Sin errores JS', !errs.length, errs);
    await ctx.close(); }

  /* 3. Agenda a mano: añadir, hecho, recordatorio, propuesta, plan, borrar, ajustes */
  { const { p, ctx, errs } = await open(b, '2026-10-14T08:00:00-05:00');
    await p.evaluate(() => { tab = 'hoy'; homeView = 'dia'; route(); });
    await p.click('[data-a="agadd"]'); await p.fill('.sheet [data-k="title"]', 'Estudiar física'); await p.fill('.sheet [data-k="time"]', '16:00'); await p.click('.sheet button[data-seg="kind"][data-v="estudio"]'); await p.click('.sheet [data-save]'); await p.clock.runFor(700);
    let r = await p.evaluate(() => ({ it: ag.items(today()).find(x => x.title === 'Estudiar física'), n: Object.values(window.__n).map(x => x.body) }));
    ok('3 + Añadir guarda con hora y programa el recordatorio', r.it && r.it.time === '16:00' && r.n.some(b => /16:00 · Estudiar física/.test(b)), r);
    const id = r.it.id;
    await p.click(`[data-a="agdone"][data-x="${id}"]`); await p.clock.runFor(700);
    r = await p.evaluate((id) => ({ st: S.agenda.items.find(x => x.id === id).status, n: Object.values(window.__n).some(x => /Estudiar física/.test(x.body)) }), id);
    ok('3 Marcar como hecho quita su recordatorio', r.st === 'hecho' && !r.n, r);
    await p.evaluate(() => { runTool('agenda', { accion: 'crear', items: [{ fecha: today(), momento: 'cena', titulo: 'Pollo con verduras', propuesta: true }] }); route(); });
    const pid = await p.evaluate(() => ag.items(today()).find(x => x.prop).id);
    await p.click(`[data-a="agacc"][data-x="${pid}"]`); await p.clock.runFor(700);
    r = await p.evaluate((pid) => ({ prop: S.agenda.items.find(x => x.id === pid).prop, n: Object.values(window.__n).some(x => /19:30 · Pollo/.test(x.body)) }), pid);
    ok('3 “Acepto” convierte la propuesta en plan y la recuerda a la hora del momento (cena 19:30)', r.prop === false && r.n, r);
    const virt = await p.evaluate(() => ag.virtual(today()).map(x => x.vid + ':' + x.title));
    ok('3 El plan de movimiento del día aparece para agendarlo con un toque', virt.some(x => x.startsWith('mov:Caminata')), virt);
    if (virt.some(x => x.startsWith('mov:'))) { await p.click('[data-a="agvirt"][data-x^="mov|"]'); await p.clock.runFor(300); ok('3 “Agendar” lo guarda', await p.evaluate(() => ag.items(today()).some(x => x.kind === 'movimiento' && x.src === 'plan'))); }
    await p.evaluate(() => { tab = 'agenda'; route(); }); await p.click('[data-a="agbef"][data-x="30"]'); await p.clock.runFor(700);
    ok('3 Ajustes: avisar 30 min antes reprograma', await p.evaluate(() => Object.values(window.__n).some(x => /Pollo/.test(x.body) && new Date(x.at).toTimeString().startsWith('19:00'))));
    for (const vp of [{ width: 1152, height: 720 }, { width: 720, height: 1152 }]) {
      await p.setViewportSize(vp);
      for (const t of ['hoy', 'agenda']) { const s = await p.evaluate((t) => { tab = t; homeView = 'dia'; route(); return { over: document.documentElement.scrollWidth > innerWidth + 1, alert: !!document.querySelector('#main .card.alert') }; }, t); ok(`3 ${t} sin desbordamiento ni error (${vp.width}px)`, !s.over && !s.alert, s); }
    }
    await p.setViewportSize({ width: 720, height: 1152 });
    const gap = await p.evaluate(() => { tab = 'hoy'; homeView = 'dia'; route(); const v = document.querySelector('.vtabs').getBoundingClientRect(), a = document.querySelector('aside.today').getBoundingClientRect(); return Math.round(a.top - v.bottom); });
    ok('3 En vertical la Agenda queda justo debajo de las pestañas (sin hueco)', gap >= 0 && gap < 60, gap);
    ok('3 Sin errores JS', !errs.length, errs);
    await ctx.close(); }

  /* 4. El día empieza con un saludo (no con una pregunta), con botones de respuesta y propuestas en la agenda */
  { const { p, ctx, errs } = await open(b, '2026-10-15T07:30:00-05:00', { keepBrief: true, ai: (body) => {
      if (body.tools && body.tools.some(t => t.name === 'briefing_del_dia')) return { stop_reason: 'tool_use', content: [TU('briefing_del_dia', { mensaje: '¡Hola! Buenos días. Hoy tienes caminata después de clase y un día tranquilo.', propuestas: { desayuno: 'Avena' }, agenda: [{ hora: '07:45', titulo: 'Desayuno: avena con fruta', tipo: 'comida' }, { momento: 'tarde', titulo: 'Caminata 20 min', tipo: 'movimiento' }], respuestas: ['Me parece bien', 'Cambia la cena', '¿Qué me toca hoy?'] })] };
      return { content: [{ type: 'text', text: 'Ok.' }] };
    } });
    await p.evaluate(() => { S.mind.mem = []; S.ai.chat = []; delete mindDay(today()).flags.brief; save(); tab = 'hoy'; route(); });
    for (let i = 0; i < 8; i++) { await p.clock.runFor(400); await p.waitForTimeout(250); } // la respuesta de la IA llega en tiempo real
    const r = await p.evaluate(() => { const a = S.ai.chat.filter(m => m.role === 'assistant'); return { first: a[0] && a[0].content, chips: [...document.querySelectorAll('.qchip')].map(e => e.textContent), props: ag.items(today()).filter(x => x.prop).map(x => (x.time || x.moment) + ' ' + x.title) }; });
    ok('4 El primer mensaje del día es un saludo (¡Hola…!), no una pregunta', /^¡Hola/.test(r.first || ''), r.first);
    ok('4 Con botones de respuesta rápida (solo los del último mensaje)', r.chips.includes('Me parece bien') && r.chips.length === 3, r.chips);
    ok('4 Las propuestas del saludo quedan en la agenda como propuestas', r.props.includes('07:45 Desayuno: avena con fruta') && r.props.includes('tarde Caminata 20 min'), r.props);
    await p.click('.qchip >> text=¿Qué me toca hoy?'); await settle(p);
    ok('4 Tocar un botón responde con esa frase', await p.evaluate(() => S.ai.chat.some(m => m.role === 'user' && m.content === '¿Qué me toca hoy?')));
    ok('4 Sin errores JS', !errs.length, errs);
    await ctx.close(); }
  { const { p, ctx } = await open(b, '2026-10-15T07:30:00-05:00', { keepBrief: true });
    await p.evaluate(() => { S.ai.chat = []; delete mindDay(today()).flags.brief; save(); tab = 'hoy'; route(); }); await p.clock.runFor(1500);
    const r = await p.evaluate(() => ({ first: (S.ai.chat.find(m => m.role === 'assistant') || {}).content || '', chips: [...document.querySelectorAll('.qchip')].map(e => e.textContent) }));
    ok('4 Sin IA también empieza con «¡Hola!» y ofrece botones', /^¡Hola!/.test(r.first) && r.chips.includes('¿Qué me toca hoy?'), r);
    await ctx.close(); }

  /* 5. Imágenes adjuntas: se reducen, se envían a la IA como imagen y se ve la miniatura */
  { const { p, ctx, errs, bodies } = await open(b, '2026-10-15T13:00:00-05:00', { ai: () => ({ content: [{ type: 'text', text: 'Veo un plato con arroz, pollo y ensalada: buen equilibrio.' }] }) });
    const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const g = c.getContext('2d'); g.fillStyle = '#c83'; g.fillRect(0, 0, 3000, 2000); return c.toDataURL('image/png').split(',')[1]; });
    await p.setInputFiles('#attf', { name: 'plato.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }); await p.waitForTimeout(800); await p.clock.runFor(300);
    ok('5 Al adjuntar aparece la miniatura antes de enviar', await p.evaluate(() => document.querySelectorAll('.attprev img').length === 1));
    await p.fill('#cin', '¿Está bien este almuerzo?'); await p.click('[data-a="csend"]'); await settle(p);
    const body = bodies[bodies.length - 1], last = body.messages[body.messages.length - 1];
    const img = Array.isArray(last.content) && last.content.find(c => c.type === 'image');
    const dims = img ? await p.evaluate((d) => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = 'data:image/jpeg;base64,' + d; }), img.source.data) : null;
    ok('5 La IA recibe la imagen (JPEG) y el texto en el mismo mensaje', img && img.source.media_type === 'image/jpeg' && last.content.some(c => c.type === 'text' && /almuerzo/.test(c.text)), last.content && last.content.map(c => c.type));
    ok('5 La imagen se reduce a 1568 px como máximo antes de enviarla', dims && Math.max(...dims) === 1568, dims);
    const r = await p.evaluate(() => ({ thumb: document.querySelectorAll('.msg.user .mimgs img').length, stored: (S.ai.chat.find(m => m.imgs) || {}).imgs[0].length, pend: document.querySelectorAll('.attprev img').length }));
    ok('5 En la conversación queda solo una miniatura pequeña (no la foto entera)', r.thumb === 1 && r.stored < 30000 && r.pend === 0, r);
    ok('5 Sin errores JS', !errs.length, errs);
    await ctx.close(); }

  /* 6. Modo dormir */
  { const { p, ctx, errs } = await open(b, '2026-10-15T23:10:00-05:00');
    await p.evaluate(() => { tab = 'escudo'; route(); }); await p.clock.runFor(300);
    ok('6 v2.8: el modo dormir viene activado a las 22:30 hasta la alarma; la emergencia solo abre el marcador', await p.evaluate(() => /Modo dormir/.test(document.querySelector('#sleepcard').textContent) && /únicamente el marcador de emergencia/.test(document.querySelector('#sleepcard').textContent) && S.shield.cfg.sleep.on && S.shield.cfg.sleep.start === '22:30' && S.shield.cfg.sleep.endMode === 'alarm' && !S.shield.cfg.sleep.pinExit));
    await p.click('[data-a="slon"][data-x="1"]'); await p.clock.runFor(500);
    const cfg = await p.evaluate(() => ({ c: window.__cfg && window.__cfg.sleep, pin: S.settings.pinHash, salt: S.settings.salt }));
    ok('6 La configuración llega a la tablet (22:30, termina con la alarma, sin salida con PIN)', cfg.c && cfg.c.on === true && cfg.c.start === '22:30' && cfg.c.endMode === 'alarm' && cfg.c.end === '06:30' && cfg.c.pinHash === '' && cfg.c.days.length === 7, cfg.c && { on: cfg.c.on, s: cfg.c.start, e: cfg.c.end, m: cfg.c.endMode });
    await p.evaluate(() => { S.shield.cfg.sleep.pinExit = true; save(); syncShield(); }); await p.clock.runFor(300);
    ok('6 Si activas la salida con PIN, viaja como hash', await p.evaluate(() => window.__cfg.sleep.pinHash === S.settings.pinHash && window.__cfg.sleep.pinSalt === S.settings.salt));
    ok('6 La pantalla de dormir lleva mensajes útiles (tu mañana, descanso)', cfg.c && cfg.c.messages.length >= 3);
    const w = await p.evaluate(() => Object.entries(window.__n).filter(([id]) => +id >= 311 && +id <= 317).map(([id, x]) => id + ':' + x.on.weekday + '@' + x.on.hour + ':' + x.on.minute));
    ok('6 Aviso 10 min antes de dormir, un recordatorio por día (22:20)', w.length === 7 && w.every(x => x.endsWith('@22:20')) && w.includes('315:5@22:20'), w);
    await p.click('[data-a="slday"][data-x="5"]'); await p.clock.runFor(400);
    ok('6 Quitar el viernes: ya no toca esa noche', await p.evaluate(() => !sleep.onDay('2026-10-16') && sleep.onDay('2026-10-15') && !window.__n[316]));
    await p.click('[data-a="slnow"]'); await p.clock.runFor(400);
    ok('6 “Dormir ahora” deja que la tablet calcule el final con su alarma', await p.evaluate(() => window.__sleep.length === 1 && window.__sleep[0] === 0), await p.evaluate(() => window.__sleep));
    await p.evaluate(async () => { window.__nextAlarm = new Date('2026-10-16T05:45:00-05:00').getTime(); await shieldStatus(); tab = 'escudo'; route(); }); await p.clock.runFor(300);
    ok('6 La tarjeta muestra la próxima alarma de la tablet', /Próxima alarma de la tablet: .*05:45/.test(await p.textContent('#sleepcard')) && /hasta las 05:45 \(tu alarma\)/.test(await p.textContent('#sleepcard')));
    ok('6 Con alarma a las 05:45, la noche termina a las 05:45', await p.evaluate(() => new Date(sleep.nextEnd()).toString().includes('Oct 16 2026 05:45')));
    await p.click('[data-a="slend"][data-x="fixed"]'); await p.clock.runFor(300); await p.click('[data-a="slnow"]'); await p.clock.runFor(400);
    ok('6 En «hora fija», “Dormir ahora” bloquea hasta las 06:30 de mañana', await p.evaluate(() => S.shield.cfg.sleep.endMode === 'fixed' && new Date(window.__sleep[1]).toString().includes('Oct 16 2026 06:30')), await p.evaluate(() => window.__sleep.map(x => new Date(x).toString())));
    await p.click('[data-a="slend"][data-x="alarm"]'); await p.clock.runFor(300);
    await p.evaluate(() => { window.__sleep.length = 1; });
    const say = async (t) => { await p.evaluate(() => { tab = 'hoy'; route(); }); await p.fill('#cin', t); await p.click('[data-a="csend"]'); await p.clock.runFor(3000); return p.evaluate(() => ({ c: S.ai.chat[S.ai.chat.length - 1].content, n: window.__sleep.length })); };
    let r = await say('me voy a dormir');
    ok('6 «me voy a dormir» por la noche bloquea hasta la mañana', r.n === 2 && /Buenas noches/.test(r.c), r);
    const ag6 = await p.evaluate(() => ag.virtual(today()).find(x => x.vid === 'sleep'));
    ok('6 La hora de dormir aparece en la agenda', ag6 && ag6.time === '22:30' && /05:45 \(tu alarma\)/.test(ag6.title), ag6);
    ok('6 Inicio muestra el botón “Dormir” por la noche', await p.evaluate(() => { tab = 'hoy'; route(); return !!document.querySelector('[data-a="slnowq"]'); }));
    await p.evaluate(() => { S.shield.events.push({ id: 'x1', t: Date.now(), kind: 'sleep_exit', minutes: 15, done: Date.now() }); save(); askAboutShield(); tab = 'escudo'; route(); });
    ok('6 Salir con PIN queda anotado y no dispara la pregunta “¿qué pasó?”', await p.evaluate(() => /Saliste del modo dormir con tu PIN/.test(document.querySelector('#main').textContent) && !S.ai.chat.some(m => (m.cards || []).some(c => c.type === 'shieldq'))));
    ok('6 Sin errores JS', !errs.length, errs);
    await ctx.close(); }
  { const { p, ctx } = await open(b, '2026-10-15T15:00:00-05:00');
    const say = async (t) => { await p.evaluate(() => { tab = 'hoy'; route(); }); await p.fill('#cin', t); await p.click('[data-a="csend"]'); await p.clock.runFor(3000); return p.evaluate(() => ({ c: S.ai.chat[S.ai.chat.length - 1].content, n: window.__sleep.length, chips: [...document.querySelectorAll('.qchip')].map(e => e.textContent) })); };
    let r = await say('me voy a dormir');
    ok('6 A las 15:00 no bloquea sin preguntar (podría ser una siesta)', r.n === 0 && r.chips.includes('Sí, bloquea hasta mañana'), r);
    await p.click('.qchip >> text=Sí, bloquea hasta mañana'); await p.clock.runFor(3500);
    ok('6 Si confirma, bloquea hasta la mañana', await p.evaluate(() => window.__sleep.length === 1));
    await ctx.close(); }

  /* 7. Copia antigua sin agenda ni modo dormir */
  { const { p, ctx, errs } = await open(b, '2026-10-15T09:00:00-05:00');
    await p.evaluate(() => { const d = JSON.parse(JSON.stringify(S)); delete d.agenda; delete d.shield.cfg.sleep; importBackup(JSON.stringify(d), true); });
    const r = await p.evaluate(() => { tab = 'hoy'; route(); const a = !!document.querySelector('.agstrip'); tab = 'escudo'; route(); return { a, sleep: !!document.querySelector('#sleepcard'), items: Array.isArray(S.agenda.items) }; });
    ok('7 Una copia antigua se completa con agenda vacía y modo dormir por defecto', r.a && r.sleep && r.items && !errs.length, { r, errs });
    await ctx.close(); }

  await b.close();
  const f = res.filter(x => !x).length;
  console.log(`\n${res.length - f}/${res.length}`);
  if (f) process.exitCode = 1;
})();
