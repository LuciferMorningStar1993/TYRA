@AGENTS.md
@docs/design-system.md

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

## Stack

Expo SDK 58 + Expo Router (rutas en `src/app/`) + TypeScript + Supabase (Auth, Postgres con RLS, Edge Functions).

- `src/app/`: `sign-in`, `sign-up`, `onboarding`, `auth/callback` y `(app)/(tabs)` (Inicio, Salud, Finanzas, Perfil) + `(app)/apariencia`. `src/app/_layout.tsx` decide la ruta con `Stack.Protected`.
- `src/design/`: paletas, tokens y ThemeProvider (ver `docs/design-system.md`, **obligatorio al crear UI**).
- `src/components/ui/`: componentes base; `src/components/`: componentes de dominio.
- `src/lib/`: lógica pura y clientes (`supabase.ts`, `auth.ts`, `identifier.ts`, `health.ts`, `profile.ts`, `format.ts`). La lógica de negocio va aquí con tests.
- `src/providers/session-provider.tsx`: sesión + perfil (`updateProfile` optimista).

## Autenticación

Correo/teléfono + contraseña y Google. Detalles y activación de Google en `docs/auth.md`.

## Base de datos

- Todo cambio de esquema es una migración en `supabase/migrations/` (`supabase migration new <nombre>`), con RLS en cada tabla nueva.
- Aplicar: `supabase db push --linked`. Regenerar tipos: `supabase gen types typescript --linked --schema public > src/lib/database.types.ts`.
- Auth y demás servicios: `supabase/config.toml` + `supabase config push` (revisar el diff antes de confirmar).
- Edge Functions (Deno) en `supabase/functions/`, excluidas del `tsconfig` de la app.

## Secretos

- `.env.local` (ignorado) solo con valores `EXPO_PUBLIC_*` públicos (URL + publishable key). Ver `.env.example`.
- Llaves secretas (Supabase secret/service_role, Google, Anthropic) nunca en la app ni en git: van en secretos de Edge Functions o en `supabase/.env` (ignorado).

## Antes de terminar una tarea

`npm run typecheck && npm run lint && npm test`
