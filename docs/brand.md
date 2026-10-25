# Identidad visual de TYRA

## Original y regla principal

- El original está en `assets/brand/source/tyra-growth-emblem-original.png` (1254×1254, sin transparencia). **No se edita.**
- Todo lo demás se genera con `./scripts/brand-assets.sh`, que usa ImageMagick 7 (`magick`). ImageMagick es una herramienta del sistema, no una dependencia del proyecto.
- El script solo recorta y separa el fondo. No redibuja, no simplifica y no cambia la geometría.
- La opacidad se calcula a partir del canal verde, para conservar el antialias de los bordes.
- Al recomponer la imagen sobre el fondo original, la diferencia con el original es de 0,57 % (RMSE).

## Assets

| Archivo | Qué es |
|---|---|
| `assets/brand/tyra-logo.png` (798×970) | Logo completo (emblema + «TYRA»), cian `#06F5FC`, fondo transparente |
| `assets/brand/tyra-emblem.png` (631×767) | Emblema solo, cian, fondo transparente |
| `assets/images/icon.png` (1024, opaco) | Icono general e iOS: emblema al 62 % del alto sobre `#0B1116` |
| `assets/images/android-icon-foreground.png` | Android adaptativo: emblema al 50 % del alto, dentro de la zona segura (radio máximo 250 de 313 px). El fondo es `backgroundColor: #0B1116` |
| `assets/images/android-icon-monochrome.png` | Icono temático de Android (blanco; el sistema lo tiñe) |
| `assets/images/splash-icon.png` | Logo completo; `imageWidth: 200` sobre `#0B1116` |
| `assets/images/favicon.png` (48) | Placa oscura redondeada con el emblema al 80 %. Se ve tanto en pestañas claras como oscuras |

## En la app: `TyraLogo`

`src/components/tyra-logo.tsx`. La lógica pura está en `src/design/brand.ts`.

- `variant`:
  - `emblem` (predeterminada).
  - `full`: a partir de `MIN_FULL_LOGO_HEIGHT` = 96 dp. Con menos alto se muestra el emblema, para que «TYRA» no quede diminuto.
- `height`: el ancho sale de la proporción original.
- Color según el tema:
  - **Temas oscuros:** cian original, con contraste ≥ 13:1.
  - **Temas claros:** la misma forma teñida con `textPrimary`, porque el cian contrasta solo 1,3:1 con esos fondos.
  - Los pares están probados en `src/__tests__/tyra-logo.test.tsx`.
- Accesibilidad:
  - Por defecto, el logo es una imagen con la etiqueta «TYRA».
  - Usa `decorative` si el nombre ya se lee al lado.
- Tamaños mínimos:
  - Emblema: se lee bien desde 24 dp. A 16 dp se conserva la silueta, pero se pierde el zigzag interior.
  - Por eso el favicon reduce el margen al mínimo.
