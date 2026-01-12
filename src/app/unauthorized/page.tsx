import Link from 'next/link';

/**
 * Unauthorized Page
 *
 * Displayed when a user tries to access a resource they don't have permission for.
 * Provides friendly messaging and navigation options based on likely user intent:
 * - Vendors who accidentally hit dashboard routes → directed to vendor portal
 * - General users → directed to homepage
 */
export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        {/* Lock icon to convey access restriction */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
          <svg
            className="h-10 w-10 text-amber-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        {/* Main heading */}
        <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>

        {/* Friendly explanation */}
        <p className="mt-2 max-w-md text-gray-600">
          You don&apos;t have permission to access this page. This area is restricted to authorized
          users only.
        </p>

        {/* Navigation options */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {/* Primary action: Go to homepage */}
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
          >
            Go to homepage
          </Link>

          {/* Secondary action: Vendor portal (for vendors who hit dashboard routes) */}
          <Link
            href="/vendor"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
          >
            Go to vendor portal
          </Link>
        </div>

        {/* Help text for users who believe they should have access */}
        <p className="mt-8 text-sm text-gray-500">
          If you believe you should have access, please contact the event organizer.
        </p>
      </div>
    </div>
  );
}
