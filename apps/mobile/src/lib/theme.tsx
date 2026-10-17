import { fonts as fontNames, palette, tones, type ThemeColors, type Tone } from '@raqeem/shared';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { storage } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';

/** أسماء العائلات = أسماء الملفات (نفسها في Expo Go حيث تُحمَّل وقت التشغيل، وفي APK حيث تُضمَّن) */
export const fonts = {
  regular: fontNames.sans[400],
  medium: fontNames.sans[500],
  bold: fontNames.sans[700],
  black: fontNames.sans[900],
  displayBold: fontNames.display[700],
  display: fontNames.display[900],
  serif: fontNames.text[400],
} as const;

export const fontAssets = {
  [fonts.regular]: require('../../assets/fonts/thmanyahsans-Regular.otf'),
  [fonts.medium]: require('../../assets/fonts/thmanyahsans-Medium.otf'),
  [fonts.bold]: require('../../assets/fonts/thmanyahsans-Bold.otf'),
  [fonts.black]: require('../../assets/fonts/thmanyahsans-Black.otf'),
  [fonts.displayBold]: require('../../assets/fonts/thmanyahserifdisplay-Bold.otf'),
  [fonts.display]: require('../../assets/fonts/thmanyahserifdisplay-Black.otf'),
  [fonts.serif]: require('../../assets/fonts/thmanyahseriftext-Regular.otf'),
};

export type ToneColors = Record<Tone, { ink: string; bg: string }>;

interface ThemeValue {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  dark: boolean;
  c: ThemeColors;
  tone: ToneColors;
}

const Ctx = createContext<ThemeValue | null>(null);
const KEY = 'raqeem.theme';

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    storage.get<ThemeMode>(KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
    });
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const dark = mode === 'dark' || (mode === 'system' && system === 'dark');
    return {
      mode,
      setMode: (m) => {
        setModeState(m);
        storage.set(KEY, m);
      },
      dark,
      c: dark ? palette.dark : palette.light,
      tone: dark ? tones.dark : tones.light,
    };
  }, [mode, system]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside provider');
  return v;
}
