'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// =============================================================================
// Types
// =============================================================================

interface Attachment {
  id: string
  file_name: string
  file_path: string
  file_type: string
  file_size: number | null
  uploaded_at: string
}

interface AttachmentsListProps {
  attachments: Attachment[]
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'Unknown size'

  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(fileType: string): React.ReactNode {
  const isImage = fileType.startsWith('image/')
  const isPdf = fileType === 'application/pdf'

  if (isImage) {
    return (
      <svg
        className="h-8 w-8 text-purple-500"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
        />
      </svg>
    )
  }

  if (isPdf) {
    return (
      <svg
        className="h-8 w-8 text-red-500"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
        />
      </svg>
    )
  }

  // Default document icon
  return (
    <svg
      className="h-8 w-8 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>
  )
}

// =============================================================================
// Attachment Item Component
// =============================================================================

function AttachmentItem({ attachment }: { attachment: Attachment }) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setIsDownloading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Create a signed URL for the file download
      const { data, error: signedUrlError } = await supabase.storage
        .from('attachments')
        .createSignedUrl(attachment.file_path, 60) // URL valid for 60 seconds

      if (signedUrlError || !data?.signedUrl) {
        throw new Error('Failed to generate download link')
      }

      // Open the signed URL in a new tab to download
      window.open(data.signedUrl, '_blank')
    } catch (err) {
      console.error('Download error:', err)
      setError('Failed to download file. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex-shrink-0">{getFileIcon(attachment.file_type)}</div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {attachment.file_name}
        </p>
        <p className="text-xs text-gray-500">
          {formatFileSize(attachment.file_size)} &middot;{' '}
          {new Date(attachment.uploaded_at).toLocaleDateString()}
        </p>
        {error && (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      <button
        onClick={handleDownload}
        disabled={isDownloading}
        className="flex-shrink-0 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isDownloading ? (
          <span className="flex items-center gap-1">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading...</span>
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            <span>Download</span>
          </span>
        )}
      </button>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function AttachmentsList({ attachments }: AttachmentsListProps) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Attached Files ({attachments.length})
      </h2>

      <div className="space-y-3">
        {attachments.map((attachment) => (
          <AttachmentItem key={attachment.id} attachment={attachment} />
        ))}
      </div>
    </div>
  )
}
