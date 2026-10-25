# QA manual local (sin backend remoto)

Las pruebas manuales de la app **nunca** se hacen contra el Supabase remoto. Este modo conecta la app
a un Supabase local en Docker y bloquea cualquier otro destino antes de crear el cliente.

## Cómo se usa

```bash
supabase start          # Supabase local de TYRA (puertos 553xx; ver supabase/config.toml)
npm run start:qa        # Expo en modo QA local (agrega --web, --ios, etc. si quieres)
```

`npm run start:qa` (`scripts/start-qa-local.sh`) lee `API_URL` y la clave publicable de
`supabase status`, imprime solo la URL y "clave publicable: presente", y arranca Expo con `--clear`.

## Configuración efectiva

| Variable | Modo normal | Modo QA local |
|---|---|---|
| `EXPO_PUBLIC_QA_LOCAL` | sin definir | `1` |
| `EXPO_PUBLIC_SUPABASE_URL` / `_PUBLISHABLE_KEY` | se usan (de `.env.local`) | **se ignoran** |
| `EXPO_PUBLIC_QA_SUPABASE_URL` / `_PUBLISHABLE_KEY` | se ignoran | se usan (de `supabase status`) |

- La resolución vive en `src/lib/supabase-config.ts` (`resolveSupabaseConfig`).
- Hosts permitidos en QA: `localhost`, `*.localhost`, `[::1]`, `127.x.x.x` y redes privadas
  (`10.x` —incluye `10.0.2.2` del emulador de Android—, `192.168.x`, `172.16–31.x`) para probar
  desde un teléfono en la misma red.
- Con `EXPO_PUBLIC_QA_LOCAL=1` y una URL remota (o sin variables QA), la app lanza un error al
  importar `src/lib/supabase.ts`: no se crea el cliente ni sale ninguna petición.
- Al arrancar en QA, la consola muestra `[QA local] Supabase (qa-local): <url> · clave publicable: presente`.

## Por qué variables separadas

Expo carga `.env.local` (remoto) automáticamente. Usar nombres que no existen en ese archivo evita
que un valor remoto se cuele en una sesión de QA.

## Correos en local

Con confirmación de correo activa, los correos de Auth llegan a **Mailpit**
(`http://127.0.0.1:55324`). No excluyas `mailpit` al hacer `supabase start -x …`.
Para abrir el enlace en web usa el puerto con redirección permitida: `npm run start:qa -- --web --port 8082`.

## Invitaciones en local

Con el registro cerrado, las cuentas de prueba se crean con `npm run invite:local -- correo@tyra.test`
(solo local). El correo llega a Mailpit con un enlace (`/auth/callback?token_hash=…&type=invite`) y
un código; usa `npm run start:qa -- --web --port 8082` para abrir el enlace.

## Regresión de Auth (solo local)

`npm run test:auth-local` (`scripts/local-auth-regression.mjs`) recorre contra la API de Supabase
**local** el caso de toma de cuenta por recuperación incompleta (enlace y código; correo y alias de
teléfono) y controles de flujos legítimos. Requiere `supabase start` **con** `edge-runtime` y
`mailpit` (no los excluyas con `-x`). Aborta si la URL no es local, no imprime tokens ni contraseñas
y sale con código 1 si falla algún criterio. Se adapta a la política de registro del Supabase local (`disable_signup`). Con registro abierto
falla a propósito en 6 criterios (documenta el riesgo). Con registro cerrado por invitación
(`[auth] enable_signup = false`, configuración actual del repo) pasa: 55 verificaciones.

## Pruebas SQL (pgTAP)

`npm run test:db` corre `supabase test db --local`: solo contra la base local y con autorización.
