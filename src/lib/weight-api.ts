// Lecturas y escrituras de peso en Supabase. La RLS limita todo al dueño de la sesión; además se
// filtra por user_id para usar el índice (user_id, measured_on). Siempre devuelven un resultado
// explícito: un error nunca se confunde con «sin datos».

import type { Database } from './database.types';
import { supabase } from './supabase';
import type { MonthlySummary, WeightEntry, WeightOrigin } from './weight';

type EntryRow = Database['public']['Tables']['weight_entries']['Row'];
type MonthlyRow = Database['public']['Views']['weight_monthly_summaries']['Row'];

const ENTRY_COLUMNS = 'id, measured_on, weight_kg, origin, version, created_at, updated_at';
export const HISTORY_PAGE_SIZE = 30;

export type LoadResult<T> = { status: 'ok'; data: T } | { status: 'error'; message: string };

export type WeightMutationResult =
  | { status: 'ok'; entry: WeightEntry }
  | { status: 'deleted' }
  /** Ya hay una medición ese día (insertar o mover la fecha). */
  | { status: 'duplicate_day' }
  /** La medición cambió o se eliminó en otro dispositivo (versión distinta). */
  | { status: 'conflict' }
  | { status: 'error'; message: string };

type PostgrestError = { code?: string; message: string };

/** Mensaje para cada resultado de escritura que no es éxito (stale_session lo agrega el proveedor). */
export function weightActionMessage(result: WeightMutationResult | { status: 'stale_session' }): string | null {
  switch (result.status) {
    case 'duplicate_day':
      return 'Ya registraste tu peso ese día. Edita esa medición desde el historial.';
    case 'conflict':
      return 'Esta medición cambió o se eliminó en otro dispositivo. Mostramos sus datos actuales.';
    case 'stale_session':
      return 'Tu sesión cambió. Vuelve a abrir esta pantalla.';
    case 'error':
      return 'No pudimos guardar. Revisa tu conexión e inténtalo de nuevo.';
    default:
      return null;
  }
}

