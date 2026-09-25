/* Plan 20 · v2.3 — Escudo: frena la tablet en las horas de riesgo.
   - Nativo (ShieldPlugin/ShieldService): vigila SOLO qué app está delante y cuánto rato, y muestra
     una pausa de pantalla completa de N minutos que no se puede cerrar antes.
   - Aquí: configuración, mensajes personalizados, ventanas de riesgo según tu historial,
     guía del filtro DNS, y el asistente pregunta qué pasó después de cada pausa. */
'use strict';

const SHN = () => P('Shield');
const BROWSERS = ['com.android.chrome', 'com.sec.android.app.sbrowser', 'org.mozilla.firefox', 'com.opera.browser', 'com.opera.mini.native', 'com.microsoft.emmx', 'com.brave.browser', 'com.duckduckgo.mobile.android', 'com.kiwibrowser.browser', 'com.vivaldi.browser'];
const WATCH_DEF = ['com.google.android.youtube', 'com.instagram.android', 'com.zhiliaoapp.musically', 'com.twitter.android', 'com.reddit.frontpage', 'org.telegram.messenger', 'com.google.android.googlequicksearchbox'];
const KNOWN_LBL = { 'com.android.chrome': 'Chrome', 'com.sec.android.app.sbrowser': 'Samsung Internet', 'org.mozilla.firefox': 'Firefox', 'com.opera.browser': 'Opera', 'com.opera.mini.native': 'Opera Mini', 'com.microsoft.emmx': 'Edge', 'com.brave.browser': 'Brave', 'com.duckduckgo.mobile.android': 'DuckDuckGo', 'com.kiwibrowser.browser': 'Kiwi', 'com.vivaldi.browser': 'Vivaldi', 'com.google.android.youtube': 'YouTube', 'com.instagram.android': 'Instagram', 'com.zhiliaoapp.musically': 'TikTok', 'com.twitter.android': 'X', 'com.reddit.frontpage': 'Reddit', 'org.telegram.messenger': 'Telegram', 'com.google.android.googlequicksearchbox': 'Google' };
const DNS_HOST = 'family.cloudflare-dns.com';
const SH_DEF = { enabled: false, fixedOn: true, start: '22:30', end: '06:00', riskOn: true, minutes: 5, graceMin: 10, apps: BROWSERS.slice(), watch: WATCH_DEF.slice(), watchMin: 20,
  sleep: { on: true, start: '22:30', end: '06:30', endMode: 'alarm', days: [0, 1, 2, 3, 4, 5, 6], allow: [], pinExit: false, wait: 60, snooze: 15, warn: true } };

DEFAULT.shield = { cfg: structuredClone(SH_DEF), events: [], usage: {}, labels: {} };
S.shield = Object.assign({ cfg: {}, events: [], usage: {}, labels: {} }, S.shield || {});
S.shield.cfg = Object.assign(structuredClone(SH_DEF), S.shield.cfg || {});
S.shield.cfg.sleep = Object.assign(structuredClone(SH_DEF.sleep), S.shield.cfg.sleep || {});
/* v2.7: el modo dormir queda automático todas las noches a las 22:30 hasta que suene la alarma de la tablet, sin salida con PIN (se puede cambiar en Escudo → Modo dormir) */
if (!S.shield.cfg.sleep.v27) Object.assign(S.shield.cfg.sleep, { on: true, start: '22:30', endMode: 'alarm', pinExit: false, v27: true });

const appLbl = (pkg) => (S.shield.labels || {})[pkg] || KNOWN_LBL[pkg] || (pkg || '').split('.').pop();
const hm2min = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const min2hm = (x) => { x = ((x % 1440) + 1440) % 1440; return `${pad2(Math.floor(x / 60))}:${pad2(x % 60)}`; };
const nightOf = (t) => { const d = new Date(t - 6 * 3600e3); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const fmtMs = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? '<1 min' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim(); };

/* ---------- Ventanas de riesgo: salen SOLO de tu historial (hora típica de tus episodios) ---------- */
function riskWindows() {
  const out = [], base = today();
  for (let i = 0; i < 3; i++) {
    const k = addDays(base, i), r = riskToday(k), md = (S.mind.days || {})[k];
    const hora = (i === 0 && md && md.risk && md.risk.hora) || r.hora;
    if (!hora || !r.level) continue;
    const c = hm2min(hora); if (c == null) continue;
    const d = fromKey(k); d.setHours(0, 0, 0, 0);
    const from = d.getTime() + (c - 60) * 60000, to = d.getTime() + (c + 90) * 60000;
    if (to > Date.now()) out.push({ from, to, label: `${min2hm(c - 60)}–${min2hm(c + 90)}`, day: k });
  }
  return out;
}

