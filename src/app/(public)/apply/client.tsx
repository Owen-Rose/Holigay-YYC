'use client';

import * as React from 'react';
import Link from 'next/link';
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
  | { status: 'success'; applicationId: string }
  | { status: 'error'; message: string };

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
          setState({
            status: 'error',
            message: uploadResult.error || `Failed to upload ${file.name}`,
          });
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
        setState({
          status: 'error',
          message: result.error || 'Failed to submit application',
        });
        return;
      }

      // Success!
      setState({
        status: 'success',
        applicationId: result.data!.applicationId,
      });
    } catch (error) {
      console.error('Application submission error:', error);
      setState({
        status: 'error',
        message: 'An unexpected error occurred. Please try again.',
      });
    }
  };

  // Success state
  if (state.status === 'success') {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Application Submitted!</h2>
        <p className="mt-2 text-gray-600">
          Thank you for your application. We&apos;ll review it and get back to you soon.
        </p>
        <p className="mt-1 text-sm text-gray-500">Application ID: {state.applicationId}</p>
        <div className="mt-6 flex justify-center gap-4">
          <Link
            href="/"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
          >
            Back to Home
          </Link>
          <button
            onClick={() => setState({ status: 'idle' })}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
          >
            Submit Another Application
          </button>
        </div>
      </div>
    );
  }

  // Error state (shown above form)
  return (
    <div>
      {state.status === 'error' && (
        <div className="mb-6 rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Submission Failed</h3>
              <p className="mt-1 text-sm text-red-700">{state.message}</p>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => setState({ status: 'idle' })}
                className="inline-flex rounded-md bg-red-50 p-1.5 text-red-500 hover:bg-red-100 focus:ring-2 focus:ring-red-600 focus:ring-offset-2 focus:outline-none"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <VendorApplicationForm events={events} onSubmit={handleSubmit} />
    </div>
  );
}
