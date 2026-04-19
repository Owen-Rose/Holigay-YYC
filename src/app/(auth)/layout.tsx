import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      {/* Logo/Brand */}
      <div className="mb-8">
        <Link href="/" className="text-2xl font-bold text-blue-600">
          Holigay Vendor Market
        </Link>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-md">
        <div className="rounded-lg bg-white px-8 py-10 shadow-md">{children}</div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-500">
        <Link href="/" className="hover:text-blue-600">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
