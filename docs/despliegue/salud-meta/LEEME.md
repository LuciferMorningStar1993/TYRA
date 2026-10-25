# Despliegue: meta de peso (no ejecutado)

Las dos migraciones van **juntas y en este orden**:

1. `20261025143803_weight_goals`: crea `weight_goals` y `set_weight_goal`.
2. `20261025150743_weight_goals_conflict_errors`: **correctiva y obligatoria**. Cambia `goal_conflict` y `goal_missing` de `40001` a `PT409`.

Con **solo la primera** aplicada, PostgREST reintenta sin fin cualquier conflicto (`40001` es un error que se reintenta), y una edición desde otro dispositivo deja la petición colgada mientras genera miles de transacciones por segundo. Por eso:

- `supabase db push --linked --dry-run` debe listar **las dos**. Si solo aparece una, se detiene el despliegue.
- **El cliente con la meta de peso no se publica** (ni por EAS Update ni por build) hasta que las comprobaciones posteriores confirmen las dos migraciones en remoto.

**Comprobaciones posteriores** (solo lectura):

```bash
bash docs/despliegue/salud-fase1/run-checks.sh docs/despliegue/salud-meta/postchecks --linked
```

Verifican RLS, permisos de la tabla y que `set_weight_goal` sea ejecutable solo por `authenticated`, como `security definer` y con `search_path` vacío.

**Antes de publicar el cliente**, comprobar también que la función ya no usa `40001` (solo lectura):

```bash
supabase db query --linked "select position('40001' in prosrc) = 0 as ok from pg_proc where proname = 'set_weight_goal'"
```

**Nunca contra remoto:** `npm run test:goals-api-local` y `npm run test:goals-concurrency`, porque crean cuentas temporales.
