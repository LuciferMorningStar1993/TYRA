# Confirmación de correo y Google

Decisión: se conservan **correo/contraseña** y **Google**, con **confirmación de correo obligatoria**.
Una lista de correos permitidos **no** sustituye verificar la propiedad del correo.

**Estado actual (implementado en local, sin publicar):** registro **cerrado por invitación**
(`[auth] enable_signup = false`). Ver «Registro cerrado por invitación (implementación local)». Las
secciones siguientes sobre registro público quedan como historial del flujo anterior.

## Pendientes (no aceptados todavía)

| Pendiente | Qué falta | Cuándo |
|---|---|---|
| **Google** | Código conservado pero **no aceptado**. Probar con credenciales OAuth reales que una cuenta invitada vincula Google y que un correo no invitado no crea cuenta (`signup_disabled`). | R5 |
| **Pruebas móviles** | Aceptación en **development builds** de iOS y Android (no Expo Go): enlaces `tyra://auth/callback` de confirmación, recuperación e invitación, y el código de invitación cuando el cliente de correo no abre el enlace. Requiere `expo-dev-client` + `eas.json` (dependencia por aprobar) y, en iOS físico, Apple Developer. | R6 |
| **Accesibilidad (revisión manual)** | Teclado y foco visible (web), lector de pantalla (VoiceOver/TalkBack), texto al 200 %, móvil estrecho (320 px) y las **6 variantes de tema** en las pantallas de acceso, invitación, recuperación, contraseña y Perfil. Solo hay pruebas automatizadas de contraste y etiquetas. | Antes de invitar a la familia |
| Abandono tras aceptar invitación | Quien acepta y cierra antes de crear contraseña debe usar «Olvidé mi contraseña». Marcar "contraseña creada" en el servidor es una decisión aparte. | Por decidir |
| Vencimiento de invitaciones | `otp_expiry` = 1 h. | Por decidir |

## Registro cerrado por invitación (implementación local)

**Control en el servidor:** `[auth] enable_signup = false` (con `[auth.email] enable_signup = true`).
`signUp`, crear cuenta por código/enlace (`signInWithOtp` con `shouldCreateUser`) y Google para un
correo sin cuenta fallan con `signup_disabled`. Los usuarios existentes conservan el acceso.

**Invitaciones (solo herramientas autorizadas del servidor):**
- Local/QA: `npm run invite:local -- correo [--name "Ana"]` (`scripts/invite-local.mjs`): aborta si
  la URL no es local; lee la clave de servicio de `supabase status` sin guardarla ni imprimirla.
- Real: Dashboard de Supabase → Authentication → Users → *Invite user* (paso remoto con aprobación).
- La app no tiene credenciales administrativas ni existe un endpoint público para invitar.

**Aceptar y crear la contraseña (mecanismo soportado `verifyOtp` tipo `invite`):**
1. El correo (`supabase/templates/invite.html`) trae un **enlace** a `/auth/callback?token_hash=…&type=invite`
   y un **código**.
2. Abrir el enlace **no consume** la invitación: el callback muestra «Aceptar invitación» y solo al
   pulsarlo llama `verifyOtp({ token_hash, type: 'invite' })` (verificado en local: tras cargar la
   página el token seguía pendiente y el correo sin confirmar). Así un escáner de correo que pre-abre
   enlaces no la gasta. El token no se registra en logs ni hay analítica.
3. Si el enlace no abre la app: «Tengo un código de invitación» (`/accept-invite`) con correo + código.
4. Al verificarse, el correo queda confirmado y la app lleva a **«Crea tu contraseña»** (la misma ruta
   protegida de recuperación, en modo `invite`). Bitácora local: `user_invited` → `user_signedup` →
   `user_updated_password`.

**Enlaces sin página puente ni hosting (solución mínima):**
- **Web:** el enlace apunta a `http://localhost:<puerto>/auth/callback` (en producción, al dominio web
  que se decida).
- **Development builds:** el enlace usa `tyra://auth/callback` (sitio por defecto) o el `redirectTo`
  de la invitación. Algunos clientes de correo no abren esquemas propios: para eso está el **código**,
  que funciona sin depender del enlace.
- No se construyó página intermedia. Si más adelante se usa una, no debe canjear el token al cargarse.

