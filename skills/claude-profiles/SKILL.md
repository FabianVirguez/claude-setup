---
name: claude-profiles
description: Gestiona los perfiles separados de Claude Code (cuentas de trabajo y personal aisladas por CLAUDE_CONFIG_DIR) y su statusline. Usar cuando el usuario quiere cambiar entre cuentas, agregar o quitar un perfil, diagnosticar que la cuenta activa es la equivocada, ajustar la statusline (colores, umbrales, barras, costo), o activar/desactivar el fusible de organización.
---

# Perfiles de Claude Code

Varias cuentas de Claude en una misma máquina, aisladas por `CLAUDE_CONFIG_DIR`.

## Modelo mental

`CLAUDE_CONFIG_DIR` aísla **todo** lo que define un perfil: credenciales, `settings.json`,
skills, agents, commands, plugins, servidores MCP de scope usuario, historial, sesiones y
proyectos. En macOS cada config dir recibe **su propia entrada de Keychain**
(`Claude Code-credentials` para el perfil por defecto, `Claude Code-credentials-<hash>`
para los demás), así que los logins no se pisan entre sí.

Lo que **no** se aísla vive en el repo, no en el perfil: `.claude/settings.json`,
`.claude/settings.local.json`, `.mcp.json` y `CLAUDE.md` de cada proyecto.

## Regla crítica

**No se cambia de cuenta dentro de una sesión.** Cada perfil es un proceso distinto que
arranca con un comando distinto.

`/login` **no** cambia de perfil: reemplaza la credencial del perfil en el que ya estás.
Usarlo para "cambiar de cuenta" mete la cuenta nueva en el perfil equivocado y obliga a
re-loguear el original. `/login` sirve solo para el primer login de un perfil o para
renovar uno vencido.

## Diagnóstico

Empezá siempre por acá antes de tocar nada:

```bash
claude-whoami                                          # perfil activo en este shell
CLAUDE_CONFIG_DIR="$HOME/.claude-personal" claude-whoami
```

Leer la cuenta de un perfil directamente. Ojo con la asimetría de rutas: **el perfil por
defecto guarda `.claude.json` fuera de su dir** (`~/.claude.json`), los perfiles custom lo
guardan adentro (`~/.claude-personal/.claude.json`).

```bash
jq -r '.oauthAccount | "\(.emailAddress) | \(.organizationName) | \(.organizationUuid)"' ~/.claude.json
jq -r '.oauthAccount | "\(.emailAddress) | \(.organizationName) | \(.organizationUuid)"' ~/.claude-personal/.claude.json
```

Confirmar que los perfiles tienen credenciales separadas:

```bash
security dump-keychain 2>/dev/null | grep '"svce"<blob>=' | grep -i claude | sort | uniq -c
```

Debe haber una entrada por perfil logueado.

## Si la cuenta quedó en el perfil equivocado

1. En el perfil contaminado: `/logout`, después `/login` con la cuenta que corresponde.
2. Verificar con `claude-whoami` antes de seguir.
3. Recién entonces entrar al otro perfil, con `CLAUDE_CONFIG_DIR` **explícito**, y loguear ahí.

## Fusible de organización

`forceLoginOrgUUID` en el `settings.json` del perfil principal hace que Claude Code
rechace cualquier cuenta que no pertenezca a esa organización.

```bash
jq -r '.forceLoginOrgUUID // "sin fusible"' ~/.claude/settings.json
```

Advertencias:

- **Nunca ponerlo en un perfil personal.** Lo dejaría sin poder loguearse.
- Claude Code inyecta ese UUID en la URL de `/login` como `&orgUUID=...`. Si un login falla
  con *"No se puede acceder a esta organización"*, revisar si la URL trae ese parámetro:
  significa que el login está corriendo contra el perfil que tiene el fusible.
- Si bloquea un login legítimo: `./install.sh --unpin`, loguear, y volver a activarlo.

## Statusline

Script compartido por todos los perfiles: `~/.claude-statusline.sh`.
Referenciado desde el `settings.json` de cada perfil vía `statusLine.command`.

Muestra: badge del perfil · cuenta · modelo · directorio · rama git · `ctx` · `5h` · `7d` · costo.

Dónde tocar cada cosa, todo dentro de la función `meter()`:

| Qué | Dónde |
|---|---|
| ancho de las barras | `w=6` |
| umbrales de color | la cadena de `if [ "$pct" -ge N ]` |
| colores | los códigos `\033[38;5;NNNm` |
| ocultar una métrica | la línea `m=$(meter ...)` correspondiente, al final |
| ocultar el costo en cero | la comparación con `"0.00"` |

Campos disponibles en el JSON de stdin: `model.display_name`, `workspace.current_dir`,
`context_window.used_percentage`, `rate_limits.five_hour.used_percentage`,
`rate_limits.seven_day.used_percentage`, `cost.total_cost_usd`, `version`, `output_style.name`,
`prompt_cache.*`. `rate_limits` aparece solo para cuentas Pro y Max, y recién después de la
primera respuesta de la API — manejar siempre su ausencia.

Probar un cambio sin abrir una sesión:

```bash
echo '{"model":{"display_name":"Opus"},"workspace":{"current_dir":"'"$HOME"'"},"context_window":{"used_percentage":42},"rate_limits":{"five_hour":{"used_percentage":63}},"cost":{"total_cost_usd":1.5}}' \
  | ~/.claude-statusline.sh; echo
```

### Accesibilidad

El usuario usa un tema daltonizado. Al tocar colores:

- No usar el eje rojo-verde como única señal.
- La escala actual va de frío a cálido (cyan → azul → ámbar → naranja → magenta): se
  distingue por tono y luminosidad.
- Todo dato lleva etiqueta de texto y número además del color. Mantener esa regla.

## Agregar otro perfil

```bash
mkdir -p ~/.claude-<nombre>
jq '.statusLine = {"type":"command","command":"~/.claude-statusline.sh","padding":0}' \
  <<< '{}' > ~/.claude-<nombre>/settings.json
```

Después agregar la función al bloque `# >>> claude-setup >>>` del `~/.zshrc`, y entrar con
`CLAUDE_CONFIG_DIR="$HOME/.claude-<nombre>" claude` para hacer el `/login` inicial.

## Reinstalar en otra máquina

```bash
git clone <repo> ~/Documents/claude-setup && ~/Documents/claude-setup/install.sh
```

El instalador es idempotente: correrlo de nuevo actualiza en lugar de duplicar.
