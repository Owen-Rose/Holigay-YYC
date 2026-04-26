export default function TemplateDetailLoading() {
  return (
    <div>
      <div className="mb-8">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-700" />
        <div className="mt-3 h-8 w-40 animate-pulse rounded bg-gray-700" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-gray-700" />
      </div>

      <div className="border-border-subtle bg-surface rounded-lg border p-6 space-y-4">
        <div className="h-5 w-32 animate-pulse rounded bg-gray-700" />
        <div className="h-10 w-full animate-pulse rounded bg-gray-700" />
        <div className="h-5 w-24 animate-pulse rounded bg-gray-700" />
        <div className="h-20 w-full animate-pulse rounded bg-gray-700" />
      </div>

      <div className="border-border-subtle bg-surface mt-6 rounded-lg border p-6 space-y-4">
        <div className="h-5 w-24 animate-pulse rounded bg-gray-700" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-surface-bright rounded-lg border border-gray-700 p-4 space-y-3">
            <div className="h-4 w-24 animate-pulse rounded bg-gray-700" />
            <div className="h-10 w-full animate-pulse rounded bg-gray-700" />
            <div className="h-10 w-full animate-pulse rounded bg-gray-700" />
          </div>
        ))}
      </div>
    </div>
  );
}
