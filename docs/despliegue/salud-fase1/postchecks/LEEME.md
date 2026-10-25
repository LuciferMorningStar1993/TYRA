# postchecks

Comprobaciones POSTERIORES a la migración A en el Supabase remoto. SOLO LECTURA.

`supabase db query` ejecuta **una sentencia por archivo**; por eso cada comprobación está en su propio archivo, todas de solo lectura.

```bash
for f in docs/despliegue/salud-fase1/postchecks/*.sql; do echo "== $f"; supabase db query --linked -f "$f"; done
```
