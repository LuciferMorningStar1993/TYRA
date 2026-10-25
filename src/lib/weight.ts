// Reglas del seguimiento de peso, sin efectos. Fuente única: public.weight_entries.
// - Peso vigente: la medición FECHADA más reciente; si no hay, el peso heredado del perfil
//   (sin fecha confirmada). El heredado nunca entra en gráficas, meses ni variaciones.
// - Las correcciones modifican la misma medición: aquí solo existen valores vigentes.
// Diseño completo: docs/propuestas/salud-peso/propuesta.md.

import { formatNumber } from './format';
import { parseDecimal, WEIGHT_RANGE_KG } from './onboarding';
import { formatDateOnly, parseDateOnly } from './profile';

export type WeightOrigin = 'manual' | 'legacy_profile';

export type WeightEntry = {
  id: string;
  /** 'YYYY-MM-DD'; null solo en el peso heredado sin fecha confirmada. */
  measuredOn: string | null;
  weightKg: number;
  origin: WeightOrigin;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type CurrentWeight = { entry: WeightEntry; dateConfirmed: boolean } | null;

export function currentWeight(latestDated: WeightEntry | null, legacy: WeightEntry | null): CurrentWeight {
  if (latestDated) return { entry: latestDated, dateConfirmed: true };
  if (legacy) return { entry: legacy, dateConfirmed: false };
  return null;
}

/** Una medición se corrigió si cambió después de crearse (la versión sube con cada cambio real). */
export function wasCorrected(entry: WeightEntry): boolean {
  return entry.version > 1;
}

// --- Formulario -----------------------------------------------------------------------------

/** SQL: measured_on >= '1900-01-02'. */
export const MIN_MEASURED_ON = new Date(1900, 0, 2);

export type WeightFormErrors = { weight?: string; measuredOn?: string };

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function validateWeightKg(text: string): { weightKg: number | null; error?: string } {
  const weightKg = parseDecimal(text);
  if (weightKg === null) return { weightKg: null, error: 'Escribe tu peso en kilogramos, por ejemplo 70.5.' };
  if (weightKg < WEIGHT_RANGE_KG.min || weightKg > WEIGHT_RANGE_KG.max) {
    return { weightKg: null, error: `El peso debe estar entre ${WEIGHT_RANGE_KG.min} y ${WEIGHT_RANGE_KG.max} kg.` };
  }
  return { weightKg };
}

export function validateWeightForm(
  input: { weight: string; measuredOn: Date | null },
  today: Date = new Date(),
): { errors: WeightFormErrors; value: { weightKg: number; measuredOn: string } | null } {
  const errors: WeightFormErrors = {};
  const { weightKg, error } = validateWeightKg(input.weight);
  if (error) errors.weight = error;

  const date = input.measuredOn;
  if (!date || Number.isNaN(date.getTime())) {
    errors.measuredOn = 'Elige el día de la medición.';
  } else if (startOfDay(date) > startOfDay(today)) {
    errors.measuredOn = 'La fecha no puede ser posterior a hoy.';
  } else if (startOfDay(date) < MIN_MEASURED_ON) {
    errors.measuredOn = 'Revisa el año de la medición.';
  }

  if (Object.keys(errors).length > 0 || weightKg === null || !date) return { errors, value: null };
  return { errors, value: { weightKg, measuredOn: formatDateOnly(date) } };
}

// --- Gráfica --------------------------------------------------------------------------------

export type ChartRange = '30d' | '90d' | '1y';

export const CHART_RANGE_DAYS: Record<ChartRange, number> = { '30d': 30, '90d': 90, '1y': 365 };

export function rangeStart(range: ChartRange, today: Date = new Date()): Date {
  const start = startOfDay(today);
  start.setDate(start.getDate() - (CHART_RANGE_DAYS[range] - 1));
  return start;
}

export type ChartPoint = { measuredOn: string; weightKg: number };

/** Solo mediciones fechadas, en orden; los días sin medición no se interpolan. */
export function chartPoints(entries: readonly WeightEntry[], from?: Date): ChartPoint[] {
  const fromKey = from ? formatDateOnly(from) : null;
  return entries
    .filter((entry): entry is WeightEntry & { measuredOn: string } => entry.measuredOn !== null)
    .filter((entry) => fromKey === null || entry.measuredOn >= fromKey)
    .map((entry) => ({ measuredOn: entry.measuredOn, weightKg: entry.weightKg }))
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Coordenadas para dibujar: x según el día real (los huecos se ven como huecos), y según el peso
 * con un margen mínimo de 1 kg para que cambios pequeños no parezcan enormes.
 */
export function chartLayout(
  points: readonly ChartPoint[],
  size: { width: number; height: number; padding: number },
  from: Date,
  to: Date,
): { x: number; y: number }[] {
  if (points.length === 0) return [];
  const weights = points.map((point) => point.weightKg);
  let min = Math.min(...weights);
  let max = Math.max(...weights);
  if (max - min < 1) {
    const middle = (max + min) / 2;
    min = middle - 0.5;
    max = middle + 0.5;
  }
  const span = Math.max(1, (startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
  const innerWidth = size.width - size.padding * 2;
  const innerHeight = size.height - size.padding * 2;
  return points.map((point) => {
    const days = (parseDateOnly(point.measuredOn).getTime() - startOfDay(from).getTime()) / DAY_MS;
    return {
      x: size.padding + (Math.min(Math.max(days, 0), span) / span) * innerWidth,
      y: size.padding + ((max - point.weightKg) / (max - min)) * innerHeight,
    };
  });
}

export function formatKg(value: number): string {
  return `${formatNumber(value, 1)} kg`;
}

export function formatMeasuredOn(value: string): string {
  return parseDateOnly(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Variación descrita con palabras (no solo con color ni signo). */
export function describeChange(changeKg: number): string {
  const rounded = Math.round(changeKg * 10) / 10;
  if (rounded === 0) return 'sin cambio';
  return `${rounded < 0 ? 'bajó' : 'subió'} ${formatKg(Math.abs(rounded))}`;
}

/** Resumen de la gráfica para lectores de pantalla. */
export function chartSummary(points: readonly ChartPoint[]): string {
  if (points.length === 0) return 'Sin mediciones en este periodo.';
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length === 1) return `Una medición: ${formatKg(first.weightKg)} el ${formatMeasuredOn(first.measuredOn)}.`;
  const weights = points.map((point) => point.weightKg);
  return (
    `${points.length} mediciones del ${formatMeasuredOn(first.measuredOn)} al ${formatMeasuredOn(last.measuredOn)}: ` +
    `de ${formatKg(first.weightKg)} a ${formatKg(last.weightKg)} (${describeChange(last.weightKg - first.weightKg)}). ` +
    `Mínimo ${formatKg(Math.min(...weights))}, máximo ${formatKg(Math.max(...weights))}.`
  );
}

// --- Resúmenes mensuales --------------------------------------------------------------------

/** Fila de public.weight_monthly_summaries (solo meses con datos). */
export type MonthlySummary = {
  month: string; // 'YYYY-MM-01'
  entries: number;
  averageKg: number;
  firstMeasuredOn: string;
  firstWeightKg: number;
  lastMeasuredOn: string;
  lastWeightKg: number;
  changeKg: number | null;
};

/** Con menos mediciones no hay promedio ni variación que mostrar. */
export const MIN_ENTRIES_FOR_MONTH_TREND = 2;

export type MonthStatus =
  | { month: string; status: 'no_data' }
  | { month: string; status: 'insufficient'; measuredOn: string; weightKg: number }
  | {
      month: string;
      status: 'ok';
      entries: number;
      averageKg: number;
      firstWeightKg: number;
      lastWeightKg: number;
      changeKg: number;
    };

function monthKey(date: Date): string {
  return formatDateOnly(new Date(date.getFullYear(), date.getMonth(), 1));
}

/** Meses del rango (del más reciente al más antiguo), como 'YYYY-MM-01'. */
export function monthsInRange(from: Date, to: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(to.getFullYear(), to.getMonth(), 1);
  const first = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cursor >= first) {
    months.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return months;
}

/**
 * Un estado por mes del rango. Los meses sin filas son «sin datos»; con una medición,
 * «insuficiente» (se muestra el valor, sin promedio ni variación). No se rellena nada.
 */
export function monthlyStatuses(summaries: readonly MonthlySummary[], from: Date, to: Date): MonthStatus[] {
  const byMonth = new Map(summaries.map((summary) => [summary.month, summary]));
  return monthsInRange(from, to).map((month): MonthStatus => {
    const summary = byMonth.get(month);
    if (!summary || summary.entries === 0) return { month, status: 'no_data' };
    if (summary.entries < MIN_ENTRIES_FOR_MONTH_TREND || summary.changeKg === null) {
      return { month, status: 'insufficient', measuredOn: summary.lastMeasuredOn, weightKg: summary.lastWeightKg };
    }
    return {
      month,
      status: 'ok',
      entries: summary.entries,
      averageKg: summary.averageKg,
      firstWeightKg: summary.firstWeightKg,
      lastWeightKg: summary.lastWeightKg,
      changeKg: summary.changeKg,
    };
  });
}

export function formatMonth(month: string): string {
  return parseDateOnly(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
