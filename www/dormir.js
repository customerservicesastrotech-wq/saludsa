/* Plan 20 · v2.6 — MODO DORMIR: a tu hora de dormir la tablet queda bloqueada hasta la mañana.
   Lo hace la parte nativa (ShieldService): una pantalla oscura cubre cualquier app salvo las llamadas,
   la emergencia (siempre disponible) y las apps que permitas (reloj, música para dormir…).
   Salida anticipada opcional con tu PIN y una espera; todo se configura en Escudo → Modo dormir. */
'use strict';

const SLC = () => { if (!S.shield.cfg.sleep) S.shield.cfg.sleep = structuredClone(SH_DEF.sleep); return S.shield.cfg.sleep; };
const SL_DAYS = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];
/* ¿Hay modo dormir la noche del día k? (días según el día en que EMPIEZA la noche) */
const sleepOnDay = (k) => { const c = SLC(); return !!c.on && (!Array.isArray(c.days) || !c.days.length || c.days.includes(fromKey(k).getDay())); };
/* v2.7: la noche termina cuando suena la ALARMA de la tablet (Samsung Reloj); la hora fija queda de respaldo */
const sleepByAlarm = () => SLC().endMode === 'alarm';
const sleepAlarm = () => { const a = shStatus && +shStatus.nextAlarm; return a && a > Date.now() ? a : null; };
function sleepNextEnd(now = new Date()) {
  const [h, m] = (SLC().end || '06:30').split(':').map(Number);
  const d = new Date(now); d.setHours(h, m, 0, 0); if (d <= now) d.setDate(d.getDate() + 1);
  const a = sleepAlarm();
  if (sleepByAlarm() && a && a - now.getTime() <= 16 * 3600e3) return a;
  return d.getTime();
}
/* "las 06:30 (tu alarma)" o "que suene tu alarma" */
function sleepEndTxt() {
  if (!sleepByAlarm()) return `las ${SLC().end}`;
  const a = sleepAlarm();
  return a && a - Date.now() <= 30 * 3600e3 ? `las ${hhmm(new Date(a))} (tu alarma)` : `que suene tu alarma (si no hay, a las ${SLC().end})`;
}
/* Mensajes de la pantalla de dormir: tu mañana (agenda), tu racha y descanso */
function sleepMsgs() {
  const out = [], t = addDays(today(), new Date().getHours() < 12 ? 0 : 1);
  const its = typeof agItems === 'function' ? agItems(t).filter(x => !x.prop && x.status === 'pendiente').slice(0, 3) : [];
  if (its.length) out.push(`Mañana te espera: ${its.map(x => `${x.time || (x.moment ? AG().moments[x.moment] : '')} ${x.title}`.trim()).join(' · ')}.`.slice(0, 190));
  const st = streakInfo(); if (S.ai.shareP !== false && st.cur > 0) out.push(`Llevas ${st.cur} día${st.cur === 1 ? '' : 's'} seguido${st.cur === 1 ? '' : 's'}. Dormir también suma.`);
  out.push('Hora de descansar. Lo que queda pendiente puede esperar a mañana.');
  out.push('Deja la tablet lejos de la cama, baja la luz y respira lento: inhala 4, sostén 4, exhala 6.');
  out.push(`La tablet vuelve a estar disponible cuando suene tu alarma. Descansar es parte del plan.`.replace('cuando suene tu alarma', sleepByAlarm() ? 'cuando suene tu alarma' : 'a las ' + SLC().end));
  return out.map(m => m.slice(0, 200));
}
/* Configuración que recibe la parte nativa (el PIN viaja como hash, igual que se guarda en la app) */
function sleepNative() {
  const c = SLC();
  return Object.assign({}, c, { pinHash: c.pinExit ? S.settings.pinHash : '', pinSalt: c.pinExit ? S.settings.salt : '', messages: sleepMsgs() });
}
function sleepEvText(e) {
  if (e.kind === 'sleep') return `Modo dormir activado hasta las ${e.until ? hhmm(new Date(e.until)) : SLC().end}`;
  if (e.kind === 'sleep_exit') return `Saliste del modo dormir con tu PIN (${e.minutes || 15} min)`;
  if (e.kind === 'sleep_emergency') return 'Botón de emergencia en modo dormir';
  return 'Modo dormir';
}
async function sleepNow() {
  const SH = SHN();
  if (!SH || !SH.sleepNow) return errorBox('Modo dormir', 'El modo dormir solo funciona en la app instalada en la tablet.');
  const st = await shieldStatus();
  if (st && !st.overlay) { tab = 'escudo'; route(); return errorBox('Falta un permiso', 'Para bloquear la pantalla necesito “Mostrar sobre otras apps”. Concédelo en Escudo → Permisos.'); }
  try { await syncShield(); const r = await SH.sleepNow({ until: sleepByAlarm() ? 0 : sleepNextEnd() }); toast(`Buenas noches. Bloqueada hasta las ${hhmm(new Date((r && r.until) || sleepNextEnd()))}`); }
  catch (e) { errorBox('Modo dormir', e.message || String(e)); }
}
window.sleepNow = sleepNow;
/* Aviso 10 min antes de la hora de dormir (una notificación semanal por cada día elegido) */
async function sleepWarnSchedule() {
  const LN = P('LocalNotifications'); if (!LN) return;
  const c = SLC(), ids = [311, 312, 313, 314, 315, 316, 317];
  try {
    await LN.cancel({ notifications: ids.map(id => ({ id })) });
    if (!c.on || c.warn === false) return;
    const [h, m] = (c.start || '23:00').split(':').map(Number); const t = (h * 60 + m - 10 + 1440) % 1440;
    const days = Array.isArray(c.days) && c.days.length ? c.days : [0, 1, 2, 3, 4, 5, 6];
    let perm = await LN.checkPermissions(); if (perm.display !== 'granted') perm = await LN.requestPermissions(); if (perm.display !== 'granted') return;
    // si el aviso cae antes de medianoche es el mismo día; weekday de Capacitor: 1 = domingo
    await LN.schedule({ notifications: days.map(g => ({ id: 311 + g, title: 'Plan 20', body: `En 10 min empieza el modo dormir (${sleepByAlarm() ? 'hasta tu alarma' : 'hasta las ' + c.end})`, schedule: { on: { weekday: ((t > h * 60 + m ? g + 6 : g) % 7) + 1, hour: Math.floor(t / 60), minute: t % 60 }, allowWhileIdle: true } })) });
  } catch (e) { console.warn(e); }
}
/* En la agenda: la hora de dormir de cada noche */
function sleepVirtual(k) { return sleepOnDay(k) ? { vid: 'sleep', date: k, time: SLC().start, title: `Modo dormir · la tablet se bloquea hasta ${sleepEndTxt()}`, kind: 'sueno', note: '' } : null; }

