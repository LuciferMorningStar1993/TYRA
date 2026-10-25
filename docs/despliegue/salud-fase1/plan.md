# Plan de despliegue: Salud fase 1 (para revisión final; **no ejecutado**)

> **Nada de este plan se ha ejecutado en remoto.** Cada paso marcado con 🔒 requiere tu aprobación explícita en el chat.
>
> Lo único que se consultó en remoto, en modo de solo lectura, fue `supabase migration list --linked` y `supabase db push --linked --dry-run`.
>
> Proyecto: `TYRA` (ref `hzvyhfnlidprpnswfurw`, plan Free). No se crean proyectos ni servicios de pago.

## 0. Estado consultado (2026-10-25)

| Migración | Local | Remoto | Contenido |
|---|---|---|---|
| `20261024073440_create_profiles` | ✔ | ✔ | — |
| `20261024080547_profiles_auth_and_theme` | ✔ | ✔ | — |
| `20261025031703_phone_alias_after_verification` | ✔ | **pendiente** | Solo reemplaza la función `handle_new_user`: el alta deja de copiar el teléfono de los metadatos. No toca datos ni configuración |
| `20261025052742_weight_entries` | ✔ | **pendiente** | Migración A de Salud |

`supabase db push --linked --dry-run` aplicaría **las dos**. `db push` no permite omitir una migración intermedia.

### Decisión D1 🔒 (antes de cualquier paso remoto)

**Opción 1 (propuesta):** aprobar explícitamente las dos migraciones y aplicarlas **en orden**: primero `20261025031703` y después `20261025052742`. Un solo `supabase db push --linked` las aplica en ese orden.
- La de 031703 no es configuración de Auth: no cambia `enable_signup`, confirmaciones, redirecciones, plantillas ni SMTP.
- Solo endurece el alta de usuarios: el teléfono deja de venir de los metadatos y pasa a ser un alias que el dueño agrega desde Perfil.
- Es compatible con la app actual y con la nueva.
- Si hiciera falta revertirla, ver la sección 6 (corrección hacia adelante primero).

**Opción 2 (solo Salud):**
1. Ejecutar únicamente el archivo de Salud:
   ```bash
   psql "<cadena de conexión del proyecto>" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261025052742_weight_entries.sql
   ```
2. Registrarlo como aplicado:
   ```bash
   supabase migration repair --linked --status applied 20261025052742
   ```

La migración 031703 quedaría pendiente con una fecha **anterior** a la última aplicada, y el próximo `db push` exigiría `--include-all`. No la recomiendo: rompe el orden del historial, requiere `psql` con la cadena de conexión del proyecto (que incluye la contraseña de la base) y no está probada en local con ese procedimiento.

En ningún caso se usa `--include-all` sin aprobación. También quedan **excluidos**:
- La migración B (`docs/propuestas/salud-peso/posterior/`).
- `supabase config push`.
- R1 (SMTP), R2 (configuración de Auth), R3 (`phone-login`), R4 (cuentas) y R5 (Google).
- Invitaciones reales.

## 1. Respaldo 🔒 (antes de aplicar; lectura del remoto, archivos fuera del repo)

El plan Free no incluye recuperación a un punto en el tiempo (PITR). Por eso se hace un respaldo lógico propio:

```bash
mkdir -p ~/tyra-backups
```

```bash
supabase db dump --linked -f ~/tyra-backups/remoto-$(date +%Y%m%d-%H%M)-schema.sql
```

```bash
supabase db dump --linked --data-only -s public -f ~/tyra-backups/remoto-$(date +%Y%m%d-%H%M)-public-data.sql
```

- **Qué se verifica antes de continuar:**
  - que los archivos no estén vacíos;
  - que el esquema contenga `public.profiles` y `handle_new_user`;
  - que el número de filas de `profiles` en el respaldo coincida con `perfiles` en las comprobaciones previas.
- **El esquema `auth` no se respalda a propósito:** contiene hashes de contraseñas y la migración A no lo modifica.
- Los respaldos **no se suben a git** ni se comparten.

## 2. Comprobaciones previas (solo lectura)

```bash
bash docs/despliegue/salud-fase1/run-checks.sh docs/despliegue/salud-fase1/prechecks --linked
```

Hay que guardar la salida. **Se detiene el despliegue** si:
- el historial no termina en `20261024080547`;
- algún objeto `weight_*` o `complete_onboarding` ya existe;
- falta `set_updated_at()`;
- `pg_cron` no aparece como disponible;
- hay pesos fuera del rango 20–400 (la importación fallaría).

## 3. Aplicar el esquema compatible 🔒

