# Propuesta: Salud fase 1 — perfil y seguimiento de peso (rev. 3)

> **Estado:** para revisión de Codex. Nada está implementado ni ejecutado: ni SQL (local o remoto), ni pantallas, ni commits.
>
> **Rama:** `feat/salud-peso`, creada desde `origin/develop` (`07e8ba2`).
>
> **Borradores:** están en esta carpeta, fuera de `supabase/migrations/`, para que ningún comando los aplique.
> - `migracion-a-weight-entries.sql`: **entrega inicial**.
> - `weight_entries.test.sql`: pgTAP, 90 aserciones.
> - `procedimiento-local.md` y `rollback-local-migracion-a.sql`: cómo aplicar y probar la migración A en el Supabase local, conservando los datos.
> - `posterior/migracion-b-retirar-weight-kg.sql`: **entrega posterior**. No forma parte de la inicial.

## Cambios respecto a la rev. 2

La dirección de la rev. 2 quedó aceptada. Esta revisión aplica dos correcciones:

| Corrección | Ajuste |
|---|---|
| Registrar aparte la última escritura de clientes antiguos | Nueva tabla `weight_legacy_client_writes` (último valor, cantidad de cambios, primera y última fecha). El trigger la actualiza en **cada** cambio de `profiles.weight_kg`, incluso si vuelve al valor original. `weight_legacy_imports` (importación única) no se modifica nunca después de su primera fila. La migración B usa este registro en sus comprobaciones (b) y (c) |
| Validar los obligatorios en `complete_onboarding` | Antes de escribir nada se rechazan con `missing_<campo>` (22023): nombre nulo o vacío (solo espacios), sexo, fecha de nacimiento, estatura, actividad, objetivo, peso y fecha de medición. El nombre se guarda sin espacios a los lados |

## Cambios respecto a la rev. 1

| Punto de la revisión | Ajuste |
|---|---|
| Clientes antiguos e importación única | La importación queda registrada en `weight_legacy_imports`, una sola vez por usuario. Un trigger de compatibilidad captura el peso que escriba una app sin actualizar. La retirada de la columna (B) tiene 3 comprobaciones ejecutables y es una entrega posterior |
| Medición eliminada que reaparece | El registro se escribe antes que la medición. Si la importación se repite, no recrea lo que la persona eliminó |
| Peso heredado sin fecha inventada | Se guarda con `measured_on = null` (`origin = 'legacy_profile'`). Queda fuera de la gráfica y los resúmenes hasta que la persona confirme la fecha. Ya **no** se usa la fecha del onboarding |
| Onboarding transaccional | Función `complete_onboarding` (security invoker, una transacción): idempotente, con reintentos después de medianoche y conflictos con mediciones existentes |
| Concurrencia al eliminar | Columna `version` que sube con cada corrección real. Corregir y eliminar exigen `id + version`; con 0 filas, es un conflicto |
| Consulta de correcciones y retención | Hay una consulta por medición y otra de actividad reciente. La auditoría vence a los 180 días; las mediciones vigentes no vencen |

## 1. Modelo

```
profiles (1) ──< weight_entries (N)          vigentes: fechadas (1/día) + ≤ 1 heredada sin fecha
    │                 │ trigger BEFORE UPDATE: version + 1, updated_at (solo si cambia algo)
    │                 │ trigger AFTER UPDATE/DELETE: auditoría (security definer)
    ├──────────< weight_entry_audit (N)      valores anteriores; vence a los 180 días
    ├────────── weight_legacy_imports (0..1)        importación única (transición; no cambia después)
    └────────── weight_legacy_client_writes (0..1)  última escritura de clientes antiguos (transición)
weight_monthly_summaries (vista, security_invoker) = agregado de las mediciones FECHADAS
complete_onboarding(...) (función, security invoker) = perfil + 1ª medición en una transacción
```

