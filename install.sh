#!/usr/bin/env bash
# Instalador de la configuración de perfiles de Claude Code.
# Idempotente: se puede correr varias veces sin duplicar nada.
#
#   ./install.sh          elegís del menú qué instalar
#   ./install.sh --all    instala los componentes marcados por defecto
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

TILDE="~"
say()   { printf '%s\n' "$*"; }
step()  { printf '\n%s==>%s %s%s\n' "$OK" "$R" "$B" "$*$R"; }
warn()  { printf '   %s!%s %s\n' "$WARN" "$R" "$*"; }
die()   { printf '%s x%s %s\n' "$ERR" "$R" "$*" >&2; exit 1; }
done_() { printf '   %s+%s %s\n' "$OK" "$R" "$*"; }
skip()  { printf '   %s-%s %s\n' "$DIM" "$R" "$*"; }

# askval "pregunta" "default" -> imprime el valor elegido
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
command -v claude >/dev/null || warn "no encuentro 'claude' en el PATH (podés instalarlo después)"

# ----------------------------------------------------------------------- menú
# Cada componente se instala solo si quedó marcado.
sel1=1  # perfiles
sel2=1  # statusline
sel3=0  # fusible de organización
sel4=1  # skill
sel5=1  # hook de pre-commit

mark() { [ "$1" = 1 ] && printf 'x' || printf ' '; }

# printf %-Ns cuenta BYTES: con acentos desalinea. ${#s} cuenta caracteres.
pad() {
  local s=$1 n=$(( $2 - ${#1} ))
  printf '%s' "$s"
  while [ "$n" -gt 0 ]; do printf ' '; n=$((n-1)); done
}

row() { printf '    %s) [%s] %s %s%s%s\n' "$1" "$(mark $2)" "$(pad "$3" 26)" "$DIM" "$4" "$R"; }

render_menu() {
  printf '\n'
  row 1 $sel1 "Perfiles separados"      "directorio aislado + atajos de shell"
  row 2 $sel2 "Statusline"              "cuenta activa, consumo y costo"
  row 3 $sel3 "Fusible de organización" "rechaza cuentas de otra org"
  row 4 $sel4 "Skill de mantenimiento"  "ajustes conversacionales"
  row 5 $sel5 "Hook de pre-commit"      "bloquea datos sensibles al commitear"
  printf '\n'
}

toggle() {
  case "$1" in
    1) sel1=$((1-sel1)) ;; 2) sel2=$((1-sel2)) ;; 3) sel3=$((1-sel3)) ;;
    4) sel4=$((1-sel4)) ;; 5) sel5=$((1-sel5)) ;;
    *) return 1 ;;
  esac
}

if [ "$AUTO" = 0 ]; then
  step "Qué querés instalar"
  while :; do
    render_menu
    printf '   %sEnter para aceptar, o los números a cambiar (ej: 2 5):%s ' "$DIM" "$R"
    read -r line < /dev/tty || line=""
    [ -z "$line" ] && break
    for n in $line; do toggle "$n" || warn "opción inválida: $n"; done
  done
fi

# ------------------------------------------------------------------- nombres
MAIN_NAME=""; PROFILE_NAME=""; PROFILE_DIR=""
if [ "$sel1" = 1 ] || [ "$sel2" = 1 ] || [ "$sel4" = 1 ]; then
  step "Nombres de los perfiles"
  say "   El principal usa ~/.claude (el que arranca con 'claude' a secas)."
  say "   El secundario vive en su propio directorio, aislado por CLAUDE_CONFIG_DIR:"
  say "   ${DIM}credenciales, settings, skills, plugins, MCP, historial y sesiones.${R}"
  say ""
  # Se pueden fijar por entorno para instalar sin preguntas:
  #   CS_MAIN_NAME=work CS_PROFILE_NAME=personal ./install.sh --all
  # Los nombres se vuelven nombres de función de shell: solo [a-z0-9-].
  sanitize() {
    local v
    v=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')
    printf '%s' "$v"
  }
  ask_name() {
    local q=$1 def=$2 v
    while :; do
      v=$(sanitize "$(askval "$q" "$def")")
      [ -n "$v" ] && { printf '%s' "$v"; return; }
      warn "nombre inválido: usá solo letras, números y guiones" >&2
      [ "$AUTO" = 1 ] && { printf '%s' "$def"; return; }
    done
  }
  MAIN_NAME=$(ask_name "Nombre del perfil principal (solo para el atajo):" "${CS_MAIN_NAME:-main}")
  PROFILE_NAME=$(ask_name "Nombre del perfil secundario:" "${CS_PROFILE_NAME:-personal}")
  PROFILE_DIR="$HOME/.claude-$PROFILE_NAME"
fi

# ---------------------------------------------------------------- helpers json
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

# --------------------------------------------------------------- 1. perfiles
if [ "$sel1" = 1 ]; then
  step "Perfiles separados"
  if [ -d "$PROFILE_DIR" ]; then
    skip "$PROFILE_DIR ya existe"
  else
    mkdir -p "$PROFILE_DIR"
    done_ "creado $PROFILE_DIR"
  fi

  RC="$HOME/.zshrc"
  [ -n "${BASH_VERSION:-}" ] && [ ! -f "$HOME/.zshrc" ] && RC="$HOME/.bashrc"
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
    awk '{lines[NR]=$0} END{ last=NR; while (last>0 && lines[last]=="") last--; for(i=1;i<=last;i++) print lines[i] }' \
      "$RC.tmp.$$" > "$RC.tmp2.$$"
    mv "$RC.tmp2.$$" "$RC"; rm -f "$RC.tmp.$$"
  fi
  printf '\n%s\n' "$BLOCK" >> "$RC"
  [ "$had_block" = 1 ] && done_ "bloque actualizado en $RC" || done_ "bloque agregado a $RC"
