/* Plan 20 · v2.5 — BRÚJULA: motor personal que anticipa, elige lo que te funciona y ajusta el plan.
   Todo se calcula en la tablet a partir de TU historial (sin coste de IA y sin internet).
   Módulos:
   1. Línea de tiempo: un registro por día/noche con sueño, movimiento, energía, pantalla, impulsos y episodios.
   2. Riesgo: probabilidad de episodio esta noche (bayesiano ingenuo con encogimiento) + reloj de 24 h
      (estadística circular: 23:50 y 00:10 son la misma franja). Mientras hay pocos datos usa las reglas de siempre.
   3. Qué te funciona: tasa de éxito de cada respuesta (alternativas del protocolo, pausas del Escudo).
   4. Ajuste semanal: las 8 reglas del manual (sección 27) aplicadas en orden a tus datos; propone UN cambio.
   5. Orquestador: aviso preventivo antes de tu ventana, recordatorio de movimiento, ventanas dinámicas del Escudo,
      con un tope diario de interrupciones.
   6. Tendencias y acierto: alertas de cambio (sueño, movimiento, racha, episodios) y medida honesta de su precisión.
   Además: órdenes locales tipo "¿cómo voy?", "riesgo esta noche", "pausa 5 min" (sin IA) y voz (lectura y manos libres).
   Nunca cambia el plan ni bloquea la tablet sin que la persona lo pida o lo apruebe. */
'use strict';

/* ======================================================================
   ESTADO Y AJUSTES
   ====================================================================== */
DEFAULT.bj = { on: true, voice: false, handsFree: false, nudges: 2, mods: { riesgo: true, funciona: true, dosis: true, orquesta: true, alertas: true }, doseDone: {} };
function bjInitState() {
  S.bj = Object.assign(structuredClone(DEFAULT.bj), S.bj || {});
  S.bj.mods = Object.assign(structuredClone(DEFAULT.bj.mods), S.bj.mods || {});
  if (!S.bj.doseDone || typeof S.bj.doseDone !== 'object') S.bj.doseDone = {};
}
bjInitState();
const bjOn = (m) => { if (!S.bj || !S.bj.mods) bjInitState(); return S.bj.on !== false && (!m || S.bj.mods[m] !== false); };
const BJ_MODS = [['riesgo', 'Anticipar el riesgo', 'Probabilidad y ventana de esta noche'], ['funciona', 'Qué te funciona', 'Ordena tus respuestas por eficacia real'], ['dosis', 'Ajuste semanal', 'Las 8 reglas del manual sobre tus datos'], ['orquesta', 'Avisos inteligentes', 'Aviso antes de tu ventana y recordatorio de movimiento'], ['alertas', 'Tendencias', 'Te avisa de cambios en sueño, movimiento y racha']];

/* Caché: se invalida con cada guardado (los cálculos recorren todo el historial) */
let bjCache = {};
const _bjSave = save; save = function () { bjCache = {}; return _bjSave.apply(this, arguments); };
const _bjCommit = commit; commit = function (fn) { bjCache = {}; const r = _bjCommit(fn); bjCache = {}; return r; };
const bjMemo = (key, fn) => (key in bjCache ? bjCache[key] : (bjCache[key] = fn()));

/* Utilidades */
const bjClamp = (x, a, b) => Math.max(a, Math.min(b, x));
const bjLogit = (p) => Math.log(p / (1 - p));
const bjSig = (z) => 1 / (1 + Math.exp(-z));
const bjHM = (x) => { x = ((Math.round(x) % 1440) + 1440) % 1440; return `${pad2(Math.floor(x / 60))}:${pad2(x % 60)}`; };
const bjMin = (h) => { const m = /^(\d{1,2}):(\d{2})/.exec(h || ''); return m ? ((+m[1]) * 60 + (+m[2])) % 1440 : null; };
const bjPct = (p) => `${Math.round(p * 100)} %`;
const bjX = (m) => `×${(Math.round(m * 10) / 10).toFixed(1).replace('.', ',')}`;
const bjNum = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString().replace('.', ',');
const bjLvl = (l) => ['bajo', 'medio', 'alto'][l] || 'bajo';
const bjMidnight = (k) => fromKey(k).getTime();
IC.compass = '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>';
IC.voice = '<path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/>';

/* ======================================================================
   1. LÍNEA DE TIEMPO
   ====================================================================== */
function bjIndex() {
  return bjMemo('idx', () => { const m = {}; S.logs.forEach(l => { (m[l.date] = m[l.date] || []).push(l); }); return m; });
}
const bjLogs = (k, t) => (bjIndex()[k] || []).filter(l => !t || l.type === t);
function bjLabel(k) { const r = S.days[k] && S.days[k].p && S.days[k].p.res; return r === 'yes' ? 1 : r === 'no' ? 0 : null; }
function bjSleep(k) { const l = bjLogs(k, 'sueno').find(x => x.data && x.data.horas != null && x.data.horas !== ''); return l ? +l.data.horas : null; }
function bjScreenMin(night) { const u = (S.shield && S.shield.usage && S.shield.usage[night]) || {}; const watch = new Set([].concat((S.shield.cfg || {}).apps || [], (S.shield.cfg || {}).watch || [])); return Object.entries(u).filter(([p]) => !watch.size || watch.has(p)).reduce((a, [, ms]) => a + (+ms || 0), 0) / 60000; }
/* Factores conocidos para la noche del día k. full=true: el día ya terminó (entrenamiento o días pasados). */
function bjFeatures(k, full) {
  const out = [], d = fromKey(k).getDay(), h = nowH();
  out.push({ id: 'dow' + d, label: `es ${DOW[d]}` });
  const sl = bjSleep(k); if (sl != null && sl < 6.5) out.push({ id: 'sueno', label: `dormiste ${bjNum(sl)} h` });
  if (full || (k === today() && h >= 18)) {
    const mov = bjLogs(k).some(l => (l.type === 'aero' || l.type === 'fuerza') && C.DONE_STATES.includes(l.status));
    if (!mov) out.push({ id: 'sinmov', label: 'no te moviste' });
  }
  const cl = S.days[k] && S.days[k].close; if (cl && cl.energia === 'Baja') out.push({ id: 'energia', label: 'energía baja' });
  const y1 = addDays(k, -1), y2 = addDays(k, -2);
  if (bjLabel(y1) === 1 || bjLabel(y2) === 1) out.push({ id: 'reciente', label: 'hubo un episodio hace 1-2 días' });
  const p1 = S.days[y1] && S.days[y1].p;
  if ((p1 && (p1.imp === 'used' || p1.imp === 'notused')) || bjLogs(y1, 'impulso').length) out.push({ id: 'impAyer', label: 'ayer tuviste un impulso' });
  if (bjScreenMin(y1) >= 20) out.push({ id: 'pantalla', label: 'anoche pasaste 20+ min en apps vigiladas' });
  return out;
}

/* ======================================================================
   2. RIESGO: modelo aprendido + reloj de 24 h
   ====================================================================== */
/* Días con dato (etiqueta: hubo o no episodio), en orden, con sus factores */
function bjRows() {
  return bjMemo('rows', () => { const k0 = today(), rows = []; for (let d = S.settings.start; d < k0 && rows.length < 400; d = addDays(d, 1)) { const y = bjLabel(d); if (y !== null) rows.push({ d, y, f: bjFeatures(d, true).map(x => x.id) }); } return rows; });
}
/* Peso de un factor: razón de verosimilitud suavizada y encogida (con pocos episodios pesa menos) */
const bjW = (a1, a0, n1, n0) => bjClamp(Math.log(((a1 + 0.5) / (n1 + 1)) / ((a0 + 0.5) / (n0 + 1))) * n1 / (n1 + 3), -1.5, 1.8);
const bjBase = (n1, n) => (n1 + 1) / (n + 5);
function bjModel() {
  return bjMemo('model', () => {
    const rows = bjRows(), n1 = rows.filter(r => r.y).length, n0 = rows.length - n1, c = {};
    rows.forEach(r => r.f.forEach(id => { const x = c[id] = c[id] || [0, 0]; x[r.y ? 0 : 1]++; }));
    const w = {}; Object.entries(c).forEach(([id, [a1, a0]]) => { w[id] = { w: bjW(a1, a0, n1, n0), a1, a0 }; });
    return { rows: rows.length, n1, n0, base: bjBase(n1, rows.length), w, ready: n1 >= 4 && rows.length >= 14 };
  });
}
/* Acierto honesto: para cada noche pasada predice SOLO con los días anteriores y compara con lo que pasó
   (Brier frente a la tasa conocida hasta ese día). Así se sabe si el modelo aporta algo o solo ve ruido. */