/* ---------- Mensajes de la pausa: tus palabras, tus datos y el protocolo del manual (sección 23) ---------- */
function shieldMessages() {
  const pr = S.profile || {}, st = streakInfo(), out = [];
  const alts = (pr.alternativas || []).filter(Boolean);
  out.push('Tengo un impulso; puedo elegir el siguiente paso.');
  if (pr.porque && pr.porque.trim()) out.push(`Tú escribiste: “${pr.porque.trim().slice(0, 150)}”`);
  if (st.cur > 0) out.push(`Llevas ${st.cur} día${st.cur === 1 ? '' : 's'} seguido${st.cur === 1 ? '' : 's'}.${st.best > st.cur ? ` Tu récord es ${st.best}.` : ' Es tu récord.'} Estos minutos también cuentan.`);
  else if (st.best > 0) out.push(`Tu récord es ${st.best} días. Hoy puede ser el día 1 de la siguiente racha.`);
  out.push('Deja la tablet en otro lugar. Si estás en la cama, levántate y cambia de espacio.');
  if (alts.length) out.push(`Tu respuesta elegida: ${alts.slice(0, 2).join(' o ')}. Hazla unos 10 minutos.`);
  else out.push('Elige algo de unos 10 minutos: tarea doméstica corta, lectura, descanso fuera de la cama o caminar suave.');
  out.push('Nota los pies apoyados. Nombra lo que ves y oyes. Respira de forma cómoda.');
  const r = riskToday();
  if (r.hora) out.push(`Tus episodios suelen ocurrir hacia las ${r.hora}. Este es ese momento: ya lo reconociste.`);
  const eps = episodes(); const lastC = eps.slice().reverse().find(e => e.cambio);
  if (lastC) out.push(`La última vez decidiste cambiar esto: “${lastC.cambio.slice(0, 120)}”.`);
  (S.mind.mem || []).filter(m => m.cat === 'riesgo').slice(-2).forEach(m => out.push(`Me contaste: ${m.text.slice(0, 140)}`));
  out.push('Los impulsos no necesitan desaparecer para que actúes conforme a tu meta.');
  out.push('Si sigue, repite la pausa o cambia de alternativa. No tienes que ganarle a toda la noche: solo a estos minutos.');
  return out.map(m => m.slice(0, 200));
}

/* ---------- Sincronizar con la parte nativa ---------- */
async function syncShield() {
  const SH = SHN(); if (!SH) return false;
  const cfg = Object.assign({}, S.shield.cfg, { riskWindows: riskWindows(), messages: shieldMessages(), name: '' });
  if (typeof sleepNative === 'function') cfg.sleep = sleepNative();
  try { await SH.configure({ config: cfg }); return true; } catch (e) { errorBox('Escudo', e.message || String(e)); return false; }
}
let shStatus = null;
async function shieldStatus() { const SH = SHN(); if (!SH) return null; try { shStatus = await SH.getStatus(); } catch (e) { shStatus = null; } return shStatus; }

/* Trae de la tablet las pausas y los minutos (qué app y cuánto rato; nada de contenido) */
async function pullShield() {
  const SH = SHN(); if (!SH) return 0;
  let r; try { r = await SH.popEvents(); } catch (e) { return 0; }
  let fresh = 0;
  commit(() => {
    (r.events || []).forEach(ev => {
      if (!ev || !ev.id) return;
      const old = S.shield.events.find(e => e.id === ev.id);
      if (old) Object.assign(old, ev); else { S.shield.events.push(Object.assign({ asked: false }, ev)); fresh++; }
      if (ev.pkg && ev.app) S.shield.labels[ev.pkg] = ev.app;
    });
    Object.entries(r.usage || {}).forEach(([night, apps]) => {
      const u = S.shield.usage[night] = S.shield.usage[night] || {};
      Object.entries(apps || {}).forEach(([pkg, ms]) => { u[pkg] = (u[pkg] || 0) + (+ms || 0); });
    });
    S.shield.events = S.shield.events.slice(-300);
    const nights = Object.keys(S.shield.usage).sort(); nights.slice(0, Math.max(0, nights.length - 60)).forEach(n => delete S.shield.usage[n]);
    askAboutShield();
  });
  return fresh;
}