**Alias de teléfono:** migración `20261025031703_phone_alias_after_verification.sql` — el alta ya no
copia `phone` de los metadatos. El dueño lo agrega desde **Perfil** (validación E.164, RLS por
propietario, `unique`), etiquetado como **alias no verificado**.

**Regresión (`npm run test:auth-local`, Supabase local con esta configuración): 55 verificaciones
pasan, 0 fallan.** Incluye todos los casos originales (enlace sin abrir la app, enlace abandonado,
código; correo y alias), y además: invitación reutilizada (`otp_expired`), invitación vencida
(simulada retrasando su envío en la base local), invitación aceptada y abandonada → recuperación
posterior, el alias no se copia del alta, solo el dueño fija su alias (RLS: 0 filas para otra
persona) y un alias duplicado se rechaza (`23505`).

**Limitaciones conocidas:**
- Si la persona acepta la invitación y **recarga o cierra** antes de crear su contraseña, se queda con
  sesión pero sin una contraseña que conozca (GoTrue guarda al aceptar el hash de una contraseña
  aleatoria del servidor) y no vuelve a ver «Crea tu contraseña». Para entrar después usa «Olvidé mi
  contraseña» (probado). Mejorarlo requeriría marcar "contraseña creada" en el servidor: decisión aparte.
- **Google no está aceptado:** se conserva el código, pero falta comprobar con credenciales reales (R5)
  que una cuenta invitada pueda vincular Google y que un correo no invitado no cree cuenta. Hoy el
  registro cerrado bloquea la creación por diseño (`signup_disabled`, mensaje de invitación en la app).
- Las invitaciones vencen con `otp_expiry` (1 h): conviene avisar a la familia al enviarlas o subir el
  plazo (decisión aparte).
- `npm run test:db` (pgTAP, actualizado con el alias) **no se ejecutó** en esta entrega: requiere
  autorización.

## Flujo en la app (registro público; historial)

1. **Registro** (`/sign-up`, hoy informativa): `signUp` envía `emailRedirectTo = authRedirectUrl()`. Nunca se asume
   sesión: sin sesión → `/check-email?email=…&sent=1`. Si el correo ya existía, Supabase responde
   igual (sin sesión) y la app muestra lo mismo para no revelar qué correos tienen cuenta.
2. **Revisa tu correo** (`/check-email`): explica el paso, permite **reenviar** (`resend` tipo
   `signup`) con espera de 60 s (igual que `max_frequency`) y muestra errores de límite.
3. **Enlace** → `/auth/callback?sb_flow_id=…&code=…` → `exchangeCodeForSession(code, { flowId })`
   (**PKCE**) → onboarding. `sb_flow_id` (activado con `experimental.appendPkceFlowIdToRedirects`)
   asegura que se use el verificador del flujo que generó el enlace aunque haya otros en curso.
   - Enlace usado o vencido (`error_code=otp_expired`): pantalla de error con "Pedir un enlace nuevo".
   - Abierto en otro dispositivo/navegador (sin verificador PKCE): el correo puede quedar confirmado,
     pero no hay sesión; se pide iniciar sesión con la contraseña.
4. **Inicio de sesión sin confirmar**: con contraseña correcta, Auth responde `email_not_confirmed`
   y la app ofrece reenviar el enlace. Con contraseña incorrecta responde `invalid_credentials`
   (no revela cuentas pendientes). La Edge Function `phone-login` replica esto (403 / 401).
5. **Google**: navegador del sistema + PKCE, mismo `/auth/callback`.

## Recuperación de contraseña

1. **«¿Olvidaste tu contraseña?»** (`/forgot-password`): `resetPasswordForEmail(email, { redirectTo })`.
   La respuesta es **siempre la misma** ("Si hay una cuenta con ese correo…"): Auth responde 200 a
   correos desconocidos, y el límite de envío (429) solo aparece para cuentas existentes, así que
   tampoco se muestra. Solo un fallo de red se informa aparte. Espera de 60 s entre envíos.
2. **Enlace** → `/auth/callback?code=…&sb_flow_id=…` → `exchangeCodeForSession(code, { flowId })`.
   El tipo **no** se toma de la URL: auth-js marca el verificador local como `…/recovery` y devuelve
   `redirectType: 'recovery'` + evento `PASSWORD_RECOVERY`. Un `?type=recovery` falso en la URL no
   convierte un inicio normal en recuperación.
