-- SUSTITUIDO por la implementación: supabase/migrations/20261025143803_weight_goals.sql (id por creación
-- + versión) y 20261025150743_weight_goals_conflict_errors.sql (conflictos con SQLSTATE PT409, no 40001,
-- que PostgREST reintenta). Se conserva como registro de la revisión.
-- BORRADOR PARA REVISIÓN (rev. 2) — NO APLICAR (ni local ni remoto).
-- Destino tras la aprobación: supabase/migrations/<timestamp>_weight_goals.sql.
-- Meta de peso personal y opcional: una fila por persona. No crea mediciones, no cambia
-- profiles.goal ni la meta calórica (GOAL_POLICY). Sin historial de metas anteriores.

create table public.weight_goals (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  target_weight_kg numeric(5, 1) not null,
  -- Punto de partida: INSTANTÁNEA de la medición fechada vigente al crear la meta o al reiniciarla.
  -- Corregir o eliminar esa medición después no la cambia; la app lo detecta con start_entry_id y
  -- start_entry_version (ver propuesta, §4).
  start_weight_kg numeric(5, 1) not null,
  start_measured_on date not null,
  start_entry_id uuid references public.weight_entries (id) on delete set null,
  start_entry_version integer not null,
  -- Control de concurrencia: editar, reiniciar y eliminar exigen la versión leída.
  version integer not null default 1,
  set_at timestamptz not null default now(),       -- creación o último reinicio del punto de partida
  updated_at timestamptz not null default now(),   -- último cambio
  constraint weight_goals_target_range check (target_weight_kg between 20 and 400),
  constraint weight_goals_start_range check (start_weight_kg between 20 and 400),
  constraint weight_goals_version_positive check (version > 0 and start_entry_version > 0)
);

comment on table public.weight_goals is
  'Meta de peso opcional (1 por persona). Escritura solo con set_weight_goal; eliminación con la versión leída.';

alter table public.weight_goals enable row level security;

create policy "weight_goals: el dueño ve su meta"
  on public.weight_goals for select to authenticated using ((select auth.uid()) = user_id);
create policy "weight_goals: el dueño elimina su meta"
  on public.weight_goals for delete to authenticated using ((select auth.uid()) = user_id);

-- Sin insert/update para la app: crear, editar y reiniciar pasan por set_weight_goal.
-- Eliminar: delete ... where user_id = auth.uid() and version = <leída> (0 filas = conflicto o ya no existe).
revoke all on public.weight_goals from anon, authenticated;
grant select, delete on public.weight_goals to authenticated;

-- Crear, editar o reiniciar la meta de auth.uid().
--   p_expected_version null  → CREAR. Si ya existe una meta: 'goal_conflict' (no se sobrescribe).
--   p_expected_version n     → EDITAR (y reiniciar si p_reset_start). Si no existe: 'goal_missing'
--                              (una operación obsoleta NO recrea una meta eliminada). Si la versión
--                              no coincide: 'goal_conflict'.
-- Edad: misma política de producto que HEALTH_AGE_POLICY.weightGoal (src/lib/health.ts): desde 20 años.
-- El punto de partida lo toma el servidor (medición fechada vigente), nunca la app.
-- security definer: la tabla no concede insert/update; solo se escribe la fila de auth.uid().
create function public.set_weight_goal(
  p_target_weight_kg numeric,
  p_expected_version integer default null,
  p_reset_start boolean default false
)
returns public.weight_goals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_birth date;
  v_goal public.weight_goals;
  v_latest public.weight_entries;
  v_needs_start boolean := p_expected_version is null or p_reset_start;
begin
  if v_user is null then
    raise exception 'no_session' using errcode = '42501';
  end if;
  if p_target_weight_kg is null then
    raise exception 'missing_target' using errcode = '22023';
  end if;

  select birth_date into v_birth from public.profiles where id = v_user;
  if v_birth is null or extract(year from age(current_date, v_birth)) < 20 then
    raise exception 'age_not_eligible' using errcode = '22023';
  end if;

  -- Bloquea la meta actual (si existe) para que dos dispositivos no la editen a la vez.
  select * into v_goal from public.weight_goals where user_id = v_user for update;

  if p_expected_version is null then
    if found then
      raise exception 'goal_conflict' using errcode = '40001';
    end if;
  else
    if not found then
      raise exception 'goal_missing' using errcode = '40001';
    end if;
    if v_goal.version <> p_expected_version then
      raise exception 'goal_conflict' using errcode = '40001';
    end if;
  end if;

  if v_needs_start then
    select * into v_latest
    from public.weight_entries
    where user_id = v_user and measured_on is not null
    order by measured_on desc
    limit 1;
    if not found then
      raise exception 'no_dated_measurement' using errcode = '22023';
    end if;
  end if;

  if p_expected_version is null then
    -- Dos creaciones simultáneas: la segunda no inserta y recibe conflicto.
    insert into public.weight_goals
      (user_id, target_weight_kg, start_weight_kg, start_measured_on, start_entry_id, start_entry_version)
    values
      (v_user, p_target_weight_kg, v_latest.weight_kg, v_latest.measured_on, v_latest.id, v_latest.version)
    on conflict (user_id) do nothing
    returning * into v_goal;
    if not found then
      raise exception 'goal_conflict' using errcode = '40001';
    end if;
    return v_goal;
  end if;

  -- Edición sin cambios reales: no sube la versión (un reintento idéntico no provoca conflictos).
  if not p_reset_start and v_goal.target_weight_kg = round(p_target_weight_kg, 1) then
    return v_goal;
  end if;

  update public.weight_goals
  set target_weight_kg = p_target_weight_kg,
      version = version + 1,
      updated_at = now(),
      start_weight_kg = case when p_reset_start then v_latest.weight_kg else start_weight_kg end,
      start_measured_on = case when p_reset_start then v_latest.measured_on else start_measured_on end,
      start_entry_id = case when p_reset_start then v_latest.id else start_entry_id end,
      start_entry_version = case when p_reset_start then v_latest.version else start_entry_version end,
      set_at = case when p_reset_start then now() else set_at end
  where user_id = v_user
  returning * into v_goal;
  return v_goal;
end;
$$;

revoke execute on function public.set_weight_goal(numeric, integer, boolean) from public, anon;
grant execute on function public.set_weight_goal(numeric, integer, boolean) to authenticated;