/* El asistente pregunta qué pasó después de una pausa (sin coste de IA) */
function askAboutShield() {
  const pend = S.shield.events.filter(e => !e.asked && (e.end || e.done) && e.kind !== 'test' && !/^sleep/.test(e.kind || '') && Date.now() - e.t < 3 * 864e5);
  if (!pend.length) return;
  pend.forEach(e => { e.asked = true; });
  const e = pend[pend.length - 1], t = new Date(e.t);
  const when = `${nightOf(e.t) === nightOf(Date.now()) ? (t.getHours() < 6 || t.getHours() >= 18 ? 'Esta noche' : 'Hoy') : 'Anoche'} a las ${hhmm(t)}`;
  const what = e.kind === 'manual' ? 'pediste una pausa' : e.kind === 'time' ? `te frené tras ${fmtMs(e.inAppMs || 0)} en ${appLbl(e.pkg)}` : `frené ${appLbl(e.pkg)}`;
  const more = pend.length > 1 ? ` (${pend.length} pausas en total)` : '';
  S.ai.chat.push({ role: 'assistant', local: true, t: Date.now(), content: `${when} ${what}${more}. ${e.done || e.end ? `Completaste la pausa de ${e.minutes} min${e.extended ? ' y pediste 5 más' : ''}.` : ''} ¿Qué pasó después?`, cards: [{ type: 'shieldq', id: e.id, night: nightOf(e.t) }] });
}

async function shieldLock(min = S.shield.cfg.minutes || 5, kind = 'manual') {
  const SH = SHN();
  if (!SH) return errorBox('Escudo', 'La pausa de pantalla solo funciona en la app instalada en la tablet.');
  const st = await shieldStatus();
  if (st && !st.overlay) { tab = 'escudo'; route(); return errorBox('Falta un permiso', 'Para bloquear la pantalla necesito “Mostrar sobre otras apps”. Concédelo en el paso 2 de Escudo.'); }
  try { await SH.lockNow({ minutes: min, kind }); } catch (e) { errorBox('Escudo', e.message || String(e)); }
}
window.shieldLock = shieldLock;

/* ======================================================================
   PANTALLA ESCUDO
   ====================================================================== */
