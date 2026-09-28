#!/usr/bin/env bash
# Verifica la configuración del perfil activo y repara lo que falte.
#
# Pensado para correr desde un hook SessionStart de Claude Code: es rápido,
# silencioso cuando todo está en su lugar, y solo AÑADE lo que falta — nunca
# quita ni pisa lo que ya existe (incluido el propio hook que lo invoca).
#
# Sin argumentos repara. Con --check solo informa, sin tocar nada.
set -u

STATE="$HOME/.claude-setup.json"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

# Sin estado no hay nada que reparar: el setup nunca corrió en esta máquina.
[ -f "$STATE" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

get() { jq -r "$1 // empty" "$STATE" 2>/dev/null; }
on()  { [ "$(get ".components.$1")" = "true" ]; }

REPO=$(get '.repo')
PROFILE_DIR=$(get '.profile_dir')
[ -n "$REPO" ] && [ -d "$REPO" ] || exit 0

# El perfil en el que corre esta sesión.
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"; CFG="${CFG%/}"

FIXED=""
add_fix() { FIXED="${FIXED:+$FIXED, }$1"; }

set_setting() {
  local file=$1 key=$2 value=$3 tmp
  [ "$CHECK_ONLY" = 1 ] && return 0
  mkdir -p "$(dirname "$file")"
  [ -f "$file" ] || echo '{}' > "$file"
  tmp="$file.tmp.$$"
  jq --argjson v "$value" ".$key = \$v" "$file" > "$tmp" 2>/dev/null && mv "$tmp" "$file" || rm -f "$tmp"
}

# --- statusline ---------------------------------------------------------------
if on statusline; then
  SL="$HOME/.claude-statusline.sh"
  if [ ! -x "$SL" ] && [ -f "$REPO/lib/statusline.sh" ]; then
    [ "$CHECK_ONLY" = 1 ] || install -m 0755 "$REPO/lib/statusline.sh" "$SL"
    add_fix "statusline"
  fi
  if [ -x "$SL" ] || [ "$CHECK_ONLY" = 1 ]; then
    cur=$(jq -r '.statusLine.command // empty' "$CFG/settings.json" 2>/dev/null)
    if [ -z "$cur" ]; then
      set_setting "$CFG/settings.json" statusLine \
        '{"type":"command","command":"~/.claude-statusline.sh","padding":0}'
      add_fix "statusLine en settings"
    fi
  fi
fi

# --- skill --------------------------------------------------------------------
if on skill; then
  if [ ! -d "$CFG/skills/claude-profiles" ] && [ -d "$REPO/skills/claude-profiles" ]; then
    if [ "$CHECK_ONLY" = 0 ]; then
      mkdir -p "$CFG/skills"
      cp -R "$REPO/skills/claude-profiles" "$CFG/skills/" 2>/dev/null
    fi
    add_fix "skill claude-profiles"
  fi
fi

# --- perfil secundario --------------------------------------------------------
if on profiles && [ -n "$PROFILE_DIR" ]; then
  if [ ! -d "$PROFILE_DIR" ]; then
    [ "$CHECK_ONLY" = 1 ] || mkdir -p "$PROFILE_DIR"
    add_fix "directorio del perfil secundario"
  fi
fi

# --- bloque del shell ---------------------------------------------------------
# Solo se avisa: reescribirlo requiere los nombres y el archivo de shell, y una
# sesión de Claude no puede recargar el shell del usuario de todos modos.
SHELL_RC=$(get '.shell_rc')
if on profiles && [ -n "$SHELL_RC" ] && [ -f "$SHELL_RC" ]; then
  grep -q '^# >>> claude-setup >>>$' "$SHELL_RC" 2>/dev/null \
    || add_fix "bloque del shell (correr $REPO/install.sh)"
fi

# --- hook de pre-commit -------------------------------------------------------
if on hook && [ -d "$REPO/.git" ]; then
  if [ ! -x "$REPO/.git/hooks/pre-commit" ] && [ -f "$REPO/hooks/pre-commit" ]; then
    [ "$CHECK_ONLY" = 1 ] || install -m 0755 "$REPO/hooks/pre-commit" "$REPO/.git/hooks/pre-commit"
    add_fix "hook de pre-commit"
  fi
fi

# --- salida -------------------------------------------------------------------
# Claude Code lee un JSON con systemMessage; sin cambios no se imprime nada.
if [ -n "$FIXED" ]; then
  if [ "$CHECK_ONLY" = 1 ]; then
    printf 'falta: %s\n' "$FIXED"
  else
    printf '{"systemMessage":"claude-setup reparó: %s","suppressOutput":true}\n' "$FIXED"
  fi
fi
exit 0
