// Indicadores de salud base a partir del perfil.
// BMR con la fórmula de Mifflin-St Jeor; gasto diario = BMR × factor de actividad.
// Son estimaciones orientativas para adultos: no sustituyen la valoración de un profesional.
//
// Se distinguen tres resultados, cada uno con su propia disponibilidad:
// 1. IMC (valor + categoría de adulto).
// 2. Estimación de gasto energético (basal y diario): describe, no recomienda.
// 3. Meta calórica según el objetivo: es una recomendación y solo se ofrece cuando aplica.

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese';

/**
 * Rango de edad (en años cumplidos, inclusivo) en el que mostramos cada indicador.
 * - IMC con categorías de adulto: desde 20 años. De 2 a 19 años el IMC se interpreta con
 *   percentiles por edad y sexo (OMS/CDC), que TYRA todavía no implementa.
 * - Estimación de energía (Mifflin-St Jeor): la fórmula se validó en adultos de 19 a 78 años;
 *   usamos 20 como mínimo para tener un solo umbral de adulto en la app.
 */
export const HEALTH_AGE_POLICY = {
  bmiCategories: { minAge: 20, maxAge: null },
  energyEstimate: { minAge: 20, maxAge: 78 },
} as const;

/**
 * Cuándo se ofrece una meta automática según el objetivo:
 * - maintain: la meta es el gasto estimado (no hay ajuste).
 * - lose: déficit de 500 kcal solo con IMC de adulto ≥ 25 (sobrepeso u obesidad), y solo si la
 *   meta resultante no queda por debajo del gasto basal estimado. Si quedaría por debajo, no
 *   calculamos una meta automática: requiere un plan individual.
 * - gain: superávit de 300 kcal solo con IMC de adulto < 25 (bajo peso o saludable).
 * Fuera de estos casos se muestra el gasto estimado, pero no una meta.
 */
export const GOAL_POLICY = {
  lose: { adjustmentKcal: -500, allowedBmi: ['overweight', 'obese'] },
  maintain: { adjustmentKcal: 0, allowedBmi: ['underweight', 'normal', 'overweight', 'obese'] },
  gain: { adjustmentKcal: 300, allowedBmi: ['underweight', 'normal'] },
} as const satisfies Record<Goal, { adjustmentKcal: number; allowedBmi: readonly BmiCategory[] }>;

type AgeRange = { minAge: number; maxAge: number | null };

export function isAgeSupported(age: number, range: AgeRange): boolean {
  return age >= range.minAge && (range.maxAge === null || age <= range.maxAge);
}

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function ageFromBirthDate(birthDate: Date, today: Date = new Date()): number {
  let age = today.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function bmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

/** Categorías de IMC de adulto (OMS). Solo válidas dentro de HEALTH_AGE_POLICY.bmiCategories. */
export function bmiCategory(value: number): BmiCategory {
  if (value < 18.5) return 'underweight';
  if (value < 25) return 'normal';
  if (value < 30) return 'overweight';
  return 'obese';
}

export function basalMetabolicRate(params: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}): number {
  const { sex, weightKg, heightCm, age } = params;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

export function dailyEnergyExpenditure(bmr: number, activity: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_FACTORS[activity]);
}

export type HealthProfile = {
  sex: Sex;
  birthDate: Date;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
};

type Unavailable<Reason extends string> = { available: false; reason: Reason };

export type BmiResult =
  | { available: true; value: number; category: BmiCategory }
  | Unavailable<'age_out_of_range' | 'invalid_input'>;

export type ExpenditureResult =
  | { available: true; bmr: number; tdee: number }
  /** invalid_estimate: la fórmula da un valor no positivo o no finito con estos datos. */
  | Unavailable<'age_out_of_range' | 'invalid_estimate'>;

export type TargetResult =
  | { available: true; goal: Goal; kcal: number; adjustmentKcal: number }
  | Unavailable<'no_expenditure' | 'no_bmi' | 'goal_not_applicable' | 'below_basal'>;

export type HealthSummary = {
  age: number;
  bmi: BmiResult;
  expenditure: ExpenditureResult;
  target: TargetResult;
};

const isPositiveNumber = (value: number) => Number.isFinite(value) && value > 0;

export function bmiResult(profile: HealthProfile, age: number): BmiResult {
  if (!isAgeSupported(age, HEALTH_AGE_POLICY.bmiCategories)) return { available: false, reason: 'age_out_of_range' };
  const value = bmi(profile.weightKg, profile.heightCm);
  if (!isPositiveNumber(value)) return { available: false, reason: 'invalid_input' };
  return { available: true, value, category: bmiCategory(value) };
}

export function expenditureResult(profile: HealthProfile, age: number): ExpenditureResult {
  if (!isAgeSupported(age, HEALTH_AGE_POLICY.energyEstimate)) return { available: false, reason: 'age_out_of_range' };
  const bmr = basalMetabolicRate({ sex: profile.sex, weightKg: profile.weightKg, heightCm: profile.heightCm, age });
  const tdee = dailyEnergyExpenditure(bmr, profile.activityLevel);
  if (!isPositiveNumber(bmr) || !isPositiveNumber(tdee)) return { available: false, reason: 'invalid_estimate' };
  return { available: true, bmr, tdee };
}

export function targetResult(goal: Goal, bmiInfo: BmiResult, expenditure: ExpenditureResult): TargetResult {
  if (!expenditure.available) return { available: false, reason: 'no_expenditure' };
  if (!bmiInfo.available) return { available: false, reason: 'no_bmi' };
  const policy = GOAL_POLICY[goal];
  if (!(policy.allowedBmi as readonly BmiCategory[]).includes(bmiInfo.category)) {
    return { available: false, reason: 'goal_not_applicable' };
  }
  const kcal = expenditure.tdee + policy.adjustmentKcal;
  if (!isPositiveNumber(kcal) || kcal < expenditure.bmr) return { available: false, reason: 'below_basal' };
  return { available: true, goal, kcal, adjustmentKcal: policy.adjustmentKcal };
}

export function healthSummary(profile: HealthProfile, today: Date = new Date()): HealthSummary {
  const age = ageFromBirthDate(profile.birthDate, today);
  const bmiInfo = bmiResult(profile, age);
  const expenditure = expenditureResult(profile, age);
  return { age, bmi: bmiInfo, expenditure, target: targetResult(profile.goal, bmiInfo, expenditure) };
}
