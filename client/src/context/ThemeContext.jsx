import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { buildTheme } from '../theme/md3Theme';

const STORAGE_KEY = 'iproject_theme_preference';
const ThemeContext = createContext({ mode: 'light', preference: 'system', setPreference: () => {} });

export function ThemeContextProvider({ children }) {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [preference, setPreferenceState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return ['light', 'dark', 'system'].includes(saved) ? saved : 'system';
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, preference);
  }, [preference]);
  const mode = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  const theme = useMemo(() => buildTheme(mode), [mode]);
  const setPreference = (value) => {
    if (['light', 'dark', 'system'].includes(value)) setPreferenceState(value);
  };
  const value = useMemo(
    () => ({ mode, preference, setPreference }),
    [mode, preference]
  );
  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  return useContext(ThemeContext);
}
