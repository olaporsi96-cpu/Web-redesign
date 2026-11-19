const routePermissions = [
  ['/admin/courses', ['manage_courses', 'manage_courses_lessons']],
  ['/admin/lessons', ['manage_lessons', 'manage_courses_lessons', 'publish_unpublish_lessons']],
  ['/admin/materials', ['manage_course_materials']],
  ['/admin/students', ['view_students', 'manage_student_records']],
  ['/admin/results', ['manage_results']],
  ['/admin/orders', ['view_orders_payments']],
  ['/admin/settings', ['manage_catalogue_settings']],
  ['/admin/activity', ['view_dashboard']],
  ['/admin', ['view_dashboard']],
];

const mainAdminOnlyRoutes = [
  '/admin/users',
  '/admin/activity',
  '/admin/media',
  '/admin/calendar',
];

function requiredPermissions(pathname) {
  if (pathname === '/admin/profile' || pathname.startsWith('/admin/profile/')) return null;
  if (mainAdminOnlyRoutes.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return ['main_admin'];
  }

  const route = routePermissions.find(([path]) => (
    pathname === path || (path !== '/admin' && pathname.startsWith(`${path}/`))
  ));
  return route?.[1] || [];
}

function isMainAdminProfile(profile) {
  return profile?.role === 'main_admin';
}

function isAdminEnabledProfile(profile) {
  return profile?.admin_enabled === true;
}

function hasAdminPermission(profile, permissions = [], requiredPermission) {
  if (!isAdminEnabledProfile(profile)) return false;
  if (isMainAdminProfile(profile)) return true;
  if (
    profile?.role !== 'sub_admin'
    || (profile.sub_admin_archived_at && process.env.SUB_ADMIN_ARCHIVING_ENABLED === 'true')
    || typeof requiredPermission !== 'string'
  ) return false;

  const granted = new Set(permissions);
  return granted.has(requiredPermission)
    || (requiredPermission === 'manage_courses' && granted.has('manage_courses_lessons'))
    || (requiredPermission === 'manage_lessons' && granted.has('manage_courses_lessons'));
}

function effectiveAdminPermissions(permissions = []) {
  const effective = new Set(permissions);
  if (effective.has('manage_courses_lessons')) {
    effective.add('manage_courses');
    effective.add('manage_lessons');
  }
  return [...effective];
}

function hasAdminRouteAccess(profile, pathname, permissions = []) {
  if (!isAdminEnabledProfile(profile)) return false;
  if (isMainAdminProfile(profile)) return true;
  if (
    profile?.role !== 'sub_admin'
    || (profile.sub_admin_archived_at && process.env.SUB_ADMIN_ARCHIVING_ENABLED === 'true')
  ) return false;

  const required = requiredPermissions(pathname);
  if (required === null) return true;
  if (!required.length || required.includes('main_admin')) return false;

  return required.some((permission) => hasAdminPermission(profile, permissions, permission));
}

function getAdminLandingPath(profile, permissions = []) {
  if (!isAdminEnabledProfile(profile)) return '/admin/login/sub-admin';
  const routes = [
    '/admin',
    '/admin/courses',
    '/admin/lessons',
    '/admin/materials',
    '/admin/students',
    '/admin/results',
    '/admin/orders',
    '/admin/settings',
    '/admin/profile',
  ];
  return routes.find((pathname) => hasAdminRouteAccess(profile, pathname, permissions))
    || '/admin/login/sub-admin';
}

module.exports = {
  effectiveAdminPermissions,
  getAdminLandingPath,
  hasAdminPermission,
  hasAdminRouteAccess,
  isAdminEnabledProfile,
  isMainAdminProfile,
  requiredPermissions,
};
