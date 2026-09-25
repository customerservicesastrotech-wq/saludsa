/* Plan 20 · v2.8 — CONEXIÓN CON LAS APPS DE SAMSUNG
   - Samsung Calendar: lo que se agenda en Plan 20 (agenda, horarios fijos y cumpleaños) se copia al calendario de la
     tablet que elijas (cuenta Samsung, Google o "Mi calendario"). Si lo cambias o lo borras en Plan 20, también allí.
   - Samsung Reloj: «ponme la alarma a las 6:30» crea la alarma de verdad en el reloj de la tablet (sin abrirlo).
   - El modo dormir termina cuando suena esa alarma (lo decide la parte nativa con la próxima alarma del sistema). */
'use strict';

const DV = () => P('Dispositivo');
DEFAULT.samsung = { cal: false, calId: null, calName: '', map: {}, alarms: [] };
function samInit() {
  S.samsung = Object.assign(structuredClone(DEFAULT.samsung), S.samsung || {});
  if (!S.samsung.map || typeof S.samsung.map !== 'object') S.samsung.map = {};
  if (!Array.isArray(S.samsung.alarms)) S.samsung.alarms = [];
}
samInit();
const SAM = () => { if (!S.samsung || !S.samsung.map || !Array.isArray(S.samsung.alarms)) samInit(); return S.samsung; };

/* ======================================================================
   CALENDARIO: qué se copia y cómo
   ====================================================================== */
