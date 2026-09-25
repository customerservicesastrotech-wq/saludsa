/* Plan 20 · v2.7 — RELOJ INTERNO y MEMORIA 2.0
   Reloj: el asistente usa SIEMPRE la fecha y la hora reales de la tablet (y su zona horaria); nunca te la pregunta.
   Cada mensaje tuyo le llega con su hora, así entiende "hace un rato", "esta noche" o "mañana" sin que lo digas.
   Memoria: antes era una lista de frases (máx. 150). Ahora es una base estructurada que se guarda solo en la tablet:
   - Personas (amistades, familia…): nombre, apodos, relación, cumpleaños, teléfono y notas que se acumulan.
   - Fechas importantes: cumpleaños, aniversarios y eventos (anuales o de una vez), con avisos días antes.
   - Horarios a lo largo del tiempo: clases, trabajo, rutinas por días de la semana, con vigencia (desde/hasta),
     cada N semanas, excepciones y VERSIONES: cuando algo cambia, la versión anterior se cierra y queda en el historial.
   - Hechos: gustos, alergias, apoyos… con categoría, vigencia opcional e historial de cambios.
   La IA recibe un resumen acotado y ordenado por relevancia (lo de hoy, lo próximo y lo que mencionas) y puede
   buscar el resto con buscar_memoria, incluidas versiones pasadas ("¿qué horario tenía en agosto?"). */
'use strict';

/* ======================================================================
   RELOJ INTERNO
   ====================================================================== */
const MEM_MON = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function clockNow() {
  const d = new Date(), k = today();
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  const off = -d.getTimezoneOffset(), utc = `UTC${off >= 0 ? '+' : '−'}${pad2(Math.floor(Math.abs(off) / 60))}:${pad2(Math.abs(off) % 60)}`;
  const h = d.getHours(), part = h < 5 ? 'madrugada' : h < 12 ? 'mañana' : h < 14 ? 'mediodía' : h < 19 ? 'tarde' : 'noche';
  const kd = fromKey(k);
  return { k, hm: hhmm(d), h, part, tz, utc, dow: DOW[kd.getDay()], long: `${DOW[kd.getDay()]} ${kd.getDate()} de ${MEM_MON[kd.getMonth()]} de ${kd.getFullYear()}` };
}
function clockBlock() {
  const c = clockNow(), tm = addDays(c.k, 1);
  return `RELOJ (fecha y hora REALES de la tablet; úsalas siempre y NUNCA preguntes la hora ni la fecha): ${c.long} · ${c.hm} (${c.part})${c.tz ? ' · zona ' + c.tz : ''} ${c.utc}. Mañana es ${DOW[fromKey(tm).getDay()]} ${tm}.${c.h < 5 ? ' Es de madrugada: si dice "esta noche" o "mañana" puede referirse a HOY (' + c.k + '); si es ambiguo, elige lo más lógico y dilo.' : ''} Los mensajes de la persona llevan su hora entre corchetes.`;
}
/* Sello de hora para cada mensaje de la conversación: "[jue 24 sep 20:15]" */
function memStamp(t) { const d = new Date(t); if (isNaN(d)) return ''; return `[${DOW_S[d.getDay()].toLowerCase()} ${d.getDate()} ${MON[d.getMonth()]} ${hhmm(d)}]`; }

/* ======================================================================
   ESTADO, MIGRACIÓN Y REPARACIÓN
   ====================================================================== */
const MEM_CATS = ['comida', 'horario', 'preferencia', 'riesgo', 'salud', 'estudio', 'social', 'trabajo', 'otro'];
const MEM_DKINDS = ['cumple', 'aniversario', 'evento', 'fecha'];
const MEM_CAP = { mem: 400, people: 300, dates: 400, routines: 300, hist: 10, notes: 30 };
const memS = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const memId = (p) => p + uid().slice(-7);
const memLD = (t) => { const d = new Date(t); return isNaN(d) ? today() : toKey(d); }; // fecha LOCAL de un instante guardado en ISO (UTC)
function memInit() {
  const M = S.mind = (S.mind && typeof S.mind === 'object') ? S.mind : { mem: [], days: {} };
  if (!M.days || typeof M.days !== 'object') M.days = {};
  ['mem', 'people', 'dates', 'routines', 'nids'].forEach(f => { if (!Array.isArray(M[f])) M[f] = []; });
  const iso = (t) => (typeof t === 'string' && !isNaN(Date.parse(t))) ? t : new Date().toISOString();
  // hechos: se reparan (sin id, sin texto, categorías desconocidas) y se quitan duplicados exactos
  const seen = new Set();
  M.mem = M.mem.filter(m => m && typeof m.text === 'string' && m.text.trim()).map(m => Object.assign(m, { id: typeof m.id === 'string' && m.id ? m.id : memId('m'), t: iso(m.t), cat: MEM_CATS.includes(m.cat) ? m.cat : 'otro', text: memS(m.text, 300) }))
    .filter(m => { const n = agNorm(m.text) + '|' + (m.until || ''); if (seen.has(n)) return false; seen.add(n); return true; });
  M.people = M.people.filter(p => p && memS(p.name, 60)).map(p => Object.assign(p, { id: p.id || memId('p'), name: memS(p.name, 60), aliases: Array.isArray(p.aliases) ? p.aliases.map(a => memS(a, 40)).filter(Boolean).slice(0, 8) : [], rel: memS(p.rel, 60), notes: Array.isArray(p.notes) ? p.notes.filter(n => n && n.text).slice(-MEM_CAP.notes) : [], t: iso(p.t) }));
  M.dates = M.dates.filter(d => d && memS(d.title, 100) && (/^\d{2}-\d{2}$/.test(d.md || '') || validDate(d.date))).map(d => Object.assign(d, { id: d.id || memId('d'), kind: MEM_DKINDS.includes(d.kind) ? d.kind : 'fecha', remind: Array.isArray(d.remind) ? d.remind.filter(n => Number.isInteger(n) && n >= 0 && n <= 60).slice(0, 4) : [0], t: iso(d.t) }));
  M.routines = M.routines.filter(r => r && memS(r.title, 100) && Array.isArray(r.days) && r.days.length).map(r => Object.assign(r, { id: r.id || memId('r'), days: [...new Set(r.days.map(Number).filter(g => g >= 0 && g <= 6))].sort(), every: [1, 2, 3, 4].includes(r.every) ? r.every : 1, skip: Array.isArray(r.skip) ? r.skip.filter(validDate).slice(-60) : [], t: iso(r.t) })).filter(r => r.days.length);
  return M;
}
const MEM = () => { const M = S.mind; if (!M || !Array.isArray(M.people) || !Array.isArray(M.dates) || !Array.isArray(M.routines) || !Array.isArray(M.mem)) return memInit(); return M; };
memInit();
DEFAULT.mind = { mem: [], days: {}, people: [], dates: [], routines: [], nids: [] };
/* Límites: primero se descarta lo que ya terminó hace tiempo, nunca lo vigente */
function memPrune() {
  const M = MEM(), k = today(), old = addDays(k, -400);
  if (M.routines.length > MEM_CAP.routines) M.routines = M.routines.filter(r => !r.until || r.until >= old).slice(-MEM_CAP.routines);
  if (M.dates.length > MEM_CAP.dates) M.dates = M.dates.filter(d => d.md || d.date >= old).slice(-MEM_CAP.dates);
  if (M.people.length > MEM_CAP.people) M.people = M.people.slice(-MEM_CAP.people);
  if (M.mem.length > MEM_CAP.mem) { const done = M.mem.filter(m => m.until && m.until < k); M.mem = M.mem.filter(m => !done.includes(m) || done.indexOf(m) >= done.length - 50).slice(-MEM_CAP.mem); }
}

/* ======================================================================
   INTÉRPRETES (lo que diga la IA o la persona, en español)
   ====================================================================== */
