/* Plan 20 — app personal basada en el Manual de acción de 20 semanas */
'use strict';
const KEY = 'plan20.v1';
const Cap = window.Capacitor;
const NATIVE = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const P = (n) => (Cap && Cap.Plugins && Cap.Plugins[n]) || null;

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad2 = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const diffDays = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);
const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DOW_S = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmt = (k, long) => { const d = fromKey(k); return long ? `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}` : `${d.getDate()} ${MON[d.getMonth()]}`; };
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const urlDate = new URLSearchParams(location.search).get('date');
const today = () => urlDate || toKey(new Date());

/* ---------- Estado ---------- */
const DEFAULT = {
  v: 1,
  settings: { start: '2026-09-23', pinHash: '', salt: '', discreet: true, streak: false, theme: 'system',
    remind: { on: true, open: '07:00', close: '21:30', review: '18:00' } },
  profile: null, careAck: false,
  days: {}, logs: [], weekPlans: {}, reviews: {}, studyDue: []
};
let S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v) return Object.assign(structuredClone(DEFAULT), s, { settings: Object.assign(structuredClone(DEFAULT.settings), s.settings) }); } catch (e) {}
  return structuredClone(DEFAULT);
}
/* Guardado verificable: devuelve true solo si el almacenamiento aceptó el cambio. */
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); return localStorage.getItem(KEY) !== null; }
  catch (e) { saveFailed(); return false; }
}
/* Transacción: aplica fn(); si no se puede guardar, revierte la memoria y devuelve false. */
function commit(fn) {
  const before = JSON.stringify(S);
  let r;
  try { r = fn(); } catch (e) { S = JSON.parse(before); console.error(e); errorBox('No se pudo completar', 'Ocurrió un error inesperado. No se guardó nada; tus respuestas siguen en pantalla.'); return false; }
  if (r === false) { S = JSON.parse(before); return false; }
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { S = JSON.parse(before); saveFailed(); return false; }
  return r === undefined ? true : r;
}
function saveFailed() { errorBox('No se pudo guardar', 'La tablet rechazó el guardado (el almacenamiento puede estar lleno). No se guardó nada: tus respuestas siguen en el formulario. Libera espacio y pulsa Guardar otra vez, o exporta una copia en Ajustes.'); }
function errorBox(t, m) {
  document.querySelectorAll('.errbox').forEach(x => x.remove());
  const el = document.createElement('div'); el.className = 'errbox'; el.setAttribute('role', 'alert');
  el.innerHTML = `<b>${esc(t)}</b><div>${esc(m)}</div><button class="btn">Entendido</button>`;
  el.querySelector('button').onclick = () => el.remove(); document.body.appendChild(el);
}
const day = (k) => (S.days[k] = S.days[k] || {});
const L = () => S.settings.discreet ? { meta: 'Meta P', metaLong: 'Meta P', act: 'masturbación' } : { meta: 'Meta sexual', metaLong: 'Dejar la masturbación', act: 'masturbación' };

/* ---------- Calendario (20 semanas + mantenimiento) ---------- */
function cal() {
  const s = S.settings.start, off = (1 - fromKey(s).getDay() + 7) % 7;
  const firstMon = addDays(s, off);
  const range = (n) => {
    if (off === 0) { const a = addDays(s, 7 * (n - 1)); return [a, addDays(a, 6)]; }
    if (n === 1) return [s, addDays(firstMon, -1)];
    const a = addDays(firstMon, 7 * (n - 2)); return [a, addDays(a, 6)];
  };
  const weekOf = (k) => {
    if (k < s) return 0;
    if (off === 0) return 1 + Math.floor(diffDays(s, k) / 7);
    if (k < firstMon) return 1;
    return 2 + Math.floor(diffDays(firstMon, k) / 7);
  };
  const end = range(20)[1];
  return { s, range, weekOf, end, total: diffDays(s, end) + 1 };
}
const phaseOf = (w) => w < 1 ? 0 : w > 20 ? 6 : Math.ceil(w / 4);
function daysOfWeek(n) { const [a, b] = cal().range(n); const out = []; for (let k = a; k <= b; k = addDays(k, 1)) out.push(k); return out; }
/* Semana actual (sin tope: después de la 20 sigue el mantenimiento) */
const curWeek = () => Math.max(1, cal().weekOf(today()));
const MAINT = { a: 'Mantenimiento (sección 28): conservar las acciones elegidas con una frecuencia realista, su señal habitual y una alternativa para semanas difíciles.', q: '¿Qué me cuesta más de lo que aporta? ¿Cambió mi situación? ¿Necesito apoyo?', walk: 5, walkMin: 25, str: 2 };
const weekInfo = (n) => n >= 1 && n <= 20 ? C.WEEKS[n] : n > 20 ? MAINT : C.WEEKS[1];

/* Plan semanal. Regla: cada semana HEREDA la carga de la anterior (frecuencia, fuerza, minutos y hoja semanal).
   La propuesta del manual para la fase NO se aplica sola: se ofrece en Plan y tú decides aplicarla
   (así el cambio de fase nunca sobrescribe tu decisión ni cambia varias variables a la vez). */
function proposalPlan(n, walkMin) {
  const W = weekInfo(n), ks = daysOfWeek(n);
  if (walkMin == null) { walkMin = W.walkMin; if (S.profile && S.profile.ruta === 'tolerado' && S.profile.actMin) walkMin = Math.max(walkMin, Math.min(+S.profile.actMin, 45)); }
  const pref = { 3: [1, 3, 6], 4: [1, 3, 4, 6], 5: [1, 2, 3, 4, 6] }[W.walk] || [1, 3, 6];
  const strPref = { 0: [], 1: [1], 2: [1, 4] }[W.str];
  let str = W.str;
  if (S.profile && S.profile.fuerzaExp === 'conozco' && n === 1) str = 1;
  const days = {};
  if (ks.length < 7) { // semana 1 corta: repartir en los días disponibles
    const pick = ks.length >= 5 ? [0, 2, 4] : ks.map((_, i) => i).slice(0, W.walk);
    ks.forEach((k, i) => { days[k] = { walk: pick.includes(i) ? walkMin : 0, str: str > 0 && i === ks.length - 2 }; });
  } else {
    ks.forEach(k => { const d = fromKey(k).getDay(); days[k] = { walk: pref.includes(d) ? walkMin : 0, str: (str >= 1 ? strPref.slice(0, str) : []).includes(d) }; });
  }
  return { days, walkMin, mov: '', meal: '', imp: '', hard: '', auto: true, proposal: true };
}
function weekPlan(n, depth = 0) {
  if (S.weekPlans[n]) return S.weekPlans[n];
  if (n <= 1 || depth > 60) return proposalPlan(Math.max(n, 1));
  const prev = weekPlan(n - 1, depth + 1), ks = daysOfWeek(n);
  const byDow = {}; Object.entries(prev.days).forEach(([k, d]) => byDow[fromKey(k).getDay()] = d);
  const prevShort = Object.keys(prev.days).length < 7;
  let days = {};
  if (prevShort) { // de la semana 1 (corta) a la 2: conservar nº de caminatas y fuerza, repartidas en la semana completa
    const nW = Object.values(prev.days).filter(d => d.walk).length, nS = Object.values(prev.days).filter(d => d.str).length;
    const wd = { 1: [3], 2: [1, 4], 3: [1, 3, 6], 4: [1, 3, 4, 6], 5: [1, 2, 3, 4, 6], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] }[nW] || [];
    const sd = { 1: [1], 2: [1, 4], 3: [1, 3, 5] }[nS] || [];
    ks.forEach(k => { const g = fromKey(k).getDay(); days[k] = { walk: wd.includes(g) ? prev.walkMin : 0, str: sd.includes(g) }; });
  } else ks.forEach(k => { const d = byDow[fromKey(k).getDay()] || { walk: 0, str: false }; days[k] = { walk: d.walk ? prev.walkMin : 0, str: !!d.str }; });
  return { days, walkMin: prev.walkMin, mov: prev.mov || '', meal: prev.meal || '', imp: prev.imp || '', hard: prev.hard || '', auto: true, inherited: n - 1 };
}
/* Congela el plan de la semana en curso para que editar semanas anteriores no reescriba el pasado */
function freezeWeek() { const n = curWeek(); if (!S.weekPlans[n] && S.profile) { S.weekPlans[n] = structuredClone(weekPlan(n)); save(); } }
function setWeekPlan(n, p) { return commit(() => { p.auto = false; S.weekPlans[n] = p; }); }

/* ---------- Registros ---------- */
const logsOn = (k, t) => S.logs.filter(l => l.date === k && (!t || l.type === t));
const logsIn = (a, b, t) => S.logs.filter(l => l.date >= a && l.date <= b && (!t || l.type === t));
/* Solo muta memoria: úsalo dentro de commit() */
function addLog(type, date, status, data, id) {
  if (id) { const l = S.logs.find(x => x.id === id); if (l) { Object.assign(l, { date, status, data, edited: Date.now() }); return l; } }
  const l = { id: uid(), type, date, status, data, ts: Date.now() }; S.logs.push(l); return l;
}
/* Meta P del día: se deriva de los registros de impulso + tu declaración manual (sin contradicciones) */
function recomputeP(k) {
  const d = day(k); d.p = d.p || {};
  const imp = S.logs.filter(l => l.date === k && l.type === 'impulso').map(l => l.data || {});
  const man = d.p.manual || {};
  if (!d.p.v2) { if (d.p.res && !imp.length) man.res = d.p.res; if (d.p.imp && !imp.length) man.imp = d.p.imp; d.p.v2 = 1; } // datos de v1.0/1.1
  d.p.manual = man;
  let res = man.res;
  if (imp.some(x => x.res === 'si')) res = 'yes';
  else if (!res && imp.some(x => x.res === 'no')) res = 'no';
  else if (!res && imp.some(x => x.res === 'priv')) res = 'priv';
  let im = man.imp;
  if (imp.some(x => x.usado === 'si')) im = 'used'; else if (imp.some(x => x.usado === 'no')) im = im === 'used' ? im : 'notused';
  d.p.res = res; d.p.imp = im;
  if (d.p.res === undefined) delete d.p.res; if (d.p.imp === undefined) delete d.p.imp;
}
const TYPES = {
  aero: { n: 'Aeróbico', i: 'walk' }, fuerza: { n: 'Fuerza', i: 'dumbbell' }, comida: { n: 'Comida elegida', i: 'bowl' },
  estudio: { n: 'Estudio', i: 'book' }, sueno: { n: 'Sueño', i: 'moon' }, pausa: { n: 'Pausa o pantalla', i: 'pause' },
  vinculo: { n: 'Vínculo', i: 'people' }, impulso: { n: 'Impulso', i: 'wave' }, medida: { n: 'Medida opcional', i: 'ruler' }
};
function logSummary(l) {
  const d = l.data || {}, st = C.STATE_LABEL[l.status] || '';
  if (!C.DONE_STATES.includes(l.status) && l.type !== 'impulso' && l.type !== 'medida' && l.type !== 'sueno') return st;
  switch (l.type) {
    case 'aero': return `${d.min ?? '?'} min · ${d.mod != null ? '~' + d.mod + ' moderados' : 'intensidad sin declarar'}${d.sens ? ' · ' + d.sens : ''}`;
    case 'fuerza': return (d.ex || []).filter(e => !e.skip && e.reps).map(e => `${short(e.k)} ${e.sets}×${e.reps}`).join(' · ') || st;
    case 'comida': return `${d.momento || ''} · ${d.ajuste || ''}`.slice(0, 80);
    case 'estudio': return `${d.tema || ''} · ${d.resultado || ''}`;
    case 'sueno': return `${d.horas ? d.horas + ' h' : 'horas: no sé'} · ${d.como || ''}`;
    case 'pausa': return `${d.transicion === 'si' ? 'Transición hecha' : 'Sin transición'} · ${d.actividad || ''}`;
    case 'vinculo': return `${d.tipo || ''} · ${d.como || ''}`;
    case 'impulso': return `Respuesta ${d.usado === 'si' ? 'usada' : d.usado === 'no' ? 'no usada' : '—'}${d.res === 'si' ? ' · hubo episodio' : ''}`;
    case 'medida': return [d.peso && d.peso + ' kg', d.cintura && d.cintura + ' cm', d.capacidad].filter(Boolean).join(' · ');
  }
  return st;
}
/* ---------- Validación única (formularios, IA e importación) ---------- */
const NUM_RULES = { min: [0, 600], mod: [0, 600], prev: [0, 600], horas: [0, 24], peso: [20, 400], cintura: [30, 250] };
const EXTRA_KEYS = { impulso: ['via', 'alt', 'seguir', 'hora'], _all: ['via', 'est', 'inferidos'] };
function validDate(k) { if (!/^\d{4}-\d{2}-\d{2}$/.test(k || '')) return false; const d = fromKey(k); return !isNaN(d) && toKey(d) === k; }
/* Devuelve { ok, errors, data } con los datos limpiados. strict=true descarta valores fuera de catálogo. */
function validateLog(type, date, status, data, opts = {}) {
  const errors = [];
  if (!TYPES[type]) return { ok: false, errors: ['Tipo de registro desconocido'], data: {} };
  if (!validDate(date)) errors.push('Fecha no válida');
  else {
    if (date > today()) errors.push('La fecha no puede ser futura');
    if (date < S.settings.start && !opts.allowBefore) errors.push(`La fecha es anterior al inicio del plan (${fmt(S.settings.start)})`);
  }
  if (!C.STATES.some(s2 => s2[0] === status)) errors.push('Estado no válido');
  const schema = FORMS[type](), out = {};
  const allowed = new Set(schema.filter(f => f.k).map(f => f.k).concat(EXTRA_KEYS[type] || [], EXTRA_KEYS._all));
  Object.entries(data || {}).forEach(([k, v]) => {
    if (!allowed.has(k) || k === 'date' || k === 'status' || v === undefined || v === null || v === '') return;
    const f = schema.find(x => x.k === k);
    if (k === 'ex') {
      if (!Array.isArray(v)) return;
      const ex = v.filter(e => e && C.EXERCISES.some(x => x[0] === e.k)).map(e => ({ k: e.k, sets: Math.round(+e.sets), reps: Math.round(+e.reps), skip: !!e.skip }));
      ex.forEach(e => { if (!e.skip && (!isFinite(e.sets) || !isFinite(e.reps) || e.sets < 0 || e.sets > 20 || e.reps < 0 || e.reps > 300)) errors.push(`${short(e.k)}: series o repeticiones fuera de rango`); });
      out.ex = ex; return;
    }
    if (NUM_RULES[k] || (f && f.t === 'num')) {
      const n = +v, [lo, hi] = NUM_RULES[k] || [f.min ?? 0, f.max ?? 100000];
      if (!isFinite(n)) { errors.push(`${f ? f.l : k}: no es un número`); return; }
      if (n < lo || n > hi) { errors.push(`${f ? f.l : k}: debe estar entre ${lo} y ${hi}`); return; }
      out[k] = n; return;
    }
    if (f && (f.t === 'seg' || f.t === 'state')) {
      const okv = (f.o || []).map(o => Array.isArray(o) ? o[0] : o);
      if (!okv.includes(v)) { if (!opts.lenient) errors.push(`${f.l}: opción no válida`); return; }
      out[k] = v; return;
    }
    if (f && f.t === 'multi') { if (Array.isArray(v)) out[k] = v.filter(x => (f.o || []).map(o => Array.isArray(o) ? o[0] : o).includes(x)); return; }
    if (f && f.t === 'date') { if (validDate(v)) out[k] = v; else errors.push(`${f.l}: fecha no válida`); return; }
    if (Array.isArray(v)) { out[k] = v.map(String).slice(0, 20); return; }
    out[k] = String(v).slice(0, 600);
  });
  if (out.mod !== undefined && out.min !== undefined && out.mod > out.min) errors.push('Los minutos moderados no pueden superar los totales');
  return { ok: !errors.length, errors, data: out };
}
const short = (k) => ({ silla: 'Silla', pared: 'Pared', puente: 'Puente', remo: 'Remo', tronco: 'Tronco' }[k] || k);

