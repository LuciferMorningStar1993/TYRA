import {
  allRangeBounds,
  chartLayout,
  chartPoints,
  chartSummary,
  currentWeight,
  describeChange,
  monthlyChartPoints,
  monthlyChartSummary,
  monthlyPoints,
  monthlySegments,
  monthlyStatuses,
  monthsInRange,
  rangeStart,
  validateWeightForm,
  wasCorrected,
  weightScale,
  weightToY,
  type MonthlySummary,
  type WeightEntry,
} from './weight';

const TODAY = new Date(2026, 9, 24, 12, 0, 0);

function entry(overrides: Partial<WeightEntry> = {}): WeightEntry {
  return {
    id: overrides.measuredOn ?? 'legacy',
    measuredOn: '2026-10-20',
    weightKg: 70,
    origin: 'manual',
    version: 1,
    createdAt: '2026-10-20T12:00:00Z',
    updatedAt: '2026-10-20T12:00:00Z',
    ...overrides,
  };
}

const legacy = entry({ id: 'legacy', measuredOn: null, origin: 'legacy_profile', weightKg: 72.4 });

describe('currentWeight', () => {
  it('la fechada más reciente gana al heredado', () => {
    const latest = entry({ measuredOn: '2026-10-23', weightKg: 71.6 });
    expect(currentWeight(latest, legacy)).toEqual({ entry: latest, dateConfirmed: true });
  });

  it('sin fechadas, el heredado cuenta como vigente con fecha sin confirmar', () => {
    expect(currentWeight(null, legacy)).toEqual({ entry: legacy, dateConfirmed: false });
  });

  it('sin mediciones no hay peso vigente', () => {
    expect(currentWeight(null, null)).toBeNull();
  });
});

it('una medición está corregida cuando su versión subió', () => {
  expect(wasCorrected(entry())).toBe(false);
  expect(wasCorrected(entry({ version: 2 }))).toBe(true);
});

describe('validateWeightForm', () => {
  it('normaliza peso con coma y fecha local', () => {
    expect(validateWeightForm({ weight: '70,5', measuredOn: new Date(2026, 9, 22) }, TODAY)).toEqual({
      errors: {},
      value: { weightKg: 70.5, measuredOn: '2026-10-22' },
    });
  });

  it.each(['19.9', '400.1', 'abc', ''])('peso %s inválido', (weight) => {
    const { errors, value } = validateWeightForm({ weight, measuredOn: TODAY }, TODAY);
    expect(value).toBeNull();
    expect(errors.weight).toBeDefined();
  });

  it('acepta hoy y rechaza fechas futuras o vacías', () => {
    expect(validateWeightForm({ weight: '70', measuredOn: new Date(2026, 9, 24, 23, 59) }, TODAY).errors).toEqual({});
    expect(validateWeightForm({ weight: '70', measuredOn: new Date(2026, 9, 25) }, TODAY).errors.measuredOn).toMatch(
      /posterior a hoy/,
    );
    expect(validateWeightForm({ weight: '70', measuredOn: null }, TODAY).errors.measuredOn).toMatch(/Elige/);
  });
});

describe('gráfica', () => {
  const entries = [
    entry({ measuredOn: '2026-10-23', weightKg: 71.6 }),
    legacy,
    entry({ measuredOn: '2026-09-01', weightKg: 74 }),
    entry({ measuredOn: '2026-10-21', weightKg: 72 }),
  ];

  it('solo mediciones fechadas, en orden y sin días inventados; el heredado nunca entra', () => {
    expect(chartPoints(entries)).toEqual([
      { measuredOn: '2026-09-01', weightKg: 74 },
      { measuredOn: '2026-10-21', weightKg: 72 },
      { measuredOn: '2026-10-23', weightKg: 71.6 },
    ]);
  });

  it('filtra por el inicio del rango', () => {
    const from = rangeStart('30d', TODAY);
    expect(from).toEqual(new Date(2026, 8, 25));
    expect(chartPoints(entries, from).map((point) => point.measuredOn)).toEqual(['2026-10-21', '2026-10-23']);
  });

  it('x sigue el calendario real (un hueco de días se ve como hueco)', () => {
    const points = [
      { measuredOn: '2026-10-01', weightKg: 70 },
      { measuredOn: '2026-10-02', weightKg: 71 },
      { measuredOn: '2026-10-11', weightKg: 72 },
    ];
    const [a, b, c] = chartLayout(points, { width: 110, height: 60, padding: 5 }, new Date(2026, 9, 1), new Date(2026, 9, 11));
    expect(a.x).toBe(5);
    expect(b.x).toBe(15);
    expect(c.x).toBe(105);
    expect(c.y).toBeLessThan(a.y); // más peso, más arriba
  });

  it('el resumen accesible describe el periodo con palabras', () => {
    expect(chartSummary([])).toMatch(/Sin mediciones/);
    expect(chartSummary(chartPoints(entries))).toMatch(/3 mediciones/);
    expect(chartSummary(chartPoints(entries))).toMatch(/bajó 2\.4 kg/);
  });
});

