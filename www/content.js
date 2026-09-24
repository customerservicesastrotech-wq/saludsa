/* Contenido extraído del "Manual personal de acción | 20 semanas" (versión ampliada, 23 sep 2026).
   No se añaden recomendaciones que no estén en el manual. */
window.C = {};

C.PHASES = [
  { n: 1, weeks: [1, 4], title: 'Iniciar', focus: 'Iniciar acciones pequeñas, conocer tu respuesta mientras actúas y establecer una revisión breve.',
    goal: 'Iniciar dos acciones principales y aprender a ajustar su carga a partir de la ejecución. Las sesiones iniciales son ejemplos para alguien que retoma actividad, no un límite para quien ya tolera más.',
    extraTitle: 'Plan de salida si la semana se complica',
    extra: 'Movimiento: cinco a diez minutos cómodos, o descanso por salud. Alimentación: asegurar comida disponible. Estudio: un paso y su comprobación. Meta P: una pausa y la respuesta elegida si aparece impulso. Registro: estado y barrera. No se reduce la comida para “cumplir” una versión mínima.',
    close: 'Describe una mejora o aprendizaje concreto, una dificultad repetida y un cambio para la semana 5. Si no hubo mejora, no añadas más tareas como primera respuesta: revisa si la acción era relevante, accesible y suficientemente clara.' },
  { n: 2, weeks: [5, 8], title: 'Consolidar', focus: 'Ampliar movimiento tolerado, consolidar fuerza y mejorar una segunda decisión cotidiana si cabe.',
    goal: 'Consolidar la rutina y progresar con una sola modificación cada vez. La fuerza puede comenzar antes o después según experiencia, tolerancia y recursos.',
    extraTitle: 'Alimentación, estudio y sueño',
    extra: 'Si el primer ajuste de comida es útil, amplíalo al almuerzo o a la merienda que más lo necesite. En estudio, pasa a otra materia solo cuando sepas aplicar el método en la primera. En sueño, elige una barrera concreta que puedas reducir: acostarte tarde por tareas prescindibles, interrupciones o mala organización de entregas. No se promete un ahorro automático de tiempo.',
    close: 'La semana 8 no es una fecha de transformación corporal. Compara el esfuerzo de una caminata parecida, el control técnico de los ejercicios y el rendimiento en tareas académicas comparables. Si tomas una medida corporal voluntaria, interprétala junto con bienestar y hábitos; nunca decide por sí sola la progresión.' },
  { n: 3, weeks: [9, 12], title: 'Ampliar', focus: 'Consolidar actividad semanal, movimiento durante el día y vínculos elegidos.',
    goal: 'Aumentar movimiento cotidiano si es viable y dar continuidad a relaciones elegidas. El resto de áreas sigue según utilidad, no por obligación de mantener todo activo.',
    extraTitle: 'Qué cuenta como avance',
    extra: 'Puede ser caminar la misma ruta con menos esfuerzo, resolver un problema antes confuso, dormir con mayor regularidad, disfrutar un contacto o sentir menos interferencia. No necesitas mejorar todos los resultados. La recomendación general de actividad para adultos sigue siendo una referencia de salud, no una condición para pasar de fase. Una invitación realizada queda registrada como acción, aunque no haya respuesta.',
    close: 'Revisión de cantidad, resultados y recursos. Ajustar tiempo sentado, pantalla recreativa y vínculo social por separado.' },
  { n: 4, weeks: [13, 16], title: 'Sostener', focus: 'Sostener lo útil en semanas exigentes y trabajar la prioridad que aún genera interferencia.',
    goal: 'Sostener lo útil cuando el contexto cambia y atender la barrera que siga interfiriendo. Tu Meta P sigue activa desde el día 1; aquí profundizas en las estrategias que has usado.',
    extraTitle: 'Una dificultad no convierte el plan en fracaso',
    extra: 'Si una acción se repite sin beneficio, se cambia o retira. Si aparece pérdida persistente de control con deterioro, angustia importante o dificultades alimentarias, se pide evaluación pertinente; no se intensifican el registro, el ejercicio o la restricción como solución automática.',
    close: 'Escribe la rutina que quieres mantener en semanas normales y su versión reducida. Identifica a quién puedes pedir apoyo y qué información te resulta útil compartir. La respuesta puede ser “nadie por ahora”.' },
  { n: 5, weeks: [17, 20], title: 'Mantener', focus: 'Reducir supervisión y dejar un plan de mantenimiento concreto para los siguientes tres meses.',
    goal: 'Conservar resultados con una rutina manejable y preparar los próximos tres meses. No es necesario sostener todas las áreas con el mismo seguimiento.',
    extraTitle: 'Balance final en cinco frases',
    extra: 'Mi prioridad actual es… · Lo que mejoró y puedo describir con un ejemplo es… · La acción que conservaré y su frecuencia serán… · Ante una semana difícil haré… · Mi próxima revisión será el día…; pediré apoyo si…',
    close: 'Una rutina puede seguir necesitando atención después de veinte semanas. No se usa el tiempo transcurrido como prueba de automaticidad.' }
];

