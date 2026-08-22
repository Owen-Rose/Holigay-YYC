import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          exclude: [...configDefaults.exclude, 'src/test/security/**'],
        },
      },
      {
        // Exercises the real local Supabase stack (see src/test/security/harness.ts).
        // Suites self-skip when the stack is down; CI_REQUIRE_SECURITY_TESTS=1 makes
        // a down stack a hard failure instead.
        extends: true,
        test: {
          name: 'security',
          environment: 'node',
          include: ['src/test/security/**/*.test.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
