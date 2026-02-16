'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { VendorApplicationForm, type Event } from '@/components/forms/vendor-application-form';
import type { ApplicationFormInput } from '@/lib/validations/application';
import { uploadFile } from '@/lib/actions/upload';
import { submitApplication } from '@/lib/actions/applications';

// =============================================================================
// Types
// =============================================================================

interface ApplicationPageClientProps {
  events: Event[];
}

type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; applicationId: string };

// =============================================================================
// Component
// =============================================================================

export function ApplicationPageClient({ events }: ApplicationPageClientProps) {
  const [state, setState] = React.useState<SubmissionState>({ status: 'idle' });

  const handleSubmit = async (data: ApplicationFormInput, files: File[]) => {
    setState({ status: 'submitting' });

    try {
      // Step 1: Upload all files first
      const uploadedAttachments: {
        fileName: string;
        filePath: string;
        fileType: string;
        fileSize?: number;
      }[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        const uploadResult = await uploadFile(formData);

        if (!uploadResult.success || !uploadResult.data) {
          toast.error(uploadResult.error || `Failed to upload ${file.name}`);
          setState({ status: 'idle' });
          return;
        }

        uploadedAttachments.push({
          fileName: uploadResult.data.fileName,
          filePath: uploadResult.data.filePath,
          fileType: uploadResult.data.fileType,
          fileSize: uploadResult.data.fileSize,
        });
      }

      // Step 2: Submit the application with attachment references
      const result = await submitApplication({
        ...data,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
      });

      if (!result.success) {
        toast.error(result.error || 'Failed to submit application');
        setState({ status: 'idle' });
        return;
      }

      // Success!
      setState({
        status: 'success',
        applicationId: result.data!.applicationId,
      });
    } catch (error) {
      console.error('Application submission error:', error);
      toast.error('An unexpected error occurred. Please try again.');
      setState({ status: 'idle' });
    }
  };

  // Success state
  if (state.status === 'success') {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
          <svg
            className="h-8 w-8 text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-foreground">Application Submitted!</h2>
        <p className="mt-2 text-muted">
          Thank you for your application. We&apos;ll review it and get back to you soon.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Application ID: {state.applicationId}</p>
        <div className="mt-6 flex justify-center gap-4">
          <Link
            href="/"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background focus:outline-none"
          >
            Back to Home
          </Link>
          <button
            onClick={() => setState({ status: 'idle' })}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-bright focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background focus:outline-none"
          >
            Submit Another Application
          </button>
        </div>
      </div>
    );
  }

  return <VendorApplicationForm events={events} onSubmit={handleSubmit} />;
}
