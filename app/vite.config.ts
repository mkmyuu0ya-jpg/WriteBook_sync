import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/WriteBook_sync/' : '/',
  plugins: [react()],
  test: { environment: 'node' },
}));
