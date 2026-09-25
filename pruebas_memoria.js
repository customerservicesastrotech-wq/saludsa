// Pruebas de la v2.7: reloj interno y Memoria 2.0 (personas, cumpleaños, fechas, horarios en el tiempo, hechos con historial).
const { chromium } = require(process.env.NODE_PATH_PW || 'playwright');
const URL = process.env.PLAN20_URL || 'http://localhost:8765/index.html';
const res = []; const ok = (n, c, i = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + (typeof i === 'string' ? i : JSON.stringify(i)) : '')); };
const MOCK = `window.__n = {};
window.Capacitor = { isNativePlatform: () => false, Plugins: {
  App: { L: {}, addListener(ev, cb) { (this.L[ev] = this.L[ev] || []).push(cb); }, minimizeApp() {} },
  LocalNotifications: { checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
    cancel: async ({ notifications }) => { notifications.forEach(n => delete window.__n[n.id]); },
    schedule: async ({ notifications }) => { notifications.forEach(n => { window.__n[n.id] = { body: n.body, at: n.schedule.at ? new Date(n.schedule.at).getTime() : null }; }); } }
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
const settle = async (p) => { for (let i = 0; i < 40; i++) { await p.clock.runFor(300); await p.waitForTimeout(80); if (await p.evaluate(() => !agentBusy)) { await p.clock.runFor(300); return; } } };
const TU = (name, input) => ({ type: 'tool_use', id: 't' + Math.random().toString(36).slice(2, 7), name, input });
const sysText = (body) => (Array.isArray(body.system) ? body.system.map(s => s.text).join('\n') : body.system || '');

(async () => {
  const b = await chromium.launch();

  /* 1. Reloj interno: la IA siempre sabe la fecha y hora reales, sin preguntar */
  { let n = 0;
    const { p, ctx, errs, bodies } = await open(b, '2026-10-15T20:15:00-05:00', { ai: () => ({ content: [{ type: 'text', text: 'Entendido.' }] }) });
    await p.evaluate(() => agentSend('hola, ¿qué hago ahora?')); await settle(p);
    const sys = sysText(bodies[bodies.length - 1]), msgs = bodies[bodies.length - 1].messages;
    ok('1 El contexto dinámico empieza con el RELOJ (fecha completa y hora real de la tablet)', /^RELOJ[^\n]*jueves 15 de octubre de 2026 · 20:15 \(noche\)/m.test(sys), sys.split('\n').find(l => l.startsWith('RELOJ')));
    ok('1 El reloj incluye la zona horaria y mañana', /America\/Bogota/.test(sys) && /UTC−05:00/.test(sys) && /Mañana es viernes 2026-10-16/.test(sys));
    ok('1 La regla prohíbe preguntar la hora', /Nunca preguntes qué hora o qué día es/.test(sys));
    const um = msgs.filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : '');
    ok('1 Cada mensaje de la persona llega con su hora: [jue 15 oct 20:15]', um.some(c => c.startsWith('[jue 15 oct 20:15] hola')), um);
    await p.clock.runFor(2 * 3600e3);
    await p.evaluate(() => agentSend('ya volví')); await settle(p);
    const sys2 = sysText(bodies[bodies.length - 1]);
    ok('1 El reloj avanza con la tablet (2 h después dice 22:15)', /· 22:1\d \(noche\)/.test(sys2));
    n = bodies.length;
    const ld = await p.evaluate(() => { runTool('recordar', { hechos: [{ texto: 'Guardado de noche', categoria: 'otro' }] }); return mem.block(); });
    ok('1 Lo guardado a las 22:15 lleva la fecha LOCAL (15 oct), no la de UTC (16 oct)', /\(otro, 2026-10-15\) Guardado de noche/.test(ld), ld.split('\n').find(l => /Guardado de noche/.test(l)));
    await p.evaluate(() => agentSend('¿qué hora es?')); await settle(p);
    const last = await p.evaluate(() => S.ai.chat[S.ai.chat.length - 1].content);
    ok('1 «¿qué hora es?» se responde al instante con la hora de la tablet (sin IA)', bodies.length === n && /Son las \*\*22:1\d\*\*/.test(last), last);
    await p.evaluate(() => agentSend('¿Qué día es hoy?')); await settle(p);
    ok('1 «¿qué día es hoy?» → jueves 15 de octubre de 2026', /jueves 15 de octubre de 2026/.test(await p.evaluate(() => S.ai.chat[S.ai.chat.length - 1].content)) && bodies.length === n);
    await p.clock.runFor(4 * 3600e3); // 02:15 de madrugada
    const cb = await p.evaluate(() => mem.clockBlock());
    ok('1 De madrugada avisa a la IA que "esta noche/mañana" puede ser hoy', /madrugada/.test(cb) && /viernes 16 de octubre/.test(cb), cb);
    ok('1 Sin errores de JavaScript', !errs.length, errs);
    await ctx.close(); }

  /* 2. Intérpretes de fechas, días y horas en español */
  { const { p, ctx } = await open(b, '2026-10-15T09:00:00-05:00');
    const r = await p.evaluate(() => ({
      md: ['12 de marzo', '12 de marzo de 1999', '12/03', '12/03/1999', '1999-03-12', 'marzo 12', 'el 3 de Mayo', '29 de febrero', '29/02/2000', '5 de sept'].map(s => { const x = mem.md(s); return x && x.md + (x.year ? '/' + x.year : ''); }),
      bad: ['31/02', '30 de febrero', '29/02/1999', '12 de marzoo', '45/01', '', null, 'mañana'].map(s => mem.md(s)),
      days: ['lunes a viernes', 'martes y jueves', 'fines de semana', 'todos los días', 'entre semana', 'L M X', 'lun, mié, vie', 'de viernes a lunes', 'sábados', [1, 3], 'nunca'].map(s => (mem.days(s) || []).join('')),
      range: ['7-9', 'de 6 a 8 pm', '18:00 a 20:00', 'de 11 a 1 pm', '7am'].map(s => { const x = mem.range(s); return x ? x.start + '-' + (x.end || '') : null; }),
      next: [mem.next('10-15'), mem.next('10-14'), mem.next('02-29'), mem.next('01-02')],
      full: [mem.fullDate('12 de marzo'), mem.fullDate('mañana'), mem.fullDate('20/12/2026'), mem.fullDate('xx')]
    }));
    ok('2 Cumpleaños en todas las formas (con y sin año)', r.md.join(',') === '03-12,03-12/1999,03-12,03-12/1999,03-12/1999,03-12,05-03,02-29,02-29/2000,09-05', r.md);
    ok('2 Fechas imposibles se rechazan (31/02, 29/02 de año no bisiesto…)', r.bad.every(x => x === null), r.bad);
    ok('2 Días: «lunes a viernes», «martes y jueves», «fines de semana», rangos que cruzan el domingo…', r.days.join(',') === '12345,24,06,0123456,12345,123,135,0156,6,13,', r.days);
    ok('2 Horas: rangos y «pm» («de 11 a 1 pm» = 11:00-13:00)', r.range.join(',') === '07:00-09:00,18:00-20:00,18:00-20:00,11:00-13:00,07:00-', r.range);
    ok('2 Próxima fecha: hoy cuenta, ayer pasa al año siguiente, 29-feb → 28-feb en año no bisiesto', r.next.join(',') === '2026-10-15,2027-10-14,2027-02-28,2027-01-02', r.next);
    ok('2 Fecha completa desde texto', r.full.join(',') === '2027-03-12,2026-10-16,2026-12-20,', r.full);
    await ctx.close(); }

  /* 3. Personas y cumpleaños */
  { const { p, ctx, errs } = await open(b, '2026-10-15T09:00:00-05:00');
    const r = await p.evaluate(() => {
      const out = {};
      out.a = runTool('persona', { personas: [{ nombre: 'Juan Pérez', alias: ['Juancho'], relacion: 'mejor amigo', cumpleanos: '17 de octubre de 1998', notas: ['Le gusta el fútbol'] }] }).result;
      out.b = runTool('persona', { personas: [{ nombre: 'juancho', notas: ['Estudia medicina', 'le gusta el futbol'] }] }).result;
      out.c = runTool('persona', { personas: [{ nombre: 'Juan', relacion: 'mejor amigo del colegio' }] }).result;
      runTool('persona', { personas: [{ nombre: 'Ana', relacion: 'hermana', cumpleanos: '29/02/2004' }, { nombre: 'Mamá', cumpleanos: '2 de enero' }] });
      const M = S.mind; out.np = M.people.length; const j = M.people.find(x => x.name === 'Juan Pérez');
      out.notes = j.notes.map(n => n.text); out.rel = j.rel; out.aliases = j.aliases;
      out.bd = M.dates.filter(d => d.kind === 'cumple').map(d => d.title + ' ' + d.md + ' ' + (d.year || ''));
      out.up = mem.upcoming(90).map(x => x.txt);
      out.bad = runTool('persona', { personas: [{ nombre: 'Luis', cumpleanos: '31 de febrero' }] }).result;
      out.luis = !!mem.find('Luis') && !S.mind.dates.some(d => /Luis/.test(d.title));
      out.search = mem.search({ texto: 'medicina' });
      return out;
    });
    ok('3 Persona nueva con apodo, relación, cumpleaños y nota', /Nueva: \[p\w+\] Juan Pérez/.test(r.a), r.a);
    ok('3 Por apodo o por nombre de pila NO se duplica: se completa', r.np === 3 + 1 - 1 && /Actualizada/.test(r.b) && /Actualizada/.test(r.c), r);
    ok('3 Las notas se acumulan sin repetir (ni con tildes distintas)', r.notes.join('|') === 'Le gusta el fútbol|Estudia medicina', r.notes);
    ok('3 La relación se actualiza', r.rel === 'mejor amigo del colegio' && r.aliases.includes('Juancho'), r);
    ok('3 Cada cumpleaños crea su fecha anual', r.bd.length === 3 && r.bd.includes('Cumpleaños de Juan Pérez 10-17 1998'), r.bd);
    ok('3 Próximos cumpleaños con edad: Juan cumple 28 en 2 días; Mamá el 2 ene', r.up[0] === 'Cumpleaños de Juan Pérez · 17 oct (cumple 28) · en 2 días' && r.up.some(t => /Mamá · 2 ene · en 79 días/.test(t)), r.up);
    ok('3 Un cumpleaños imposible no se guarda y la IA recibe el problema (la persona sí)', /PROBLEMAS: .*cumpleaños no entendido/.test(r.bad) && r.luis, r.bad);
    ok('3 buscar_memoria encuentra por las notas', /Juan Pérez.*Estudia medicina/.test(r.search), r.search);
    let n0 = await p.evaluate(() => S.ai.chat.length);
    await p.evaluate(() => agentSend('¿Cuándo cumple Juancho?')); await p.clock.runFor(500);
    const t1 = await p.evaluate(() => S.ai.chat[S.ai.chat.length - 1].content);
    ok('3 «¿Cuándo cumple Juancho?» (por apodo, sin IA) → 17 de octubre, cumple 28', /Juan Pérez.*17 de octubre.*en 2 días.*cumple \*\*28/.test(t1), t1);
    await p.evaluate(() => agentSend('próximos cumpleaños')); await p.clock.runFor(500);
    ok('3 «próximos cumpleaños» lista las fechas', /Próximas fechas[\s\S]*Juan Pérez[\s\S]*Mamá[\s\S]*Ana/.test(await p.evaluate(() => S.ai.chat[S.ai.chat.length - 1].content)));
    await p.evaluate(() => agentSend('¿cuándo es el cumpleaños de Pedro?')); await p.clock.runFor(500);
    ok('3 Si no conoce a la persona lo dice y pide el dato', /No tengo guardado a \*\*pedro/.test(await p.evaluate(() => S.ai.chat[S.ai.chat.length - 1].content)));
    ok('3 Sin errores', !errs.length, errs);
    await ctx.close(); }

  /* 4. Avisos de cumpleaños (09:00 el día y el día antes), también al cruzar de año */
  { const { p, ctx } = await open(b, '2026-12-30T10:00:00-05:00');
    const r = await p.evaluate(async () => {
      runTool('persona', { personas: [{ nombre: 'Mamá', cumpleanos: '2 de enero de 1970' }, { nombre: 'Tío Carlos', cumpleanos: '30/12' }] });
      runTool('fecha_importante', { fechas: [{ titulo: 'Examen final', fecha: '8/01/2027', anual: false, tipo: 'evento', avisar_dias_antes: [0, 3] }] });
      await mem.planned; await new Promise(r => setTimeout(r, 10));
      return mem.planned().map(x => new Date(x.at).toISOString().slice(0, 16) + ' ' + x.body);
    });
    ok('4 Mamá: aviso el 1 ene y el 2 ene a las 09:00 (cruza de año) con la edad', r.includes('2027-01-01T14:00 Mañana: Cumpleaños de Mamá') && r.includes('2027-01-02T14:00 Hoy: Cumpleaños de Mamá (cumple 57)'), r);
    ok('4 El aviso de hoy a las 09:00 que ya pasó no se programa', !r.some(t => /Tío Carlos/.test(t) && t.startsWith('2026-12-30')), r);
    ok('4 Evento de una vez con aviso 3 días antes', r.includes('2027-01-05T14:00 En 3 días: Examen final') && r.includes('2027-01-08T14:00 Hoy: Examen final'), r);
    await p.clock.runFor(1000);
    const ids = await p.evaluate(() => Object.keys(window.__n).map(Number).filter(i => i >= 3000));
    ok('4 Se programan como notificaciones (ids 3000+, sin chocar con la agenda)', ids.length === r.length && ids.every(i => i < 3060), ids);
    await ctx.close(); }

  /* 5. Horarios a lo largo del tiempo: versiones, vigencia, excepciones, cada 2 semanas */
  { const { p, ctx, errs } = await open(b, '2026-10-15T09:00:00-05:00');
    const r = await p.evaluate(() => {
      const out = {};
      out.c = runTool('horario', { accion: 'crear', horarios: [{ titulo: 'Clase de inglés', dias: 'lunes y miércoles', hora_inicio: '18:00', hora_fin: '20:00', lugar: 'Instituto', desde: '2026-09-01', hasta: '2026-12-15' }, { titulo: 'Trabajo', dias: 'lunes a viernes', hora_inicio: '8', hora_fin: '4 pm', desde: '2026-08-01' }] }).result;
      const ing = S.mind.routines.find(x => x.title === 'Clase de inglés'), tr = S.mind.routines.find(x => x.title === 'Trabajo');
      out.dup = runTool('horario', { accion: 'crear', horarios: [{ titulo: 'clase de ingles', dias: 'lunes y miércoles', hora_inicio: '18:00' }] }).result;
      out.n1 = S.mind.routines.length;
      out.tr = tr.start + '-' + tr.end;
      out.ch = runTool('horario', { accion: 'cambiar', horarios: [{ id: tr.id, hora_inicio: '07:00', hora_fin: '15:00', desde: '2026-11-02' }] }).result;
      out.n2 = S.mind.routines.length;
      out.old = S.mind.routines.find(x => x.id === tr.id).until;
      const at = (d) => mem.routinesOn(d).map(x => x.title + ' ' + x.start).join(' | ');
      out.oct = at('2026-10-19'); out.nov = at('2026-11-02'); out.dic = at('2026-12-21'); out.sab = at('2026-10-17');
      out.past = mem.search({ tipo: 'horarios', fecha: '2026-10-20' }); out.fut = mem.search({ tipo: 'horarios', fecha: '2026-11-10' });
      out.ex = runTool('horario', { accion: 'excepcion', horarios: [{ id: ing.id, fecha: '2026-10-19' }] }).result;
      out.oct2 = at('2026-10-19');
      runTool('horario', { accion: 'crear', horarios: [{ titulo: 'Fútbol', dias: 'sábado', hora_inicio: '10:00', cada_semanas: 2, desde: '2026-10-17' }] });
      out.alt = ['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07'].map(d => mem.routinesOn(d).some(x => x.title === 'Fútbol') ? 1 : 0).join('');
      const fut = S.mind.routines.find(x => x.title === 'Fútbol');
      out.end = runTool('horario', { accion: 'terminar', horarios: [{ id: fut.id, fecha: '2026-10-31' }] }).result;
      out.alt2 = ['2026-10-17', '2026-10-31', '2026-11-14'].map(d => mem.routinesOn(d).some(x => x.title === 'Fútbol') ? 1 : 0).join('');
      out.bad = runTool('horario', { accion: 'crear', horarios: [{ titulo: 'X', dias: 'cuando pueda' }] }).result;
      out.block = mem.block();
      return out;
    });
    ok('5 Horarios con días, horas («8» a «4 pm»), lugar y vigencia', /Clase de inglés: lun, mié 18:00-20:00 en Instituto · desde 2026-09-01 · hasta 2026-12-15/.test(r.c) && r.tr === '08:00-16:00', r.c);
    ok('5 El mismo horario dicho otra vez no se duplica', r.n1 === 2, r.dup);
    ok('5 Cambiar desde el 2 nov: la versión anterior se cierra el 1 nov y queda en el historial', r.n2 === 3 && r.old === '2026-11-01' && /queda en el historial hasta 2026-11-01/.test(r.ch), r.ch);
    ok('5 Octubre usa el horario viejo, noviembre el nuevo; en diciembre ya no hay inglés', r.oct === 'Trabajo 08:00 | Clase de inglés 18:00' && r.nov === 'Trabajo 07:00 | Clase de inglés 18:00' && r.dic === 'Trabajo 07:00' && r.sab === '', r);
    ok('5 buscar_memoria con fecha: «¿qué horario tenía el 20 oct?» vs «el 10 nov»', /Vigente el 2026-10-20[\s\S]*Trabajo: lunes a viernes 08:00-16:00/.test(r.past) && /Trabajo: lunes a viernes 07:00-15:00/.test(r.fut) && !/07:00/.test(r.past), { past: r.past, fut: r.fut });
    ok('5 Excepción: el 19 oct no hay inglés (el resto de lunes sí)', r.oct2 === 'Trabajo 08:00', r.oct2);
    ok('5 Cada 2 semanas: sí, no, sí, no', r.alt === '1010', r.alt);
    ok('5 Terminar: después de su último día ya no aparece', r.alt2 === '110', r.alt2);
    ok('5 Días que no se entienden → no se guarda y la IA lo sabe', /NO guardado: días no entendidos/.test(r.bad), r.bad);
    ok('5 La IA ve los horarios de hoy, mañana y los vigentes', /HORARIOS FIJOS HOY: \[r\w+\] 08:00-16:00 Trabajo/.test(r.block) && /HORARIOS FIJOS MAÑANA: \[r\w+\] 08:00-16:00 Trabajo/.test(r.block) && /TODOS SUS HORARIOS VIGENTES/.test(r.block), r.block.slice(0, 500));
    // En la agenda: horario fijo del día (sin «Agendar»)
    const ag = await p.evaluate(() => { tab = 'hoy'; homeView = 'dia'; agSel = '2026-10-19'; route(); return [...document.querySelectorAll('.agi.virt')].map(e => e.textContent.replace(/\s+/g, ' ').trim() + (e.querySelector('[data-a="agvirt"]') ? ' [AGENDAR]' : '')); });
    ok('5 La agenda del lunes muestra el trabajo como horario fijo (con «Ver», no «Agendar»)', ag.some(t => /08:00.*Trabajo.*hasta las 16:00.*Horario fijo.*Ver/.test(t) && !/AGENDAR/.test(t)), ag);
    await p.evaluate(() => agentSend('¿qué horario tengo mañana?')); await p.clock.runFor(500);
    ok('5 «¿qué horario tengo mañana?» sin IA', /\*\*Mañana:\*\* 08:00-16:00 Trabajo/.test(await p.evaluate(() => S.ai.chat[S.ai.chat.length - 1].content)));
    ok('5 Sin errores', !errs.length, errs);
    await ctx.close(); }

  /* 6. Hechos: versiones, vigencia, duplicados, privacidad */
  { const { p, ctx } = await open(b, '2026-10-15T09:00:00-05:00');
    const r = await p.evaluate(() => {
      const out = {};
      runTool('recordar', { hechos: [{ texto: 'Trabaja en una panadería', categoria: 'trabajo' }, { texto: 'Estoy de vacaciones', categoria: 'otro', hasta: '2026-10-20' }, { texto: 'De noche en la cama con el celular es mi momento difícil', categoria: 'riesgo' }] });
      out.dup = runTool('recordar', { hechos: [{ texto: 'trabaja en una PANADERIA', categoria: 'trabajo' }] }).result;
      const f = S.mind.mem.find(m => /panader/.test(m.text));
      out.rep = runTool('recordar', { hechos: [{ texto: 'Trabaja en un supermercado', categoria: 'trabajo', reemplaza: f.id }] }).result;
      out.hist = f.hist.map(h => h.text); out.text = f.text; out.n = S.mind.mem.length;
      out.b1 = mem.block();
      S.ai.shareP = false; out.b2 = mem.block(); out.s2 = mem.search({ texto: 'celular' }); S.ai.shareP = true;
      return out;
    });
    ok('6 El mismo hecho con otras mayúsculas/tildes no se duplica', /Recordado \(0\)/.test(r.dup), r.dup);
    ok('6 Un hecho que cambia guarda la versión anterior', r.text === 'Trabaja en un supermercado' && r.hist[0] === 'Trabaja en una panadería' && r.n === 3 && /Versión anterior/.test(r.rep), r);
    ok('6 La IA ve la versión actual y la anterior', /Trabaja en un supermercado \(antes: "Trabaja en una panadería"\)/.test(r.b1));
    ok('6 Hecho temporal visible con su «hasta»', /hasta 2026-10-20\) Estoy de vacaciones/.test(r.b1));
    await p.clock.runFor(7 * 864e5);
    const r2 = await p.evaluate(() => ({ b: mem.block(), s: mem.search({ texto: 'vacaciones' }) }));
    ok('6 Pasado su «hasta» sale del resumen pero sigue en la búsqueda', !/Estoy de vacaciones/.test(r2.b) && /Estoy de vacaciones/.test(r2.s), r2.s);
    ok('6 Privacidad: lo de riesgo no va a la IA si no compartes la Meta P', /momento difícil/.test(r.b1) && !/momento difícil/.test(r.b2) && !/momento difícil/.test(r.s2));
    await ctx.close(); }

  /* 7. Resumen acotado y por relevancia con mucha memoria */
  { const { p, ctx } = await open(b, '2026-10-15T09:00:00-05:00');
    const r = await p.evaluate(() => {
      commit(() => {
        for (let i = 0; i < 390; i++) S.mind.mem.push({ id: 'm' + i, t: new Date().toISOString(), cat: 'otro', text: `Dato número ${i} sin importancia especial para hoy` });
        S.mind.mem.splice(5, 0, { id: 'mx', t: new Date().toISOString(), cat: 'salud', text: 'Es alérgico a los mariscos' });
        for (let i = 0; i < 280; i++) S.mind.people.push({ id: 'p' + i, name: `Persona ${i}`, aliases: [], rel: 'compañero', notes: [], t: new Date().toISOString() });
        S.mind.people.push({ id: 'pz', name: 'Valentina', aliases: [], rel: 'novia', notes: [], t: '2020-01-01T00:00:00Z' });
      });
      S.ai.chat.push({ role: 'user', content: '¿puedo comer mariscos en la cena con Valentina?', t: Date.now() });
      const bl = mem.block(); return { len: bl.length, maris: /alérgico a los mariscos/.test(bl), vale: /Valentina, novia/.test(bl), more: /hechos más: buscar_memoria/.test(bl) && /personas más/.test(bl) };
    });
    ok('7 Con 400 hechos y 280 personas el resumen se mantiene acotado (≤ 9 000 caracteres)', r.len <= 9100, r.len);
    ok('7 Lo que mencionas en tu último mensaje entra aunque sea antiguo (alergia, Valentina)', r.maris && r.vale, r);
    ok('7 Indica a la IA que hay más y cómo buscarlo', r.more);
    const cap = await p.evaluate(() => { runTool('recordar', { hechos: [{ texto: 'uno más', categoria: 'otro' }] }); return S.mind.mem.length <= 400; });
    ok('7 Límite de 400 hechos respetado', cap);
    await ctx.close(); }

  /* 8. Robustez: migración, copia antigua, entradas rotas, almacenamiento lleno */
  { const { p, ctx, errs } = await open(b, '2026-10-15T09:00:00-05:00');
    const r = await p.evaluate(() => {
      const out = {};
      const d = JSON.parse(JSON.stringify(S));
      d.mind = { mem: [{ text: 'Sin id ni fecha' }, null, { id: 'a1', t: 'basura', cat: 'rara', text: 'Categoría rara' }, { id: 'a2', cat: 'comida', text: 'Duplicado' }, { id: 'a3', cat: 'comida', text: 'duplicado' }, { id: 'a4', text: '' }], days: {} };
      importBackup(JSON.stringify(d), true);
      out.mem = S.mind.mem.map(m => `${m.cat}:${m.text}:${!!m.id}:${!isNaN(Date.parse(m.t))}`);
      out.arrays = ['people', 'dates', 'routines'].every(f => Array.isArray(S.mind[f]));
      out.bad = ['persona', 'fecha_importante', 'horario', 'recordar', 'olvidar', 'buscar_memoria'].map(n => { try { return runTool(n, n === 'persona' ? { personas: 'Juan' } : n === 'horario' ? { accion: 'cambiar', horarios: [{ id: 'nope' }] } : { hechos: [{}], fechas: [null], ids: null, fecha: 'jamás' }).result; } catch (e) { return 'THROW ' + e.message; } });
      runTool('persona', { personas: [{ nombre: 'Rosa', cumpleanos: '1/1' }] });
      const before = JSON.stringify(S.mind);
      const set = localStorage.setItem.bind(localStorage); localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
      out.full = runTool('persona', { personas: [{ nombre: 'Pedro', cumpleanos: '3/3' }] }).result;
      localStorage.setItem = set; document.querySelectorAll('.errbox').forEach(x => x.remove());
      out.rolled = JSON.stringify(S.mind) === before;
      const rosa = S.mind.people.find(x => x.name === 'Rosa');
      out.forget = runTool('olvidar', { ids: [rosa.id] }).result; out.rosaDate = S.mind.dates.some(x => /Rosa/.test(x.title));
      return out;
    });
    ok('8 Copia antigua: la memoria se repara (ids, fechas, categorías, duplicados, vacíos)', r.mem.length === 3 && r.mem.every(x => /:true:true$/.test(x)) && r.mem.some(x => x.startsWith('otro:Categoría rara')) && r.arrays, r.mem);
    ok('8 Entradas rotas de la IA nunca rompen la app', r.bad.every(x => !/THROW|ERROR interno/.test(x)), r.bad);
    ok('8 Almacenamiento lleno: no se guarda nada a medias (se revierte) y la IA lo sabe', /ERROR/.test(r.full) && r.rolled, r.full);
    ok('8 Olvidar a una persona borra también su cumpleaños', /Olvidados 1/.test(r.forget) && !r.rosaDate, r.forget);
    ok('8 Sin errores', !errs.length, errs);
    await ctx.close(); }

  /* 9. La IA usa las herramientas: guarda persona, fecha y horario en un turno; tarjeta con «olvidar» */
  { const { p, ctx, errs, bodies } = await open(b, '2026-10-15T20:00:00-05:00', { ai: (body, n) => n === 1 ? { stop_reason: 'tool_use', content: [{ type: 'text', text: '¡Anotado!' }, TU('persona', { personas: [{ nombre: 'Camila', relacion: 'amiga de la U', cumpleanos: '20 de octubre' }] }), TU('horario', { accion: 'crear', horarios: [{ titulo: 'Cálculo', dias: 'martes y jueves', hora_inicio: '07:00', hora_fin: '09:00', recordar: true }] })] } : { content: [{ type: 'text', text: 'Listo.' }] } });
    await p.evaluate(() => agentSend('Mi amiga Camila de la U cumple el 20 de octubre, y tengo cálculo martes y jueves de 7 a 9')); await settle(p);
    const r = await p.evaluate(() => ({ people: S.mind.people.map(x => x.name), r: S.mind.routines.map(x => x.title + ' ' + x.days.join('')), cards: [...document.querySelectorAll('.acard')].map(e => e.textContent.replace(/\s+/g, ' ')).join(' || '), tools: TOOLS2.map(t => t.name) }));
    ok('9 Las herramientas nuevas están disponibles para la IA', ['persona', 'fecha_importante', 'horario', 'buscar_memoria', 'recordar', 'olvidar'].every(t => r.tools.includes(t)), r.tools);
    ok('9 Un solo mensaje guarda la persona, su cumpleaños y el horario', r.people.includes('Camila') && r.r.includes('Cálculo 24'), r);
    ok('9 La conversación muestra qué quedó en la memoria', /En tu memoria.*Camila · amiga de la U · 🎂 20 oct · en 5 días.*Cálculo: mar, jue 07:00-09:00/.test(r.cards), r.cards);
    await p.clock.runFor(1500);
    const nt = await p.evaluate(() => Object.values(window.__n).filter(x => /Cálculo/.test(x.body)).map(x => new Date(x.at).toString().slice(0, 21)));
    ok('9 Horario con «recordar»: aviso antes de cada clase (mar/jue 06:50)', nt.length >= 2 && nt.every(x => /(Tue|Thu) .* 06:50/.test(x)), nt);
    await p.click('[data-a="forget2"]'); await p.clock.runFor(300);
    ok('9 «olvidar» desde la tarjeta', await p.evaluate(() => !S.mind.people.some(x => x.name === 'Camila') && !S.mind.dates.some(d => /Camila/.test(d.title))));
    ok('9 buscar_memoria es de consulta (la IA recibe el resultado)', await p.evaluate(() => QUERY_TOOLS.includes('buscar_memoria')));
    ok('9 Sin errores', !errs.length, errs);
    await ctx.close(); }

  /* 10. Cumpleaños de hoy: saludo que felicita (una vez) y aparece en la agenda */
  { const { p, ctx, errs } = await open(b, '2026-10-17T08:30:00-05:00');
    await p.evaluate(() => { runTool('persona', { personas: [{ nombre: 'Juan', cumpleanos: '17/10/1998' }] }); tab = 'hoy'; route(); });
    await p.clock.runFor(500); await p.evaluate(() => { tab = 'hoy'; route(); route(); });
    const r = await p.evaluate(() => ({ msgs: S.ai.chat.filter(m => /Hoy es .*cumpleaños de Juan/.test(m.content)).length, text: (S.ai.chat.find(m => /cumpleaños de Juan/.test(m.content)) || {}).content, row: [...document.querySelectorAll('.agi.virt')].map(e => e.textContent.replace(/\s+/g, ' ')).join('|') }));
    ok('10 Felicita a tiempo: «Hoy es el cumpleaños de Juan (cumple 28)» una sola vez', r.msgs === 1 && /cumple 28/.test(r.text), r);
    ok('10 En la agenda de hoy aparece el cumpleaños', /🎂 Cumpleaños de Juan \(cumple 28\).*Fecha importante/.test(r.row), r.row);
    const lb = await p.evaluate(() => localBriefText(today()));
    ok('10 El saludo sin IA también lo menciona', /🎂 Hoy: \*\*Cumpleaños de Juan\*\* \(cumple 28\)/.test(lb), lb);
    ok('10 Sin errores', !errs.length, errs);
    await ctx.close(); }

  /* 11. Pantalla Memoria: pestañas, búsqueda, añadir y editar a mano, sin desbordes */
  { const { p, ctx, errs } = await open(b, '2026-10-15T09:00:00-05:00');
    await p.evaluate(() => { runTool('persona', { personas: [{ nombre: 'Juan Pérez', relacion: 'mejor amigo', cumpleanos: '17/10/1998', notas: ['Le gusta el fútbol'] }] }); runTool('horario', { accion: 'crear', horarios: [{ titulo: 'Trabajo', dias: 'lunes a viernes', hora_inicio: '08:00', hora_fin: '16:00', desde: '2026-09-01' }] }); runTool('recordar', { hechos: [{ texto: 'Alérgico al maní', categoria: 'salud' }] }); tab = 'memoria'; route(); });
    for (const vp of [{ width: 1152, height: 720 }, { width: 720, height: 1152 }]) {
      await p.setViewportSize(vp);
      for (const t of ['personas', 'fechas', 'horarios', 'hechos']) { const s = await p.evaluate((t) => { memTab = t; tab = 'memoria'; route(); return { over: document.documentElement.scrollWidth > innerWidth + 1, alert: !!document.querySelector('#main .card.alert'), txt: document.querySelector('#membody').textContent.replace(/\s+/g, ' ').slice(0, 160) }; }, t); ok(`11 ${t} sin desbordamiento (${vp.width}px)`, !s.over && !s.alert && s.txt.length > 10, s); }
    }
    await p.setViewportSize({ width: 1152, height: 720 });
    await p.evaluate(() => { memTab = 'personas'; route(); });
    ok('11 Personas: tarjeta con cumpleaños y edad', /Juan Pérez.*mejor amigo.*🎂 17 oct · cumple 28 · en 2 días.*Le gusta el fútbol/.test(await p.textContent('#membody')));
    await p.fill('#memq', 'futbol'); await p.clock.runFor(100);
    ok('11 La búsqueda ignora tildes', /Juan Pérez/.test(await p.textContent('#membody')));
    await p.fill('#memq', 'zzz'); await p.clock.runFor(100);
    ok('11 Sin coincidencias lo dice', /Nada coincide/.test(await p.textContent('#membody')));
    await p.fill('#memq', ''); await p.clock.runFor(100);
    await p.click('[data-a="mpadd"]');
    await p.fill('.sheet [data-k="name"]', 'Laura'); await p.fill('.sheet [data-k="rel"]', 'prima'); await p.fill('.sheet [data-k="bday"]', '31/02');
    await p.click('.sheet [data-save]'); await p.clock.runFor(200);
    ok('11 Cumpleaños imposible en el formulario → mensaje claro, no guarda', /Cumpleaños no válido/.test(await p.textContent('.sheet .formerr')) && await p.evaluate(() => !S.mind.people.some(x => x.name === 'Laura')));
    await p.fill('.sheet [data-k="bday"]', '5 de noviembre'); await p.click('.sheet [data-save]'); await p.clock.runFor(300);
    ok('11 Añadir persona a mano con su cumpleaños', await p.evaluate(() => S.mind.people.some(x => x.name === 'Laura') && S.mind.dates.some(d => d.title === 'Cumpleaños de Laura' && d.md === '11-05')));
    await p.evaluate(() => { memTab = 'horarios'; route(); });
    ok('11 Horarios: la semana muestra el trabajo de lunes a viernes', await p.evaluate(() => document.querySelectorAll('.memtt .memblk').length === 5));
    await p.click('.logitem[data-a="mredit"]');
    await p.fill('.sheet [data-k="start"]', '07:00'); await p.fill('.sheet [data-k="apply"]', '2026-11-02');
    await p.click('.sheet [data-save]'); await p.clock.runFor(300);
    const h = await p.evaluate(() => ({ n: S.mind.routines.length, v: mem.routinesOn('2026-11-03').map(x => x.start).join(), o: mem.routinesOn('2026-10-20').map(x => x.start).join(), hist: !!document.querySelector('.memhist') }));
    ok('11 Editar un horario «desde el 2 nov» crea versión nueva y conserva la anterior', h.n === 2 && h.v === '07:00' && h.o === '08:00', h);
    await p.evaluate(() => { memTab = 'fechas'; route(); });
    ok('11 Fechas ordenadas por cercanía', /Juan Pérez[\s\S]*Laura/.test(await p.textContent('#membody')));
    await p.evaluate(() => { tab = 'mas'; route(); });
    ok('11 Más muestra el recuento de la memoria', /2 personas · 2 fechas · 2 horarios · 1 datos/.test(await p.textContent('#main')), await p.textContent('#main').then(t => t.slice(0, 0)));
    ok('11 Sin errores', !errs.length, errs);
    await ctx.close(); }

  await b.close();
  const f = res.filter(x => !x).length;
  console.log(`\n${res.length - f}/${res.length}`);
  if (f) process.exitCode = 1;
})();