C.WEEKS = {
  1: { a: 'Tres oportunidades de caminata de 15-20 min totales si se toleran. Un ajuste en una comida que ya existe. Hasta tres bloques de recuperación de 20-25 min dentro del estudio habitual.', q: '¿Qué pude hacer y qué fue útil? ¿La cantidad cabe en mi semana?', walk: 3, walkMin: 15, str: 0 },
  2: { a: 'Repetir las dos acciones principales. Introducir una sesión breve de fuerza si te encuentras bien; puede iniciarse en la semana 1 si conoces los ejercicios.', q: '¿La barrera principal fue tiempo, salud, recursos, método o prioridad?', walk: 3, walkMin: 20, str: 1 },
  3: { a: 'Mantener caminatas y fuerza. Si recuperas bien, probar una segunda sesión de fuerza en otro día; si no, repetir la dosis tolerada.', q: '¿La sesión fue técnicamente cómoda? ¿Cómo me encontré al día siguiente?', walk: 3, walkMin: 20, str: 1 },
  4: { a: 'Mantener o reducir según calendario. Revisar energía, estudio, alimentación y carga. Elegir las dos acciones principales del siguiente mes.', q: '¿Qué merece continuar? ¿Qué debo cambiar antes de añadir algo?', walk: 3, walkMin: 20, str: 1 },
  5: { a: 'Mantener tres caminatas o equivalentes; si resultan cómodas, avanzar hacia 20-25 min por ocasión. Conservar una o dos sesiones de fuerza según el nivel ya tolerado.', q: '¿Puedo repetir este nivel sin dolor ni agotamiento que interfiera?', walk: 3, walkMin: 20, str: 1 },
  6: { a: 'Si aún haces una sesión de fuerza y recuperas bien, añadir la segunda en otro día. Si ya haces dos, mantenerlas. Dejar inicialmente un día intermedio entre sesiones.', q: '¿El descanso y el tiempo entre sesiones fueron suficientes?', walk: 3, walkMin: 25, str: 2 },
  7: { a: 'Elegir un único avance: algunos minutos aeróbicos, alguna repetición o un ajuste alimentario adicional. No aumentarlos todos.', q: '¿El cambio produjo una mejora que compensa su costo?', walk: 3, walkMin: 25, str: 2 },
  8: { a: 'Revisión mensual. Conservar tres o cuatro ocasiones de movimiento si caben y hasta dos de fuerza si se toleran; pueden compartir día.', q: '¿Qué cantidad real logré, qué efecto tuvo y qué quiero mantener?', walk: 4, walkMin: 25, str: 2 },
  9: { a: 'Elegir un bloque largo sentado y realizar una pausa de movimiento posible al terminar una parte de la tarea. Mantener actividad física tolerada.', q: '¿La pausa ayudó sin entorpecer demasiado el trabajo?', walk: 4, walkMin: 25, str: 2 },
  10: { a: 'Proponer un encuentro gratuito o de bajo costo a alguien con quien disfrutes estar. Si ya tienes contacto satisfactorio, conservarlo.', q: '¿Hubo reciprocidad y satisfacción?', walk: 4, walkMin: 25, str: 2 },
  11: { a: 'Si se tolera y cabe en la agenda, aproximarte gradualmente a 120-150 min moderados semanales y dos sesiones de fuerza. No sumar caminatas ligeras como moderadas.', q: '¿Qué minutos fueron realmente moderados? ¿Cómo recuperé?', walk: 5, walkMin: 25, str: 2 },
  12: { a: 'Revisión de cantidad, resultados y recursos. Ajustar tiempo sentado, pantalla recreativa y vínculo social por separado.', q: '¿Qué cambio quiero conservar y cuál sobra?', walk: 5, walkMin: 25, str: 2 },
  13: { a: 'Preparar la próxima semana exigente: qué se mantiene, qué baja de nivel y qué se pospone. Elegir una sola barrera recurrente para resolver.', q: '¿Mi plan coincide con la agenda real?', walk: 5, walkMin: 25, str: 2 },
  14: { a: 'Si tu Meta P sigue activa, revisar objetivo, contextos y respuesta elegida (guías “Meta P” y “Protocolo de pausa”). Si no lo está, profundizar la prioridad elegida.', q: '¿Hay menos interferencia o más capacidad de elección?', walk: 5, walkMin: 25, str: 2 },
  15: { a: 'Revisar sueño, comida suficiente y recuperación. Si todo va bien, mantener actividad física; no añadir intensidad para compensar una interrupción.', q: '¿El plan ayuda o está compitiendo con necesidades básicas?', walk: 5, walkMin: 25, str: 2 },
  16: { a: 'Comparar la semana habitual con una semana difícil real, si ocurrió. Si no ocurrió, escribir un plan de contingencia sin provocar privación o estrés.', q: '¿Qué ajuste me permitió continuar y qué necesita apoyo?', walk: 5, walkMin: 25, str: 2 },
  17: { a: 'Elegir dos o tres prácticas con mayor beneficio observado. Retirar registros que no cambiaron ninguna decisión.', q: '¿Qué merece quedarse y qué puedo dejar de medir?', walk: 5, walkMin: 25, str: 2 },
  18: { a: 'Mantener la rutina y hacer una revisión semanal breve; si ya es estable, acordar la siguiente revisión a dos semanas.', q: '¿Puedo ajustar por mi cuenta sin perder información importante?', walk: 5, walkMin: 25, str: 2 },
  19: { a: 'Escribir respuestas para exámenes, enfermedad, viaje o dificultad económica. Dejar fecha concreta de la próxima ocasión tras cada pausa prevista.', q: '¿Qué haré ante la barrera más probable?', walk: 5, walkMin: 25, str: 2 },
  20: { a: 'Completar balance final y plan de los próximos tres meses: acciones, frecuencia de revisión, apoyo y criterios para consultar.', q: '¿Mi vida funciona mejor con este plan y con qué costo?', walk: 5, walkMin: 25, str: 2 }
};

