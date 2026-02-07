import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

type Role = Database['public']['Enums']['user_role']

// Routes that require authentication
const protectedRoutes = ['/dashboard', '/vendor-dashboard']

// Routes that should redirect to dashboard if already authenticated
const authRoutes = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Get the current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Check if the current path is a protected route
  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )

  // Check if the current path is an auth route
  const isAuthRoute = authRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )

  // Redirect unauthenticated users away from protected routes
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Fetch the user's role for role-based routing decisions
  let role: Role = 'vendor'
  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    // Default to 'vendor' if profile doesn't exist yet (e.g. trigger hasn't fired)
    role = profile?.role ?? 'vendor'
  }

  // Role-based route redirects (only for authenticated users)
  if (user) {
    // Vendors accessing organizer dashboard → send to vendor dashboard
    const isOrganizerRoute =
      pathname === '/dashboard' || pathname.startsWith('/dashboard/')
    if (role === 'vendor' && isOrganizerRoute) {
      return NextResponse.redirect(new URL('/vendor-dashboard', request.url))
    }

    // Non-admins accessing /dashboard/team → send back to dashboard
    const isTeamRoute =
      pathname === '/dashboard/team' || pathname.startsWith('/dashboard/team/')
    if (role !== 'admin' && isTeamRoute) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Redirect away from auth routes to the appropriate dashboard
    if (isAuthRoute) {
      const destination =
        role === 'vendor' ? '/vendor-dashboard' : '/dashboard'
      return NextResponse.redirect(new URL(destination, request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