function bjScore() {
  return bjMemo('score', () => {
    const rows = bjRows(), c = {}, pts = []; let n1 = 0, n0 = 0;
    rows.forEach(r => {
      if (n1 >= 4 && n1 + n0 >= 14) {
        const z = bjLogit(bjBase(n1, n1 + n0)) + 0.8 * r.f.reduce((a, id) => { const x = c[id] || [0, 0]; return a + bjW(x[0], x[1], n1, n0); }, 0);
        pts.push({ p: bjClamp(bjSig(z), 0.02, 0.95), y: r.y, ref: bjBase(n1, n1 + n0) });
      }
      r.f.forEach(id => { const x = c[id] = c[id] || [0, 0]; x[r.y ? 0 : 1]++; }); if (r.y) n1++; else n0++;
    });
    if (!pts.length) return { n: 0 };
    const brier = pts.reduce((a, x) => a + (x.p - x.y) ** 2, 0) / pts.length, ref = pts.reduce((a, x) => a + (x.ref - x.y) ** 2, 0) / pts.length;
    const bins = [[0, 0.2], [0.2, 0.45], [0.45, 1.01]].map(([a, b]) => { const s2 = pts.filter(x => x.p >= a && x.p < b); return { a, b, n: s2.length, pred: s2.length ? s2.reduce((q, x) => q + x.p, 0) / s2.length : 0, real: s2.length ? s2.reduce((q, x) => q + x.y, 0) / s2.length : 0 }; });
    return { n: pts.length, brier, ref, skill: ref > 0 ? 1 - brier / ref : 0, bins };
  });
}
const bjPrudent = () => { const s = bjScore(); return s.n >= 10 && s.skill < -0.02; };
const bjReady = () => bjOn('riesgo') && bjModel().ready && !bjPrudent();
function bjPredict(k = today()) {
  return bjMemo('pred|' + k + '|' + (nowH() >= 18 ? 'e' : 'm'), () => {
    const M = bjModel();
    if (!M.ready || bjPrudent()) {
      const r = _bjRisk0(k), p = bjClamp(M.base * ([0.6, 1.25, 1.9][r.level] || 1), 0.03, 0.9); // reglas simples, calibradas con tu tasa real
      return { p, level: p >= 0.45 ? 2 : p >= 0.2 ? 1 : 0, mode: bjPrudent() ? 'prudente' : 'inicial', reasons: r.reasons, factors: r.reasons.map(t => ({ label: t, mult: null })), hora: r.hora, M };
    }
    const f = bjFeatures(k, k < today());
    const fac = f.map(x => { const s = M.w[x.id] || { w: 0, a1: 0, a0: 0 }; return Object.assign({}, x, { w: s.w, mult: Math.exp(s.w), a1: s.a1, a0: s.a0 }); });
    const z = bjLogit(M.base) + 0.8 * fac.reduce((a, x) => a + x.w, 0);
    const p = bjClamp(bjSig(z), 0.02, 0.95);
    const level = p >= 0.45 ? 2 : p >= 0.2 ? 1 : 0;
    fac.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
    const cv = bjCurve();
    const reasons = fac.filter(x => x.w > 0.15).slice(0, 3).map(x => x.label); // en lenguaje natural (los multiplicadores se ven en Brújula)
    return { p, level, mode: 'aprendido', factors: fac, reasons, hora: cv ? bjHM(cv.peak) : null, M };
  });
}
/* Horas de los momentos difíciles: episodios (peso 1), impulsos (0,5) y pausas del Escudo (0,4) */
function bjPoints() {
  const pts = [];
  S.logs.forEach(l => {
    if (l.type !== 'impulso' || !l.data) return;
    const m = bjMin(l.data.hora);
    if (l.data.res === 'si' && m != null) pts.push({ m, w: 1 });
    else if (m != null) pts.push({ m, w: 0.5 });
    else if (l.data.via === 'protocolo' && l.ts) { const d = new Date(l.ts); pts.push({ m: d.getHours() * 60 + d.getMinutes(), w: 0.5 }); }
  });
  ((S.shield && S.shield.events) || []).forEach(e => { if (e.t && e.kind !== 'test' && e.outcome !== 'other') { const d = new Date(e.t); pts.push({ m: d.getHours() * 60 + d.getMinutes(), w: e.outcome === 'relapse' ? 1 : 0.4 }); } });
  return pts;
}
function bjCurve() {
  return bjMemo('curve', () => {
    const pts = bjPoints(), tot = pts.reduce((a, x) => a + x.w, 0);
    if (pts.length < 2 || tot < 1.5) return null;
    const K = 12, N = 96, dens = [];
    for (let i = 0; i < N; i++) { const th = i / N * 2 * Math.PI; dens.push(pts.reduce((a, x) => a + x.w * Math.exp(K * (Math.cos(th - x.m / 1440 * 2 * Math.PI) - 1)), 0)); }
    let pk = 0; dens.forEach((v, i) => { if (v > dens[pk]) pk = i; });
    const thr = dens[pk] * 0.5; let lo = 0, hi = 0;
    while (lo < 16 && dens[((pk - lo - 1) % N + N) % N] >= thr) lo++;
    while (hi < 16 && dens[(pk + hi + 1) % N] >= thr) hi++;
    lo = Math.max(lo, 2); hi = Math.max(hi, 2); // al menos 1 h de ventana
    const mx = dens[pk];
    return { peak: pk * 15, lo: lo * 15, hi: hi * 15, dens: dens.map(v => v / mx), n: pts.length };
  });
}
/* Ventana de la NOCHE del día k (una hora de madrugada pertenece a la noche anterior) */
function bjWindow(k) {
  const cv = bjCurve(); if (!cv) return null;
  let c = cv.peak; if (c < 360) c += 1440;
  const m0 = bjMidnight(k);
  const d = new Date(m0); d.setMinutes(c - cv.lo); const from = d.getTime(); const e = new Date(m0); e.setMinutes(c + cv.hi); const to = e.getTime();
  const pk = new Date(m0); pk.setMinutes(c);
  return { from, to, peak: pk.getTime(), label: `${bjHM(c - cv.lo)}–${bjHM(c + cv.hi)}` };
}

/* Integración: el resto de la app pasa a usar el riesgo aprendido (Escudo, propuesta, avisos, IA) */
const _bjRisk0 = riskToday;
riskToday = function (k = today()) {
  if (!bjOn('riesgo')) return _bjRisk0(k);
  const base = _bjRisk0(k); if (!bjReady()) return base;
  const pr = bjPredict(k);
  return { level: pr.level, reasons: pr.reasons.length ? pr.reasons : base.reasons, hora: pr.hora || base.hora, eps: base.eps, p: pr.p };
};
const _bjWin0 = riskWindows;
riskWindows = function () {
  if (!bjReady()) return _bjWin0();
  const out = [];
  for (let i = -1; i < 3; i++) {
    const k = addDays(today(), i), pr = bjPredict(k); if (pr.p < 0.2) continue;
    const w = bjWindow(k); if (!w) continue;
    const from = w.from - 30 * 60000, to = w.to + 30 * 60000; if (to <= Date.now()) continue;
    out.push({ from, to, label: `${hhmm(new Date(from))}–${hhmm(new Date(to))}`, day: k, p: Math.round(pr.p * 100) / 100 });
  }
  return out;
};

/* ======================================================================
   3. QUÉ TE FUNCIONA
   ====================================================================== */
function bjWorks() {
  return bjMemo('works', () => {
    const acc = {};
    const add = (name, ok) => { const a = acc[name] = acc[name] || { name, s: 0, n: 0 }; a.n++; if (ok) a.s++; };
    S.logs.forEach(l => {
      if (l.type !== 'impulso' || !l.data) return;
      const d = l.data;
      if (d.res === 'si') { if (d.alt) add(d.alt, false); else if (d.usado === 'si') add('Responder al impulso', false); return; }
      if (!d.alt && d.usado !== 'si') return;
      const y = bjLabel(l.date), ok = d.res === 'no' ? true : y === 0 ? true : y === 1 ? false : null;
      if (ok === null) return;
      add(d.alt || 'Responder al impulso', ok);
    });
    ((S.shield && S.shield.events) || []).forEach(e => { if (e.outcome === 'ok') add('Pausa del Escudo', true); else if (e.outcome === 'relapse') add('Pausa del Escudo', false); });
    return Object.values(acc).map(a => Object.assign(a, { rate: (a.s + 1) / (a.n + 2) })).sort((x, y) => y.rate - x.rate || y.n - x.n);
  });
}
function bjBest() {
  const w = bjOn('funciona') ? bjWorks().filter(x => x.n >= 2 && x.rate >= 0.5 && x.name !== 'Responder al impulso') : [];
  if (w.length) return { name: w[0].name, why: `te funcionó ${w[0].s} de ${w[0].n} veces`, x: w[0] };
  const alt = (S.profile && S.profile.alternativas || [])[0];
  return alt ? { name: alt, why: 'la respuesta que elegiste' } : { name: 'Dejar el teléfono en otro lugar', why: 'respuesta sugerida por el manual' };
}

