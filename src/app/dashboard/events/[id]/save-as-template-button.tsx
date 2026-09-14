'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { saveEventQuestionnaireAsTemplate } from '@/lib/actions/questionnaires';

interface SaveAsTemplateButtonProps {
  eventId: string;
}

export function SaveAsTemplateButton({ eventId }: SaveAsTemplateButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    setName('');
    setDescription('');
    setError(null);
    setIsOpen(true);
  }

  function handleClose() {
    if (isSaving) return;
    setIsOpen(false);
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const result = await saveEventQuestionnaireAsTemplate({
        eventId,
        name: name.trim(),
        description: description.trim() || null,
      });
      if (!result.success || !result.data) {
        setError(result.error ?? 'Failed to save template');
        return;
      }
      setIsOpen(false);
      const templateId = result.data.id;
      toast.success('Template saved', {
        action: {
          label: 'View',
          onClick: () => router.push(`/dashboard/templates/${templateId}`),
        },
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" type="button" onClick={handleOpen}>
        Save as Template
      </Button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={handleClose}
        >
          <div
            className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-foreground mb-4 text-lg font-semibold">Save as Template</h2>

            <div className="space-y-4">
              <Input
                label="Template name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Holiday Market Standard"
                disabled={isSaving}
                error={error && !name.trim() ? error : undefined}
              />
              <Textarea
                label="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe this template"
                rows={3}
                disabled={isSaving}
              />
              {error && name.trim() && (
                <p className="text-sm text-red-400" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" type="button" onClick={handleClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} isLoading={isSaving} disabled={isSaving}>
                Save Template
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
