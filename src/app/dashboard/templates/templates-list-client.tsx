'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteTemplate } from '@/lib/actions/templates';

interface TemplateItem {
  id: string;
  name: string;
  description: string | null;
  createdByEmail: string | null;
  questionCount: number;
  canModify: boolean;
}

interface TemplatesListClientProps {
  templates: TemplateItem[];
}

export function TemplatesListClient({ templates }: TemplatesListClientProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete(id: string) {
    setIsDeleting(true);
    try {
      const result = await deleteTemplate(id);
      if (!result.success) {
        toast.error(result.error ?? 'Failed to delete template');
        return;
      }
      toast.success('Template deleted');
      setConfirmDeleteId(null);
    } finally {
      setIsDeleting(false);
    }
  }

  if (templates.length === 0) {
    return (
      <div className="border-border-subtle bg-surface rounded-lg border px-6 py-16 text-center">
        <p className="text-foreground font-medium">No templates yet</p>
        <p className="text-muted mt-1 text-sm">
          Create one from an event questionnaire or start from scratch.
        </p>
        <div className="mt-4">
          <Link href="/dashboard/templates/new">
            <Button>New Template</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="border-border-subtle bg-surface hidden rounded-lg border sm:block">
        <div className="border-border-subtle bg-surface-bright grid grid-cols-[2fr_2fr_2fr_1fr_auto] gap-4 rounded-t-lg border-b px-6 py-3 text-xs font-semibold uppercase tracking-wide">
          <span className="text-muted">Name</span>
          <span className="text-muted">Description</span>
          <span className="text-muted">Creator</span>
          <span className="text-muted">Questions</span>
          <span className="text-muted">Actions</span>
        </div>
        {templates.map((t) => (
          <div
            key={t.id}
            className="border-border-subtle grid grid-cols-[2fr_2fr_2fr_1fr_auto] gap-4 border-b px-6 py-4 last:border-0 items-center"
          >
            <span className="text-foreground truncate font-medium">{t.name}</span>
            <span className="text-muted truncate text-sm">{t.description ?? '—'}</span>
            <span className="text-muted truncate text-sm">{t.createdByEmail ?? '—'}</span>
            <span className="text-muted text-sm">{t.questionCount}</span>
            <div className="flex shrink-0 gap-2">
              {t.canModify && (
                <>
                  <Link href={`/dashboard/templates/${t.id}`}>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmDeleteId(t.id)}
                  >
                    Delete
                  </Button>
                </>
              )}
              {!t.canModify && (
                <Link href={`/dashboard/templates/${t.id}`}>
                  <Button variant="outline" size="sm">
                    View
                  </Button>
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {templates.map((t) => (
          <div key={t.id} className="border-border-subtle bg-surface rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-foreground font-medium">{t.name}</p>
                {t.description && (
                  <p className="text-muted mt-0.5 text-sm">{t.description}</p>
                )}
                <p className="text-muted mt-1 text-xs">
                  {t.createdByEmail ?? '—'} · {t.questionCount} questions
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {t.canModify && (
                  <>
                    <Link href={`/dashboard/templates/${t.id}`}>
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    </Link>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setConfirmDeleteId(t.id)}
                    >
                      Delete
                    </Button>
                  </>
                )}
                {!t.canModify && (
                  <Link href={`/dashboard/templates/${t.id}`}>
                    <Button variant="outline" size="sm">
                      View
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => !isDeleting && setConfirmDeleteId(null)}
        >
          <div
            className="bg-surface border-border w-full max-w-sm rounded-lg border p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-foreground mb-2 text-lg font-semibold">Delete template?</h2>
            <p className="text-muted mb-6 text-sm">
              This cannot be undone. Events already seeded from this template are not affected.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                type="button"
                isLoading={isDeleting}
                disabled={isDeleting}
                onClick={() => handleDelete(confirmDeleteId)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
