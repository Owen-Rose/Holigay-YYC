import { Spinner } from '@/components/ui/spinner';

export default function SetPasswordLoading() {
  return (
    <div className="flex justify-center py-8">
      <Spinner size="lg" className="text-primary" />
    </div>
  );
}