/* ---------- Iconos ---------- */
const IC = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  map: '<path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z"/><path d="M9 4v14M15 6v14"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  walk: '<circle cx="13" cy="4" r="2"/><path d="M11 21l2-6 3 3v3M8 12l2-4 4 1 2 3 3 1M10 8l-2 7"/>',
  dumbbell: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  bowl: '<path d="M3 11h18a9 9 0 0 1-18 0zM8 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4"/>',
  moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
  pause: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M10 9v6M14 9v6"/>',
  people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 2 6 5.5"/>',
  wave: '<path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/><path d="M2 18c2-4 4-4 6 0s4 4 6 0 4-4 6 0" opacity=".45"/>',
  ruler: '<rect x="2" y="8" width="20" height="8" rx="2"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
};
const ic = (n, s = 24) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ''}</svg>`;

/* ---------- Toast / tooltip ---------- */
function toast(m) { document.querySelectorAll('.toast').forEach(x => x.remove()); const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-tt]'), tt = $('#tt');
  if (!el) { tt.style.display = 'none'; return; }
  tt.innerHTML = el.getAttribute('data-tt'); tt.style.display = 'block';
  const r = el.getBoundingClientRect();
  tt.style.left = Math.min(window.innerWidth - 250, Math.max(8, r.left + r.width / 2 - 100)) + 'px';
  tt.style.top = Math.max(8, r.top - tt.offsetHeight - 10) + 'px';
});

/* ---------- Motor de formularios ---------- */
/* Campo: {k,l,t:'seg'|'multi'|'num'|'text'|'area'|'date'|'time'|'state'|'h'|'note'|'ex', o, s:(v)=>bool, ...} */
function fieldHTML(f, v) {
  if (f.s && !f.s(v)) return '';
  const val = v[f.k];
  const hint = f.hint ? `<div class="hint">${f.hint}</div>` : '';
  switch (f.t) {
    case 'h': return `<h3 style="margin:26px 0 12px">${f.l}</h3>${f.hint ? `<p class="muted small" style="margin-top:-6px">${f.hint}</p>` : ''}`;
    case 'note': { const h = typeof f.html === 'function' ? f.html(v) : f.html; return h ? `<div class="tip ${f.cls || ''}">${h}</div>` : ''; }
    case 'state': {
      const opts = C.STATES.filter(s => !f.only || f.only.includes(s[0]));
      return `<div class="field"><div class="lbl">${f.l || 'Estado real'}</div>${hint}<div class="seg">${opts.map(o => `<button type="button" data-seg="${f.k}" data-v="${o[0]}" class="${val === o[0] ? 'on' : ''}">${o[1]}</button>`).join('')}</div>
      ${val ? `<div class="hint" style="margin-top:8px">${C.STATES.find(s => s[0] === val)[2]}</div>` : ''}</div>`;
    }
    case 'seg': case 'multi': {
      const arr = f.t === 'multi' ? (val || []) : null;
      return `<div class="field"><div class="lbl">${f.l}</div>${hint}<div class="seg">${f.o.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; const on = arr ? arr.includes(ov) : val === ov; return `<button type="button" data-${f.t}="${f.k}" data-v="${esc(ov)}" class="${on ? 'on' : ''}">${ol}</button>`; }).join('')}</div></div>`;
    }
    case 'num': return `<div class="field"><div class="lbl">${f.l}</div>${hint}<div class="num"><button type="button" class="step" data-step="${f.k}" data-d="-${f.step || 1}">−</button><input type="number" inputmode="decimal" data-k="${f.k}" value="${val ?? ''}" step="${f.step || 1}" min="${f.min ?? 0}" ${f.max ? `max="${f.max}"` : ''} placeholder="${f.ph ?? ''}"><button type="button" class="step" data-step="${f.k}" data-d="${f.step || 1}">+</button><span class="unit">${f.u || ''}</span></div>${f.pre ? `<div class="presets">${f.pre.map(p => `<button type="button" data-set="${f.k}" data-v="${p}">${p} ${f.u || ''}</button>`).join('')}</div>` : ''}</div>`;
    case 'text': return `<div class="field"><label>${f.l}</label>${hint}<input type="text" data-k="${f.k}" ${f.live ? 'data-live="1"' : ''} value="${esc(val ?? '')}" placeholder="${esc(f.ph || '')}"></div>`;
    case 'area': return `<div class="field"><label>${f.l}</label>${hint}<textarea data-k="${f.k}" placeholder="${esc(f.ph || '')}">${esc(val ?? '')}</textarea></div>`;
    case 'date': return `<div class="field"><label>${f.l}</label>${hint}<input type="date" data-k="${f.k}" value="${val ?? ''}"></div>`;
    case 'time': return `<div class="field"><label>${f.l}</label>${hint}<input type="time" data-k="${f.k}" value="${val ?? ''}"></div>`;
    case 'ex': return exHTML(v);
    case 'html': return (typeof f.html === 'function' ? f.html(v) : f.html) || '';
  }
  return '';
}
function formHTML(schema, v) { return schema.map(f => fieldHTML(f, v)).join(''); }
function bindForm(root, schema, v, rerender) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.seg) { v[b.dataset.seg] = v[b.dataset.seg] === b.dataset.v && !b.closest('[data-req]') ? v[b.dataset.seg] : b.dataset.v; rerender(); }
    else if (b.dataset.multi) { const a = v[b.dataset.multi] = v[b.dataset.multi] || []; const i = a.indexOf(b.dataset.v); i >= 0 ? a.splice(i, 1) : a.push(b.dataset.v); rerender(); }
    else if (b.dataset.step) { const k = b.dataset.step, f = schema.find(x => x.k === k) || {}; const n = Math.max(f.min ?? 0, Math.round(((+v[k] || 0) + (+b.dataset.d)) * 10) / 10); v[k] = f.max ? Math.min(f.max, n) : n; rerender(); }
    else if (b.dataset.set) { v[b.dataset.set] = +b.dataset.v; rerender(); }
    else if (b.dataset.exstep) { const [k, fld] = b.dataset.exstep.split('.'); const e2 = v.ex.find(x => x.k === k); e2[fld] = Math.max(0, (+e2[fld] || 0) + (+b.dataset.d)); rerender(); }
    else if (b.dataset.exskip) { const e2 = v.ex.find(x => x.k === b.dataset.exskip); e2.skip = !e2.skip; rerender(); }
  });
  root.addEventListener('input', (e) => {
    const el = e.target; if (!el.dataset.k) return;
    v[el.dataset.k] = el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value;
    if (el.dataset.live) rerender(true);
  });
  root.addEventListener('change', (e) => {
    if (e.target.type !== 'date' && e.target.type !== 'number') return;
    // no re-dibujar si el usuario ya pasó a otro campo de texto (evita perder el foco)
    setTimeout(() => { const a = document.activeElement; if (a && root.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a !== e.target) return; rerender(); }, 0);
  });
}

/* ---------- Hoja lateral (sheet) con borrador recuperable ---------- */
const DRAFT_KEY = 'plan20.draft';
let sheetOpen = null;
function saveDraft(sh) {
  if (!sh || !sh.draft) return;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ d: sh.draft, title: sh.title, v: sh.v, ts: Date.now() })); } catch (e) {}
}
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
function getDraft() { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY)); return d && Date.now() - d.ts < 14 * 864e5 ? d : null; } catch (e) { return null; } }
function sheet({ title, sub, schema, values, onSave, saveLabel = 'Guardar', body, extraBtns = '', onDelete, draft }) {
  closeSheet(true);
  const v = values || {};
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog"><header><div><h2>${title}</h2>${sub ? `<div class="muted small">${sub}</div>` : ''}</div><button class="btn ghost" data-close>${ic('x')}</button></header><div class="body"></div><div class="formerr" hidden></div><footer>${onDelete ? `<button class="btn danger" data-del style="margin-right:auto">Borrar</button>` : ''}${extraBtns}${onSave ? `<button class="btn" data-close>Cancelar</button><button class="btn pri" data-save>${saveLabel}</button>` : `<button class="btn pri" data-close>Cerrar</button>`}</footer></div>`;
  document.body.appendChild(bg);
  const bodyEl = $('.body', bg), errEl = $('.formerr', bg);
  const sh = { bg, v, bodyEl, draft, title, dirty: false };
  sh.baseRender = () => {
    // conserva foco y cursor al volver a dibujar
    const a = document.activeElement, k = a && bodyEl.contains(a) && a.dataset && a.dataset.k, sel = k && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
    const st = bodyEl.scrollTop;
    bodyEl.innerHTML = (body ? (typeof body === 'function' ? body(v) : body) : '') + (schema ? formHTML(schema, v) : '');
    bodyEl.scrollTop = st;
    if (k) { const n = bodyEl.querySelector(`[data-k="${k}"]`); if (n) { n.focus({ preventScroll: true }); try { sel && n.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
  };
  sh.render = sh.baseRender;           // puede ser envuelto (p. ej. borrador de IA); los controles siempre llaman sh.render
  sh.showErrors = (errs) => { errEl.hidden = !errs.length; errEl.innerHTML = errs.map(e => `<div>• ${esc(e)}</div>`).join(''); };
  sh.render();
  if (schema) bindForm(bodyEl, schema, v, () => { sh.dirty = true; sh.render(); saveDraft(sh); });
  if (schema) bodyEl.addEventListener('input', () => { sh.dirty = true; saveDraft(sh); });
  bg.addEventListener('click', (e) => {
    if (e.target === bg || e.target.closest('[data-close]')) closeSheet();
    else if (e.target.closest('[data-save]')) {
      const btn = e.target.closest('[data-save]'); if (btn.disabled) return;
      sh.showErrors([]);
      const r = onSave(v);
      if (r && r.errors) { sh.showErrors(r.errors); return; }
      if (r !== false) { clearDraft(); closeSheet(true); route(); }
    }
    else if (e.target.closest('[data-del]')) { if (bg.dataset.confirm) { if (onDelete() !== false) { clearDraft(); closeSheet(true); route(); } } else { bg.dataset.confirm = 1; e.target.closest('[data-del]').textContent = 'Toca otra vez para borrar'; } }
  });
  sheetOpen = sh;
  return sh;
}
/* keep=true: se cierra sin tocar el borrador (p. ej. al abrir otra hoja). Cancelar explícito descarta el borrador. */
function closeSheet(keep) { if (sheetOpen) { if (!keep && sheetOpen.draft) clearDraft(); sheetOpen.bg.remove(); sheetOpen = null; } }
/* Reabrir un borrador guardado */
const DRAFT_OPENERS = {};
function offerDraft() {
  const d = getDraft(); if (!d || sheetOpen) return;
  const el = document.createElement('div'); el.className = 'errbox info';
  el.innerHTML = `<b>Tienes un formulario sin terminar</b><div>${esc(d.title || 'Formulario')} · ${new Date(d.ts).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. No se ha guardado como registro.</div><div class="row" style="margin-top:10px"><button class="btn pri" data-go>Continuar</button><button class="btn" data-no>Descartar</button></div>`;
  el.onclick = (e) => {
    if (e.target.closest('[data-go]')) { el.remove(); const f = DRAFT_OPENERS[d.d.kind]; if (f) f(d.d.arg, d.v); }
    else if (e.target.closest('[data-no]')) { el.remove(); clearDraft(); }
  };
  document.querySelectorAll('.errbox').forEach(x => x.remove()); document.body.appendChild(el);
}

/* ---------- Bloqueo con PIN ---------- */
async function hash(pin, salt) {
  const data = new TextEncoder().encode(salt + ':' + pin);
  if (crypto.subtle) { const h = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  let h = 5381; for (const c of data) h = ((h << 5) + h + c) | 0; return 'f' + h; // respaldo (no debería usarse en la app)
}
let unlocked = false;
function lockScreen(mode = 'unlock', done) {
  // mode: unlock | create | confirm
  let pin = '', first = '';
  const el = document.createElement('div'); el.className = 'lock';
  const draw = (msg) => {
    const t = mode === 'create' ? 'Crea un PIN de 4 a 6 dígitos' : mode === 'confirm' ? 'Repite el PIN' : 'Plan 20';
    el.innerHTML = `<div style="color:var(--acc)">${ic('lock', 34)}</div><h2>${t}</h2><div class="muted small" style="min-height:1.4em">${msg || (mode === 'unlock' ? 'Introduce tu PIN' : 'Protege tus registros privados')}</div>
    <div class="dots">${Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('')}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}<button class="x" data-c>Borrar</button><button data-n="0">0</button><button class="x" data-ok>${mode === 'unlock' ? 'Entrar' : 'Siguiente'}</button></div>`;
  };
  draw();
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.n && pin.length < 6) pin += b.dataset.n;
    if (b.dataset.c !== undefined) pin = pin.slice(0, -1);
    const auto = mode === 'unlock' && pin.length >= 4 && (await hash(pin, S.settings.salt)) === S.settings.pinHash;
    if (b.dataset.ok !== undefined || auto) {
      if (pin.length < 4) { draw('Mínimo 4 dígitos'); return; }
      if (mode === 'create') { first = pin; pin = ''; mode = 'confirm'; draw(); return; }
      if (mode === 'confirm') {
        if (pin !== first) { first = ''; pin = ''; mode = 'create'; draw('No coinciden. Vuelve a crearlo.'); return; }
        const salt = uid(), h = await hash(pin, salt); if (!commit(() => { S.settings.salt = salt; S.settings.pinHash = h; })) { pin = ''; mode = 'create'; draw('No se pudo guardar el PIN. Inténtalo de nuevo.'); return; } el.remove(); unlocked = true; done && done(); return;
      }
      if (auto || (await hash(pin, S.settings.salt)) === S.settings.pinHash) { el.remove(); unlocked = true; done && done(); return; }
      pin = ''; draw('PIN incorrecto'); $('.dots', el).classList.add('shake'); return;
    }
    draw();
  });
  document.body.appendChild(el);
}

/* ======================================================================
   FORMULARIOS DE REGISTRO (secciones 12-23, 25, 30)
   ====================================================================== */
const DATE_F = { k: 'date', l: 'Fecha', t: 'date', hint: 'Si corriges un dato de otro día, márcalo como estimación.' };
const EST_F = { k: 'est', l: '¿Es una estimación o corrección posterior?', t: 'seg', o: [['no', 'No'], ['si', 'Sí, estimación']], s: v => v.date && v.date !== today() };
const did = v => C.DONE_STATES.includes(v.status);
const careBtn = `<button class="btn" type="button" onclick="openCare()">${ic('heart', 18)} Ver señales de cuidado</button>`;

function lastLog(type, before) { return S.logs.filter(l => l.type === type && C.DONE_STATES.includes(l.status) && (!before || l.date <= before)).sort((a, b) => (a.date + a.ts < b.date + b.ts ? 1 : -1))[0]; }

