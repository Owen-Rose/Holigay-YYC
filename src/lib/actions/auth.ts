'use server';

import { createClient } from '@/lib/supabase/server';
import { loginSchema, signupSchema } from '@/lib/validations/auth';
import type { LoginInput, SignupInput } from '@/lib/validations/auth';

// Response type for auth actions
export type AuthResponse = {
  error: string | null;
  success: boolean;
};

/**
 * Sign in a user with email and password
 */
export async function signIn(data: LoginInput): Promise<AuthResponse> {
  // Validate input
  const parsed = loginSchema.safeParse(data);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message || 'Invalid input',
      success: false,
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

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
 * Sign up a new user with email and password
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

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

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
