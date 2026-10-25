# Propuesta: cierre de Salud → Peso (meta opcional, progreso e historial completo) — rev. 2

> **Estado:** borrador final para revisión. No hay SQL ejecutado, pantallas, commits ni cambios remotos.
>
> **Rama local:** `feat/salud-peso-meta`, creada desde `develop` (`c9c3ff8`).
>
> **Borradores**, fuera de `supabase/`:
> - `migracion-borrador.sql`
> - `weight_goals.test.sql` (pgTAP, 30 aserciones)

## Decisiones confirmadas

- 20 años como política de producto para fijar una meta. Es la misma que `HEALTH_AGE_POLICY.bmiCategories`.
- Inicio no cambia.
- El historial de metas anteriores queda fuera de alcance.
- No se calculan fechas de llegada, ritmos, déficits nuevos ni recomendaciones clínicas. `profiles.goal`, `GOAL_POLICY` y la meta calórica no cambian.

## Cambios respecto a la rev. 1

| Revisión | Ajuste |
|---|---|
| Concurrencia en crear, editar, reiniciar y eliminar | Columna `version`. `set_weight_goal(meta, versión_esperada, reiniciar)` **crea** solo si no se envía versión y no existe una meta (`goal_conflict` si ya existe). **Edita o reinicia** solo con la versión leída (`goal_conflict` o `goal_missing`). Eliminar exige la versión (0 filas significa conflicto). Una operación obsoleta **no recrea** una meta eliminada |
| Medición de partida corregida o eliminada; solo quedan mediciones anteriores | Estados explícitos (§4). El avance solo se calcula con una medición **posterior** a la fecha de partida, nunca con la propia medición de partida corregida |
| Gráfica mensual | Los promedios mensuales se dibujan con círculos vacíos y una línea **interrumpida** en los meses sin datos; las mediciones, con puntos rellenos. «Todo» usa **siempre** promedios mensuales |

## 1. Qué se reutiliza

| Pieza | Uso |
|---|---|
| `weight_entries` (con `version`) | Única fuente del peso. El punto de partida se toma de aquí en el servidor |
| `weight_monthly_summaries` | Rango «Todo» y resumen por año |
| `loadHistoryPage` («Ver más») | La lista ya recorre todo el historial |
| `WeightProvider` y `revision` | Carga la meta en la misma lectura y la recarga tras cada cambio. Descarta respuestas de otra sesión |
| `health.ts` (`bmi`, `bmiCategory`, `ageFromBirthDate`, `HEALTH_AGE_POLICY`) | Elegibilidad e IMC descriptivo de la meta |
| `WeightChart`, `MonthlyWeightSummary`, `InfoHint`, `describeChange`, `formatKg`, `weightActionMessage` | Interfaz y textos |

No se agregan dependencias.

## 2. Referencias revisadas

| Referencia | Patrón | Decisión |
|---|---|---|
| Cronometer: «Weight Goal Overview» | Meta y avance en una tarjeta | **Adaptar** en la tarjeta Peso de Salud |
| Cronometer: línea de meta en la gráfica | Referencia visual | **Adaptar**: solo si la meta cae dentro de la escala; si no, una etiqueta |
| Cronometer: ritmo, fecha estimada y recálculo de calorías | Proyección | **Rechazar** |
| Withings Health Mate: meta con fecha y meta semanal | Plan con plazos | **Rechazar** |
| Withings y Cronometer: gráficas largas | Historial completo | **Adaptar**: «Todo» con promedios mensuales |
| Cronometer: «Weight Change» y «Zoom-to-fit» | Cambio en un rango y ajuste de escala | **Ya cubierto o posponer** |