C.STATES = [
  ['done', 'Realizada según lo previsto', 'Se hizo la acción acordada.'],
  ['adj', 'Realizada con ajuste', 'Se hizo menos, más o una alternativa. Se anota la cantidad real.'],
  ['stop', 'Intentada e interrumpida', 'Se empezó y se detuvo. Mantener el motivo y aplicar cuidado.'],
  ['rest', 'Descanso previsto', 'No tocaba. No añade minutos ni cuenta como sesión fallida.'],
  ['health', 'Descanso por salud', 'Se decidió no hacerla por enfermedad o síntomas. No exige compensación.'],
  ['no', 'No realizada', 'Estaba prevista y se sabe que no se hizo.'],
  ['np', 'No prevista', 'No formaba parte de ese día. No es incumplimiento.'],
  ['nd', 'Sin dato', 'No se sabe o no se registró. No es cero ni realizada.'],
  ['priv', 'Prefiero no responder', 'Decisión de privacidad. No se infiere conducta.']
];
C.STATE_LABEL = Object.fromEntries(C.STATES.map(s => [s[0], s[1]]));
C.DONE_STATES = ['done', 'adj', 'stop'];

C.BARRIERS = ['Ninguna', 'Tiempo', 'Salud', 'Recursos', 'Olvido', 'Método', 'Prioridad', 'Otra'];

C.FOOD_SITUATIONS = [
  ['azucar', 'Tomo bebidas azucaradas con frecuencia', 'En una ocasión habitual, sustituye por agua o bebida sin azúcar que toleres.'],
  ['rapido', 'Como muy rápido o repito sin darme cuenta', 'Sirve una porción, siéntate y reduce distracción. Antes de repetir, comprueba hambre y satisfacción; come más si lo necesitas.'],
  ['variedad', 'Falta variedad en la comida principal', 'Añade verdura o fruta disponible y una fuente de proteína. Ajusta el conjunto con la comida familiar, sin comprar productos especiales.'],
  ['hambre', 'Llego con hambre intensa tras omitir comidas', 'Organiza una comida o merienda suficiente antes de ese tramo. No uses el hambre extrema como señal de éxito.'],
  ['acceso', 'No hay acceso suficiente a alimentos', 'Prioriza conseguir comida y apoyo. Suspende el objetivo de restricción; trabaja las otras acciones posibles.']
];

C.EXERCISES = [
  ['silla', 'Sentarse y levantarse', 'Silla firme contra la pared. Pies apoyados; inclina un poco el tronco, levántate y vuelve a sentarte con control. Rodillas acompañan la dirección de los pies.', 'Usa manos como apoyo o una silla más alta. No te dejes caer.', false],
  ['pared', 'Empuje en pared', 'Manos en pared a altura cómoda, cuerpo alineado. Flexiona codos, acerca el pecho y empuja para volver.', 'Acerca los pies a la pared para facilitar. Progresar a apoyo más bajo solo si es fijo y estable.', false],
  ['puente', 'Puente de cadera', 'Boca arriba, rodillas flexionadas, pies apoyados. Eleva cadera hasta una línea cómoda entre hombros, cadera y rodillas; baja despacio.', 'Recorrido corto. Si el suelo resulta incómodo, practica bisagra de cadera sin peso con orientación técnica.', false],
  ['remo', 'Remo con carga ligera segura', 'Apoya una mano en superficie firme; espalda cómoda, rodillas ligeramente flexionadas. Con la otra mano lleva una carga ligera hacia el costado, sin girar el tronco. Cambia de lado.', 'Botella cerrada y fácil de agarrar o mancuerna disponible. Si no hay carga segura, omite ese movimiento hasta conseguirla; no tires de puertas o muebles.', true],
  ['tronco', 'Control de tronco en cuatro apoyos', 'Manos bajo hombros, rodillas bajo caderas. Extiende lentamente un brazo o una pierna, vuelve y alterna. Mantén tronco estable.', 'Empieza moviendo una sola extremidad. Brazo y pierna contrarios juntos solo cuando controles la versión fácil.', true]
];

