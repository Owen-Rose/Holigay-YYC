'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LoginForm } from '@/components/auth/login-form'
import type { LoginInput } from '@/lib/validations/auth'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(data: LoginInput) {
    setError(null)

    try {
      // TODO: Replace with actual auth action from Task 3.3
      // For now, simulate a brief delay and redirect
      console.log('Login attempt:', data.email)

      // Placeholder: In Task 3.3, this will call the signIn server action
      // const result = await signIn(data)
      // if (result.error) {
      //   setError(result.error)
      //   return
      // }

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Redirect to dashboard on success
      router.push('/dashboard')
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      console.error('Login error:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="mt-2 text-sm text-gray-600">
          Sign in to access your organizer dashboard
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Login Form */}
      <LoginForm onSubmit={handleSubmit} />

      {/* Links */}
      <div className="text-center text-sm">
        <span className="text-gray-600">Don&apos;t have an account? </span>
        <Link
          href="/signup"
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          Sign up
        </Link>
      </div>
    </div>
  )
}