3. **Contraseña nueva** (`/reset-password`): ruta `reset-password` de `resolveRoute`, activa solo para
   el usuario cuya sesión llegó con `PASSWORD_RECOVERY` en esta app (estado en memoria). Tiene
   prioridad sobre onboarding/inicio. Recargar, cerrar sesión o cambiar de usuario la termina; una
   sesión normal nunca la abre. Valida 8+ caracteres con letras y números y que coincidan; rechaza
   la misma contraseña (`same_password`).
4. **Errores del enlace** (pantalla del callback, con "Pedir otro enlace para cambiar mi contraseña",
   "Reenviar el enlace de confirmación" e "Ir a iniciar sesión", porque sin verificador no se puede
   saber con certeza el tipo):
   - **Expirado o reutilizado** (`otp_expired`): "El enlace expiró o ya se usó".
   - **Otro navegador/dispositivo** (sin verificador PKCE): no se crea sesión y la contraseña no cambia.

### Sesiones después del cambio (verificado en GoTrue local `v2.197.0`)

| Qué | Resultado |
|---|---|
| Refresh tokens de **otros** dispositivos tras `updateUser({ password })` | **Revocados por Supabase** (`refresh_token_not_found`), incluso sin otra acción |
| `/auth/v1/user` con el access token de otro dispositivo | 403 (la sesión ya no existe) |
| **PostgREST con el access token ya emitido de otro dispositivo** | **Sigue funcionando (200, con datos) hasta que expira**: hasta `jwt_expiry` = 1 h |
| Este dispositivo (la sesión de recuperación) | Sigue dentro |
| Contraseña vieja / nueva | Rechazada / aceptada |
| AMR de la sesión de recuperación | `recovery` |

**Dos sesiones abiertas (A y B) y recuperación en un tercer dispositivo** (evidencia local, sin imprimir tokens):

| Sesión | Refresh token | `/auth/v1/user` | PostgREST con su access token | Vida del access token |
|---|---|---|---|---|
| A | falla (`refresh_token_not_found`) | 403 | 200 (también 30 s después) | 3600 s (`exp − iat`); ≈ 3598 s restantes al momento del cambio |
| B | falla (`refresh_token_not_found`) | 403 | 200 | igual que A |

El access token de otra sesión sigue autorizando consultas a la base de datos **hasta su `exp`**,
es decir, hasta 1 h desde que se emitió (`jwt_expiry = 3600`, se mantiene; reducirlo es una decisión
aparte). Los tokens locales se firman con ES256, así que no se pudo fabricar uno vencido para
demostrar el rechazo; PostgREST valida `exp` en cada petición.

**Política de la app:** después de cambiar la contraseña llama además a `signOut({ scope: 'others' })`
(defensa en profundidad; también cierra sesiones abiertas entre el cambio y ese momento) y le dice a
la persona si se cerraron o no las demás sesiones:
- Si `signOut('others')` responde bien: "Cerramos tu sesión en los demás dispositivos; puede tardar
  hasta una hora en dejar de funcionar del todo".
- Si falla: "Tu contraseña sí cambió, pero no pudimos confirmar que se cerró tu sesión en los demás
  dispositivos…". Verificado en la UI local forzando el fallo de `/auth/v1/logout?scope=others`:
  la pantalla muestra ese texto y no afirma que todo quedó cerrado; la bitácora local registra
  `user_updated_password`. **Acceso que puede seguir vigente:** el access
token ya emitido a otro dispositivo, contra la base de datos, hasta 1 h. Reducirlo implicaría bajar
`jwt_expiry` (más refrescos) — decisión pendiente, no aplicada. Verificar este comportamiento de nuevo
en el proyecto remoto cuando se aplique R2 (la versión de GoTrue puede diferir).

### Recuperación de una cuenta sin confirmar (evidencia local, GoTrue `v2.197.0`)

| Paso | Resultado |
|---|---|
| Registro sin confirmar | sin sesión; `email_confirmed_at` vacío; login con su contraseña → `email_not_confirmed` |
| Solicitar recuperación | se envía el correo (Auth no distingue cuentas confirmadas) |
| **Abrir el enlace** (paso `verify` del servidor) | **confirma el correo**, antes del intercambio PKCE |
| Intercambio en el mismo navegador | sesión con `redirectType = recovery` |
| Cambiar la contraseña | permitido; el correo sigue confirmado |
| Acceso | contraseña nueva: entra; la original: `invalid_credentials` |

