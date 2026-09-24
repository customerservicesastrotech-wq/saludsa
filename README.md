# Plan 20

App Android para acompañar un plan personal de 20 semanas: movimiento, comida, estudio, sueño y una meta personal ("Meta P"). Está pensada para una **Samsung Galaxy Tab S9 FE**. Tiene un asistente con IA (Claude) que es opcional: sin IA, todo lo esencial sigue funcionando.

- **Plataforma:** Capacitor 7 (HTML/JS en `www/`) con componentes nativos en Java (`android/`).
- **Versión:** 2.3 (`versionCode 7`).
- **Datos:** se guardan solo en la tablet (localStorage). No hay servidor propio.

## Qué hace

| Área | Qué incluye |
|---|---|
| Inicio (asistente) | Conversación, panel "Tu día" (propuesta · lo que piensas hacer · lo real), conteo de días y récord de la Meta P, aviso de riesgo según tu historial |
| Registro | Formularios completos por tipo (aeróbico, fuerza, comida, estudio, sueño, pausa, vínculo, impulso, medida), borradores, historial editable |
| Plan | 20 semanas en fases, plan semanal editable, revisión semanal, progreso con gráficas |
| Protocolo | "Tengo un impulso": pausa guiada en 5 pasos con temporizadores que siguen aunque se cierre la app |
| Voz | Dictado continuo (no se corta en los silencios ni envía solo) |
| Escudo | En las horas de riesgo, si se abre una app elegida, la pantalla queda en pausa N minutos con mensajes personales. Solo usa qué app está abierta y cuánto rato. Guía para activar el filtro DNS familiar |
| Privacidad | PIN, etiquetas discretas, sin capturas de pantalla (`FLAG_SECURE`), copia de seguridad `.json` |

Las guías de usuario están en [`docs/`](docs/).

## Estructura

```
www/                 App (lo que ve el usuario)
  content.js         Contenido del manual: fases, semanas, guías, reglas
  app.js             Núcleo: datos, validación, pantallas, formularios, protocolo
  ai.js              Llamadas a Claude, presupuesto, reglas de seguridad
  asistente.js       Asistente (Inicio), memoria, riesgo, micrófono
  escudo.js          Pantalla Escudo y su integración con el asistente
android/app/src/main/java/com/jeanc/plan20/
  MainActivity.java            Registra los plugins; FLAG_SECURE
  ContinuousSpeechPlugin.java  Dictado continuo
  ShieldPlugin.java            Puente JS ↔ Escudo (permisos, configuración, eventos)
  ShieldService.java           Servicio en primer plano + pantalla de pausa
  ShieldStore.java             Configuración y registro del Escudo
  ShieldBootReceiver.java      Reactiva el Escudo al reiniciar
pruebas_*.js         Pruebas automáticas (Playwright)
scripts/pruebas.sh   Ejecuta todas las pruebas
```

## Cómo probar

### 1. Pruebas automáticas (88 pruebas)

Requisitos: Node 20+ y Python 3.

```bash
npm ci
npx playwright install chromium
npm test
```

`npm test` levanta un servidor local, abre la app en Chromium y simula los componentes nativos (dictado, Escudo, notificaciones):

- `pruebas_regresion.js`: 44 pruebas de funciones generales.
- `pruebas_microfono.js`: 9 pruebas del dictado continuo.
- `pruebas_escudo.js`: 35 pruebas del Escudo.

Termina con código 1 si algo falla. Las pruebas fijan la zona horaria `America/Bogota` (UTC-5), así que dan lo mismo en cualquier máquina.

En GitHub, el flujo [`.github/workflows/pruebas.yml`](.github/workflows/pruebas.yml) corre las pruebas y compila un APK de prueba en cada `push`. El APK se descarga desde la pestaña **Actions**, en los *artifacts* de cada ejecución.

### 2. Probar a mano en el navegador

```bash
npm run serve          # http://localhost:8765
```

1. Acepta la pantalla de cuidado y crea un PIN de 4 dígitos (dos veces).
2. Para simular otro día u otra hora, usa parámetros en la URL:
   - `?date=2026-10-15` fija la fecha.
   - `?date=2026-10-15&hour=22` fija también la hora.
3. En el navegador no hay componentes nativos. La app lo detecta: el Escudo muestra "Solo en la tablet" y el micrófono usa el reconocimiento de voz del navegador, si existe.

### 3. APK de prueba

Requisitos: Java 21 y Android SDK 35.

```bash
npm ci
npm run apk:debug      # → android/app/build/outputs/apk/debug/app-debug.apk
```

El APK de depuración se firma solo con una llave de prueba. **No se instala encima** de la versión oficial: hay que desinstalar la oficial antes, y eso borra los datos. Para no perderlos, exporta una copia en Ajustes y luego impórtala.

## Guía para quien pruebe la app

**Flujos principales**
1. Primer uso: aviso de cuidado → PIN → Inicio sin formularios.
2. Contarle algo al asistente. Sin clave de IA, debe explicar que falta activarla y ofrecer el registro manual.
3. "Tu día": botones Acepto, Decir qué harás y Contar qué pasó.
4. Registrar a mano cada tipo y editar o borrar desde el historial.
5. Protocolo "Tengo un impulso" completo, incluido salir y volver con el temporizador en marcha.
6. Revisión semanal: el domingo o el último día de la semana.
7. Escudo: encender, elegir apps, cambiar franja y duración, probar.
8. Copia de seguridad: exportar, borrar todo e importar.

**Casos límite**
- Un día sin datos se muestra como "sin dato", nunca como cero ni como hecho.
- Cambio de día con un formulario abierto.
- Presupuesto de IA agotado.
- Almacenamiento lleno.
- Fechas antes del inicio del plan (23 sep 2026).

**Solo se puede comprobar en la tablet real**
- Que el dictado continuo no se corte en silencios largos.
- Que la pausa del Escudo cubra la pantalla, no se pueda cerrar antes y continúe tras reiniciar.
- Los permisos "Acceso a datos de uso" y "Mostrar sobre otras apps".
- Las notificaciones programadas.
- El estado del DNS privado.
- Que no se puedan hacer capturas de pantalla dentro de la app.

## IA (opcional)

La clave de API de Anthropic **no está en el repositorio ni en el código**. Se pega dentro de la app, en Más → Ajustes → Inteligencia artificial, y queda guardada solo en ese dispositivo. Las pruebas automáticas no usan IA real: simulan las respuestas.

## Firma de la versión oficial

La llave de firma no se sube. Para compilar la versión oficial, que se instala encima de la anterior sin perder datos, crea `android/keystore.properties`. Ese archivo está en `.gitignore`.

```properties
storeFile=../keys/plan20.jks
storePassword=…
keyAlias=plan20
keyPassword=…
```

Después:

```bash
npm run apk:release
```

Sin ese archivo, `apk:release` genera un APK sin firmar.
