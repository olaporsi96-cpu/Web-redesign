'use client';

import { usePathname } from 'next/navigation';
import SiteHeader from './site-header';
import SiteFooter from './site-footer';
import ThemeToggle from './theme-toggle';
import { useEffect, useState } from 'react';
import { DEFAULT_WEBSITE_SETTINGS } from '../utils/website-settings.cjs';
import { WebsiteSettingsProvider } from './website-settings-context';

export default function SiteChrome({ children }) {
  const pathname = usePathname();
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const [websiteSettings, setWebsiteSettings] = useState(DEFAULT_WEBSITE_SETTINGS);

  useEffect(() => {
    if (isAdminRoute) return undefined;
    let active = true;
    async function loadSettings() {
      try {
        const response = await fetch('/api/website-settings', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Website settings request returned HTTP ${response.status}.`);
        const result = await response.json();
        if (active && result.settings) {
          setWebsiteSettings({ ...DEFAULT_WEBSITE_SETTINGS, ...result.settings });
        }
      } catch (error) {
        console.error('Unable to refresh public website settings.', error);
      }
    }
    loadSettings();
    return () => { active = false; };
  }, [isAdminRoute]);

  if (isAdminRoute) {
    const isAdminPortal = pathname.startsWith('/admin/login')
      || pathname === '/admin/password-recovery';

    return (
      <WebsiteSettingsProvider value={websiteSettings}>
        {children}
        {isAdminPortal && <ThemeToggle className="portal-theme-toggle" />}
      </WebsiteSettingsProvider>
    );
  }

  return (
    <WebsiteSettingsProvider value={websiteSettings}>
      <SiteHeader />
      <main className="page-shell">{children}</main>
      <SiteFooter />
    </WebsiteSettingsProvider>
  );
}
