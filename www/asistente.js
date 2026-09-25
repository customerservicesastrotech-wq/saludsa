/* Plan 20 · v2.0 — Asistente personal (pantalla única, memoria, riesgo de recaída, voz)
   Se apoya en app.js (datos, validación, pantallas) y ai.js (llamada a Claude, reglas del manual). */
'use strict';

/* ======================================================================
   ESTADO DEL ASISTENTE
   ====================================================================== */
DEFAULT.mind = { mem: [], days: {} };
S.mind = Object.assign({ mem: [], days: {} }, S.mind || {});
const mindDay = (k) => { S.mind = S.mind || { mem: [], days: {} }; return (S.mind.days[k] = S.mind.days[k] || { prop: {}, int: {}, flags: {} }); };
const AREAS2 = [
  ['desayuno', 'Desayuno', 'bowl'], ['almuerzo', 'Almuerzo', 'bowl'], ['cena', 'Cena', 'bowl'],
  ['movimiento', 'Movimiento', 'walk'], ['estudio', 'Estudio', 'book'], ['metap', 'Meta P', 'wave'], ['sueno', 'Sueño', 'moon']
];
const AREA_KEYS = AREAS2.map(a => a[0]).concat(['merienda']);
const areaName = (a) => a === 'metap' ? L().meta : a === 'merienda' ? 'Merienda' : (AREAS2.find(x => x[0] === a) || [a, a])[1];
const hhmm = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const urlHour = new URLSearchParams(location.search).get('hour');
const nowH = () => urlHour != null ? +urlHour : urlDate ? 12 : new Date().getHours();

/* ======================================================================
   HISTORIAL DE LA META P: episodios, conteo, récord, riesgo
   ====================================================================== */
function episodes() {
  const out = [];
  Object.keys(S.days).sort().forEach(k => {
    const d = S.days[k]; if (!d || !d.p || d.p.res !== 'yes') return;
    const logs = S.logs.filter(l => l.date === k && l.type === 'impulso' && l.data && l.data.res === 'si');
    const lg = logs[0] ? logs[0].data : {};
    const slp = S.logs.find(l => l.date === k && l.type === 'sueno');
    out.push({ date: k, dow: fromKey(k).getDay(), hora: lg.hora || null, ctx: lg.ctx || '', falto: lg.falto || '', cambio: lg.cambio || '', sleep: slp && slp.data.horas != null ? +slp.data.horas : null, barrera: d.close && d.close.barrera });
  });
  return out;
}
/* Racha actual (días conocidos seguidos sin recaída) y récord histórico */
function streakInfo() {
  const k = today();
  const cur = calcStreak(k);
  let best = 0, run = 0;
  for (let d = S.settings.start; d <= k; d = addDays(d, 1)) { const r = S.days[d] && S.days[d].p && S.days[d].p.res; if (r === 'no') { run++; best = Math.max(best, run); } else if (d !== k) run = 0; }
  const eps = episodes();
  return { cur, best: Math.max(best, cur), total: eps.length, last: eps.length ? eps[eps.length - 1].date : null };
}
/* Motor de riesgo local: usa SOLO tu historial (sección 22-23: reconocer situaciones reales) */
function riskToday(k = today()) {
  const eps = episodes(); const reasons = []; let score = 0, hora = null;
  if (!eps.length) return { level: 0, reasons, hora, eps: 0 };
  const slp = S.logs.find(l => l.date === k && l.type === 'sueno');
  const lowSleepEps = eps.filter(e => (e.sleep != null && e.sleep < 6.5) || /cansancio/i.test(e.falto + ' ' + e.ctx)).length;
  if (slp && slp.data.horas != null && +slp.data.horas < 6.5 && lowSleepEps) { score++; reasons.push(`dormiste ${slp.data.horas} h y ${lowSleepEps === 1 ? 'uno de tus episodios coincidió' : lowSleepEps + ' de tus episodios coincidieron'} con cansancio o poco sueño`); }
  const dow = fromKey(k).getDay(), sameDow = eps.filter(e => e.dow === dow).length;
  if (sameDow >= 2) { score++; reasons.push(`${sameDow} de tus episodios fueron en ${DOW[dow]}`); }
  const hrs = eps.map(e => e.hora).filter(Boolean).map(h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; }).sort((a, b) => a - b);
  if (hrs.length >= 2) { const med = hrs[Math.floor(hrs.length / 2)]; hora = `${pad2(Math.floor(med / 60) % 24)}:${pad2(med % 60)}`; score++; reasons.push(`tus episodios suelen ocurrir hacia las ${hora}`); }
  const lastE = eps[eps.length - 1]; const ago = diffDays(lastE.date, k);
  if (ago >= 0 && ago <= 3) { score++; reasons.push(ago === 0 ? 'hoy ya hubo un episodio' : `el último fue hace ${ago} día${ago > 1 ? 's' : ''}`); }
  const ctxs = eps.map(e => (e.ctx + ' ' + e.falto).toLowerCase());
  const phone = ctxs.filter(c => /tel[eé]fono|celular|m[oó]vil|pantalla/.test(c)).length, bed = ctxs.filter(c => /cama|acostad|noche/.test(c)).length;
  if (phone >= 2) reasons.push(`en ${phone} episodios estaba el teléfono de por medio`);
  if (bed >= 2) reasons.push(`en ${bed} episodios fue en la cama o de noche`);
  return { level: score >= 2 ? 2 : score >= 1 ? 1 : 0, reasons, hora, eps: eps.length };
}

/* ======================================================================
   "TU DÍA": propuesta · intención · lo real
   ====================================================================== */
function realOf(area, k = today()) {
  const L0 = logsOn(k);
  const meal = (m) => L0.filter(l => l.type === 'comida' && (l.data.momento || '').toLowerCase() === m).map(l => `${C.STATE_LABEL[l.status] === 'Realizada según lo previsto' ? '' : C.STATE_LABEL[l.status] + ': '}${l.data.ajuste || 'registrada'}${l.data.desp ? ' · ' + l.data.desp.toLowerCase() : ''}`).join('; ');
  switch (area) {
    case 'desayuno': case 'almuerzo': case 'cena': case 'merienda': return meal(area);
    case 'movimiento': return L0.filter(l => l.type === 'aero' || l.type === 'fuerza').map(l => l.type === 'fuerza' ? (C.DONE_STATES.includes(l.status) ? 'Fuerza hecha' : 'Fuerza: ' + C.STATE_LABEL[l.status].toLowerCase()) : (C.DONE_STATES.includes(l.status) ? `${l.data.min ?? '?'} min${l.data.mod != null ? ` (${l.data.mod} mod.)` : ''}` : C.STATE_LABEL[l.status])).join(' · ');
    case 'estudio': return L0.filter(l => l.type === 'estudio').map(l => C.DONE_STATES.includes(l.status) ? (l.data.tema || 'Bloque hecho') + (l.data.resultado ? ' · ' + l.data.resultado.split(' ').slice(0, 3).join(' ') : '') : C.STATE_LABEL[l.status]).join(' · ');
    case 'metap': { const p = (S.days[k] || {}).p || {}; const r = { no: 'Sin recaída', yes: 'Hubo recaída', nd: 'Sin dato', priv: 'Privado' }[p.res] || ''; const i = { used: 'impulso: usé respuesta', notused: 'impulso sin respuesta', none: 'sin impulso' }[p.imp] || ''; return [r, i].filter(Boolean).join(' · '); }
    case 'sueno': { const l = L0.find(x => x.type === 'sueno'); return l ? `${l.data.horas != null ? l.data.horas + ' h' : 'horas sin dato'}${l.data.como ? ' · ' + l.data.como.toLowerCase() : ''}` : ''; }
  }
  return '';
}
/* Propuesta local (sin IA, sin coste): sale del plan semanal, tu perfil y el manual */
function localProposal(k = today()) {
  const w = Math.max(1, cal().weekOf(k)), pd = weekPlan(w).days[k] || {}, pr = S.profile || {};
  const mem = (S.mind.mem || []).map(m => m.text.toLowerCase()).join(' ');
  const due = S.studyDue.filter(s => !s.done && s.date <= k);
  const plate = 'Plato con proteína + energético + fruta o verdura (sección 16)';
  const adj = pr.comidaAjuste || '';
  const meal = (m) => (pr.comidaCual || '').toLowerCase() === m && adj ? adj : m === 'desayuno' ? 'Avena con leche y fruta, o pan con huevo y fruta' : plate;
  const risk = riskToday(k);
  const alt = (pr.alternativas || []).slice(0, 2).join(' o ') || 'dejar el teléfono fuera y leer';
  return {
    desayuno: meal('desayuno'), almuerzo: meal('almuerzo'), cena: meal('cena'),
    movimiento: pd.walk ? `Caminata ${pd.walk} min${pr.ocasion1 ? ' después de ' + pr.ocasion1 : ''}${pd.str ? ' + fuerza' : ''}` : pd.str ? 'Fuerza · 5 movimientos (15-25 min)' : 'Descanso de entrenamiento; movimiento cotidiano',
    estudio: due.length ? `Repaso activo: ${due[0].tema} (resolver sin mirar)` : 'Si estudias hoy: un bloque de 25 min resolviendo sin mirar',
    metap: risk.level ? `Día de riesgo${risk.hora ? ' hacia las ' + risk.hora : ''}: ten lista tu respuesta (${alt})` : `Respuesta lista si aparece un impulso: ${alt}`,
    sueno: 'Acostarte a una hora parecida a la de ayer y reducir pantalla antes de dormir',
    _local: true, _mem: !!mem
  };
}
function dayPlan(k = today()) {
  const md = mindDay(k);
  const prop = Object.assign({}, md.aiProp ? md.prop : localProposal(k), md.prop || {});
  return { prop, int: md.int || {}, md };
}

