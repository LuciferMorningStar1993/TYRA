import type { Database } from './database.types';
import type { ActivityLevel, Goal, HealthProfile, Sex } from './health';

export type Profile = Database['public']['Tables']['profiles']['Row'];

/** Convierte 'YYYY-MM-DD' a Date en hora local (evita el corrimiento de zona de new Date(iso)). */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateOnly(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Devuelve los datos de salud del perfil, o null si el onboarding está incompleto. */
export function toHealthProfile(profile: Profile): HealthProfile | null {
  const { sex, birth_date, height_cm, weight_kg, activity_level, goal } = profile;
  if (!sex || !birth_date || !height_cm || !weight_kg || !activity_level || !goal) {
    return null;
  }
  return {
    sex: sex as Sex,
    birthDate: parseDateOnly(birth_date),
    heightCm: Number(height_cm),
    weightKg: Number(weight_kg),
    activityLevel: activity_level as ActivityLevel,
    goal: goal as Goal,
  };
}