IC.shield = '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/>';
function guardText(cfg, st) {
  if (!cfg.enabled) return 'Apagado. Nada se vigila.';
  if (st && st.locked) return 'Pausa en curso.';
  const now = new Date(), t = now.getHours() * 60 + now.getMinutes(), a = hm2min(cfg.start), b = hm2min(cfg.end);
  const inFix = cfg.fixedOn && a != null && b != null && a !== b && (a < b ? t >= a && t < b : t >= a || t < b);
  const rw = cfg.riskOn ? riskWindows() : [];
  const inRisk = rw.find(w => Date.now() >= w.from && Date.now() < w.to);
  if (inFix) return `En guardia ahora · franja fija hasta las ${cfg.end}.`;
  if (inRisk) return `En guardia ahora · franja de riesgo ${inRisk.label}.`;
  const next = [cfg.fixedOn ? `franja fija desde las ${cfg.start}` : '', rw.length ? `riesgo ${rw[0].day === today() ? 'hoy' : fmt(rw[0].day)} ${rw[0].label}` : ''].filter(Boolean);
  return next.length ? `Preparado. Próxima guardia: ${next.join(' · ')}.` : 'Encendido, pero sin franjas: activa la franja fija o espera a que tu historial muestre una hora de riesgo.';
}
function permRow(ok, title, why, act, lbl) {
  return `<div class="perm ${ok ? 'ok' : ''}"><span class="pdot">${ok ? '✓' : ''}</span><div style="flex:1"><b>${title}</b><div class="small muted">${why}</div></div>${ok ? '<span class="small muted">Listo</span>' : `<button class="btn ${act === 'pbat' ? '' : 'pri'}" data-a="${act}">${lbl}</button>`}</div>`;
}
function appChips(list) {
  return list.length ? `<div class="appl">${list.map(p => `<span class="pill">${esc(appLbl(p))}</span>`).join('')}</div>` : '<div class="small muted">Ninguna.</div>';
}
SCREENS.escudo = () => {
  const cfg = S.shield.cfg, st = shStatus, nat = !!SHN();
  const rw = riskWindows(), dnsOn = st && st.privateDns && /cloudflare-dns\.com$/i.test(st.privateDns);
  const evs = S.shield.events.slice(-8).reverse();
  const nights = Object.keys(S.shield.usage).sort().slice(-7).reverse();
  const ready = st ? st.usage && st.overlay : false;
  return `<div class="head"><div><h1>${ic('shield', 26)} Escudo</h1><div class="sub">En tus horas de riesgo, si abres una app que elegiste, la tablet queda en pausa ${cfg.minutes} minutos con mensajes para ayudarte a bajar el impulso. Solo mira qué app está abierta y cuánto rato; nunca lo que ves dentro.</div></div></div>
  ${nat ? '' : '<div class="card warn" style="margin-bottom:16px"><b>Solo en la tablet.</b> Aquí puedes ver y preparar la configuración; la protección funciona en la app instalada.</div>'}
  <div class="grid">
    <div class="card c12 ${cfg.enabled && ready ? 'accent' : ''}"><div class="row between"><h3 style="margin:0">${ic('shield', 20)} Protección</h3><div class="seg"><button data-a="son" class="${cfg.enabled ? 'on' : ''}">Encendida</button><button data-a="soff" class="${!cfg.enabled ? 'on' : ''}">Apagada</button></div></div>
      <p style="margin:12px 0 4px"><b id="sguard">${esc(guardText(cfg, st))}</b></p>
      ${cfg.enabled && st && !ready ? '<p class="small" style="color:var(--alert)">Faltan permisos (abajo): sin ellos el escudo no puede actuar.</p>' : ''}
      <div class="row" style="margin-top:12px"><button class="btn pri" data-a="snow">${ic('lock', 18)} Pausa de ${cfg.minutes} min ahora</button><button class="btn" data-a="stest">Probar (1 min)</button></div>
      <p class="small muted" style="margin-top:10px">La pausa no se puede cerrar antes de tiempo (tope de seguridad: 15 min). Si reinicias la tablet, continúa con el tiempo que faltaba.</p></div>

    <div class="card c6"><h3>1 · Permisos (una sola vez)</h3>
      ${st ? permRow(st.usage, 'Acceso a datos de uso', 'Para saber qué app está delante y cuánto rato.', 'pusage', 'Conceder') + permRow(st.overlay, 'Mostrar sobre otras apps', 'Para cubrir la pantalla durante la pausa.', 'poverlay', 'Conceder') + permRow(st.battery, 'Batería sin restricciones', 'Para que Samsung no apague el escudo por la noche.', 'pbat', 'Ajustar') : `<p class="small muted">${nat ? 'Comprobando…' : 'Disponible en la tablet.'}</p>`}
      <details class="small" style="margin-top:10px"><summary>¿Android dice “Ajuste restringido”?</summary><p>Pasa con apps instaladas desde un archivo. Abre <b>Información de la app</b> → menú <b>⋮</b> (arriba a la derecha) → <b>Permitir ajustes restringidos</b>, y vuelve a concederlo. <button class="linkb" data-a="pinfo">Abrir información de la app</button></p></details></div>

    <div class="card c6"><h3>2 · Cuándo</h3>
      <div class="field"><div class="lbl">Franja fija (cada día)</div><div class="row"><div class="seg"><button data-a="fix" data-x="1" class="${cfg.fixedOn ? 'on' : ''}">Sí</button><button data-a="fix" data-x="0" class="${!cfg.fixedOn ? 'on' : ''}">No</button></div>
        <input type="time" data-s="start" value="${cfg.start}" ${cfg.fixedOn ? '' : 'disabled'} style="width:130px"> a <input type="time" data-s="end" value="${cfg.end}" ${cfg.fixedOn ? '' : 'disabled'} style="width:130px"></div></div>
      <div class="field"><div class="lbl">Automático por riesgo</div><div class="hint">Una ventana de 1 h antes a 1 h 30 después de la hora típica de tus episodios, en los días de riesgo que calcula tu historial.</div>
        <div class="seg"><button data-a="risk" data-x="1" class="${cfg.riskOn ? 'on' : ''}">Sí</button><button data-a="risk" data-x="0" class="${!cfg.riskOn ? 'on' : ''}">No</button></div>
        <div class="small" style="margin-top:8px">${rw.length ? 'Próximas: ' + rw.map(w => `<b>${w.day === today() ? 'hoy' : esc(fmt(w.day))} ${w.label}</b>`).join(' · ') : '<span class="muted">Aún no hay una hora de riesgo en tu historial (hacen falta al menos 2 episodios con hora). Mientras, cubre la franja fija.</span>'}</div></div></div>

    <div class="card c6"><h3>3 · Qué apps</h3>
      <div class="field"><div class="lbl">Frenar al abrir</div>${appChips(cfg.apps)}<button class="linkb" data-a="eapps" data-x="apps">Elegir apps</button></div>
      <div class="field"><div class="lbl">Frenar si pasas mucho rato</div>${appChips(cfg.watch)}<button class="linkb" data-a="eapps" data-x="watch">Elegir apps</button>
        <div class="seg" style="margin-top:8px">${[10, 20, 30, 45].map(n => `<button data-a="wmin" data-x="${n}" class="${cfg.watchMin === n ? 'on' : ''}">${n} min</button>`).join('')}</div></div></div>

    <div class="card c6"><h3>4 · La pausa</h3>
      <div class="field"><div class="lbl">Duración</div><div class="seg">${[3, 5, 10].map(n => `<button data-a="dur" data-x="${n}" class="${cfg.minutes === n ? 'on' : ''}">${n} min</button>`).join('')}</div></div>
      <div class="field"><div class="lbl">Después de una pausa</div><div class="hint">Estricto: cada vez que vuelvas a abrir una app frenada dentro de la franja, otra pausa.</div><div class="seg">${[[0, 'Estricto'], [10, '10 min libres'], [30, '30 min libres']].map(o => `<button data-a="grace" data-x="${o[0]}" class="${cfg.graceMin === o[0] ? 'on' : ''}">${o[1]}</button>`).join('')}</div></div>
      <p class="small muted">Durante la pausa: cuenta atrás, respiración guiada y ${shieldMessages().length} mensajes tuyos que rotan (tu “porqué”, tu racha, tu respuesta elegida y el protocolo del manual). Al terminar: “Hablar con Plan 20”, “Ir al inicio” o “5 minutos más”.</p></div>

    <div class="card c12 ${dnsOn ? 'accent' : ''}"><div class="row between"><h3 style="margin:0">${ic('shield', 20)} Filtro de contenido adulto (DNS privado)</h3>${st ? `<span class="pill ${dnsOn ? 'ok' : 'pend'}">${dnsOn ? 'Activo' : st.privateDns ? 'Otro DNS: ' + esc(st.privateDns) : 'No activo'}</span>` : ''}</div>
      <p class="small">Bloquea sitios para adultos en <b>todos</b> los navegadores y apps de la tablet, a cualquier hora y en cualquier Wi-Fi. Es gratuito (Cloudflare para familias) y no instala nada.</p>
      <ol class="dnsl">
        <li>Copia este nombre: <code class="dns">${DNS_HOST}</code> <button class="btn" data-a="dcopy">Copiar</button></li>
        <li><button class="btn pri" data-a="dopen">Abrir Ajustes</button> y ve a <b>Conexiones → Más ajustes de conexión → DNS privado</b>.</li>
        <li>Elige <b>Nombre de host del proveedor de DNS privado</b>, pega el nombre y pulsa <b>Guardar</b>.</li>
        <li>Vuelve aquí: el recuadro dirá <b>Activo</b>.</li></ol>
      <p class="small muted">Límites honestos: se puede desactivar en Ajustes, y una VPN o un navegador con su propio “DNS seguro” pueden saltárselo (si tu navegador tiene esa opción, déjala en “proveedor actual” o apagada). Es una barrera más, no un muro: por eso va junto con la pausa.</p></div>

    <div class="card c12"><h3>Lo que registró</h3>
      ${evs.length ? evs.map(e => `<div class="logitem"><div><div class="t">${esc(fmt(nightOf(e.t)))} · ${hhmm(new Date(e.t))} — ${/^sleep/.test(e.kind || '') ? sleepEvText(e) : e.kind === 'manual' ? 'Pausa pedida por ti' : e.kind === 'test' ? 'Prueba' : e.kind === 'time' ? `Rato largo en ${esc(appLbl(e.pkg))} (${fmtMs(e.inAppMs || 0)})` : `Abriste ${esc(appLbl(e.pkg))}`}</div><div class="d">${e.minutes} min${e.extended ? ' + 5' : ''} · ${e.end || e.done ? 'completada' : 'en curso'}${e.choice === 'talk' ? ' · hablaste con Plan 20' : ''}${e.outcome ? ' · ' + { ok: 'lo superaste', relapse: 'hubo recaída', other: 'era otra cosa' }[e.outcome] : ''}</div></div></div>`).join('') : '<div class="small muted">Aún nada.</div>'}
      ${nights.length ? `<div class="kicker" style="margin-top:14px">Tiempo en esas apps durante la guardia</div>${nights.map(n => `<div class="small">${esc(fmt(n))}: ${Object.entries(S.shield.usage[n]).sort((a, b) => b[1] - a[1]).map(([p, ms]) => `${esc(appLbl(p))} ${fmtMs(ms)}`).join(' · ')}</div>`).join('')}` : ''}</div>
  </div>`;
};
HANDLERS.escudo = (m) => {
  const set = (fn) => { if (commit(() => fn(S.shield.cfg))) { route(); syncShield(); } };
  onAct(m, {
    son: async () => {
      set(c => { c.enabled = true; });
      const st = await shieldStatus(); if (st && (!st.usage || !st.overlay)) toast('Encendido. Falta conceder los permisos del paso 1.'); else toast('Escudo encendido');
      route();
    },
    soff: () => set(c => { c.enabled = false; }),
    snow: () => shieldLock(S.shield.cfg.minutes, 'manual'),
    stest: () => shieldLock(1, 'test'),
    pusage: () => SHN() && SHN().openUsageSettings().catch(e => errorBox('Ajustes', e.message)),
    poverlay: () => SHN() && SHN().openOverlaySettings().catch(e => errorBox('Ajustes', e.message)),
    pbat: () => SHN() && SHN().openBatterySettings().catch(e => errorBox('Ajustes', e.message)),
    pinfo: () => SHN() && SHN().openAppSettings().catch(e => errorBox('Ajustes', e.message)),
    fix: (x) => set(c => { c.fixedOn = x === '1'; }),
    risk: (x) => set(c => { c.riskOn = x === '1'; }),
    wmin: (x) => set(c => { c.watchMin = +x; }),
    dur: (x) => set(c => { c.minutes = +x; }),
    grace: (x) => set(c => { c.graceMin = +x; }),
    eapps: (x) => pickApps(x),
    dcopy: async () => { try { if (SHN()) await SHN().copyText({ text: DNS_HOST }); else await navigator.clipboard.writeText(DNS_HOST); toast('Copiado: ' + DNS_HOST); } catch (e) { toast('Mantén pulsado el nombre para copiarlo'); } },
    dopen: () => SHN() ? SHN().openDnsSettings().catch(e => errorBox('Ajustes', e.message)) : toast('Solo en la tablet')
  });
  m.querySelectorAll('input[data-s]').forEach(inp => inp.addEventListener('change', () => { const v = inp.value; if (hm2min(v) == null) return; set(c => { c[inp.dataset.s] = v; }); }));
  const before = JSON.stringify(shStatus);
  shieldStatus().then(st => { if (tab === 'escudo' && JSON.stringify(st) !== before && !sheetOpen) route(); });
};

