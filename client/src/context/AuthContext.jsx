import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import api from '../api';

const AuthContext = createContext({ user: null, token: null, login: async () => {}, logout: () => {} });

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('atlas_token') || null);
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('atlas_user') || 'null');
    } catch {
      return null;
    }
  });

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('atlas_token', data.token);
    localStorage.setItem('atlas_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_user');
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, token, login, logout, isAuthenticated: Boolean(token) }), [user, token, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
