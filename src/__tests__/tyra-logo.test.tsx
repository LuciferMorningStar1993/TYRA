import { StyleSheet } from 'react-native';
import type { Root } from 'test-renderer';

import { TyraLogo } from '@/components/tyra-logo';
import {
  BRAND_CYAN,
  LOGO_ASPECT_RATIO,
  logoTintColor,
  MIN_FULL_LOGO_HEIGHT,
  resolveLogoVariant,
} from '@/design/brand';
import { contrastRatio, WCAG_AA } from '@/design/contrast';
import { PALETTE_IDS, PALETTES, type ColorTokens } from '@/design/palettes';
import { useTheme } from '@/design/theme-provider';
import { byLabel, render } from '@/test-utils/render';

jest.mock('@/design/theme-provider', () => ({ useTheme: jest.fn() }));

const SURFACES: (keyof ColorTokens)[] = ['background', 'surface', 'surfaceElevated', 'surfaceMuted'];
const VARIANTS = PALETTE_IDS.flatMap((id) => [[id, 'light'] as const, [id, 'dark'] as const]);

function useScheme(id: (typeof PALETTE_IDS)[number], scheme: 'light' | 'dark') {
  jest.mocked(useTheme).mockReturnValue({
    isDark: scheme === 'dark',
    colors: PALETTES[id][scheme],
  } as ReturnType<typeof useTheme>);
}

function image(root: Root) {
  const [node] = root.container.queryAll((n) => n.props.source !== undefined, { matchDeepestOnly: true });
  if (!node) throw new Error('No se encontró la imagen del logo');
  return { props: node.props, style: StyleSheet.flatten(node.props.style) };
}

describe.each(VARIANTS)('logo en %s (%s)', (id, scheme) => {
  const colors = PALETTES[id][scheme];
  const shown = scheme === 'dark' ? BRAND_CYAN : colors.textPrimary;

  it.each(SURFACES)('el color del logo contrasta ≥ 3:1 sobre %s', (surface) => {
    expect(logoTintColor(scheme === 'dark', colors) ?? BRAND_CYAN).toBe(shown);
    expect(contrastRatio(shown, colors[surface])).toBeGreaterThanOrEqual(WCAG_AA.nonText);
  });

  it('oscuro conserva el cian original; claro tiñe con textPrimary', async () => {
    useScheme(id, scheme);
    const root = await render(<TyraLogo height={48} />);
    expect(image(root).style.tintColor).toBe(scheme === 'dark' ? undefined : colors.textPrimary);
  });
});

describe('TyraLogo', () => {
  beforeEach(() => useScheme('indigo', 'dark'));

  it('respeta la proporción original del asset', async () => {
    const root = await render(<TyraLogo variant="full" height={120} />);
    expect(image(root).style).toMatchObject({ height: 120, width: 120 * LOGO_ASPECT_RATIO.full });
  });

  it('el logo completo pequeño cae al emblema para no dejar «TYRA» diminuto', async () => {
    expect(resolveLogoVariant('full', MIN_FULL_LOGO_HEIGHT - 1)).toBe('emblem');
    expect(resolveLogoVariant('full', MIN_FULL_LOGO_HEIGHT)).toBe('full');
    const root = await render(<TyraLogo variant="full" height={40} />);
    expect(image(root).style.width).toBeCloseTo(40 * LOGO_ASPECT_RATIO.emblem);
  });

  it('tiene etiqueta accesible «TYRA»', async () => {
    const root = await render(<TyraLogo height={48} />);
    const [logo] = byLabel(root, 'TYRA');
    expect(logo?.props.accessibilityRole).toBe('image');
  });

  it('decorativo: oculto a lectores de pantalla', async () => {
    const root = await render(<TyraLogo height={48} decorative />);
    expect(byLabel(root, 'TYRA')).toHaveLength(0);
    expect(image(root).props.accessibilityElementsHidden).toBe(true);
  });
});
