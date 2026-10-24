import { Platform, type ViewProps } from 'react-native';

/** Oculta un elemento decorativo a lectores de pantalla en iOS, Android y web. */
export const decorative: ViewProps = Platform.select<ViewProps>({
  web: { 'aria-hidden': true },
  default: { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' },
});