const MEM_MN = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12, ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const memLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const memDim = (m, y) => [31, y == null || memLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
/* Día y mes (con año opcional): "12 de marzo", "12 de marzo de 1999", "12/03", "12/03/1999", "1999-03-12", "marzo 12" → { md: 'MM-DD', year } o null */
function memMD(s) {
  if (s == null || s === '') return null;
  const t = agNorm(s).replace(/^(el |la |dia |el dia )/, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  let d, m, y = null, x;
  if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(t))) { d = +x[1]; m = +x[2]; if (x[3]) { y = +x[3]; if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000; } }
  else if ((x = /^(\d{1,2}) (?:de )?([a-z]+)(?: (?:de |del )?(\d{4}))?$/.exec(t)) && MEM_MN[x[2]]) { d = +x[1]; m = MEM_MN[x[2]]; y = x[3] ? +x[3] : null; }
  else if ((x = /^([a-z]+) (\d{1,2})(?: (?:de )?(\d{4}))?$/.exec(t)) && MEM_MN[x[1]]) { m = MEM_MN[x[1]]; d = +x[2]; y = x[3] ? +x[3] : null; }
  else return null;
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= memDim(m, y))) return null;
  if (y != null && (y < 1900 || y > new Date().getFullYear() + 10)) return null;
  return { md: `${pad2(m)}-${pad2(d)}`, year: y };
}
/* Próxima vez que cae un día-mes a partir de k (el 29 de febrero se celebra el 28 en años no bisiestos) */
function memNext(md, k = today()) {
  const [m, d] = md.split('-').map(Number), y0 = fromKey(k).getFullYear();
  const occ = (y) => `${y}-${pad2(m)}-${pad2(m === 2 && d === 29 && !memLeap(y) ? 28 : d)}`;
  return occ(y0) >= k ? occ(y0) : occ(y0 + 1);
}
/* Fecha completa: YYYY-MM-DD, "mañana", "el jueves", "12 de marzo" (la próxima), "12/03/2027" */
function memFullDate(s) {
  if (s == null || s === '') return null;
  const a = agDate(s); if (a) return a;
  const r = memMD(s); if (!r) return null;
  if (r.year) { const k = `${r.year}-${r.md}`; return validDate(k) ? k : null; }
  return memNext(r.md);
}
/* Días de la semana: ["lunes","jueves"], "lunes a viernes", "martes y jueves", "fines de semana", "L M X", "todos los días" → [0..6] */
const MEM_DW = { domingo: 0, domingos: 0, dom: 0, d: 0, lunes: 1, lun: 1, l: 1, martes: 2, mar: 2, m: 2, miercoles: 3, mie: 3, mier: 3, x: 3, jueves: 4, jue: 4, j: 4, viernes: 5, vie: 5, v: 5, sabado: 6, sabados: 6, sab: 6, s: 6 };
function memDays(v) {
  if (v == null) return null;
  if (Array.isArray(v) && v.every(n => Number.isInteger(+n) && String(n).trim() !== '' && +n >= 0 && +n <= 6)) return v.length ? [...new Set(v.map(Number))].sort() : null;
  const t = agNorm(Array.isArray(v) ? v.join(', ') : v).replace(/[.]/g, '');
  if (!t) return null;
  const out = new Set();
  if (/todos los dias|diario|diariamente|cada dia|toda la semana|a diario|siempre/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  if (/entre semana|dias (habiles|laborables|de semana)|semana laboral/.test(t)) [1, 2, 3, 4, 5].forEach(g => out.add(g));
  if (/fin(es)? de semana/.test(t)) { out.add(0); out.add(6); }
  const rg = /(domingo|lunes|martes|miercoles|jueves|viernes|sabado)s? (?:a|al|hasta(?: el)?) (domingo|lunes|martes|miercoles|jueves|viernes|sabado)/g; let x;
  while ((x = rg.exec(t))) { let g = MEM_DW[x[1]]; const e = MEM_DW[x[2]]; for (let i = 0; i < 7; i++) { out.add(g); if (g === e) break; g = (g + 1) % 7; } }
  t.split(/[^a-z]+/).forEach(w => { if (w && MEM_DW[w] != null && (w.length > 1 || t.replace(/[^a-z]/g, '').length <= 7)) out.add(MEM_DW[w]); });
  return out.size ? [...out].sort() : null;
}
const MEM_DS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function memDaysTxt(days) {
  const s = (days || []).slice().sort().join(',');
  if (s === '0,1,2,3,4,5,6') return 'todos los días';
  if (s === '1,2,3,4,5') return 'lunes a viernes';
  if (s === '0,6') return 'fines de semana';
  if (s === '1,2,3,4,5,6') return 'lunes a sábado';
  return [1, 2, 3, 4, 5, 6, 0].filter(g => days.includes(g)).map(g => MEM_DS[g]).join(', ');
}
/* Rango horario: "7-9", "de 7 a 9 pm", "18:00 a 20:00" → { start, end } */
function memRange(s) {
  const t = agNorm(s).replace(/^de /, '').replace(/ (a|hasta|al?) /, '-').replace(/\s+/g, '');
  const x = /^([\d:h]+(?:am|pm)?)-([\d:h]+(?:am|pm)?)$/.exec(t);
  if (!x) { const one = agTime(t); return one ? { start: one, end: null } : null; }
  const pm = /pm$/.test(x[2]) && !/(am|pm)$/.test(x[1]);
  const b = agTime(x[2]); let a = agTime(x[1] + (pm ? 'pm' : ''));
  if (pm && a && b && agHM(a) > agHM(b)) a = agTime(x[1]); // "de 11 a 1 pm" = 11:00-13:00
  return a ? { start: a, end: b } : null;
}

/* ======================================================================
   OPERACIONES (solo mutan memoria: úsalas dentro de commit)
   ====================================================================== */
const memPeopleFind = (name) => { const n = agNorm(name); if (!n) return null; const P2 = MEM().people; return P2.find(p => agNorm(p.name) === n || p.aliases.some(a => agNorm(a) === n)) || P2.find(p => agNorm(p.name).split(' ')[0] === n && P2.filter(q => agNorm(q.name).split(' ')[0] === n).length === 1) || null; };
const memAge = (d, occ) => d.year ? fromKey(occ).getFullYear() - d.year : null;
function memDateLine(d, k = today()) {
  const occ = d.md ? memNext(d.md, k) : d.date, n = diffDays(k, occ), age = d.kind === 'cumple' ? memAge(d, occ) : d.kind === 'aniversario' && d.year ? fromKey(occ).getFullYear() - d.year : null;
  const when = n === 0 ? 'HOY' : n === 1 ? 'mañana' : n > 0 ? `en ${n} días` : `hace ${-n} días`;
  return { occ, n, age, when, txt: `${d.title} · ${fromKey(occ).getDate()} ${MON[fromKey(occ).getMonth()]}${d.md ? '' : ' ' + occ.slice(0, 4)}${age != null && age > 0 ? ` (${d.kind === 'cumple' ? 'cumple ' + age : age + ' años'})` : ''} · ${when}` };
}
/* Persona: crea o completa (nunca duplica: busca por nombre y apodos) */
function memPutPerson(o) {
  o = o || {};
  const name = memS(o.nombre || o.name, 60); if (!name && !o.id) return { error: 'falta el nombre' };
  const M = MEM(); let p = o.id ? M.people.find(x => x.id === o.id) : null;
  if (!p) p = memPeopleFind(name) || (Array.isArray(o.alias) ? o.alias.map(memPeopleFind).find(Boolean) : null);
  const isNew = !p;
  if (isNew) { p = { id: memId('p'), name, aliases: [], rel: '', notes: [], t: new Date().toISOString() }; M.people.push(p); }
  if (name && !isNew && agNorm(name) !== agNorm(p.name) && !p.aliases.some(a => agNorm(a) === agNorm(name))) { if (name.length > p.name.length && agNorm(name).startsWith(agNorm(p.name))) { p.aliases.push(p.name); p.name = name; } else p.aliases.push(name); }
  (Array.isArray(o.alias) ? o.alias : o.alias ? [o.alias] : []).map(a => memS(a, 40)).filter(a => a && agNorm(a) !== agNorm(p.name) && !p.aliases.some(b => agNorm(b) === agNorm(a))).forEach(a => p.aliases.push(a));
  p.aliases = p.aliases.slice(-8);
  if (memS(o.relacion || o.rel, 60)) p.rel = memS(o.relacion || o.rel, 60);
  if (memS(o.telefono, 30)) p.phone = memS(o.telefono, 30);
  const notes = (Array.isArray(o.notas) ? o.notas : o.nota ? [o.nota] : []).map(n => memS(n, 240)).filter(Boolean);
  notes.forEach(n => { if (!p.notes.some(x => agNorm(x.text) === agNorm(n))) p.notes.push({ t: new Date().toISOString(), text: n }); });
  p.notes = p.notes.slice(-MEM_CAP.notes);
  let warn = '';
  if (o.cumpleanos != null && o.cumpleanos !== '') {
    const r = memMD(o.cumpleanos);
    if (!r) warn = `cumpleaños no entendido (“${o.cumpleanos}”): usa "12 de marzo" o DD/MM/AAAA`;
    else { const d = M.dates.find(x => x.person === p.id && x.kind === 'cumple'); if (d) { if (d.md !== r.md) (d.hist = d.hist || []).push({ md: d.md, t: new Date().toISOString() }); d.md = r.md; d.year = r.year || (d.md === r.md ? d.year : null); d.title = `Cumpleaños de ${p.name}`; } else M.dates.push({ id: memId('d'), title: `Cumpleaños de ${p.name}`, kind: 'cumple', md: r.md, year: r.year, person: p.id, remind: [0, 1], t: new Date().toISOString() }); }
  }
  p.edited = Date.now();
  return { item: p, isNew, warn };
}
function memPutDate(o) {
  o = o || {};
  const M = MEM(), title = memS(o.titulo || o.title, 100);
  let d = o.id ? M.dates.find(x => x.id === o.id) : null;
  if (!d && !title) return { error: 'falta el título' };
  const kind = MEM_DKINDS.includes(o.tipo) ? o.tipo : d ? d.kind : /cumple/i.test(title) ? 'cumple' : /aniversario/i.test(title) ? 'aniversario' : 'evento';
  let annual = o.anual != null ? !!o.anual : d ? !!d.md : kind === 'cumple' || kind === 'aniversario';
  let md = null, date = null, year = null;
  if (o.fecha != null && o.fecha !== '') {
    const r = memMD(o.fecha), a = !r ? agDate(o.fecha) : null;
    if (!r && !a) return { error: `fecha no válida (“${o.fecha}”): usa "12 de marzo", DD/MM/AAAA o YYYY-MM-DD` };
    if (annual) { md = r ? r.md : a.slice(5); year = r ? r.year : null; }
    else { date = r ? (r.year ? `${r.year}-${r.md}` : memNext(r.md)) : a; if (!validDate(date)) return { error: 'fecha no válida' }; }
  } else if (!d) return { error: 'falta la fecha' };
  let person = null;
  if (o.persona) { const pr = memPutPerson({ nombre: o.persona }); if (pr.item) person = pr.item.id; }
  const remind = Array.isArray(o.avisar_dias_antes) ? [...new Set(o.avisar_dias_antes.map(n => Math.round(+n)).filter(n => n >= 0 && n <= 60))].slice(0, 4) : null;
  if (!d) d = M.dates.find(x => agNorm(x.title) === agNorm(title) && (md ? x.md === md : x.date === date));
  if (!d && kind === 'cumple' && person) d = M.dates.find(x => x.kind === 'cumple' && x.person === person);
  const isNew = !d;
  if (isNew) { d = { id: memId('d'), t: new Date().toISOString(), remind: [0, 1] }; M.dates.push(d); }
  if (title) d.title = title; d.kind = kind;
  if (md) { d.md = md; d.year = year || (d.md === md ? d.year : null); delete d.date; } else if (date) { d.date = date; delete d.md; delete d.year; }
  if (person) d.person = person;
  if (remind) d.remind = remind;
  if (o.nota != null) d.note = memS(o.nota, 240);
  if (o.hora != null) d.time = agTime(o.hora);
  d.edited = Date.now();
  return { item: d, isNew };
}
/* ¿Aplica el horario r el día k? (días, vigencia, cada N semanas, excepciones) */
function memOn(r, k) {
  if (!r.days.includes(fromKey(k).getDay())) return false;
  if (r.from && k < r.from) return false; if (r.until && k > r.until) return false;
  if ((r.skip || []).includes(k)) return false;
  if (r.every > 1) { const a = r.from || memLD(r.t); const wk = Math.floor(diffDays(addDays(a, -((fromKey(a).getDay() + 6) % 7)), k) / 7); if (wk % r.every) return false; }
  return true;
}
const memRoutinesOn = (k) => MEM().routines.filter(r => memOn(r, k)).sort((a, b) => (agHM(a.start) ?? 9999) - (agHM(b.start) ?? 9999));
const memRLine = (r) => `${r.title}: ${memDaysTxt(r.days)}${r.every > 1 ? ` (cada ${r.every} semanas)` : ''}${r.start ? ' ' + r.start + (r.end ? '-' + r.end : '') : ''}${r.place ? ' en ' + r.place : ''}${r.from ? ' · desde ' + r.from : ''}${r.until ? ' · hasta ' + r.until : ''}`;
function memRoutineFields(o, base) {
  const r = Object.assign({}, base || {}), err = [];
  if (o.titulo) r.title = memS(o.titulo, 100);
  if (o.dias != null) { const d = memDays(o.dias); if (d) r.days = d; else err.push(`días no entendidos (“${o.dias}”)`); }
  if (o.horas != null && o.horas !== '') { const g = memRange(o.horas); if (g) { r.start = g.start; r.end = g.end; } else err.push('horas no entendidas'); }
  if (o.hora_inicio != null) { if (o.hora_inicio === '') r.start = null; else { const t = agTime(o.hora_inicio); if (t) r.start = t; else err.push('hora de inicio no válida'); } }
  if (o.hora_fin != null) { if (o.hora_fin === '') r.end = null; else { const t = agTime(o.hora_fin); if (t) r.end = t; else err.push('hora de fin no válida'); } }
  if (o.hasta != null) { if (o.hasta === '') r.until = null; else { const d = memFullDate(o.hasta); if (d) r.until = d; else err.push('fecha "hasta" no válida'); } }
  if (o.cada_semanas != null) r.every = [1, 2, 3, 4].includes(+o.cada_semanas) ? +o.cada_semanas : 1;
  if (o.lugar != null) r.place = memS(o.lugar, 80);
  if (o.nota != null) r.note = memS(o.nota, 240);
  if (o.tipo) r.kind = agKind(o.tipo) || r.kind;
  if (o.recordar != null) r.remind = !!o.recordar;
  if (o.persona) { const pr = memPutPerson({ nombre: o.persona }); if (pr.item) r.person = pr.item.id; }
  return { r, err };
}
function memPutRoutine(o) {
  o = o || {};
  const M = MEM(); const { r, err } = memRoutineFields(o, { every: 1, skip: [], remind: false });
  if (err.length) return { error: err.join('; ') };
  if (!r.title) return { error: 'falta el título' };
  if (!r.days) return { error: 'faltan los días de la semana' };
  const from = o.desde ? memFullDate(o.desde) : today(); if (!from) return { error: 'fecha "desde" no válida' };
  r.from = from; if (r.until && r.until < from) return { error: '"hasta" es anterior a "desde"' };
  const same = M.routines.find(x => agNorm(x.title) === agNorm(r.title) && x.days.join() === r.days.join() && (x.start || '') === (r.start || '') && (!x.until || x.until >= today()));
  if (same) { Object.assign(same, { end: r.end || same.end, place: r.place || same.place, note: r.note || same.note, until: r.until !== undefined ? r.until : same.until, edited: Date.now() }); return { item: same, updated: true }; }
  r.id = memId('r'); r.t = new Date().toISOString(); r.kind = r.kind || agKind(r.title) || 'otro';
  M.routines.push(r);
  return { item: r };
}
/* Cambiar un horario A PARTIR de una fecha: la versión anterior se cierra el día antes y queda en el historial */
function memChangeRoutine(o) {
  const M = MEM(), old = M.routines.find(x => x.id === (o && o.id)); if (!old) return { error: `no existe ${o && o.id}` };
  const { r, err } = memRoutineFields(o, old); if (err.length) return { error: err.join('; ') };
  const from = o.desde ? memFullDate(o.desde) : today(); if (!from) return { error: 'fecha "desde" no válida' };
  if (!old.from || from <= old.from || memLD(old.t) === today() && from <= today()) { Object.assign(old, r, { edited: Date.now() }); if (o.desde) old.from = from; return { item: old, inPlace: true }; }
  const nr = Object.assign({}, r, { id: memId('r'), from, until: o.hasta ? r.until : (old.until && old.until >= from ? old.until : null), prev: old.id, t: new Date().toISOString(), skip: (old.skip || []).filter(d => d >= from) });
  old.until = addDays(from, -1); old.next = nr.id; old.skip = (old.skip || []).filter(d => d < from);
  M.routines.push(nr);
  return { item: nr, closed: old };
}
function memEndRoutine(id, when) {
  const r = MEM().routines.find(x => x.id === id); if (!r) return { error: `no existe ${id}` };
  const u = when ? memFullDate(when) : addDays(today(), -1); if (!u) return { error: 'fecha no válida' };
  if (r.from && u < r.from) { MEM().routines = MEM().routines.filter(x => x !== r); return { removed: true, item: r }; }
  r.until = u; r.edited = Date.now(); return { item: r };
}
/* Hechos con historial: "reemplaza" guarda la versión anterior (qué decía y hasta cuándo) */
function memPutFact(h) {
  const M = MEM(), txt = memS(h && h.texto, 300); if (!txt) return { error: 'texto vacío' };
  const cat = MEM_CATS.includes(h.categoria) ? h.categoria : 'otro';
  const since = h.desde ? memFullDate(h.desde) : null, until = h.hasta ? memFullDate(h.hasta) : null;
  if (h.reemplaza) {
    const old = M.mem.find(m => m.id === h.reemplaza);
    if (old) { if (agNorm(old.text) !== agNorm(txt)) { (old.hist = old.hist || []).push({ text: old.text, t: old.t, until: today() }); old.hist = old.hist.slice(-MEM_CAP.hist); } Object.assign(old, { text: txt, cat, t: new Date().toISOString(), since: since || old.since, until: until || null, edited: Date.now() }); return { item: old, replaced: true }; }
  }
  const n = agNorm(txt), dup = M.mem.find(m => agNorm(m.text) === n && (!m.until || m.until >= today()));
  if (dup) { if (until) dup.until = until; if (since) dup.since = since; return { item: dup, dup: true }; }
  const m = { id: memId('m'), t: new Date().toISOString(), cat, text: txt, src: h.src || 'ia' };
  if (since) m.since = since; if (until) m.until = until;
  M.mem.push(m);
  return { item: m };
}
/* Olvidar cualquier cosa por id (hecho m…, persona p…, fecha d…, horario r…) */
function memForget(ids) {
  const M = MEM(), set = new Set((ids || []).filter(Boolean)); let n = 0;
  const keep = (arr) => arr.filter(x => { if (set.has(x.id)) { n++; return false; } return true; });
  M.mem = keep(M.mem); M.dates = keep(M.dates); M.routines = keep(M.routines);
  const gone = M.people.filter(p => set.has(p.id)).map(p => p.id);
  M.people = keep(M.people);
  if (gone.length) M.dates = M.dates.filter(d => !(gone.includes(d.person) && d.kind === 'cumple'));
  M.dates.forEach(d => { if (gone.includes(d.person)) delete d.person; }); M.routines.forEach(r => { if (gone.includes(r.person)) delete r.person; });
  return n;
}
function memCommit(fn) { const ok = commit(() => { const r = fn(); memPrune(); return r; }); if (ok) memSchedule(); return ok; }

/* ======================================================================
   CONSULTAS
   ====================================================================== */
function memUpcoming(days = 30, k = today()) {
  return MEM().dates.map(d => Object.assign({ d }, memDateLine(d, k))).filter(x => x.n >= 0 && x.n <= days).sort((a, b) => a.n - b.n);
}
const memShareOk = (m) => S.ai.shareP !== false || m.cat !== 'riesgo';
function memSearch(x) {
  x = x || {}; const M = MEM(), q = agNorm(x.texto || ''), tipo = x.tipo || 'todo', out = [];
  const words = q.split(' ').filter(w => w.length > 2);
  const hit = (s) => !words.length || words.every(w => agNorm(s).includes(w));
  const at = x.fecha ? memFullDate(x.fecha) : null;
  if (x.fecha && !at) return 'Fecha no válida.';
  if (tipo === 'todo' || tipo === 'personas') M.people.forEach(p => { const b = M.dates.find(d => d.person === p.id && d.kind === 'cumple'); const s = `[${p.id}] ${p.name}${p.aliases.length ? ' (' + p.aliases.join(', ') + ')' : ''}${p.rel ? ' · ' + p.rel : ''}${b ? ' · cumpleaños ' + memDateLine(b).txt.split(' · ').slice(1).join(' · ') : ''}${p.phone ? ' · tel ' + p.phone : ''}${p.notes.length ? ' · notas: ' + p.notes.map(n => `${n.text} (${memLD(n.t)})`).join('; ') : ''}`; if (hit(s)) out.push(s); });
  if (tipo === 'todo' || tipo === 'fechas') M.dates.forEach(d => { const s = `[${d.id}] ${memDateLine(d).txt}${d.year && d.md ? ' · desde ' + d.year : ''}${d.note ? ' · ' + d.note : ''}${d.remind.length ? ' · aviso ' + d.remind.map(n => n ? n + ' d antes' : 'el día').join(', ') : ''}${(d.hist || []).length ? ' · antes: ' + d.hist.map(h => h.md).join(', ') : ''}`; if (hit(s)) out.push(s); });
  if (tipo === 'todo' || tipo === 'horarios') M.routines.filter(r => !at || memOn(r, at)).forEach(r => { const s = `[${r.id}] ${memRLine(r)}${r.until && r.until < today() ? ' (TERMINADO)' : r.from > today() ? ' (EMPIEZA MÁS ADELANTE)' : ''}${r.prev ? ' · reemplazó a ' + r.prev : ''}${(r.skip || []).length ? ' · excepto ' + r.skip.slice(-5).join(', ') : ''}${r.note ? ' · ' + r.note : ''}`; if (hit(s)) out.push(s); });
  if (tipo === 'todo' || tipo === 'hechos') M.mem.filter(memShareOk).filter(m => !at || ((!m.since || m.since <= at) && (!m.until || m.until >= at))).forEach(m => { const s = `[${m.id}] (${m.cat}${m.since ? ', desde ' + m.since : ''}${m.until ? ', hasta ' + m.until : ''}) ${m.text}${(m.hist || []).length ? ' · versiones anteriores: ' + m.hist.map(h => `"${h.text}" (hasta ${h.until})`).join('; ') : ''}`; if (hit(s)) out.push(s); });
  if (at && typeof agItems === 'function') agItems(at).forEach(it => out.push(`[${it.id}] agenda ${at} ${agWhen(it)} ${it.title}`));
  return out.length ? (at ? `Vigente el ${at}:\n` : '') + out.slice(0, 60).join('\n') + (out.length > 60 ? `\n(+${out.length - 60} más: afina la búsqueda)` : '') : 'Sin resultados en la memoria.';
}
/* Resumen para la IA: acotado y ordenado por relevancia */
function memoryBlock2() {
  const M = MEM(), k = today(), tm = addDays(k, 1);
  const last = [...S.ai.chat].reverse().find(m => m.role === 'user');
  const kw = last ? agNorm(last.content).split(/[^a-z0-9]+/).filter(w => w.length > 3) : [];
  const rel = (s) => kw.filter(w => agNorm(s).includes(w)).length;
  const out = [];
  const tot = M.mem.length + M.people.length + M.dates.length + M.routines.length;
  if (!tot) return 'MEMORIA: vacía. Aún no sabes sus horarios, sus personas importantes, qué comida hay en casa ni sus momentos de riesgo: pregúntalo de forma natural (una cosa a la vez) y guárdalo con las herramientas de memoria.';
  out.push(`MEMORIA (guardada en la tablet; id entre corchetes; ${M.people.length} personas, ${M.dates.length} fechas, ${M.routines.length} horarios, ${M.mem.length} hechos). Lo que no aparezca aquí búscalo con buscar_memoria.`);
  const rl = (r) => `[${r.id}] ${r.start || ''}${r.end ? '-' + r.end : ''} ${r.title}${r.place ? ' (' + r.place + ')' : ''}`.trim();
  out.push(`HORARIOS FIJOS HOY: ${memRoutinesOn(k).map(rl).join(' | ') || '—'}`);
  out.push(`HORARIOS FIJOS MAÑANA: ${memRoutinesOn(tm).map(rl).join(' | ') || '—'}`);
  const act = M.routines.filter(r => !r.until || r.until >= k);
  if (act.length) out.push('TODOS SUS HORARIOS VIGENTES:\n' + act.slice(0, 40).map(r => `- [${r.id}] ${memRLine(r)}`).join('\n'));
  const ended = M.routines.filter(r => r.until && r.until < k && r.until >= addDays(k, -45));
  if (ended.length) out.push('Horarios que terminaron hace poco: ' + ended.slice(-8).map(r => `[${r.id}] ${r.title} (hasta ${r.until})`).join('; '));
  const up = memUpcoming(45, k);
  if (up.length) out.push('FECHAS PRÓXIMAS (45 días): ' + up.slice(0, 15).map(x => `[${x.d.id}] ${x.txt}`).join(' | '));
  if (M.people.length) {
    const ps = M.people.map(p => { const b = M.dates.find(d => d.person === p.id && d.kind === 'cumple'); const bl = b ? memDateLine(b, k) : null; return { p, bl, s: rel(p.name + ' ' + p.aliases.join(' ') + ' ' + p.rel) * 100 + (bl && bl.n <= 45 ? 50 - bl.n : 0) + (p.edited || Date.parse(p.t)) / 1e12 }; }).sort((a, b) => b.s - a.s);
    out.push('PERSONAS:\n' + ps.slice(0, 25).map(({ p, bl }) => `- [${p.id}] ${p.name}${p.aliases.length ? ' ("' + p.aliases.join('", "') + '")' : ''}${p.rel ? ', ' + p.rel : ''}${bl ? `, cumpleaños ${bl.txt.split(' · ').slice(1).join(' · ')}` : ''}${p.notes.length ? ' — ' + p.notes.slice(-3).map(n => n.text).join('; ') : ''}`).join('\n') + (ps.length > 25 ? `\n(+${ps.length - 25} personas más: buscar_memoria)` : ''));
  }
  const facts = M.mem.filter(memShareOk).filter(m => (!m.until || m.until >= k) && (!m.since || m.since <= addDays(k, 30)));
  if (facts.length) {
    const sorted = facts.map((m, i) => ({ m, s: rel(m.text) * 1000 + i })).sort((a, b) => b.s - a.s).slice(0, 70).map(x => x.m).sort((a, b) => facts.indexOf(a) - facts.indexOf(b));
    out.push('HECHOS:\n' + sorted.map(m => `[${m.id}] (${m.cat}, ${memLD(m.t)}${m.since && m.since > k ? ', desde ' + m.since : ''}${m.until ? ', hasta ' + m.until : ''}) ${m.text}${(m.hist || []).length ? ' (antes: "' + m.hist[m.hist.length - 1].text.slice(0, 60) + '")' : ''}`).join('\n') + (facts.length > 70 ? `\n(+${facts.length - 70} hechos más: buscar_memoria)` : ''));
  }
  let s = out.join('\n'); if (s.length > 9000) s = s.slice(0, 9000) + '\n(…resumen recortado: usa buscar_memoria)';
  return s;
}
memoryBlock = memoryBlock2;

/* ======================================================================
   HERRAMIENTAS PARA LA IA
   ====================================================================== */
const MEM_TOOLS = [
  { name: 'persona', description: 'Guarda o actualiza a alguien importante para la persona (amistades, familia, pareja, profesores, compañeros). Nunca duplica: si ya existe (por nombre o apodo) lo completa. Las notas se acumulan con su fecha. El cumpleaños crea su fecha anual con aviso.', input_schema: { type: 'object', properties: { accion: { type: 'string', enum: ['guardar', 'borrar'] }, personas: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, nombre: { type: 'string' }, alias: { type: 'array', items: { type: 'string' } }, relacion: { type: 'string', description: 'p. ej. "mejor amigo", "hermana", "profesor de cálculo"' }, cumpleanos: { type: 'string', description: '"12 de marzo", "12/03" o "12/03/1999" (con año si lo sabe, para calcular la edad)' }, telefono: { type: 'string' }, notas: { type: 'array', items: { type: 'string' }, description: 'Datos nuevos sobre esa persona (gustos, qué le pasó, qué le regaló…)' } } } } }, required: ['personas'] } },
  { name: 'fecha_importante', description: 'Guarda fechas que hay que recordar: cumpleaños, aniversarios (anuales) o eventos de una vez (examen final, viaje, boda). Se avisa el día y los días antes que indiques.', input_schema: { type: 'object', properties: { accion: { type: 'string', enum: ['guardar', 'borrar'] }, fechas: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, titulo: { type: 'string' }, fecha: { type: 'string', description: '"12 de marzo", "12/03/2027", YYYY-MM-DD o "el jueves"' }, anual: { type: 'boolean', description: 'true = se repite cada año' }, tipo: { type: 'string', enum: MEM_DKINDS }, persona: { type: 'string', description: 'Nombre de la persona relacionada' }, hora: { type: 'string' }, avisar_dias_antes: { type: 'array', items: { type: 'number' }, description: 'p. ej. [0, 1, 7]; 0 = el mismo día' }, nota: { type: 'string' } } } } }, required: ['fechas'] } },
  { name: 'horario', description: 'Horarios que se repiten a lo largo del tiempo (clases, trabajo, turnos, entrenos, rutinas) por días de la semana, con vigencia. "crear" nuevo; "cambiar" por id A PARTIR de "desde" (la versión anterior se cierra y queda en el historial: no borres lo antiguo); "terminar" cuando deja de existir; "excepcion" para un día suelto sin ese horario (fecha); "borrar" solo si fue un error.', input_schema: { type: 'object', properties: { accion: { type: 'string', enum: ['crear', 'cambiar', 'terminar', 'excepcion', 'borrar'] }, horarios: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, titulo: { type: 'string' }, dias: { type: 'string', description: '"lunes a viernes", "martes y jueves", "fines de semana", "todos los días"' }, hora_inicio: { type: 'string', description: 'HH:MM' }, hora_fin: { type: 'string', description: 'HH:MM' }, desde: { type: 'string', description: 'Desde cuándo aplica (por defecto hoy)' }, hasta: { type: 'string', description: 'Hasta cuándo (fin de semestre, etc.)' }, cada_semanas: { type: 'number', description: '2 = semana sí, semana no' }, lugar: { type: 'string' }, persona: { type: 'string' }, tipo: { type: 'string', enum: AG_KINDS }, recordar: { type: 'boolean', description: 'Notificación antes de empezar' }, fecha: { type: 'string', description: 'Solo para excepcion/terminar' }, nota: { type: 'string' } } } } }, required: ['accion', 'horarios'] } },
  { name: 'buscar_memoria', description: 'Busca en TODA la memoria (personas, fechas, horarios, hechos), incluidas versiones pasadas. Con "fecha" devuelve lo vigente ese día (p. ej. qué horario tenía en agosto) y su agenda.', input_schema: { type: 'object', properties: { texto: { type: 'string' }, tipo: { type: 'string', enum: ['todo', 'personas', 'fechas', 'horarios', 'hechos'] }, fecha: { type: 'string' } } } }
];
{
  const i = TOOLS2.findIndex(t => t.name === 'recordar');
  const rec = { name: 'recordar', description: 'Guarda hechos estables sobre la persona que no son una persona, una fecha ni un horario: comidas familiares y cuáles prepara, alimentos en casa, gustos, alergias, desencadenantes, apoyos, metas, trabajo, estudios. Si un hecho CAMBIA, usa "reemplaza" con su id (la versión anterior queda en el historial). "desde/hasta" para algo temporal ("hasta diciembre estoy de vacaciones").', input_schema: { type: 'object', properties: { hechos: { type: 'array', items: { type: 'object', properties: { texto: { type: 'string' }, categoria: { type: 'string', enum: MEM_CATS }, reemplaza: { type: 'string', description: 'id del hecho que deja de ser cierto' }, desde: { type: 'string' }, hasta: { type: 'string' } }, required: ['texto', 'categoria'] } } }, required: ['hechos'] } };
  if (i >= 0) TOOLS2.splice(i, 1, rec); else TOOLS2.push(rec);
  const j = TOOLS2.findIndex(t => t.name === 'olvidar');
  if (j >= 0) TOOLS2[j] = { name: 'olvidar', description: 'Borra de la memoria lo que fue un error o la persona pide olvidar, por id (hechos m…, personas p…, fechas d…, horarios r…). Si algo solo CAMBIÓ, no lo borres: usa recordar con reemplaza u horario cambiar.', input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] } };
  MEM_TOOLS.forEach(t => TOOLS2.push(t));
  QUERY_TOOLS.push('buscar_memoria');
}
const _memRunTool = runTool;
runTool = function (name, x, ctx) {
  x = x || {};
  const list = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []).filter(o => o && typeof o === 'object').slice(0, 15);
  try {
    switch (name) {
      case 'recordar': {
        const hs = list(x.hechos); if (!hs.length) return { result: 'Nada que recordar.' };
        const done = [], bad = [];
        if (!memCommit(() => hs.forEach(h => { const r = memPutFact(h); if (r.error) bad.push(r.error); else if (!r.dup) done.push(r); }))) return { result: 'ERROR: no se pudo guardar en la tablet.' };
        return { result: `Recordado (${done.length}).${done.filter(r => r.replaced).length ? ' Versión anterior guardada en el historial.' : ''}${bad.length ? ' No guardado: ' + bad.join('; ') : ''}`, card: done.length ? { type: 'mem', items: done.map(r => ({ id: r.item.id, text: r.item.text })) } : null };
      }
      case 'olvidar': {
        let n = 0; if (!memCommit(() => { n = memForget(x.ids || []); })) return { result: 'ERROR al guardar.' };
        return { result: `Olvidados ${n}.`, card: n ? { type: 'chip', text: `Olvidé ${n} dato${n > 1 ? 's' : ''} de tu memoria` } : null };
      }
      case 'persona': {
        const ps = list(x.personas); if (!ps.length) return { result: 'Sin personas.' };
        if (x.accion === 'borrar') { let n = 0; memCommit(() => { n = memForget(ps.map(p => p.id || (memPeopleFind(p.nombre) || {}).id)); }); return { result: `Borradas ${n}.`, card: n ? { type: 'chip', text: `Olvidé ${n} persona${n > 1 ? 's' : ''}` } : null }; }
        const done = [], bad = [];
        if (!memCommit(() => ps.forEach(p => { const r = memPutPerson(p); if (r.error) bad.push(r.error); else { done.push(r); if (r.warn) bad.push(`${r.item.name}: ${r.warn}`); } }))) return { result: 'ERROR: no se pudo guardar en la tablet.' };
        return { result: done.map(r => `${r.isNew ? 'Nueva' : 'Actualizada'}: [${r.item.id}] ${r.item.name}`).join('\n') + (bad.length ? '\nPROBLEMAS: ' + bad.join('; ') : ''), card: done.length ? { type: 'mem2', items: done.map(r => ({ id: r.item.id, text: `👤 ${r.item.name}${r.item.rel ? ' · ' + r.item.rel : ''}${(() => { const b = MEM().dates.find(d => d.person === r.item.id && d.kind === 'cumple'); return b ? ' · 🎂 ' + memDateLine(b).txt.split(' · ').slice(1).join(' · ') : ''; })()}` })) } : null };
      }
      case 'fecha_importante': {
        const fs = list(x.fechas); if (!fs.length) return { result: 'Sin fechas.' };
        if (x.accion === 'borrar') { let n = 0; memCommit(() => { n = memForget(fs.map(f => f.id)); }); return { result: `Borradas ${n}.` }; }
        const done = [], bad = [];
        if (!memCommit(() => fs.forEach(f => { const r = memPutDate(f); if (r.error) bad.push(`${f.titulo || '?'}: ${r.error}`); else done.push(r); }))) return { result: 'ERROR: no se pudo guardar en la tablet.' };
        return { result: (done.length ? 'Guardado:\n' + done.map(r => `[${r.item.id}] ${memDateLine(r.item).txt}`).join('\n') : 'Nada guardado.') + (bad.length ? '\nNO guardado: ' + bad.join('; ') + ' — corrígelo y vuelve a llamar.' : ''), card: done.length ? { type: 'mem2', items: done.map(r => ({ id: r.item.id, text: `📅 ${memDateLine(r.item).txt}` })) } : bad.length ? { type: 'chip', text: 'No pude guardar: ' + bad[0] } : null };
      }
      case 'horario': {
        const hs = list(x.horarios); if (!hs.length) return { result: 'Sin horarios.' };
        const acc = x.accion || 'crear', done = [], bad = [], notes = [];
        const ok = memCommit(() => hs.forEach(h => {
          let r;
          if (acc === 'crear') r = memPutRoutine(h);
          else if (acc === 'cambiar') r = memChangeRoutine(h);
          else if (acc === 'terminar') r = memEndRoutine(h.id, h.fecha || h.hasta);
          else if (acc === 'excepcion') { const it = MEM().routines.find(q => q.id === h.id), d = memFullDate(h.fecha); r = !it ? { error: `no existe ${h.id}` } : !d ? { error: 'fecha no válida' } : (it.skip = [...new Set((it.skip || []).concat(d))].sort().slice(-60), { item: it }); if (d && it) notes.push(`${it.title}: sin clase/horario el ${d}`); }
          else if (acc === 'borrar') { const n = memForget([h.id]); r = n ? { removed: true, item: { title: h.id } } : { error: `no existe ${h.id}` }; }
          if (!r || r.error) bad.push((r && r.error) || 'acción no válida'); else { done.push(r); if (r.closed) notes.push(`La versión anterior [${r.closed.id}] queda en el historial hasta ${r.closed.until}`); }
        }));
        if (!ok) return { result: 'ERROR: no se pudo guardar en la tablet.' };
        const lines = done.filter(r => !r.removed).map(r => `[${r.item.id}] ${memRLine(r.item)}`);
        return { result: `${done.length ? 'Hecho:\n' + lines.join('\n') : 'Nada guardado.'}${notes.length ? '\n' + notes.join('\n') : ''}${bad.length ? '\nNO guardado: ' + bad.join('; ') + ' — corrígelo y vuelve a llamar.' : ''}`, card: done.length ? { type: 'mem2', items: done.map(r => ({ id: r.item.id, text: r.removed ? `🗓 Borrado ${r.item.title}` : `🗓 ${memRLine(r.item)}` })).concat(notes.map(n => ({ text: n }))) } : bad.length ? { type: 'chip', text: 'No pude guardar: ' + bad[0] } : null };
      }
      case 'buscar_memoria': return { result: memSearch(x) };
    }
  } catch (e) { console.error(e); return { result: 'ERROR interno: ' + e.message }; }
  return _memRunTool(name, x, ctx);
};
const _memCard = cardHTML;
cardHTML = function (c, mi, ci) {
  if (!c || c.type !== 'mem2') return _memCard(c, mi, ci);
  const M = MEM(), exists = (id) => M.people.some(p => p.id === id) || M.dates.some(d => d.id === id) || M.routines.some(r => r.id === id);
  return `<div class="acard"><div class="kicker">${ic('brain', 14)} En tu memoria</div>${(c.items || []).map(m => `<div class="small">• ${esc(m.text)} ${m.id ? (exists(m.id) ? `<button class="linkb" data-a="forget2" data-x="${esc(m.id)}">olvidar</button>` : '<span class="muted">(ya no está)</span>') : ''}</div>`).join('')}<div class="row" style="margin-top:6px"><button class="mini" data-a="open" data-x="memoria">Ver memoria</button></div></div>`;
};
wrapHandler('hoy', { forget2: (id) => { if (memCommit(() => { memForget([id]); })) route(); } });