/* ---------- Pantalla: tarjeta en Escudo ---------- */
function sleepStatusText() {
  const c = SLC(), st = shStatus;
  if (st && st.sleeping) return `Durmiendo: la tablet está bloqueada hasta las ${hhmm(new Date(st.sleepEnds))}.`;
  if (!c.on) return 'Desactivado. Puedes usar “Dormir ahora” cuando quieras.';
  return sleepOnDay(today()) ? `Esta noche: desde las ${c.start} hasta ${sleepEndTxt()}.` : `Esta noche no toca (día sin modo dormir). Próxima: ${cap1(fmt((() => { let d = addDays(today(), 1); for (let i = 0; i < 7 && !sleepOnDay(d); i++) d = addDays(d, 1); return d; })()))} a las ${c.start}.`;
}
function sleepCard() {
  const c = SLC(), nat = !!SHN();
  const chips = (c.allow || []).length ? c.allow.map(p => `<span class="pill">${esc(appLbl(p))}</span>`).join(' ') : '<span class="muted small">Ninguna (solo llamadas y emergencia)</span>';
  return `<div class="card c12 ${c.on ? 'accent' : ''}" id="sleepcard"><div class="row between"><h3 style="margin:0">🌙 Modo dormir</h3><div class="seg"><button data-a="slon" data-x="1" class="${c.on ? 'on' : ''}">Activado</button><button data-a="slon" data-x="0" class="${!c.on ? 'on' : ''}">Desactivado</button></div></div>
    <p class="small" style="margin-top:8px">A tu hora de dormir, la tablet queda <b>bloqueada hasta la mañana</b>: una pantalla oscura cubre cualquier app. Solo quedan libres las <b>llamadas entrantes</b> y un botón que abre <b>únicamente el marcador de emergencia</b>: al salir del marcador vuelve a bloquearse.</p>
    <p style="margin:6px 0 12px"><b>${esc(sleepStatusText())}</b></p>
    <div class="slgrid">
      <div class="field"><div class="lbl">Empieza</div><div class="row"><input type="time" data-sl="start" value="${c.start}" style="width:130px"></div></div>
      <div class="field"><div class="lbl">Termina</div><div class="seg"><button data-a="slend" data-x="alarm" class="${sleepByAlarm() ? 'on' : ''}">Cuando suene mi alarma</button><button data-a="slend" data-x="fixed" class="${!sleepByAlarm() ? 'on' : ''}">A una hora fija</button></div>
        <div class="row" style="margin-top:8px"><span class="small">${sleepByAlarm() ? 'Si no hay alarma, a las' : 'A las'}</span><input type="time" data-sl="end" value="${c.end}" style="width:130px"></div>
        ${sleepByAlarm() ? `<div class="hint">${sleepAlarm() ? `Próxima alarma de la tablet: <b>${esc(cap1(fmt(toKey(new Date(sleepAlarm())), true)))} ${hhmm(new Date(sleepAlarm()))}</b>.` : 'No veo ninguna alarma puesta en la tablet.'} Dile al asistente «ponme la alarma a las 6:30» o <button class="linkb" data-a="slalarms" ${P('Dispositivo') ? '' : 'disabled'}>abre el reloj</button>.</div>` : ''}</div>
      <div class="field"><div class="lbl">Días (la noche que empieza ese día)</div><div class="seg">${SL_DAYS.map(([g, l]) => `<button data-a="slday" data-x="${g}" class="${(c.days || []).includes(g) ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="field"><div class="lbl">Apps que sí puedes abrir</div>${chips} <button class="linkb" data-a="eapps" data-x="sleep">Elegir apps</button></div>
      <div class="field"><div class="lbl">Salir antes de la hora</div><div class="hint">Con tu PIN y una espera, por si de verdad la necesitas. “Nunca” deja solo llamadas y emergencia.</div><div class="seg"><button data-a="slexit" data-x="1" class="${c.pinExit ? 'on' : ''}">Con PIN y espera</button><button data-a="slexit" data-x="0" class="${!c.pinExit ? 'on' : ''}">Nunca</button></div>
        ${c.pinExit ? `<div class="row" style="margin-top:8px"><span class="small">Espera</span><div class="seg">${[30, 60, 120].map(n => `<button data-a="slwait" data-x="${n}" class="${c.wait === n ? 'on' : ''}">${n} s</button>`).join('')}</div><span class="small">Libre</span><div class="seg">${[10, 15, 30].map(n => `<button data-a="slsnz" data-x="${n}" class="${c.snooze === n ? 'on' : ''}">${n} min</button>`).join('')}</div></div>` : ''}</div>
      <div class="field"><div class="lbl">Aviso 10 min antes</div><div class="seg"><button data-a="slwarn" data-x="1" class="${c.warn !== false ? 'on' : ''}">Sí</button><button data-a="slwarn" data-x="0" class="${c.warn === false ? 'on' : ''}">No</button></div></div>
    </div>
    <div class="row" style="margin-top:6px"><button class="btn pri" data-a="slnow" ${nat ? '' : 'disabled'}>🌙 Dormir ahora (hasta ${esc(sleepEndTxt())})</button></div>
    <p class="small muted" style="margin-top:10px">También puedes decirle al asistente «me voy a dormir». Necesita los permisos de abajo (sobre todo “Mostrar sobre otras apps”; con “Datos de uso” reconoce las apps permitidas). Límite honesto: Android no deja que una app normal bloquee sus propios Ajustes; el modo dormir es una barrera fuerte, no un candado imposible.</p></div>`;
}
wrapScreen('escudo', (h) => h.replace('<div class="card c6"><h3>1 · Permisos', sleepCard() + '<div class="card c6"><h3>1 · Permisos'));
wrapHandler('escudo', {
  slon: (x) => slSet(c => { c.on = x === '1'; }, x === '1' ? 'Modo dormir activado' : 'Modo dormir desactivado'),
  slday: (x) => slSet(c => { const g = +x, d = new Set(c.days || []); d.has(g) ? d.delete(g) : d.add(g); c.days = [...d].sort(); }),
  slexit: (x) => slSet(c => { c.pinExit = x === '1'; }),
  slwait: (x) => slSet(c => { c.wait = +x; }),
  slsnz: (x) => slSet(c => { c.snooze = +x; }),
  slwarn: (x) => slSet(c => { c.warn = x === '1'; }),
  slend: (x) => slSet(c => { c.endMode = x === 'alarm' ? 'alarm' : 'fixed'; }),
  slalarms: () => { const D = P('Dispositivo'); if (D) D.showAlarms().catch(() => toast('No pude abrir el reloj')); },
  slnow: () => sleepNow()
}, (m) => m.querySelectorAll('input[data-sl]').forEach(inp => inp.addEventListener('change', () => { if (hm2min(inp.value) == null) return; slSet(c => { c[inp.dataset.sl] = inp.value; }, 'Horario guardado'); })));
function slSet(fn, msg) { if (commit(() => fn(SLC()))) { route(); syncShield(); sleepWarnSchedule(); if (typeof agSchedule === 'function') agSchedule(); if (msg) toast(msg); } }

/* ---------- Inicio: botón “Dormir” por la noche ---------- */
wrapScreen('hoy', (h) => {
  const hr = new Date().getHours();
  if (!SHN() || !(hr >= 20 || hr < 5)) return h;
  return h.replace(/(data-a="lock5"[^>]*>[\s\S]*?<\/button>)/, `$1<button class="btn" data-a="slnowq">🌙 Dormir</button>`);
});
wrapHandler('hoy', { slnowq: () => sleepNow() });

/* ---------- Órdenes: «me voy a dormir» ---------- */
const _slCmd = bjCommand;
bjCommand = function (text) {
  const t = bjNorm(text);
  const direct = /^(me voy a dormir|ya me voy a dormir|voy a dormir|a dormir|modo dormir( ahora)?|activa el modo dormir|(si )?bloquea (la tablet )?hasta (manana|la manana))$/.test(t);
  if (direct) {
    if (!SHN()) return { text: 'El modo dormir solo funciona en la app instalada en la tablet.' };
    const until = sleepNextEnd(), hr = new Date().getHours(), [sh] = (SLC().start || '23:00').split(':').map(Number);
    const evening = hr >= Math.max(0, sh - 3) || hr < 5;
    if (!evening && !/bloquea/.test(t)) return { text: `Son las ${hhmm()}. Si te vas a dormir ya, bloqueo la tablet hasta las **${hhmm(new Date(until))}** de mañana. ¿Lo hago?`, card: { type: 'quick', items: ['Sí, bloquea hasta mañana', 'No, solo una siesta'] } };
    return { text: `Buenas noches. Bloqueo la tablet hasta las **${hhmm(new Date(until))}**${sleepByAlarm() && sleepAlarm() ? ' (cuando suena tu alarma)' : ''}. Descansa.`, after: () => setTimeout(() => sleepNow(), 2500) };
  }
  return _slCmd(text);
};

/* Al desbloquear: aviso de la hora de dormir al día */
const _slAfter = afterUnlock;
afterUnlock = function (first) { _slAfter(first); if (first) sleepWarnSchedule(); };
window.sleep = { native: sleepNative, nextEnd: sleepNextEnd, endTxt: sleepEndTxt, byAlarm: sleepByAlarm, onDay: sleepOnDay, msgs: sleepMsgs, warn: sleepWarnSchedule, virtual: sleepVirtual };