const SAM_BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const samUtcDay = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const samRDate = (k) => k.replace(/-/g, '') + 'T235959Z';
/* Lista de eventos que deberían estar en el calendario de la tablet: { key, title, start, end, allDay, rrule, notes } */
function samWanted() {
  const out = [], k0 = today(), from = addDays(k0, -1), to = addDays(k0, 120);
  AG().items.filter(it => !it.prop && it.date >= from && it.date <= to).forEach(it => {
    const at = agAt(it);
    out.push(at != null
      ? { key: 'g:' + it.id, title: it.title, start: at, end: at + (it.kind === 'comida' ? 30 : 60) * 60000, allDay: false, notes: [it.note, 'Plan 20 · agenda'].filter(Boolean).join('\n') }
      : { key: 'g:' + it.id, title: it.title, start: samUtcDay(it.date), end: samUtcDay(it.date) + 864e5, allDay: true, notes: [it.note, 'Plan 20 · agenda'].filter(Boolean).join('\n') });
  });
  if (typeof MEM === 'function') {
    MEM().routines.filter(r => !r.until || r.until >= k0).forEach(r => {
      let d = r.from && r.from > k0 ? r.from : k0; for (let i = 0; i < 7 && !memOn(r, d); i++) d = addDays(d, 1);
      if (!memOn(r, d)) { d = r.from && r.from > k0 ? r.from : k0; for (let i = 0; i < 7 && !r.days.includes(fromKey(d).getDay()); i++) d = addDays(d, 1); }
      const rr = `FREQ=WEEKLY;BYDAY=${r.days.map(g => SAM_BYDAY[g]).join(',')}${r.every > 1 ? ';INTERVAL=' + r.every : ''}${r.until ? ';UNTIL=' + samRDate(r.until) : ''}`;
      const st = r.start ? fromKey(d).getTime() + agHM(r.start) * 60000 : null;
      const dur = r.start && r.end ? Math.max(15, ((agHM(r.end) - agHM(r.start)) + 1440) % 1440) : 60;
      out.push(st != null ? { key: 'r:' + r.id, title: r.title, start: st, end: st + dur * 60000, allDay: false, rrule: rr, notes: [r.place, r.note, 'Plan 20 · horario fijo'].filter(Boolean).join('\n') }
        : { key: 'r:' + r.id, title: r.title, start: samUtcDay(d), end: samUtcDay(d) + 864e5, allDay: true, rrule: rr, notes: 'Plan 20 · horario fijo' });
    });
    MEM().dates.forEach(dt => {
      const occ = dt.md ? memNext(dt.md) : dt.date; if (!dt.md && occ < k0) return;
      const age = dt.kind === 'cumple' && dt.year ? ' · desde ' + dt.year : '';
      out.push({ key: 'd:' + dt.id, title: `${dt.kind === 'cumple' ? '🎂 ' : ''}${dt.title}`, start: samUtcDay(occ), end: samUtcDay(occ) + 864e5, allDay: true, rrule: dt.md ? (dt.md === '02-29' ? 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'FREQ=YEARLY') : null, notes: `Plan 20 · fecha importante${age}${dt.note ? '\n' + dt.note : ''}` });
    });
  }
  return out;
}
const samSig = (e) => [e.title, e.start, e.end, e.allDay ? 1 : 0, e.rrule || '', e.notes || ''].join('|');
let samBusy = false, samAgain = false, samT = null, samLast = null;
function samSyncSoon() { clearTimeout(samT); samT = setTimeout(samSync, 800); }
/* Sincroniza: crea lo nuevo, actualiza lo cambiado y borra lo que ya no está. Nunca toca eventos que no creó Plan 20. */
async function samSync() {
  const D = DV(), A = SAM();
  if (!D || !A.cal || !A.calId) return { skipped: true };
  if (samBusy) { samAgain = true; return { busy: true }; }
  samBusy = true;
  const res = { created: 0, updated: 0, deleted: 0, errors: [] };
  try {
    const want = samWanted(), keys = new Set(want.map(e => e.key));
    for (const e of want) {
      const m = A.map[e.key], sig = samSig(e);
      if (m && m.sig === sig && m.cal === A.calId) continue;
      try {
        const r = await D.saveEvent({ calendarId: A.calId, eventId: m && m.cal === A.calId ? m.ev : undefined, title: e.title, start: e.start, end: e.end, allDay: e.allDay, rrule: e.rrule || '', notes: e.notes, reminder: -1 });
        if (m && m.cal !== A.calId && m.ev) { try { await D.deleteEvents({ ids: [m.ev] }); } catch (x) {} }
        A.map[e.key] = { ev: r.eventId, sig, cal: A.calId }; m && m.cal === A.calId ? res.updated++ : res.created++;
      } catch (x) { res.errors.push(x.message || String(x)); }
    }
    const gone = Object.keys(A.map).filter(k => !keys.has(k));
    if (gone.length) {
      try { await D.deleteEvents({ ids: gone.map(k => A.map[k].ev).filter(Boolean) }); gone.forEach(k => delete A.map[k]); res.deleted = gone.length; }
      catch (x) { res.errors.push(x.message || String(x)); }
    }
    save();
  } finally { samBusy = false; }
  samLast = res;
  if (samAgain) { samAgain = false; samSyncSoon(); }
  return res;
}
/* Tras cada cambio en la agenda o en la memoria */
const _samAgSched = agSchedule;
agSchedule = function () { _samAgSched(); samSyncSoon(); };
const _samMemSched = memSchedule;
memSchedule = function () { _samMemSched(); samSyncSoon(); };

async function samCalendars() {
  const D = DV(); if (!D) throw new Error('Solo funciona en la app instalada en la tablet.');
  const p = await D.calendarPermission(); if (!p || !p.granted) throw new Error('Sin permiso de calendario no puedo escribir en Samsung Calendar. Concédelo en Ajustes de Android → Apps → Plan 20 → Permisos.');
  return ((await D.listCalendars()).calendars || []);
}
/* Elige el calendario: el que diga la persona, o el principal de Samsung, o el primero que se pueda escribir */
function samPick(cals) {
  return cals.find(c => /samsung/i.test(c.type || '') && c.primary) || cals.find(c => /samsung/i.test(c.type || '')) || cals.find(c => c.primary && /google/i.test(c.type || '')) || cals.find(c => c.primary) || cals[0] || null;
}
async function samEnable(calId) {
  const cals = await samCalendars();
  if (!cals.length) throw new Error('No encontré ningún calendario en la tablet. Abre Samsung Calendar una vez y vuelve a intentarlo.');
  const c = cals.find(x => String(x.id) === String(calId)) || samPick(cals);
  commit(() => { const A = SAM(); A.cal = true; A.calId = c.id; A.calName = `${c.name}${c.account && c.account !== c.name ? ' · ' + c.account : ''}`; });
  const r = await samSync();
  return { cal: c, r, cals };
}
async function samDisable(removeEvents) {
  const D = DV(), A = SAM();
  if (removeEvents && D) { try { await D.deleteEvents({ ids: Object.values(A.map).map(m => m.ev).filter(Boolean) }); } catch (e) {} }
  commit(() => { A.cal = false; if (removeEvents) A.map = {}; });
}