C.ADJUST_RULES = [
  ['Síntomas de alarma o riesgo inmediato', 'Detener la actividad implicada y buscar atención apropiada.', 'Según atención recibida; no esperar al domingo.'],
  ['Falta de comida, descanso muy insuficiente o deterioro importante', 'Resolver la necesidad y reducir exigencia. Suspender restricción alimentaria o ejercicio intenso.', 'Tan pronto como cambie la situación.'],
  ['Dolor nuevo o recuperación mala', 'Reducir o retirar el ejercicio problemático y revisar técnica; consultar si persiste.', 'Antes de volver a progresar.'],
  ['La acción no cabe en la agenda', 'Acortar duración o frecuencia, cambiar ocasión o retirar una tarea secundaria.', 'En la siguiente ocasión y revisión semanal.'],
  ['La acción cabe, pero se olvida', 'Asociarla a una transición visible y dejar recursos preparados.', 'Durante una semana de uso real.'],
  ['La realizas, pero no aporta el resultado esperado', 'Verificar si se mide bien, si pasó tiempo suficiente y si el método corresponde a la meta.', 'Semanal para método; mensual para apariencia.'],
  ['Ayuda, cabe y recuperas bien', 'Mantener. Progresar una sola variable si aporta valor y lo deseas.', 'En la próxima revisión.'],
  ['Datos insuficientes', 'Mantener una versión cómoda y recoger solo el dato decisivo.', 'En la próxima revisión; no inferir fracaso.']
];

C.CONTINGENCIES = [
  ['Lluvia, calor o trayecto inseguro', 'Marcha o baile suave en casa si hay espacio; otra hora o lugar seguro.'],
  ['Día con menos de 20 min libres', 'Movimiento breve si corresponde, comida suficiente y próxima ocasión definida. No ocupar el sueño.'],
  ['Gasto imprevisto', 'Acciones gratuitas; comida familiar accesible; contacto sin salida pagada. El límite adicional puede ser cero.'],
  ['Viaje o visita', 'Usar caminatas del traslado, rutina breve sin equipo y una comida organizada. Regresar gradualmente.'],
  ['Enfermedad o lesión', 'Descanso y atención según síntomas. Mantener solo acciones compatibles; no compensar al volver.'],
  ['No hay privacidad', 'Registrar solo datos no íntimos o no registrar. Usa una frase privada si necesitas recordar tu intención.'],
  ['Desmotivación', 'Reducir la entrada a un paso concreto y revisar sentido, barreras y apoyo; no multiplicar obligaciones.'],
  ['Horario impredecible', 'Elegir una señal por evento, como “al terminar la última clase”, con una segunda ocasión disponible.'],
  ['Semana de exámenes', 'Conserva oportunidades breves de movimiento, una sesión de fuerza si cabe, comidas suficientes y sueño. El estudio activo reemplaza parte del estudio habitual. El protocolo de pausa se usa solo cuando hace falta. No acumules sesiones “pendientes” para después del examen.']
];

