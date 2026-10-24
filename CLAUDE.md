@AGENTS.md

# TYRA — proyecto personal

SuperApp personal/familiar (4 usuarios): salud, fitness, nutrición y finanzas. Se instala sin stores (EAS Build + EAS Update).

## Cuentas: solo personales

- Este proyecto **no es de Metafinanciera**. No aplicar el flujo de sync de Jira/Slack del CLAUDE.md global (ni al decir "listo", "gracias", etc.).
- No usar conectores ni cuentas de trabajo (Vercel MCP de trabajo, Jira, Slack, Gmail corporativo, cuenta `brayanalcantarameta` de gh).
- Commits con la identidad local del repo (Gmail personal). Para `gh`, usar la cuenta personal sin cambiar la activa:
  `GH_TOKEN=$(gh auth token --user LuciferMorningStar1993) gh ...`
- Supabase: proyecto `TYRA` (ref `hzvyhfnlidprpnswfurw`, us-east-1). Expo: cuenta `lucifermorningstar1993`.

## Stack

Expo SDK 58 + Expo Router (rutas en `src/app/`) + TypeScript + Supabase (Auth OTP por correo, Postgres con RLS).

- `src/lib/` lógica pura y clientes (`supabase.ts`, `health.ts`, `profile.ts`). La lógica de negocio va aquí con tests.
- `src/providers/session-provider.tsx` sesión + perfil; `src/app/_layout.tsx` decide la ruta con `Stack.Protected`.
- `src/components/ui.tsx` componentes base; colores en `src/constants/theme.ts`.

## Base de datos

- Todo cambio de esquema es una migración en `supabase/migrations/` (`supabase migration new <nombre>`), con RLS en cada tabla nueva.
- Aplicar: `supabase db push --linked`. Regenerar tipos: `supabase gen types typescript --linked --schema public > src/lib/database.types.ts`.
- Solo usuarios dados de alta manualmente en Supabase pueden entrar (`shouldCreateUser: false`).

## Secretos

- `.env.local` (ignorado) solo con valores `EXPO_PUBLIC_*` públicos (URL + publishable key). Ver `.env.example`.
- Llaves secretas (Supabase secret/service_role, Anthropic) nunca en la app: van en secretos de Edge Functions.

## Antes de terminar una tarea

`npm run typecheck && npm run lint && npm test`
