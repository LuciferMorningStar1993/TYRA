import {
  ageFromBirthDate,
  basalMetabolicRate,
  bmi,
  bmiCategory,
  ACTIVITY_FACTORS,
  dailyEnergyExpenditure,
  GOAL_POLICY,
  healthSummary,
  HEALTH_AGE_POLICY,
  isAgeSupported,
  type HealthProfile,
} from './health';

describe('ageFromBirthDate', () => {
  const today = new Date(2026, 9, 24);

  it('cuenta el cumpleaños de este año si ya pasó', () => {
    expect(ageFromBirthDate(new Date(1993, 0, 15), today)).toBe(33);
  });

  it('resta un año si el cumpleaños aún no llega', () => {
    expect(ageFromBirthDate(new Date(1993, 11, 1), today)).toBe(32);
  });

  it('cumple años exactamente hoy', () => {
    expect(ageFromBirthDate(new Date(1993, 9, 24), today)).toBe(33);
  });
});

describe('bmi', () => {
  it('calcula con un decimal', () => {
    expect(bmi(80, 175)).toBe(26.1);
  });

  it.each([
    [18.4, 'underweight'],
    [18.5, 'normal'],
    [24.9, 'normal'],
    [25, 'overweight'],
    [29.9, 'overweight'],
    [30, 'obese'],
  ] as const)('%d → %s', (value, category) => {
    expect(bmiCategory(value)).toBe(category);
  });
});

describe('basalMetabolicRate (Mifflin-St Jeor)', () => {
  it('hombre', () => {
    // 10*80 + 6.25*175 - 5*33 + 5 = 1733.75
    expect(basalMetabolicRate({ sex: 'male', weightKg: 80, heightCm: 175, age: 33 })).toBe(1734);
  });

  it('mujer', () => {
    // 10*60 + 6.25*162 - 5*30 - 161 = 1301.5
    expect(basalMetabolicRate({ sex: 'female', weightKg: 60, heightCm: 162, age: 30 })).toBe(1302);
  });
});

describe('dailyEnergyExpenditure', () => {
  it('aplica el factor de actividad', () => {
    expect(dailyEnergyExpenditure(1734, 'moderate')).toBe(2688);
  });
});

const ADULT: Omit<HealthProfile, 'birthDate'> = {
  sex: 'male',
  heightCm: 175,
  weightKg: 80,
  activityLevel: 'moderate',
  goal: 'lose',
};
const TODAY = new Date(2026, 9, 24);
/** Fecha de nacimiento para cumplir exactamente `age` años hoy. */
const bornYearsAgo = (age: number) => new Date(2026 - age, 9, 24);
const summaryFor = (overrides: Partial<HealthProfile>, age = 33) =>
  healthSummary({ ...ADULT, birthDate: bornYearsAgo(age), ...overrides }, TODAY);

describe('healthSummary: adulto típico', () => {
  it('separa IMC, gasto estimado y meta según el objetivo', () => {
    expect(summaryFor({})).toEqual({
      age: 33,
      bmi: { available: true, value: 26.1, category: 'overweight' },
      expenditure: { available: true, bmr: 1734, tdee: 2688 },
      target: { available: true, goal: 'lose', kcal: 2188, adjustmentKcal: -500 },
    });
  });
});

describe('healthSummary: estimaciones inválidas', () => {
  it('caso reportado (mujer, 78 años, 50 cm, 20 kg, sedentaria, perder) no produce valores negativos', () => {
    const summary = summaryFor(
      { sex: 'female', heightCm: 50, weightKg: 20, activityLevel: 'sedentary', goal: 'lose' },
      78,
    );
    expect(summary.expenditure).toEqual({ available: false, reason: 'invalid_estimate' });
    expect(summary.target).toEqual({ available: false, reason: 'no_expenditure' });
  });

  // Todas las combinaciones de límites que admite public.profiles (y los extremos de edad con estimación).
  const grid: HealthProfile[] = [];
  for (const sex of ['male', 'female'] as const)
    for (const heightCm of [50, 260])
      for (const weightKg of [20, 400])
        for (const activityLevel of Object.keys(ACTIVITY_FACTORS) as HealthProfile['activityLevel'][])
          for (const goal of ['lose', 'maintain', 'gain'] as const)
            for (const age of [20, 78]) grid.push({ sex, heightCm, weightKg, activityLevel, goal, birthDate: bornYearsAgo(age) });

  it.each(grid.map((profile) => [profile]))('límites admitidos: nunca basal/gasto/meta negativos o no finitos (%#)', (profile) => {
    const { expenditure, target } = healthSummary(profile, TODAY);
    if (expenditure.available) {
      expect(Number.isFinite(expenditure.bmr) && expenditure.bmr > 0).toBe(true);
      expect(Number.isFinite(expenditure.tdee) && expenditure.tdee > 0).toBe(true);
    }
    if (target.available) {
      expect(Number.isFinite(target.kcal) && target.kcal > 0).toBe(true);
      expect(expenditure.available && target.kcal >= expenditure.bmr).toBe(true);
    }
  });
});

