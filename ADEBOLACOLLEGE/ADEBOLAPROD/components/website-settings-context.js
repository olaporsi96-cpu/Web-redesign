'use client';

import { createContext, useContext } from 'react';

const WebsiteSettingsContext = createContext(null);

export function WebsiteSettingsProvider({ value, children }) {
  return <WebsiteSettingsContext.Provider value={value}>{children}</WebsiteSettingsContext.Provider>;
}

export function useWebsiteSettings() {
  return useContext(WebsiteSettingsContext);
}
