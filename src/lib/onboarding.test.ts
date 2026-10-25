import {
  parseDecimal,
  saveErrorMessage,
  submitOnboarding,
  validateOnboarding,
  type OnboardingDraft,
} from './onboarding';
import type { SaveProfileResult } from './profile-api';

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

const SAVED: SaveProfileResult = { ok: true, profile: { id: 'user-a' } as never };

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
  it('genera el patch con los valores normalizados', () => {
    const { errors, patch } = validateOnboarding(draft(), TODAY);
    expect(errors).toEqual({});
    expect(patch).toMatchObject({
      display_name: 'Ana',
      birth_date: '1993-05-10',
      height_cm: 165,
      weight_kg: 62.5,
      theme_palette: 'aurora',
      onboarded_at: TODAY.toISOString(),
    });
  });

  it('no envía paleta si el onboarding no tenía paso de apariencia', () => {
    const { patch } = validateOnboarding(draft({ palette: null }), TODAY);
    expect(patch).not.toHaveProperty('theme_palette');
  });

  it.each([
    ['hoy', new Date(2026, 9, 24), 'anterior a hoy'],
    ['futuro', new Date(2030, 0, 1), 'anterior a hoy'],
    ['antes de 1900-01-02', new Date(1900, 0, 1), 'año'],
    ['vacía', null, 'Elige'],
  ])('fecha %s es inválida', (_label, birthDate, message) => {
    const { errors, patch } = validateOnboarding(draft({ birthDate }), TODAY);
    expect(patch).toBeNull();
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
    const save = jest.fn();
    const result = await submitOnboarding(draft({ height: '10' }), save, TODAY);
    expect(result.status).toBe('invalid');
    expect(save).not.toHaveBeenCalled();
  });

  it('guardado lento: no informa éxito hasta que el servidor confirma', async () => {
    let confirm!: (value: SaveProfileResult) => void;
    const save = jest.fn(() => new Promise<SaveProfileResult>((resolve) => (confirm = resolve)));
    let settled = false;
    const pending = submitOnboarding(draft(), save, TODAY).then((result) => {
      settled = true;
      return result;
    });

    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    confirm(SAVED);
    await expect(pending).resolves.toEqual({ status: 'saved' });
  });

  it('fallo del servidor: devuelve un mensaje y permite reintentar', async () => {
    const save = jest
      .fn<Promise<SaveProfileResult>, []>()
      .mockResolvedValueOnce({ ok: false, error: 'Network request failed' })
      .mockResolvedValueOnce(SAVED);

    const first = await submitOnboarding(draft(), save, TODAY);
    expect(first).toEqual({ status: 'failed', message: expect.stringMatching(/conexión/) });

    const retry = await submitOnboarding(draft(), save, TODAY);
    expect(retry).toEqual({ status: 'saved' });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('update sin fila o sin sesión nunca se reporta como éxito', async () => {
    for (const error of ['no_row', 'no_session']) {
      const result = await submitOnboarding(draft(), async () => ({ ok: false, error }), TODAY);
      expect(result).toEqual({ status: 'failed', message: saveErrorMessage(error) });
    }
  });
});
