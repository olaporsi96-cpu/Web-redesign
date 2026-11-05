import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import adminAuthorization from './utils/admin-authorization.cjs';
import accountArchiving from './utils/account-archiving.cjs';

const { hasAdminRouteAccess, isMainAdminProfile } = adminAuthorization;
const { profileSelectColumns } = accountArchiving;

function responseWithCookies(response, source) {
  source.cookies.getAll().forEach(({ name, value, ...options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  if (
    pathname === '/admin/login'
    || pathname.startsWith('/admin/login/')
    || pathname === '/admin/password-recovery'
    || pathname === '/student/login'
  ) {
    return NextResponse.next({ request });
  }

  if ((pathname === '/admin' || pathname.startsWith('/admin/'))
    && request.method === 'POST'
    && request.headers.has('next-action')) {
    return NextResponse.next({ request });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return new NextResponse(
      'Authentication is unavailable because Supabase environment variables are not configured.',
      { status: 503 },
    );
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && authError.name !== 'AuthSessionMissingError') {
    return responseWithCookies(new NextResponse(
      'Unable to verify the Supabase session for this request.',
      { status: 503 },
    ), response);
  }

  const isStudentRoute = pathname === '/student' || pathname.startsWith('/student/');

  if (!user) {
    return responseWithCookies(
      NextResponse.redirect(new URL(isStudentRoute ? '/student/login' : '/admin/login/main', request.url)),
      response,
    );
  }

  if (isStudentRoute) {
    const { data: studentProfile, error: studentProfileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (studentProfileError) {
      return responseWithCookies(new NextResponse(
        'Unable to verify the student profile.',
        { status: 503 },
      ), response);
    }
    if (studentProfile?.role !== 'student') {
      return responseWithCookies(
        NextResponse.redirect(new URL('/student/login?error=unauthorized', request.url)),
        response,
      );
    }

    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (studentError) {
      return responseWithCookies(new NextResponse(
        'Unable to verify student portal access.',
        { status: 503 },
      ), response);
    }
    if (!student) {
      return responseWithCookies(
        NextResponse.redirect(new URL('/student/login?error=inactive', request.url)),
        response,
      );
    }
    return response;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(profileSelectColumns('role'))
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return responseWithCookies(new NextResponse(
      'Unable to verify the Admin profile because the profile query failed.',
      { status: 503 },
    ), response);
  }

  if (!profile) {
    return responseWithCookies(
      NextResponse.redirect(new URL('/admin/login/main?error=unauthorized', request.url)),
      response,
    );
  }

  if (!isMainAdminProfile(profile) && profile.role !== 'sub_admin') {
    return responseWithCookies(
      NextResponse.redirect(new URL('/admin/login/main?error=unauthorized', request.url)),
      response,
    );
  }

  let permissions = [];
  if (!isMainAdminProfile(profile)) {
    const { data: permissionRows, error: permissionsError } = await supabase
      .from('admin_permissions')
      .select('permission_key')
      .eq('profile_id', user.id);
    if (permissionsError) {
      return responseWithCookies(new NextResponse(
        'Unable to verify the Sub-Admin permissions for this request.',
        { status: 503 },
      ), response);
    }
    permissions = permissionRows.map((row) => row.permission_key);
  }

  if (!hasAdminRouteAccess(profile, pathname, permissions)) {
    const loginPath = profile.role === 'sub_admin'
      ? '/admin/login/sub-admin?error=unauthorized'
      : '/admin/login/main?error=unauthorized';
    return responseWithCookies(NextResponse.redirect(new URL(loginPath, request.url)), response);
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/student/:path*'],
};