async function pickApps(which) {
  let apps = [];
  if (SHN()) { try { apps = (await SHN().listApps()).apps || []; } catch (e) {} }
  if (!apps.length) apps = Object.keys(KNOWN_LBL).map(p => ({ pkg: p, label: KNOWN_LBL[p] }));
  apps.forEach(a => { S.shield.labels[a.pkg] = a.label; });
  const listOf = () => which === 'sleep' ? S.shield.cfg.sleep.allow : S.shield.cfg[which];
  const cur = new Set(listOf());
  const known = which === 'apps' ? BROWSERS : which === 'sleep' ? ['com.sec.android.app.clockpackage', 'com.google.android.deskclock', 'com.spotify.music', 'com.samsung.android.app.notes'] : WATCH_DEF;
  apps.sort((a, b) => (known.includes(b.pkg) - known.includes(a.pkg)) || a.label.localeCompare(b.label));
  sheet({
    title: which === 'apps' ? 'Frenar al abrir' : which === 'sleep' ? 'Apps permitidas al dormir' : 'Frenar si pasas mucho rato',
    sub: which === 'sleep' ? 'En modo dormir solo podrás abrir estas apps (p. ej. reloj/alarma o música para dormir). Las llamadas entrantes y el marcador de emergencia siguen funcionando; todo lo demás queda bloqueado.' : which === 'apps' ? 'Durante la guardia, abrir una de estas apps inicia la pausa. Recomendado: todos los navegadores.' : `Durante la guardia, pasar más de ${S.shield.cfg.watchMin} min seguidos en una de estas apps inicia la pausa.`,
    body: () => `<input type="text" id="apq" placeholder="Buscar app" style="width:100%;margin-bottom:12px"><div class="apick">${apps.map(a => `<label class="apr" data-l="${esc(a.label.toLowerCase())}"><input type="checkbox" value="${esc(a.pkg)}" ${cur.has(a.pkg) ? 'checked' : ''}> <span>${esc(a.label)}</span>${known.includes(a.pkg) ? '<span class="pill">sugerida</span>' : ''}</label>`).join('')}</div>`,
    saveLabel: 'Guardar',
    onSave: () => {
      const sel = [...document.querySelectorAll('.apick input:checked')].map(i => i.value);
      if (commit(() => { if (which === 'sleep') S.shield.cfg.sleep.allow = sel.slice(0, 6); else S.shield.cfg[which] = sel; })) { closeSheet(true); route(); syncShield(); }
      return false;
    }
  });
  const q = $('#apq'); if (q) q.addEventListener('input', () => { const t = q.value.toLowerCase(); document.querySelectorAll('.apr').forEach(r => { r.style.display = r.dataset.l.includes(t) ? '' : 'none'; }); });
}

