# Informe: simulación de 2 meses de uso en Galaxy Tab S9 FE

**Versión probada:** Plan 20 v2.3 (`versionCode 7`), commit `a9e21c0`
**Fecha del informe:** 25 sep 2026
**Periodo simulado:** 23 sep 2026 → 22 nov 2026 (61 días, semanas 1 a 9 del plan)

## Resultado

**La app aguanta bien los 2 meses de uso.** No hubo errores de JavaScript, pantallas rotas, pérdida de datos, descuadres en progreso ni en la racha, ni caídas de rendimiento.

La primera corrida encontró **1 fallo real** y **4 observaciones**. Luego se corrigieron el fallo y 3 de las observaciones, más 2 fallos del flujo de compilación del APK (ver "Correcciones aplicadas"). La corrida posterior a los arreglos pasa **28/28 chequeos, sin hallazgos**, y `npm test` pasa **93/93**.

| Indicador | Resultado |
|---|---|
| Pruebas automáticas (`npm test`) | 88/88 antes; 93/93 después de los arreglos (5 pruebas nuevas) |
| Días simulados | 61 |
| Errores JS / `console.error` | 0 / 0 |
| Chequeos de la simulación | 26/27 antes (el fallido era el fallo 1); 28/28 después de los arreglos |
| Registros creados | 270 (60 sueño, 90 comida, 26 aeróbico, 43 estudio, 15 pausa, 20 impulso, 8 vínculo, 8 medida) |
| Revisiones semanales | 9 de 9 guardadas |
| Reinicios del proceso (Android mata la app) | 10, todos con recuperación correcta |
| Gasto de IA simulado | $1.89 de $7 (≈ $0.035/día; al ritmo actual el saldo alcanza ~145 días más) |
| Almacenamiento al día 61 | 130 KB de datos (≈ 2 KB/día); 218 KB en total contando la copia previa a la importación |
| Memoria JS | máx. 28 MB, sin crecimiento sostenido |
| Nodos DOM en Inicio | estable (≈ 400) aunque haya 2 meses de conversación |
| Tiempo de dibujo por pantalla | ≤ 15 ms en todas (día 1 vs día 61 sin degradación) |

## Cómo se probó

### Dispositivo emulado

| Parámetro | Valor |
|---|---|
| Modelo | Samsung Galaxy Tab S9 FE (SM-X510) |
| Pantalla | 2304×1440 px con densidad 2.0, es decir 1152×720 CSS en horizontal y 720×1152 en vertical |
| Sistema | Android 14, WebView Chromium 129 (user-agent de la tablet), pantalla táctil |
| Zona horaria / idioma | America/Guayaquil (UTC−5, sin horario de verano) / es-EC |

**Limitación importante:** este entorno no tiene emulador Android (no hay KVM) ni acceso a las descargas del Android SDK. Por eso **no se instaló el APK en un Android real ni emulado**. La app web (`www/`) se ejecutó en Chromium con la resolución, densidad, tacto y user-agent de la S9 FE, y los componentes nativos se simularon. El código Java se revisó a mano. El APK lo sigue compilando el flujo de GitHub Actions en cada `push`.

### Componentes nativos simulados

Se usan en modo "app instalada" (`isNativePlatform() = true`):

- `App`: segundo plano, primer plano y botón Atrás.
- `LocalNotifications`: registra cada aviso programado.
- `CapacitorHttp`: la IA responde con herramientas reales (`registrar`, `plan_del_dia`, `meta_p`, `recordar`, `briefing_del_dia`) y consumo de tokens realista.
- `Shield`: permisos concedidos, eventos de pausa y minutos por app.
- `Filesystem` y `Share`: exportar la copia.
- `ContinuousSpeech`.

### Guion diario (con reloj controlado y datos persistentes entre días)

| Hora | Acción |
|---|---|
| 07:10 | La app vuelve de segundo plano y pide el PIN. Cada 6 días, en cambio, Android había matado el proceso. Se registra el sueño con el formulario, se aceptan propuestas en "Tu día" y se marca "¿Y ayer?". |
| Mañana | Apertura del día (60 % de los días). |
| 13:05 | Almuerzo contado al asistente (2 de cada 3 días) o registrado a mano. |
| 17:30 | Caminata o fuerza según el plan semanal (80 % cumplida, 20 % "no hecha" con barrera). Estudio los días de semana, con repasos +1/+3/+7 y el bloque guiado de 25 min, saliendo y volviendo a la app a mitad. |
| 20:15 | Cena por conversación, datos que el asistente debe recordar y un borrador sin enviar. Pausas activas, vínculo (sábados) y peso (lunes). |
| 23:20 | Impulso ≈ 1 de cada 4 noches, con protocolo de pausa y alternativa de 10 min. Recaída ≈ 1 de cada 10 noches, con registro y evento del Escudo. Al día siguiente se responde la pregunta del asistente sobre la pausa. |
| Noche | Meta P del día, cierre del día (60 %) y revisión semanal el último día de cada semana. Algunas revisiones deciden "progresar una variable" (+5 min de caminata en la semana siguiente). |
| 23:55 | La app pasa a segundo plano y se bloquea. |

