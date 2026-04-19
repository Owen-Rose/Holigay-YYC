import { Suspense } from 'react';
import { getApplications, type ApplicationFilters } from '@/lib/actions/applications';
import { ApplicationsTable } from '@/components/dashboard/applications-table';
import { ApplicationsFilter } from '@/components/dashboard/applications-filter';
import { ExportButton } from '@/components/dashboard/export-button';

// =============================================================================
// Types
// =============================================================================

interface ApplicationsPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
    page?: string;
  }>;
}

// =============================================================================
// Page Header Component
// =============================================================================

interface PageHeaderProps {
  filters?: ApplicationFilters;
}

function PageHeader({ filters }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
        <p className="mt-1 text-sm text-gray-600">
          View and manage all vendor applications for your events.
        </p>
      </div>
      <div className="flex-shrink-0">
        <ExportButton filters={filters} />
      </div>
    </div>
  );
}

// =============================================================================
// Filter Skeleton Component
// =============================================================================

function FilterSkeleton() {
  return (
    <div className="mb-6 animate-pulse">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <div className="mb-1 h-5 w-16 rounded bg-gray-200" />
          <div className="h-10 w-full rounded-md bg-gray-200" />
        </div>
        <div className="w-full sm:w-48">
          <div className="mb-1 h-5 w-12 rounded bg-gray-200" />
          <div className="h-10 w-full rounded-md bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Pagination Component
// =============================================================================

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  baseUrl: string;
}

function Pagination({ currentPage, totalPages, totalCount, pageSize, baseUrl }: PaginationProps) {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  // Build URL with existing params
  function getPageUrl(page: number) {
    const url = new URL(baseUrl, 'http://localhost');
    url.searchParams.set('page', page.toString());
    return `${url.pathname}${url.search}`;
  }

  return (
    <div className="mt-6 flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
      {/* Mobile pagination */}
      <div className="flex flex-1 justify-between sm:hidden">
        {currentPage > 1 ? (
          <a
            href={getPageUrl(currentPage - 1)}
            className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Previous
          </a>
        ) : (
          <span className="relative inline-flex cursor-not-allowed items-center rounded-md border border-gray-300 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400">
            Previous
          </span>
        )}
        {currentPage < totalPages ? (
          <a
            href={getPageUrl(currentPage + 1)}
            className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Next
          </a>
        ) : (
          <span className="relative ml-3 inline-flex cursor-not-allowed items-center rounded-md border border-gray-300 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400">
            Next
          </span>
        )}
      </div>

      {/* Desktop pagination */}
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{startItem}</span> to{' '}
            <span className="font-medium">{endItem}</span> of{' '}
            <span className="font-medium">{totalCount}</span> results
          </p>
        </div>
        <div>
          <nav
            className="isolate inline-flex -space-x-px rounded-md shadow-sm"
            aria-label="Pagination"
          >
            {/* Previous button */}
            {currentPage > 1 ? (
              <a
                href={getPageUrl(currentPage - 1)}
                className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
              >
                <span className="sr-only">Previous</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
            ) : (
              <span className="relative inline-flex cursor-not-allowed items-center rounded-l-md px-2 py-2 text-gray-300 ring-1 ring-gray-300 ring-inset">
                <span className="sr-only">Previous</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            )}

            {/* Page numbers */}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <a
                key={pageNum}
                href={getPageUrl(pageNum)}
                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                  pageNum === currentPage
                    ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                    : 'text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                }`}
              >
                {pageNum}
              </a>
            ))}

            {/* Next button */}
            {currentPage < totalPages ? (
              <a
                href={getPageUrl(currentPage + 1)}
                className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
              >
                <span className="sr-only">Next</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
            ) : (
              <span className="relative inline-flex cursor-not-allowed items-center rounded-r-md px-2 py-2 text-gray-300 ring-1 ring-gray-300 ring-inset">
                <span className="sr-only">Next</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            )}
          </nav>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default async function ApplicationsPage({ searchParams }: ApplicationsPageProps) {
  // Await searchParams (Next.js 15+ async params)
  const params = await searchParams;

  // Extract filter parameters
  const filters: ApplicationFilters = {
    status: params.status || null,
    search: params.search || null,
  };

  // Parse pagination
  const page = parseInt(params.page || '1', 10);
  const pageSize = 10;

  // Fetch applications server-side
  const result = await getApplications(filters, { page, pageSize });

  // Handle error state
  if (!result.success || !result.data) {
    return (
      <div>
        <PageHeader filters={filters} />
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">
            {result.error || 'Failed to load applications. Please try again.'}
          </p>
        </div>
      </div>
    );
  }

  const { applications, pagination } = result.data;

  // Build base URL for pagination links (preserving filters)
  const searchParamsStr = new URLSearchParams();
  if (filters.status) searchParamsStr.set('status', filters.status);
  if (filters.search) searchParamsStr.set('search', filters.search);
  const baseUrl = `/dashboard/applications${searchParamsStr.toString() ? `?${searchParamsStr.toString()}` : ''}`;

  return (
    <div>
      <PageHeader filters={filters} />

      {/* Search and Filter Controls */}
      <Suspense fallback={<FilterSkeleton />}>
        <ApplicationsFilter />
      </Suspense>

      {/* Applications Table */}
      <ApplicationsTable applications={applications} />

      {/* Pagination */}
      <Pagination
        currentPage={pagination.page}
        totalPages={pagination.totalPages}
        totalCount={pagination.totalCount}
        pageSize={pagination.pageSize}
        baseUrl={baseUrl}
      />
    </div>
  );
}
