import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config';

// BL-11 (spec 008 T005, pulled forward): Next.js caps server-action bodies at
// 1 MB by default, so any attachment over that failed with 413 on Vercel even
// though the form allows 10 MB (MAX_FILE_SIZE in src/lib/validations/application.ts).

describe('next.config — server-action body limit (BL-11)', () => {
  it('raises the server-action body limit above the 10 MB form limit', () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe('11mb');
  });
});