fi

# ------------------------------------------------------------- 2. statusline
if [ "$sel2" = 1 ]; then
  step "Statusline"
  install -m 0755 "$HERE/lib/statusline.sh" "$HOME/.claude-statusline.sh"
  done_ "instalada en ~/.claude-statusline.sh"
  SL_JSON='{"type":"command","command":"~/.claude-statusline.sh","padding":0}'
  for p in "$HOME/.claude" "$PROFILE_DIR"; do
    [ -n "$p" ] && [ -d "$p" ] || continue
    set_setting "$p/settings.json" statusLine "$SL_JSON"
    done_ "statusLine configurada en ${p/#$HOME/$TILDE}/settings.json"
  done
fi

# ------------------------------------------------- org detectada (para 3 y 5)
MAIN_JSON="$HOME/.claude.json"
CUR_ORG=""; CUR_MAIL=""
if [ -f "$MAIN_JSON" ]; then
  CUR_ORG=$(jq -r '.oauthAccount.organizationUuid // empty' "$MAIN_JSON" 2>/dev/null || true)
  CUR_MAIL=$(jq -r '.oauthAccount.emailAddress // empty' "$MAIN_JSON" 2>/dev/null || true)
fi

# ----------------------------------------------------------------- 3. fusible
if [ "$sel3" = 1 ]; then
  step "Fusible de organización"
  if [ -z "$CUR_ORG" ]; then
    warn "el perfil principal todavía no tiene login; salteado"
  else
    say "   Cuenta del perfil principal: ${B}${CUR_MAIL}${R}"
    say "   ${WARN}Ojo:${R} si ese perfil queda con una cuenta de otra organización,"
    say "   Claude Code se niega a arrancar hasta que vuelvas a la correcta."
    say ""
    set_setting "$HOME/.claude/settings.json" forceLoginOrgUUID "\"$CUR_ORG\""
    set_setting "$HOME/.claude/settings.json" forceLoginMethod '"claudeai"'
    done_ "fusible activado"
    skip "para desactivarlo: ./install.sh --unpin"
  fi
fi
# El fusible NUNCA va en el perfil secundario: lo dejaría sin poder loguearse.
if [ -n "$PROFILE_DIR" ] && [ -d "$PROFILE_DIR" ]; then
  del_setting "$PROFILE_DIR/settings.json" forceLoginOrgUUID
  del_setting "$PROFILE_DIR/settings.json" forceLoginMethod
fi

# ------------------------------------------------------------------- 4. skill
if [ "$sel4" = 1 ]; then
  step "Skill de mantenimiento"
  for p in "$HOME/.claude" "$PROFILE_DIR"; do
    [ -n "$p" ] && [ -d "$p" ] || continue
    mkdir -p "$p/skills"
    rm -rf "$p/skills/claude-profiles"
    cp -R "$HERE/skills/claude-profiles" "$p/skills/"
    done_ "instalado en ${p/#$HOME/$TILDE}/skills/claude-profiles"
  done
fi

# -------------------------------------------------------------------- 5. hook
if [ "$sel5" = 1 ]; then
  step "Hook de pre-commit"
  if ! git -C "$HERE" rev-parse --git-dir >/dev/null 2>&1; then
    warn "$HERE no es un repo git; salteado"
  else
    GITDIR=$(git -C "$HERE" rev-parse --git-dir)
    [ "${GITDIR#/}" = "$GITDIR" ] && GITDIR="$HERE/$GITDIR"
    mkdir -p "$GITDIR/hooks"
    install -m 0755 "$HERE/hooks/pre-commit" "$GITDIR/hooks/pre-commit"
    done_ "hook instalado en .git/hooks/pre-commit"

    # Los patrones específicos van dentro de .git/, que nunca se versiona.
    # Así el repo puede ser público sin nombrar lo que está protegiendo.
    PL="$GITDIR/hooks/patterns.local"
    : > "$PL"
    {
      echo "# Patrones propios del hook de pre-commit. NO se versiona."
      echo "# Formato:  etiqueta|regex extendida"
      [ -n "$CUR_ORG" ]  && echo "uuid de tu organización|$CUR_ORG"
      if [ -n "$CUR_MAIL" ]; then
        dom="${CUR_MAIL#*@}"
        echo "dominio de email corporativo|@${dom//./\\.}"
      fi
    } >> "$PL"
    chmod 600 "$PL"
    n=$(grep -cv '^#' "$PL" || true)
    done_ "$n patrones propios en .git/hooks/patterns.local ${DIM}(fuera de git)${R}"
  fi
fi

# ----------------------------------------------------------------------- cierre
step "Listo"
say ""
if [ "$sel1" = 1 ]; then
  say "   Abrí una terminal nueva (o corré: source ${RC:-~/.zshrc}) y probá:"
  say ""
  say "     ${B}claude${R} o ${B}claude-$MAIN_NAME${R}"
  say "     ${B}claude-$PROFILE_NAME${R}"
  say "     ${B}claude-whoami${R}   ${DIM}qué cuenta está activa${R}"
  say ""
  if [ -n "$PROFILE_DIR" ] && [ ! -f "$PROFILE_DIR/.claude.json" ]; then
    warn "el perfil '$PROFILE_NAME' todavía no tiene cuenta."
    say "   Entrá con ${B}claude-$PROFILE_NAME${R} y corré ${B}/login${R} ahí adentro."
    say "   ${DIM}Nunca uses /login para cambiar de cuenta: reemplaza la credencial"
    say "   del perfil en el que ya estás.${R}"
    say ""
  fi
fi
