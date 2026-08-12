import React, { createContext, useContext, useEffect, useState } from 'react';

export const THEMES = [
  { id: 'dark', label: 'Dark (Default)' },
  { id: 'light', label: 'Light' },
  { id: 'basic', label: 'Basic' },
  { id: 'professional', label: 'Professional' },
  { id: 'ocean', label: 'Ocean Blue' },
  { id: 'forest', label: 'Forest Green' },
  { id: 'sunset', label: 'Sunset Warm' },
];

const ThemeContext = createContext({ theme: 'dark', setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('br_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('br_theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
