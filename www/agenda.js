/* Plan 20 · v2.6 — AGENDA: calendario por horas que crea el asistente (y tú), con recordatorios.
   Sustituye al panel "Tu día" (que solo guardaba UN texto por área y solo del día de hoy).
   Arregla por qué "no guardaba" lo que contabas para mañana:
   - la fecha en palabras ("mañana", "el jueves") o a más de 1 día se guardaba en HOY;
   - dos planes para la misma área se pisaban;
   - lo que no era una de las 8 áreas (una cita, una tarea) se descartaba;
   - el panel y la IA solo veían hoy, así que lo guardado para mañana no se veía.
   Ahora cada cosa es un elemento propio (fecha + hora exacta o momento del día), se ve en varios días,
   la IA recibe los próximos 7 días con sus ids y cada elemento con hora puede recordarse con una notificación. */
'use strict';

DEFAULT.agenda = { items: [], moments: { manana: '09:00', desayuno: '07:30', almuerzo: '13:00', merienda: '16:30', tarde: '15:00', cena: '19:30', noche: '21:00' }, remind: true, before: 10, nids: [] };
function agInit() {
  S.agenda = Object.assign(structuredClone(DEFAULT.agenda), S.agenda || {});
  S.agenda.moments = Object.assign(structuredClone(DEFAULT.agenda.moments), S.agenda.moments || {});
  if (!Array.isArray(S.agenda.items)) S.agenda.items = [];
  if (!Array.isArray(S.agenda.nids)) S.agenda.nids = [];
}
agInit();
const AG = () => { if (!S.agenda || !S.agenda.moments || !Array.isArray(S.agenda.items)) agInit(); return S.agenda; };
const AG_MOMENTS = [['manana', 'Mañana'], ['desayuno', 'Desayuno'], ['almuerzo', 'Almuerzo'], ['merienda', 'Merienda'], ['tarde', 'Tarde'], ['cena', 'Cena'], ['noche', 'Noche']];
const agMomentName = (m) => (AG_MOMENTS.find(x => x[0] === m) || [m, m])[1];
const AG_KINDS = ['comida', 'movimiento', 'estudio', 'tarea', 'cita', 'descanso', 'metap', 'sueno', 'otro'];
const agKindName = (k) => ({ comida: 'Comida', movimiento: 'Movimiento', estudio: 'Estudio', tarea: 'Tarea', cita: 'Cita', descanso: 'Descanso', metap: L().meta, sueno: 'Sueño', otro: 'Otro' }[k] || 'Otro');
const agKindIcon = (k) => ({ comida: 'bowl', movimiento: 'walk', estudio: 'book', tarea: 'check', cita: 'people', descanso: 'moon', metap: 'wave', sueno: 'moon', otro: 'plus' }[k] || 'plus');
IC.cal = '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>';
IC.bell = '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>';
IC.bellOff = '<path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l2 2H8"/><path d="M10 20a2 2 0 0 0 4 0M3 3l18 18"/>';
IC.image = '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>';

