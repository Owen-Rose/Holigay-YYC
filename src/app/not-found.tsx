import Link from 'next/link';

// 404 Not Found page
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        {/* 404 illustration */}
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-surface-bright">
          <span className="text-4xl font-bold text-muted-foreground">404</span>
        </div>

        <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
        <p className="mt-2 max-w-md text-muted">
          Sorry, we couldn&apos;t find the page you&apos;re looking for. It may have been moved or
          doesn&apos;t exist.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background focus:outline-none"
          >
            Go to homepage
          </Link>
          <Link
            href="/apply"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-bright focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background focus:outline-none"
          >
            Apply as vendor
          </Link>
        </div>
      </div>
    </div>
  );
}
