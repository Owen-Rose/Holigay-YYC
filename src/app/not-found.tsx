import Link from 'next/link';

// 404 Not Found page
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        {/* 404 illustration */}
        <div className="bg-surface-bright mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full">
          <span className="text-muted-foreground text-4xl font-bold">404</span>
        </div>

        <h1 className="text-foreground text-2xl font-bold">Page not found</h1>
        <p className="text-muted mt-2 max-w-md">
          Sorry, we couldn&apos;t find the page you&apos;re looking for. It may have been moved or
          doesn&apos;t exist.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="bg-primary text-primary-foreground hover:bg-primary-hover focus:ring-primary/50 focus:ring-offset-background inline-flex min-h-[44px] items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none"
          >
            Go to homepage
          </Link>
          <Link
            href="/apply"
            className="border-border bg-surface text-foreground hover:bg-surface-bright focus:ring-primary/50 focus:ring-offset-background inline-flex min-h-[44px] items-center justify-center rounded-md border px-4 py-2.5 text-sm font-medium transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none"
          >
            Apply as vendor
          </Link>
        </div>
      </div>
    </div>
  );
}
