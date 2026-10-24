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

## Pruebas SQL (pgTAP)

`npm run test:db` corre `supabase test db --local`: solo contra la base local y con autorización.