### Eventos especiales

| Cuándo | Evento |
|---|---|
| Día 1 | Uso sin clave de IA; después se activa la IA y el Escudo. |
| Día 16 | Cambio de tema a oscuro y vuelta al del sistema. |
| Día 21 | Caída del servicio de IA (error 529) y "Reintentar". |
| Días 31 y 32 | Exportar la copia de seguridad e importarla. |
| Cada 3 días | Recorrido por las 11 pantallas, midiendo el tiempo de dibujo. Cada 7 días, además en vertical. |
| Cada 10 días | Botón Atrás con un formulario a medias. |
| Cada 11 días | Editar y borrar registros desde el historial. |

### Invariantes comprobados cada noche

- Ningún registro con fecha inválida, futura o anterior al inicio.
- Ningún ID repetido.
- Los minutos de la semana en Progreso coinciden con la suma de los registros.
- La racha de la Meta P coincide con un cálculo independiente.
- Cada día con recaída tiene su registro de impulso.
- No hay desbordamiento horizontal en ninguna pantalla, ni en horizontal ni en vertical.
- Se miden el tamaño del almacenamiento, la memoria, los nodos DOM y los avisos programados.

## Fallos encontrados

### 1. [Corregido] Sin aviso preventivo si la hora de riesgo es después de medianoche (confirmado)

- **Dónde:** `www/asistente.js:356-359` (`scheduleRiskNotice`).
- **Qué pasa:** el aviso se programa con `at.setHours(hh, mm - 30)` sobre la fecha de **hoy**. Si los episodios suelen ser, por ejemplo, a las 00:40, la hora calculada es hoy a las 00:10, que ya pasó cuando se abre la app por la mañana. Por eso `at <= new Date()` descarta el aviso y **nunca se programa**.
- **Reproducción:** hay dos episodios a las 00:20 y 00:40. `riskToday().hora` es `"00:40"` y `flags.riskNote` queda en `null`, sin notificación con id 301. En cambio, con episodios a las 23:40 y 23:50 el aviso sí se programa a las 23:20.
- **Impacto:** alto para quien tiene sus momentos de riesgo justo después de medianoche, que es un patrón frecuente. El Escudo sí cubre esa franja, porque `riskWindows()` calcula bien la ventana 23:40–02:10. El fallo solo afecta a la notificación del asistente.
- **Arreglo sugerido:** si la hora calculada ya pasó y la hora de riesgo es de madrugada (por ejemplo, antes de las 06:00), programar el aviso para mañana a esa hora.

## Observaciones (no son fallos, pero conviene revisarlas)

1. **[Corregido] Avisos inexactos en Android 14.** El manifiesto no declara `SCHEDULE_EXACT_ALARM` ni `USE_EXACT_ALARM`. En Android 14 ese permiso viene denegado por defecto, así que `@capacitor/local-notifications` usa `setAndAllowWhileIdle` (inexacto). Los recordatorios y el aviso de riesgo pueden llegar varios minutos tarde. Solo se puede confirmar en la tablet.
2. **[Corregido] La copia de Android incluye datos sensibles.** `android:allowBackup="true"` (`AndroidManifest.xml:6`) hace que Android copie el `localStorage` a la cuenta de Google, incluida la clave de API (`plan20.apikey`) y el hash del PIN. Eso contradice "queda guardada solo en ese dispositivo" del README. Opciones: `allowBackup="false"` o reglas de exclusión.
3. **[Corregido] Importar una copia no pide confirmación.** Al importar la copia del día 30 el día 31, se reemplazaron sin aviso los registros hechos ese día después de exportar. Es el comportamiento esperado de "restaurar", pero se guarda el estado anterior en `plan20.prev` (`app.js:1216`) y no hay ningún botón para recuperarlo. Sugerencia: pedir confirmación mostrando cuántos registros se perderán, u ofrecer "Deshacer importación".
4. **[Sin cambios, es una decisión de diseño] El presupuesto de IA es total, no mensual.** Con el uso simulado (saludo diario con IA y 2 o 3 mensajes al día) se gastaron $1.89 en 2 meses. Los $7 por defecto alcanzan para las 20 semanas, con margen. Los usuarios muy conversadores entrarán antes en modo ahorro (al 80 %).