/* Reglas y contexto: reloj al principio de la parte dinámica */
const _memRules = agentRules;
agentRules = function () {
  return _memRules() + `
- RELOJ: conoces la fecha y la hora reales (bloque RELOJ). Nunca preguntes qué hora o qué día es; calcula tú "en 2 horas", "el viernes", "¿cuánto falta?" y di las fechas relativas ("mañana jueves 25").
- MEMORIA: guarda con persona a quien mencione (nombre, relación, cumpleaños, lo que te cuente de ella); con fecha_importante cumpleaños, aniversarios y eventos; con horario sus clases, trabajo y rutinas por días (con desde/hasta); con recordar lo demás. Cuando algo cambie usa cambiar/reemplaza (nunca dupliques ni borres el pasado). Si no lo ves en el resumen, usa buscar_memoria antes de decir que no lo sabes. Usa lo que sabes con naturalidad (felicita en cumpleaños, ten en cuenta su horario al proponer la agenda).`;
};
const _memSystem = agentSystem;
agentSystem = function () { const s = _memSystem(); if (s[1] && typeof s[1].text === 'string') s[1].text = clockBlock() + '\n\n' + s[1].text; return s; };

/* ======================================================================
   AGENDA: los horarios y las fechas aparecen solos en cada día
   ====================================================================== */
