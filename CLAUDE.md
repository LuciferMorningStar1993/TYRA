@AGENTS.md
@docs/PROJECT_CONTEXT.md

# TYRA — proyecto personal

SuperApp personal/familiar (4 usuarios): salud, fitness, nutrición y finanzas. Se instala sin stores (EAS Build + EAS Update).

## Cuentas: solo personales

- Este proyecto **no es de Metafinanciera**. No aplicar el flujo de sync de Jira/Slack del CLAUDE.md global (ni al decir "listo", "gracias", etc.).
- No usar conectores ni cuentas de trabajo (Vercel MCP de trabajo, Jira, Slack, Gmail corporativo, cuenta `brayanalcantarameta` de gh).
- Commits con la identidad local del repo (Gmail personal). Para `gh`, usar la cuenta personal sin cambiar la activa:
  `GH_TOKEN=$(gh auth token --user LuciferMorningStar1993) gh ...`
- Supabase: proyecto `TYRA` (ref `hzvyhfnlidprpnswfurw`, us-east-1). Expo: cuenta `lucifermorningstar1993`.

## Preferencia de trabajo

- Todo lo que se pueda configurar por código/CLI se hace así (migraciones, `supabase config push`, Edge Functions). Pedir pasos manuales en dashboards solo cuando no exista otra vía (p. ej. credenciales OAuth de Google), y documentarlos.
- **Nunca usar el backend remoto para QA ni pruebas.** QA manual solo con `npm run start:qa` contra Supabase local (ver `docs/qa-local.md`). Pruebas SQL (`npm run test:db`) solo en local y con autorización.

## Stack

Expo SDK 58 + Expo Router (rutas en `src/app/`) + TypeScript + Supabase (Auth, Postgres con RLS, Edge Functions).

- `src/app/`: `sign-in`, `sign-up`, `auth/callback`, `profile-status`, `onboarding` y `(app)/(tabs)` (Inicio, Salud, Finanzas, Perfil) + `(app)/apariencia`. `src/app/_layout.tsx` decide la ruta con `Stack.Protected` según `resolveRoute` (`src/lib/session-routing.ts`).
- `src/design/`: paletas (Aurora, Nordic, Indigo × claro/oscuro), tokens y ThemeProvider.
- `src/components/ui/`: componentes base; `src/components/`: componentes de dominio.
- `src/lib/`: lógica pura y clientes (`supabase.ts` + `supabase-config.ts`, `auth.ts`, `identifier.ts`, `health.ts`, `onboarding.ts`, `profile-api.ts`, `latest-writer.ts`, `format.ts`). La lógica de negocio va aquí con tests.
- `src/providers/session-provider.tsx`: sesión + perfil. Estados de perfil explícitos (cargando, cargado, ausente, error) y `saveProfile` que solo actualiza el estado cuando el servidor confirma una fila; descarta respuestas de peticiones o sesiones anteriores.

## UI y accesibilidad (resumen; contexto completo en `docs/PROJECT_CONTEXT.md`)

- Sin colores fijos en pantallas: usar `useTheme().colors.<token>`; texto con `AppText` (Inter) y cantidades con `tabular`.
- WCAG 2.2 AA: los pares de color están verificados en `src/design/palettes.test.ts`; un token nuevo se agrega en las 6 variantes y se cubre ahí.
- Objetivos táctiles ≥ 48 dp, etiquetas visibles en formularios, estados no solo por color, etiquetas de accesibilidad, escalado de texto hasta 200 %.
- El género solo **sugiere** la paleta en los borradores (registro/onboarding, vía `previewPalette`); la elección explícita siempre gana y el género nunca cambia el tema guardado.
- Apariencia: pendiente por usuario con versión (`theme-preferences.ts`), registrado antes de enviar; la última elección prevalece y los errores se muestran.
- Íconos: solo Lucide. No implementar lógica de salud/finanzas que aún no exista (usar estados vacíos).

## Salud

