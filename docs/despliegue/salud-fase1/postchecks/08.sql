-- 5. Tarea de retención y migraciones.
select jobname, schedule, command from cron.job where jobname = 'purge-weight-entry-audit';
