#!/usr/bin/env bash
# Statusline compartida por los perfiles de Claude Code (trabajo / personal).
# Muestra qué cuenta está activa + consumo de contexto y de cuota del plan.
# Paleta segura para daltonismo: gris/ámbar/magenta y azul/naranja.
# Nunca rojo-verde, y todo dato lleva etiqueta de texto además del color.

input=$(cat)

R=$'\033[0m'
DIM=$'\033[2m'

# --- perfil activo -----------------------------------------------------------
cfg="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
cfg="${cfg%/}"

# el perfil por defecto guarda .claude.json fuera del dir; los custom, dentro
acct="$cfg/.claude.json"
[ -f "$acct" ] || acct="$cfg.json"

email=$(grep -o '"emailAddress"[[:space:]]*:[[:space:]]*"[^"]*"' "$acct" 2>/dev/null | head -1 | sed 's/.*"\(.*\)"/\1/')
[ -n "$email" ] || email="sin login"

if [ "$cfg" = "$HOME/.claude" ]; then
  badge=$'\033[48;5;208m\033[38;5;232m\033[1m WORK '"$R"      # naranja
  tint=$'\033[38;5;208m'
else
  badge=$'\033[48;5;39m\033[38;5;232m\033[1m PERSONAL '"$R"   # azul
  tint=$'\033[38;5;39m'
fi

# --- datos de sesión ---------------------------------------------------------
# Una sola llamada a jq. Separador \x1f (no es whitespace) para que los campos
# vacíos no se colapsen al leerlos con read.
US=$(printf '\037')
jq_prog='[
  (.model.display_name // "?"),
  (.workspace.current_dir // .cwd // ""),
  ((.context_window.used_percentage // null)        | if .==null then "" else (floor|tostring) end),
  ((.rate_limits.five_hour.used_percentage // null) | if .==null then "" else (floor|tostring) end),
  ((.rate_limits.seven_day.used_percentage // null) | if .==null then "" else (floor|tostring) end),
  ((.cost.total_cost_usd // null)                   | if .==null then "" else tostring end)
] | join("")'

IFS="$US" read -r model dir ctx h5 d7 cost < <(printf '%s' "$input" | jq -r "$jq_prog")

# ~ en vez del home completo
TILDE="~"; short_dir="${dir/#$HOME/$TILDE}"
[ -n "$short_dir" ] || short_dir="?"

# --- git ---------------------------------------------------------------------
branch=""
if [ -n "$dir" ] && [ -d "$dir" ]; then
  branch=$(git -C "$dir" --no-optional-locks branch --show-current 2>/dev/null)
  if [ -n "$branch" ] && ! git -C "$dir" --no-optional-locks diff --quiet 2>/dev/null; then
    branch="$branch*"
  fi
fi

# --- barra de progreso -------------------------------------------------------
# El color significa SIEMPRE lo mismo: nivel de consumo. Las métricas se
# distinguen por su etiqueta de texto, no por color.
#   <25 cyan · 25-49 azul · 50-74 ámbar · 75-89 naranja · >=90 magenta
# Paleta elegida para daltonismo: la progresión frío -> cálido se percibe por
# luminosidad y tono aun sin discriminar rojo/verde. El número acompaña siempre.
FULL=$(printf '█')
EMPTY=$(printf '░')
GREY=$'\033[38;5;238m'

meter() {
  local label=$1 pct=$2 w=6 filled i full_part="" empty_part="" col
  [ -n "$pct" ] || return 0
  if   [ "$pct" -ge 90 ]; then col=$'\033[38;5;201m'   # magenta
  elif [ "$pct" -ge 75 ]; then col=$'\033[38;5;208m'   # naranja
  elif [ "$pct" -ge 50 ]; then col=$'\033[38;5;220m'   # ámbar
  elif [ "$pct" -ge 25 ]; then col=$'\033[38;5;33m'    # azul
  else                         col=$'\033[38;5;44m'    # cyan
  fi
  filled=$(( (pct * w + 50) / 100 ))
  [ "$filled" -gt "$w" ] && filled=$w
  [ "$filled" -lt 0 ] && filled=0
  for ((i=0; i<w; i++)); do
    if [ "$i" -lt "$filled" ]; then full_part="$full_part$FULL"
    else empty_part="$empty_part$EMPTY"; fi
  done
  printf '%s' "${DIM}${label}${R} ${col}${full_part}${R}${GREY}${empty_part}${R} ${col}${pct}%${R}"
}

# --- render ------------------------------------------------------------------
sep="${DIM} · ${R}"

out="${badge} ${tint}${email}${R}${sep}${model}${sep}${short_dir}"
[ -n "$branch" ] && out="${out}${sep}${DIM}⎇${R} ${branch}"

m=$(meter ctx "$ctx"); [ -n "$m" ] && out="${out}${sep}${m}"
m=$(meter 5h  "$h5");  [ -n "$m" ] && out="${out}${sep}${m}"
m=$(meter 7d "$d7"); [ -n "$m" ] && out="${out}${sep}${m}"

# costo estimado de la sesión; se oculta mientras esté en cero
# LC_NUMERIC=C para que el separador decimal no dependa del locale
if [ -n "$cost" ]; then
  cost_fmt=$(LC_NUMERIC=C printf '%.2f' "$cost" 2>/dev/null)
  if [ -n "$cost_fmt" ] && [ "$cost_fmt" != "0.00" ]; then
    out="${out}${sep}${DIM}\$${cost_fmt}${R}"
  fi
fi

printf '%s' "$out"
