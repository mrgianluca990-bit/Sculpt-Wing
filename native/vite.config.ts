import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    // Match the web runner's bounded DOM workload on shared build machines.
    maxWorkers: 2,
    minWorkers: 1,
  },
});
