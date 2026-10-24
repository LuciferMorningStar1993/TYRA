// Indicadores de salud base a partir del perfil.
// BMR con la fórmula de Mifflin-St Jeor; gasto diario = BMR × factor de actividad.

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese';

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJUSTMENT_KCAL: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

// Piso de seguridad para no sugerir dietas demasiado agresivas.
const MIN_KCAL: Record<Sex, number> = {
  male: 1500,
  female: 1200,
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

export function dailyCalorieTarget(tdee: number, goal: Goal, sex: Sex): number {
  return Math.max(tdee + GOAL_ADJUSTMENT_KCAL[goal], MIN_KCAL[sex]);
}

export type HealthProfile = {
  sex: Sex;
  birthDate: Date;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
};

export type HealthSummary = {
  age: number;
  bmi: number;
  bmiCategory: BmiCategory;
  bmr: number;
  tdee: number;
  targetKcal: number;
};

export function healthSummary(profile: HealthProfile, today: Date = new Date()): HealthSummary {
  const age = ageFromBirthDate(profile.birthDate, today);
  const bmiValue = bmi(profile.weightKg, profile.heightCm);
  const bmr = basalMetabolicRate({
    sex: profile.sex,
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    age,
  });
  const tdee = dailyEnergyExpenditure(bmr, profile.activityLevel);
  return {
    age,
    bmi: bmiValue,
    bmiCategory: bmiCategory(bmiValue),
    bmr,
    tdee,
    targetKcal: dailyCalorieTarget(tdee, profile.goal, profile.sex),
  };
}