/* ======================================================================
   MEMORIA Y CONTEXTO PARA LA IA
   ====================================================================== */
function memoryBlock() {
  const mem = (S.mind.mem || []).filter(m => S.ai.shareP || m.cat !== 'riesgo');
  return mem.length ? 'MEMORIA PERMANENTE (lo que la persona te ha contado; id entre corchetes):\n' + mem.slice(-80).map(m => `[${m.id}] (${m.cat}, ${m.t.slice(0, 10)}) ${m.text}`).join('\n') : 'MEMORIA PERMANENTE: vacía. Aún no sabes sus horarios, qué comida hay en casa ni sus momentos de riesgo: pregúntalo de forma natural (una cosa a la vez) y guárdalo con recordar.';
}
function patternsBlock() {
  const out = [], st = streakInfo(), c = cal(), cw = Math.max(1, c.weekOf(today()));
  if (S.ai.shareP) {
    const eps = episodes();
    out.push(`META P: racha actual ${st.cur} días conocidos sin recaída · récord ${st.best} · recaídas totales ${st.total}${st.last ? ' · última ' + st.last : ''}.`);
    if (eps.length) out.push('Episodios (más recientes al final): ' + eps.slice(-10).map(e => `${e.date} ${DOW[e.dow]}${e.hora ? ' ' + e.hora : ''}${e.sleep != null ? ', durmió ' + e.sleep + ' h' : ''}${S.ai.shareText && e.ctx ? ', contexto: ' + e.ctx : ''}${e.falto ? ', faltó: ' + e.falto : ''}${e.cambio ? ', cambio elegido: ' + e.cambio : ''}`).join(' | '));
    const r = riskToday(); out.push(`Riesgo de hoy (cálculo local): ${['bajo', 'medio', 'alto'][r.level]}${r.reasons.length ? ' — ' + r.reasons.join('; ') : ''}.`);
  }
  const wk = []; for (let n = Math.max(1, cw - 5); n <= cw; n++) { const s = weekStats(n); wk.push(`S${n}: ${s.minT} min (${s.minM} mod), fuerza ${s.fz}`); }
  out.push('Movimiento por semana: ' + wk.join(' · '));
  const fz = S.logs.filter(l => l.type === 'fuerza' && C.DONE_STATES.includes(l.status)).sort((a, b) => a.date < b.date ? -1 : 1);
  if (fz.length) out.push('Fuerza (primera → última): ' + C.EXERCISES.map(e => { const f = fz.map(l => (l.data.ex || []).find(x => x.k === e[0] && !x.skip)).filter(Boolean); return f.length ? `${short(e[0])} ${f[0].sets}x${f[0].reps}→${f[f.length - 1].sets}x${f[f.length - 1].reps}` : ''; }).filter(Boolean).join(', '));
  const pesos = S.logs.filter(l => l.type === 'medida' && l.data.peso).sort((a, b) => a.date < b.date ? -1 : 1);
  if (pesos.length) out.push(`Peso (opcional): ${pesos[0].data.peso} kg (${pesos[0].date}) → ${pesos[pesos.length - 1].data.peso} kg (${pesos[pesos.length - 1].date}).`);
  const revs = Object.entries(S.reviews).slice(-3).map(([n, r]) => `S${n}: ${r.q5 || '?'}; mantiene "${r.mant || ''}", cambia "${r.cambio || ''}"`);
  if (revs.length) out.push('Revisiones: ' + revs.join(' | '));
  out.push(`Total de registros en el historial: ${S.logs.length} desde ${S.settings.start} (usa buscar_historial para verlos).`);
  return 'PATRONES DE TODO SU HISTORIAL:\n' + out.join('\n');
}
function dayPlanBlock(k = today()) {
  const { prop, int } = dayPlan(k);
  return 'TU DÍA (propuesta · lo que piensa hacer · lo real):\n' + AREA_KEYS.filter(a => a !== 'merienda' || prop.merienda || int.merienda).map(a => `- ${areaName(a)}: propuesta "${prop[a] || '—'}" · piensa "${int[a] || '—'}" · real "${realOf(a, k) || '—'}"`).join('\n') + (prop._local ? '\n(La propuesta actual es la local por defecto; puedes mejorarla con plan_del_dia.)' : '');
}

/* ======================================================================
   AGENTE: herramientas que la IA puede usar
   ====================================================================== */
const AREA_ENUM = ['desayuno', 'almuerzo', 'merienda', 'cena', 'movimiento', 'estudio', 'metap', 'sueno'];
const TOOLS2 = [
  { name: 'registrar', description: 'Guarda en el historial lo que la persona CONTÓ que hizo o le pasó (comida, caminata, fuerza, estudio, sueño, impulso/recaída, etc.). Solo hechos dichos; lo deducido va en "sugeridos" y NO se guarda. La app muestra "Deshacer".', input_schema: PARSE_TOOL.input_schema.properties.registros ? { type: 'object', properties: { registros: PARSE_TOOL.input_schema.properties.registros }, required: ['registros'] } : PARSE_TOOL.input_schema },
  { name: 'plan_del_dia', description: 'Actualiza el panel "Tu día": "propuesta" = lo que tú recomiendas; "intencion" = lo que la persona dice que piensa hacer/comer.', input_schema: { type: 'object', properties: { fecha: { type: 'string', description: 'YYYY-MM-DD; por defecto hoy' }, items: { type: 'array', items: { type: 'object', properties: { area: { type: 'string', enum: AREA_ENUM }, propuesta: { type: 'string' }, intencion: { type: 'string' } }, required: ['area'] } } }, required: ['items'] } },
  { name: 'meta_p', description: 'Marca el resultado del día en la Meta P cuando la persona lo dice (sin recaída / recaída / prefiere no responder / sin dato) y si hubo impulso.', input_schema: { type: 'object', properties: { fecha: { type: 'string' }, resultado: { type: 'string', enum: ['no', 'si', 'priv', 'nd'] }, impulso: { type: 'string', enum: ['none', 'used', 'notused', 'unk'] } } } },
  { name: 'recordar', description: 'Guarda en la memoria permanente algo estable sobre la persona: horarios, qué comidas son familiares y cuáles prepara él, alimentos disponibles, gustos, alergias, desencadenantes, apoyos, metas personales.', input_schema: { type: 'object', properties: { hechos: { type: 'array', items: { type: 'object', properties: { texto: { type: 'string' }, categoria: { type: 'string', enum: ['comida', 'horario', 'preferencia', 'riesgo', 'salud', 'estudio', 'social', 'otro'] } }, required: ['texto', 'categoria'] } } }, required: ['hechos'] } },
  { name: 'olvidar', description: 'Borra de la memoria hechos que ya no son ciertos (por id).', input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] } },
  { name: 'buscar_historial', description: 'Consulta registros antiguos. Devuelve una lista compacta. Úsalo cuando necesites datos fuera de los últimos días.', input_schema: { type: 'object', properties: { tipo: { type: 'string', enum: ['aero', 'fuerza', 'comida', 'estudio', 'sueno', 'pausa', 'vinculo', 'impulso', 'medida', 'todos'] }, desde: { type: 'string' }, hasta: { type: 'string' }, texto: { type: 'string' } } } },
  { name: 'consultar_guia', description: 'Devuelve el texto de una guía del manual.', input_schema: { type: 'object', properties: { id: { type: 'string', enum: C.GUIDES.map(g => g.id) } }, required: ['id'] } },
  { name: 'mostrar', description: 'Muestra en la conversación una vista de la app (resumen + botón para abrirla). "protocolo" abre el protocolo de pausa; "cuidado", las señales de alarma.', input_schema: { type: 'object', properties: { vista: { type: 'string', enum: ['progreso', 'plan', 'revision', 'guias', 'historial', 'registrar', 'detalle', 'protocolo', 'cuidado', 'ajustes'] }, guia: { type: 'string', enum: C.GUIDES.map(g => g.id) } }, required: ['vista'] } },
  { name: 'programar_aviso', description: 'Programa una notificación local en la tablet (p. ej. antes de su hora de riesgo o para recordar una acción que acordó).', input_schema: { type: 'object', properties: { hora: { type: 'string', description: 'HH:MM (24 h)' }, dia: { type: 'string', enum: ['hoy', 'mañana'] }, texto: { type: 'string', description: 'Texto breve y discreto' } }, required: ['hora', 'texto'] } },
  { name: 'ajustar_semana', description: 'Cambia días de caminata/fuerza del plan cuando la persona lo decide.', input_schema: { type: 'object', properties: { cambios: { type: 'array', items: { type: 'object', properties: { fecha: { type: 'string' }, caminar_min: { type: 'number' }, fuerza: { type: 'boolean' } }, required: ['fecha'] } } }, required: ['cambios'] } },
  { name: 'guardar_revision', description: 'Guarda la revisión semanal SOLO después de que la persona confirme la decisión.', input_schema: { type: 'object', properties: { semana: { type: 'number' }, q2: { type: 'string', enum: ['Mejora', 'Estabilidad', 'Empeoramiento', 'Aún no sé'] }, q2t: { type: 'string' }, q4: { type: 'string', enum: C.BARRIERS }, q5: { type: 'string', enum: ['Mantener', 'Progresar una variable', 'Reducir', 'Cambiar método', 'Pedir apoyo'] }, mant: { type: 'string' }, cambio: { type: 'string' }, porque: { type: 'string' } }, required: ['semana', 'q5', 'mant'] } }
];
const QUERY_TOOLS = ['buscar_historial', 'consultar_guia'];