const _memVirtual = agVirtual;
agVirtual = function (k) {
  const out = _memVirtual(k), mine = agItems(k).map(x => agNorm(x.title));
  memRoutinesOn(k).forEach(r => { if (!mine.includes(agNorm(r.title))) out.push({ vid: 'r:' + r.id, date: k, time: r.start || null, moment: r.start ? null : 'manana', title: r.title, kind: r.kind && r.kind !== 'otro' ? r.kind : 'tarea', note: [r.end ? 'hasta las ' + r.end : '', r.place || ''].filter(Boolean).join(' · ') || 'horario fijo', fixed: true }); });
  MEM().dates.forEach(d => { const occ = d.md ? memNext(d.md, k) : d.date; if (occ !== k) return; const l = memDateLine(d, k); out.push({ vid: 'd:' + d.id, date: k, time: d.time || null, moment: d.time ? null : 'manana', title: `${d.kind === 'cumple' ? '🎂' : '📅'} ${d.title}${l.age ? ` (${d.kind === 'cumple' ? 'cumple ' + l.age : l.age + ' años'})` : ''}`, kind: 'otro', note: d.note || '', fixed: true }); });
  return out;
};
const _memRow = agRow;
agRow = function (it, virt) {
  if (!virt || !it.fixed) return _memRow(it, virt);
  return _memRow(it, virt).replace(/<div class="aga">[\s\S]*<\/div><\/div>$/, `<div class="aga"><button class="mini" data-a="open" data-x="memoria">Ver</button></div></div>`).replace('<div class="small muted">Según tu plan</div>', `<div class="small muted">${it.vid.startsWith('d:') ? 'Fecha importante' : 'Horario fijo'}</div>`);
};

