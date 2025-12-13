'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'

// =============================================================================
// Types
// =============================================================================

interface ApplicationsFilterProps {
  className?: string
}

// Status options for the filter dropdown
const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'waitlisted', label: 'Waitlisted' },
] as const

// =============================================================================
// Search Icon Component
// =============================================================================

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
  )
}

// =============================================================================
// Clear Icon Component
// =============================================================================

function ClearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function ApplicationsFilter({ className }: ApplicationsFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // Get current filter values from URL
  const currentSearch = searchParams.get('search') || ''
  const currentStatus = searchParams.get('status') || ''

  // Local state for the search input (for debouncing)
  const [searchValue, setSearchValue] = useState(currentSearch)

  // Check if any filters are active
  const hasActiveFilters = currentSearch || currentStatus

  // ---------------------------------------------------------------------------
  // URL Update Helper
  // ---------------------------------------------------------------------------

  const updateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())

      // Apply updates
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      })

      // Reset to page 1 when filters change
      params.delete('page')

      // Navigate with the new params
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
      })
    },
    [pathname, router, searchParams]
  )

  // ---------------------------------------------------------------------------
  // Debounced Search
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Sync local state with URL when URL changes externally
    setSearchValue(currentSearch)
  }, [currentSearch])

  useEffect(() => {
    // Debounce search input updates
    const timer = setTimeout(() => {
      if (searchValue !== currentSearch) {
        updateUrl({ search: searchValue })
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchValue, currentSearch, updateUrl])

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value)
  }

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateUrl({ status: e.target.value })
  }

  const handleClearFilters = () => {
    setSearchValue('')
    updateUrl({ search: null, status: null })
  }

  const handleClearSearch = () => {
    setSearchValue('')
    updateUrl({ search: null })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={cn('mb-6', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        {/* Search Input */}
        <div className="flex-1">
          <label htmlFor="search" className="mb-1 block text-sm font-medium text-gray-700">
            Search
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <SearchIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              id="search"
              name="search"
              value={searchValue}
              onChange={handleSearchChange}
              placeholder="Search by business name or email..."
              className={cn(
                'block w-full rounded-md border border-gray-300 py-2 pl-10 pr-10 shadow-sm',
                'placeholder:text-gray-400',
                'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
                isPending && 'opacity-70'
              )}
            />
            {searchValue && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <ClearIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Status Filter */}
        <div className="w-full sm:w-48">
          <label htmlFor="status" className="mb-1 block text-sm font-medium text-gray-700">
            Status
          </label>
          <select
            id="status"
            name="status"
            value={currentStatus}
            onChange={handleStatusChange}
            className={cn(
              'block w-full appearance-none rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 shadow-sm',
              'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
              // Custom dropdown arrow
              'bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.293%207.293a1%201%200%20011.414%200L10%2010.586l3.293-3.293a1%201%200%20111.414%201.414l-4%204a1%201%200%2001-1.414%200l-4-4a1%201%200%20010-1.414z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E")]',
              'bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat',
              isPending && 'opacity-70'
            )}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className={cn(
              'inline-flex items-center justify-center rounded-md px-4 py-2',
              'border border-gray-300 bg-white text-sm font-medium text-gray-700',
              'hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
              'transition-colors',
              isPending && 'opacity-70'
            )}
          >
            <ClearIcon className="mr-2 h-4 w-4" />
            Clear filters
          </button>
        )}
      </div>

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">Active filters:</span>
          {currentSearch && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
              Search: &quot;{currentSearch}&quot;
              <button
                type="button"
                onClick={handleClearSearch}
                className="ml-0.5 rounded-full p-0.5 hover:bg-blue-200"
                aria-label="Remove search filter"
              >
                <ClearIcon className="h-3 w-3" />
              </button>
            </span>
          )}
          {currentStatus && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
              Status: {STATUS_OPTIONS.find((o) => o.value === currentStatus)?.label}
              <button
                type="button"
                onClick={() => updateUrl({ status: null })}
                className="ml-0.5 rounded-full p-0.5 hover:bg-blue-200"
                aria-label="Remove status filter"
              >
                <ClearIcon className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Loading indicator */}
      {isPending && (
        <div className="mt-2 text-sm text-gray-500">
          <span className="inline-flex items-center">
            <svg
              className="-ml-1 mr-2 h-4 w-4 animate-spin text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Updating results...
          </span>
        </div>
      )}
    </div>
  )
}