/* ======================================================================
   INTEGRACIÓN CON EL ASISTENTE
   ====================================================================== */
/* Tarjeta tras una pausa: tres respuestas locales, sin gastar IA */
const _cardHTML = cardHTML;
cardHTML = function (c, mi, ci) {
  if (c && c.type === 'shieldq') {
    const ev = S.shield.events.find(e => e.id === c.id);
    if (ev && ev.outcome) return `<div class="acard chip">${{ ok: 'Anotado: lo superaste.', relapse: 'Anotado: hubo recaída.', other: 'Anotado: era otra cosa.' }[ev.outcome]}</div>`;
    return `<div class="qrow"><button class="qchip" data-a="shq" data-x="${c.id}|ok">Lo superé</button><button class="qchip" data-a="shq" data-x="${c.id}|relapse">Hubo recaída</button><button class="qchip" data-a="shq" data-x="${c.id}|other">Era otra cosa</button><button class="qchip" data-a="shq" data-x="${c.id}|talk">Te cuento</button></div>`;
  }
  if (c && c.type === 'view' && c.vista === 'escudo') return `<div class="acard"><button class="btn" data-a="open" data-x="escudo">${ic('shield', 18)} Abrir Escudo</button></div>`;
  return _cardHTML(c, mi, ci);
};
wrapHandler('hoy', {
  shq: (x) => {
    const [id, out] = x.split('|'); const ev = S.shield.events.find(e => e.id === id); if (!ev) return;
    if (out === 'talk') { composerDraft = 'Sobre la pausa del escudo: '; homeView = 'chat'; route(); const t = $('#cin'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } return; }
    const k = ev.t ? (() => { const d = new Date(ev.t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; })() : today();
    commit(() => {
      ev.outcome = out;
      if (out === 'ok') S.ai.chat.push({ role: 'assistant', local: true, t: Date.now(), content: `Bien. Frenaste a tiempo${ev.kind === 'manual' ? ' y lo pediste tú' : ''}. Eso es exactamente lo que el plan busca: reconocer antes y responder.` });
      if (out === 'other') S.ai.chat.push({ role: 'assistant', local: true, t: Date.now(), content: 'Entendido. Si esa app te frena por cosas normales a esa hora, cámbiala de lista o ajusta la franja en Escudo.', cards: [{ type: 'view', vista: 'escudo' }] });
    });
    if (out === 'relapse') { openLog('impulso', { date: k >= S.settings.start ? k : today(), res: 'si', hora: hhmm(new Date(ev.t)) }); return; }
    route();
  },
  lock5: () => shieldLock(S.shield.cfg.minutes, 'manual')
});

/* Botón en Inicio junto a “Tengo un impulso” */
const _hoyScreen = SCREENS.hoy;
SCREENS.hoy = () => _hoyScreen().replace(`${ic('wave', 18)} Tengo un impulso</button></div>`, `${ic('wave', 18)} Tengo un impulso</button>${SHN() ? `<button class="btn" data-a="lock5" title="Bloquea la tablet ${S.shield.cfg.minutes} minutos">${ic('shield', 18)} Pausa ${S.shield.cfg.minutes} min</button>` : ''}</div>`);

/* Herramienta para la IA */
TOOLS2.push({ name: 'escudo', description: 'Escudo de la tablet. "estado": cómo está configurado y las pausas recientes. "pausa_ahora": bloquea la pantalla N minutos (úsalo SOLO si la persona lo pide o acepta tu ofrecimiento). "abrir": muestra la pantalla Escudo. "dormir": activa el modo dormir (la tablet queda bloqueada hasta su hora de despertar); úsalo cuando diga que se va a dormir o lo pida.', input_schema: { type: 'object', properties: { accion: { type: 'string', enum: ['estado', 'pausa_ahora', 'abrir', 'dormir'] }, minutos: { type: 'number' } }, required: ['accion'] } });
QUERY_TOOLS.push('escudo');
const _runTool = runTool;
runTool = function (name, x, ctx) {
  if (name !== 'escudo') return _runTool(name, x, ctx);
  x = x || {};
  if (x.accion === 'pausa_ahora') { const n = Math.max(1, Math.min(15, Math.round(+x.minutos || S.shield.cfg.minutes || 5))); setTimeout(() => shieldLock(n, 'manual'), 1500); return { result: `Pausa de ${n} min activándose.`, card: { type: 'chip', text: `Pausa de ${n} min en marcha` } }; }
  if (x.accion === 'abrir') return { result: 'Mostrado.', card: { type: 'view', vista: 'escudo' } };
  if (x.accion === 'dormir') { if (!SHN()) return { result: 'El modo dormir solo funciona en la tablet.' }; const until = sleepNextEnd(); setTimeout(() => sleepNow(), 2500); return { result: `Modo dormir activándose hasta las ${hhmm(new Date(until))}.`, card: { type: 'chip', text: `🌙 Modo dormir hasta las ${hhmm(new Date(until))}` } }; }
  return { result: shieldSummary() };
};
function shieldSummary() {
  const c = S.shield.cfg, rw = riskWindows();
  const dt = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${hhmm(d)}`; };
  const ev = S.shield.events.slice(-10).map(e => `${dt(e.t)} ${/^sleep/.test(e.kind || '') ? sleepEvText(e) : e.kind === 'manual' ? 'pausa pedida' : e.kind === 'time' ? 'rato largo en ' + appLbl(e.pkg) + ' (' + fmtMs(e.inAppMs || 0) + ')' : 'abrió ' + appLbl(e.pkg)}${e.outcome ? ' → ' + { ok: 'lo superó', relapse: 'recaída', other: 'era otra cosa' }[e.outcome] : ''}`);
  const us = Object.keys(S.shield.usage).sort().slice(-5).map(n => `${n}: ` + Object.entries(S.shield.usage[n]).map(([p, ms]) => `${appLbl(p)} ${fmtMs(ms)}`).join(', '));
  return `Escudo ${c.enabled ? 'ENCENDIDO' : 'apagado'}; franja fija ${c.fixedOn ? c.start + '-' + c.end : 'no'}; automático por riesgo ${c.riskOn ? (rw.length ? rw.map(w => w.day + ' ' + w.label).join(', ') : 'sí, sin ventana aún') : 'no'}; pausa ${c.minutes} min.${ev.length ? '\nPausas recientes: ' + ev.join(' | ') : ''}${us.length ? '\nTiempo en apps vigiladas durante la guardia (por noche): ' + us.join(' | ') : ''}`;
}
const _patternsBlock = patternsBlock;
patternsBlock = function () {
  const base = _patternsBlock();
  if (!S.ai.shareP) return base;
  return base + '\n' + shieldSummary();
};
const _agentRules = agentRules;
agentRules = function () {
  return _agentRules() + `
- ESCUDO: la tablet puede bloquearse unos minutos (herramienta escudo). Si la persona dice que tiene un impulso ahora o está en su franja de riesgo, ofrece en una frase la pausa de pantalla; úsala solo si acepta o lo pide. Si hubo pausas recientes (en los patrones), pregunta con calma qué pasó después y aprende del contexto (hora, app) sin juzgar. Si no ha activado el escudo o el filtro DNS, puedes sugerirlo una vez con escudo "abrir".`;
};
TOOLS2.find(t => t.name === 'mostrar').input_schema.properties.vista.enum.push('escudo');

/* Sugerencia única en Inicio si hay episodios de noche y el escudo está apagado */
const _proactive = proactive;
proactive = function () {
  _proactive();
  const md = mindDay(today());
  if (!S.shield.cfg.enabled && !S.shield.suggested && episodes().length >= 1 && SHN() && !md.flags.shieldSug) {
    md.flags.shieldSug = 1; S.shield.suggested = Date.now();
    S.ai.chat.push({ role: 'assistant', local: true, t: Date.now(), content: 'Puedo ayudarte en el momento difícil: en tus horas de riesgo, si abres el navegador, pongo la tablet en pausa unos minutos con tus propios mensajes. También te guío para activar un filtro de contenido adulto. ¿Lo configuramos?', cards: [{ type: 'view', vista: 'escudo' }] });
    save();
  }
};

/* Menú Más y protocolo */
wrapScreen('mas', (h) => h.replace('<div class="tiles">', `<div class="tiles"><button class="tile" data-a="go" data-x="escudo">${ic('shield')}<div><b>Escudo</b><div class="muted small">${S.shield.cfg.enabled ? 'Encendido' : 'Apagado'} · pausa en horas de riesgo y filtro</div></div></button>`));
const _route2 = route;
route = function () { _route2(); if (tab === 'escudo') document.querySelectorAll('.rail button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === 'mas')); };

/* Al desbloquear: sincroniza (ventanas de riesgo y mensajes cambian con tu historial) y trae las pausas */
const _afterUnlock2 = afterUnlock;
afterUnlock = function (first) {
  _afterUnlock2(first);
  if (!S.profile) return;
  syncShield();
  pullShield().then(() => { if (!sheetOpen) route(); });
};
if (SHN()) {
  SHN().addListener('open', () => { tab = 'hoy'; homeView = 'chat'; });
  setInterval(() => { if (unlocked && S.shield.cfg.enabled) syncShield(); }, 30 * 60000); // ventanas del día siguiente
}
window.syncShield = syncShield; window.pullShield = pullShield;
