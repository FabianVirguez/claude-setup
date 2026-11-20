# progreso-agentes

Barra de progreso para los agentes en segundo plano de Claude Code. / A progress bar for Claude Code's background agents.

```
⠹ 🚀 Deploy API ████████▍░ 84 % · 9/~11 min · paso 42/~50 · tests ✓ › commit ✓ › push ⟳ › deploy …
```

**Qué muestra / What it shows** (una línea por agente sobre el prompt / one line per agent above the prompt):

- Un ícono según la tarea (🚀 deploy, 🧪 tests, 🩹 fix, 🔍 search…) y un indicador animado mientras trabaja.
- La barra avanza por trabajo: los pasos (herramientas usadas) del agente contra una referencia, frenada en 95 % hasta que termina (`paso 42/~50`). / The bar tracks work: the agent's tool calls against a reference, capped at 95 % until it finishes.
- Estimado del modelo / Model estimate: al lanzar cada agente el mod hace **una llamada chica a Haiku** (en segundo plano, sin demorar al agente; tope de 30 s) con la descripción, el tipo y el encargo (recortado a ~6000 caracteres), y le pide `{"pasos", "minutos"}`. Para calibrarlo le pasa las últimas 15 tareas terminadas con lo que realmente llevaron (y lo que se les había estimado). La respuesta se lee a la defensiva y se acota (3–400 pasos, 0,5–120 min). / One small Haiku call per spawned agent, calibrated with the last 15 finished tasks; billed to your session's credentials.
- Si el modelo no responde o responde algo inservible, la referencia cae, en orden, a: la mediana de las últimas 10 corridas de su mismo tipo (`general-purpose`, `Explore`, `infra-code`…, con 3 o más), la mediana general del historial (3 o más tareas), o nada: barra indeterminada, un bloque que va y viene, sin %. El panel dice cuál usa: «estimado por el modelo», «según infra-context», «referencia general», «sin referencia». / Fallbacks: per-type median, then overall median, then an indeterminate bar.
- Si el agente llega al 90 % de los pasos de referencia, se amplían una sola vez (×1,5) en vez de quedar clavada en 95 %. / Step reference widens once (×1.5) at 90 %.
- Historial / History: cada tarea que termina bien guarda descripción, tipo, comienzo del encargo, pasos y minutos reales (y el estimado) en las últimas 30; sirve para calibrar al modelo y para la referencia general.
- El tiempo da el color: transcurrido contra los minutos de la referencia; sin referencia, contra un estimado según el tamaño del encargo (corta ~5 min, normal ~12, larga ~30 al principio, que aprende de las últimas 10 de cada tamaño). Al llegar al 85 % se amplía una sola vez según los hitos que faltan (`14/~12→18 min`). Verde a tiempo, ámbar cerca del estimado, coral con ⚠️ si se pasa.
- Pasos, y los hitos como recorrido: `tests ✓ › commit ✓ › push ⟳ › deploy …`, detectados por los comandos que corre (pytest, jest, npm test, go test…; git commit/push; railway, vercel, fly, kubectl, helm, terraform…).
- `⏸️ sin actividad` si pasa más de 3 min sin usar herramientas (no cuenta un comando largo en curso).
- Al terminar: un sonido (macOS), una notificación y un toast.
- `/progreso` abre un panel con el detalle de cada agente.

Funciona en la terminal (también la integrada de VS Code). En la extensión de VS Code no hay franja sobre el prompt: solo `/progreso` y el sonido. / Works in the terminal (including VS Code's integrated terminal); the VS Code extension has no above-prompt band.

## Instalar / Install

En una sesión de Claude Code en la terminal / In a Claude Code terminal session:

```
/plugin install progreso-agentes --marketplace FabianVirguez/claude-setup
```

Responde `y` para agregar el marketplace y elige el alcance de usuario. / Answer `y` to add the marketplace and pick the user scope.

Desde la línea de comandos / From the command line:

```
claude plugin install progreso-agentes --marketplace FabianVirguez/claude-setup
```
