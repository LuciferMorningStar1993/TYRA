-- Perfil de cada usuario de TYRA (1:1 con auth.users).
-- Los indicadores (IMC, calorías) se calculan en la app a partir de estos datos.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  sex text check (sex in ('male', 'female')),
  birth_date date check (birth_date > '1900-01-01' and birth_date < current_date),
  height_cm numeric(5, 1) check (height_cm between 50 and 260),
  weight_kg numeric(5, 1) check (weight_kg between 20 and 400),
  activity_level text check (
    activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')
  ),
  goal text check (goal in ('lose', 'maintain', 'gain')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: el usuario ve su perfil"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: el usuario edita su perfil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- updated_at automático
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crea el perfil vacío en cuanto se da de alta un usuario en Auth
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
