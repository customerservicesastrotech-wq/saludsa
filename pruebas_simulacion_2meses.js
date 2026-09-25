// Simulación de 2 meses de uso real en una Samsung Galaxy Tab S9 FE (SM-X510, Android 14, WebView).
// Recorre día a día del 23-sep-2026 al 22-nov-2026 con reloj controlado, componentes nativos simulados
// (App, Shield, LocalNotifications, CapacitorHttp → IA simulada, Filesystem/Share) y datos persistentes.
// Uso: PLAN20_URL=http://localhost:8765/index.html node pruebas_simulacion_2meses.js
// Resultado: docs/simulacion-2meses-resultado.json (métricas por día) y código 1 si hay fallos.
const { chromium } = require(process.env.NODE_PATH_PW || 'playwright');
const fs = require('fs');
const URL = process.env.PLAN20_URL || 'http://localhost:8765/index.html';
const START = '2026-09-23', DAYS = +(process.env.SIM_DAYS || 61);
const OUT = process.env.SIM_OUT || 'docs/simulacion-2meses-resultado.json';

/* ---------- Dispositivo: Galaxy Tab S9 FE (2304×1440, densidad 2.0 → 1152×720 CSS) ---------- */
const TAB_S9_FE = {
  viewport: { width: 1152, height: 720 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X510 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Safari/537.36',
  locale: 'es-EC', timezoneId: 'America/Guayaquil'
};

/* ---------- Generador pseudoaleatorio reproducible ---------- */
let seed = 20260923; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

/* ---------- Componentes nativos simulados (se reinyectan en cada recarga) ---------- */
const NATIVE_MOCK = `(() => {
  const st = (k, d) => { try { return JSON.parse(localStorage.getItem('__sim.' + k)) ?? d; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem('__sim.' + k, JSON.stringify(v)); } catch (e) {} };
  window.__sh = { cfg: null, events: [], usage: {}, L: {}, locks: [] };
  window.__aiCalls = 0;
  const AREAS = ['desayuno', 'almuerzo', 'merienda', 'cena', 'movimiento', 'estudio', 'metap', 'sueno'];
  function aiReply(body) {
    window.__aiCalls++;
    const sys = JSON.stringify(body.system || '').length, msg = JSON.stringify(body.messages || '').length;
    const usage = { input_tokens: Math.round((sys + msg) / 3.6), output_tokens: 250 + Math.floor(Math.random() * 250) };
    const tools = (body.tools || []).map(t => t.name);
    const last = (body.messages || []).slice(-1)[0] || {};
    const txt = typeof last.content === 'string' ? last.content : '';
    const date = (window.__simToday || '');
    if (tools.includes('briefing_del_dia')) return { usage, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'b1', name: 'briefing_del_dia', input: {
      mensaje: 'Buen día. Hoy mantén tu caminata y ten lista tu respuesta por la noche.', pregunta: '¿Qué piensas desayunar?',
      propuestas: Object.fromEntries(AREAS.filter(a => a !== 'merienda').map(a => [a, 'Propuesta IA para ' + a])),
      riesgo: { nivel: 'medio', hora: '23:30', texto: 'Plan 20 · ten lista tu respuesta' } } }] };
    if (tools.includes('registrar') && Array.isArray(last.content)) return { usage, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Listo, quedó anotado.' }] };
    if (tools.includes('registrar') && /cen[eé]|almorc|desayun/i.test(txt)) {
      const m = /cen/i.test(txt) ? 'Cena' : /almorc/i.test(txt) ? 'Almuerzo' : 'Desayuno';
      return { usage, stop_reason: 'tool_use', content: [{ type: 'text', text: 'Anotado. Buen ajuste.' },
        { type: 'tool_use', id: 't' + Date.now(), name: 'registrar', input: { registros: [{ tipo: 'comida', fecha: date, estado: 'done', datos: { momento: m, ajuste: 'agua en lugar de gaseosa', desp: 'Satisfecho' } }] } },
        { type: 'tool_use', id: 'p' + Date.now(), name: 'plan_del_dia', input: { items: [{ area: m.toLowerCase(), intencion: 'lo que comí' }] } }] };
    }
    if (tools.includes('registrar') && /sin reca[ií]da|todo seg[uú]n/i.test(txt)) return { usage, stop_reason: 'tool_use', content: [{ type: 'text', text: 'Bien hecho, marcado.' },
      { type: 'tool_use', id: 'm' + Date.now(), name: 'meta_p', input: { resultado: 'no', impulso: 'none' } }] };
    if (tools.includes('registrar') && /recuerda/i.test(txt)) return { usage, stop_reason: 'tool_use', content: [{ type: 'text', text: 'Lo recordaré.' },
      { type: 'tool_use', id: 'r' + Date.now(), name: 'recordar', input: { hechos: [{ texto: txt.replace(/^recuerda que /i, ''), categoria: 'horario' }] } }] };
    return { usage, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Entendido. ¿Algo más de tu día?' }] };
  }
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
    App: { L: {}, addListener(ev, cb) { (this.L[ev] = this.L[ev] || []).push(cb); return { remove() {} }; }, minimizeApp() { window.__min = (window.__min || 0) + 1; } },
    LocalNotifications: {
      checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
      cancel: async ({ notifications }) => { const s = st('notifs', {}); notifications.forEach(n => delete s[n.id]); put('notifs', s); },
      schedule: async ({ notifications }) => { const s = st('notifs', {}); notifications.forEach(n => s[n.id] = { body: n.body, sch: n.schedule }); put('notifs', s); const log = st('notiflog', []); notifications.forEach(n => log.push({ id: n.id, at: n.schedule.at ? new Date(n.schedule.at).toISOString() : null, on: n.schedule.on || null, t: new Date().toISOString() })); put('notiflog', log.slice(-400)); return { notifications }; }
    },
    CapacitorHttp: { request: async ({ url, data }) => {
      if (!/api\\.anthropic\\.com/.test(url)) return { status: 404, data: {} };
      if (window.__aiFail) return { status: 529, data: { error: { message: 'overloaded' } } };
      await new Promise(r => setTimeout(r, 30));
      return { status: 200, data: aiReply(data) };
    } },
    Filesystem: { writeFile: async ({ path, data }) => { window.__export = data; return { uri: 'file:///cache/' + path }; } },
    Share: { share: async () => ({}) },
    Shield: {
      getStatus: async () => ({ usage: true, overlay: true, battery: true, running: !!(window.__sh.cfg && window.__sh.cfg.enabled), enabled: !!(window.__sh.cfg && window.__sh.cfg.enabled), active: false, locked: false, sdk: 34, privateDns: 'family.adguard-dns.com' }),
      configure: async ({ config }) => { window.__sh.cfg = config; put('shcfg', config); return {}; },
      lockNow: async (o) => { window.__sh.locks.push(o); },
      popEvents: async () => { const ev = st('shq', []); const us = st('shu', {}); put('shq', []); put('shu', {}); return { events: ev, usage: us }; },
      listApps: async () => ({ apps: [{ pkg: 'com.android.chrome', label: 'Chrome' }, { pkg: 'com.sec.android.app.sbrowser', label: 'Samsung Internet' }, { pkg: 'com.google.android.youtube', label: 'YouTube' }, { pkg: 'com.instagram.android', label: 'Instagram' }] }),
      openUsageSettings: async () => {}, openOverlaySettings: async () => {}, openBatterySettings: async () => {}, openAppSettings: async () => {}, openDnsSettings: async () => {}, copyText: async () => {},
      addListener: (ev, cb) => { window.__sh.L[ev] = cb; return { remove() {} }; }
    },
    ContinuousSpeech: { available: async () => ({ available: true }), checkPermissions: async () => ({ speechRecognition: 'granted' }), requestPermissions: async () => ({ speechRecognition: 'granted' }),
      start: async () => ({}), stop: async () => ({}), addListener: () => ({ remove() {} }), removeAllListeners: async () => {} }
  } };
  window.__bg = () => window.Capacitor.Plugins.App.L.appStateChange.forEach(f => f({ isActive: false }));
  window.__fg = () => window.Capacitor.Plugins.App.L.appStateChange.forEach(f => f({ isActive: true }));
  window.__back = () => (window.Capacitor.Plugins.App.L.backButton || []).forEach(f => f({}));
})();`;

/* ---------- Utilidades de fecha (zona -05:00, Ecuador sin horario de verano) ---------- */
const addDays = (k, n) => { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const at = (k, hm) => new Date(`${k}T${hm}:00-05:00`).getTime();
const dow = (k) => new Date(k + 'T12:00:00Z').getUTCDay();

/* ---------- Registro de hallazgos ---------- */
const issues = [], daily = [], checks = [];
const issue = (day, area, msg, extra) => { const key = area + '|' + msg; const prev = issues.find(i => i.key === key); if (prev) { prev.count++; prev.lastDay = day; return; } issues.push({ key, day, lastDay: day, area, msg, extra, count: 1 }); console.log(`  ✗ [${day}] ${area}: ${msg}${extra ? ' — ' + JSON.stringify(extra).slice(0, 300) : ''}`); };
const check = (day, name, cond, info) => { checks.push({ day, name, pass: !!cond, info }); if (!cond) issue(day, 'verificación', name, info); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(TAB_S9_FE);
  await ctx.addInitScript(NATIVE_MOCK);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); await cdp.send('Performance.enable');
  let curDay = START;
  const errs = [], cerrs = [];
  p.on('pageerror', e => { errs.push(e.message); issue(curDay, 'error JS', e.message); });
  p.on('console', m => { if (m.type() === 'error') { cerrs.push(m.text()); issue(curDay, 'console.error', m.text().slice(0, 200)); } });
  await p.clock.install({ time: at(START, '07:10') });
  const setToday = (k) => p.evaluate((k) => { window.__simToday = k; }, k).catch(() => {});
  const ff = async (target) => { const now = await p.evaluate(() => Date.now()); if (target > now) await p.clock.fastForward(target - now); await p.clock.runFor(50); };
  const idle = (ms = 200) => p.clock.runFor(ms);
  const clickIf = async (sel) => { const el = await p.$(sel); if (!el || !(await el.isVisible())) return false; await el.click({ timeout: 3000 }); await idle(120); return true; };
  const pinPad = async (root = '.lock') => { for (const n of '2580') await p.click(`${root} .pad button[data-n="${n}"]`); await idle(200); };
  const unlock = async () => { if (await p.$('.lock .pad')) { await pinPad(); await idle(600); } };
  const tabGo = async (t) => { await p.evaluate((t) => { closeSheet(true); tab = t; route(); }, t); await idle(150); };
  const noSheet = () => p.evaluate(() => !document.querySelector('.sheet'));
  const S = () => p.evaluate(() => JSON.parse(localStorage.getItem('plan20.v1')));
  const renderErr = () => p.evaluate(() => { const a = document.querySelector('#main .card.alert h3'); return a && /No se pudo mostrar/.test(a.textContent) ? document.querySelector('#main .card.alert').innerText : null; });

  /* Registra con el formulario real (Más → Registrar a mano). fields: [[tipo,'seg'|'fill'|'multi',k,v]] */
  async function formLog(type, steps, label) {
    await tabGo('registrar');
    await p.click(`.tile[data-a="log"][data-x="${type}"]`); await idle(150);
    for (const [kind, k, v] of steps) {
      if (kind === 'seg') { const b = await p.$(`.sheet button[data-seg="${k}"][data-v="${v}"]`); if (!b) { issue(curDay, 'formulario', `${type}: no aparece la opción ${k}=${v}`); continue; } await b.click(); }
      else if (kind === 'multi') await p.click(`.sheet button[data-multi="${k}"][data-v="${v}"]`);
      else if (kind === 'fill') await p.fill(`.sheet [data-k="${k}"]`, String(v));
      else if (kind === 'ex') await p.evaluate(() => { const sh = document.querySelector('.sheet'); sh.querySelectorAll('button[data-exstep$=".reps"][data-d="1"]').forEach(b => b.click()); });
      await idle(60);
    }
    const before = (await S()).logs.length;
    await p.click('.sheet [data-save]'); await idle(250);
    const err = await p.evaluate(() => { const e = document.querySelector('.sheet .formerr'); return e && !e.hidden ? e.innerText : null; });
    const after = (await S()).logs.length;
    if (err || after !== before + 1) { issue(curDay, 'formulario', `${label || type}: no se guardó`, { err, before, after }); await p.evaluate(() => closeSheet()); return false; }
    return true;
  }

  /* ===================== DÍA 0: instalación y primer uso ===================== */
  await setToday(START);
  await p.goto(URL); await idle(500);
  await p.click('#ack'); await idle(100);
  for (let r = 0; r < 2; r++) { for (const n of '2580') await p.click(`.pad button[data-n="${n}"]`); await p.click('.pad button[data-ok]'); await idle(200); }
  await idle(800);
  check(START, 'Primer uso: llega a Inicio sin formularios', await p.evaluate(() => !!document.querySelector('.home') && !document.querySelector('.sheet')));
  // Sin IA el primer día: debe explicar que falta activarla
  await p.fill('#cin', 'Hoy caminé 15 minutos'); await p.click('[data-a="csend"]'); await idle(300);
  check(START, 'Sin clave de IA explica que falta activarla', await p.evaluate(() => /IA activada/.test(S.ai.chat.slice(-1)[0].content)));
  // Día 1: activa la IA (clave simulada) y el Escudo
  await p.evaluate(() => { localStorage.setItem('plan20.apikey', 'sk-ant-sim-000000'); });
  await tabGo('escudo');
  if (await clickIf('[data-a="shon"]') || await clickIf('[data-a="son"]') || true) {
    await p.evaluate(async () => { if (window.shieldSetEnabled) await shieldSetEnabled(true); else { S.shield.cfg.enabled = true; save(); await syncShield(); } });
  }
  await p.evaluate(async () => { S.shield.cfg.apps = ['com.android.chrome', 'com.google.android.youtube', 'com.instagram.android']; save(); await syncShield(); });
  await idle(300);

  /* ===================== BUCLE DE 61 DÍAS ===================== */
  const perf = [];
  let lastExport = null, restarts = 0, aiDown = false;
  for (let i = 0; i < DAYS; i++) {
    const k = addDays(START, i); curDay = k; await setToday(k);
    const wd = dow(k), eDay = {};
    const t0 = Date.now();

    /* 07:10 · despertar: la app estaba en segundo plano (bloqueada). Cada 6 días el sistema mató el proceso. */
    if (i > 0) {
      await ff(at(k, '07:10'));
      if (i % 6 === 0) { await p.reload(); restarts++; await idle(500); } else { await p.evaluate(() => window.__fg()); await idle(200); }
      await setToday(k);
      await unlock(); await idle(900);
      // Si quedó un borrador de ayer, a veces lo continúa y a veces lo descarta
      if (await p.$('.errbox [data-go]')) { if (i % 2) await clickIf('.errbox [data-no]'); else { await clickIf('.errbox [data-go]'); await p.evaluate(() => closeSheet()); } }
      await clickIf('.errbox button.btn:not([data-go]):not([data-no])');
    }
    await tabGo('hoy'); await idle(300);
    { const q = await p.$$('[data-a="shq"]'); if (q.length) { const last = daily[daily.length - 1] || {}; const ok = await clickIf(`[data-a="shq"][data-x$="|${last.relapse ? 'other' : 'ok'}"]`); eDay.shieldAsked = ok; if (!ok) issue(k, 'escudo', 'No se pudo responder la pregunta tras la pausa'); } }
    await tabGo('hoy');
    const home = await p.evaluate((k) => ({ ok: !!document.querySelector('.home'), kicker: (document.querySelector('.htop .kicker') || {}).textContent || '', brief: (mindDay(today()).flags || {}).brief, today: today() }), k);
    if (!home.ok) issue(k, 'inicio', 'No se muestra la pantalla Inicio al abrir');
    if (home.today !== k) issue(k, 'fecha', 'today() no coincide con el día simulado', home);
    eDay.brief = home.brief;

    /* Un día de caída del servicio de IA (día 20) y reintento */
    aiDown = (i === 20); await p.evaluate((d) => { window.__aiFail = d; }, aiDown);

    /* Sueño (al despertar) con el formulario */
    const horas = pick([5, 5.5, 6, 6.5, 7, 7, 7.5, 8, 8]);
    await formLog('sueno', [['fill', 'date', k], ['fill', 'horas', horas], ['seg', 'como', horas < 6 ? 'Algo cansado' : 'Descansado'], ['seg', 'recorto', horas < 6 ? 'Ocio' : 'Nada']], 'sueño');

    /* Tu día: acepta algunas propuestas */
    await tabGo('hoy'); await clickIf('[data-a="hv"][data-x="dia"]');
    for (const a of ['desayuno', 'movimiento']) await clickIf(`[data-a="acc"][data-x="${a}"]`);
    await clickIf('[data-a="hv"][data-x="chat"]');

    /* ¿Y ayer? Si quedó sin marcar, lo marca desde el chip */
    if (i > 0 && await p.$('[data-a="yday"][data-x="no"]')) {
      const y = addDays(k, -1); const s0 = await S(); const hadEp = s0.logs.some(l => l.date === y && l.type === 'impulso' && l.data.res === 'si');
      if (!hadEp) { await p.click('[data-a="yday"][data-x="no"]'); await idle(150); }
    }

    /* Apertura del día (4 de cada 7 días) */
    if (rnd() < 0.6) { await tabGo('detalle'); if (await clickIf('[data-a="open"]')) { await clickIf('.sheet button[data-seg="sint"][data-v="no"]'); await p.click('.sheet [data-save]'); await idle(200); if (!(await noSheet())) { issue(k, 'formulario', 'Apertura no se guardó'); await p.evaluate(() => closeSheet()); } } }

    /* 13:00 · almuerzo por conversación con el asistente (IA simulada) */
    await ff(at(k, '13:05')); await tabGo('hoy');
    if (i % 3 !== 2) {
      const before = (await S()).logs.length;
      await p.fill('#cin', 'Almorcé en casa con agua en vez de gaseosa'); await p.click('[data-a="csend"]'); await idle(400);
      const s1 = await S();
      const lastMsg = s1.ai.chat.slice(-1)[0] || {};
      if (!aiDown && s1.logs.length !== before + 1) issue(k, 'asistente', 'El relato del almuerzo no quedó registrado', { before, after: s1.logs.length, last: lastMsg.content });
      if (aiDown && !lastMsg.err) issue(k, 'asistente', 'Con la IA caída no se muestra error reintentable', lastMsg);
      if (aiDown) { await p.evaluate(() => { window.__aiFail = false; }); await clickIf('[data-a="retry"]'); await idle(400); const s2 = await S(); if (s2.logs.length !== before + 1) issue(k, 'asistente', 'Reintentar tras caída de IA no registra', { n: s2.logs.length - before }); }
    } else {
      await formLog('comida', [['seg', 'status', 'done'], ['seg', 'momento', 'Almuerzo'], ['seg', 'disp', 'Comida familiar'], ['fill', 'ajuste', 'Más verdura'], ['seg', 'desp', 'Satisfecho']], 'comida');
    }

    /* 17:30 · movimiento según el plan de la semana */
    await ff(at(k, '17:30'));
    const plan = await p.evaluate(() => { const w = Math.max(1, cal().weekOf(today())); return weekPlan(w).days[today()] || {}; });
    if (plan.walk) {
      if (rnd() < 0.8) {
        const min = plan.walk + pick([-5, 0, 0, 5]);
        await formLog('aero', [['seg', 'status', 'done'], ['seg', 'act', 'Caminar'], ['fill', 'prev', plan.walk], ['fill', 'min', min], ['fill', 'mod', Math.round(min * 0.6)], ['seg', 'sens', pick(['Cómodo', 'Cómodo', 'Exigido'])], ['seg', 'dolor', 'no'], ['seg', 'next', 'Mantendré']], 'caminata');
      } else await formLog('aero', [['seg', 'status', 'no'], ['seg', 'barrera', pick(['Tiempo', 'Olvido', 'Prioridad'])]], 'caminata no hecha');
    }
    if (plan.str) await formLog('fuerza', [['seg', 'status', 'done'], ['ex'], ['seg', 'tec', 'si'], ['seg', 'com', 'comodo'], ['seg', 'rec', 'bien']], 'fuerza');

    /* Estudio con el bloque guiado de 25 min algunos días (el temporizador sigue aunque la app se cierre) */
    if (wd >= 1 && wd <= 5) {
      if (i % 5 === 1) {
        await tabGo('registrar'); await p.click('[data-a="timer"]'); await idle(200);
        await p.evaluate(() => window.__bg()); await p.clock.fastForward(12 * 60000); await p.evaluate(() => window.__fg()); await unlock();
        await p.clock.fastForward(14 * 60000); await idle(300);
        const tmr = await p.evaluate(() => !!document.querySelector('.proto'));
        if (!tmr) issue(k, 'temporizador', 'El bloque de estudio desapareció tras salir y volver');
        await clickIf('.proto [data-x]'); await p.evaluate(() => document.querySelectorAll('.proto').forEach(x => x.remove()));
      }
      await formLog('estudio', [['seg', 'status', 'done'], ['fill', 'tema', pick(['Cálculo', 'Física', 'Química', 'Programación'])], ['fill', 'tarea', 'Resolver 3 ejercicios sin mirar'], ['seg', 'resultado', pick(['Lo resolví y puedo explicarlo', 'Recordé parte pero cometí un error'])], ['seg', 'repasos', i % 4 === 0 ? 'si' : 'no']], 'estudio');
      // Repasos pendientes: marcar uno como hecho
      await tabGo('detalle'); await clickIf('[data-a="sdone"]');
    }

    /* Cena por conversación + memoria del asistente de vez en cuando */
    await ff(at(k, '20:15')); await tabGo('hoy');
    if (i % 2 === 0) { await p.fill('#cin', 'Cené arroz con pollo y ensalada'); await p.click('[data-a="csend"]'); await idle(400); }
    if (i % 9 === 4) { await p.fill('#cin', `recuerda que los ${['lunes', 'martes', 'miércoles', 'jueves', 'viernes'][i % 5]} tengo clase hasta las ${5 + (i % 3)}`); await p.click('[data-a="csend"]'); await idle(400); }
    if (i % 4 === 3) { await p.evaluate(() => { const t = document.querySelector('#cin'); t.value = 'Borrador que no envié'; t.dispatchEvent(new Event('input')); }); }

    /* Pausa activa / vínculo algunos días */
    if (i % 3 === 0) await formLog('pausa', [['seg', 'status', 'done'], ['fill', 'bloque', 'Estudio'], ['seg', 'transicion', 'si'], ['fill', 'actividad', 'Ir por agua'], ['seg', 'efecto', 'Ayudó']], 'pausa');
    if (wd === 6) await formLog('vinculo', [['seg', 'tipo', 'Contacto'], ['seg', 'nec', 'Conversar'], ['seg', 'como', 'Agradable'], ['seg', 'reci', 'Sí'], ['seg', 'rep', 'Sí']], 'vínculo');
    if (wd === 1) await formLog('medida', [['fill', 'date', k], ['fill', 'peso', (82 - i * 0.05).toFixed(1)], ...(i % 28 === 5 ? [['fill', 'cintura', 94 - i * 0.03]] : [])], 'medida');

    /* 23:30 · noche: impulsos (≈1 cada 4 días), recaídas (≈1 cada 10 días), Escudo */
    await ff(at(k, '23:20'));
    const impulse = rnd() < 0.27, relapse = impulse && rnd() < 0.38;
    if (impulse) {
      await tabGo('hoy'); await p.click('.home [data-a="proto"]'); await idle(200);
      for (let s = 0; s < 3; s++) await clickIf('.proto [data-next]');
      if (relapse) { await clickIf('.proto [data-x]'); await p.evaluate(() => document.querySelectorAll('.proto').forEach(x => x.remove())); }
      else { await clickIf('.proto [data-alt]'); await p.clock.fastForward(11 * 60000); await idle(200); await clickIf('.proto [data-x]'); await p.evaluate(() => document.querySelectorAll('.proto').forEach(x => x.remove())); }
      await formLog('impulso', [['fill', 'date', k], ['fill', 'ctx', relapse ? 'En la cama con el teléfono' : 'Aburrimiento de noche'], ['seg', 'int', pick(['Media', 'Alta'])], ['seg', 'usado', relapse ? 'no' : 'si'], ['seg', 'res', relapse ? 'si' : 'no'],
        ...(relapse ? [['seg', 'falto', 'Cansancio'], ['seg', 'cambio', 'Dejar el teléfono en otro lugar'], ['seg', 'dano', 'no']] : [])], 'impulso');
      if (relapse) await p.evaluate(({ k }) => { const l = S.logs.filter(x => x.type === 'impulso' && x.date === k).pop(); l.data.hora = '23:40'; save(); }, { k });
      // El Escudo registró que se abrió Chrome durante la guardia
      await p.evaluate(({ t }) => { localStorage.setItem('__sim.shq', JSON.stringify([{ id: 'ev' + t, t, pkg: 'com.android.chrome', app: 'Chrome', kind: 'open', minutes: 5, reason: 'fixed', end: t + 300000, completed: true }])); localStorage.setItem('__sim.shu', JSON.stringify({ [new Date(t).toISOString().slice(0, 10)]: { 'com.android.chrome': 7 * 60000 } })); }, { t: at(k, '23:35') });
    }
    // Meta P del día y cierre (60 % de los días)
    await tabGo('detalle');
    if (!relapse && rnd() < 0.85) { await clickIf('[data-a="pres"][data-x="no"]'); await clickIf(`[data-a="pimp"][data-x="${impulse ? 'used' : 'none'}"]`); }
    if (rnd() < 0.6 && await clickIf('[data-a="close"]')) {
      await clickIf('.sheet button[data-seg="influyo"][data-v="Ayudó"]'); await clickIf('.sheet button[data-seg="energia"][data-v="Media"]');
      await p.fill('.sheet [data-k="mant"]', 'la caminata'); await p.fill('.sheet [data-k="cambio"]', 'acostarme antes');
      await p.click('.sheet [data-save]'); await idle(200);
      const e = await p.evaluate(() => { const x = document.querySelector('.sheet .formerr'); return x && !x.hidden ? x.innerText : null; });
      if (e && !relapse) issue(k, 'formulario', 'Cierre del día no se guardó', e);
      await p.evaluate(() => closeSheet(true));
    }

    /* Domingo o último día de la semana: revisión semanal (a veces con el asistente, a veces a mano) */
    const w = await p.evaluate(() => cal().weekOf(today()));
    const lastOfWeek = await p.evaluate(() => cal().range(cal().weekOf(today()))[1] === today());
    if (lastOfWeek) {
      await ff(at(k, '23:45'));
      await tabGo('revision'); await p.click('[data-a="rev"]'); await idle(200);
      await clickIf('.sheet button[data-seg="q2"][data-v="Estabilidad"]'); await clickIf('.sheet button[data-multi="q3"][data-v="Tiempo"]');
      await clickIf('.sheet button[data-seg="q5"][data-v="' + (w % 3 === 0 ? 'Progresar una variable' : 'Mantener') + '"]');
      await clickIf('.sheet button[data-seg="q6"][data-v="Sí"]');
      await p.fill('.sheet [data-k="mant"]', 'caminatas'); await p.fill('.sheet [data-k="cambio"]', 'nada'); await p.fill('.sheet [data-k="porque"]', 'va bien');
      await p.click('.sheet [data-save]'); await idle(250);
      const rv = await p.evaluate((w) => !!S.reviews[w], w);
      if (!rv) issue(k, 'revisión', `La revisión de la semana ${w} no se guardó`);
      if (w % 3 === 0) { // progresa una variable: +5 min por caminata en la semana siguiente
        await tabGo('plan'); await clickIf('[data-a="wnext"]'); await clickIf('[data-a="wmin"][data-x="5"]');
      }
    }

    /* Recorrido por todas las pantallas (render y tiempos) cada 3 días y rotación a vertical cada 7 */
    if (i % 3 === 0) {
      if (i % 7 === 0) await p.setViewportSize({ width: 720, height: 1152 });
      for (const t of ['hoy', 'mas', 'detalle', 'registrar', 'plan', 'revision', 'progreso', 'guias', 'ajustes', 'memoria', 'escudo']) {
        const a0 = process.hrtime.bigint(); await p.evaluate((t) => { closeSheet(true); tab = t; route(); }, t); const ms = Number(process.hrtime.bigint() - a0) / 1e6; // reloj real (el de la página está simulado)
        perf.push({ day: i, tab: t, ms });
        const re = await renderErr(); if (re) issue(k, 'pantalla', `No se pudo mostrar ${t}`, re);
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) issue(k, 'diseño', `Desbordamiento horizontal en ${t} (${(await p.viewportSize()).width}px)`);
      }
      await p.evaluate(() => openHistory()); await idle(200); await p.evaluate(() => closeSheet(true));
      if (i % 7 === 0) await p.setViewportSize(TAB_S9_FE.viewport);
    }

    /* Botón atrás de Android en un formulario a medias */
    if (i % 10 === 7) {
      await tabGo('registrar'); await p.click('.tile[data-a="log"][data-x="aero"]'); await idle(100);
      await p.click('.sheet button[data-seg="status"][data-v="done"]');
      await p.evaluate(() => window.__back()); await idle(100);
      const ask = await p.evaluate(() => /Descartar/.test((document.querySelector('.errbox') || {}).textContent || ''));
      check(k, 'Atrás con formulario sucio pide confirmación', ask);
      await clickIf('.errbox [data-d]');
    }

    /* Editar y borrar registros desde el historial (corrección posterior) */
    if (i % 11 === 5) {
      const id = await p.evaluate(() => S.logs.filter(l => l.type === 'aero' && l.status === 'done').slice(-1).map(l => l.id)[0]);
      if (id) {
        await p.evaluate((id) => openLogById(id), id); await idle(150);
        await p.fill('.sheet [data-k="min"]', '33'); await p.fill('.sheet [data-k="mod"]', '20'); await p.click('.sheet [data-save]'); await idle(200);
        const ok = await p.evaluate((id) => (S.logs.find(l => l.id === id) || {}).data.min === 33, id);
        check(k, 'Editar un registro desde el historial', ok);
      }
      const pid = await p.evaluate(() => (S.logs.filter(l => l.type === 'pausa').slice(-1)[0] || {}).id);
      if (pid) { await p.evaluate((id) => openLogById(id), pid); await idle(150); await p.click('.sheet [data-del]'); await p.click('.sheet [data-del]'); await idle(200); check(k, 'Borrar un registro', await p.evaluate((id) => !S.logs.some(l => l.id === id), pid)); }
    }

    /* Copia de seguridad: exportar el día 30 e importarla el 31 (ida y vuelta) */
    if (i === 30) {
      await tabGo('ajustes'); await p.click('[data-a="exp"]'); await idle(300);
      lastExport = await p.evaluate(() => window.__export);
      check(k, 'Exportar copia genera JSON sin PIN', lastExport && !JSON.parse(lastExport).settings.pinHash);
    }
    if (i === 31 && lastExport) {
      const n0 = (await S()).logs.length;
      await p.evaluate((txt) => importBackup(txt), lastExport); await idle(300);
      const s1 = await S(); const exp = JSON.parse(lastExport);
      check(k, 'Importar copia restaura los registros del día 30', s1.logs.length === exp.logs.length, { antes: n0, copia: exp.logs.length, despues: s1.logs.length });
      check(k, 'Importar conserva el PIN del dispositivo', !!s1.settings.pinHash);
      // re-registrar lo perdido del día 31 (el usuario lo vuelve a anotar)
    }

    /* Cambio de tema claro/oscuro una vez */
    if (i === 15) { await tabGo('ajustes'); await clickIf('[data-a="theme"][data-x="dark"]'); await tabGo('hoy'); await tabGo('ajustes'); await clickIf('[data-a="theme"][data-x="system"]'); }

    /* 23:55 · la app pasa a segundo plano (se bloquea) */
    await ff(at(k, '23:55'));
    await tabGo('hoy');
    await p.evaluate(() => window.__bg()); await idle(100);
    if (!(await p.$('.lock'))) issue(k, 'privacidad', 'Al ir a segundo plano no se bloquea con PIN');

    /* ---------- Invariantes al final del día ---------- */
    const inv = await p.evaluate(({ k }) => {
      const raw = localStorage.getItem('plan20.v1'), all = Object.keys(localStorage).reduce((a, x) => a + (localStorage.getItem(x) || '').length + x.length, 0);
      const bad = S.logs.filter(l => !validDate(l.date) || l.date > today() || l.date < S.settings.start).length;
      const dupIds = S.logs.length - new Set(S.logs.map(l => l.id)).size;
      const w = cal().weekOf(k), st = weekStats(w);
      const expMin = S.logs.filter(l => l.type === 'aero' && l.date >= st.a && l.date <= st.b && C.DONE_STATES.includes(l.status)).reduce((a, l) => a + (+l.data.min || 0), 0);
      // racha independiente
      let cur = 0; for (let d = k; d >= S.settings.start; d = addDays(d, -1)) { const r = S.days[d] && S.days[d].p && S.days[d].p.res; if (r === 'no') cur++; else if (d === k && !r) continue; else break; }
      const si = streakInfo();
      const epsDays = new Set(S.logs.filter(l => l.type === 'impulso' && l.data.res === 'si').map(l => l.date));
      const epsInconsist = Object.entries(S.days).filter(([d, v]) => !!(v.p && v.p.res === 'yes') !== epsDays.has(d) && !(v.p && v.p.manual && v.p.manual.res === 'yes')).map(([d, v]) => ({ d, p: v.p, imp: S.logs.filter(l => l.date === d && l.type === 'impulso').map(l => ({ id: l.id, res: l.data.res, usado: l.data.usado, ts: l.ts })) }));
      const nodes = document.getElementsByTagName('*').length;
      return { bytes: raw.length, allBytes: all, logs: S.logs.length, bad, dupIds, w, minT: st.minT, expMin, streak: si.cur, best: si.best, indepStreak: cur, eps: si.total, epsInconsist,
        chat: S.ai.chat.length, mem: S.mind.mem.length, mindDays: Object.keys(S.mind.days).length, reviews: Object.keys(S.reviews).length, spent: S.ai.spent, calls: S.ai.calls,
        shEvents: (S.shield && S.shield.events || []).length, shUsage: Object.keys((S.shield && S.shield.usage) || {}).length, nodes, weekPlans: Object.keys(S.weekPlans).length, studyDue: S.studyDue.length };
    }, { k });
    { const m = await cdp.send('Performance.getMetrics'); inv.heap = +((m.metrics.find(x => x.name === 'JSHeapUsedSize') || {}).value / 1048576).toFixed(1); inv.listeners = (m.metrics.find(x => x.name === 'JSEventListeners') || {}).value; }
    if (inv.bad) issue(k, 'datos', 'Registros con fecha inválida/futura/anterior al inicio', inv.bad);
    if (inv.dupIds) issue(k, 'datos', 'IDs de registro duplicados', inv.dupIds);
    if (inv.minT !== inv.expMin) issue(k, 'progreso', 'Minutos de la semana no cuadran con los registros', { minT: inv.minT, exp: inv.expMin });
    if (inv.streak !== inv.indepStreak) issue(k, 'racha', 'Conteo de días de la Meta P no coincide con el cálculo independiente', { app: inv.streak, indep: inv.indepStreak });
    if (inv.epsInconsist.length) issue(k, 'datos', 'Día marcado con recaída sin registro de impulso (o al revés)', inv.epsInconsist);
    const notifs = await p.evaluate(() => JSON.parse(localStorage.getItem('__sim.notifs') || '{}'));
    Object.assign(eDay, inv, { day: k, dow: wd, impulse, relapse, restarts, notifs: Object.keys(notifs).sort().join(','), jsErrors: errs.length, secs: +((Date.now() - t0) / 1000).toFixed(1) });
    daily.push(eDay);
    console.log(`${k} S${inv.w} logs=${inv.logs} kb=${(inv.allBytes / 1024).toFixed(0)} racha=${inv.streak}/${inv.best} eps=${inv.eps} IA=$${inv.spent.toFixed(3)} (${inv.calls}) chat=${inv.chat} nodos=${inv.nodes} heap=${inv.heap}MB lst=${inv.listeners} ${eDay.secs}s`);
  }

  /* ===================== CHEQUEOS FINALES ===================== */
  const endK = addDays(START, DAYS - 1); curDay = endK;
  await p.evaluate(() => window.__fg()); await unlock(); await idle(500);
  const fin = await p.evaluate(() => {
    const s = S, riskNote = (mindDay(today()).flags || {}).riskNote;
    return { weeks: cal().weekOf(today()), reviews: Object.keys(s.reviews).map(Number).sort((a, b) => a - b), spent: s.ai.spent, budget: s.ai.budget, left: aiLeft(), saver: aiSaver(), pace: spendPace(), logsByType: s.logs.reduce((a, l) => (a[l.type] = (a[l.type] || 0) + 1, a), {}), risk: riskToday(), riskNote, histLen: s.ai.hist.length };
  });
  const notiflog = await p.evaluate(() => JSON.parse(localStorage.getItem('__sim.notiflog') || '[]'));
  const riskNotices = notiflog.filter(n => n.id === 301);
  // Aviso preventivo de riesgo: ¿se programó alguno para la hora de riesgo?
  check(endK, 'Se programan avisos preventivos de riesgo (id 301)', riskNotices.length > 0, { n: riskNotices.length, hora: fin.risk.hora });
  check(endK, 'Todas las semanas completas tienen revisión', fin.reviews.length >= fin.weeks - 1, fin.reviews);
  // Render de progreso con 9 semanas
  await tabGo('progreso'); check(endK, 'Progreso se muestra con 2 meses de datos', !(await renderErr()));
  // Rendimiento
  const byTab = {}; perf.forEach(x => { (byTab[x.tab] = byTab[x.tab] || []).push(x.ms); });
  const perfSum = Object.fromEntries(Object.entries(byTab).map(([t, a]) => [t, { first: +a[0].toFixed(1), last: +a[a.length - 1].toFixed(1), max: +Math.max(...a).toFixed(1) }]));
  const slow = Object.entries(perfSum).filter(([, v]) => v.max > 100);
  slow.forEach(([t, v]) => issue(endK, 'rendimiento', `La pantalla ${t} tarda más de 100 ms en dibujarse`, v));

  /* Caso aparte: hora de riesgo después de medianoche (episodios a las 00:20 y 00:40) → ¿se programa el aviso de las 00:10? */
  { curDay = 'caso 00:40';
    const c2 = await browser.newContext(TAB_S9_FE); await c2.addInitScript(NATIVE_MOCK); const q = await c2.newPage();
    await q.clock.install({ time: at('2026-10-20', '08:00') }); await q.goto(URL); await q.click('#ack');
    for (let r = 0; r < 2; r++) { for (const n of '2580') await q.click(`.pad button[data-n="${n}"]`); await q.click('.pad button[data-ok]'); }
    await q.clock.runFor(1000);
    const r = await q.evaluate(() => { ['00:20', '00:40'].forEach((h, i) => { const d = addDays(today(), -2 - i * 7); S.logs.push({ id: 'x' + i, type: 'impulso', date: d, status: 'done', data: { res: 'si', hora: h }, ts: 1 }); recomputeP(d); }); save(); const md = mindDay(today()); delete md.flags.riskNote; scheduleRiskNotice(); return { hora: riskToday().hora, nota: md.flags.riskNote || null }; });
    await q.clock.runFor(300);
    const n301 = await q.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('__sim.notifs') || '{}')).includes('301'));
    check('caso 00:40', 'Aviso preventivo con hora de riesgo después de medianoche (00:40 → aviso 00:10)', n301, r);
    await c2.close(); }

  await browser.close();
  const summary = { dispositivo: 'Galaxy Tab S9 FE (SM-X510) emulada: 1152×720 CSS @2x, Android 14 WebView, táctil', periodo: `${START} → ${endK} (${DAYS} días)`,
    reinicios: restarts, erroresJS: errs.length, consoleErrors: cerrs.length, chequeos: { total: checks.length, fallidos: checks.filter(c => !c.pass).length },
    hallazgos: issues.map(({ key, ...x }) => x), final: fin, rendimientoMs: perfSum, avisosRiesgo: riskNotices.slice(0, 10), diario: daily };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 1));
  console.log('\n==== RESUMEN ====');
  console.log(JSON.stringify({ ...summary, diario: undefined, avisosRiesgo: undefined }, null, 1));
  process.exit(issues.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
