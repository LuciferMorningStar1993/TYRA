// Meta de peso personal y opcional: estados y cálculos, sin efectos.
// Solo describe el avance con mediciones reales. No calcula fechas de llegada, ritmos, déficits ni
// recomendaciones, y no cambia profiles.goal ni la meta calórica (GOAL_POLICY).
// Diseño: docs/propuestas/salud-peso-meta/propuesta.md (§4).

import { HEALTH_AGE_POLICY, isAgeSupported } from './health';
import { formatKg, validateWeightKg, type WeightEntry } from './weight';

export type WeightGoal = {
  /** Cambia con cada CREACIÓN: una operación de una meta eliminada nunca afecta a una nueva. */
  id: string;
  targetWeightKg: number;
  startWeightKg: number;
  startMeasuredOn: string;
  startEntryId: string | null;
  startEntryVersion: number;
  version: number;
  setAt: string;
  updatedAt: string;
};

export type GoalDirection = 'lose' | 'gain' | 'maintain';

/** Estado de la medición de partida respecto a la instantánea guardada. */
export type StartStatus = 'intact' | 'corrected' | 'deleted';

export type GoalProgress =
  | { status: 'not_eligible' }
  | { status: 'no_goal'; canSet: boolean }
  /** Hay meta, pero ninguna medición fechada (solo el peso heredado sin fecha, o nada). */
  | { status: 'no_measurements'; goal: WeightGoal }
  /** Se eliminaron la medición de partida y las posteriores: solo quedan anteriores. */
  | { status: 'only_earlier_measurements'; goal: WeightGoal; latest: WeightEntry }
  /** La vigente es del día de partida (la propia medición, aunque se corrigiera). */
  | { status: 'no_new_measurement'; goal: WeightGoal; latest: WeightEntry }
  | {
      status: 'reached' | 'away' | 'in_progress';
      goal: WeightGoal;
      latest: WeightEntry;
      direction: GoalDirection;
      /** C − S (kg, redondeado a 0.1). */
      changeKg: number;
      /** |T − C| (kg, redondeado a 0.1). */
      remainingKg: number;
      /** Avance entre 0 y 1; null en «mantener». */
      progress: number | null;
    };

const round1 = (value: number) => Math.round(value * 10) / 10;

export function isGoalEligible(age: number | null): boolean {
  return age !== null && isAgeSupported(age, HEALTH_AGE_POLICY.weightGoal);
}

export function goalDirection(startKg: number, targetKg: number): GoalDirection {
  const diff = round1(targetKg - startKg);
  if (diff < 0) return 'lose';
  if (diff > 0) return 'gain';
  return 'maintain';
}

export function startStatus(goal: WeightGoal, startEntry: WeightEntry | null): StartStatus {
  if (!goal.startEntryId || !startEntry || startEntry.id !== goal.startEntryId) return 'deleted';
  return startEntry.version > goal.startEntryVersion ? 'corrected' : 'intact';
}

/**
 * Estado del progreso, en orden de precedencia. El avance físico solo existe con una medición
 * fechada POSTERIOR al día de partida: corregir o eliminar la de partida nunca produce avance.
 */
export function goalProgress(input: {
  age: number | null;
  goal: WeightGoal | null;
  /** Medición FECHADA vigente más reciente (el heredado sin fecha no cuenta). */
  latestDated: WeightEntry | null;
}): GoalProgress {
  const { age, goal, latestDated } = input;
  if (!isGoalEligible(age)) return { status: 'not_eligible' };
  if (!goal) return { status: 'no_goal', canSet: latestDated !== null };
  if (!latestDated?.measuredOn) return { status: 'no_measurements', goal };
  if (latestDated.measuredOn < goal.startMeasuredOn) {
    return { status: 'only_earlier_measurements', goal, latest: latestDated };
  }
  if (latestDated.measuredOn === goal.startMeasuredOn) return { status: 'no_new_measurement', goal, latest: latestDated };

  const start = goal.startWeightKg;
  const target = goal.targetWeightKg;
  const current = latestDated.weightKg;
  const direction = goalDirection(start, target);
  const changeKg = round1(current - start);
  const remainingKg = round1(Math.abs(target - current));
  const base = { goal, latest: latestDated, direction, changeKg, remainingKg };

  if (direction === 'maintain') {
    return remainingKg === 0 ? { status: 'reached', ...base, progress: null } : { status: 'away', ...base, progress: null };
  }
  const reached = direction === 'lose' ? current <= target : current >= target;
  if (reached) return { status: 'reached', ...base, remainingKg: 0, progress: 1 };
  const movedAway = direction === 'lose' ? current > start : current < start;
  if (movedAway || changeKg === 0) {
    return { status: movedAway ? 'away' : 'in_progress', ...base, progress: 0 };
  }
  const progress = Math.min(1, Math.max(0, (start - current) / (start - target)));
  return { status: 'in_progress', ...base, progress };
}

export function validateGoalTarget(text: string): { targetKg: number | null; error?: string } {
  const { weightKg, error } = validateWeightKg(text);
  return error ? { targetKg: null, error: error.replace('tu peso', 'tu peso meta') } : { targetKg: weightKg };
}

/** Una línea para la tarjeta de Peso y el resumen accesible. */
export function describeGoalProgress(progress: GoalProgress): string | null {
  switch (progress.status) {
    case 'not_eligible':
      return null;
    case 'no_goal':
      return progress.canSet ? 'Sin meta de peso.' : null;
    case 'no_measurements':
      return `Meta ${formatKg(progress.goal.targetWeightKg)}. Registra una medición o confirma su fecha para ver tu avance.`;
    case 'only_earlier_measurements':
      return `Meta ${formatKg(progress.goal.targetWeightKg)}. Tus mediciones desde que fijaste la meta ya no existen; registra una nueva o reinicia el punto de partida.`;
    case 'no_new_measurement':
      return `Meta ${formatKg(progress.goal.targetWeightKg)} desde ${formatKg(progress.goal.startWeightKg)}. Registra una medición posterior para ver tu avance.`;
    case 'reached':
      return `Llegaste a tu meta de ${formatKg(progress.goal.targetWeightKg)}.`;
    case 'away': {
      if (progress.direction === 'maintain') {
        return `Meta ${formatKg(progress.goal.targetWeightKg)}. Diferencia con tu meta: ${progress.changeKg > 0 ? '+' : '−'}${formatKg(Math.abs(progress.changeKg))}.`;
      }
      const side = progress.changeKg > 0 ? 'por encima' : 'por debajo';
      return `Meta ${formatKg(progress.goal.targetWeightKg)}. Estás ${formatKg(Math.abs(progress.changeKg))} ${side} de tu punto de partida.`;
    }
    case 'in_progress': {
      const total = round1(Math.abs(progress.goal.startWeightKg - progress.goal.targetWeightKg));
      const done = round1(Math.abs(progress.changeKg));
      return `Meta ${formatKg(progress.goal.targetWeightKg)}: avanzaste ${formatKg(done)} de ${formatKg(total)}; te faltan ${formatKg(progress.remainingKg)}.`;
    }
  }
}