/* ======================================================================
   ALARMAS (Samsung Reloj)
   ====================================================================== */
/* «6:30», «6», «6 y media», «7 menos cuarto», «6:30 pm», «18:00», «6 de la tarde» → HH:MM */
function samTime(s) {
  let t = agNorm(s).replace(/^(a las|a la|para las|las|la)\s+/, '').trim();
  let pm = /(de la tarde|de la noche|pm|p m)\b/.test(t), am = /(de la manana|de la madrugada|am|a m)\b/.test(t);
  t = t.replace(/(de la (manana|tarde|noche|madrugada)|a m|p m|am|pm)\b/g, '').trim();
  let x = /^(\d{1,2})(?:[:.h ](\d{2}))?(?: y (media|cuarto|(\d{1,2})))?(?: menos (cuarto|(\d{1,2})))?$/.exec(t);
  if (!x) return null;
  let h = +x[1], m = x[2] ? +x[2] : 0;
  if (x[3]) m += x[3] === 'media' ? 30 : x[3] === 'cuarto' ? 15 : +x[4];
  if (x[5]) { h -= 1; m = 60 - (x[5] === 'cuarto' ? 15 : +x[6]); }
  if (pm && h < 12) h += 12; if (am && h === 12) h = 0;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)}`;
}
async function samSetAlarm(hora, opts = {}) {
  const D = DV(); const t = agTime(hora) || samTime(hora);
  if (!t) return { error: `hora no válida (“${hora}”)` };
  const days = opts.dias ? memDays(opts.dias) : null;
  if (opts.dias && !days) return { error: `días no entendidos (“${opts.dias}”)` };
  const label = String(opts.texto || 'Plan 20').slice(0, 60);
  if (!D) return { error: 'las alarmas solo se pueden poner desde la app instalada en la tablet' };
  const [h, m] = t.split(':').map(Number);
  try { await D.setAlarm({ hour: h, minute: m, label, days: (days || []).map(g => g + 1), skipUi: true }); }
  catch (e) { return { error: e.message || String(e) }; }
  commit(() => { const A = SAM(); A.alarms.push({ t: Date.now(), time: t, days: days || [], label }); A.alarms = A.alarms.slice(-20); });
  setTimeout(() => { if (typeof shieldStatus === 'function') shieldStatus(); }, 1500); // el modo dormir se entera de la nueva alarma
  return { time: t, days, label };
}
const samAlarmTxt = (r) => `${r.time}${r.days && r.days.length ? ' · ' + memDaysTxt(r.days) : ''}${r.label && r.label !== 'Plan 20' ? ' · “' + r.label + '”' : ''}`;

/* ======================================================================
   IA: herramienta "alarma" y aviso de sincronización
   ====================================================================== */
TOOLS2.push({ name: 'alarma', description: 'Pone una ALARMA de verdad en el reloj de la tablet (Samsung Reloj), sin abrirlo. Úsala cuando pida "ponme/pon una alarma", "despiértame a las…". El modo dormir se desbloquea cuando suena la alarma de la mañana. Para recordatorios de cosas agendadas usa agenda, no alarma.', input_schema: { type: 'object', properties: { hora: { type: 'string', description: 'HH:MM en 24 h' }, dias: { type: 'string', description: 'Opcional: "lunes a viernes", "todos los días"… vacío = una sola vez' }, texto: { type: 'string', description: 'Etiqueta breve de la alarma' } }, required: ['hora'] } });
const _samRun = runTool;
runTool = function (name, x, ctx) {
  if (name !== 'alarma') return _samRun(name, x, ctx);
  x = x || {};
  if (!DV()) return { result: 'NO se pudo: las alarmas solo funcionan en la app instalada en la tablet.', card: { type: 'chip', text: 'La alarma solo se puede poner desde la tablet' } };
  const t = agTime(x.hora) || samTime(x.hora || '');
  if (!t) return { result: `ERROR: hora no válida (“${x.hora}”). Usa HH:MM.` };
  if (x.dias && !memDays(x.dias)) return { result: `ERROR: días no entendidos (“${x.dias}”).` };
  samSetAlarm(t, { dias: x.dias, texto: x.texto }).then(r => { if (r.error) { S.ai.chat.push({ role: 'assistant', local: true, t: Date.now(), content: `⚠ No pude poner la alarma en el reloj: ${r.error}` }); save(); route(); } });
  const d = x.dias ? memDays(x.dias) : null;
  return { result: `Alarma enviada al reloj de la tablet: ${t}${d ? ' (' + memDaysTxt(d) + ')' : ' (una vez)'}.`, card: { type: 'chip', text: `⏰ Alarma en el reloj de la tablet: ${t}${d ? ' · ' + memDaysTxt(d) : ''}` } };
};
const _samRules = agentRules;
agentRules = function () {
  return _samRules() + `