/* Guías: texto del manual, condensado sin añadir contenido */
C.GUIDES = [
  { id: 'reglas', sec: '2', title: 'Reglas que se aplican siempre', html: `
<ul>
<li>Elige <b>dos acciones principales</b>. Las demás se incorporan solo si ya caben en tu rutina, reemplazan algo existente o pasan a ser una prioridad.</li>
<li>Antes de actuar, define una <b>ocasión concreta</b>: después de qué actividad, en qué lugar y con cuánto tiempo.</li>
<li>Una alternativa reducida es una acción real. Anota su cantidad real; cinco minutos no se convierten en treinta.</li>
<li>Descanso previsto, descanso por salud, acción no realizada y dato faltante son situaciones distintas. No son fallos personales.</li>
<li>Cada semana revisas utilidad, carga y efectos no deseados. No necesitas esperar al cambio de fase para modificar el plan.</li>
<li>Si cambias un objetivo, escribes la nueva elección y desde cuándo se aplica. No reinterpretas semanas anteriores.</li>
</ul>
<p><b>Orden ante conflictos:</b> salud y necesidades básicas → obligaciones esenciales → acciones principales → acciones opcionales. El sueño, la comida y el descanso no financian el cumplimiento de las demás.</p>
<p>“No sé”, “no lo registré” y “prefiero no responder” son respuestas válidas. Las escalas 0-10 expresan tu percepción; no diagnostican.</p>` },
  { id: 'aerobico', sec: '12', title: 'Actividad aeróbica', html: `
<p>Caminar, bailar, pedalear u otra actividad segura y accesible. Si vienes de inactividad: 15-20 min totales, tres días, que puede fraccionarse.</p>
<ul>
<li><b>Antes:</b> comprueba tiempo, lugar, calzado cómodo y ausencia de síntomas nuevos. Si el entorno no es seguro o hay calor intenso, cambia a una opción interior o a otra hora.</li>
<li><b>Durante:</b> unos minutos suave; en el tramo central aumenta el ritmo solo hasta un esfuerzo controlable; termina unos minutos suave. Lleva agua si la duración o el calor lo aconsejan.</li>
<li><b>Prueba de conversación:</b> a intensidad moderada puedes hablar, pero cantar resulta difícil. Si apenas salen unas palabras, es vigoroso.</li>
<li><b>Después:</b> anota minutos totales, minutos moderados aproximados, sensación y síntomas. No necesitas reloj deportivo ni calorías.</li>
</ul>
<table><tr><th>Situación</th><th>Respuesta</th></tr>
<tr><td>No toleras el tramo previsto</td><td>Reduce velocidad o duración; puedes dividirlo en dos.</td></tr>
<tr><td>Terminas cómodo y recuperas bien</td><td>Repite. Para progresar, amplía una ocasión unos 5 min antes de aumentar más cosas.</td></tr>
<tr><td>Dolor nuevo, mareo o falta de aire anormal</td><td>Detén la actividad y consulta “Cuidado”.</td></tr>
<tr><td>Solo tienes 5 minutos</td><td>Hazlos si son seguros, registra 5 y continúa tu día.</td></tr></table>
<p>Referencia para adultos: 150-300 min semanales moderados, o 75-150 vigorosos, además de fuerza. Es una orientación a la que aproximarse gradualmente; hacer menos también puede aportar beneficios.</p>` },
  { id: 'fuerza', sec: '13-14', title: 'Fuerza: sesión y técnica', html: `
<p>Sirve a tu objetivo de desarrollar músculo y ayuda a conservar masa libre de grasa durante una pérdida de peso. No requiere gimnasio.</p>
<ul>
<li><b>Preparación (3-5 min):</b> marcha cómoda y movimientos suaves; ensaya 1-2 repeticiones fáciles de cada ejercicio. Superficie estable y espacio despejado.</li>
<li><b>Trabajo:</b> los cinco movimientos. Una serie de 6-10 repeticiones controladas por ejercicio (menos si la técnica cambia). Tronco: 4-6 por lado.</li>
<li><b>Esfuerzo:</b> termina sintiendo que podrías hacer unas 2-3 repeticiones más. No hace falta llegar al fallo.</li>
<li><b>Pausas:</b> 60-120 s entre series o ejercicios. Respira durante el movimiento.</li>
<li><b>Cierre:</b> camina suave y anota ejercicios, series, repeticiones y comodidad. No hagas prueba máxima.</li>
</ul>
<p><b>Frecuencia:</b> una sesión si estás retomando; busca dos semanales según tolerancia, con un día intermedio.</p>
<table><tr><th>Si ocurre esto</th><th>En la siguiente sesión</th></tr>
<tr><td>La técnica se mantiene y recuperas bien</td><td>Repite o añade 1-2 repeticiones en un ejercicio.</td></tr>
<tr><td>Llegas a 10-12 repeticiones cómodas en dos sesiones</td><td>Elige solo un cambio: variante algo más difícil, carga pequeña y segura, o segunda serie.</td></tr>
<tr><td>Fatiga que interfiere o molestia relevante</td><td>Reduce carga o series; revisa técnica. Dolor persistente requiere valoración.</td></tr></table>
<h4>Técnica</h4>
${C.EXERCISES.map(e => `<p><b>${e[1]}.</b> ${e[2]}<br><span class="muted">Alternativa/límite: ${e[3]}</span></p>`).join('')}
<p>Es esperable notar trabajo muscular; dolor punzante, articular, eléctrico, mareo o pérdida de control no son señales para insistir. Si no entiendes la técnica, pide una demostración a una persona cualificada antes de añadir carga.</p>` },
  { id: 'apariencia', sec: '15', title: 'Progresión y expectativas', html: `
<p>El plan aborda grasa corporal general, fuerza y hábitos sostenibles. No puede seleccionar de qué zona pierdes grasa (cara, caderas) ni prometer una forma concreta del rostro. Adelgazar no reduce el tamaño óseo de la mandíbula.</p>
<p><b>Regla de progreso semanal:</b> primero revisa dolor, sueño y recuperación; después la agenda. Si la carga se tolera y cabe, elige <b>una sola</b> modificación. Mantener también es una decisión válida.</p>
<table><tr><th>Situación</th><th>Decisión</th></tr>
<tr><td>Te saltaste una sesión</td><td>Retoma la próxima ocasión. No dobles la dosis.</td></tr>
<tr><td>Pausa de varios días por agenda</td><td>Vuelve a una dosis conocida; si notas esfuerzo mayor, usa menos tiempo o series.</td></tr>
<tr><td>Pausa prolongada o enfermedad</td><td>Retoma por debajo del nivel previo cuando estés recuperado.</td></tr>
<tr><td>No ves cambios tras varios días</td><td>No ajustes por el espejo diario. Usa la revisión mensual.</td></tr>
<tr><td>3-4 semanas consistentes sin tendencia deseada</td><td>Revisa datos, comidas, actividad y expectativas. Cambia una decisión sostenible o solicita ayuda nutricional; no recortes drásticamente comida.</td></tr></table>
<p>No se incluyen ejercicios de mandíbula, deshidratación, fajas, “quemadores” ni castigos con cardio. No se fija un número de kilos. Si alcanzas una apariencia que te satisface, cambia a mantenimiento.</p>` },
  { id: 'comida', sec: '16-17', title: 'Alimentación', html: `
<p>No hace falta contar calorías. El primer paso es un ajuste pequeño que mantenga alimentación suficiente, variedad y rendimiento.</p>
<table><tr><th>Si ocurre habitualmente</th><th>Acción</th></tr>
${C.FOOD_SITUATIONS.map(f => `<tr><td>${f[1]}</td><td>${f[2]}</td></tr>`).join('')}</table>
<p><b>Estructura flexible:</b> proteína (huevo, legumbres, pescado, pollo, lácteos) + alimento energético (arroz, avena, papa, yuca, pan) + fruta o verdura. Ej.: arroz con lentejas, huevo y ensalada. No elimines automáticamente carbohidratos ni cenas. Suplementos no son necesarios.</p>
<ul>
<li><b>Desayuno:</b> avena con leche y fruta; o pan con huevo y fruta.</li>
<li><b>Comida familiar:</b> conserva el plato servido, identifica proteína y vegetal, elige agua si normalmente tomas bebida azucarada. No necesitas pesar el plato.</li>
<li><b>Merienda si hace falta:</b> fruta con yogur, sándwich sencillo, legumbres.</li>
<li><b>Salida:</b> elige algo que disfrutes y puedas pagar. Retoma en la siguiente comida. Una salida no cancela la semana.</li>
</ul>
<p>Si quedas con hambre, puedes comer más. Una comida abundante no se compensa saltando la siguiente ni entrenando de más. Si hay hambre persistente, debilidad o preocupación creciente, reduce la restricción.</p>` },
  { id: 'sueno', sec: '18', title: 'Sueño y estrés', html: `
<p>Para adultos, 7-9 horas es una referencia frecuente, con variación individual. La regularidad ayuda, sin exigir una hora exacta.</p>
<ul>
<li>Elige una hora aproximada de levantarte y cuenta hacia atrás el descanso necesario; evita financiar el plan acostándote cada vez más tarde.</li>
<li>Al terminar el estudio, escribe el siguiente paso para mañana. Dedica un tramo breve a una actividad tranquila.</li>
<li>Si la cafeína vespertina o el teléfono recreativo retrasan tu sueño, modifica una de esas condiciones.</li>
</ul>
<p><b>Práctica breve ante estrés o impulso (1-2 min):</b> nota los pies apoyados, identifica lo que ves y oyes, respira de forma cómoda. Nombra la experiencia (“estoy sintiendo tensión”). Después elige un paso pequeño coherente con tu meta.</p>
<p>Si el insomnio se mantiene o hay ronquidos intensos con pausas respiratorias, solicita valoración.</p>` },
  { id: 'estudio', sec: '19', title: 'Estudio activo', html: `
<p>Se realiza en tu tiempo habitual de estudio; no ocupa los 90-120 min libres.</p>
<ul>
<li><b>0-2 min:</b> define una pregunta o problema preciso. Prepara material y una forma de verificar.</li>
<li><b>2-12 min:</b> intenta explicar o resolver sin mirar. Si te bloqueas, señala el punto exacto.</li>
<li><b>12-20 min:</b> compara con una fuente fiable, corrige el error y explica por qué ocurrió.</li>
<li><b>20-25 min:</b> intenta de nuevo el paso difícil o un ejemplo parecido. Programa un reencuentro.</li>
</ul>
<table><tr><th>Resultado</th><th>Próxima acción</th></tr>
<tr><td>Lo resolví y puedo explicarlo</td><td>Vuelve a comprobarlo otro día con un problema distinto o más integrado.</td></tr>
<tr><td>Recordé parte pero cometí un error</td><td>Anota el tipo de error y practica un ejemplo centrado en ese punto.</td></tr>
<tr><td>No comprendí la idea básica</td><td>Vuelve a una explicación guiada; consulta al docente o compañero.</td></tr>
<tr><td>No tuve tiempo</td><td>Haz un paso de 5-10 min o agenda una ocasión real.</td></tr></table>
<p>Revisita al día siguiente, a los tres días y a la semana (propuesta organizativa, ajustable).</p>` },
  { id: 'pantallas', sec: '20', title: 'Tiempo sentado y pantallas', html: `
<p>Actividad física, tiempo sentado y pantalla recreativa son variables distintas.</p>
<ul><li>Elige una transición natural para levantarte (al acabar un problema, entre clases). Pausa de 2-5 min: caminar, ir por agua, movilidad o cambiar de postura.</li>
<li>Si la pantalla desplaza sueño, estudio o vínculo, elige una situación concreta: teléfono fuera de alcance en un bloque, o terminar ocio a una hora acordada.</li></ul>
<p><b>Reemplazo decidido antes:</b> “Cuando termine ___, me moveré ___ min en ___. Si no puedo, haré ___”. “Al acabar ___, dejaré el teléfono en ___ y pasaré a ___”.</p>
<p>Las pausas no sustituyen el entrenamiento ni se suman como minutos moderados.</p>` },
  { id: 'vinculos', sec: '21', title: 'Vínculos y ocio', html: `
<p>Objetivo: contacto satisfactorio y descanso elegido. No hay cuota de amistades, horas sociales ni gasto.</p>
<ul><li>Elige a alguien con quien sea razonable hablar o coincidir.</li>
<li>Propón algo específico y de bajo costo: caminar, conversar después de clase, repasar juntos.</li>
<li>Observa reciprocidad. Una invitación sin respuesta no obliga a insistir.</li></ul>
<p><b>Invitar:</b> “Voy a caminar un rato después de clase el jueves. ¿Te gustaría acompañarme?”<br>
<b>Alternativa:</b> “Si ese día no puedes, podemos conversar diez minutos cuando coincidamos”.<br>
<b>Rechazo:</b> “Está bien, gracias por responder”.<br>
<b>Límite propio:</b> “Esta semana necesito descansar; prefiero retomarlo la próxima”.</p>
<p>Un paseo compartido cubre movimiento y vínculo, pero sus minutos se cuentan una vez. No compartas tus registros íntimos para demostrar compromiso.</p>` },
  { id: 'metap', sec: '22', title: 'Meta P: acuerdo personal', private: true, html: `
<p>Tu elección confirmada es abandonar la masturbación. Activa desde el primer día. Es una decisión personal; por sí misma no implica un trastorno, y no se prometen beneficios hormonales, físicos o morales por abstenerse.</p>
<p><b>Qué incluye:</b> estimulación sexual deliberada de tu propio cuerpo con finalidad de excitación o placer, haya o no orgasmo. <b>No cuentan:</b> higiene, cuidado médico, contacto accidental, pensamientos, erecciones, sueños y emisiones nocturnas.</p>
<ul><li>Identifica una situación frecuente real (en la cama despierto, aburrimiento, estrés, soledad…). No inventes desencadenantes.</li>
<li>Prepara una alternativa breve que responda a la necesidad: descanso si hay cansancio, tarea concreta si hay aburrimiento, contacto si necesitas compañía.</li>
<li>La pornografía solo es objetivo separado si existe y deseas trabajarla.</li></ul>
<p><b>Progreso:</b> la abstinencia es el resultado elegido. Observa además si reconoces antes el impulso, ejecutas una respuesta, recuperas tu rutina y disminuye la interferencia. Un episodio es información sobre una ocasión; no borra otras acciones ni obliga a empezar de nuevo.</p>
<p>Contar días es opcional (Ajustes). La racha no mide dignidad ni salud. Los impulsos no necesitan desaparecer para que actúes conforme a tu meta.</p>` },
  { id: 'impulso', sec: '23', title: 'Protocolo de pausa y episodio', private: true, html: `
<ol><li><b>Reconoce:</b> “Tengo un impulso; puedo elegir el siguiente paso”. Intensidad baja/media/alta si te sirve.</li>
<li><b>Haz una pausa:</b> deja lo que estás usando y orienta la atención al entorno 1-2 minutos. Respira cómodamente.</li>
<li><b>Cambia de contexto:</b> sal de la cama si estabas con el teléfono, deja el dispositivo en otro lugar o ve a otro espacio.</li>
<li><b>Alternativa ~10 min:</b> tarea doméstica corta, lectura, descanso fuera de la cama o caminar suave. Por utilidad, no como castigo.</li>
<li><b>Revisa:</b> “¿Puedo continuar mi actividad?”. Si sigue, repite la pausa o cambia de alternativa.</li></ol>
<p><b>Si ocurrió:</b> detén la autocrítica y vuelve a la siguiente actividad normal. No compenses con ayuno, ejercicio excesivo, privación de sueño, dolor ni castigos. La siguiente decisión puede volver a alinearse con tu objetivo. Si hubo irritación, evita seguir causando molestias y busca atención si hay dolor persistente.</p>
<p>Preguntas breves: ¿qué pasó justo antes? ¿qué intenté y qué faltó? ¿qué cambiaré en la próxima ocasión? ¿hubo daño o interferencia importante? (si se repite, solicita evaluación sin esperar al final del plan).</p>
<p class="muted">Herramienta práctica de autorregulación, no un tratamiento validado.</p>` },
  { id: 'ajustes', sec: '27', title: 'Reglas para decidir ajustes', html: `
<p>Una condición superior tiene prioridad sobre las inferiores.</p>
<table><tr><th>Condición</th><th>Respuesta</th><th>Revisar</th></tr>
${C.ADJUST_RULES.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table>
<p>Si dormiste poco, tienes una entrega y no hiciste fuerza, la respuesta no es añadir fuerza por la noche: protege descanso, caminata breve si cabe y programa fuerza para una ocasión viable.</p>` },
  { id: 'contingencias', sec: '11, 29', title: 'Tiempo, dinero y contingencias', html: `
<p>Para empezar basta un lugar seguro, ropa cómoda, una silla firme, comida disponible y una forma privada de anotar. No se requiere gimnasio, suscripción, suplemento, báscula ni material nuevo.</p>
<table><tr><th>Barrera</th><th>Versión que mantiene la intención</th></tr>
${C.CONTINGENCIES.map(c => `<tr><td>${c[0]}</td><td>${c[1]}</td></tr>`).join('')}</table>
<p><b>Regla de regreso:</b> “La siguiente ocasión posible es ___ y haré ___ a un nivel que ahora tolere”. No hay obligación de recuperar todo en 48 horas.</p>
<p><b>Ejemplo de día con 90 min:</b> movimiento 45 min; preparación de comida 10; cierre 2; ocio, vínculo o margen 33. Ducha o traslado salen del mismo presupuesto.</p>` },
  { id: 'ejemplos', sec: '33', title: 'Ejemplos de ajuste', html: `
<p><b>Examen y caminata omitida:</b> “El problema fue agenda; no hay dolor. No haré una sesión doble”. → Dos caminatas breves y una fuerza conocida; mantener comida y sueño.</p>
<p><b>Episodio tras estudiar tarde con teléfono en la cama:</b> “Estaba cansado y no recordé mi alternativa”. → Dejar el teléfono en otro lugar al acostarte y preparar una actividad tranquila. No quitar comida, sueño ni descanso.</p>
<p><b>No se aprecia cambio corporal tras una semana:</b> “Aún es pronto”. → Continuar y revisar mensualmente.</p>
<p><b>Hambre intensa al final del día por omitir comida:</b> → Restaurar esa comida; no compensar al día siguiente.</p>
<p><b>Semana sin registros:</b> “Cantidad desconocida”. → Mantener una versión cómoda y registrar solo minutos reales. No reconstruir una racha.</p>
<p><b>Dolor de rodilla al levantarte de la silla:</b> → Interrumpir ese ejercicio, revisar técnica, consultar si persiste.</p>` },
  { id: 'medir', sec: '31', title: 'Medir sin depender de una cifra', html: `
<ul><li><b>Movimiento:</b> minutos reales por intensidad; fuerza por sesiones. No sumar ligero como moderado.</li>
<li><b>Capacidad:</b> comparar una ruta o ejercicio similar cada cuatro semanas, sin prueba máxima.</li>
<li><b>Apariencia (opcional):</b> misma prenda mensual con luz, postura y ropa parecidas. No evaluarla varias veces al día.</li>
<li><b>Peso (opcional):</b> una vez por semana en condiciones similares. <b>Cintura:</b> cada cuatro semanas, cinta horizontal sin comprimir, mismo punto entre costilla inferior y parte superior de la cadera, tras una espiración normal.</li>
<li><b>Meta P:</b> días con resultado conocido; episodios si deseas y respuesta utilizada.</li></ul>
<p>Los datos no se suman en una nota global. “Sin dato” no se convierte en cero ni en realizado.</p>` }
];