**`weight_entries`**
- Columnas:
  - `id`
  - `user_id → profiles` (cascade; por defecto `auth.uid()`)
  - `measured_on date` (puede ser null; ver abajo)
  - `weight_kg numeric(5,1)`, entre 20 y 400
  - `origin`: `manual` o `legacy_profile`
  - `version`
  - `created_at`, `updated_at`
- `UNIQUE (user_id, measured_on)`: una medición por día.
- Índice único parcial `(user_id) where measured_on is null`: como mucho un peso heredado sin fecha.
- `CHECK`:
  - Rango de peso.
  - Fecha ≤ hoy + 1 (por los husos horarios).
  - Origen válido.
  - Sin fecha solo si es heredado.
- Una medición fechada no vuelve a quedar sin fecha (trigger).
- **RLS:** el dueño puede hacer select, insert, update y delete. **Privilegios por columna:** la app solo escribe `measured_on` y `weight_kg`. `user_id`, `origin`, `version` y las marcas de tiempo los pone el servidor.

**`weight_entry_audit`**
- Columnas:
  - `entry_id` (sin FK: la medición puede no existir ya)
  - `user_id`
  - `action`: `correction` o `deletion`
  - `old_measured_on` (null si era el heredado), `old_weight_kg`, `old_version`
  - `new_*` (solo en correcciones)
  - `changed_at`
- La escribe solo el trigger. El dueño solo puede leerla.
- No se audita:
  - Guardar sin cambios, que tampoco sube la versión.
  - El borrado en cascada de la cuenta.

**`weight_legacy_client_writes`**
- Una fila por usuario: `last_weight_kg` (puede ser null), `write_count`, `first_written_at` y `last_written_at`.
- La actualiza el trigger de compatibilidad en cada cambio. Sin políticas: solo el servidor.
- Se elimina en la migración B.

**`weight_legacy_imports`**
- Una fila por usuario: `weight_kg`, `source` (`migration` o `legacy_client`) e `imported_at`.
- Sin políticas: solo el servidor la usa.
- Se elimina en la migración B.

**Fechas:** `measured_on` es el día que elige la persona. `created_at` y `updated_at` (registro y última corrección) los pone el servidor. Se guardan por separado.

## 2. Compatibilidad, importación única y retirada de la columna

| Escenario | Qué pasa |
|---|---|
| Al aplicar la migración A | `import_profile_weights()` recorre los perfiles con `weight_kg`. Por cada uno escribe primero el registro (`on conflict do nothing`) y, solo si es nuevo, crea la medición heredada **sin fecha** |
| Se repite la importación | 0 cambios: el registro ya existe |
| La persona eliminó su peso heredado y se repite la importación | No reaparece, porque el registro sigue existiendo |
| La app **vieja** hace su onboarding después de la migración | Su `UPDATE` de `profiles` sigue funcionando. El trigger `profiles_capture_legacy_weight` importa ese peso como heredado sin fecha (`source = 'legacy_client'`), una sola vez |
| La app vieja vuelve a escribir `weight_kg` (uno o varios cambios, incluso volviendo al valor original) | No se reimporta ni crea mediciones: la importación única queda intacta. Cada cambio sí actualiza `weight_legacy_client_writes` (último valor, cantidad y fecha) |
| La app vieja **lee** el perfil | Ve el peso congelado de la columna. No hay pérdida de datos: al actualizarse por EAS Update, ve el peso de `weight_entries` |
| La app **nueva** | No lee ni escribe `profiles.weight_kg` |
| Migración B (posterior) | Aborta si: (a) hay perfiles con peso sin registro de importación; (b) hay escrituras de clientes antiguos en los últimos 14 días, según `weight_legacy_client_writes`; (c) la última escritura antigua de alguien difiere del valor importado, así que ese peso no está en `weight_entries` y hay que revisarlo. Si todo pasa, elimina el trigger, las funciones, la columna y las dos tablas de transición |

## 3. Peso vigente y peso heredado

