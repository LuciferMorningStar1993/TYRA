import { healthSummary, type HealthSummary } from '@/lib/health';
import { toHealthProfile } from '@/lib/profile';
import type { CurrentWeight } from '@/lib/weight';
import { useSession } from '@/providers/session-provider';
import { useWeight } from '@/providers/weight-provider';

export type HealthSummaryState =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => Promise<void> }
  /** Sin mediciones: no se calcula nada con datos faltantes. */
  | { status: 'no_weight' }
  /** Faltan datos del perfil (no debería ocurrir tras el onboarding). */
  | { status: 'incomplete' }
  | { status: 'ready'; summary: HealthSummary; weight: NonNullable<CurrentWeight> };

/** Resumen de salud con el perfil y el peso vigente (weight_entries). Inicio y Salud usan el mismo. */
export function useHealthSummary(): HealthSummaryState {
  const { profile } = useSession();
  const { state, current, reload } = useWeight();
  if (!profile || state.status === 'loading') return { status: 'loading' };
  if (state.status === 'error') return { status: 'error', message: state.message, retry: reload };
  if (!current) return { status: 'no_weight' };
  const healthProfile = toHealthProfile(profile, current.entry.weightKg);
  if (!healthProfile) return { status: 'incomplete' };
  return { status: 'ready', summary: healthSummary(healthProfile), weight: current };
}
