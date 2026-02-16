import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      {/* Logo/Brand */}
      <div className="mb-8">
        <Link
          href="/"
          className="text-2xl font-bold text-foreground transition-colors hover:text-primary"
        >
          Holigay Vendor Market
        </Link>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-border-subtle bg-surface px-8 py-10 shadow-xl backdrop-blur-sm">
          {children}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm">
        <Link
          href="/"
          className="text-muted-foreground transition-colors hover:text-primary"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
