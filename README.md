# claude-setup

Varias cuentas de Claude Code en una misma máquina, sin que se mezclen.

Aísla por `CLAUDE_CONFIG_DIR`: credenciales, `settings.json`, skills, agents, commands,
plugins, servidores MCP de scope usuario, historial, sesiones y proyectos. En macOS cada
config dir recibe **su propia entrada de Keychain**, así que los logins no se pisan.

## Instalación en una máquina nueva

```bash
brew install jq
git clone <este-repo> ~/Documents/claude-setup
~/Documents/claude-setup/install.sh
```

El instalador pregunta qué querés y es idempotente: correrlo de nuevo actualiza en vez de
duplicar. Hace backup de `~/.zshrc` antes de tocarlo.

```bash
./install.sh           # interactivo
./install.sh --all     # todos los defaults, sin preguntar
./install.sh --unpin   # quita el fusible de organización
```

Los nombres de los atajos se pueden fijar por entorno, para instalar sin preguntas:

```bash
CS_MAIN_NAME=work CS_PROFILE_NAME=personal ./install.sh --all
```

## Qué instala

| | |
|---|---|
| perfil secundario | `~/.claude-<nombre>/`, aislado del principal |
| statusline | `~/.claude-statusline.sh`, compartida por todos los perfiles |
| atajos de shell | `claude-main`, `claude-<nombre>`, `claude-whoami` |
| fusible de org | opcional: fija el perfil principal a una organización |
| skill | `claude-profiles`, para mantener todo esto conversacionalmente |

El bloque del shell va entre marcadores `# >>> claude-setup >>>`, así que el instalador lo
reemplaza limpio en cada corrida.

## Uso

```bash
claude                 # perfil principal
claude-personal        # perfil secundario
claude-whoami          # qué cuenta está activa en este shell
```

Podés tener las dos abiertas al mismo tiempo en terminales distintas.

### La regla que importa

**No se cambia de cuenta dentro de una sesión.** Cada perfil es un proceso distinto con su
propio comando.

`/login` **no** cambia de perfil: reemplaza la credencial del perfil en el que ya estás.
Sirve solo para el primer login de un perfil, o para renovar uno vencido.

## Statusline

```
 WORK  vos@empresa.com · Opus · ~/proyecto · git main · ctx █░░░░░ 18% · 5h ████░░ 63% · 7d █░░░░░ 9% · $1.23
```

Badge del perfil, cuenta, modelo, directorio, rama git, y tres barras de consumo:

- `ctx` — contexto de la sesión: cuándo va a auto-compactar. Se resetea con `/clear`.
- `5h` — cuota de 5 horas del plan.
- `7d` — cuota semanal.

Más el costo estimado de la sesión, que se oculta mientras esté en cero.

El color indica **nivel de consumo**, siempre lo mismo: cyan <25%, azul 25-49%, ámbar
50-74%, naranja 75-89%, magenta ≥90%. La escala evita el eje rojo-verde y cada dato lleva
número y etiqueta, así que nada depende únicamente del color.

El costo es una estimación calculada localmente a precio de lista de la API. Con una cuenta
por suscripción no se te factura por uso: para saber cuánto te queda del plan, mirá `5h` y `7d`.

`rate_limits` sólo llega para cuentas Pro y Max, y recién después de la primera respuesta
de la API. Al arrancar una sesión vas a ver únicamente `ctx`.

## Fusible de organización

`forceLoginOrgUUID` hace que el perfil principal rechace cualquier cuenta que no sea de esa
organización — la red de contención contra loguear la cuenta equivocada.

Dos cosas que conviene saber:

- **Nunca va en un perfil personal**: lo dejaría sin poder loguearse.
- Claude Code inyecta el UUID en la URL de `/login` como `&orgUUID=...`. Si un login falla
  con *"No se puede acceder a esta organización"*, fijate si la URL trae ese parámetro:
  quiere decir que el login está corriendo contra el perfil que tiene el fusible, no contra
  el que creías. `./install.sh --unpin` lo saca temporalmente.

## Requisitos

- macOS o Linux, `bash`, `git`
- [`jq`](https://jqlang.github.io/jq/) — el instalador y la statusline lo usan
- Claude Code v2.1.x o posterior

## Estructura

```
install.sh                      instalador idempotente
lib/statusline.sh               script de la statusline
skills/claude-profiles/         skill de mantenimiento
```
