-- Mediciones de peso (fuente única), auditoría de correcciones con retención de 180 días,
-- resúmenes mensuales, transición desde profiles.weight_kg y onboarding transaccional.
-- Propuesta y decisiones: docs/propuestas/salud-peso/propuesta.md (migración A; la B es posterior).
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Mediciones vigentes. Fuente ÚNICA del peso.
--    · Fechadas: una por usuario y día (measured_on = día local que elige la persona).
--    · Heredada: como mucho una por usuario, SIN fecha de medición (measured_on null,
--      origin 'legacy_profile'). Es el peso que había en el perfil; no se le inventa fecha.
--      Se excluye de gráficas y resúmenes hasta que la persona confirme su fecha.
--    Corregir = UPDATE de la fila. Eliminar = DELETE real. Ambas operaciones exigen la versión
--    leída (control de concurrencia optimista) y quedan en la auditoría (sección 2).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  measured_on date,
  weight_kg numeric(5, 1) not null,
  origin text not null default 'manual',
  -- Sube en cada corrección; la app la envía en UPDATE y DELETE (where id = ? and version = ?).
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weight_entries_one_per_day unique (user_id, measured_on),
  constraint weight_entries_weight_range check (weight_kg between 20 and 400),
  -- Mismo patrón que profiles.birth_date. +1 día cubre los husos horarios por delante de UTC.
  constraint weight_entries_measured_on_range check (
    measured_on is null or (measured_on >= date '1900-01-02' and measured_on <= current_date + 1)
  ),
  constraint weight_entries_origin check (origin in ('manual', 'legacy_profile')),
  -- Solo el peso heredado puede no tener fecha de medición.
  constraint weight_entries_date_required check (measured_on is not null or origin = 'legacy_profile')
);

-- A lo sumo un peso heredado sin fecha por usuario.
create unique index weight_entries_one_undated on public.weight_entries (user_id) where measured_on is null;

comment on table public.weight_entries is
  'Mediciones de peso vigentes. Peso actual = fechada más reciente; si no hay fechadas, el heredado (sin fecha confirmada).';
comment on column public.weight_entries.measured_on is
  'Día de la medición (fecha local). Null solo en el peso heredado del perfil mientras no se confirme su fecha.';

-- Índices: el de la restricción única (user_id, measured_on) cubre las lecturas fechadas
-- (peso vigente, historial con cursor, gráfica, resúmenes); el parcial (user_id) where
-- measured_on is null cubre la lectura del peso heredado. No se agregan más.

create function public.weight_entries_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Una medición fechada no vuelve a quedar sin fecha.
  if old.measured_on is not null and new.measured_on is null then
    raise exception 'weight_entry_date_required' using errcode = '23514';
  end if;
  -- Solo un cambio real es una nueva versión (un reintento idéntico no provoca conflictos).
  if old.measured_on is distinct from new.measured_on or old.weight_kg is distinct from new.weight_kg then
    new.version = old.version + 1;
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create trigger weight_entries_before_update
  before update on public.weight_entries
  for each row execute function public.weight_entries_before_update();

alter table public.weight_entries enable row level security;

create policy "weight_entries: el dueño ve sus mediciones"
  on public.weight_entries for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "weight_entries: el dueño registra"
  on public.weight_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "weight_entries: el dueño corrige"
  on public.weight_entries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "weight_entries: el dueño elimina"
  on public.weight_entries for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Privilegios por columna: la app solo escribe fecha y peso. id, user_id (= auth.uid()), origin,
-- version y marcas de tiempo los pone el servidor.
revoke all on public.weight_entries from anon, authenticated;
grant select, delete on public.weight_entries to authenticated;
grant insert (measured_on, weight_kg), update (measured_on, weight_kg) on public.weight_entries to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Auditoría generada en el servidor: valores ANTERIORES de cada corrección o eliminación.
--    Solo lectura para el dueño. Vence a los 180 días (sección 4); las mediciones vigentes NO
--    vencen: permanecen hasta que la persona las elimine o elimine su cuenta.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.weight_entry_audit (
  id bigint generated always as identity primary key,
  entry_id uuid not null, -- sin FK: la medición puede haberse eliminado
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('correction', 'deletion')),
  old_measured_on date,   -- null si era el peso heredado sin fecha
  old_weight_kg numeric(5, 1) not null,
  old_version integer not null,
  new_measured_on date,
  new_weight_kg numeric(5, 1),
  changed_at timestamptz not null default now(),
  constraint weight_entry_audit_new_values check (
    (action = 'correction' and new_weight_kg is not null)
    or (action = 'deletion' and new_measured_on is null and new_weight_kg is null)
  )
);

