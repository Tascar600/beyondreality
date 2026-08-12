import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const loginFinance = async (username, password) => {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const loginClient = async (loginName, standPassword, location = '') => {
    const data = await api('/auth/client-login', {
      method: 'POST',
      body: JSON.stringify({
        first_name: String(loginName || '').trim(),
        password: String(standPassword || '').trim(),
        location: location || undefined,
      }),
    });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, loginFinance, loginClient, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
