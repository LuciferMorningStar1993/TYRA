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

**Opción 1 (recomendada):** aprobar explícitamente las dos migraciones con un solo `supabase db push --linked`.
- La de 031703 no es configuración de Auth: no cambia `enable_signup`, confirmaciones, redirecciones, plantillas ni SMTP.
- Solo endurece el alta de usuarios: el teléfono deja de venir de los metadatos y pasa a ser un alias que el dueño agrega desde Perfil.
- Es compatible con la app actual y con la nueva.
- Para revertirla existe `rollback-remoto-phone-alias.sql`.

**Opción 2 (solo Salud):**
1. Ejecutar únicamente el archivo de Salud:
   ```bash
   supabase db query --linked -f supabase/migrations/20261025052742_weight_entries.sql
   ```
2. Registrarlo como aplicado:
   ```bash
   supabase migration repair --linked --status applied 20261025052742
   ```

La migración 031703 quedaría pendiente con una fecha **anterior** a la última aplicada, y el próximo `db push` exigiría `--include-all`. No la recomiendo: rompe el orden del historial y no está probada en local con ese procedimiento.

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
supabase db query --linked -f docs/despliegue/salud-fase1/prechecks.sql
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
supabase db query --linked -f docs/despliegue/salud-fase1/postchecks.sql
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
| Privilegios de `anon` y `authenticated` (lectura de tablas y vista, onboarding, purga) | `false` en todos |
| Tarea `purge-weight-entry-audit` | Presente, `17 3 * * *` |
| `supabase migration list --linked` | Migraciones aplicadas según D1 |

Si algo no coincide: **detenerse**, no publicar el cliente y revisar la sección 6.

## 5. Publicar el cliente aprobado 🔒 (cómo llega a los dispositivos)

**Fusionar en git no actualiza ninguna app instalada.** Estado actual del repositorio:
- no hay `expo-updates`, `expo-dev-client` ni `eas.json`;
- no existen builds instalables (R6 pendiente).

Hoy solo hay ejecución local (`npm run start:qa`). Por eso la publicación necesita, en este orden y con aprobación:

1. **Fusión** del PR en `develop` después de la revisión de Codex (y en `main` cuando se decida publicar).
2. **Configurar la distribución.** Es un cambio aparte con su propio PR y requiere aprobar dependencias:
   - agregar `expo-updates` con `npx expo install expo-updates`;
   - crear `eas.json` con los perfiles `development`, `preview` y `production`, y sus canales;
   - definir `runtimeVersion` (política `appVersion`);
   - configurar en EAS las variables públicas `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Nunca claves secretas.
3. **Primera instalación (EAS Build, plan gratuito de Expo):**
   - **Android:** `eas build --profile preview --platform android`. Genera un APK que se instala por enlace interno.
   - **iOS:** la distribución interna exige una cuenta Apple Developer, que es de pago. Queda **bloqueada** hasta que lo decidas; no se contrata nada.
4. **Siguientes cambios de JavaScript:** `eas update --channel production --message "Salud fase 1"`. Cada dispositivo descarga la actualización al abrir la app y la aplica al reiniciarla. Los cambios nativos (dependencias nuevas) requieren otro build, no un update.
5. **Seguimiento por dispositivo:** anota qué dispositivos ya tienen la versión nueva. La migración B (`docs/propuestas/salud-peso/posterior/`) solo se considera cuando los 4 la tengan y hayan pasado 14 días sin escrituras de apps viejas; su bloque de comprobación lo verifica.

## 6. Recuperación (conserva los datos)

- **Si falla el `db push`:**
  1. Ver `supabase migration list --linked` y `prechecks.sql` para saber qué quedó aplicado. La CLI debería aplicar cada archivo de forma atómica, pero hay que **comprobarlo** en vez de suponerlo.
  2. Si algún objeto nuevo quedó a medias, usar la recuperación de abajo.
  3. Diagnosticar antes de reintentar.
- **Si las comprobaciones posteriores fallan o hay que revertir la migración A** 🔒:
  1. Respaldar primero los datos nuevos:
     ```bash
     supabase db dump --linked --data-only -s public -f ~/tyra-backups/remoto-pre-rollback.sql
     ```
  2. Ejecutar:
     ```bash
     supabase db query --linked -f docs/despliegue/salud-fase1/rollback-remoto.sql
     ```
  - `profiles.weight_kg` nunca se modificó, así que los pesos originales siguen intactos.
  - Solo se pierden las mediciones creadas después de aplicar la migración, que quedan en el respaldo previo.
- **Si hay que revertir 031703** (solo en la opción 1) 🔒:
  ```bash
  supabase db query --linked -f docs/despliegue/salud-fase1/rollback-remoto-phone-alias.sql
  ```
  Esto restaura la versión anterior de `handle_new_user`, con el riesgo documentado.
- **Cliente:** si ya hubo un `eas update` problemático, se vuelve a publicar la actualización anterior con `eas update:republish` en el mismo canal. La app vieja sigue funcionando con el esquema nuevo.
- **No se restauran respaldos completos ni se borran datos** sin una aprobación aparte.

## 7. Comprobaciones de producción frente a pruebas locales

| Dónde | Qué | Quién/cuándo |
|---|---|---|
| **Local** (hecho) | `npm run check:app` (799), `npm run test:db` (102, pgTAP), `npm run test:auth-local` (55; crea y borra usuarios), QA manual en la app web | Antes del PR |
| **Producción** | Solo `prechecks.sql` y `postchecks.sql` (lectura). Después, prueba manual del dueño con su propia cuenta: Inicio y Salud muestran su peso heredado con «fecha sin confirmar»; confirmar la fecha y registrar una medición son opcionales y son datos reales del dueño | Después de los pasos 3 y 4 |
| **Nunca en producción** | `test:auth-local` (crea usuarios), `test:db` / pgTAP, `invite:local`, invitaciones reales, la migración B, `config push` | — |

## 8. Orden de ejecución y puntos de aprobación

1. Revisión de Codex del PR. Corregir sus hallazgos y repetir las validaciones locales.
2. D1 🔒: qué migraciones remotas se aplican.
3. Respaldo 🔒, comprobaciones previas y, si todo coincide, `db push` 🔒.
4. Comprobaciones posteriores. Si algo falla, detenerse; la recuperación 🔒 está en la sección 6.
5. Fusión del PR en `develop` 🔒 (y en `main` cuando corresponda).
6. Configurar la distribución (PR aparte, con dependencias aprobadas) 🔒, EAS Build 🔒 y EAS Update 🔒.
7. Prueba manual del dueño en producción. Seguimiento de los dispositivos para la migración B (entrega posterior).
