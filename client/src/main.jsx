import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeContextProvider } from './context/ThemeContext';
import { AppLogoProvider } from './context/AppLogoContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeContextProvider>
          <AppLogoProvider>
            <CssBaseline />
            <App />
          </AppLogoProvider>
        </ThemeContextProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