const FORMS = {
  aero: () => [
    DATE_F, EST_F,
    { k: 'status', t: 'state', only: ['done', 'adj', 'stop', 'rest', 'health', 'no', 'nd'] },
    { k: 'motivo', l: '¿Por qué se interrumpió?', t: 'text', s: v => v.status === 'stop' },
    { k: 'barrera', l: 'Barrera (si la conoces)', t: 'seg', o: C.BARRIERS, s: v => v.status === 'no' },
    { k: 'act', l: 'Actividad', t: 'seg', o: ['Caminar', 'Bailar', 'Pedalear', 'Otra'], s: did },
    { k: 'prev', l: 'Minutos previstos', t: 'num', u: 'min', step: 5, pre: [10, 15, 20, 25, 30], s: did },
    { k: 'min', l: 'Minutos totales realizados', t: 'num', u: 'min', step: 1, pre: [5, 10, 15, 20, 25, 35], s: did, hint: 'La cantidad real. Cinco minutos no se convierten en treinta.' },
    { k: 'mod', l: 'De ellos, minutos moderados aproximados', t: 'num', u: 'min', step: 1, s: did, hint: 'Prueba de conversación: moderado = puedes hablar pero cantar resulta difícil. Calentamiento y paseo ligero no cuentan.' },
    { t: 'note', cls: 'w', s: v => did(v) && +v.mod > +v.min, html: 'Los minutos moderados no pueden superar los totales.' },
    { k: 'sens', l: '¿Cómo te encontraste?', t: 'seg', o: ['Cómodo', 'Exigido', 'Con síntomas'], s: did },
    { k: 'dolor', l: '¿Dolor nuevo?', t: 'seg', o: [['no', 'No'], ['si', 'Sí']], s: did },
    { t: 'note', cls: 'a', s: v => v.sens === 'Con síntomas' || v.dolor === 'si' || v.status === 'stop', html: `Ante dolor nuevo, mareo o falta de aire anormal: detén la actividad y revisa antes de repetir. Si es grave, atención urgente.<br><br>${careBtn}` },
    { t: 'note', s: v => did(v) && v.sens === 'Cómodo' && v.dolor !== 'si', html: 'Terminaste cómodo: repite. Si quieres progresar, amplía <b>una</b> ocasión unos 5 min antes de aumentar más cosas.' },
    { t: 'note', s: v => did(v) && v.sens === 'Exigido', html: 'Si no toleras el tramo previsto: reduce velocidad o duración; puedes dividirlo en dos oportunidades.' },
    { k: 'next', l: 'La próxima vez…', t: 'seg', o: ['Mantendré', 'Reduciré', 'Ampliaré'], s: did },
    { k: 'nota', l: 'Nota breve (opcional)', t: 'text', ph: 'Ruta, hora, con quién…' }
  ],
  fuerza: () => [
    DATE_F, EST_F,
    { k: 'status', t: 'state', only: ['done', 'adj', 'stop', 'rest', 'health', 'no', 'nd'] },
    { k: 'motivo', l: '¿Por qué se interrumpió?', t: 'text', s: v => v.status === 'stop' },
    { k: 'barrera', l: 'Barrera (si la conoces)', t: 'seg', o: C.BARRIERS, s: v => v.status === 'no' },
    { t: 'note', s: did, html: 'Preparación 3-5 min. Una serie de 6-10 repeticiones controladas (tronco 4-6 por lado). Termina sintiendo que podrías hacer 2-3 más. Pausa 60-120 s.' },
    { k: 'ex', t: 'ex', s: did },
    { k: 'tec', l: '¿Pudiste mantener la técnica?', t: 'seg', o: [['si', 'Sí'], ['parcial', 'En algún ejercicio no'], ['no', 'No']], s: did },
    { k: 'com', l: 'Sensación', t: 'seg', o: [['comodo', 'Todo cómodo'], ['exigente', 'Exigente'], ['molestia', 'Fatiga que interfiere o molestia relevante']], s: did },
    { t: 'note', cls: 'a', s: v => v.com === 'molestia' || v.status === 'stop', html: `Reduce carga o series y revisa técnica. Dolor punzante, articular, eléctrico, mareo o pérdida de control no son señales para insistir. Dolor persistente requiere valoración.<br><br>${careBtn}` },
    { k: 'rec', l: '¿Cómo recuperaste después? (puedes completarlo mañana)', t: 'seg', o: [['bien', 'Bien'], ['regular', 'Regular'], ['mal', 'Mal'], ['nose', 'Aún no sé']], s: did },
    { t: 'note', s: did, html: v => strengthAdvice(v) },
    { k: 'nota', l: 'Nota (opcional)', t: 'text' }
  ],
  comida: () => [
    DATE_F, EST_F,
    { k: 'status', t: 'state', only: ['done', 'adj', 'no', 'np', 'nd'], l: 'Estado del ajuste' },
    { k: 'momento', l: 'Comida', t: 'seg', o: ['Desayuno', 'Almuerzo', 'Merienda', 'Cena', 'Salida'] },
    { k: 'disp', l: '¿Qué había disponible?', t: 'seg', o: ['Comida familiar', 'Comida fuera', 'Preparada por mí'] },
    { k: 'ajuste', l: '¿Qué ajuste hiciste?', t: 'text', s: did, hint: 'Trabaja con lo que sí controlas: bebida, acompañamiento, ritmo o preparación.' },
    { k: 'hambre', l: '¿Cómo llegaste a la comida?', t: 'seg', o: ['Hambre baja', 'Hambre media', 'Hambre alta'] },
    { k: 'desp', l: '¿Cómo quedaste?', t: 'seg', o: ['Con hambre', 'Satisfecho', 'Incómodamente lleno', 'No sé'] },
    { k: 'suf', l: '¿Hubo comida suficiente?', t: 'seg', o: [['si', 'Sí'], ['no', 'No']] },
    { k: 'obst', l: 'Obstáculo principal', t: 'seg', o: ['Ninguno', 'Dinero', 'Acceso', 'Horario', 'Preferencias', 'Presión social', 'Otro'] },
    { t: 'note', cls: 'w', s: v => v.suf === 'no' || v.obst === 'Acceso', html: 'Prioriza conseguir comida y apoyo. Suspende el objetivo de restricción; trabaja las otras acciones posibles.' },
    { t: 'note', s: v => v.desp === 'Con hambre', html: 'Si quedas con hambre, puedes comer más.' },
    { t: 'note', s: v => v.desp === 'Incómodamente lleno', html: 'Si se repite: prueba ritmo más pausado o una porción inicial distinta. Una comida abundante no se compensa saltando la siguiente ni entrenando de más.' },
    { t: 'note', s: v => v.hambre === 'Hambre alta', html: 'Si el hambre alta se repite, revisa horarios y suficiencia. No uses el hambre extrema como señal de éxito.' }
  ],
  estudio: () => [
    DATE_F, EST_F,
    { k: 'status', t: 'state', only: ['done', 'adj', 'stop', 'no', 'np', 'nd'] },
    { k: 'tema', l: 'Tema o materia', t: 'text' },
    { k: 'tarea', l: 'Pregunta o problema preciso', t: 'text', ph: 'Ej.: resolver un circuito y justificar qué ley usaré', s: did },
    { k: 'solo', l: '¿Qué resolviste sin mirar?', t: 'text', s: did },
    { k: 'error', l: 'Error principal', t: 'text', s: did },
    { k: 'resultado', l: 'Resultado', t: 'seg', o: ['Lo resolví y puedo explicarlo', 'Recordé parte pero cometí un error', 'No comprendí la idea básica', 'No tuve tiempo'] },
    { t: 'note', html: v => ({ 'Lo resolví y puedo explicarlo': 'Vuelve a comprobarlo otro día con un problema distinto o más integrado.', 'Recordé parte pero cometí un error': 'Anota el tipo de error y practica un ejemplo centrado en ese punto.', 'No comprendí la idea básica': 'Vuelve a una explicación o ejemplo guiado; consulta al docente o a un compañero. Recuperar de memoria no reemplaza comprender.', 'No tuve tiempo': 'Haz un paso de 5-10 min o agenda una ocasión real; no declares un bloque inexistente.' }[v.resultado] || '') },
    { k: 'repasos', l: 'Programar reencuentros', t: 'seg', o: [['si', 'Sí: +1, +3 y +7 días'], ['no', 'No']], s: v => ['Lo resolví y puedo explicarlo', 'Recordé parte pero cometí un error'].includes(v.resultado) },
    { k: 'prox', l: 'Próxima ocasión', t: 'date' }
  ],
  sueno: () => [
    { k: 'date', l: 'Noche que termina el', t: 'date' },
    { k: 'horas', l: '¿Cuánto dormiste aproximadamente?', t: 'num', u: 'h', step: 0.5, max: 14, pre: [5, 6, 7, 8, 9], hint: 'Déjalo vacío si no lo sabes.' },
    { k: 'como', l: '¿Cómo te encuentras?', t: 'seg', o: ['Descansado', 'Algo cansado', 'Muy somnoliento'] },
    { k: 'recorto', l: '¿Qué recortó el descanso?', t: 'seg', o: ['Nada', 'Obligación', 'Ocio', 'Dificultad para dormir', 'Dolor', 'Otro'] },
    { t: 'note', cls: 'w', s: v => v.como === 'Muy somnoliento', html: 'Ante somnolencia importante, reduce exigencia y evita actividades peligrosas.' },
    { t: 'note', s: v => v.recorto && v.recorto !== 'Nada', html: 'Actúa sobre la causa posible; no culpes a la persona por una noche mala. Si el insomnio se mantiene o perjudica el día, solicita valoración.' }
  ],
  pausa: () => [
    DATE_F,
    { k: 'status', t: 'state', only: ['done', 'adj', 'no', 'nd'] },
    { k: 'bloque', l: 'Bloque sentado o de pantalla', t: 'text', ph: 'Clase, estudio, transporte u ocio' },
    { k: 'transicion', l: '¿Hiciste la transición?', t: 'seg', o: [['si', 'Sí'], ['no', 'No']] },
    { k: 'actividad', l: '¿Qué actividad la reemplazó?', t: 'text', ph: 'Caminar, ir por agua, movilidad, cambiar de postura…', s: v => v.transicion === 'si' },
    { k: 'efecto', l: '¿Te ayudó?', t: 'seg', o: ['Ayudó', 'Neutro', 'Entorpeció la tarea'] },
    { t: 'note', s: v => v.efecto === 'Entorpeció la tarea', html: 'Cambia el momento de la pausa, no abandones todo el plan.' },
    { k: 'desplazo', l: '¿La pantalla desplazó algo que valoras?', t: 'seg', o: ['Sueño', 'Estudio', 'Vínculo', 'Nada relevante', 'No sé'] },
    { t: 'note', s: v => ['Sueño', 'Estudio', 'Vínculo'].includes(v.desplazo), html: 'Elige una situación concreta: “Al acabar ___, dejaré el teléfono en ___ y pasaré a ___”.' }
  ],
  vinculo: () => [
    DATE_F,
    { k: 'tipo', l: '¿Qué ocurrió?', t: 'seg', o: ['Contacto', 'Invitación sin respuesta', 'Invitación rechazada'], hint: 'Una invitación realizada cuenta como acción, aunque no haya respuesta.' },
    { k: 'nec', l: '¿Qué tipo de contacto te venía bien?', t: 'seg', o: ['Conversar', 'Compañía', 'Actividad', 'Apoyo práctico', 'Descanso a solas'] },
    { k: 'como', l: '¿Cómo fue?', t: 'seg', o: ['Agradable', 'Neutro', 'Incómodo', 'No ocurrió'] },
    { k: 'reci', l: '¿Hubo reciprocidad?', t: 'seg', o: ['Sí', 'Algo', 'No', 'No sé'], s: v => v.tipo === 'Contacto' },
    { k: 'rep', l: '¿Quieres repetirlo?', t: 'seg', o: ['Sí', 'Con cambios', 'No', 'No sé'] },
    { t: 'note', s: v => v.tipo === 'Invitación rechazada' || v.tipo === 'Invitación sin respuesta', html: '“Está bien, gracias por responder”. Puedes probar otro momento o formato, sin insistir ante un rechazo.' },
    { t: 'note', s: v => v.como === 'Incómodo', html: 'Revisa límites y contexto. No hay obligación de mantener todo vínculo.' },
    { k: 'nota', l: 'Nota (opcional)', t: 'text' }
  ],
  impulso: () => [
    DATE_F,
    { k: 'ctx', l: '¿Qué contexto hubo?', t: 'text', ph: 'Una frase; no hace falta detalle íntimo' },
    { k: 'int', l: 'Intensidad (opcional)', t: 'seg', o: ['Baja', 'Media', 'Alta'] },
    { k: 'usado', l: '¿Usaste una respuesta?', t: 'seg', o: [['si', 'Sí'], ['no', 'No']] },
    { k: 'res', l: `¿Hubo ${L().act}?`, t: 'seg', o: [['no', 'No'], ['si', 'Sí'], ['priv', 'Prefiero no responder']] },
    { t: 'note', s: v => v.res === 'si', html: 'Detén la autocrítica y vuelve a la siguiente actividad normal. No compenses con ayuno, ejercicio excesivo, privación de sueño, dolor ni castigos. Un episodio es información sobre una ocasión; no obliga a empezar de nuevo.' },
    { k: 'antes', l: '¿Qué pasó justo antes?', t: 'text', s: v => v.res === 'si' },
    { k: 'falto', l: '¿Qué intenté y qué faltó?', t: 'seg', o: ['No recordé el plan', 'Alternativa poco útil', 'Cansancio', 'Impulso intenso', 'Otro'], s: v => v.res === 'si' },
    { k: 'cambio', l: '¿Qué cambiarás en la próxima ocasión?', t: 'seg', o: ['Señal visible privada', 'Otra alternativa', 'Mejor descanso', 'Apoyo', 'Dejar el teléfono en otro lugar'], s: v => v.res === 'si' || v.usado === 'no' },
    { k: 'dano', l: '¿Hubo daño o interferencia importante?', t: 'seg', o: [['no', 'No'], ['si', 'Sí']], s: v => v.res === 'si' },
    { t: 'note', cls: 'a', s: v => v.dano === 'si', html: `Si se repite o es significativo, solicita evaluación sin esperar al final del plan.<br><br>${careBtn}` }
  ],
  medida: () => [
    { t: 'note', html: 'Todo es opcional. Peso: una vez por semana en condiciones similares. Cintura: cada cuatro semanas, cinta horizontal sin comprimir, mismo punto entre costilla inferior y parte superior de la cadera, tras una espiración normal. Si no puedes repetir el método, omite la medida.' },
    { k: 'date', l: 'Fecha', t: 'date' },
    { k: 'peso', l: 'Peso', t: 'num', u: 'kg', step: 0.1, ph: '—' },
    { k: 'cintura', l: 'Cintura', t: 'num', u: 'cm', step: 0.5, ph: '—' },
    { k: 'capacidad', l: 'Capacidad comparada (ruta o ejercicio similar)', t: 'text', ph: 'Ej.: misma ruta con menos esfuerzo' },
    { k: 'prenda', l: 'Comodidad de una prenda', t: 'text' },
    { k: 'energia', l: 'Energía general', t: 'seg', o: ['Baja', 'Media', 'Alta'] }
  ]
};

function exDefaults(date) {
  const last = lastLog('fuerza', date);
  return C.EXERCISES.map(e => {
    const p = last && last.data.ex && last.data.ex.find(x => x.k === e[0]);
    const skip = e[0] === 'remo' && S.profile && S.profile.carga === 'no';
    return { k: e[0], sets: p ? p.sets : 1, reps: p ? p.reps : (e[4] ? 4 : 8), skip: p ? p.skip : skip };
  });
}
function exHTML(v) {
  const last = lastLog('fuerza', v.date);
  return `<div class="field"><div class="lbl">Ejercicios · series × repeticiones</div><div class="hint">Precargado con tu última sesión${last ? ` (${fmt(last.date)})` : ''}. Toca el nombre para marcarlo como omitido.</div>
  ${v.ex.map(e => { const d = C.EXERCISES.find(x => x[0] === e.k); const pl = last && last.data.ex && last.data.ex.find(x => x.k === e.k);
    return `<div class="exrow" style="${e.skip ? 'opacity:.45' : ''}"><div><button type="button" data-exskip="${e.k}" style="border:0;background:none;padding:0;text-align:left;font-weight:600;cursor:pointer">${d[1]}${d[4] ? ' <span class="muted small">(por lado)</span>' : ''}</button><div class="last">${e.skip ? 'Omitido' : pl ? `Anterior: ${pl.sets}×${pl.reps}` : 'Primera vez'}</div></div>
    <div class="num"><button type="button" class="step" data-exstep="${e.k}.sets" data-d="-1">−</button><input type="number" value="${e.sets}" readonly><button type="button" class="step" data-exstep="${e.k}.sets" data-d="1">+</button></div>
    <div class="num"><button type="button" class="step" data-exstep="${e.k}.reps" data-d="-1">−</button><input type="number" value="${e.reps}" readonly><button type="button" class="step" data-exstep="${e.k}.reps" data-d="1">+</button></div></div>`; }).join('')}</div>`;
}
/* Tabla de la sección 13 aplicada a tu historial */
function strengthAdvice(v) {
  // Orden de la sección 13/27: primero molestias, técnica y recuperación; solo después progresión.
  if (v.com === 'molestia' || v.tec === 'no') return '<b>Siguiente sesión:</b> reduce carga o series y revisa técnica. Si la molestia persiste, pide valoración.';
  if (v.rec === 'mal') return '<b>Siguiente sesión:</b> recuperaste mal → no progreses. Repite una dosis menor (menos series o repeticiones) cuando te encuentres bien.';
  if (v.tec === 'parcial') return '<b>Siguiente sesión:</b> repite la misma dosis y cuida la técnica del ejercicio que costó; no añadas repeticiones todavía.';
  if (v.rec === 'regular' || v.rec === 'nose' || !v.rec) return '<b>Siguiente sesión:</b> repite la misma dosis. Solo progresa cuando la técnica se mantenga <b>y</b> recuperes bien.';
  if (v.tec !== 'si' || v.rec !== 'bien') return '';
  const prev = S.logs.filter(l => l.type === 'fuerza' && C.DONE_STATES.includes(l.status) && l.id !== v._id && l.date <= (v.date || today())).sort((a, b) => a.date < b.date ? 1 : -1)[0];
  const prevOk = prev && prev.data.tec === 'si' && prev.data.rec === 'bien';
  const ready = (v.ex || []).filter(e => !e.skip && e.reps >= 10).filter(e => { const p = prev && prev.data.ex && prev.data.ex.find(x => x.k === e.k); return prevOk && p && !p.skip && p.reps >= 10; });
  if (ready.length && v.com === 'comodo') return `<b>Siguiente sesión:</b> llegaste a 10-12 repeticiones cómodas en dos sesiones en <b>${ready.map(e => short(e.k)).join(', ')}</b>. Elige solo un cambio: variante algo más difícil, carga pequeña y segura, o segunda serie. Vuelve a menos repeticiones si sube la dificultad.`;
  return '<b>Siguiente sesión:</b> la técnica se mantiene y recuperas bien → repite o añade 1-2 repeticiones en <b>un</b> ejercicio.';
}

/* Abrir formulario de registro */
function openLog(type, preset = {}, existing, override) {
  if (typeof existing === 'string') existing = S.logs.find(l => l.id === existing);
  const schema = FORMS[type]().slice();
  const base = override ? structuredClone(override) : existing ? Object.assign({ _id: existing.id, date: existing.date, status: existing.status }, structuredClone(existing.data)) : Object.assign({ date: today() }, preset);
  if (type === 'fuerza' && !base.ex) base.ex = exDefaults(base.date);
  if (type === 'comida' && !existing && !override && S.profile && S.profile.comidaSit) {
    const f = C.FOOD_SITUATIONS.find(x => x[0] === S.profile.comidaSit); base.ajuste = base.ajuste || (S.profile.comidaAjuste || (f && f[2]) || '');
    base.momento = base.momento || S.profile.comidaCual;
  }
  if (type === 'aero' && !existing && !override && base.prev == null && base.date >= S.settings.start) { const pd = weekPlan(cal().weekOf(base.date)).days[base.date]; if (pd && pd.walk) base.prev = pd.walk; }
  const linked = existing && type === 'estudio' ? S.studyDue.filter(x => x.from === existing.id && !x.done) : [];
  if (linked.length) { base._delRep = base._delRep || 'borrar'; schema.push({ k: '_delRep', l: `Si borras este registro, sus ${linked.length} repaso${linked.length > 1 ? 's' : ''} pendiente${linked.length > 1 ? 's' : ''}…`, t: 'seg', o: [['borrar', 'Se borran'], ['conservar', 'Se conservan como independientes']] }); }
  const t = TYPES[type];
  sheet({
    title: type === 'impulso' ? `${L().meta}: impulso u ocasión` : t.n, sub: existing ? 'Editar registro' : fmt(base.date, true), schema, values: base,
    draft: { kind: 'log', arg: { type, id: existing && existing.id } },
    onDelete: existing ? () => commit(() => {
      S.logs = S.logs.filter(l => l.id !== existing.id);
      if (type === 'estudio') S.studyDue = S.studyDue.filter(x => !(x.from === existing.id && !x.done && base._delRep !== 'conservar')).map(x => x.from === existing.id ? Object.assign(x, { from: null }) : x);
      if (type === 'impulso') recomputeP(existing.date);
    }) && (toast('Registro borrado'), true) : null,
    onSave: (v) => {
      const status = v.status || (['sueno', 'medida', 'impulso', 'vinculo'].includes(type) ? 'done' : '');
      if (!status) return { errors: ['Marca el estado real'] };
      const raw = structuredClone(v); ['date', 'status', '_id', '_delRep', '_dueId'].forEach(k => delete raw[k]);
      if (!did({ status }) && ['aero', 'fuerza', 'comida', 'estudio', 'pausa'].includes(type)) ['min', 'mod', 'ex', 'sens', 'dolor', 'tec', 'com', 'rec', 'ajuste', 'solo', 'error'].forEach(k => delete raw[k]);
      const chk = validateLog(type, v.date, status, raw, { allowBefore: !!existing && existing.date < S.settings.start });
      if (!chk.ok) return { errors: chk.errors };
      const ok = commit(() => {
        const oldDate = existing && existing.date;
        const l = addLog(type, v.date, status, chk.data, existing && existing.id);
        if (type === 'impulso') { recomputeP(v.date); if (oldDate && oldDate !== v.date) recomputeP(oldDate); }
        if (v._dueId) { const dd = S.studyDue.find(x => x.id === v._dueId); if (dd) dd.done = true; }
        if (type === 'estudio' && !existing) {
          if (v.repasos === 'si') [1, 3, 7].forEach(n => S.studyDue.push({ id: uid(), date: addDays(v.date, n), tema: v.tema || 'Estudio', tarea: v.tarea || '', from: l.id }));
          if (v.prox) S.studyDue.push({ id: uid(), date: v.prox, tema: v.tema || 'Estudio', tarea: 'Próxima ocasión', from: l.id });
        }
        if (type === 'estudio' && existing) { const shift = diffDays(oldDate, v.date); S.studyDue.forEach(x => { if (x.from === l.id && !x.done) { x.tema = v.tema || x.tema; if (shift) x.date = addDays(x.date, shift); } }); }
      });
      if (!ok) return false;
      toast('Guardado');
    }
  });
}
DRAFT_OPENERS.log = (arg, v) => openLog(arg.type, {}, arg.id || undefined, v);
window.openLogById = (id) => { const l = S.logs.find(x => x.id === id); if (l) openLog(l.type, {}, l); };

