import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      {/* Logo/Brand */}
      <div className="mb-8">
        <Link
          href="/"
          className="text-foreground hover:text-primary text-2xl font-bold transition-colors"
        >
          Holigay Vendor Market
        </Link>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-md">
        <div className="border-border-subtle bg-surface rounded-xl border px-8 py-10 shadow-xl backdrop-blur-sm">
          {children}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm">
        <Link href="/" className="text-muted-foreground hover:text-primary transition-colors">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
