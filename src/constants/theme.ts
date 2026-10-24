import { useColorScheme } from 'react-native';

const palette = {
  light: {
    background: '#F6F7F9',
    surface: '#FFFFFF',
    text: '#11181C',
    textMuted: '#5F6B76',
    border: '#DCE1E6',
    primary: '#1F7A5C',
    primaryText: '#FFFFFF',
    danger: '#C0392B',
  },
  dark: {
    background: '#0E1114',
    surface: '#181C20',
    text: '#ECEDEE',
    textMuted: '#9BA5AE',
    border: '#2C3238',
    primary: '#3DBB8C',
    primaryText: '#0E1114',
    danger: '#E57373',
  },
};

export type ThemeColors = (typeof palette)['light'];

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 8, md: 12, lg: 20 };

export function useThemeColors(): ThemeColors {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}
