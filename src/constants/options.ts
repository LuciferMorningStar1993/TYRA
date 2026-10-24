import type { Option } from '@/components/ui';
import type { Gender } from '@/design/palettes';
import type { ColorMode } from '@/design/theme-preferences';
import type { ActivityLevel, Goal, Sex } from '@/lib/health';

export const GENDER_OPTIONS: readonly Option<Gender>[] = [
  { value: 'female', label: 'Femenino' },
  { value: 'male', label: 'Masculino' },
  { value: 'other', label: 'Otro' },
  { value: 'unspecified', label: 'Prefiero no decir' },
];

export const SEX_OPTIONS: readonly Option<Sex>[] = [
  { value: 'female', label: 'Mujer' },
  { value: 'male', label: 'Hombre' },
];

export const ACTIVITY_OPTIONS: readonly Option<ActivityLevel>[] = [
  { value: 'sedentary', label: 'Sedentario' },
  { value: 'light', label: 'Ligero (1-3 días)' },
  { value: 'moderate', label: 'Moderado (3-5 días)' },
  { value: 'active', label: 'Activo (6-7 días)' },
  { value: 'very_active', label: 'Muy activo' },
];

export const GOAL_OPTIONS: readonly Option<Goal>[] = [
  { value: 'lose', label: 'Bajar de peso' },
  { value: 'maintain', label: 'Mantener' },
  { value: 'gain', label: 'Subir / ganar músculo' },
];

export const COLOR_MODE_OPTIONS: readonly Option<ColorMode>[] = [
  { value: 'system', label: 'Automático' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];
