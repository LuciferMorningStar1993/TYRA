import {
  onboardingErrorMessage,
  parseDecimal,
  submitOnboarding,
  validateHealthData,
  validateOnboarding,
  type OnboardingDraft,
} from './onboarding';
import type { CompleteOnboardingResult } from './weight-api';

const TODAY = new Date(2026, 9, 24, 12, 0, 0);

function draft(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    displayName: 'Ana',
    gender: 'female',
    sex: 'female',
    birthDate: new Date(1993, 4, 10),
    height: '165',
    weight: '62,5',
    activity: 'moderate',
    goal: 'maintain',
    palette: 'aurora',
    ...overrides,
  };
}

const COMPLETED: CompleteOnboardingResult = { status: 'completed' };
const MEASURED_ON = '2026-10-24';

describe('parseDecimal', () => {
  it('acepta coma o punto decimal', () => {
    expect(parseDecimal('62,5')).toBe(62.5);
    expect(parseDecimal(' 170 ')).toBe(170);
  });

  it('rechaza texto, negativos y vacío', () => {
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('-5')).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('1e3')).toBeNull();
  });
});

describe('validateOnboarding', () => {
  it('genera los datos para complete_onboarding con los valores normalizados', () => {
    const { errors, input } = validateOnboarding(draft({ displayName: '  Ana ' }), TODAY);
    expect(errors).toEqual({});
    expect(input).toEqual({
      displayName: 'Ana',
      gender: 'female',
      sex: 'female',
      birthDate: '1993-05-10',
      heightCm: 165,
      activityLevel: 'moderate',
      goal: 'maintain',
      themePalette: 'aurora',
      weightKg: 62.5,
    });
  });

  it('sin paso de apariencia envía null (la función conserva la paleta guardada)', () => {
    expect(validateOnboarding(draft({ palette: null }), TODAY).input?.themePalette).toBeNull();
  });

  it.each([
    ['hoy', new Date(2026, 9, 24), 'anterior a hoy'],
    ['futuro', new Date(2030, 0, 1), 'anterior a hoy'],
    ['antes de 1900-01-02', new Date(1900, 0, 1), 'año'],
    ['vacía', null, 'Elige'],
  ])('fecha %s es inválida', (_label, birthDate, message) => {
    const { errors, input } = validateOnboarding(draft({ birthDate }), TODAY);
    expect(input).toBeNull();
    expect(errors.birthDate).toMatch(message);
  });

  it.each([
    ['49', 'estatura'],
    ['261', 'estatura'],
  ])('estatura %s fuera del rango SQL', (height, message) => {
    expect(validateOnboarding(draft({ height }), TODAY).errors.height).toMatch(message);
  });

  it('acepta los límites exactos del SQL', () => {
    expect(validateOnboarding(draft({ height: '50', weight: '20' }), TODAY).errors).toEqual({});
    expect(validateOnboarding(draft({ height: '260', weight: '400' }), TODAY).errors).toEqual({});
  });

  it.each(['19.9', '400.1', 'x'])('peso %s inválido', (weight) => {
    expect(validateOnboarding(draft({ weight }), TODAY).errors.weight).toBeDefined();
  });

  it('marca todos los obligatorios vacíos', () => {
    const { errors } = validateOnboarding(
      draft({ displayName: ' ', sex: null, activity: null, goal: null, height: '', weight: '' }),
      TODAY,
    );
    expect(Object.keys(errors).sort()).toEqual(['activity', 'displayName', 'goal', 'height', 'sex', 'weight']);
  });
});

describe('submitOnboarding', () => {
  it('no llama al servidor si el formulario es inválido', async () => {
    const complete = jest.fn();
    const result = await submitOnboarding(draft({ height: '10' }), complete, MEASURED_ON, TODAY);
    expect(result.status).toBe('invalid');
    expect(complete).not.toHaveBeenCalled();
  });

  it('envía perfil y peso juntos con la fecha de medición recibida', async () => {
    const complete = jest.fn(async () => COMPLETED);
    await expect(submitOnboarding(draft(), complete, '2026-10-23', TODAY)).resolves.toEqual({ status: 'saved' });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ weightKg: 62.5, heightCm: 165, measuredOn: '2026-10-23' }));
  });

  it('guardado lento: no informa éxito hasta que el servidor confirma', async () => {
    let confirm!: (value: CompleteOnboardingResult) => void;
    const complete = jest.fn(() => new Promise<CompleteOnboardingResult>((resolve) => (confirm = resolve)));
    let settled = false;
    const pending = submitOnboarding(draft(), complete, MEASURED_ON, TODAY).then((result) => {
      settled = true;
      return result;
    });

    await Promise.resolve();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    confirm(COMPLETED);
    await expect(pending).resolves.toEqual({ status: 'saved' });
  });

  it('fallo del servidor: mensaje claro y reintento con la MISMA fecha de medición', async () => {
    const complete = jest
      .fn<Promise<CompleteOnboardingResult>, [unknown]>()
      .mockResolvedValueOnce({ status: 'error', reason: 'other', message: 'Network request failed' })
      .mockResolvedValueOnce(COMPLETED);

    const first = await submitOnboarding(draft(), complete, MEASURED_ON, TODAY);
    expect(first).toEqual({ status: 'failed', reason: 'other', message: expect.stringMatching(/conexión/) });

    const nextDay = new Date(2026, 9, 25, 0, 30);
    const retry = await submitOnboarding(draft(), complete, MEASURED_ON, nextDay);
    expect(retry).toEqual({ status: 'saved' });
    expect(complete).toHaveBeenLastCalledWith(expect.objectContaining({ measuredOn: MEASURED_ON }));
  });

  it('ya completado (respuesta perdida u otro dispositivo) también es éxito', async () => {
    const result = await submitOnboarding(draft(), async () => ({ status: 'already_completed' }), MEASURED_ON, TODAY);
    expect(result).toEqual({ status: 'saved' });
  });

  it.each([
    ['weight_day_conflict', /otro peso registrado/],
    ['invalid_measured_on', /Confirma tu peso de hoy/],
    ['missing_field', /Faltan datos obligatorios/],
    ['out_of_range', /fuera de rango/],
    ['no_session', /sesión expiró/],
  ] as const)('%s: nunca se reporta como éxito y explica el motivo', async (reason, message) => {
    const result = await submitOnboarding(draft(), async () => ({ status: 'error', reason, message: reason }), MEASURED_ON, TODAY);
    expect(result).toEqual({ status: 'failed', reason, message: onboardingErrorMessage(reason) });
    expect(onboardingErrorMessage(reason)).toMatch(message);
  });
});

describe('validateHealthData (pantalla «Datos de salud»)', () => {
  it('genera el patch sin peso', () => {
    expect(validateHealthData({ height: '170,5', activity: 'light', goal: 'lose' })).toEqual({
      errors: {},
      patch: { height_cm: 170.5, activity_level: 'light', goal: 'lose' },
    });
  });

  it('marca estatura fuera de rango y opciones vacías', () => {
    const { errors, patch } = validateHealthData({ height: '300', activity: null, goal: null });
    expect(patch).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['activity', 'goal', 'height']);
  });
});
