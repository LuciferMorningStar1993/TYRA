-- Corrige los errores de conflicto de set_weight_goal (20261025143803).
-- Antes usaban SQLSTATE 40001 (serialization_failure): PostgREST reintenta automáticamente ese código
-- y, como estos conflictos son DETERMINISTAS (otra versión, meta eliminada o ya existente), la
-- petición se reintentaba sin fin. Ahora usan 'PT409': PostgREST responde HTTP 409 sin reintentar.
-- El mensaje distingue los casos ('goal_conflict' | 'goal_missing'). Los errores reales de
-- serialización no cambian (siguen siendo 40001 en Postgres).
-- Misma firma, mismo comportamiento y mismos permisos (create or replace conserva el propietario y
-- los privilegios; se vuelven a declarar para dejarlo explícito). No toca datos.

create or replace function public.set_weight_goal(
  p_target_weight_kg numeric,
  p_goal_id uuid default null,
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
  v_creating boolean := p_goal_id is null;
begin
  if v_user is null then
    raise exception 'no_session' using errcode = '42501';
  end if;
  if p_target_weight_kg is null then
    raise exception 'missing_target' using errcode = '22023';
  end if;
  if not v_creating and p_expected_version is null then
    raise exception 'missing_version' using errcode = '22023';
  end if;

  select birth_date into v_birth from public.profiles where id = v_user;
  if v_birth is null or extract(year from age(current_date, v_birth)) < 20 then
    raise exception 'age_not_eligible' using errcode = '22023';
  end if;

  -- Bloquea la meta actual (si existe): dos dispositivos no la modifican a la vez.
  select * into v_goal from public.weight_goals where user_id = v_user for update;

  if v_creating then
    if found then
      raise sqlstate 'PT409' using message = 'goal_conflict';
    end if;
  else
    if not found or v_goal.id <> p_goal_id then
      raise sqlstate 'PT409' using message = 'goal_missing';
    end if;
    if v_goal.version <> p_expected_version then
      raise sqlstate 'PT409' using message = 'goal_conflict';
    end if;
  end if;

  if v_creating or p_reset_start then
    select * into v_latest
    from public.weight_entries
    where user_id = v_user and measured_on is not null
    order by measured_on desc
    limit 1;
    if not found then
      raise exception 'no_dated_measurement' using errcode = '22023';
    end if;
  end if;

  if v_creating then
    -- Dos creaciones simultáneas: la segunda espera, no inserta y recibe conflicto.
    insert into public.weight_goals
      (user_id, target_weight_kg, start_weight_kg, start_measured_on, start_entry_id, start_entry_version)
    values
      (v_user, p_target_weight_kg, v_latest.weight_kg, v_latest.measured_on, v_latest.id, v_latest.version)
    on conflict (user_id) do nothing
    returning * into v_goal;
    if not found then
      raise sqlstate 'PT409' using message = 'goal_conflict';
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
  where id = v_goal.id
  returning * into v_goal;
  return v_goal;
end;
$$;

revoke execute on function public.set_weight_goal(numeric, uuid, integer, boolean) from public, anon;
grant execute on function public.set_weight_goal(numeric, uuid, integer, boolean) to authenticated;