/* Ejecuta una herramienta localmente. Devuelve { result (texto para la IA), card (para la conversación) } */
function runTool(name, x, ctx) {
  x = x || {};
  const k0 = today();
  const okDate = (d) => validDate(d) && d <= k0 && d >= S.settings.start ? d : null;
  try {
    switch (name) {
      case 'registrar': {
        const items = (Array.isArray(x.registros) ? x.registros : []).map(normParsed).filter(Boolean);
        const good = [], bad = [], sug = [];
        items.forEach(it => {
          if (it.errors.length) { bad.push(`${TYPES[it.tipo].n} ${it.fecha}: ${it.errors[0]}`); return; }
          const c2 = validateLog(it.tipo, it.fecha, it.estado, Object.assign({}, it.datos, { via: 'ia' }));
          if (!c2.ok) { bad.push(`${TYPES[it.tipo].n}: ${c2.errors[0]}`); return; }
          good.push([it, c2.data]);
        });
        const ids = []; const sugL = [];
        if (good.length && !commit(() => { good.forEach(([it, d]) => { const id = addLog(it.tipo, it.fecha, it.estado, d).id; ids.push(id); if (Object.keys(it.sugeridos).length) sugL.push({ id, s: it.sugeridos }); if (it.tipo === 'impulso') recomputeP(it.fecha); }); })) return { result: 'ERROR: no se pudo guardar en la tablet.' };
        return { result: `Guardados ${ids.length}.${bad.length ? ' No guardados: ' + bad.join('; ') : ''}${sugL.length ? ' Lo deducido quedó como sugerencia sin guardar.' : ''}`, card: { type: 'logged', ids, bad, sug: sugL } };
      }
      case 'plan_del_dia': {
        const k = okDate(x.fecha) || (validDate(x.fecha) && x.fecha > k0 && x.fecha <= addDays(k0, 1) ? x.fecha : k0);
        const items = (x.items || []).filter(i => i && AREA_ENUM.includes(i.area));
        if (!items.length) return { result: 'Sin cambios.' };
        commit(() => { const md = mindDay(k); items.forEach(i => { if (typeof i.propuesta === 'string' && i.propuesta.trim()) { md.prop[i.area] = i.propuesta.trim().slice(0, 240); md.aiProp = true; } if (typeof i.intencion === 'string') md.int[i.area] = i.intencion.trim().slice(0, 240); }); });
        return { result: 'Panel actualizado.', card: { type: 'chip', text: `Tu día actualizado: ${items.map(i => areaName(i.area)).join(', ')}` } };
      }
      case 'meta_p': {
        const k = okDate(x.fecha) || k0;
        if (x.resultado && x.resultado !== 'si' && logsOn(k, 'impulso').some(l => l.data && l.data.res === 'si')) return { result: 'CONFLICTO: hay un episodio registrado ese día; no se cambió. Pregunta si fue un error.' };
        const map = { no: 'no', si: 'yes', priv: 'priv', nd: 'nd' };
        commit(() => { const d = day(k); d.p = d.p || {}; d.p.manual = Object.assign(d.p.manual || {}, x.resultado ? { res: map[x.resultado] } : {}, x.impulso ? { imp: x.impulso } : {}); recomputeP(k); });
        const st = streakInfo();
        return { result: `Hecho. Racha actual ${st.cur}, récord ${st.best}.`, card: { type: 'chip', text: `${L().meta}: ${x.resultado === 'si' ? 'recaída registrada · el conteo vuelve a empezar, tu récord (' + st.best + ') se mantiene' : 'día marcado'}` } };
      }
      case 'recordar': {
        const hs = (x.hechos || []).filter(h => h && typeof h.texto === 'string' && h.texto.trim()).slice(0, 8);
        if (!hs.length) return { result: 'Nada que recordar.' };
        const added = [];
        commit(() => { hs.forEach(h => { const txt = h.texto.trim().slice(0, 300); if (S.mind.mem.some(m => m.text.toLowerCase() === txt.toLowerCase())) return; const m = { id: 'm' + uid().slice(-6), t: new Date().toISOString(), cat: h.categoria || 'otro', text: txt }; S.mind.mem.push(m); added.push(m); }); if (S.mind.mem.length > 150) S.mind.mem = S.mind.mem.slice(-150); });
        return { result: `Recordado (${added.length}).`, card: added.length ? { type: 'mem', items: added.map(m => ({ id: m.id, text: m.text })) } : null };
      }
      case 'olvidar': {
        const ids = x.ids || []; let n = 0;
        commit(() => { const before = S.mind.mem.length; S.mind.mem = S.mind.mem.filter(m => !ids.includes(m.id)); n = before - S.mind.mem.length; });
        return { result: `Olvidados ${n}.`, card: n ? { type: 'chip', text: `Olvidé ${n} dato${n > 1 ? 's' : ''} de tu memoria` } : null };
      }
      case 'buscar_historial': {
        const q = (x.texto || '').toLowerCase();
        const rows = S.logs.filter(l => (!x.tipo || x.tipo === 'todos' || l.type === x.tipo) && (!x.desde || l.date >= x.desde) && (!x.hasta || l.date <= x.hasta) && (!q || JSON.stringify(l.data || {}).toLowerCase().includes(q)))
          .filter(l => S.ai.shareP || l.type !== 'impulso').sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 40);
        return { result: rows.length ? rows.map(l => `${l.date} ${TYPES[l.type].n} [${C.STATE_LABEL[l.status]}] ${logSummary(l)}`).join('\n') : 'Sin resultados.' };
      }
      case 'consultar_guia': { const g = C.GUIDES.find(g2 => g2.id === x.id); return { result: g ? strip(g.html).slice(0, 3500) : 'Guía no encontrada.' }; }
      case 'mostrar': {
        if (x.vista === 'cuidado') setTimeout(openCare, 50);
        return { result: 'Mostrado.', card: { type: 'view', vista: x.vista, guia: x.guia } };
      }
      case 'programar_aviso': {
        if (!/^\d{1,2}:\d{2}$/.test(x.hora || '')) return { result: 'Hora no válida.' };
        const [h, m] = x.hora.split(':').map(Number); const at = new Date(); at.setHours(h, m, 0, 0); if (x.dia === 'mañana') at.setDate(at.getDate() + 1);
        if (at < new Date()) return { result: 'Esa hora ya pasó hoy.' };
        const text = String(x.texto || '').slice(0, 120);
        scheduleOne(400 + Math.floor(Math.random() * 500), text, at);
        return { result: `Aviso programado para ${x.dia === 'mañana' ? 'mañana' : 'hoy'} a las ${x.hora}.`, card: { type: 'chip', text: `Aviso ${x.dia === 'mañana' ? 'mañana' : 'hoy'} a las ${x.hora}: “${text}”` } };
      }
      case 'ajustar_semana': {
        const ch = (x.cambios || []).filter(c2 => validDate(c2.fecha) && c2.fecha >= k0);
        if (!ch.length) return { result: 'Sin cambios válidos (solo hoy o fechas futuras).' };
        const byW = {}; ch.forEach(c2 => { const w = cal().weekOf(c2.fecha); (byW[w] = byW[w] || []).push(c2); });
        const ok2 = commit(() => { Object.entries(byW).forEach(([w, list]) => { const wp = structuredClone(weekPlan(+w)); list.forEach(c2 => { const d = wp.days[c2.fecha] = wp.days[c2.fecha] || { walk: 0, str: false }; if (c2.caminar_min != null) d.walk = Math.max(0, Math.min(120, Math.round(+c2.caminar_min) || 0)); if (c2.fuerza != null) d.str = !!c2.fuerza; }); wp.auto = false; S.weekPlans[w] = wp; }); });
        return ok2 ? { result: 'Plan semanal actualizado.', card: { type: 'view', vista: 'plan' } } : { result: 'ERROR al guardar.' };
      }
      case 'guardar_revision': {
        const n = Math.max(1, Math.round(+x.semana || curWeek()));
        const v = {}; ['q2', 'q2t', 'q4', 'q5', 'mant', 'cambio', 'porque'].forEach(f => { if (typeof x[f] === 'string' && x[f].trim()) v[f] = x[f].trim().slice(0, 500); });
        if (!commit(() => { S.reviews[n] = Object.assign(S.reviews[n] || {}, v, { at: Date.now(), via: 'asistente' }); const nx = S.weekPlans[n + 1]; if (nx && nx.auto !== false && today() <= cal().range(n + 1)[1]) delete S.weekPlans[n + 1]; })) return { result: 'ERROR al guardar.' };
        return { result: 'Revisión guardada.', card: { type: 'chip', text: `Revisión de la semana ${n} guardada: ${v.q5 || ''}` } };
      }
    }
  } catch (e) { console.error(e); return { result: 'ERROR interno: ' + e.message }; }
  return { result: 'Herramienta desconocida.' };
}
async function scheduleOne(id, body, at) {
  const LN = P('LocalNotifications'); if (!LN) return;
  try { let perm = await LN.checkPermissions(); if (perm.display !== 'granted') perm = await LN.requestPermissions(); if (perm.display !== 'granted') return; await LN.schedule({ notifications: [{ id, title: 'Plan 20', body, schedule: { at, allowWhileIdle: true } }] }); } catch (e) { console.warn(e); }
}

/* ======================================================================
   AGENTE: conversación
   ====================================================================== */