describe('healthSummary: política de objetivos (GOAL_POLICY)', () => {
  it('mantener: la meta es el gasto estimado, con cualquier IMC de adulto', () => {
    const summary = summaryFor({ goal: 'maintain', weightKg: 120 });
    expect(summary.bmi).toMatchObject({ category: 'obese' });
    expect(summary.target).toMatchObject({ available: true, adjustmentKcal: 0 });
    expect(summary.target.available && summary.expenditure.available && summary.target.kcal).toBe(
      summary.expenditure.available && summary.expenditure.tdee,
    );
  });

  it('bajar de peso con IMC saludable: no hay meta, pero sí gasto estimado', () => {
    const summary = summaryFor({ goal: 'lose', weightKg: 70 });
    expect(summary.bmi).toMatchObject({ category: 'normal' });
    expect(summary.expenditure.available).toBe(true);
    expect(summary.target).toEqual({ available: false, reason: 'goal_not_applicable' });
  });

  it('bajar de peso cuando el déficit quedaría bajo el basal: no hay meta', () => {
    // Sedentario: gasto = 1.2 × basal, así que basal + 20 % − 500 < basal cuando basal < 2500.
    const summary = summaryFor({ goal: 'lose', activityLevel: 'sedentary' });
    expect(summary.expenditure).toEqual({ available: true, bmr: 1734, tdee: 2081 });
    expect(summary.target).toEqual({ available: false, reason: 'below_basal' });
  });

  it('subir de peso con IMC < 25: superávit de 300', () => {
    const summary = summaryFor({ goal: 'gain', weightKg: 70 });
    expect(summary.target).toEqual({ available: true, goal: 'gain', kcal: 2833, adjustmentKcal: 300 });
  });

  it('subir de peso con sobrepeso u obesidad: no hay meta', () => {
    expect(summaryFor({ goal: 'gain', weightKg: 80 }).target).toEqual({
      available: false,
      reason: 'goal_not_applicable',
    });
  });

  it('documenta la política', () => {
    expect(GOAL_POLICY.lose).toEqual({ adjustmentKcal: -500, allowedBmi: ['overweight', 'obese'] });
    expect(GOAL_POLICY.gain).toEqual({ adjustmentKcal: 300, allowedBmi: ['underweight', 'normal'] });
  });
});

describe('healthSummary: política de edad', () => {
  it.each([13, 17, 19])('%i años: sin IMC de adulto, sin gasto ni meta', (age) => {
    const summary = summaryFor({}, age);
    expect(summary.age).toBe(age);
    expect(summary.bmi).toEqual({ available: false, reason: 'age_out_of_range' });
    expect(summary.expenditure).toEqual({ available: false, reason: 'age_out_of_range' });
    expect(summary.target).toEqual({ available: false, reason: 'no_expenditure' });
  });

  it('el día que cumple 20 se muestran los indicadores; un día antes no', () => {
    expect(summaryFor({}, 20).expenditure.available).toBe(true);
    const summary = healthSummary({ ...ADULT, birthDate: new Date(2006, 9, 25) }, TODAY);
    expect(summary.age).toBe(19);
    expect(summary.bmi.available).toBe(false);
    expect(summary.expenditure.available).toBe(false);
  });

  it('78 años: dentro del rango validado de Mifflin-St Jeor', () => {
    expect(summaryFor({}, 78).expenditure.available).toBe(true);
  });

  it('79 años: IMC sí; gasto y meta no', () => {
    const summary = summaryFor({}, 79);
    expect(summary.bmi.available).toBe(true);
    expect(summary.expenditure).toEqual({ available: false, reason: 'age_out_of_range' });
    expect(summary.target).toEqual({ available: false, reason: 'no_expenditure' });
  });

  it('rangos explícitos', () => {
    expect(HEALTH_AGE_POLICY).toEqual({
      bmiCategories: { minAge: 20, maxAge: null },
      energyEstimate: { minAge: 20, maxAge: 78 },
    });
    expect(isAgeSupported(19, HEALTH_AGE_POLICY.bmiCategories)).toBe(false);
    expect(isAgeSupported(95, HEALTH_AGE_POLICY.bmiCategories)).toBe(true);
  });
});
