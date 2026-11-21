#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  MONITOR DE PÁGINAS → notificación por TELEGRAM
#  Avisa cuando una página web se cae y cuando vuelve.
# ─────────────────────────────────────────────────────────────

# ═══ CONFIGURACIÓN (editá estas 3 cosas) ═══
TELEGRAM_TOKEN="7853802031:AAFw-p0IRMnD4oxnuHgvmPm5TeOaWA2U5wU"      # token del bot THOR (@Teatris_monitorbot)
TELEGRAM_CHAT="8049491847"     # tu chat id
URLS="
https://offlinevideoplayer.vercel.app/
https://5fae371f-39e5-4c16-9b04-658e273c947c.clouding.host/
https://5fae371f-39e5-4c16-9b04-658e273c947c.clouding.host/asistente.html
"
# ═════════════════════════════════════════════════════════════
# (opcional) si existe la lista compartida, se usa ESA (la edita el bot con /agregar)
if [ -f "/opt/zonahack/paginas_vigiladas.txt" ]; then
  URLS="$(cat /opt/zonahack/paginas_vigiladas.txt)"
fi

ESTADO_FILE="/tmp/telegram_web_state.txt"
CHECK_TIMEOUT=15

# ── enviar mensaje a Telegram ──
telegram() {
  local msg="$1"
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
    -d chat_id="${TELEGRAM_CHAT}" \
    -d text="${msg}" \
    --max-time 15 >/dev/null 2>&1
}

# ── chequear una URL: devuelve ok o down ──
chequear() {
  local url="$1"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time "${CHECK_TIMEOUT}" -A "MonitorBot/1.0" "$url" 2>/dev/null)
  if [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "302" ]; then
    echo "ok"
  else
    echo "down"
  fi
}

# ── modo TEST: enviar un mensaje de prueba ──
if [ "$1" = "--test" ]; then
  if [ "$TELEGRAM_TOKEN" = "PONE_AQUI_TU_TOKEN" ] || [ "$TELEGRAM_CHAT" = "PONE_AQUI_TU_CHAT_ID" ]; then
    echo "Primero configurá TELEGRAM_TOKEN y TELEGRAM_CHAT en el script."
    exit 1
  fi
  telegram "✅ TEST del monitor de páginas: está funcionando."
  echo "Mensaje de prueba enviado. Si no te llegó, revisá token y chat_id."
  exit 0
fi

# ── primer run: solo guardar estado, sin notificar ──
PRIMER_RUN=0
[ -f "$ESTADO_FILE" ] || PRIMER_RUN=1

# ── leer estado anterior ──
declare -A previo
if [ -f "$ESTADO_FILE" ]; then
  while IFS='=' read -r u s; do
    [ -n "$u" ] && previo["$u"]="$s"
  done < "$ESTADO_FILE"
fi

# ── chequear cada URL ──
caidas=""
recuperadas=""
: > "$ESTADO_FILE.tmp"
while IFS= read -r url; do
  [ -z "$url" ] && continue
  estado=$(chequear "$url")
  anterior="${previo["$url"]:-}"
  if [ "$estado" = "down" ] && [ "$anterior" != "down" ]; then
    caidas="${caidas}${caidas:+ | }${url}"
  fi
  if [ "$estado" = "ok" ] && [ "$anterior" = "down" ]; then
    recuperadas="${recuperadas}${recuperadas:+, }${url}"
  fi
  echo "${url}=${estado}" >> "$ESTADO_FILE.tmp"
done <<< "$URLS"
mv "$ESTADO_FILE.tmp" "$ESTADO_FILE" 2>/dev/null

# ── notificar cambios ──
if [ "$PRIMER_RUN" = "0" ]; then
  if [ -n "$caidas" ]; then
    telegram "⚠️ ALERTA: la/s página/s se cayeron:
${caidas}"
    echo "Caída: ${caidas}"
  fi
  if [ -n "$recuperadas" ]; then
    telegram "✅ Volvieron a estar en línea: ${recuperadas}"
    echo "Volvió: ${recuperadas}"
  fi
fi

exit 0