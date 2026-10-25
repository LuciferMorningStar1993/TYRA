#!/usr/bin/env bash
# Concurrencia REAL de la meta de peso contra el Supabase LOCAL (nunca remoto): dos sesiones de base
# de datos simultáneas. La primera ejecuta la operación y retiene su transacción unos segundos; la
# segunda empieza mientras tanto y debe esperar el bloqueo y terminar con el resultado correcto.
# Crea UNA cuenta temporal propia (concurrencia-<marca>@tyra.test) y la borra al final (trap), aunque
# falle. No toca ninguna otra cuenta. Uso: npm run test:goals-concurrency
set -uo pipefail

CONTAINER=supabase_db_TYRA
HOLD=2 # segundos que la primera sesión retiene su transacción

status_json="$(supabase status -o json 2>/dev/null || true)"
api_url="$(printf '%s' "$status_json" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).API_URL||"")}catch{}')"
db_url="$(printf '%s' "$status_json" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).DB_URL||"")}catch{}')"
if [[ "$api_url" != "http://127.0.0.1:55321" || "$db_url" != *"@127.0.0.1:55322/"* ]] || ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "[ABORTA] No es el Supabase local de TYRA (API 55321, base 55322, contenedor $CONTAINER)." >&2
  exit 2
fi

psql_su() { docker exec -i "$CONTAINER" psql -U postgres -X -A -t -q -v ON_ERROR_STOP=1 "$@"; }

marker="$(date +%s)-$RANDOM"
email="concurrencia-${marker}@tyra.test"
user_id="$(psql_su -c "insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '$email')
  returning id")"
user_id="$(printf '%s' "$user_id" | tr -d '[:space:]')"
if [[ ! "$user_id" =~ ^[0-9a-f-]{36}$ ]]; then echo "[ABORTA] No se pudo crear la cuenta temporal." >&2; exit 2; fi

cleanup() {
  # Solo la cuenta creada por ESTA ejecución (id y correo); la cascada borra su perfil, mediciones y meta.
  local deleted
  deleted="$(psql_su -c "delete from auth.users where id = '$user_id' and email = '$email' returning 1" 2>&1 | tr -d '[:space:]')"
  if [[ "$deleted" == "1" ]]; then echo "Limpieza: cuenta temporal eliminada."; else echo "FALLA  Limpieza: no se pudo eliminar la cuenta temporal ($deleted)." >&2; fi
}
trap cleanup EXIT

psql_su -c "update public.profiles set birth_date = '1990-01-01' where id = '$user_id';
  insert into public.weight_entries (user_id, measured_on, weight_kg) values ('$user_id', current_date - 3, 72.0);" >/dev/null

failures=0
check() { # etiqueta, condición (0 = pasa), detalle
  if [[ "$2" == "0" ]]; then echo "PASA   $1${3:+ — $3}"; else echo "FALLA  $1${3:+ — $3}"; failures=$((failures + 1)); fi
}

# Ejecuta SQL como la cuenta temporal en una transacción; si $2 > 0 la retiene antes de confirmar.
as_user() { # sql, segundos_retención
  docker exec -i "$CONTAINER" psql -U postgres -X -A -t -q -v ON_ERROR_STOP=1 <<SQL 2>&1
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"$user_id","role":"authenticated"}', true) \gset
$1;
select pg_sleep($2) \gset
commit;
SQL
}

now() { python3 -c 'import time; print(time.time())'; }