/* ======================================================================
   4. AJUSTE SEMANAL (sección 27: reglas en orden, un solo cambio)
   ====================================================================== */
function bjDose() {
  return bjMemo('dose', () => {
    const k = today(), cw = Math.max(1, cal().weekOf(k));
    const [a0] = cal().range(cw), elapsed = diffDays(a0, k) + 1;
    const n = elapsed >= 5 || cw === 1 ? cw : cw - 1; if (n < 1) return null;
    const [a, b] = cal().range(n), lim = b < k ? b : k, L2 = logsIn(a, lim), s = weekStats(n);
    const aero = L2.filter(l => l.type === 'aero'), fz = L2.filter(l => l.type === 'fuerza'), sl = L2.filter(l => l.type === 'sueno' && l.data.horas != null).map(l => +l.data.horas);
    const slAvg = sl.length ? sl.reduce((q, x) => q + x, 0) / sl.length : null;
    const walksDone = aero.filter(l => C.DONE_STATES.includes(l.status)).length;
    const barr = (b2) => aero.concat(fz).filter(l => l.status === 'no' && l.data.barrera === b2).length + Object.keys(S.days).filter(d => d >= a && d <= lim && S.days[d].close && S.days[d].close.barrera === b2).length;
    const known = new Set(L2.map(l => l.date)).size;
    const target = cw + 1, wp = weekPlan(target) /* siempre la semana que aún no empieza */, nWalk = Object.values(wp.days).filter(x => x.walk).length, nStr = Object.values(wp.days).filter(x => x.str).length;
    const R = (rule, title, why, action, apply) => ({ week: n, target, rule, title, why, action, apply, done: S.bj.doseDone[n] });
    const opens = Object.keys(S.days).filter(d => d >= a && d <= lim && S.days[d].open && S.days[d].open.sint === 'si').length;
    if (aero.some(l => l.data.sens === 'Con síntomas') || opens) return R(1, 'Síntomas: primero tu salud', 'Registraste síntomas durante la actividad o en la apertura.', 'Detén la actividad implicada y revisa las señales de Cuidado antes de seguir.', null);
    const hungry = L2.filter(l => l.type === 'comida' && l.data.suf === 'no').length, sleepy = L2.filter(l => l.type === 'sueno' && l.data.como === 'Muy somnoliento').length;
    if (hungry || (slAvg != null && sl.length >= 3 && slAvg < 6) || sleepy >= 2) return R(2, 'Necesidades básicas antes que exigencia', hungry ? 'Hubo comida insuficiente esta semana.' : slAvg != null && slAvg < 6 ? `Dormiste de media ${bjNum(slAvg)} h.` : 'Varios días muy somnoliento.', `Reduce la exigencia: caminatas de ${Math.max(10, wp.walkMin - 5)} min la semana ${target}.`, wp.walkMin > 10 ? { walkMin: Math.max(10, wp.walkMin - 5) } : null);
    const pain = aero.filter(l => l.data.dolor === 'si').length + fz.filter(l => l.data.com === 'molestia' || l.data.rec === 'mal' || l.data.tec === 'no').length;
    if (pain) return R(3, 'Dolor o mala recuperación', `${pain} registro${pain > 1 ? 's' : ''} con dolor, molestia o mala recuperación.`, nStr ? `Retira una sesión de fuerza la semana ${target} y revisa la técnica; consulta si persiste.` : `Acorta las caminatas a ${Math.max(10, wp.walkMin - 5)} min y consulta si persiste.`, nStr ? { dropStr: 1 } : wp.walkMin > 10 ? { walkMin: Math.max(10, wp.walkMin - 5) } : null);
    const noTime = barr('Tiempo') + barr('Prioridad'), forgot = barr('Olvido');
    // Regla 4 antes que la 5, salvo que la barrera anotada sea claramente el olvido (entonces sí cabe, pero se olvida)
    if (noTime >= 2 || (s.plannedWalk >= 2 && walksDone < s.plannedWalk / 2 && elapsed >= 5 && !(forgot >= 2 && forgot >= noTime))) {
      const miss = {}; daysOfWeek(n).forEach(d => { const pd = weekPlan(n).days[d]; if (pd && pd.walk && d <= lim && !aero.some(l => l.date === d && C.DONE_STATES.includes(l.status))) { const g = fromKey(d).getDay(); miss[g] = (miss[g] || 0) + 1; } });
      const worst = Object.entries(miss).sort((x, y) => y[1] - x[1])[0];
      return R(4, 'La caminata no cabe en tu agenda', `Hiciste ${walksDone} de ${s.plannedWalk} caminatas previstas${noTime ? ` y ${noTime} veces la barrera fue el tiempo` : ''}.`, worst && nWalk > 1 ? `Quita la caminata del ${DOW[+worst[0]]} la semana ${target} (es el día que más se cae).` : `Acorta las caminatas a ${Math.max(10, wp.walkMin - 5)} min.`, worst && nWalk > 1 ? { dropDow: +worst[0] } : wp.walkMin > 10 ? { walkMin: Math.max(10, wp.walkMin - 5) } : null);
    }
    if (barr('Olvido') >= 2) return R(5, 'Cabe, pero se olvida', `La barrera “olvido” apareció ${barr('Olvido')} veces.`, `Asóciala a una transición visible${S.profile && S.profile.ocasion1 ? ` (después de ${S.profile.ocasion1})` : ''} y activa el recordatorio de movimiento de Brújula.`, { nudge: 1 });
    const rv = S.reviews[n];
    if (rv && rv.q2 === 'Empeoramiento') return R(6, 'Lo haces, pero no da el resultado', 'En tu revisión marcaste empeoramiento.', 'Verifica si lo mides bien, si pasó tiempo suficiente y si el método corresponde a la meta. No añadas carga todavía.', null);
    if (known < 4) return R(8, 'Datos insuficientes', `Solo hay datos de ${known} día${known === 1 ? '' : 's'} de esa semana.`, 'Mantén una versión cómoda y registra solo el dato decisivo (movimiento y sueño).', null);
    const comfy = aero.filter(l => C.DONE_STATES.includes(l.status)), ok = comfy.length && comfy.filter(l => l.data.sens === 'Cómodo').length >= comfy.length / 2;
    if (s.plannedWalk >= 1 && walksDone >= s.plannedWalk && ok && (slAvg == null || slAvg >= 6.5)) return R(7, 'Ayuda, cabe y recuperas bien', `Hiciste ${walksDone} de ${s.plannedWalk} caminatas, casi todas cómodas${slAvg != null ? `, y dormiste ${bjNum(slAvg)} h de media` : ''}.`, wp.walkMin < 45 ? `Mantén. Si quieres progresar, una sola variable: caminatas de ${wp.walkMin + 5} min la semana ${target}.` : 'Mantén: ya estás en el tramo alto de minutos.', wp.walkMin < 45 ? { walkMin: wp.walkMin + 5 } : null);
    return R(7, 'Mantener', `Hiciste ${walksDone} de ${s.plannedWalk} caminatas previstas.`, 'Mantén la misma carga una semana más y observa.', null);
  });
}
function bjApplyDose() {
  const d = bjDose(); if (!d || !d.apply || d.done) return false;
  const wp = structuredClone(weekPlan(d.target));
  const ks = Object.keys(wp.days).sort();
  if (d.apply.walkMin) { wp.walkMin = d.apply.walkMin; ks.forEach(x => { if (wp.days[x].walk) wp.days[x].walk = d.apply.walkMin; }); }
  if (d.apply.dropDow != null) { const x = ks.find(y => fromKey(y).getDay() === d.apply.dropDow && wp.days[y].walk); if (x) wp.days[x].walk = 0; }
  if (d.apply.dropStr) { const x = ks.slice().reverse().find(y => wp.days[y].str); if (x) wp.days[x].str = false; }
  const ok = commit(() => {
    if (!d.apply.nudge) { wp.auto = false; S.weekPlans[d.target] = wp; }
    else S.bj.nudges = Math.max(S.bj.nudges || 0, 2);
    S.bj.doseDone[d.week] = { rule: d.rule, at: Date.now() };
  });
  if (ok) { toast(d.apply.nudge ? 'Recordatorio de movimiento activado' : `Semana ${d.target} ajustada`); bjOrchestrate(true); }
  return ok;
}
window.bjApplyDoseUI = (btn) => { if (bjApplyDose() && btn) btn.outerHTML = '<span class="pill ok">Aplicado</span>'; };