**Hallazgo de seguridad (abierto; R1–R6 bloqueados hasta resolverlo):** toma de cuenta previa al
registro mediante una recuperación incompleta.

Caso reproducido en local (`npm run test:auth-local`, sin prototipo → **6 verificaciones fallan**):

1. A crea una cuenta con el correo de B y una contraseña que conoce A (y un alias de teléfono).
2. B pide recuperación y verifica el **enlace** o el **código**.
3. B abandona: no abre la app (otro navegador), o abre la sesión de recuperación y recarga/cierra
   sin fijar contraseña.
4. Al verificar, Auth **confirma el correo** y la contraseña de A pasa a funcionar, **por correo y por
   el alias de teléfono** (`phone-login` → 200), en las tres variantes.

**Una recuperación con código (OTP) no elimina el problema por sí sola:** `verifyOtp` con
`type: 'recovery'` también confirma el correo antes de que B fije una contraseña, y si B abandona en
ese momento la contraseña de A queda habilitada (verificado: correo 200 / teléfono 200). Ocultar o
cambiar pantallas tampoco lo resuelve, porque la contraseña de A se acepta directamente en la API.

Secuencia observada en GoTrue `v2.197.0` (registrando cada `UPDATE` de `auth.users`): primero se
consume `recovery_token` con la cuenta **aún sin confirmar**; después, en otro `UPDATE`, se fija
`email_confirmed_at` y se consume `confirmation_token`. La contraseña nunca se toca.

### Mecanismos evaluados

| # | Mecanismo | ¿Cierra el caso en la API? | Límites |
|---|---|---|---|
| 1 | Recuperación por código (OTP) en lugar de enlace | **No** (verificado) | Mismo efecto: confirma sin cambiar la contraseña |
| 2 | Mensajes/pantallas (advertir en "otro navegador") | **No** | Solo UI; la API sigue aceptando la contraseña de A |
| 3 | **Trigger `BEFORE UPDATE` en `auth.users`**: si se consume `recovery_token` mientras el correo no está confirmado y la contraseña no cambia en ese `UPDATE`, se vacía `encrypted_password` | **Sí** (prototipo local: las 13 verificaciones pasan, incluidos los 4 controles) | Depende de detalles internos de GoTrue (columnas y orden de los `UPDATE`); un cambio de versión puede romperlo en silencio → la regresión debe correr antes de cada actualización de GoTrue y antes de R2. No cubre la vía "B hace clic en el correo de **confirmación** del registro de A" |
| 4 | Cambiar el **registro**: alta sin contraseña (código/enlace) y fijar la contraseña solo después de confirmar | **Sí**, y también cubre la vía de confirmación | Cambia el producto y el flujo de registro; más trabajo de UI y pruebas |
| 5 | Restringir recuperación a cuentas confirmadas con el **Send Email Hook** (control en servidor: el hook no envía `recovery` a cuentas sin confirmar) | **Sí** para la recuperación | Hay que enviar todos los correos de Auth desde nuestra función (SMTP/Edge Function); B no puede recuperar una cuenta ocupada por A sin soporte manual |
| 6 | **Password Verification Hook** (rechazar contraseñas marcadas como no confiables) | Sí, en teoría | Revisar disponibilidad por plan en Supabase alojado antes de considerarlo |
| 7 | Borrar periódicamente cuentas sin confirmar | **No** (reduce la ventana) | Requiere tarea programada |

### Dirección elegida: opción 4 (verificar el correo antes de cualquier contraseña)

La opción 3 (trigger que vacía contraseñas en `auth.users`) **no se implementa**.

#### ¿Hay un control soportado y sencillo en Supabase alojado para registro abierto? **No.**

- **Before User Created hook** (disponible en Free/Pro, función de Postgres): el payload es **idéntico**
  para `signUp` con contraseña y para crear la cuenta con código/enlace (`provider: email`, sin señal de
  contraseña; `user_metadata` lo controla el cliente). Verificado en local registrando el payload: no
  puede distinguir "ya trae contraseña" y por lo tanto no puede imponer el orden.
- **Password Verification Attempt hook:** solo en planes Teams/Enterprise.
- **Custom Access Token hook + registro de "contraseña previa a verificar":** posible pero no sencillo
  (dos mecanismos, triggers sobre `auth.users`, casos de refresco); no se propone sin revisión.
- `[auth.email] enable_signup = false` **apaga todo el proveedor de correo** (incluido el login con
  contraseña: `email_provider_disabled`). No sirve.

