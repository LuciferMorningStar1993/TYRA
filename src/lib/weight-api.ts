// Lecturas y escrituras de peso en Supabase. La RLS limita todo al dueño de la sesión; además se
// filtra por user_id para usar el índice (user_id, measured_on). Siempre devuelven un resultado
// explícito: un error nunca se confunde con «sin datos».

import type { Database } from './database.types';
import { supabase } from './supabase';
import type { MonthlySummary, WeightEntry, WeightOrigin } from './weight';
import type { WeightGoal } from './weight-goal';

type EntryRow = Database['public']['Tables']['weight_entries']['Row'];
type MonthlyRow = Database['public']['Views']['weight_monthly_summaries']['Row'];
type GoalRow = Database['public']['Tables']['weight_goals']['Row'];

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
  /** Meta de peso (opcional) y la medición de partida a la que apunta, si aún existe. */
  goal: WeightGoal | null;
  goalStartEntry: WeightEntry | null;
};

const GOAL_COLUMNS =
  'id, target_weight_kg, start_weight_kg, start_measured_on, start_entry_id, start_entry_version, version, set_at, updated_at';

function toGoal(row: Omit<GoalRow, 'user_id'>): WeightGoal {
  return {
    id: row.id,
    targetWeightKg: Number(row.target_weight_kg),
    startWeightKg: Number(row.start_weight_kg),
    startMeasuredOn: row.start_measured_on,
    startEntryId: row.start_entry_id,
    startEntryVersion: row.start_entry_version,
    version: row.version,
    setAt: row.set_at,
    updatedAt: row.updated_at,
  };
}