function toEntry(row: Pick<EntryRow, 'id' | 'measured_on' | 'weight_kg' | 'origin' | 'version' | 'created_at' | 'updated_at'>): WeightEntry {
  return {
    id: row.id,
    measuredOn: row.measured_on,
    weightKg: Number(row.weight_kg),
    origin: row.origin as WeightOrigin,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMonthly(row: MonthlyRow): MonthlySummary {
  return {
    month: row.month ?? '',
    entries: row.entries ?? 0,
    averageKg: Number(row.average_kg),
    firstMeasuredOn: row.first_measured_on ?? '',
    firstWeightKg: Number(row.first_weight_kg),
    lastMeasuredOn: row.last_measured_on ?? '',
    lastWeightKg: Number(row.last_weight_kg),
    changeKg: row.change_kg === null ? null : Number(row.change_kg),
  };
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

function mutationError(error: PostgrestError): WeightMutationResult {
  if (error.code === '23505') return { status: 'duplicate_day' };
  return { status: 'error', message: error.message };
}

export type WeightOverview = {
  /** Primera página del historial fechado (más reciente primero). */
  recent: WeightEntry[];
  hasMore: boolean;
  /** Peso heredado del perfil sin fecha confirmada, si existe. */
  legacy: WeightEntry | null;
  /** Meses con datos desde `fromMonth` (más reciente primero). */
  monthly: MonthlySummary[];
};

/** Todo lo que necesitan Inicio, Salud y el historial, en una sola carga. */
export async function loadWeightOverview(userId: string, fromMonth: string): Promise<LoadResult<WeightOverview>> {
  try {
    const [recent, legacy, monthly] = await Promise.all([
      supabase
        .from('weight_entries')
        .select(ENTRY_COLUMNS)
        .eq('user_id', userId)
        .not('measured_on', 'is', null)
        .order('measured_on', { ascending: false })
        .limit(HISTORY_PAGE_SIZE + 1),
      supabase.from('weight_entries').select(ENTRY_COLUMNS).eq('user_id', userId).is('measured_on', null).maybeSingle(),
      supabase
        .from('weight_monthly_summaries')
        .select('*')
        .eq('user_id', userId)
        .gte('month', fromMonth)
        .order('month', { ascending: false }),
    ]);
    const error = recent.error ?? legacy.error ?? monthly.error;
    if (error) return { status: 'error', message: error.message };
    const rows = recent.data ?? [];
    return {
      status: 'ok',
      data: {
        recent: rows.slice(0, HISTORY_PAGE_SIZE).map(toEntry),
        hasMore: rows.length > HISTORY_PAGE_SIZE,
        legacy: legacy.data ? toEntry(legacy.data) : null,
        monthly: (monthly.data ?? []).map(toMonthly),
      },
    };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

/** Página siguiente del historial: mediciones anteriores a `before` (cursor por fecha). */
export async function loadHistoryPage(
  userId: string,
  before: string,
): Promise<LoadResult<{ entries: WeightEntry[]; hasMore: boolean }>> {
  try {
    const { data, error } = await supabase
      .from('weight_entries')
      .select(ENTRY_COLUMNS)
      .eq('user_id', userId)
      .lt('measured_on', before)
      .order('measured_on', { ascending: false })
      .limit(HISTORY_PAGE_SIZE + 1);
    if (error) return { status: 'error', message: error.message };
    const rows = data ?? [];
    return { status: 'ok', data: { entries: rows.slice(0, HISTORY_PAGE_SIZE).map(toEntry), hasMore: rows.length > HISTORY_PAGE_SIZE } };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

/** Mediciones fechadas desde `from` ('YYYY-MM-DD'), en orden, para la gráfica. */
export async function loadWeightRange(userId: string, from: string): Promise<LoadResult<WeightEntry[]>> {
  try {
    const { data, error } = await supabase
      .from('weight_entries')
      .select(ENTRY_COLUMNS)
      .eq('user_id', userId)
      .gte('measured_on', from)
      .order('measured_on', { ascending: true });
    if (error) return { status: 'error', message: error.message };
    return { status: 'ok', data: (data ?? []).map(toEntry) };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

export async function loadWeightEntry(id: string): Promise<LoadResult<WeightEntry | null>> {
  try {
    const { data, error } = await supabase.from('weight_entries').select(ENTRY_COLUMNS).eq('id', id).maybeSingle();
    if (error) return { status: 'error', message: error.message };
    return { status: 'ok', data: data ? toEntry(data) : null };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

export async function addWeightEntry(input: { measuredOn: string; weightKg: number }): Promise<WeightMutationResult> {
  try {
    // user_id lo pone el servidor (auth.uid()).
    const { data, error } = await supabase
      .from('weight_entries')
      .insert({ measured_on: input.measuredOn, weight_kg: input.weightKg })
      .select(ENTRY_COLUMNS)
      .single();
    if (error) return mutationError(error);
    return { status: 'ok', entry: toEntry(data) };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

/** Corrige fecha y/o peso solo si la versión sigue siendo la leída. */
export async function updateWeightEntry(
  entry: Pick<WeightEntry, 'id' | 'version'>,
  patch: { measuredOn: string; weightKg: number },
): Promise<WeightMutationResult> {
  try {
    const { data, error } = await supabase
      .from('weight_entries')
      .update({ measured_on: patch.measuredOn, weight_kg: patch.weightKg })
      .eq('id', entry.id)
      .eq('version', entry.version)
      .select(ENTRY_COLUMNS);
    if (error) return mutationError(error);
    const [row] = data ?? [];
    return row ? { status: 'ok', entry: toEntry(row) } : { status: 'conflict' };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

/** Elimina solo si la versión sigue siendo la leída. */
export async function deleteWeightEntry(entry: Pick<WeightEntry, 'id' | 'version'>): Promise<WeightMutationResult> {
  try {
    const { data, error } = await supabase
      .from('weight_entries')
      .delete()
      .eq('id', entry.id)
      .eq('version', entry.version)
      .select('id');
    if (error) return mutationError(error);
    return (data ?? []).length > 0 ? { status: 'deleted' } : { status: 'conflict' };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

export type WeightCorrection = {
  id: number;
  action: 'correction' | 'deletion';
  changedAt: string;
  oldMeasuredOn: string | null;
  oldWeightKg: number;
  newMeasuredOn: string | null;
  newWeightKg: number | null;
};

/** Correcciones de una medición (la auditoría vence a los 180 días). */
export async function loadCorrections(entryId: string): Promise<LoadResult<WeightCorrection[]>> {
  try {
    const { data, error } = await supabase
      .from('weight_entry_audit')
      .select('id, action, changed_at, old_measured_on, old_weight_kg, new_measured_on, new_weight_kg')
      .eq('entry_id', entryId)
      .order('changed_at', { ascending: false })
      .order('id', { ascending: false });
    if (error) return { status: 'error', message: error.message };
    return {
      status: 'ok',
      data: (data ?? []).map((row) => ({
        id: row.id,
        action: row.action as WeightCorrection['action'],
        changedAt: row.changed_at,
        oldMeasuredOn: row.old_measured_on,
        oldWeightKg: Number(row.old_weight_kg),
        newMeasuredOn: row.new_measured_on,
        newWeightKg: row.new_weight_kg === null ? null : Number(row.new_weight_kg),
      })),
    };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

// --- Onboarding transaccional -----------------------------------------------------------------

export type OnboardingInput = {
  displayName: string;
  gender: string | null;
  sex: string;
  birthDate: string;
  heightCm: number;
  activityLevel: string;
  goal: string;
  themePalette: string | null;
  weightKg: number;
  measuredOn: string;
};

export type OnboardingErrorReason =
  | 'weight_day_conflict'
  | 'invalid_measured_on'
  | 'missing_field'
  | 'out_of_range'
  | 'no_session'
  | 'other';

export type CompleteOnboardingResult =
  | { status: 'completed' | 'already_completed' }
  | { status: 'error'; reason: OnboardingErrorReason; message: string };

export function onboardingErrorReason(error: PostgrestError): OnboardingErrorReason {
  if (error.message.includes('weight_day_conflict')) return 'weight_day_conflict';
  if (error.message.includes('invalid_measured_on')) return 'invalid_measured_on';
  if (error.message.startsWith('missing_')) return 'missing_field';
  if (error.code === '23514' || /check constraint/i.test(error.message)) return 'out_of_range';
  if (error.message.includes('no_session')) return 'no_session';
  return 'other';
}

/** Perfil + primera medición en una sola transacción (función complete_onboarding). Idempotente. */
export async function completeOnboarding(input: OnboardingInput): Promise<CompleteOnboardingResult> {
  try {
    const { data, error } = await supabase.rpc('complete_onboarding', {
      p_display_name: input.displayName,
      // Los tipos generados no marcan como opcionales los parámetros que aceptan null.
      p_gender: input.gender as string,
      p_sex: input.sex,
      p_birth_date: input.birthDate,
      p_height_cm: input.heightCm,
      p_activity_level: input.activityLevel,
      p_goal: input.goal,
      p_theme_palette: input.themePalette as string,
      p_weight_kg: input.weightKg,
      p_measured_on: input.measuredOn,
    });
    if (error) return { status: 'error', reason: onboardingErrorReason(error), message: error.message };
    return data === 'already_completed' ? { status: 'already_completed' } : { status: 'completed' };
  } catch (error) {
    return { status: 'error', reason: 'other', message: errorMessage(error) };
  }
}