- **Peso vigente** = la medición **fechada** más reciente.
- Si no hay fechadas, se usa el heredado sin fecha. Se muestra «Peso del perfil · fecha sin confirmar» y alimenta el resumen de salud, como hoy.
- El heredado **no entra** en la gráfica, los resúmenes mensuales ni las variaciones mientras no tenga fecha.
- **Confirmar la fecha:** la persona elige el día (la app sugiere el del onboarding, pero no lo guarda sin confirmación). Es un `UPDATE` de `measured_on` que queda auditado como corrección con fecha anterior vacía. Desde ese momento cuenta en las tendencias.
- Si el día elegido ya tiene medición, se muestra el error de duplicado.
- Las políticas de salud no cambian: `HEALTH_AGE_POLICY`, `GOAL_POLICY` y las fórmulas siguen igual. `toHealthProfile(profile, currentWeightKg)` recibe el peso vigente.

## 4. Onboarding transaccional e idempotente

`complete_onboarding(perfil…, p_weight_kg, p_measured_on)`. Corre como **security invoker**, así que aplica la RLS de la persona, y todo ocurre en una sola transacción.

1. **Sin sesión:** error `no_session`. Si hay sesión, bloquea la fila del perfil (`for update`), lo que serializa a dos dispositivos.
2. **Onboarding ya completo:** devuelve `already_completed` y **no escribe nada**. Cubre la respuesta perdida y el caso de que otro dispositivo haya terminado primero. La app recarga el perfil y entra.
3. **Obligatorios:** se validan antes de escribir nada y, si falta alguno, se responde `missing_<campo>` (22023):
   - nombre nulo o vacío (solo espacios);
   - sexo;
   - fecha de nacimiento;
   - estatura;
   - actividad;
   - objetivo;
   - peso;
   - fecha de medición.

   Género y paleta son opcionales.
4. **Validación de fecha:** `p_measured_on` debe estar entre hoy − 2 y hoy + 1; si no, `invalid_measured_on`.
5. **Medición del día:** se inserta con `on conflict (user_id, measured_on) do nothing`.
   - Si ya existía con **el mismo** peso, se reutiliza.
   - Con **otro** peso: `weight_day_conflict` y no se guarda nada.
6. **Perfil:** se actualiza con `onboarded_at = now()`. Si algún `CHECK` falla (estatura, fecha de nacimiento…), se revierte también la medición: todo o nada.

**Cliente**
- `measured_on` se fija en el **primer** intento y se **reutiliza en cada reintento** de la misma pantalla, aunque ya sea otro día. Así, reintentar después de medianoche no crea un segundo día.
- Si pasaron más de 2 días (`invalid_measured_on`), la app pide confirmar el peso de hoy.
- Cada resultado tiene un mensaje claro:
  - `weight_day_conflict`: «Ya hay un peso registrado ese día; confirma cuál es correcto».
  - Errores de rango, como hoy.
- El formulario se conserva ante cualquier fallo.
- La app vieja sigue usando su `UPDATE` directo (§2).

## 5. Consultas e índices

| Consulta | SQL (la RLS agrega `user_id = auth.uid()`) | Índice |
|---|---|---|
| Peso vigente | `… where measured_on is not null order by measured_on desc limit 1` | `(user_id, measured_on)` recorrido hacia atrás |
| Peso heredado (respaldo) | `… where measured_on is null` | Parcial `(user_id) where measured_on is null` |
| Historial paginado | `… where measured_on < :cursor order by measured_on desc limit 30` | `(user_id, measured_on)`; cursor por fecha (keyset) |
| Gráfica (30 días, 90 días o 1 año) | `… where measured_on >= :desde order by measured_on` | `(user_id, measured_on)` |
| Resúmenes mensuales | `weight_monthly_summaries where month >= :desde` | Agrega sobre `(user_id, measured_on)` |
| **Correcciones de una medición** | `weight_entry_audit where entry_id = :id order by changed_at desc, id desc` | `(user_id, changed_at desc)`. Filtra dentro de las filas de la persona (pocos cientos en 180 días) |
| **Actividad reciente** (correcciones y eliminaciones) | `weight_entry_audit order by changed_at desc, id desc limit 50` | `(user_id, changed_at desc)` |
| Purga diaria | `delete … where changed_at < now() - 180 days` | Recorrido secuencial, aceptable con 4 usuarios. Si crece, se agrega índice en `changed_at` |