## Correcciones aplicadas

| Problema | Arreglo | Cómo se comprueba |
|---|---|---|
| Fallo 1: sin aviso preventivo con riesgo de madrugada | `scheduleRiskNotice` (`www/asistente.js`): si la hora de riesgo es antes de las 06:00 y ya es de día, el aviso se programa para la noche que viene | Prueba de regresión 32 (00:40 → aviso a las 00:10 del día siguiente; 23:50 → 23:20 del mismo día) y chequeo de la simulación |
| Observación 1: avisos inexactos | `AndroidManifest.xml`: `USE_EXACT_ALARM` (Android 13+, se concede al instalar) y `SCHEDULE_EXACT_ALARM` hasta Android 12 | Solo en la tablet: el aviso de prueba de Ajustes debe llegar a los 5 s |
| Observación 2: copia de Google con datos sensibles | `allowBackup="false"` y `res/xml/data_extraction_rules.xml`, que excluye todo de la copia en la nube y de la transferencia entre dispositivos. Para mover datos: Ajustes → Exportar copia | Revisión del manifiesto |
| Observación 3: importar sin confirmación | Antes de reemplazar, la app muestra cuántos registros tiene la copia y cuántos se perderán, y pide confirmación. Después aparece "Deshacer importación" en Ajustes, que vuelve al estado anterior y conserva el PIN | Prueba de regresión 33 y chequeo de la simulación |
| CI: `npx cap sync` fallaba ("Could not find installation of TypeScript") porque `capacitor.config.ts` necesita TypeScript | `typescript` agregado a `devDependencies` | `npx cap sync android` termina bien |
| Calendario de la Meta P deformado en la tablet (en Progreso solo se veía la columna "L"): la celda de hoy heredaba `height:100vh` de la clase `.today` del panel "Tu día" y, por su `aspect-ratio`, estiraba la columna a 720 px. Lo encontré al capturar pantallas para la guía; la simulación no lo detectó porque solo medía el desbordamiento horizontal de la página | Estilos del panel limitados a `aside.today` y cuadrícula con `minmax(0,1fr)` | Prueba de regresión 34 |
| CI: `./gradlew: Permission denied` | `android/gradlew` marcado como ejecutable en git (modo 100755) | Por eso falló el primer run de Actions, "Versión inicial" |

**Nota para quien actualice:** con `allowBackup="false"`, Android ya no guarda estos datos en la copia de Google. Actualizar el APK encima de la versión anterior no borra nada, pero conviene exportar una copia desde Ajustes de vez en cuando.

## Lo que funcionó bien

- **Ciclo de vida:** 10 cierres forzados del proceso y 50 bloqueos por segundo plano. Siempre volvió a pedir el PIN, restauró el temporizador de estudio con el tramo correcto y ofreció continuar o descartar los borradores.
- **Cambio de día con la app abierta** y semanas que empiezan en miércoles (la semana 1 es corta). El plan semanal hereda la carga y la progresión de +5 min se aplicó solo a la semana siguiente.
- **Asistente:** 134 llamadas a la IA simulada. Registró comidas, marcó la Meta P, guardó memoria (4 datos) y actualizó "Tu día". La conversación se mantiene en 80 mensajes y no crece sin límite. Con la IA caída mostró un error con "Reintentar", que registró correctamente, y usó la propuesta local sin coste.
- **Meta P:** 12 recaídas y 20 impulsos. Racha y récord correctos todos los días (máximo 12). El chip "¿Y ayer?" completa los días sin dato.
- **Escudo:** 19 pausas nocturnas recibidas, cada una con su pregunta de seguimiento respondida. Los minutos por app se acumulan por noche.
- **Diseño:** sin desbordamiento horizontal en ninguna de las 11 pantallas, ni en horizontal (1152 px) ni en vertical (720 px).
- **Rendimiento estable:** Inicio tarda 5 ms el día 1 y 11 ms el día 61, y Progreso 6 ms y 7 ms. La memoria sube y baja con el recolector, sin fugas.

## v2.5: Brújula en la simulación

La simulación incluye ahora a Brújula: su pantalla entra en el recorrido y hay 3 chequeos al final. Resultado: **31/31 chequeos, 0 errores JS**, y la pantalla Brújula se dibuja en ≤ 9 ms.

En esta simulación las recaídas son **al azar** (no dependen del sueño ni del día). La prueba retrospectiva de Brújula lo detecta: con sus predicciones, el acierto queda un 5 % por debajo de una tasa fija, en 46 noches. Por eso pasa a **modo prudente**, con reglas simples calibradas, y no inventa patrones. Es el comportamiento esperado.

