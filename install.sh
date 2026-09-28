#!/usr/bin/env bash
# Instalador de la configuración de perfiles de Claude Code.
# Idempotente: se puede correr varias veces sin duplicar nada.
#
#   ./install.sh          interactivo
#   ./install.sh --all    acepta todos los defaults sin preguntar
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO=0
case "${1:-}" in
  --all) AUTO=1 ;;
  --unpin)
    command -v jq >/dev/null || { echo "falta jq"; exit 1; }
    f="$HOME/.claude/settings.json"
    [ -f "$f" ] || { echo "no existe $f"; exit 0; }
    jq 'del(.forceLoginOrgUUID) | del(.forceLoginMethod)' "$f" > "$f.tmp.$$" && mv "$f.tmp.$$" "$f"
    echo "fusible de organización desactivado en $f"
    exit 0 ;;
  -h|--help)
    sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    echo "  ./install.sh --unpin   quita el fusible de organización"
    exit 0 ;;
esac

B=$'\033[1m'; DIM=$'\033[2m'; R=$'\033[0m'
OK=$'\033[38;5;44m'; WARN=$'\033[38;5;220m'; ERR=$'\033[38;5;201m'

say()  { printf '%s\n' "$*"; }
step() { printf '\n%s==>%s %s%s\n' "$OK" "$R" "$B" "$*$R"; }
warn() { printf '%s !%s %s\n' "$WARN" "$R" "$*"; }
die()  { printf '%s ✗%s %s\n' "$ERR" "$R" "$*" >&2; exit 1; }
done_() { printf '   %s✓%s %s\n' "$OK" "$R" "$*"; }
skip() { printf '   %s·%s %s\n' "$DIM" "$R" "$*"; }

# ask "pregunta" "default(s/n)" -> 0 si sí
ask() {
  local q=$1 def=${2:-s} ans
  [ "$AUTO" = 1 ] && { [ "$def" = "s" ]; return; }
  local hint="[S/n]"; [ "$def" = "n" ] && hint="[s/N]"
  printf '   %s %s ' "$q" "$hint"
  read -r ans < /dev/tty || ans=""
  ans=${ans:-$def}
  case "$ans" in [sSyY]*) return 0;; *) return 1;; esac
}

# askval "pregunta" "default" -> imprime el valor
askval() {
  local q=$1 def=$2 ans
  [ "$AUTO" = 1 ] && { printf '%s' "$def"; return; }
  printf '   %s %s[%s]%s ' "$q" "$DIM" "$def" "$R" >&2
  read -r ans < /dev/tty || ans=""
  printf '%s' "${ans:-$def}"
}

# ---------------------------------------------------------------- dependencias
step "Dependencias"
command -v jq >/dev/null || die "falta jq. Instalalo con: brew install jq"
done_ "jq $(jq --version)"
command -v claude >/dev/null || warn "no encuentro el comando 'claude' en el PATH (podés instalarlo después)"

# --------------------------------------------------------------------- perfiles
step "Perfiles"
say "   El perfil principal usa ~/.claude (es el que arranca con 'claude' a secas)."
say "   El secundario vive en su propio directorio y se aísla por CLAUDE_CONFIG_DIR:"
say "   ${DIM}credenciales, settings, skills, plugins, MCP, historial y sesiones.${R}"
say ""

# Los defaults se pueden fijar por entorno, útil para instalar sin preguntas:
#   CS_MAIN_NAME=work CS_PROFILE_NAME=personal ./install.sh --all
MAIN_NAME=$(askval "Nombre del perfil principal (solo para el atajo):" "${CS_MAIN_NAME:-main}")
PROFILE_NAME=$(askval "Nombre del perfil secundario:" "${CS_PROFILE_NAME:-personal}")
PROFILE_DIR="$HOME/.claude-$PROFILE_NAME"

if [ -d "$PROFILE_DIR" ]; then
  skip "$PROFILE_DIR ya existe"
else
  mkdir -p "$PROFILE_DIR"
  done_ "creado $PROFILE_DIR"
fi