/* ======================================================================
   PANTALLAS
   ====================================================================== */
let tab = 'hoy';
const NAV = [['hoy', 'Hoy', 'home'], ['registrar', 'Registrar', 'plus'], ['plan', 'Plan', 'map'], ['revision', 'Revisión', 'check'], ['progreso', 'Progreso', 'chart'], ['guias', 'Guías', 'book'], ['ajustes', 'Ajustes', 'gear']];
function shell() {
  $('#app').innerHTML = `<nav class="rail"><div class="brand"><img src="icon.png" width="44" height="44" alt="" style="border-radius:12px"></div>
  ${NAV.map(n => `<button data-tab="${n[0]}" class="${tab === n[0] ? 'on' : ''}">${ic(n[2])}<span>${n[1]}</span></button>`).join('')}
  <div class="spacer"></div><button class="care" data-care>${ic('heart')}<span>Cuidado</span></button></nav><main id="main"></main>`;
  $('.rail').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.care !== undefined) return openCare(); tab = b.dataset.tab; route(); });
}
function route() {
  if (!$('#main')) shell();
  document.querySelectorAll('.rail button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const old = $('#main'), m = old.cloneNode(false); old.replaceWith(m); // limpia oyentes previos
  try { m.innerHTML = (SCREENS[tab] || SCREENS.hoy)(); }
  catch (e) { console.error(e); m.innerHTML = `<div class="card alert"><h3>No se pudo mostrar esta pantalla</h3><p>Tus datos no se han modificado. Puedes seguir registrando desde Registrar.</p><p class="small muted">${esc(e.message)}</p><div class="row"><button class="btn pri" data-a="retry">Reintentar</button><button class="btn" data-a="goreg">Ir a Registrar</button></div></div>`; onAct(m, { retry: () => route(), goreg: () => { tab = 'registrar'; route(); } }); return; }
  m.scrollTop = 0;
  const h = HANDLERS[tab]; h && h(m);
}
const SCREENS = {}, HANDLERS = {};
function onAct(root, map) { root.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (!b) return; const f = map[b.dataset.a]; f && f(b.dataset.x, b); }); }

/* ---------- HOY ---------- */
SCREENS.hoy = () => {
  const k = today(), c = cal(), w = c.weekOf(k), ph = phaseOf(w), d = S.days[k] || {}, W = weekInfo(w);
  const wp = weekPlan(Math.max(w, 1)), pd = wp.days[k] || { walk: 0, str: false };
  const dayN = diffDays(c.s, k) + 1;
  const logs = logsOn(k);
  const isSunday = fromKey(k).getDay() === 0, lastOfWeek = w >= 1 && c.range(w)[1] === k;
  const due = S.studyDue.filter(s => s.date <= k && !s.done).slice(0, 5);
  const p = d.p || {};
  const pr = S.profile || {};
  const head = w < 1 ? `Empiezas el ${fmt(c.s, true)}` : w > 20 ? `Mantenimiento · semana ${w} (las 20 semanas terminaron el ${fmt(c.end)})` : `Semana ${w} de 20 · Fase ${ph}: ${C.PHASES[ph - 1].title} · Día ${dayN} de ${c.total}`;
  const mov = [];
  if (pd.walk) mov.push({ t: 'aero', n: `Caminata ${pd.walk} min`, h: 'Suave → cómodo → suave' });
  if (pd.str) mov.push({ t: 'fuerza', n: 'Fuerza · 5 movimientos', h: '15-25 min' });
  const logged = (t) => logs.filter(l => l.type === t);
  const streak = S.settings.streak ? calcStreak(k) : null;
  return `
  <div class="head"><div><div class="kicker muted small" style="text-transform:uppercase;letter-spacing:.07em;font-weight:600">${esc(cap1(fmt(k, true)))}</div><h1>${d.open ? 'Tu día' : 'Buen día'}</h1><div class="sub">${head}</div></div>
  <button class="btn big pri" data-a="proto">${ic('wave', 22)} Protocolo de pausa</button></div>
  ${dayN === 1 ? firstDayCard() : ''}
  <div class="grid">
    ${(isSunday || lastOfWeek) && w >= 1 && !S.reviews[w] ? `<div class="card c12 accent"><div class="row between"><div><h3>Revisión de la semana ${w}</h3><p class="muted" style="margin:6px 0 0">${esc(W.q)}</p></div><button class="btn pri" data-a="review">Hacer revisión (10 min)</button></div></div>` : ''}
    <div class="card c7 ${d.open ? '' : 'accent'}"><div class="row between"><h3>${ic('sun', 20)} Apertura del día</h3>${d.open ? '<span class="pill ok">Hecha</span>' : '<span class="pill pend">1-2 min</span>'}</div>
      ${d.open ? `<p class="sentence">Hoy puedo dedicar <b>${esc(d.open.tiempo ?? '—')} min</b>. Mi primera acción será <b>${esc(d.open.mov || '—')}</b> después de <b>${esc(d.open.ocasion || '—')}</b>.${d.open.imp ? ` Si aparece el impulso: <b>${esc(d.open.imp)}</b>.` : ''}</p><div class="row" style="margin-top:10px"><button class="btn ghost" data-a="open">Editar</button></div>`
      : `<p class="muted">¿Síntomas o necesidad urgente? ¿Cuánto tiempo tienes? ¿Qué acción toca y qué harás si aparece el impulso?</p><button class="btn pri" data-a="open">Responder apertura</button>`}
    </div>
    <div class="card c5"><h3>${ic('wave', 20)} ${L().meta} · hoy</h3>
      <div class="field"><div class="seg">${[['no', 'Hoy no'], ['yes', 'Hoy sí'], ['nd', 'Sin dato'], ['priv', 'Prefiero no responder']].map(o => `<button data-a="pres" data-x="${o[0]}" class="${p.res === o[0] ? 'on' : ''}">${o[1]}</button>`).join('')}</div></div>
      <div class="field" style="margin:0"><div class="lbl small muted">Impulso</div><div class="seg">${[['none', 'No apareció'], ['used', 'Apareció · usé respuesta'], ['notused', 'Apareció · no la usé'], ['unk', 'No sé']].map(o => `<button data-a="pimp" data-x="${o[0]}" class="${p.imp === o[0] ? 'on' : ''}">${o[1]}</button>`).join('')}</div></div>
      ${streak != null ? `<p class="muted small" style="margin-top:12px">Días conocidos seguidos sin ${L().act}: <b>${streak}</b></p>` : ''}
      ${pr.alternativas && pr.alternativas.length ? `<p class="muted small" style="margin-top:10px">Tu respuesta: ${esc(pr.alternativas.slice(0, 3).join(' · '))}</p>` : ''}
    </div>

    <div class="card c7"><div class="row between"><h3>${ic('walk', 20)} Movimiento de hoy</h3><button class="btn ghost" data-a="gotoPlan">Cambiar días</button></div>
      ${mov.length ? mov.map(m => { const lg = logged(m.t); return `<div class="logitem"><div><div class="t">${m.n}</div><div class="d">${lg.length ? esc(C.STATE_LABEL[lg[0].status]) + ' · ' + esc(logSummary(lg[0])) : m.h}</div></div>${lg.length ? `<button class="btn" data-a="edit" data-x="${lg[0].id}">Ver</button>` : `<button class="btn pri" data-a="log" data-x="${m.t}">Registrar</button>`}</div>`; }).join('')
      : `<p class="muted">Hoy es descanso de entrenamiento según tu plan. Movimiento cotidiano si apetece.</p><div class="row"><button class="btn" data-a="log" data-x="aero">Registrar movimiento igualmente</button></div>`}
      <div class="tip small">Si hoy no cabe todo: haz una acción principal y deja la segunda en una ocasión concreta. No necesitas compensar por la noche.</div>
    </div>
    <div class="card c5"><h3>${ic('bowl', 20)} Comida elegida</h3>
      <p>${esc(pr.comidaAjuste || 'Elige un ajuste en una comida que ya existe.')}</p>
      ${logged('comida').length ? logged('comida').map(l => `<div class="logitem"><div><div class="t">${esc(l.data.momento || 'Comida')}</div><div class="d">${esc(C.STATE_LABEL[l.status])}${l.data.desp ? ' · ' + esc(l.data.desp) : ''}</div></div><button class="btn" data-a="edit" data-x="${l.id}">Ver</button></div>`).join('') : ''}
      <button class="btn" data-a="log" data-x="comida">Registrar comida</button>
    </div>

    ${due.length ? `<div class="card c6"><h3>${ic('book', 20)} Reencuentros de estudio</h3>${due.map(s => `<div class="logitem"><div><div class="t">${esc(s.tema)}</div><div class="d">${esc(s.tarea)} · ${s.date < k ? 'pendiente desde ' + fmt(s.date) : 'hoy'}</div></div><div class="row"><button class="btn ghost" data-a="sdone" data-x="${s.id}">Hecho</button><button class="btn" data-a="sblock" data-x="${s.id}">Bloque 25′</button></div></div>`).join('')}</div>` : ''}

    <div class="card ${due.length ? 'c6' : 'c7'}"><h3>Registros de hoy</h3>
      ${logs.length ? logs.map(l => `<div class="logitem"><div><div class="t">${TYPES[l.type].n}</div><div class="d">${esc(logSummary(l))}</div></div><button class="btn ghost" data-a="edit" data-x="${l.id}">${ic('chev', 18)}</button></div>`).join('') : '<div class="empty">Aún nada. Usa “Registrar” después de cada acción.</div>'}
    </div>
    <div class="card ${due.length ? 'c12' : 'c5'} ${d.close ? '' : (new Date().getHours() >= 18 ? 'accent' : '')}"><div class="row between"><h3>${ic('moon', 20)} Cierre del día</h3>${d.close ? '<span class="pill ok">Hecho</span>' : '<span class="pill pend">2 min</span>'}</div>
      ${d.close ? `<p class="sentence">Mañana mantengo <b>${esc(d.close.mant || '—')}</b> y cambio <b>${esc(d.close.cambio || '—')}</b>.${d.close.prox ? ` Próxima ocasión: <b>${esc(d.close.prox)}</b>.` : ''}</p><button class="btn ghost" data-a="close">Editar</button>`
      : `<p class="muted">Estado real de lo previsto, cómo influyó el plan, barrera principal y próxima ocasión.</p><button class="btn pri" data-a="close">Hacer cierre</button>`}
    </div>
  </div>`;
};
function firstDayCard() {
  return `<div class="card warn" style="margin-bottom:18px"><h3>Primer día paso a paso</h3>
  <table><tr><th>Momento</th><th>Qué haces</th></tr>
  <tr><td>Antes de empezar</td><td>Lee las señales de cuidado. Escoge dos prioridades y una franja real de tiempo.</td></tr>
  <tr><td>Movimiento</td><td>Si estás retomando: 3 min suaves, 9-14 min cómodos y 3 min suaves. Puedes acortar el tramo central.</td></tr>
  <tr><td>Comida elegida</td><td>Haz el ajuste elegido. Si falta comida, primero asegura acceso.</td></tr>
  <tr><td>Estudio previsto</td><td>Sustituye 20-25 min del estudio habitual por resolver o explicar sin mirar y luego corregir.</td></tr>
  <tr><td>Cierre</td><td>Marca el estado real. Elige la próxima ocasión.</td></tr></table>
  <p class="small muted">No necesitas calcular calorías, comprar equipo, hacer una prueba física máxima ni fijar un peso para comenzar.</p></div>`;
}
function calcStreak(k) {
  let n = 0, cur = (S.days[k] && S.days[k].p && S.days[k].p.res) ? k : addDays(k, -1);
  while (cur >= S.settings.start) { const r = S.days[cur] && S.days[cur].p && S.days[cur].p.res; if (r !== 'no') break; n++; cur = addDays(cur, -1); }
  return n;
}
HANDLERS.hoy = (m) => onAct(m, {
  proto: () => protocol(),
  open: () => openApertura(), close: () => openCierre(), review: () => openReview(cal().weekOf(today())),
  log: (t) => openLog(t), edit: (id) => { const l = S.logs.find(x => x.id === id); l && openLog(l.type, {}, l); },
  gotoPlan: () => { tab = 'plan'; route(); },
  pres: (x) => setManualP(today(), 'res', x),
  pimp: (x) => { if (setManualP(today(), 'imp', x) && (x === 'notused' || (x === 'used' && !logsOn(today(), 'impulso').length))) openLog('impulso', { usado: x === 'used' ? 'si' : 'no' }); },
  sdone: (id) => { if (commit(() => { const s = S.studyDue.find(x => x.id === id); if (s) s.done = true; })) route(); },
  sblock: (id) => { const s = S.studyDue.find(x => x.id === id); studyTimer(s); }
});

function openApertura(arg, override) {
  const k = (override && override._day) || today(), w = Math.max(1, cal().weekOf(k)), pd = weekPlan(w).days[k] || {}, pr = S.profile || {}, d = day(k);
  const movDef = pd.walk ? `Caminata ${pd.walk} min${pd.str ? ' + fuerza' : ''}` : pd.str ? 'Fuerza breve' : 'Descanso previsto';
  const v = override || (d.open ? structuredClone(d.open) : null) || { tiempo: 90, nivel: 'Habitual', mov: movDef, ocasion: pr.ocasion1 || '', imp: (pr.alternativas || []).join(', ') };
  sheet({
    title: 'Apertura del día', sub: fmt(k, true), values: v, schema: [
      { k: 'sint', l: '¿Hay algún síntoma nuevo o necesidad básica urgente?', t: 'seg', o: [['no', 'No'], ['si', 'Sí'], ['nose', 'No sé']] },
      { k: 'sintTxt', l: 'Una frase si hace falta', t: 'text', s: v => v.sint && v.sint !== 'no' },
      { t: 'note', cls: 'a', s: v => v.sint === 'si', html: `Primero resolver salud, alimento o descanso.<br><br>${careBtn}` },
      { k: 'tiempo', l: '¿Qué tiempo adicional tengo hoy?', t: 'num', u: 'min', step: 5, pre: [20, 45, 60, 90, 120], hint: 'Es un límite disponible, no una obligación de llenarlo.' },
      { k: 'nivel', l: 'Nivel de hoy', t: 'seg', o: ['Habitual', 'Reducido', 'Descanso'] },
      { t: 'note', s: v => v.nivel === 'Reducido' || +v.tiempo < 20, html: 'Versión reducida: movimiento breve si corresponde (5-10 min cómodos), comida suficiente y próxima ocasión definida. No ocupar el sueño.' },
      { k: 'mov', l: '¿Qué acción de movimiento toca?', t: 'text', hint: `Según tu plan: ${esc(movDef)}` },
      { k: 'ocasion', l: 'Después de…', t: 'text', ph: 'Ej.: la última clase', hint: 'Una ocasión concreta: después de qué actividad y en qué lugar.' },
      { k: 'alt', l: 'Lugar y alternativa si no se puede', t: 'text', ph: 'Ej.: si llueve, marcha suave en casa' },
      { k: 'imp', l: '¿Qué haré si aparece el impulso?', t: 'text', hint: 'Una alternativa ya elegida. Si no aparece, no hay tarea extra.' },
      { t: 'note', html: v => `<b>“Hoy puedo dedicar ${esc(v.tiempo || '___')} minutos. Mi primera acción será ${esc(v.mov || '___')} después de ${esc(v.ocasion || '___')}.”</b>` }
    ],
    draft: { kind: 'open' },
    onSave: (v) => { v._day = k; if (!commit(() => { day(k).open = v; })) return false; toast('Apertura guardada'); }
  });
}
function openCierre(arg, override) {
  const k = (override && override._day) || today(), d = day(k), logs = logsOn(k), pd = weekPlan(Math.max(1, cal().weekOf(k))).days[k] || {};
  const v = override || (d.close ? structuredClone(d.close) : {});
  if (!override) v.pres = (d.p && d.p.res) || v.pres;
  const planned = []; if (pd.walk) planned.push(['aero', `Caminata ${pd.walk} min`]); if (pd.str) planned.push(['fuerza', 'Fuerza']);
  const missing = planned.filter(p => !logs.some(l => l.type === p[0]));
  sheet({
    title: 'Cierre del día', sub: fmt(k, true), values: v,
    body: `<div class="field"><div class="lbl">¿Qué ocurrió con lo previsto?</div>
      ${logs.length ? logs.map(l => `<div class="logitem"><div><div class="t">${TYPES[l.type].n}</div><div class="d">${esc(C.STATE_LABEL[l.status])} · ${esc(logSummary(l))}</div></div></div>`).join('') : '<div class="empty">No hay registros hoy.</div>'}
      ${missing.map(p => `<div class="logitem"><div><div class="t">${p[1]}</div><div class="d">Prevista, sin registro</div></div><button class="btn" type="button" onclick="closeSheet();openLog('${p[0]}')">Registrar estado</button></div>`).join('')}
      <div class="hint" style="margin-top:8px">Sin dato no significa cero; no inventes cumplimiento.</div></div>`,
    schema: [
      { k: 'pres', l: `${L().meta}: resultado de hoy`, t: 'seg', o: [['no', 'Hoy no'], ['yes', 'Hoy sí'], ['nd', 'Sin dato'], ['priv', 'Prefiero no responder']] },
      { k: 'influyo', l: '¿Cómo influyó el plan?', t: 'seg', o: ['Ayudó', 'Neutro', 'Empeoró'] },
      { t: 'note', cls: 'w', s: v => v.influyo === 'Empeoró', html: 'Identifica carga o efecto antes de progresar.' },
      { k: 'energia', l: 'Energía', t: 'seg', o: ['Baja', 'Media', 'Alta'] },
      { k: 'barrera', l: '¿Cuál fue la barrera principal?', t: 'seg', o: C.BARRIERS },
      { t: 'note', html: v => barrierTip(v.barrera) },
      { k: 'mant', l: 'Mañana mantengo…', t: 'text' },
      { k: 'cambio', l: 'y cambio…', t: 'text' },
      { k: 'prox', l: '¿Cuál es la próxima ocasión?', t: 'text', ph: 'Día, señal y acción; o descanso previsto' },
      { t: 'note', html: 'Termina el registro. No es necesario analizar más esta noche.' }
    ],
    draft: { kind: 'close' },
    onSave: (v) => {
      v._day = k;
      const hasEp = logsOn(k, 'impulso').some(l => l.data && l.data.res === 'si');
      if (v.pres && v.pres !== 'yes' && hasEp) return { errors: [`Hay un episodio registrado este día. Si fue un error, edítalo o bórralo en el registro de ${L().meta}.`] };
      if (!commit(() => { const dd = day(k); dd.close = v; if (v.pres) { dd.p = dd.p || {}; dd.p.manual = Object.assign(dd.p.manual || {}, { res: v.pres }); recomputeP(k); } })) return false;
      toast('Cierre guardado');
    }
  });
}
DRAFT_OPENERS.open = (a, v) => openApertura(a, v);
DRAFT_OPENERS.close = (a, v) => openCierre(a, v);
/* Declaración manual de la Meta P del día (se combina con los registros de impulso) */
function setManualP(k, field, x) {
  const d0 = S.days[k] || {}, cur = d0.p && d0.p.manual && d0.p.manual[field];
  const val = cur === x ? undefined : x;
  if (field === 'res' && val && val !== 'yes' && logsOn(k, 'impulso').some(l => l.data && l.data.res === 'si')) {
    errorBox('Hay un episodio registrado hoy', `Para cambiar el resultado, edita o borra ese registro de ${L().meta} (Registros de hoy). Así el calendario, el historial y la IA coinciden.`); return false;
  }
  const ok = commit(() => { const d = day(k); d.p = d.p || {}; d.p.manual = Object.assign(d.p.manual || {}, { [field]: val }); recomputeP(k); });
  if (ok) route(); return ok;
}
function barrierTip(b) {
  return ({ Tiempo: 'No cabe en la agenda → acortar duración o frecuencia, cambiar ocasión o retirar una tarea secundaria.', Olvido: 'Cabe pero se olvida → asociarla a una transición visible y dejar recursos preparados.', Salud: 'Dolor o recuperación mala → reducir o retirar lo problemático; consultar si persiste. Síntomas de alarma → atención apropiada.', Recursos: 'Usa la versión que mantiene la intención: acciones gratuitas, comida familiar accesible, rutina sin equipo.', 'Método': 'La haces pero no aporta → verificar si se mide bien, si pasó tiempo suficiente y si el método corresponde a la meta.', Prioridad: 'Orden: salud y necesidades básicas → obligaciones esenciales → acciones principales → opcionales. Reduce la cantidad de acciones.' }[b]) || '';
}