Con un patrón real (`pruebas_brujula.js`: recae los jueves tras dormir poco, cerca de medianoche), Brújula lo descubre:
- riesgo de 78 % ese jueves frente a 9 % un lunes normal;
- ventana 22:45–01:00;
- mejora un 64 % a una tasa fija.

## v2.6: Agenda, conversación, imágenes y modo dormir

**Fallo reportado: "le digo lo que haré mañana y no lo guarda, o solo una vez".** Lo reproduje con el código de la v2.5. Tenía cinco causas:
1. Si la IA escribía la fecha en palabras ("mañana"), se guardaba en **hoy**.
2. Pasado mañana o más adelante también caía en **hoy** y pisaba lo que ya había.
3. Había un solo texto por área, así que dos planes (caminar a las 7, fuerza a las 18) se pisaban.
4. Lo que no era una de las 8 áreas (una cita, una tarea) se descartaba.
5. El panel "Tu día" y el contexto de la IA solo mostraban hoy.

La v2.6 lo sustituye por una **Agenda**:
- Cada cosa es un elemento con fecha y hora exacta o momento del día.
- Muestra varios días.
- Envía un recordatorio 10 min antes.
- Si la fecha no se entiende, el asistente recibe el error y la corrige; ya no la guarda en hoy.
- La IA ve los próximos 7 días con los ids de cada elemento.

`pruebas_agenda.js` comprueba cada una de las cinco causas. La simulación de 2 meses sigue en **31/31 chequeos y 0 errores**.

## v2.7: Reloj interno y Memoria 2.0

**Petición: "no quiero decirle a cada rato qué hora es" y "que recuerde cosas complejas".**

**Reloj.** Antes, la hora solo aparecía como un dato más dentro del contexto de la IA. Ahora:
- El contexto de la IA empieza con un bloque RELOJ: fecha completa, hora, zona horaria y qué día es mañana.
- Una regla le prohíbe preguntar la hora.
- Cada mensaje tuyo llega con su hora ("[jue 15 oct 20:15]").
- De madrugada avisa de que "esta noche" o "mañana" pueden significar hoy.
- «¿Qué hora es?» y «¿qué día es?» se responden al instante, sin IA.

**Memoria.** Antes era una lista de frases (máx. 150) sin fechas ni estructura. Ahora tiene cuatro partes:
- **Personas** que no se duplican por nombre ni apodo, con notas acumuladas.
- **Fechas** anuales o de una vez, con edad y avisos a las 09:00 el día y los días antes que elijas. El 29 de febrero se celebra el 28 en años no bisiestos.
- **Horarios con vigencia.** Cuando cambian desde una fecha, la versión anterior se cierra y queda en el historial. Aceptan excepciones y "cada 2 semanas".
- **Hechos** con historial de versiones y fecha "hasta".

A la IA le llega un resumen acotado (≤ 9 000 caracteres incluso con 400 datos) y ordenado por relevancia: lo de hoy y mañana, las fechas próximas y lo que mencionas en tu último mensaje. Puede buscar todo lo demás con `buscar_memoria`, también en el pasado ("¿qué horario tenía el 20 de octubre?"). Los horarios y los cumpleaños aparecen solos en la Agenda.

Al probarlo encontré y corregí un fallo que ya existía: lo guardado de noche mostraba la fecha del día siguiente, porque se leía en UTC.

`pruebas_memoria.js` tiene 89 pruebas; en total son **285 pruebas superadas**. La simulación de 2 meses sigue en **31/31 chequeos y 0 errores**.

## Pendiente en la tablet real

Esto no se puede reproducir fuera del dispositivo. Ver también "Solo se puede comprobar en la tablet real" en el README:

- El dictado continuo con silencios largos.
- Que la pausa del Escudo cubra la pantalla y siga tras reiniciar.
- Permisos de uso y superposición.
- Que las notificaciones lleguen a su hora, sobre todo por la observación 1.
- El DNS privado.
- Que `FLAG_SECURE` bloquee las capturas.
- Consumo de batería del servicio del Escudo: revisa cada 1.5 s durante la franja nocturna y cada 30 s fuera de ella.

## Repetir la simulación

```bash
npm ci
npx playwright install chromium   # si no está instalado
npm run sim:2meses                # ~4 minutos
```

El resultado día a día queda en [`simulacion-2meses-resultado.json`](simulacion-2meses-resultado.json). El script es [`pruebas_simulacion_2meses.js`](../pruebas_simulacion_2meses.js). `SIM_DAYS=N` cambia la duración y la semilla es fija, así que es reproducible. Termina con código 1 si aparece algún hallazgo.