# -------------------------------------------------------------------- statusline
step "Statusline"
say "   Muestra qué cuenta está activa, más barras de consumo de contexto,"
say "   cuota del plan (5h y 7d) y costo estimado de la sesión."
say ""

SL_DEST="$HOME/.claude-statusline.sh"
INSTALL_SL=0
if ask "¿Instalar la statusline?" s; then
  INSTALL_SL=1
  install -m 0755 "$HERE/lib/statusline.sh" "$SL_DEST"
  done_ "instalada en $SL_DEST"
fi

# ---------------------------------------------------------------------- settings
# Escribe una clave en un settings.json creándolo si no existe.
set_setting() {
  local file=$1 key=$2 value=$3 tmp
  mkdir -p "$(dirname "$file")"
  [ -f "$file" ] || echo '{}' > "$file"
  tmp="$file.tmp.$$"
  jq --argjson v "$value" ".$key = \$v" "$file" > "$tmp" && mv "$tmp" "$file"
}

del_setting() {
  local file=$1 key=$2 tmp
  [ -f "$file" ] || return 0
  tmp="$file.tmp.$$"
  jq "del(.$key)" "$file" > "$tmp" && mv "$tmp" "$file"
}

if [ "$INSTALL_SL" = 1 ]; then
  SL_JSON='{"type":"command","command":"~/.claude-statusline.sh","padding":0}'
  for p in "$HOME/.claude" "$PROFILE_DIR"; do
    set_setting "$p/settings.json" statusLine "$SL_JSON"
    done_ "statusLine configurada en $p/settings.json"
  done
fi

# ------------------------------------------------------------------ fusible org
step "Fusible de organización (opcional)"
say "   Impide que una cuenta ajena se loguee en el perfil principal."
say "   ${WARN}Ojo:${R} si el perfil principal queda con una cuenta de otra org,"
say "   Claude Code se niega a arrancar hasta que vuelvas a la correcta."
say ""

# detecta el org de la cuenta ya logueada en el perfil principal
MAIN_JSON="$HOME/.claude.json"
CUR_ORG=""; CUR_MAIL=""
if [ -f "$MAIN_JSON" ]; then
  CUR_ORG=$(jq -r '.oauthAccount.organizationUuid // empty' "$MAIN_JSON" 2>/dev/null || true)
  CUR_MAIL=$(jq -r '.oauthAccount.emailAddress // empty' "$MAIN_JSON" 2>/dev/null || true)
fi

if [ -n "$CUR_ORG" ]; then
  say "   Cuenta actual del perfil principal: ${B}${CUR_MAIL}${R}"
  say "   Organización: ${DIM}${CUR_ORG}${R}"
  say ""
  if ask "¿Fijar el perfil principal a esa organización?" n; then
    set_setting "$HOME/.claude/settings.json" forceLoginOrgUUID "\"$CUR_ORG\""
    set_setting "$HOME/.claude/settings.json" forceLoginMethod '"claudeai"'
    done_ "fusible activado"
    warn "para desactivarlo: ./install.sh --unpin"
  else
    skip "sin fusible"
  fi
else
  skip "el perfil principal todavía no tiene login; salteado"
fi

# El fusible NUNCA va en el perfil secundario: lo dejaría sin poder loguearse.
del_setting "$PROFILE_DIR/settings.json" forceLoginOrgUUID
del_setting "$PROFILE_DIR/settings.json" forceLoginMethod

# ------------------------------------------------------------------------ shell
step "Atajos de shell"

RC="$HOME/.zshrc"
[ -n "${BASH_VERSION:-}" ] && [ ! -f "$RC" ] && RC="$HOME/.bashrc"
RC=$(askval "Archivo de shell a modificar:" "$RC")

BEGIN="# >>> claude-setup >>>"
END="# <<< claude-setup <<<"