/* ---------- HISTORIAL COMPLETO (buscar, filtrar, corregir) ---------- */
function openHistory() {
  const v = { tipo: 'todos', q: '', desde: '', hasta: '', n: 60 };
  const list = (v) => {
    const q = (v.q || '').toLowerCase().trim();
    const rows = S.logs.filter(l => (v.tipo === 'todos' || l.type === v.tipo) && (!v.desde || l.date >= v.desde) && (!v.hasta || l.date <= v.hasta)
      && (!q || JSON.stringify(l.data || {}).toLowerCase().includes(q) || TYPES[l.type].n.toLowerCase().includes(q) || (C.STATE_LABEL[l.status] || '').toLowerCase().includes(q)))
      .sort((a, b) => (a.date + (a.ts || 0) < b.date + (b.ts || 0) ? 1 : -1));
    if (!rows.length) return '<div class="empty">No hay registros con esos filtros.</div>';
    let out = `<p class="muted small">${rows.length} registro${rows.length > 1 ? 's' : ''}${rows.length > v.n ? ` · mostrando ${v.n}` : ''}</p>`, last = '';
    rows.slice(0, v.n).forEach(l => {
      if (l.date !== last) { last = l.date; out += `<div class="kicker" style="margin:14px 0 4px">${cap1(fmt(l.date, true))} ${l.date.slice(0, 4)} · semana ${cal().weekOf(l.date) || '—'}</div>`; }
      out += `<div class="logitem"><div><div class="t">${esc(TYPES[l.type].n)} · <span class="muted">${esc(C.STATE_LABEL[l.status] || '')}</span></div><div class="d">${esc(logSummary(l))}${l.data && l.data.via === 'ia' ? ' · registrado con IA' : ''}</div></div><button class="btn" type="button" onclick="openLogById('${l.id}')">Editar</button></div>`;
    });
    if (rows.length > v.n) out += `<button class="btn block" type="button" data-set="n" data-v="${v.n + 100}" style="margin-top:12px">Mostrar más</button>`;
    return out;
  };
  sheet({ title: 'Historial completo', sub: `${S.logs.length} registros desde ${fmt(S.settings.start)}`, values: v, schema: [
    { k: 'tipo', l: 'Tipo', t: 'seg', o: [['todos', 'Todos']].concat(Object.entries(TYPES).map(([k, t]) => [k, k === 'impulso' ? L().meta : t.n])) },
    { k: 'q', l: 'Buscar texto', t: 'text', ph: 'Tema, contexto, ajuste…', live: true },
    { k: 'desde', l: 'Desde', t: 'date' }, { k: 'hasta', l: 'Hasta', t: 'date' },
    { t: 'html', html: list }
  ] });
}

/* ---------- REGISTRAR ---------- */
SCREENS.registrar = () => `
  <div class="head"><div><h1>Registrar</h1><div class="sub">Selecciona la acción que realizaste. Si no ocurrió, marca su estado real; no respondas preguntas ficticias.</div></div></div>
  <div class="tiles">${Object.entries(TYPES).map(([k, t]) => `<button class="tile" data-a="log" data-x="${k}">${ic(t.i)}<div><b>${k === 'impulso' ? L().meta + ' · impulso' : t.n}</b><div class="muted small">${{ aero: 'Minutos y moderados', fuerza: 'Series y repeticiones', comida: 'Ajuste y saciedad', estudio: 'Resolver y corregir', sueno: 'Al despertar', pausa: 'Tiempo sentado', vinculo: 'Contacto o invitación', impulso: 'Contexto y respuesta', medida: 'Peso, cintura, capacidad' }[k]}</div></div></button>`).join('')}</div>
  <div class="grid" style="margin-top:22px">
    <div class="card c6"><h3>${ic('timer', 20)} Bloque de estudio guiado · 25 min</h3><p class="muted">0-2 define · 2-12 resuelve sin mirar · 12-20 corrige · 20-25 reintenta.</p><button class="btn pri" data-a="timer">Iniciar bloque</button></div>
    <div class="card c6"><div class="row between"><h3>Últimos registros</h3><button class="btn" data-a="hist">Historial completo</button></div>${S.logs.slice(-6).reverse().map(l => `<div class="logitem"><div><div class="t">${TYPES[l.type].n} · ${fmt(l.date)}</div><div class="d">${esc(logSummary(l))}</div></div><button class="btn ghost" data-a="edit" data-x="${l.id}">${ic('chev', 18)}</button></div>`).join('') || '<div class="empty">Sin registros todavía.</div>'}</div>
  </div>`;
HANDLERS.registrar = (m) => onAct(m, { hist: () => openHistory(), log: (t) => openLog(t), timer: () => studyTimer(), edit: (id) => { const l = S.logs.find(x => x.id === id); l && openLog(l.type, {}, l); } });

/* ---------- PLAN ---------- */
let planPhase = null, planWeek = null;
SCREENS.plan = () => {
  const c = cal(), cw = c.weekOf(today()), curW = Math.max(cw, 1), maxW = Math.max(20, curW + 1);
  planWeek = planWeek || curW; planPhase = planPhase || Math.min(phaseOf(curW), 5);
  const P1 = C.PHASES[Math.min(planPhase, 5) - 1];
  const wp = weekPlan(planWeek), ks = daysOfWeek(planWeek), [a, b] = c.range(planWeek);
  return `
  <div class="head"><div><h1>Plan de 20 semanas</h1><div class="sub">${fmt(c.s, true)} → ${fmt(c.end, true)}${cw > 20 ? ` · ahora en mantenimiento (semana ${cw})` : ''} · La semana organiza la revisión; el cambio de fase no exige porcentajes ni pesos.</div></div></div>
  <div class="phases">${C.PHASES.map(p => `<button class="ph ${p.n === planPhase ? 'on' : ''}" data-a="phase" data-x="${p.n}"><div class="muted small">Fase ${p.n} · sem ${p.weeks[0]}-${p.weeks[1]}</div><b>${p.title}</b><div class="wk">${[0, 1, 2, 3].map(i => { const wn = p.weeks[0] + i; return `<i class="${wn < cw ? 'd' : wn === cw ? 'c' : ''}"></i>`; }).join('')}</div></button>`).join('')}</div>
  <div class="grid" style="margin-top:18px">
    <div class="card c7"><div class="kicker">Fase ${P1.n} · ${P1.title}</div><p style="margin-top:6px">${P1.goal}</p>
      ${[0, 1, 2, 3].map(i => { const wn = P1.weeks[0] + i, W = C.WEEKS[wn], r = c.range(wn); return `<div class="weekrow ${wn === cw ? 'now' : ''}" data-a="week" data-x="${wn}" style="cursor:pointer"><div><b>Sem ${wn}</b><div class="muted small">${fmt(r[0])}–${fmt(r[1])}</div>${S.reviews[wn] ? '<span class="pill ok" style="margin-top:6px">Revisada</span>' : ''}</div><div class="small">${W.a}</div><div class="small muted"><i>${W.q}</i></div></div>`; }).join('')}
      <h4>${P1.extraTitle}</h4><p class="small muted">${P1.extra}</p>
      <h4>Cierre de fase</h4><p class="small muted">${P1.close}</p>
    </div>
    <div class="card c5"><div class="row between"><div><div class="kicker">Mi semana ${planWeek}</div><div class="muted small">${fmt(a)} – ${fmt(b)}${wp.auto === false ? ' · editada por ti' : wp.inherited ? ` · heredada de la semana ${wp.inherited}` : ' · propuesta automática'}</div></div>
      <div class="row"><button class="btn ghost" data-a="wprev" ${planWeek <= 1 ? 'disabled' : ''}>‹</button><button class="btn ghost" data-a="wnext" ${planWeek >= maxW ? 'disabled' : ''}>›</button></div></div>
      <p class="small">${weekInfo(planWeek).a}</p>
      ${(() => { const pp = proposalPlan(planWeek, wp.walkMin); const cnt = (x) => [Object.values(x.days).filter(d => d.walk).length, Object.values(x.days).filter(d => d.str).length]; const [a1, b1] = cnt(pp), [a2, b2] = cnt(wp); return planWeek <= 20 && (a1 !== a2 || b1 !== b2) ? `<div class="tip small">Propuesta del manual para esta semana: <b>${a1} caminata${a1 !== 1 ? 's' : ''} y ${b1} sesión${b1 !== 1 ? 'es' : ''} de fuerza</b> (tienes ${a2} y ${b2}). Tu plan se hereda de la semana anterior; aplícala solo si decides cambiar. <button class="btn" style="margin-top:8px" data-a="wprop">Aplicar propuesta</button></div>` : ''; })()}
      <div class="daysel">${ks.map(k => { const d = wp.days[k] || {}; const f = fromKey(k); return `<div class="d ${k < today() ? 'past' : ''} ${k === today() ? 'today' : ''}"><div class="dl"><b>${DOW_S[f.getDay()]} ${f.getDate()}</b>${k === today() ? ' <span class="muted small">hoy</span>' : ''}</div><button data-a="twalk" data-x="${k}" class="${d.walk ? 'on' : ''}">${d.walk ? `Caminar ${d.walk}′` : 'Caminar'}</button><button data-a="tstr" data-x="${k}" class="${d.str ? 'on' : ''}">Fuerza</button></div>`; }).join('')}</div>
      <div class="field" style="margin-top:16px"><div class="lbl">Minutos por caminata</div><div class="num"><button class="step" data-a="wmin" data-x="-5">−</button><input type="number" value="${wp.walkMin}" readonly><button class="step" data-a="wmin" data-x="5">+</button><span class="unit">min</span></div>
      <div class="hint" style="margin-top:8px">Progresa una sola variable cada vez. Deja un día intermedio entre sesiones de fuerza.</div></div>
      <hr><div class="kicker" style="margin-bottom:10px">Hoja semanal</div>
      ${[['mov', 'Acción de movimiento y ocasiones'], ['meal', 'Ajuste en una comida habitual'], ['imp', 'Respuesta disponible ante el impulso'], ['hard', 'Semana difícil: qué reduzco y qué protejo']].map(f => `<div class="field"><label>${f[1]}</label><input type="text" data-wf="${f[0]}" value="${esc(wp[f[0]] || '')}"></div>`).join('')}
    </div>
    <div class="card c12"><h3>Semana organizada dentro de tu tiempo (ejemplo, sección 11)</h3>
      <table><tr><th>Día</th><th>Movimiento</th><th>Resto del plan</th></tr>
      <tr><td>Lunes</td><td>Caminata 25 min + fuerza 20-30 min</td><td>Comida habitual con ajuste; cierre 2 min</td></tr>
      <tr><td>Martes</td><td>Caminata 25 min</td><td>Contacto social breve si apetece; descanso libre</td></tr>
      <tr><td>Miércoles</td><td>Caminata 25 min</td><td>Preparar alimentos o recursos 10-15 min</td></tr>
      <tr><td>Jueves</td><td>Caminata 25 min + fuerza 20-30 min</td><td>Cierre breve; conservar margen</td></tr>
      <tr><td>Viernes</td><td>Descanso de entrenamiento; movimiento cotidiano</td><td>Ocio o vínculo elegido, sin cuota</td></tr>
      <tr><td>Sábado</td><td>Paseo 35 min, que puede ser social</td><td>El tiempo compartido cuenta una sola vez</td></tr>
      <tr><td>Domingo</td><td>Paseo opcional o descanso. Revisión 10 min</td><td>Elegir ocasiones de la siguiente semana</td></tr></table>
      <p class="small muted">En las primeras semanas usa las dosis de la fase 1. Solo cuentan como moderados los tramos que de verdad alcanzan esa intensidad.</p></div>
  </div>`;
};
HANDLERS.plan = (m) => {
  const upd = (fn) => { const wp = structuredClone(weekPlan(planWeek)); fn(wp); if (setWeekPlan(planWeek, wp)) route(); };
  onAct(m, {
    phase: (x) => { planPhase = +x; planWeek = C.PHASES[planPhase - 1].weeks[0]; route(); },
    week: (x) => { planWeek = +x; route(); },
    wprev: () => { planWeek--; planPhase = Math.min(phaseOf(planWeek), 5); route(); }, wnext: () => { planWeek++; planPhase = Math.min(phaseOf(planWeek), 5); route(); },
    twalk: (k) => upd(wp => { wp.days[k] = wp.days[k] || {}; wp.days[k].walk = wp.days[k].walk ? 0 : wp.walkMin; }),
    tstr: (k) => upd(wp => { wp.days[k] = wp.days[k] || {}; wp.days[k].str = !wp.days[k].str; }),
    wprop: () => upd(wp => { const pp = proposalPlan(planWeek, wp.walkMin); Object.keys(wp.days).forEach(k => { if (k >= today() && pp.days[k]) wp.days[k] = pp.days[k]; }); }),
    wmin: (x) => upd(wp => { wp.walkMin = Math.max(5, wp.walkMin + (+x)); Object.keys(wp.days).forEach(k => { if (wp.days[k].walk && k >= today()) wp.days[k].walk = wp.walkMin; }); })
  });
  m.addEventListener('change', (e) => { const f = e.target.dataset.wf; if (!f) return; const wp = structuredClone(weekPlan(planWeek)); wp[f] = e.target.value; if (setWeekPlan(planWeek, wp)) toast('Guardado'); });
};

