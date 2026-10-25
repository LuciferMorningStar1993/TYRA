#!/usr/bin/env bash
# Genera los assets de marca de TYRA a partir del original (assets/brand/source/). Ver docs/brand.md.
# Solo recorta y separa el fondo: no redibuja ni simplifica el símbolo. Requiere ImageMagick 7
# (`magick`, herramienta del sistema; no es dependencia del proyecto).
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="assets/brand/source/tyra-growth-emblem-original.png"
OUT_BRAND="assets/brand"
OUT_IMAGES="assets/images"
CYAN="#06F5FC" # cian del original (color dominante del símbolo)
BG="#0B1116"   # fondo oscuro del original
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v magick >/dev/null || { echo "Falta ImageMagick 7 (brew install imagemagick)" >&2; exit 1; }

# 1. Opacidad desde el canal verde: fondo (G≈16.84) → 0, cian (G≈244.88) → 1. Conserva el
#    antialias de los bordes. El ruido del fondo (< 4 %) se lleva a 0.
magick "$SRC" -channel G -separate +channel \
  -fx "max(0,min(1,(u*255-16.84)/(244.88-16.84)))" -black-threshold 4% "$TMP/mask.png"

# 2. Recortes (cajas medidas sobre el original 1254×1254) con margen mínimo.
magick "$TMP/mask.png" -crop 766x938+245+146 +repage -bordercolor black -border 16 "$TMP/m-logo.png"
magick "$TMP/mask.png" -crop 607x743+323+146 +repage -bordercolor black -border 12 "$TMP/m-emblem.png"

tint() { # máscara, color, salida
  magick -size "$(magick "$1" -format %wx%h info:)" xc:"$2" "$1" -alpha off -compose CopyOpacity -composite "$3"
}
tint "$TMP/m-logo.png" "$CYAN" "$OUT_BRAND/tyra-logo.png"     # logo completo, fondo transparente
tint "$TMP/m-emblem.png" "$CYAN" "$OUT_BRAND/tyra-emblem.png" # emblema, fondo transparente

E="$OUT_BRAND/tyra-emblem.png"

# 3. Icono general / iOS: opaco (iOS no admite transparencia), emblema al 62 % del alto.
magick -size 1024x1024 xc:"$BG" \( "$E" -resize x636 \) -gravity center -composite \
  -alpha off "$OUT_IMAGES/icon.png"

# 4. Android adaptativo (108 dp; zona segura = círculo de 66 dp): emblema al 50 % del alto,
#    todo el trazo queda dentro del círculo seguro. Fondo con backgroundColor en app.json.
magick -size 1024x1024 xc:none \( "$E" -resize x512 \) -gravity center -composite \
  "$OUT_IMAGES/android-icon-foreground.png"
magick -size 1024x1024 xc:none \( "$TMP/m-emblem.png" -resize x512 -background white -alpha shape \) \
  -gravity center -composite "$OUT_IMAGES/android-icon-monochrome.png"

# 5. Splash: logo completo transparente sobre BG (backgroundColor en app.json).
cp "$OUT_BRAND/tyra-logo.png" "$OUT_IMAGES/splash-icon.png"

# 6. Favicon 48×48: placa oscura redondeada (se ve en pestañas claras y oscuras) y emblema al 80 %.
magick -size 192x192 xc:none -fill "$BG" -draw "roundrectangle 0,0 191,191 36,36" \
  \( "$E" -resize x154 \) -gravity center -composite -resize 48x48 "$OUT_IMAGES/favicon.png"

echo "Assets de marca generados en $OUT_BRAND y $OUT_IMAGES"