#### Alternativa soportada: registro cerrado por invitación (prototipo local)

Control de servidor: `[auth] enable_signup = false` («Allow new users to sign up»), manteniendo
`[auth.email] enable_signup = true`. Las cuentas solo las crea un administrador con una invitación;
la persona verifica su correo al aceptarla y **después** fija su contraseña. Encaja con 4 usuarios
familiares.

Evidencia (`npm run test:auth-local`, Supabase local con la política cerrada aplicada de forma
temporal y revertida después):

| Criterio | Resultado |
|---|---|
| Llamada directa a la API: `signUp` con contraseña | Rechazada (`signup_disabled`) |
| Llamada directa a la API: crear cuenta por código/enlace (`signInWithOtp`, `shouldCreateUser`) | Rechazada (`signup_disabled`) |
| Invitación pendiente: A intenta registrar ese correo con su contraseña | Rechazado; la invitación sigue **sin** contraseña |
| Recuperación verificada por **enlace** (sin abrir la app / abriendo y abandonando) o por **código**, B abandona | A no entra por correo (`invalid_credentials`) ni por alias de teléfono (401) |
| Invitación aceptada y abandonada | A no entra; el hash guardado **no** es la contraseña de A (GoTrue guarda al aceptar el hash de una contraseña aleatoria del servidor, desconocida para todos) |
| El dueño completa el alta aunque A lo intentó antes | Fija su contraseña tras verificar, agrega su alias de teléfono y entra por correo y por alias |
| Controles (cuenta confirmada que abandona una recuperación; recuperación completada; aceptar con recuperación pendiente) | Pasan |
| **Google** | **No ejecutado**: requiere credenciales OAuth reales (se valida en R5) |

Total: **36 verificaciones pasan, 0 fallan** con registro cerrado. Con la política actual (abierta)
la misma regresión sigue fallando en los **6** criterios del caso: no se quitó ningún criterio. Único
ajuste: tras aceptar una invitación, "sin contraseña" se reemplazó por "el hash no corresponde a la
contraseña de A" (comprobación exacta con `crypt`), porque GoTrue guarda ahí una contraseña aleatoria.

Google y la vinculación de identidades: con el registro cerrado, Google **no puede crear** cuentas
nuevas. Para cuentas invitadas, la única contraseña posible la fija el propio dueño después de
verificar, así que no puede existir una contraseña controlada por otra persona a la cual vincular
Google. Queda por comprobar en R5, con credenciales reales, que GoTrue vincule (o rechace) Google con
una invitación **pendiente** sin crear una cuenta nueva.

#### Alcance del cambio completo (para revisión; no implementado)

1. `supabase/config.toml`: `[auth] enable_signup = false` (se publica con R2).
2. App: quitar el registro público (`/sign-up` → pantalla informativa "TYRA es por invitación") y el
   botón "Registrarme con Google"; mantener login con contraseña, alias de teléfono y Google.
3. Invitación: plantilla en español (`[auth.email.template.invite]`) con enlace a la app y
   `token_hash`; el callback la completa con `verifyOtp({ token_hash, type: 'invite' })` y lleva a una
   pantalla **"Crea tu contraseña"** (reutiliza la de contraseña nueva). Considerar que los enlaces
   `tyra://` dentro de correos pueden no abrirse en algunos clientes: evaluar una página web puente.
4. Alias de teléfono **solo después** de verificar: migración para que `handle_new_user` deje de copiar
   `phone` desde los metadatos del alta; el alias se agrega desde Perfil con sesión.
5. Pruebas: unitarias y de pantalla para invitación y "Crea tu contraseña"; `test:auth-local` en modo
   cerrado como requisito antes de R2.
6. Operación (remota, con aprobación): invitar a los 4 familiares y resolver `qa1@tyra-local.test` (R4).

Pasos remotos afectados (siguen bloqueados): R2 incluiría `[auth] enable_signup = false`; se agregaría
un paso de invitaciones; R4 y R5 se ajustan a este modelo.

### Propuesta anterior: opción 3 (descartada por decisión; se conserva como registro)

**Opción 3**, como migración versionada con su prueba, más la regresión `npm run test:auth-local` como
requisito previo a R2 y a cada actualización de GoTrue. Es el cambio más pequeño que cierra el caso
reproducido en la API (correo y teléfono) sin cambiar el registro ni el alcance del producto.