/* ---------- REVISIÓN ---------- */
function weekStats(n) {
  const [a, b] = cal().range(n), ks = daysOfWeek(n), lim = today() < b ? today() : b;
  const L2 = logsIn(a, b);
  const byType = (t) => L2.filter(l => l.type === t);
  const cnt = (arr) => { const o = {}; arr.forEach(l => o[l.status] = (o[l.status] || 0) + 1); return o; };
  const aero = byType('aero').filter(l => C.DONE_STATES.includes(l.status));
  const hasMod = (l) => l.data.mod !== undefined && l.data.mod !== '' && l.data.mod !== null;
  const minT = aero.reduce((s, l) => s + (+l.data.min || 0), 0);
  const minM = aero.filter(hasMod).reduce((s, l) => s + (+l.data.mod || 0), 0);
  const minL = aero.filter(hasMod).reduce((s, l) => s + Math.max(0, (+l.data.min || 0) - (+l.data.mod || 0)), 0);
  const minU = aero.filter(l => !hasMod(l)).reduce((s, l) => s + (+l.data.min || 0), 0);
  const fz = byType('fuerza').filter(l => C.DONE_STATES.includes(l.status)).length;
  const wp = weekPlan(n), plannedWalk = ks.filter(k => wp.days[k] && wp.days[k].walk).length, plannedStr = ks.filter(k => wp.days[k] && wp.days[k].str).length;
  const known = ks.filter(k => k <= lim);
  const pc = { no: 0, yes: 0, priv: 0, nd: 0 };
  known.forEach(k => { const r = S.days[k] && S.days[k].p && S.days[k].p.res; pc[r === 'no' ? 'no' : r === 'yes' ? 'yes' : r === 'priv' ? 'priv' : 'nd']++; });
  const impUsed = known.filter(k => S.days[k] && S.days[k].p && S.days[k].p.imp === 'used').length;
  const impNot = known.filter(k => S.days[k] && S.days[k].p && S.days[k].p.imp === 'notused').length;
  return { a, b, ks, minT, minM, minL, minU, fz, plannedWalk, plannedStr, aeroStates: cnt(byType('aero')), strStates: cnt(byType('fuerza')), comida: byType('comida').length, estudio: byType('estudio').length, vinculo: byType('vinculo').length, pc, impUsed, impNot, known: known.length, opens: known.filter(k => S.days[k] && S.days[k].open).length };
}
function statesTxt(o) { const e = Object.entries(o); return e.length ? e.map(([k, n]) => `${n} ${C.STATE_LABEL[k].toLowerCase()}`).join(', ') : 'sin registros'; }
function weekSummaryHTML(n) {
  const s = weekStats(n);
  return `<div class="card" style="margin-bottom:18px"><div class="kicker">Semana ${n} · ${fmt(s.a)} – ${fmt(s.b)} · datos conocidos</div>
  <table>
  <tr><td>Movimiento aeróbico</td><td><b>${s.minT} min totales</b>: <b>${s.minM} moderados</b>, ${s.minL} ligeros${s.minU ? `, <b>${s.minU} sin intensidad declarada</b>` : ''}. Caminatas previstas: ${s.plannedWalk}. Estados: ${statesTxt(s.aeroStates)}.</td></tr>
  <tr><td>Fuerza</td><td><b>${s.fz} sesiones</b> (previstas ${s.plannedStr}). Estados: ${statesTxt(s.strStates)}.</td></tr>
  <tr><td>Otras áreas</td><td>Comida: ${s.comida} registros · Estudio: ${s.estudio} · Vínculo: ${s.vinculo}</td></tr>
  <tr><td>${L().meta}</td><td>${s.pc.no} días conocidos sin ${L().act}, ${s.pc.yes} con episodio, ${s.pc.nd} sin dato${s.pc.priv ? `, ${s.pc.priv} sin responder` : ''}. Impulsos con respuesta usada: ${s.impUsed}; sin usarla: ${s.impNot}.</td></tr>
  </table><p class="small muted">Las medidas no se suman en una nota única. Sin dato no se convierte en cero ni en realizado.</p></div>`;
}
SCREENS.revision = () => {
  const c = cal(), cw = Math.max(c.weekOf(today()), 1);
  const weeks = Array.from({ length: cw }, (_, i) => cw - i);
  return `<div class="head"><div><h1>Revisión</h1><div class="sub">Unos diez minutos al terminar la semana. Termina con una decisión concreta, no con una nota sobre tu valor personal.</div></div><button class="btn pri big" data-a="rev" data-x="${cw}">Revisar semana ${cw}</button></div>
  <div class="grid">
    <div class="c7">${weekSummaryHTML(cw)}
      <div class="card"><h3>Revisiones anteriores</h3>${weeks.map(n => { const r = S.reviews[n]; return `<div class="logitem"><div><div class="t">Semana ${n}${n % 4 === 0 && n <= 20 ? ' · cierre de fase ' + (n / 4) : n > 20 ? ' · mantenimiento' : ''}</div><div class="d">${r ? esc(`Mantengo ${r.mant || '—'}; cambio ${r.cambio || '—'}`) : 'Sin revisión'}</div></div><button class="btn ${r ? 'ghost' : ''}" data-a="rev" data-x="${n}">${r ? 'Ver' : 'Revisar'}</button></div>`; }).join('')}</div>
    </div>
    <div class="card c5"><h3>¿Qué ajusto? · reglas en orden</h3><p class="muted small">Toca la primera condición que se cumple; tiene prioridad sobre las inferiores.</p>
      ${C.ADJUST_RULES.map((r, i) => `<button class="btn block" style="justify-content:flex-start;text-align:left;margin-top:8px;min-height:54px" data-a="rule" data-x="${i}">${i + 1}. ${r[0]}</button>`).join('')}
      <div id="ruleOut"></div>
    </div>
  </div>`;
};
HANDLERS.revision = (m) => onAct(m, {
  rev: (n) => openReview(+n),
  rule: (i) => { const r = C.ADJUST_RULES[+i]; $('#ruleOut').innerHTML = `<div class="tip ${+i === 0 ? 'a' : ''}" style="margin-top:14px"><b>Respuesta ahora:</b> ${r[1]}<br><b>Cuándo revisar:</b> ${r[2]}${+i === 0 ? `<br><br>${careBtn}` : ''}</div>`; }
});
function openReview(n, override) {
  n = Math.max(+n || 1, 1);
  const W = weekInfo(n), isClose = n % 4 === 0 && n <= 20, v = override || (S.reviews[n] ? structuredClone(S.reviews[n]) : {});
  const schema = [
    { t: 'h', l: `Pregunta de la semana ${n}`, hint: W.q },
    { k: 'semanal', l: 'Tu respuesta', t: 'area' },
    { t: 'h', l: '1. ¿Qué acciones estaban previstas y cuáles conozco?', hint: 'El resumen de arriba usa solo cantidades reales. No rellenes huecos con fallos o éxitos.' },
    { k: 'q1', l: 'Aclaración (opcional)', t: 'text' },
    { t: 'h', l: '2. ¿Qué resultado concreto observé?' },
    { k: 'q2', l: 'Resultado', t: 'seg', o: ['Mejora', 'Estabilidad', 'Empeoramiento', 'Aún no sé'] },
    { k: 'q2t', l: 'Ejemplo', t: 'text' },
    { t: 'h', l: '3. ¿Qué costo tuvo?', hint: 'Tiempo, dinero y efectos sobre hambre, sueño, cansancio, dolor o preocupación.' },
    { k: 'q3', l: 'Costos notables', t: 'multi', o: ['Tiempo', 'Dinero', 'Hambre', 'Sueño', 'Cansancio', 'Dolor', 'Preocupación', 'Ninguno relevante'] },
    { t: 'note', cls: 'w', s: v => (v.q3 || []).some(x => ['Hambre', 'Sueño', 'Dolor'].includes(x)), html: 'Si interfiere con necesidades básicas, reduce carga antes de añadir tareas.' },
    { t: 'h', l: '4. ¿Qué barrera se repitió y puedo modificar?' },
    { k: 'q4', l: 'Barrera principal', t: 'seg', o: C.BARRIERS },
    { k: 'q4t', l: 'Opción accesible', t: 'text', hint: 'Cambia entorno, horario, dosis o método; no todo se resuelve esforzándote más.' },
    { t: 'h', l: '5. ¿Qué decido para la próxima semana?' },
    { k: 'q5', l: 'Decisión', t: 'seg', o: ['Mantener', 'Progresar una variable', 'Reducir', 'Cambiar método', 'Pedir apoyo'] },
    { t: 'note', s: v => v.q5 === 'Progresar una variable', html: 'Una sola: unos minutos en una caminata, otra ocasión breve, algunas repeticiones o una serie en un ejercicio. Primero revisa dolor, sueño y recuperación.' },
    { t: 'h', l: '6. ¿Mis metas siguen siendo propias y útiles?' },
    { k: 'q6', l: 'Metas', t: 'seg', o: ['Sí', 'Necesito matizar', 'Quiero cambiarlas'] },
    { k: 'q6t', l: 'Nueva elección y desde cuándo se aplica', t: 'text', s: v => v.q6 && v.q6 !== 'Sí' },
    { t: 'h', l: 'Resultado escrito' },
    { k: 'mant', l: 'La próxima semana mantengo…', t: 'text' },
    { k: 'cambio', l: 'Cambio…', t: 'text' },
    { k: 'porque', l: 'porque…', t: 'text' },
    { k: 'despues', l: 'Lo haré después de…', t: 'text' },
    { k: 'siocurre', l: 'Si ocurre ___ usaré ___', t: 'text' },
    { k: 'revdia', l: 'Revisaré el día', t: 'date' }
  ];
  if (isClose) schema.push(
    { t: 'h', l: `Cierre de fase ${n / 4}`, hint: C.PHASES[n / 4 - 1].close },
    { k: 'f1', l: '¿Qué mejoró desde el cierre anterior?', t: 'text', ph: 'Ejemplo físico, académico, cotidiano o de Meta P; o “sin cambio claro”' },
    { k: 'f2', l: '¿Qué acciones explican posiblemente esa mejora?', t: 'text' },
    { k: 'f3', l: '¿Qué me cuesta más de lo que aporta?', t: 'text' },
    { k: 'f4', l: '¿Cambió mi situación?', t: 'multi', o: ['Salud', 'Horario', 'Recursos', 'Apoyo', 'Metas', 'No'] },
    { k: 'f5', l: '¿Qué haré en la fase siguiente? (dos prioridades, dosis tolerada, primera ocasión y alternativa)', t: 'area' },
    { k: 'f6', l: '¿Necesito apoyo?', t: 'seg', o: ['No', 'Una persona', 'Docente', 'Nutrición', 'Salud', 'Psicología'] });
  if (n === 20) schema.push(
    { t: 'h', l: 'Balance final en cinco frases' },
    { k: 'b1', l: 'Mi prioridad actual es…', t: 'text' }, { k: 'b2', l: 'Lo que mejoró y puedo describir con un ejemplo es…', t: 'text' },
    { k: 'b3', l: 'La acción que conservaré y su frecuencia serán…', t: 'text' }, { k: 'b4', l: 'Ante una semana difícil haré…', t: 'text' },
    { k: 'b5', l: 'Mi próxima revisión será el día…; pediré apoyo si…', t: 'text' },
    { t: 'h', l: 'Plan para los tres meses posteriores', hint: 'Si ya es estable, revisa cada dos semanas y luego mensualmente.' },
    { k: 'm1', l: 'Acciones que conservaré y frecuencia realista', t: 'area' }, { k: 'm2', l: 'Señal habitual', t: 'text' },
    { k: 'm3', l: 'Alternativa para exámenes o enfermedad', t: 'text' }, { k: 'm4', l: 'Forma de evaluar', t: 'text' }, { k: 'm5', l: 'Próxima revisión', t: 'date' });
  sheet({ title: isClose ? `Revisión y cierre · semana ${n}` : `Revisión · semana ${n}`, sub: W.a, values: v, body: weekSummaryHTML(n), schema,
    draft: { kind: 'review', arg: n },
    onSave: (v) => {
      if (!commit(() => { S.reviews[n] = Object.assign(v, { at: Date.now() }); const nx = S.weekPlans[n + 1]; if (nx && nx.auto !== false && today() <= cal().range(n + 1)[1]) delete S.weekPlans[n + 1]; })) return false;
      toast(v.q5 === 'Progresar una variable' ? 'Revisión guardada. Ajusta esa variable en Plan → Mi semana.' : 'Revisión guardada');
    } });
}
DRAFT_OPENERS.review = (n, v) => openReview(n, v);
function _endReview() {
}

/* ---------- PROGRESO ---------- */
function barChart(data, series, opts = {}) {
  // data: [{label, vals:[...], tt}], series: [{name,color}] apilado
  const W = 640, H = 220, pl = 36, pb = 26, pt = 10, n = data.length;
  const max = Math.max(opts.min || 1, ...data.map(d => d.vals.reduce((a, b) => a + b, 0)));
  const nice = Math.ceil(max / (opts.stepY || 10)) * (opts.stepY || 10);
  const bw = Math.min(36, (W - pl) / n * 0.62), gap = (W - pl) / n;
  const y = (v) => pt + (H - pt - pb) * (1 - v / nice);
  let g = `<g class="grid">${[0, .5, 1].map(f => `<line x1="${pl}" x2="${W}" y1="${y(nice * f)}" y2="${y(nice * f)}"/><text x="${pl - 6}" y="${y(nice * f) + 4}" text-anchor="end">${Math.round(nice * f)}</text>`).join('')}</g>`;
  data.forEach((d, i) => {
    const x = pl + gap * i + (gap - bw) / 2; let acc = 0;
    d.vals.forEach((v, si) => {
      if (!v) return; const y0 = y(acc), y1 = y(acc + v); acc += v;
      const h = Math.max(0, y0 - y1 - (si > 0 ? 2 : 0)), top = acc === d.vals.reduce((a, b) => a + b, 0);
      const r = top ? Math.min(4, h / 2) : 0;
      g += `<path fill="${series[si].color}" d="M${x},${y0 - (si > 0 ? 2 : 0)} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0 - (si > 0 ? 2 : 0)} Z"/>`;
    });
    g += `<rect x="${pl + gap * i}" y="${pt}" width="${gap}" height="${H - pt - pb}" fill="transparent" data-tt="${esc(d.tt)}"/>`;
    if (n <= 24 || i % Math.ceil(n / 24) === 0) g += `<text x="${pl + gap * i + gap / 2}" y="${H - 8}" text-anchor="middle">${d.label}</text>`;
  });
  return `${series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>` : ''}<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
function lineChart(pts, unit) {
  const W = 640, H = 200, pl = 44, pb = 26, pt = 12;
  const vs = pts.map(p => p.v), lo = Math.floor(Math.min(...vs) - 1), hi = Math.ceil(Math.max(...vs) + 1);
  const x = (i) => pl + (W - pl - 16) * (pts.length === 1 ? .5 : i / (pts.length - 1)), y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo || 1));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><g class="grid">${[lo, (lo + hi) / 2, hi].map(v => `<line x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 10) / 10}</text>`).join('')}</g>
  <polyline fill="none" stroke="var(--s1)" stroke-width="2" points="${pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')}"/>
  ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="5" fill="var(--s1)" stroke="var(--surface)" stroke-width="2"/><circle cx="${x(i)}" cy="${y(p.v)}" r="18" fill="transparent" data-tt="${fmt(p.d)}: ${p.v} ${unit}"/>`).join('')}
  ${pts.map((p, i) => (i === 0 || i === pts.length - 1) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${fmt(p.d)}</text>` : '').join('')}</svg>`;
}
let progAll = false;
SCREENS.progreso = () => {
  const c = cal(), cw = Math.max(c.weekOf(today()), 1), all = Array.from({ length: cw }, (_, i) => i + 1);
  const weeks = progAll ? all : all.slice(-20), stAll = all.map(n => weekStats(n)), st = weeks.map(n => stAll[n - 1]);
  const cs = getComputedStyle(document.documentElement);
  const col = (v) => cs.getPropertyValue(v).trim();
  const mov = barChart(st.map((s, i) => ({ label: 'S' + weeks[i], vals: [s.minM, s.minL, s.minU], tt: `<b>Semana ${weeks[i]}</b>${weeks[i] > 20 ? ' · mantenimiento' : ''}<br>${s.minT} min totales<br>${s.minM} moderados · ${s.minL} ligeros${s.minU ? `<br>${s.minU} sin intensidad declarada` : ''}` })), [{ name: 'Moderados', color: col('--s1') }, { name: 'Ligeros', color: col('--s2') }, { name: 'Intensidad sin declarar', color: col('--s-nd') }], { min: 60, stepY: 30 });
  const str = barChart(st.map((s, i) => ({ label: 'S' + weeks[i], vals: [s.fz], tt: `<b>Semana ${weeks[i]}</b><br>${s.fz} sesiones de fuerza` })), [{ name: 'Sesiones', color: col('--s1') }], { min: 2, stepY: 1 });
  // calendario Meta P (lunes a domingo)
  const lim = today();
  let cells = ''; const s0 = progAll ? c.s : (cw > 20 ? cal().range(cw - 19)[0] : c.s), lead = (fromKey(s0).getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) cells += '<i class="out"></i>';
  for (let k = s0; k <= lim; k = addDays(k, 1)) { const r = S.days[k] && S.days[k].p && S.days[k].p.res; const cls = r === 'no' ? 'no' : r === 'yes' ? 'yes' : r === 'priv' ? 'priv' : 'nd'; cells += `<i class="${cls} ${k === today() ? 'today' : ''}" data-tt="${fmt(k, true)}: ${{ no: 'sin ' + L().act, yes: 'episodio', priv: 'prefiero no responder', nd: 'sin dato' }[cls]}"></i>`; }
  const tot = { no: 0, yes: 0, nd: 0, priv: 0 }; stAll.forEach(s => { tot.no += s.pc.no; tot.yes += s.pc.yes; tot.nd += s.pc.nd; tot.priv += s.pc.priv; });
  const pesos = S.logs.filter(l => l.type === 'medida' && l.data.peso).sort((a, b) => a.date < b.date ? -1 : 1).map(l => ({ d: l.date, v: +l.data.peso }));
  const cint = S.logs.filter(l => l.type === 'medida' && l.data.cintura).sort((a, b) => a.date < b.date ? -1 : 1);
  const fz = S.logs.filter(l => l.type === 'fuerza' && C.DONE_STATES.includes(l.status)).sort((a, b) => a.date < b.date ? -1 : 1);
  const totMin = stAll.reduce((a, s) => a + s.minT, 0), totMod = stAll.reduce((a, s) => a + s.minM, 0), totU = stAll.reduce((a, s) => a + s.minU, 0), totFz = stAll.reduce((a, s) => a + s.fz, 0);
  return `<div class="head"><div><h1>Progreso</h1><div class="sub">Cuatro medidas distintas: ocasiones, cantidad, resultado y costo. No se suman en una nota única.</div></div>${cw > 20 ? `<div class="seg"><button data-a="prange" data-x="20" class="${progAll ? '' : 'on'}">Últimas 20 semanas</button><button data-a="prange" data-x="all" class="${progAll ? 'on' : ''}">Todo (${cw} semanas)</button></div>` : ''}</div>
  <div class="grid">
    <div class="card c4"><div class="kicker">Movimiento acumulado</div><div class="stat">${totMin}<small>min</small></div><div class="muted small">${totMod} min moderados${totU ? ` · ${totU} sin intensidad declarada` : ''} · se informan aparte</div></div>
    <div class="card c4"><div class="kicker">Fuerza</div><div class="stat">${totFz}<small>sesiones</small></div><div class="muted small">en ${cw} semana${cw > 1 ? 's' : ''}${cw > 20 ? ' (incluye mantenimiento)' : ''}</div></div>
    <div class="card c4"><div class="kicker">${L().meta}</div><div class="stat">${tot.no}<small>días conocidos</small></div><div class="muted small">sin ${L().act} · ${tot.yes} con episodio · ${tot.nd} sin dato${tot.priv ? ' · ' + tot.priv + ' privados' : ''}</div></div>
    <div class="card c7"><h3>Minutos de movimiento por semana</h3>${mov}<p class="small muted">Referencia de salud para adultos: 150-300 min moderados semanales, a la que aproximarse gradualmente (semana 11 en adelante: 120-150 si se tolera). No es condición para pasar de fase.</p></div>
    <div class="card c5"><h3>${L().meta} · calendario</h3>
      <div class="legend"><span><i style="background:var(--s1)"></i>Sin ${L().act}</span><span><i style="background:var(--s3)"></i>Episodio</span><span><i style="border:1.5px dashed var(--s-nd)"></i>Sin dato</span><span><i style="background:repeating-linear-gradient(45deg,var(--s-nd) 0 3px,transparent 3px 7px)"></i>Privado</span></div>
      <div class="cal" style="margin-top:10px">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<div class="muted small" style="text-align:center">${d}</div>`).join('')}${cells}</div>
      <p class="small muted" style="margin-top:10px">Un episodio es información sobre una ocasión; no borra otras acciones. El día sin dato no se asume.</p></div>
    <div class="card c6"><h3>Sesiones de fuerza por semana</h3>${str}</div>
    <div class="card c6"><h3>Fuerza por ejercicio</h3>${fz.length ? `<table><tr><th>Ejercicio</th><th>Primera</th><th>Última</th></tr>${C.EXERCISES.map(e => { const f = fz.map(l => (l.data.ex || []).find(x => x.k === e[0] && !x.skip)).filter(Boolean); return f.length ? `<tr><td>${e[1]}</td><td>${f[0].sets}×${f[0].reps}</td><td><b>${f[f.length - 1].sets}×${f[f.length - 1].reps}</b></td></tr>` : ''; }).join('')}</table><p class="small muted">Más control o repeticiones con igual carga puede ser progreso.</p>` : '<div class="empty">Aún sin sesiones de fuerza registradas.</div>'}</div>
    <div class="card c6"><h3>Peso (opcional)</h3>${pesos.length >= 2 ? lineChart(pesos, 'kg') : `<div class="empty">${pesos.length ? 'Un registro. Con dos o más verás la tendencia.' : 'Sin registros. Es opcional: una vez por semana en condiciones similares.'}</div>`}<p class="small muted">Observa varias mediciones junto con bienestar; no diagnostican composición corporal. No ajustes por el espejo diario.</p></div>
    <div class="card c6"><h3>Cintura, capacidad y energía</h3>${S.logs.filter(l => l.type === 'medida').length ? S.logs.filter(l => l.type === 'medida').sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 6).map(l => `<div class="logitem"><div><div class="t">${fmt(l.date)}</div><div class="d">${esc(logSummary(l)) || '—'}${l.data.energia ? ' · energía ' + esc(l.data.energia.toLowerCase()) : ''}</div></div><button class="btn ghost" data-a="edit" data-x="${l.id}">${ic('chev', 18)}</button></div>`).join('') : '<div class="empty">Compara una ruta o ejercicio similar cada cuatro semanas.</div>'}<button class="btn" data-a="med" style="margin-top:10px">Añadir medida opcional</button></div>
  </div>`;
};
HANDLERS.progreso = (m) => onAct(m, { prange: (x) => { progAll = x === 'all'; route(); }, med: () => openLog('medida'), edit: (id) => { const l = S.logs.find(x => x.id === id); l && openLog(l.type, {}, l); } });

