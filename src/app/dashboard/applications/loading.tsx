// Applications list loading skeleton
// Shows placeholder filter and table while data loads

function FilterSkeleton() {
  return (
    <div className="mb-6 animate-pulse">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <div className="mb-1 h-5 w-16 rounded bg-gray-200" />
          <div className="h-11 w-full rounded-md bg-gray-200" />
        </div>
        <div className="w-full sm:w-48">
          <div className="mb-1 h-5 w-12 rounded bg-gray-200" />
          <div className="h-11 w-full rounded-md bg-gray-200" />
        </div>
      </div>
    </div>
  )
}

function TableRowSkeleton() {
  return (
    <tr className="animate-pulse">
      <td className="whitespace-nowrap px-6 py-4">
        <div className="h-4 w-32 rounded bg-gray-200" />
        <div className="mt-1 h-3 w-24 rounded bg-gray-200" />
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <div className="h-4 w-28 rounded bg-gray-200" />
        <div className="mt-1 h-3 w-40 rounded bg-gray-200" />
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <div className="h-5 w-16 rounded-full bg-gray-200" />
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <div className="h-4 w-20 rounded bg-gray-200" />
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-right">
        <div className="h-4 w-8 rounded bg-gray-200" />
      </td>
    </tr>
  )
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left">
                <div className="h-4 w-16 rounded bg-gray-200" />
              </th>
              <th className="px-6 py-3 text-left">
                <div className="h-4 w-14 rounded bg-gray-200" />
              </th>
              <th className="px-6 py-3 text-left">
                <div className="h-4 w-12 rounded bg-gray-200" />
              </th>
              <th className="px-6 py-3 text-left">
                <div className="h-4 w-8 rounded bg-gray-200" />
              </th>
              <th className="px-6 py-3 text-right">
                <div className="ml-auto h-4 w-14 rounded bg-gray-200" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRowSkeleton key={i} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="divide-y divide-gray-200 md:hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="h-4 w-36 rounded bg-gray-200" />
                <div className="mt-1 h-3 w-28 rounded bg-gray-200" />
              </div>
              <div className="h-5 w-16 rounded-full bg-gray-200" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-3 w-40 rounded bg-gray-200" />
              <div className="h-3 w-24 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ApplicationsLoading() {
  return (
    <div>
      {/* Page Header Skeleton */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded-md bg-gray-200" />
      </div>

      {/* Filter Controls Skeleton */}
      <FilterSkeleton />

      {/* Table Skeleton */}
      <TableSkeleton />
    </div>
  )
}