Efectos conocidos de la opción 3 (verificados en el prototipo):
- B, tras verificar, puede fijar su contraseña en la sesión de recuperación; si abandona, la cuenta
  queda confirmada **sin contraseña utilizable** y B puede pedir otra recuperación.
- Un usuario legítimo que pidió recuperación **antes** de confirmar su propio registro y la verifica
  pierde la contraseña inicial y debe fijar una nueva (comportamiento seguro por defecto).
- Confirmar el propio registro con su enlace (aunque haya una recuperación pendiente) no afecta la
  contraseña; tampoco a cuentas ya confirmadas.

**Riesgo residual (no cubierto por la opción 3):** si B hace clic en el correo de *confirmación* del
registro creado por A, la contraseña de A queda habilitada. Solo la **opción 4** lo cierra; el texto de
la plantilla ("Si tú no creaste esta cuenta, ignora este mensaje") lo mitiga pero no lo elimina.

## Redirecciones (exactas, en `supabase/config.toml`)

| URL | Uso |
|---|---|
| `tyra://auth/callback` (+ `?sb_flow_id=*`) | development builds y app instalada (aceptación móvil) |
| `http://localhost:8081/auth/callback` (+ `?sb_flow_id=*`) | web en desarrollo |
| `http://localhost:8082/auth/callback` (+ `?sb_flow_id=*`) | QA local (`npm run start:qa -- --web --port 8082`) |

El patrón `?sb_flow_id=*` solo admite ese parámetro: `*` no cruza `/` ni `.`.

Expo Go (`exp://`) ya no se admite para Auth: la aceptación móvil se hace en development builds.

## QA local realizada (solo Supabase local, puertos 553xx + Mailpit)

- Registro sin sesión; correo "Confirma tu correo en TYRA" en Mailpit con `redirect_to` exacto.
- Login sin confirmar: contraseña correcta → `email_not_confirmed`; incorrecta → `invalid_credentials`.
- `phone-login` local: 403 `email_not_confirmed` / 401 `invalid_credentials`.
- UI web: registro → "Revisa tu correo" → enlace → onboarding; enlace reutilizado → error con
  opciones para pedir otro enlace; login sin confirmar → botón "Reenviar enlace de confirmación".
- Recuperación (UI web + API): respuesta genérica para correo inexistente y existente (0 correos al
  inexistente); enlace → `/reset-password`; misma contraseña rechazada; contraseña nueva guardada →
  "Cerramos tu sesión en los demás dispositivos" → onboarding; `/reset-password` sin recuperación
  redirige; enlace reutilizado → error; enlace sin verificador (otro navegador) → error sin sesión y
  la contraseña no cambia.
- Todas las peticiones fueron a `127.0.0.1:55321`.

## Propuesta de SMTP: Gmail con contraseña de aplicación (no configurado)

El correo integrado de Supabase solo entrega a miembros del equipo del proyecto y con muy pocos
envíos por hora (verificar la política vigente): sin SMTP propio, la familia no recibiría los enlaces.

**Propuesta inicial:** Gmail SMTP con **contraseña de aplicación** en una **cuenta de Gmail dedicada**
a TYRA (p. ej. `tyra.<algo>@gmail.com`), no en tu Gmail personal.

Por qué una cuenta dedicada:
- Una contraseña de aplicación permite enviar correo **como esa cuenta**. Si se filtra, el daño queda
  limitado a un buzón que solo envía avisos de TYRA, no a tu correo personal.
- Se puede revocar o rotar sin tocar tu cuenta principal, y el remitente identifica claramente a TYRA.

Requisitos y preparación (los haces tú; **no compartas la contraseña en el chat**):
1. Crear la cuenta de Gmail dedicada y activarle la **verificación en 2 pasos** (obligatoria para
   las contraseñas de aplicación). Guarda los códigos de respaldo de 2FA en tu gestor de contraseñas.
2. En esa cuenta: Cuenta de Google → Seguridad → **Contraseñas de aplicaciones** → crear una llamada
   "Supabase TYRA". Guárdala directamente en tu gestor de contraseñas.
3. Parámetros SMTP:

   | Campo | Valor |
   |---|---|
   | Host | `smtp.gmail.com` |
   | Puerto | `465` (SSL) o `587` (STARTTLS) |
   | Usuario | la dirección completa de la cuenta dedicada |
   | Contraseña | la contraseña de aplicación (16 caracteres) |
   | Remitente | la misma dirección; nombre "TYRA" |