- TABLET SAMSUNG: ${SAM().cal ? `lo que guardas con agenda, horario o fecha_importante se copia solo a Samsung Calendar (${SAM().calName}); no hace falta nada más.` : 'la copia a Samsung Calendar está apagada (se activa en Más → Agenda → Samsung Calendar).'} Para "ponme una alarma" usa la herramienta alarma (crea la alarma en el reloj de la tablet). El modo dormir empieza a las ${SLC().start} y termina ${SLC().endMode === 'alarm' ? 'cuando suena la alarma de la tablet' : 'a las ' + SLC().end}.`;
};

/* ---------- Órdenes sin IA: «ponme una alarma a las 6:30» ---------- */
const _samCmd = bjCommand;
bjCommand = function (text) {
  const t = bjNorm(text);
  const x = /^(?:ponme|pon|programa|programame|crea|creame|activa|configura)(?: una| la| mi)? alarma(?: para| a)?(?: las| la)? (.+?)(?: (todos los dias|de lunes a viernes|entre semana|los fines de semana|fines de semana))?$/.exec(t) || /^(?:despiertame|levantame)(?: manana)?(?: a| para)?(?: las| la)? (.+?)(?: (todos los dias|de lunes a viernes|entre semana|los fines de semana|fines de semana))?$/.exec(t);
  if (x) {
    const hora = samTime(x[1].replace(/ ?manana$/, '').replace(/^manana /, ''));
    if (!hora) return { text: `No entendí la hora «${x[1]}». Dímelo así: «ponme una alarma a las 6:30».` };
    if (!DV()) return { text: 'Las alarmas del reloj solo se pueden poner desde la app instalada en la tablet.' };
    const days = x[2] ? memDays(x[2].replace(/^(de |los )/, '')) : null;
    return { text: `⏰ Listo: pongo una alarma a las **${hora}**${days ? ` (${memDaysTxt(days)})` : ''} en el reloj de la tablet.${SLC().on && SLC().endMode === 'alarm' ? ' El modo dormir se desbloquea cuando suene.' : ''}`, after: () => samSetAlarm(hora, { dias: days, texto: 'Plan 20' }).then(r => { if (r.error) errorBox('Alarma', r.error); }) };
  }
  if (/^(sincroniza|sincronizar|copia|pasa)( la agenda| mi agenda)?( a| con| al)? (samsung|el calendario|samsung calendar|calendario de samsung)$/.test(t)) {
    if (!DV()) return { text: 'Samsung Calendar solo se puede usar desde la app instalada en la tablet.' };
    return { text: SAM().cal ? `Sincronizando con **${SAM().calName}**…` : 'Activo la copia a Samsung Calendar…', after: () => (SAM().cal ? samSync() : samEnable()).then(r => toast(r && r.r ? `Samsung Calendar: ${r.cal.name}` : 'Sincronizado')).catch(e => errorBox('Samsung Calendar', e.message)) };
  }
  return _samCmd(text);
};

/* ======================================================================
   INTERFAZ: Agenda → Samsung Calendar
   ====================================================================== */
function samCard() {
  const A = SAM(), nat = !!DV(), n = Object.keys(A.map).length;
  return `<div class="card c12" id="samcard"><div class="row between"><h3 style="margin:0">${ic('cal', 20)} Samsung Calendar</h3><div class="seg"><button data-a="samon" data-x="1" class="${A.cal ? 'on' : ''}" ${nat ? '' : 'disabled'}>Copiar</button><button data-a="samon" data-x="0" class="${!A.cal ? 'on' : ''}">No copiar</button></div></div>
    <p class="small" style="margin-top:8px">${A.cal ? `Lo que se agenda en Plan 20 (agenda, horarios fijos y cumpleaños) aparece también en <b>${esc(A.calName)}</b>. Si lo cambias o borras aquí, también allí. ${n} evento${n === 1 ? '' : 's'} copiado${n === 1 ? '' : 's'}.` : nat ? 'Actívalo para que todo lo que agendes con el asistente aparezca también en el calendario de Samsung.' : 'Solo funciona en la app instalada en la tablet.'}</p>
    ${A.cal ? `<div class="row"><button class="btn" data-a="samcal">Cambiar calendario</button><button class="btn" data-a="samsync">Sincronizar ahora</button><button class="btn ghost" data-a="samoff">Dejar de copiar y quitar lo copiado</button></div>` : ''}
    <p class="small muted" style="margin-top:8px">Los avisos los sigue dando Plan 20, para que no te lleguen dos veces. Los eventos que ya tenías en Samsung Calendar no se tocan.</p></div>`;
}
wrapScreen('agenda', (h) => h.replace('<div class="grid">', '<div class="grid">' + samCard()));
async function samChooseCal() {
  let cals; try { cals = await samCalendars(); } catch (e) { return errorBox('Samsung Calendar', e.message); }
  if (!cals.length) return errorBox('Samsung Calendar', 'No encontré ningún calendario en la tablet. Abre Samsung Calendar una vez y vuelve a intentarlo.');
  const def = SAM().calId || (samPick(cals) || {}).id;
  sheet({ title: '¿En qué calendario?', sub: 'Los de tu cuenta Samsung aparecen primero', values: { cal: String(def) }, schema: [{ k: 'cal', l: 'Calendario', t: 'seg', o: cals.sort((a, b) => (/samsung/i.test(b.type) ? 1 : 0) - (/samsung/i.test(a.type) ? 1 : 0)).map(c => [String(c.id), `${c.name}${c.account && c.account !== c.name ? ' (' + c.account + ')' : ''}`]) }],
    saveLabel: 'Usar este', onSave: (v) => { samEnable(v.cal).then(r => { toast(`Copiando a ${r.cal.name}: ${r.r.created || 0} nuevo(s)`); route(); }).catch(e => errorBox('Samsung Calendar', e.message)); } });
}
wrapHandler('agenda', {
  samon: (x) => { if (x === '1') { samChooseCal(); } else { commit(() => { SAM().cal = false; }); route(); } },
  samcal: () => samChooseCal(),
  samsync: async () => { const r = await samSync(); toast(r.errors && r.errors.length ? 'Error: ' + r.errors[0] : `Listo: ${r.created || 0} nuevos, ${r.updated || 0} cambiados, ${r.deleted || 0} quitados`); route(); },
  samoff: (x, b) => { if (!b.dataset.c) { b.dataset.c = 1; b.textContent = 'Toca otra vez para quitar lo copiado'; return; } samDisable(true).then(() => { toast('Quitado de Samsung Calendar'); route(); }); }
});

/* Al desbloquear: sincroniza y lee la próxima alarma (para el modo dormir) */
const _samAfter = afterUnlock;
afterUnlock = function (first) { _samAfter(first); samSyncSoon(); if (typeof shieldStatus === 'function') shieldStatus(); };
setInterval(() => { if (unlocked) { if (typeof shieldStatus === 'function') shieldStatus(); samSyncSoon(); } }, 30 * 60000);

window.sam = { wanted: samWanted, sync: samSync, enable: samEnable, disable: samDisable, pick: samPick, time: samTime, setAlarm: samSetAlarm, init: samInit };
