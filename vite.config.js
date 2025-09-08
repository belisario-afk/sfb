import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/sfb/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});