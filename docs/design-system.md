# TYRA — Sistema de diseño, temas y accesibilidad

Contexto obligatorio para crear o modificar cualquier pantalla o componente.
Rol esperado: Senior UI/UX Designer, Design Systems Architect y Senior Frontend Developer (móvil, fintech, salud, accesibilidad).

TYRA es una SuperApp de estilo de vida con dos pilares, **Salud & Fitness** y **Finanzas Personales**, para adolescentes, adultos y personas mayores. Busca una experiencia moderna, minimalista, intuitiva y premium (inspirada en Revolut, con identidad propia), uniforme entre salud y finanzas.

## Dónde vive cada cosa

| Pieza | Archivo |
|---|---|
| Paletas (3 × claro/oscuro) y tokens de color semánticos | `src/design/palettes.ts` |
| Test de contraste WCAG AA de todas las paletas | `src/design/palettes.test.ts` (+ `contrast.ts`) |
| Espaciado, radios, alturas de control, tipografía, sombras, breakpoints, animación | `src/design/tokens.ts` |
| ThemeProvider (`useTheme()`), prioridad y persistencia de preferencias | `src/design/theme-provider.tsx`, `theme-preferences.ts` |
| Componentes base | `src/components/ui/` (`AppText`, `Button`, `Card`, `TextField`, `OptionGroup`, `ListItem`, `Screen`) |
| Selector de paleta | `src/components/palette-picker.tsx` |
| Navegación por pestañas (Inicio, Salud, Finanzas, Perfil) | `src/app/(app)/(tabs)/_layout.tsx` |
| Configuración > Apariencia | `src/app/(app)/apariencia.tsx` |
| Opciones de formularios (género, actividad, modo de color…) | `src/constants/options.ts` |
| Formatos numéricos/moneda según región | `src/lib/format.ts` |

## Reglas al crear componentes y pantallas

1. **Nunca colores hardcodeados** en pantallas o componentes: usar `useTheme().colors.<token>`. Excepción: logos de marcas externas (p. ej. Google).
2. Texto siempre con `AppText` (variantes de `typography`) y Inter; cantidades con `tabular`.
3. Controles táctiles de **mínimo 48 dp** (`controlHeight`); botones de 52 de alto, radio 12–14.
4. Tarjetas con `Card` (radio 18, sombra suave). Espaciado con `space` (múltiplos de 4/8).
5. Estado nunca solo por color: acompañar con ícono (check), texto o grosor de borde.
6. Etiquetas accesibles (`accessibilityLabel`, `accessibilityRole`, `accessibilityState`) y resúmenes textuales en tarjetas con datos.
7. Formularios: etiqueta visible (no depender del placeholder), mensaje de error comprensible bajo el campo, validación contextual.
8. Escalado de texto hasta 200% (`MAX_FONT_SCALE`): no fijar alturas que corten texto.
9. Íconos: **Lucide** (`lucide-react-native`); no añadir otra librería de íconos.
10. Animaciones 150–250 ms (`motion`), discretas, respetando movimiento reducido.
11. Mobile-first; en ≥ 768 px el contenido se limita de ancho y las pestañas pasan a barra lateral.
12. No implementar lógica de negocio de salud o finanzas que todavía no exista (usar estados vacíos / "Próximamente").
13. Si se agrega un token de color nuevo, añadirlo en las 6 variantes y cubrirlo en `palettes.test.ts`.

## 1. Temas dinámicos

| Paleta | Uso sugerido | Principal | Secundario | Fondo claro | Texto | Acento |
|---|---|---|---|---|---|---|
| **TYRA Aurora** | género femenino | `#7035D9` | `#008EAE` | `#FAF8FF` | `#211A30` | `#F3B4E6` |
| **TYRA Nordic** | género masculino | `#2455D6` | `#087F75` | `#F4F6F8` | `#18232F` | `#88BFF2` |
| **TYRA Indigo** | neutral | `#4945E8` | `#16A889` | `#F7F8FC` | `#171B2B` | `#B5A5FF` |

Reglas funcionales (implementadas):

