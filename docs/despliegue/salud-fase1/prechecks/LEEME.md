# prechecks

Comprobaciones PREVIAS en el Supabase remoto de TYRA. SOLO LECTURA (únicamente SELECT).
Guardar la salida: los conteos se comparan con los de postchecks.sql.

`supabase db query` ejecuta **una sentencia por archivo**; por eso cada comprobación está en su propio archivo, todas de solo lectura.

```bash
for f in docs/despliegue/salud-fase1/prechecks/*.sql; do echo "== $f"; supabase db query --linked -f "$f"; done
```
