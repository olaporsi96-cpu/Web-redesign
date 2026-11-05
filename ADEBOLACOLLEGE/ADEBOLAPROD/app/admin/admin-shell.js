'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAdmin } from './admin-provider';
import { createClient } from '../../utils/supabase/client';
import ThemeToggle from '../../components/theme-toggle';
import adminAuthorization from '../../utils/admin-authorization.cjs';

const { hasAdminRouteAccess } = adminAuthorization;

const navigation = [
  { label: 'Dashboard', href: '/admin', icon: '⌂', permission: 'view_dashboard' },
  { label: 'Courses', href: '/admin/courses', icon: '▤', permission: 'manage_courses' },
  { label: 'Lessons', href: '/admin/lessons', icon: '▷', permission: ['manage_lessons', 'publish_unpublish_lessons'] },
  { label: 'Course Materials', href: '/admin/materials', icon: '▧', permission: 'manage_course_materials' },
  { label: 'Students', href: '/admin/students', icon: '♙', permission: ['view_students', 'manage_student_records'] },
  { label: 'Results', href: '/admin/results', icon: '▦', permission: 'manage_results' },
  { label: 'Orders and Payments', href: '/admin/orders', icon: '◷', permission: 'view_orders_payments' },
  { label: 'Catalogue settings', href: '/admin/settings', icon: '⚙', permission: 'manage_catalogue_settings' },
  { label: 'E-Learning video', href: '/admin/media', icon: '▶', permission: 'manage_admin_users', mainAdminOnly: true },
  { label: 'School calendar', href: '/admin/calendar', icon: '▦', permission: 'manage_admin_users', mainAdminOnly: true },
  { label: 'Admin users', href: '/admin/users', icon: '♙', permission: 'manage_admin_users', mainAdminOnly: true },
  { label: 'Activity', href: '/admin/activity', icon: '◷', permission: 'view_dashboard', mainAdminOnly: true },
];

function isPortalPage(pathname) {
  return pathname === '/admin/login'
    || pathname.startsWith('/admin/login/')
    || pathname === '/admin/password-recovery';
}

function AdminAccessNotice({ denied = false, subAdmin = false }) {
  return (
    <div className="admin-access-page">
      <ThemeToggle className="portal-theme-toggle" />
      <div className="admin-auth-card">
        <Image src="/images/NewPics/Pix25-SchoolLogo.jpg" alt="Adebola College crest" width={90} height={92} />
        <span className="admin-auth-label">ADMIN ACCESS</span>
        <h1>{denied ? 'Access is not available' : 'Admin sign-in required'}</h1>
        <p>
          {denied
            ? 'This screen is not available to your account.'
            : 'Sign in with an authorized Admin account to continue.'}
        </p>
        <Link className="admin-button button-primary" href={subAdmin ? '/admin/login/sub-admin' : '/admin/login/main'}>
          Open Admin sign in
        </Link>
      </div>
    </div>
  );
}

export function AdminShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { adminProfile, canAdmin } = useAdmin();
  const [logoutError, setLogoutError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function logout() {
    setLogoutError('');
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        setLogoutError(`Unable to sign out: ${error.message}`);
        return;
      }

      router.replace('/admin/login/main');
      router.refresh();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Unable to sign out. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (isPortalPage(pathname)) return children;
  const canOpenRoute = hasAdminRouteAccess(adminProfile, pathname, adminProfile.permissions);
  if (!canOpenRoute) return <AdminAccessNotice denied subAdmin={adminProfile.role === 'sub_admin'} />;

  return (
    <div className={`admin-app${pathname === '/admin/results' ? ' admin-app-results' : ''}`}>
      <aside className="admin-sidebar">
        <Link href="/admin" className="admin-brand" aria-label="Adebola College admin dashboard">
          <Image src="/images/NewPics/Pix25-SchoolLogo.jpg" alt="Adebola College logo" width={42} height={43} />
          <span><strong>Adebola</strong><small>Learning Admin</small></span>
        </Link>
        <div className="admin-nav-label">WORKSPACE</div>
        <nav className="admin-nav" aria-label="Admin navigation">
          {navigation.filter((item) => (!item.mainAdminOnly || adminProfile.role === 'main_admin')
            && (Array.isArray(item.permission)
            ? item.permission.some((permission) => canAdmin(permission))
            : canAdmin(item.permission))).map((item) => {
            const active = item.href === '/admin'
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                className={`admin-nav-link${active ? ' is-active' : ''}`}
                href={item.href}
                key={item.href}
                aria-current={active ? 'page' : undefined}
              >
                <span className="admin-nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <Link href="/" className="admin-back-link">← Back to public website</Link>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-mobile-brand">
            <Image src="/images/NewPics/Pix25-SchoolLogo.jpg" alt="Adebola College logo" width={28} height={29} />
            <span>Adebola Learning Admin</span>
          </div>
          <ThemeToggle className="admin-theme-toggle" />
          <span className="admin-auth-label">{adminProfile.role === 'main_admin' ? 'MAIN ADMIN' : 'SUB-ADMIN'}</span>
          <div className="admin-user">
            <span className="admin-avatar" aria-hidden="true">{adminProfile.displayName.slice(0, 1)}</span>
            <span><strong>{adminProfile.displayName}</strong><small>{adminProfile.role === 'main_admin' ? 'Main Admin' : 'Sub-Admin'}</small></span>
          </div>
          <Link className="admin-button button-secondary admin-profile-link" href="/admin/profile">Profile</Link>
          <button className="admin-button button-secondary admin-logout" type="button" onClick={logout} disabled={isLoggingOut}>
            {isLoggingOut ? 'Signing out…' : 'Log out'}
          </button>
        </header>
        <main className="admin-content">
          {logoutError && <p className="admin-auth-error" role="alert">{logoutError}</p>}
          {children}
        </main>
      </div>
    </div>
  );
}