comment on table public.weight_entry_audit is
  'Valores anteriores de mediciones corregidas o eliminadas. Se purga a los 180 días; no afecta a las mediciones vigentes.';

-- Consultas: «correcciones de esta medición» (entry_id) y «actividad reciente» (user_id), ambas
-- ordenadas por changed_at. Con 180 días de retención y 4 usuarios son pocos cientos de filas por
-- persona: un único índice (user_id, changed_at desc) sirve a ambas (la de entry_id filtra dentro
-- de las filas del usuario que ya exige la RLS). La purga diaria recorre la tabla completa.
create index weight_entry_audit_user_idx on public.weight_entry_audit (user_id, changed_at desc);

alter table public.weight_entry_audit enable row level security;

create policy "weight_entry_audit: el dueño ve su auditoría"
  on public.weight_entry_audit for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.weight_entry_audit from anon, authenticated;
grant select on public.weight_entry_audit to authenticated;

create function public.audit_weight_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Solo los cambios reales de fecha o peso son correcciones.
    if old.measured_on is distinct from new.measured_on or old.weight_kg is distinct from new.weight_kg then
      insert into public.weight_entry_audit
        (entry_id, user_id, action, old_measured_on, old_weight_kg, old_version, new_measured_on, new_weight_kg)
      values
        (old.id, old.user_id, 'correction', old.measured_on, old.weight_kg, old.version, new.measured_on, new.weight_kg);
    end if;
    return new;
  end if;

  -- DELETE. Si el perfil ya no existe es el borrado en cascada de la cuenta: no se audita.
  if exists (select 1 from public.profiles where id = old.user_id) then
    insert into public.weight_entry_audit (entry_id, user_id, action, old_measured_on, old_weight_kg, old_version)
    values (old.id, old.user_id, 'deletion', old.measured_on, old.weight_kg, old.version);
  end if;
  return old;
end;
$$;

revoke execute on function public.audit_weight_entry() from public, anon, authenticated;

create trigger weight_entries_audit
  after update or delete on public.weight_entries
  for each row execute function public.audit_weight_entry();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Resúmenes mensuales: solo mediciones vigentes CON fecha (el peso heredado sin fecha queda
--    fuera). security_invoker: aplica la RLS de quien consulta. Meses sin filas = «sin datos»;
--    1 medición = «insuficiente» (change_kg null). La app no deduce tendencias estacionales.
-- ─────────────────────────────────────────────────────────────────────────────
create view public.weight_monthly_summaries
with (security_invoker = true) as
select
  user_id,
  date_trunc('month', measured_on)::date as month,
  count(*)::int as entries,
  round(avg(weight_kg), 1) as average_kg,
  min(measured_on) as first_measured_on,
  (array_agg(weight_kg order by measured_on asc))[1] as first_weight_kg,
  max(measured_on) as last_measured_on,
  (array_agg(weight_kg order by measured_on desc))[1] as last_weight_kg,
  case
    when count(*) >= 2
      then (array_agg(weight_kg order by measured_on desc))[1] - (array_agg(weight_kg order by measured_on asc))[1]
  end as change_kg
from public.weight_entries
where measured_on is not null
group by user_id, date_trunc('month', measured_on);

revoke all on public.weight_monthly_summaries from anon, authenticated;
grant select on public.weight_monthly_summaries to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Retención de la auditoría: 180 días (pg_cron, incluido en el plan Free).
-- ─────────────────────────────────────────────────────────────────────────────
create function public.purge_weight_entry_audit(retention interval default interval '180 days')
returns integer
language sql
security definer
set search_path = ''
as $$
  with purged as (
    delete from public.weight_entry_audit where changed_at < now() - retention returning 1
  )
  select count(*)::int from purged;
