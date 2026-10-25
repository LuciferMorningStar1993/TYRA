import { HealthSummaryCard } from '@/components/health-summary-card';
import { ThemeProvider } from '@/design/theme-provider';
import { GOAL_POLICY, HEALTH_AGE_POLICY, healthSummary, type HealthProfile } from '@/lib/health';
import { HEALTH_HELP } from '@/lib/health-help';
import { SessionProvider } from '@/providers/session-provider';
import { installMemoryStorage } from '@/test-utils/memory-storage';
import { allText, byLabel, press, render } from '@/test-utils/render';

jest.mock('@/lib/supabase', () => jest.requireActual('@/test-utils/fake-supabase'));
jest.mock('@/lib/profile-api', () => ({ loadProfile: jest.fn(), saveProfile: jest.fn() }));

const TODAY = new Date(2026, 9, 24);

async function cardText(profile: HealthProfile) {
  const summary = healthSummary(profile, TODAY);
  const root = await render(
    <SessionProvider>
      <ThemeProvider>
        <HealthSummaryCard summary={summary} weightKg={profile.weightKg} />
      </ThemeProvider>
    </SessionProvider>,
  );
  return allText(root.container);
}

beforeEach(() => installMemoryStorage());

const base: HealthProfile = {
  sex: 'male',
  birthDate: new Date(1993, 9, 24),
  heightCm: 175,
  weightKg: 80,
  activityLevel: 'moderate',
  goal: 'lose',
};

it('caso reportado: explica la estimación inválida y no muestra números negativos', async () => {
  const text = await cardText({
    sex: 'female',
    birthDate: new Date(1948, 9, 24),
    heightCm: 50,
    weightKg: 20,
    activityLevel: 'sedentary',
    goal: 'lose',
  });
  expect(text).toMatch(/no da una estimación válida/);
  expect(text).not.toMatch(/-\d/);
  expect(text).not.toMatch(/Meta diaria/);
});

it('adulto con meta aplicable: muestra meta y gasto por separado', async () => {
  const text = await cardText(base);
  expect(text).toMatch(/Meta diaria para bajar de peso/);
  expect(text).toMatch(/Gasto diario estimado/);
});

it('déficit bajo el basal: muestra el gasto y explica por qué no hay meta', async () => {
  const text = await cardText({ ...base, activityLevel: 'sedentary' });
  expect(text).toMatch(/Gasto diario estimado/);
  expect(text).toMatch(/quedaría por debajo de tu gasto basal/);
  expect(text).not.toMatch(/Meta diaria/);
});

it('objetivo no aplicable al IMC: explica', async () => {
  const text = await cardText({ ...base, weightKg: 70 });
  expect(text).toMatch(/Con tu IMC actual no ofrecemos una meta automática/);
});

it('adolescente: sin IMC de adulto ni calorías, con explicación', async () => {
  const text = await cardText({ ...base, birthDate: new Date(2010, 0, 1) });
  expect(text).toMatch(/a partir de los 20 años/);
  expect(text).not.toMatch(/IMC/);
  expect(text).not.toMatch(/kcal/);
});

describe('ayudas accesibles', () => {
  async function renderCard(profile: HealthProfile) {
    const summary = healthSummary(profile, TODAY);
    return render(
      <SessionProvider>
        <ThemeProvider>
          <HealthSummaryCard summary={summary} weightKg={profile.weightKg} />
        </ThemeProvider>
      </SessionProvider>,
    );
  }

  it('cada indicador mostrado tiene su ayuda, cerrada al inicio, con fuente al abrirla', async () => {
    const root = await renderCard(base);
    for (const help of [HEALTH_HELP.bmi, HEALTH_HELP.bmr, HEALTH_HELP.tdee, HEALTH_HELP.target]) {
      const [button] = byLabel(root, help.title);
      expect(button).toBeDefined();
      expect(allText(root.container)).not.toContain(help.body);
      await press(button);
      expect(allText(root.container)).toContain(help.body);
      expect(allText(root.container)).toContain(`Fuente: ${help.source}`);
    }
  });

  it('sin estimación de calorías no ofrece ayudas de gasto ni meta', async () => {
    const root = await renderCard({ ...base, birthDate: new Date(2012, 0, 1) });
    expect(byLabel(root, HEALTH_HELP.bmr.title)).toHaveLength(0);
    expect(byLabel(root, HEALTH_HELP.target.title)).toHaveLength(0);
  });

  it('los textos usan los valores de la política vigente', () => {
    expect(HEALTH_HELP.target.body).toContain(`resta ${Math.abs(GOAL_POLICY.lose.adjustmentKcal)} kcal`);
    expect(HEALTH_HELP.target.body).toContain(`suma ${GOAL_POLICY.gain.adjustmentKcal} kcal`);
    expect(HEALTH_HELP.bmi.body).toContain(`desde los ${HEALTH_AGE_POLICY.bmiCategories.minAge} años`);
  });
});
