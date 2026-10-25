# prechecks

Comprobaciones PREVIAS en el Supabase remoto de TYRA. SOLO LECTURA (únicamente SELECT).
Guardar la salida: los conteos se comparan con los de postchecks.sql.

`supabase db query` ejecuta **una sentencia por archivo**; por eso cada comprobación está en su propio archivo, todas de solo lectura. `run-checks.sh` las ejecuta en orden y **aborta** en el primer error (código distinto de 0, error de la base o una fila con `ok = false`).

```bash
bash docs/despliegue/salud-fase1/run-checks.sh docs/despliegue/salud-fase1/prechecks --linked
```
