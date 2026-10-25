import { ageFromBirthDate } from '@/lib/health';
import { parseDateOnly } from '@/lib/profile';
import { goalProgress, startStatus, type GoalProgress, type StartStatus } from '@/lib/weight-goal';
import { useSession } from '@/providers/session-provider';
import { useWeight } from '@/providers/weight-provider';

export type WeightGoalState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; progress: GoalProgress; start: StartStatus | null; age: number | null };

/** Meta de peso con su estado de progreso y el de la medición de partida. */
export function useWeightGoal(): WeightGoalState {
  const { profile } = useSession();
  const { state } = useWeight();
  if (!profile || state.status === 'loading') return { status: 'loading' };
  if (state.status === 'error') return { status: 'error' };
  const age = profile.birth_date ? ageFromBirthDate(parseDateOnly(profile.birth_date)) : null;
  const { goal, goalStartEntry, recent } = state.overview;
  return {
    status: 'ready',
    progress: goalProgress({ age, goal, latestDated: recent[0] ?? null }),
    start: goal ? startStatus(goal, goalStartEntry) : null,
    age,
  };
}