- En el registro (o en el onboarding si entró con Google) el **género es opcional**: femenino → Aurora, masculino → Nordic, otro / prefiero no decir → Indigo.
- Es solo una **sugerencia**: se puede elegir cualquier paleta; si la persona toca una paleta, el género ya no la cambia.
- Se cambia en **Perfil > Apariencia**.
- Persistencia: `profiles.theme_palette` y `profiles.color_mode` (sincroniza entre dispositivos) + copia local (`expo-sqlite/localStorage`) leída de forma síncrona al arrancar para **evitar parpadeo**.
- Prioridad: preferencia del perfil → preferencia del dispositivo → Indigo / Automático.
- Cambiar el género después **no** modifica el tema.

Ajustes de accesibilidad hechos sobre los colores de marca (sin perder identidad):

- Secundario Aurora como fondo con texto blanco: `#008EAE` → `#00718B` (el original queda en `brand` para ilustraciones).
- Secundario Indigo como fondo con texto blanco: `#16A889` → `#0B7A62`.
- En modo oscuro los principales se aclaran (p. ej. Aurora `#B597FF`) y el texto sobre ellos es oscuro.

## 2. Modo claro y oscuro

Cada paleta tiene versión Light y Dark diseñadas a mano (no invertidas): superficies, tarjetas, bordes, textos, controles y estados. Modos: **Automático** (sigue al dispositivo), **Claro**, **Oscuro**. Paleta y modo se guardan por separado.

## 3. Tipografía

Inter (pesos 400, 500, 600, 700 vía `@expo-google-fonts/inter`).

| Variante | Tamaño / interlineado | Peso |
|---|---|---|
| `display` | 32 / 40 | 700 |
| `title` (título principal) | 28 / 36 | 700 |
| `section` (título de sección) | 22 / 30 | 600 |
| `cardTitle` | 18 / 26 | 600 |
| `body` / `bodyStrong` | 16 / 24 | 400 / 600 |
| `secondary` | 14 / 20 | 400 |
| `label` | 14 / 20 | 500 |
| `caption` | 12 / 16 | 500 |

Legibilidad sobre decoración, sin mayúsculas sostenidas en textos largos, números tabulares en cantidades.

## 4. Accesibilidad (WCAG 2.2 AA)

- Texto normal ≥ 4.5:1, texto grande ≥ 3:1, componentes y gráficos ≥ 3:1. **Verificado por test** para todos los pares usados (texto sobre fondos/superficies, texto sobre principal/secundario/acento/error, bordes de controles, anillo de foco).
- No transmitir información solo con color; etiquetas para lectores de pantalla; foco visible (anillo `focusRing` en web/teclado).
- Objetivos táctiles ≥ 48 × 48 dp; navegación comprensible para personas mayores.

## 5. Navegación

Barra inferior con 4 secciones, siempre con ícono y nombre: **Inicio** (dashboard), **Salud**, **Finanzas**, **Perfil** (datos, configuración, apariencia). La activa se marca con píldora de fondo y trazo más grueso además del color. En tableta/escritorio pasa a barra lateral. Evitar navegación profunda.

## 6. Componentes visuales

- **Tarjetas:** radio 16–20, sombras suaves, separación clara, sin bordes decorativos.
- **Botones:** radio 12–14, alto ≥ 48; variantes `primary`, `secondary`, `outline`, `ghost`, `destructive`; estados pressed, focus, loading, disabled con contraste accesible.
- **Formularios:** etiquetas visibles, errores comprensibles, validación contextual, espaciado suficiente.
- **Gráficas:** paleta consistente, unidades/fechas/cantidades visibles, resumen textual accesible, no depender solo del color, formatos según la región del usuario.
- **Animaciones:** 150–250 ms, discretas, respetar movimiento reducido.

## 7. Tokens semánticos de color

`primary`, `primaryPressed`, `onPrimary`, `primarySoft`, `secondary`, `secondaryPressed`, `onSecondary`, `accent`, `onAccent`, `background`, `surface`, `surfaceElevated`, `surfaceMuted`, `textPrimary`, `textSecondary`, `textDisabled`, `border`, `borderStrong`, `success`, `warning`, `error`, `onError`, `focusRing`, `shadow`.

## 8. Reglas de implementación

Antes de cambiar algo: analizar la estructura actual, reutilizar componentes, dependencias y convenciones; no introducir frameworks innecesarios; centralizar paletas y tokens; evitar regresiones; diseñar primero para móvil; priorizar rendimiento, legibilidad y mantenibilidad.
