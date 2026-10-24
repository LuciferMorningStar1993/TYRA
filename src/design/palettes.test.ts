import { contrastRatio, WCAG_AA } from './contrast';
import { draftPalette, PALETTE_IDS, PALETTES, suggestedPalette, type ColorTokens } from './palettes';

type Pair = [foreground: keyof ColorTokens, background: keyof ColorTokens, minimum: number];

const SURFACES: (keyof ColorTokens)[] = ['background', 'surface', 'surfaceElevated', 'surfaceMuted'];

// Pares que aparecen en la interfaz y su mínimo WCAG AA.
const PAIRS: Pair[] = [
  ...SURFACES.flatMap((bg): Pair[] => [
    ['textPrimary', bg, WCAG_AA.text],
    ['textSecondary', bg, WCAG_AA.text],
    ['primary', bg, WCAG_AA.text], // links y botones ghost/outline
    ['error', bg, WCAG_AA.text],
    ['success', bg, WCAG_AA.text],
    ['warning', bg, WCAG_AA.text],
    ['borderStrong', bg, WCAG_AA.nonText], // bordes de inputs y controles
    ['focusRing', bg, WCAG_AA.nonText],
  ]),
  ['textPrimary', 'primarySoft', WCAG_AA.text],
  ['primary', 'primarySoft', WCAG_AA.text], // tab activa
  ['onPrimary', 'primary', WCAG_AA.text],
  ['onPrimary', 'primaryPressed', WCAG_AA.text],
  ['onSecondary', 'secondary', WCAG_AA.text],
  ['onSecondary', 'secondaryPressed', WCAG_AA.text],
  ['onAccent', 'accent', WCAG_AA.text],
  ['onError', 'error', WCAG_AA.text],
];

describe.each(PALETTE_IDS.flatMap((id) => [[id, 'light'] as const, [id, 'dark'] as const]))(
  'paleta %s (%s) cumple WCAG AA',
  (id, scheme) => {
    const tokens = PALETTES[id][scheme];
    it.each(PAIRS)('%s sobre %s ≥ %d:1', (fg, bg, minimum) => {
      expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(minimum);
    });
  },
);

describe('suggestedPalette', () => {
  it.each([
    ['female', 'aurora'],
    ['male', 'nordic'],
    ['other', 'indigo'],
    ['unspecified', 'indigo'],
    [null, 'indigo'],
  ] as const)('%s → %s', (gender, palette) => {
    expect(suggestedPalette(gender)).toBe(palette);
  });
});

describe('draftPalette (registro y onboarding)', () => {
  it('sin elección explícita sigue la sugerencia del género', () => {
    expect(draftPalette(null, 'female')).toBe('aurora');
    expect(draftPalette(null, 'male')).toBe('nordic');
  });

  it('la elección explícita gana aunque el género cambie después', () => {
    expect(draftPalette('indigo', 'female')).toBe('indigo');
    expect(draftPalette('aurora', 'male')).toBe('aurora');
  });
});
