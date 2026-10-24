# Autenticación en TYRA

## Métodos

| Método | Cómo funciona |
|---|---|
| Correo + contraseña | Supabase Auth nativo (`signInWithPassword`). Sin confirmación de correo. |
| Teléfono + contraseña | Edge Function `phone-login`: busca el correo asociado a `profiles.phone` con permisos de admin, valida la contraseña y devuelve la sesión. Así no se necesita un proveedor de SMS. |
| Google | OAuth con el navegador del sistema + PKCE (`signInWithOAuth` + `WebBrowser.openAuthSessionAsync`). Funciona en Expo Go y en builds propios. |

El registro (`/sign-up`) crea la cuenta de correo; nombre, teléfono, género y paleta viajan como metadatos y el trigger `handle_new_user` los copia a `public.profiles`.

## Configuración como código

`supabase/config.toml` es la fuente de verdad (`supabase config push`):

- `site_url = "tyra://"`, `additional_redirect_urls = ["tyra://**", "exp://**"]`
- Contraseña mínima 8, con letras y números (también validado en la app: `passwordProblem`).
- `enable_confirmations = false`.

Edge Function: `supabase functions deploy phone-login --use-api` (`verify_jwt = false`, valida la publishable key).

## Activar Google (una sola vez)

Google no permite crear credenciales OAuth por API, así que este paso es manual:

1. [Google Cloud Console](https://console.cloud.google.com/) con la cuenta personal → crear proyecto `TYRA`.
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo *Externo*, nombre TYRA, correo de soporte; agregar como *usuarios de prueba* los correos de la familia.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**:
   - URI de redireccionamiento autorizado: `https://hzvyhfnlidprpnswfurw.supabase.co/auth/v1/callback`
4. Supabase Dashboard → Authentication → Sign In / Providers → **Google**: activar y pegar *Client ID* y *Client Secret*.

Al activarse, el botón "Continuar con Google" empieza a funcionar sin cambiar código (la app consulta `/auth/v1/settings`).

Después de activarlo, cambiar `[auth.external.google] enabled = true` en `supabase/config.toml`; si no, un `supabase config push` posterior lo volvería a desactivar.
