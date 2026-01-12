import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasMinimumRole, type Role } from '@/lib/constants/roles';

// =============================================================================
// Route Configuration
// =============================================================================

// Routes that require authentication AND organizer/admin role
const dashboardRoutes = ['/dashboard'];

// Routes that require authentication only (any role)
const vendorRoutes = ['/vendor'];

// Routes that should redirect to appropriate portal if already authenticated
const authRoutes = ['/login', '/signup'];

// =============================================================================
// Middleware
// =============================================================================

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // ---------------------------------------------------------------------------
  // Create Supabase client with cookie handling
  // ---------------------------------------------------------------------------
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ---------------------------------------------------------------------------
  // Get current user
  // ---------------------------------------------------------------------------
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ---------------------------------------------------------------------------
  // Route matching helpers
  // ---------------------------------------------------------------------------
  const isDashboardRoute = dashboardRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  const isVendorRoute = vendorRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  const isAuthRoute = authRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // ---------------------------------------------------------------------------
  // Auth check: Redirect unauthenticated users to login
  // ---------------------------------------------------------------------------
  if ((isDashboardRoute || isVendorRoute) && !user) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // ---------------------------------------------------------------------------
  // Role check: Dashboard routes require organizer or admin role
  // ---------------------------------------------------------------------------
  if (isDashboardRoute && user) {
    // Fetch user's role from database
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    // Default to 'vendor' if no role found (PGRST116 = no rows)
    const userRole: Role = roleError?.code === 'PGRST116' || !roleData ? 'vendor' : (roleData.role as Role);

    // Check if user has at least organizer role
    if (!hasMinimumRole(userRole, 'organizer')) {
      // User doesn't have permission - redirect to unauthorized page
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  }

  // ---------------------------------------------------------------------------
  // Auth routes: Redirect authenticated users to appropriate portal
  // ---------------------------------------------------------------------------
  if (isAuthRoute && user) {
    // For now, redirect to dashboard (Task 9.19 will add role-based redirect)
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return supabaseResponse;
}

// =============================================================================
// Matcher Configuration
// =============================================================================

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
