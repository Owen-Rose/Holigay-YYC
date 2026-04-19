'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { exportApplicationsCSV } from '@/lib/actions/export';
import type { ApplicationFilters } from '@/lib/actions/applications';

// =============================================================================
// Types
// =============================================================================

interface ExportButtonProps {
  filters?: ApplicationFilters;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Export button that downloads applications as CSV
 *
 * Calls the server action to generate CSV, then triggers a browser download
 */
export function ExportButton({ filters = {} }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);

    try {
      const result = await exportApplicationsCSV(filters);

      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to export applications');
        return;
      }

      // Create a Blob from the CSV content
      const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8;' });

      // Create a download link and trigger it
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.data.filename;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Export downloaded');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="border-border bg-surface text-foreground hover:bg-surface-bright focus:ring-primary/50 focus:ring-offset-background inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Export applications to CSV"
      >
        {isExporting ? (
          <>
            {/* Loading spinner */}
            <svg
              className="text-muted h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Exporting...</span>
          </>
        ) : (
          <>
            {/* Download icon */}
            <svg
              className="h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            <span>Export CSV</span>
          </>
        )}
      </button>
    </div>
  );
}
