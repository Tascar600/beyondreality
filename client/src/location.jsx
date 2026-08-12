import React, { createContext, useContext, useEffect, useState } from 'react';

const LocationCtx = createContext(null);
const STORAGE_KEY = 'br_location';

export function LocationProvider({ children }) {
  const [location, setLocationState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'Harare');

  const setLocation = (loc) => {
    setLocationState(loc);
    localStorage.setItem(STORAGE_KEY, loc);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, location);
  }, [location]);

  return (
    <LocationCtx.Provider value={{ location, setLocation }}>
      {children}
    </LocationCtx.Provider>
  );
}

export function useLocation() {
  return useContext(LocationCtx);
}

export const LOCATIONS = ['Harare', 'Kadoma', 'Norton'];