/* ======================================================================
   AVISOS: cumpleaños y fechas (ids 3000+) y horarios con recordatorio
   ====================================================================== */
let memSchedT = null;
function memSchedule() { clearTimeout(memSchedT); memSchedT = setTimeout(memScheduleNow, 500); }
function memPlanned(now = Date.now()) {
  const k = today(), out = [];
  MEM().dates.forEach(d => { const l = memDateLine(d, k); (d.remind.length ? d.remind : [0]).forEach(b => { const day = addDays(l.occ, -b); const at = fromKey(day).getTime() + 9 * 3600e3; if (at > now + 20000 && diffDays(k, day) <= 45) out.push({ at, body: b === 0 ? `Hoy: ${d.title}${l.age ? ` (${d.kind === 'cumple' ? 'cumple ' + l.age : l.age + ' años'})` : ''}` : `${b === 1 ? 'Mañana' : 'En ' + b + ' días'}: ${d.title}` }); }); });
  for (let i = 0; i <= 7; i++) { const day = addDays(k, i); memRoutinesOn(day).filter(r => r.remind && r.start).forEach(r => { const at = fromKey(day).getTime() + (agHM(r.start) - (AG().before || 10)) * 60000; if (at > now + 20000) out.push({ at, body: `${r.start} · ${r.title}${r.place ? ' (' + r.place + ')' : ''}` }); }); }
  return out.sort((a, b) => a.at - b.at).slice(0, 60);
}
async function memScheduleNow() {
  const LN = P('LocalNotifications'); if (!LN) return;
  const M = MEM(), list = memPlanned();
  try {
    if (M.nids.length) await LN.cancel({ notifications: M.nids.map(id => ({ id })) });
    if (list.length) { let perm = await LN.checkPermissions(); if (perm.display !== 'granted') perm = await LN.requestPermissions(); if (perm.display === 'granted') await LN.schedule({ notifications: list.map((x, i) => ({ id: 3000 + i, title: 'Plan 20', body: x.body.slice(0, 120), schedule: { at: new Date(x.at), allowWhileIdle: true } })) }); }
    M.nids = list.map((_, i) => 3000 + i); save();
  } catch (e) { console.warn(e); }
}
const _memAfter = afterUnlock;
afterUnlock = function (first) { _memAfter(first); memSchedule(); };
setInterval(() => { if (unlocked) memSchedule(); }, 6 * 3600e3);