# Corre A (retiene HOLD s) y, 0.5 s después, B. Deja salidas y duración de B en variables globales.
race() { # sql_a, sql_b
  local file_a file_b start end
  file_a="$(mktemp)"; file_b="$(mktemp)"
  as_user "$1" "$HOLD" >"$file_a" &
  local pid_a=$!
  sleep 0.5
  start="$(now)"; as_user "$2" 0 >"$file_b"; end="$(now)"
  wait "$pid_a"
  out_a="$(cat "$file_a")"; out_b="$(cat "$file_b")"; rm -f "$file_a" "$file_b"
  waited="$(python3 -c "print(round($end - $start, 2))")"
}
blocked() { python3 -c "import sys; sys.exit(0 if $waited >= 1.0 else 1)"; }
goal_row() { psql_su -c "select coalesce(string_agg(id || '|' || target_weight_kg || '|' || version, ','), 'ninguna') from public.weight_goals where user_id = '$user_id'" | tr -d '[:space:]'; }
goal_count() { psql_su -c "select count(*) from public.weight_goals where user_id = '$user_id'" | tr -d '[:space:]'; }

echo "Supabase local: $api_url · cuenta temporal creada"

# 1. Dos creaciones simultáneas: una meta y un conflicto.
race "select id from public.set_weight_goal(70)" "select id from public.set_weight_goal(69)"
blocked; check "1. Creaciones simultáneas: la segunda espera el bloqueo" "$?" "esperó ${waited}s"
[[ "$out_a" != *ERROR* ]]; check "1. La primera crea la meta" "$?"
[[ "$out_b" == *goal_conflict* ]]; check "1. La segunda recibe goal_conflict" "$?" "$(printf '%s' "$out_b" | grep -o 'goal_[a-z]*' | head -1)"
row="$(goal_row)"; [[ "$(goal_count)" == "1" && "$row" == *"|70.0|1" ]]
check "1. Queda una sola meta (70 kg, versión 1)" "$?"
goal1="${row%%|*}"

# 2. Dos ediciones simultáneas con la misma versión: una gana, la otra conflicto.
race "select version from public.set_weight_goal(68, '$goal1', 1)" "select version from public.set_weight_goal(67, '$goal1', 1)"
blocked; check "2. Ediciones simultáneas: la segunda espera el bloqueo" "$?" "esperó ${waited}s"
[[ "$out_b" == *goal_conflict* ]]; check "2. La segunda (versión vieja) recibe goal_conflict" "$?"
[[ "$(goal_row)" == "$goal1|68.0|2" ]]; check "2. Prevalece la primera (68 kg, versión 2)" "$?"

# 3. Eliminación y edición simultáneas: la edición no recrea la meta.
race "delete from public.weight_goals where id = '$goal1' and version = 2" "select version from public.set_weight_goal(66, '$goal1', 2)"
blocked; check "3. Edición durante una eliminación: espera el bloqueo" "$?" "esperó ${waited}s"
[[ "$out_b" == *goal_missing* ]]; check "3. La edición recibe goal_missing" "$?"
[[ "$(goal_row)" == "ninguna" ]]; check "3. La meta eliminada no se recrea" "$?"

# 4. Creación de una meta nueva y, al mismo tiempo, un reinicio obsoleto de la eliminada. La meta
#    nueva aún no está confirmada: el reinicio no la ve, no necesita esperar y no la toca.
race "select id from public.set_weight_goal(65)" "select version from public.set_weight_goal(60, '$goal1', 2, true)"
[[ "$out_b" == *goal_missing* ]]; check "4. El reinicio con el id eliminado recibe goal_missing" "$?" "respondió en ${waited}s, sin esperar"
row="$(goal_row)"; goal2="${row%%|*}"
[[ "$goal2" != "$goal1" && "$row" == *"|65.0|1" ]]; check "4. La meta nueva (otro id) queda intacta" "$?"
race "select version from public.set_weight_goal(64, '$goal2', 1)" "delete from public.weight_goals where id = '$goal1' and version = 1"
[[ "$(goal_row)" == "$goal2|64.0|2" ]]; check "4. Una eliminación obsoleta (id viejo) no borra la meta nueva" "$?"

echo
if [[ "$failures" -eq 0 ]]; then echo "Todo pasa."; exit 0; fi
echo "$failures verificación(es) fallaron."
exit 1
