'use client';

import { usePathname } from 'next/navigation';
import SiteHeader from './site-header';
import SiteFooter from './site-footer';
import ThemeToggle from './theme-toggle';

export default function SiteChrome({ children }) {
  const pathname = usePathname();
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');

  if (isAdminRoute) {
    const isAdminPortal = pathname.startsWith('/admin/login')
      || pathname === '/admin/password-recovery';

    return (
      <>
        {children}
        {isAdminPortal && <ThemeToggle className="portal-theme-toggle" />}
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="page-shell">{children}</main>
      <SiteFooter />
    </>
  );
}
