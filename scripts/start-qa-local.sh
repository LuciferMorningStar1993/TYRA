#!/usr/bin/env bash
# QA manual contra el Supabase LOCAL (Docker). Ver docs/qa-local.md.
# Lee la URL y la clave publicable de `supabase status` (sin imprimir la clave) y arranca
# Expo en modo QA local; la app rechaza cualquier backend que no sea local.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! status_json="$(supabase status -o json 2>/dev/null)"; then
  echo "[QA local] Supabase local no está corriendo. Ejecuta: supabase start" >&2
  exit 1
fi

api_url="$(printf '%s' "$status_json" | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(s.API_URL||"")')"
publishable_key="$(printf '%s' "$status_json" | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(s.PUBLISHABLE_KEY||s.ANON_KEY||"")')"

if [[ -z "$api_url" || -z "$publishable_key" ]]; then
  echo "[QA local] No se pudo leer API_URL o la clave publicable de supabase status." >&2
  exit 1
fi

export EXPO_PUBLIC_QA_LOCAL=1
export EXPO_PUBLIC_QA_SUPABASE_URL="$api_url"
export EXPO_PUBLIC_QA_SUPABASE_PUBLISHABLE_KEY="$publishable_key"

echo "[QA local] Supabase: $api_url · clave publicable: presente"
# --clear evita reutilizar transformaciones en caché con otra configuración.
exec npx expo start --clear "$@"