/* Saludo y proactividad: felicitar a tiempo */
const _memLocalBrief = localBriefText;
localBriefText = function (k) {
  const t = _memLocalBrief(k), today2 = memUpcoming(1, k), rs = memRoutinesOn(k);
  const extra = [today2.length ? today2.map(x => x.n === 0 ? `🎂 Hoy: **${x.d.title}**${x.age ? ` (${x.d.kind === 'cumple' ? 'cumple ' + x.age : x.age + ' años'})` : ''}.` : `Mañana: ${x.d.title}.`).join(' ') : '', rs.length ? `Horario fijo de hoy: ${rs.map(r => `${r.start ? r.start + ' ' : ''}${r.title}`).join(', ')}.` : ''].filter(Boolean).join(' ');
  return extra ? t.replace('\n\n', ` ${extra}\n\n`) : t;
};
const _memProactive = proactive;
proactive = function () {
  _memProactive();
  const k = today(), md = mindDay(k);
  if (!md.flags.brief || md.flags.brief === 'pending' || md.flags.bday) return;
  const hoy = memUpcoming(0, k).filter(x => x.d.kind === 'cumple' || x.d.kind === 'aniversario');
  if (!hoy.length) return;
  md.flags.bday = 1;
  S.ai.chat.push({ role: 'assistant', local: true, t: Date.now(), content: `🎂 Hoy es ${hoy.map(x => `**${x.d.title.replace(/^Cumpleaños de /, 'el cumpleaños de ')}**${x.age ? ` (${x.d.kind === 'cumple' ? 'cumple ' + x.age : x.age + ' años'})` : ''}`).join(' y ')}. ¿Le escribes o le llamas? Si quieres, te ayudo con el mensaje.`, cards: [{ type: 'quick', items: ['Ayúdame con el mensaje', 'Ya le escribí', 'Recuérdamelo más tarde'] }] });
  save();
};

/* ======================================================================
   ÓRDENES LOCALES (sin IA, al instante)
   ====================================================================== */
const _memCmd = bjCommand;
bjCommand = function (text) {
  const t = bjNorm(text), c = clockNow();
  if (/^(que hora es|que horas son|me dices la hora|dime la hora|la hora)$/.test(t)) return { text: `Son las **${c.hm}** (${c.part}) del ${c.long}.` };
  if (/^(que dia es( hoy)?|a que (dia|fecha) estamos|que fecha es( hoy)?|en que fecha estamos|que dia es manana)$/.test(t)) { const tm = /manana/.test(t); const d = tm ? addDays(c.k, 1) : c.k; return { text: `${tm ? 'Mañana es' : 'Hoy es'} **${DOW[fromKey(d).getDay()]} ${fromKey(d).getDate()} de ${MEM_MON[fromKey(d).getMonth()]} de ${fromKey(d).getFullYear()}**${tm ? '' : ` y son las ${c.hm}`}.` }; }
  let x = /^(?:cuando (?:es|cae) el cumpleanos de|cuando cumple(?: anos)?|que dia cumple(?: anos)?|cuantos anos cumple) (.+)$/.exec(t);
  if (x) {
    const p = memPeopleFind(x[1].replace(/^(mi |el |la )/, ''));
    const b = p && MEM().dates.find(d => d.person === p.id && d.kind === 'cumple');
    if (!p) return { text: `No tengo guardado a **${x[1]}**. Cuéntame cuándo es su cumpleaños y lo recuerdo (“el cumple de ${x[1]} es el 12 de marzo”).` };
    if (!b) return { text: `Conozco a **${p.name}**${p.rel ? ` (${p.rel})` : ''}, pero no su cumpleaños. ¿Cuándo es?` };
    const l = memDateLine(b); return { text: `El cumpleaños de **${p.name}** es el **${fromKey(l.occ).getDate()} de ${MEM_MON[fromKey(l.occ).getMonth()]}** (${l.when})${l.age ? `; cumple **${l.age}**` : ''}.` };
  }
  if (/^(proximos cumpleanos|cumpleanos proximos|que cumpleanos (hay|vienen|tengo)( pronto)?|(que )?fechas importantes( proximas)?|quien cumple (pronto|anos pronto|este mes))$/.test(t)) {
    const all = memUpcoming(366), up = all.filter((y, i) => y.n <= 60 || i < 3); return { text: up.length ? `**Próximas fechas:**\n${up.slice(0, 10).map(y => `- ${y.txt}`).join('\n')}` : 'Aún no tengo cumpleaños ni fechas importantes. Cuéntame los de tu gente y yo me acuerdo por ti.' };
  }
  const hm = /^(?:que horario tengo|cual es mi horario|mi horario)(?: (hoy|manana|esta semana))?$/.exec(t);
  if (hm) {
    if (hm[1] === 'esta semana' || !hm[1]) { const act = MEM().routines.filter(r => (!r.until || r.until >= c.k) && (!r.from || r.from <= addDays(c.k, 7))); return { text: act.length ? `**Tus horarios fijos:**\n${act.map(r => `- ${memRLine(r)}`).join('\n')}` : 'Aún no tengo tus horarios. Cuéntamelos (“lunes y miércoles tengo inglés de 6 a 8”) y los guardo.' }; }
    const d = hm[1] === 'manana' ? addDays(c.k, 1) : c.k, rs = memRoutinesOn(d);
    return { text: rs.length ? `**${hm[1] === 'manana' ? 'Mañana' : 'Hoy'}:** ${rs.map(r => `${r.start ? r.start + (r.end ? '-' + r.end : '') + ' ' : ''}${r.title}${r.place ? ' (' + r.place + ')' : ''}`).join(' · ')}` : `${hm[1] === 'manana' ? 'Mañana' : 'Hoy'} no tienes horarios fijos guardados.` };
  }
  const r = _memCmd(text);
  if (r && /(que (me )?toca hoy|plan (de|para) hoy|que hago hoy|agenda de hoy|que tengo hoy)/.test(t)) {
    const rs = memRoutinesOn(c.k), up = memUpcoming(1);
    const add = [rs.length ? `- Horario fijo: ${rs.map(x2 => `${x2.start ? x2.start + ' ' : ''}${x2.title}`).join(', ')}` : '', up.length ? `- ${up.map(y => (y.n ? 'Mañana: ' : '🎂 Hoy: ') + y.d.title).join(' · ')}` : ''].filter(Boolean);
    if (add.length) r.text += '\n' + add.join('\n');
  }
  return r;
};