/** Todo lo que necesitan Inicio, Salud y el historial, en una sola carga. */
export async function loadWeightOverview(userId: string, fromMonth: string): Promise<LoadResult<WeightOverview>> {
  try {
    const [recent, legacy, monthly, goal] = await Promise.all([
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
      supabase.from('weight_goals').select(GOAL_COLUMNS).eq('user_id', userId).maybeSingle(),
    ]);
    const error = recent.error ?? legacy.error ?? monthly.error ?? goal.error;
    if (error) return { status: 'error', message: error.message };
    // Estado de la medición de partida (corregida o eliminada): solo si hay meta y referencia.
    let goalStartEntry: WeightEntry | null = null;
    if (goal.data?.start_entry_id) {
      const start = await supabase.from('weight_entries').select(ENTRY_COLUMNS).eq('id', goal.data.start_entry_id).maybeSingle();
      if (start.error) return { status: 'error', message: start.error.message };
      goalStartEntry = start.data ? toEntry(start.data) : null;
    }
    const rows = recent.data ?? [];
    return {
      status: 'ok',
      data: {
        recent: rows.slice(0, HISTORY_PAGE_SIZE).map(toEntry),
        hasMore: rows.length > HISTORY_PAGE_SIZE,
        legacy: legacy.data ? toEntry(legacy.data) : null,
        monthly: (monthly.data ?? []).map(toMonthly),
        goal: goal.data ? toGoal(goal.data) : null,
        goalStartEntry,
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

const AUDIT_COLUMNS = 'id, action, changed_at, old_measured_on, old_weight_kg, new_measured_on, new_weight_kg';
export const ACTIVITY_PAGE_SIZE = 20;

type AuditRow = Pick<
  Database['public']['Tables']['weight_entry_audit']['Row'],
  'id' | 'action' | 'changed_at' | 'old_measured_on' | 'old_weight_kg' | 'new_measured_on' | 'new_weight_kg'
>;

function toCorrection(row: AuditRow): WeightCorrection {
  return {
    id: row.id,
    action: row.action as WeightCorrection['action'],
    changedAt: row.changed_at,
    oldMeasuredOn: row.old_measured_on,
    oldWeightKg: Number(row.old_weight_kg),
    newMeasuredOn: row.new_measured_on,
    newWeightKg: row.new_weight_kg === null ? null : Number(row.new_weight_kg),
  };
}

/** Correcciones de una medición (la auditoría vence a los 180 días). */
export async function loadCorrections(entryId: string): Promise<LoadResult<WeightCorrection[]>> {
  try {
    const { data, error } = await supabase
      .from('weight_entry_audit')
      .select(AUDIT_COLUMNS)
      .eq('entry_id', entryId)
      .order('changed_at', { ascending: false })
      .order('id', { ascending: false });
    if (error) return { status: 'error', message: error.message };
    return { status: 'ok', data: (data ?? []).map(toCorrection) };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

/** Última fila mostrada: el orden es changed_at desc, id desc, y el cursor usa ambos. */
export type ActivityCursor = { changedAt: string; id: number };

/**
 * Filtro PostgREST para «filas después del cursor» en orden (changed_at desc, id desc):
 * changed_at anterior, o la misma fecha y un id menor. Así no se pierden ni repiten filas aunque
 * muchas compartan changed_at. La fecha va entre comillas (contiene «:», «.» y «+»).
 */
export function activityCursorFilter(cursor: ActivityCursor): string {
  if (!Number.isInteger(cursor.id) || /["\\,()]/.test(cursor.changedAt)) throw new Error('Cursor de actividad inválido');
  const at = `"${cursor.changedAt}"`;
  return `changed_at.lt.${at},and(changed_at.eq.${at},id.lt.${cursor.id})`;
}

/**
 * Actividad reciente: correcciones y eliminaciones de la persona (más reciente primero), aunque ya
 * no tenga mediciones vigentes. Paginada con cursor (changed_at, id). Índice (user_id, changed_at
 * desc); la RLS limita al dueño.
 */
export async function loadRecentActivity(
  userId: string,
  after?: ActivityCursor,
): Promise<LoadResult<{ items: WeightCorrection[]; hasMore: boolean }>> {
  try {
    let query = supabase.from('weight_entry_audit').select(AUDIT_COLUMNS).eq('user_id', userId);
    if (after) query = query.or(activityCursorFilter(after));
    const { data, error } = await query
      .order('changed_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(ACTIVITY_PAGE_SIZE + 1);
    if (error) return { status: 'error', message: error.message };
    const rows = data ?? [];
    return {
      status: 'ok',
      data: { items: rows.slice(0, ACTIVITY_PAGE_SIZE).map(toCorrection), hasMore: rows.length > ACTIVITY_PAGE_SIZE },
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

// --- Meta de peso ---------------------------------------------------------------------------

/** Todos los meses con datos (rango «Todo»), en orden cronológico. */
export async function loadAllMonthlySummaries(userId: string): Promise<LoadResult<MonthlySummary[]>> {
  try {
    const { data, error } = await supabase
      .from('weight_monthly_summaries')
      .select('*')
      .eq('user_id', userId)
      .order('month', { ascending: true });
    if (error) return { status: 'error', message: error.message };
    return { status: 'ok', data: (data ?? []).map(toMonthly) };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

export type GoalMutationResult =
  | { status: 'ok'; goal: WeightGoal }
  | { status: 'deleted' }
  /** La meta cambió en otro dispositivo (otra versión), o ya hay una al intentar crear. */
  | { status: 'goal_conflict' }
  /** La meta que se quería editar, reiniciar o eliminar ya no existe (aunque haya otra nueva). */
  | { status: 'goal_missing' }
  | { status: 'age_not_eligible' }
  | { status: 'no_dated_measurement' }
  | { status: 'out_of_range' }
  | { status: 'error'; message: string };

function goalError(error: PostgrestError): GoalMutationResult {
  for (const status of ['goal_conflict', 'goal_missing', 'age_not_eligible', 'no_dated_measurement'] as const) {
    if (error.message.includes(status)) return { status };
  }
  if (error.code === '23514' || /check constraint/i.test(error.message)) return { status: 'out_of_range' };
  return { status: 'error', message: error.message };
}

/**
 * Crear (sin `goal`), editar o reiniciar (con el id y la versión leídos). El punto de partida lo
 * fija el servidor; una operación obsoleta recibe goal_conflict o goal_missing y nunca recrea.
 */
export async function setWeightGoal(input: {
  targetKg: number;
  goal?: Pick<WeightGoal, 'id' | 'version'>;
  resetStart?: boolean;
}): Promise<GoalMutationResult> {
  try {
    const { data, error } = await supabase
      .rpc('set_weight_goal', {
        p_target_weight_kg: input.targetKg,
        p_goal_id: input.goal?.id,
        p_expected_version: input.goal?.version,
        p_reset_start: input.resetStart ?? false,
      })
      .single();
    if (error) return goalError(error);
    return { status: 'ok', goal: toGoal(data as GoalRow) };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

/** Elimina solo la meta leída (id + versión). 0 filas: cambió o ya no existe (se recarga). */
export async function deleteWeightGoal(goal: Pick<WeightGoal, 'id' | 'version'>): Promise<GoalMutationResult> {
  try {
    const { data, error } = await supabase
      .from('weight_goals')
      .delete()
      .eq('id', goal.id)
      .eq('version', goal.version)
      .select('id');
    if (error) return goalError(error);
    return (data ?? []).length > 0 ? { status: 'deleted' } : { status: 'goal_conflict' };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

export function goalActionMessage(result: GoalMutationResult | { status: 'stale_session' }): string | null {
  switch (result.status) {
    case 'goal_conflict':
      return 'Tu meta cambió en otro dispositivo. Mostramos la actual.';
    case 'goal_missing':
      return 'Tu meta se eliminó en otro dispositivo. Puedes fijar una nueva.';
    case 'age_not_eligible':
      return `La meta de peso está disponible desde los 20 años.`;
    case 'no_dated_measurement':
      return 'Registra una medición con fecha (o confirma la fecha de tu peso del perfil) para fijar tu meta.';
    case 'out_of_range':
      return 'La meta debe estar entre 20 y 400 kg.';
    case 'stale_session':
      return 'Tu sesión cambió. Vuelve a abrir esta pantalla.';
    case 'error':
      return 'No pudimos guardar. Revisa tu conexión e inténtalo de nuevo.';
    default:
      return null;
  }
}
