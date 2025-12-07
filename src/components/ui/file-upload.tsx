'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  ALLOWED_FILE_TYPES,
  FILE_TYPE_LABELS,
  MAX_FILE_SIZE,
  MAX_FILES,
  type AllowedFileType,
} from '@/lib/validations/application'

export interface FileUploadProps {
  label?: string
  error?: string
  hint?: string
  value?: File[]
  onChange?: (files: File[]) => void
  maxFiles?: number
  maxSize?: number
  accept?: string[]
  disabled?: boolean
  className?: string
}

export function FileUpload({
  label,
  error,
  hint,
  value = [],
  onChange,
  maxFiles = MAX_FILES,
  maxSize = MAX_FILE_SIZE,
  accept = [...ALLOWED_FILE_TYPES],
  disabled = false,
  className,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = React.useState(false)
  const id = React.useId()

  const handleFiles = React.useCallback(
    (newFiles: FileList | null) => {
      if (!newFiles || disabled) return

      const validFiles: File[] = []
      const errors: string[] = []

      Array.from(newFiles).forEach((file) => {
        // Check file type
        if (!accept.includes(file.type as AllowedFileType)) {
          errors.push(`${file.name}: Invalid file type`)
          return
        }

        // Check file size
        if (file.size > maxSize) {
          errors.push(`${file.name}: File too large (max ${maxSize / 1024 / 1024}MB)`)
          return
        }

        // Check if we haven't exceeded max files
        if (value.length + validFiles.length >= maxFiles) {
          errors.push(`${file.name}: Maximum ${maxFiles} files allowed`)
          return
        }

        // Check for duplicates
        const isDuplicate = value.some(
          (existing) => existing.name === file.name && existing.size === file.size
        )
        if (isDuplicate) {
          errors.push(`${file.name}: File already added`)
          return
        }

        validFiles.push(file)
      })

      if (errors.length > 0) {
        console.warn('File upload errors:', errors)
      }

      if (validFiles.length > 0) {
        onChange?.([...value, ...validFiles])
      }
    },
    [accept, disabled, maxFiles, maxSize, onChange, value]
  )

  const handleDrag = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles]
  )

  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files)
      // Reset input to allow selecting same file again
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    },
    [handleFiles]
  )

  const removeFile = React.useCallback(
    (index: number) => {
      const newFiles = [...value]
      newFiles.splice(index, 1)
      onChange?.(newFiles)
    },
    [onChange, value]
  )

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const acceptedFileTypes = accept
    .map((type) => FILE_TYPE_LABELS[type] || type)
    .join(', ')

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      )}

      {/* Drop zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          'relative rounded-lg border-2 border-dashed p-6 transition-colors',
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : error
              ? 'border-red-300 bg-red-50'
              : 'border-gray-300 hover:border-gray-400',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          id={id}
          multiple
          accept={accept.join(',')}
          onChange={handleInputChange}
          disabled={disabled || value.length >= maxFiles}
          className="sr-only"
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        />

        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
            aria-hidden="true"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <div className="mt-4 flex text-sm text-gray-600">
            <label
              htmlFor={id}
              className={cn(
                'relative cursor-pointer rounded-md font-medium text-blue-600',
                'hover:text-blue-500 focus-within:outline-none focus-within:ring-2',
                'focus-within:ring-blue-500 focus-within:ring-offset-2',
                disabled && 'cursor-not-allowed'
              )}
            >
              <span>Upload files</span>
            </label>
            <p className="pl-1">or drag and drop</p>
          </div>

          <p className="mt-1 text-xs text-gray-500">
            {acceptedFileTypes} up to {maxSize / 1024 / 1024}MB each
          </p>
          <p className="text-xs text-gray-500">
            {value.length}/{maxFiles} files
          </p>
        </div>
      </div>

      {/* File list */}
      {value.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-200 rounded-md border border-gray-200">
          {value.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center justify-between py-3 pl-3 pr-4 text-sm"
            >
              <div className="flex w-0 flex-1 items-center">
                <svg
                  className="h-5 w-5 flex-shrink-0 text-gray-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="ml-2 w-0 flex-1 truncate">{file.name}</span>
              </div>
              <div className="ml-4 flex items-center gap-3">
                <span className="text-gray-500">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  disabled={disabled}
                  className={cn(
                    'font-medium text-red-600 hover:text-red-500',
                    'focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded',
                    disabled && 'cursor-not-allowed opacity-50'
                  )}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hint && !error && (
        <p id={`${id}-hint`} className="mt-2 text-sm text-gray-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