/* ======================================================================
   PANTALLA: Memoria (Personas · Fechas · Horarios · Hechos)
   ====================================================================== */
let memTab = 'personas', memQ = '';
const MEM_TABS = [['personas', 'Personas'], ['fechas', 'Fechas'], ['horarios', 'Horarios'], ['hechos', 'Hechos']];
const memHit = (s) => !memQ || agNorm(memQ).split(' ').filter(Boolean).every(w => agNorm(s).includes(w));
function memPeopleHTML() {
  const M = MEM(), ps = M.people.filter(p => memHit(p.name + ' ' + p.aliases.join(' ') + ' ' + p.rel + ' ' + p.notes.map(n => n.text).join(' '))).sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="row between" style="margin-bottom:10px"><span class="muted small">${M.people.length} persona${M.people.length === 1 ? '' : 's'}</span><button class="btn pri" data-a="mpadd">+ Persona</button></div>
  ${ps.length ? `<div class="memgrid">${ps.map(p => { const b = M.dates.find(d => d.person === p.id && d.kind === 'cumple'), l = b && memDateLine(b); return `<div class="card memp" data-a="mpedit" data-x="${p.id}"><b>${esc(p.name)}</b>${p.aliases.length ? ` <span class="muted small">(${esc(p.aliases.join(', '))})</span>` : ''}${p.rel ? `<div class="small muted">${esc(p.rel)}</div>` : ''}${l ? `<div class="small">🎂 ${fromKey(l.occ).getDate()} ${MON[fromKey(l.occ).getMonth()]}${l.age ? ` · cumple ${l.age}` : ''} · <b>${esc(l.when)}</b></div>` : ''}${p.phone ? `<div class="small">☎ ${esc(p.phone)}</div>` : ''}${p.notes.slice(-3).map(n => `<div class="small">• ${esc(n.text)}</div>`).join('')}</div>`; }).join('')}</div>` : `<div class="empty">${memQ ? 'Nada coincide con la búsqueda.' : 'Aún no hay personas. Cuéntale al asistente de tu gente (“mi mejor amigo es Juan, cumple el 3 de mayo”) o pulsa + Persona.'}</div>`}`;
}
function memDatesHTML() {
  const M = MEM(), k = today(), ds = M.dates.map(d => Object.assign({ d }, memDateLine(d, k))).filter(x => memHit(x.txt + ' ' + (x.d.note || ''))).sort((a, b) => (a.n < 0 ? 1e6 - a.n : a.n) - (b.n < 0 ? 1e6 - b.n : b.n));
  return `<div class="row between" style="margin-bottom:10px"><span class="muted small">${M.dates.length} fecha${M.dates.length === 1 ? '' : 's'} · se avisa a las 09:00</span><button class="btn pri" data-a="mdadd">+ Fecha</button></div>
  ${ds.length ? ds.map(x => `<div class="logitem memd ${x.n < 0 ? 'past' : ''}" data-a="mdedit" data-x="${x.d.id}"><div><div class="t" style="font-weight:600">${x.d.kind === 'cumple' ? '🎂' : x.d.kind === 'aniversario' ? '💞' : '📅'} ${esc(x.d.title)}</div><div class="d">${fromKey(x.occ).getDate()} ${MON[fromKey(x.occ).getMonth()]}${x.d.md ? ' · cada año' : ' ' + x.occ.slice(0, 4)}${x.age ? ` · ${x.d.kind === 'cumple' ? 'cumple ' + x.age : x.age + ' años'}` : ''}${x.d.note ? ' · ' + esc(x.d.note) : ''}</div></div><span class="pill ${x.n >= 0 && x.n <= 7 ? 'hot' : ''}">${esc(x.when)}</span></div>`).join('') : `<div class="empty">${memQ ? 'Nada coincide.' : 'Sin fechas todavía.'}</div>`}`;
}
function memRoutinesHTML() {
  const M = MEM(), k = today(), act = M.routines.filter(r => (!r.until || r.until >= k) && memHit(memRLine(r))), past = M.routines.filter(r => r.until && r.until < k && memHit(memRLine(r)));
  const wk = Array.from({ length: 7 }, (_, i) => addDays(k, i - ((fromKey(k).getDay() + 6) % 7)));
  const grid = `<div class="memtt">${wk.map(d => `<div class="memcol ${d === k ? 'on' : ''}"><div class="kicker">${DOW_S[fromKey(d).getDay()]} ${fromKey(d).getDate()}</div>${memRoutinesOn(d).map(r => `<div class="memblk" data-a="mredit" data-x="${r.id}"><b>${r.start || '—'}${r.end ? '–' + r.end : ''}</b><span>${esc(r.title)}</span></div>`).join('') || '<div class="small muted">—</div>'}</div>`).join('')}</div>`;
  return `<div class="row between" style="margin-bottom:10px"><span class="muted small">Esta semana</span><button class="btn pri" data-a="mradd">+ Horario</button></div>${grid}
  <h3 style="margin-top:18px">Vigentes</h3>${act.length ? act.map(r => `<div class="logitem" data-a="mredit" data-x="${r.id}"><div><div class="t" style="font-weight:600">${esc(r.title)}${r.remind ? ' ' + ic('bell', 13) : ''}</div><div class="d">${esc(memRLine(r).slice(r.title.length + 2))}${r.from > k ? ' · empieza más adelante' : ''}</div></div></div>`).join('') : '<div class="empty">Sin horarios. Díselo al asistente (“de lunes a viernes trabajo de 8 a 4”).</div>'}
  ${past.length ? `<details class="memhist"><summary>Historial (${past.length} ${past.length === 1 ? 'versión anterior' : 'versiones anteriores'})</summary>${past.slice().reverse().map(r => `<div class="logitem past"><div><div class="t">${esc(r.title)}</div><div class="d">${esc(memRLine(r).slice(r.title.length + 2))}</div></div><button class="btn ghost" data-a="mrdel" data-x="${r.id}">Borrar</button></div>`).join('')}</details>` : ''}`;
}
function memFactsHTML() {
  const M = MEM(), k = today(), mem = M.mem.filter(m => memHit(m.text + ' ' + m.cat)), cats = MEM_CATS.filter(ct => mem.some(m => m.cat === ct));
  return `<div class="card" style="margin-bottom:14px"><div class="row"><input type="text" id="memnew" placeholder="Añade algo que deba saber (ej. “soy alérgico al maní”)" style="flex:1"><button class="btn pri" data-a="madd">Guardar</button></div></div>
  ${cats.length ? cats.map(ct => `<div class="card" style="margin-bottom:14px"><div class="kicker">${esc(ct)}</div>${mem.filter(m => m.cat === ct).map(m => `<div class="logitem ${m.until && m.until < k ? 'past' : ''}"><div><div class="t" style="font-weight:500">${esc(m.text)}</div><div class="d">${memLD(m.t)}${m.since ? ' · desde ' + m.since : ''}${m.until ? ' · hasta ' + m.until : ''}${(m.hist || []).length ? ` · <span title="${esc(m.hist.map(h => h.text).join(' → '))}">antes: “${esc(m.hist[m.hist.length - 1].text.slice(0, 60))}”</span>` : ''}</div></div><button class="btn ghost" data-a="mdel" data-x="${m.id}">Borrar</button></div>`).join('')}</div>`).join('') : `<div class="empty">${memQ ? 'Nada coincide.' : 'Aún no sé nada de ti. Cuéntaselo al asistente en Inicio.'}</div>`}`;
}
SCREENS.memoria = () => {
  const M = MEM(), n = { personas: M.people.length, fechas: M.dates.length, horarios: M.routines.filter(r => !r.until || r.until >= today()).length, hechos: M.mem.length };
  return `<div class="head"><div><h1>${ic('brain', 26)} Memoria</h1><div class="sub">Lo que el asistente sabe y recuerda por ti: tu gente, sus fechas, tus horarios a lo largo del tiempo y tus datos. Solo en la tablet. Hoy es ${esc(clockNow().long)}, ${clockNow().hm}.</div></div></div>
  <div class="row memtop"><div class="seg memtabs">${MEM_TABS.map(([t, l]) => `<button data-a="mtab" data-x="${t}" class="${memTab === t ? 'on' : ''}">${l} <i>${n[t]}</i></button>`).join('')}</div><input type="search" id="memq" placeholder="Buscar en la memoria" value="${esc(memQ)}"></div>
  <div id="membody">${memTab === 'personas' ? memPeopleHTML() : memTab === 'fechas' ? memDatesHTML() : memTab === 'horarios' ? memRoutinesHTML() : memFactsHTML()}</div>`;
};
function memPersonSheet(p) {
  const M = MEM(), b = p && M.dates.find(d => d.person === p.id && d.kind === 'cumple');
  const v = p ? { name: p.name, alias: p.aliases.join(', '), rel: p.rel, bday: b ? `${+b.md.slice(3)}/${+b.md.slice(0, 2)}${b.year ? '/' + b.year : ''}` : '', phone: p.phone || '', notes: p.notes.map(n => n.text).join('\n') } : {};
  sheet({ title: p ? p.name : 'Nueva persona', sub: 'Amistades, familia, compañeros…', values: v, schema: [
    { k: 'name', l: 'Nombre', t: 'text' }, { k: 'alias', l: 'Apodos (separados por coma)', t: 'text' }, { k: 'rel', l: 'Relación', t: 'text', ph: 'mejor amigo, hermana, profesora…' },
    { k: 'bday', l: 'Cumpleaños', t: 'text', ph: '12/03/1999 o 12 de marzo' }, { k: 'phone', l: 'Teléfono (opcional)', t: 'text' }, { k: 'notes', l: 'Notas (una por línea)', t: 'area' }],
    onDelete: p ? () => memCommit(() => { memForget([p.id]); }) : null,
    onSave: (v2) => {
      if (!memS(v2.name, 60)) return { errors: ['Escribe el nombre'] };
      if (v2.bday && !memMD(v2.bday)) return { errors: ['Cumpleaños no válido: usa 12/03/1999 o “12 de marzo”'] };
      let r; const ok = memCommit(() => {
        if (p) { p.name = memS(v2.name, 60); p.aliases = String(v2.alias || '').split(',').map(a => memS(a, 40)).filter(Boolean).slice(0, 8); p.rel = memS(v2.rel, 60); p.phone = memS(v2.phone, 30); const lines = String(v2.notes || '').split('\n').map(l => memS(l, 240)).filter(Boolean); p.notes = lines.map(l => p.notes.find(n => n.text === l) || { t: new Date().toISOString(), text: l }).slice(-MEM_CAP.notes); if (!v2.bday && b) MEM().dates = MEM().dates.filter(d => d !== b); r = memPutPerson({ id: p.id, cumpleanos: v2.bday || '' }); }
        else r = memPutPerson({ nombre: v2.name, alias: String(v2.alias || '').split(','), relacion: v2.rel, cumpleanos: v2.bday, telefono: v2.phone, notas: String(v2.notes || '').split('\n') });
      });
      if (r && r.error) return { errors: [r.error] };
      if (!ok) return false; toast('Guardado en la memoria');
    } });
}
function memDateSheet(d) {
  const v = d ? { title: d.title, fecha: d.md ? `${+d.md.slice(3)}/${+d.md.slice(0, 2)}${d.year ? '/' + d.year : ''}` : d.date, anual: d.md ? 'si' : 'no', kind: d.kind, remind: (d.remind || []).map(String), note: d.note || '' } : { anual: 'si', kind: 'evento', remind: ['0', '1'] };
  sheet({ title: d ? 'Editar fecha' : 'Nueva fecha', sub: 'Cumpleaños, aniversarios, eventos', values: v, schema: [
    { k: 'title', l: '¿Qué es?', t: 'text', ph: 'Aniversario con Laura, examen final…' }, { k: 'fecha', l: 'Fecha', t: 'text', ph: '12/03/2027 o 12 de marzo' },
    { k: 'anual', l: 'Se repite cada año', t: 'seg', o: [['si', 'Sí'], ['no', 'No']] }, { k: 'kind', l: 'Tipo', t: 'seg', o: [['cumple', 'Cumpleaños'], ['aniversario', 'Aniversario'], ['evento', 'Evento'], ['fecha', 'Otra']] },
    { k: 'remind', l: 'Avisarme', t: 'multi', o: [['0', 'El día'], ['1', '1 día antes'], ['3', '3 días'], ['7', '1 semana']] }, { k: 'note', l: 'Nota', t: 'text' }],
    onDelete: d ? () => memCommit(() => { memForget([d.id]); }) : null,
    onSave: (v2) => {
      if (!memS(v2.title, 100)) return { errors: ['Escribe qué es'] };
      let r; const ok = memCommit(() => { r = memPutDate({ id: d && d.id, titulo: v2.title, fecha: v2.fecha, anual: v2.anual === 'si', tipo: v2.kind, avisar_dias_antes: (v2.remind || []).map(Number), nota: v2.note || '' }); if (r.error) return false; });
      if (r && r.error) return { errors: [r.error] };
      if (!ok) return false; toast('Fecha guardada');
    } });
}
function memRoutineSheet(r) {
  const k = today(), v = r ? { title: r.title, days: r.days.map(String), start: r.start || '', end: r.end || '', from: r.from || k, until: r.until || '', every: String(r.every || 1), place: r.place || '', remind: r.remind ? 'si' : 'no', apply: k } : { days: [], from: k, every: '1', remind: 'no' };
  sheet({ title: r ? 'Editar horario' : 'Nuevo horario', sub: r ? 'Si el horario cambia desde una fecha, el anterior queda en el historial' : 'Clases, trabajo, rutinas que se repiten', values: v, schema: [
    { k: 'title', l: '¿Qué?', t: 'text', ph: 'Inglés, trabajo, gimnasio…' }, { k: 'days', l: 'Días', t: 'multi', o: [1, 2, 3, 4, 5, 6, 0].map(g => [String(g), MEM_DS[g]]) },
    { k: 'start', l: 'Desde las', t: 'time' }, { k: 'end', l: 'Hasta las', t: 'time' }, { k: 'place', l: 'Lugar (opcional)', t: 'text' },
    { k: 'every', l: 'Frecuencia', t: 'seg', o: [['1', 'Cada semana'], ['2', 'Cada 2 semanas']] },
    r ? { k: 'apply', l: 'Los cambios aplican desde', t: 'date' } : { k: 'from', l: 'Empieza', t: 'date' }, { k: 'until', l: 'Termina (opcional)', t: 'date' },
    { k: 'remind', l: 'Recordármelo antes', t: 'seg', o: [['si', 'Sí'], ['no', 'No']] }],
    onDelete: r ? () => memCommit(() => { memForget([r.id]); }) : null,
    onSave: (v2) => {
      if (!memS(v2.title, 100)) return { errors: ['Escribe qué es'] };
      if (!(v2.days || []).length) return { errors: ['Elige al menos un día'] };
      const o = { id: r && r.id, titulo: v2.title, dias: (v2.days || []).map(Number), hora_inicio: v2.start || '', hora_fin: v2.end || '', hasta: v2.until || '', cada_semanas: +v2.every, lugar: v2.place || '', recordar: v2.remind === 'si', desde: r ? v2.apply : v2.from };
      let res; const ok = memCommit(() => { res = r ? memChangeRoutine(o) : memPutRoutine(o); if (res.error) return false; });
      if (res && res.error) return { errors: [res.error] };
      if (!ok) return false; toast(res.closed ? `Guardado. La versión anterior queda en el historial (hasta ${res.closed.until})` : 'Horario guardado');
    } });
}
HANDLERS.memoria = (m) => {
  const q = $('#memq', m);
  if (q) q.addEventListener('input', () => { memQ = q.value; const b = $('#membody', m); if (b) b.innerHTML = memTab === 'personas' ? memPeopleHTML() : memTab === 'fechas' ? memDatesHTML() : memTab === 'horarios' ? memRoutinesHTML() : memFactsHTML(); });
  onAct(m, {
    mtab: (t) => { memTab = t; route(); },
    mpadd: () => memPersonSheet(null), mpedit: (id) => { const p = MEM().people.find(x => x.id === id); if (p) memPersonSheet(p); },
    mdadd: () => memDateSheet(null), mdedit: (id) => { const d = MEM().dates.find(x => x.id === id); if (d) memDateSheet(d); },
    mradd: () => memRoutineSheet(null), mredit: (id) => { const r = MEM().routines.find(x => x.id === id); if (r) memRoutineSheet(r); },
    mrdel: (id) => { if (memCommit(() => { memForget([id]); })) route(); },
    mdel: (id) => { if (memCommit(() => { memForget([id]); })) route(); },
    madd: () => { const t = ($('#memnew').value || '').trim(); if (!t) return; if (memCommit(() => { memPutFact({ texto: t, categoria: 'otro', src: 'yo' }); })) route(); }
  });
};
/* Recuento en Más y en Ajustes */
wrapScreen('mas', (h) => { const M = MEM(), n = M.mem.length + M.people.length + M.dates.length + M.routines.length; return h.replace(/(<b>Lo que el asistente sabe de ti<\/b><div class="muted small">)[^<]*/, `$1${M.people.length} personas · ${M.dates.length} fechas · ${M.routines.filter(r => !r.until || r.until >= today()).length} horarios · ${M.mem.length} datos${n ? '' : ''}`); });

window.mem = { clock: clockNow, clockBlock, stamp: memStamp, md: memMD, next: memNext, fullDate: memFullDate, days: memDays, range: memRange, putPerson: memPutPerson, putDate: memPutDate, putRoutine: memPutRoutine, changeRoutine: memChangeRoutine, endRoutine: memEndRoutine, putFact: memPutFact, forget: memForget, on: memOn, routinesOn: memRoutinesOn, upcoming: memUpcoming, search: memSearch, block: memoryBlock2, planned: memPlanned, init: memInit, prune: memPrune, find: memPeopleFind, commit: memCommit };
