'use client';

import { useState } from 'react';
import { uploadFile, deleteFile } from '@/lib/actions/upload';

type UploadResult = {
  success: boolean;
  error: string | null;
  data: {
    filePath: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  } | null;
};

export default function TestUploadPage() {
  const [result, setResult] = useState<UploadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setDeleteStatus(null);

    const formData = new FormData(e.currentTarget);
    const uploadResult = await uploadFile(formData);

    setResult(uploadResult);
    setLoading(false);
  }

  async function handleDelete() {
    if (!result?.data?.filePath) return;

    setDeleteStatus('Deleting...');
    const deleteResult = await deleteFile(result.data.filePath);

    if (deleteResult.success) {
      setDeleteStatus('File deleted successfully');
      setResult(null);
    } else {
      setDeleteStatus(`Delete failed: ${deleteResult.error}`);
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1rem' }}>Upload Test Page</h1>
      <p style={{ marginBottom: '1rem', color: '#666' }}>
        Test the uploadFile server action. Select a file and submit.
      </p>

      <form onSubmit={handleSubmit} style={{ marginBottom: '2rem' }}>
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          style={{ marginBottom: '1rem', display: 'block' }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: loading ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Uploading...' : 'Upload File'}
        </button>
      </form>

      {result && (
        <div
          style={{
            padding: '1rem',
            borderRadius: '8px',
            backgroundColor: result.success ? '#d4edda' : '#f8d7da',
            border: `1px solid ${result.success ? '#c3e6cb' : '#f5c6cb'}`,
          }}
        >
          <h3 style={{ marginBottom: '0.5rem' }}>
            {result.success ? 'Upload Successful' : 'Upload Failed'}
          </h3>

          {result.error && <p style={{ color: '#721c24' }}>{result.error}</p>}

          {result.data && (
            <div style={{ fontSize: '0.9rem' }}>
              <p>
                <strong>File Path:</strong> {result.data.filePath}
              </p>
              <p>
                <strong>File Name:</strong> {result.data.fileName}
              </p>
              <p>
                <strong>File Type:</strong> {result.data.fileType}
              </p>
              <p>
                <strong>File Size:</strong> {(result.data.fileSize / 1024).toFixed(2)} KB
              </p>

              <button
                onClick={handleDelete}
                style={{
                  marginTop: '1rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Delete File
              </button>
            </div>
          )}
        </div>
      )}

      {deleteStatus && (
        <p
          style={{
            marginTop: '1rem',
            color: deleteStatus.includes('failed') ? '#dc3545' : '#28a745',
          }}
        >
          {deleteStatus}
        </p>
      )}

      <div
        style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px',
        }}
      >
        <h4>Test Cases to Try:</h4>
        <ul style={{ fontSize: '0.9rem', lineHeight: '1.8' }}>
          <li>Valid image (JPG, PNG, GIF, WebP) - should succeed</li>
          <li>Valid PDF - should succeed</li>
          <li>Invalid type (e.g., .txt, .zip) - should fail</li>
          <li>File over 10MB - should fail</li>
          <li>No file selected - should fail</li>
        </ul>
      </div>
    </div>
  );
}
