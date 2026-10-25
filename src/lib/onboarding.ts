// Validación y envío del onboarding. Las reglas replican las restricciones SQL de
// public.profiles y public.weight_entries para dar errores claros antes de llegar al servidor.
// El envío usa complete_onboarding: perfil + primera medición de peso en una sola transacción.

import type { Gender, PaletteId } from '@/design/palettes';

import type { ActivityLevel, Goal, Sex } from './health';
import { formatDateOnly } from './profile';
import type { CompleteOnboardingResult, OnboardingErrorReason, OnboardingInput } from './weight-api';

export const HEIGHT_RANGE_CM = { min: 50, max: 260 } as const;
export const WEIGHT_RANGE_KG = { min: 20, max: 400 } as const;
/** SQL: birth_date > '1900-01-01' and birth_date < current_date. */
export const MIN_BIRTH_DATE = new Date(1900, 0, 2);

export type OnboardingDraft = {
  displayName: string;
  gender: Gender | null;
  sex: Sex | null;
  birthDate: Date | null;
  height: string;
  weight: string;
  activity: ActivityLevel | null;
  goal: Goal | null;
  /** Solo se envía si el onboarding incluye el paso de apariencia. */
  palette: PaletteId | null;
};

export type OnboardingField = 'displayName' | 'sex' | 'birthDate' | 'height' | 'weight' | 'activity' | 'goal';
export type OnboardingErrors = Partial<Record<OnboardingField, string>>;

export function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function validateHeightCm(text: string): { heightCm: number | null; error?: string } {
  const heightCm = parseDecimal(text);
  if (heightCm === null) return { heightCm: null, error: 'Escribe tu estatura en centímetros, por ejemplo 170.' };
  if (heightCm < HEIGHT_RANGE_CM.min || heightCm > HEIGHT_RANGE_CM.max) {
    return { heightCm: null, error: `La estatura debe estar entre ${HEIGHT_RANGE_CM.min} y ${HEIGHT_RANGE_CM.max} cm.` };
  }
  return { heightCm };
}

/** Estatura, actividad y objetivo (pantalla «Datos de salud»), con las mismas reglas del onboarding. */
export function validateHealthData(input: { height: string; activity: ActivityLevel | null; goal: Goal | null }): {
  errors: Partial<Record<'height' | 'activity' | 'goal', string>>;
  patch: { height_cm: number; activity_level: ActivityLevel; goal: Goal } | null;
} {
  const errors: Partial<Record<'height' | 'activity' | 'goal', string>> = {};
  const { heightCm, error } = validateHeightCm(input.height);
  if (error) errors.height = error;
  if (!input.activity) errors.activity = 'Elige tu nivel de actividad.';
  if (!input.goal) errors.goal = 'Elige una meta.';
  if (heightCm === null || !input.activity || !input.goal) return { errors, patch: null };
  return { errors, patch: { height_cm: heightCm, activity_level: input.activity, goal: input.goal } };
}

/** Datos validados para complete_onboarding (la fecha de la medición la aporta quien envía). */
export type ValidOnboarding = Omit<OnboardingInput, 'measuredOn'>;

export function validateOnboarding(
  draft: OnboardingDraft,
  today: Date = new Date(),
): { errors: OnboardingErrors; input: ValidOnboarding | null } {
  const errors: OnboardingErrors = {};

  if (!draft.displayName.trim()) errors.displayName = 'Escribe cómo te llamamos.';
  if (!draft.sex) errors.sex = 'Elige una opción para el cálculo metabólico.';
  if (!draft.activity) errors.activity = 'Elige tu nivel de actividad.';
  if (!draft.goal) errors.goal = 'Elige una meta.';

  if (!draft.birthDate || Number.isNaN(draft.birthDate.getTime())) {
    errors.birthDate = 'Elige tu fecha de nacimiento.';
  } else if (startOfDay(draft.birthDate) >= startOfDay(today)) {
    errors.birthDate = 'La fecha debe ser anterior a hoy.';
  } else if (startOfDay(draft.birthDate) < MIN_BIRTH_DATE) {
    errors.birthDate = 'Revisa el año de nacimiento.';
  }

  const { heightCm, error: heightError } = validateHeightCm(draft.height);
  if (heightError) errors.height = heightError;

  const weightKg = parseDecimal(draft.weight);
  if (weightKg === null) {
    errors.weight = 'Escribe tu peso en kilogramos, por ejemplo 70.5.';
  } else if (weightKg < WEIGHT_RANGE_KG.min || weightKg > WEIGHT_RANGE_KG.max) {
    errors.weight = `El peso debe estar entre ${WEIGHT_RANGE_KG.min} y ${WEIGHT_RANGE_KG.max} kg.`;
  }

  if (
    Object.keys(errors).length > 0 ||
    !draft.birthDate ||
    !draft.sex ||
    !draft.activity ||
    !draft.goal ||
    heightCm === null ||
    weightKg === null
  ) {
    return { errors, input: null };
  }

  return {
    errors,
    input: {
      displayName: draft.displayName.trim(),
      gender: draft.gender,
      sex: draft.sex,
      birthDate: formatDateOnly(draft.birthDate),
      heightCm,
      activityLevel: draft.activity,
      goal: draft.goal,
      // Sin paso de apariencia se conserva la paleta guardada (la función usa coalesce).
      themePalette: draft.palette,
      weightKg,
    },
  };
}

export type SubmitOnboardingResult =
  | { status: 'invalid'; errors: OnboardingErrors }
  | { status: 'failed'; reason: OnboardingErrorReason; message: string }
  | { status: 'saved' };

/** Mensaje comprensible para cada fallo de complete_onboarding. */
export function onboardingErrorMessage(reason: OnboardingErrorReason): string {
  switch (reason) {
    case 'weight_day_conflict':
      return 'Ya hay otro peso registrado para ese día. Revisa tu peso y vuelve a guardar.';
    case 'invalid_measured_on':
      return 'Pasaron varios días desde que empezaste. Confirma tu peso de hoy y vuelve a guardar.';
    case 'missing_field':
      return 'Faltan datos obligatorios. Revisa el formulario.';
    case 'out_of_range':
      return 'Algún dato está fuera de rango. Revisa estatura, peso y fecha.';
    case 'no_session':
      return 'Tu sesión expiró. Vuelve a iniciar sesión para guardar.';
    default:
      return 'No pudimos guardar tus datos. Revisa tu conexión e inténtalo de nuevo.';
  }
}

/**
 * Valida y guarda perfil + primera medición en una transacción. `measuredOn` se fija en el
 * primer intento y se reutiliza en los reintentos (aunque ya sea otro día): así un reintento
 * después de medianoche no crea un segundo día. 'already_completed' también es éxito.
 */
export async function submitOnboarding(
  draft: OnboardingDraft,
  complete: (input: OnboardingInput) => Promise<CompleteOnboardingResult>,
  measuredOn: string,
  today: Date = new Date(),
): Promise<SubmitOnboardingResult> {
  const { errors, input } = validateOnboarding(draft, today);
  if (!input) return { status: 'invalid', errors };
  const result = await complete({ ...input, measuredOn });
  if (result.status === 'error') {
    return { status: 'failed', reason: result.reason, message: onboardingErrorMessage(result.reason) };
  }
  return { status: 'saved' };
}
