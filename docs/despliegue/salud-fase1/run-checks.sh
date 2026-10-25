#!/usr/bin/env bash
# Ejecuta las comprobaciones de solo lectura (una sentencia por archivo) y ABORTA en el primer fallo:
# código de salida distinto de 0, error devuelto por `supabase db query` o una fila con "ok": false.
# Uso: bash docs/despliegue/salud-fase1/run-checks.sh <carpeta de comprobaciones> <--linked|--local>
set -euo pipefail

dir="${1:?Indica la carpeta: docs/despliegue/salud-fase1/prechecks o .../postchecks}"
target="${2:?Indica el destino: --linked (remoto) o --local}"
case "$target" in --linked | --local) ;; *) echo "Destino inválido: $target" >&2; exit 2 ;; esac

shopt -s nullglob
files=("$dir"/*.sql)
if [ ${#files[@]} -eq 0 ]; then echo "No hay archivos .sql en $dir" >&2; exit 2; fi

for file in "${files[@]}"; do
  echo "== $file"
  if ! output="$(supabase db query "$target" -f "$file" 2>&1)"; then
    printf '%s\n' "$output"
    echo "ABORTA: $file terminó con error." >&2
    exit 1
  fi
  printf '%s\n' "$output"
  if grep -qE '"_tag": *"Error"|"error": *\{' <<<"$output"; then
    echo "ABORTA: $file devolvió un error de la base." >&2
    exit 1
  fi
  if grep -qE '"ok": *false' <<<"$output"; then
    echo "ABORTA: $file tiene comprobaciones con ok = false." >&2
    exit 1
  fi
done
echo "Todas las comprobaciones de $dir terminaron sin errores."
