import { Spinner } from '@/components/ui/spinner';

// Global loading state shown during route transitions
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Spinner size="lg" className="text-primary mx-auto" />
        <p className="text-muted mt-4 text-sm">Loading...</p>
      </div>
    </div>
  );
}