1. Repetir `supabase db push --linked --dry-run` y confirmar que la lista sea exactamente la aprobada en D1.
2. Aplicar:
   ```bash
   supabase db push --linked
   ```
   O, si se eligió la opción 2, sus dos comandos.

La migración A es **compatible con la app que ya está instalada**:
- no borra ni renombra columnas;
- el onboarding viejo sigue escribiendo `profiles.weight_kg`, y un trigger lo captura una sola vez como peso heredado.

Por eso el esquema va **antes** que el cliente.

## 4. Comprobaciones posteriores (solo lectura)

```bash
bash docs/despliegue/salud-fase1/run-checks.sh docs/despliegue/salud-fase1/postchecks --linked
```

| Comprobación | Resultado esperado |
|---|---|
| Conteos (usuarios, perfiles, perfiles con peso, perfiles con onboarding) | Iguales a los del paso 2 |
| `sin_importar` | 0 |
| `heredados_sin_fecha` | Igual a `perfiles_con_peso` |
| `escrituras_antiguas` | 0 |
| `auditoria` | 0 |
| RLS | `true` en las 4 tablas `weight_*` |
| Políticas | 4 en `weight_entries` y 1 en `weight_entry_audit` |
| Permisos de tabla (`04.sql`): `anon` y `authenticated` sobre las 4 tablas nuevas y la vista | Todas las filas con `ok = true`. `authenticated` puede leer y eliminar `weight_entries`, leer la auditoría y la vista, y nada en las tablas de transición; `anon`, nada |
| Permisos por columna (`05.sql`) | `ok = true`. `authenticated` solo inserta y corrige `measured_on` y `weight_kg` |
| Funciones (`06.sql`) | `ok = true`. Solo `complete_onboarding` es ejecutable, y solo por `authenticated` |
| Vista (`07.sql`) | `security_invoker = true` |
| Tarea `purge-weight-entry-audit` | Presente, `17 3 * * *` |
| `supabase migration list --linked` | Migraciones aplicadas según D1 |

`run-checks.sh` aborta en el primer archivo que falle (código distinto de 0, error de la base o `ok = false`); no se sigue con el despliegue hasta resolverlo. Las comprobaciones posteriores se ejecutaron contra el Supabase **local** (con la migración A aplicada): 51 filas con `ok = true` y ninguna con `ok = false`.

Si algo no coincide: **detenerse**, no publicar el cliente y corregir hacia adelante (sección 6).

## 5. Publicar el cliente aprobado 🔒 (cómo llega a los dispositivos)

**Fusionar en git no actualiza ninguna app instalada.** Estado actual del repositorio:
- no hay `expo-updates`, `expo-dev-client` ni `eas.json`;
- no existen builds instalables (R6 pendiente).

Hoy solo hay ejecución local (`npm run start:qa`).

**Cómo funcionan los canales de EAS Update:**
- Cada **build** lleva grabado un **canal**: el `channel` de su perfil en `eas.json`.
- Una actualización se publica en una **rama de actualizaciones** y llega a los builds cuyo canal apunta a esa rama. Con `eas update --channel <canal>`, se publica en la rama vinculada a ese canal; por defecto tiene el mismo nombre.
- **Solo reciben la actualización los dispositivos cuyo build tiene ese canal** y la misma `runtimeVersion`. Un build `preview` (canal `preview`) **no** recibe lo publicado en `production`.

Pasos, en este orden y con aprobación:

