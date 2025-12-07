'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SignupForm } from '@/components/auth/signup-form'
import type { SignupInput } from '@/lib/validations/auth'

export default function SignupPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(data: SignupInput) {
    setError(null)

    try {
      // TODO: Replace with actual auth action from Task 3.3
      // For now, simulate a brief delay and redirect
      console.log('Signup attempt:', data.email)

      // Placeholder: In Task 3.3, this will call the signUp server action
      // const result = await signUp(data)
      // if (result.error) {
      //   setError(result.error)
      //   return
      // }

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Redirect to login page with success message
      // In Task 3.3, might redirect to email verification or directly to dashboard
      router.push('/login')
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      console.error('Signup error:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Create an account</h1>
        <p className="mt-2 text-sm text-gray-600">
          Sign up to manage vendor applications
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Signup Form */}
      <SignupForm onSubmit={handleSubmit} />

      {/* Links */}
      <div className="text-center text-sm">
        <span className="text-gray-600">Already have an account? </span>
        <Link
          href="/login"
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          Sign in
        </Link>
      </div>
    </div>
  )
}
