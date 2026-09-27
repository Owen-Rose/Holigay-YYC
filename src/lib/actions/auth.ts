'use server';

import { createClient } from '@/lib/supabase/server';
import { loginSchema, setPasswordSchema, signupSchema } from '@/lib/validations/auth';
import type { LoginInput, SetPasswordInput, SignupInput } from '@/lib/validations/auth';
import { hasMinimumRole, type Role } from '@/lib/constants/roles';
import { requireRole } from '@/lib/auth/roles';

// Response type for auth actions
export type AuthResponse = {
  error: string | null;
  success: boolean;
};

// Extended response type for signIn that includes role-based redirect
export type SignInResponse = AuthResponse & {
  redirectTo: string | null;
};

export type SetPasswordResponse = {
  success: boolean;
  error: string | null;
  data: { redirectTo: '/dashboard' | '/vendor-dashboard' } | null;
};

/**
 * Sign in a user with email and password
 *
 * After successful login, fetches the user's role and returns an appropriate
 * redirect URL based on their role:
 * - organizer/admin → /dashboard
 * - vendor (default) → /vendor
 */
export async function signIn(data: LoginInput): Promise<SignInResponse> {
  // Validate input
  const parsed = loginSchema.safeParse(data);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message || 'Invalid input',
      success: false,
      redirectTo: null,
    };
  }

  const supabase = await createClient();

  // Attempt to sign in
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      error: error.message,
      success: false,
      redirectTo: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Fetch user role for redirect determination
  // ---------------------------------------------------------------------------
  let redirectTo = '/vendor-dashboard'; // Default to vendor dashboard

  if (authData.user) {
    const { data: roleData, error: roleError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    // If user has organizer or admin role, redirect to dashboard
    // Default to 'vendor' if no role found (PGRST116 = no rows)
    const userRole: Role =
      roleError?.code === 'PGRST116' || !roleData ? 'vendor' : (roleData.role as Role);

    if (hasMinimumRole(userRole, 'organizer')) {
      redirectTo = '/dashboard';
    }
  }

  return {
    error: null,
    success: true,
    redirectTo,
  };
}

/**
 * Sign up a new user with email and password
 *
 * After successful signup, automatically assigns the 'vendor' role to the new user.
 * Role assignment failures are logged but don't block the signup process.
 */
export async function signUp(data: SignupInput): Promise<AuthResponse> {
  // Validate input
  const parsed = signupSchema.safeParse(data);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message || 'Invalid input',
      success: false,
    };
  }

  const supabase = await createClient();

  const { data: authData, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      error: error.message,
      success: false,
    };
  }

  // Role assignment is handled by the handle_new_user database trigger,
  // which auto-creates a user_profiles row with role='vendor' on signup.

  return {
    error: null,
    success: true,
  };
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<AuthResponse> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    return {
      error: error.message,
      success: false,
    };
  }

  return {
    error: null,
    success: true,
  };
}

/**
 * Set the signed-in user's password.
 *
 * Reached from /set-password after an invite or recovery link has signed the
 * user in via /auth/confirm. `requireRole('vendor')` is the minimum role, so
 * every signed-in user passes; its role picks the dashboard to land on.
 */
export async function setPassword(data: SetPasswordInput): Promise<SetPasswordResponse> {
  const parsed = setPasswordSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
      data: null,
    };
  }

  const auth = await requireRole('vendor');
  if (!auth.success || !auth.data) {
    return { success: false, error: auth.error, data: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { success: false, error: error.message, data: null };
  }

  return {
    success: true,
    error: null,
    data: {
      redirectTo: hasMinimumRole(auth.data.role, 'organizer') ? '/dashboard' : '/vendor-dashboard',
    },
  };
}
