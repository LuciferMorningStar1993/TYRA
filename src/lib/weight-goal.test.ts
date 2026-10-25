import type { WeightEntry } from './weight';
import {
  describeGoalProgress,
  goalDirection,
  goalProgress,
  isGoalEligible,
  startStatus,
  validateGoalTarget,
  type WeightGoal,
} from './weight-goal';

function entry(measuredOn: string, weightKg: number, overrides: Partial<WeightEntry> = {}): WeightEntry {
  return {
    id: `e-${measuredOn}`,
    measuredOn,
    weightKg,
    origin: 'manual',
    version: 1,
    createdAt: `${measuredOn}T12:00:00Z`,
    updatedAt: `${measuredOn}T12:00:00Z`,
    ...overrides,
  };
}

function goal(overrides: Partial<WeightGoal> = {}): WeightGoal {
  return {
    id: 'g1',
    targetWeightKg: 68,
    startWeightKg: 72,
    startMeasuredOn: '2026-10-10',
    startEntryId: 'e-2026-10-10',
    startEntryVersion: 1,
    version: 1,
    setAt: '2026-10-10T12:00:00Z',
    updatedAt: '2026-10-10T12:00:00Z',
    ...overrides,
  };
}

const ADULT = 36;

describe('elegibilidad (política de producto: desde 20 años)', () => {
  it.each([
    [19, false],
    [20, true],
    [null, false],
  ])('edad %s → %s', (age, eligible) => {
    expect(isGoalEligible(age)).toBe(eligible);
  });

  it('no elegible: sin cálculos aunque haya meta', () => {
    expect(goalProgress({ age: 19, goal: goal(), latestDated: entry('2026-10-20', 70) })).toEqual({ status: 'not_eligible' });
  });
});

describe('estados en orden de precedencia', () => {
  it('sin meta: se puede fijar solo con una medición fechada', () => {
    expect(goalProgress({ age: ADULT, goal: null, latestDated: entry('2026-10-20', 70) })).toEqual({ status: 'no_goal', canSet: true });
    expect(goalProgress({ age: ADULT, goal: null, latestDated: null })).toEqual({ status: 'no_goal', canSet: false });
  });

  it('meta sin mediciones fechadas (solo heredado o nada): sin avance', () => {
    expect(goalProgress({ age: ADULT, goal: goal(), latestDated: null }).status).toBe('no_measurements');
  });

  it('solo quedan mediciones anteriores al punto de partida: sin avance', () => {
    const progress = goalProgress({ age: ADULT, goal: goal(), latestDated: entry('2026-10-01', 73) });
    expect(progress.status).toBe('only_earlier_measurements');
    expect(progress).not.toHaveProperty('progress');
  });

  it('partida corregida y vigente = la de partida: sin avance (la corrección no es un cambio físico)', () => {
    const corrected = entry('2026-10-10', 70.5, { version: 2 });
    const progress = goalProgress({ age: ADULT, goal: goal(), latestDated: corrected });
    expect(progress.status).toBe('no_new_measurement');
    expect(progress).not.toHaveProperty('progress');
    expect(startStatus(goal(), corrected)).toBe('corrected');
  });

  it('nueva medición el mismo día tras eliminar la de partida: sin avance', () => {
    const sameDay = entry('2026-10-10', 70, { id: 'otra' });
    expect(goalProgress({ age: ADULT, goal: goal({ startEntryId: null }), latestDated: sameDay }).status).toBe('no_new_measurement');
    expect(startStatus(goal({ startEntryId: null }), null)).toBe('deleted');
  });

  it('partida eliminada y una medición posterior: avance desde la instantánea', () => {
    const progress = goalProgress({ age: ADULT, goal: goal({ startEntryId: null }), latestDated: entry('2026-10-20', 70) });
    expect(progress).toMatchObject({ status: 'in_progress', changeKg: -2, remainingKg: 2, progress: 0.5, direction: 'lose' });
  });

  it('partida intacta', () => {
    expect(startStatus(goal(), entry('2026-10-10', 72))).toBe('intact');
  });
});

describe('fórmulas', () => {
  it('meta alcanzada (bajar): avance 1, nada por recorrer', () => {
    expect(goalProgress({ age: ADULT, goal: goal(), latestDated: entry('2026-10-20', 67.5) })).toMatchObject({
      status: 'reached',
      progress: 1,
      remainingKg: 0,
    });
  });

  it('alejándose: avance 0, nunca negativo', () => {
    const progress = goalProgress({ age: ADULT, goal: goal(), latestDated: entry('2026-10-20', 73.2) });
    expect(progress).toMatchObject({ status: 'away', progress: 0, changeKg: 1.2 });
    expect(describeGoalProgress(progress)).toMatch(/1\.2 kg por encima de tu punto de partida/);
  });

  it('subir de peso: avance proporcional y limitado a 1', () => {
    const gain = goal({ startWeightKg: 55, targetWeightKg: 60 });
    expect(goalProgress({ age: ADULT, goal: gain, latestDated: entry('2026-10-20', 57) })).toMatchObject({
      status: 'in_progress',
      direction: 'gain',
      progress: 0.4,
    });
    expect(goalProgress({ age: ADULT, goal: gain, latestDated: entry('2026-10-20', 61) })).toMatchObject({ status: 'reached', progress: 1 });
  });

  it('mantener: sin porcentaje; diferencia con signo y palabras', () => {
    const keep = goal({ startWeightKg: 70, targetWeightKg: 70 });
    expect(goalProgress({ age: ADULT, goal: keep, latestDated: entry('2026-10-20', 70) })).toMatchObject({ status: 'reached', progress: null });
    const away = goalProgress({ age: ADULT, goal: keep, latestDated: entry('2026-10-20', 70.6) });
    expect(away).toMatchObject({ status: 'away', progress: null, direction: 'maintain' });
    expect(describeGoalProgress(away)).toMatch(/Diferencia con tu meta: \+0\.6 kg/);
  });

  it('redondeo a 0.1 kg y texto de avance', () => {
    const progress = goalProgress({ age: ADULT, goal: goal(), latestDated: entry('2026-10-20', 70.84) });
    expect(progress).toMatchObject({ changeKg: -1.2, remainingKg: 2.8 });
    expect(describeGoalProgress(progress)).toBe('Meta 68 kg: avanzaste 1.2 kg de 4 kg; te faltan 2.8 kg.');
  });

  it('dirección al décimo', () => {
    expect(goalDirection(70, 69.96)).toBe('maintain');
    expect(goalDirection(70, 69.8)).toBe('lose');
    expect(goalDirection(70, 70.2)).toBe('gain');
  });

  it('valida la meta con el mismo rango que las mediciones', () => {
    expect(validateGoalTarget('68,5')).toEqual({ targetKg: 68.5 });
    expect(validateGoalTarget('500').error).toMatch(/entre 20 y 400/);
    expect(validateGoalTarget('x').error).toMatch(/peso meta/);
  });
});
