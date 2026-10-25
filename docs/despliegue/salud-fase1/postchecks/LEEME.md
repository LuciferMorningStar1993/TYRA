# postchecks

Comprobaciones POSTERIORES a la migración A en el Supabase remoto. SOLO LECTURA.

`supabase db query` ejecuta **una sentencia por archivo**; por eso cada comprobación está en su propio archivo, todas de solo lectura. `run-checks.sh` las ejecuta en orden y **aborta** en el primer error (código distinto de 0, error de la base o una fila con `ok = false`).

```bash
bash docs/despliegue/salud-fase1/run-checks.sh docs/despliegue/salud-fase1/postchecks --linked
```