4. Dónde va el secreto (R1, con aprobación):
   - **Opción A (recomendada):** capturarlo tú en el dashboard de Supabase → Authentication → SMTP.
   - **Opción B (como código):** en `supabase/.env` (ignorado por Git) como `SUPABASE_AUTH_SMTP_PASS`,
     descomentar `[auth.email.smtp]` en `config.toml` y aplicar con `supabase config push`.
   Nunca en Git, `.env.local`, la app ni el chat.
5. Subir `[auth.rate_limit] email_sent` (hoy 2/h), p. ej. a 30/h.
6. Probar antes en local: el Supabase local también puede usar el SMTP de Gmail si se define en
   `supabase/.env`; por defecto los correos locales van a Mailpit (`http://127.0.0.1:55324`).

Limitaciones a tener presentes:
- Gmail aplica límites diarios de envío y puede marcar como spam correos automatizados; para 4
  personas basta, pero no escala. Revisar los límites vigentes de Google.
- Las contraseñas de aplicación se invalidan al cambiar la contraseña de la cuenta: hay que rotarla en Supabase.
- Si después se compra un dominio, migrar a un proveedor transaccional (Resend, Brevo) con SPF/DKIM/DMARC.

## Cuentas creadas con autoconfirmación (procedimiento; R4 **no** se ejecuta todavía)

Mientras `enable_confirmations` estuvo desactivado, Auth marcó como confirmado **cualquier** correo
al registrarse. Activar la confirmación **no** acredita retroactivamente la propiedad de esas cuentas.

### 1. Inventario heurístico (solo lectura)

Auth no guarda un indicador de "autoconfirmado": solo `created_at` y `email_confirmed_at`. Esta
consulta es una **heurística** para encontrar candidatos, no una prueba:

```sql
-- Candidatos: cuentas de correo cuya confirmación coincidió (±5 s) con el alta,
-- creadas antes de activar la confirmación (fecha de R2).
select u.id, u.email, u.created_at, u.email_confirmed_at, u.last_sign_in_at,
       array_agg(distinct i.provider) as providers
from auth.users u
left join auth.identities i on i.user_id = u.id
where u.created_at < :fecha_activacion_r2
  and u.email_confirmed_at is not null
  and u.email_confirmed_at - u.created_at < interval '5 seconds'
group by u.id
order by u.created_at;
```

Límites de la heurística:
- **Falsos positivos:** usuarios creados por un administrador con `email_confirm: true`; cuentas cuya
  identidad de **Google** (correo verificado por Google) se creó al mismo tiempo.
- **Falsos negativos:** cuentas autoconfirmadas que después cambiaron de correo o cuya
  confirmación se reescribió; cualquier alta con desfase mayor al umbral.
- Corroborar cada candidato con `auth.audit_log_entries` (eventos de alta e inicio de sesión) y con
  `providers`, y revisar a mano el resultado: con 4 usuarios esperados, la lista completa de
  `auth.users` también se puede revisar una por una.

Estado conocido: el único usuario remoto es `qa1@tyra-local.test` (cuenta de QA creada por error).

### 2. Requisitos previos antes de proponer cualquier acción sobre usuarios

| Requisito | Estado |
|---|---|
| R1 SMTP y R2 confirmación activos en remoto | Pendiente de aprobación |
| **Flujo de recuperación de contraseña en la app** (ver «Recuperación de contraseña») | Implementado; **sin commit, pendiente de revisión** |
| Plantilla de correo de recuperación en español (`[auth.email.template.recovery]`) | Lista en local; se publica con R2 |
| Prueba en local (Mailpit) de punta a punta: solicitar → abrir enlace → nueva contraseña → iniciar sesión | Hecha en local |
| Verificar la recuperación de una cuenta **sin confirmar** | Hecho en local (ver «Recuperación de una cuenta sin confirmar») |
| Respaldo de las filas afectadas (`auth.users`, `auth.identities`, `public.profiles`) antes de cualquier cambio | Falta, se hace al momento |

### 3. Sesiones existentes

Una cuenta autoconfirmada puede tener sesiones abiertas (refresh tokens) emitidas antes del cambio:

- **Inventario (solo lectura):**

  ```sql
  select s.user_id, s.id as session_id, s.created_at, s.updated_at, s.not_after
  from auth.sessions s
  where s.user_id in (:candidatos)
  order by s.user_id, s.created_at;
  ```