1. **Fusión** del PR en `develop` después de la revisión de Codex, y en `main` cuando se decida publicar.
2. **Configurar la distribución.** Es un cambio aparte con su propio PR y requiere aprobar dependencias:
   - agregar `expo-updates` (`npx expo install expo-updates`) y vincular el proyecto con `eas update:configure`, que agrega `updates.url`;
   - `runtimeVersion` con política `appVersion`;
   - `eas.json` con estos perfiles:

     | Perfil | `distribution` | `channel` | Uso |
     |---|---|---|---|
     | `development` | `internal` | `development` | Development build (R6) |
     | `preview` | `internal` | `preview` | Pruebas antes de publicar a la familia |
     | `production` | `internal` (Android, APK) | `production` | Los 4 dispositivos de la familia |

   - variables públicas en EAS: `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Nunca claves secretas.
3. **Primera instalación (EAS Build, plan gratuito de Expo):**
   - **Prueba:** `eas build --profile preview --platform android` en un dispositivo; se valida contra el remoto ya migrado.
   - **Familia:** `eas build --profile production --platform android`. Genera un APK con canal `production` que se instala por enlace interno.
   - **iOS:** la distribución interna exige una cuenta Apple Developer, que es de pago. Queda **bloqueada** hasta que lo decidas; no se contrata nada.
4. **Siguientes cambios de JavaScript:**
   - Primero `eas update --channel preview --message "…"` para probar.
   - Después `eas update --channel production --message "…"` para la familia.
   - Cada dispositivo descarga la actualización al abrir la app y la aplica al reiniciarla.
   - Cambios nativos (dependencias nuevas) o un cambio de `runtimeVersion` requieren otro **build**, no un update.
5. **Seguimiento por dispositivo:**
   - Anota el canal y la versión que tiene cada dispositivo.
   - La migración B (`docs/propuestas/salud-peso/posterior/`) solo se considera cuando los 4 tengan la versión nueva en `production` y hayan pasado 14 días sin escrituras de apps viejas; su bloque de comprobación lo verifica.

## 6. Recuperación (prioridad: conservar esquema y datos)

La migración A es aditiva y compatible con la app instalada. Ante un problema, **no se revierte**: se detiene la publicación y se corrige hacia adelante.

1. **Si falla el `db push`:**
   - `supabase migration list --linked` y las comprobaciones previas (`prechecks/`) para saber qué quedó aplicado. La CLI debería aplicar cada archivo de forma atómica, pero hay que comprobarlo.
   - Diagnosticar. Si no quedó registrada, se corrige el archivo **en local** (pgTAP y QA) y se vuelve a intentar con la misma revisión.
2. **Si las comprobaciones posteriores no coinciden:**
   - **No publicar el cliente.** La app instalada sigue funcionando: la migración no cambia ni borra nada que esa app use.
   - Diagnosticar con consultas de lectura.
   - Corregir con una **migración nueva** que conserve los datos: por ejemplo, un permiso faltante (`grant`/`revoke`), una política o una función con `create or replace`, o volver a ejecutar `import_profile_weights()`, que es idempotente. Se prueba primero en local con pgTAP y luego se aplica con aprobación.
3. **Si una actualización de la app causa problemas:**
   - Volver a publicar la anterior en el **mismo canal** con `eas update:republish`.
   - El esquema nuevo sigue siendo compatible con la versión anterior de la app.
4. **No se restauran respaldos ni se borran datos** sin una aprobación aparte.

### Medidas excepcionales y destructivas (no forman parte del plan normal) 🔒🔒

Solo se consideran si no existe corrección hacia adelante. Requieren aprobación explícita **para cada archivo** y un respaldo previo verificado de los datos nuevos:

```bash
supabase db dump --linked --data-only -s public -f ~/tyra-backups/remoto-pre-excepcional.sql
```

| Archivo | Efecto |
|---|---|
| `excepcional-destructivo-revertir-salud.sql` | **Borra** las tablas de Salud y todos sus datos (mediciones, correcciones, importaciones) y el registro de la migración. `profiles.weight_kg` sigue intacto |
| `excepcional-destructivo-revertir-phone-alias.sql` | Restaura la función anterior de altas, con el riesgo documentado del teléfono en los metadatos |

## 7. Comprobaciones de producción frente a pruebas locales

| Dónde | Qué | Quién/cuándo |
|---|---|---|
| **Local** (hecho) | `npm run check:app` (803), `npm run test:db` (105, pgTAP), comprobaciones posteriores contra la base local (51 permisos con `ok = true`), `npm run test:auth-local` (55; crea y borra usuarios), QA manual en la app web | Antes del PR |
| **Producción** | Solo `prechecks/` y `postchecks/` (lectura; una sentencia por archivo). Después, prueba manual del dueño con su propia cuenta: Inicio y Salud muestran su peso heredado con «fecha sin confirmar»; confirmar la fecha y registrar una medición son opcionales y son datos reales del dueño | Después de los pasos 3 y 4 |
| **Nunca en producción** | `test:auth-local` (crea usuarios), `test:db` / pgTAP, `invite:local`, invitaciones reales, la migración B, `config push`, archivos `excepcional-*` sin aprobación específica | — |

## 8. Orden de ejecución y puntos de aprobación

1. Revisión de Codex del PR. Corregir sus hallazgos y repetir las validaciones locales.
2. D1 🔒: qué migraciones remotas se aplican.
3. Respaldo 🔒, comprobaciones previas y, si todo coincide, `db push` 🔒.
4. Comprobaciones posteriores. Si algo falla: no publicar y corregir hacia adelante (sección 6).
5. Fusión del PR en `develop` 🔒 (y en `main` cuando corresponda).
6. Configurar la distribución (PR aparte, con dependencias aprobadas) 🔒, EAS Build 🔒 y EAS Update 🔒.
7. Prueba manual del dueño en producción. Seguimiento de los dispositivos para la migración B (entrega posterior).
