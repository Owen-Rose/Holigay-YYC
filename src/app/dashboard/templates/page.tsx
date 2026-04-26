import Link from 'next/link';
import { listTemplates } from '@/lib/actions/templates';
import { getCurrentUserRole } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { TemplatesListClient } from './templates-list-client';

export default async function TemplatesPage() {
  const [templatesResult, authResult] = await Promise.all([listTemplates(), getCurrentUserRole()]);

  const userId = authResult.data?.userId ?? null;
  const isAdmin = authResult.data?.role === 'admin';

  const templates = (templatesResult.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    createdByEmail: t.createdByEmail,
    questionCount: t.questionCount,
    canModify: t.createdBy === userId || isAdmin,
  }));

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-bold">Templates</h1>
            <p className="text-muted mt-1 text-sm">Reusable question sets for event questionnaires.</p>
          </div>
          <Link href="/dashboard/templates/new">
            <Button>New Template</Button>
          </Link>
        </div>
      </div>

      <TemplatesListClient templates={templates} />
    </div>
  );
}
