import Link from 'next/link';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      {/* Rainbow gradient decorative bar */}
      <div
        className="h-[2px] w-full"
        style={{
          background:
            'linear-gradient(135deg, #EF4444, #F97316, #EAB308, #22C55E, #3B82F6, #A78BFA)',
        }}
      />

      {/* Glassmorphic sticky header */}
      <header className="sticky top-0 z-50 border-b border-border-subtle bg-surface/80 backdrop-blur-lg">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="text-xl font-bold text-foreground transition-colors hover:text-primary"
            >
              Holigay Vendor Market
            </Link>
            <nav className="flex gap-4">
              <Link
                href="/login"
                className="text-sm text-muted transition-colors hover:text-primary"
              >
                Sign In
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border-subtle">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Holigay Vendor Market. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
