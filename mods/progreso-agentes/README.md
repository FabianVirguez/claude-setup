# progreso-agentes

Barra de progreso para los agentes en segundo plano de Claude Code. / A progress bar for Claude Code's background agents.

```
⠹ 🚀 Deploy API ████████▍░ 84 % · 9/11 min · paso 42 · tests ✓ › commit ✓ › push ⟳ › deploy …
```

**Qué muestra / What it shows** (una línea por agente sobre el prompt / one line per agent above the prompt):

- Un ícono según la tarea (🚀 deploy, 🧪 tests, 🩹 fix, 🔍 search…) y un indicador animado mientras trabaja.
- Tiempo transcurrido contra un estimado según el tamaño del encargo (corta ~5 min, normal ~12, larga ~30 al principio), que después aprende de lo que tardaron las últimas 10 tareas de cada tamaño. Al llegar al 85 % se amplía una sola vez según los hitos que faltan (`14/12→18 min`); si se pasa también de ese, aparece ⚠️. La barra avanza por tiempo, no por trabajo: verde a tiempo, ámbar cerca del estimado, coral con ⚠️ si se pasa.
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