BLOCK=$(cat <<EOF
$BEGIN
# Perfiles de Claude Code separados por CLAUDE_CONFIG_DIR.
# Generado por claude-setup; editá el repo, no este bloque.
export CLAUDE_DIR_$(echo "$MAIN_NAME" | tr '[:lower:]-' '[:upper:]_')="\$HOME/.claude"
export CLAUDE_DIR_$(echo "$PROFILE_NAME" | tr '[:lower:]-' '[:upper:]_')="\$HOME/.claude-$PROFILE_NAME"

claude-$MAIN_NAME() { CLAUDE_CONFIG_DIR="\$HOME/.claude" command claude "\$@"; }
claude-$PROFILE_NAME() { CLAUDE_CONFIG_DIR="\$HOME/.claude-$PROFILE_NAME" command claude "\$@"; }

# Qué cuenta está activa en este shell
claude-whoami() {
  local dir="\${CLAUDE_CONFIG_DIR:-\$HOME/.claude}"; dir="\${dir%/}"
  local label="$PROFILE_NAME"
  [ "\$dir" = "\$HOME/.claude" ] && label="$MAIN_NAME"
  # el perfil por defecto guarda .claude.json fuera del dir; los custom, dentro
  local cfg="\$dir/.claude.json"; [ -f "\$cfg" ] || cfg="\$dir.json"
  local email
  email=\$(grep -o '"emailAddress"[[:space:]]*:[[:space:]]*"[^"]*"' "\$cfg" 2>/dev/null | head -1 | sed 's/.*"\\(.*\\)"/\\1/')
  [ -n "\$email" ] || email="(sin login)"
  printf 'config : %s\nperfil : %s\ncuenta : %s\n' "\$dir" "\$label" "\$email"
}
$END
EOF
)

[ -f "$RC" ] || touch "$RC"
cp "$RC" "$RC.bak.$(date +%Y%m%d%H%M%S)"

had_block=0
if grep -q "^$BEGIN\$" "$RC"; then
  had_block=1
  # awk -v no admite valores multilínea, así que el bloque no se pasa como
  # variable: primero se borra el viejo, después se agrega el nuevo al final.
  awk -v b="$BEGIN" -v e="$END" '
    $0 == b { skipping = 1; next }
    $0 == e { skipping = 0; next }
    !skipping { print }
  ' "$RC" > "$RC.tmp.$$"
  # saca las líneas en blanco que quedan al final para no acumularlas
  awk 'BEGIN{n=0} {lines[NR]=$0} END{ last=NR; while (last>0 && lines[last]=="") last--; for(i=1;i<=last;i++) print lines[i] }' \
    "$RC.tmp.$$" > "$RC.tmp2.$$"
  mv "$RC.tmp2.$$" "$RC"
  rm -f "$RC.tmp.$$"
fi

printf '\n%s\n' "$BLOCK" >> "$RC"
if [ "$had_block" = 1 ]; then
  done_ "bloque actualizado en $RC"
else
  done_ "bloque agregado a $RC"
fi

# ------------------------------------------------------------------------ skill
step "Skill de mantenimiento (opcional)"
say "   Permite ajustar esta configuración conversacionalmente desde Claude Code."
say ""
if ask "¿Instalar el skill en ambos perfiles?" s; then
  for p in "$HOME/.claude" "$PROFILE_DIR"; do
    mkdir -p "$p/skills"
    rm -rf "$p/skills/claude-profiles"
    cp -R "$HERE/skills/claude-profiles" "$p/skills/"
    done_ "skill instalado en $p/skills/claude-profiles"
  done
else
  skip "sin skill"
fi

# ----------------------------------------------------------------------- cierre
step "Listo"
say ""
say "   Abrí una terminal nueva (o corré: source $RC) y probá:"
say ""
say "     ${B}claude${R} o ${B}claude-$MAIN_NAME${R}   perfil principal"
say "     ${B}claude-$PROFILE_NAME${R}      perfil $PROFILE_NAME"
say "     ${B}claude-whoami${R}             qué cuenta está activa"
say ""
if [ ! -f "$PROFILE_DIR/.claude.json" ]; then
  warn "el perfil '$PROFILE_NAME' todavía no tiene cuenta."
  say "   Entrá con ${B}claude-$PROFILE_NAME${R} y corré ${B}/login${R} ahí adentro."
  say "   ${DIM}Nunca uses /login para cambiar de cuenta: reemplaza la credencial"
  say "   del perfil en el que ya estás.${R}"
fi
say ""