function agentRules() {
  return `
MODO ASISTENTE PERSONAL (pantalla principal de la app):
- La persona NO quiere rellenar formularios. Tú registras por ella con herramientas lo que cuenta, en el mismo turno en que respondes (texto + herramientas juntos; no pidas permiso para registrar lo que dijo con claridad: la app muestra "Deshacer").
- Si cuenta algo que HIZO → registrar (solo lo dicho; lo deducido en "sugeridos").
- Si dice lo que PIENSA hacer, comer o estudiar, o cualquier compromiso (hoy, mañana, otro día; con hora o sin ella) → herramienta agenda (crear), UN elemento por cosa, con fecha YYYY-MM-DD tomada del CALENDARIO y "hora" HH:MM o "momento". Nunca lo dejes solo en el texto: si no lo guardas con agenda, se pierde. Si cambia de idea → agenda cambiar/borrar con el id del bloque AGENDA. Si pide recomendación → agenda con propuesta=true. Cuando cuente que ya lo hizo → agenda hecho + registrar.
- Tras usar agenda, confirma en tu respuesta qué quedó guardado (día y hora). Si la herramienta devuelve "NO guardado", corrige la fecha u hora y vuelve a llamarla.
- Comida (sección 16-17): propuestas concretas por comida con estructura proteína + energético + fruta/verdura, de bajo costo, sin calorías ni gramos. Sus comidas son MIXTAS: unas familiares (propón qué servirse y qué ajustar dentro del plato familiar) y otras las prepara o compra él (propón algo sencillo y barato). Usa la memoria para saber cuáles son cuáles, qué hay en casa, gustos y alergias; si no lo sabes, pregúntalo una vez y guárdalo con recordar.
- Compara propuesta vs intención vs real sin juzgar: si su opción es razonable según el manual, acéptala y actualiza tu propuesta; si no, explica en una frase la alternativa.
- Guarda con recordar TODO dato estable que revele (horarios, clases, quién cocina qué, comida disponible, gustos, alergias, desencadenantes, apoyos). Usa olvidar si algo deja de ser cierto.
- Recaídas: conoces su historial y patrones (abajo). Recuérdale de forma preventiva y concreta sus momentos de riesgo ("tus últimos episodios fueron..."), con su respuesta elegida, sin culpa ni moralina. La app muestra el conteo de días y el récord; tras una recaída di que el conteo vuelve a empezar pero el récord y lo aprendido se mantienen. Si detectas su hora de riesgo, ofrece programar_aviso 30 min antes.
- Si registra una recaída: primero una frase sin autocrítica, luego UNA pregunta breve (qué pasó justo antes) y UN cambio para la próxima vez (sección 23).
- Para datos antiguos usa buscar_historial; para detalle del manual, consultar_guia; para abrir pantallas, mostrar. No expliques cómo usar la app: actúa.
- Revisión semanal: si la persona acepta hacerla, resume la semana en 3-4 líneas con cantidades reales, propone UNA decisión (mantener / una variable / reducir...) y solo cuando la confirme usa guardar_revision.
- Conversa de forma cálida y amplia, como un asistente personal cercano: saluda con naturalidad, explica el porqué de lo que propones, da ideas concretas y opciones (usa listas cortas cuando ayuden). Normalmente 80-200 palabras; más si pide detalle, menos si solo confirma algo.
- Casi siempre termina ofreciendo 2-4 respuestas rápidas con la herramienta respuestas (frases que la persona diría, p. ej. "Sí, agéndalo", "Dame otra opción"). Evita terminar con una pregunta abierta si puedes ofrecer opciones.
- Si la persona envía imágenes: describe en una frase lo que ves y actúa (foto de su comida → pregunta o registra si dice que la comió; foto de un horario o lista → agenda; foto de un ejercicio → técnica y seguridad). No identifiques a personas.`;
}
function agentSystem() {
  const ph = C.PHASES.map(p => `Fase ${p.n} (sem ${p.weeks[0]}-${p.weeks[1]}): ${p.focus}`).join('\n');
  const rules = C.ADJUST_RULES.map((r, i) => `${i + 1}. ${r[0]} → ${r[1]}`).join('\n');
  const guides = 'Guías disponibles (consultar_guia): ' + C.GUIDES.map(g => `${g.id} = ${g.title}`).join('; ');
  return [
    { type: 'text', text: aiCore() + '\n' + agentRules() + `\n\nFASES\n${ph}\n\nREGLAS DE AJUSTE (en orden)\n${rules}\n\n${guides}`, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: memoryBlock() + '\n\n' + patternsBlock() + '\n\n' + dayPlanBlock() + '\n\nDATOS RECIENTES:\n' + aiSnapshot(aiSaver() ? 5 : 7) }
  ];
}
let agentBusy = false;
async function agentSend(text, opts = {}) {
  if (agentBusy || !text) return;
  const imgs = (opts.images || []).slice(0, 3);
  if (!opts.silentUser) S.ai.chat.push(Object.assign({ role: 'user', content: text, t: Date.now() }, imgs.length ? { imgs: imgs.map(i => i.thumb) } : {}));
  S.ai.chat.forEach((m, i, a) => { if (m.imgs && i < a.length - 30) delete m.imgs; }); // miniaturas solo en los últimos mensajes (espacio)
  if (ALARM.test(text)) { S.ai.chat.push({ role: 'assistant', content: alarmCard(), t: Date.now(), local: true }); openCare(); }
  if (!aiReady()) { S.ai.chat.push({ role: 'assistant', content: 'Para entender lo que me cuentas necesito la IA activada (Más → Ajustes → Inteligencia artificial). Mientras tanto, puedes registrar a mano desde Más → Registrar.', t: Date.now(), local: true }); save(); route(); return; }
  agentBusy = true; micText = ''; save(); route();
  try {
    const hist = S.ai.chat.filter(m => !m.err && !m.local && m.content).slice(aiSaver() ? -6 : -10).map(m => ({ role: m.role, content: m.content + (m.acts ? `\n[acciones hechas: ${m.acts}]` : '') + (m.imgs ? `\n[adjuntó ${m.imgs.length} imagen(es)]` : '') }));
    while (hist.length && hist[0].role !== 'user') hist.shift();
    if (opts.hidden) hist.push({ role: 'user', content: opts.hidden });
    const msgs = hist.length ? hist : [{ role: 'user', content: text }];
    if (imgs.length) { const last = msgs[msgs.length - 1]; if (last && last.role === 'user') last.content = imgs.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.media || 'image/jpeg', data: im.data } })).concat([{ type: 'text', text: String(last.content).replace(/\n\[adjuntó \d+ imagen\(es\)\]$/, '') }]); }
    let texts = [], cards = [], acts = [], cost = 0;
    for (let round = 0; round < 3; round++) {
      const r = await claude({ kind: 'asistente', max_tokens: 1600, system: agentSystem(), messages: msgs, tools: TOOLS2, tool_choice: { type: 'auto' } });
      cost += r.cost;
      const content = r.data.content || [];
      content.filter(b => b.type === 'text' && b.text.trim()).forEach(b => texts.push(b.text.trim()));
      const uses = content.filter(b => b.type === 'tool_use');
      if (!uses.length) break;
      const results = uses.map(u => { const o = runTool(u.name, u.input); if (o.card) cards.push(o.card); acts.push(`${u.name}: ${o.result.slice(0, 80)}`); return { type: 'tool_result', tool_use_id: u.id, content: o.result }; });
      const needMore = uses.some(u => QUERY_TOOLS.includes(u.name)) || !texts.length;
      if (!needMore) break;
      msgs.push({ role: 'assistant', content }); msgs.push({ role: 'user', content: results });
    }
    S.ai.chat.push({ role: 'assistant', content: texts.join('\n\n') || 'Hecho.', cards, acts: acts.join('; '), t: Date.now(), cost });
  } catch (e) { S.ai.chat.push({ role: 'assistant', content: '⚠ ' + e.message, t: Date.now(), err: true, retry: text }); }
  S.ai.chat = S.ai.chat.slice(-80); agentBusy = false; save(); route();
}
/* Las funciones antiguas de chat usan ahora el asistente principal */
chatSend = function (text) { tab = 'hoy'; agentSend(text); };

/* ======================================================================
   BRIEFING DEL DÍA (proactivo, una vez al día)
   ====================================================================== */