/* ======================================================================
   5. TENDENCIAS
   ====================================================================== */
function bjTrends() {
  return bjMemo('trends', () => {
    const k = today(), out = [];
    const sleeps = []; for (let i = 0; i < 10; i++) { const d = addDays(k, -i), h = bjSleep(d); if (h != null) sleeps.push({ d, h, i }); }
    const s3 = sleeps.filter(x => x.i < 3), s7 = sleeps.filter(x => x.i >= 3);
    if (s3.length >= 2 && s7.length >= 2) { const a = s3.reduce((q, x) => q + x.h, 0) / s3.length, b = s7.reduce((q, x) => q + x.h, 0) / s7.length; if (a < 6 && b - a >= 0.75) out.push({ id: 'sueno', t: 'warn', text: `Tu sueño bajó a ${bjNum(a)} h de media en los últimos días (antes ${bjNum(b)} h). Con poco sueño el manual pide reducir exigencia antes de progresar.` }); }
    const cw = Math.max(1, cal().weekOf(k));
    if (cw > 1) {
      const [a1] = cal().range(cw), el = diffDays(a1, k), [a2] = cal().range(cw - 1);
      const now = logsIn(a1, k, 'aero').filter(l => C.DONE_STATES.includes(l.status)).reduce((q, l) => q + (+l.data.min || 0), 0);
      const prev = logsIn(a2, addDays(a2, el), 'aero').filter(l => C.DONE_STATES.includes(l.status)).reduce((q, l) => q + (+l.data.min || 0), 0);
      if (el >= 3 && prev >= 40 && now < prev / 2) out.push({ id: 'mov', t: 'warn', text: `Esta semana llevas ${now} min de movimiento; a esta altura de la semana pasada llevabas ${prev}. ¿Algo cambió en tu agenda?` });
    }
    const last = S.logs.reduce((a, l) => (l.date > a ? l.date : a), '');
    if (last && diffDays(last, k) >= 3) out.push({ id: 'silencio', t: 'info', text: `Hace ${diffDays(last, k)} días que no registras nada. No pasa nada: cuéntame cómo van las cosas en una frase y retomamos.` });
    const st = streakInfo();
    if (st.cur >= 3 && st.cur === st.best) out.push({ id: 'record', t: 'ok', text: `Estás en tu récord: ${st.cur} días seguidos. Cada noche que sumas es nueva para ti.` });
    else if (st.best >= 3 && st.cur === st.best - 1) out.push({ id: 'record', t: 'ok', text: `Hoy puedes igualar tu récord de ${st.best} días.` });
    const eps = episodes(), e7 = eps.filter(e => diffDays(e.date, k) < 7).length, e21 = eps.filter(e => { const x = diffDays(e.date, k); return x >= 7 && x < 28; }).length;
    if (S.ai.shareP === false) return out.filter(x => x.id !== 'record'); // privacidad: sin datos de la Meta P
    if (e7 >= 2 && e7 > e21 / 3) out.push({ id: 'eps', t: 'warn', text: `Esta semana hubo ${e7} episodios, más que tu ritmo habitual. Sin culpa: es información. ¿Reforzamos la noche (Escudo o dejar el teléfono fuera) o revisamos qué cambió?` });
    return out;
  });
}

/* ======================================================================
   6. ORQUESTADOR: registra la predicción del día y programa los avisos
   ====================================================================== */
async function bjCancel(ids) { const LN = P('LocalNotifications'); if (!LN) return; try { await LN.cancel({ notifications: ids.map(id => ({ id })) }); } catch (e) {} }
function bjOrchestrate(force) {
  if (!S.profile || !unlocked) return;
  if (!bjOn('orquesta')) return;
  const k = today(), md = mindDay(k), now = new Date(), budget = S.bj.nudges == null ? 2 : +S.bj.nudges;
  let used = 0;
  const pr = bjPredict(k), w = bjReady() ? bjWindow(k) : null;
  if (budget > used && w && pr.level >= 1) {
    const at = new Date(w.from - 30 * 60000);
    if (at > now && (force || md.flags.bjNote !== hhmm(at))) {
      md.flags.bjNote = hhmm(at); md.flags.riskNote = hhmm(at); _bjSave();
      scheduleOne(301, `Plan 20 · en un rato: ${bjBest().name.toLowerCase()}`, at);
    }
    used++;
  }
  const pd = weekPlan(Math.max(1, cal().weekOf(k))).days[k] || {};
  const moved = bjLogs(k).some(l => (l.type === 'aero' || l.type === 'fuerza') && l.status !== 'nd');
  if (budget > used && pd.walk && !moved) {
    const at = new Date(now); at.setHours(18, 30, 0, 0);
    if (at > now && (force || !md.flags.bjMove)) { md.flags.bjMove = 1; _bjSave(); scheduleOne(302, `Plan 20 · caminata de ${pd.walk} min${S.profile.ocasion1 ? ' después de ' + S.profile.ocasion1 : ''}`, at); }
  } else if (moved && md.flags.bjMove && md.flags.bjMove !== 'x') { md.flags.bjMove = 'x'; _bjSave(); bjCancel([302]); }
}
const _bjNotice0 = scheduleRiskNotice;
scheduleRiskNotice = function () { if (bjOn('orquesta') && bjReady()) return bjOrchestrate(); return _bjNotice0(); };
const _bjAfter = afterUnlock;
afterUnlock = function (first) { _bjAfter(first); try { bjOrchestrate(); } catch (e) { console.error(e); } };
let bjDay = null; // el cambio de día con la app abierta también reprograma (checkDay quedó fijado en su propio intervalo)
setInterval(() => { if (!unlocked) return; const k = today(); if (k !== bjDay) { bjDay = k; try { bjOrchestrate(); } catch (e) { console.error(e); } } }, 60000);

/* Mensaje proactivo diario (sin coste): la tendencia más importante */
const _bjProactive = proactive;
proactive = function () {
  _bjProactive();
  if (!bjOn('alertas') || !S.profile) return;
  const md = mindDay(today()); if (md.flags.bjAlert) return;
  const t = bjTrends().filter(x => S.ai.shareP !== false || (x.id !== 'eps' && x.id !== 'record'));
  if (!t.length) return;
  md.flags.bjAlert = t[0].id;
  S.ai.chat.push({ role: 'assistant', local: true, t: Date.now(), content: '🧭 ' + t[0].text, cards: [{ type: 'bj', v: 'tendencias' }] });
  _bjSave();
};

/* ======================================================================
   INFORMES (texto) — los usan el asistente, las órdenes locales y la IA
   ====================================================================== */
