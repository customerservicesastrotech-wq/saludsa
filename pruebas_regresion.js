// Pruebas de regresión de los hallazgos del informe (v1.1 → v1.2)
const { chromium } = require(process.env.NODE_PATH_PW || 'playwright');
const URL = (process.env.PLAN20_URL || 'http://localhost:8765/index.html');
const results = [];
const ok = (name, cond, info = '') => { results.push({ name, pass: !!cond, info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info ? ' — ' + info : '')); };

const CAP_MOCK = `window.Capacitor = { isNativePlatform: () => false, Plugins: { App: { L: {}, addListener(ev, cb) { (this.L[ev] = this.L[ev] || []).push(cb); }, minimizeApp() { window.__min = (window.__min || 0) + 1; } } } };
window.__bg = () => window.Capacitor.Plugins.App.L.appStateChange.forEach(f => f({ isActive: false }));
window.__fg = () => window.Capacitor.Plugins.App.L.appStateChange.forEach(f => f({ isActive: true }));`;

async function fresh(b, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(CAP_MOCK);
  if (opts.clock) await p.clock.install({ time: opts.clock });
  await p.goto(URL + (opts.date ? '?date=' + opts.date : '') + (opts.hour != null ? (opts.date ? '&' : '?') + 'hour=' + opts.hour : ''));
  await p.click('#ack');
  const pin = async () => { for (const n of '1234') await p.click(`.pad button[data-n="${n}"]`); await p.click('.pad button[data-ok]'); };
  await pin(); await pin();
  await p.waitForTimeout(150);
  await p.evaluate(() => { mindDay(today()).flags.brief = 'test'; save(); });
  return { p, ctx, errs };
}
const unlock = async (p) => { for (const n of '1234') await p.click(`.lock .pad button[data-n="${n}"]`); await p.waitForTimeout(150); };
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('plan20.v1')));