C.CARE = {
  urgent: 'Detén el ejercicio y busca atención urgente ante dolor u opresión de pecho, desmayo, dificultad respiratoria intensa o inesperada, debilidad súbita u otros síntomas graves. Si hay intención de hacerte daño o no puedes mantenerte a salvo, contacta los servicios de emergencia de tu zona y busca compañía de confianza. No esperes a una revisión del plan.',
  table: [
    ['Dolor persistente, lesión, fatiga inusual o síntomas al esfuerzo', 'Atención médica; fisioterapia o profesional de ejercicio según evaluación.'],
    ['Necesitas pauta de calorías, porciones o cambios de peso individualizados', 'Profesional de nutrición con revisión de salud, alimentación y objetivos.'],
    ['Restricción marcada, vómitos provocados o pérdida de control alimentaria repetida', 'Evaluación de salud y salud mental con experiencia en conducta alimentaria.'],
    ['Preocupación por apariencia que ocupa mucho tiempo, genera evitación o deterioro', 'Apoyo psicológico; reducir comprobaciones y registros que intensifiquen el problema.'],
    ['Dificultad persistente con pérdida de control sexual, deterioro o angustia relevante', 'Profesional de salud mental o sexología clínica cualificado, respetuoso con tus valores.'],
    ['Insomnio persistente, ánimo muy bajo o ansiedad que limita la vida', 'Atención primaria o salud mental; no aumentar exigencias para ocultar el problema.']
  ],
  consult: 'Describe la dificultad, desde cuándo ocurre, cómo afecta tu vida, qué intentaste y qué esperas. Puedes llevar un resumen de una semana. No necesitas entregar detalles íntimos ni fotografías.',
  privacy: 'Guarda solo la información útil. Decide qué compartir, con quién y para qué. No se requiere supervisión familiar, publicar peso o rachas ni pedir a terceros que vigilen tu conducta. Puedes dejar de medir una variable si te perjudica.',
  disclaimer: 'Guía de acción informada por evidencia; no es diagnóstico ni autorización clínica.'
};