const BRIEF_TOOL = { name: 'briefing_del_dia', description: 'Saludo y propuesta del día.', input_schema: { type: 'object', properties: {
  mensaje: { type: 'string', description: 'Empieza con un saludo cálido ("¡Hola, …!" o "¡Buenos días!"), SIN preguntas al principio. Luego 3-5 frases: qué importa hoy según su historial, su agenda, su semana y su riesgo' },
  propuestas: { type: 'object', properties: Object.fromEntries(AREA_ENUM.map(a => [a, { type: 'string' }])), description: 'Propuesta concreta y breve por área (merienda opcional)' },
  riesgo: { type: 'object', properties: { nivel: { type: 'string', enum: ['bajo', 'medio', 'alto'] }, hora: { type: 'string', description: 'HH:MM si su historial indica una hora de riesgo' }, texto: { type: 'string', description: 'Aviso preventivo breve y discreto (se usa en notificación)' } } },
  agenda: { type: 'array', description: 'Propuestas para HOY con hora (HH:MM) o momento, según su plan, clases y memoria', items: { type: 'object', properties: { hora: { type: 'string' }, momento: { type: 'string', enum: ['manana', 'desayuno', 'almuerzo', 'merienda', 'tarde', 'cena', 'noche'] }, titulo: { type: 'string' }, tipo: { type: 'string', enum: ['comida', 'movimiento', 'estudio', 'tarea', 'cita', 'descanso', 'metap', 'sueno', 'otro'] } }, required: ['titulo'] } },
  respuestas: { type: 'array', items: { type: 'string' }, description: '2-4 respuestas rápidas (frases cortas en primera persona) para contestar con un toque' }
}, required: ['mensaje', 'propuestas'] } };
async function morningBriefing(force) {
  const k = today(), md = mindDay(k);
  if (md.flags.brief && !(force && md.flags.brief === 'local')) return;
  const lp = localProposal(k);
  if (!aiReady() || aiLeft() < 0.05 || (S.ai.autoBrief === false && !force)) {
    commit(() => { md.flags.brief = 'local'; S.ai.chat.push({ role: 'assistant', local: true, t: Date.now(), content: localBriefText(k), cards: (aiReady() && aiLeft() >= 0.05 ? [{ type: 'quick2', text: 'Mejorar la propuesta con IA' }] : [{ type: 'chip', text: 'Propuesta básica del plan (sin IA)' }]).concat([{ type: 'quick', items: ['¿Qué me toca hoy?', '¿Cómo voy?', 'Riesgo esta noche'] }]) }); });
    route(); return;
  }
  md.flags.brief = 'pending'; agentBusy = true; route();
  try {
    const r = await claude({ kind: 'briefing', max_tokens: 1400, system: agentSystem(), tools: [BRIEF_TOOL], tool_choice: { type: 'tool', name: 'briefing_del_dia' },
      messages: [{ role: 'user', content: `Es ${DOW[fromKey(k).getDay()]} ${k}, ${hhmm()}. Prepara el briefing de hoy: propuesta concreta por área usando SU plan de movimiento de hoy, sus comidas (mixtas), estudio y prevención de Meta P según su historial. Si el plan de hoy es descanso de entrenamiento, respétalo.` }] });
    const x = (r.tool && r.tool.input) || {};
    if (typeof x.mensaje !== 'string' || !x.propuestas || typeof x.propuestas !== 'object') throw new Error('respuesta incompleta');
    commit(() => {
      AREA_ENUM.forEach(a => { const v = x.propuestas[a]; if (typeof v === 'string' && v.trim()) md.prop[a] = v.trim().slice(0, 240); });
      md.aiProp = true; md.flags.brief = 'ai';
      if (x.riesgo && typeof x.riesgo === 'object') md.risk = { nivel: x.riesgo.nivel, hora: /^\d{1,2}:\d{2}$/.test(x.riesgo.hora || '') ? x.riesgo.hora : null, texto: typeof x.riesgo.texto === 'string' ? x.riesgo.texto.slice(0, 120) : '' };
      if (typeof agSetProposals === 'function') {
        const own = Array.isArray(x.agenda) ? x.agenda.filter(a => a && typeof a.titulo === 'string') : [];
        const fromProps = [['desayuno', 'comida'], ['almuerzo', 'comida'], ['cena', 'comida']].map(([a, t]) => typeof x.propuestas[a] === 'string' && x.propuestas[a].trim() ? { momento: a, titulo: x.propuestas[a].trim().slice(0, 120), tipo: t } : null).filter(Boolean);
        agSetProposals(k, own.length ? own.slice(0, 10) : fromProps);
      }
      const rq = (Array.isArray(x.respuestas) ? x.respuestas : []).filter(t => typeof t === 'string' && t.trim()).map(t => t.trim().slice(0, 48)).slice(0, 4);
      S.ai.chat.push({ role: 'assistant', content: x.mensaje.trim(), t: Date.now(), cost: r.cost, brief: true, cards: [{ type: 'quick', items: rq.length ? rq : ['¿Qué me toca hoy?', 'Planeemos mañana', '¿Cómo voy?'] }] });
    });
    scheduleRiskNotice();
  } catch (e) {
    commit(() => { md.flags.brief = 'local'; S.ai.chat.push({ role: 'assistant', local: true, t: Date.now(), content: localBriefText(k) + `\n\n(No pude usar la IA: ${e.message.replace(/^Error: /, '')})` }); });
  }
  agentBusy = false; save(); route();
}
function localBriefText(k) {
  const st = streakInfo(), r = riskToday(k), w = cal().weekOf(k), lp = localProposal(k);
  const ag = typeof agItems === 'function' ? agItems(k).filter(x => !x.prop && x.status === 'pendiente') : [];
  return `¡Hola! ${cap1(fmt(k, true))} · ${w > 20 ? 'mantenimiento' : 'semana ' + w}.${ag.length ? ` En tu agenda de hoy hay ${ag.length} cosa${ag.length === 1 ? '' : 's'}, la primera: **${agWhen(ag[0])} · ${ag[0].title}**.` : ''} Hoy toca: **${lp.movimiento}**.${true ? ` ${L().meta}: ${st.cur} día${st.cur === 1 ? '' : 's'} seguido${st.cur === 1 ? '' : 's'}${st.best > st.cur ? ` (récord ${st.best})` : ''}.` : ''}${r.level ? ` Ojo: ${r.reasons[0]}.` : ''}\n\nTe dejé propuestas en tu Agenda: acéptalas con un toque o dime qué piensas hacer.`;
}

/* ======================================================================
   PROACTIVIDAD LOCAL (sin coste): cierre, riesgo, revisión, conocerte
   ====================================================================== */
function proactive() {
  const k = today(), md = mindDay(k), h = nowH(), w = Math.max(1, cal().weekOf(k));
  if (!md.flags.brief || md.flags.brief === 'pending') return; // el día empieza con el saludo, nunca con una pregunta
  const push = (flag, content, cards) => { if (md.flags[flag]) return; md.flags[flag] = 1; S.ai.chat.push({ role: 'assistant', local: true, t: Date.now(), content, cards }); };
  let changed = false;
  const r = riskToday(k);
  if (r.level && h >= 17 && !md.flags.risk && S.ai.shareP !== false) { push('risk', `Aviso preventivo: ${r.reasons.slice(0, 2).join(' y ')}. Ten lista tu respuesta (${(S.profile && S.profile.alternativas || []).slice(0, 2).join(' o ') || 'dejar el teléfono fuera'}). Si aparece el impulso, pulsa “Tengo un impulso”.`, [{ type: 'view', vista: 'protocolo' }]); changed = true; }
  if (h >= 19 && !md.flags.checkin && !((S.days[k] || {}).close)) { push('checkin', '¿Cómo fue tu día? Cuéntamelo en una frase (qué comiste, si te moviste, cómo va la Meta P) y lo registro por ti.', [{ type: 'quick', items: ['Todo según el plan', 'No me moví hoy', 'Hoy hubo recaída'] }]); changed = true; }
  const last = cal().range(w)[1];
  if ((fromKey(k).getDay() === 0 || k === last) && !S.reviews[w] && !md.flags.review) { push('review', `Hoy toca la revisión de la semana ${w} (10 min). ¿La hacemos juntos? Te resumo la semana y decidimos una cosa.`, [{ type: 'quick', items: ['Hagamos la revisión'] }, { type: 'view', vista: 'revision' }]); changed = true; }
  if (!(S.mind.mem || []).length && !md.flags.meet && aiReady() && S.ai.chat.some(m => m.role === 'user' && m.t >= fromKey(k).getTime())) { /* tras el saludo, cuando ya conversó hoy */ push('meet', 'Me gustaría conocerte un poco más para ajustar mis propuestas a tu vida real. Empecemos por la comida: cuéntame qué comidas haces con tu familia y cuáles preparas o compras tú. Puedes contestarme con la voz.', [{ type: 'quick', items: ['Te cuento de mis comidas', 'Te cuento mis horarios', 'Ahora no'] }]); changed = true; }
  if (changed) save();
}
/* Notificación preventiva diaria 30 min antes de su hora de riesgo (texto discreto) */
function scheduleRiskNotice() {
  const k = today(), md = mindDay(k), r = riskToday(k);
  const hora = (md.risk && md.risk.hora) || r.hora; if (!hora || md.flags.riskNote) return;
  const [hh, mm] = hora.split(':').map(Number), now = new Date(), at = new Date(now);
  if (hh < 6 && now.getHours() >= 6) at.setDate(at.getDate() + 1); // riesgo de madrugada: es la noche que viene, no la que ya pasó
  at.setHours(hh, mm - 30, 0, 0);
  if (at <= now) return;
  md.flags.riskNote = hhmm(at); save();
  scheduleOne(301, (md.risk && md.risk.texto) || 'Se acerca tu momento de riesgo: ten lista tu respuesta.', at);
}

/* ======================================================================
   VOZ: micrófono (respuesta en texto)
   ====================================================================== */
/* Dictado continuo: el micrófono queda ACTIVO todo el tiempo (también en silencio) hasta que tú
   pulsas ■ (pausar) o ➤ (enviar). Nunca se cierra ni envía por sí solo.
   En la tablet usa el componente nativo ContinuousSpeech (sesión continua de Android 13+,
   o reinicio instantáneo y silencioso como respaldo) y mantiene la pantalla encendida. */