Se confirmará con `EXPLAIN` en local al implementar. No se agregan índices especulativos.

## 6. Comportamiento

| Caso | Resultado |
|---|---|
| Registrar una fecha anterior a la última | Va al historial y a la gráfica; el vigente **no cambia** y se avisa |
| Día ya registrado (insertar o mover la fecha) | Error de duplicado (23505) y el formulario se conserva |
| Corregir peso o fecha | `update … where id = ? and version = ?`. Misma fila, versión + 1 y auditoría. La gráfica solo muestra el valor nuevo; nunca aparece como un cambio físico |
| **Eliminar** | Se pide confirmación. `delete … where id = ? and version = ?`, con auditoría |
| Corregir o eliminar con una versión vieja | 0 filas: «Esta medición cambió en otro dispositivo». Se recarga y no se sobrescribe ni se borra |
| Eliminar la última | El vigente pasa a la anterior fechada. Si no queda ninguna, al heredado; si tampoco hay, estado vacío |
| Quedarse sin mediciones | El resumen de salud muestra un estado vacío: «Registra tu peso…». No se calcula con datos faltantes |
| Peso heredado sin confirmar | Cuenta como vigente solo si no hay fechadas. Fuera de las tendencias |

**Retención, en el texto de la app y en `docs/`:**
- «Tus mediciones se conservan mientras no las elimines o elimines tu cuenta.»
- «El historial de correcciones y eliminaciones se borra automáticamente a los 180 días.»
- Al eliminar la cuenta se borra todo de inmediato.

## 7. Estado en la app y sesiones

- **`WeightProvider`**, dentro de `(app)` y dependiente del `userId`:
  - Estados: `loading`, `ready` con `{ latest, legacy, recent, monthly }`, `empty` y `error`.
  - Una sola instancia para Inicio, Salud y las pantallas de peso.
- **Mutaciones** (`addEntry`, `updateEntry(id, version, …)`, `deleteEntry(id, version)`):
  - Resultados: `ok`, `duplicate_day`, `conflict`, `invalid`, `stale_session` o `error`.
  - Al confirmarse, se recargan `latest`, `legacy`, la primera página y los meses en **una** lectura versionada.
  - Si fallan, el estado anterior se conserva.
- **Respuestas de otra sesión:**
  - Número de petición más generación de sesión, como en `session-provider`. Se descartan las respuestas de otro usuario o de una sesión anterior de la misma cuenta.
  - Las mutaciones reciben `expectedUserId`.
- **Onboarding:** usa `complete_onboarding` mediante `rpc`. Con `completed` o `already_completed`, se llama a `retryProfile()` para recargar el perfil confirmado.

## 8. Pantallas (sin implementar todavía)

Reutilizan `Screen`, `Card`, `TextField`, `OptionGroup`, `Button`, `ListItem`, `AppText` y los tokens del tema.

1. **Salud:**
   - Resumen de salud.
   - Tarjeta «Peso» con el vigente, su fecha o «fecha sin confirmar», y una mini-gráfica de 30 días.
   - Botones «Registrar peso» y «Ver historial».
   - Enlace a «Datos de salud».
2. **Inicio:** el mismo resumen, con el peso vigente y el estado vacío.
3. **`/peso`:**
   - Rango de 30 días, 90 días o 1 año.
   - `WeightChart` con `react-native-svg`: solo mediciones fechadas vigentes, sin interpolar días sin datos.
   - Resúmenes mensuales:
     - **Sin datos:** meses del rango sin filas, que completa la app.
     - **Insuficiente:** 1 medición; se muestra el valor, sin promedio ni variación.
     - **Con datos:** 2 mediciones o más; cantidad, promedio y variación entre la primera y la última.
     - Sin comparaciones entre años ni conclusiones estacionales.
   - Lista paginada con las etiquetas «Corregida» y «Fecha sin confirmar».