function bjRiskText(k = today()) {
  const pr = bjPredict(k), w = bjWindow(k), b = bjBest();
  if (pr.mode === 'inicial' && !episodes().length) return `Aún no tengo episodios para calcular tu riesgo; por ahora vigilo con las reglas del manual. Tu respuesta preparada: **${b.name}**.`;
  const when = w ? `, más probable entre **${w.label}**` : pr.hora ? `, hacia las ${pr.hora}` : '';
  const why = pr.mode === 'aprendido' ? pr.factors.filter(x => x.w > 0.15).slice(0, 3).map(x => `${x.label} (${bjX(x.mult)})`) : pr.reasons.slice(0, 2);
  return `Esta noche: riesgo **${bjLvl(pr.level)} (${bjPct(pr.p)})**${when}.${why.length ? ` Pesa: ${why.join(', ')}.` : ''} Tu mejor respuesta: **${b.name}** (${b.why}).${pr.mode !== 'aprendido' ? ` (Modo ${pr.mode}: aprendo con cada día que marcas.)` : ''}`;
}
function bjWorksText() {
  const w = bjWorks();
  if (!w.length) return 'Todavía no tengo datos de qué te funciona. Cada vez que uses el protocolo “Tengo un impulso” y marques cómo terminó la noche, lo aprendo.';
  return 'Lo que te funciona, de más a menos:\n' + w.slice(0, 5).map(x => `- **${x.name}**: ${x.s} de ${x.n} veces sin recaída`).join('\n');
}
function bjDoseText() { const d = bjDose(); return d ? `Ajuste para la semana ${d.target} (regla ${d.rule}: ${d.title}). ${d.why} ${d.action}${d.done ? ' (ya aplicado)' : ''}` : 'Aún no hay una semana con datos suficientes para proponer un ajuste.'; }
function bjStatusText() {
  const k = today(), cw = Math.max(1, cal().weekOf(k)), s = weekStats(cw), st = streakInfo();
  const walks = logsIn(s.a, s.b, 'aero').filter(l => C.DONE_STATES.includes(l.status)).length;
  const parts = [`**Semana ${cw}${cw <= 20 ? ` · fase ${phaseOf(cw)}` : ' · mantenimiento'}**: ${s.minT} min de movimiento (${s.minM} moderados), ${walks}/${s.plannedWalk} caminatas, fuerza ${s.fz}/${s.plannedStr}, ${s.comida} comidas y ${s.estudio} bloques de estudio registrados.`];
  if (S.ai.shareP !== false) parts.push(`${L().meta}: ${st.cur} día${st.cur === 1 ? '' : 's'} seguido${st.cur === 1 ? '' : 's'} (récord ${st.best}).`);
  if (bjOn('riesgo') && S.ai.shareP !== false) parts.push(bjRiskText(k));
  if (bjOn('dosis')) { const d = bjDose(); if (d) parts.push(`Ajuste sugerido: ${d.action}`); }
  if (bjOn('alertas')) { const t = bjTrends()[0]; if (t) parts.push(t.text); }
  return parts.join('\n\n');
}
function bjTodayText() {
  const k = today(), { prop } = dayPlan(k), due = S.studyDue.filter(x => !x.done && x.date <= k), d = S.days[k] || {};
  const out = [`**Hoy, ${fmt(k, true)}:**`, `- Movimiento: ${prop.movimiento}`, `- Estudio: ${prop.estudio}`, `- Comidas: desayuno ${(prop.desayuno || '').toLowerCase()}; almuerzo ${(prop.almuerzo || '').toLowerCase()}; cena ${(prop.cena || '').toLowerCase()}`];
  if (S.ai.shareP !== false) out.push(`- ${L().meta}: ${prop.metap}`);
  if (due.length) out.push(`- Repasos pendientes: ${due.slice(0, 3).map(x => x.tema).join(', ')}`);
  const pend = [!d.open ? 'la apertura del día' : '', !d.close && nowH() >= 18 ? 'el cierre' : ''].filter(Boolean);
  if (pend.length) out.push(`Te falta ${pend.join(' y ')}.`);
  return out.join('\n');
}
/* Bloque para la IA: sus conclusiones ya calculadas (la IA gasta menos y acierta más) */
function bjBrief() {
  if (!bjOn()) return '';
  const out = ['BRÚJULA (motor local; úsalo como verdad calculada, no lo contradigas sin datos):'];
  if (bjOn('riesgo') && S.ai.shareP !== false) { const pr = bjPredict(); out.push(`- Riesgo esta noche: ${bjLvl(pr.level)} ${bjPct(pr.p)} (modo ${pr.mode})${bjWindow(today()) ? ', ventana ' + bjWindow(today()).label : ''}; factores: ${pr.mode === 'aprendido' ? pr.factors.slice(0, 4).map(x => `${x.label} ${bjX(x.mult)}`).join(', ') : pr.reasons.join('; ') || 'ninguno'}.`); }
  if (bjOn('funciona') && S.ai.shareP !== false) { const w = bjWorks(); if (w.length) out.push('- Qué le funciona: ' + w.slice(0, 4).map(x => `${x.name} ${x.s}/${x.n}`).join(', ') + '.'); out.push(`- Mejor respuesta para hoy: ${bjBest().name}.`); }
  if (bjOn('dosis')) out.push('- ' + bjDoseText());
  if (bjOn('alertas')) bjTrends().forEach(t => out.push('- Tendencia: ' + t.text));
  const sc = bjScore(); if (sc.n >= 7) out.push(`- Acierto del motor (prueba con su historial, ${sc.n} noches): ${Math.round(sc.skill * 100)} % frente a una tasa fija${bjPrudent() ? '; no aporta aún, usa reglas simples' : ''}.`);
  return out.join('\n');
}
const _bjPatterns = patternsBlock;
patternsBlock = function () { const b = bjBrief(); return _bjPatterns() + (b ? '\n\n' + b : ''); };
const _bjRules = agentRules;
agentRules = function () {
  return _bjRules() + `
- BRÚJULA: tienes un motor local que ya calculó riesgo, ventana horaria, qué le funciona, ajuste semanal y tendencias (bloque BRÚJULA). Úsalo para anticiparte como un asistente personal atento: menciona la ventana y la respuesta que mejor le funciona cuando sea relevante, propone el ajuste semanal en la revisión y aplícalo con la herramienta brujula SOLO si la persona lo acepta. Nunca presentes una probabilidad como certeza.`;
};
const _bjLocalBrief = localBriefText;
localBriefText = function (k) {
  const base = _bjLocalBrief(k);
  if (!bjOn('riesgo') || S.ai.shareP === false) return base;
  const w = bjWindow(k), pr = bjPredict(k);
  return base + `\n\n🧭 Brújula: riesgo ${bjLvl(pr.level)} esta noche${w && pr.level ? ` (${w.label})` : ''}. Tu mejor respuesta: **${bjBest().name}**.`;
};

/* Herramienta para la IA */
TOOLS2.push({ name: 'brujula', description: 'Motor Brújula. "informe": riesgo, ventana, qué funciona, ajuste semanal y tendencias. "aplicar_ajuste": aplica el ajuste semanal propuesto (SOLO si la persona lo aceptó). "abrir": muestra la pantalla Brújula.', input_schema: { type: 'object', properties: { accion: { type: 'string', enum: ['informe', 'aplicar_ajuste', 'abrir'] } }, required: ['accion'] } });
QUERY_TOOLS.push('brujula');
TOOLS2.find(t => t.name === 'mostrar').input_schema.properties.vista.enum.push('brujula');
const _bjRunTool = runTool;
runTool = function (name, x, ctx) {
  if (name !== 'brujula') return _bjRunTool(name, x, ctx);
  x = x || {};
  if (x.accion === 'aplicar_ajuste') { const d = bjDose(); if (!d || !d.apply) return { result: 'No hay un ajuste aplicable.' }; if (d.done) return { result: 'Ya estaba aplicado.' }; return bjApplyDose() ? { result: 'Ajuste aplicado: ' + d.action, card: { type: 'chip', text: 'Ajuste aplicado: ' + d.action } } : { result: 'ERROR al guardar.' }; }
  if (x.accion === 'abrir') return { result: 'Mostrado.', card: { type: 'bj', v: 'riesgo' } };
  return { result: bjBrief() + '\n' + bjWorksText() };
};

/* ======================================================================
   ÓRDENES LOCALES (sin IA, al instante)
   ====================================================================== */
const bjNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;:«»"“”]/g, ' ').replace(/\s+/g, ' ').trim();
const BJ_TABS = { progreso: 'progreso', plan: 'plan', revision: 'revision', guia: 'guias', guias: 'guias', escudo: 'escudo', ajustes: 'ajustes', brujula: 'brujula', historial: 'hist', memoria: 'memoria', registrar: 'registrar', detalle: 'detalle' };
function bjCommand(text) {
  const t = bjNorm(text); if (!t || t.split(' ').length > 12) return null;
  const P2 = S.ai.shareP !== false;
  if (/^(que puedes hacer|ayuda|comandos|que sabes hacer|que haces)$/.test(t)) return { text: 'Puedo responderte al instante, sin IA:\n- «¿cómo voy?» · resumen de tu semana\n- «¿qué me toca hoy?»\n- «riesgo esta noche»\n- «¿qué me funciona?»\n- «¿qué ajusto?» · ajuste semanal\n- «pausa 5 minutos» · bloquea la tablet\n- «abre progreso / plan / escudo / brújula…»\n- «lee en voz alta» o «silencio»\nPara todo lo demás (contarme tu día, pedir ideas) uso la IA.', card: { type: 'bj', v: 'riesgo' } };
  if (/^(como voy|como vamos|como va todo|resumen|estado|informe|reporte|dame (un|el) (resumen|informe|reporte)( de la semana)?|como va mi semana)$/.test(t)) return { text: bjStatusText(), card: { type: 'bj', v: 'estado' } };
  if (/(que (me )?toca hoy|plan (de|para) hoy|que hago hoy|agenda de hoy|que tengo hoy)/.test(t)) return { text: bjTodayText(), card: null };
  if (P2 && /(\briesgo\b|\bpeligro\b|como (viene|pinta|se ve) (la|esta) noche|^esta noche$)/.test(t)) return { text: bjRiskText(), card: { type: 'bj', v: 'riesgo' } };
  if (P2 && /(que me (funciona|sirve|ayuda)|mejor (respuesta|alternativa)|que (respuesta|alternativa) (uso|me conviene))/.test(t)) return { text: bjWorksText() + `\n\nPara esta noche te propongo **${bjBest().name}**.`, card: { type: 'bj', v: 'funciona' } };
  if (/(que ajusto|ajuste (de la |semanal)|como ajusto|ajusta(r)? (mi|la) semana)/.test(t)) return { text: bjDoseText(), card: { type: 'bj', v: 'ajuste' } };
  const pm = /^(pausa|pausar|bloquea|bloquear|bloquea la tablet|pausa la tablet)( la tablet| la pantalla)?( de)?( (\d{1,2}) ?(min|minutos?))?( ahora)?$/.exec(t);
  if (pm) {
    if (!SHN()) return { text: 'La pausa de pantalla solo funciona en la app instalada en la tablet.' };
    const n = bjClamp(+(pm[5] || S.shield.cfg.minutes || 5), 1, 15);
    return { text: `Hecho: pongo la tablet en pausa ${n} minuto${n === 1 ? '' : 's'}. Respira; al volver seguimos.`, after: () => setTimeout(() => shieldLock(n, 'manual'), 800) };
  }
  if (/^(tengo|siento) (un |una )?(impulso|urgencia)( ahora)?$/.test(t)) return { text: `Aquí estoy. Abro la pausa guiada. Tu mejor respuesta ahora: **${bjBest().name}**.`, after: () => setTimeout(() => protocol(), 600) };
  const om = /^(abre|abrir|muestra|muestrame|mostrar|ve a|ir a|llevame a|abreme) (el |la |mi |mis |los |las )?(progreso|plan|revision|guias?|escudo|ajustes|brujula|historial|memoria|registrar|detalle)$/.exec(t);
  if (om) { const dest = BJ_TABS[om[3]]; return { text: `Abriendo ${om[3] === 'brujula' ? 'Brújula' : om[3]}.`, after: () => setTimeout(() => { if (dest === 'hist') openHistory(); else { tab = dest; route(); } }, 500) }; }
  if (/^(lee|leeme|habla|hablame)( en voz alta| las respuestas| en voz)?$|^activa la voz$/.test(t)) return { text: 'Listo: a partir de ahora leo mis respuestas en voz alta. Di «silencio» para que pare.', set: { voice: true } };
  if (/^(silencio|callate|desactiva la voz|no hables|para de hablar)$/.test(t)) return { text: 'Entendido, solo texto.', set: { voice: false, handsFree: false }, mute: true };
  return null;
}
const _bjAgentSend = agentSend;
agentSend = async function (text, opts = {}) {
  if (agentBusy || !text) return;
  if (!opts.hidden && !opts.silentUser && bjOn() && !ALARM.test(text)) {
    const r = bjCommand(text);
    if (r) {
      commit(() => {
        if (r.set) Object.assign(S.bj, r.set);
        S.ai.chat.push({ role: 'user', content: text, t: Date.now() });
        S.ai.chat.push({ role: 'assistant', local: true, bj: true, content: r.text, t: Date.now(), cards: r.card ? [r.card] : [] });
        S.ai.chat = S.ai.chat.slice(-80);
      });
      micText = ''; route();
      if (r.mute) bjStop(); else bjSpeak(r.text);
      if (r.after) r.after();
      return;
    }
  }
  const n0 = S.ai.chat.length;
  await _bjAgentSend(text, opts);
  const last = S.ai.chat[S.ai.chat.length - 1];
  if (last && last.role === 'assistant' && S.ai.chat.length > n0 && !aiReady() && last.local && !last.bjHint) { last.bjHint = 1; last.content += '\n\nSin IA ya entiendo órdenes como «¿cómo voy?», «¿qué me toca hoy?», «riesgo esta noche», «¿qué me funciona?», «pausa 5 minutos» o «abre progreso».'; save(); route(); }
  if (last && last.role === 'assistant' && !last.err) bjSpeak(last.content);
};
chatSend = function (text) { tab = 'hoy'; agentSend(text); };
const _bjBriefing = morningBriefing;
morningBriefing = async function (force) { const n0 = S.ai.chat.length; await _bjBriefing(force); const last = S.ai.chat[S.ai.chat.length - 1]; if (S.ai.chat.length > n0 && last && last.role === 'assistant') bjSpeak(last.content); };

/* ======================================================================
   VOZ: leer respuestas y conversación manos libres
   ====================================================================== */
const VZ = () => P('Voz');
let bjSpeaking = false, bjVoiceL = false;
const bjPlain = (t) => String(t || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*[-•]\s+/gm, '').replace(/[🧭⚠✓★]/g, '').replace(/https?:\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 1200);
function bjAfterSpeak() { bjSpeaking = false; if (S.bj.handsFree && !micOn && unlocked && tab === 'hoy' && !document.querySelector('.proto')) setTimeout(() => { if (!micOn && !bjSpeaking) micStart(); }, 400); }
async function bjSpeak(text, force) {
  if ((!S.bj.voice && !force) || micOn) return;
  const t = bjPlain(text); if (!t) return;
  try {
    if (VZ()) {
      if (!bjVoiceL) { bjVoiceL = true; try { await VZ().addListener('voz', (d) => { if (d && d.state === 'done') bjAfterSpeak(); }); } catch (e) {} }
      bjSpeaking = true; await VZ().speak({ text: t, lang: 'es-US', rate: 1.0 });
    } else if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
      const u = new SpeechSynthesisUtterance(t); u.lang = 'es-ES'; u.onend = bjAfterSpeak; bjSpeaking = true; speechSynthesis.cancel(); speechSynthesis.speak(u);
    }
  } catch (e) { bjSpeaking = false; if (force) errorBox('Voz', (e && e.message) || 'No se pudo usar la voz del sistema. Revisa en Ajustes de Android que haya una voz en español instalada.'); }
}
function bjStop() { bjSpeaking = false; try { if (VZ()) VZ().stop(); else if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} }
/* Manos libres: al terminar una frase con «envía» o «enviar», se envía (lo dices tú; nunca se envía solo) */
function bjVoiceSend() {
  if (!S.bj.handsFree || !micOn) return;
  const m = /^(.*?)[\s,.]*\b(env[ií]a(lo)?|enviar)\s*[.!]?$/i.exec(micCommitted || '');
  if (m && m[1].trim()) { micCommitted = m[1].trim(); micCurrent = ''; micShow(); sendComposer(); }
}
const _bjSegment = micSegment;
micSegment = function (t) { _bjSegment(t); bjVoiceSend(); };
const _bjSegEnded = micSegmentEnded;
micSegmentEnded = function () { _bjSegEnded(); bjVoiceSend(); };
const _bjMicStart = micStart;
micStart = async function () { bjStop(); return _bjMicStart(); };
if (P('App')) P('App').addListener('appStateChange', ({ isActive }) => { if (!isActive) bjStop(); });

/* ======================================================================
   INTERFAZ
   ====================================================================== */
