-- 4. Dependencias: función de updated_at y pg_cron disponible.
select to_regprocedure('public.set_updated_at()') as set_updated_at;