**Fuentes:**
- [Cronometer, Weight Goal](https://cronometer.com/blog/weight-goal)
- [Cronometer, Dashboard](https://support.cronometer.com/hc/en-us/articles/10570212821268-Dashboard)
- [Foro de Cronometer: línea de meta](https://forums.cronometer.com/discussion/comment/3240/)
- [Withings Health Mate](https://withings.com/health-mate)
- [Withings: experiencia de seguimiento](https://www.withings.com/us/en/blog/the-360-withings-self-tracking-experience-by-draper-harlow)

## 3. Modelo (`migracion-borrador.sql`)

**`weight_goals`**: una fila opcional por persona.
- **Columnas:**
  - `target_weight_kg`, de 20 a 400;
  - la instantánea del punto de partida: `start_weight_kg`, `start_measured_on`, `start_entry_id` (`on delete set null`) y `start_entry_version`;
  - `version`, `set_at` y `updated_at`.
- **RLS:** el dueño puede leer y eliminar. La app **no** puede insertar ni actualizar.

**`set_weight_goal(p_target_weight_kg, p_expected_version default null, p_reset_start default false)`**: security definer y solo escribe la fila de `auth.uid()`.

| Llamada | Si no hay meta | Si hay meta con la versión leída | Si hay meta con otra versión |
|---|---|---|---|
| Crear (`versión = null`) | Crea, con el punto de partida del servidor | `goal_conflict` | `goal_conflict` |
| Editar (`versión = n`) | `goal_missing`, **no recrea** | Cambia la meta; la versión sube (sin cambios reales, no sube) | `goal_conflict` |
| Reiniciar (`versión = n`, `reset = true`) | `goal_missing` | Nuevo punto de partida (medición fechada vigente); la versión sube | `goal_conflict` |

**Otras reglas:**
- **Validaciones previas** a cualquier escritura: sin sesión, `missing_target`, `age_not_eligible` (menos de 20 años o sin fecha de nacimiento) y `no_dated_measurement`.
- **Eliminar:** `delete … where user_id = auth.uid() and version = <leída>`. Con 0 filas, la app recarga y muestra si la meta cambió o ya no existe.
- **Bloqueo:** la fila se bloquea (`for update`). Dos creaciones simultáneas acaban en una meta y un `goal_conflict`.
- **Retención:** la fila dura hasta que la persona la elimina o borra su cuenta (cascada). No se guarda historial de metas.

## 4. Estados y cálculos (`src/lib/weight-goal.ts`, funciones puras)

**Notación:**
- **S**: instantánea de partida (`start_weight_kg`, `start_measured_on`).
- **T**: meta.
- **C**: medición fechada vigente más reciente.

Los valores se redondean a 0.1 kg.

**Estado de la medición de partida.** Se muestra como aviso, nunca como avance. Se compara `start_entry_id` y `start_entry_version` con la medición actual:
- `intact`: existe con la misma versión.
- `corrected`: existe con una versión mayor. Aviso: «La medición de partida se corrigió (antes 72.4 kg, ahora 71.8 kg). Tu avance se mide desde 72.4 kg; puedes reiniciar el punto de partida».
- `deleted`: `start_entry_id` es null o la medición ya no existe. Aviso: «La medición de partida se eliminó. Tu avance se mide desde 72.4 kg (24 oct); puedes reiniciar el punto de partida».

**Estado del progreso.** Se evalúa en este orden y se toma el primero que aplica:

| # | Estado | Condición | Qué se muestra |
|---|---|---|---|
| 1 | `not_eligible` | Menos de 20 años o sin fecha de nacimiento | Explicación. La meta guardada se oculta y se ofrece eliminarla; no hay cálculos |
| 2 | `no_goal` | No hay meta | «Fijar meta», si hay una medición fechada; si no, se pide registrarla o confirmar su fecha |
| 3 | `no_measurements` | Meta guardada, pero ninguna medición fechada (solo el peso heredado o nada) | Meta y partida; «registra una medición o confirma su fecha». Sin avance |
| 4 | `only_earlier_measurements` | `C.measured_on < start_measured_on` (se eliminaron la de partida y las posteriores) | «Tus mediciones desde que fijaste la meta ya no existen. Registra una nueva o reinicia el punto de partida». **Sin avance** |
| 5 | `no_new_measurement` | `C.measured_on = start_measured_on`: la propia medición de partida, aunque esté corregida, o una nueva del mismo día tras eliminarla | Meta y partida; «registra una medición posterior para ver tu avance». **Sin avance** (una corrección de la partida nunca cuenta como cambio físico) |
| 6 | `reached` | `C.measured_on > start_measured_on` y (pérdida: C ≤ T; ganancia: C ≥ T; mantener: C = T) | «Llegaste a tu meta», con la fecha de C |
| 7 | `away` | Fecha posterior, pero C se alejó de T respecto a S | «Estás X kg por encima/debajo de tu punto de partida». Avance 0 |
| 8 | `in_progress` | Fecha posterior y C entre S y T | Cambio desde la partida, lo que falta y el avance |

**Fórmulas** (solo en los estados 6 a 8):
- dirección: `lose` si T < S, `gain` si T > S, `maintain` si T = S;
- cambio desde la partida: `C − S`, descrito con `describeChange`;
- lo que falta: `|T − C|`.

**Avance:** `(S − C) / (S − T)`, limitado entre 0 y 1, solo si la dirección no es `maintain`.
- Se muestra como «avanzaste 1.2 de 4.0 kg» y una barra con `accessibilityRole="progressbar"`.
- Para `maintain`: «diferencia con tu meta: ±X kg», sin porcentaje.

**IMC de la meta, solo descriptivo:** si la persona es elegible y tiene estatura, «Con tu estatura, 68 kg corresponde a un IMC de 23.5 (peso saludable, OMS)».

**Coherencia con «Datos de salud»:** si la dirección no coincide con `profiles.goal`, solo se informa, con un enlace. No se cambia nada.

## 5. Gráfica e historial completo

**Rangos:**
- **30 días, 90 días y 1 año:** sin cambios. Mediciones diarias como **puntos rellenos**, unidas solo entre mediciones; el eje x es el calendario real.
- **«Todo»:** **siempre promedios mensuales**, aunque haya menos de un año de datos o una sola medición. Así el comportamiento no depende del volumen. Sale de `weight_monthly_summaries`, todas las filas.
  - Cada mes con datos es un **círculo vacío** (solo contorno) en el día 15 del mes.
  - La línea une solo **meses consecutivos con datos**: un mes sin datos **interrumpe** la línea, en segmentos separados.
  - Título «Promedio mensual» y leyenda visible: «○ promedio mensual · ● medición». La leyenda está también en el texto accesible.
  - La forma (vacío o relleno) distingue el tipo de punto, no solo el color.
  - Un mes con una sola medición se dibuja igual que los demás (es su promedio). El resumen por mes ya lo marca como «insuficiente».
- **Línea de meta:** horizontal y punteada, solo si T está dentro del rango de la escala. Si no, la etiqueta «Meta: 68 kg (fuera de la escala de este periodo)». Se menciona también en el resumen accesible.
- **Resumen por mes en «Todo»:** desde el primer mes con datos hasta el actual, agrupado por año (el más reciente abierto), con los estados «sin datos», «insuficiente» y «con datos» actuales.
- **Lista de mediciones:** sin cambios; «Ver más» llega hasta la primera.

## 6. Consultas

| Consulta | Detalle | Índice o volumen |
|---|---|---|
| Meta | `weight_goals where user_id = ?`, en `loadWeightOverview` | Clave primaria |
| Estado de la medición de partida | `weight_entries where id = start_entry_id` (`maybeSingle`), en la misma carga, solo si hay meta | Clave primaria |
| Peso vigente | Ya existe (`recent[0]`) | `(user_id, measured_on)` |
| «Todo» | `weight_monthly_summaries where user_id = ? order by month` (sin límite inferior), solo al elegir «Todo» | ~12 filas por año |
| Crear, editar o reiniciar | `rpc('set_weight_goal', …)` | Una fila |
| Eliminar | `delete … where user_id = ? and version = ?` | Clave primaria |

## 7. Pantallas

1. **Tarjeta Peso (Salud):** una línea con el estado de §4 («Meta 68 kg · te faltan 2.4 kg», «registra una medición posterior»…) y el botón «Fijar meta» o «Ver meta».
2. **`/peso/meta`:**
   - campo «Peso meta (kg)»;
   - punto de partida con su fecha y el aviso `corrected`/`deleted` cuando aplique;
   - IMC descriptivo y aviso de coherencia con «Datos de salud»;
   - botones «Guardar», «Reiniciar punto de partida» (con confirmación que muestra el nuevo punto) y «Eliminar meta» (con confirmación);
   - mensajes:
     - `goal_conflict`: «Tu meta cambió en otro dispositivo; mostramos la actual»;
     - `goal_missing`: «Tu meta se eliminó en otro dispositivo»; no se recrea, se ofrece «Fijar meta»;
     - `age_not_eligible`, `no_dated_measurement` y errores de sesión.
3. **`/peso`:**
   - tarjeta de progreso con los estados de §4;
   - rango «Todo» con leyenda y línea de meta;
   - resumen por año.
4. **Inicio:** sin cambios.

## 8. Archivos afectados

- **Nuevos:**
  - `supabase/migrations/<ts>_weight_goals.sql`;
  - `supabase/tests/database/weight_goals.test.sql`;
  - `src/lib/weight-goal.ts` y `weight-goal.test.ts`;
  - `src/app/(app)/peso/meta.tsx`;
  - `src/components/weight-goal-progress.tsx`;
  - `src/__tests__/weight-goal-screens.test.tsx`.
- **Modificados:**
  - `health.ts`: solo se agrega `HEALTH_AGE_POLICY.weightGoal`;
  - `weight-api.ts`: `goal` y medición de partida en el overview, `setWeightGoal`, `deleteWeightGoal` y `loadAllMonthlySummaries`;
  - `weight.ts`: rango `all` y segmentos mensuales;
  - `weight-provider.tsx`;
  - `weight-card.tsx`;
  - `weight-chart.tsx`: puntos vacíos y rellenos, segmentos, leyenda y línea de meta;
  - `monthly-weight-summary.tsx`: agrupación por año;
  - `peso/index.tsx`;
  - `(app)/_layout.tsx`;
  - `health-help.ts`;
  - tipos locales;
  - `docs/despliegue`: comprobaciones de permisos de `weight_goals` y `set_weight_goal`.

## 9. Casos de prueba

**pgTAP** (`weight_goals.test.sql`, 30 aserciones, solo local):
- **Elegibilidad:** menor de 20 años; sin medición fechada.
- **Escritura directa:** la app no inserta ni edita.
- **Crear:** meta fuera de rango; punto de partida tomado del servidor; crear cuando ya existe → `goal_conflict`.
- **Editar y reiniciar:**
  - editar conserva el punto de partida y sube la versión;
  - con versión vieja → `goal_conflict`;
  - sin cambios no sube la versión;
  - reiniciar toma la nueva medición.
- **Instantánea:** corregir la medición de partida no la cambia (versión distinta); eliminarla deja la referencia en null; quedan solo mediciones anteriores.
- **Eliminar:**
  - con versión vieja → 0 filas; con la versión leída → se elimina;
  - editar o reiniciar después → `goal_missing` y **no se recrea**;
  - crear de nuevo de forma explícita sí funciona.
- **Aislamiento:** otra persona no lee ni elimina la meta y crea la suya.
- **anon:** no lee ni ejecuta.
- **Integridad:** `version > 0`; la cascada al borrar la cuenta solo afecta a esa cuenta.

**Jest** (`weight-goal.test.ts`):
- Cada estado de §4 en su orden de precedencia:
  - partida corregida + `C` = partida → `no_new_measurement` y aviso `corrected`, **sin avance**;
  - partida eliminada + medición posterior → `in_progress` con S de la instantánea y aviso `deleted`;
  - solo mediciones anteriores → `only_earlier_measurements`, sin avance;
  - nueva medición el mismo día tras eliminar la de partida → `no_new_measurement`;
  - solo el peso heredado → `no_measurements`;
  - edad 19 y 20 en el límite.
- Fórmulas: avance limitado entre 0 y 1 (nunca negativo ni mayor a 100 %); `maintain` sin porcentaje; `reached` y `away`; redondeo a 0.1 kg.
- Gráfica:
  - «Todo» con 2 meses de datos sigue siendo mensual;
  - segmentos se cortan en un mes sin datos (p. ej. ene, feb, —, abr → 2 segmentos);
  - forma vacía para promedios y rellena para mediciones;
  - la línea de meta o su etiqueta según la escala;
  - el resumen accesible menciona promedios y la meta.

**Jest** (pantallas, `weight-goal-screens.test.tsx`):
- **Crear:** el `rpc` recibe la versión null.
- **Editar:** el `rpc` recibe la versión leída.
- **Conflicto:** se recarga y se explica.
- **`goal_missing`:** no reintenta crear; ofrece «Fijar meta».
- **Eliminar:** pide confirmación, envía la versión y 0 filas significa conflicto.
- **Reiniciar:** pide confirmación mostrando el nuevo punto.
- **Menor de 20 años:** ve la explicación y no ve el formulario.
- **Tarjeta Peso:** muestra cada estado; Inicio no cambia (prueba de regresión).
- **Ayuda:** la del avance existe y tiene fuente.

**Regresión:** las pruebas existentes de peso, salud y onboarding siguen en verde, y `check:app` también.

## 10. Criterios de aceptación

1. La meta es opcional; sin meta, Salud y el historial se comportan como hoy e Inicio no cambia.
2. Solo con 20 años o más, verificado en la app y en el servidor.
3. El punto de partida siempre lo fija el servidor; se reinicia solo de forma explícita.
4. Ninguna operación obsoleta crea, sobrescribe, edita, reinicia ni recrea una meta. Los conflictos se explican y recargan.
5. El avance físico solo se muestra con una medición fechada **posterior** al punto de partida. Corregir o eliminar la medición de partida, o quedarse solo con mediciones anteriores, nunca produce avance.
6. No hay fechas estimadas, ritmos, déficits nuevos ni recomendaciones. `profiles.goal` y la meta calórica no cambian.
7. «Todo» usa siempre promedios mensuales: círculos vacíos, líneas interrumpidas en meses sin datos y leyenda visible. Las mediciones se dibujan con puntos rellenos.
8. RLS y permisos: la app solo lee y elimina su meta (con versión) y ejecuta `set_weight_goal`; `anon`, nada. Las comprobaciones de despliegue lo verifican.
9. pgTAP (30), Jest y `check:app` en verde en local antes del PR.

## 11. Procedimiento de validación local (cuando se apruebe implementar)

> Todo es en el Supabase **local** de TYRA, verificando la API 55321, la base 55322 y el contenedor `supabase_db_TYRA`. Sin `reset`, `--linked`, `db push` ni destinos remotos. Cada paso que escribe en la base local requiere tu autorización.

1. **Entorno:**
   ```bash
   supabase start
   ```
   Después `supabase status -o json`, mostrando solo las URL, y `docker ps | grep supabase_db_TYRA`.
2. **Respaldo local** en `~/tyra-backups/`:
   ```bash
   supabase db dump --local -f ~/tyra-backups/$(date +%Y%m%d-%H%M)-schema.sql
   ```
   ```bash
   supabase db dump --local --data-only -s public,auth -f ~/tyra-backups/$(date +%Y%m%d-%H%M)-data.sql
   ```
   Verificar que los archivos no estén vacíos y anotar los conteos de `auth.users`, `profiles`, `weight_entries` y `weight_entry_audit`.
3. **Migración:**
   ```bash
   supabase migration new weight_goals
   ```
   Copiar el borrador sin el encabezado. `supabase migration list --local` debe mostrar solo esa pendiente.
4. **Aplicar:**
   ```bash
   supabase migration up --local
   ```
   Conserva los datos. Los conteos del paso 2 deben seguir iguales.
5. **pgTAP:** copiar `weight_goals.test.sql` a `supabase/tests/database/` y correr `npm run test:db`. Deben pasar `profiles_rls` 12, `weight_entries` 93 y `weight_goals` 30.
6. **Permisos:**
   ```bash
   bash docs/despliegue/salud-fase1/run-checks.sh docs/despliegue/salud-fase1/postchecks --local
   ```
   Con los archivos nuevos de `weight_goals` y `set_weight_goal`: todas las filas con `ok = true`.
7. **Tipos y app:**
   ```bash
   supabase gen types typescript --local --schema public > src/lib/database.types.ts
   ```
   Formatearlos como en la fase 1 y correr `npm run check:app`.
8. **QA manual** con `npm run start:qa -- --web --port 8082` y una cuenta local:
   - crear la meta;
   - editarla;
   - conflicto con dos pestañas;
   - eliminar en una pestaña y editar en la otra: `goal_missing`, sin recrear;
   - corregir la medición de partida: sin avance;
   - eliminar la de partida y registrar una posterior: hay avance;
   - dejar solo mediciones anteriores;
   - «Todo» con un mes sin datos: la línea se corta;
   - leyenda visible;
   - cuenta de 19 años: no elegible.

   Las cuentas creadas se borran al terminar, con autorización.
9. **Si algo falla:** se corrige hacia adelante con una migración nueva probada en local. No se usa nada destructivo sin aprobación.

## 12. Fuera de alcance

- Historial de metas anteriores.
- Cambios en Inicio.
- Fechas estimadas, ritmos y recomendaciones.
- Exportar el historial.
- Recordatorios.
- La migración B de la fase 1.
- Despliegue remoto y EAS.