function bjGauge(p, size = 150) {
  const r = size / 2 - 12, cx = size / 2, cy = size / 2 + 6, a0 = Math.PI, a1 = Math.PI * (1 - bjClamp(p, 0, 1));
  const pt = (a) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy - r * Math.sin(a)).toFixed(1)}`;
  const col = p >= 0.45 ? 'var(--s3)' : p >= 0.2 ? 'var(--warn)' : 'var(--s2)';
  return `<svg class="bjgauge" viewBox="0 0 ${size} ${size / 2 + 20}" width="${size}" role="img" aria-label="Riesgo ${bjPct(p)}"><path d="M${pt(a0)} A${r},${r} 0 0 1 ${pt(0)}" stroke="var(--surface-2)" stroke-width="14" fill="none" stroke-linecap="round"/>${p > 0.005 ? `<path d="M${pt(a0)} A${r},${r} 0 0 1 ${pt(a1)}" stroke="${col}" stroke-width="14" fill="none" stroke-linecap="round"/>` : ''}<text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="26" font-weight="700" fill="var(--ink)">${Math.round(p * 100)}%</text></svg>`;
}
function bjClock() {
  const cv = bjCurve(); if (!cv) return '<div class="empty">Tu reloj de riesgo aparece cuando haya al menos dos momentos difíciles con hora (episodios, impulsos o pausas del Escudo).</div>';
  const W = 560, H = 130, pad = 24, xs = (i) => pad + (i / 96) * (W - pad * 2), ys = (v) => H - 22 - v * (H - 40);
  const order = Array.from({ length: 96 }, (_, i) => (i + 48) % 96); // de 12:00 a 12:00: la noche queda en el centro
  const pts = order.map((i, j) => `${xs(j).toFixed(1)},${ys(cv.dens[i]).toFixed(1)}`).join(' ');
  const pos = (m) => { const j = ((Math.round(m / 15) - 48) % 96 + 96) % 96; return xs(j); };
  const lo = pos(cv.peak - cv.lo), hi = pos(cv.peak + cv.hi), now = new Date(), nowX = pos(now.getHours() * 60 + now.getMinutes());
  const band = lo <= hi ? `<rect x="${lo}" y="10" width="${hi - lo}" height="${H - 32}" fill="var(--s3)" opacity=".13" rx="6"/>` : '';
  const ticks = [12, 15, 18, 21, 0, 3, 6, 9].map(h => `<text x="${pos(h * 60)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--ink-3)">${pad2(h)}h</text>`).join('');
  return `<svg class="bjclock" viewBox="0 0 ${W} ${H}" role="img" aria-label="Reloj de riesgo">${band}<polyline points="${xs(0)},${ys(0)} ${pts} ${xs(95)},${ys(0)}" fill="var(--s3)" fill-opacity=".18" stroke="var(--s3)" stroke-width="2"/><line x1="${nowX}" x2="${nowX}" y1="8" y2="${H - 22}" stroke="var(--ink)" stroke-dasharray="3 3"/><text x="${nowX + 4}" y="18" font-size="11" fill="var(--ink-2)">ahora</text>${ticks}</svg><p class="small muted">Pico hacia las <b>${bjHM(cv.peak)}</b> · ventana ${bjHM(cv.peak - cv.lo)}–${bjHM(cv.peak + cv.hi)} · ${cv.n} momentos con hora.</p>`;
}
function bjFactorsHTML(pr) {
  if (pr.mode !== 'aprendido') return `<p class="small muted">Modo ${pr.mode}: ${pr.mode === 'prudente' ? 'al probarme con tu historial no mejoro a una tasa fija (tus episodios aún no siguen un patrón claro), así que uso las reglas simples y sigo aprendiendo.' : `aprendo con cada día que marcas en ${L().meta}. Necesito al menos 4 episodios y 14 días con dato.`}</p>${pr.reasons.length ? `<ul class="small">${pr.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}`;
  const f = pr.factors.filter(x => Math.abs(x.w) > 0.05).slice(0, 6);
  if (!f.length) return '<p class="small muted">Hoy no hay factores que cambien tu riesgo respecto a lo habitual.</p>';
  return `<div class="bjfac">${f.map(x => { const up = x.w > 0, wd = Math.min(100, Math.abs(x.w) / 1.8 * 100); return `<div class="r"><span>${esc(cap1(x.label))}</span><i class="${up ? 'up' : 'dn'}" style="width:${wd.toFixed(0)}%"></i><b>${bjX(x.mult)}</b></div>`; }).join('')}</div><p class="small muted">×2,0 = en tu historial, con ese factor los episodios fueron el doble de probables. Por debajo de ×1 protege.</p>`;
}
function bjWorksHTML() {
  const w = bjWorks();
  if (!w.length) return '<div class="empty">Aún sin datos. Usa “Tengo un impulso”, elige una alternativa y marca cómo terminó la noche: aquí verás qué te funciona a ti.</div>';
  return `<div class="bjfac">${w.slice(0, 6).map(x => `<div class="r"><span>${esc(x.name)}</span><i class="dn" style="width:${Math.round(x.rate * 100)}%"></i><b>${x.s}/${x.n}</b></div>`).join('')}</div><p class="small muted">Veces que la noche terminó sin recaída tras usar cada respuesta. Con pocos usos, la cifra es orientativa.</p>`;
}
function bjDoseHTML(inSheet) {
  const d = bjDose(); if (!d) return '<div class="empty">Cuando haya una semana con datos te propondré un ajuste.</div>';
  const btn = d.apply && !d.done ? `<button class="btn pri" type="button" ${inSheet ? 'onclick="bjApplyDoseUI(this)"' : 'data-a="bjapply"'}>${d.apply.nudge ? 'Activar recordatorio' : `Aplicar a la semana ${d.target}`}</button>` : d.done ? '<span class="pill ok">Aplicado</span>' : '';
  return `<div class="bjdose"><div class="kicker">Regla ${d.rule} de 8 · semana ${d.week}</div><b>${esc(d.title)}</b><p class="small">${esc(d.why)}</p><p>${esc(d.action)}</p>${btn}</div>`;
}
function bjRadar() {
  if (!S.profile || !bjOn('riesgo') || S.ai.shareP === false) return '';
  const k = today(), pr = bjPredict(k), w = bjWindow(k), M = bjModel(), b = bjBest();
  if (pr.mode === 'inicial' && !episodes().length && M.rows < 3) return `<div class="radar lv0"><span class="rl">${ic('compass', 18)} <b>Brújula</b> aprende tus patrones: ${M.rows} de 14 días con dato.</span><button class="mini" data-a="bjopen">Ver</button></div>`;
  return `<div class="radar lv${pr.level}"><span class="rl">${ic('compass', 18)} <b>Esta noche</b> · riesgo ${bjLvl(pr.level)} <b>${bjPct(pr.p)}</b>${w && pr.level ? ` · ${w.label}` : ''} · <span class="muted">${esc(b.name)}</span></span><button class="mini" data-a="bjwhy">${bjWhy ? 'Ocultar' : '¿Por qué?'}</button><button class="mini" data-a="bjopen">Brújula</button>${bjWhy ? `<div class="rwhy">${bjFactorsHTML(pr)}<p class="small">Tu mejor respuesta: <b>${esc(b.name)}</b> (${esc(b.why)}).</p></div>` : ''}</div>`;
}
let bjWhy = false;
wrapScreen('hoy', (h) => h.replace('<div class="vtabs">', bjRadar() + '<div class="vtabs">'));
wrapHandler('hoy', {
  bjwhy: () => { bjWhy = !bjWhy; route(); },
  bjopen: () => { tab = 'brujula'; route(); },
  bjapply: () => { if (bjApplyDose()) route(); }
});
/* Tarjetas del asistente */
const _bjCard = cardHTML;
cardHTML = function (c, mi, ci) {
  if (!c || c.type !== 'bj') return _bjCard(c, mi, ci);
  const open = `<button class="mini" data-a="bjopen">Abrir Brújula</button>`;
  if (c.v === 'riesgo' && bjOn('riesgo')) { const pr = bjPredict(); return `<div class="acard bjcard"><div class="row">${bjGauge(pr.p, 110)}<div><div class="kicker">${ic('compass', 14)} Brújula · esta noche</div><div class="small">${bjWindow(today()) ? 'Ventana ' + bjWindow(today()).label : 'Sin ventana aún'}</div><div class="small">Mejor respuesta: <b>${esc(bjBest().name)}</b></div></div></div>${open}</div>`; }
  if (c.v === 'funciona') return `<div class="acard bjcard"><div class="kicker">${ic('compass', 14)} Qué te funciona</div>${bjWorksHTML()}${open}</div>`;
  if (c.v === 'ajuste') return `<div class="acard bjcard">${bjDoseHTML(false)}</div>`;
  if (c.v === 'estado') { const cw = Math.max(1, cal().weekOf(today())), s = weekStats(cw); return `<div class="acard bjcard"><div class="mstats"><div><b>${s.minT}</b><span>min semana</span></div><div><b>${s.fz}/${s.plannedStr}</b><span>fuerza</span></div><div><b>${streakInfo().cur}</b><span>días ${L().meta}</span></div><div><b>${bjPct(bjPredict().p)}</b><span>riesgo hoy</span></div></div>${open}</div>`; }
  if (c.v === 'tendencias') return `<div class="acard bjcard">${open}</div>`;
  return '';
};

