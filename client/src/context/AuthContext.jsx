import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import api from '../api';

const AuthContext = createContext({ user: null, token: null, login: async () => {}, logout: () => {} });

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('iproject_token') || null);
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('iproject_user') || 'null');
    } catch {
      return null;
    }
  });

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('iproject_token', data.token);
    localStorage.setItem('iproject_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('iproject_token');
    localStorage.removeItem('iproject_user');
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((nextUser) => {
    setUser(nextUser);
    localStorage.setItem('iproject_user', JSON.stringify(nextUser));
  }, []);

  const value = useMemo(() => ({ user, token, login, logout, updateUser, isAuthenticated: Boolean(token) }), [user, token, login, logout, updateUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
