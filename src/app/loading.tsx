import { Spinner } from '@/components/ui/spinner';

// Global loading state shown during route transitions
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Spinner size="lg" className="mx-auto text-primary" />
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </div>
    </div>
  );
}
