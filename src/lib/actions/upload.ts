'use server';

import { createClient } from '@/lib/supabase/server';
import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
  type AllowedFileType,
} from '@/lib/validations/application';

// =============================================================================
// Types
// =============================================================================

/**
 * Response type for upload actions
 */
export type UploadResponse = {
  success: boolean;
  error: string | null;
  data: {
    filePath: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  } | null;
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Checks if a MIME type is in the allowed file types list
 */
function isAllowedFileType(type: string): type is AllowedFileType {
  return (ALLOWED_FILE_TYPES as readonly string[]).includes(type);
}

/**
 * Generates a unique file path for storage
 * Format: uploads/{timestamp}-{random}-{sanitized-filename}
 */
function generateFilePath(fileName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  // Sanitize filename: remove special chars, keep extension
  const sanitized = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '-')
    .replace(/-+/g, '-');
  return `uploads/${timestamp}-${random}-${sanitized}`;
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Uploads a single file to Supabase Storage
 *
 * @param formData - FormData containing a 'file' field
 * @returns UploadResponse with file path on success or error message on failure
 *
 * @example
 * const formData = new FormData()
 * formData.append('file', file)
 * const result = await uploadFile(formData)
 * if (result.success) {
 *   console.log('Uploaded to:', result.data.filePath)
 * }
 */
export async function uploadFile(formData: FormData): Promise<UploadResponse> {
  // Extract file from FormData
  const file = formData.get('file');

  // Validate file exists and is a File object
  if (!file || !(file instanceof File)) {
    return {
      success: false,
      error: 'No file provided',
      data: null,
    };
  }

  // Validate file type
  if (!isAllowedFileType(file.type)) {
    return {
      success: false,
      error: `Invalid file type: ${file.type}. Allowed types: JPEG, PNG, GIF, WebP, PDF`,
      data: null,
    };
  }

  // Validate file size (10MB limit)
  if (file.size > MAX_FILE_SIZE) {
    const maxSizeMB = MAX_FILE_SIZE / 1024 / 1024;
    return {
      success: false,
      error: `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowed size (${maxSizeMB}MB)`,
      data: null,
    };
  }

  // Validate file is not empty
  if (file.size === 0) {
    return {
      success: false,
      error: 'File is empty',
      data: null,
    };
  }

  // Generate unique file path
  const filePath = generateFilePath(file.name);

  // Create Supabase client
  const supabase = await createClient();

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, file, {
    contentType: file.type,
    upsert: false, // Don't overwrite existing files
  });

  if (uploadError) {
    console.error('Supabase storage upload error:', uploadError);
    return {
      success: false,
      error: `Upload failed: ${uploadError.message}`,
      data: null,
    };
  }

  // Return success with file metadata
  return {
    success: true,
    error: null,
    data: {
      filePath,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    },
  };
}

/**
 * Deletes a file from Supabase Storage
 *
 * @param filePath - The storage path of the file to delete
 * @returns Success status and any error message
 */
export async function deleteFile(
  filePath: string
): Promise<{ success: boolean; error: string | null }> {
  if (!filePath) {
    return {
      success: false,
      error: 'No file path provided',
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.storage.from('attachments').remove([filePath]);

  if (error) {
    console.error('Supabase storage delete error:', error);
    return {
      success: false,
      error: `Delete failed: ${error.message}`,
    };
  }

  return {
    success: true,
    error: null,
  };
}