let micOn = false, micText = '', micMode = '';
const CSn = () => P('ContinuousSpeech');
const SRn = () => P('SpeechRecognition');
const WebSR = window.SpeechRecognition || window.webkitSpeechRecognition;
const micAvailable = () => !!(CSn() || SRn() || WebSR);
let webRec = null, micCommitted = '', micCurrent = '', micRestartT = null, micFails = 0, micTailUntil = 0;
const joinTxt = (a, b) => [a, b].map(x => (x || '').trim()).filter(Boolean).join(' ');
function micShow() { micText = joinTxt(micCommitted, micCurrent); composerDraft = micText; keepCompose(micText); const c = $('#cin'); if (c) { c.value = micText; c.style.height = 'auto'; c.style.height = Math.min(140, c.scrollHeight) + 'px'; } }
function micPartial(t) { micCurrent = t || ''; micShow(); }
function micSegment(t) { micCommitted = joinTxt(micCommitted, t); micCurrent = ''; micShow(); }
/* Respaldo sin componente nativo: reinicia al instante tras cada silencio, sin límite de tiempo */
function micSegmentEnded() { if (!micOn) return; micCommitted = joinTxt(micCommitted, micCurrent); micCurrent = ''; micShow(); clearTimeout(micRestartT); micRestartT = setTimeout(micListenFallback, micFails ? Math.min(1500, 200 * micFails) : 150); }
async function micListenFallback() {
  if (!micOn) return;
  try { if (SRn()) await SRn().start({ language: 'es-CO', maxResults: 1, partialResults: true, popup: false }); else if (webRec) webRec.start(); micFails = 0; }
  catch (e) { micFails++; micSegmentEnded(); }
}
async function micStart() {
  micCommitted = ($('#cin') && $('#cin').value) || composerDraft || ''; micCurrent = ''; micFails = 0;
  try {
    const CS = CSn();
    if (CS) {
      await CS.removeAllListeners();
      await CS.addListener('partial', d => { if (micOn && d && d.text) micPartial(d.text); });
      await CS.addListener('segment', d => { if (d && d.text && (micOn || Date.now() < micTailUntil)) micSegment(d.text); }); // también el último tramo al pausar (ventana breve)
      await CS.addListener('state', d => { if (d && d.status === 'stopped' && micOn && d.reason !== 'user') { micOn = false; micCommitted = joinTxt(micCommitted, micCurrent); micCurrent = ''; micShow(); paintMic(); if (d.reason === 'background') toast('Dictado en pausa al salir de la app. Tu texto se conserva.'); } });
      await CS.addListener('error', d => errorBox('Micrófono', (d && d.message) || 'Error del micrófono'));
      await CS.addListener('info', d => d && d.message && toast(d.message));
      await CS.addListener('mode', d => { micMode = d.mode; });
      micOn = true; paintMic();
      const r = await CS.start({ language: 'es-CO', onDevice: true }); micMode = r && r.mode;
      return;
    }
    const SR = SRn();
    if (SR) {
      const av = await SR.available(); if (!av.available) throw new Error('El reconocimiento de voz no está disponible. Instala o activa “Google” o el servicio de voz de Samsung.');
      let perm = await SR.checkPermissions(); if (perm.speechRecognition !== 'granted') perm = await SR.requestPermissions();
      if (perm.speechRecognition !== 'granted') throw new Error('Necesito permiso de micrófono para escucharte.');
      await SR.removeAllListeners();
      await SR.addListener('partialResults', (d) => { if (micOn && d && d.matches && d.matches[0]) micPartial(d.matches[0]); });
      await SR.addListener('listeningState', (d) => { if (d && d.status === 'stopped') micSegmentEnded(); });
    } else if (WebSR) {
      webRec = new WebSR(); webRec.lang = 'es-CO'; webRec.interimResults = true; webRec.continuous = true;
      webRec.onresult = (e) => micPartial(Array.from(e.results).map(r => r[0].transcript).join(' '));
      webRec.onend = () => micSegmentEnded();
      webRec.onerror = () => { micFails++; };
    } else throw new Error('Este dispositivo no ofrece dictado. Usa el micrófono del teclado.');
    micOn = true; micMode = 'restart'; paintMic();
    micListenFallback();
  } catch (e) { micOn = false; paintMic(); errorBox('Micrófono', e.message || String(e)); }
}
/* Pausar: deja el texto en la caja (NO se envía). Volver a tocar el micrófono sigue añadiendo. */
async function micEnd(note) {
  if (!micOn) return;
  micOn = false; clearTimeout(micRestartT); micTailUntil = Date.now() + 1500;
  micCommitted = joinTxt(micCommitted, micCurrent); micCurrent = ''; micShow(); paintMic();
  try { if (CSn()) await CSn().stop(); else if (SRn()) { await SRn().stop(); await SRn().removeAllListeners(); } else if (webRec) { webRec.onend = null; webRec.stop(); } } catch (e) {}
  const c = $('#cin'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
  if (note) toast(note);
}
const micStop = () => micEnd();
const MIC_ON_LBL = '● Grabando sin cortes, aunque te quedes callado. <b>■</b> pausa · <b>➤</b> envía';
function paintMic() {
  const b = $('#micb'); if (!b) return; b.classList.toggle('on', micOn); b.setAttribute('aria-label', micOn ? 'Terminar de dictar' : 'Hablar');
  b.innerHTML = ic(micOn ? 'stop' : 'mic', 26);
  const l = $('#micl'); if (l) l.innerHTML = micOn ? MIC_ON_LBL : (micText ? 'Micrófono en pausa. Revisa el texto y pulsa ➤ para enviar, o toca el micrófono para seguir.' : '');
}

/* ======================================================================
   INTERFAZ: INICIO (asistente + Tu día)
   ====================================================================== */
IC.grid = '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>';
IC.stop = '<rect x="6" y="6" width="12" height="12" rx="2"/>';
IC.mic = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>';
IC.send = '<path d="M4 12l16-8-6 16-2.5-6.5z"/>';
IC.flame = '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 1 1.5 2 2 3 2-1-3 0-5 0-7z"/>';
IC.brain = '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>';
let homeView = 'chat';
function streakChip() {
  const st = streakInfo();
  return `<span class="schip" data-tt="Días conocidos seguidos sin recaída. Un día sin dato no se cuenta.">${ic('flame', 16)} <b>${st.cur}</b> día${st.cur === 1 ? '' : 's'} ${S.settings.discreet ? '· ' + L().meta : 'sin recaída'}${st.best > 0 ? ` <span class="muted">· récord ${st.best}</span>` : ''}</span>`;
}
function chipsFor() {
  const h = nowH(), k = today(), md = mindDay(k), out = [];
  if (h < 11) out.push('¿Qué desayuno?', 'Esto pienso hacer hoy');
  else if (h < 16) out.push('¿Qué almuerzo?', 'Ya comí');
  else out.push('¿Qué ceno?', 'Cierra mi día');
  out.push('¿Cómo voy?');
  return out;
}
function rowHTML(a, prop, int, real) {
  const [key, name, icon] = a, p = prop[key] || '', i = int[key] || '', r = real;
  const same = p && i && i === p;
  return `<div class="trow ${r ? 'done' : ''}"><div class="tl">${ic(icon, 18)}<b>${esc(key === 'metap' ? L().meta : name)}</b>${r ? '<span class="tick">✓</span>' : ''}</div>
    <div class="tline"><span class="tg p">Propuesta</span><span class="tx">${esc(p) || '<span class="muted">—</span>'}</span>${p && !i ? `<button class="mini" data-a="acc" data-x="${key}">Acepto</button>` : ''}</div>
    <div class="tline"><span class="tg i">Tú</span><span class="tx">${same ? '<span class="muted">Igual que la propuesta</span>' : esc(i) || `<button class="linkb" data-a="say" data-x="${key}">Decir qué harás</button>`}</span></div>
    <div class="tline"><span class="tg r">Real</span><span class="tx">${esc(r) || `<button class="linkb" data-a="did" data-x="${key}">Contar qué pasó</button>`}</span></div></div>`;
}
function todayPanel() {
  const k = today(), { prop, int, md } = dayPlan(k);
  const areas = AREAS2.slice(); if (prop.merienda || int.merienda || realOf('merienda')) areas.splice(2, 0, ['merienda', 'Merienda', 'bowl']);
  return `<aside class="today"><div class="row between"><h3>Tu día</h3><span class="muted small">${md.aiProp ? 'Propuesta del asistente' : 'Propuesta básica del plan'}</span></div>
    ${areas.map(a => rowHTML(a, prop, int, realOf(a[0], k))).join('')}</aside>`;
}
function cardHTML(c, mi, ci) {
  if (!c) return '';
  switch (c.type) {
    case 'chip': return `<div class="acard chip">${esc(c.text)}</div>`;
    case 'logged': {
      const logs = (c.ids || []).map(id => S.logs.find(l => l.id === id)).filter(Boolean);
      if (c.undone) return `<div class="acard chip muted">Registro deshecho</div>`;
      return `<div class="acard"><div class="kicker">Registré</div>${logs.map(l => `<div class="small">• ${esc(TYPES[l.type].n)} · ${fmt(l.date)} — ${esc(logSummary(l))} <button class="linkb" type="button" onclick="openLogById('${l.id}')">editar</button></div>`).join('') || '<div class="small muted">(ya no existe)</div>'}
        ${(c.bad || []).length ? `<div class="small" style="color:var(--alert)">No guardé: ${esc(c.bad.join('; '))}</div>` : ''}
        ${(c.sug || []).map((sg, si) => Object.entries(sg.s).map(([f, v]) => `<button class="chip-inf" data-a="sugok" data-x="${mi}.${ci}.${si}.${f}">+ ${esc(FIELD_LBL[f] || f)}: ${esc(fv(f, v))}</button>`).join('')).join('')}
        ${(c.sug || []).length ? '<div class="small muted">Lo de arriba lo deduje yo; tócalo solo si es cierto.</div>' : ''}
        ${logs.length ? `<button class="mini" data-a="undo" data-x="${mi}.${ci}">Deshacer</button>` : ''}</div>`;
    }
    case 'mem': return `<div class="acard"><div class="kicker">${ic('brain', 14)} Lo recordaré</div>${c.items.map(m => `<div class="small">• ${esc(m.text)} ${S.mind.mem.some(x => x.id === m.id) ? `<button class="linkb" data-a="forget" data-x="${m.id}">olvidar</button>` : '<span class="muted">(olvidado)</span>'}</div>`).join('')}</div>`;
    case 'quick2': return `<div class="qrow"><button class="qchip" data-a="brief">${esc(c.text)}</button></div>`;
    case 'quick': if (mi !== S.ai.chat.length - 1) return ''; // solo los botones del último mensaje
      return `<div class="qrow">${c.items.map(t => `<button class="qchip" data-a="send" data-x="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
    case 'view': return viewCard(c);
  }
  return '';
}
function viewCard(c) {
  const k = today(), w = Math.max(1, cal().weekOf(k)), s2 = weekStats(w), st = streakInfo();
  const open = (t, lbl) => `<button class="mini" data-a="open" data-x="${t}">${lbl}</button>`;
  switch (c.vista) {
    case 'progreso': return `<div class="acard"><div class="kicker">Progreso · semana ${w}</div><div class="mstats"><div><b>${s2.minT}</b><span>min (${s2.minM} mod.)</span></div><div><b>${s2.fz}</b><span>fuerza</span></div><div><b>${st.cur}</b><span>días ${L().meta}</span></div><div><b>${st.best}</b><span>récord</span></div></div>${open('progreso', 'Ver progreso completo')}</div>`;
    case 'plan': { const wp = weekPlan(w); return `<div class="acard"><div class="kicker">Plan · semana ${w}</div><div class="small">${daysOfWeek(w).map(d => { const x = wp.days[d] || {}; return `<span class="${d === k ? 'b' : ''}">${DOW_S[fromKey(d).getDay()]}: ${[x.walk ? x.walk + '′' : '', x.str ? 'F' : ''].filter(Boolean).join('+') || '–'}</span>`; }).join(' · ')}</div>${open('plan', 'Abrir plan')}</div>`; }
    case 'revision': return `<div class="acard"><div class="kicker">Semana ${w}</div><div class="small">${s2.minT} min (${s2.minM} moderados) · fuerza ${s2.fz}/${s2.plannedStr} · ${L().meta}: ${s2.pc.no} sin, ${s2.pc.yes} con recaída, ${s2.pc.nd} sin dato</div>${open('revision', 'Abrir revisión')}</div>`;
    case 'guias': { const g = C.GUIDES.find(x => x.id === c.guia) || C.GUIDES[0]; return `<div class="acard"><div class="kicker">Guía</div><b>${esc(g.title)}</b><div class="small muted">${esc(strip(g.html).slice(0, 180))}…</div><button class="mini" data-a="guide" data-x="${g.id}">Leer guía</button></div>`; }
    case 'protocolo': return `<div class="acard"><button class="btn pri" data-a="proto">${ic('wave', 18)} Empezar protocolo de pausa</button></div>`;
    case 'cuidado': return `<div class="acard"><button class="btn danger" onclick="openCare()">${ic('heart', 18)} Señales de cuidado</button></div>`;
    case 'historial': return `<div class="acard"><button class="mini" data-a="hist">Abrir historial completo</button></div>`;
    default: return `<div class="acard">${open(c.vista, 'Abrir ' + c.vista)}</div>`;
  }
}
SCREENS.detalle = SCREENS.hoy; HANDLERS.detalle = HANDLERS.hoy; // la antigua pantalla Hoy sigue disponible en Más
SCREENS.hoy = () => {
  const k = today(), c = cal(), w = c.weekOf(k), md = mindDay(k);
  proactive();
  const msgs = S.ai.chat.slice(-40), off = S.ai.chat.length - msgs.length;
  return `<div class="home ${homeView === 'dia' ? 'v-dia' : 'v-chat'}">
  <section class="convo">
    <div class="htop"><div><div class="kicker">${esc(cap1(fmt(k, true)))} · ${w < 1 ? 'antes del inicio' : w > 20 ? 'mantenimiento' : `semana ${w} · fase ${phaseOf(w)}`}</div>
      <div class="row" style="margin-top:6px">${streakChip()}${(() => { const y = addDays(k, -1); const r = S.days[y] && S.days[y].p && S.days[y].p.res; return y >= S.settings.start && !r ? `<span class="schip ask">¿Y ayer? <button class="mini" data-a="yday" data-x="no">Sin recaída</button><button class="mini" data-a="yday" data-x="yes">Hubo</button></span>` : ''; })()}${riskToday(k).level && nowH() >= 15 ? `<span class="schip warn">${ic('wave', 14)} riesgo ${['', 'medio', 'alto'][riskToday(k).level]}</span>` : ''}</div></div>
      <div class="row"><button class="btn pri" data-a="proto">${ic('wave', 18)} Tengo un impulso</button></div></div>
    <div class="vtabs"><button data-a="hv" data-x="chat" class="${homeView === 'chat' ? 'on' : ''}">Conversación</button><button data-a="hv" data-x="dia" class="${homeView === 'dia' ? 'on' : ''}">Tu día</button></div>
    <div class="msgs" id="msgs">
      ${msgs.map((m, i) => `<div class="msg ${m.role} ${m.local ? 'loc' : ''} ${m.err ? 'err' : ''}">${m.imgs && m.imgs.length ? `<div class="mimgs">${m.imgs.filter(u => /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(u)).map(u => `<img src="${u}" alt="Imagen adjunta">`).join('')}</div>` : ''}${m.role === 'assistant' ? mdLite(m.content) : esc(m.content)}${m.err && m.retry && i === msgs.length - 1 && !agentBusy ? '<div><button class="mini" data-a="retry">Reintentar</button></div>' : ''}</div>${(m.cards || []).map((cd, ci) => cardHTML(cd, i + off, ci)).join('')}`).join('')}
      ${agentBusy ? '<div class="msg assistant typing"><i></i><i></i><i></i></div>' : ''}
      ${!msgs.length && !agentBusy ? `<div class="empty" style="text-align:center;padding:30px">${ic('ai', 30)}<p>Cuéntame qué hiciste o qué piensas hacer. Yo lo registro y te propongo el día.</p></div>` : ''}
    </div>
    ${(() => { const lm = S.ai.chat[S.ai.chat.length - 1]; return lm && lm.role === 'assistant' && (lm.cards || []).some(c => c.type === 'quick') ? '' : `<div class="qrow">${chipsFor().map(t => `<button class="qchip" data-a="send" data-x="${esc(t)}">${esc(t)}</button>`).join('')}</div>`; })()}
    <div class="composer2">
      ${micAvailable() ? `<button id="micb" class="micb ${micOn ? 'on' : ''}" data-a="mic" aria-label="${micOn ? 'Terminar de dictar' : 'Hablar'}">${ic(micOn ? 'stop' : 'mic', 26)}</button>` : ''}
      <button class="attb" data-a="attach" aria-label="Adjuntar imagen" ${agentBusy ? 'disabled' : ''}>${ic('image', 24)}</button><input type="file" id="attf" accept="image/*" multiple hidden>
      <div class="cwrap">${attImgs.length ? `<div class="attprev">${attImgs.map((im, i) => `<span><img src="${im.thumb}" alt=""><button data-a="attdel" data-x="${i}" aria-label="Quitar">✕</button></span>`).join('')}</div>` : ''}<textarea id="cin" rows="1" placeholder="Habla o escribe: “caminé 20 min y almorcé en casa”" ${agentBusy ? 'disabled' : ''}>${esc(micText || composerDraft)}</textarea><div id="micl" class="micl">${micOn ? MIC_ON_LBL : ''}</div></div>
      <button class="sendb" data-a="csend" aria-label="Enviar" ${agentBusy ? 'disabled' : ''}>${ic('send', 22)}</button>
    </div>
  </section>
  ${todayPanel()}
  </div>`;
};
let composerDraft = (() => { try { return localStorage.getItem('plan20.compose') || ''; } catch (e) { return ''; } })();
const keepCompose = (t) => { try { t ? localStorage.setItem('plan20.compose', t) : localStorage.removeItem('plan20.compose'); } catch (e) {} };
HANDLERS.hoy = (m) => {
  const box = $('#msgs'); if (box) box.scrollTop = box.scrollHeight;
  const af = $('#attf'); if (af) af.addEventListener('change', () => { attachFiles(af.files); af.value = ''; });
  const ta = $('#cin');
  if (ta) { ta.addEventListener('input', () => { composerDraft = ta.value; keepCompose(ta.value); ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; }); ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 900) { e.preventDefault(); sendComposer(); } }); }
  onAct(m, {
    proto: () => protocol(),
    send: (t) => agentSend(t),
    csend: () => sendComposer(),
    attach: () => { const f = $('#attf'); if (f) f.click(); },
    attdel: (i) => { attImgs.splice(+i, 1); route(); },
    retry: () => { const last = S.ai.chat[S.ai.chat.length - 1]; if (last && last.err) { S.ai.chat.pop(); const u = S.ai.chat.pop(); save(); agentSend(u ? u.content : last.retry); } },
    mic: () => micOn ? micStop() : micStart(),
    hv: (x) => { homeView = x; route(); },
    yday: (x) => { const y = addDays(today(), -1); if (x === 'yes') { openLog('impulso', { date: y, res: 'si' }); return; } if (commit(() => { const d = day(y); d.p = d.p || {}; d.p.manual = Object.assign(d.p.manual || {}, { res: 'no' }); recomputeP(y); })) route(); },
    acc: (a) => { if (commit(() => { const md = mindDay(today()); md.int[a] = dayPlan().prop[a]; })) route(); },
    say: (a) => { homeView = 'chat'; composerDraft = `Para ${areaName(a).toLowerCase()} pienso `; route(); const t = $('#cin'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } },
    did: (a) => { homeView = 'chat'; composerDraft = a === 'metap' ? 'Hoy en la Meta P ' : a === 'sueno' ? 'Anoche dormí ' : a === 'movimiento' ? 'Hoy me moví así: ' : a === 'estudio' ? 'Hoy estudié ' : `En ${a === 'cena' ? 'la cena' : a === 'almuerzo' ? 'el almuerzo' : 'el ' + a} comí `; route(); const t = $('#cin'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } },
    undo: (x) => { const [mi, ci] = x.split('.').map(Number); const cd = S.ai.chat[mi] && S.ai.chat[mi].cards[ci]; if (!cd) return; const ids = cd.ids || []; const dates = S.logs.filter(l => ids.includes(l.id)).map(l => l.date); if (commit(() => { S.logs = S.logs.filter(l => !ids.includes(l.id)); dates.forEach(d => recomputeP(d)); cd.undone = true; })) { toast('Deshecho'); route(); } },
    sugok: (x) => { const [mi, ci, si, f] = x.split('.'); const cd = S.ai.chat[+mi].cards[+ci], sg = cd.sug[+si]; const l = S.logs.find(y => y.id === sg.id); if (!l) return; const nd = Object.assign({}, l.data, { [f]: sg.s[f] }); const chk = validateLog(l.type, l.date, l.status, nd, { allowBefore: true }); if (!chk.ok) return errorBox('No se pudo añadir', chk.errors[0]); if (commit(() => { l.data = chk.data; delete sg.s[f]; })) route(); },
    forget: (id) => { if (commit(() => { S.mind.mem = S.mind.mem.filter(x => x.id !== id); })) route(); },
    open: (t) => { if (t === 'protocolo') return protocol(); if (t === 'historial') return openHistory(); tab = t; route(); },
    guide: (g) => { guide = g; tab = 'guias'; route(); },
    hist: () => openHistory(),
    brief: () => morningBriefing(true)
  });
  if (unlocked && !mindDay(today()).flags.brief && !agentBusy) setTimeout(morningBriefing, 400);
};
async function sendComposer() {
  if (micOn) { await micEnd(); await new Promise(r => setTimeout(r, 900)); }
  micTailUntil = 0; const t = (($('#cin') || {}).value || '').trim();
  if (!t && !attImgs.length) return;
  const images = attImgs.splice(0);
  composerDraft = ''; keepCompose(''); micText = ''; micCommitted = ''; micCurrent = '';
  agentSend(t || (images.length > 1 ? 'Mira estas imágenes' : 'Mira esta imagen'), images.length ? { images } : {});
}
/* Imágenes adjuntas: se reducen en la tablet (máx. 1568 px, JPEG) antes de enviarlas a la IA; en la conversación
   solo se guarda una miniatura pequeña. */