/* ---------- Normalización (lo que diga la IA o la persona) ---------- */
const agNorm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const AG_DOWS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
/* Devuelve YYYY-MM-DD o null (NUNCA cae en "hoy" por error) */
function agDate(s) {
  if (s == null || s === '') return null;
  const k0 = today();
  if (validDate(String(s).trim())) return String(s).trim();
  const t = agNorm(s).replace(/^(para |el dia |el |este |esta |para el )/, '');
  if (t === 'hoy' || t === 'esta noche' || t === 'noche') return k0;
  if (t === 'manana' || t === 'manana por la manana') return addDays(k0, 1);
  if (t === 'pasado manana' || t === 'pasado') return addDays(k0, 2);
  if (t === 'ayer') return addDays(k0, -1);
  const en = /^(?:en |dentro de )(\d{1,2}) dias?$/.exec(t); if (en) return addDays(k0, +en[1]);
  const dw = /^(?:proximo |siguiente )?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)(?: que viene| proximo)?$/.exec(t);
  if (dw) { const g = AG_DOWS.indexOf(dw[1]); let d = addDays(k0, 1); while (fromKey(d).getDay() !== g) d = addDays(d, 1); return d; }
  const dm = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(t);
  if (dm) { let y = dm[3] ? +dm[3] : fromKey(k0).getFullYear(); if (y < 100) y += 2000; let k = `${y}-${pad2(+dm[2])}-${pad2(+dm[1])}`; if (!dm[3] && validDate(k) && k < addDays(k0, -1)) k = `${y + 1}-${pad2(+dm[2])}-${pad2(+dm[1])}`; return validDate(k) ? k : null; }
  return null;
}
function agTime(s) {
  if (s == null || s === '') return null;
  const t = agNorm(s).replace(/\s+/g, '').replace(/\./g, '').replace(/hrs?$|horas?$/, '');
  const m = /^(\d{1,2})(?:[:h](\d{2}))?(am|pm)?$/.exec(t); if (!m) return null;
  let h = +m[1]; const mi = m[2] ? +m[2] : 0;
  if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0;
  return h > 23 || mi > 59 ? null : `${pad2(h)}:${pad2(mi)}`;
}
function agMoment(s) {
  const t = agNorm(s).replace(/^(en el |en la |a la |al |por la |el |la )/, '');
  return { manana: 'manana', desayuno: 'desayuno', almuerzo: 'almuerzo', comida: 'almuerzo', 'medio dia': 'almuerzo', mediodia: 'almuerzo', merienda: 'merienda', 'media tarde': 'merienda', tarde: 'tarde', cena: 'cena', noche: 'noche', 'antes de dormir': 'noche' }[t] || null;
}
const agKind = (s) => { const t = agNorm(s); return AG_KINDS.includes(t) ? t : /comi|desay|almu|cena|merien/.test(t) ? 'comida' : /camin|fuerza|ejerc|gym|correr|movim/.test(t) ? 'movimiento' : /estud|clase|repaso|tarea de/.test(t) ? 'estudio' : /cita|medic|doctor|reuni/.test(t) ? 'cita' : /dorm|sueno/.test(t) ? 'sueno' : /meta|impulso/.test(t) ? 'metap' : t ? 'otro' : null; };
const agHM = (h) => { const m = /^(\d{2}):(\d{2})$/.exec(h || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const agMin = (it) => it.time ? agHM(it.time) : it.moment ? agHM(AG().moments[it.moment]) : null;
const agAt = (it) => { const m = agMin(it); return m == null ? null : fromKey(it.date).getTime() + m * 60000; };
const agWhen = (it) => it.time ? it.time : it.moment ? `${agMomentName(it.moment)} (~${AG().moments[it.moment]})` : 'sin hora';

/* ---------- Operaciones ---------- */
function agItems(k) { return AG().items.filter(x => x.date === k).sort((a, b) => (agMin(a) ?? 9999) - (agMin(b) ?? 9999) || (a.ts - b.ts)); }
/* Crea (o actualiza si ya existe lo mismo ese día). Devuelve { item } o { error }. Solo muta memoria: úsala dentro de commit(). */
function agPut(o, src) {
  o = o || {};
  const title = String(o.titulo || o.title || '').trim().slice(0, 120);
  if (!title) return { error: 'falta el título' };
  const rawDate = o.fecha != null ? o.fecha : o.date;
  const date = agDate(rawDate);
  if (!date) return { error: `fecha no válida (“${rawDate == null ? '' : rawDate}”): usa YYYY-MM-DD` };
  if (date < addDays(today(), -7) || date > addDays(today(), 120)) return { error: `fecha fuera de rango (${date})` };
  const time = agTime(o.hora != null ? o.hora : o.time);
  const moment = time ? null : agMoment(o.momento != null ? o.momento : o.moment);
  const kind = agKind(o.tipo || o.kind) || agKind(title) || 'otro';
  const it = { date, time, moment, title, kind, note: String(o.nota || o.note || '').trim().slice(0, 300), src: src || 'yo', status: 'pendiente', prop: !!(o.propuesta || o.prop), remind: o.recordar === false || o.remind === false ? false : true, before: o.minutos_antes != null ? bjClamp(Math.round(+o.minutos_antes) || 0, 0, 240) : null, ts: Date.now() };
  const same = AG().items.find(x => x.date === date && agNorm(x.title) === agNorm(title) && (x.time || x.moment) === (time || moment));
  if (same) { Object.assign(same, { note: it.note || same.note, kind: it.kind, prop: it.prop && same.prop, remind: it.remind, before: it.before ?? same.before, edited: Date.now() }); return { item: same, updated: true }; }
  it.id = 'g' + uid().slice(-7);
  AG().items.push(it);
  return { item: it };
}
function agEdit(id, o) {
  const it = AG().items.find(x => x.id === id); if (!it) return { error: `no existe ${id}` };
  if (o.fecha != null || o.date != null) { const d = agDate(o.fecha != null ? o.fecha : o.date); if (!d) return { error: 'fecha no válida' }; it.date = d; }
  if (o.hora != null || o.time != null) { const h = o.hora != null ? o.hora : o.time; if (h === '' || h === null) it.time = null; else { const t = agTime(h); if (!t) return { error: 'hora no válida' }; it.time = t; it.moment = null; } }
  if (o.momento != null || o.moment != null) { const m = agMoment(o.momento != null ? o.momento : o.moment); if (m) { it.moment = m; it.time = null; } }
  if (o.titulo || o.title) it.title = String(o.titulo || o.title).trim().slice(0, 120);
  if (o.tipo || o.kind) it.kind = agKind(o.tipo || o.kind) || it.kind;
  if (o.nota != null || o.note != null) it.note = String(o.nota != null ? o.nota : o.note).slice(0, 300);
  if (o.recordar != null) it.remind = !!o.recordar;
  if (o.minutos_antes != null) it.before = bjClamp(Math.round(+o.minutos_antes) || 0, 0, 240);
  if (o.estado) it.status = ['pendiente', 'hecho', 'omitido'].includes(o.estado) ? o.estado : it.status;
  if (o.propuesta === false) it.prop = false;
  it.edited = Date.now();
  return { item: it };
}
/* Propuestas del saludo diario: sustituye las propuestas anteriores de ese día (no toca lo tuyo) */
function agSetProposals(k, list) {
  AG().items = AG().items.filter(x => !(x.date === k && x.prop && x.src === 'ia' && x.status === 'pendiente'));
  (list || []).forEach(o => agPut(Object.assign({}, o, { fecha: k, propuesta: true }), 'ia'));
}
/* Qué aparece además de lo guardado: plan de movimiento, repasos y modo dormir (se aceptan con un toque) */
function agVirtual(k) {
  const out = [], mine = agItems(k);
  const wN = cal().weekOf(k), pd = wN >= 1 ? (weekPlan(wN).days[k] || {}) : {};
  const hasMov = mine.some(x => x.kind === 'movimiento') || logsOn(k).some(l => l.type === 'aero' || l.type === 'fuerza');
  if (!hasMov && (pd.walk || pd.str)) out.push({ vid: 'mov', date: k, moment: 'tarde', title: [pd.walk ? `Caminata ${pd.walk} min` : '', pd.str ? 'fuerza (5 movimientos)' : ''].filter(Boolean).join(' + '), kind: 'movimiento', note: S.profile && S.profile.ocasion1 ? 'después de ' + S.profile.ocasion1 : 'según tu plan de la semana' });
  S.studyDue.filter(x => !x.done && x.date === k && !mine.some(m => agNorm(m.title).includes(agNorm(x.tema)))).slice(0, 2).forEach(x => out.push({ vid: 'rep' + x.id, date: k, moment: 'tarde', title: `Repaso: ${x.tema}`, kind: 'estudio', note: x.tarea || 'resolver sin mirar' }));
  if (typeof sleepVirtual === 'function') { const s = sleepVirtual(k); if (s) out.push(s); }
  return out;
}

/* ---------- Recordatorios (notificaciones locales, próximos 7 días) ---------- */
let agSchedT = null;
function agSchedule() { clearTimeout(agSchedT); agSchedT = setTimeout(agScheduleNow, 400); }
async function agScheduleNow() {
  const LN = P('LocalNotifications'); if (!LN) return;
  const A = AG(), now = Date.now(), until = now + 7 * 864e5;
  const list = A.remind === false ? [] : A.items.filter(it => it.status === 'pendiente' && !it.prop && it.remind !== false)
    .map(it => ({ it, at: agAt(it) == null ? null : agAt(it) - (it.before != null ? it.before : A.before) * 60000 }))
    .filter(x => x.at && x.at > now + 20000 && x.at < until).sort((a, b) => a.at - b.at).slice(0, 60);
  try {
    if (A.nids.length) await LN.cancel({ notifications: A.nids.map(id => ({ id })) });
    if (list.length) {
      let perm = await LN.checkPermissions(); if (perm.display !== 'granted') perm = await LN.requestPermissions();
      if (perm.display === 'granted') await LN.schedule({ notifications: list.map((x, i) => ({ id: 2000 + i, title: 'Plan 20', body: `${x.it.time || AG().moments[x.it.moment] || ''} · ${x.it.kind === 'metap' ? 'tu plan de esta noche' : x.it.title}`, schedule: { at: new Date(x.at), allowWhileIdle: true } })) });
    }
    A.nids = list.map((_, i) => 2000 + i); _bjSave();
  } catch (e) { console.warn(e); }
}
function agCommit(fn) { const ok = commit(fn); if (ok) agSchedule(); return ok; }

/* ---------- La IA: herramienta "agenda", respuestas rápidas y contexto ---------- */
const AG_ITEM_SCHEMA = { type: 'object', properties: {
  id: { type: 'string', description: 'Solo para cambiar/borrar/hecho: id entre corchetes del bloque AGENDA' },
  fecha: { type: 'string', description: 'YYYY-MM-DD (usa el CALENDARIO). También acepta "hoy", "mañana", "pasado mañana" o un día de la semana' },
  hora: { type: 'string', description: 'HH:MM (24 h) si hay hora concreta' },
  momento: { type: 'string', enum: AG_MOMENTS.map(m => m[0]), description: 'Si no hay hora exacta: momento del día' },
  titulo: { type: 'string', description: 'Qué va a hacer o comer, concreto y breve' },
  tipo: { type: 'string', enum: AG_KINDS },
  nota: { type: 'string' },
  recordar: { type: 'boolean', description: 'Notificación antes (por defecto sí)' },
  minutos_antes: { type: 'number' },
  estado: { type: 'string', enum: ['pendiente', 'hecho', 'omitido'] },
  propuesta: { type: 'boolean', description: 'true = sugerencia tuya que la persona aún no aceptó' } } };
TOOLS2.push({ name: 'agenda', description: 'Calendario de la persona (hoy y los próximos días), con recordatorios. ÚSALO SIEMPRE que diga lo que piensa hacer, comer, estudiar, una cita o cualquier compromiso, para hoy, mañana u otro día (un elemento por cosa, con fecha y hora o momento). "crear" añade; "cambiar" modifica por id; "borrar" elimina por id; "hecho" marca como hecho por id. Para proponer tú un plan usa propuesta=true.', input_schema: { type: 'object', properties: { accion: { type: 'string', enum: ['crear', 'cambiar', 'borrar', 'hecho'] }, items: { type: 'array', items: AG_ITEM_SCHEMA }, ids: { type: 'array', items: { type: 'string' } } }, required: ['accion'] } });
TOOLS2.push({ name: 'respuestas', description: 'Ofrece 2-4 respuestas rápidas (botones) para que la persona conteste con un toque. Úsalo al final de casi todas tus respuestas.', input_schema: { type: 'object', properties: { opciones: { type: 'array', items: { type: 'string' }, description: 'Frases cortas en primera persona (máx. 40 caracteres), p. ej. "Sí, agéndalo", "Otra idea", "Mañana a las 7"' } }, required: ['opciones'] } });
{ const i = TOOLS2.findIndex(t => t.name === 'plan_del_dia'); if (i >= 0) TOOLS2.splice(i, 1); } // sustituida por "agenda" (se sigue aceptando por compatibilidad)
const AREA2KIND = { desayuno: ['desayuno', 'comida'], almuerzo: ['almuerzo', 'comida'], merienda: ['merienda', 'comida'], cena: ['cena', 'comida'], movimiento: ['tarde', 'movimiento'], estudio: ['tarde', 'estudio'], metap: ['noche', 'metap'], sueno: ['noche', 'sueno'] };
const _agRunTool = runTool;
runTool = function (name, x, ctx) {
  x = x || {};
  if (name === 'respuestas') { const o = (x.opciones || []).filter(s => typeof s === 'string' && s.trim()).map(s => s.trim().slice(0, 48)).slice(0, 4); return { result: 'Mostradas.', card: o.length ? { type: 'quick', items: o } : null }; }
  if (name === 'plan_del_dia') { // compatibilidad: cada área pasa a ser un elemento de la agenda en la fecha correcta
    const date = x.fecha ? agDate(x.fecha) : today(); if (!date) return { result: `ERROR: fecha no válida (“${x.fecha}”). Usa YYYY-MM-DD.` };
    const items = (x.items || []).filter(i => i && AREA2KIND[i.area]);
    if (!items.length) return { result: 'Sin cambios: usa la herramienta agenda.' };
    return runTool('agenda', { accion: 'crear', items: items.flatMap(i => [i.intencion ? { fecha: date, momento: AREA2KIND[i.area][0], titulo: i.intencion, tipo: AREA2KIND[i.area][1] } : null, i.propuesta ? { fecha: date, momento: AREA2KIND[i.area][0], titulo: i.propuesta, tipo: AREA2KIND[i.area][1], propuesta: true } : null].filter(Boolean)) });
  }
  if (name !== 'agenda') return _agRunTool(name, x, ctx);
  const acc = x.accion || 'crear', done = [], bad = [];
  const ok = agCommit(() => {
    if (acc === 'crear') (x.items || []).slice(0, 20).forEach(o => { const r = agPut(o, 'ia'); if (r.error) bad.push(`${(o && o.titulo) || '?'}: ${r.error}`); else done.push(r.item); });
    else if (acc === 'cambiar') (x.items || []).forEach(o => { const r = agEdit(o && o.id, o || {}); if (r.error) bad.push(r.error); else done.push(r.item); });
    else if (acc === 'hecho') (x.ids || (x.items || []).map(o => o.id)).forEach(id => { const r = agEdit(id, { estado: 'hecho' }); if (r.error) bad.push(r.error); else done.push(r.item); });
    else if (acc === 'borrar') { const ids = new Set(x.ids || (x.items || []).map(o => o.id)); const before = AG().items.length; AG().items = AG().items.filter(it => !ids.has(it.id)); if (AG().items.length === before) bad.push('ningún id coincide'); }
  });
  if (!ok) return { result: 'ERROR: no se pudo guardar en la tablet.' };
  const line = (it) => `[${it.id}] ${it.date} ${agWhen(it)} · ${it.title}${it.prop ? ' (propuesta)' : ''}`;
  const result = acc === 'borrar' ? (bad.length ? 'ERROR: ' + bad.join('; ') : 'Borrado.') : `${done.length ? (acc === 'crear' ? 'Guardado en la agenda:\n' : 'Actualizado:\n') + done.map(line).join('\n') : 'Nada guardado.'}${bad.length ? '\nNO guardado: ' + bad.join('; ') + ' — corrígelo y vuelve a llamar a agenda.' : ''}`;
  return { result, card: done.length ? { type: 'agenda', ids: done.map(i => i.id), acc } : bad.length ? { type: 'chip', text: 'No pude guardar: ' + bad[0] } : null };
};
/* Contexto para la IA: la agenda de HOY y los 7 días siguientes (antes solo veía hoy) + lo real de hoy */
dayPlanBlock = function (k = today()) {
  const days = Array.from({ length: 8 }, (_, i) => addDays(k, i));
  const lines = days.map(d => { const its = agItems(d); return `${cap1(DOW[fromKey(d).getDay()])} ${d}${d === k ? ' (HOY)' : d === addDays(k, 1) ? ' (mañana)' : ''}: ${its.length ? its.map(it => `[${it.id}] ${agWhen(it)} ${it.title}${it.prop ? ' (propuesta)' : ''}${it.status !== 'pendiente' ? ' — ' + it.status : ''}`).join(' | ') : '(vacío)'}`; });
  const real = AREA_KEYS.map(a => { const r = realOf(a, k); return r ? `${areaName(a)}: ${r}` : ''; }).filter(Boolean);
  return `AGENDA (hoy y próximos 7 días; id entre corchetes). Momentos: ${AG_MOMENTS.map(m => `${m[1].toLowerCase()} ${AG().moments[m[0]]}`).join(', ')}.\n${lines.join('\n')}\nLO REAL DE HOY: ${real.join(' · ') || 'nada registrado aún'}`;
};
/* Tarjeta en la conversación: qué quedó agendado, con Deshacer */
const _agCard = cardHTML;
cardHTML = function (c, mi, ci) {
  if (!c || c.type !== 'agenda') return _agCard(c, mi, ci);
  const its = (c.ids || []).map(id => AG().items.find(x => x.id === id)).filter(Boolean);
  if (c.undone || !its.length) return `<div class="acard chip muted">${c.undone ? 'Agenda: deshecho' : 'Agenda: (ya no existe)'}</div>`;
  return `<div class="acard"><div class="kicker">${ic('cal', 14)} ${c.acc === 'crear' ? 'Agendé' : 'Actualicé'}</div>${its.map(it => `<div class="small">• <b>${esc(it.date === today() ? 'Hoy' : it.date === addDays(today(), 1) ? 'Mañana' : cap1(fmt(it.date, true)))}</b> · ${esc(agWhen(it))} — ${esc(it.title)}${it.prop ? ' <span class="muted">(propuesta)</span>' : ''}${it.remind !== false && agAt(it) ? ` ${ic('bell', 13)}` : ''}</div>`).join('')}
    <div class="row" style="margin-top:6px"><button class="mini" data-a="agday" data-x="${its[0].date}">Ver en la agenda</button>${c.acc === 'crear' ? `<button class="mini" data-a="agundo" data-x="${mi}.${ci}">Deshacer</button>` : ''}</div></div>`;
};

/* ---------- Interfaz: panel Agenda (sustituye a "Tu día") ---------- */
let agSel = null;
const agDayLabel = (d) => d === today() ? 'Hoy' : d === addDays(today(), 1) ? 'Mañana' : d === addDays(today(), -1) ? 'Ayer' : `${DOW_S[fromKey(d).getDay()]} ${fromKey(d).getDate()}`;
function agRow(it, virt) {
  const m = it.time ? `<b>${it.time}</b>` : it.moment ? `<b>${esc(agMomentName(it.moment))}</b><small>~${AG().moments[it.moment]}</small>` : '<small>sin hora</small>';
  const acts = virt ? (it.vid === 'sleep' ? `<button class="mini" data-a="open" data-x="escudo">Ajustar</button>` : `<button class="mini" data-a="agvirt" data-x="${esc(it.vid)}|${it.date}">Agendar</button>`)
    : it.prop ? `<button class="mini" data-a="agacc" data-x="${it.id}">Acepto</button><button class="mini ghost" data-a="agno" data-x="${it.id}" aria-label="Descartar">✕</button>`
    : `<button class="agic ${it.remind !== false && agAt(it) ? 'on' : ''}" data-a="agbell" data-x="${it.id}" aria-label="Recordatorio">${ic(it.remind !== false && agAt(it) ? 'bell' : 'bellOff', 18)}</button><button class="agck ${it.status === 'hecho' ? 'on' : ''}" data-a="agdone" data-x="${it.id}" aria-label="Hecho">${it.status === 'hecho' ? '✓' : ''}</button>`;
  return `<div class="agi ${it.status || ''} ${it.prop ? 'prop' : ''} ${virt ? 'virt' : ''}"><div class="agt">${m}</div><div class="agb" ${virt ? '' : `data-a="agedit" data-x="${it.id}"`}><div class="agtitle">${ic(agKindIcon(it.kind), 16)} ${esc(it.title)}</div>${it.note ? `<div class="small muted">${esc(it.note)}</div>` : ''}${it.prop ? '<div class="small muted">Propuesta del asistente</div>' : virt ? '<div class="small muted">Según tu plan</div>' : ''}</div><div class="aga">${acts}</div></div>`;
}
function agendaPanel() {
  const k0 = today(), sel = agSel && agSel >= addDays(k0, -7) && agSel <= addDays(k0, 60) ? agSel : k0;
  const strip = Array.from({ length: 8 }, (_, i) => addDays(k0, i - 1)).map(d => { const n = agItems(d).filter(x => !x.prop).length; return `<button data-a="agday" data-x="${d}" class="${d === sel ? 'on' : ''}">${agDayLabel(d)}${n ? `<i>${n}</i>` : ''}</button>`; }).join('');
  const all = agItems(sel).map(it => ({ it, v: false })).concat(agVirtual(sel).map(it => ({ it, v: true }))).sort((a, b) => (agMin(a.it) ?? 9999) - (agMin(b.it) ?? 9999));
  const nowM = new Date().getHours() * 60 + new Date().getMinutes(); let nowDone = sel !== k0;
  const rows = all.map(({ it, v }) => { let pre = ''; if (!nowDone && (agMin(it) ?? 9999) > nowM) { nowDone = true; pre = `<div class="agnow"><span>${hhmm()}</span></div>`; } return pre + agRow(it, v); }).join('') + (!nowDone ? `<div class="agnow"><span>${hhmm()}</span></div>` : '');
  const logs = logsOn(sel);
  return `<div class="row between"><h3>${ic('cal', 20)} Agenda</h3><button class="mini" data-a="agadd" data-x="${sel}">+ Añadir</button></div>
    <div class="agstrip">${strip}</div>
    <div class="agday">${sel === k0 ? '' : `<div class="kicker">${esc(cap1(fmt(sel, true)))}</div>`}${rows || `<div class="empty">${sel === k0 ? 'Nada agendado hoy.' : 'Nada agendado este día.'} Díselo al asistente (“mañana a las 7 camino 20 min”) o pulsa + Añadir.</div>`}</div>
    ${logs.length ? `<div class="agreal"><div class="kicker">Lo que registraste</div>${logs.map(l => `<div class="small">✓ ${esc(TYPES[l.type].n)}${logSummary(l) ? ' · ' + esc(logSummary(l)) : ''}</div>`).join('')}</div>` : ''}
    <button class="linkb small" data-a="agweek">Ver la semana y ajustes de la agenda</button>`;
}
todayPanel = function () { return `<aside class="today">${agendaPanel()}</aside>`; };
wrapScreen('hoy', (h) => h.replace(/>Tu día<\/button>/, '>Agenda</button>'));
function agEditSheet(it, date) {
  const isNew = !it, v = it ? { title: it.title, date: it.date, time: it.time || '', moment: it.moment || '', kind: it.kind, note: it.note, remind: it.remind === false ? 'no' : 'si', before: it.before != null ? it.before : AG().before } : { date: date || today(), kind: 'tarea', remind: 'si', before: AG().before, moment: '', time: '' };
  sheet({ title: isNew ? 'Añadir a la agenda' : 'Editar', sub: 'Con hora exacta o con un momento del día', values: v, schema: [
    { k: 'title', l: '¿Qué?', t: 'text', ph: 'Ej.: caminar 20 min, cita médica, avena con fruta' },
    { k: 'date', l: 'Día', t: 'date' },
    { k: 'time', l: 'Hora exacta (opcional)', t: 'time' },
    { k: 'moment', l: 'O un momento del día', t: 'seg', o: [['', 'Ninguno']].concat(AG_MOMENTS), s: v => !v.time },
    { k: 'kind', l: 'Tipo', t: 'seg', o: AG_KINDS.map(x => [x, agKindName(x)]) },
    { k: 'remind', l: 'Recordármelo', t: 'seg', o: [['si', 'Sí'], ['no', 'No']] },
    { k: 'before', l: 'Minutos antes', t: 'num', u: 'min', step: 5, max: 240, s: v => v.remind === 'si' },
    { k: 'note', l: 'Nota (opcional)', t: 'text' }],
    onDelete: isNew ? null : () => agCommit(() => { AG().items = AG().items.filter(x => x.id !== it.id); }),
    onSave: (v) => {
      if (!String(v.title || '').trim()) return { errors: ['Escribe qué es'] };
      if (!validDate(v.date)) return { errors: ['Elige un día'] };
      const o = { titulo: v.title, fecha: v.date, hora: v.time || '', momento: v.time ? '' : v.moment, tipo: v.kind, nota: v.note || '', recordar: v.remind === 'si', minutos_antes: v.before };
      let r; const ok = agCommit(() => { r = isNew ? agPut(o, 'yo') : agEdit(it.id, o); if (!isNew && !v.time && !v.moment) { it.time = null; it.moment = null; } });
      if (r && r.error) return { errors: [r.error] };
      if (!ok) return false; agSel = v.date; toast('Guardado en la agenda');
    } });
}
wrapHandler('hoy', {
  agday: (d) => { agSel = d; homeView = 'dia'; route(); },
  agadd: (d) => agEditSheet(null, d),
  agedit: (id) => { const it = AG().items.find(x => x.id === id); if (it) agEditSheet(it); },
  agdone: (id) => { const it = AG().items.find(x => x.id === id); if (it && agCommit(() => { it.status = it.status === 'hecho' ? 'pendiente' : 'hecho'; })) route(); },
  agbell: (id) => { const it = AG().items.find(x => x.id === id); if (!it) return; if (!agAt(it)) return toast('Ponle hora o momento para recordártelo'); if (agCommit(() => { it.remind = it.remind === false; })) { toast(it.remind ? 'Te lo recordaré' : 'Sin recordatorio'); route(); } },
  agacc: (id) => { const it = AG().items.find(x => x.id === id); if (it && agCommit(() => { it.prop = false; it.src = 'yo'; })) route(); },
  agno: (id) => { if (agCommit(() => { AG().items = AG().items.filter(x => x.id !== id); })) route(); },
  agvirt: (x) => { const [vid, d] = x.split('|'); const v = agVirtual(d).find(y => y.vid === vid); if (v && agCommit(() => { agPut({ fecha: d, momento: v.moment, hora: v.time, titulo: v.title, tipo: v.kind, nota: v.note }, 'plan'); })) route(); },
  agundo: (x) => { const [mi, ci] = x.split('.').map(Number); const cd = S.ai.chat[mi] && S.ai.chat[mi].cards[ci]; if (!cd) return; const ids = new Set(cd.ids || []); if (agCommit(() => { AG().items = AG().items.filter(it => !ids.has(it.id)); cd.undone = true; })) { toast('Deshecho'); route(); } },
  agweek: () => { tab = 'agenda'; route(); }
});
/* Pantalla semana + ajustes de la agenda (Más → Agenda) */
SCREENS.agenda = () => {
  const k0 = today(), A = AG();
  const days = Array.from({ length: 7 }, (_, i) => addDays(k0, i));
  return `<div class="head"><div><h1>${ic('cal', 26)} Agenda</h1><div class="sub">Lo que el asistente y tú planean, por día y hora. Lo que tiene hora o momento se recuerda con una notificación.</div></div><button class="btn pri" data-a="agadd" data-x="${k0}">+ Añadir</button></div>
  <div class="grid">
    <div class="card c8"><h3>Próximos 7 días</h3>${days.map(d => { const its = agItems(d).concat(agVirtual(d)); return `<div class="agwk"><div class="kicker">${esc(cap1(fmt(d, true)))}${d === k0 ? ' · hoy' : ''}</div>${its.length ? its.sort((a, b) => (agMin(a) ?? 9999) - (agMin(b) ?? 9999)).map(it => `<div class="small agwl ${it.status === 'hecho' ? 'done' : ''}"><span>${esc(it.time || (it.moment ? agMomentName(it.moment) : '—'))}</span> ${esc(it.title)}${it.prop ? ' <span class="muted">(propuesta)</span>' : it.vid ? ' <span class="muted">(según tu plan)</span>' : ''}</div>`).join('') : '<div class="small muted">—</div>'}</div>`; }).join('')}</div>
    <div class="card c4"><h3>Ajustes</h3>
      <div class="field"><div class="lbl">Recordatorios de la agenda</div><div class="seg"><button data-a="agrem" data-x="1" class="${A.remind !== false ? 'on' : ''}">Activados</button><button data-a="agrem" data-x="0" class="${A.remind === false ? 'on' : ''}">Desactivados</button></div></div>
      <div class="field"><div class="lbl">Avisar con antelación</div><div class="seg">${[0, 5, 10, 15, 30].map(n => `<button data-a="agbef" data-x="${n}" class="${A.before === n ? 'on' : ''}">${n ? n + ' min' : 'A la hora'}</button>`).join('')}</div></div>
      <div class="field"><div class="lbl">Hora de cada momento del día</div><div class="hint">Lo que se agenda como “almuerzo” o “noche” se recuerda a esta hora.</div>${AG_MOMENTS.map(([m, n]) => `<div class="row between" style="margin:6px 0"><span>${n}</span><input type="time" data-agm="${m}" value="${A.moments[m]}" style="width:130px"></div>`).join('')}</div></div>
  </div>`;
};
HANDLERS.agenda = (m) => {
  onAct(m, {
    agadd: (d) => agEditSheet(null, d),
    agrem: (x) => { if (agCommit(() => { AG().remind = x === '1'; })) route(); },
    agbef: (x) => { if (agCommit(() => { AG().before = +x; })) route(); }
  });
  m.querySelectorAll('input[data-agm]').forEach(inp => inp.addEventListener('change', () => { if (agHM(inp.value) == null) return; if (agCommit(() => { AG().moments[inp.dataset.agm] = inp.value; })) toast('Hora guardada'); }));
};
wrapScreen('mas', (h) => h.replace('<div class="tiles">', `<div class="tiles"><button class="tile" data-a="go" data-x="agenda">${ic('cal')}<div><b>Agenda</b><div class="muted small">${AG().items.filter(x => x.date >= today() && !x.prop && x.status === 'pendiente').length} pendiente(s) · semana y recordatorios</div></div></button>`));

/* ---------- Saludo del día: propuestas a la agenda ---------- */
const _agAfter = afterUnlock;
afterUnlock = function (first) { _agAfter(first); agSchedule(); };
setInterval(() => { if (unlocked) agSchedule(); }, 30 * 60000);

window.ag = { date: agDate, time: agTime, moment: agMoment, put: agPut, edit: agEdit, items: agItems, virtual: agVirtual, schedule: agScheduleNow, setProposals: agSetProposals, init: agInit };
