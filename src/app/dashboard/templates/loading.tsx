export default function TemplatesLoading() {
  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-28 animate-pulse rounded bg-gray-700" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-gray-700" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded bg-gray-700" />
        </div>
      </div>

      <div className="border-border-subtle bg-surface rounded-lg border">
        <div className="border-border-subtle bg-surface-bright hidden grid-cols-5 gap-4 border-b px-6 py-3 sm:grid">
          {['Name', 'Description', 'Creator', 'Questions', 'Actions'].map((h) => (
            <div key={h} className="h-4 w-16 animate-pulse rounded bg-gray-700" />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="border-border-subtle grid grid-cols-1 gap-3 border-b px-6 py-4 sm:grid-cols-5 sm:gap-4"
          >
            <div className="h-4 w-36 animate-pulse rounded bg-gray-700" />
            <div className="h-4 w-48 animate-pulse rounded bg-gray-700" />
            <div className="h-4 w-28 animate-pulse rounded bg-gray-700" />
            <div className="h-4 w-8 animate-pulse rounded bg-gray-700" />
            <div className="flex gap-2">
              <div className="h-8 w-14 animate-pulse rounded bg-gray-700" />
              <div className="h-8 w-16 animate-pulse rounded bg-gray-700" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