/* Pantalla Brújula */
SCREENS.brujula = () => {
  const k = today(), pr = bjPredict(k), w = bjWindow(k), sc = bjScore(), M = bjModel(), tr = bjTrends(), priv = S.ai.shareP === false;
  const next = [1, 2].map(i => { const d = addDays(k, i), p2 = bjPredict(d); return `<span class="pill">${cap1(DOW[fromKey(d).getDay()])}: ${bjPct(p2.p)}</span>`; }).join(' ');
  const modeTxt = { aprendido: 'Aprendido de tu historial', inicial: 'Aprendiendo (reglas del manual)', prudente: 'Modo prudente' }[pr.mode];
  const tog = (key, on, lbl, hint) => `<div class="bjtog"><div><b>${lbl}</b><div class="small muted">${hint}</div></div><div class="seg"><button data-a="bjset" data-x="${key}|1" class="${on ? 'on' : ''}">Sí</button><button data-a="bjset" data-x="${key}|0" class="${!on ? 'on' : ''}">No</button></div></div>`;
  return `<div class="head"><div><h1>${ic('compass', 26)} Brújula</h1><div class="sub">Tu motor personal: anticipa los momentos difíciles, aprende qué te funciona y ajusta el plan con las reglas del manual. Todo se calcula en esta tablet, sin coste.</div></div><span class="pill ${pr.mode === 'aprendido' ? 'ok' : 'pend'}">${modeTxt}</span></div>
  ${!bjOn() ? '<div class="card alert" style="margin-bottom:18px"><h3>Brújula está apagada</h3><p>La app funciona como antes. Enciéndela abajo, en Controles.</p></div>' : ''}
  <div class="grid">
    ${priv ? `<div class="card c12"><p class="muted">Elegiste no compartir la ${L().meta} con el asistente: Brújula oculta aquí el riesgo y lo que te funciona. Puedes cambiarlo en Ajustes → IA.</p></div>` : `
    <div class="card c5"><h3>Esta noche</h3><div class="row" style="align-items:center;gap:14px">${bjGauge(pr.p)}<div><div class="stat" style="font-size:1.5rem">${cap1(bjLvl(pr.level))}</div><div class="small">${w ? `Más probable: <b>${w.label}</b>` : 'Sin ventana horaria aún'}</div><div class="small muted" style="margin-top:6px">Próximas noches: ${next}</div></div></div>
      <h4>Qué pesa hoy</h4>${bjFactorsHTML(pr)}
      <div class="tip small" style="margin-top:10px">Tu mejor respuesta: <b>${esc(bjBest().name)}</b> · ${esc(bjBest().why)}</div></div>
    <div class="card c7"><h3>Tu reloj de riesgo (24 h)</h3>${bjClock()}
      <h4>Qué hace Brújula con esto</h4><ul class="small"><li>${bjOn('orquesta') ? `Te aviso ${w && pr.level ? `a las <b>${hhmm(new Date(w.from - 30 * 60000))}</b>` : '30 min antes de tu ventana'} con tu mejor respuesta.` : 'Avisos inteligentes apagados.'}</li><li>${S.shield.cfg.enabled && S.shield.cfg.riskOn ? 'El Escudo vigila tu ventana en las noches de riesgo, además de tu franja fija.' : 'Si enciendes el Escudo, vigilará tu ventana en las noches de riesgo.'}</li><li>El asistente conoce este cálculo y lo usa para anticiparse.</li></ul></div>
    <div class="card c6"><h3>Qué te funciona</h3>${bjWorksHTML()}</div>`}
    <div class="card c6"><h3>Ajuste de la semana</h3>${bjOn('dosis') ? bjDoseHTML(false) : '<p class="muted">Módulo apagado.</p>'}</div>
    <div class="card c6"><h3>Tendencias</h3>${tr.length ? tr.map(t => `<div class="bjtr ${t.t}">${esc(t.text)}</div>`).join('') : '<div class="empty">Sin cambios importantes en tus últimos días.</div>'}</div>
    <div class="card c6"><h3>Acierto del motor</h3>${sc.n >= 7 ? `<div class="stat">${sc.skill >= 0 ? '+' : ''}${Math.round(sc.skill * 100)}<small>% vs. tasa fija</small></div><p class="small muted">Probado con tu historial: en ${sc.n} noches pasadas predije usando solo los días anteriores y lo comparé con lo que pasó (puntuación de Brier).${bjPrudent() ? ' Por ahora no mejoro a una tasa fija (tus episodios no siguen un patrón claro todavía), así que uso las reglas simples.' : ''}</p><table class="small"><tr><th>Predije</th><th>Noches</th><th>Hubo episodio</th></tr>${sc.bins.filter(b => b.n).map(b => `<tr><td>${bjPct(b.pred)}</td><td>${b.n}</td><td>${bjPct(b.real)}</td></tr>`).join('')}</table>` : `<div class="empty">Podré medir mi acierto cuando haya al menos 4 episodios y 14 días con dato (y luego 7 noches más para probar).</div>`}<p class="small muted">Datos del modelo: ${M.rows} días con dato, ${M.n1} con episodio.</p></div>
    <div class="card c12"><h3>Controles</h3>
      ${tog('on', bjOn(), 'Brújula encendida', 'Si la apagas, la app vuelve a las reglas simples.')}
      ${BJ_MODS.map(([m, l, h]) => tog('m.' + m, S.bj.mods[m] !== false, l, h)).join('')}
      <div class="bjtog"><div><b>Avisos de Brújula por día</b><div class="small muted">Aviso preventivo y recordatorio de movimiento (aparte de los recordatorios fijos).</div></div><div class="seg">${[0, 1, 2].map(n => `<button data-a="bjnud" data-x="${n}" class="${(S.bj.nudges == null ? 2 : S.bj.nudges) === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      ${tog('voice', S.bj.voice, 'Leer respuestas en voz alta', 'Usa la voz del sistema. Di «silencio» para parar.')}
      ${tog('handsFree', S.bj.handsFree, 'Conversación manos libres', 'Leo la respuesta y vuelvo a escuchar. Para enviar, termina la frase diciendo «envía».')}
      <div class="row"><button class="btn" data-a="bjtest">${ic('voice', 18)} Probar voz</button></div></div>
    <div class="card c12"><h3>Cómo funciona</h3><p class="small">Brújula compara las noches con y sin episodio de tu historial y calcula cuánto cambia el riesgo cada factor (día de la semana, sueño corto, no haberte movido, energía baja, episodios o impulsos recientes, rato en apps vigiladas). Con pocos datos usa las reglas del manual. La hora se calcula en un reloj circular, así que 23:50 y 00:10 cuentan como la misma franja. Lo que te funciona sale de cómo terminó cada noche en que usaste una respuesta. El ajuste semanal aplica las 8 reglas del manual en orden y nunca cambia tu plan sin que lo apruebes. Nada sale de la tablet salvo, si usas la IA, un resumen de estas conclusiones.</p></div>
  </div>`;
};
HANDLERS.brujula = (m) => onAct(m, {
  bjset: (x) => { const [key, v] = x.split('|'); if (commit(() => { if (key.startsWith('m.')) S.bj.mods[key.slice(2)] = v === '1'; else S.bj[key] = v === '1'; if (key === 'handsFree' && v === '1') S.bj.voice = true; if (key === 'voice' && v === '0') S.bj.handsFree = false; })) { if (key === 'voice' || key === 'handsFree') { if (v === '0') bjStop(); } bjOrchestrate(true); route(); } },
  bjnud: (x) => { if (commit(() => { S.bj.nudges = +x; })) { if (+x < 2) bjCancel(+x < 1 ? [301, 302] : [302]); bjOrchestrate(true); route(); } },
  bjapply: () => { if (bjApplyDose()) route(); },
  bjtest: () => bjSpeak(`Hola. Soy Brújula. Esta noche tu riesgo es ${bjLvl(bjPredict().level)}. Tu mejor respuesta: ${bjBest().name}.`, true)
});
wrapScreen('mas', (h) => h.replace('<div class="tiles">', `<div class="tiles"><button class="tile" data-a="go" data-x="brujula">${ic('compass')}<div><b>Brújula</b><div class="muted small">${S.ai.shareP === false ? 'Anticipa y ajusta tu plan' : `Riesgo esta noche: ${bjLvl(bjPredict().level)} · qué te funciona`}</div></div></button>`));
/* En la revisión semanal: el ajuste propuesto, con botón para aplicarlo */
const _bjWeekSummary = weekSummaryHTML;
weekSummaryHTML = function (n) { const base = _bjWeekSummary(n); if (!bjOn('dosis')) return base; const d = bjDose(); return d && d.week === n ? base + `<div class="card" style="margin-top:12px"><h3>${ic('compass', 18)} Brújula propone</h3>${bjDoseHTML(true)}</div>` : base; };

window.bj = { rows: bjRows, predict: bjPredict, curve: bjCurve, window: bjWindow, works: bjWorks, best: bjBest, dose: bjDose, trends: bjTrends, score: bjScore, command: bjCommand, orchestrate: bjOrchestrate, speak: bjSpeak, brief: bjBrief, model: bjModel, features: bjFeatures, applyDose: bjApplyDose, init: bjInitState, clear: () => { bjCache = {}; } };
