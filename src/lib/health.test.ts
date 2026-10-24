import {
  ageFromBirthDate,
  basalMetabolicRate,
  bmi,
  bmiCategory,
  dailyCalorieTarget,
  dailyEnergyExpenditure,
  healthSummary,
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

describe('dailyCalorieTarget', () => {
  it('déficit para bajar de peso', () => {
    expect(dailyCalorieTarget(2688, 'lose', 'male')).toBe(2188);
  });

  it('superávit para subir', () => {
    expect(dailyCalorieTarget(2000, 'gain', 'female')).toBe(2300);
  });

  it('nunca baja del piso mínimo', () => {
    expect(dailyCalorieTarget(1500, 'lose', 'female')).toBe(1200);
    expect(dailyCalorieTarget(1800, 'lose', 'male')).toBe(1500);
  });
});

describe('healthSummary', () => {
  it('integra todos los indicadores', () => {
    const summary = healthSummary(
      {
        sex: 'male',
        birthDate: new Date(1993, 0, 15),
        heightCm: 175,
        weightKg: 80,
        activityLevel: 'moderate',
        goal: 'lose',
      },
      new Date(2026, 9, 24),
    );

    expect(summary).toEqual({
      age: 33,
      bmi: 26.1,
      bmiCategory: 'overweight',
      bmr: 1734,
      tdee: 2688,
      targetKcal: 2188,
    });
  });
});
