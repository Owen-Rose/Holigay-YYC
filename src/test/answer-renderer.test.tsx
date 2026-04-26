import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { AnswerRenderer } from '@/components/questionnaire/answer-renderer';

const BASE_QUESTION = {
  id: 'q1',
  label: 'Test Question',
  options: null,
};

describe('AnswerRenderer', () => {
  it('renders a text answer', () => {
    render(
      <AnswerRenderer
        question={{ ...BASE_QUESTION, type: 'short_text' }}
        rawValue={{ kind: 'text', value: 'Hello world' }}
      />,
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('Test Question')).toBeInTheDocument();
  });

  it('renders a number answer', () => {
    render(
      <AnswerRenderer
        question={{ ...BASE_QUESTION, type: 'number' }}
        rawValue={{ kind: 'number', value: 42 }}
      />,
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders a date answer as a formatted string', () => {
    render(
      <AnswerRenderer
        question={{ ...BASE_QUESTION, type: 'date' }}
        rawValue={{ kind: 'date', value: '2026-04-25' }}
      />,
    );
    expect(screen.getByText('Apr 25, 2026')).toBeInTheDocument();
  });

  it('renders a choice answer as the matching option label', () => {
    render(
      <AnswerRenderer
        question={{
          ...BASE_QUESTION,
          type: 'single_select',
          options: [
            { key: 'indoor', label: 'Indoor Booth' },
            { key: 'outdoor', label: 'Outdoor Booth' },
          ],
        }}
        rawValue={{ kind: 'choice', value: 'indoor' }}
      />,
    );
    expect(screen.getByText('Indoor Booth')).toBeInTheDocument();
  });

  it('falls back to the raw key for a choice with no matching option', () => {
    render(
      <AnswerRenderer
        question={{ ...BASE_QUESTION, type: 'single_select', options: [] }}
        rawValue={{ kind: 'choice', value: 'unknown_key' }}
      />,
    );
    expect(screen.getByText('unknown_key')).toBeInTheDocument();
  });

  it('renders choices as multiple pills', () => {
    render(
      <AnswerRenderer
        question={{
          ...BASE_QUESTION,
          type: 'multi_select',
          options: [
            { key: 'food', label: 'Food' },
            { key: 'art', label: 'Art' },
          ],
        }}
        rawValue={{ kind: 'choices', value: ['food', 'art'] }}
      />,
    );
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Art')).toBeInTheDocument();
  });

  it('renders boolean true as "Yes"', () => {
    render(
      <AnswerRenderer
        question={{ ...BASE_QUESTION, type: 'yes_no' }}
        rawValue={{ kind: 'boolean', value: true }}
      />,
    );
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('renders boolean false as "No"', () => {
    render(
      <AnswerRenderer
        question={{ ...BASE_QUESTION, type: 'yes_no' }}
        rawValue={{ kind: 'boolean', value: false }}
      />,
    );
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('renders a file answer as a link with the file name', () => {
    render(
      <AnswerRenderer
        question={{ ...BASE_QUESTION, type: 'file_upload' }}
        rawValue={{
          kind: 'file',
          path: 'uploads/app-123/document.pdf',
          name: 'document.pdf',
          mimeType: 'application/pdf',
          size: 1024,
        }}
      />,
    );
    const link = screen.getByRole('link', { name: 'document.pdf' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'uploads/app-123/document.pdf');
  });

  it('renders — for a null rawValue (parse failure)', () => {
    render(
      <AnswerRenderer
        question={{ ...BASE_QUESTION, type: 'short_text' }}
        rawValue={null}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders — for an unknown kind (SC-007 fallback)', () => {
    render(
      <AnswerRenderer
        question={{ ...BASE_QUESTION, type: 'short_text' }}
        rawValue={{ kind: 'unknown_future_type', value: 'whatever' }}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
