# Procedimiento: aplicar y probar la migración A en el Supabase local de TYRA

> **Todavía no se ejecuta.** Cada paso necesita tu autorización explícita. Es solo para el entorno **local**: nunca `--linked`, `db push` ni `db reset`, y no se borran volúmenes ni se usa `supabase stop --no-backup`.
> La migración B **no** se aplica.

Se ejecuta desde `/Users/antonioortega/Documents/TYRA`, en la rama `feat/salud-peso`.

## 1. Arrancar y comprobar que es el Supabase de TYRA

```bash
supabase start
```

```bash
supabase status
```

- `API_URL` debe ser `http://127.0.0.1:55321` y `DB_URL` debe usar el puerto **55322**.
- Si aparece cualquier puerto 543xx, es el Supabase de Metafinanciera: **se detiene aquí**.

```bash
docker ps --format '{{.Names}}' | grep supabase_db_TYRA
```

## 2. Comprobaciones previas (solo lectura)

`psql` no está instalado en tu Mac, así que se usa el del contenedor:

```bash
docker exec supabase_db_TYRA psql -U postgres -d postgres -c "select name, installed_version from pg_available_extensions where name = 'pg_cron';"
```

```bash
docker exec supabase_db_TYRA psql -U postgres -d postgres -c "select (select count(*) from auth.users) as usuarios, (select count(*) from public.profiles) as perfiles, (select count(*) from public.profiles where weight_kg is not null) as con_peso;"
```

- Anota los tres números (`usuarios`, `perfiles`, `con_peso`) y si `pg_cron` ya estaba instalado (`installed_version`).
- `pg_cron` debe aparecer en la lista de extensiones disponibles.

## 3. Respaldo de los datos locales (fuera del repo)

```bash
mkdir -p ~/tyra-backups
```

```bash
supabase db dump --local -f ~/tyra-backups/$(date +%Y%m%d-%H%M)-schema.sql
```

```bash
supabase db dump --local --data-only -s public,auth -f ~/tyra-backups/$(date +%Y%m%d-%H%M)-data.sql
```

Los respaldos contienen solo datos de QA local y quedan fuera de git.

## 4. Crear el archivo de migración

```bash
supabase migration new weight_entries
```

Copia el contenido de `docs/propuestas/salud-peso/migracion-a-weight-entries.sql` en el archivo que se acaba de crear, `supabase/migrations/<TIMESTAMP>_weight_entries.sql`, y quita el encabezado «BORRADOR — NO APLICAR».

```bash
supabase migration list --local
```

En la columna local solo debe aparecer pendiente `<TIMESTAMP>_weight_entries`.

## 5. Aplicar solo las migraciones pendientes (conserva los datos)

```bash
supabase migration up --local
```

Este comando aplica únicamente lo pendiente sobre la base existente; no la reinicia.

## 6. Verificar que los datos se conservaron y la importación

```bash
docker exec supabase_db_TYRA psql -U postgres -d postgres -c "select (select count(*) from auth.users) as usuarios, (select count(*) from public.profiles) as perfiles, (select count(*) from public.profiles where weight_kg is not null) as con_peso;"
```

Los tres números deben ser iguales a los del paso 2.

```bash
docker exec supabase_db_TYRA psql -U postgres -d postgres -c "select (select count(*) from public.profiles p where p.weight_kg is not null and not exists (select 1 from public.weight_legacy_imports i where i.user_id = p.id)) as sin_importar, (select count(*) from public.weight_entries where origin = 'legacy_profile' and measured_on is null) as heredados_sin_fecha, (select count(*) from public.weight_legacy_client_writes) as escrituras_antiguas;"
```

| Resultado | Valor esperado |
|---|---|
| `sin_importar` | 0 |
| `heredados_sin_fecha` | `con_peso` |
| `escrituras_antiguas` | 0 |

```bash
docker exec supabase_db_TYRA psql -U postgres -d postgres -c "select jobname, schedule from cron.job where jobname = 'purge-weight-entry-audit';"
```

Debe mostrar una fila con la tarea `purge-weight-entry-audit` y el horario `17 3 * * *`.

## 7. Pruebas

```bash
cp docs/propuestas/salud-peso/weight_entries.test.sql supabase/tests/database/weight_entries.test.sql
```

```bash
npm run test:db
```

- Debe pasar `profiles_rls` (12) y `weight_entries` (90).
- Cada prueba corre en una transacción que se revierte, así que no deja datos.

```bash
npm run test:auth-local
```

Debe dar 55/55: la migración no toca Auth.

## 8. Tipos y validaciones de la app

```bash
supabase gen types typescript --local --schema public > src/lib/database.types.ts
```

```bash
npm run check:app
```

## 9. Si algo falla (solo local)

1. `supabase migration list --local` para ver si la migración quedó registrada.
2. Si quedó aplicada, total o parcialmente: edita `<TIMESTAMP>` en `docs/propuestas/salud-peso/rollback-local-migracion-a.sql` y ejecútalo:

   ```bash
   docker exec -i supabase_db_TYRA psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/propuestas/salud-peso/rollback-local-migracion-a.sql
   ```

   - `profiles.weight_kg` nunca se modifica, así que los pesos originales siguen intactos.
   - Solo se pierde lo creado en las tablas nuevas durante la prueba.
3. Si `pg_cron` no estaba instalado antes (paso 2), se puede quitar con `drop extension pg_cron;`.
4. Los respaldos del paso 3 son el último recurso. Restaurarlos implica reiniciar la base local, y eso **requiere tu aprobación aparte**.

## Qué no se hace

- Aplicar la migración B.
- Cambios en el Supabase remoto.
- Commits.
- Pantallas.

Los archivos copiados a `supabase/migrations/` y `supabase/tests/database/` quedan sin commit, para revisión.
