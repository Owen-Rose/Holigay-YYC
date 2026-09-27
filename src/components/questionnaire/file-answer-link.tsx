'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type FileAnswerLinkProps = {
  path: string;
  name: string;
};

/**
 * Opens a file_upload answer through a short-lived signed URL. The stored
 * `path` is a key in the private `attachments` bucket, not a URL — linking to
 * it directly resolves against the current page and 404s.
 */
export function FileAnswerLink({ path, name }: FileAnswerLinkProps) {
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    // Open the tab inside the click so Safari doesn't treat it as a popup,
    // then point it at the signed URL once it exists.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;

    setIsOpening(true);
    setError(null);

    const { data, error: signError } = await createClient()
      .storage.from('attachments')
      .createSignedUrl(path, 60);

    if (signError || !data?.signedUrl) {
      console.error('Signed URL error:', signError);
      tab?.close();
      setError('Could not open this file. Please try again.');
    } else if (tab) {
      tab.location.href = data.signedUrl;
    } else {
      window.location.href = data.signedUrl;
    }

    setIsOpening(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={isOpening}
        className="text-primary hover:text-primary-hover underline-offset-2 hover:underline disabled:opacity-50"
      >
        {name}
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