(async () => {
  const b = await chromium.launch();

  /* 1. Almacenamiento lleno: no debe confirmar un guardado fallido */
  { const { p, ctx } = await fresh(b, { date: '2026-10-01' });
    await p.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'plan20.v1') throw new DOMException('QuotaExceededError'); return o.call(this, k, v); }; });
    await p.evaluate(() => { tab = 'registrar'; route(); }); await p.click('[data-a="log"][data-x="aero"]');
    await p.click('button[data-seg="status"][data-v="done"]'); await p.fill('input[data-k="min"]', '20'); await p.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); await p.click('[data-save]'); await p.waitForTimeout(200);
    const r = await p.evaluate(() => ({ err: !!document.querySelector('.errbox'), toast: (document.querySelector('.toast') || {}).textContent || '', sheet: !!document.querySelector('.sheet'), mem: S.logs.length, val: document.querySelector('input[data-k="min"]') && document.querySelector('input[data-k="min"]').value }));
    ok('1 Guardado fallido muestra error y no “Guardado”', r.err && !/Guardado/.test(r.toast), JSON.stringify(r));
    ok('1 Formulario conserva respuestas y memoria revertida', r.sheet && r.val === '20' && r.mem === 0);
    await ctx.close(); }

  /* 2. Formulario pendiente al ir a segundo plano y cierre del proceso */
  { const { p, ctx } = await fresh(b, { date: '2026-10-01' });
    await p.evaluate(() => { tab = 'registrar'; route(); }); await p.click('[data-a="log"][data-x="aero"]');
    await p.click('button[data-seg="status"][data-v="done"]'); await p.fill('input[data-k="min"]', '27');
    await p.evaluate(() => window.__bg()); await p.waitForTimeout(100);
    const r1 = await p.evaluate(() => ({ lock: !!document.querySelector('.lock'), sheet: !!document.querySelector('.sheet') }));
    await unlock(p);
    const r2 = await p.evaluate(() => ({ sheet: !!document.querySelector('.sheet'), val: (document.querySelector('input[data-k="min"]') || {}).value }));
    ok('2 Al ir a 2º plano se bloquea sin cerrar el formulario', r1.lock && r1.sheet && r2.sheet && r2.val === '27', JSON.stringify([r1, r2]));
    await p.reload(); await unlock(p);
    const hasOffer = await p.evaluate(() => (document.querySelector('.errbox') || {}).textContent || '');
    await p.click('.errbox [data-go]'); await p.waitForTimeout(150);
    const r3 = await p.evaluate(() => ({ val: (document.querySelector('input[data-k="min"]') || {}).value, logs: JSON.parse(localStorage.getItem('plan20.v1')).logs.length }));
    ok('2 Tras cerrar la app se ofrece continuar el borrador (no cuenta como registro)', /sin terminar/.test(hasOffer) && r3.val === '27' && r3.logs === 0, JSON.stringify(r3));
    await ctx.close(); }

  /* 3. Temporizadores: continúan y se restauran tras cerrar el proceso */
  { const { p, ctx } = await fresh(b, { clock: new Date('2026-10-01T10:00:00-05:00') });
    await p.evaluate(() => { tab = 'registrar'; route(); }); await p.click('[data-a="timer"]'); await p.waitForTimeout(100);
    await p.clock.fastForward('02:30'); // 2:30 → debe estar en el tramo 2
    await p.evaluate(() => window.__bg());
    await p.reload(); await p.clock.fastForward('03:00'); await unlock(p); await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ proto: !!document.querySelector('.proto'), h: (document.querySelector('.proto h2') || {}).textContent, t: (document.querySelector('#st') || {}).textContent }));
    ok('3 Bloque de estudio se restaura en el tramo correcto tras reinicio', r.proto && r.h === 'Resuelve sin mirar', JSON.stringify(r));
    await p.click('.proto [data-x]');
    await p.click('.rail button[data-tab="hoy"]'); await p.click('[data-a="proto"]'); await p.click('.proto [data-next]'); await p.click('.proto [data-next]'); await p.click('.proto [data-next]'); await p.click('.proto [data-alt]');
    await p.clock.fastForward('04:00'); await p.reload(); await unlock(p); await p.waitForTimeout(300);
    const r2 = await p.evaluate(() => ({ proto: !!document.querySelector('.proto'), h: (document.querySelector('.proto h2') || {}).textContent, t: (document.querySelector('#at') || {}).textContent }));
    ok('3 Alternativa de 10 min se restaura con el tiempo restante real', r2.proto && /Alternativa/.test(r2.h) && /^[56]:\d\d$/.test(r2.t), JSON.stringify(r2));
    await ctx.close(); }

  /* 4. Cambio de día con la app abierta */
  { const { p, ctx } = await fresh(b, { clock: new Date('2026-09-23T23:59:00-05:00') });
    const d1 = await p.evaluate(() => document.querySelector('.htop .kicker').textContent);
    await p.clock.fastForward('02:00'); await p.waitForTimeout(100); await p.clock.fastForward('00:31'); await p.waitForTimeout(200);
    const d2 = await p.evaluate(() => document.querySelector('.htop .kicker').textContent);
    ok('4 La pantalla Hoy cambia de día tras medianoche', /23 SEP/i.test(d1) && /24 SEP/i.test(d2), d1 + ' → ' + d2);
    await ctx.close(); }

  /* 5. Mantenimiento: semanas > 20 visibles y sumadas */
  { const { p, ctx } = await fresh(b, { date: '2027-05-10' });
    await p.evaluate(() => { const S0 = JSON.parse(localStorage.getItem('plan20.v1')); let d = new Date(2026, 8, 23), i = 0; const k = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; while (k(d) <= '2027-05-10') { S0.logs.push({ id: 'l' + i, type: 'aero', date: k(d), status: 'done', data: { min: 10, mod: 5 }, ts: i }); S0.logs.push({ id: 'm' + i, type: 'comida', date: k(d), status: 'done', data: {}, ts: i }); S0.logs.push({ id: 'n' + i, type: 'sueno', date: k(d), status: 'done', data: { horas: 7 }, ts: i }); d.setDate(d.getDate() + 1); i++; } localStorage.setItem('plan20.v1', JSON.stringify(S0)); });
    await p.reload(); await unlock(p);
    const r = await p.evaluate(() => { const w = cal().weekOf(today()); const st = weekStats(25); const exp = S.logs.filter(l => l.type === 'aero' && l.date >= st.a && l.date <= st.b).length * 10; tab = 'progreso'; route(); const html = document.querySelector('#main').innerHTML; return { w, sum: st.minT, exp, hasS25: html.includes('>S25<') || html.includes('Semana 25'), total: S.logs.length }; });
    ok('5 Semanas de mantenimiento (21+) aparecen y suman exactamente', r.w > 20 && r.sum === r.exp && r.hasS25, JSON.stringify(r));
    await p.click('[data-a="prange"][data-x="all"]');
    const r2 = await p.evaluate(() => document.querySelector('#main').innerHTML.includes('>S1<'));
    ok('5 Vista “Todo el historial” incluye desde la semana 1', r2);
    await ctx.close(); }

  /* 6. Plan: “Mantener” conserva la carga; el cambio de fase no la sobrescribe */
  { const { p, ctx } = await fresh(b, { date: '2026-09-23' });
    await p.evaluate(() => { const wp = structuredClone(weekPlan(1)); Object.keys(wp.days).forEach(k => wp.days[k] = { walk: 0, str: false }); wp.days['2026-09-23'] = { walk: 10, str: false }; wp.walkMin = 10; setWeekPlan(1, wp); });
    const r = await p.evaluate(() => [2, 5, 9].map(n => { const w = weekPlan(n); return [Object.values(w.days).filter(d => d.walk).length, Object.values(w.days).filter(d => d.str).length, w.walkMin]; }));
    ok('6 1 caminata de 10 min sin fuerza se hereda en semanas 2, 5 y 9', r.every(x => x[0] === 1 && x[1] === 0 && x[2] === 10), JSON.stringify(r));
    await ctx.close(); }

  /* 7. Consejo de fuerza con mala recuperación */
  { const { p, ctx } = await fresh(b, { date: '2026-10-01' });
    const t = await p.evaluate(() => strengthAdvice({ tec: 'si', com: 'comodo', rec: 'mal', ex: [{ k: 'silla', sets: 1, reps: 12 }] }));
    ok('7 Con recuperación “Mal” no propone progresar', /no progreses/i.test(t) && !/añade/i.test(t), t.replace(/<[^>]+>/g, ''));
    await ctx.close(); }

  /* 8. Editar/borrar un episodio corrige el resumen */
  { const { p, ctx } = await fresh(b, { date: '2026-10-01' });
    await p.evaluate(() => { tab = 'registrar'; route(); }); await p.click('[data-a="log"][data-x="impulso"]');
    await p.click('button[data-seg="usado"][data-v="no"]'); await p.click('button[data-seg="res"][data-v="si"]'); await p.click('[data-save]'); await p.waitForTimeout(150);
    const a1 = await p.evaluate(() => S.days[today()].p.res);
    const id = await p.evaluate(() => S.logs.find(l => l.type === 'impulso').id);
    await p.evaluate((id) => openLogById(id), id); await p.click('[data-del]'); await p.click('[data-del]'); await p.waitForTimeout(150);
    const a2 = await p.evaluate(() => ({ res: (S.days[today()].p || {}).res, stats: weekStats(cal().weekOf(today())).pc.yes }));
    ok('8 Borrar el episodio actualiza día, resumen semanal y calendario', a1 === 'yes' && a2.res === undefined && a2.stats === 0, JSON.stringify([a1, a2]));
    await ctx.close(); }

  /* 9. Intensidad desconocida no aparece como ligera */
  { const { p, ctx } = await fresh(b, { date: '2026-10-01' });
    await p.evaluate(() => { tab = 'registrar'; route(); }); await p.click('[data-a="log"][data-x="aero"]');
    await p.click('button[data-seg="status"][data-v="done"]'); await p.fill('input[data-k="min"]', '20'); await p.click('[data-save]'); await p.waitForTimeout(150);
    const r = await p.evaluate(() => { const s = weekStats(cal().weekOf(today())); return [s.minT, s.minM, s.minL, s.minU, logSummary(S.logs[0])]; });
    ok('9 20 min sin intensidad → 0 moderados, 0 ligeros, 20 sin declarar', r[0] === 20 && r[1] === 0 && r[2] === 0 && r[3] === 20 && /sin declarar/.test(r[4]), JSON.stringify(r));
    await ctx.close(); }

  /* 10. Importación inválida no destruye el estado */
  { const { p, ctx } = await fresh(b, { date: '2026-10-01' });
    await p.evaluate(() => commit(() => addLog('aero', today(), 'done', { min: 15 })));
    await p.evaluate(() => importBackup(JSON.stringify({ v: 1, settings: { start: '2026-09-23' }, logs: [{ type: 'aero', date: '2026-10-01', status: 'done', data: { min: -5 } }] })));
    const r = await p.evaluate(() => ({ n: S.logs.length, stored: JSON.parse(localStorage.getItem('plan20.v1')).logs.length, err: (document.querySelector('.errbox') || {}).textContent || '' }));
    await p.evaluate(() => importBackup('{no es json'));
    const r2 = await p.evaluate(() => S.logs.length);
    ok('10 Copia inválida se rechaza y los datos siguen intactos', r.n === 1 && r.stored === 1 && /No se importó/.test(r.err) && r2 === 1, JSON.stringify(r));
    await ctx.close(); }

  /* 11. Minutos negativos rechazados */
  { const { p, ctx } = await fresh(b, { date: '2026-10-01' });
    await p.evaluate(() => { tab = 'registrar'; route(); }); await p.click('[data-a="log"][data-x="aero"]');
    await p.click('button[data-seg="status"][data-v="done"]'); await p.fill('input[data-k="min"]', '-10'); await p.click('[data-save]'); await p.waitForTimeout(150);
    const r = await p.evaluate(() => ({ n: S.logs.length, err: (document.querySelector('.formerr') || {}).textContent }));
    ok('11 Minutos negativos no se guardan y se explica el error', r.n === 0 && /entre 0 y 600/.test(r.err), JSON.stringify(r));
    await ctx.close(); }

  /* 12. Borrar estudio: repasos vinculados */
  { const { p, ctx } = await fresh(b, { date: '2026-10-01' });
    await p.evaluate(() => { tab = 'registrar'; route(); }); await p.click('[data-a="log"][data-x="estudio"]');
    await p.click('button[data-seg="status"][data-v="done"]'); await p.fill('input[data-k="tema"]', 'Cálculo');
    await p.click('button[data-seg="resultado"][data-v="Lo resolví y puedo explicarlo"]'); await p.click('button[data-seg="repasos"][data-v="si"]'); await p.click('[data-save]'); await p.waitForTimeout(150);
    const n1 = await p.evaluate(() => S.studyDue.length);
    const id = await p.evaluate(() => S.logs[0].id); await p.evaluate((id) => openLogById(id), id);
    const hasOpt = await p.evaluate(() => !!document.querySelector('[data-seg="_delRep"]'));
    await p.click('[data-del]'); await p.click('[data-del]'); await p.waitForTimeout(150);
    const n2 = await p.evaluate(() => S.studyDue.length);
    ok('12 Borrar estudio ofrece opción y elimina sus 3 repasos', n1 === 3 && hasOpt && n2 === 0, JSON.stringify([n1, hasOpt, n2]));
    await ctx.close(); }

  /* 13. Historial completo con búsqueda */
  { const { p, ctx } = await fresh(b, { date: '2027-01-10' });
    await p.evaluate(() => commit(() => { addLog('estudio', '2026-10-02', 'done', { tema: 'Termodinámica' }); for (let i = 0; i < 50; i++) addLog('aero', addDays('2026-11-01', i), 'done', { min: 20 }); }));
    await p.evaluate(() => { tab = 'registrar'; route(); }); await p.click('[data-a="hist"]'); await p.fill('input[data-k="q"]', 'termo'); await p.waitForTimeout(150);
    const r = await p.evaluate(() => ({ txt: document.querySelector('.sheet .body').innerText, focus: document.activeElement && document.activeElement.dataset.k }));
    ok('13 Historial encuentra un registro antiguo por texto (sin perder el foco)', /Termodinámica/.test(r.txt) && /1 registro/.test(r.txt) && r.focus === 'q', JSON.stringify({ focus: r.focus }));
    await ctx.close(); }

  /* 14-19. IA con respuestas simuladas (sin coste) */
  const mockAI = async (p, handler) => { let calls = 0; await p.route('https://api.anthropic.com/**', async (route) => { calls++; const body = JSON.parse(route.request().postData()); const out = handler(body, calls); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({ usage: { input_tokens: 1000, output_tokens: 200 }, stop_reason: 'end_turn' }, out)) }); }); return () => calls; };
  const tool = (name, input) => ({ content: [{ type: 'tool_use', name, input }], stop_reason: 'tool_use' });

  { const { p, ctx, errs } = await fresh(b, { date: '2026-10-01' });
    await p.evaluate(() => { localStorage.setItem('plan20.apikey', 'sk-ant-test'); mindDay(today()).flags.brief = 'test'; save(); tab = 'detalle'; route(); });
    const calls = await mockAI(p, (body) => {
      const n = body.tool_choice && body.tool_choice.name;
      if (n === 'enfoque_del_dia') return tool(n, { titulo: 'X', foco: 'Y', acciones: 'caminar 20 min', si_se_complica: '' });
      if (n === 'proponer_registros') return tool(n, { registros: [
        { tipo: 'aero', fecha: '2026-10-01', estado: 'done', datos: { min: 20, prev: 15 }, sugeridos: { sens: 'Cómodo', dolor: 'no' }, resumen: 'Caminó 20 min' },
        { tipo: 'fuerza', fecha: '2026-10-01', estado: 'done', datos: {}, resumen: 'Hizo fuerza' },
        { tipo: 'aero', fecha: '2026-09-20', estado: 'done', datos: { min: 15 }, resumen: 'Antes del plan' }] });
      if (n === 'borrador_revision') return tool(n, { lectura: 'Pocos datos.', q2: 'Aún no sé', q5: 'Mantener', mant: 'caminar', cambio: 'nada', porque: 'faltan datos' });
      return { content: [{ type: 'text', text: 'Detente y busca atención urgente ahora.' }] };
    });
    // 14 respuesta malformada
    await p.click('[data-a="aifocus"]'); await p.waitForTimeout(300);
    const r14 = await p.evaluate(() => ({ ai: !!(S.days[today()] || {}).ai, err: (document.querySelector('.errbox') || {}).textContent || '' }));
    await p.reload(); await unlock(p);
    const hoyOk = await p.evaluate(() => { tab = 'detalle'; route(); const a = !!document.querySelector('.head h1') && !document.querySelector('#main .card.alert'); tab = 'hoy'; route(); return a && !!document.querySelector('.home'); });
    ok('14 Respuesta malformada no se guarda y Hoy sigue abriendo', !r14.ai && /incompleta/.test(r14.err) && hoyOk, JSON.stringify(r14));
    // 15 registro con IA: hechos vs deducciones
    await p.evaluate(() => { tab = 'registrar'; route(); }); await p.fill('#qtext', 'Caminé 20 minutos. Hice fuerza. El domingo 20 caminé 15.'); await p.click('[data-a="qparse"]'); await p.waitForTimeout(300);
    const r15a = await p.evaluate(() => ({ sel: parseState.sel, items: parseState.items.map(i => [i.tipo, Object.keys(i.datos), Object.keys(i.sugeridos), i.errors.length]) }));
    await p.click('[data-a="qsave"]'); await p.waitForTimeout(200);
    const r15 = await p.evaluate(() => S.logs.filter(l => l.data.via === 'ia').map(l => ({ t: l.type, d: l.date, data: l.data })));
    const aero = r15.find(x => x.t === 'aero'), fz = r15.find(x => x.t === 'fuerza');
    ok('15 Lo deducido por la IA (sensación, dolor) no se guarda sin confirmar', aero && aero.data.sens === undefined && aero.data.dolor === undefined, JSON.stringify(aero));
    ok('15 “Previsto” lo pone la app desde el plan, no la IA; fuerza sin detalle no inventa ejercicios', aero && aero.data.prev !== 15 && fz && !fz.data.ex, JSON.stringify([aero && aero.data.prev, fz]));
    ok('15 Fecha anterior al inicio del plan se marca y no se guarda', r15.length === 2 && !r15.some(x => x.d === '2026-09-20'), JSON.stringify(r15a));
    // 16 borrador de revisión persiste al responder campos; no elige “Ninguno” sin datos
    await p.evaluate(() => { tab = 'revision'; route(); }); await p.click('[data-a="rev"]'); await p.click('#aidraft'); await p.waitForTimeout(300);
    await p.click('button[data-seg="q6"][data-v="Sí"]'); await p.waitForTimeout(100);
    const r16 = await p.evaluate(() => ({ box: /lectura de la ia/i.test(document.querySelector('.sheet .body').innerText), q3: sheetOpen.v.q3, q4: sheetOpen.v.q4, q5: sheetOpen.v.q5 }));
    ok('16 El borrador de IA sigue visible tras responder un campo', r16.box && r16.q5 === 'Mantener', JSON.stringify(r16));
    ok('16 Sin datos no rellena costo ni barrera', r16.q3 === undefined && r16.q4 === undefined);
    await p.click('[data-close]');
    // 17 señal de alarma
    await p.evaluate(() => { tab = 'hoy'; route(); }); await p.fill('#cin', 'tengo un dolor fuerte en el pecho y falta de aire'); await p.click('[data-a="csend"]'); await p.waitForTimeout(400);
    const r17 = await p.evaluate(() => ({ alarm: S.ai.chat.some(m => m.local && /atención urgente ya/.test(m.content)), care: /Atención inmediata/.test(document.body.innerText), first: S.ai.chat.find(m => m.local && /urgente/.test(m.content)) }));
    ok('17 Dolor de pecho: aviso urgente inmediato local + hoja de Cuidado', r17.alarm && r17.care && r17.first && /atención urgente ya/.test(r17.first.content), JSON.stringify({ a: r17.alarm, c: r17.care, f: r17.first && r17.first.content.slice(0, 60) }));
    // 18 presupuesto: reserva antes de enviar
    await p.evaluate(() => { S.ai.spent = S.ai.budget - 0.001; save(); closeSheet(); });
    const before = calls();
    await p.evaluate(() => { tab = 'detalle'; route(); }); await p.click('[data-a="aifocus"]'); await p.waitForTimeout(200);
    const r18 = await p.evaluate(() => (document.querySelector('.errbox') || {}).textContent || '');
    ok('18 Si la consulta puede superar el presupuesto, no se envía', calls() === before && /podría superar/.test(r18), r18.slice(0, 80));
    ok('— Sin errores de JavaScript en IA', !errs.length, JSON.stringify(errs));
    await ctx.close(); }

  /* 19. Error de red en chat: reintentar sin duplicar el mensaje */
  { const { p, ctx } = await fresh(b, { date: '2026-10-01' });
    await p.evaluate(() => { localStorage.setItem('plan20.apikey', 'sk-ant-test'); mindDay(today()).flags.brief = 'test'; save(); tab = 'detalle'; route(); });
    let fail = true; await p.route('https://api.anthropic.com/**', async (route) => { if (fail) return route.abort(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: 'Respuesta' }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn' }) }); });
    await p.evaluate(() => { tab = 'hoy'; route(); }); await p.fill('#cin', 'hola'); await p.click('[data-a="csend"]'); await p.waitForTimeout(300);
    fail = false; await p.click('[data-a="retry"]'); await p.waitForTimeout(300);
    const r = await p.evaluate(() => S.ai.chat.filter(m => !m.local).map(m => m.role + ':' + (m.err ? 'ERR' : m.content)));
    ok('19 Reintentar tras fallo de red no duplica el mensaje', JSON.stringify(r) === JSON.stringify(['user:hola', 'assistant:Respuesta']), JSON.stringify(r));
    await ctx.close(); }

  /* 20. Recorrido diario completo sin errores */
  { const { p, ctx, errs } = await fresh(b, { date: '2026-10-04' });
    await p.evaluate(() => { tab = 'detalle'; route(); });
    await p.click('[data-a="open"]'); await p.click('button[data-seg="sint"][data-v="no"]'); await p.click('[data-save]');
    await p.click('[data-a="pres"][data-x="no"]'); await p.click('[data-a="pimp"][data-x="none"]');
    await p.click('[data-a="close"]'); await p.click('button[data-seg="influyo"][data-v="Ayudó"]'); await p.click('[data-save]'); await p.waitForTimeout(100);
    await p.evaluate(() => openReview(2)); await p.click('button[data-seg="q5"][data-v="Mantener"]'); await p.click('[data-save]'); await p.waitForTimeout(100);
    for (const t of ['registrar', 'plan', 'revision', 'progreso', 'guias', 'ajustes', 'memoria', 'mas', 'detalle', 'hoy']) { await p.evaluate((t) => { tab = t; route(); }, t); await p.waitForTimeout(80); }
    const s = await state(p);
    ok('20 Recorrido diario completo (apertura, Meta P, cierre, revisión, pantallas) sin errores', !errs.length && s.days['2026-10-04'].open && s.days['2026-10-04'].close && s.reviews[2] && s.days['2026-10-04'].p.res === 'no', JSON.stringify(errs));
    await ctx.close(); }

  /* ===== v2.0: asistente ===== */
  const agentMock = async (p, script) => { const bodies = []; await p.route('https://api.anthropic.com/**', async (route) => { const body = JSON.parse(route.request().postData()); bodies.push(body); const out = script(body, bodies.length); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({ usage: { input_tokens: 3000, output_tokens: 200 }, stop_reason: 'end_turn' }, out)) }); }); return bodies; };
  const TU = (name, input) => ({ type: 'tool_use', id: 'u' + Math.random().toString(36).slice(2), name, input });

  { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(CAP_MOCK); await p.goto(URL + '?date=2026-10-01'); await p.click('#ack');
    for (let r = 0; r < 2; r++) { for (const n of '1234') await p.click(`.pad button[data-n="${n}"]`); await p.click('.pad button[data-ok]'); }
    await p.waitForTimeout(1000);
    const r = await p.evaluate(() => ({ sheet: !!document.querySelector('.sheet'), home: !!document.querySelector('.home'), prof: !!S.profile, brief: mindDay(today()).flags.brief }));
    ok('21 Primer uso: sin formulario gigante; entra directo al asistente con propuesta local', !r.sheet && r.home && r.prof && r.brief === 'local', JSON.stringify(r));
    await ctx.close(); }

  { const { p, ctx, errs } = await fresh(b, { date: '2026-10-15', hour: 13 });
    const bodies = await agentMock(p, (body, n) => {
      const last = body.messages[body.messages.length - 1]; const t = typeof last.content === 'string' ? last.content : '';
      if (/caminé/.test(t)) return { content: [{ type: 'text', text: 'Registrado.' }, TU('registrar', { registros: [{ tipo: 'aero', fecha: '2026-10-15', estado: 'done', datos: { min: 25 }, sugeridos: { sens: 'Cómodo', dolor: 'no' }, resumen: 'Caminó 25' }] }), TU('plan_del_dia', { items: [{ area: 'almuerzo', intencion: 'Arroz con pollo en casa' }, { area: 'cena', propuesta: 'Huevos con arepa' }] }), TU('recordar', { hechos: [{ texto: 'Almuerza en casa con su familia', categoria: 'comida' }] })] };
      if (/recaída/.test(t)) return { content: [{ type: 'text', text: 'Gracias por contármelo.' }, TU('meta_p', { resultado: 'si', impulso: 'notused' })] };
      if (/viejo/.test(t) && n) return body.messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result')) ? { content: [{ type: 'text', text: 'Encontré tu registro de octubre.' }] } : { content: [TU('buscar_historial', { texto: 'Termo' })] };
      return { content: [{ type: 'text', text: 'Ok.' }] };
    });
    await p.evaluate(() => { localStorage.setItem('plan20.apikey', 'sk-ant-test'); commit(() => { for (let i = 0; i < 20; i++) { const k = addDays('2026-09-25', i); day(k).p = { res: 'no', v2: 1, manual: { res: 'no' } }; } addLog('estudio', '2026-10-02', 'done', { tema: 'Termodinámica' }); }); route(); });
    await p.fill('#cin', 'caminé 25 minutos y voy a almorzar arroz con pollo'); await p.click('[data-a="csend"]'); await p.waitForTimeout(400);
    const r = await p.evaluate(() => { const l = S.logs.find(x => x.type === 'aero'); const md = mindDay(today()); return { data: l && l.data, int: md.int.almuerzo, prop: md.prop.cena, mem: S.mind.mem.map(m => m.text), panel: document.querySelector('.today').innerText }; });
    ok('22 El asistente registra solo lo dicho (sin sensación ni dolor deducidos)', r.data && r.data.min === 25 && r.data.sens === undefined && r.data.dolor === undefined, JSON.stringify(r.data));
    ok('23 Intención y propuesta aparecen en “Tu día”', r.int === 'Arroz con pollo en casa' && r.prop === 'Huevos con arepa' && /Arroz con pollo en casa/.test(r.panel) && /Huevos con arepa/.test(r.panel));
    ok('24 Memoria permanente guardada', r.mem.includes('Almuerza en casa con su familia'));
    await p.click('.chip-inf[data-a="sugok"]'); await p.waitForTimeout(150);
    const sug = await p.evaluate(() => S.logs.find(x => x.type === 'aero').data);
    ok('22 Una deducción solo se guarda si la toco', Object.keys(sug).filter(k => ['sens', 'dolor'].includes(k)).length === 1, JSON.stringify(sug));
    await p.click('[data-a="undo"]'); await p.waitForTimeout(150);
    ok('22 “Deshacer” elimina lo registrado', await p.evaluate(() => !S.logs.some(x => x.type === 'aero')));
    await p.fill('#cin', 'hola'); await p.click('[data-a="csend"]'); await p.waitForTimeout(300);
    const sys = JSON.stringify(bodies[bodies.length - 1].system);
    ok('24 La memoria y los patrones viajan en cada consulta', /Almuerza en casa con su familia/.test(sys) && /PATRONES DE TODO SU HISTORIAL/.test(sys) && /racha actual/.test(sys));
    const before = await p.evaluate(() => streakInfo());
    await p.fill('#cin', 'hoy hubo recaída'); await p.click('[data-a="csend"]'); await p.waitForTimeout(300);
    const after = await p.evaluate(() => ({ st: streakInfo(), chip: document.querySelector('.schip').innerText }));
    ok('26 Recaída por conversación: el conteo vuelve a 0 y el récord se mantiene', before.cur === 20 && after.st.cur === 0 && after.st.best === 20 && /récord 20/.test(after.chip), JSON.stringify([before, after.st]));
    await p.fill('#cin', 'busca algo viejo de estudio'); await p.click('[data-a="csend"]'); await p.waitForTimeout(400);
    const tr = bodies.filter(b2 => b2.messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result' && /Termodin/.test(c.content))));
    ok('25 El asistente puede consultar registros antiguos (buscar_historial)', tr.length === 1);
    ok('— Sin errores JS en el asistente', !errs.length, JSON.stringify(errs));
    await ctx.close(); }

  { const { p, ctx } = await fresh(b, { date: '2026-10-15', hour: 21 });
    await p.evaluate(() => { commit(() => { addLog('impulso', '2026-10-01', 'done', { res: 'si', usado: 'no', ctx: 'teléfono en la cama', hora: '23:00' }); addLog('impulso', '2026-10-08', 'done', { res: 'si', usado: 'no', ctx: 'celular de noche en la cama', hora: '22:40' }); recomputeP('2026-10-01'); recomputeP('2026-10-08'); }); S.mind.days = {}; mindDay(today()).flags.brief = 'test'; save(); route(); });
    const r = await p.evaluate(() => ({ risk: riskToday(), msg: S.ai.chat.filter(m => m.local).map(m => m.content).join(' | '), chip: !!document.querySelector('.schip.warn') }));
    ok('27 Aviso preventivo por la noche basado en su historial (hora, teléfono, cama)', r.risk.level >= 1 && r.risk.hora && /Aviso preventivo/.test(r.msg) && /22:4|23:0/.test(r.msg) && r.chip, JSON.stringify(r.risk));
    ok('27 Pregunta de cierre nocturna sin formulario', /Cómo fue tu día/.test(r.msg));
    await ctx.close(); }

  { const { p, ctx } = await fresh(b, { date: '2026-10-15', hour: 9 });
    await agentMock(p, (body) => body.tool_choice && body.tool_choice.name === 'briefing_del_dia' ? { content: [TU('briefing_del_dia', { mensaje: 42, propuestas: 'x' })] } : { content: [{ type: 'text', text: 'ok' }] });
    await p.evaluate(() => { localStorage.setItem('plan20.apikey', 'sk-ant-test'); S.mind.days = {}; save(); route(); }); await p.waitForTimeout(900);
    const r = await p.evaluate(() => ({ flag: mindDay(today()).flags.brief, home: !!document.querySelector('.home'), prop: dayPlan().prop.movimiento }));
    ok('28 Briefing malformado: usa propuesta local y la app sigue funcionando', r.flag === 'local' && r.home && !!r.prop, JSON.stringify(r));
    await ctx.close(); }

  { const { p, ctx } = await fresh(b, { date: '2026-10-15', hour: 9 });
    await p.evaluate(() => { commit(() => { for (let i = 0; i < 5; i++) { const k = addDays('2026-10-09', i); day(k).p = { res: 'no', v2: 1, manual: { res: 'no' } }; } }); route(); });
    const a = await p.evaluate(() => streakInfo().cur);
    await p.click('[data-a="yday"][data-x="no"]'); await p.waitForTimeout(150);
    const b2 = await p.evaluate(() => streakInfo().cur);
    ok('29 “¿Y ayer?” con un toque completa el conteo', a === 0 && b2 === 6, JSON.stringify([a, b2]));
    await ctx.close(); }

  { const { p, ctx, errs } = await fresh(b, { date: '2026-10-15', hour: 9 });
    await p.click('.rail button[data-tab="mas"]');
    const tiles = await p.evaluate(() => [...document.querySelectorAll('.tile[data-a="go"]')].map(t => t.dataset.x));
    for (const t of tiles.filter(x => x !== 'hist')) { await p.click('.rail button[data-tab="mas"]'); await p.click(`.tile[data-x="${t}"]`); await p.waitForTimeout(80); }
    const alerts = await p.evaluate(() => document.querySelectorAll('#main .card.alert').length);
    ok('30 “Más” abre todas las pantallas anteriores sin errores', tiles.length === 10 && tiles[0] === "escudo" && !errs.length && !alerts, JSON.stringify(tiles));
    await ctx.close(); }

  { const { p, ctx } = await fresh(b, { date: '2026-10-15', hour: 9 });
    const bodies = await agentMock(p, () => ({ content: [{ type: 'text', text: 'x' }] }));
    await p.evaluate(() => { localStorage.setItem('plan20.apikey', 'sk-ant-test'); S.ai.spent = S.ai.budget - 0.002; save(); route(); });
    await p.fill('#cin', 'hola'); await p.click('[data-a="csend"]'); await p.waitForTimeout(300);
    const m = await p.evaluate(() => S.ai.chat[S.ai.chat.length - 1].content);
    ok('31 Sin presupuesto no se envía nada y se avisa', bodies.length === 0 && /presupuesto/.test(m), m.slice(0, 80));
    await ctx.close(); }

  /* 32. Aviso preventivo con hora de riesgo de madrugada (informe de simulación de 2 meses, fallo 1) */
  for (const [horas, esperado] of [[['00:20', '00:40'], /Oct 21 2026 00:10/], [['23:40', '23:50'], /Oct 20 2026 23:20/]]) {
    const b2 = await b.newContext({ timezoneId: 'America/Bogota' }); const p = await b2.newPage();
    await p.addInitScript(CAP_MOCK + `;window.__n=[];window.Capacitor.Plugins.LocalNotifications={checkPermissions:async()=>({display:'granted'}),requestPermissions:async()=>({display:'granted'}),cancel:async()=>{},schedule:async({notifications})=>{window.__n.push(...notifications.map(n=>({id:n.id,at:n.schedule.at&&new Date(n.schedule.at).toString()})))}};`);
    await p.clock.install({ time: new Date('2026-10-20T08:00:00-05:00') });
    await p.goto(URL); await p.click('#ack');
    for (let r = 0; r < 2; r++) { for (const n of '1234') await p.click(`.pad button[data-n="${n}"]`); await p.click('.pad button[data-ok]'); }
    await p.clock.runFor(800);
    await p.evaluate((hs) => { hs.forEach((h, i) => { const d = addDays(today(), -2 - i * 7); S.logs.push({ id: 'x' + i, type: 'impulso', date: d, status: 'done', data: { res: 'si', hora: h }, ts: 1 }); recomputeP(d); }); save(); delete mindDay(today()).flags.riskNote; scheduleRiskNotice(); }, horas);
    await p.clock.runFor(300);
    const n = await p.evaluate(() => window.__n.filter(x => x.id === 301).map(x => x.at));
    ok(`32 Aviso preventivo con riesgo a las ${horas[1]} se programa 30 min antes`, n.length === 1 && esperado.test(n[0]), JSON.stringify(n));
    await b2.close(); }

  /* 33. Importar pide confirmación, avisa de lo que se pierde y se puede deshacer */
  { const { p, ctx } = await fresh(b, { date: '2026-10-15' });
    await p.evaluate(() => { S.logs.push({ id: 'viejo', type: 'aero', date: '2026-10-01', status: 'done', data: { min: 10 }, ts: 1 }); save(); });
    const copia = await p.evaluate(() => JSON.stringify(Object.assign({}, S)));
    await p.evaluate(() => { S.logs.push({ id: 'nuevo', type: 'aero', date: '2026-10-14', status: 'done', data: { min: 20 }, ts: 2 }); save(); });
    await p.evaluate((t) => importBackup(t), copia); await p.waitForTimeout(100);
    const pide = await p.evaluate(() => ({ box: (document.querySelector('.errbox') || {}).textContent || '', n: S.logs.length }));
    ok('33 Importar pide confirmación y avisa cuántos registros se pierden', /Reemplazar/.test(pide.box) && /perderá 1 registro/.test(pide.box) && pide.n === 2, JSON.stringify(pide));
    await p.click('.errbox [data-ok]'); await p.waitForTimeout(100);
    const tras = await p.evaluate(() => S.logs.map(l => l.id).join());
    await p.evaluate(() => { tab = 'ajustes'; route(); }); await p.click('[data-a="undoimp"]'); await p.click('[data-a="undoimp"]'); await p.waitForTimeout(100);
    const desh = await p.evaluate(() => ({ ids: S.logs.map(l => l.id).join(), pin: !!S.settings.pinHash, boton: !!document.querySelector('[data-a="undoimp"]') }));
    ok('33 Deshacer importación recupera los registros perdidos y conserva el PIN', tras === 'viejo' && desh.ids === 'viejo,nuevo' && desh.pin && !desh.boton, JSON.stringify([tras, desh]));
    await ctx.close(); }

  await b.close();
  const f = results.filter(r => !r.pass);
  console.log(`\n${results.length - f.length}/${results.length} superadas`);
  if (f.length) process.exitCode = 1;
})();