4. **`/peso/registrar`** y **`/peso/registrar?id=`:**
   - Peso y fecha con `DateField`, que generaliza `BirthDateField`.
   - Al editar, «Historial de correcciones» (consulta de §5), con el aviso de que vence a los 180 días.
   - Botón de eliminar con confirmación.
5. **`/datos-salud`:** estatura, actividad y objetivo, con las validaciones del onboarding extraídas a funciones compartidas, y `saveProfile`.

**Accesibilidad**
- La gráfica tiene una etiqueta de resumen en texto y la lista como alternativa.
- Objetivos táctiles ≥ 48 dp y cantidades con `tabular`.
- La variación se expresa con signo y palabra, no solo con color.

## 9. Archivos afectados

**Entrega inicial — nuevos**
- `supabase/migrations/<ts>_weight_entries.sql`: sale de `migracion-a-weight-entries.sql`.
- `supabase/tests/database/weight_entries.test.sql`
- `src/lib/weight.ts` y `src/lib/weight.test.ts`:
  - Validación.
  - Selección del vigente (fechada → heredada → ninguna).
  - Meses `no_data`, `insufficient` y `ok`.
  - Puntos de la gráfica.
  - Mensajes.
- `src/lib/weight-api.ts` y `src/lib/weight-api.test.ts`: lecturas; mutaciones con versión; correcciones y actividad; `completeOnboarding` (rpc). Traduce 23505, 0 filas y los errores de la función.
- `src/providers/weight-provider.tsx`
- `src/hooks/use-weight.ts`
- `src/components/weight-card.tsx`, `weight-chart.tsx`, `monthly-weight-summary.tsx`, `weight-corrections.tsx` y `date-field.tsx` (+ `.web.tsx`).
- `src/app/(app)/peso/index.tsx`, `src/app/(app)/peso/registrar.tsx` y `src/app/(app)/datos-salud.tsx`.
- `src/__tests__/weight-provider.test.tsx` y `src/__tests__/weight-screens.test.tsx`.

**Entrega inicial — modificados**
- `src/lib/profile.ts`: `toHealthProfile(profile, currentWeightKg)`.
- `src/lib/onboarding.ts`, `src/app/onboarding.tsx` y `src/lib/onboarding.test.ts`: usan `complete_onboarding` y conservan `measured_on` entre reintentos.
- `src/hooks/use-health-summary.ts` y `src/components/health-summary-card.tsx`: estado vacío y «fecha sin confirmar».
- `src/app/(app)/(tabs)/index.tsx`, `src/app/(app)/(tabs)/salud.tsx` y `src/app/(app)/_layout.tsx`.
- `src/components/birth-date-field*.tsx`: pasa a usar `DateField`.
- `src/lib/database.types.ts`: se regenera contra la base **local** (`--local`).
- `CLAUDE.md` y `docs/`: fuente del peso, compatibilidad y retención.

**Entrega posterior:** `supabase/migrations/<ts>_drop_profiles_weight_kg.sql`, que sale de `posterior/`, y se vuelven a regenerar los tipos.

**Sin cambios:** autenticación y políticas de salud. No se agregan dependencias.

## 10. Pruebas

**pgTAP** (`weight_entries.test.sql`, 90 aserciones, solo local; no dependen de los datos locales existentes)

1. **Importación:**
   - Copia el peso sin fecha y lo registra una vez.
   - Repetirla no duplica.
   - Una medición eliminada no reaparece.
2. **Integridad:**
   - Rangos y fecha futura.
   - Una medición manual exige fecha.
   - Un solo peso sin fecha por usuario.
   - Origen válido.
3. **Cliente antiguo:**
   - Su onboarding sigue funcionando.
   - Su peso se captura como heredado sin fecha.
   - Cambios sucesivos y vuelta al valor original: no se reimportan ni crean mediciones.
   - La importación única queda intacta.
   - El registro aparte guarda el último valor y 3 cambios.
   - El cliente no puede leer ese registro.
