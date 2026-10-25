# postchecks (meta de peso)

Comprobaciones de SOLO LECTURA de `weight_goals` y `set_weight_goal`, una sentencia por archivo.
`run-checks.sh` aborta ante el primer error o fila con `ok = false`.

```bash
bash docs/despliegue/salud-fase1/run-checks.sh docs/despliegue/salud-meta/postchecks --local
```

En remoto (`--linked`) solo después de aplicar la migración con aprobación aparte.
