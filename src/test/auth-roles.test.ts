import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCurrentUserRole, requireRole, isOrganizerOrAdmin } from '@/lib/auth/roles'

// Mock the Supabase server client
const mockGetUser = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: () => mockGetUser(),
    },
    from: () => ({
      select: (...args: unknown[]) => {
        mockSelect(...args)
        return {
          eq: (...eqArgs: unknown[]) => {
            mockEq(...eqArgs)
            return { single: () => mockSingle() }
          },
        }
      },
    }),
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

// =============================================================================
// getCurrentUserRole
// =============================================================================

describe('getCurrentUserRole', () => {
  it('returns null when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const role = await getCurrentUserRole()
    expect(role).toBeNull()
  })

  it('returns the role from user_profiles', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
    mockSingle.mockResolvedValue({
      data: { role: 'organizer' },
      error: null,
    })

    const role = await getCurrentUserRole()

    expect(role).toBe('organizer')
    expect(mockSelect).toHaveBeenCalledWith('role')
    expect(mockEq).toHaveBeenCalledWith('id', 'user-123')
  })

  it('returns null when profile does not exist', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    })

    const role = await getCurrentUserRole()
    expect(role).toBeNull()
  })
})

// =============================================================================
// requireRole
// =============================================================================

describe('requireRole', () => {
  it('returns the role when it matches an allowed role', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
    mockSingle.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    })

    const role = await requireRole(['organizer', 'admin'])
    expect(role).toBe('admin')
  })

  it('throws when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    await expect(requireRole(['admin'])).rejects.toThrow('Not authenticated')
  })

  it('throws when user role is not in allowed list', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
    mockSingle.mockResolvedValue({
      data: { role: 'vendor' },
      error: null,
    })

    await expect(requireRole(['organizer', 'admin'])).rejects.toThrow(
      'Unauthorized: insufficient role'
    )
  })
})

// =============================================================================
// isOrganizerOrAdmin
// =============================================================================

describe('isOrganizerOrAdmin', () => {
  it('returns true for organizer', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
    mockSingle.mockResolvedValue({
      data: { role: 'organizer' },
      error: null,
    })

    expect(await isOrganizerOrAdmin()).toBe(true)
  })

  it('returns true for admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
    mockSingle.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    })

    expect(await isOrganizerOrAdmin()).toBe(true)
  })

  it('returns false for vendor', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
    mockSingle.mockResolvedValue({
      data: { role: 'vendor' },
      error: null,
    })

    expect(await isOrganizerOrAdmin()).toBe(false)
  })

  it('returns false when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    expect(await isOrganizerOrAdmin()).toBe(false)
  })
})