4. **Como dueño:**
   - El heredado queda fuera de los resúmenes y sirve de respaldo para el vigente.
   - Registra sin `user_id` y en fechas anteriores.
   - Duplicados al insertar y al mover la fecha.
   - No puede fijar `user_id`, `origin` ni `version`.
   - Vigente e historial con cursor.
   - Confirmar la fecha del heredado: entra en el resumen y queda auditado; no puede volver a quedar sin fecha.
   - Corrección con versión (sube); con versión vieja, conflicto.
   - La auditoría guarda los valores anteriores; guardar sin cambios no audita ni sube la versión.
   - El resumen usa solo valores vigentes.
   - Eliminación con versión vieja (conflicto) y con la vigente; el vigente pasa a la anterior y el resumen la excluye.
   - Consulta de correcciones de una medición.
   - Auditoría de solo lectura; sin acceso a la purga ni a la importación.
5. **Onboarding:**
   - Cada obligatorio nulo, y el nombre vacío, se rechazan (9 casos). Después no queda medición, onboarding ni perfil parcial.
   - Con datos inválidos no queda nada (todo o nada).
   - Fecha demasiado antigua.
   - Completo en una transacción.
   - Reintento: `already_completed` y sin duplicados.
   - Reintento después de medianoche con la fecha original.
   - Conflicto con otro peso el mismo día: no se marca el onboarding.
   - Con el mismo peso, reutiliza la medición.
6. **Aislamiento:**
   - Solo ve lo suyo: mediciones, auditoría y resúmenes.
   - Un mes con 1 medición no tiene variación.
   - No corrige ni elimina mediciones ajenas.
7. **anon:** sin acceso a las tablas ni a la función.
8. **Retención:** la purga borra la auditoría de más de 180 días y conserva la reciente. Las mediciones vigentes no vencen.
9. **Borrado de cuenta:** elimina mediciones, auditoría y registro de importación, sin crear auditoría nueva. Lo de otros usuarios no cambia.

**Jest**
- **`weight.ts`:**
  - Selección del vigente (fechada → heredada → vacío).
  - El heredado nunca entra en puntos ni meses.
  - Meses sin datos e insuficientes, sin inventar valores.
  - Validación y coma decimal.
- **`weight-api.ts`:** 23505 → `duplicate_day`; 0 filas en update o delete → `conflict`; `weight_day_conflict` e `invalid_measured_on` se traducen; un error nunca es «sin datos».
- **`WeightProvider`:**
  - Inicio y Salud muestran el mismo peso tras guardar.
  - Fecha anterior: el vigente no cambia.
  - Eliminar la última, y luego eliminar todo.
  - Si una mutación falla, se conserva el estado.
  - Se descarta la respuesta de otra sesión; `stale_session`.
  - Un conflicto de versión provoca la recarga.
- **Onboarding:**
  - Reutiliza `measured_on` en los reintentos.
  - `already_completed` recarga y entra.
  - Mensajes de conflicto, de fecha y de `missing_<campo>` (como respaldo de la validación en la app).
  - El formulario se conserva ante un fallo.
- **Pantallas:** registro, edición, eliminación con conflicto, historial de correcciones con el aviso de 180 días, confirmación de la fecha del heredado y estados vacíos.
- **Regresión:** `health.test.ts` sin cambios.

## 11. Preguntas para la revisión

1. **Retención:** 180 días para la auditoría, o agregar ya «borrar mi historial de correcciones».
2. **Ventana de onboarding** de hoy − 2 a hoy + 1. ¿Es suficiente?
3. **Comprobación (b) de la migración B:** 14 días sin capturas de clientes antiguos, además de confirmar manualmente el EAS Update.

## 12. Fuera de alcance

- Pantallas: se implementan después de la revisión.
- Ejecutar SQL.
- Migraciones, commits, push y despliegues.
- Autenticación y pasos remotos R1–R6.
- Meta de peso, recordatorios y otras unidades.