- **Peso: fuente única `weight_entries`** (`src/lib/weight.ts`, `weight-api.ts`, `providers/weight-provider.tsx`). Vigente = medición fechada más reciente; si no hay, el peso heredado del perfil sin fecha (fuera de gráficas y resúmenes hasta confirmar su fecha). `profiles.weight_kg` es obsoleta: la app no la lee ni la escribe (se retira con la migración B, entrega posterior). Corregir/eliminar exige la `version` leída; la auditoría vence a los 180 días. Onboarding = `complete_onboarding` (perfil + primer peso en una transacción). Diseño: `docs/propuestas/salud-peso/propuesta.md`.
- Los indicadores siguen `HEALTH_AGE_POLICY` y `GOAL_POLICY` (`src/lib/health.ts`): gasto estimado (descriptivo) separado de la meta según objetivo (recomendación). Nunca mostrar valores negativos o no finitos; los casos no aplicables se explican. No inventar fórmulas pediátricas ni pisos clínicos.

## Autenticación

- **Registro cerrado por invitación** (`[auth] enable_signup = false`): solo el administrador crea cuentas (Dashboard; en local `npm run invite:local`). Nunca credenciales administrativas en la app ni endpoints públicos de invitación. Aceptar = `verifyOtp` tipo `invite` al pulsar un botón (abrir el enlace no consume el token) → «Crea tu contraseña».
- Correo/teléfono + contraseña y Google (navegador + PKCE; Google aún no aceptado), con **confirmación de correo obligatoria**: nunca asumir sesión tras registrarse. Flujo, SMTP, cuentas autoconfirmadas y pasos remotos en `docs/email-confirmation.md`.
- Todos los enlaces de Auth vuelven a `/auth/callback` (`authRedirectUrl()`), con `sb_flow_id` para usar el verificador PKCE de su propio flujo; las redirecciones permitidas son URLs exactas (+ `?sb_flow_id=*`) en `supabase/config.toml`. La aceptación móvil es en development builds, no en Expo Go.
- El teléfono es un **alias de inicio de sesión no verificado** (Edge Function `phone-login`): no viene del alta; el dueño lo agrega desde Perfil (RLS). Verificarlo por SMS requiere un proveedor de pago y aprobación.
- Una lista de correos permitidos no sustituye verificar la propiedad del correo.
- Recuperación de contraseña: respuesta genérica; el tipo de enlace sale del verificador PKCE local (`redirectType` / `PASSWORD_RECOVERY`), nunca de la URL; `/reset-password` solo con sesión de recuperación; tras el cambio se cierran las demás sesiones (sus access tokens siguen hasta 1 h).

## Base de datos

- Todo cambio de esquema es una migración en `supabase/migrations/` (`supabase migration new <nombre>`), con RLS en cada tabla nueva y pruebas pgTAP en `supabase/tests/database/`.
- Aplicar: `supabase db push --linked` (solo con autorización explícita). Regenerar tipos: `supabase gen types typescript --linked --schema public > src/lib/database.types.ts`.
- Auth y demás servicios: `supabase/config.toml` + `supabase config push` (revisar el diff antes de confirmar). Los puertos locales usan la serie 553xx.
- Edge Functions (Deno) en `supabase/functions/`, excluidas del `tsconfig` y del ESLint de la app.

## Secretos

- `.env.local` (ignorado) solo con valores `EXPO_PUBLIC_*` públicos (URL + publishable key). Ver `.env.example`.
- Llaves secretas (Supabase secret/service_role, Google, Anthropic) nunca en la app ni en git: van en secretos de Edge Functions o en `supabase/.env` (ignorado). No imprimir claves en logs ni reportes.

## Pruebas

- Proveedores y pantallas con `test-renderer` y las utilidades de `src/test-utils/` (`render`, `createProbe`, `press`, `deferred`, almacenamiento en memoria, Supabase falso). Las pruebas de pantallas van en `src/__tests__/` (nunca dentro de `src/app/`, que son rutas).
- Regresión de Auth contra Supabase local: `npm run test:auth-local` (toma de cuenta por recuperación incompleta + invitaciones; con registro cerrado, configuración actual, debe pasar). Obligatoria antes de R2 y de actualizar GoTrue.
- `render` desmonta automáticamente cada árbol tras la prueba (`cleanup`); para simular cerrar la app a mitad de prueba usa `unmount(root)`. Jest debe terminar con código 0 y sin avisos de teardown (`npx jest --runInBand` lo hace evidente).

## Antes de terminar una tarea

- App: `npm run check:app` (typecheck + lint + Jest).
- Edge Functions: `npm run check:functions` (requiere `deno` en el PATH).