/* ---------- GUÍAS ---------- */
let guide = 'reglas';
SCREENS.guias = () => {
  const G = C.GUIDES.find(g => g.id === guide) || C.GUIDES[0];
  const title = (g) => g.id === 'metap' ? `${L().meta}: acuerdo personal` : g.title;
  return `<div class="head"><div><h1>Guías</h1><div class="sub">Cómo realizar cada acción, según tu manual.</div></div></div>
  <div class="grid"><div class="card c4 guide-list" style="padding:8px 16px">${C.GUIDES.map(g => `<button data-a="g" data-x="${g.id}" class="${g.id === G.id ? 'on' : ''}"><span>${title(g)}</span><span class="muted small">§${g.sec}</span></button>`).join('')}</div>
  <div class="card c8 prose"><div class="kicker">Sección ${G.sec}</div><h2 style="margin:4px 0 12px">${title(G)}</h2>${G.html}</div></div>`;
};
HANDLERS.guias = (m) => onAct(m, { g: (x) => { guide = x; route(); } });

/* ---------- CUIDADO (sección 34) ---------- */
function openCare() {
  sheet({ title: 'Cuidado, apoyo y privacidad', body: `<div class="card alert"><h3>Atención inmediata</h3><p>${C.CARE.urgent}</p></div>
  <h3 style="margin:22px 0 8px">Evaluación que conviene programar</h3><table><tr><th>Situación</th><th>Apoyo apropiado</th></tr>${C.CARE.table.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>
  <h3 style="margin:22px 0 8px">Qué llevar a una consulta</h3><p>${C.CARE.consult}</p>
  <h3 style="margin:22px 0 8px">Privacidad y autonomía</h3><p>${C.CARE.privacy}</p><p class="muted small">${C.CARE.disclaimer}</p>` });
}

/* ---------- PROTOCOLO DE PAUSA (sección 23) ---------- */
/* Temporizadores: cuentan con el reloj real (siguen corriendo si sales de la app o bloqueas la tablet)
   y su estado se guarda para retomarlos aunque Android cierre la app. */
const TIMER_KEY = 'plan20.timer';
let timerInt = null;
const saveTimer = (t) => { try { t ? localStorage.setItem(TIMER_KEY, JSON.stringify(t)) : localStorage.removeItem(TIMER_KEY); } catch (e) {} };
const getTimer = () => { try { const t = JSON.parse(localStorage.getItem(TIMER_KEY)); return t && Date.now() - t.t0 < 4 * 3600e3 ? t : null; } catch (e) { return null; } };
const mmss = (ms) => { const s2 = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s2 / 60)}:${pad2(s2 % 60)}`; };
function protocol(restore) {
  document.querySelectorAll('.proto').forEach(x => x.remove()); clearInterval(timerInt);
  const alts = (S.profile && S.profile.alternativas && S.profile.alternativas.length) ? S.profile.alternativas : ['Tarea doméstica corta', 'Lectura', 'Descanso fuera de la cama', 'Caminar suave'];
  const st = restore || { kind: 'proto', step: 1, alt: null, int: null, endAt: 0, t0: Date.now(), day: today() };
  const el = document.createElement('div'); el.className = 'proto'; document.body.appendChild(el);
  const stop = () => { clearInterval(timerInt); timerInt = null; };
  const persist = () => saveTimer(st);
  const finish = (ok) => {
    const k = st.day || today();
    const done = commit(() => { addLog('impulso', k, 'done', { usado: 'si', int: st.int || undefined, alt: st.alt || undefined, via: 'protocolo', seguir: ok ? 'si' : 'no' }); recomputeP(k); });
    if (!done) return; // el error ya se mostró; el protocolo sigue abierto para reintentar
    stop(); saveTimer(null); el.remove(); route(); toast('Registrado: respuesta usada');
  };
  const run = (id, label) => { stop(); const tick = () => { const e = $('#' + id, el); if (!e) return stop(); const left = st.endAt - Date.now(); e.textContent = mmss(left); if (left <= 0) { stop(); const n = $('#' + id + 'n', el); if (n) n.textContent = label; } }; tick(); timerInt = setInterval(tick, 500); };
  const steps = (n) => `<div class="steps">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;
  const draw = () => {
    const s2 = st.step;
    el.innerHTML = `<button class="btn close" data-x>${ic('x')} Salir</button>${steps(s2)}` + ({
      1: `<h2>Tengo un impulso; puedo elegir el siguiente paso</h2><p>No necesitas discutir con cada pensamiento. Si te sirve, nombra la intensidad.</p><div class="alts">${['Baja', 'Media', 'Alta'].map(i => `<button data-int="${i}" class="${st.int === i ? 'on' : ''}">${i}</button>`).join('')}</div><button class="btn pri big" data-next>Hacer una pausa</button>`,
      2: `<h2>Pausa</h2><p>Deja lo que estás usando. Nota los pies apoyados, identifica lo que ves y oyes, y respira de forma cómoda.</p><div class="breath" id="bt">1:30</div><p class="small" id="btn" style="min-height:1.5em"></p><button class="btn pri big" data-next>Continuar</button>`,
      3: `<h2>Cambia de contexto</h2><p>Sal de la cama si estabas usando el teléfono, deja el dispositivo en otro lugar o ve a un espacio donde puedas continuar otra actividad.</p><p class="small">El temporizador sigue aunque cierres o bloquees la tablet.</p>${P('Shield') && window.shieldLock ? `<button class="btn big" onclick="shieldLock()" style="margin-top:14px">Bloquear la tablet ${(S.shield && S.shield.cfg && S.shield.cfg.minutes) || 5} min</button><br>` : ''}<button class="btn pri big" data-next style="margin-top:20px">Hecho</button>`,
      4: `<h2>Alternativa · unos 10 minutos</h2><p>Elegida por utilidad, no como castigo.</p><div class="alts">${alts.map(a => `<button data-alt="${esc(a)}" class="${st.alt === a ? 'on' : ''}">${esc(a)}</button>`).join('')}</div>${st.alt ? `<div class="breath" id="at" style="animation:none;font-size:3rem">10:00</div><p class="small" id="atn" style="min-height:1.5em">Puedes dejar la tablet: al volver seguirá aquí.</p>` : ''}<button class="btn pri big" data-next ${st.alt ? '' : 'disabled'}>Revisar</button>`,
      5: `<h2>¿Puedo continuar mi actividad?</h2><p>Si el impulso sigue, repite una pausa o cambia de alternativa. No tienes que vigilarte todo el día.</p><div class="row" style="justify-content:center;margin-top:20px"><button class="btn big" data-again>Repetir pausa</button><button class="btn big" data-alt2>Otra alternativa</button><button class="btn pri big" data-done>Sí, continúo</button></div>`
    })[s2];
    if (s2 === 2) { if (!st.endAt) st.endAt = Date.now() + 90e3; run('bt', 'Pausa completada.'); }
    if (s2 === 4 && st.alt) { if (!st.endAt) st.endAt = Date.now() + 600e3; run('at', 'Tiempo cumplido. Pulsa Revisar.'); }
    persist();
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.x !== undefined) { stop(); saveTimer(null); el.remove(); return; }
    if (b.dataset.int) { st.int = b.dataset.int; draw(); return; }
    if (b.dataset.alt) { if (st.alt !== b.dataset.alt) st.endAt = 0; st.alt = b.dataset.alt; draw(); return; }
    if (b.dataset.next !== undefined) { st.step++; st.endAt = 0; draw(); return; }
    if (b.dataset.again !== undefined) { st.step = 2; st.endAt = 0; draw(); return; }
    if (b.dataset.alt2 !== undefined) { st.step = 4; st.alt = null; st.endAt = 0; stop(); draw(); return; }
    if (b.dataset.done !== undefined) finish(true);
  });
  draw();
}

/* ---------- BLOQUE DE ESTUDIO 25 MIN (sección 19) ---------- */
const STUDY_PH = [[2, 'Define', 'Una pregunta o problema preciso. Prepara material y una forma de verificar.'], [10, 'Resuelve sin mirar', 'Intenta explicar o resolver sin mirar la solución. Si te bloqueas, señala el punto exacto.'], [8, 'Corrige', 'Compara con una fuente fiable, corrige el error y explica por qué ocurrió.'], [5, 'Reintenta', 'Intenta de nuevo el paso difícil o un ejemplo parecido. Programa un reencuentro.']];
function studyTimer(due, restore) {
  document.querySelectorAll('.proto').forEach(x => x.remove()); clearInterval(timerInt);
  const st = restore || { kind: 'study', i: 0, endAt: Date.now() + STUDY_PH[0][0] * 60e3, paused: false, left: 0, dueId: due ? due.id : null, t0: Date.now(), finished: false };
  if (!due && st.dueId) due = S.studyDue.find(x => x.id === st.dueId);
  // si pasó tiempo fuera, avanzar tramos según el reloj real
  if (!st.paused) while (!st.finished && Date.now() >= st.endAt) { if (st.i < 3) { st.i++; st.endAt += STUDY_PH[st.i][0] * 60e3; } else st.finished = true; }
  const el = document.createElement('div'); el.className = 'proto'; document.body.appendChild(el);
  const leftMs = () => st.paused ? st.left : st.endAt - Date.now();
  const draw = () => {
    const ph = STUDY_PH[st.i];
    el.innerHTML = `<button class="btn close" data-x>${ic('x')} Salir</button><div class="steps">${STUDY_PH.map((_, j) => `<i class="${j <= st.i ? 'on' : ''}"></i>`).join('')}</div>
    ${due ? `<p style="margin:0 0 8px">${esc(due.tema)} · ${esc(due.tarea)}</p>` : ''}<h2>${st.finished ? 'Bloque terminado' : ph[1]}</h2><p>${st.finished ? 'Registra qué resolviste solo y qué error quedó.' : ph[2]}</p>
    <div class="breath" style="animation:none;font-size:3rem" id="st">${st.finished ? '0:00' : mmss(leftMs())}</div>
    <p class="small">${st.paused ? 'En pausa.' : 'Sigue contando aunque salgas de la app.'}</p>
    <div class="row" style="justify-content:center">${st.finished ? '' : `<button class="btn big" data-p>${st.paused ? 'Reanudar' : 'Pausar'}</button>`}<button class="btn big ${st.finished ? 'pri' : ''}" data-n>${st.finished || st.i === 3 ? 'Terminar y registrar' : 'Siguiente tramo'}</button></div>`;
    saveTimer(st);
  };
  const next = () => { if (st.i < 3) { st.i++; const d = STUDY_PH[st.i][0] * 60e3; if (st.paused) st.left = d; else st.endAt = Date.now() + d; draw(); } else end(); };
  const end = () => { clearInterval(timerInt); saveTimer(null); el.remove(); openLog('estudio', { status: 'done', tema: due ? due.tema : '', _dueId: due ? due.id : undefined }); };
  timerInt = setInterval(() => {
    if (st.paused || st.finished) return;
    const e = $('#st', el), left = leftMs(); if (e) e.textContent = mmss(left);
    if (left <= 0) { if (st.i < 3) next(); else { st.finished = true; draw(); } }
  }, 500);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.x !== undefined) { clearInterval(timerInt); saveTimer(null); el.remove(); }
    else if (b.dataset.p !== undefined) { if (st.paused) { st.endAt = Date.now() + st.left; st.paused = false; } else { st.left = st.endAt - Date.now(); st.paused = true; } draw(); }
    else if (b.dataset.n !== undefined) next();
  });
  draw();
}
function resumeTimer() {
  const t = getTimer(); if (!t || document.querySelector('.proto')) return;
  if (t.kind === 'proto') protocol(t); else if (t.kind === 'study') studyTimer(null, t);
}