it('la variación se describe con palabras, no solo con signo', () => {
  expect(describeChange(-0.84)).toBe('bajó 0.8 kg');
  expect(describeChange(1.2)).toBe('subió 1.2 kg');
  expect(describeChange(0.04)).toBe('sin cambio');
});

describe('resúmenes mensuales', () => {
  const summary = (overrides: Partial<MonthlySummary>): MonthlySummary => ({
    month: '2026-10-01',
    entries: 3,
    averageKg: 71.9,
    firstMeasuredOn: '2026-10-02',
    firstWeightKg: 72.4,
    lastMeasuredOn: '2026-10-23',
    lastWeightKg: 71.4,
    changeKg: -1,
    ...overrides,
  });

  it('meses del rango, del más reciente al más antiguo', () => {
    expect(monthsInRange(new Date(2026, 7, 15), TODAY)).toEqual(['2026-10-01', '2026-09-01', '2026-08-01']);
  });

  it('distingue meses sin datos, insuficientes y con variación; no rellena nada', () => {
    const statuses = monthlyStatuses(
      [
        summary({}),
        summary({
          month: '2026-08-01',
          entries: 1,
          changeKg: null,
          lastMeasuredOn: '2026-08-10',
          lastWeightKg: 74,
        }),
      ],
      new Date(2026, 7, 1),
      TODAY,
    );
    expect(statuses).toEqual([
      { month: '2026-10-01', status: 'ok', entries: 3, averageKg: 71.9, firstWeightKg: 72.4, lastWeightKg: 71.4, changeKg: -1 },
      { month: '2026-09-01', status: 'no_data' },
      { month: '2026-08-01', status: 'insufficient', measuredOn: '2026-08-10', weightKg: 74 },
    ]);
  });
});

describe('«Todo»: promedios mensuales', () => {
  const summary = (month: string, averageKg: number, entries = 2): MonthlySummary => ({
    month,
    entries,
    averageKg,
    firstMeasuredOn: month,
    firstWeightKg: averageKg,
    lastMeasuredOn: month,
    lastWeightKg: averageKg,
    changeKg: entries > 1 ? 0 : null,
  });

  it('solo meses con datos, en orden, a mitad de mes (sin rellenar)', () => {
    const points = monthlyPoints([summary('2026-04-01', 71), summary('2026-01-01', 73), summary('2026-02-01', 72, 1)]);
    expect(points.map((point) => point.month)).toEqual(['2026-01-01', '2026-02-01', '2026-04-01']);
    expect(monthlyChartPoints(points).map((point) => point.measuredOn)).toEqual(['2026-01-15', '2026-02-15', '2026-04-15']);
  });

  it('un mes sin datos interrumpe la línea: ene, feb, —, abr → 2 tramos', () => {
    const points = monthlyPoints([summary('2026-01-01', 73), summary('2026-02-01', 72), summary('2026-04-01', 71)]);
    expect(monthlySegments(points)).toEqual([[0, 1], [2]]);
  });

  it('cambio de año consecutivo no interrumpe (dic → ene)', () => {
    const points = monthlyPoints([summary('2025-12-01', 73), summary('2026-01-01', 72)]);
    expect(monthlySegments(points)).toEqual([[0, 1]]);
  });

  it('periodo y resumen accesible: meses con datos de meses totales', () => {
    const points = monthlyPoints([summary('2026-08-01', 73), summary('2026-10-01', 71)]);
    expect(allRangeBounds(points, TODAY)).toEqual({ from: new Date(2026, 7, 1), to: new Date(2026, 9, 31) });
    expect(monthlyChartSummary(points, TODAY)).toMatch(/2 de 3 meses con datos; los meses sin datos interrumpen la línea/);
  });

  it('línea de meta solo dentro de la escala', () => {
    const scale = weightScale([
      { measuredOn: '2026-10-01', weightKg: 70 },
      { measuredOn: '2026-10-02', weightKg: 74 },
    ]);
    const size = { width: 100, height: 50, padding: 5 };
    expect(weightToY(72, scale!, size)).toBe(25);
    expect(weightToY(68, scale!, size)).toBeNull();
  });
});
