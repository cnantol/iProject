import { createContext, useContext, useEffect, useState } from 'react';

const AppLogoContext = createContext({ src: '/logo.svg', setLogo: () => {}, resetLogo: () => {} });

export function AppLogoProvider({ children }) {
  const [src, setSrc] = useState('/logo.svg');

  const refresh = () => {
    fetch('/api/app-logo')
      .then((res) => res.json())
      .then((data) => setSrc(data && typeof data.logo === 'string' && data.logo ? data.logo : '/logo.svg'))
      .catch(() => setSrc('/logo.svg'));
  };

  useEffect(() => {
    refresh();
  }, []);

  const setLogo = (logo) => setSrc(logo || '/logo.svg');
  const resetLogo = () => setSrc('/logo.svg');

  return <AppLogoContext.Provider value={{ src, setLogo, resetLogo }}>{children}</AppLogoContext.Provider>;
}

export function useAppLogo() {
  return useContext(AppLogoContext);
}