/* ---------- AJUSTES ---------- */
SCREENS.ajustes = () => {
  const s = S.settings, r = s.remind;
  return `<div class="head"><div><h1>Ajustes</h1><div class="sub">Tus datos se guardan solo en esta tablet. No se envían a ningún servidor.</div></div></div>
  <div class="grid">
    <div class="card c6"><h3>${ic('sun', 20)} Recordatorios</h3>
      <div class="field"><div class="seg"><button data-a="ron" class="${r.on ? 'on' : ''}">Activados</button><button data-a="roff" class="${!r.on ? 'on' : ''}">Desactivados</button></div></div>
      <div class="row" style="align-items:flex-start">
        <div class="field" style="flex:1;min-width:140px"><label>Apertura (diaria)</label><input type="time" data-r="open" value="${r.open}"></div>
        <div class="field" style="flex:1;min-width:140px"><label>Cierre (diario)</label><input type="time" data-r="close" value="${r.close}"></div>
        <div class="field" style="flex:1;min-width:140px"><label>Revisión (domingo)</label><input type="time" data-r="review" value="${r.review}"></div></div>
      <p class="small muted">Los avisos usan textos neutros (“Plan 20 · apertura del día”). ${NATIVE ? '' : 'En navegador no se programan; solo en la app instalada.'}</p>
      <button class="btn" data-a="rtest">Probar aviso en 5 s</button>
    </div>
    <div class="card c6"><h3>${ic('lock', 20)} Privacidad</h3>
      <div class="field"><div class="lbl">Etiquetas discretas</div><div class="hint">Muestra “Meta P” en lugar de “Meta sexual” en pantallas y títulos.</div><div class="seg"><button data-a="disc" data-x="1" class="${s.discreet ? 'on' : ''}">Sí</button><button data-a="disc" data-x="0" class="${!s.discreet ? 'on' : ''}">No</button></div></div>
      <div class="field"><div class="lbl">Mostrar conteo de días seguidos</div><div class="hint">Opcional: úsalo solo si te resulta útil y no aumenta preocupación.</div><div class="seg"><button data-a="strk" data-x="1" class="${s.streak ? 'on' : ''}">Sí</button><button data-a="strk" data-x="0" class="${!s.streak ? 'on' : ''}">No</button></div></div>
      <button class="btn" data-a="pin">Cambiar PIN</button>
      <p class="small muted" style="margin-top:12px">La app se bloquea al salir de ella y oculta su contenido en “recientes” y capturas de pantalla.</p>
    </div>
    <div class="card c6"><h3>Apariencia</h3><div class="seg">${[['system', 'Según sistema'], ['light', 'Claro'], ['dark', 'Oscuro']].map(o => `<button data-a="theme" data-x="${o[0]}" class="${s.theme === o[0] ? 'on' : ''}">${o[1]}</button>`).join('')}</div></div>
    <div class="card c6"><h3>Mi inicio personal</h3><p class="muted small">Metas, punto de partida, limitaciones, respuesta al impulso, comida elegida y acciones principales. Revísalo si tu situación cambia.</p><button class="btn" data-a="prof">Editar inicio personal</button></div>
    <div class="card c6"><h3>Copia de seguridad</h3><p class="muted small">Exporta un archivo .json para guardarlo donde elijas (Drive, Archivos…). Contiene datos íntimos: guárdalo en un lugar privado.</p>
      <div class="row"><button class="btn pri" data-a="exp">Exportar copia</button><label class="btn" style="cursor:pointer">Importar copia<input type="file" accept="application/json,.json" id="imp" hidden></label></div></div>
    <div class="card c6"><h3>Calendario</h3><p class="small">Semana 1: <b>${fmt(cal().range(1)[0], true)} – ${fmt(cal().range(1)[1], true)}</b>. Las semanas 2-20 van de lunes a domingo. Final: <b>${fmt(cal().end, true)}</b>.</p>
      <div class="field"><label>Fecha de inicio</label><input type="date" id="startD" value="${s.start}"></div>
      <hr><button class="btn danger" data-a="wipe">Borrar todos los datos</button></div>
  </div><p class="muted small" style="margin-top:20px">${C.CARE.disclaimer} Basada en el “Manual personal de acción | 20 semanas”, versión ampliada del 23 sep 2026.</p>`;
};
HANDLERS.ajustes = (m) => {
  const set = (fn) => { if (commit(fn)) route(); };
  onAct(m, {
    ron: () => { set(() => { S.settings.remind.on = true; }); scheduleReminders(true); }, roff: () => { set(() => { S.settings.remind.on = false; }); scheduleReminders(); },
    rtest: async () => { const LN = P('LocalNotifications'); if (!LN) return toast('Solo en la app instalada'); await LN.requestPermissions(); await LN.schedule({ notifications: [{ id: 99, title: 'Plan 20', body: 'Aviso de prueba', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] }); toast('Aviso programado'); },
    disc: (x) => set(() => { S.settings.discreet = x === '1'; }), strk: (x) => set(() => { S.settings.streak = x === '1'; }),
    theme: (x) => set(() => { S.settings.theme = x; applyTheme(); }),
    pin: () => lockScreen('create', () => toast('PIN actualizado')),
    prof: () => onboarding(true),
    exp: () => exportData(),
    wipe: (x, b) => { if (b.dataset.c) { localStorage.clear(); location.reload(); } else { b.dataset.c = 1; b.textContent = 'Toca otra vez: se borrará todo'; } }
  });
  m.addEventListener('change', (e) => {
    if (e.target.dataset.r) { if (commit(() => { S.settings.remind[e.target.dataset.r] = e.target.value; })) { scheduleReminders(); toast('Horario guardado'); } }
    if (e.target.id === 'startD' && e.target.value && validDate(e.target.value)) { if (commit(() => { S.settings.start = e.target.value; S.weekPlans = {}; })) { route(); toast('Inicio actualizado. Revisa tu plan semanal.'); } }
    if (e.target.id === 'imp' && e.target.files[0]) { const fr = new FileReader(); fr.onload = () => importBackup(fr.result); fr.readAsText(e.target.files[0]); e.target.value = ''; }
  });
};
/* Importación segura: se valida TODO antes de sustituir; el estado anterior queda como respaldo. */
function importBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { return errorBox('Copia no válida', 'El archivo no es una copia de Plan 20 (no se pudo leer). Tus datos no se tocaron.'); }
  const errs = [];
  if (!d || typeof d !== 'object' || typeof d.v !== 'number') errs.push('No es una copia de Plan 20.');
  else {
    if (d.v > DEFAULT.v) errs.push('La copia es de una versión más nueva de la app.');
    if (!d.settings || typeof d.settings !== 'object' || !validDate(d.settings.start)) errs.push('Falta la fecha de inicio o no es válida.');
    if (!Array.isArray(d.logs)) errs.push('Falta la lista de registros.');
    if (d.days && typeof d.days !== 'object') errs.push('Formato de días incorrecto.');
    if (Array.isArray(d.logs)) {
      const bad = [];
      const oldStart = S.settings.start; if (d.settings && validDate(d.settings.start)) S.settings.start = d.settings.start;
      d.logs.forEach((l, i) => { if (!l || typeof l !== 'object') { bad.push(`#${i + 1}: vacío`); return; } const r = validateLog(l.type, l.date, l.status, l.data, { allowBefore: true, lenient: true }); if (!r.ok) bad.push(`#${i + 1} (${l.date || '?'}): ${r.errors[0]}`); else l.data = r.data; if (!l.id) l.id = uid(); });
      S.settings.start = oldStart;
      if (bad.length) errs.push(`${bad.length} registro(s) no válidos, p. ej. ${bad.slice(0, 3).join('; ')}.`);
    }
  }
  if (errs.length) return errorBox('No se importó la copia', errs.join(' ') + ' Tus datos actuales siguen intactos.');
  try { localStorage.setItem('plan20.prev', localStorage.getItem(KEY) || ''); } catch (e) {}
  const keep = { pinHash: S.settings.pinHash, salt: S.settings.salt };
  const ok = commit(() => {
    const ai = S.ai;
    S = Object.assign(structuredClone(DEFAULT), d);
    S.settings = Object.assign(structuredClone(DEFAULT.settings), d.settings, keep);
    ['days', 'weekPlans', 'reviews'].forEach(k => { if (!S[k] || typeof S[k] !== 'object' || Array.isArray(S[k])) S[k] = {}; });
    if (!Array.isArray(S.studyDue)) S.studyDue = [];
    S.ai = Object.assign({}, ai, d.ai || {}, { spent: Math.max(ai ? ai.spent : 0, (d.ai && d.ai.spent) || 0) });
  });
  if (ok) { route(); toast(`Copia importada: ${S.logs.length} registros`); }
}
async function exportData() {
  const json = JSON.stringify(Object.assign({}, S, { settings: Object.assign({}, S.settings, { pinHash: '', salt: '' }) }), null, 1);
  const name = `plan20-copia-${today()}.json`;
  const FS = P('Filesystem'), SH = P('Share');
  if (FS && SH) {
    try { const r = await FS.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' }); await SH.share({ title: 'Copia Plan 20', files: [r.uri], dialogTitle: 'Guardar copia' }); return; } catch (e) { if (String(e).includes('cancel')) return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = name; a.click();
}

/* ---------- RECORDATORIOS ---------- */
async function scheduleReminders(ask) {
  const LN = P('LocalNotifications'); if (!LN) return;
  try {
    await LN.cancel({ notifications: [{ id: 1 }, { id: 2 }, { id: 3 }] }); // solo los recordatorios fijos; los avisos del asistente se conservan
    const r = S.settings.remind; if (!r.on) return;
    let perm = await LN.checkPermissions(); if (perm.display !== 'granted' && ask) perm = await LN.requestPermissions();
    if (perm.display !== 'granted') return;
    const hm = (t) => { const [h, m] = t.split(':').map(Number); return { hour: h, minute: m }; };
    await LN.schedule({ notifications: [
      { id: 1, title: 'Plan 20', body: 'Apertura del día · 1-2 minutos', schedule: Object.assign({ on: hm(r.open), allowWhileIdle: true }) },
      { id: 2, title: 'Plan 20', body: 'Cierre del día · marca el estado real', schedule: { on: hm(r.close), allowWhileIdle: true } },
      { id: 3, title: 'Plan 20', body: 'Revisión semanal · 10 minutos', schedule: { on: Object.assign({ weekday: 1 }, hm(r.review)), allowWhileIdle: true } }
    ] });
  } catch (e) { console.warn(e); }
}

/* ---------- INICIO PERSONAL (secciones 3 y 4) ---------- */
function onboarding(edit, override) {
  const v = override || (S.profile ? structuredClone(S.profile) : { accion1: 'Movimiento: caminata', accion2: `${L().meta}: respuesta al impulso cuando aparezca`, ocasion2: 'Cuando aparezca un impulso', alternativas: [] });
  const schema = [
    { t: 'note', html: 'Responde con una opción o una frase breve. “No sé” y “prefiero no responder” son válidas. Completarlo toma unos minutos; hoy mismo realizas la primera acción posible.' },
    { t: 'h', l: '1. ¿Cómo reconocerás progreso?', hint: 'Metas confirmadas: verte más delgado, desarrollar algo de músculo y dejar la masturbación.' },
    { k: 'progreso', l: '“Me veré y me sentiré mejor cuando…”', t: 'area' },
    { k: 'porque', l: `“${L().meta} me importa porque…” (privado, opcional)`, t: 'area' },
    { t: 'h', l: '2. ¿Qué haces físicamente ahora?' },
    { k: 'actDias', l: 'Días de actividad en las últimas dos semanas', t: 'num', u: 'días', max: 14, hint: 'Déjalo vacío si no recuerdas.' },
    { k: 'actMin', l: 'Minutos aproximados por vez', t: 'num', u: 'min', step: 5 },
    { k: 'actTipo', l: 'Actividades', t: 'text' },
    { k: 'fuerzaExp', l: 'Experiencia con fuerza', t: 'seg', o: [['ninguna', 'Ninguna'], ['algo', 'Algo'], ['conozco', 'Conozco los ejercicios'], ['regular', 'Entreno con regularidad']] },
    { k: 'ruta', l: 'Punto de partida', t: 'seg', o: [['inicial', 'Ruta inicial cómoda'], ['tolerado', 'Conservar mi nivel ya tolerado']], hint: 'Si estás retomando o no tienes datos, usa la ruta inicial. Si ya haces más sin síntomas, no reinicies artificialmente desde cero.' },
    { t: 'h', l: '3. ¿Síntomas, lesiones o indicaciones profesionales?' },
    { k: 'sint', l: 'Respuesta', t: 'seg', o: [['no', 'No'], ['si', 'Sí'], ['nose', 'No sé']] },
    { k: 'limit', l: 'Describe la limitación (sin datos íntimos)', t: 'text', s: v => v.sint && v.sint !== 'no' },
    { t: 'note', cls: 'w', s: v => v.sint === 'si', html: 'Adapta esa actividad y conserva las demás acciones que sean seguras. Ante síntomas de alarma, consulta “Cuidado”.' },
    { t: 'h', l: '4. Recursos', hint: 'Tienes 90-120 min libres al día fuera del estudio y buscas gasto mínimo. Anota solo excepciones.' },
    { k: 'excep', l: 'Excepciones de esta semana', t: 'text' },
    { k: 'lugar', l: 'Espacio seguro para moverte', t: 'text', ph: 'Ej.: parque cercano / sala de casa' },
    { k: 'carga', l: '¿Tienes una carga ligera segura para el remo (botella cerrada o mancuerna)?', t: 'seg', o: [['si', 'Sí'], ['no', 'Aún no']] },
    { t: 'h', l: `5. ${L().metaLong}: situaciones y respuesta`, hint: 'No se presume consumo de pornografía ni se atribuye un trastorno por elegir abstinencia.' },
    { k: 'situaciones', l: 'Situaciones en que necesitas apoyo', t: 'multi', o: ['Despierto en la cama', 'Aburrimiento', 'Estrés', 'Soledad', 'Cansancio', 'Con el teléfono', 'No sé aún'] },
    { k: 'porno', l: 'Pornografía', t: 'seg', o: [['objetivo', 'Existe y quiero trabajarla por separado'], ['na', 'No aplica'], ['priv', 'Prefiero no responder']] },
    { k: 'alternativas', l: 'Alternativas que usarás ante un impulso', t: 'multi', o: ['Salir de la cama', 'Dejar el teléfono en otro lugar', 'Ordenar el escritorio', 'Tarea doméstica corta', 'Lectura', 'Descanso fuera de la cama', 'Caminar suave', 'Contactar a alguien'] },
    { t: 'h', l: 'Comida elegida', hint: 'Un ajuste dentro de una comida que ya existe.' },
    { k: 'comidaSit', l: '¿Qué ocurre habitualmente?', t: 'seg', o: C.FOOD_SITUATIONS.map(f => [f[0], f[1]]) },
    { t: 'note', html: v => { const f = C.FOOD_SITUATIONS.find(x => x[0] === v.comidaSit); return f ? '<b>Acción:</b> ' + f[2] : ''; } },
    { k: 'comidaCual', l: '¿En qué comida?', t: 'seg', o: ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'] },
    { k: 'comidaAjuste', l: 'Tu ajuste en tus palabras', t: 'text', ph: 'Ej.: agua en lugar de gaseosa en el almuerzo' },
    { t: 'h', l: 'Resultado del inicio', hint: 'Tus dos acciones principales, una ocasión para cada una y un resultado que deseas.' },
    { k: 'accion1', l: 'Acción principal 1', t: 'text' },
    { k: 'ocasion1', l: 'Ocasión: después de…', t: 'text', ph: 'Ej.: la última clase, en el parque' },
    { k: 'accion2', l: 'Acción principal 2', t: 'text' },
    { k: 'ocasion2', l: 'Ocasión', t: 'text' },
    { k: 'deseo', l: 'Resultado que deseas', t: 'text' }
  ];
  sheet({ title: edit ? 'Mi inicio personal' : 'Inicio personal', sub: 'Sección 3 del manual', values: v, schema, saveLabel: edit ? 'Guardar' : 'Empezar hoy',
    draft: { kind: 'profile', arg: edit },
    onSave: (v) => { if (!v.ruta) return { errors: ['Elige tu punto de partida'] }; if (!commit(() => { S.profile = v; if (!edit) S.weekPlans = {}; })) return false; if (!edit) { tab = 'hoy'; scheduleReminders(true); } toast('Guardado'); } });
}
DRAFT_OPENERS.profile = (edit, v) => onboarding(edit, v);
function _endOnb() {
}
function welcome() {
  const el = document.createElement('div'); el.className = 'lock'; el.style.overflowY = 'auto'; el.style.justifyContent = 'flex-start'; el.style.padding = '40px 24px';
  el.innerHTML = `<div style="max-width:760px" class="stack"><img src="icon.png" width="64" style="border-radius:16px"><h1>Veinte semanas para actuar, responder y ajustar</h1>
  <p class="muted">La primera fase comienza hoy. Las primeras respuestas se recogen mientras realizas las acciones. No hay una semana previa de observación.</p>
  <div class="card alert"><h3>Antes de empezar: señales de cuidado</h3><p>${C.CARE.urgent}</p></div>
  <div class="card"><p class="small">${C.CARE.disclaimer} Los horarios, minutos iniciales y reglas de ajuste son decisiones prácticas, no pruebas diagnósticas. Todo se guarda solo en esta tablet.</p></div>
  <button class="btn pri big block" id="ack">He leído las señales de cuidado · continuar</button></div>`;
  document.body.appendChild(el);
  $('#ack', el).onclick = () => { if (!commit(() => { S.careAck = true; })) return; el.remove(); lockScreen('create', () => { unlocked = true; shell(); route(); onboarding(false); }); };
}

/* ---------- Tema, arranque, ciclo de vida ---------- */
function applyTheme() {
  const t = S.settings.theme, dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); if (unlocked) route(); });
/* Cambio de día con la app abierta: actualizar Hoy sin perder lo que se está escribiendo */
let shownDay = today();
function checkDay() {
  if (!unlocked || today() === shownDay) return;
  const a = document.activeElement, typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && $('#main') && $('#main').contains(a);
  if (typing) return; // se reintenta en el siguiente ciclo
  shownDay = today(); freezeWeek();
  if (!sheetOpen) route();
  else toast('Cambió el día. El formulario abierto conserva su fecha; revísala antes de guardar.');
}
setInterval(checkDay, 30000);
function afterUnlock(first) {
  if (first) { shell(); route(); }
  freezeWeek(); checkDay();
  if (first && !S.profile) { onboarding(false); return; }
  if (first) scheduleReminders(false);
  resumeTimer();
  if (!sheetOpen) offerDraft();
}
function boot() {
  applyTheme();
  if (!S.careAck || !S.settings.pinHash) return welcome();
  lockScreen('unlock', () => afterUnlock(true));
}
const App = P('App');
if (App) {
  App.addListener('appStateChange', ({ isActive }) => {
    // Al salir NO se cierran formularios ni temporizadores: solo se bloquea encima. El borrador ya está guardado.
    if (!isActive && S.settings.pinHash && unlocked && !document.querySelector('.lock')) { unlocked = false; if (sheetOpen) saveDraft(sheetOpen); lockScreen('unlock', () => afterUnlock(false)); }
    if (isActive && unlocked) checkDay();
  });
  App.addListener('backButton', () => {
    if (document.querySelector('.lock')) return App.minimizeApp();
    if (document.querySelector('.proto')) return App.minimizeApp(); // el protocolo/bloque sigue; se sale con “Salir”
    if (sheetOpen) {
      if (!sheetOpen.dirty) return closeSheet();
      const el = document.createElement('div'); el.className = 'errbox info';
      el.innerHTML = '<b>¿Descartar lo que escribiste?</b><div>No se ha guardado.</div><div class="row" style="margin-top:10px"><button class="btn" data-k>Seguir editando</button><button class="btn danger" data-d>Descartar</button></div>';
      el.onclick = (e) => { if (e.target.closest('[data-d]')) { el.remove(); closeSheet(); } else if (e.target.closest('[data-k]')) el.remove(); };
      document.querySelectorAll('.errbox').forEach(x => x.remove()); document.body.appendChild(el); return;
    }
    if (tab !== 'hoy' && unlocked) { tab = 'hoy'; route(); return; }
    App.minimizeApp();
  });
}
window.openCare = openCare; window.openLog = openLog; window.closeSheet = closeSheet;
boot();
