'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { getCurrentUserRole } from '@/lib/actions/roles'
import type { Role } from '@/lib/constants/roles'

// Context value type
type RoleContextValue = {
  role: Role | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

// Create context with undefined default (must be used within provider)
const RoleContext = createContext<RoleContextValue | undefined>(undefined)

// Provider props
type RoleProviderProps = {
  children: ReactNode
}

/**
 * Provider component that fetches and shares user role across the app.
 * Wrap your layout or app with this to enable useRole() hook.
 */
export function RoleProvider({ children }: RoleProviderProps) {
  const [role, setRole] = useState<Role | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Refetch function for manual refresh
  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const result = await getCurrentUserRole()

    if (result.success && result.data) {
      setRole(result.data.role)
    } else {
      setError(result.error)
      setRole(null)
    }

    setIsLoading(false)
  }, [])

  // Fetch role on mount
  useEffect(() => {
    let cancelled = false

    async function fetchRole() {
      const result = await getCurrentUserRole()

      // Don't update state if component unmounted
      if (cancelled) return

      if (result.success && result.data) {
        setRole(result.data.role)
      } else {
        setError(result.error)
        setRole(null)
      }

      setIsLoading(false)
    }

    fetchRole()

    return () => {
      cancelled = true
    }
  }, [])

  const value: RoleContextValue = {
    role,
    isLoading,
    error,
    refetch,
  }

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

/**
 * Hook to access the current user's role.
 * Must be used within a RoleProvider.
 *
 * @returns { role, isLoading, error, refetch }
 *
 * @example
 * const { role, isLoading } = useRole()
 * if (isLoading) return <Spinner />
 * if (role === 'admin') return <AdminPanel />
 */
export function useRole(): RoleContextValue {
  const context = useContext(RoleContext)

  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider')
  }

  return context
}
