// Validación y envío del onboarding. Las reglas replican las restricciones SQL de
// public.profiles para dar errores claros antes de llegar al servidor.

import type { Gender, PaletteId } from '@/design/palettes';

import type { ActivityLevel, Goal, Sex } from './health';
import { formatDateOnly, type ProfileUpdate } from './profile';
import type { SaveProfileResult } from './profile-api';

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

export function validateOnboarding(
  draft: OnboardingDraft,
  today: Date = new Date(),
): { errors: OnboardingErrors; patch: ProfileUpdate | null } {
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

  const heightCm = parseDecimal(draft.height);
  if (heightCm === null) {
    errors.height = 'Escribe tu estatura en centímetros, por ejemplo 170.';
  } else if (heightCm < HEIGHT_RANGE_CM.min || heightCm > HEIGHT_RANGE_CM.max) {
    errors.height = `La estatura debe estar entre ${HEIGHT_RANGE_CM.min} y ${HEIGHT_RANGE_CM.max} cm.`;
  }

  const weightKg = parseDecimal(draft.weight);
  if (weightKg === null) {
    errors.weight = 'Escribe tu peso en kilogramos, por ejemplo 70.5.';
  } else if (weightKg < WEIGHT_RANGE_KG.min || weightKg > WEIGHT_RANGE_KG.max) {
    errors.weight = `El peso debe estar entre ${WEIGHT_RANGE_KG.min} y ${WEIGHT_RANGE_KG.max} kg.`;
  }

  if (Object.keys(errors).length > 0 || !draft.birthDate) return { errors, patch: null };

  const patch: ProfileUpdate = {
    display_name: draft.displayName.trim(),
    gender: draft.gender,
    sex: draft.sex,
    birth_date: formatDateOnly(draft.birthDate),
    height_cm: heightCm,
    weight_kg: weightKg,
    activity_level: draft.activity,
    goal: draft.goal,
    onboarded_at: today.toISOString(),
    ...(draft.palette ? { theme_palette: draft.palette } : {}),
  };
  return { errors, patch };
}

export type SubmitOnboardingResult =
  | { status: 'invalid'; errors: OnboardingErrors }
  | { status: 'failed'; message: string }
  | { status: 'saved' };

/** Mensaje comprensible para cada fallo de guardado. */
export function saveErrorMessage(error: string): string {
  if (error === 'no_session') return 'Tu sesión expiró. Vuelve a iniciar sesión para guardar.';
  if (error === 'no_row') return 'No encontramos tu perfil para guardarlo. Inténtalo de nuevo.';
  if (/check constraint/i.test(error)) return 'Algún dato está fuera de rango. Revisa estatura, peso y fecha.';
  return 'No pudimos guardar tus datos. Revisa tu conexión e inténtalo de nuevo.';
}

/**
 * Valida y guarda. El onboarding solo se considera completo cuando el servidor
 * confirma la fila; ante cualquier fallo el formulario se conserva para reintentar.
 */
export async function submitOnboarding(
  draft: OnboardingDraft,
  save: (patch: ProfileUpdate) => Promise<SaveProfileResult>,
  today: Date = new Date(),
): Promise<SubmitOnboardingResult> {
  const { errors, patch } = validateOnboarding(draft, today);
  if (!patch) return { status: 'invalid', errors };
  const result = await save(patch);
  return result.ok ? { status: 'saved' } : { status: 'failed', message: saveErrorMessage(result.error) };
}
