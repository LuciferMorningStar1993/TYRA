-- 3. Los objetos nuevos aún no existen (si alguno existe, DETENERSE y revisar).
select
  to_regclass('public.weight_entries') as weight_entries,
  to_regclass('public.weight_entry_audit') as weight_entry_audit,
  to_regclass('public.weight_legacy_imports') as weight_legacy_imports,
  to_regclass('public.weight_legacy_client_writes') as weight_legacy_client_writes,
  to_regclass('public.weight_monthly_summaries') as weight_monthly_summaries,
  to_regprocedure('public.complete_onboarding(text,text,text,date,numeric,text,text,text,numeric,date)') as complete_onboarding;