$$;

revoke execute on function public.purge_weight_entry_audit(interval) from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('purge-weight-entry-audit', '17 3 * * *', $$select public.purge_weight_entry_audit()$$);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Transición desde profiles.weight_kg: importación registrada UNA sola vez por usuario.
--    El registro (weight_legacy_imports) se escribe antes que la medición; si la persona elimina
--    después su peso heredado, repetir la importación no lo recrea. También sirve de prueba
--    ejecutable para la retirada de la columna (posterior/).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.weight_legacy_imports (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  weight_kg numeric(5, 1) not null,
  -- 'migration': copiado al aplicar esta migración. 'legacy_client': escrito después por una app
  -- sin actualizar (onboarding viejo) y capturado por el trigger de compatibilidad.
  source text not null check (source in ('migration', 'legacy_client')),
  imported_at timestamptz not null default now()
);

comment on table public.weight_legacy_imports is
  'Registro de la importación única de profiles.weight_kg a weight_entries (transición; se conserva hasta retirar la columna).';

alter table public.weight_legacy_imports enable row level security; -- sin políticas: solo el servidor
revoke all on public.weight_legacy_imports from anon, authenticated;

create function public.import_legacy_profile_weight(p_user_id uuid, p_weight_kg numeric, p_source text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.weight_legacy_imports (user_id, weight_kg, source)
  values (p_user_id, p_weight_kg, p_source)
  on conflict (user_id) do nothing;
  if not found then
    return false; -- ya se importó antes (aunque después se haya eliminado): no se repite
  end if;
  insert into public.weight_entries (user_id, measured_on, weight_kg, origin)
  values (p_user_id, null, p_weight_kg, 'legacy_profile');
  return true;
end;
$$;

create function public.import_profile_weights()
returns integer
language sql
security definer
set search_path = ''
as $$
  select count(*) filter (where public.import_legacy_profile_weight(p.id, p.weight_kg, 'migration'))::int
  from public.profiles p
  where p.weight_kg is not null;
$$;

revoke execute on function public.import_legacy_profile_weight(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.import_profile_weights() from public, anon, authenticated;

-- Última escritura de clientes antiguos, registrada APARTE de la importación única: cada cambio de
-- profiles.weight_kg actualiza esta fila (valor, cantidad y fecha), aunque vuelva al valor original.
-- weight_legacy_imports no se modifica nunca después de su primera fila.
-- Sirve a la migración B para saber si algún cliente antiguo sigue escribiendo.
create table public.weight_legacy_client_writes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_weight_kg numeric(5, 1),      -- null si el cliente vació la columna
  write_count integer not null check (write_count > 0),
  first_written_at timestamptz not null default now(),
  last_written_at timestamptz not null default now()
);

comment on table public.weight_legacy_client_writes is
  'Última escritura de profiles.weight_kg hecha por apps sin actualizar (transición; se elimina con la migración B).';

alter table public.weight_legacy_client_writes enable row level security; -- sin políticas: solo el servidor
revoke all on public.weight_legacy_client_writes from anon, authenticated;

-- Compatibilidad con clientes antiguos: la app nueva nunca escribe profiles.weight_kg; solo lo hace
-- el onboarding de una app sin actualizar. Cada cambio se registra en weight_legacy_client_writes;
-- el primer valor no nulo, además, se importa una sola vez como peso heredado.
create function public.capture_legacy_profile_weight()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.weight_kg is distinct from old.weight_kg then
    insert into public.weight_legacy_client_writes (user_id, last_weight_kg, write_count)
    values (new.id, new.weight_kg, 1)
    on conflict (user_id) do update
      set last_weight_kg = excluded.last_weight_kg,
          write_count = public.weight_legacy_client_writes.write_count + 1,
          last_written_at = now();
    if new.weight_kg is not null then
      perform public.import_legacy_profile_weight(new.id, new.weight_kg, 'legacy_client');
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.capture_legacy_profile_weight() from public, anon, authenticated;

create trigger profiles_capture_legacy_weight
  after update of weight_kg on public.profiles
  for each row execute function public.capture_legacy_profile_weight();

select public.import_profile_weights();

comment on column public.profiles.weight_kg is
  'OBSOLETA: el peso vive en weight_entries. La app nueva no la lee ni la escribe; las escrituras de apps viejas se capturan una vez (weight_legacy_imports).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Onboarding transaccional e idempotente (app nueva).
--    Perfil + primera medición en una sola transacción, con la sesión de la persona (RLS).
--    · Ya completado → 'already_completed' sin escribir nada (reintento tras respuesta perdida,
--      o el otro dispositivo terminó primero). La fila del perfil se bloquea (for update).
--    · p_measured_on lo fija la app en el PRIMER intento y lo reutiliza en los reintentos, aunque
--      ya sea otro día. Se acepta hasta 2 días atrás; si no, 'invalid_measured_on'.
--    · Si ya existe una medición ese día con el mismo peso, se reutiliza; con otro peso,
--      'weight_day_conflict' y no se guarda nada.
--    · Campos obligatorios (nombre no vacío, sexo, nacimiento, estatura, actividad, objetivo, peso
--      y fecha) se validan antes de escribir: 'missing_<campo>' (22023).
--    · Cualquier error (p. ej. estatura fuera de rango) revierte también la medición.
-- ─────────────────────────────────────────────────────────────────────────────
create function public.complete_onboarding(
  p_display_name text,
  p_gender text,
  p_sex text,
  p_birth_date date,
  p_height_cm numeric,
  p_activity_level text,
  p_goal text,
  p_theme_palette text,
  p_weight_kg numeric,
  p_measured_on date
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_onboarded_at timestamptz;
  v_existing numeric(5, 1);
begin
  if v_user is null then
    raise exception 'no_session' using errcode = '42501';
  end if;

  select onboarded_at into v_onboarded_at from public.profiles where id = v_user for update;
  if not found then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;
  if v_onboarded_at is not null then
    return 'already_completed';
  end if;

  -- Obligatorios, antes de escribir nada (además, cualquier error revierte la transacción).
  -- gender y theme_palette son opcionales.
  if p_display_name is null or btrim(p_display_name) = '' then
    raise exception 'missing_display_name' using errcode = '22023';
  elsif p_sex is null then
    raise exception 'missing_sex' using errcode = '22023';
  elsif p_birth_date is null then
    raise exception 'missing_birth_date' using errcode = '22023';
  elsif p_height_cm is null then
    raise exception 'missing_height_cm' using errcode = '22023';
  elsif p_activity_level is null then
    raise exception 'missing_activity_level' using errcode = '22023';
  elsif p_goal is null then
    raise exception 'missing_goal' using errcode = '22023';
  elsif p_weight_kg is null then
    raise exception 'missing_weight_kg' using errcode = '22023';
  elsif p_measured_on is null then
    raise exception 'missing_measured_on' using errcode = '22023';
  end if;

  if p_measured_on < current_date - 2 or p_measured_on > current_date + 1 then
    raise exception 'invalid_measured_on' using errcode = '22023';
  end if;

  insert into public.weight_entries (measured_on, weight_kg)
  values (p_measured_on, p_weight_kg)
  on conflict (user_id, measured_on) do nothing;

  select weight_kg into v_existing
  from public.weight_entries
  where user_id = v_user and measured_on = p_measured_on;
  if v_existing is distinct from round(p_weight_kg, 1) then
    raise exception 'weight_day_conflict' using errcode = '23505';
  end if;

  update public.profiles
  set display_name = btrim(p_display_name),
      gender = p_gender,
      sex = p_sex,
      birth_date = p_birth_date,
      height_cm = p_height_cm,
      activity_level = p_activity_level,
      goal = p_goal,
      theme_palette = coalesce(p_theme_palette, theme_palette),
      onboarded_at = now()
  where id = v_user;

  return 'completed';
end;
$$;

revoke execute on function public.complete_onboarding(text, text, text, date, numeric, text, text, text, numeric, date)
  from public, anon;
grant execute on function public.complete_onboarding(text, text, text, date, numeric, text, text, text, numeric, date)
  to authenticated;