let attImgs = [];
function imgShrink(img, max, q) { const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return { url: c.toDataURL('image/jpeg', q), w: c.width, h: c.height }; }
async function imgPrep(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No pude abrir esa imagen.')); i.src = url; });
    const big = imgShrink(img, 1568, 0.85), th = imgShrink(img, 220, 0.6);
    return { data: big.url.split(',')[1], media: 'image/jpeg', w: big.w, h: big.h, thumb: th.url };
  } finally { URL.revokeObjectURL(url); }
}
async function attachFiles(files) {
  const list = [...(files || [])].filter(f => /^image\//.test(f.type)).slice(0, 3 - attImgs.length);
  if (!list.length) return toast(attImgs.length >= 3 ? 'Máximo 3 imágenes por mensaje' : 'Elige una imagen');
  for (const f of list) { try { attImgs.push(await imgPrep(f)); } catch (e) { errorBox('Imagen', e.message); } }
  if (!aiReady()) toast('Para que lea imágenes necesito la IA activada (Ajustes → IA)');
  route();
}

/* ======================================================================
   MÁS: todas las pantallas anteriores, sin ruido en el inicio
   ====================================================================== */
SCREENS.mas = () => `<div class="head"><div><h1>Más</h1><div class="sub">Todo lo detallado sigue aquí. El asistente también puede abrir cada pantalla por ti.</div></div></div>
  <div class="tiles">${[
    ['detalle', 'home', 'Día en detalle', 'Apertura, cierre y registros de hoy'], ['registrar', 'plus', 'Registrar a mano', 'Formularios completos'], ['hist', 'book', 'Historial completo', 'Buscar y corregir'],
    ['plan', 'map', 'Plan', '20 semanas y tu semana'], ['revision', 'check', 'Revisión', 'Semanal y cierres de fase'], ['progreso', 'chart', 'Progreso', 'Gráficas y calendario'],
    ['memoria', 'brain', 'Lo que el asistente sabe de ti', `${(S.mind.mem || []).length} dato${(S.mind.mem || []).length === 1 ? '' : 's'} guardado${(S.mind.mem || []).length === 1 ? '' : 's'}`], ['guias', 'book', 'Guías del manual', 'Cómo hacer cada acción'], ['ajustes', 'gear', 'Ajustes', 'IA, avisos, privacidad, copias']
  ].map(t => `<button class="tile" data-a="go" data-x="${t[0]}">${ic(t[1])}<div><b>${t[2]}</b><div class="muted small">${t[3]}</div></div></button>`).join('')}</div>`;
HANDLERS.mas = (m) => onAct(m, { go: (x) => { if (x === 'hist') return openHistory(); tab = x; route(); } });
SCREENS.memoria = () => {
  const mem = S.mind.mem || [], cats = [...new Set(mem.map(m => m.cat))];
  return `<div class="head"><div><h1>Lo que sé de ti</h1><div class="sub">El asistente usa estos datos en cada respuesta. Se guardan solo en la tablet. Borra lo que ya no sea cierto.</div></div></div>
  <div class="card" style="margin-bottom:18px"><div class="row"><input type="text" id="memnew" placeholder="Añade algo que deba saber (ej. “los martes tengo clase hasta las 6”)" style="flex:1"><button class="btn pri" data-a="madd">Guardar</button></div></div>
  ${cats.length ? cats.map(ct => `<div class="card" style="margin-bottom:14px"><div class="kicker">${esc(ct)}</div>${mem.filter(m => m.cat === ct).map(m => `<div class="logitem"><div><div class="t" style="font-weight:500">${esc(m.text)}</div><div class="d">${m.t.slice(0, 10)}</div></div><button class="btn ghost" data-a="mdel" data-x="${m.id}">Borrar</button></div>`).join('')}</div>`).join('') : '<div class="empty">Aún no sé nada de ti. Cuéntaselo al asistente en Inicio.</div>'}`;
};
HANDLERS.memoria = (m) => onAct(m, {
  mdel: (id) => { if (commit(() => { S.mind.mem = S.mind.mem.filter(x => x.id !== id); })) route(); },
  madd: () => { const t = ($('#memnew').value || '').trim(); if (!t) return; if (commit(() => { S.mind.mem.push({ id: 'm' + uid().slice(-6), t: new Date().toISOString(), cat: 'otro', text: t.slice(0, 300) }); })) route(); }
});

/* ---------- Navegación: Inicio · Más · Cuidado ---------- */
NAV.length = 0; NAV.push(['hoy', 'Inicio', 'home'], ['mas', 'Más', 'grid']);
const _route = route;
route = function () {
  if (tab === 'ia') tab = 'hoy';
  _route();
  const top = tab === 'hoy' ? 'hoy' : 'mas';
  document.querySelectorAll('.rail button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === top));
  const main = $('#main'); if (main) main.classList.toggle('mainhome', tab === 'hoy');
};

/* ---------- Inicio sin formularios: el perfil se completa conversando ---------- */
const _onboarding = onboarding;
onboarding = function (edit, ov) {
  if (edit || ov) return _onboarding(edit, ov);
  commit(() => { S.profile = S.profile || { ruta: 'inicial', alternativas: [], accion1: 'Movimiento: caminata', accion2: `${L().meta}: respuesta al impulso`, auto: true }; });
  tab = 'hoy'; route(); scheduleReminders(true);
};
const _afterUnlock = afterUnlock;
afterUnlock = function (first) { _afterUnlock(first); if (S.profile) { if (tab !== 'hoy' && first) { tab = 'hoy'; } route(); scheduleRiskNotice(); } };

/* ---------- Ajustes del asistente: saludo automático y ritmo de gasto ---------- */
function spendPace() {
  const since = Date.now() - 7 * 864e5, h = (S.ai.hist || []).filter(x => x.t >= since), sum = h.reduce((a, x) => a + (x.cost || 0), 0);
  const first = (S.ai.hist || [])[0]; const days = first ? Math.max(1, Math.min(7, (Date.now() - first.t) / 864e5)) : 0;
  const perDay = days ? sum / days : 0; const left = aiLeft();
  return { perDay, daysLeft: perDay > 0 ? Math.floor(left / perDay) : null };
}
wrapScreen('ajustes', (h) => h.replace('<div class="grid">', `<div class="grid">
  <div class="card c12"><div class="row between"><div><h3>${ic('brain', 20)} Asistente</h3><p class="muted small" style="margin:4px 0 0">${(() => { const sp = spendPace(); return sp.perDay ? `Ritmo de gasto: ~${usd(sp.perDay)} por día (últimos 7 días)${sp.daysLeft != null ? ` · al ritmo actual el saldo alcanza para ~${sp.daysLeft} días` : ''}.` : 'Aún sin gasto medido.'; })()} Sin saldo, lo esencial sigue funcionando sin IA.</p></div></div>
  <div class="field" style="margin-top:12px"><div class="lbl">Saludo y propuesta del día con IA</div><div class="hint">Automático al abrir la app cada día (~$0.02 por día) o solo cuando lo pidas. La propuesta básica del plan siempre está disponible sin coste.</div><div class="seg"><button data-a="abrief" data-x="1" class="${S.ai.autoBrief !== false ? 'on' : ''}">Automático</button><button data-a="abrief" data-x="0" class="${S.ai.autoBrief === false ? 'on' : ''}">Solo cuando lo pida</button></div></div>
  <div class="row"><button class="btn" data-a="amem">Ver lo que el asistente sabe de mí</button><button class="btn ghost" data-a="aclear">Borrar la conversación (la memoria se conserva)</button></div></div>`));
wrapHandler('ajustes', {
  abrief: (x) => { if (commit(() => { S.ai.autoBrief = x === '1'; })) route(); },
  amem: () => { tab = 'memoria'; route(); },
  aclear: (x, b) => { if (b.dataset.c) { if (commit(() => { S.ai.chat = []; })) { toast('Conversación borrada'); route(); } } else { b.dataset.c = 1; b.textContent = 'Toca otra vez para borrar'; } }
});

/* Al salir de la app o pulsar “atrás” se termina el dictado conservando el texto (nunca se envía solo) */
if (P('App')) {
  P('App').addListener('appStateChange', ({ isActive }) => { if (!isActive && micOn) micEnd(); });
  P('App').addListener('backButton', () => { if (micOn) micEnd(); });
}
