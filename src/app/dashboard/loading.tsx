// Dashboard loading skeleton
// Shows placeholder cards and content while data loads

function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="mt-3 h-8 w-16 rounded bg-gray-200" />
        </div>
        <div className="h-12 w-12 rounded-full bg-gray-200" />
      </div>
    </div>
  );
}

function RecentApplicationsSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="h-5 w-36 rounded bg-gray-200" />
        <div className="h-4 w-16 rounded bg-gray-200" />
      </div>
      <ul className="divide-y divide-gray-200">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="animate-pulse px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="h-4 w-48 rounded bg-gray-200" />
                <div className="mt-2 h-3 w-64 rounded bg-gray-200" />
              </div>
              <div className="ml-4 flex items-center gap-3">
                <div className="h-5 w-16 rounded-full bg-gray-200" />
                <div className="h-3 w-20 rounded bg-gray-200" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuickActionsSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="h-5 w-28 rounded bg-gray-200" />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex animate-pulse items-center gap-4 rounded-lg border border-gray-200 p-4"
          >
            <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-gray-200" />
            <div className="flex-1">
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="mt-1 h-3 w-32 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div>
      {/* Page Header Skeleton */}
      <div className="mb-8">
        <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-gray-200" />
      </div>

      {/* Summary Stats Grid Skeleton */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Recent Applications Skeleton */}
      <div className="mt-8">
        <RecentApplicationsSkeleton />
      </div>

      {/* Quick Actions Skeleton */}
      <div className="mt-8">
        <QuickActionsSkeleton />
      </div>
    </div>
  );
}
