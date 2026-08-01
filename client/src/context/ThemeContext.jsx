import { createContext, useContext, useMemo, useState } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { buildTheme } from '../theme/md3Theme';

const ThemeContext = createContext({ mode: 'light', toggleMode: () => {} });

export function ThemeContextProvider({ children }) {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [manualMode, setManualMode] = useState(null);
  const mode = manualMode || (systemDark ? 'dark' : 'light');
  const theme = useMemo(() => buildTheme(mode), [mode]);
  const value = useMemo(
    () => ({ mode, toggleMode: () => setManualMode((prev) => (prev === 'dark' ? 'light' : prev === 'light' ? 'dark' : systemDark ? 'light' : 'dark')) }),
    [mode, systemDark]
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