- **Revocación (escritura, con aprobación por cuenta):** cerrar todas las sesiones del usuario
  eliminando sus filas de `auth.sessions` (sus refresh tokens dejan de servir). El **access token**
  ya emitido sigue siendo válido hasta que expire (`jwt_expiry` = 1 h): la revocación completa no es
  inmediata.
- Cambiar la contraseña **sí** revoca los refresh tokens de las demás sesiones (verificado en GoTrue
  local `v2.197.0`; ver «Sesiones después del cambio»), pero sus access tokens siguen sirviendo hasta
  1 h. Para cuentas sin cambio de contraseña, la revocación sigue siendo un paso explícito.

### 4. Acciones propuestas por cuenta (solo después de cumplir §2, y con aprobación individual)

1. **Cuenta de QA/prueba** (`qa1@tyra-local.test`): revocar sesiones y eliminar la cuenta y su perfil.
2. **Cuenta real (familia):**
   1. Revocar sus sesiones (§3).
   2. Enviar un correo de **recuperación** a esa dirección y pedir a la persona que fije una contraseña
      nueva desde el enlace. Abrirlo y completarlo demuestra control del buzón.
   3. Registrar la fecha de la verificación.
3. **Sin respuesta en el plazo acordado:** decidir entre marcar el correo como no confirmado
   (`email_confirmed_at = null`, con respaldo previo; tendría que confirmar al volver) o eliminar la cuenta.
4. **Registro** por cuenta: fecha, acción, evidencia (evento en `audit_log_entries`) y quién aprobó.

## Development builds (aceptación móvil)

El flujo de navegador + PKCE con `tyra://auth/callback` se acepta en **development builds** de iOS y
Android, no en Expo Go.

Propuesta (requiere aprobación; no instalado):
- Dependencia **`expo-dev-client`** (oficial de Expo): necesaria para que un development build
  tenga el menú de desarrollo y cargue el bundle de Metro. Sin ella, el build no sirve para iterar.
- `eas.json` con perfil `development` (`developmentClient: true`, distribución interna; APK en Android
  y simulador o dispositivo en iOS).
- iOS en **dispositivo físico** requiere Apple Developer (USD 99/año); el **simulador de iOS** no.

Criterios de aceptación móvil:
- Registro → correo → abrir enlace en el teléfono → la app (`tyra://auth/callback`) crea la sesión → onboarding.
- Enlace vencido/usado → pantalla de error con reenvío.
- Google: abre el navegador, regresa a la app, sesión creada; cancelar no muestra error.
- Mismos casos en iOS y Android.

## Pasos remotos (cada uno requiere aprobación explícita, en este orden)

| # | Paso | Dónde | Por qué el orden |
|---|---|---|---|
| R0 | Revisión del diff de registro cerrado (este cambio) | — | Antes de cualquier paso remoto |
| R1 | SMTP Gmail con cuenta dedicada (secreto capturado por ti en el dashboard o en `supabase/.env`) y subir `email_sent` | Dashboard o `config.toml` + `supabase/.env` + `supabase config push` | Sin SMTP los correos no llegan a la familia |
| R2 | `supabase db push` de la migración del alias + `supabase config push` con: `[auth] enable_signup = false`, `enable_confirmations = true`, redirecciones (exactas + `?sb_flow_id=*`) y plantillas de confirmación, recuperación e invitación (revisar ambos diffs antes) | CLI | Cierra el registro y activa la verificación |
| R3 | Desplegar `phone-login` (`supabase functions deploy phone-login --use-api`) | CLI | 403 `email_not_confirmed` |
| R4 | Cuentas autoconfirmadas según el procedimiento (inventario heurístico, requisitos de §2, sesiones, acción por cuenta) | SQL Editor + app | Solo tras implementar y probar la recuperación |
| R4b | Invitar a los 4 familiares desde el Dashboard (después de R1 y R2) | Dashboard | Única forma de crear cuentas |
| R5 | Google: OAuth Client (Web) en Google Cloud → Client ID/Secret en Supabase → `enabled = true` en `config.toml` → `config push` | Google Cloud + Dashboard + CLI | Solo después de R2 |
| R6 | Development builds (`expo-dev-client`, `eas.json`, `eas build --profile development`) | Repo + EAS | Para la aceptación móvil |
